// Rebuild public browser configuration only; no provider, signer or transaction.
const fs = require('fs');
const path = require('path');
const { getAddress, keccak256 } = require('ethers');
const root = path.resolve(__dirname, '..');
const record = JSON.parse(fs.readFileSync(path.join(root, 'deployment/sepolia.json')));
if (String(record.chainId) !== '11155111' || record.contracts.length !== 3) throw Error('Expected the existing Sepolia deployment');
const contracts = {};
for (const name of ['LearningRewardToken', 'TournamentVault', 'LRTExchange']) {
  const saved = record.contracts.find(c => c.name === name);
  const artifact = JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${name}.sol/${name}.json`)));
  if (!saved || keccak256(artifact.bytecode) !== saved.creationBytecodeHash) throw Error(`Compiled source differs for ${name}`);
  contracts[name] = { address: getAddress(saved.address), abi: artifact.abi };
}
fs.mkdirSync(path.join(root, 'ui'), { recursive: true });
fs.writeFileSync(path.join(root, 'ui/config.json'), JSON.stringify({ chainId: 11155111, contracts }, null, 2));
console.log('Existing Sepolia interface configured. No deployment or transaction was sent.');
