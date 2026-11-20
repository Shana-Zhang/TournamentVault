# Security Review

Scope: V1/V2 historical contracts and V3 TournamentVaultV3, LearningRewardToken and LRTExchange; Solidity 0.8.26, optimizer 200 runs, Cancun. Test fixtures are excluded from production scope. Review date: 20 November 2026.

## Method and evidence

The local suite runs positive, negative, state, timestamp-boundary, financial and malicious-receiver tests. The coverage report measures the original production contracts; the V3 prize-flow suite adds dedicated ETH and LRT accounting checks. `scripts/analyze.js` recompiles the production sources, records compiler diagnostics, traverses their Solidity ASTs, flags selected risky constructs, checks bytecode size and records source hashes. Its raw output is `static-analysis.json`.

The V2 Slither run reported 13 findings; a fresh full-project V3 run analyzed 20 contracts with 102 detectors and reported 28 findings (five Medium, 18 Low, five Informational), with no High findings. V3 findings and dispositions are in slither-v3-review.md and raw output in slither-v3.json. Neither this review nor the limited AST rule set is an independent audit.

## Findings and decisions

| ID | Severity | Affected area | Impact | Control or decision | Retest evidence |
| --- | --- | --- | --- | --- | --- |
| S01 | High if uncontrolled | Vault withdrawals and Exchange.withdrawETH | Reentrant or repeated claims could drain escrow | Credit and liability set before external calls; nonReentrant guards; checked transfer return. Implemented. | F02, F11, F12, X09, X10, X11, P02–P05 pass |
| S02 | High if uncontrolled | submitResult, resolveDispute, cancellation | Unauthorized settlement or deposit capture | Frozen distinct roles; registered unique winners; explicit state gates. Implemented. | V02, V09, R01–R11, F05–F07 pass |
| S03 | High if uncontrolled | finalizeResult and dispute handling | Funds could settle despite a valid unresolved objection | Disputed state cannot use ordinary finalization; resolver-only settlement before its deadline. Implemented. | R08, R09, R11 pass |
| S04 | Medium | Abandoned referee or resolver | Deposits could stay locked indefinitely | Permissionless result and resolution timeout cancellation; individual pull refunds. Implemented. | V13, F04, F08, R11 pass |
| S05 | Medium residual | LRTExchange.availableReserve and redeem | Supply can exceed backing; redemption may be unavailable | Deduct existing credits from free reserve; reject insufficient reserve. No administrator reserve withdrawal. Liquidity risk is disclosed. | X06, X08 pass |
| S06 | Medium residual | Organizer cancellation and timeout recovery | After a player registers, the organizer cannot cancel early; players wait for the applicable state deadline before permissionless recovery. | Organizer cancellation is limited to Draft or RegistrationOpen with zero entrants. Populated tournaments retain state-specific timeout cancellation and pull refunds. This trades emergency cancellation flexibility for participant protection. | F04, F06, F08, F12 pass |
| S07 | Medium residual | Referee and resolver governance | Colluding controllers may endorse false results | Evidence hash, player objection and separate role addresses; gameplay truth remains off-chain. Accepted trust assumption. | R06, R09, R10 demonstrate mechanism, not honesty |
| S08 | Low | Ranking loops and settlement | Large arrays could exceed block gas | At most 32 ranks, 256 entrants; duplicate loop is bounded; withdrawals do not loop all players. Implemented. | V03, F13 pass; 32-rank submission 1,158,738 gas and settlement 893,356 gas without instrumentation |
| S09 | Low | Timestamps | Boundary ambiguity or proposer timestamp influence | Consistent strict submission versus inclusive expiry boundaries; minimum 60-second review windows. Implemented with operational timing margins. | V06, V11, V12, R03, R05, R07, R11 pass |
| S10 | Low | Prize rounding and fixed-rate arithmetic | Rounding dust or value creation | Math.mulDiv for shares; final rank gets remainder; exchange rejects sub-wei precision instead of silently rounding. Implemented. | F09, X01, X02, X12 pass |
| S11 | Medium assumption | Constructor token selection | Fee-on-transfer or malicious tokens could invalidate balance assumptions | Deployment instantiates the fixed-supply standard LRT and passes its address to both contracts. Other tokens are unsupported. | T01, T03, V05, X07 and deployment script review |
| S12 | Low residual | Donations and immutable reserves | Accidental token transfers or surplus ETH may stay locked | No privileged sweep. Reserve contributions are permanent backing. Documented in interface and README. | Source review; no sweep entry point |

## AST review interpretation

Timestamp review items correspond to the explicit deadline table in `docs/architecture.md`. Both low-level ETH calls target a recipient selected by the credited caller, check success and run after credit and liability reductions under nonReentrant. The loops validate or allocate at most 32 ranked winners. The analyzer scans only project production ASTs; dependency internals are attributed to the pinned OpenZeppelin package, not silently audited by these checks.

## Remaining validation

V1/V2 Sepolia deployment, source verification and V2 Slither analysis are complete. V3 is deployed and source verified; its source analysis and seven dedicated local prize-flow tests are complete. The current tests establish observed behavior for the recorded scenarios and local environment. They do not establish the truth of gameplay evidence, role independence or unlimited exchange liquidity.
