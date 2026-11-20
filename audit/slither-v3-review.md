# V3 Slither review

Slither 0.11.6 analyzed the full Hardhat project after adding `TournamentVaultV3`, using the Hardhat compilation framework and filtering dependencies and test fixtures. The run completed successfully across 20 contracts and 102 detectors. The combined project output contains 28 findings: five Medium, 18 Low and five Informational, with no High finding. Raw output is preserved in `slither-v3.json`.

V3-specific findings are limited to the following expected patterns:

| Finding | Interpretation | Disposition and evidence |
| --- | --- | --- |
| Three `uninitialized-local` warnings (Medium) | Local counters in `createTournament` and `_settle` rely on Solidity's defined zero initialization. | No arbitrary stack or storage data is read; payout and conservation assertions pass in P01/P02 and the 32-rank V2 test. |
| Timestamp warnings (Low) | Deadline gates use block timestamps. | Intentional state-machine rules; V04, V06, V11, V12, R03, R05, R07 and R11 exercise boundaries. Practical timing margins remain necessary. |
| Three `low-level-calls` warnings (Informational) | V3 refund and withdrawals send ETH to a caller-selected recipient. | Credits and both asset liabilities are updated before external calls; functions use `nonReentrant`, check transfer success, and revert atomically on failure. |

The first V3 scan surfaced a benign reentrancy warning because the token liability was reduced after the ETH receiver call. The code was changed so all credits and liabilities are updated before either asset transfer. A fresh Slither run no longer reports a reentrancy finding. The V3 unit tests were rerun after the change: all 64 project scenarios pass.

This is a static-analysis result and a limited project review, not an independent audit or a guarantee of safety. V3 is deployed and source verified on Sepolia; no V3 tournament has been created yet.
