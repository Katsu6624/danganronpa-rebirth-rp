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
  const roleFilter = document.getElementById('char-role');

  const factions = [...new Set(characters.map(c => c.faction))].sort();
  factions.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    factionFilter.appendChild(opt);
  });

  if (roleFilter) {
    const allRoles = [...new Set(characters.flatMap(c => c.roles || []))].sort();
    allRoles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      roleFilter.appendChild(opt);
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

  function setupPlayerDropdown(onSelect) {
    const dropdown = document.getElementById('player-dropdown');
    if (!playerInput || !dropdown) return;
    const names = players.map(p => p.name);

    function renderOptions() {
      const q = playerInput.value.trim().toLowerCase();
      if (!q) {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        return;
      }
      const matches = names.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
      dropdown.innerHTML = '';
      if (matches.length === 0) {
        dropdown.innerHTML = '<div class="option empty">Aucun joueur trouvé</div>';
      } else {
        matches.forEach(name => {
          const opt = document.createElement('div');
          opt.className = 'option';
          opt.textContent = name;
          opt.addEventListener('mousedown', (e) => {
            e.preventDefault();
            playerInput.value = name;
            dropdown.classList.remove('open');
            onSelect();
          });
          dropdown.appendChild(opt);
        });
      }
      dropdown.classList.add('open');
    }

    playerInput.addEventListener('focus', renderOptions);
    playerInput.addEventListener('input', renderOptions);
    playerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (e.target !== playerInput && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  const factionOrder = [...new Set(characters.map(c => c.faction))];
  const VIP_LABELS = {
    espoir: "Lycéen de l'Espoir",
    prepa: 'Lycéen en Cours Préparatoire',
  };

  function renderPlayerView(player, faction, role) {
    const charById = {};
    characters.forEach(c => { charById[c.id] = c; });
    const matchesFilters = c => (!faction || c.faction === faction) && (!role || (c.roles || []).includes(role));
    const owned = (player.owned || []).map(id => charById[id]).filter(Boolean).filter(matchesFilters);
    const locked = (player.locked || []).map(id => charById[id]).filter(Boolean).filter(matchesFilters);
    const ownedGroups = groupByFaction(owned, factionOrder);
    const lockedGroups = groupByFaction(locked, factionOrder);
    const vipLabel = player.vip && VIP_LABELS[player.vipTier];
    const filtersActive = faction || role;

    grid.classList.remove('grid');
    grid.innerHTML = `
      <div class="player-block">
        <h3>${player.name} <span class="count">${owned.length} personnage${owned.length > 1 ? 's' : ''} débloqué${owned.length > 1 ? 's' : ''}${filtersActive ? ' (filtré)' : ''}</span></h3>
        ${vipLabel ? `<p style="margin:0.2rem 0 1rem;color:var(--gold);font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;"><img src="assets/vip-icon.webp" alt="" style="width:18px;height:18px;object-fit:contain;">Tout est débloqué grâce au rôle ${vipLabel}</p>` : ''}
        ${ownedGroups.length ? renderCharGroups(ownedGroups, '') : '<div class="tag-list"><span class="pill locked">Aucun personnage débloqué</span></div>'}
        ${lockedGroups.length ? `
          <p style="margin-top:1.2rem;color:var(--text-dim);font-size:0.85rem;border-top:1px solid var(--border);padding-top:0.8rem;">À débloquer :</p>
          ${renderCharGroups(lockedGroups, 'locked')}
        ` : ''}
      </div>
    `;
  }

  function draw() {
    const q = (search.value || '').toLowerCase();
    const faction = factionFilter.value;
    const role = roleFilter ? roleFilter.value : '';
    const player = playerInput ? findPlayerByName(playerInput.value || '') : null;

    if (playerInput && playerInput.value.trim()) {
      if (!player) {
        grid.classList.add('grid');
        grid.innerHTML = '<div class="empty-state">Aucun joueur enregistré avec ce pseudo. Utilise /register sur Discord.</div>';
        return;
      }
      renderPlayerView(player, faction, role);
      return;
    }

    grid.classList.add('grid');

    const filtered = characters.filter(c => {
      const matchesQ = c.name.toLowerCase().includes(q) || (c.ultimate || '').toLowerCase().includes(q);
      const matchesFaction = !faction || c.faction === faction;
      const matchesRole = !role || (c.roles || []).includes(role);
      return matchesQ && matchesFaction && matchesRole;
    });

    grid.innerHTML = '';
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
      const roleTags = (c.roles || []).map(r => `<span class="role-tag">${r}</span>`).join('');
      card.innerHTML = `
        <div class="media-slot char-portrait"${portraitStyle}>${portraitText}</div>
        <span class="faction">${c.faction}${c.paid ? ' · payant' : ''}</span>
        <h3>${c.name}</h3>
        <p class="ultimate">${c.ultimate}</p>
        ${roleTags ? `<div class="role-tags">${roleTags}</div>` : ''}
        ${statusLine}
      `;
      grid.appendChild(card);
    });
  }

  [search, factionFilter, playerInput, statusFilter, roleFilter].filter(Boolean).forEach(el => el.addEventListener('input', draw));
  setupPlayerDropdown(draw);
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

function setupUnlockInfoModal() {
  const btn = document.getElementById('unlock-info-btn');
  const modal = document.getElementById('unlock-info-modal');
  const closeBtn = document.getElementById('unlock-info-close');
  if (!btn || !modal) return;
  btn.addEventListener('click', () => modal.showModal());
  closeBtn.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });
}

