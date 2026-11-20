# Completion Status

Updated 20 November 2026. All project files are under E:\BC_Project.

| Item | Status | Evidence |
| --- | --- | --- |
| Three runtime components | Complete locally and publicly deployed | Token, V3 vault and exchange; contracts/ |
| V3 ETH prize + optional LRT bonus | Implemented, locally tested, deployed and source verified | contracts/TournamentVaultV3.sol; deployment/sepolia-v3.json; docs/prize-design-v3.md |
| Fixed supply and selected exchange rate | Complete | T01, X01, X05 |
| Registration, results, disputes, settlement and refunds | Complete locally | 64 passing scenarios, including seven V3 prize-flow tests |
| Reentrancy, repeated claims and concurrent escrow checks | Passed | F02, F10–F12, X08–X11 |
| Maximum supported ranked result | Passed | 32 ranks; submission 1,158,738 gas; settlement 893,356 gas |
| Coverage | Complete | Overall: 96.27% statements, 97.87% functions, 100% lines, 75.35% branches; V3: 92.37%, 95%, 100%, 54.93% |
| Full local transaction demo | Passed | evidence/local-demo.json |
| Wallet interface code and resource access checks | Implemented | ui/ and W01–W03 |
| Actual browser wallet interaction | Complete for scripted settlement and exchange workflow | Three registrations, objection, corrected resolution, 500/300/200 LRT payouts, fee withdrawal, buy/redeem/ETH withdrawal; unused drafts 1/2 cancelled |
| Manual and limited AST security review | Complete within stated scope | audit/ |
| Slither | V2 and V3 reviewed | 0.11.6; V2: 13 findings; V3 full scan: 28 combined, no High; audit/slither-v3-review.md |
| Sepolia RPC preflight | Passed in the Windows terminal | Sepolia chain and funded wallet confirmed |
| Explorer API key | Used successfully for public source verification | All three contracts recorded as Verified |
| Public deployment and verification | V1/V2 records retained; V3 new vault deployed and verified | deployment/sepolia-v3.json; docs/deployment-information.md |
| Seven report chapters | Complete with final public evidence | docs/project-report.md |
| Formal Word and PDF report | Refreshed from supplied course template; exported and visually checked | docs/TournamentVault_Final_Report.docx and .pdf |
| Submission archive | Rebuilt and passed integrity/secret checks | submission/21317896_ZhangShihan_CSIT5760_FinalProject.zip |

The historical V1/V2 public deployment, verification and V1 settlement/exchange evidence remain complete. V3 changes the prize design, has seven dedicated passing local tests, and is deployed and source verified. Its current on-chain tournament count and liabilities are zero; no V3 prize demo has been sent because the demonstration amount remains unfinalized. Do not treat V1/V2 tournament activity as V3 prize-flow evidence.

Funded cancellation/refund behavior is covered by local tests and evidence/local-demo.json; the historical public cancellations were unfunded draft cleanup. The report date is 20 November 2026. Source, reproducibility workflow, V3 deployment records and the final report are published to https://github.com/Shana-Zhang/TournamentVault on main at commit 4f134df6b20aac14980111ba242c570e27aaeac6. No course-portal submission has been made.

```powershell
powershell -ExecutionPolicy Bypass -File E:\BC_Project\run.ps1 preflight
node scripts/read-only-check.js
```

The V3 read-only check does not send a transaction. The V3 deploy command submits one new vault deployment only; it reuses the existing token and exchange and preserves V1/V2 records.
