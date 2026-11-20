const { ethers, network } = require('hardhat');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const stateFile = path.join(root, 'evidence', 'sepolia-demo.json');
const privateDirectory = path.join(root, '.local');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let state;
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

async function main() {
  if (network.name !== 'sepolia' || (await ethers.provider.getNetwork()).chainId !== 11155111n)
    throw new Error('This demonstration requires Sepolia');
  const deployment = JSON.parse(fs.readFileSync(path.join(root, 'deployment/sepolia.json'), 'utf8'));
  if (deployment.contracts.length !== 3 || deployment.contracts.some(c => c.verification !== 'Verified'))
    throw new Error('Verify all three deployed contracts first');
  const [organizer] = await ethers.getSigners();
  const contracts = {};
  for (const record of deployment.contracts) {
    const factory = await ethers.getContractFactory(record.name);
    if (ethers.keccak256(factory.bytecode) !== record.creationBytecodeHash) throw new Error('Deployment bytecode differs');
    contracts[record.name] = factory.attach(record.address).connect(organizer);
  }
  const { LearningRewardToken: token, TournamentVault: vault, LRTExchange: exchange } = contracts;
  state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {
    network: 'sepolia', chainId: 11155111, startedAt: new Date().toISOString(),
    contracts: Object.fromEntries(deployment.contracts.map(c => [c.name, c.address])), transactions: [], checks: {}
  };
  if (state.contracts.TournamentVault !== vault.target) throw new Error('Existing demonstration belongs to another vault');
  if (state.completedAt) { console.log('Sepolia demonstration already completed. Evidence: evidence/sepolia-demo.json'); return; }
  const keyFile = path.join(privateDirectory, 'demo-wallets.json');
  let credentials;
  if (fs.existsSync(keyFile)) credentials = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  else {
    credentials = Object.fromEntries(['referee', 'resolver', 'playerA', 'playerB'].map(name => [name, ethers.Wallet.createRandom().privateKey]));
    save(keyFile, credentials);
  }
  const wallets = Object.fromEntries(Object.entries(credentials).map(([name, key]) => [name, new ethers.Wallet(key, ethers.provider)]));
  const signers = Object.fromEntries(Object.entries(wallets).map(([name, wallet]) => [name, new ethers.NonceManager(wallet)]));
  state.roles = { organizer: organizer.address, ...Object.fromEntries(Object.entries(wallets).map(([name, wallet]) => [name, wallet.address])) };
  if (!state.initial) {
    if (await vault.ethLiability() !== 0n || await vault.tokenLiability() !== 0n) throw new Error('Existing escrow liabilities need separate review before this isolated demonstration');
    state.initial = { organizerBalanceWei: (await ethers.provider.getBalance(organizer.address)).toString(), totalSupply: (await token.totalSupply()).toString() };
  }
  save(stateFile, state);
  async function step(label, send) {
    state.lastStep = label; save(stateFile, state);
    let item = state.transactions.find(t => t.label === label);
    if (!item) {
      const spent = BigInt(state.initial.organizerBalanceWei) - await ethers.provider.getBalance(organizer.address);
      if (spent > ethers.parseEther('0.05')) throw new Error('Demonstration spending checkpoint exceeded');
      console.log(`${label}: submitting`);
      const transaction = await send();
      item = { label, transactionHash: transaction.hash, status: 'Submitted', submittedAt: new Date().toISOString() };
      state.transactions.push(item); save(stateFile, state);
    }
    let receipt = await ethers.provider.getTransactionReceipt(item.transactionHash);
    if (!receipt) {
      const transaction = await ethers.provider.getTransaction(item.transactionHash);
      if (!transaction) throw new Error('Recorded transaction unavailable; preserve the record before retrying');
      receipt = await transaction.wait(1, 180000);
    }
    if (!receipt || receipt.status !== 1) throw new Error('A demonstration transaction reverted');
    Object.assign(item, { status: 'Confirmed', blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
      gasPriceWei: receipt.gasPrice.toString(), explorer: `https://sepolia.etherscan.io/tx/${receipt.hash}` });
    save(stateFile, state);
    console.log(`${label}: confirmed ${receipt.hash}`);
    return receipt;
  }
  const E = ethers.parseEther;
  for (const [name, wallet] of Object.entries(wallets)) {
    await step(`Fund test role ${name}`, async () => {
      const balance = await ethers.provider.getBalance(wallet.address);
      const amount = E('0.004') > balance ? E('0.004') - balance : 0n;
      return organizer.sendTransaction({ to: wallet.address, value: amount });
    });
  }
  const prize = E('1000'), fee = E('0.00001');
  await step('Approve two tournament prizes', () => token.approve(vault.target, prize * 2n));
  if (!state.tournamentId) {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const rules = { entryFee: fee, prize, maxPlayers: 2, registrationDeadline: now + 180,
      resultDeadline: now + 86400, disputeWindow: 600, resolutionWindow: 3600 };
    const receipt = await step('Create reviewed tournament', () => vault.createTournament(rules, wallets.referee.address, wallets.resolver.address, [6000, 4000]));
    for (const log of receipt.logs) {
      try { const parsed = vault.interface.parseLog(log); if (parsed?.name === 'TournamentCreated') state.tournamentId = parsed.args.id.toString(); } catch {}
    }
    if (!state.tournamentId) throw new Error('Tournament id missing from event');
    save(stateFile, state);
  }
  const id = BigInt(state.tournamentId);
  await step('Fund prize and open registration', () => vault.fundAndOpen(id));
  await step('Register player A', () => vault.connect(signers.playerA).register(id, { value: fee }));
  await step('Register player B', () => vault.connect(signers.playerB).register(id, { value: fee }));
  const tournament = await vault.getTournament(id);
  let previousRemaining = Infinity;
  while ((await ethers.provider.getBlock('latest')).timestamp < Number(tournament.rules.registrationDeadline)) {
    const remaining = Number(tournament.rules.registrationDeadline) - (await ethers.provider.getBlock('latest')).timestamp;
    if (previousRemaining - remaining >= 20) { console.log(`Waiting for the fixed registration deadline: about ${remaining} seconds`); previousRemaining = remaining; }
    await sleep(5000);
  }
  await step('Lock registration', () => vault.lockRegistration(id));
  await step('Referee submits result', () => vault.connect(signers.referee).submitResult(id, [wallets.playerA.address, wallets.playerB.address], ethers.id('Sepolia match evidence original')));
  await step('Player B opens a dispute', () => vault.connect(signers.playerB).raiseDispute(id, ethers.id('Sepolia match evidence objection')));
  await step('Resolver replaces ranking and settles', () => vault.connect(signers.resolver).resolveDispute(id, [wallets.playerB.address, wallets.playerA.address], ethers.id('Sepolia reviewed match evidence')));
  await step('Player A withdraws 400 LRT', () => vault.connect(signers.playerA).withdrawPrize(id, wallets.playerA.address));
  await step('Player B withdraws 600 LRT', () => vault.connect(signers.playerB).withdrawPrize(id, wallets.playerB.address));
  await step('Organizer withdraws entry fees', () => vault.withdrawETH(organizer.address));
  await step('Fund exchange reserve', () => organizer.sendTransaction({ to: exchange.target, value: E('0.000001') }));
  await step('Winner approves 500 LRT redemption', () => token.connect(signers.playerB).approve(exchange.target, E('500')));
  await step('Winner redeems 500 LRT', () => exchange.connect(signers.playerB).redeem(E('500')));
  await step('Winner withdraws redemption ETH', () => exchange.connect(signers.playerB).withdrawETH(wallets.playerB.address));
  await step('Player A buys 10 LRT from returned inventory', async () => exchange.connect(signers.playerA).buy({ value: await exchange.quote(E('10')) }));
  if (!state.cancelledTournamentId) {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const rules = { entryFee: fee, prize, maxPlayers: 2, registrationDeadline: now + 600,
      resultDeadline: now + 86400, disputeWindow: 600, resolutionWindow: 3600 };
    const receipt = await step('Create refund example', () => vault.createTournament(rules, wallets.referee.address, wallets.resolver.address, [6000, 4000]));
    for (const log of receipt.logs) {
      try { const parsed = vault.interface.parseLog(log); if (parsed?.name === 'TournamentCreated') state.cancelledTournamentId = parsed.args.id.toString(); } catch {}
    }
    if (!state.cancelledTournamentId) throw new Error('Cancellation example id missing');
    save(stateFile, state);
  }
  const cancelledId = BigInt(state.cancelledTournamentId);
  await step('Fund refund example', () => vault.fundAndOpen(cancelledId));
  await step('Organizer cancels before the first registration', () => vault.cancelTournament(cancelledId));
  await step('Organizer recovers cancelled LRT prize', () => vault.refundOrganizer(cancelledId, organizer.address));
  state.checks = {
    reviewedTournamentState: Number((await vault.getTournament(id)).state), cancelledTournamentState: Number((await vault.getTournament(cancelledId)).state),
    ethLiability: (await vault.ethLiability()).toString(), tokenLiability: (await vault.tokenLiability()).toString(),
    exchangeCredits: (await exchange.totalCredits()).toString(), totalSupply: (await token.totalSupply()).toString(),
    playerALRT: (await token.balanceOf(wallets.playerA.address)).toString(), playerBLRT: (await token.balanceOf(wallets.playerB.address)).toString(),
    exchangeInventory: (await token.balanceOf(exchange.target)).toString(), exchangeReserveWei: (await exchange.availableReserve()).toString(),
    organizerFeeCredit: (await vault.ethCredits(organizer.address)).toString(), playerARefundCredit: (await vault.ethCredits(wallets.playerA.address)).toString()
  };
  const c = state.checks;
  if (c.reviewedTournamentState !== 5 || c.cancelledTournamentState !== 6 || c.ethLiability !== '0' || c.tokenLiability !== '0' || c.exchangeCredits !== '0'
    || c.totalSupply !== state.initial.totalSupply || c.playerALRT !== E('410').toString() || c.playerBLRT !== E('100').toString()
    || c.organizerFeeCredit !== '0' || c.playerARefundCredit !== '0') throw new Error('Final demonstration accounting check failed');
  state.completedAt = new Date().toISOString(); save(stateFile, state);
  console.log('Sepolia demonstration complete: reviewed result, token prizes, organizer fees, redemption, inventory purchase and pre-registration cancellation.');
}
main().catch(error => {
  if (state) { state.errorCode = error.code || 'DEMO_FAILED'; state.stoppedAt = new Date().toISOString(); save(stateFile, state); }
  console.error(`Demonstration stopped at ${state?.lastStep || 'initialization'} (${error.code || 'DEMO_FAILED'}). Preserve local role wallets and rerun the same command to resume.`);
  process.exitCode = 1;
});
