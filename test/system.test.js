const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const fs = require('fs');
const path = require('path');

const E = ethers.parseEther;
const HASH = ethers.id('bracket and match evidence');
const cases = [];
function scenario(id, purpose, preconditions, input, expected, fn) {
  const row = { id, purpose, preconditions, input, expected, actual: 'Not run', status: 'Not run' };
  cases.push(row);
  it(`${id}: ${purpose}`, async function () {
    try { await fn(); row.actual = 'Assertions matched expected result'; row.status = 'Pass'; }
    catch (error) { row.actual = error.message; row.status = 'Fail'; throw error; }
  });
}
async function fixture() {
  const [organizer, referee, resolver, a, b, c, outsider] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory('LearningRewardToken')).deploy(organizer.address, E('1000000'));
  const vault = await (await ethers.getContractFactory('TournamentVault')).deploy(token.target);
  const exchange = await (await ethers.getContractFactory('LRTExchange')).deploy(token.target);
  const receiver = await (await ethers.getContractFactory('PaymentReceiver')).deploy();
  const now = await time.latest();
  const rules = { entryFee: E('0.001'), prize: E('1000'), maxPlayers: 3,
    registrationDeadline: now + 1000, resultDeadline: now + 2000, disputeWindow: 100, resolutionWindow: 200 };
  const shares = [5000, 3000, 2000];
  await vault.createTournament(rules, referee.address, resolver.address, shares);
  return { organizer, referee, resolver, a, b, c, outsider, token, vault, exchange, receiver, rules, shares };
}
async function opened() {
  const f = await fixture();
  await f.token.approve(f.vault.target, f.rules.prize);
  await f.vault.fundAndOpen(1);
  return f;
}
async function enrolled() {
  const f = await opened();
  for (const player of [f.a, f.b, f.c]) await f.vault.connect(player).register(1, { value: f.rules.entryFee });
  return f;
}
async function locked() {
  const f = await enrolled();
  await time.increaseTo(f.rules.registrationDeadline);
  await f.vault.lockRegistration(1);
  return f;
}
async function pending() {
  const f = await locked();
  await f.vault.connect(f.referee).submitResult(1, [f.a.address, f.b.address, f.c.address], HASH);
  return f;
}
async function disputed() {
  const f = await pending();
  await f.vault.connect(f.a).raiseDispute(1, ethers.id('objection'));
  return f;
}
async function finalized() {
  const f = await pending();
  await time.increaseTo((await f.vault.getTournament(1)).disputeDeadline);
  await f.vault.finalizeResult(1);
  return f;
}
async function collateralized() {
  const f = await fixture();
  await f.token.transfer(f.a.address, E('1000'));
  await f.token.transfer(f.exchange.target, E('10000'));
  await f.organizer.sendTransaction({ to: f.exchange.target, value: E('0.001') });
  await f.token.connect(f.a).approve(f.exchange.target, E('1000'));
  return f;
}
async function invariant(f) {
  expect(await ethers.provider.getBalance(f.vault.target)).to.be.gte(await f.vault.ethLiability());
  expect(await f.token.balanceOf(f.vault.target)).to.be.gte(await f.vault.tokenLiability());
  expect(await ethers.provider.getBalance(f.exchange.target)).to.be.gte(await f.exchange.totalCredits());
}
after(function () {
  const dir = path.join(__dirname, '..', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'test-cases.json'), JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
  const esc = s => String(s).replace(/\|/g, '/').replace(/\r?\n/g, ' ');
  const lines = ['# Test Cases and Validation', '', '| ID | Purpose | Preconditions | Input / steps | Expected | Actual | Status |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of cases) lines.push(`| ${[r.id, r.purpose, r.preconditions, r.input, r.expected, r.actual, r.status].map(esc).join(' | ')} |`);
  fs.writeFileSync(path.join(dir, 'test-cases.md'), lines.join('\n') + '\n');
});

describe('Fixed supply', function () {
  scenario('T01', 'Mint the supply once to treasury', 'Fresh deployment', 'Deploy 1,000,000 LRT', 'Treasury balance and total supply match', async () => {
    const f = await loadFixture(fixture);
    expect(await f.token.totalSupply()).to.equal(E('1000000'));
    expect(await f.token.balanceOf(f.organizer.address)).to.equal(E('1000000'));
    expect(f.token.interface.hasFunction('mint')).to.equal(false);
    expect(f.token.interface.hasFunction('burn')).to.equal(false);
    expect(await f.token.decimals()).to.equal(18);
  });
  scenario('T02', 'Reject invalid treasury and zero supply', 'Token factory', 'Zero treasury or zero supply', 'Both deployments revert', async () => {
    const F = await ethers.getContractFactory('LearningRewardToken');
    const [s] = await ethers.getSigners();
    await expect(F.deploy(ethers.ZeroAddress, 1)).to.be.revertedWith('Invalid supply or treasury');
    await expect(F.deploy(s.address, 0)).to.be.revertedWith('Invalid supply or treasury');
  });
  scenario('T03', 'Reject token addresses without contract code', 'Vault and exchange factories', 'Deploy with zero or EOA token', 'Deployments revert', async () => {
    const [s] = await ethers.getSigners();
    for (const name of ['TournamentVault', 'LRTExchange']) {
      const F = await ethers.getContractFactory(name);
      await expect(F.deploy(s.address)).to.be.revertedWith('Invalid token');
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWith('Invalid token');
    }
  });
});

describe('Creation and registration', function () {
  scenario('V01', 'Create immutable rules and distinct roles', 'Draft fixture', 'Read tournament 1 and unknown ids', 'Exact rules; unknown ids revert; no rule setter', async () => {
    const f = await loadFixture(fixture); const t = await f.vault.getTournament(1);
    expect(t.organizer).to.equal(f.organizer.address); expect(t.state).to.equal(0);
    expect(t.rules.prize).to.equal(f.rules.prize); expect(t.shares).to.deep.equal([5000n, 3000n, 2000n]);
    expect(f.vault.interface.hasFunction('updateRules')).to.equal(false);
    await expect(f.vault.getTournament(0)).to.be.revertedWith('Unknown tournament');
    await expect(f.vault.getTournament(2)).to.be.revertedWith('Unknown tournament');
  });
  scenario('V02', 'Reject zero and overlapping roles', 'Draft fixture', 'Zero role; organizer/referee/resolver overlap', 'Creation reverts', async () => {
    const f = await loadFixture(fixture);
    for (const pair of [[ethers.ZeroAddress, f.resolver.address], [f.referee.address, ethers.ZeroAddress]])
      await expect(f.vault.createTournament(f.rules, ...pair, f.shares)).to.be.revertedWith('Zero role');
    for (const pair of [[f.referee.address, f.referee.address], [f.organizer.address, f.resolver.address], [f.referee.address, f.organizer.address]])
      await expect(f.vault.createTournament(f.rules, ...pair, f.shares)).to.be.revertedWith('Roles must differ');
  });
  scenario('V03', 'Reject malformed prize shares and capacity', 'Draft fixture', 'Zero prize, empty/33/zero shares, wrong sum, capacity < ranks or >256', 'Creation reverts for every invalid variant', async () => {
    const f = await loadFixture(fixture);
    const make = (r, s) => f.vault.createTournament({ ...f.rules, ...r }, f.referee.address, f.resolver.address, s);
    await expect(make({ prize: 0 }, f.shares)).to.be.revertedWith('Invalid prize');
    await expect(make({}, [])).to.be.revertedWith('Invalid prize');
    await expect(make({}, Array(33).fill(300))).to.be.revertedWith('Invalid prize');
    await expect(make({}, [0, 10000])).to.be.revertedWith('Zero share');
    await expect(make({}, [100, 200])).to.be.revertedWith('Invalid shares');
    for (const maxPlayers of [2, 257]) await expect(make({ maxPlayers }, f.shares)).to.be.revertedWith('Invalid capacity');
  });
  scenario('V04', 'Reject invalid deadlines and objection windows', 'Draft fixture', 'Past deadline; result before close; windows outside 60s..7d', 'All invalid values revert', async () => {
    const f = await loadFixture(fixture);
    const make = r => f.vault.createTournament({ ...f.rules, ...r }, f.referee.address, f.resolver.address, f.shares);
    await expect(make({ registrationDeadline: 1 })).to.be.revertedWith('Invalid deadlines');
    await expect(make({ resultDeadline: f.rules.registrationDeadline })).to.be.revertedWith('Invalid deadlines');
    for (const key of ['disputeWindow', 'resolutionWindow']) for (const value of [59, 604801])
      await expect(make({ [key]: value })).to.be.revertedWith('Invalid windows');
  });
  scenario('V05', 'Require organizer approval and full LRT funding', 'Unfunded draft', 'Unauthorized, unapproved, then approved fundAndOpen', 'Unauthorized/unapproved fail; exact token escrow opens', async () => {
    const f = await loadFixture(fixture);
    await expect(f.vault.connect(f.a).fundAndOpen(1)).to.be.revertedWith('Only organizer');
    await expect(f.vault.fundAndOpen(1)).to.be.reverted;
    expect(await f.vault.tokenLiability()).to.equal(0);
    await f.token.approve(f.vault.target, f.rules.prize);
    await expect(f.vault.fundAndOpen(1)).to.emit(f.vault, 'RegistrationOpened').withArgs(1, f.rules.prize);
    expect(await f.token.balanceOf(f.vault.target)).to.equal(f.rules.prize);
    await expect(f.vault.fundAndOpen(1)).to.be.revertedWith('Wrong state'); await invariant(f);
  });
  scenario('V06', 'Reject opening after registration deadline', 'Approved draft at close', 'fundAndOpen at deadline', 'Registration closed', async () => {
    const f = await loadFixture(fixture); await f.token.approve(f.vault.target, f.rules.prize);
    await time.setNextBlockTimestamp(f.rules.registrationDeadline);
    await expect(f.vault.fundAndOpen(1)).to.be.revertedWith('Registration closed');
  });
  scenario('V07', 'Register exact fee and preserve escrow', 'Open tournament', 'Player pays exact fee', 'Event, roster and ETH liability match', async () => {
    const f = await loadFixture(opened);
    await expect(f.vault.connect(f.a).register(1, { value: f.rules.entryFee })).to.emit(f.vault, 'PlayerRegistered').withArgs(1, f.a.address, f.rules.entryFee);
    expect(await f.vault.registered(1, f.a.address)).to.equal(true);
    expect((await f.vault.getTournament(1)).playerCount).to.equal(1);
    expect(await f.vault.ethLiability()).to.equal(f.rules.entryFee); await invariant(f);
  });
  scenario('V08', 'Reject wrong fees and duplicate registration', 'Open tournament', 'Pay fee +/-1 wei; register twice', 'Wrong fee and Already registered reverts', async () => {
    const f = await loadFixture(opened);
    for (const value of [f.rules.entryFee - 1n, f.rules.entryFee + 1n]) await expect(f.vault.connect(f.a).register(1, { value })).to.be.revertedWith('Wrong fee');
    await f.vault.connect(f.a).register(1, { value: f.rules.entryFee });
    await expect(f.vault.connect(f.a).register(1, { value: f.rules.entryFee })).to.be.revertedWith('Already registered');
  });
  scenario('V09', 'Exclude privileged roles from playing', 'Open tournament', 'Organizer, referee, resolver register', 'Role cannot play', async () => {
    const f = await loadFixture(opened);
    for (const s of [f.organizer, f.referee, f.resolver]) await expect(f.vault.connect(s).register(1, { value: f.rules.entryFee })).to.be.revertedWith('Role cannot play');
  });
  scenario('V10', 'Enforce exact maximum capacity', 'Three players enrolled; max=3', 'Fourth player registers', 'Full; roster remains three', async () => {
    const f = await loadFixture(enrolled);
    await expect(f.vault.connect(f.outsider).register(1, { value: f.rules.entryFee })).to.be.revertedWith('Full');
    expect((await f.vault.getTournament(1)).playerCount).to.equal(3);
  });
  scenario('V11', 'Enforce registration deadline boundary', 'Open tournament', 'Register at close-1 then exactly close', 'First succeeds; second reverts', async () => {
    const f = await loadFixture(opened);
    await time.setNextBlockTimestamp(f.rules.registrationDeadline - 1);
    await f.vault.connect(f.a).register(1, { value: f.rules.entryFee });
    await time.setNextBlockTimestamp(f.rules.registrationDeadline);
    await expect(f.vault.connect(f.b).register(1, { value: f.rules.entryFee })).to.be.revertedWith('Registration closed');
  });
  scenario('V12', 'Lock at close and reject early or repeated locking', 'Enrolled tournament', 'Lock before/at/after close', 'Early and repeat revert; exact close emits Locked', async () => {
    const f = await loadFixture(enrolled);
    await expect(f.vault.lockRegistration(1)).to.be.revertedWith('Too early');
    await time.setNextBlockTimestamp(f.rules.registrationDeadline);
    await expect(f.vault.connect(f.outsider).lockRegistration(1)).to.emit(f.vault, 'RegistrationLocked').withArgs(1, 3);
    await expect(f.vault.lockRegistration(1)).to.be.revertedWith('Wrong state');
    await expect(f.vault.connect(f.outsider).register(1, { value: f.rules.entryFee })).to.be.revertedWith('Wrong state');
  });
  scenario('V13', 'Cancel automatically when too few players register', 'Open with one player and three prize ranks', 'Lock after close', 'Cancelled with recoverable prize and fee', async () => {
    const f = await loadFixture(opened); await f.vault.connect(f.a).register(1, { value: f.rules.entryFee });
    await time.increaseTo(f.rules.registrationDeadline); await expect(f.vault.lockRegistration(1)).to.emit(f.vault, 'Cancelled');
    await f.vault.connect(f.a).claimRefund(1); await f.vault.refundOrganizer(1, f.organizer.address); await invariant(f);
  });
  scenario('V14', 'Permit a zero entry fee', 'New free tournament', 'Open and register with zero ETH', 'Registration succeeds without ETH liability', async () => {
    const f = await loadFixture(fixture);
    await f.vault.createTournament({ ...f.rules, entryFee: 0 }, f.referee.address, f.resolver.address, f.shares);
    await f.token.approve(f.vault.target, f.rules.prize); await f.vault.fundAndOpen(2);
    await f.vault.connect(f.a).register(2); expect(await f.vault.ethLiability()).to.equal(0);
  });
});

describe('Results and disputes', function () {
  scenario('R01', 'Only referee can submit one ranked result', 'Locked tournament', 'Unauthorized then referee then repeat submission', 'Only valid submission succeeds and emits evidence', async () => {
    const f = await loadFixture(locked); const w = [f.a.address, f.b.address, f.c.address];
    await expect(f.vault.connect(f.a).submitResult(1, w, HASH)).to.be.revertedWith('Only referee');
    await expect(f.vault.connect(f.referee).submitResult(1, w, HASH)).to.emit(f.vault, 'ResultSubmitted');
    expect((await f.vault.getTournament(1)).evidenceHash).to.equal(HASH);
    await expect(f.vault.connect(f.referee).submitResult(1, w, HASH)).to.be.revertedWith('Wrong state');
  });
  scenario('R02', 'Reject invalid ranking and empty evidence', 'Locked tournament', 'Empty, duplicate, outsider rankings; zero hash', 'Each invalid result reverts', async () => {
    const f = await loadFixture(locked); const v = f.vault.connect(f.referee);
    await expect(v.submitResult(1, [], HASH)).to.be.revertedWith('Wrong winner count');
    await expect(v.submitResult(1, [f.a.address, f.a.address, f.b.address], HASH)).to.be.revertedWith('Duplicate winner');
    await expect(v.submitResult(1, [f.a.address, f.b.address, f.outsider.address], HASH)).to.be.revertedWith('Winner not registered');
    await expect(v.submitResult(1, [f.a.address, f.b.address, f.c.address], ethers.ZeroHash)).to.be.revertedWith('Empty evidence');
  });
  scenario('R03', 'Reject result at its exact deadline', 'Locked tournament', 'Submit at resultDeadline', 'Result expired', async () => {
    const f = await loadFixture(locked); await time.setNextBlockTimestamp(f.rules.resultDeadline);
    await expect(f.vault.connect(f.referee).submitResult(1, [f.a.address, f.b.address, f.c.address], HASH)).to.be.revertedWith('Result expired');
  });
  scenario('R04', 'Do not submit or claim prizes before the proper state', 'Open tournament', 'Submit, finalize, prize/refund withdrawal before settlement', 'All calls revert', async () => {
    const f = await loadFixture(opened);
    await expect(f.vault.connect(f.referee).submitResult(1, [], HASH)).to.be.revertedWith('Wrong state');
    await expect(f.vault.finalizeResult(1)).to.be.revertedWith('Wrong state');
    await expect(f.vault.connect(f.a).withdrawPrize(1, f.a.address)).to.be.revertedWith('No credit');
    await expect(f.vault.connect(f.a).claimRefund(1)).to.be.revertedWith('Wrong state');
  });
  scenario('R05', 'Finalize only when objection window closes', 'Pending result', 'Finalize before then at disputeDeadline', 'Too early then Finalized', async () => {
    const f = await loadFixture(pending); await expect(f.vault.finalizeResult(1)).to.be.revertedWith('Too early');
    await time.setNextBlockTimestamp((await f.vault.getTournament(1)).disputeDeadline);
    await expect(f.vault.connect(f.outsider).finalizeResult(1)).to.emit(f.vault, 'Finalized');
  });
  scenario('R06', 'Only registered players can raise a nonempty objection', 'Pending result', 'Outsider dispute; zero reason; valid dispute; repeat', 'Invalid calls revert; valid objection opens dispute once', async () => {
    const f = await loadFixture(pending);
    await expect(f.vault.connect(f.outsider).raiseDispute(1, HASH)).to.be.revertedWith('Not registered');
    await expect(f.vault.connect(f.a).raiseDispute(1, ethers.ZeroHash)).to.be.revertedWith('Empty evidence');
    await expect(f.vault.connect(f.a).raiseDispute(1, HASH)).to.emit(f.vault, 'DisputeRaised');
    await expect(f.vault.connect(f.b).raiseDispute(1, HASH)).to.be.revertedWith('Wrong state');
  });
  scenario('R07', 'Reject objection exactly at the closing timestamp', 'Pending result', 'Dispute at disputeDeadline', 'Dispute closed', async () => {
    const f = await loadFixture(pending); await time.setNextBlockTimestamp((await f.vault.getTournament(1)).disputeDeadline);
    await expect(f.vault.connect(f.a).raiseDispute(1, HASH)).to.be.revertedWith('Dispute closed');
  });
  scenario('R08', 'Block ordinary finalization while a dispute is unresolved', 'Disputed result', 'Wait past objection window and finalize', 'Wrong state; no credits', async () => {
    const f = await loadFixture(disputed); await time.increaseTo((await f.vault.getTournament(1)).disputeDeadline);
    await expect(f.vault.finalizeResult(1)).to.be.revertedWith('Wrong state');
    expect(await f.vault.prizeCredits(1, f.a.address)).to.equal(0);
    expect(await f.vault.ethCredits(f.organizer.address)).to.equal(0);
  });
  scenario('R09', 'Resolver replaces ranking and settles once', 'Disputed result', 'Wrong caller, valid replacement, duplicate resolution', 'Only resolver succeeds; replacement earns first prize', async () => {
    const f = await loadFixture(disputed); const w = [f.c.address, f.b.address, f.a.address];
    await expect(f.vault.connect(f.referee).resolveDispute(1, w, HASH)).to.be.revertedWith('Only resolver');
    await expect(f.vault.connect(f.resolver).resolveDispute(1, w, HASH)).to.emit(f.vault, 'DisputeResolved');
    expect(await f.vault.prizeCredits(1, f.c.address)).to.equal(E('500'));
    await expect(f.vault.connect(f.resolver).resolveDispute(1, w, HASH)).to.be.revertedWith('Wrong state'); await invariant(f);
  });
  scenario('R10', 'Resolver can confirm the original ranking', 'Disputed result', 'Resolve with original winners', 'Original first-place credit preserved', async () => {
    const f = await loadFixture(disputed);
    await f.vault.connect(f.resolver).resolveDispute(1, [f.a.address, f.b.address, f.c.address], HASH);
    expect(await f.vault.prizeCredits(1, f.a.address)).to.equal(E('500'));
  });
  scenario('R11', 'Expired resolver cannot race timeout cancellation', 'Disputed result', 'Resolve then cancel at resolutionDeadline', 'Resolution expired; anyone cancels', async () => {
    const f = await loadFixture(disputed); await time.setNextBlockTimestamp((await f.vault.getTournament(1)).resolutionDeadline);
    await expect(f.vault.connect(f.resolver).resolveDispute(1, [f.a.address, f.b.address, f.c.address], HASH)).to.be.revertedWith('Resolution expired');
    await expect(f.vault.connect(f.outsider).cancelExpired(1)).to.emit(f.vault, 'Cancelled');
  });
});

describe('Settlement, refunds and accounting', function () {
  scenario('F01', 'Allocate token prizes and organizer fees separately', 'Finalized tournament', 'Inspect 50/30/20 credits and withdraw all', '1000 LRT paid to winners; three ETH fees to organizer; liabilities zero', async () => {
    const f = await loadFixture(finalized);
    for (const [s, amount] of [[f.a, '500'], [f.b, '300'], [f.c, '200']]) {
      expect(await f.vault.prizeCredits(1, s.address)).to.equal(E(amount));
      await expect(f.vault.connect(s).withdrawPrize(1, s.address)).to.changeTokenBalance(f.token, s, E(amount)); await invariant(f);
    }
    expect(await f.vault.ethCredits(f.organizer.address)).to.equal(3n * f.rules.entryFee);
    await expect(f.vault.withdrawETH(f.organizer.address)).to.changeEtherBalance(f.organizer, 3n * f.rules.entryFee);
    expect(await f.vault.ethLiability()).to.equal(0); expect(await f.vault.tokenLiability()).to.equal(0);
  });
  scenario('F02', 'Reject repeated prize and fee withdrawals', 'Finalized tournament', 'Withdraw prize/ETH twice and finalize twice', 'Second claims and finalization revert', async () => {
    const f = await loadFixture(finalized);
    await f.vault.connect(f.a).withdrawPrize(1, f.a.address);
    await expect(f.vault.connect(f.a).withdrawPrize(1, f.a.address)).to.be.revertedWith('No credit');
    await f.vault.withdrawETH(f.organizer.address);
    await expect(f.vault.withdrawETH(f.organizer.address)).to.be.revertedWith('No credit');
    await expect(f.vault.finalizeResult(1)).to.be.revertedWith('Wrong state');
  });
  scenario('F03', 'Reject zero recipients and unauthorized claims', 'Finalized tournament', 'Zero recipient; outsider prize or fee claim', 'No credits change', async () => {
    const f = await loadFixture(finalized);
    await expect(f.vault.connect(f.a).withdrawPrize(1, ethers.ZeroAddress)).to.be.revertedWith('Zero recipient');
    await expect(f.vault.withdrawETH(ethers.ZeroAddress)).to.be.revertedWith('Zero recipient');
    await expect(f.vault.connect(f.outsider).withdrawPrize(1, f.outsider.address)).to.be.revertedWith('No credit');
    await expect(f.vault.connect(f.outsider).withdrawETH(f.outsider.address)).to.be.revertedWith('No credit'); await invariant(f);
  });
  scenario('F04', 'Cancel and recover exact player fees and organizer tokens', 'Three enrolled players', 'Cancel; claim and withdraw refunds; return prize', 'Original deposits restored; no winner credits; zero liabilities', async () => {
    const f = await loadFixture(enrolled); await f.vault.cancelTournament(1);
    for (const s of [f.a, f.b, f.c]) {
      await f.vault.connect(s).claimRefund(1);
      await expect(f.vault.connect(s).withdrawETH(s.address)).to.changeEtherBalance(s, f.rules.entryFee);
      expect(await f.vault.prizeCredits(1, s.address)).to.equal(0); await invariant(f);
    }
    await expect(f.vault.refundOrganizer(1, f.organizer.address)).to.changeTokenBalance(f.token, f.organizer, f.rules.prize);
    expect(await f.vault.ethCredits(f.organizer.address)).to.equal(0);
    expect(await f.vault.ethLiability()).to.equal(0); expect(await f.vault.tokenLiability()).to.equal(0);
  });
  scenario('F05', 'Reject duplicate or unauthorized cancellation refunds', 'Cancelled enrolled tournament', 'Double refunds; outsider/zero recipients; repeat cancellation', 'All invalid claims revert', async () => {
    const f = await loadFixture(enrolled); await f.vault.cancelTournament(1);
    await f.vault.connect(f.a).claimRefund(1);
    await expect(f.vault.connect(f.a).claimRefund(1)).to.be.revertedWith('No refund');
    await expect(f.vault.connect(f.outsider).claimRefund(1)).to.be.revertedWith('No refund');
    await expect(f.vault.connect(f.a).refundOrganizer(1, f.a.address)).to.be.revertedWith('Only organizer');
    await expect(f.vault.refundOrganizer(1, ethers.ZeroAddress)).to.be.revertedWith('Zero recipient');
    await f.vault.refundOrganizer(1, f.organizer.address);
    await expect(f.vault.refundOrganizer(1, f.organizer.address)).to.be.revertedWith('No refund');
    await expect(f.vault.cancelTournament(1)).to.be.revertedWith('Terminal state');
  });
  scenario('F06', 'Permit organizer cancellation in every nonterminal state', 'Draft/open/locked/pending/disputed fixtures', 'Organizer cancels; outsider attempts', 'Only organizer cancels; funded prize recoverable', async () => {
    for (const setup of [fixture, opened, locked, pending, disputed]) {
      const f = await loadFixture(setup);
      await expect(f.vault.connect(f.outsider).cancelTournament(1)).to.be.revertedWith('Only organizer');
      await f.vault.cancelTournament(1); expect((await f.vault.getTournament(1)).state).to.equal(6);
      if (setup !== fixture) await f.vault.refundOrganizer(1, f.organizer.address);
      else await expect(f.vault.refundOrganizer(1, f.organizer.address)).to.be.revertedWith('No refund');
      await invariant(f);
    }
  });
  scenario('F07', 'Reject cancellation or timeout after finalization', 'Finalized tournament', 'cancelTournament and cancelExpired', 'Terminal state and Not expired', async () => {
    const f = await loadFixture(finalized);
    await expect(f.vault.cancelTournament(1)).to.be.revertedWith('Terminal state');
    await expect(f.vault.cancelExpired(1)).to.be.revertedWith('Not expired');
  });
  scenario('F08', 'Recover abandoned drafts and result submissions', 'Draft/open/locked fixtures', 'Cancel too early then at relevant deadline', 'Early call rejected; timeout emits cancellation', async () => {
    for (const setup of [fixture, opened, locked]) {
      const f = await loadFixture(setup);
      await expect(f.vault.cancelExpired(1)).to.be.revertedWith('Not expired');
      await time.increaseTo(setup === fixture ? f.rules.registrationDeadline : f.rules.resultDeadline);
      await expect(f.vault.connect(f.outsider).cancelExpired(1)).to.emit(f.vault, 'Cancelled'); await invariant(f);
    }
  });
  scenario('F09', 'Assign rounding remainder to final rank', 'Prize=10001 base units; shares 50/30/20', 'Fund, enroll, submit and settle', 'Credits 5000+3000+2001 exactly equal escrow', async () => {
    const f = await loadFixture(fixture);
    await f.vault.createTournament({ ...f.rules, prize: 10001 }, f.referee.address, f.resolver.address, f.shares);
    await f.token.approve(f.vault.target, 10001); await f.vault.fundAndOpen(2);
    for (const s of [f.a, f.b, f.c]) await f.vault.connect(s).register(2, { value: f.rules.entryFee });
    await time.increaseTo(f.rules.registrationDeadline); await f.vault.lockRegistration(2);
    await f.vault.connect(f.referee).submitResult(2, [f.a.address, f.b.address, f.c.address], HASH);
    await time.increaseTo((await f.vault.getTournament(2)).disputeDeadline); await f.vault.finalizeResult(2);
    for (const [s, amount] of [[f.a, 5000], [f.b, 3000], [f.c, 2001]]) expect(await f.vault.prizeCredits(2, s.address)).to.equal(amount);
    await invariant(f);
  });
  scenario('F10', 'Isolate liabilities across multiple tournaments', 'Two funded tournaments share players', 'Cancel one, settle other, withdraw both', 'Refunds and prizes remain distinct; all liabilities clear', async () => {
    const f = await loadFixture(enrolled);
    await f.vault.createTournament(f.rules, f.referee.address, f.resolver.address, f.shares);
    await f.token.approve(f.vault.target, f.rules.prize); await f.vault.fundAndOpen(2);
    for (const s of [f.a, f.b, f.c]) await f.vault.connect(s).register(2, { value: f.rules.entryFee });
    expect(await f.vault.tokenLiability()).to.equal(2n * f.rules.prize); await invariant(f);
    await f.vault.cancelTournament(1); await f.vault.refundOrganizer(1, f.organizer.address);
    await time.increaseTo(f.rules.registrationDeadline); await f.vault.lockRegistration(2);
    await f.vault.connect(f.referee).submitResult(2, [f.a.address, f.b.address, f.c.address], HASH);
    await time.increaseTo((await f.vault.getTournament(2)).disputeDeadline); await f.vault.finalizeResult(2);
    for (const s of [f.a, f.b, f.c]) {
      await f.vault.connect(s).claimRefund(1); await f.vault.connect(s).withdrawETH(s.address);
      await f.vault.connect(s).withdrawPrize(2, s.address); await invariant(f);
    }
    await f.vault.withdrawETH(f.organizer.address);
    expect(await f.vault.ethLiability()).to.equal(0); expect(await f.vault.tokenLiability()).to.equal(0);
  });
  scenario('F11', 'Rejected ETH delivery restores credit and allows another recipient', 'Organizer ETH credit; receiver rejects', 'Withdraw to rejecting contract then EOA', 'Failure rolls back; alternate withdrawal succeeds', async () => {
    const f = await loadFixture(finalized); await f.receiver.configure(ethers.ZeroAddress, '0x', true);
    await expect(f.vault.withdrawETH(f.receiver.target)).to.be.revertedWith('ETH transfer failed');
    expect(await f.vault.ethCredits(f.organizer.address)).to.equal(3n * f.rules.entryFee); await invariant(f);
    await f.vault.withdrawETH(f.organizer.address);
  });
  scenario('F12', 'Block a refund receiver reentering its ETH withdrawal', 'Contract player in cancelled tournament', 'Refund to receiver with recursive withdrawal payload', 'One payment; recursive call fails; liability zero', async () => {
    const f = await loadFixture(opened);
    await f.receiver.execute(f.vault.target, f.vault.interface.encodeFunctionData('register', [1]), { value: f.rules.entryFee });
    await f.vault.cancelTournament(1);
    await f.receiver.execute(f.vault.target, f.vault.interface.encodeFunctionData('claimRefund', [1]));
    const data = f.vault.interface.encodeFunctionData('withdrawETH', [f.receiver.target]);
    await f.receiver.configure(f.vault.target, data, false);
    await f.receiver.execute(f.vault.target, data);
    expect(await f.receiver.attempted()).to.equal(true); expect(await f.receiver.reentered()).to.equal(false);
    expect(await ethers.provider.getBalance(f.receiver.target)).to.equal(f.rules.entryFee);
    expect(await f.vault.ethLiability()).to.equal(0); await invariant(f);
  });
  scenario('F13', 'Settle the maximum 32-rank result within the gas limit', '32 funded and registered distinct players', 'Submit 32 unique ranked winners; settle and withdraw all', 'Submission and settlement each under 8M gas; exact prize conservation', async () => {
    const f = await loadFixture(fixture);
    const shares = [...Array(31).fill(300), 700];
    await f.vault.createTournament({ ...f.rules, maxPlayers: 32 }, f.referee.address, f.resolver.address, shares);
    await f.token.approve(f.vault.target, f.rules.prize); await f.vault.fundAndOpen(2);
    const players = [];
    for (let i = 0; i < 32; i++) {
      const address = ethers.getAddress(ethers.toBeHex(1000 + i, 20));
      await ethers.provider.send('hardhat_setBalance', [address, ethers.toBeHex(E('1'))]);
      const player = await ethers.getImpersonatedSigner(address); players.push(player);
      await f.vault.connect(player).register(2, { value: f.rules.entryFee });
    }
    await time.increaseTo(f.rules.registrationDeadline); await f.vault.lockRegistration(2);
    const submission = await (await f.vault.connect(f.referee).submitResult(2, players.map(s => s.address), HASH)).wait();
    await time.increaseTo((await f.vault.getTournament(2)).disputeDeadline);
    const settlement = await (await f.vault.finalizeResult(2)).wait();
    expect(submission.gasUsed).to.be.lessThan(8000000); expect(settlement.gasUsed).to.be.lessThan(8000000);
    let sum = 0n;
    for (const player of players) {
      sum += await f.vault.prizeCredits(2, player.address);
      await f.vault.connect(player).withdrawPrize(2, player.address);
    }
    expect(sum).to.equal(f.rules.prize); expect(await f.vault.tokenLiability()).to.equal(0); await invariant(f);
    fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });
    if (!process.argv.includes('coverage')) fs.writeFileSync(path.join(__dirname, '..', 'evidence', 'maximum-rank-gas.json'), JSON.stringify({
      compiler: require('solc').version(), ranks: 32, submissionGas: submission.gasUsed.toString(), settlementGas: settlement.gasUsed.toString(),
      coverageInstrumented: false
    }, null, 2));
  });
  scenario('F14', 'Preserve liabilities when balances include unsolicited surplus', 'Finalized prize and fee credits', 'Simulate forced ETH and donate LRT, then withdraw all obligations', 'Liabilities reach zero; surplus remains; balance >= liability', async () => {
    const f = await loadFixture(finalized);
    const before = await ethers.provider.getBalance(f.vault.target);
    await ethers.provider.send('hardhat_setBalance', [f.vault.target, ethers.toBeHex(before + 123n)]);
    await f.token.transfer(f.vault.target, 456);
    await invariant(f);
    for (const player of [f.a, f.b, f.c]) await f.vault.connect(player).withdrawPrize(1, player.address);
    await f.vault.withdrawETH(f.organizer.address);
    expect(await f.vault.ethLiability()).to.equal(0); expect(await f.vault.tokenLiability()).to.equal(0);
    expect(await ethers.provider.getBalance(f.vault.target)).to.equal(123);
    expect(await f.token.balanceOf(f.vault.target)).to.equal(456); await invariant(f);
  });
});

