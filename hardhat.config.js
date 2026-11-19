require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');
require('solidity-coverage');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion === '0.8.26') return {
    compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true,
    version: solcVersion, longVersion: require('solc').version().split('.Emscripten')[0]
  };
  return runSuper();
});
module.exports = {
  solidity: { version: '0.8.26', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: 'http://127.0.0.1:8545' },
    ...(process.env.SEPOLIA_RPC_URL ? { sepolia: {
      url: process.env.SEPOLIA_RPC_URL, chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    } } : {})
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || '' }
};

