require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers, network, artifacts } = require('hardhat');

async function main() {
  if (network.name !== 'sepolia' || (await ethers.provider.getNetwork()).chainId !== 11155111n)
    throw new Error('V3 deployment is restricted to Sepolia');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployment/sepolia-v2.json'), 'utf8'));
  const previous = Object.fromEntries(source.contracts.map(c => [c.name, c]));
  const tokenRecord = previous.LearningRewardToken, exchangeRecord = previous.LRTExchange;
  if (!source.completedAt || !tokenRecord || !exchangeRecord || tokenRecord.deploymentStatus !== 'Confirmed' || exchangeRecord.deploymentStatus !== 'Confirmed')
    throw new Error('Confirmed V2 token and exchange records are required');
  const [deployer] = await ethers.getSigners();
  if (!deployer || deployer.address.toLowerCase() !== tokenRecord.deployer.toLowerCase()) throw new Error('Deployment signer does not match the existing deployment owner');
  for (const reused of [tokenRecord, exchangeRecord]) {
    if (await ethers.provider.getCode(reused.address) === '0x') throw new Error(`Reused ${reused.name} has no code on Sepolia`);
  }
  const recordPath = path.join(__dirname, '..', 'deployment/sepolia-v3.json');
  const record = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, 'utf8')) : {
    network: 'sepolia', chainId: '11155111', deployedAt: new Date().toISOString(),
    compiler: require('solc').version(), optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    rate: source.rate, supply: source.supply,
    contracts: [tokenRecord, { ...previous.TournamentVault, name: 'TournamentVaultV3', deploymentStatus: 'Not submitted' }, exchangeRecord]
  };
  if (record.chainId !== '11155111' || record.contracts.length !== 3 || record.contracts[0].name !== 'LearningRewardToken'
      || record.contracts[1].name !== 'TournamentVaultV3' || record.contracts[2].name !== 'LRTExchange')
    throw new Error('Existing V3 record has an unexpected structure; inspect it before continuing');
  const vaultRecord = record.contracts[1];
  const factory = await ethers.getContractFactory('TournamentVaultV3');
  const bytecodeHash = ethers.keccak256(factory.bytecode);
  const args = [tokenRecord.address];
  const save = () => fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  let instance;
  if (vaultRecord.address && vaultRecord.deploymentStatus === 'Confirmed') {
    if (vaultRecord.creationBytecodeHash !== bytecodeHash || JSON.stringify(vaultRecord.constructorArguments) !== JSON.stringify(args))
      throw new Error('Saved V3 deployment differs from the current source; refusing another deployment');
    if (await ethers.provider.getCode(vaultRecord.address) === '0x') throw new Error('Recorded V3 address has no code; refusing another deployment');
    instance = factory.attach(vaultRecord.address);
  } else if (vaultRecord.address && vaultRecord.deploymentStatus === 'Submitted') {
    if (vaultRecord.creationBytecodeHash !== bytecodeHash || JSON.stringify(vaultRecord.constructorArguments) !== JSON.stringify(args))
      throw new Error('Saved V3 deployment differs from the current source; refusing another deployment');
    const pendingTx = await ethers.provider.getTransaction(vaultRecord.transactionHash);
    if (!pendingTx) throw new Error('Saved V3 deployment transaction is unavailable; inspect it before retrying');
    const receipt = await pendingTx.wait(2, 180000);
    if (!receipt || receipt.status !== 1) throw new Error('Recorded V3 deployment did not succeed; inspect the saved record before retrying');
    instance = factory.attach(vaultRecord.address);
    Object.assign(vaultRecord, { blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), deploymentStatus: 'Confirmed' });
  } else if (vaultRecord.address && vaultRecord.deploymentStatus !== 'Not submitted') {
    throw new Error('V3 deployment record has an unknown state; inspect it before sending anything');
  } else {
    instance = await factory.deploy(...args);
    Object.assign(vaultRecord, { address: await instance.getAddress(), deployer: deployer.address,
      transactionHash: instance.deploymentTransaction().hash, constructorArguments: args,
      creationBytecodeHash: bytecodeHash, deploymentStatus: 'Submitted',
      explorer: `https://sepolia.etherscan.io/address/${instance.target}#code`, verification: 'Not yet verified' });
    save();
    const receipt = await instance.deploymentTransaction().wait(2, 180000);
    if (!receipt || receipt.status !== 1) throw new Error('V3 deployment failed; saved transaction record retained for review');
    await instance.waitForDeployment();
    Object.assign(vaultRecord, { blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), deploymentStatus: 'Confirmed' });
  }
  record.completedAt = new Date().toISOString(); save();
  for (const contractRecord of record.contracts) {
    if (!contractRecord.blockNumber) contractRecord.blockNumber = previous[contractRecord.name === 'TournamentVaultV3' ? 'TournamentVault' : contractRecord.name].blockNumber;
    if (!contractRecord.verification) contractRecord.verification = 'Verified';
  }
  record.activityFromBlock = Math.min(...record.contracts.map(c => Number(c.blockNumber)));
  const uiConfig = { chainId: 11155111, activityFromBlock: record.activityFromBlock, contracts: {} };
  for (const c of record.contracts) uiConfig.contracts[c.name] = { address: c.address, abi: (await artifacts.readArtifact(c.name)).abi };
  fs.writeFileSync(path.join(__dirname, '..', 'ui/config.json'), JSON.stringify(uiConfig, null, 2));
  save();
  console.log(`TournamentVaultV3 deployed at ${vaultRecord.address}; token and exchange reused from V2.`);
}
main().catch(error => { console.error(`V3 deployment stopped (${error.code || 'DEPLOYMENT_FAILED'}). No credentials are printed.`); process.exitCode = 1; });
