/* Wallet-signed, resumable fresh deployment. No private key is used by this page. */
const recordKey = 'tournamentvault-fresh-sepolia-20261123';
const deployerAddress = '0xdE3d23a1245f07859279b759b528615Eb55BcAc4';
const names = ['LearningRewardToken', 'TournamentVaultV3', 'LRTExchange'];
let bundle, walletProvider, walletSigner, deploymentBusy = false;
let record = JSON.parse(localStorage.getItem(recordKey) || 'null') || {
  network: 'sepolia', chainId: '11155111', version: 'V3 fresh deployment',
  supply: '1000000', rate: '1000000000', contracts: []
};
const statusNode = document.getElementById('deployment-status');
const nextButton = document.getElementById('deploy-next');
function saveRecord() {
  localStorage.setItem(recordKey, JSON.stringify(record));
  document.getElementById('deployment-record').textContent = JSON.stringify(record, null, 2);
}
async function checkNetwork() {
  if (await walletProvider.send('eth_chainId', []) !== '0xaa36a7') throw new Error('Select Sepolia in MetaMask.');
}
async function confirmDeployment(entry) {
  const receipt = await walletProvider.waitForTransaction(entry.transactionHash, 1);
  if (!receipt || receipt.status !== 1) throw new Error('Deployment failed. Inspect the saved transaction before any retry.');
  if (!receipt.contractAddress || await walletProvider.getCode(receipt.contractAddress) === '0x') throw new Error('Deployment code unavailable; inspect saved transaction.');
  entry.address = receipt.contractAddress;
  entry.blockNumber = receipt.blockNumber;
  entry.gasUsed = receipt.gasUsed.toString();
  entry.deploymentStatus = 'Confirmed';
  entry.explorer = `https://sepolia.etherscan.io/address/${entry.address}#code`;
  if (record.contracts.length === names.length) record.completedAt = new Date().toISOString();
  saveRecord();
}
document.getElementById('connect-deployer').addEventListener('click', async () => {
  try {
    if (!window.ethereum) throw new Error('MetaMask is required.');
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    await checkNetwork();
    const accounts = await walletProvider.send('eth_requestAccounts', []);
    if (!accounts.some(a => a.toLowerCase() === deployerAddress.toLowerCase())) throw new Error('Connect account 1 in MetaMask.');
    walletSigner = await walletProvider.getSigner(deployerAddress);
    bundle = await (await fetch('/deploy-artifacts.json')).json();
    nextButton.disabled = false;
    statusNode.textContent = `Connected ${deployerAddress} on Sepolia. Ready for next deployment.`;
    saveRecord();
  } catch (error) { statusNode.textContent = error.shortMessage || error.message; }
});
nextButton.addEventListener('click', async () => {
  if (deploymentBusy || !walletSigner) return;
  deploymentBusy = true; nextButton.disabled = true;
  try {
    await checkNetwork();
    const pending = record.contracts.find(c => c.deploymentStatus !== 'Confirmed');
    if (pending) {
      statusNode.textContent = 'Resuming saved deployment transaction; no new transaction sent.';
      await confirmDeployment(pending);
    } else {
      const name = names[record.contracts.length];
      if (!name) { statusNode.textContent = 'All three deployments are confirmed.'; return; }
      const args = name === 'LearningRewardToken' ? [deployerAddress, ethers.parseEther('1000000')]
        : [record.contracts[0].address];
      const artifact = bundle.contracts[name];
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, walletSigner);
      const txRequest = await factory.getDeployTransaction(...args);
      statusNode.textContent = `${name}: review deployment in MetaMask (0 ETH plus Sepolia gas).`;
      const tx = await walletSigner.sendTransaction(txRequest);
      const entry = { name, deployer: deployerAddress, transactionHash: tx.hash,
        constructorArguments: args.map(String), creationBytecodeHash: ethers.keccak256(artifact.bytecode),
        deploymentStatus: 'Submitted', verification: 'Not yet verified' };
      if (!record.deployedAt) record.deployedAt = new Date().toISOString();
      record.compiler = bundle.compiler; record.optimizer = bundle.optimizer; record.evmVersion = bundle.evmVersion;
      record.contracts.push(entry); saveRecord();
      statusNode.textContent = `${name}: submitted ${tx.hash}; waiting for confirmation.`;
      await confirmDeployment(entry);
    }
    statusNode.textContent = `${record.contracts.length}/3 contracts confirmed. ${record.completedAt ? 'Deployment complete.' : 'Ready for next contract.'}`;
  } catch (error) { statusNode.textContent = error.shortMessage || error.message; }
  finally { deploymentBusy = false; nextButton.disabled = !!record.completedAt; }
});
saveRecord();
