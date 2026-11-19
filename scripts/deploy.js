const { ethers, network, artifacts } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function deploySystem() {
  const chain = await ethers.provider.getNetwork();
  if (![31337n, 11155111n].includes(chain.chainId)) throw new Error('Only local development and Sepolia are supported');
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Configure a dedicated testnet deployer in .env');
  const supply = ethers.parseEther(process.env.INITIAL_SUPPLY_LRT || '1000000');
  const directory = path.join(__dirname, '..', 'deployment');
  fs.mkdirSync(directory, { recursive: true });
  const recordFile = path.join(directory, `${network.name}.json`);
  let record = { network: network.name, chainId: chain.chainId.toString(),
    deployedAt: new Date().toISOString(), compiler: require('solc').version(),
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    rate: '1 LRT = 0.000000001 ETH', supply: supply.toString(), contracts: [] };
  if (chain.chainId === 11155111n && fs.existsSync(recordFile)) {
    record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    if (record.chainId !== chain.chainId.toString() || record.supply !== supply.toString() ||
      record.contracts.some(r => r.deployer !== deployer.address)) throw new Error('Existing deployment configuration differs; review the record before continuing');
  }
  const save = () => {
    const temporary = `${recordFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2));
    fs.renameSync(temporary, recordFile);
  };
  const specifications = [
    ['LearningRewardToken', [deployer.address, supply]],
    ['TournamentVault', null], ['LRTExchange', null]
  ];
  const instances = {};
  const records = record.contracts;
  for (const [name, args] of specifications) {
    const constructorArguments = args || [instances.LearningRewardToken.target];
    const factory = await ethers.getContractFactory(name);
    const bytecodeHash = ethers.keccak256(factory.bytecode);
    let item = records.find(r => r.name === name);
    let instance;
    if (item) {
      if (item.creationBytecodeHash !== bytecodeHash || JSON.stringify(item.constructorArguments) !== JSON.stringify(constructorArguments.map(String)))
        throw new Error('Existing deployment bytecode or constructor differs; review the record before continuing');
      console.log(`Resuming ${name}: ${item.address}`);
      instance = factory.attach(item.address);
    } else {
      instance = await factory.deploy(...constructorArguments);
      item = { name, address: await instance.getAddress(), deployer: deployer.address,
        transactionHash: instance.deploymentTransaction().hash, constructorArguments: constructorArguments.map(String),
        creationBytecodeHash: bytecodeHash, deploymentStatus: 'Submitted',
        explorer: chain.chainId === 11155111n ? `https://sepolia.etherscan.io/address/${instance.target}#code` : null,
        verification: 'Not yet verified' };
      records.push(item);
      save();
    }
    const transaction = await ethers.provider.getTransaction(item.transactionHash);
    if (!transaction) throw new Error('Recorded transaction is unavailable; review it before sending another deployment');
    const receipt = await transaction.wait(chain.chainId === 11155111n ? 2 : 1, 180000);
    if (!receipt || receipt.status !== 1) throw new Error('Deployment transaction did not complete successfully; inspect the saved record');
    await instance.waitForDeployment();
    if (await ethers.provider.getCode(item.address) === '0x') throw new Error('No deployed code at the recorded address');
    instances[name] = instance;
    Object.assign(item, { blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), deploymentStatus: 'Confirmed' });
    save();
  }
  record.completedAt = new Date().toISOString();
  save();
  const uiConfig = { chainId: Number(chain.chainId), contracts: {} };
  for (const r of records) uiConfig.contracts[r.name] = { address: r.address, abi: (await artifacts.readArtifact(r.name)).abi };
  fs.mkdirSync(path.join(__dirname, '..', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'ui', 'config.json'), JSON.stringify(uiConfig, null, 2));
  console.log(`Deployed on ${network.name} (chain ${chain.chainId})`);
  for (const r of records) console.log(`${r.name}: ${r.address}`);
  return { ...instances, deployer, record };
}
module.exports = { deploySystem };
if (require.main === module) deploySystem().catch(error => {
  console.error(`Deployment stopped (${error.code || 'DEPLOYMENT_FAILED'}). Check connectivity, test ETH balance and the saved deployment record. No credentials are printed.`);
  process.exitCode = 1;
});
