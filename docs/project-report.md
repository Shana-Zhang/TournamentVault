# TournamentVault Project Report

| Field | Information |
| --- | --- |
| Project | TournamentVault A Smart Contract Based Prize Pool for Esports Tournaments |
| Student | Zhang Shihan |
| Student ID | 21317896 |
| Course | CSIT5760 Blockchain and Smart Contracts |
| Instructor | Pritom Rajkhowa |
| Implementation review date | 23 November 2026 |
| Public deployment | V3 TournamentVault deployed and source verified; V1/V2 retained as historical versions |
| Repository URL | https://github.com/Shana-Zhang/TournamentVault |

## Abstract

TournamentVault supports esports prize custody, entry fees, ranked results and disputes. V3 makes ETH the primary prize: the organizer escrows the exact ETH amount at creation, while an optional LRT bonus is deposited when registration opens. Winners receive both credits according to the same ranking shares; cancellation returns the escrowed ETH and any funded bonus. Entry fees and the separately backed LRT exchange retain their existing accounting. The interface defaults to an editable demonstration example of 0.05 ETH plus 10,000 LRT; these are not final event terms. All 64 automated scenarios pass, including seven V3-specific escrow, payout, optional-bonus, refund and rejected-payment cases. V1 used LRT prizes; V2 added participant-protective cancellation; V3 changes the prize to ETH plus optional LRT. The earlier vault addresses are V1 0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc and V2 0x9ab90329fdd0D1B3729c6eAb4bf78F354d63E3de. Results still depend on the appointed referee and resolver, and LRT redemption remains subject to exchange reserves.

Slither 0.11.6 reported 13 findings in the earlier V2 scan and 28 combined findings in the latest full-project V3 scan, with no High findings. V3 findings and their controls are summarized in `audit/slither-v3-review.md`.

## 1 Project Overview

### 1.1 Project Title

TournamentVault A Smart Contract Based Prize Pool for Esports Tournaments.

### 1.2 Objectives

The first objective is to make advertised funding and fixed tournament rules observable before a player pays an entry fee. V3 escrows the exact ETH primary prize at creation and deposits an optional LRT bonus before registration opens. The second objective is to register each wallet at most once, reject incorrect fees and stop entry at the declared deadline. The third objective is to settle results and objections without duplicate payouts, preserve separate ETH and token liabilities, and provide recoverable cancellation deposits. The fourth objective is reproducible testing followed by verified Sepolia deployment.

### 1.3 Background and Motivation

An off-chain tournament operator can change payment expectations or delay withdrawals without participants being able to inspect the underlying accounting. Ethereum provides a shared execution and transaction history for prize custody, deadline enforcement and recorded result decisions. The application benefits from this shared state because organizer, referee, resolver and players have different permissions and financial interests. Gameplay remains external: blockchain execution can enforce the agreed decision process but cannot independently determine the winner of a match.

### 1.4 Scope and Limitations

Implemented functions include tournament creation, ETH prize escrow, optional LRT bonuses, exact ETH entry fees, roster locking, ranked evidence submissions, player objections, resolver decisions, pull withdrawals, cancellation refunds, timeout recovery and fixed-rate token exchange. The exchange retains returned LRT rather than burning it. Finalized ETH entry fees belong to the organizer. Anti-cheat detection, fiat payments, game oracles and automated evidence retrieval are excluded. Role separation is enforced by distinct addresses, which does not establish independent human ownership. The default initial supply is one million LRT and may be changed before deployment; after deployment it is fixed.

## 2 System Design

### 2.1 Architecture Overview

The labelled architecture and state diagrams are in `docs/architecture.md`. LearningRewardToken mints once to the treasury. The V3 vault escrows the organizer's ETH prize and optional LRT bonus, and separately accounts for players' ETH fees. LRTExchange holds an independent ETH reserve and reusable token inventory. The wallet interface never receives a deployment private key; transaction authorization stays in the browser wallet. CLI deployment uses an excluded local environment file.

