# TournamentVault

An esports tournament escrow with ETH primary prizes, optional LRT bonuses, ETH registration fees, independent result review and fixed-rate LRT redemption. Zhang Shihan, 21317896, CSIT5760.

The repository retains the historical V1/V2 implementations and adds TournamentVault V3, where ETH is escrowed as the primary prize at tournament creation and LRT is an optional bonus. V3 reuses the existing token and exchange and is deployed and source verified at a separate immutable vault address on Sepolia. The UI defaults (editable) are 0.05 ETH and 10,000 LRT; these are demo values, not final event terms. See docs/prize-design-v3.md for rules and deployment status.

## Financial rules

| Item | Rule |
| --- | --- |
| Supply | Minted once at deployment; default 1,000,000 LRT with 18 decimals. No mint or burn function. The initial amount is configurable before deployment. |
| Primary prize | Exact ETH prize is escrowed in the create transaction. Creation reverts unless the sent ETH exactly matches the declared prize. |
| Optional bonus | Organizer may add an LRT bonus, including zero. A nonzero bonus is transferred into escrow when registration opens; it does not rely on exchange redemption. |
| Entry fees | Exact ETH fee, held in escrow until settlement. Finalization credits all entry fees to the organizer. |
| Cancellation | Players recover their exact ETH fee; organizer recovers the escrowed ETH prize and any funded LRT bonus. |
| Fixed rate | 1 whole LRT = 0.000000001 ETH = 1,000,000,000 wei. |
| Redemption | Player approves LRT, redeems into an ETH credit, then withdraws ETH. Returned tokens remain in exchange inventory. |
| Reserve | Anyone may add ETH backing. No administrator can withdraw backing. Redemption requires available reserve. |
| Precision | Redemption amounts must be multiples of 0.000000001 LRT, avoiding fractional-wei rounding loss. |

## Install and validate

Use Node.js 22 or 24 and npm. All dependency versions and the Solidity compiler are pinned in the lockfile.

On this Windows machine, `powershell -ExecutionPolicy Bypass -File E:\BC_Project\run.ps1 check` locates the existing Node installation and runs compilation, tests and the local analyzer. Replace `check` with `demo`, `coverage`, `serve` or another task listed in the script.

```powershell
npm ci
npm run compile
npm test
npm run coverage
npm run demo
npm run analyze
npm run config:check
```

Actual local versions: Solidity 0.8.26, Hardhat 2.29.2, OpenZeppelin Contracts 5.6.1, ethers 6.17.0. Compiler settings: optimizer enabled, 200 runs, Cancun EVM. The installed toolchain replaces the preliminary versions named in the proposal; deployment and verification must use the actual settings above.

`hardhat.config.js` resolves the pinned local solc package so compilation does not need a separate compiler download. `npm ci` still needs access to the package registry on a new machine.

## Run the wallet interface

Use three terminals. The development node prints disposable accounts; never use these on a public network.

```powershell
# Terminal 1
npm run node
# Terminal 2
npm run deploy:local:v3
# Terminal 3
npm run serve
```

Open http://127.0.0.1:8080. Configure a wallet for the local RPC http://127.0.0.1:8545, chain ID 31337, and import only a disposable development account. Connect the wallet. The deploying account holds the LRT supply. Use different accounts for organizer, referee, resolver and players. The scripts also provide a complete demonstration without a browser wallet.

The interface lists the 50 most recent tournaments, opens an event by ID, and displays its entrant roster, current ranking and evidence hash. It supports ETH prize creation, optional LRT bonus funding, registration, roster lock, result submission, objections, resolver decisions, finalization, withdrawals, cancellation, timeout recovery, buying LRT, redemption and reserve funding. The editable demonstration defaults are 0.05 ETH and 10,000 LRT; final event amounts remain configurable. Wallet interaction needs a reachable local node or a Sepolia deployment. Run `deploy:local:v3` against a persistent node to use the V3 interface locally.

## Sepolia deployment

Copy `.env.example` to `.env` and provide a dedicated testnet RPC and deployment wallet. Keep credentials local; `.env` is excluded from version control and the submission archive. Use Sepolia test ETH only.

```powershell
npm run preflight
npm run compile
npm test
npm run deploy:sepolia:v3
npm run verify:sepolia:v3
npm run check:sepolia:v3
```

V1 and V2 deployment records remain unchanged. V3 has its own deployment script and `deployment/sepolia-v3.json` record; the CLI upgrade script reuses token/exchange contracts. The final recorded deployment instead uses the browser wallet flow in /deploy.html to deploy all three contracts afresh. Never rerun a completed deployment script.