function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.card, .rule-item, .player-block').forEach(el => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    observer.observe(el);
  });
}

const SEASON_IMAGES = [
  'saison-1', 'saison-2', 'saison-3', 'saison-4', 'saison-4-paranoia',
  'saison-5', 'saison-5-v2', 'saison-6', 'saison-7', 'saison-8', 'saison-9',
  'saison-11', 'saison-13-v1', 'saison-13-v2', 'saison-13-v3',
  'saison-16', 'saison-16-dormeurs', 'saison-17', 'saison-17-v2',
  'saison-27', 'saison-30', 'saison-35', 'saison-36', 'saison-39', 'saison-46',
  'saison-47', 'saison-47-v2', 'saison-49-v2',
];

function setupSeasonGallery() {
  const gallery = document.getElementById('season-gallery');
  if (!gallery) return;

  gallery.innerHTML = SEASON_IMAGES.map(slug => `
    <div class="card card-visual" style="background-image:url('assets/seasons/${slug}.jpg');" data-src="assets/seasons/${slug}.jpg" data-name="${slug}.jpg" role="button" tabindex="0" aria-label="Agrandir l'image ${slug}"></div>
  `).join('');

  const lightbox = document.getElementById('season-lightbox');
  const lightboxImg = document.getElementById('season-lightbox-img');
  const lightboxDownload = document.getElementById('season-lightbox-download');
  const closeBtn = document.getElementById('season-lightbox-close');
  if (!lightbox) return;

  function openLightbox(el) {
    const scrollY = window.scrollY;
    lightboxImg.src = el.dataset.src;
    lightboxDownload.href = el.dataset.src;
    lightboxDownload.download = el.dataset.name;
    lightbox.showModal();
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  gallery.querySelectorAll('.card-visual').forEach(el => {
    el.addEventListener('click', () => openLightbox(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(el);
      }
    });
  });

  closeBtn.addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.close();
  });
}

function setupSeasonLoopGif() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const img = document.createElement('img');
  img.src = 'assets/seasons/saison-49-loop.gif';
  img.alt = 'Extrait animé d\'une saison Danganronpa Rebirth RP';
  img.className = 'season-loop-gif';
  img.loading = 'lazy';
  footer.prepend(img);
}

function setupBackToTop() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Revenir en haut de la page');
  btn.textContent = '↑';
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupIpCopy();
  setupUnlockInfoModal();
  setupSeasonGallery();
  setupSeasonLoopGif();
  setupScrollReveal();
  setupBackToTop();

  const grid = document.getElementById('char-grid');
  if (grid) {
    new MutationObserver(() => setupScrollReveal()).observe(grid, { childList: true });
  }
  if (!grid) return;

  const { characters, players } = await loadData();
  renderCharacters(characters, players);
});
