# TournamentVault

A Smart Contract Based Prize Pool for Esports Tournaments.

Three Solidity contracts provide fixed-supply Learning Reward Tokens (LRT), tournament prize escrow and a fixed-rate token exchange. The project includes automated tests, a complete local transaction demonstration, a browser-wallet interface and evidence from the existing verified Sepolia deployment.

## Reproduce from a fresh checkout

Use **Node.js 24.15.0** and npm. The tested npm version is **11.12.1**. All direct dependency versions and the Solidity compiler are pinned; `package-lock.json` pins the dependency tree. Local validation does not need a wallet, `.env`, API key or test ETH.

```sh
git clone https://github.com/Shana-Zhang/TournamentVault.git
cd TournamentVault
npm ci
npm run check
npm run demo
```

Expected results:

- Compilation succeeds with Solidity 0.8.26, optimizer 200 runs and Cancun EVM.
- **57 tests pass**, covering roles, deadlines, rounding, refunds, repeated claims, reentrancy, liquidity limits and static-server access.
- The local demo verifies dispute resolution, prize payments, organizer fees, token redemption and cancellation refunds. Final vault ETH/LRT liabilities and exchange credits are zero.
- `npm run analyze` records compiler diagnostics, bytecode sizes, source hashes and a limited AST review in `audit/`.

`npm ci` needs the npm registry on the first installation. Compilation uses the installed, pinned `solc` package and does not download another Solidity compiler. The local demo uses only an ephemeral Hardhat chain; it does not send Sepolia transactions.

## Browser interface using the existing Sepolia contracts

```sh
npm run ui:sepolia
npm run serve
```

Open <http://127.0.0.1:8080>, connect a browser wallet on Sepolia (chain ID `11155111`) and load tournament **3** to inspect the completed demonstration. `ui:sepolia` only rebuilds public interface configuration from the saved deployment and compiled ABIs; it does not deploy or send a transaction. Normal wallet actions require the connected account's approval.

| Contract | Existing verified address |
| --- | --- |
| LearningRewardToken | [0xF258884763CEc4239F33A9bBf9f2c603Bb1b2D69](https://sepolia.etherscan.io/address/0xF258884763CEc4239F33A9bBf9f2c603Bb1b2D69#code) |
| TournamentVault | [0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc](https://sepolia.etherscan.io/address/0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc#code) |
| LRTExchange | [0x207EaebD77e7bd41c1043f9DB10397c5F18A0D22](https://sepolia.etherscan.io/address/0x207EaebD77e7bd41c1043f9DB10397c5F18A0D22#code) |

To collect a new public read-only snapshot without credentials:

```sh
npm run read:sepolia
```

This reads events, receipts and balances through an anonymous public RPC. Network availability is separate from local reproducibility. It never creates a signer or sends a transaction.

## Browser interface on a disposable local chain

Use three terminals after `npm ci`:

```sh
# Terminal 1
npm run node
# Terminal 2
npm run deploy:local
# Terminal 3
npm run serve
```

Open <http://127.0.0.1:8080> and configure the wallet for `http://127.0.0.1:8545`, chain ID `31337`. Use only disposable development accounts for this chain. The local deployment updates the interface configuration. Run `npm run ui:sepolia` to restore the existing Sepolia configuration afterward.

## Contract rules and evidence

- LRT supply is minted once; there are no later mint or burn entry points.
- The organizer fixes tournament rules and deposits the full LRT prize before registration opens.
- Referee, resolver and organizer addresses differ and cannot register as players in that tournament.
- Players pay the exact ETH fee and may object within the declared window. The resolver can confirm or replace a disputed ranking.
- Winners and the organizer withdraw credited balances. Eligible cancellation refunds are claimed separately.
- One LRT quotes **0.000000001 ETH**. Returned tokens remain exchange inventory; redemption depends on available ETH backing.

The recorded public demonstration finalized tournament 3 after a scripted player objection and corrected resolver decision. Accounts 4/5/6 received 300/500/200 LRT. Organizer fees and exchange redemption credits were withdrawn. Two unfunded drafts were cancelled. `evidence/sepolia-tournament-demo.json` records the final receipts and state; `evidence/sepolia-demo-scenario.json` retains the explicitly scripted evidence text. No real esports match result is asserted. Funded cancellation/refund behavior is covered by local tests and the local demo.

Architecture and deadline semantics: [docs/architecture.md](docs/architecture.md). Deployment details: [docs/deployment-information.md](docs/deployment-information.md). Security scope and residual risks: [audit/security-review.md](audit/security-review.md) and [audit/slither-review.md](audit/slither-review.md). Slither reported 13 reviewed findings and no High findings; this is not proof that all vulnerabilities are absent.

## Optional testnet administration

Existing deployments do not need to be repeated. Only if intentionally deploying a separate testnet instance, copy `.env.example` to a local `.env`, configure dedicated testnet credentials and use the deployment/verification scripts. Never commit `.env`, private keys, seed phrases or API keys. No secrets are needed by CI.

## Continuous verification

GitHub Actions installs from the lockfile on Node.js 24.15.0, compiles, runs the 57 tests, performs the complete ephemeral-chain demo and runs the local analyzer. It does not call the public deployment scripts or send testnet transactions.
