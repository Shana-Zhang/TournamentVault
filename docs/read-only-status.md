# Read-only inspection — 18 November 2026

## Later V3 update — 20 November 2026

V3 was subsequently deployed and source verified at `0x86b64B582dB3F6DD9bf43A923300B2d150D72D17`; see `deployment/sepolia-v3.json` and `deployment/sepolia-v3-read-only-check.json`. The read-only snapshot confirms its deployment receipt and local runtime/source matches, with zero tournaments and zero ETH/token liabilities. The earlier statements below record a prior read-only session.

No deployment, source-verification submission, funding, token transfer or other Sepolia transaction was performed. No credentials were printed. Network inspection used RPC reads and Etherscan V2 getsourcecode GET requests.

## Current checks

- `run.ps1 check`: successful compilation check, 57 passing tests, zero compiler errors; limited AST analyzer reports 19 Review items and no High items. Runtime sizes: token 1,764 bytes; vault 11,804 bytes; exchange 2,513 bytes. Coverage was not rerun.
- `run.ps1 preflight`: Sepolia chain ID 11155111; deployment wallet balance 2.202608078996931 ETH. Configuration values were not disclosed.
- Snapshot block: 12160825. See `deployment/read-only-check.json` for timestamp and detailed results. Reproduce with `node scripts/read-only-check.js`.
- All three deployment receipts succeeded and point to the recorded addresses. Creation hashes match saved records; full deployment transaction inputs match local creation bytecode plus encoded constructor arguments. Runtime bytecode matches after masking compiler-declared immutable slots; both token getters separately match the deployed LRT address.
- Etherscan live queries confirm all three sources are verified with v0.8.26+commit.8a97fa7a, optimizer enabled, 200 runs. All returned submitted source files match local build inputs and constructor arguments match deployment transactions.

| Contract | Address | State at snapshot |
| --- | --- | --- |
| LearningRewardToken | 0xF258884763CEc4239F33A9bBf9f2c603Bb1b2D69 | 1,000,000 LRT total supply; all held by deployer; vault/exchange balances zero |
| TournamentVault | 0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc | tournamentCount 0; ETH and token liabilities 0; ETH balance 0 |
| LRTExchange | 0x207EaebD77e7bd41c1043f9DB10397c5F18A0D22 | inventory 0 LRT; availableReserve 0 wei; totalCredits 0; quote constant 1e9 token units per wei |

## Remaining issues

1. Public demo activity and wallet evidence remain incomplete. No tournaments exist at the inspected block. Exchange buys require LRT inventory and redemptions require ETH reserve; both are currently zero. Funding and wallet transactions require a separate authorized task.
2. Slither follow-up completed: the current-source rerun in `audit/slither-current.json` reports success=true and the same 13 finding IDs as the earlier run: 2 Medium uninitialized-local, 9 Low timestamp, 2 Informational low-level-calls. See `audit/slither-review.md` for all dispositions and test mappings. The two local uint256 variables (`sum` and `allocated`) have defined default zero values; no exploit is demonstrated by those warnings.
3. Documentation follow-up completed: README, completion-status and project-report now reflect the completed Slither review. The old connectivity.json remains a historical failure snapshot; completion-status points to the later successful read-only RPC and Etherscan evidence.
4. The V3 read-only deployment check is recorded at deployment/sepolia-v3-read-only-check.json. Formal Word/PDF report and archive have been regenerated from V3 data and are undergoing final visual and integrity checks.
5. Existing design risks remain: organizer cancellation before finalization, trusted referee/resolver decisions, and redemption liquidity limits. Passing tests and verified source do not remove those assumptions.
