// Only RPC reads. No signer is created and no transaction is sent.
const publicRpc = process.argv.includes('--public-rpc');
if (!publicRpc) require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let provider;
async function main() {
  const request = new ethers.FetchRequest(publicRpc ? 'https://ethereum-sepolia-rpc.publicnode.com' : process.env.SEPOLIA_RPC_URL); request.timeout = 15000;
  provider = new ethers.JsonRpcProvider(request, 11155111, { staticNetwork: true });
  if (BigInt(await provider.send('eth_chainId', [])) !== 11155111n) throw Error('Wrong chain');
  const record = JSON.parse(fs.readFileSync(path.join(__dirname, '../deployment/sepolia.json')));
  const rows = [];
  for (const [label, hash] of [
    ['Fund exchange reserve', '0xc07dba7da08c5f5a17390a86b9329b7d36620c757d52ef0330d62bd7cf49d205'],
    ['Fund exchange LRT inventory', '0x50f1653a56c49b32ab7d3d6b184913615575338b2b47edd98680fe63b21f59d5']
  ]) {
    const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
    rows.push({ label, hash, status: receipt?.status, block: receipt?.blockNumber, from: tx?.from, to: tx?.to, valueWei: tx?.value.toString(), gasUsed: receipt?.gasUsed.toString(), input: tx?.data });
  }
  const exchange = record.contracts.find(c => c.name === 'LRTExchange').address;
  const token = new ethers.Contract(record.contracts[0].address, ['function balanceOf(address) view returns(uint256)'], provider);
  const vaultRecord = record.contracts.find(c => c.name === 'TournamentVault');
  const artifact = JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/TournamentVault.sol/TournamentVault.json`)));
  const vault = new ethers.Contract(vaultRecord.address, artifact.abi, provider);
  const count = await vault.tournamentCount();
  const tournaments = [];
  for (let id = 1n; id <= count && id <= 10n; id++) {
    const t = await vault.getTournament(id);
    tournaments.push({ id: String(id), state: String(t.state), organizer: t.organizer, referee: t.referee, resolver: t.resolver,
      registrationDeadline: String(t.rules.registrationDeadline), resultDeadline: String(t.rules.resultDeadline),
      prizeLRT: ethers.formatEther(t.rules.prize), entryFeeETH: ethers.formatEther(t.rules.entryFee), playerCount: String(t.playerCount) });
  }
  const block = await provider.getBlock('latest');
  const report = { checkedAt: new Date().toISOString(), chainId: 11155111, block: block.number, blockTimestamp: block.timestamp,
    transactions: rows, exchange, inventoryLRT: ethers.formatEther(await token.balanceOf(exchange)), reserveETH: ethers.formatEther(await provider.getBalance(exchange)),
    tournamentCount: String(count), tournaments,
    organizerLatestNonce: await provider.getTransactionCount(record.contracts[0].deployer, 'latest'),
    organizerPendingNonce: await provider.getTransactionCount(record.contracts[0].deployer, 'pending') };
  fs.writeFileSync(path.join(__dirname, '../evidence/sepolia-business-demo.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('Read-only evidence check failed; raw errors suppressed'); process.exitCode = 1; }).finally(() => provider?.destroy());
