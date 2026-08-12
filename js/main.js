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
  const ownerOf = {};
  const lockedFor = {};
  players.forEach(p => {
    (p.owned || []).forEach(id => { ownerOf[id] = p.name; });
    (p.locked || []).forEach(id => {
      lockedFor[id] = lockedFor[id] || [];
      lockedFor[id].push(p.name);
    });
  });
  return { ownerOf, lockedFor };
}

function statusFor(charId, ownerOf) {
  if (ownerOf[charId]) {
    return { label: `Possédé par ${ownerOf[charId]}`, cls: 'owned' };
  }
  return { label: 'Disponible', cls: 'available' };
}

function renderCharacters(characters, players) {
  const grid = document.getElementById('char-grid');
  if (!grid) return;

  const { ownerOf } = buildOwnershipMaps(players);
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
      const isOwned = !!ownerOf[c.id];
      const matchesStatus = !status || (status === 'owned' ? isOwned : !isOwned);
      return matchesQ && matchesFaction && matchesStatus;
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state">Aucun personnage ne correspond à ta recherche.</div>';
      return;
    }

    filtered.forEach(c => {
      const st = statusFor(c.id, ownerOf);
      const card = document.createElement('div');
      card.className = 'card char-card';
      card.innerHTML = `
        <span class="faction">${c.faction}</span>
        <h3>${c.name}</h3>
        <p class="ultimate">${c.ultimate}</p>
        <span class="status-badge ${st.cls}">${st.label}</span>
      `;
      grid.appendChild(card);
    });
  }

  [search, factionFilter, statusFilter].forEach(el => el.addEventListener('input', draw));
  draw();
}

function renderPlayers(characters, players) {
  const container = document.getElementById('players-list');
  if (!container) return;

  const charById = {};
  characters.forEach(c => { charById[c.id] = c; });

  if (players.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun joueur enregistré pour le moment.</div>';
    return;
  }

  container.innerHTML = '';
  players.forEach(p => {
    const owned = (p.owned || []).map(id => charById[id]).filter(Boolean);
    const locked = (p.locked || []).map(id => charById[id]).filter(Boolean);

    const block = document.createElement('div');
    block.className = 'player-block';
    block.innerHTML = `
      <h3>${p.name} <span class="count">${owned.length} personnage${owned.length > 1 ? 's' : ''} débloqué${owned.length > 1 ? 's' : ''}</span></h3>
      <div class="tag-list">
        ${owned.map(c => `<span class="pill">${c.name}</span>`).join('') || '<span class="pill locked">Aucun personnage débloqué</span>'}
      </div>
      ${locked.length ? `
        <p style="margin:1rem 0 0.5rem;color:var(--text-dim);font-size:0.85rem;">À débloquer :</p>
        <div class="tag-list">
          ${locked.map(c => `<span class="pill locked">${c.name}</span>`).join('')}
        </div>
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
