# Final design review 23 November 2026

The current V3 implements ETH prize escrow at creation, an optional separately funded LRT bonus, exact entry fees, role-separated results and arbitration, and individual withdrawals. Manual review found no obvious blocker to this coursework submission; this is a scoped review rather than a production audit.

## Implemented controls

- Creation requires msg.value to equal the immutable ETH prize. LRT funding precedes registration.
- Organizer, referee and resolver must be distinct and cannot enter their own tournament. Accounts can serve different roles in other tournaments.
- Once a participant registers, organizer cancellation reverts. Permissionless deadline recovery preserves individual refunds.
- Only the referee submits results; only the resolver resolves a disputed ranking. Winners must be distinct registered players. Evidence hashes commit to off-chain records.
- Settlement creates individual credits. Withdrawals clear credits before external calls, use ReentrancyGuard, and revert atomically on failed delivery; this prevents a second payment of the same credit.
- ETH prizes, entry-fee credits and LRT obligations are separately accounted. Exchange redemption reserves ETH before the later withdrawal.

## Operating assumptions

Referee and resolver remain trusted decision makers; different addresses do not prove independent people. Hashes prove commitment, not the truth or availability of match evidence. Users must allow time to submit and mine deadline-sensitive transactions. A dispute timeout cancels the event and enables refunds. An objection is tournament-wide rather than a vote. The fixed-rate exchange requires sufficient available ETH and exact supported precision. Immutable contracts have no emergency upgrade or administrator reserve sweep.

## Submission evidence

The existing automated suite records 64 passing scenarios, including seven dedicated V3 cases. Historical vault permission and duplicate-claim scenarios are documented in the suite; V3 controls were also read directly in source. The V3 public demonstration contains 20 successful lifecycle and exchange receipts at the recorded snapshot. Tournament #1 is Finalized with all three prize credits zero. Account 5 received 0.0005 ETH and 0.5 LRT, account 4 received 0.0003 ETH and 0.3 LRT, and account 6 received 0.0002 ETH and 0.2 LRT. Organizer fees of 0.003 ETH were withdrawn. The exchange round trip bought and redeemed 500 LRT and withdrew 0.0000005 ETH. Snapshot: evidence/sepolia-v3-final-snapshot.json.

Tournament #2 is a separate small open event with one entrant at the snapshot. Its 0.000001 ETH prize and 0.000001 ETH entry fee account for the remaining 0.000002 ETH vault liability. This does not represent unpaid tournament #1 winnings.
