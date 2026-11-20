const { ethers } = require('hardhat');
const { deploySystem } = require('./deploy');

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 11155111n) throw new Error('V2 public deployment is restricted to Sepolia');
  await deploySystem({ recordName: 'sepolia-v2' });
}

main().catch(error => {
  console.error(`V2 deployment stopped (${error.code || 'DEPLOYMENT_FAILED'}). Review the saved V2 record and preflight output. No credentials are printed.`);
  process.exitCode = 1;
});
