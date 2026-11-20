const fs = require('fs');
const path = require('path');
const { ethers, network, artifacts } = require('hardhat');

async function main() {
  const chain = await ethers.provider.getNetwork();
  if (!['hardhat', 'localhost'].includes(network.name) || chain.chainId !== 31337n)
    throw new Error('Use the local Hardhat network or localhost');
  const [deployer] = await ethers.getSigners();
  const supply = ethers.parseEther(process.env.INITIAL_SUPPLY_LRT || '1000000');
  const specs = [
    ['LearningRewardToken', [deployer.address, supply]],
    ['TournamentVaultV3', null],
    ['LRTExchange', null]
  ];
  const deployed = {};
  const records = [];
  for (const [name, args] of specs) {
    const constructorArguments = args || [deployed.LearningRewardToken.target];
    const factory = await ethers.getContractFactory(name);
    const instance = await factory.deploy(...constructorArguments);
    const receipt = await instance.deploymentTransaction().wait();
    await instance.waitForDeployment();
    deployed[name] = instance;
    records.push({ name, address: instance.target, transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
      constructorArguments: constructorArguments.map(String), deploymentStatus: 'Confirmed' });
  }
  const root = path.join(__dirname, '..');
  const record = { network: network.name, chainId: '31337', deployedAt: new Date().toISOString(),
    compiler: require('solc').version(), optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', contracts: records };
  fs.writeFileSync(path.join(root, 'deployment/local-v3.json'), JSON.stringify(record, null, 2));
  const config = { chainId: 31337, activityFromBlock: 0, contracts: {} };
  for (const c of records) config.contracts[c.name] = { address: c.address, abi: (await artifacts.readArtifact(c.name)).abi };
  fs.writeFileSync(path.join(root, 'ui/config.json'), JSON.stringify(config, null, 2));
  console.log('Local V3 contracts deployed; the browser can connect to the local chain.');
  for (const c of records) console.log(`${c.name}: ${c.address}`);
}
main().catch(error => { console.error(`Local V3 deployment stopped (${error.code || 'DEPLOYMENT_FAILED'}).`); process.exitCode = 1; });
