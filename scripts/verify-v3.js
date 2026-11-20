const { main } = require('./verify');
main('sepolia-v3').catch(error => { console.error(error.message); process.exitCode = 1; });