### 2.2 User Roles and Access Control

| Role | Permission |
| --- | --- |
| Organizer | Create fixed rules and escrow ETH prize, fund optional LRT bonus, cancel before the first entrant, claim cancellation return, withdraw finalized fees |
| Player | Register once, object within the window, claim fee refunds, withdraw own ETH prize and optional LRT bonus |
| Referee | Submit one initial ranking while Locked and before the result deadline |
| Resolver | Confirm or replace a disputed ranking before the resolution deadline |
| Any caller | Lock an expired roster, finalize an unchallenged result, trigger eligible timeout cancellation, buy or redeem with own assets |

The three privileged role addresses must differ and may not register in that tournament. Authorization uses `msg.sender`. Third parties cannot claim another wallet's credits, although a credit owner may choose a different receiving address.

### 2.3 Data and Process Design

Each Tournament stores roles, a State enum, a Rules struct, player count, fees, funding status, objection and resolution deadlines, ranked winners, payout shares and an evidence hash. Nested mappings record registration, refund claims and per-tournament prize credits. Aggregate ETH and token liabilities track assets still owed, including unsettled escrow and credited withdrawals.

Creation begins in Draft and immediately escrows the exact ETH prize. When registration opens, the organizer deposits the optional LRT bonus, if nonzero. The organizer may cancel only while the entrant count is zero, recovering the ETH prize and any deposited bonus. At the registration deadline anyone may lock the roster; insufficient entrants cancel it. A valid referee submission starts the objection window. No objection allows permissionless finalization after the window. A valid objection enters Disputed and requires a resolver decision or eventual timeout cancellation. Once a player has registered, the organizer cannot cancel; abandoned states use permissionless timeout cancellation and individual fee refunds. Prize and fee withdrawals are separate.

### 2.4 Technology Stack

| Component | Actual version or setting | Purpose |
| --- | --- | --- |
| Solidity | 0.8.26 | Checked arithmetic, compiler diagnostics and contract bytecode |
| Hardhat | 2.29.2 | Local EVM, compilation, testing and deployment |
| OpenZeppelin Contracts | 5.6.1 | ERC20, SafeERC20, ReentrancyGuard and Math |
| ethers | 6.17.0 | Contract calls, transactions and wallet integration |
| solidity-coverage | 0.8.17 | Statement, branch, function and line coverage |
| Compiler optimizer | Enabled, 200 runs | Same settings required for deployment and verification |
| EVM target | Cancun | Consistent compilation and Sepolia execution target |

The actual installed toolchain replaces the preliminary Solidity 0.8.24, Hardhat 2.22.3 and OpenZeppelin 5.0.2 versions in the proposal. Exact dependency versions are recorded in the lockfile. A pinned local solc package avoids a separate compiler download during compilation.

## 3 Smart Contract Details

### 3.1 Contract Functionality

LearningRewardToken has no public mint or burn function. Its constructor mints the entire supply to a nonzero treasury. TournamentVaultV3 escrows ETH at creation, can transfer an optional LRT bonus before accepting registrations, enforces the state machine, assigns ETH and token credits on terminal outcomes and protects withdrawals. LRTExchange sells available inventory and accepts approved tokens for reserved ETH credits, subject to liquidity. It has no privileged reserve withdrawal.

### 3.2 Interface Description

