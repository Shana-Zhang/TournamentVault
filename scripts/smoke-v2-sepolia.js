const { ethers, network } = require('hardhat');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const deploymentFile = path.join(root, 'deployment', 'sepolia-v2.json');
const evidenceFile = path.join(root, 'evidence', 'sepolia-v2-smoke.json');
const save = value => {
  const temporary = `${evidenceFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, evidenceFile);
};

async function main() {
  if (network.name !== 'sepolia' || (await ethers.provider.getNetwork()).chainId !== 11155111n)
    throw new Error('V2 smoke test is restricted to Sepolia');
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  if (!deployment.completedAt || deployment.contracts.length !== 3 || deployment.contracts.some(c => c.deploymentStatus !== 'Confirmed'))
    throw new Error('Confirm all three V2 deployments first');
  const [organizer] = await ethers.getSigners();
  if (deployment.contracts[0].deployer.toLowerCase() !== organizer.address.toLowerCase())
    throw new Error('Connected deployment wallet does not match the V2 record');
  const byName = Object.fromEntries(deployment.contracts.map(contract => [contract.name, contract]));
  const attach = async name => {
    const factory = await ethers.getContractFactory(name);
    if (ethers.keccak256(factory.bytecode) !== byName[name].creationBytecodeHash) throw new Error('Local source does not match the V2 deployment record');
    return factory.attach(byName[name].address).connect(organizer);
  };
  const token = await attach('LearningRewardToken');
  const vault = await attach('TournamentVault');
  const initialBalance = await ethers.provider.getBalance(organizer.address);
  const evidence = fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) : {
    network: 'Sepolia', chainId: 11155111, deployment: 'sepolia-v2', startedAt: new Date().toISOString(),
    contracts: Object.fromEntries(deployment.contracts.map(c => [c.name, c.address])), transactions: [], checks: {}
  };
  if (evidence.contracts.TournamentVault !== vault.target) throw new Error('Smoke-test record belongs to another V2 deployment');
  if (evidence.completedAt) { console.log('V2 smoke test already completed; existing evidence retained.'); return; }
  if (evidence.initialBalanceWei && BigInt(evidence.initialBalanceWei) !== initialBalance)
    throw new Error('Organizer balance changed since the smoke test started; inspect the saved evidence before continuing');
  evidence.initialBalanceWei ||= initialBalance.toString(); save(evidence);

  async function step(label, send) {
    let item = evidence.transactions.find(entry => entry.label === label);
    if (!item) {
      const spent = BigInt(evidence.initialBalanceWei) - await ethers.provider.getBalance(organizer.address);
      if (spent < 0n || spent > ethers.parseEther('0.005')) throw new Error('V2 smoke-test gas checkpoint exceeded');
      const transaction = await send();
      item = { label, hash: transaction.hash, status: 'Submitted' };
      evidence.transactions.push(item); save(evidence);
    }
    let receipt = await ethers.provider.getTransactionReceipt(item.hash);
    if (!receipt) {
      const transaction = await ethers.provider.getTransaction(item.hash);
      if (!transaction) throw new Error('A saved V2 smoke-test transaction is unavailable; preserve the evidence before retrying');
      receipt = await transaction.wait(2, 180000);
    }
    if (!receipt || receipt.status !== 1) throw new Error(`V2 smoke-test transaction failed: ${label}`);
    Object.assign(item, { status: 'Confirmed', blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
      explorer: `https://sepolia.etherscan.io/tx/${receipt.hash}` });
    save(evidence);
    return receipt;
  }

  if (!evidence.tournamentId) {
    const block = await ethers.provider.getBlock('latest');
    const referee = ethers.getAddress(`0x${ethers.keccak256(ethers.toUtf8Bytes('TournamentVault V2 smoke referee')).slice(-40)}`);
    const resolver = ethers.getAddress(`0x${ethers.keccak256(ethers.toUtf8Bytes('TournamentVault V2 smoke resolver')).slice(-40)}`);
    if (referee.toLowerCase() === resolver.toLowerCase() || referee.toLowerCase() === organizer.address.toLowerCase()
      || resolver.toLowerCase() === organizer.address.toLowerCase()) throw new Error('Smoke role addresses must be distinct');
    const rules = { entryFee: 0, prize: ethers.parseEther('1'), maxPlayers: 1,
      registrationDeadline: Number(block.timestamp) + 3600, resultDeadline: Number(block.timestamp) + 7200,
      disputeWindow: 60, resolutionWindow: 60 };
    const receipt = await step('Create V2 smoke tournament', () => vault.createTournament(rules, referee, resolver, [10000]));
    const created = receipt.logs.map(log => { try { return vault.interface.parseLog(log); } catch { return null; } })
      .find(event => event?.name === 'TournamentCreated');
    if (!created) throw new Error('V2 creation receipt did not contain TournamentCreated');
    evidence.tournamentId = String(created.args.id); save(evidence);
  }
  const id = BigInt(evidence.tournamentId);
  const tournament = await vault.getTournament(id);
  if (Number(tournament.state) === 0) {
    if (await token.allowance(organizer.address, vault.target) < tournament.rules.prize)
      await step('Approve V2 smoke prize', () => token.approve(vault.target, tournament.rules.prize));
    await step('Open V2 smoke tournament', () => vault.fundAndOpen(id));
  }
  const afterOpen = await vault.getTournament(id);
  if (Number(afterOpen.state) === 1 && Number(afterOpen.playerCount) === 0)
    await step('Cancel V2 tournament before first registration', () => vault.cancelTournament(id));
  const afterCancel = await vault.getTournament(id);
  if (Number(afterCancel.state) === 6 && !(await vault.organizerRefundClaimed(id)))
    await step('Recover V2 empty-tournament prize', () => vault.refundOrganizer(id, organizer.address));

  const finalTournament = await vault.getTournament(id);
  evidence.checks = { tournamentId: String(id), state: Number(finalTournament.state), playerCount: Number(finalTournament.playerCount),
    organizerRefundClaimed: await vault.organizerRefundClaimed(id), tokenLiability: String(await vault.tokenLiability()),
    ethLiability: String(await vault.ethLiability()), prizeReturnedLRT: ethers.formatEther(tournament.rules.prize),
    gasSpentWei: String(BigInt(evidence.initialBalanceWei) - await ethers.provider.getBalance(organizer.address)) };
  if (evidence.checks.state !== 6 || evidence.checks.playerCount !== 0 || !evidence.checks.organizerRefundClaimed
    || evidence.checks.tokenLiability !== '0' || evidence.checks.ethLiability !== '0')
    throw new Error('V2 pre-registration cancellation invariant failed');
  evidence.completedAt = new Date().toISOString(); save(evidence);
  console.log(JSON.stringify({ status: 'Passed', tournamentId: evidence.checks.tournamentId, state: 'Cancelled',
    playerCount: 0, tokenLiability: '0', ethLiability: '0', gasSpentWei: evidence.checks.gasSpentWei,
    evidence: 'evidence/sepolia-v2-smoke.json' }, null, 2));
}

main().catch(error => {
  console.error(error.message || 'V2 smoke test failed; inspect the saved transaction evidence.');
  process.exitCode = 1;
});
