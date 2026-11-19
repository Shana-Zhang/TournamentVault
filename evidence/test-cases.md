# Test Cases and Validation

| ID | Purpose | Preconditions | Input / steps | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Mint the supply once to treasury | Fresh deployment | Deploy 1,000,000 LRT | Treasury balance and total supply match | Assertions matched expected result | Pass |
| T02 | Reject invalid treasury and zero supply | Token factory | Zero treasury or zero supply | Both deployments revert | Assertions matched expected result | Pass |
| T03 | Reject token addresses without contract code | Vault and exchange factories | Deploy with zero or EOA token | Deployments revert | Assertions matched expected result | Pass |
| V01 | Create immutable rules and distinct roles | Draft fixture | Read tournament 1 and unknown ids | Exact rules; unknown ids revert; no rule setter | Assertions matched expected result | Pass |
| V02 | Reject zero and overlapping roles | Draft fixture | Zero role; organizer/referee/resolver overlap | Creation reverts | Assertions matched expected result | Pass |
| V03 | Reject malformed prize shares and capacity | Draft fixture | Zero prize, empty/33/zero shares, wrong sum, capacity < ranks or >256 | Creation reverts for every invalid variant | Assertions matched expected result | Pass |
| V04 | Reject invalid deadlines and objection windows | Draft fixture | Past deadline; result before close; windows outside 60s..7d | All invalid values revert | Assertions matched expected result | Pass |
| V05 | Require organizer approval and full LRT funding | Unfunded draft | Unauthorized, unapproved, then approved fundAndOpen | Unauthorized/unapproved fail; exact token escrow opens | Assertions matched expected result | Pass |
| V06 | Reject opening after registration deadline | Approved draft at close | fundAndOpen at deadline | Registration closed | Assertions matched expected result | Pass |
| V07 | Register exact fee and preserve escrow | Open tournament | Player pays exact fee | Event, roster and ETH liability match | Assertions matched expected result | Pass |
| V08 | Reject wrong fees and duplicate registration | Open tournament | Pay fee +/-1 wei; register twice | Wrong fee and Already registered reverts | Assertions matched expected result | Pass |
| V09 | Exclude privileged roles from playing | Open tournament | Organizer, referee, resolver register | Role cannot play | Assertions matched expected result | Pass |
| V10 | Enforce exact maximum capacity | Three players enrolled; max=3 | Fourth player registers | Full; roster remains three | Assertions matched expected result | Pass |
| V11 | Enforce registration deadline boundary | Open tournament | Register at close-1 then exactly close | First succeeds; second reverts | Assertions matched expected result | Pass |
| V12 | Lock at close and reject early or repeated locking | Enrolled tournament | Lock before/at/after close | Early and repeat revert; exact close emits Locked | Assertions matched expected result | Pass |
| V13 | Cancel automatically when too few players register | Open with one player and three prize ranks | Lock after close | Cancelled with recoverable prize and fee | Assertions matched expected result | Pass |
| V14 | Permit a zero entry fee | New free tournament | Open and register with zero ETH | Registration succeeds without ETH liability | Assertions matched expected result | Pass |
| R01 | Only referee can submit one ranked result | Locked tournament | Unauthorized then referee then repeat submission | Only valid submission succeeds and emits evidence | Assertions matched expected result | Pass |
| R02 | Reject invalid ranking and empty evidence | Locked tournament | Empty, duplicate, outsider rankings; zero hash | Each invalid result reverts | Assertions matched expected result | Pass |
| R03 | Reject result at its exact deadline | Locked tournament | Submit at resultDeadline | Result expired | Assertions matched expected result | Pass |
| R04 | Do not submit or claim prizes before the proper state | Open tournament | Submit, finalize, prize/refund withdrawal before settlement | All calls revert | Assertions matched expected result | Pass |
| R05 | Finalize only when objection window closes | Pending result | Finalize before then at disputeDeadline | Too early then Finalized | Assertions matched expected result | Pass |
| R06 | Only registered players can raise a nonempty objection | Pending result | Outsider dispute; zero reason; valid dispute; repeat | Invalid calls revert; valid objection opens dispute once | Assertions matched expected result | Pass |
| R07 | Reject objection exactly at the closing timestamp | Pending result | Dispute at disputeDeadline | Dispute closed | Assertions matched expected result | Pass |
| R08 | Block ordinary finalization while a dispute is unresolved | Disputed result | Wait past objection window and finalize | Wrong state; no credits | Assertions matched expected result | Pass |
| R09 | Resolver replaces ranking and settles once | Disputed result | Wrong caller, valid replacement, duplicate resolution | Only resolver succeeds; replacement earns first prize | Assertions matched expected result | Pass |
| R10 | Resolver can confirm the original ranking | Disputed result | Resolve with original winners | Original first-place credit preserved | Assertions matched expected result | Pass |
| R11 | Expired resolver cannot race timeout cancellation | Disputed result | Resolve then cancel at resolutionDeadline | Resolution expired; anyone cancels | Assertions matched expected result | Pass |
| F01 | Allocate token prizes and organizer fees separately | Finalized tournament | Inspect 50/30/20 credits and withdraw all | 1000 LRT paid to winners; three ETH fees to organizer; liabilities zero | Assertions matched expected result | Pass |
| F02 | Reject repeated prize and fee withdrawals | Finalized tournament | Withdraw prize/ETH twice and finalize twice | Second claims and finalization revert | Assertions matched expected result | Pass |
| F03 | Reject zero recipients and unauthorized claims | Finalized tournament | Zero recipient; outsider prize or fee claim | No credits change | Assertions matched expected result | Pass |
| F04 | Cancel and recover exact player fees and organizer tokens | Three enrolled players | Cancel; claim and withdraw refunds; return prize | Original deposits restored; no winner credits; zero liabilities | Assertions matched expected result | Pass |
| F05 | Reject duplicate or unauthorized cancellation refunds | Cancelled enrolled tournament | Double refunds; outsider/zero recipients; repeat cancellation | All invalid claims revert | Assertions matched expected result | Pass |
| F06 | Permit organizer cancellation in every nonterminal state | Draft/open/locked/pending/disputed fixtures | Organizer cancels; outsider attempts | Only organizer cancels; funded prize recoverable | Assertions matched expected result | Pass |
| F07 | Reject cancellation or timeout after finalization | Finalized tournament | cancelTournament and cancelExpired | Terminal state and Not expired | Assertions matched expected result | Pass |
| F08 | Recover abandoned drafts and result submissions | Draft/open/locked fixtures | Cancel too early then at relevant deadline | Early call rejected; timeout emits cancellation | Assertions matched expected result | Pass |
| F09 | Assign rounding remainder to final rank | Prize=10001 base units; shares 50/30/20 | Fund, enroll, submit and settle | Credits 5000+3000+2001 exactly equal escrow | Assertions matched expected result | Pass |
| F10 | Isolate liabilities across multiple tournaments | Two funded tournaments share players | Cancel one, settle other, withdraw both | Refunds and prizes remain distinct; all liabilities clear | Assertions matched expected result | Pass |
| F11 | Rejected ETH delivery restores credit and allows another recipient | Organizer ETH credit; receiver rejects | Withdraw to rejecting contract then EOA | Failure rolls back; alternate withdrawal succeeds | Assertions matched expected result | Pass |
| F12 | Block a refund receiver reentering its ETH withdrawal | Contract player in cancelled tournament | Refund to receiver with recursive withdrawal payload | One payment; recursive call fails; liability zero | Assertions matched expected result | Pass |
| F13 | Settle the maximum 32-rank result within the gas limit | 32 funded and registered distinct players | Submit 32 unique ranked winners; settle and withdraw all | Submission and settlement each under 8M gas; exact prize conservation | Assertions matched expected result | Pass |
| F14 | Preserve liabilities when balances include unsolicited surplus | Finalized prize and fee credits | Simulate forced ETH and donate LRT, then withdraw all obligations | Liabilities reach zero; surplus remains; balance >= liability | Assertions matched expected result | Pass |
| X01 | Quote the chosen rate exactly | Exchange deployment | Quote 1 and 1000 LRT | 1e9 and 1e12 wei | Assertions matched expected result | Pass |
| X02 | Reject zero and unrepresentable redemption amounts | Exchange deployment | Quote or redeem zero, 1 base unit, 1e9+1 units | Invalid precision | Assertions matched expected result | Pass |
| X03 | Sell inventory for ETH at the fixed price | Funded exchange with inventory | Buy 50 LRT for 5e10 wei | Buyer gains 50 LRT and reserve increases by price | Assertions matched expected result | Pass |
| X04 | Reject empty buys and inventory overdraw | Empty exchange | Buy with zero or 1 wei | Zero payment or Insufficient inventory | Assertions matched expected result | Pass |
| X05 | Redeem LRT without burning and withdraw exact ETH | Funded exchange; approved holder | Redeem 1000 LRT then withdraw | Supply constant; inventory grows; credit paid exactly | Assertions matched expected result | Pass |
| X06 | Reject insufficient ETH backing | Token holder; no exchange reserve | Redeem one LRT | Insufficient reserve; tokens unchanged | Assertions matched expected result | Pass |
| X07 | Rollback reserved credit when token transfer fails | Funded exchange; unapproved or tokenless holder | Redeem without allowance or without balance | Reverts; credit and reserve unchanged | Assertions matched expected result | Pass |
| X08 | Do not reuse ETH already promised to another seller | Reserve equals first redemption | First holder reserves all ETH; second tries redeem | Second rejected; first credit remains payable | Assertions matched expected result | Pass |
| X09 | Reject duplicate withdrawals and zero recipients | Holder has redemption credit | Withdraw to zero; withdraw twice | Zero recipient and No credit | Assertions matched expected result | Pass |
| X10 | Restore redemption credit after rejected ETH payment | Holder credit; rejecting receiver | Withdraw to receiver then EOA | Credit survives failure; EOA withdrawal succeeds | Assertions matched expected result | Pass |
| X11 | Block reentrant exchange withdrawal | Contract holder with redeemed LRT | Withdraw with recursive payload | Only one payout; nested call fails | Assertions matched expected result | Pass |
| X12 | Support buy and redeem round trips without value creation | Funded inventory | Buy then redeem 123456789 wei equivalent | Balances and supply return to original values | Assertions matched expected result | Pass |
| W01 | Serve the interface and bundled script | Local handler; no wallet | GET /, /app.js, /style.css, /ethers.js | Only intended static resources returned with a restrictive content policy | Assertions matched expected result | Pass |
| W02 | Reject requests for private configuration and project files | Local handler | GET .env, source files and traversal paths | 404 without exposing local bytes | Assertions matched expected result | Pass |
| W03 | Reject mutation methods on the static server | Local handler | POST / | 404 and no file write | Assertions matched expected result | Pass |
