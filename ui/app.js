/* global ethers */
const $ = id => document.getElementById(id);
const states = ['Draft', 'Registration open', 'Locked', 'Result pending', 'Disputed', 'Finalized', 'Cancelled'];
let provider, signer, account, config, token, vault, exchange, tournament;
let busy = false;
let choosingAccount = false;
let connecting = false;
let loadedTournamentId = null;
const eth = value => ethers.formatEther(value);
const id = () => BigInt($('tournament-id').value);
const date = value => Number(value) ? new Date(Number(value) * 1000).toLocaleString() : '—';
const message = text => { $('notice').textContent = text; };
async function transact(label, promise) {
  message(`${label}: waiting for wallet approval…`);
  const tx = await promise;
  message(`${label}: waiting for confirmation…`);
  const row = document.createElement('li');
  row.textContent = `${label}: ${tx.hash}`;
  if (config.chainId === 11155111) {
    const link = document.createElement('a'); link.href = `https://sepolia.etherscan.io/tx/${tx.hash}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = tx.hash;
    row.textContent = `${label}: `; row.append(link);
  }
  $('activity').prepend(row);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Transaction reverted');
  return receipt;
}
async function action(work) {
  if (busy) return;
  if (connecting) { message('Wait for the wallet account to finish connecting.'); return; }
  busy = true;
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    if (!signer) throw new Error('Connect your wallet first.');
    await work(); await refresh(); message('Confirmed. Account and tournament balances refreshed.');
  } catch (error) { message(error.shortMessage || error.reason || error.message); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
}
async function refresh() {
  const requestedId = id();
  $('balance').textContent = `${eth(await token.balanceOf(account))} LRT`;
  $('vault-credit').textContent = `${eth(await vault.ethCredits(account))} ETH`;
  $('reserve').textContent = `${eth(await exchange.availableReserve())} ETH`;
  $('exchange-credit').textContent = `Your redemption credit: ${eth(await exchange.ethCredits(account))} ETH`;
  try {
    const loaded = await vault.getTournament(requestedId);
    const prizeCredit = await vault.prizeCredits(requestedId, account);
    if (requestedId !== id()) return;
    tournament = loaded; loadedTournamentId = requestedId;
    const rows = [
      ['Status', states[Number(tournament.state)]], ['Prize', `${eth(tournament.rules.prize)} LRT`],
      ['Entry fee', `${eth(tournament.rules.entryFee)} ETH`], ['Players', `${tournament.playerCount} / ${tournament.rules.maxPlayers}`],
      ['Organizer', tournament.organizer], ['Referee', tournament.referee], ['Resolver', tournament.resolver],
      ['Registration closes', date(tournament.rules.registrationDeadline)], ['Results due', date(tournament.rules.resultDeadline)],
      ['Objections close', date(tournament.disputeDeadline)], ['Resolution due', date(tournament.resolutionDeadline)],
      ['Your prize credit', `${eth(prizeCredit)} LRT`]
    ];
    const dl = document.createElement('dl');
    for (const [label, value] of rows) { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; dl.append(dt, dd); }
    $('tournament').replaceChildren(dl);
  } catch (error) {
    if (requestedId !== id()) return;
    tournament = null; loadedTournamentId = null;
    $('tournament').textContent = error.code === 'CALL_EXCEPTION'
      ? `Tournament ${requestedId} could not be read. Check the number and wallet network.`
      : 'Unable to load the tournament. Check the wallet network and try again.';
  }
}
$('connect').onclick = async () => {
  if (busy || connecting) return;
  connecting = true;
  try {
    if (!window.ethereum) throw new Error('Install or enable an Ethereum wallet extension to connect.');
    const response = await fetch('/config.json');
    if (!response.ok) throw new Error('Deploy contracts first to create the connection settings.');
    config = await response.json();
    const targetChain = `0x${Number(config.chainId).toString(16)}`;
    const chain = await window.ethereum.request({ method: 'eth_chainId' });
    if (chain !== targetChain) await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChain }] });
    const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })).map(ethers.getAddress);
    if (!accounts.length) throw new Error('Select an account in your wallet.');
    const selected = accounts.find(address => address.toLowerCase() === $('wallet-account').value.toLowerCase()) || accounts[0];
    $('wallet-account').replaceChildren(...accounts.map(address => {
      const option = document.createElement('option'); option.value = address; option.textContent = address; return option;
    }));
    $('wallet-account').value = selected;
    $('wallet-account').disabled = false;
    if (provider) provider.destroy();
    provider = new ethers.BrowserProvider(window.ethereum);
    provider.on('debug', event => {
      if (event.action === 'sendEip1193Request') {
        const method = event.payload?.method;
        if (typeof method === 'string') console.info('Wallet request method:', method);
        if (busy && method === 'eth_estimateGas') message('Checking transaction gas with the wallet network…');
        if (busy && method === 'eth_sendTransaction') message('Please review the transaction in your wallet.');
      }
    });
    signer = await provider.getSigner(selected); account = await signer.getAddress();
    const contract = name => new ethers.Contract(config.contracts[name].address, config.contracts[name].abi, signer);
    token = contract('LearningRewardToken'); vault = contract('TournamentVault'); exchange = contract('LRTExchange');
    $('connect').textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
    $('network').textContent = config.chainId === 11155111 ? 'Sepolia testnet' : 'Local development · 31337';
    await refresh(); message('Wallet connected. Select a tournament or create one below.');
  } catch (error) { message(error.shortMessage || error.message); }
  finally { connecting = false; }
};
$('wallet-account').onchange = () => {
  if (busy || connecting) { $('wallet-account').value = account || ''; return; }
  $('connect').onclick();
};
$('choose-account').onclick = async () => {
  if (busy || choosingAccount || connecting) return;
  choosingAccount = true;
  $('choose-account').disabled = true;
  try {
    if (!window.ethereum) throw new Error('Install or enable an Ethereum wallet extension to connect.');
    message('Select the demo accounts to connect in your wallet. No transaction is requested.');
    await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    await $('connect').onclick();
  } catch (error) { message(error.shortMessage || error.message); }
  finally { choosingAccount = false; $('choose-account').disabled = false; }
};
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', () => { if (!choosingAccount) location.reload(); });
  window.ethereum.on('chainChanged', () => location.reload());
}
$('lookup').onsubmit = event => { event.preventDefault(); action(refresh); };
$('tournament-id').oninput = () => {
  tournament = null; loadedTournamentId = null;
  $('tournament').textContent = 'Tournament selection changed. Click Load tournament before using tournament actions.';
};
function requireTournament() {
  if (!tournament || loadedTournamentId !== id()) throw new Error('Load the selected tournament first.');
  return loadedTournamentId;
}
$('actions').onclick = event => {
  const method = event.target.dataset.action; if (!method) return;
  action(async () => {
    const n = requireTournament();
    const methods = {
      open: async () => { await transact('Approve prize', token.approve(vault.target, tournament.rules.prize)); await transact('Fund & open', vault.fundAndOpen(n)); },
      register: () => transact('Register', vault.register(n, { value: tournament.rules.entryFee })),
      lock: () => transact('Lock roster', vault.lockRegistration(n)),
      finalize: () => transact('Finalize result', vault.finalizeResult(n)),
      prize: () => transact('Withdraw LRT prize', vault.withdrawPrize(n, account)),
      refund: () => transact('Credit fee refund', vault.claimRefund(n)),
      fees: () => transact('Withdraw vault ETH', vault.withdrawETH(account)),
      'organizer-refund': () => transact('Return organizer prize', vault.refundOrganizer(n, account)),
      timeout: () => transact('Cancel expired tournament', vault.cancelExpired(n)),
      cancel: () => transact('Cancel tournament', vault.cancelTournament(n))
    };
    await methods[method]();
  });
};
$('create').onsubmit = event => {
  event.preventDefault(); const form = new FormData(event.target);
  action(async () => {
    const shares = form.get('shares').split(',').map(value => {
      const bps = Number(value.trim()) * 100;
      if (!Number.isInteger(bps) || bps <= 0) throw new Error('Use positive percentage shares with at most two decimal places.');
      return bps;
    });
    if (shares.reduce((a, b) => a + b, 0) !== 10000) throw new Error('Prize shares must add up to 100%.');
    const rules = { entryFee: ethers.parseEther(form.get('fee')), prize: ethers.parseEther(form.get('prize')),
      maxPlayers: Number(form.get('capacity')), registrationDeadline: Math.floor(new Date(form.get('registration')).getTime() / 1000),
      resultDeadline: Math.floor(new Date(form.get('result')).getTime() / 1000), disputeWindow: Number(form.get('objection')) * 60,
      resolutionWindow: Number(form.get('resolution')) * 60 };
    const receipt = await transact('Create tournament', vault.createTournament(rules, ethers.getAddress(form.get('referee')), ethers.getAddress(form.get('resolver')), shares));
    for (const log of receipt.logs) {
      try { const parsed = vault.interface.parseLog(log); if (parsed?.name === 'TournamentCreated') $('tournament-id').value = String(parsed.args.id); } catch {}
    }
  });
};
$('results').onsubmit = event => {
  event.preventDefault(); const mode = event.submitter.value;
  action(async () => {
    const n = requireTournament();
    const winners = $('winners').value.split(/[\s,]+/).filter(Boolean).map(ethers.getAddress);
    const hash = ethers.id($('evidence').value);
    await transact(mode === 'resolve' ? 'Resolve dispute' : 'Submit result', mode === 'resolve' ? vault.resolveDispute(n, winners, hash) : vault.submitResult(n, winners, hash));
  });
};
$('dispute').onsubmit = event => { event.preventDefault(); action(() => transact('Raise objection', vault.raiseDispute(requireTournament(), ethers.id($('reason').value)))); };
$('redeem').onsubmit = event => { event.preventDefault(); action(async () => {
  const amount = ethers.parseEther($('redeem-amount').value); await exchange.quote(amount);
  await transact('Approve LRT redemption', token.approve(exchange.target, amount)); await transact('Redeem LRT', exchange.redeem(amount));
}); };
$('exchange-withdraw').onclick = () => action(() => transact('Withdraw redemption ETH', exchange.withdrawETH(account)));
$('buy').onsubmit = event => { event.preventDefault(); action(() => transact('Buy LRT', exchange.buy({ value: ethers.parseEther($('buy-amount').value) }))); };
$('reserve-fund').onsubmit = event => { event.preventDefault(); action(() => transact('Fund exchange reserve', signer.sendTransaction({ to: exchange.target, value: ethers.parseEther($('fund-amount').value) }))); };
$('inventory-fund').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const amount = ethers.parseEther($('inventory-amount').value);
    if (amount <= 0n) throw new Error('Enter a positive LRT amount.');
    await transact('Fund exchange LRT inventory', token.transfer(exchange.target, amount));
  });
};
