# Sepolia demonstration progress

## V3 MetaMask test in progress — 23 November 2026

Tournament #1 was created with a 0.001 ETH escrowed prize and 1 LRT bonus. Accounts 4, 5 and 6 registered successfully (3/3). Registration closes at 16:15 China time; results are due at 18:15. Referee result, dispute, resolution and withdrawals are still pending. Transaction hashes are recorded in `evidence/sepolia-v3-metamask-test.json`.

Tournament #2 was created with the same amounts and an earlier 15:25 registration deadline. Its bonus funding/opening succeeded, but the first registration reverted and the displayed player count remains zero. At 15:30 the deadline had passed; no further registrations were attempted. Cancellation and organizer recovery are now confirmed in the frontend. The refundOrganizer transaction directly returned 0.001 ETH and 1 LRT to account 1; no separate ETH credit withdrawal is required. Transaction hashes are recorded in evidence/sepolia-v3-tournament2-cleanup.json.

The participant-list event filter was corrected to resolve ethers v6 deferred topics. The browser now displays all three registered addresses for tournament #1. Formal report screenshots and settlement evidence remain to be completed.

## V3 update — 20 November 2026

The frontend now targets TournamentVaultV3 at `0x86b64B582dB3F6DD9bf43A923300B2d150D72D17`. Its deployment succeeded and source verification passed. The read-only snapshot reports zero tournaments and zero ETH/token liabilities. The existing token and LRTExchange were reused. No V3 tournament has been created and no prize deposit has been made; the editable 0.05 ETH and 10,000 LRT demo values are not final. The V1/V2 activity below is historical.

## Final current status — 19 November 2026

The planned browser-wallet settlement and exchange demonstration is complete. Final independent snapshot: 2026-11-19T08:05:08.066Z, block 12167151. Tournaments 1 and 2 are Cancelled; tournament 3 is Finalized. Player accounts 4/5/6 hold 300/500/200 LRT, all prize credits are zero, vault token/ETH balances and organizer fee credit are zero. Exchange inventory is 10,000 LRT, available reserve and balance are both 0.001 ETH, and account 5 redemption credit is zero. All 20 collected vault/exchange transaction receipts succeeded. ERC20 approvals are retained separately in browser activity.

Final reports: docs/TournamentVault_Final_Report.docx and .pdf, 24 pages, updated contents and all page images inspected. The original template is unchanged. The final submission archive includes source, tests, security analysis, public transaction evidence and final reports; its content and credential checks are recorded in submission/final-package-audit.json. Local tests pass 57/57 after the interface safeguards. Funded cancellation refunds remain local-test/local-demo evidence; public cancellations only cleaned empty drafts.

The remaining sections are historical progress notes. Earlier pending-request and network-failure statements have been superseded by this final status.

## Authorized scope

Use the existing three deployed contracts. Exchange inventory: 10,000 LRT. Exchange reserve: 0.001 Sepolia ETH. Tournament prize: 1,000 LRT; entry fee: 0.001 Sepolia ETH per player, plus actual gas. Account 1 may fund the other five demo accounts up to 0.01 Sepolia ETH each. No mainnet transactions or redeployment.

## Confirmed exchange preparation

Independent RPC reads in `evidence/sepolia-business-demo.json` confirm:

- Reserve contribution: 0.001 Sepolia ETH; successful transaction `0xc07dba7da08c5f5a17390a86b9329b7d36620c757d52ef0330d62bd7cf49d205`, block 12161970.
- Inventory contribution: 10,000 LRT; successful transaction `0x50f1653a56c49b32ab7d3d6b184913615575338b2b47edd98680fe63b21f59d5`, block 12161982.
- Connected browser wallet, Sepolia network and reserve balance are captured in `evidence/sepolia-reserve-confirmed.png`.

## Demo accounts

| Account | Role | Public address |
| --- | --- | --- |
| 1 | Organizer and funding source | 0xdE3d23a1245f07859279b759b528615Eb55BcAc4 |
| 2 | Referee | 0x95A6f7B1dEa4e49503861b4D5e98266c50EBAA0e |
| 3 | Resolver | 0x030aF0343d109Ae1130391b5b440dACE4E2DF78f |
| 4 | Player 1 | 0xF7a61C6D5377130a45aE4F9cB4b4f8FFD8f2E506 |
| 5 | Player 2 | 0xA296C8C788079aB0CE0725daa350587cdED0d7F0 |
| 6 | Player 3 | 0x2a85946a52C40f9A3b0dB85C20F4FD5887eA79A2 |

