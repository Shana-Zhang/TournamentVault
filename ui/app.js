/* global ethers */
const $ = id => document.getElementById(id);
const states = ['Draft', 'Registration open', 'Locked', 'Result pending', 'Disputed', 'Finalized', 'Cancelled'];
let provider, signer, account, config, token, vault, exchange, tournament;
let busy = false;
let choosingAccount = false;
let connecting = false;
let loadedTournamentId = null;
const activityEntries = new Map();
let activityStatus = '';
let activityLoadId = 0;
let directoryLoadId = 0;
const vaultContractName = () => config?.contracts?.TournamentVaultV3 ? 'TournamentVaultV3' : 'TournamentVault';
const vaultConfig = () => config.contracts[vaultContractName()];
const eth = value => ethers.formatEther(value);
const id = () => BigInt($('tournament-id').value);
const date = value => Number(value) ? new Date(Number(value) * 1000).toLocaleString() : '—';
const message = text => { $('notice').textContent = text; };
function renderActivity() {
  const rows = [...activityEntries.values()]
    .sort((a, b) => (b.blockNumber ?? Number.MAX_SAFE_INTEGER) - (a.blockNumber ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 100);
  const items = rows.map(entry => {
    const row = document.createElement('li');
    row.append(document.createTextNode(`${entry.label}: `));
    if (config?.chainId === 11155111) {
      const link = document.createElement('a');
      link.href = `https://sepolia.etherscan.io/tx/${entry.hash}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = entry.hash;
      row.append(link);
    } else row.append(document.createTextNode(entry.hash));
    return row;
  });
  if (!rows.length && !activityStatus) activityStatus = 'No contract transactions found for this account.';
  if (activityStatus) {
    const status = document.createElement('li');
    status.className = 'muted'; status.textContent = activityStatus;
    items.push(status);
    if (config?.chainId === 11155111 && account) {
      const linkRow = document.createElement('li');
      const link = document.createElement('a');
      link.href = `https://sepolia.etherscan.io/address/${account}#transactions`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'View all Sepolia account transactions on Etherscan';
      linkRow.append(link); items.push(linkRow);
    }
  }
  $('activity').replaceChildren(...items);
}
function addActivity(label, hash, blockNumber = null) {
  activityEntries.set(hash, { label, hash, blockNumber });
  activityStatus = '';
  renderActivity();
}
function labelTransaction(tx, interfaces) {
  if (!tx.to) return null;
  const contractName = Object.keys(config.contracts).find(name => config.contracts[name].address.toLowerCase() === tx.to.toLowerCase());
  if (!contractName) return null;
  const parsed = interfaces[contractName].parseTransaction({ data: tx.data, value: tx.value });
  if (!parsed) return contractName === 'LRTExchange' && tx.data === '0x' ? 'Fund exchange reserve' : null;
  const names = {
    LearningRewardToken: { approve: 'Approve LRT', transfer: 'Transfer LRT' },
    TournamentVaultV3: {
      createTournament: 'Create tournament with ETH prize', fundAndOpen: 'Open & fund LRT bonus', register: 'Register',
      lockRegistration: 'Lock roster', submitResult: 'Submit result', resolveDispute: 'Resolve dispute',
      raiseDispute: 'Raise objection', finalizeResult: 'Finalize result', withdrawPrize: 'Withdraw ETH prize + LRT bonus',
      claimRefund: 'Claim fee refund', withdrawETH: 'Withdraw vault ETH', refundOrganizer: 'Return organizer prize',
      cancelExpired: 'Cancel expired tournament', cancelTournament: 'Cancel tournament'
    },
    TournamentVault: {
      createTournament: 'Create tournament', fundAndOpen: 'Fund & open', register: 'Register',
      lockRegistration: 'Lock roster', submitResult: 'Submit result', resolveDispute: 'Resolve dispute',
      raiseDispute: 'Raise objection', finalizeResult: 'Finalize result', withdrawPrize: 'Withdraw LRT prize',
      claimRefund: 'Claim fee refund', withdrawETH: 'Withdraw vault ETH', refundOrganizer: 'Return organizer prize',
      cancelExpired: 'Cancel expired tournament', cancelTournament: 'Cancel tournament'
    },
    LRTExchange: { buy: 'Buy LRT', redeem: 'Redeem LRT', withdrawETH: 'Withdraw redemption ETH' }
  };
  if (contractName === 'LearningRewardToken' && parsed.name === 'transfer' && parsed.args.to.toLowerCase() === config.contracts.LRTExchange.address.toLowerCase())
    return 'Fund exchange LRT inventory';
  if (contractName === 'LearningRewardToken' && parsed.name === 'approve') {
    if (parsed.args.spender.toLowerCase() === vaultConfig().address.toLowerCase()) return 'Approve LRT bonus';
    if (parsed.args.spender.toLowerCase() === config.contracts.LRTExchange.address.toLowerCase()) return 'Approve LRT redemption';
  }
  return names[contractName]?.[parsed.name] || `Contract action (${parsed.name})`;
}
function updateRoleInterface(t, isRegistered, prizeCredit, ethCredit, refundClaimed, organizerRefundClaimed, chainTime) {
  const current = account.toLowerCase();
  const organizer = t.organizer.toLowerCase() === current;
  const referee = t.referee.toLowerCase() === current;
  const resolver = t.resolver.toLowerCase() === current;
  const assigned = organizer || referee || resolver;
  const state = Number(t.state);
  const now = chainTime;
  const registrationOpen = state === 1 && now < Number(t.rules.registrationDeadline);
  const canRegister = registrationOpen && !assigned && !isRegistered && Number(t.playerCount) < Number(t.rules.maxPlayers);
  const canDispute = state === 3 && isRegistered && now < Number(t.disputeDeadline);
  const canSubmit = referee && state === 2 && now < Number(t.rules.resultDeadline);
  const canResolve = resolver && state === 4 && now < Number(t.resolutionDeadline);
  const canLock = state === 1 && now >= Number(t.rules.registrationDeadline);
  const canFinalize = state === 3 && now >= Number(t.disputeDeadline);
  const canTimeout = (state === 0 && now >= Number(t.rules.registrationDeadline))
    || ((state === 1 || state === 2) && now >= Number(t.rules.resultDeadline))
    || (state === 4 && now >= Number(t.resolutionDeadline));
  const canOrganizerCancel = organizer && Number(t.playerCount) === 0 && (state === 0 || state === 1);
  $('actions').hidden = false;
  document.querySelectorAll('#actions [data-role]').forEach(element => {
    const role = element.dataset.role;
    const allowed = role === 'organizer'
      ? organizer && ((element.dataset.action === 'open' && state === 0 && now < Number(t.rules.registrationDeadline))
        || (element.dataset.action === 'cancel' && canOrganizerCancel)
        || (element.dataset.action === 'organizer-refund' && state === 6 && !organizerRefundClaimed
          && (vault.ethPrizeCredits || t.funded)))
      : role === 'registered'
        ? isRegistered && ((element.dataset.action === 'refund' && state === 6 && !refundClaimed))
        : role === 'eth-credit' ? ethCredit > 0n
          : role === 'prize-credit' ? prizeCredit > 0n
            : role === 'eligible' ? canRegister
              : role === 'any' && ((element.dataset.action === 'lock' && canLock)
                || (element.dataset.action === 'finalize' && canFinalize)
                || (element.dataset.action === 'timeout' && canTimeout));
    element.hidden = !allowed;
  });
  const resultForm = $('results');
  resultForm.hidden = !canSubmit && !canResolve;
  resultForm.querySelector('[name="mode"][value="submit"]').hidden = !canSubmit;
  resultForm.querySelector('[name="mode"][value="resolve"]').hidden = !canResolve;
  $('dispute').hidden = !canDispute;
  $('results-card').hidden = resultForm.hidden && $('dispute').hidden;
  $('role-summary').textContent = [
    organizer && 'Organizer', referee && 'Referee', resolver && 'Resolver',
    isRegistered && 'Registered player', !assigned && !isRegistered && 'Not assigned to this tournament'
  ].filter(Boolean).join(' · ');
}
async function readEventLogs(contract, filter, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const topics = await filter.getTopicFilter();
  const chunkSize = 5000, concurrency = 4, result = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize * concurrency) {
    const ranges = Array.from({ length: concurrency }, (_, index) => {
      const rangeStart = start + index * chunkSize;
      return rangeStart <= toBlock ? { address: contract.target, topics,
        fromBlock: rangeStart, toBlock: Math.min(rangeStart + chunkSize - 1, toBlock) } : null;
    }).filter(Boolean);
    const batches = await Promise.all(ranges.map(range => provider.getLogs(range)));
    result.push(...batches.flat().map(log => contract.interface.parseLog(log)).filter(Boolean));
  }
  return result;
}
async function loadTournamentDirectory() {
  if (!provider || !vault || !config) return;
  const loadId = ++directoryLoadId;
  $('directory-status').textContent = 'Loading recent tournaments…';
  try {
    const count = BigInt(await vault.tournamentCount());
    const first = count > 50n ? count - 49n : 1n;
    const entries = [];
    for (let start = first; start <= count; start += 10n) {
      const ids = Array.from({ length: Number(count - start + 1n > 10n ? 10n : count - start + 1n) }, (_, i) => start + BigInt(i));
      entries.push(...await Promise.all(ids.map(async tournamentId => ({
        id: tournamentId,
        tournament: await vault.getTournament(tournamentId)
      }))));
    }
    if (loadId !== directoryLoadId) return;
    const rows = entries.map(({ id: tournamentId, tournament: t }) => {
      const row = document.createElement('tr');
      const values = [`#${tournamentId}`, states[Number(t.state)],
        `${t.playerCount} / ${t.rules.maxPlayers}`,
        `${eth(t.rules.ethPrize ?? t.rules.prize)} ETH + ${eth(t.rules.lrtBonus ?? 0n)} LRT`, `${t.organizer.slice(0, 6)}…${t.organizer.slice(-4)}`];
      for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      const actionCell = document.createElement('td'), button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary'; button.dataset.loadTournament = String(tournamentId);
      button.textContent = 'Open'; actionCell.append(button); row.append(actionCell);
      return row;
    });
    $('tournament-list').replaceChildren(...rows);
    $('directory-status').textContent = entries.length
      ? `Showing the ${entries.length} most recent tournament${entries.length === 1 ? '' : 's'}.`
      : 'No tournaments found for this deployment.';
  } catch (error) {
    if (loadId !== directoryLoadId) return;
    const reason = error?.code ?? error?.info?.error?.code ?? error?.name ?? 'Error';
    $('directory-status').textContent = `Could not load the tournament directory (${stage}: ${reason}).`;
  }
}
async function appendTournamentParticipants(container, tournamentId, tournament) {
  const from = Math.max(0, Number(config.activityFromBlock ?? 0));
  const latest = await provider.getBlockNumber();
  const events = (await readEventLogs(vault, vault.filters.PlayerRegistered(tournamentId), from, latest))
    .filter(event => BigInt(event.args.id) === BigInt(tournamentId));
  const playerCount = Number(tournament.playerCount);
  const roster = document.createElement('div'); roster.className = 'roster';
  const title = document.createElement('h3'); title.textContent = `Registered players (${playerCount})`; roster.append(title);
  if (playerCount > 0 && events.length === playerCount) {
    const list = document.createElement('ol');
    for (const event of events) { const item = document.createElement('li'); item.textContent = event.args.player; list.append(item); }
    roster.append(list);
  } else if (playerCount > 0) {
    const warning = document.createElement('p'); warning.className = 'muted';
    warning.textContent = 'The contract player count is available, but the registration event list could not be reconciled.';
    roster.append(warning);
  } else {
    const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No players have registered.'; roster.append(empty);
  }
  if (tournament.winners.length) {
    const resultTitle = document.createElement('h3'); resultTitle.textContent = 'Current ranking'; roster.append(resultTitle);
    const winners = document.createElement('ol');
    for (const address of tournament.winners) { const item = document.createElement('li'); item.textContent = address; winners.append(item); }
    roster.append(winners);
    if (tournament.evidenceHash !== ethers.ZeroHash) {
      const evidence = document.createElement('p'); evidence.className = 'muted';
      evidence.textContent = `Evidence hash: ${tournament.evidenceHash}`; roster.append(evidence);
    }
  }
  container.append(roster);
}
async function loadHistoricalActivity() {
  if (!provider || !account || !config) return;
  const requestId = ++activityLoadId;
  const selectedAccount = account.toLowerCase();
  const selectedProvider = provider;
  activityStatus = 'Loading on-chain contract history…'; renderActivity();
  try {
    const latestBlock = await selectedProvider.getBlockNumber();
    const fromBlock = Math.max(0, Number(config.activityFromBlock ?? 0));
    const addresses = Object.values(config.contracts).map(item => item.address);
    const logs = [];
    const chunkSize = 5000;
    const concurrentChunks = 4;
    for (let start = fromBlock; start <= latestBlock; start += chunkSize * concurrentChunks) {
      const ranges = Array.from({ length: concurrentChunks }, (_, index) => {
        const rangeStart = start + index * chunkSize;
        return rangeStart <= latestBlock ? {
          address: addresses,
          fromBlock: rangeStart,
          toBlock: Math.min(rangeStart + chunkSize - 1, latestBlock)
        } : null;
      }).filter(Boolean);
      const batches = await Promise.all(ranges.map(filter => selectedProvider.getLogs(filter)));
      logs.push(...batches.flat());
    }
    const interfaces = Object.fromEntries(Object.entries(config.contracts).map(([name, item]) => [name, new ethers.Interface(item.abi)]));
    const hashes = [...new Set(logs.map(log => log.transactionHash))];
    const hashBlocks = new Map();
    for (const log of logs) if (!hashBlocks.has(log.transactionHash)) hashBlocks.set(log.transactionHash, log.blockNumber);
    const history = [];
    for (let start = 0; start < hashes.length; start += 10) {
      const batch = await Promise.all(hashes.slice(start, start + 10).map(async hash => {
        const tx = await selectedProvider.getTransaction(hash);
        if (!tx || tx.from.toLowerCase() !== selectedAccount) return null;
        let label;
        try { label = labelTransaction(tx, interfaces); } catch { return null; }
        return label ? { label, hash, blockNumber: hashBlocks.get(hash) ?? null } : null;
      }));
      history.push(...batch);
    }
    if (requestId !== activityLoadId || account.toLowerCase() !== selectedAccount) return;
    for (const entry of history) if (entry) activityEntries.set(entry.hash, entry);
    const count = [...activityEntries.values()].length;
    activityStatus = count ? `Loaded ${count} contract transactions for this account.` : 'No contract transactions found for this account.';
    renderActivity();
  } catch (error) {
    if (requestId !== activityLoadId || account.toLowerCase() !== selectedAccount) return;
    activityStatus = 'Could not load on-chain history from this wallet RPC. Use the Etherscan link below to view it.';
    renderActivity();
  }
}
async function transact(label, promise) {
  message(`${label}: waiting for wallet approval…`);
  const tx = await promise;
  message(`${label}: waiting for confirmation…`);
  addActivity(label, tx.hash);
  const receipt = await tx.wait();
  if (receipt.status !== 1) { activityEntries.delete(tx.hash); renderActivity(); throw new Error('Transaction reverted'); }
  addActivity(label, tx.hash, receipt.blockNumber);
  return receipt;
}
async function action(work) {
  if (busy) return;
  if (connecting) { message('Wait for the wallet account to finish connecting.'); return; }
  busy = true;
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    if (!signer) throw new Error('Connect your wallet first.');
    await work(); await refresh(); await loadTournamentDirectory(); message('Confirmed. Account and tournament balances refreshed.');
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
    const ethPrizeCredit = vault.ethPrizeCredits ? await vault.ethPrizeCredits(requestedId, account) : 0n;
    const [isRegistered, refundClaimed, organizerRefundClaimed] = await Promise.all([
      vault.registered(requestedId, account), vault.refundClaimed(requestedId, account), vault.organizerRefundClaimed(requestedId)
    ]);
    if (requestedId !== id()) return;
    tournament = loaded; loadedTournamentId = requestedId;
    const latestBlock = await provider.getBlock('latest');
    updateRoleInterface(loaded, isRegistered, prizeCredit + ethPrizeCredit, await vault.ethCredits(account), refundClaimed, organizerRefundClaimed, latestBlock.timestamp);
    const rows = [
      ['Status', states[Number(tournament.state)]],
      ['ETH prize', `${eth(tournament.rules.ethPrize ?? tournament.rules.prize)} ETH`],
      ['LRT bonus', `${eth(tournament.rules.lrtBonus ?? 0n)} LRT`],
      ['Entry fee', `${eth(tournament.rules.entryFee)} ETH`], ['Players', `${tournament.playerCount} / ${tournament.rules.maxPlayers}`],
      ['Organizer', tournament.organizer], ['Referee', tournament.referee], ['Resolver', tournament.resolver],
      ['Registration closes', date(tournament.rules.registrationDeadline)], ['Results due', date(tournament.rules.resultDeadline)],
      ['Objections close', date(tournament.disputeDeadline)], ['Resolution due', date(tournament.resolutionDeadline)],
      ['Your ETH prize credit', `${eth(ethPrizeCredit)} ETH`], ['Your LRT bonus credit', `${eth(prizeCredit)} LRT`]
    ];
    const dl = document.createElement('dl');
    for (const [label, value] of rows) { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; dl.append(dt, dd); }
    $('tournament').replaceChildren(dl);
    try { await appendTournamentParticipants($('tournament'), requestedId, tournament); }
    catch { const warning = document.createElement('p'); warning.className = 'muted'; warning.textContent = 'Could not load the entrant list from this wallet RPC.'; $('tournament').append(warning); }
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
    token = contract('LearningRewardToken'); vault = contract(vaultContractName()); exchange = contract('LRTExchange');
    activityEntries.clear(); activityStatus = 'Loading on-chain contract history…'; renderActivity();
    $('connect').textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
    $('network').textContent = config.chainId === 11155111 ? 'Sepolia testnet' : 'Local development · 31337';
    await refresh(); await Promise.all([loadHistoricalActivity(), loadTournamentDirectory()]); message('Wallet connected. Select a tournament or create one below.');
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
$('tournament-list').onclick = event => {
  const button = event.target.closest('[data-load-tournament]'); if (!button) return;
  $('tournament-id').value = button.dataset.loadTournament;
  $('tournament-id').dispatchEvent(new Event('input', { bubbles: true }));
  action(refresh);
};
$('tournament-id').oninput = () => {
  tournament = null; loadedTournamentId = null;
  $('actions').hidden = true; $('results-card').hidden = true;
  $('role-summary').textContent = 'Load a tournament to see actions for your role.';
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
      open: async () => {
        const bonus = tournament.rules.lrtBonus ?? 0n;
        const allowance = bonus > 0n ? await token.allowance(account, vault.target) : 0n;
        if (bonus > 0n && allowance < bonus)
          await transact('Approve LRT bonus', token.approve(vault.target, bonus));
        await transact('Fund & open', vault.fundAndOpen(n));
      },
      register: () => transact('Register', vault.register(n, { value: tournament.rules.entryFee })),
      lock: () => transact('Lock roster', vault.lockRegistration(n)),
      finalize: () => transact('Finalize result', vault.finalizeResult(n)),
      prize: () => transact('Withdraw ETH prize + LRT bonus', vault.withdrawPrize(n, account)),
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
    const rules = { entryFee: ethers.parseEther(form.get('fee')), ethPrize: ethers.parseEther(form.get('ethPrize')),
      lrtBonus: ethers.parseEther(form.get('lrtBonus') || '0'),
      maxPlayers: Number(form.get('capacity')), registrationDeadline: Math.floor(new Date(form.get('registration')).getTime() / 1000),
      resultDeadline: Math.floor(new Date(form.get('result')).getTime() / 1000), disputeWindow: Number(form.get('objection')) * 60,
      resolutionWindow: Number(form.get('resolution')) * 60 };
    const receipt = await transact('Create tournament with ETH prize', vault.createTournament(rules, ethers.getAddress(form.get('referee')), ethers.getAddress(form.get('resolver')), shares, { value: rules.ethPrize }));
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
