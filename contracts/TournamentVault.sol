// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice LRT prize escrow; ETH registration fees belong to the organizer only after settlement.
contract TournamentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State { Draft, RegistrationOpen, Locked, ResultPending, Disputed, Finalized, Cancelled }
    struct Rules {
        uint256 entryFee;
        uint256 prize;
        uint32 maxPlayers;
        uint64 registrationDeadline;
        uint64 resultDeadline;
        uint64 disputeWindow;
        uint64 resolutionWindow;
    }
    struct Tournament {
        address organizer;
        address referee;
        address resolver;
        State state;
        Rules rules;
        uint32 playerCount;
        uint64 disputeDeadline;
        uint64 resolutionDeadline;
        uint256 fees;
        bool funded;
        bytes32 evidenceHash;
        address[] winners;
        uint16[] shares;
    }
    IERC20 public immutable token;
    uint256 public tournamentCount;
    uint256 public ethLiability;
    uint256 public tokenLiability;
    mapping(uint256 => Tournament) private tournaments;
    mapping(uint256 => mapping(address => bool)) public registered;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => mapping(address => uint256)) public prizeCredits;
    mapping(address => uint256) public ethCredits;
    mapping(uint256 => bool) public organizerRefundClaimed;

    event TournamentCreated(uint256 indexed id, address indexed organizer, address referee, address resolver);
    event RegistrationOpened(uint256 indexed id, uint256 prize);
    event PlayerRegistered(uint256 indexed id, address indexed player, uint256 fee);
    event RegistrationLocked(uint256 indexed id, uint256 players);
    event ResultSubmitted(uint256 indexed id, address[] winners, bytes32 evidenceHash, uint64 disputeDeadline);
    event DisputeRaised(uint256 indexed id, address indexed player, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed id, bytes32 evidenceHash);
    event Finalized(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event PrizeWithdrawn(uint256 indexed id, address indexed player, address recipient, uint256 amount);
    event RefundCredited(uint256 indexed id, address indexed player, uint256 amount);
    event OrganizerRefunded(uint256 indexed id, uint256 amount);
    event ETHWithdrawn(address indexed account, address recipient, uint256 amount);

    constructor(address tokenAddress) {
        require(tokenAddress.code.length > 0, "Invalid token");
        token = IERC20(tokenAddress);
    }

    function getTournament(uint256 id) external view returns (Tournament memory) { return _get(id); }

    /// @notice Rules are immutable after creation. Shares are basis points, in ranked order.
    function createTournament(Rules calldata rules, address referee, address resolver, uint16[] calldata shares)
        external returns (uint256 id)
    {
        require(referee != address(0) && resolver != address(0), "Zero role");
        require(referee != resolver && referee != msg.sender && resolver != msg.sender, "Roles must differ");
        require(rules.prize > 0 && shares.length > 0 && shares.length <= 32, "Invalid prize");
        require(rules.maxPlayers >= shares.length && rules.maxPlayers <= 256, "Invalid capacity");
        require(rules.registrationDeadline > block.timestamp && rules.resultDeadline > rules.registrationDeadline, "Invalid deadlines");
        require(rules.disputeWindow >= 60 && rules.disputeWindow <= 7 days && rules.resolutionWindow >= 60 && rules.resolutionWindow <= 7 days, "Invalid windows");
        uint256 sum;
        for (uint256 i; i < shares.length; ++i) {
            require(shares[i] > 0, "Zero share");
            sum += shares[i];
        }
        require(sum == 10000, "Invalid shares");
        id = ++tournamentCount;
        Tournament storage t = tournaments[id];
        t.organizer = msg.sender;
        t.referee = referee;
        t.resolver = resolver;
        t.rules = rules;
        t.shares = shares;
        emit TournamentCreated(id, msg.sender, referee, resolver);
    }

    /// @notice Organizer approves the exact advertised LRT prize before opening registration.
    function fundAndOpen(uint256 id) external nonReentrant {
        Tournament storage t = _get(id);
        require(msg.sender == t.organizer, "Only organizer");
        require(t.state == State.Draft, "Wrong state");
        require(block.timestamp < t.rules.registrationDeadline, "Registration closed");
        t.funded = true;
        t.state = State.RegistrationOpen;
        tokenLiability += t.rules.prize;
        token.safeTransferFrom(msg.sender, address(this), t.rules.prize);
        emit RegistrationOpened(id, t.rules.prize);
    }

    function register(uint256 id) external payable {
        Tournament storage t = _get(id);
        require(t.state == State.RegistrationOpen, "Wrong state");
        require(block.timestamp < t.rules.registrationDeadline, "Registration closed");
        require(msg.sender != t.organizer && msg.sender != t.referee && msg.sender != t.resolver, "Role cannot play");
        require(!registered[id][msg.sender], "Already registered");
        require(t.playerCount < t.rules.maxPlayers, "Full");
        require(msg.value == t.rules.entryFee, "Wrong fee");
        registered[id][msg.sender] = true;
        ++t.playerCount;
        t.fees += msg.value;
        ethLiability += msg.value;
        emit PlayerRegistered(id, msg.sender, msg.value);
    }

    function lockRegistration(uint256 id) external {
        Tournament storage t = _get(id);
        require(t.state == State.RegistrationOpen, "Wrong state");
        require(block.timestamp >= t.rules.registrationDeadline, "Too early");
        if (t.playerCount < t.shares.length) { _cancel(id, t); return; }
        t.state = State.Locked;
        emit RegistrationLocked(id, t.playerCount);
    }

    function submitResult(uint256 id, address[] calldata winners, bytes32 evidenceHash) external {
        Tournament storage t = _get(id);
        require(msg.sender == t.referee, "Only referee");
        require(t.state == State.Locked, "Wrong state");
        require(block.timestamp < t.rules.resultDeadline, "Result expired");
        _setResult(id, t, winners, evidenceHash);
        t.state = State.ResultPending;
        t.disputeDeadline = uint64(block.timestamp) + t.rules.disputeWindow;
        emit ResultSubmitted(id, winners, evidenceHash, t.disputeDeadline);
    }

    function raiseDispute(uint256 id, bytes32 reasonHash) external {
        Tournament storage t = _get(id);
        require(t.state == State.ResultPending, "Wrong state");
        require(registered[id][msg.sender], "Not registered");
        require(block.timestamp < t.disputeDeadline, "Dispute closed");
        require(reasonHash != bytes32(0), "Empty evidence");
        t.state = State.Disputed;
        t.resolutionDeadline = uint64(block.timestamp) + t.rules.resolutionWindow;
        emit DisputeRaised(id, msg.sender, reasonHash);
    }

    /// @notice Resolver confirms by resubmitting the original ranking, or supplies a replacement.
    function resolveDispute(uint256 id, address[] calldata winners, bytes32 evidenceHash) external {
        Tournament storage t = _get(id);
        require(msg.sender == t.resolver, "Only resolver");
        require(t.state == State.Disputed, "Wrong state");
        require(block.timestamp < t.resolutionDeadline, "Resolution expired");
        _setResult(id, t, winners, evidenceHash);
        emit DisputeResolved(id, evidenceHash);
        _settle(id, t);
    }

    function finalizeResult(uint256 id) external {
        Tournament storage t = _get(id);
        require(t.state == State.ResultPending, "Wrong state");
        require(block.timestamp >= t.disputeDeadline, "Too early");
        _settle(id, t);
    }

    /// @notice Organizer may cancel before settlement, as specified by the tournament rules.
    function cancelTournament(uint256 id) external {
        Tournament storage t = _get(id);
        require(msg.sender == t.organizer, "Only organizer");
        require(t.state != State.Finalized && t.state != State.Cancelled, "Terminal state");
        require(t.playerCount == 0, "Players already registered");
        require(t.state == State.Draft || t.state == State.RegistrationOpen, "Wrong state");
        _cancel(id, t);
    }

    /// @notice Anyone can recover an abandoned draft, result, or dispute after its deadline.
    function cancelExpired(uint256 id) external {
        Tournament storage t = _get(id);
        bool expired = (t.state == State.Draft && block.timestamp >= t.rules.registrationDeadline)
            || ((t.state == State.Locked || t.state == State.RegistrationOpen) && block.timestamp >= t.rules.resultDeadline)
            || (t.state == State.Disputed && block.timestamp >= t.resolutionDeadline);
        require(expired, "Not expired");
        _cancel(id, t);
    }

    function claimRefund(uint256 id) external {
        Tournament storage t = _get(id);
        require(t.state == State.Cancelled, "Wrong state");
        require(registered[id][msg.sender] && !refundClaimed[id][msg.sender], "No refund");
        refundClaimed[id][msg.sender] = true;
        ethCredits[msg.sender] += t.rules.entryFee;
        emit RefundCredited(id, msg.sender, t.rules.entryFee);
    }

    function refundOrganizer(uint256 id, address recipient) external nonReentrant {
        Tournament storage t = _get(id);
        require(msg.sender == t.organizer, "Only organizer");
        require(t.state == State.Cancelled && t.funded && !organizerRefundClaimed[id], "No refund");
        require(recipient != address(0), "Zero recipient");
        organizerRefundClaimed[id] = true;
        tokenLiability -= t.rules.prize;
        token.safeTransfer(recipient, t.rules.prize);
        emit OrganizerRefunded(id, t.rules.prize);
    }

    function withdrawPrize(uint256 id, address recipient) external nonReentrant {
        require(recipient != address(0), "Zero recipient");
        uint256 amount = prizeCredits[id][msg.sender];
        require(amount > 0, "No credit");
        prizeCredits[id][msg.sender] = 0;
        tokenLiability -= amount;
        token.safeTransfer(recipient, amount);
        emit PrizeWithdrawn(id, msg.sender, recipient, amount);
    }

    function withdrawETH(address payable recipient) external nonReentrant {
        require(recipient != address(0), "Zero recipient");
        uint256 amount = ethCredits[msg.sender];
        require(amount > 0, "No credit");
        ethCredits[msg.sender] = 0;
        ethLiability -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit ETHWithdrawn(msg.sender, recipient, amount);
    }

    function _get(uint256 id) private view returns (Tournament storage t) {
        require(id > 0 && id <= tournamentCount, "Unknown tournament");
        return tournaments[id];
    }

    function _setResult(uint256 id, Tournament storage t, address[] calldata winners, bytes32 evidenceHash) private {
        require(evidenceHash != bytes32(0), "Empty evidence");
        require(winners.length == t.shares.length, "Wrong winner count");
        for (uint256 i; i < winners.length; ++i) {
            require(registered[id][winners[i]], "Winner not registered");
            for (uint256 j; j < i; ++j) require(winners[j] != winners[i], "Duplicate winner");
        }
        t.winners = winners;
        t.evidenceHash = evidenceHash;
    }

    function _settle(uint256 id, Tournament storage t) private {
        t.state = State.Finalized;
        uint256 allocated;
        for (uint256 i; i < t.winners.length; ++i) {
            uint256 amount = i + 1 == t.winners.length ? t.rules.prize - allocated : Math.mulDiv(t.rules.prize, t.shares[i], 10000);
            prizeCredits[id][t.winners[i]] = amount;
            allocated += amount;
        }
        ethCredits[t.organizer] += t.fees;
        emit Finalized(id);
    }

    function _cancel(uint256 id, Tournament storage t) private {
        t.state = State.Cancelled;
        emit Cancelled(id);
    }
}