The user supplied these public addresses. Account 2 already had 0.01 Sepolia ETH and must not be funded again. `evidence/sepolia-account-funding.json` is the current source for individual funding receipts and completion status. Initial attempts stopped before submission because conservative gas quantity thresholds were lower than the RPC estimate. Current transfers require code-free recipient addresses, estimated gas at most 300,000 and a maximum gas budget of 0.001 test ETH per transaction. Previously recorded transfers must be checked before retrying.

## Remaining demonstration evidence

Tournament creation and full prize deposit; player registration; referee result; objection and resolver decision; winner prize withdrawals; organizer fee withdrawal; exchange buy, redemption and ETH withdrawal; cancellation and refunds. Keep screenshots and receipts for each completed phase. Do not claim completion based on local tests alone.

## Report template

The supplied template is retained unchanged at `reference/CSIT5760_Final_Project_Report_Template.docx`. It requires an abstract of roughly 150–250 words, seven chapters, a labelled architecture diagram, interface/deployment/test/security tables, references and six appendices. It has an automatic table of contents and page-number fields.

Template rendering through installed Word succeeded after the packaged renderer reported missing LibreOffice; reference PDF and eight inspected page images are under `.local/report-work/`. A 21-page report working copy is now available as `docs/TournamentVault_Report_Working.docx` and `.pdf`, with updated table of contents, an architecture diagram, evidence tables and complete production Solidity source. All 21 pages of revision 3 were inspected. It is not a final submission: public lifecycle evidence, submission date, repository publication decision and final package checks remain open.

## Latest stalled creation check

At 2026-11-19T02:37:27.981Z (10:37 Beijing time), read-only RPC checks at block 12165588 returned tournamentCount=0 and organizer latest/pending nonce=16/16. The earlier browser creation request did not submit a transaction. Its registration/result deadlines are now in the past; never reuse them. Browser control reported Debugger unattached, so no new creation was attempted. Restore browser control and refresh the project page before scheduling a new future registration deadline. Do not repeat exchange contributions or account top-ups.

## Browser restored; wallet RPC errors identified

On November 19, Edge control was restored, the project page was refreshed and account 1 reconnected. Initial reads failed with `missing revert data`; a subsequent connection loaded the expected 990,000 LRT and 0.001 ETH exchange reserve. A new create request used registration/result deadlines November 19 at 15:45/17:45 Beijing, prize 1,000 LRT, fee 0.001 test ETH, capacity 3, shares 50/30/20%, objection window 2 minutes and resolution window 10 minutes. The user reported no wallet confirmation request. No transaction hash appeared.

Project-page console warnings explicitly reported: `MetaMask - RPC Error: RPC endpoint returned too many errors, retrying in 0.5 minutes. Consider using a different RPC endpoint.` The `Unknown tournament` message also appears and is expected while tournament 1 does not exist; it does not establish a creation revert. Sanitized messages are retained in `evidence/sepolia-wallet-connection-errors-20261119.json`. A pre-refresh screenshot is `evidence/sepolia-create-request-20261119.png`.

The page was refreshed again to clear the stalled interface. Read-only checks at 2026-11-19T07:04:43.699Z (15:04 Beijing), block 12166868, still found tournamentCount=0 and organizer latest/pending nonce=16/16. No repeat contribution or deployment occurred. Both the configured RPC and the public endpoint `https://ethereum-sepolia-rpc.publicnode.com` successfully returned Sepolia block numbers during independent HTTPS checks. The wallet's RPC connection needs repair before another browser create attempt; the agent cannot operate the blocked wallet extension page. Recheck chain state and future deadlines before resuming.

The user subsequently reported completing the RPC change. At 2026-11-19T07:11:47.533Z, block 12166902, the independent check still returned count 0 and nonce 16/16. Reconnection then successfully loaded balances in the browser. A fresh creation request with the same still-future 15:45/17:45 Beijing deadlines was issued once; it is awaiting the user's wallet response, with no hash displayed. Screenshot: `evidence/sepolia-create-after-rpc-change.png`. Do not regard it as a confirmed creation. The latest page log at 07:12 UTC showed only the expected `Unknown tournament` read revert and no new rate-limit warning. The interface now explicitly displays "waiting for wallet approval" for future transaction requests; JavaScript syntax validation passed.