describe('Fixed-rate exchange', function () {
  scenario('X01', 'Quote the chosen rate exactly', 'Exchange deployment', 'Quote 1 and 1000 LRT', '1e9 and 1e12 wei', async () => {
    const f = await loadFixture(fixture); expect(await f.exchange.quote(E('1'))).to.equal(1000000000n);
    expect(await f.exchange.quote(E('1000'))).to.equal(1000000000000n);
  });
  scenario('X02', 'Reject zero and unrepresentable redemption amounts', 'Exchange deployment', 'Quote or redeem zero, 1 base unit, 1e9+1 units', 'Invalid precision', async () => {
    const f = await loadFixture(fixture);
    for (const amount of [0n, 1n, 1000000001n]) {
      await expect(f.exchange.quote(amount)).to.be.revertedWith('Invalid precision');
      await expect(f.exchange.redeem(amount)).to.be.revertedWith('Invalid precision');
    }
  });
  scenario('X03', 'Sell inventory for ETH at the fixed price', 'Funded exchange with inventory', 'Buy 50 LRT for 5e10 wei', 'Buyer gains 50 LRT and reserve increases by price', async () => {
    const f = await loadFixture(collateralized); const before = await f.exchange.availableReserve();
    await expect(f.exchange.connect(f.b).buy({ value: 50000000000n })).to.emit(f.exchange, 'Purchased').withArgs(f.b.address, 50000000000n, E('50'));
    expect(await f.token.balanceOf(f.b.address)).to.equal(E('50'));
    expect(await f.exchange.availableReserve()).to.equal(before + 50000000000n); await invariant(f);
  });
  scenario('X04', 'Reject empty buys and inventory overdraw', 'Empty exchange', 'Buy with zero or 1 wei', 'Zero payment or Insufficient inventory', async () => {
    const f = await loadFixture(fixture);
    await expect(f.exchange.buy()).to.be.revertedWith('Zero payment');
    await expect(f.exchange.buy({ value: 1 })).to.be.revertedWith('Insufficient inventory');
  });
  scenario('X05', 'Redeem LRT without burning and withdraw exact ETH', 'Funded exchange; approved holder', 'Redeem 1000 LRT then withdraw', 'Supply constant; inventory grows; credit paid exactly', async () => {
    const f = await loadFixture(collateralized); const supply = await f.token.totalSupply();
    const inventory = await f.token.balanceOf(f.exchange.target);
    await expect(f.exchange.connect(f.a).redeem(E('1000'))).to.emit(f.exchange, 'Redeemed').withArgs(f.a.address, E('1000'), 1000000000000n);
    expect(await f.token.totalSupply()).to.equal(supply);
    expect(await f.token.balanceOf(f.exchange.target)).to.equal(inventory + E('1000'));
    expect(await f.exchange.ethCredits(f.a.address)).to.equal(1000000000000n); await invariant(f);
    await expect(f.exchange.connect(f.a).withdrawETH(f.a.address)).to.changeEtherBalance(f.a, 1000000000000n);
    expect(await f.exchange.totalCredits()).to.equal(0);
  });
  scenario('X06', 'Reject insufficient ETH backing', 'Token holder; no exchange reserve', 'Redeem one LRT', 'Insufficient reserve; tokens unchanged', async () => {
    const f = await loadFixture(fixture); await f.token.approve(f.exchange.target, E('1'));
    await expect(f.exchange.redeem(E('1'))).to.be.revertedWith('Insufficient reserve');
    expect(await f.exchange.totalCredits()).to.equal(0);
  });
  scenario('X07', 'Rollback reserved credit when token transfer fails', 'Funded exchange; unapproved or tokenless holder', 'Redeem without allowance or without balance', 'Reverts; credit and reserve unchanged', async () => {
    const f = await loadFixture(collateralized); const reserve = await f.exchange.availableReserve();
    await expect(f.exchange.connect(f.b).redeem(E('1'))).to.be.reverted;
    await f.token.connect(f.b).approve(f.exchange.target, E('1'));
    await expect(f.exchange.connect(f.b).redeem(E('1'))).to.be.reverted;
    expect(await f.exchange.totalCredits()).to.equal(0); expect(await f.exchange.availableReserve()).to.equal(reserve);
  });
  scenario('X08', 'Do not reuse ETH already promised to another seller', 'Reserve equals first redemption', 'First holder reserves all ETH; second tries redeem', 'Second rejected; first credit remains payable', async () => {
    const f = await loadFixture(fixture); await f.organizer.sendTransaction({ to: f.exchange.target, value: 1000000000n });
    await f.token.approve(f.exchange.target, E('2')); await f.exchange.redeem(E('1'));
    expect(await f.exchange.availableReserve()).to.equal(0);
    await expect(f.exchange.redeem(E('1'))).to.be.revertedWith('Insufficient reserve');
    await f.exchange.withdrawETH(f.organizer.address); expect(await f.exchange.totalCredits()).to.equal(0); await invariant(f);
  });
  scenario('X09', 'Reject duplicate withdrawals and zero recipients', 'Holder has redemption credit', 'Withdraw to zero; withdraw twice', 'Zero recipient and No credit', async () => {
    const f = await loadFixture(collateralized); await f.exchange.connect(f.a).redeem(E('1'));
    await expect(f.exchange.connect(f.a).withdrawETH(ethers.ZeroAddress)).to.be.revertedWith('Zero recipient');
    await f.exchange.connect(f.a).withdrawETH(f.a.address);
    await expect(f.exchange.connect(f.a).withdrawETH(f.a.address)).to.be.revertedWith('No credit');
  });
  scenario('X10', 'Restore redemption credit after rejected ETH payment', 'Holder credit; rejecting receiver', 'Withdraw to receiver then EOA', 'Credit survives failure; EOA withdrawal succeeds', async () => {
    const f = await loadFixture(collateralized); await f.exchange.connect(f.a).redeem(E('1'));
    await f.receiver.configure(ethers.ZeroAddress, '0x', true);
    await expect(f.exchange.connect(f.a).withdrawETH(f.receiver.target)).to.be.revertedWith('ETH transfer failed');
    expect(await f.exchange.ethCredits(f.a.address)).to.equal(1000000000n);
    await f.exchange.connect(f.a).withdrawETH(f.a.address); await invariant(f);
  });
  scenario('X11', 'Block reentrant exchange withdrawal', 'Contract holder with redeemed LRT', 'Withdraw with recursive payload', 'Only one payout; nested call fails', async () => {
    const f = await loadFixture(collateralized); await f.token.transfer(f.receiver.target, E('1'));
    await f.receiver.execute(f.token.target, f.token.interface.encodeFunctionData('approve', [f.exchange.target, E('1')]));
    await f.receiver.execute(f.exchange.target, f.exchange.interface.encodeFunctionData('redeem', [E('1')]));
    const data = f.exchange.interface.encodeFunctionData('withdrawETH', [f.receiver.target]);
    await f.receiver.configure(f.exchange.target, data, false); await f.receiver.execute(f.exchange.target, data);
    expect(await f.receiver.attempted()).to.equal(true); expect(await f.receiver.reentered()).to.equal(false);
    expect(await ethers.provider.getBalance(f.receiver.target)).to.equal(1000000000n); await invariant(f);
  });
  scenario('X12', 'Support buy and redeem round trips without value creation', 'Funded inventory', 'Buy then redeem 123456789 wei equivalent', 'Balances and supply return to original values', async () => {
    const f = await loadFixture(collateralized); const reserve = await ethers.provider.getBalance(f.exchange.target);
    const inventory = await f.token.balanceOf(f.exchange.target); const wei = 123456789n;
    await f.exchange.connect(f.b).buy({ value: wei }); await f.token.connect(f.b).approve(f.exchange.target, wei * 1000000000n);
    await f.exchange.connect(f.b).redeem(wei * 1000000000n); await f.exchange.connect(f.b).withdrawETH(f.b.address);
    expect(await ethers.provider.getBalance(f.exchange.target)).to.equal(reserve);
    expect(await f.token.balanceOf(f.exchange.target)).to.equal(inventory);
    expect(await f.token.balanceOf(f.b.address)).to.equal(0); await invariant(f);
  });
});