V2 remains recorded in `deployment/sepolia-v2.json`; V1 remains in `deployment/sepolia.json`. V3 records the final newly deployed token, vault and exchange in `deployment/sepolia-v3.json`. Verification updates the selected version record only after explorer confirmation. The exchange remains separate from tournament prizes; its redemption requires sufficient ETH reserves.

On Windows, use the `deploy:sepolia:v3`, `verify:sepolia:v3` and `check:sepolia:v3` scripts for V3. Deployment transactions are recorded, and a saved V3 submission blocks duplicate deployment. Existing V1 and V2 addresses are never overwritten.

An Etherscan API key is needed for verification. Failed or missing connectivity is recorded in `deployment/preflight.json`; it is not deployment evidence.

## Roles and lifecycle

Organizer escrows ETH when creating immutable rules, then funds the optional LRT bonus before opening registration. The organizer may cancel only while no player has registered; cancellation returns the ETH prize and any funded LRT bonus. After the first registration, only state-specific permissionless timeout cancellation is available; players can claim their fee refunds. Referee submits registered ranked winners and an evidence hash. A registered player may raise one tournament-level objection during the window. Resolver confirms or replaces the ranking. Organizer, referee and resolver must be distinct addresses and cannot register as competitors in that tournament.

`Draft → RegistrationOpen → Locked → ResultPending → Finalized`

An objection routes `ResultPending → Disputed → Finalized`. Organizer cancellation is limited to Draft or RegistrationOpen states before the first entrant joins. Missing players, abandoned results and unresolved disputes have permissionless timeout cancellation paths. See `docs/architecture.md` for exact timing and transitions.

## Evidence and security

The test suite documents preconditions, inputs, expected and actual outcomes in `evidence/test-cases.json` and `evidence/test-cases.md`. The current run passes 64 scenarios. `npm run analyze` records compiler diagnostics, bytecode sizes, source hashes and a limited AST review. Slither review covers V2 (13 findings) and the full V3 codebase (28 combined findings, no High); see `audit/slither-v3-review.md` and `audit/security-review.md` for dispositions and residual risks.

The contracts use OpenZeppelin ERC20, SafeERC20, Math and ReentrancyGuard. Payouts use credits and withdrawals; no settlement call loops through all participants or sends ETH to every winner. Only the deployed fixed-supply token is supported. Organizer cancellation rights and trusted referee/resolver decisions are explicit governance assumptions. A fixed quote does not guarantee unlimited redemption when reserve backing is insufficient.

## Submission

```powershell
npm run package
```

The resulting `submission/21317896_ZhangShihan_CSIT5760_FinalProject.zip` excludes dependencies, local secrets, caches, superseded working reports and repository metadata. V1/V2 deployment, source verification and historical Sepolia workflow evidence are complete. V3 has seven dedicated passing local prize-flow tests, is deployed and source verified, and records a fresh deployment of all three contracts. The full suite has 64 passing scenarios. The final V3 demonstration used newly deployed token, vault and exchange contracts on 23 November 2026. Tournament #1 escrowed 0.001 ETH and 1 LRT bonus, with three 0.001 ETH entry fees. The referee submitted accounts 4, 5, 6; account 6 raised an objection; the resolver corrected the ranking to accounts 5, 4, 6. The 50/30/20 shares paid 0.0005/0.0003/0.0002 ETH and 0.5/0.3/0.2 LRT. All three prizes and 0.003 ETH organizer fees were withdrawn. A separate exchange demonstration bought 500 LRT for 0.0000005 ETH, approved and redeemed the tokens, and withdrew the ETH credit. The recorded 20 lifecycle and exchange receipts succeeded. Final player prize credits and account 5 exchange credit are zero. These small test amounts are the demonstrated terms; editable UI defaults are not event commitments. The final Word/PDF report is included with the submission files.

The wallet interface lists connected public addresses so roles can be selected explicitly. Changing a tournament number clears the previously loaded data; load the selected tournament before using its actions. To reproduce only the final public read-only snapshot without loading credentials, run `node scripts/check-tournament-demo.js --public-rpc`. Existing contracts do not require redeployment.

## References

- OpenZeppelin Contracts: https://docs.openzeppelin.com/contracts/5.x/
- Hardhat 2 configuration: https://v2.hardhat.org/hardhat-runner/docs/config
- Solidity security considerations: https://docs.soliditylang.org/en/latest/security-considerations.html
- ethers documentation: https://docs.ethers.org/v6/


Final review: docs/final-design-review.md. Public receipts and final balances: evidence/sepolia-v3-final-snapshot.json. Start with npm ci, npm run compile, npm test, npm run config:check, then npm run serve; open http://127.0.0.1:8080/ with MetaMask on Sepolia. Use the recorded contracts for read-only review.


