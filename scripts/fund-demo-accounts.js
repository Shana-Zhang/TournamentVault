// Default: read-only plan. --execute sends only balance top-ups to the five fixed demo accounts.
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'evidence/sepolia-account-funding.json');
const target = ethers.parseEther('0.01');
const addresses = [
  '0x95A6f7B1dEa4e49503861b4D5e98266c50EBAA0e',
  '0x030aF0343d109Ae1130391b5b440dACE4E2DF78f',
  '0xF7a61C6D5377130a45aE4F9cB4b4f8FFD8f2E506',
  '0xA296C8C788079aB0CE0725daa350587cdED0d7F0',
  '0x2a85946a52C40f9A3b0dB85C20F4FD5887eA79A2'
].map(ethers.getAddress);
let provider, stage = 'configuration';
async function main() {
  const request = new ethers.FetchRequest(process.env.SEPOLIA_RPC_URL); request.timeout = 15000;
  provider = new ethers.JsonRpcProvider(request, 11155111, { staticNetwork: true });
  if (BigInt(await provider.send('eth_chainId', [])) !== 11155111n) throw Error('Wrong chain');
  const record = JSON.parse(fs.readFileSync(path.join(root, 'deployment/sepolia.json')));
  const sender = record.contracts[0].deployer;
  const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { chainId: 11155111, sender, targetETH: '0.01', accounts: addresses.map((address, i) => ({ account: i + 2, role: ['Referee', 'Resolver', 'Player 1', 'Player 2', 'Player 3'][i], address })) };
  if (report.sender !== sender || report.accounts.length !== 5 || report.accounts.some((r, i) => r.address !== addresses[i])) throw Error('Saved plan mismatch');
  const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2));
  report.checkedAt = new Date().toISOString();
  let total = 0n;
  for (const row of report.accounts) {
    if (row.transactionHash) {
      const receipt = await provider.waitForTransaction(row.transactionHash, 1, 60000);
      if (!receipt || receipt.status !== 1) throw Error('Previous transaction not confirmed');
      row.status = 'Confirmed'; row.block = receipt.blockNumber; row.gasUsed = receipt.gasUsed.toString();
    }
    const balance = await provider.getBalance(row.address, 'latest');
    row.balanceETH = ethers.formatEther(balance);
    row.topUpETH = ethers.formatEther(balance < target ? target - balance : 0n);
    total += balance < target ? target - balance : 0n;
  }
  report.plannedTotalETH = ethers.formatEther(total); save();
  console.log(JSON.stringify(report, null, 2));
  if (!process.argv.includes('--execute')) return;
  if (total > ethers.parseEther('0.05')) throw Error('Exceeds authorized top-up budget');
  stage = 'sender identity';
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  if (wallet.address !== ethers.getAddress(sender)) throw Error('Sender mismatch');
  if (await provider.getBalance(sender) < total + ethers.parseEther('0.005')) throw Error('Insufficient sender balance');
  for (const row of report.accounts) {
    const current = await provider.getBalance(row.address, 'latest');
    if (current >= target) { row.balanceETH = ethers.formatEther(current); row.status ||= 'Already funded'; save(); continue; }
    // A confirmed recorded transfer is never repeated automatically after later account spending.
    if (row.transactionHash) throw Error('Previously funded account spent balance; review before another transfer');
    stage = `Account ${row.account}: fee lookup`;
    const fees = await provider.getFeeData();
    const maxFeePerGas = fees.maxFeePerGas || fees.gasPrice;
    if (!maxFeePerGas || maxFeePerGas > ethers.parseUnits('10', 'gwei')) throw Error('Gas price exceeds demo limit');
    const value = target - current;
    stage = `Account ${row.account}: gas estimate`;
    if (await provider.getCode(row.address) !== '0x') throw Error('Recipient has contract code; review required');
    const gasLimit = await provider.estimateGas({ from: sender, to: row.address, value });
    console.log(JSON.stringify({ account: row.account, estimatedGas: gasLimit.toString(), maxFeePerGasWei: maxFeePerGas.toString() }));
    if (gasLimit > 300000n || gasLimit * maxFeePerGas > ethers.parseEther('0.001')) throw Error('Unexpected recipient gas requirement');
    stage = `Account ${row.account}: submission`;
    const tx = await wallet.sendTransaction({ to: row.address, value, gasLimit, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas || 0n });
    row.transactionHash = tx.hash; row.sentETH = ethers.formatEther(value); row.status = 'Submitted'; save();
    console.log(`Account ${row.account}: submitted ${tx.hash}`);
    const receipt = await tx.wait(1, 60000);
    if (!receipt || receipt.status !== 1) throw Error('Funding not confirmed');
    row.status = 'Confirmed'; row.block = receipt.blockNumber; row.gasUsed = receipt.gasUsed.toString();
    row.balanceETH = ethers.formatEther(await provider.getBalance(row.address, receipt.blockNumber)); save();
    console.log(`Account ${row.account}: confirmed, balance ${row.balanceETH} Sepolia ETH`);
  }
  report.completedAt = new Date().toISOString(); save();
}
main().catch(error => { console.error(JSON.stringify({ status: 'Stopped', stage, code: ['NETWORK_ERROR','SERVER_ERROR','TIMEOUT','INSUFFICIENT_FUNDS','NONCE_EXPIRED','REPLACEMENT_UNDERPRICED','INVALID_ARGUMENT','UNKNOWN_ERROR'].includes(error.code) ? error.code : 'CHECK_FAILED' })); process.exitCode = 1; }).finally(() => provider?.destroy());
