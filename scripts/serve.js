const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const allow = {
  '/': ['ui/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['ui/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['ui/style.css', 'text/css; charset=utf-8'],
  '/config.json': ['ui/config.json', 'application/json'],
  '/ethers.js': ['node_modules/ethers/dist/ethers.umd.min.js', 'text/javascript; charset=utf-8']
};
function handler(req, res) {
  const file = allow[new URL(req.url, 'http://localhost').pathname];
  if (!file || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, file[0]), (error, bytes) => {
    if (error) { res.writeHead(404); res.end('Deploy contracts on the local node or Sepolia first.'); return; }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' http://127.0.0.1:8545; object-src 'none'; base-uri 'none'" }); res.end(bytes);
  });
}
module.exports = { handler };
if (require.main === module) http.createServer(handler).listen(8080, '127.0.0.1', () => console.log('TournamentVault: http://127.0.0.1:8080'));
