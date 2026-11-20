const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

describe('TournamentVaultV3 ETH prize and optional LRT bonus', function () {
  async function fixture() {
    const [organizer, referee, resolver, a, b, c] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('LearningRewardToken');
    const token = await Token.deploy(organizer.address, ethers.parseEther('1000000'));
    const Vault = await ethers.getContractFactory('TournamentVaultV3');
    const vault = await Vault.deploy(token.target);
    const now = await time.latest();
    const rules = { entryFee: ethers.parseEther('0.001'), ethPrize: ethers.parseEther('0.05'), lrtBonus: ethers.parseEther('10000'),
      maxPlayers: 3, registrationDeadline: now + 3600, resultDeadline: now + 7200, disputeWindow: 60, resolutionWindow: 60 };
    return { organizer, referee, resolver, a, b, c, token, vault, rules, shares: [5000, 3000, 2000] };
  }
  async function create(f, overrides = {}) {
    const rules = { ...f.rules, ...overrides };
    await f.vault.createTournament(rules, f.referee.address, f.resolver.address, f.shares, { value: rules.ethPrize });
    return rules;
  }
  async function open(f, id = 1n, bonus = f.rules.lrtBonus) {
    if (bonus > 0n) await f.token.approve(f.vault.target, bonus);
    await f.vault.fundAndOpen(id);
  }
  it('escrows the exact ETH prize at creation and rejects mismatch', async function () {
    const f = await loadFixture(fixture);
    await expect(f.vault.createTournament(f.rules, f.referee.address, f.resolver.address, f.shares))
      .to.be.revertedWith('Invalid ETH prize');
    await expect(f.vault.createTournament(f.rules, f.referee.address, f.resolver.address, f.shares, { value: f.rules.ethPrize - 1n }))
      .to.be.revertedWith('Invalid ETH prize');
    await create(f);
    expect(await ethers.provider.getBalance(f.vault.target)).to.equal(f.rules.ethPrize);
    expect(await f.vault.ethLiability()).to.equal(f.rules.ethPrize);
  });
  it('splits ETH prize and optional LRT bonus by the same ranking shares', async function () {
    const f = await loadFixture(fixture); await create(f); await open(f);
    for (const player of [f.a, f.b, f.c]) await f.vault.connect(player).register(1, { value: f.rules.entryFee });
    await time.increaseTo(f.rules.registrationDeadline);
    await f.vault.lockRegistration(1);
    await f.vault.connect(f.referee).submitResult(1, [f.a.address, f.b.address, f.c.address], ethers.id('result'));
    await time.increase(61); await f.vault.finalizeResult(1);
    expect(await f.vault.ethPrizeCredits(1, f.a.address)).to.equal(ethers.parseEther('0.025'));
    expect(await f.vault.ethPrizeCredits(1, f.b.address)).to.equal(ethers.parseEther('0.015'));
    expect(await f.vault.ethPrizeCredits(1, f.c.address)).to.equal(ethers.parseEther('0.01'));
    expect(await f.vault.prizeCredits(1, f.a.address)).to.equal(ethers.parseEther('5000'));
    await expect(f.vault.connect(f.a).withdrawPrize(1, f.a.address))
      .to.changeEtherBalance(f.a, ethers.parseEther('0.025'));
    expect(await f.token.balanceOf(f.a.address)).to.equal(ethers.parseEther('5000'));
    await expect(f.vault.withdrawETH(f.organizer.address))
      .to.changeEtherBalance(f.organizer, f.rules.entryFee * 3n);
    expect(await f.vault.ethLiability()).to.equal(ethers.parseEther('0.025'));
    expect(await f.vault.tokenLiability()).to.equal(ethers.parseEther('5000'));
  });
  it('allows zero LRT bonus and still pays the ETH prize', async function () {
    const f = await loadFixture(fixture); await create(f, { lrtBonus: 0 }); await open(f, 1n, 0n);
    const t = await f.vault.getTournament(1); expect(t.funded).to.equal(true);
    expect(await f.vault.tokenLiability()).to.equal(0n);
  });
  it('returns the escrowed ETH and any funded LRT bonus after cancellation', async function () {
    const f = await loadFixture(fixture); await create(f); await open(f);
    await f.vault.cancelTournament(1);
    await expect(f.vault.refundOrganizer(1, f.organizer.address))
      .to.changeEtherBalance(f.organizer, f.rules.ethPrize);
    expect(await f.token.balanceOf(f.organizer.address)).to.equal(ethers.parseEther('1000000'));
    expect(await f.vault.ethLiability()).to.equal(0n); expect(await f.vault.tokenLiability()).to.equal(0n);
  });
  it('returns the ETH prize even when cancellation happens before the LRT bonus is funded', async function () {
    const f = await loadFixture(fixture); await create(f); await f.vault.cancelTournament(1);
    await f.vault.refundOrganizer(1, f.organizer.address);
    expect(await f.token.balanceOf(f.vault.target)).to.equal(0n);
    expect(await f.vault.ethLiability()).to.equal(0n);
  });
  it('recovers expired drafts and open events and refunds registered players after a dispute timeout', async function () {
    const f = await loadFixture(fixture);
    await create(f); await create(f); await open(f, 2n); await create(f); await open(f, 3n);
    for (const player of [f.a, f.b, f.c]) await f.vault.connect(player).register(3, { value: f.rules.entryFee });
    await time.increaseTo(f.rules.registrationDeadline);
    await f.vault.lockRegistration(3);
    await f.vault.connect(f.referee).submitResult(3, [f.a.address, f.b.address, f.c.address], ethers.id('result'));
    await f.vault.connect(f.a).raiseDispute(3, ethers.id('objection'));
    await time.increaseTo(f.rules.resultDeadline);
    await f.vault.cancelExpired(1);
    await f.vault.cancelExpired(2);
    await f.vault.refundOrganizer(1, f.organizer.address);
    await f.vault.refundOrganizer(2, f.organizer.address);
    await time.increase(61);
    await f.vault.cancelExpired(3);
    for (const player of [f.a, f.b, f.c]) {
      await f.vault.connect(player).claimRefund(3);
      await f.vault.connect(player).withdrawETH(player.address);
    }
    await f.vault.refundOrganizer(3, f.organizer.address);
    expect(await f.vault.ethLiability()).to.equal(0n);
    expect(await f.vault.tokenLiability()).to.equal(0n);
  });
  it('restores credits on rejected ETH delivery and blocks prize-withdrawal reentry', async function () {
    const f = await loadFixture(fixture); await create(f); await open(f);
    const Receiver = await ethers.getContractFactory('PaymentReceiver');
    const receiver = await Receiver.deploy();
    await f.organizer.sendTransaction({ to: receiver.target, value: f.rules.entryFee });
    const registerData = f.vault.interface.encodeFunctionData('register', [1]);
    await receiver.execute(f.vault.target, registerData, { value: f.rules.entryFee });
    for (const player of [f.b, f.c]) await f.vault.connect(player).register(1, { value: f.rules.entryFee });
    await time.increaseTo(f.rules.registrationDeadline); await f.vault.lockRegistration(1);
    await f.vault.connect(f.referee).submitResult(1, [receiver.target, f.b.address, f.c.address], ethers.id('result'));
    await time.increase(61); await f.vault.finalizeResult(1);
    const withdrawal = f.vault.interface.encodeFunctionData('withdrawPrize', [1, receiver.target]);
    await receiver.configure(ethers.ZeroAddress, '0x', true);
    await expect(receiver.execute(f.vault.target, withdrawal)).to.be.revertedWith('ETH transfer failed');
    expect(await f.vault.ethPrizeCredits(1, receiver.target)).to.equal(ethers.parseEther('0.025'));
    await receiver.configure(f.vault.target, withdrawal, false);
    await receiver.execute(f.vault.target, withdrawal);
    expect(await receiver.reentered()).to.equal(false);
    expect(await f.vault.ethPrizeCredits(1, receiver.target)).to.equal(0n);
    expect(await f.token.balanceOf(receiver.target)).to.equal(ethers.parseEther('5000'));
  });
});
