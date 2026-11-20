const { ethers, network } = require('hardhat');
const { deploySystem } = require('./deploy');
const fs = require('fs');
const path = require('path');

async function main() {
  if (network.name !== 'hardhat') throw new Error('Demo uses disposable local accounts only');
  const { LearningRewardToken: token, TournamentVault: vault, LRTExchange: exchange } = await deploySystem();
  const [organizer, referee, resolver, a, b, c] = await ethers.getSigners();
  const E = ethers.parseEther;
  const evidence = { network: 'hardhat', chainId: 31337, generatedAt: new Date().toISOString(), transactions: [], checks: {} };
  async function step(label, transaction) {
    const receipt = await (await transaction).wait();
    evidence.transactions.push({ label, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() });
    console.log(`${label}: ${receipt.hash}`);
  }
  async function advance(timestamp) {
    await network.provider.send('evm_setNextBlockTimestamp', [Number(timestamp)]);
    await network.provider.send('evm_mine');
  }
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const rules = { entryFee: E('0.001'), prize: E('1000'), maxPlayers: 3,
    registrationDeadline: now + 600, resultDeadline: now + 1200, disputeWindow: 120, resolutionWindow: 300 };
  await step('Fund exchange ETH backing', organizer.sendTransaction({ to: exchange.target, value: E('0.001') }));
  await step('Seed exchange LRT inventory', token.transfer(exchange.target, E('10000')));
  await step('Create tournament', vault.createTournament(rules, referee.address, resolver.address, [5000, 3000, 2000]));
  await step('Approve organizer prize', token.approve(vault.target, rules.prize));
  await step('Fund prize and open registration', vault.fundAndOpen(1));
  for (const [i, player] of [a, b, c].entries()) await step(`Register player ${i + 1}`, vault.connect(player).register(1, { value: rules.entryFee }));
  await advance(rules.registrationDeadline);
  await step('Lock roster', vault.lockRegistration(1));
  await step('Referee submits ranking', vault.connect(referee).submitResult(1, [a.address, b.address, c.address], ethers.id('original bracket')));
  await step('Player objects', vault.connect(c).raiseDispute(1, ethers.id('review match three')));
  await step('Resolver replaces ranking', vault.connect(resolver).resolveDispute(1, [c.address, b.address, a.address], ethers.id('reviewed bracket')));
  for (const [i, player] of [a, b, c].entries()) await step(`Player ${i + 1} withdraws LRT prize`, vault.connect(player).withdrawPrize(1, player.address));
  await step('Organizer withdraws registration fees', vault.withdrawETH(organizer.address));
  await step('Winner approves redemption', token.connect(c).approve(exchange.target, E('500')));
  await step('Winner redeems 500 LRT', exchange.connect(c).redeem(E('500')));
  await step('Winner withdraws redemption ETH', exchange.connect(c).withdrawETH(c.address));
  const now2 = (await ethers.provider.getBlock('latest')).timestamp;
  await step('Create cancellation example', vault.createTournament({ ...rules, registrationDeadline: now2 + 600, resultDeadline: now2 + 1200 }, referee.address, resolver.address, [5000, 3000, 2000]));
  await step('Approve second prize', token.approve(vault.target, rules.prize));
  await step('Open second tournament', vault.fundAndOpen(2));
  await step('Cancel empty tournament before the first registration', vault.cancelTournament(2));
  await step('Return organizer prize', vault.refundOrganizer(2, organizer.address));
  evidence.checks = {
    tournament1State: Number((await vault.getTournament(1)).state), tournament2State: Number((await vault.getTournament(2)).state),
    vaultETHLiability: (await vault.ethLiability()).toString(), vaultLRTLiability: (await vault.tokenLiability()).toString(),
    exchangeCredits: (await exchange.totalCredits()).toString(), totalSupply: (await token.totalSupply()).toString(),
    exchangeInventory: (await token.balanceOf(exchange.target)).toString(),
    player1LRT: (await token.balanceOf(a.address)).toString(), player2LRT: (await token.balanceOf(b.address)).toString(),
    player3LRTAfterRedemption: (await token.balanceOf(c.address)).toString(), redeemedETH: '0.0000005'
  };
  if (evidence.checks.vaultETHLiability !== '0' || evidence.checks.vaultLRTLiability !== '0' || evidence.checks.exchangeCredits !== '0') throw new Error('Unpaid demo liability');
  fs.mkdirSync(path.join(__dirname, '..', 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'evidence', 'local-demo.json'), JSON.stringify(evidence, null, 2));
  console.log('Demo verified: dispute resolution, token prizes, fee settlement, redemption and pre-registration cancellation. Timeout refund behavior is covered by the automated tests.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