## Current active demonstration: tournament 3

After request-stage instrumentation confirmed `eth_estimateGas` followed by `eth_sendTransaction`, the user located the wallet confirmation and submitted. Earlier queued requests were also confirmed: three Draft tournaments were created. Reloading the website had not cancelled wallet-side requests. No contract was redeployed. Only tournament 3 is being funded and used; tournaments 1 and 2 remain unfunded drafts awaiting cleanup. Do not approve any further creation requests.

- Tournament 3 creation: `0x735039bb33d161ecdec14c1790bb93959d867524316fe20881f689c940c5e522`.
- Exact 1,000 LRT allowance to the existing vault: `0x9347f8621a59610c6980735c623467f59857ff9ad8f2557bd79a599a696e6086`.
- Fund and open tournament 3: `0xee0941e1bfa8180087c0021c6634a76902abe2b4208a70af592569b6592274dc`.
- Browser confirms Registration open, organizer balance 989,000 LRT; screenshot `evidence/sepolia-tournament3-open.png`.
- Independent read-only evidence at 2026-11-19T07:20:42.347Z, block 12166942, confirms vault holds 1,000 LRT, tournament 3 is Registration open and all three intended players remain unregistered with 0.01 test ETH each. Full events/receipts are in `evidence/sepolia-tournament-demo.json`, collected by `scripts/check-tournament-demo.js` (no signer or transactions).

The user switched MetaMask to account 4, but the website still exposed account 1. A `Choose account` button was added using standard `wallet_requestPermissions` for `eth_accounts` so the user can select account 4 for this website. Its connection request is pending; no registration transaction has been issued. Never register from the organizer by mistake. Registration closes at 15:45 and results are due at 17:45 Beijing on November 19.

The first reported account-4 selection still left only organizer account 1 exposed through `eth_requestAccounts`. No registration was sent. The interface now lists the wallet-exposed public addresses and explicitly selects the signer by address rather than assuming the first account is intended. `Choose account` now revokes this site's existing `eth_accounts` permission and requests a fresh connection; it suppresses page reloads during that flow so an account-change event cannot interrupt it. The user has been asked to select only the supplied player-1 address in this fresh connection request. Completion is pending live confirmation; never infer the signer from the wallet's displayed account name alone.

Account 4's fresh connection then exposed the correct address. Its registration succeeded in transaction `0xf2117fc71b5fe702024fc9035cea904fbf01e5f810c0fcc54d5ec210c9f8319d`. Read-only evidence at 2026-11-19T07:30:52.849Z, block 12166991, confirms account 4 is registered, player count is 1/3 and vault ETH balance is 0.001. Account 4 retains approximately 0.0082827555 test ETH. Screenshot: `evidence/sepolia-first-player-registered.png`.

An initial attempt to connect all six accounts was blocked by automatic approval review because prior explicit website-connection approval covered only account 4. No workaround was attempted. The user subsequently explicitly authorized connecting all six existing demo accounts to `http://127.0.0.1:8081/`, with public addresses exposed and wallet confirmation retained for every transaction. A fresh connection-selection request was then issued within that scope; the user is completing it. Next, select and verify account 5's full address in the website before registering it.

The user reported no connection popup. A subsequent page check showed only account 4 exposed and no pending transaction. The chooser was changed to direct `wallet_requestPermissions` while retaining the account-change reload suppression. MetaMask then returned the explicit error: `Request of type 'wallet_requestPermissions' already pending for origin http://127.0.0.1:8081. Please wait.` No more chooser requests should be issued until that existing wallet-side request is completed or rejected. Screenshot: `evidence/sepolia-six-account-permissions-request.png`. The user has been asked to close the standalone MetaMask tab, open the actual Edge extension popup and report its visible page title; the extension page itself remains unavailable to agent inspection. The account-5 registration has not been initiated. If the registration deadline passes before all three players register, do not create or fund a replacement automatically: assess the existing tournament's cancellation/refund path first.

