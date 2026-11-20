const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const solc = require('solc');
const root = path.resolve(__dirname, '..');
const findings = [];
const hashes = {};
let nodes = 0;
const input = { language: 'Solidity', sources: {}, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
  outputSelection: { '*': { '': ['ast'], '*': ['evm.deployedBytecode.object'] } } } };
for (const name of ['LearningRewardToken', 'TournamentVault', 'TournamentVaultV3', 'LRTExchange']) {
  const filename = `contracts/${name}.sol`;
  const content = fs.readFileSync(path.join(root, filename), 'utf8');
  input.sources[filename] = { content };
  hashes[filename] = crypto.createHash('sha256').update(content).digest('hex');
}
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: filename => {
  try { return { contents: fs.readFileSync(path.join(root, 'node_modules', filename), 'utf8') }; }
  catch { return { error: `Import not found: ${filename}` }; }
} }));
const errors = (output.errors || []).filter(e => e.severity === 'error');
if (errors.length) { console.error(errors.map(e => e.formattedMessage).join('\n')); process.exitCode = 1; }
function walk(node, source, line) {
  if (!node || typeof node !== 'object') return;
  if (node.nodeType) nodes++;
  const lineAt = () => line.slice(0, Number(node.src.split(':')[0])).split('\n').length;
  const emit = (severity, rule, detail) => findings.push({ severity, rule, source, line: lineAt(), detail });
  if (node.nodeType === 'MemberAccess') {
    if (node.memberName === 'origin' && node.expression?.name === 'tx') emit('High', 'tx-origin', 'Origin-based authorization must not be used');
    if (node.memberName === 'delegatecall') emit('High', 'delegatecall', 'Delegate execution needs explicit review');
    if (node.memberName === 'timestamp' && node.expression?.name === 'block') emit('Review', 'timestamp', 'Deadline boundary: timestamp has limited proposer influence');
    if (node.memberName === 'call') emit('Review', 'external-call', 'Check return value, effects before interaction, reentrancy guard and recipient scope');
  }
  if (node.nodeType === 'FunctionCall' && ['selfdestruct', 'suicide'].includes(node.expression?.name)) emit('High', 'selfdestruct', 'Unexpected destructive operation');
  if (node.nodeType === 'InlineAssembly') emit('Review', 'assembly', 'Review low-level operations manually');
  if (node.nodeType === 'ForStatement') emit('Review', 'loop', 'Confirm bounded input and settlement gas cost');
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => walk(item, source, line));
    else if (value && typeof value === 'object') walk(value, source, line);
  }
}
for (const filename of Object.keys(input.sources)) walk(output.sources?.[filename]?.ast, filename, input.sources[filename].content);
const sizes = [];
for (const [filename, contracts] of Object.entries(output.contracts || {})) {
  if (!input.sources[filename]) continue;
  for (const [name, contract] of Object.entries(contracts)) sizes.push({ contract: name, runtimeBytes: contract.evm.deployedBytecode.object.length / 2 });
}
const report = { generatedAt: new Date().toISOString(), tool: 'Project Solidity AST checks', version: '1.0.0', compiler: solc.version(),
  scope: Object.keys(input.sources), astNodes: nodes, limitations: 'A small rule set and compiler diagnostics. This is not Slither, symbolic execution, formal verification or an independent audit.',
  compilerDiagnostics: output.errors || [], bytecodeSizes: sizes, findings, sourceSHA256: hashes };
fs.mkdirSync(path.join(root, 'audit'), { recursive: true });
fs.writeFileSync(path.join(root, 'audit', 'static-analysis.json'), JSON.stringify(report, null, 2));
console.log(`Compiler: ${report.compiler}; project AST nodes: ${nodes}; compiler errors: ${errors.length}`);
for (const size of sizes) console.log(`${size.contract}: ${size.runtimeBytes} runtime bytes (limit 24576)`);
const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
console.log(`Findings: ${JSON.stringify(counts)}. Review items require the manual analysis in audit/security-review.md.`);
if (findings.some(f => f.severity === 'High') || sizes.some(s => s.runtimeBytes > 24576)) process.exitCode = 1;
