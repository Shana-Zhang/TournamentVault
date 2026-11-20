const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'ui/config.json'), 'utf8'));
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'deployment/sepolia-v3.json'), 'utf8'));
const expectedNames = ['LearningRewardToken', 'TournamentVaultV3', 'LRTExchange'];

if (Number(config.chainId) !== 11155111 || deployment.chainId !== '11155111') {
  throw new Error('UI and deployment must target Sepolia (chain ID 11155111)');
}
for (const name of expectedNames) {
  const record = deployment.contracts.find((contract) => contract.name === name);
  const ui = config.contracts?.[name];
  if (!record || record.deploymentStatus !== 'Confirmed' || record.verification !== 'Verified') {
    throw new Error(`Missing confirmed, verified V3 deployment record for ${name}`);
  }
  if (!ui?.address || ui.address.toLowerCase() !== record.address.toLowerCase()) {
    throw new Error(`UI address for ${name} does not match deployment/sepolia-v3.json`);
  }
}
console.log('UI contract addresses match the verified Sepolia V3 deployment. No network request or transaction was sent.');
