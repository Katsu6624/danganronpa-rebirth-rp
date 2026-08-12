async function loadData() {
  const [charactersRes, playersRes] = await Promise.all([
    fetch('data/characters.json'),
    fetch('data/players.json')
  ]);
  const characters = await charactersRes.json();
  const players = await playersRes.json();
  return { characters, players };
}

function renderCharacters(characters, players) {
  const grid = document.getElementById('char-grid');
  if (!grid) return;

  const search = document.getElementById('char-search');
  const factionFilter = document.getElementById('char-faction');
  const playerInput = document.getElementById('char-player');
  const statusFilter = document.getElementById('char-status');

  const factions = [...new Set(characters.map(c => c.faction))].sort();
  factions.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    factionFilter.appendChild(opt);
  });

  const playerNames = document.getElementById('player-names');
  if (playerNames) {
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      playerNames.appendChild(opt);
    });
  }

  function findPlayerByName(name) {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    const exact = players.find(p => p.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = players.filter(p => p.name.toLowerCase().includes(q));
    return partial.length === 1 ? partial[0] : null;
  }

  function draw() {
    const q = (search.value || '').toLowerCase();
    const faction = factionFilter.value;
    const status = statusFilter.value;
    const player = playerInput ? findPlayerByName(playerInput.value || '') : null;
    const ownedSet = new Set(player?.owned || []);
    const lockedSet = new Set(player?.locked || []);

    const filtered = characters.filter(c => {
      const matchesQ = c.name.toLowerCase().includes(q) || (c.ultimate || '').toLowerCase().includes(q);
      const matchesFaction = !faction || c.faction === faction;
      let matchesStatus = true;
      if (status && player) {
        matchesStatus = status === 'owned' ? ownedSet.has(c.id) : lockedSet.has(c.id);
      }
      return matchesQ && matchesFaction && matchesStatus;
    });

    grid.innerHTML = '';
    if (playerInput && playerInput.value.trim() && !player) {
      grid.innerHTML = '<div class="empty-state">Aucun joueur enregistré avec ce pseudo. Utilise /register sur Discord.</div>';
      return;
    }
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state">Aucun personnage ne correspond à ta recherche.</div>';
      return;
    }

    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = 'card char-card';
      const portraitStyle = c.image ? ` style="background-image:url('${c.image}')"` : '';
      const portraitText = c.image ? '' : 'Portrait';
      let statusLine = '';
      if (player) {
        if (ownedSet.has(c.id)) statusLine = '<div class="status-line owned"><span class="dot"></span>Débloqué</div>';
        else if (lockedSet.has(c.id)) statusLine = '<div class="status-line available"><span class="dot"></span>À débloquer</div>';
      }
      card.innerHTML = `
        <div class="media-slot char-portrait"${portraitStyle}>${portraitText}</div>
        <span class="faction">${c.faction}${c.paid ? ' · payant' : ''}</span>
        <h3>${c.name}</h3>
        <p class="ultimate">${c.ultimate}</p>
        ${statusLine}
      `;
      grid.appendChild(card);
    });
  }

  [search, factionFilter, playerInput, statusFilter].filter(Boolean).forEach(el => el.addEventListener('input', draw));
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
      ${g.chars.map(c => `<span class="pill ${pillClass}">${c.image ? `<img src="${c.image}" alt="">` : ''}${c.name}</span>`).join('')}
    </div>
  `).join('');
}

function renderPlayers(characters, players) {
  const container = document.getElementById('players-list');
  if (!container) return;

  const search = document.getElementById('player-search');
  const charById = {};
  characters.forEach(c => { charById[c.id] = c; });
  const factionOrder = [...new Set(characters.map(c => c.faction))];

  const playerNames = document.getElementById('player-names');
  if (playerNames) {
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      playerNames.appendChild(opt);
    });
  }

  const VIP_LABELS = {
    espoir: "Lycéen de l'Espoir",
    prepa: 'Lycéen en Cours Préparatoire',
  };

  function renderPlayerBlock(p) {
    const owned = (p.owned || []).map(id => charById[id]).filter(Boolean);
    const locked = (p.locked || []).map(id => charById[id]).filter(Boolean);
    const ownedGroups = groupByFaction(owned, factionOrder);
    const lockedGroups = groupByFaction(locked, factionOrder);
    const vipLabel = p.vip && VIP_LABELS[p.vipTier];

    const block = document.createElement('div');
    block.className = 'player-block';
    block.innerHTML = `
      <h3>${p.name} <span class="count">${owned.length} personnage${owned.length > 1 ? 's' : ''} débloqué${owned.length > 1 ? 's' : ''}</span></h3>
      ${vipLabel ? `<p style="margin:0.2rem 0 1rem;color:var(--gold);font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;"><img src="assets/vip-icon.webp" alt="" style="width:18px;height:18px;object-fit:contain;">Tout est débloqué grâce au rôle ${vipLabel}</p>` : ''}
      ${ownedGroups.length ? renderCharGroups(ownedGroups, '') : '<div class="tag-list"><span class="pill locked">Aucun personnage débloqué</span></div>'}
      ${lockedGroups.length ? `
        <p style="margin-top:1.2rem;color:var(--text-dim);font-size:0.85rem;border-top:1px solid var(--border);padding-top:0.8rem;">À débloquer :</p>
        ${renderCharGroups(lockedGroups, 'locked')}
      ` : ''}
    `;
    return block;
  }

  function draw() {
    const q = (search.value || '').trim().toLowerCase();
    container.innerHTML = '';

    if (!q) {
      container.innerHTML = '<div class="empty-state">Tape un pseudo Discord ci-dessus pour voir sa fiche.</div>';
      return;
    }

    const exact = players.find(p => p.name.toLowerCase() === q);
    const matches = exact ? [exact] : players.filter(p => p.name.toLowerCase().includes(q));

    if (matches.length === 0) {
      container.innerHTML = '<div class="empty-state">Aucun joueur ne correspond à cette recherche.</div>';
      return;
    }

    if (matches.length > 1) {
      container.innerHTML = '<div class="empty-state">Plusieurs joueurs correspondent, précise le pseudo (utilise les suggestions).</div>';
      return;
    }

    container.appendChild(renderPlayerBlock(matches[0]));
  }

  search.addEventListener('input', draw);
  draw();
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
