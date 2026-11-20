// Uses only RPC reads and Etherscan GET; never creates a signer or submits a transaction.
require('dotenv').config();
const fs = require('fs');
const { ethers } = require('ethers');
const root = require('path').resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(`${root}/${p}`, 'utf8'));
const recordName = process.argv[2] || process.env.DEPLOYMENT_RECORD || 'sepolia';
if (!/^sepolia(?:-v\d+)?$/.test(recordName)) throw new Error('Unsupported deployment record');
const report = { checkedAt: new Date().toISOString(), mode: 'Read-only', deploymentRecord: recordName, contracts: [] };
let provider;
async function main() {
  const record = read(`deployment/${recordName}.json`);
  const request = new ethers.FetchRequest(process.env.SEPOLIA_RPC_URL); request.timeout = 15000;
  provider = new ethers.JsonRpcProvider(request, 11155111, { staticNetwork: true });
  report.chainId = Number(BigInt(await provider.send('eth_chainId', [])));
  if (report.chainId !== 11155111) throw new Error('WRONG_CHAIN');
  report.blockNumber = await provider.getBlockNumber();
  const call = (c, fn, args = []) => c[fn](...args, { blockTag: report.blockNumber });
  for (const c of record.contracts) {
    const artifact = read(`artifacts/contracts/${c.name}.sol/${c.name}.json`);
    const dbg = read(`artifacts/contracts/${c.name}.sol/${c.name}.dbg.json`);
    const build = JSON.parse(fs.readFileSync(require('path').resolve(root, `artifacts/contracts/${c.name}.sol`, dbg.buildInfo), 'utf8'));
    const compiled = build.output.contracts[`contracts/${c.name}.sol`][c.name];
    const contract = new ethers.Contract(c.address, artifact.abi, provider);
    const row = { name: c.name, address: c.address };
    report.contracts.push(row);
    const [receipt, tx, code] = await Promise.all([provider.getTransactionReceipt(c.transactionHash), provider.getTransaction(c.transactionHash), provider.getCode(c.address, report.blockNumber)]);
    row.receiptSuccess = receipt?.status === 1;
    row.deploymentBlock = receipt?.blockNumber;
    row.receiptAddressMatches = receipt?.contractAddress?.toLowerCase() === c.address.toLowerCase();
    row.confirmations = receipt ? report.blockNumber - receipt.blockNumber + 1 : 0;
    row.runtimeBytes = (code.length - 2) / 2;
    row.creationHashMatchesRecord = ethers.keccak256(artifact.bytecode) === c.creationBytecodeHash;
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    row.deploymentInputMatchesLocal = tx?.data === (await factory.getDeployTransaction(...c.constructorArguments)).data;
    let actual = code.slice(2), expected = compiled.evm.deployedBytecode.object;
    for (const refs of Object.values(compiled.evm.deployedBytecode.immutableReferences || {})) {
      for (const { start, length } of refs) {
        const mask = '0'.repeat(length * 2);
        actual = actual.slice(0, start * 2) + mask + actual.slice((start + length) * 2);
        expected = expected.slice(0, start * 2) + mask + expected.slice((start + length) * 2);
      }
    }
    row.runtimeMatchesLocalExcludingImmutables = actual === expected;
    row.balanceETH = ethers.formatEther(await provider.getBalance(c.address, report.blockNumber));
    if (c.name === 'LearningRewardToken') {
      row.state = { name: await call(contract, 'name'), symbol: await call(contract, 'symbol'), decimals: String(await call(contract, 'decimals')), totalSupplyLRT: ethers.formatEther(await call(contract, 'totalSupply')), deployerBalanceLRT: ethers.formatEther(await call(contract, 'balanceOf', [c.deployer])) };
      for (const other of record.contracts.filter(x => x.name !== c.name)) row.state[`${other.name}BalanceLRT`] = ethers.formatEther(await call(contract, 'balanceOf', [other.address]));
    } else {
      row.state = { token: await call(contract, 'token') };
      row.tokenMatches = row.state.token.toLowerCase() === record.contracts[0].address.toLowerCase();
      for (const fn of c.name.startsWith('TournamentVault') ? ['tournamentCount', 'ethLiability', 'tokenLiability'] : ['TOKEN_UNITS_PER_WEI', 'totalCredits', 'availableReserve']) row.state[fn] = String(await call(contract, fn));
    }
    try {
      const url = new URL('https://api.etherscan.io/v2/api');
      for (const [key, value] of Object.entries({ chainid: '11155111', module: 'contract', action: 'getsourcecode', address: c.address, apikey: process.env.ETHERSCAN_API_KEY || '' })) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      const source = Array.isArray(data.result) ? data.result[0] : undefined;
      row.explorer = { httpStatus: response.status, apiStatus: data.status, verified: Boolean(source?.SourceCode && source?.ABI !== 'Contract source code not verified'), contractName: source?.ContractName, compilerVersion: source?.CompilerVersion, optimizationUsed: source?.OptimizationUsed, runs: source?.Runs };
      if (row.explorer.verified) {
        let sourceText = source.SourceCode;
        if (sourceText.startsWith('{{')) sourceText = sourceText.slice(1, -1);
        const input = JSON.parse(sourceText);
        row.explorer.allSubmittedSourcesMatchLocalBuild = Object.entries(input.sources).every(([name, value]) => build.input.sources[name]?.content === value.content);
        const explorerArguments = typeof source.ConstructorArguments === 'string' ? source.ConstructorArguments.replace(/^0x/i, '').toLowerCase() : null;
        row.explorer.constructorArgumentsAvailable = explorerArguments !== null;
        row.explorer.constructorArgumentsMatch = explorerArguments === null ? null
          : explorerArguments === tx.data.slice(artifact.bytecode.length).replace(/^0x/i, '').toLowerCase();
      }
    } catch { row.explorer = { status: 'Query failed; no credentials logged' }; }
    console.log(JSON.stringify(row, null, 2));
  }
}
main().catch(() => { report.error = 'Read-only check failed; raw error suppressed to protect credentials'; process.exitCode = 1; }).finally(() => {
  provider?.destroy();
  const outputName = recordName === 'sepolia' ? 'read-only-check.json' : `${recordName}-read-only-check.json`;
  fs.writeFileSync(`${root}/deployment/${outputName}`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ chainId: report.chainId, blockNumber: report.blockNumber, error: report.error }));
});