| Function | Caller | Inputs and effect | Main rejection conditions |
| --- | --- | --- | --- |
| createTournament | Organizer becoming creator | Rules, referee, resolver, basis-point shares, exact `msg.value` ETH prize; emits TournamentCreated | Invalid roles, time, capacity, zero/mismatched ETH prize or share sum |
| fundAndOpen | Organizer | Tournament id; transfers optional LRT bonus if nonzero; emits RegistrationOpened | Wrong role/state, expired registration, failed token transfer |
| register | Player | Id and exact ETH fee; emits PlayerRegistered | Duplicate, role conflict, full roster, late or wrong payment |
| lockRegistration | Anyone | Id; locks roster or cancels insufficient roster | Wrong state or before registration close |
| submitResult | Referee | Id, unique registered winners, evidence hash | Wrong state, expired result, invalid ranking or evidence |
| raiseDispute | Registered player | Id and reason hash; starts resolution deadline | Wrong state, late, outsider or empty evidence |
| resolveDispute | Resolver | Confirmed or replacement ranking and hash; settles | Wrong role/state, late or invalid ranking |
| finalizeResult | Anyone | Id; creates winner and organizer credits | Unresolved objection or window still open |
| cancelTournament | Organizer | Id; enables fee and token refunds before entrants join | Wrong role, entrants already registered, unsupported state or terminal state |
| cancelExpired | Anyone | Id; cancels abandoned draft/result/dispute | State-specific deadline has not expired |
| claimRefund | Registered player | Id; credits exact original fee | Not cancelled, outsider or repeated claim |
| refundOrganizer | Organizer | Id and recipient; returns ETH prize and any funded LRT bonus | Not cancelled, zero recipient or repeated claim |
| withdrawPrize | Credited player | Id and recipient; transfers own ETH prize and LRT bonus credits | Zero recipient or no credit |
| withdrawETH | Credit owner | Recipient; pays own ETH credit | Zero recipient, no credit or failed delivery |
| buy | Any funded caller | ETH payment; transfers fixed-quote LRT | Zero payment or insufficient inventory |
| redeem | Approved token holder | Token amount; reserves corresponding ETH | Invalid precision, insufficient reserve, allowance or balance |

The implementation uses descriptive revert strings and inherited OpenZeppelin errors. Significant changes emit indexed events; event and balance assertions accompany workflow tests.

### 3.3 Important Implementation Decisions

ETH and LRT are accounted separately because entry fees and prizes have different recipients. Settlement changes who is entitled to escrow without changing aggregate liabilities. Only successful withdrawals reduce them. Cancellation refunds are claimed individually, avoiding a loop through all players. Ranked winner processing is bounded at 32, and total entrants at 256. Fractional payout rounding is assigned to the final rank, preserving exact prize conservation. Redemptions reject amounts not divisible by one billion token base units, because smaller amounts would require a fraction of one wei at the chosen rate.

### 3.4 Representative Code Excerpts

The exchange quotes exact whole wei rather than silently rounding down:

```solidity
require(tokenAmount > 0 && tokenAmount % TOKEN_UNITS_PER_WEI == 0, "Invalid precision");
return tokenAmount / TOKEN_UNITS_PER_WEI;
```

The vault's ETH withdrawal updates ownership and liability before interaction:

```solidity
ethCredits[msg.sender] = 0;
ethLiability -= amount;
(bool ok,) = recipient.call{value: amount}("");
require(ok, "ETH transfer failed");
```

This function also uses nonReentrant. A rejected delivery reverts the entire transaction, restoring credit so the caller may select another recipient. The full source is included under `contracts/`.

## 4 Deployment on Testnet

### 4.1 Deployment Configuration

The intended public network is Ethereum Sepolia, chain ID 11155111. The deployment script permits only this chain or local development chain 31337. Compilation uses the versions and settings in section 2.4. Deployment mints to the deploying wallet and passes the resulting token address into both other constructors. The script records all constructor arguments and transaction receipts.

### 4.2 Deployment Information

Network: Sepolia. Chain ID: 11155111. Deployer: 0xdE3d23a1245f07859279b759b528615Eb55BcAc4. Deployment completed at 2026-11-23T07:43:03.945Z UTC. Compiler: v0.8.26+commit.8a97fa7a. Optimizer: enabled, 200 runs. EVM: Cancun.