describe('Local interface server', function () {
  const { handler } = require('../scripts/serve');
  function request(url, method = 'GET') {
    return new Promise((resolve, reject) => {
      const response = { status: 0, headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers || {}; },
        end(body) { resolve({ status: this.status, headers: this.headers, body: String(body) }); } };
      try { handler({ url, method }, response); } catch (error) { reject(error); }
    });
  }
  scenario('W01', 'Serve the interface and bundled script', 'Local handler; no wallet', 'GET /, /app.js, /style.css, /ethers.js', 'Only intended static resources returned with a restrictive content policy', async () => {
    for (const url of ['/', '/app.js', '/style.css', '/ethers.js']) {
      const response = await request(url); expect(response.status).to.equal(200);
      expect(response.headers['Content-Security-Policy']).to.include("object-src 'none'");
      expect(response.body.length).to.be.greaterThan(100);
    }
  });
  scenario('W02', 'Reject requests for private configuration and project files', 'Local handler', 'GET .env, source files and traversal paths', '404 without exposing local bytes', async () => {
    for (const url of ['/.env', '/package.json', '/contracts/TournamentVault.sol', '/../.env', '/%2e%2e/.env', '/..%2f.env', '/node_modules/ethers/package.json']) {
      const response = await request(url); expect(response.status).to.equal(404); expect(response.body).to.equal('Not found');
    }
  });
  scenario('W03', 'Reject mutation methods on the static server', 'Local handler', 'POST /', '404 and no file write', async () => {
    const response = await request('/', 'POST'); expect(response.status).to.equal(404);
  });
});
