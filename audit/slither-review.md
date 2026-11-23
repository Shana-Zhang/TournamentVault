# Slither Findings Review

Current V2-source rerun on 20 November 2026: `audit/slither-v2.json` reports success=true with the same 13 finding categories. Output is preserved in `audit/slither-v2-output.txt`. The process returned -1 because findings exist; JSON analysis success and detector contents were checked separately. The V2 cancellation restriction was included in this run.

Slither 0.11.6 ran against the V2 project on 20 November 2026 using Python 3.10.9 and Hardhat compilation. It analyzed 19 contracts with 102 detectors. The JSON reports success=true and 13 findings: two Medium, nine Low and two Informational. There are no High findings in this run. These are raw tool severities; the disposition below is the project-specific assessment.

Command:

```powershell
python -m slither . --filter-paths "node_modules|contracts/test" --json audit/slither-run-20261118.json
```

The analyzer returned a nonzero process exit because findings exist. Compilation and analysis succeeded. The complete machine-readable results are preserved in audit/slither.json and the terminal output in audit/slither-output.txt. Dependency and adversarial-fixture findings were filtered from reporting; the production project contracts remain in scope.

| ID | Detector and raw severity | Affected code | Impact and analysis | Disposition and retest evidence |
| --- | --- | --- | --- | --- |
| SL01 | uninitialized-local Medium | TournamentVault._settle allocated | This local uint256 has Solidity's default value zero. It is accumulated before subtraction from the prize; no uninitialized storage reference exists. | Reviewed as a numeric initialization warning with no demonstrated exploit. F01, F09 and F13 assert exact allocation and conservation. |
| SL02 | uninitialized-local Medium | TournamentVault.createTournament sum | A local uint256 begins at zero and sums the validated basis-point shares. Solidity does not expose arbitrary stack contents through this declaration. | Reviewed as a numeric initialization warning with no demonstrated exploit. V01 and V03 validate accepted shares and reject invalid sums. |
| SL03 | timestamp Low | TournamentVault.cancelExpired | Time controls the recovery of abandoned escrow. The comparison is intentional and state-specific. | Accepted timing assumption. F08 and R11 exercise too-early and exact-expiry behavior. |
| SL04 | timestamp Low | TournamentVault.submitResult | Referee submissions must precede the result deadline. | Accepted timing assumption. R03 rejects submission at the deadline. |
| SL05 | timestamp Low | TournamentVault.register | Late entry must be rejected independently of whether a caller has locked the roster. | Accepted timing assumption. V11 tests registration one second before and at the deadline. |
| SL06 | timestamp Low | TournamentVault.raiseDispute | The objection window closes at the recorded timestamp. | Accepted timing assumption. R07 rejects an objection exactly at closing time; R08 prevents settlement while disputed. |
| SL07 | timestamp Low | TournamentVault.createTournament | Future registration and later result deadlines are required at creation. | Accepted timing assumption. V04 tests past and invalid deadline ordering. |
| SL08 | timestamp Low | TournamentVault.resolveDispute | A resolver must act before its deadline; after expiry deposits become recoverable. | Accepted timing assumption. R11 rejects late resolution and permits cancellation. |
| SL09 | timestamp Low | TournamentVault.fundAndOpen | An organizer cannot open a tournament after entry should have closed. | Accepted timing assumption. V06 rejects funding at the registration boundary. |
| SL10 | timestamp Low | TournamentVault.finalizeResult | An unchallenged result becomes final only after the objection window. | Accepted timing assumption. R05 tests early rejection and exact-deadline finalization. |
| SL11 | timestamp Low | TournamentVault.lockRegistration | Roster locking begins at the registration deadline. | Accepted timing assumption. V12 tests early, exact and repeated locking. |
| SL12 | low-level-calls Informational | TournamentVault.withdrawETH | ETH delivery invokes recipient code. Credit and liability are zeroed/reduced first, nonReentrant protects the function, and failure reverts accounting. | Controlled interaction. F02, F11 and F12 test repeat claims, rejected delivery and malicious reentry. |
| SL13 | low-level-calls Informational | LRTExchange.withdrawETH | Redemption ETH delivery invokes recipient code. The same effects-first, checked-return and reentrancy controls apply. | Controlled interaction. X09, X10 and X11 test repeated withdrawal, rejection and malicious reentry. |

No production source was changed to suppress these findings after public deployment. The two numeric locals already have defined zero values; adding an explicit assignment would only make that initialization more visible. Timestamp warnings remain operational limitations: Ethereum block timestamps provide ordering and coarse deadlines, not a trusted real-world stopwatch. Tournament operators should allow practical timing margins and retain off-chain evidence.

The V2 tests exercise the production source deployed and verified on Sepolia. No absence-of-vulnerabilities claim is made. Referee/resolver honesty, timeout waiting periods and finite exchange liquidity remain the substantive governance and financial assumptions described in security-review.md.
