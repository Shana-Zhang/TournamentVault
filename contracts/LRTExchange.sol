// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Immutable quote: one whole LRT (1e18 units) costs 1e9 wei.
/// Returned LRT stays in inventory. ETH backing cannot be withdrawn by an administrator.
contract LRTExchange is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    uint256 public constant TOKEN_UNITS_PER_WEI = 1e9;
    uint256 public totalCredits;
    mapping(address => uint256) public ethCredits;

    event ReserveFunded(address indexed sender, uint256 amount);
    event Purchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event Redeemed(address indexed seller, uint256 tokenAmount, uint256 ethAmount);
    event Withdrawn(address indexed account, address indexed recipient, uint256 amount);

    constructor(address tokenAddress) {
        require(tokenAddress.code.length > 0, "Invalid token");
        token = IERC20(tokenAddress);
    }

    receive() external payable { emit ReserveFunded(msg.sender, msg.value); }

    function availableReserve() public view returns (uint256) {
        return address(this).balance - totalCredits;
    }

    function quote(uint256 tokenAmount) public pure returns (uint256) {
        require(tokenAmount > 0 && tokenAmount % TOKEN_UNITS_PER_WEI == 0, "Invalid precision");
        return tokenAmount / TOKEN_UNITS_PER_WEI;
    }

    function buy() external payable nonReentrant {
        require(msg.value > 0, "Zero payment");
        uint256 amount = msg.value * TOKEN_UNITS_PER_WEI;
        require(token.balanceOf(address(this)) >= amount, "Insufficient inventory");
        token.safeTransfer(msg.sender, amount);
        emit Purchased(msg.sender, msg.value, amount);
    }

    /// @notice Approve tokens first. Redemption reserves ETH for a separate withdrawal.
    function redeem(uint256 tokenAmount) external nonReentrant {
        uint256 amount = quote(tokenAmount);
        require(availableReserve() >= amount, "Insufficient reserve");
        ethCredits[msg.sender] += amount;
        totalCredits += amount;
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        emit Redeemed(msg.sender, tokenAmount, amount);
    }

    function withdrawETH(address payable recipient) external nonReentrant {
        require(recipient != address(0), "Zero recipient");
        uint256 amount = ethCredits[msg.sender];
        require(amount > 0, "No credit");
        ethCredits[msg.sender] = 0;
        totalCredits -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Withdrawn(msg.sender, recipient, amount);
    }
}

