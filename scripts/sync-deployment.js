const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const root = path.resolve(__dirname, '..');

function syncDeployment({ recordName = 'sepolia' } = {}) {
  if (!/^sepolia(?:-v\d+)?$/.test(recordName)) throw new Error('Unsupported Sepolia deployment record');
  const record = JSON.parse(fs.readFileSync(path.join(root, `deployment/${recordName}.json`), 'utf8'));
  if (!record.completedAt || record.contracts.length !== 3 || record.contracts.some(c => c.deploymentStatus !== 'Confirmed'))
    throw new Error('Three confirmed deployments are required');
  const matches = record.contracts.map(c => {
    const artifact = JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${c.name}.sol/${c.name}.json`), 'utf8'));
    const localHash = ethers.keccak256(artifact.bytecode);
    if (localHash !== c.creationBytecodeHash) throw new Error('Deployment bytecode mismatch');
    return { name: c.name, address: c.address, localCreationBytecodeHash: localHash, deploymentCreationBytecodeHash: c.creationBytecodeHash, matches: true };
  });
  const verified = record.contracts.every(c => c.verification === 'Verified');
  const verifiedCount = record.contracts.filter(c => c.verification === 'Verified').length;
  const pendingNames = record.contracts.filter(c => c.verification !== 'Verified').map(c => c.name).join(', ');
  const summary = verified ? 'All three contract sources are verified on Etherscan.'
    : `All three contracts are deployed; ${verifiedCount} of 3 contract sources are verified. Pending verification: ${pendingNames}.`;
  const table = ['| Contract | Address | Transaction | Block | Source verification |', '| --- | --- | --- | --- | --- |'];
  for (const c of record.contracts) table.push(`| ${c.name} | [${c.address}](${c.explorer}) | [${c.transactionHash}](https://sepolia.etherscan.io/tx/${c.transactionHash}) | ${c.blockNumber} | ${c.verification === 'Verified' ? 'Verified' : 'Pending retry'} |`);
  const metadata = `Network: Sepolia. Chain ID: 11155111. Deployer: ${record.contracts[0].deployer}. Deployment completed at ${record.completedAt} UTC. Compiler: v0.8.26+commit.8a97fa7a. Optimizer: enabled, 200 runs. EVM: Cancun.`;
  fs.writeFileSync(path.join(root, 'deployment/source-match.json'), JSON.stringify({ checkedAt: new Date().toISOString(), compiler: 'v0.8.26+commit.8a97fa7a', contracts: matches }, null, 2));
  fs.writeFileSync(path.join(root, 'docs/deployment-information.md'), `# Sepolia Deployment\n\n## Current deployment ${recordName}\n\n${summary}\n\n${metadata}\n\n${table.join('\n')}\n\nCreation bytecode hashes match the saved deployment records for all three contracts. See deployment/source-match.json.\n\nThe original deployment remains recorded in deployment/sepolia.json. The current browser configuration uses ${recordName}.\n`);
  const edit = (relative, transform) => {
    const file = path.join(root, relative);
    fs.writeFileSync(file, transform(fs.readFileSync(file, 'utf8')));
  };
  edit('docs/project-report.md', text => {
    text = text.replace('Public Sepolia deployment, explorer verification and an external static analyzer run remain outstanding.', verified ? 'All three contracts have been deployed on Sepolia and their source verified on Etherscan. An external static analyzer run remains outstanding.' : 'All three contracts have been deployed on Sepolia. Explorer verification and an external static analyzer run remain outstanding.');
    if (verified) text = text.replace('All three contracts have been deployed on Sepolia. Explorer verification and an external static analyzer run remain outstanding.', 'All three contracts have been deployed on Sepolia and their source verified on Etherscan. An external static analyzer run remains outstanding.');
    text = text.replace('The first three objectives are demonstrated locally; the public deployment objective is not yet complete.', verified ? 'The first three objectives are demonstrated locally, and the three contract deployments and source verification complete the fourth objective.' : 'The first three objectives are demonstrated locally. Public deployment is complete; explorer verification is pending a corrected retry.');
    const start = text.indexOf('### 4.2 Deployment Information');
    const end = text.indexOf('## 5 Test Cases and Validation', start);
    if (start >= 0 && end > start) text = text.slice(0, start) + `### 4.2 Deployment Information\n\n${metadata}\n\n${table.join('\n')}\n\n### 4.3 Etherscan Verification\n\n${summary} The first request used a JavaScript-specific compiler suffix and was rejected. The compiler label has been corrected to the canonical version. Fresh compilation produces creation bytecode hashes identical to the deployment records; no redeployment is required for this metadata correction. The verifier records success only after a successful explorer response. See docs/verification-fix.md and deployment/source-match.json.\n\n` + text.slice(end);
    text = text.replace('Public deployment and verification have not yet met the fourth objective.', verified ? 'Public deployment and explorer source verification complete the fourth objective.' : 'Public deployment is complete; explorer source verification is still pending.');
    if (verified) {
      text = text.replace('Public deployment is complete; explorer source verification is still pending.', 'Public deployment and explorer source verification complete the fourth objective.');
      text = text.replace('The first three objectives are demonstrated locally. Public deployment is complete; explorer verification is pending a corrected retry.', 'The first three objectives are demonstrated locally, and public deployment and source verification complete the fourth objective.');
    }
    if (verified) text = text.replace('- [ ] Sepolia deployment and verified source links', '- [x] Sepolia deployment and verified source links');
    text = text.replace(/Organizer cancellation remains available in every nonterminal state as specified in the proposal\./g, 'Organizer cancellation is limited to Draft or RegistrationOpen tournaments with zero registered players. Once a player joins, only state-specific permissionless timeout cancellation is available.');
    text = text.replace(/Every nonterminal state permits organizer cancellation\./g, 'Organizer cancellation is limited to Draft or RegistrationOpen tournaments before the first entrant joins. Populated tournaments can be cancelled only by the state-specific permissionless timeout path.');
    text = text.replace(/organizer cancellation after seeing results/g, 'timeout cancellation after participants have joined');
    return text;
  });
  edit('docs/completion-status.md', text => text
    .replace(/\| Sepolia RPC preflight \|[^\n]*/, '| Sepolia RPC preflight | Passed in the Windows terminal | Sepolia chain and funded wallet confirmed |')
    .replace(/\| Public deployment and verification \|[^\n]*/, `| Public deployment and verification | Three contracts deployed; ${verifiedCount}/3 source verified | docs/deployment-information.md |`));
  edit('README.md', text => text.replace(/The local implementation and automated tests are complete\.[^\n]*/, `The local implementation and automated tests are complete. The current ${recordName} contracts are ${verified ? 'deployed and source verified' : 'deployed; source verification is pending'}. The original V1 deployment remains in deployment/sepolia.json. See docs/deployment-information.md for current public addresses. Local addresses in deployment/hardhat.json remain development evidence only.`));
  return { deployed: record.contracts.length, verified: record.contracts.filter(c => c.verification === 'Verified').length };
}
module.exports = { syncDeployment };
if (require.main === module) console.log(JSON.stringify(syncDeployment({ recordName: process.env.DEPLOYMENT_RECORD || 'sepolia' })));
