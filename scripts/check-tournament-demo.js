// Read-only evidence collection for the existing Sepolia deployment.
const publicRpc = process.argv.includes('--public-rpc');
if (!publicRpc) require('dotenv').config({ quiet: true });
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let provider;
async function main() {
  const request = new ethers.FetchRequest(publicRpc ? 'https://ethereum-sepolia-rpc.publicnode.com' : process.env.SEPOLIA_RPC_URL);
  request.timeout = 15000;
  provider = new ethers.JsonRpcProvider(request, 11155111, { staticNetwork: true });
  if (BigInt(await provider.send('eth_chainId', [])) !== 11155111n) throw Error('Wrong network');
  const deployment = JSON.parse(fs.readFileSync(path.join(root, 'deployment/sepolia.json')));
  const address = name => deployment.contracts.find(c => c.name === name).address;
  const abi = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/contracts/TournamentVault.sol/TournamentVault.json'))).abi;
  const vault = new ethers.Contract(address('TournamentVault'), abi, provider);
  const exchangeAbi = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/contracts/LRTExchange.sol/LRTExchange.json'))).abi;
  const exchange = new ethers.Contract(address('LRTExchange'), exchangeAbi, provider);
  const token = new ethers.Contract(address('LearningRewardToken'), ['function balanceOf(address) view returns(uint256)'], provider);
  const block = await provider.getBlock('latest');
  const count = await vault.tournamentCount();
  const states = ['Draft', 'Registration open', 'Locked', 'Result pending', 'Disputed', 'Finalized', 'Cancelled'];
  const tournaments = [];
  for (let id = 1n; id <= count && id <= 10n; id++) {
    const t = await vault.getTournament(id);
    tournaments.push({ id: String(id), state: states[Number(t.state)], players: String(t.playerCount),
      organizer: t.organizer, referee: t.referee, resolver: t.resolver,
      prizeLRT: ethers.formatEther(t.rules.prize), feeETH: ethers.formatEther(t.rules.entryFee),
      registrationDeadline: String(t.rules.registrationDeadline), resultDeadline: String(t.rules.resultDeadline),
      disputeDeadline: String(t.disputeDeadline), resolutionDeadline: String(t.resolutionDeadline) });
  }
  const players = [];
  for (const account of [
    '0xF7a61C6D5377130a45aE4F9cB4b4f8FFD8f2E506',
    '0xA296C8C788079aB0CE0725daa350587cdED0d7F0',
    '0x2a85946a52C40f9A3b0dB85C20F4FD5887eA79A2'
  ]) {
    players.push({ account, registeredIn3: count >= 3n ? await vault.registered(3, account) : false,
      prizeCreditLRT: count >= 3n ? ethers.formatEther(await vault.prizeCredits(3, account)) : '0',
      tokenBalanceLRT: ethers.formatEther(await token.balanceOf(account)),
      ethBalance: ethers.formatEther(await provider.getBalance(account)),
      vaultCreditETH: ethers.formatEther(await vault.ethCredits(account)) });
  }
  const logs = await provider.getLogs({ address: [vault.target, exchange.target], fromBlock: 12166800, toBlock: block.number });
  const events = [];
  for (const log of logs) {
    const contractName = log.address.toLowerCase() === vault.target.toLowerCase() ? 'TournamentVault' : 'LRTExchange';
    const parsed = (contractName === 'TournamentVault' ? vault : exchange).interface.parseLog(log);
    if (!parsed) continue;
    const args = {};
    parsed.fragment.inputs.forEach((input, index) => { args[input.name || String(index)] = parsed.args[index]; });
    events.push({ contract: contractName, event: parsed.name, args, hash: log.transactionHash, block: log.blockNumber, index: log.index });
  }
  const transactions = [];
  for (const hash of [...new Set(events.map(e => e.hash))]) {
    const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
    transactions.push({ hash, status: receipt.status, block: receipt.blockNumber, from: tx.from, to: tx.to,
      nonce: tx.nonce, valueWei: String(tx.value), gasUsed: String(receipt.gasUsed) });
  }
  const report = { checkedAt: new Date().toISOString(), chainId: 11155111, block: block.number,
    tournamentCount: String(count), tournaments, players,
    organizerCreditETH: ethers.formatEther(await vault.ethCredits(deployment.contracts[0].deployer)),
    exchange: { address: exchange.target, inventoryLRT: ethers.formatEther(await token.balanceOf(exchange.target)),
      availableReserveETH: ethers.formatEther(await exchange.availableReserve()), balanceETH: ethers.formatEther(await provider.getBalance(exchange.target)),
      account5CreditETH: ethers.formatEther(await exchange.ethCredits('0xA296C8C788079aB0CE0725daa350587cdED0d7F0')) },
    vaultLRT: ethers.formatEther(await token.balanceOf(vault.target)),
    vaultETH: ethers.formatEther(await provider.getBalance(vault.target)), events, transactions };
  fs.writeFileSync(path.join(root, 'evidence/sepolia-tournament-demo.json'), JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2));
  console.log(JSON.stringify({ checkedAt: report.checkedAt, block: report.block, tournaments, players,
    vaultLRT: report.vaultLRT, vaultETH: report.vaultETH, eventCount: events.length, transactionCount: transactions.length }));
}
main().catch(() => { console.error('Read-only tournament evidence check failed; raw errors suppressed'); process.exitCode = 1; }).finally(() => provider?.destroy());
