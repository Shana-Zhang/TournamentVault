require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
async function main() {
  const result = { checkedAt: new Date().toISOString(), intendedNetwork: 'Sepolia', intendedChainId: 11155111,
    rpcConfigured: Boolean(process.env.SEPOLIA_RPC_URL), walletConfigured: Boolean(process.env.DEPLOYER_PRIVATE_KEY),
    verificationKeyConfigured: Boolean(process.env.ETHERSCAN_API_KEY), status: 'Not checked' };
  let provider;
  try {
    if (!result.rpcConfigured || !result.walletConfigured) throw new Error('CONFIG_MISSING');
    const request = new ethers.FetchRequest(process.env.SEPOLIA_RPC_URL); request.timeout = 8000;
    provider = new ethers.JsonRpcProvider(request, 11155111, { staticNetwork: true });
    const chainId = BigInt(await provider.send('eth_chainId', []));
    if (chainId !== 11155111n) throw new Error('WRONG_CHAIN');
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    const balance = await provider.getBalance(wallet.address);
    result.chainId = Number(chainId); result.deployer = wallet.address; result.balanceETH = ethers.formatEther(balance);
    result.status = balance > 0n ? 'RPC and funded wallet available' : 'Wallet needs Sepolia test ETH';
  } catch (error) {
    // Do not print the provider URL, credentials, request headers or raw error object.
    result.status = error.message === 'CONFIG_MISSING' ? 'Missing local configuration'
      : error.message === 'WRONG_CHAIN' ? 'RPC is not Sepolia' : 'Blocked by RPC connectivity or wallet configuration';
    result.errorCode = typeof error.code === 'string' ? error.code : 'PREFLIGHT_FAILED';
    process.exitCode = 1;
  } finally {
    provider?.destroy();
    fs.mkdirSync(path.join(__dirname, '..', 'deployment'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'deployment', 'preflight.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
}
main().catch(() => { console.error('Preflight failed'); process.exitCode = 1; });
