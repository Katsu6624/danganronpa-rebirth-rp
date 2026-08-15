// Remplace par l'URL de ton Worker Cloudflare (la même que ton "Interactions Endpoint URL" sur le Developer Portal).
const INSCRIPTION_WORKER_URL = 'https://danganronpa-rebirth-rp-bot.shiney273.workers.dev';

const PLACE_RESERVEE_OPTIONS = [
  'Pas de place réservée',
  "C'est ma première saison, je suis donc prioritaire",
  'J\'utilise une place réservée (Katsu vous demandera de le faire plus tard, ne le faites pas tout de suite)',
  'J\'ai le rôle vip de Cours Préparatoire',
  "J'ai le rôle Lycéen de l'Espoir",
];

function inscriptionCountText(state) {
  const count = (state.registrations || []).length;
  const slots = state.slots ? ` / ${state.slots}` : '';
  return `${count}${slots} joueur${count > 1 ? 's' : ''} déjà inscrit${count > 1 ? 's' : ''}.`;
}

async function fetchInscriptionState() {
  try {
    const res = await fetch('data/inscription.json');
    return await res.json();
  } catch (e) {
    return { open: false };
  }
}

async function renderInscriptionPage(state) {
  const container = document.getElementById('inscription-content');
  if (!container) return;

  if (!state.open) {
    container.innerHTML = `
      <div class="rules-list">
        <div class="rule-item">
          <p>Aucune saison n'est ouverte aux inscriptions.</p>
        </div>
      </div>
    `;
    return;
  }

  const { characters, players } = await loadData();
  const minCharacters = Number(state.minCharacters) || 1;

  container.innerHTML = `
    ${state.imageUrl ? `<img src="${state.imageUrl}" alt="${state.title}" style="display:block;width:100%;max-height:420px;object-fit:cover;border:1px solid var(--border);margin-bottom:1.2rem;">` : ''}
    <div class="rules-list">
      <div class="rule-item">
        <p>Pour vous inscrire à la saison ${state.title}, veuillez répondre à ce formulaire.</p>
      </div>
    </div>
    <div class="rules-list" style="margin-top:1rem;">
      <div class="rule-item">
        <h4>Infos de la saison</h4>
        <p><strong>Type :</strong> ${state.seasonType || '—'}</p>
        <p style="margin-top:0.3rem;"><strong>Chapitres max :</strong> ${state.maxChapters || '—'}</p>
        <p style="margin-top:0.3rem;"><strong>Places disponibles :</strong> ${state.slots || '—'}</p>
        <p style="margin-top:0.3rem;"><strong>Personnages bannis :</strong> ${state.bannedCharacters || 'Aucun'}</p>
        <p style="margin-top:0.3rem;"><strong>Ton et attentes RP :</strong> ${state.tone || '—'}</p>
        <p style="margin-top:0.3rem;white-space:pre-line;"><strong>Planning :</strong>\n${state.planning || '—'}</p>
        <p id="insc-count" style="margin-top:0.6rem;color:var(--gold);font-weight:600;">${inscriptionCountText(state)}</p>
      </div>
    </div>

    <form id="insc-form" class="rules-list" style="margin-top:1.5rem;">
      <div class="rule-item">
        <h4>Quel est ton pseudo Discord ?</h4>
        <div class="player-search" style="max-width:420px;">
          <input type="text" id="insc-pseudo" class="insc-input" placeholder="Ton pseudo" required autocomplete="off">
          <div class="player-dropdown" id="insc-pseudo-dropdown"></div>
        </div>
        <button type="button" class="btn btn-outline" id="insc-load-chars" style="margin-top:0.6rem;">Charger mes personnages</button>
        <p id="insc-pseudo-status" style="margin-top:0.5rem;font-size:0.85rem;"></p>
      </div>

      <div class="rule-item">
        <h4>Es-tu présent tous les jours de la saison ?</h4>
        <div class="insc-radio-group">
          <label><input type="radio" name="presence" value="oui" checked> Oui</label>
          <label><input type="radio" name="presence" value="non"> Non</label>
        </div>
        <textarea id="insc-remplacant" class="insc-input" style="display:none;margin-top:0.6rem;" placeholder="As-tu un remplaçant, ou vas-tu essayer d'en trouver un ?"></textarea>
      </div>

      <div class="rule-item">
        <h4>Quel(s) personnage(s) voudrais-tu jouer ? (minimum ${minCharacters})</h4>
        <p id="insc-char-hint" style="color:var(--text-dim);font-size:0.85rem;margin-bottom:0.6rem;">Charge d'abord tes personnages avec ton pseudo ci-dessus.</p>
        <input type="text" id="insc-char-search" class="insc-input" placeholder="Rechercher un personnage..." style="display:none;margin-bottom:0.6rem;">
        <div id="insc-char-list" class="tag-list"></div>
      </div>

      <div class="rule-item">
        <h4>As-tu l'intention de tuer ?</h4>
        <div class="insc-radio-group">
          <label><input type="radio" name="intentionTuer" value="non" checked> Non</label>
          <label><input type="radio" name="intentionTuer" value="oui"> Oui</label>
        </div>
        <textarea id="insc-tuer-details" class="insc-input" style="display:none;margin-top:0.6rem;" placeholder="Détails (comment, sur qui si tu sais déjà, etc.)"></textarea>
      </div>

      <div class="rule-item">
        <h4>Place réservée</h4>
        <div class="insc-radio-group insc-radio-group-vertical">
          ${PLACE_RESERVEE_OPTIONS.map((opt, i) => `
            <label><input type="radio" name="placeReservee" value="${opt.replace(/"/g, '&quot;')}" ${i === 0 ? 'checked' : ''}> ${opt}</label>
          `).join('')}
        </div>
      </div>

      <div class="rule-item">
        <h4>Voudrais-tu être le mastermind ?</h4>
        <div class="insc-radio-group">
          <label><input type="radio" name="mastermind" value="non" checked> Non</label>
          <label><input type="radio" name="mastermind" value="oui"> Oui</label>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Envoyer mon inscription</button>
      <p id="insc-result" style="margin-top:0.8rem;"></p>
    </form>
  `;

  setupInscriptionForm(state, characters, players, minCharacters);
}

