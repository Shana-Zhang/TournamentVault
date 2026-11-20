const { main } = require('./verify');

main('sepolia-v2').catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
