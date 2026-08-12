async function loadData() {
  const [charactersRes, playersRes] = await Promise.all([
    fetch('data/characters.json'),
    fetch('data/players.json')
  ]);
  const characters = await charactersRes.json();
  const players = await playersRes.json();
  return { characters, players };
}

function buildOwnershipMaps(players) {
  const ownersOf = {};
  const lockedFor = {};
  players.forEach(p => {
    (p.owned || []).forEach(id => {
      ownersOf[id] = ownersOf[id] || [];
      ownersOf[id].push(p.name);
    });
    (p.locked || []).forEach(id => {
      lockedFor[id] = lockedFor[id] || [];
      lockedFor[id].push(p.name);
    });
  });
  return { ownersOf, lockedFor };
}

function statusFor(charId, ownersOf) {
  const owners = ownersOf[charId];
  if (owners && owners.length) {
    const label = owners.length === 1
      ? `Débloqué par ${owners[0]}`
      : `Débloqué par ${owners.length} joueurs`;
    return { label, cls: 'owned' };
  }
  return { label: 'Encore débloqué par personne', cls: 'available' };
}

function renderCharacters(characters, players) {
  const grid = document.getElementById('char-grid');
  if (!grid) return;

  const { ownersOf } = buildOwnershipMaps(players);
  const search = document.getElementById('char-search');
  const factionFilter = document.getElementById('char-faction');
  const statusFilter = document.getElementById('char-status');

  const factions = [...new Set(characters.map(c => c.faction))].sort();
  factions.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    factionFilter.appendChild(opt);
  });

  function draw() {
    const q = (search.value || '').toLowerCase();
    const faction = factionFilter.value;
    const status = statusFilter.value;

    const filtered = characters.filter(c => {
      const matchesQ = c.name.toLowerCase().includes(q) || (c.ultimate || '').toLowerCase().includes(q);
      const matchesFaction = !faction || c.faction === faction;
      const isOwned = !!(ownersOf[c.id] && ownersOf[c.id].length);
      const matchesStatus = !status || (status === 'owned' ? isOwned : !isOwned);
      return matchesQ && matchesFaction && matchesStatus;
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state">Aucun personnage ne correspond à ta recherche.</div>';
      return;
    }

    filtered.forEach(c => {
      const st = statusFor(c.id, ownersOf);
      const card = document.createElement('div');
      card.className = 'card char-card';
      const portraitStyle = c.image ? ` style="background-image:url('${c.image}')"` : '';
      const portraitText = c.image ? '' : 'Portrait';
      card.innerHTML = `
        <div class="media-slot char-portrait"${portraitStyle}>${portraitText}</div>
        <span class="faction">${c.faction}${c.paid ? ' · payant' : ''}</span>
        <h3>${c.name}</h3>
        <p class="ultimate">${c.ultimate}</p>
        <div class="status-line ${st.cls}"><span class="dot"></span>${st.label}</div>
      `;
      grid.appendChild(card);
    });
  }

  [search, factionFilter, statusFilter].forEach(el => el.addEventListener('input', draw));
  draw();
}

function groupByFaction(list, factionOrder) {
  const groups = {};
  list.forEach(c => {
    groups[c.faction] = groups[c.faction] || [];
    groups[c.faction].push(c);
  });
  return factionOrder.filter(f => groups[f]).map(f => ({ faction: f, chars: groups[f] }));
}

function renderCharGroups(groups, pillClass) {
  return groups.map(g => `
    <p style="margin:0.9rem 0 0.4rem;color:var(--text-dim);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;">${g.faction}</p>
    <div class="tag-list">
      ${g.chars.map(c => `<span class="pill ${pillClass}">${c.name}</span>`).join('')}
    </div>
  `).join('');
}

function renderPlayers(characters, players) {
  const container = document.getElementById('players-list');
  if (!container) return;

  const charById = {};
  characters.forEach(c => { charById[c.id] = c; });
  const factionOrder = [...new Set(characters.map(c => c.faction))];

  if (players.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun joueur enregistré pour le moment.</div>';
    return;
  }

  container.innerHTML = '';
  players.forEach(p => {
    const owned = (p.owned || []).map(id => charById[id]).filter(Boolean);
    const locked = (p.locked || []).map(id => charById[id]).filter(Boolean);
    const ownedGroups = groupByFaction(owned, factionOrder);
    const lockedGroups = groupByFaction(locked, factionOrder);

    const block = document.createElement('div');
    block.className = 'player-block';
    block.innerHTML = `
      <h3>${p.name} <span class="count">${owned.length} personnage${owned.length > 1 ? 's' : ''} débloqué${owned.length > 1 ? 's' : ''}</span></h3>
      ${ownedGroups.length ? renderCharGroups(ownedGroups, '') : '<div class="tag-list"><span class="pill locked">Aucun personnage débloqué</span></div>'}
      ${lockedGroups.length ? `
        <p style="margin-top:1.2rem;color:var(--text-dim);font-size:0.85rem;border-top:1px solid var(--border);padding-top:0.8rem;">À débloquer :</p>
        ${renderCharGroups(lockedGroups, 'locked')}
      ` : ''}
    `;
    container.appendChild(block);
  });
}

function setupIpCopy() {
  const btn = document.getElementById('copy-ip');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ip = btn.dataset.ip;
    try {
      await navigator.clipboard.writeText(ip);
      const original = btn.textContent;
      btn.textContent = 'IP copiée !';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (e) {
      alert(`IP du serveur : ${ip}`);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupIpCopy();
  const grid = document.getElementById('char-grid');
  const playersList = document.getElementById('players-list');
  if (!grid && !playersList) return;

  const { characters, players } = await loadData();
  renderCharacters(characters, players);
  renderPlayers(characters, players);
});
