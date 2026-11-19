const { run, network, ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  if (network.name !== 'sepolia' || (await ethers.provider.getNetwork()).chainId !== 11155111n) throw new Error('Use --network sepolia');
  if (!process.env.ETHERSCAN_API_KEY) throw new Error('Set ETHERSCAN_API_KEY in .env');
  const file = path.join(__dirname, '..', 'deployment', 'sepolia.json');
  const record = JSON.parse(fs.readFileSync(file));
  if (!record.completedAt || record.contracts.length !== 3 || record.contracts.some(c => c.deploymentStatus !== 'Confirmed'))
    throw new Error('Complete the three deployments before source verification');
  await run('compile', { force: true });
  for (const c of record.contracts) {
    const factory = await ethers.getContractFactory(c.name);
    if (ethers.keccak256(factory.bytecode) !== c.creationBytecodeHash)
      throw new Error('Local bytecode differs from the deployment record; do not verify changed source');
  }
  let failures = 0;
  const pending = [];
  const save = () => fs.writeFileSync(file, JSON.stringify(record, null, 2));
  const redact = value => {
    let message = String(value);
    for (const secret of [process.env.ETHERSCAN_API_KEY, process.env.SEPOLIA_RPC_URL, process.env.DEPLOYER_PRIVATE_KEY]) {
      if (secret) message = message.split(secret).join('[redacted]');
    }
    return message;
  };
  for (const contract of record.contracts) {
    if (contract.verification === 'Verified') {
      console.log(`${contract.name}: already verified; skipping`);
      continue;
    }
    contract.verificationAttempts ||= [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`${contract.name}: verification attempt ${attempt}/3`);
      try {
        await run('verify:verify', { address: contract.address, constructorArguments: contract.constructorArguments });
        contract.verification = 'Verified';
        contract.verifiedAt = new Date().toISOString();
        contract.verificationAttempts.push({ checkedAt: contract.verifiedAt, attempt, outcome: 'Verified' });
        save();
        break;
      } catch (error) {
        const message = redact(error.message || error);
        if (/already verified/i.test(message)) {
          contract.verification = 'Verified';
          contract.verifiedAt = new Date().toISOString();
          contract.verificationAttempts.push({ checkedAt: contract.verifiedAt, attempt, outcome: 'Already verified' });
          save();
          break;
        }
        const transient = /timeout|timed out|network request|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|rate.limit|\b429\b|\b50[234]\b/i.test(message);
        contract.verification = `Failed: ${message}`;
        contract.verificationAttempts.push({ checkedAt: new Date().toISOString(), attempt, outcome: 'Failed', transient, error: message });
        save();
        if (!transient || attempt === 3) break;
        console.log(`${contract.name}: temporary network failure; retrying in ${attempt * 3} seconds`);
        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      }
    }
    if (contract.verification !== 'Verified') { failures++; pending.push(contract.name); }
    console.log(`${contract.name}: ${contract.verification}`);
  }
  require('./sync-deployment').syncDeployment();
  if (failures) throw new Error(`Verification still pending: ${pending.join(', ')}. Successful verifications were preserved.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