The user's screenshot showed MetaMask's connection confirmation with six selected accounts; the remaining step was the Connect button below the visible portion. The user completed it. At approximately 15:36 Beijing the website exposed all six supplied addresses. Its account selector was set to account 5 (`0xA296C8C788079aB0CE0725daa350587cdED0d7F0`); both the signer badge and address selector confirmed it, and tournament 3 showed 1/3 players. One account-5 registration request was then issued for exactly 0.001 test ETH. It is waiting for the user to confirm; no hash is recorded yet. Screenshot: `evidence/sepolia-account5-registration-request.png`. The intended next step is confirming this receipt, then selecting account 6 by its full address in the website without another connection-permission request.

Account 5 registration subsequently confirmed in `0x44914dec9634ff4e5f7279b33aa9e88471767c0f51ddb3d4dc27736c91736a49`, and account 6 confirmed in `0xbd695d00e60828d21d41527a0a0e5ab7348ca515d40a72bd63152d60bf799c08`. The interface showed 3/3 players; screenshot `evidence/sepolia-all-players-registered.png`. After a transient page selection change to organizer/account 1 and tournament 7, the user confirmed no additional transactions were submitted. The page was restored and freshly checked for referee account 2 and tournament 3; do not infer that tournament 7 exists from a lookup selection alone.

After the 15:45 registration deadline, an indexed-button attempt was blocked by automatic approval review due to concern over stale button indices. The complete accessibility tree was reread and the exact `Lock registration` button was selected semantically. No blocked action was bypassed. Locking then confirmed in `0x656c958368ef993f668cd511c021e408934c14a3aba5d74b675cdb009fbb7c7b`; the page showed Locked. A single `Submit as referee` request with the initial scripted ranking in `evidence/sepolia-demo-scenario.json` is awaiting wallet confirmation. Its objection window is only 2 minutes; once confirmed, verify the deadline and issue the prepared player objection promptly. No result submission hash has been recorded yet.

Repeated independent read-only receipt collection attempts have timed out during automatic permission review before starting. Existing browser receipts and state transitions are recorded above; refresh `evidence/sepolia-tournament-demo.json` when those reads can execute. Do not misrepresent that older JSON snapshot as the latest lifecycle state.

## Confirmed dispute settlement and prize payment

- Referee result: `0x9559bee03bdf3aee41a009a8dee2a85554569cda6e2b1752cf3581f0bdf3cbf7`; objection deadline 15:50:48 Beijing.
- Player/account 6 objection: `0xbc251b50beeec7a8ef601f42b1530aaf2b3289f00d0734cee49b4478301c7307`; resolution deadline 15:59:36.
- Resolver/account 3 corrected ranking and finalized: `0x3f99abcb8874f545ad9268e736ff6f4df84fe222847579a3f042c45b11b5a7ce`.
- Account 5 withdrew 500 LRT: `0xba8f533bd99ee5d191c703a7ba09eaecbf7690892702e3445567e77cb15969b6`.
- Account 4 withdrew 300 LRT: `0x0e0c42b556a485ca6355b90e9505c2bd05853156e934e0d6aaba59e0c47f1bdc`.
- Account 6 withdrew 200 LRT: `0x5a13a71e9693cb3845de872c93f37da8a8520e4267564748054430b158bcda69`.

Independent read-only collection recovered using `scripts/check-tournament-demo.js --public-rpc`, which never loads the environment file or credentials. Snapshot 2026-11-19T07:56:22.066Z, block 12167109, confirms count=3; tournaments 1/2 remain unfunded Drafts; tournament 3 is Finalized; all three registrations are true; player token balances are 300/500/200 LRT; prize credits all zero; vault LRT zero. The JSON now contains 15 parsed events and 14 successful vault transaction receipts. Earlier automatic-review timeout notes are historical, not a current network outage.

The browser then confirmed organizer/account 1 has a 0.003 ETH vault credit. A single `Withdraw vault ETH` request is pending wallet confirmation; it has no recorded hash yet. Do not issue it again. Next steps: confirm fee withdrawal, run a 500 LRT exchange buy/redeem/ETH-withdrawal round trip, cancel unfunded drafts 1/2, refresh public evidence and final report/package. Any funded cancellation/refund path remains demonstrated locally only unless separately authorized and performed publicly.