function setupInscriptionForm(state, characters, players, minCharacters) {
  const form = document.getElementById('insc-form');
  const pseudoInput = document.getElementById('insc-pseudo');
  const pseudoDropdown = document.getElementById('insc-pseudo-dropdown');
  const loadBtn = document.getElementById('insc-load-chars');
  const status = document.getElementById('insc-pseudo-status');
  const charHint = document.getElementById('insc-char-hint');
  const charSearch = document.getElementById('insc-char-search');
  const charList = document.getElementById('insc-char-list');
  const presenceRadios = form.querySelectorAll('input[name="presence"]');
  const remplacantBox = document.getElementById('insc-remplacant');
  const intentionTuerRadios = form.querySelectorAll('input[name="intentionTuer"]');
  const tuerDetailsBox = document.getElementById('insc-tuer-details');
  const resultEl = document.getElementById('insc-result');

  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  let currentPlayer = null;

  presenceRadios.forEach((r) => r.addEventListener('change', () => {
    remplacantBox.style.display = form.presence.value === 'non' ? 'block' : 'none';
  }));

  intentionTuerRadios.forEach((r) => r.addEventListener('change', () => {
    tuerDetailsBox.style.display = form.intentionTuer.value === 'oui' ? 'block' : 'none';
  }));

  function loadCharacters() {
    const q = pseudoInput.value.trim().toLowerCase();
    currentPlayer = players.find((p) => p.name.toLowerCase() === q) || null;
    if (!currentPlayer) {
      status.textContent = 'Pseudo non reconnu. Utilise /register sur Discord avant de t\'inscrire.';
      status.style.color = 'var(--red)';
      charList.innerHTML = '';
      charSearch.style.display = 'none';
      return;
    }
    const owned = (currentPlayer.owned || []).map((id) => charById[id]).filter(Boolean);
    if (owned.length === 0) {
      status.textContent = 'Tu n\'as encore aucun personnage débloqué.';
      status.style.color = 'var(--red)';
      charList.innerHTML = '';
      charSearch.style.display = 'none';
      return;
    }
    status.textContent = `${owned.length} personnage(s) chargé(s).`;
    status.style.color = 'var(--gold)';
    charHint.style.display = 'none';
    charSearch.style.display = owned.length > 8 ? 'block' : 'none';
    charSearch.value = '';
    charList.innerHTML = owned.map((c) => `
      <label class="pill" data-name="${c.name.toLowerCase()}" style="cursor:pointer;">
        <input type="checkbox" name="personnage" value="${c.id}" style="margin-right:0.4rem;">${c.image ? `<img src="${c.image}" alt="">` : ''}${c.name}
      </label>
    `).join('');
  }

  loadBtn.addEventListener('click', loadCharacters);

  charSearch.addEventListener('input', () => {
    const q = charSearch.value.trim().toLowerCase();
    charList.querySelectorAll('.pill').forEach((pill) => {
      pill.style.display = pill.dataset.name.includes(q) ? '' : 'none';
    });
  });

  // Autocomplete du pseudo (mêmes principes que sur la page Personnages).
  function renderPseudoOptions() {
    const q = pseudoInput.value.trim().toLowerCase();
    if (!q) {
      pseudoDropdown.classList.remove('open');
      pseudoDropdown.innerHTML = '';
      return;
    }
    const matches = players
      .map((p) => p.name)
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 8);
    pseudoDropdown.innerHTML = '';
    if (matches.length === 0) {
      pseudoDropdown.innerHTML = '<div class="option empty">Aucun joueur trouvé</div>';
    } else {
      matches.forEach((name) => {
        const opt = document.createElement('div');
        opt.className = 'option';
        opt.textContent = name;
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pseudoInput.value = name;
          pseudoDropdown.classList.remove('open');
          loadCharacters();
        });
        pseudoDropdown.appendChild(opt);
      });
    }
    pseudoDropdown.classList.add('open');
  }

  pseudoInput.addEventListener('focus', renderPseudoOptions);
  pseudoInput.addEventListener('input', renderPseudoOptions);
  document.addEventListener('click', (e) => {
    if (e.target !== pseudoInput && !pseudoDropdown.contains(e.target)) {
      pseudoDropdown.classList.remove('open');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultEl.textContent = '';

    if (!currentPlayer) {
      resultEl.textContent = 'Charge d\'abord tes personnages avec ton pseudo Discord.';
      resultEl.style.color = 'var(--red)';
      return;
    }

    const chosen = [...form.querySelectorAll('input[name="personnage"]:checked')].map((el) => el.value);
    if (chosen.length < minCharacters) {
      resultEl.textContent = `Choisis au moins ${minCharacters} personnage(s).`;
      resultEl.style.color = 'var(--red)';
      return;
    }

    const payload = {
      pseudo: currentPlayer.name,
      presence: form.presence.value,
      remplacant: remplacantBox.value.trim(),
      personnages: chosen,
      intentionTuer: form.intentionTuer.value,
      intentionTuerDetails: tuerDetailsBox.value.trim(),
      placeReservee: form.placeReservee.value,
      mastermind: form.mastermind.value,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    resultEl.textContent = 'Envoi en cours…';
    resultEl.style.color = 'var(--text-dim)';

    try {
      const res = await fetch(`${INSCRIPTION_WORKER_URL}/submit-inscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue.');
      resultEl.textContent = '✅ Inscription envoyée ! Tu recevras une réponse du Monokuma.';
      resultEl.style.color = 'var(--gold)';
      form.reset();
      charList.innerHTML = '';
      charSearch.style.display = 'none';
      charHint.style.display = 'block';
      status.textContent = '';
      const freshState = await fetchInscriptionState();
      const countEl = document.getElementById('insc-count');
      if (countEl) countEl.textContent = inscriptionCountText(freshState);
    } catch (err) {
      resultEl.textContent = `Erreur : ${err.message}`;
      resultEl.style.color = 'var(--red)';
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function renderInscriptionNavBadge(state) {
  const link = document.getElementById('nav-inscription');
  if (!link) return;
  const existing = link.querySelector('.nav-badge');
  if (state.open) {
    if (!existing) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = '!';
      link.appendChild(badge);
    }
  } else if (existing) {
    existing.remove();
  }
}

function renderInscriptionBanner(state) {
  const banner = document.getElementById('inscription-banner');
  if (!banner) return;
  if (state.open) {
    banner.innerHTML = `
      <div class="card" style="border-left:3px solid var(--red);">
        <span class="card-icon">!</span>
        <h3>Les inscriptions sont ouvertes !</h3>
        <p>Inscris-toi dès maintenant pour participer à ${state.title || 'la prochaine saison'}.</p>
        <a class="btn btn-primary" href="inscription.html" style="margin-top:0.8rem;">S'inscrire →</a>
      </div>
    `;
    banner.style.display = '';
  } else {
    banner.innerHTML = '';
    banner.style.display = 'none';
  }
}

async function setupInscription() {
  const state = await fetchInscriptionState();
  await renderInscriptionPage(state);
  renderInscriptionNavBadge(state);
  renderInscriptionBanner(state);
}

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
  const prevBtn = document.getElementById('season-lightbox-prev');
  const nextBtn = document.getElementById('season-lightbox-next');
  if (!lightbox) return;

  let currentIndex = 0;

  function showIndex(index) {
    currentIndex = (index + SEASON_IMAGES.length) % SEASON_IMAGES.length;
    const slug = SEASON_IMAGES[currentIndex];
    lightboxImg.src = `assets/seasons/${slug}.jpg`;
    lightboxDownload.href = `assets/seasons/${slug}.jpg`;
    lightboxDownload.download = `${slug}.jpg`;
  }

  function openLightbox(index) {
    const scrollY = window.scrollY;
    showIndex(index);
    lightbox.showModal();
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  gallery.querySelectorAll('.card-visual').forEach((el, index) => {
    el.addEventListener('click', () => openLightbox(index));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(index);
      }
    });
  });

  prevBtn.addEventListener('click', () => showIndex(currentIndex - 1));
  nextBtn.addEventListener('click', () => showIndex(currentIndex + 1));
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showIndex(currentIndex - 1);
    if (e.key === 'ArrowRight') showIndex(currentIndex + 1);
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
  await setupInscription();
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
