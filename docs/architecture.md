# System Design

## Contracts and trust

```mermaid
flowchart TD
  Treasury["Organizer treasury"] -->|"ETH primary prize at creation; optional LRT bonus at opening"| Vault["TournamentVault V3"]
  Player["Player wallet"] -->|"ETH entry fee"| Vault
  Vault -->|"ETH prize and optional LRT bonus, or cancellation return"| Treasury
  Vault -->|"ETH prize + LRT bonus; ETH fee refund"| Player
  Vault -->|"ETH fees after finalization"| Treasury
  Player -->|"LRT redemption"| Exchange["LRTExchange"]
  Exchange -->|"ETH withdrawal credit"| Player
  Treasury -->|"ETH backing and LRT inventory"| Exchange
```

LearningRewardToken mints its entire supply once to the treasury. TournamentVaultV3 and LRTExchange reference that immutable deployed token. Neither contract mints or burns tokens. Exchange inventory may be funded with an ordinary token transfer. Buying tokens consumes that inventory and adds ETH reserve. Redemption returns tokens to inventory and reserves ETH for the seller.

## State machine

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> RegistrationOpen: ETH prize already escrowed; organizer deposits optional LRT bonus
  RegistrationOpen --> Locked: Deadline and enough players
  Locked --> ResultPending: Referee submits ranking
  ResultPending --> Disputed: Registered player objects
  ResultPending --> Finalized: Window ends without objection
  Disputed --> Finalized: Resolver confirms or replaces
  Draft --> Cancelled: Organizer or draft timeout
  RegistrationOpen --> Cancelled: Organizer if no entrants; insufficient roster; or result timeout
  Locked --> Cancelled: Result timeout
  ResultPending --> Cancelled: No direct cancellation; result finalizes after objection window
  Disputed --> Cancelled: Resolution timeout
  Finalized --> [*]
  Cancelled --> [*]
```

No registration or rule change is possible after the deadline. The only result replacement path belongs to the resolver in Disputed. Finalization is permissionless after the objection window; a pending result does not become cancellable merely because the referee's submission deadline later passes. The state selects the relevant deadline.

The organizer may cancel a Draft or RegistrationOpen tournament only while `playerCount` is zero. Once the first entrant registers, cancellation is reserved for the permissionless state-specific timeout paths. This prevents an organizer from cancelling after seeing a result or after participants have committed entry fees.

## Boundary rules

| Action | Allowed time |
| --- | --- |
| Fund and register | Strictly before registrationDeadline |
| Lock roster | At or after registrationDeadline |
| Referee submit | Strictly before resultDeadline |
| Raise objection | Strictly before disputeDeadline |
| Finalize unchallenged result | At or after disputeDeadline |
| Resolve objection | Strictly before resolutionDeadline |
| Recover abandoned draft | At or after registrationDeadline |
| Recover missing result | At or after resultDeadline, while Open or Locked |
| Recover unresolved objection | At or after resolutionDeadline |

Both review windows range from 60 seconds to seven days. Deadlines are block timestamps; production tournaments should allow practical margins rather than rely on second-level timing.

## Accounting

V3 escrows the exact ETH primary prize during `createTournament`; a mismatched `msg.value` reverts. The optional LRT bonus is deposited at `fundAndOpen`. The vault tracks `ethLiability` for both prize escrow and entry fees, and `tokenLiability` for deposited LRT bonuses. Settlement moves ETH prize and LRT bonus entitlements into per-player credits without reducing liabilities. Prize withdrawal pays both assets; organizer cancellation returns the ETH prize and any funded bonus. Entry-fee refunds and organizer fee withdrawals remain separately accounted. Cancellation credits players lazily through individual claims; no participant-wide loop is required.

`tokenLiability` rises when the optional LRT bonus is deposited. Settlement creates winner credits without changing that liability. Prize withdrawal or organizer cancellation return reduces liability before the token transfer. Reverting transfers revert all accounting changes.

The invariants are vault ETH balance >= ethLiability, vault token balance >= tokenLiability, and exchange ETH balance >= totalCredits. Equality is expected in controlled examples, but direct token donations or forced ETH may create surplus. No administrator sweep function exists.

Payout shares sum to 10000 basis points. Every rank except the last receives floor(prize × share / 10000); the last receives the exact remainder. Ranks are bounded at 32 and participants at 256. Winner validation uses at most 496 duplicate comparisons; settlement loops at most 32 times, without ETH receiver calls.

## Interface groups

| Contract | Public operations |
| --- | --- |
| Token | Standard ERC20 transfer, approval and balance queries |
| Vault setup | createTournament (escrows ETH prize), getTournament, fundAndOpen (escrows optional LRT bonus) |
| Participation | register, lockRegistration |
| Results | submitResult, raiseDispute, resolveDispute, finalizeResult |
| Recovery | cancelTournament, cancelExpired, claimRefund, refundOrganizer |
| Withdrawal | withdrawPrize, withdrawETH |
| Exchange | quote, availableReserve, buy, redeem, withdrawETH, receive ETH backing |

Match footage, evidence files, brackets and identities remain off-chain. Only hashes and wallet addresses are published. Distinct role addresses do not prove independent human control.