| Contract | Address | Transaction | Block | Source verification |
| --- | --- | --- | --- | --- |
| LearningRewardToken | [0xE6b0239029382019323daca86A798364AEc5E637](https://sepolia.etherscan.io/address/0xE6b0239029382019323daca86A798364AEc5E637#code) | [0xe67c367cecab257cccce92c4f33ace4ffd166c47c20d82e39d30defd01df3557](https://sepolia.etherscan.io/tx/0xe67c367cecab257cccce92c4f33ace4ffd166c47c20d82e39d30defd01df3557) | 12194297 | Verified |
| TournamentVaultV3 | [0xbb74eEca21239034cCdB3e9244256DAd7A664FDb](https://sepolia.etherscan.io/address/0xbb74eEca21239034cCdB3e9244256DAd7A664FDb#code) | [0xed0e2fbc6af643618e19568f3a6480c07531e127878b2afaf999b06228f01dc3](https://sepolia.etherscan.io/tx/0xed0e2fbc6af643618e19568f3a6480c07531e127878b2afaf999b06228f01dc3) | 12194299 | Verified |
| LRTExchange | [0xEc6dc026d5E0a9F50fDcd42d21EA724a751a1e6B](https://sepolia.etherscan.io/address/0xEc6dc026d5E0a9F50fDcd42d21EA724a751a1e6B#code) | [0x1483bae24d47bfcaabbc5f83bc1265076a7a49931aefac0cdf9a1cb5cd5dc31a](https://sepolia.etherscan.io/tx/0x1483bae24d47bfcaabbc5f83bc1265076a7a49931aefac0cdf9a1cb5cd5dc31a) | 12194305 | Verified |

### 4.3 Etherscan Verification

All three contract sources are verified on Etherscan. The first request used a JavaScript-specific compiler suffix and was rejected. The compiler label has been corrected to the canonical version. Fresh compilation produces creation bytecode hashes identical to the deployment records; no redeployment is required for this metadata correction. The verifier records success only after a successful explorer response. See docs/verification-fix.md and deployment/source-match.json.

## 5 Test Cases and Validation

### 5.1 Testing Environment

Tests run on the in-process Hardhat EVM using separate organizer, referee, resolver, player and outsider accounts. Fixtures isolate scenarios and timestamp helpers exercise exact boundaries. A malicious receiver contract rejects ETH or attempts recursive withdrawal. The maximum-rank case uses 32 local impersonated accounts with test balances; these are development-only identities. Commands are `npm test`, `npm run coverage` and `npm run demo`.

### 5.2 Test Case Summary

The current normal run passes 64 scenarios: the original 57 token, V2 workflow, exchange and interface cases plus seven V3 ETH-prize and optional-bonus cases. Every scenario records purpose, preconditions, inputs, expected result, actual assertion outcome and status in `evidence/test-cases.md` and JSON.

| Evidence | Observed result | Meaning |
| --- | --- | --- |
| Normal test run | 64 passed, zero failed | Recorded workflow and adversarial expectations hold locally |
| Production coverage | 96.27% statements, 97.87% functions, 100% lines and 75.35% branches | V3 alone: 92.37% statements, 95% functions, 100% lines and 54.93% branches |
| Maximum 32-rank submission | 1,158,738 gas without instrumentation | Worst supported ranking validation fits within the tested 8 million gas budget |
| Maximum 32-rank settlement | 893,356 gas without instrumentation | Bounded credit allocation fits within the tested budget |
| Runtime bytecode | Token 1,764 bytes; exchange 2,513; V2 vault 11,996; V3 vault 12,731 | All below the 24,576-byte deployment limit |

### 5.3 Test Evidence

The historical V1 wallet demonstration used the original Sepolia contracts. The exchange received 0.001 test ETH in successful transaction 0xc07dba7da08c5f5a17390a86b9329b7d36620c757d52ef0330d62bd7cf49d205 at block 12161970, and 10,000 LRT in successful transaction 0x50f1653a56c49b32ab7d3d6b184913615575338b2b47edd98680fe63b21f59d5 at block 12161982. Independent RPC reads confirm both receipts and balances in evidence/sepolia-business-demo.json. The account-funding receipts and screenshots are preserved as historical V1 evidence. Those activities do not use the V2 contracts.

Public tournament 3 was funded with 1,000 LRT, opened and filled by three distinct player accounts. The referee submitted an initial ranking, player account 6 objected, and resolver account 3 corrected the top two places and finalized settlement. Accounts 5, 4 and 6 successfully withdrew 500, 300 and 200 LRT respectively, and organizer account 1 withdrew all 0.003 test ETH of entry fees. Account 5 bought 500 LRT for 0.0000005 ETH, redeemed 500 LRT and withdrew the corresponding ETH credit. Two additional unfunded drafts caused by queued wallet requests were cancelled without adding prize deposits. The rankings and evidence text are explicitly scripted coursework fixtures in evidence/sepolia-demo-scenario.json; no real esports match result is asserted.

Independent read-only snapshot evidence/sepolia-tournament-demo.json at block 12167151 confirms the V1 tournament settlement, prizes and exchange balances. All 20 collected V1 vault/exchange receipts succeeded. The separate V2 deployment is recorded in deployment/sepolia-v2.json and independently checked in deployment/sepolia-v2-read-only-check.json: all three receipts succeeded, deployed runtime bytecode matches the local build, source is verified, and the vault token/ETH liabilities are zero. The V2 smoke test in evidence/sepolia-v2-smoke.json created and funded a 1 LRT empty tournament, cancelled it before registration and returned the exact prize; the tournament ended with zero players and zero liabilities.

`evidence/test-output.txt` records the actual normal run. `evidence/coverage-output.txt` records the coverage run. `evidence/maximum-rank-gas.json` records the uninstrumented gas receipts. `evidence/local-demo.json` records real local transaction hashes, blocks and gas use for prize funding, three registrations, objection, replacement result, winner withdrawals, organizer fees, 500 LRT redemption and a second cancelled tournament. Final vault ETH liability, vault LRT liability and exchange ETH credits all equal zero in that local run. The supply stays fixed and the returned 500 LRT stays in exchange inventory.

## 6 Smart Contract Security Audit

### 6.1 Audit Scope and Methodology

The review covers the V2 historical contracts and the V3 vault with the pinned standard token. It combines compiler diagnostics, a limited project AST rule set, manual source review, Slither and automated adversarial tests. The current AST output records 3,664 project nodes, zero compiler errors, 39 review items, bytecode sizes and source SHA256 hashes. Slither 0.11.6 reported 13 V2 findings; the full V3 codebase scan reported 28 combined findings (five Medium, 18 Low and five Informational), with no High finding. V3 dispositions are summarized in audit/slither-v3-review.md. These checks do not establish absence of vulnerabilities; independent review remains outside the completed scope.

### 6.2 Findings Summary

The detailed finding matrix in `audit/security-review.md` records S01–S12, including V3 ETH/LRT accounting, impact, severity, controls and retests. Implemented controls address reentrant or repeated withdrawals, unauthorized settlement, unresolved objections, abandoned results, exact accounting, the V2 participant-protective cancellation rule and rounding. Remaining assumptions include timeout waiting periods, dishonest result controllers, insufficient exchange backing and permanently retained accidental surplus.

### 6.3 Manual Security Review

Withdrawals follow checks-effects-interactions and check low-level transfer success. Token interactions use SafeERC20 with the immutable deployed LRT. Roles and states restrict settlement, registration and refund ownership. Winner arrays must have the exact rank count, contain unique registered players and carry nonzero evidence hashes. A dispute cannot use ordinary finalization. Fee refunds do not iterate over all players, and ranked loops have fixed maximum sizes. Timestamp boundaries are consistent but still require practical operating margins. Evidence remains off-chain, with hashes rather than identifying match media recorded on-chain. Immutable contracts have no upgrade authority or emergency sweep. The system intentionally provides cancellation and timeout exits instead of an administrator asset withdrawal.

## 7 Conclusion and Future Work

### 7.1 Conclusion

The local project implements fixed-rule ETH prize escrow, optional LRT bonus, exact ETH fee accounting, player objections, independent resolver permissions, cancellation refunds and a fixed-rate reusable token exchange. The 64 automated scenarios include seven dedicated V3 prize-flow cases. Public V3 deployment and explorer source verification are complete. The main design lesson is that prize ownership, fee ownership, token inventory and exchange reserve obligations must be modelled independently even when one interface presents them together.

### 7.2 Future Work

The historical settlement and exchange demonstration used the original V1 Sepolia contracts. V2 is separately deployed and verified with participant-protective cancellation. V3 changes the prize model to ETH plus optional LRT bonus and is deployed and source verified at its own vault address. The final V3 demonstration used newly deployed token, vault and exchange contracts on 23 November 2026. Tournament #1 escrowed 0.001 ETH and 1 LRT bonus, with three 0.001 ETH entry fees. The referee submitted accounts 4, 5, 6; account 6 raised an objection; the resolver corrected the ranking to accounts 5, 4, 6. The 50/30/20 shares paid 0.0005/0.0003/0.0002 ETH and 0.5/0.3/0.2 LRT. All three prizes and 0.003 ETH organizer fees were withdrawn. A separate exchange demonstration bought 500 LRT for 0.0000005 ETH, approved and redeemed the tokens, and withdrew the ETH credit. The recorded 20 lifecycle and exchange receipts succeeded. Final player prize credits and account 5 exchange credit are zero. These small test amounts are the demonstrated terms; editable UI defaults are not event commitments. Further improvements could include multisignature dispute governance, signed structured evidence, reserve coverage monitoring and property-based state-machine testing. Mainnet readiness and real-world result integrity are outside the evidence provided by this coursework project.

## References

[1] OpenZeppelin, Contracts Documentation, https://docs.openzeppelin.com/contracts/5.x/, accessed 18 November 2026.

[2] Nomic Foundation, Hardhat 2 Configuration, https://v2.hardhat.org/hardhat-runner/docs/config, accessed 18 November 2026.

[3] Solidity, Security Considerations, https://docs.soliditylang.org/en/latest/security-considerations.html.

[4] ethers, Version 6 Documentation, https://docs.ethers.org/v6/.

[5] CSIT5760, supplied Final Project Report Template, provided by the student, inspected 19 November 2026.

## Appendices

| Appendix | Included materials |
| --- | --- |
| A Complete Solidity Source Code | contracts/LearningRewardToken.sol, contracts/TournamentVault.sol, contracts/TournamentVaultV3.sol, contracts/LRTExchange.sol |
| B Deployment Scripts and Configuration | scripts/deploy.js, scripts/verify.js, scripts/preflight.js, hardhat.config.js, .env.example |
| C Test Code and Outputs | test/system.test.js, contracts/test/PaymentReceiver.sol, evidence/test-cases.md, evidence/test-output.txt, evidence/coverage-output.txt |
| D Security Analysis Output | audit/static-analysis.json, audit/static-analysis-output.txt, audit/security-review.md |
| E Transaction Evidence | evidence/local-demo.json, evidence/sepolia-tournament-demo.json, evidence/sepolia-demo-scenario.json, deployment/sepolia.json and deployment/source-match.json |
| F Additional Diagrams | docs/architecture.md |

## Submission Checklist

- [x] Local source and pinned toolchain recorded
- [x] Positive, negative, boundary, balance and security tests pass
- [x] Test cases record expected and actual results
- [x] Manual security findings and residual limitations documented
- [x] Reproduction, interaction, deployment and verification instructions supplied
- [x] External static analyzer run and interpreted findings (audit/slither-review.md)
- [x] Sepolia deployment and verified source links
- [x] Wallet interaction evidence
- [x] Supplied Word template completed, table of contents updated and PDF exported
- [x] Checkpoint package refreshed with public deployment evidence
