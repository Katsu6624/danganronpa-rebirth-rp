import { verifyKey } from 'discord-interactions';

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, APPLICATION_COMMAND_AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 };
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
};

async function githubRequest(env, path, options = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'danganronpa-rebirth-rp-bot',
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

async function readJsonFile(env, path) {
  const file = await githubRequest(env, `${path}?ref=${env.GITHUB_BRANCH}`);
  const content = decodeURIComponent(escape(atob(file.content)));
  return { data: JSON.parse(content), sha: file.sha };
}

async function writeJsonFile(env, path, data, sha, message) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + '\n')));
  await githubRequest(env, path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content,
      sha,
      branch: env.GITHUB_BRANCH,
    }),
  });
}

async function getCharacters(env) {
  const { data } = await readJsonFile(env, 'data/characters.json');
  return data;
}

async function getPlayers(env) {
  return readJsonFile(env, 'data/players.json');
}

function findPlayer(players, discordId) {
  return players.find((p) => p.discordId === discordId);
}

function isConflictError(err) {
  return /GitHub API 409/.test(err.message);
}

// Réessaie en cas de 409 (deux joueurs qui écrivent players.json en même temps) :
// relit le fichier, ré-applique la mutation, puis retente l'écriture.
async function updatePlayersFile(env, updater, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: players, sha } = await getPlayers(env);
    const ctx = await updater(players);
    if (ctx.skipWrite) return ctx;
    try {
      await writeJsonFile(env, 'data/players.json', players, sha, ctx.message);
      return ctx;
    } catch (err) {
      lastErr = err;
      if (!isConflictError(err) || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function updateJsonFile(env, path, updater, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, sha } = await readJsonFile(env, path);
    const ctx = await updater(data);
    if (ctx.skipWrite) return ctx;
    try {
      await writeJsonFile(env, path, data, sha, ctx.message);
      return ctx;
    } catch (err) {
      lastErr = err;
      if (!isConflictError(err) || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function discordRequest(env, path, options = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function setDiscordRole(env, userId, roleId, add) {
  if (!env.DISCORD_GUILD_ID || !roleId) return;
  const path = `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`;
  await discordRequest(env, path, { method: add ? 'PUT' : 'DELETE' });
}

function reply(content, ephemeral = true) {
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content, flags: ephemeral ? 64 : 0 },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

async function handleAutocomplete(env, interaction) {
  const focused = interaction.data.options
    ?.flatMap((o) => o.options || [o])
    .find((o) => o.focused);
  const query = (focused?.value || '').toLowerCase();
  const characters = await getCharacters(env);
  const matches = characters
    .filter((c) => c.name.toLowerCase().includes(query) || c.id.includes(query))
    .slice(0, 25)
    .map((c) => ({ name: `${c.name} (${c.ultimate})`, value: c.id }));

  return new Response(
    JSON.stringify({
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: { choices: matches },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function getFlatOptions(interaction) {
  const opts = {};
  (interaction.data.options || []).forEach((o) => { opts[o.name] = o.value; });
  return opts;
}

const FREE_FACTIONS = ['Trigger Happy Havoc', 'Goodbye Despair', 'Killing Harmony'];

async function handleRegister(env, interaction) {
  const user = interaction.member.user;
  const characters = await getCharacters(env);
  const owned = characters.filter((c) => FREE_FACTIONS.includes(c.faction)).map((c) => c.id);
  const locked = characters.filter((c) => !FREE_FACTIONS.includes(c.faction)).map((c) => c.id);

  const ctx = await updatePlayersFile(env, (players) => {
    const existing = findPlayer(players, user.id);
    if (existing) return { skipWrite: true, existingName: existing.name };
    players.push({ name: user.username, discordId: user.id, owned, locked });
    return { message: `Inscription de ${user.username} via /register` };
  });

  if (ctx.existingName) {
    return reply(`Tu es déjà enregistré en tant que ${ctx.existingName}. Retrouve-toi sur la page Personnages du site (recherche ton pseudo).`);
  }
  return reply(`✅ Tu es enregistré, ${user.username} ! Tous les personnages de Trigger Happy Havoc, Goodbye Despair et Killing Harmony sont débloqués pour toi. Le reste est à débloquer. Retrouve-toi sur la page Personnages du site.`);
}

function handleHelp() {
  const lines = [
    '**Commandes disponibles**',
    '',
    '`/register` : t\'inscrire sur la page Personnages du site (recherche ton pseudo). Accessible à tout le monde.',
    '`/liste [joueur]` : voir les personnages d\'un joueur (toi par défaut). Accessible à tout le monde.',
    '',
    '⚠️ **Commandes réservées au staff** (permission "Gérer le serveur") :',
    '`/debloquer <joueur> <personnage>` : attribuer un personnage à un joueur.',
    '`/retirer <joueur> <personnage>` : retirer un personnage à un joueur.',
    '`/vip espoir donner <joueur>` : donne le rôle Lycéen de l\'Espoir et débloque tous les personnages.',
    '`/vip espoir retirer <joueur>` : retire le rôle Lycéen de l\'Espoir (les attributions individuelles sont conservées).',
    '`/vip prepa donner <joueur>` : donne le rôle Lycéen en Cours Préparatoire et débloque tous les personnages.',
    '`/vip prepa retirer <joueur>` : retire le rôle Lycéen en Cours Préparatoire (les attributions individuelles sont conservées).',
    '`/inscription ouvrir` : ouvre un formulaire Discord (2 étapes) pour configurer et ouvrir les inscriptions à une saison.',
    '`/inscription fermer` : ferme les inscriptions.',
  ];
  return reply(lines.join('\n'));
}

const VIP_TIERS = {
  espoir: { roleEnvVar: 'DISCORD_ROLE_ESPOIR', label: "Lycéen de l'Espoir" },
  prepa: { roleEnvVar: 'DISCORD_ROLE_PREPA', label: 'Lycéen en Cours Préparatoire' },
};

async function handleVip(env, interaction) {
  const group = interaction.data.options?.[0];
  const tier = VIP_TIERS[group?.name];
  if (!tier) return reply('Palier VIP inconnu.');

  const sub = group.options?.[0];
  const targetId = sub?.options?.find((o) => o.name === 'joueur')?.value;
  const targetUser = interaction.data.resolved.users[targetId];
  const roleId = env[tier.roleEnvVar];

  const characters = await getCharacters(env);
  const allIds = characters.map((c) => c.id);
  const freeIds = characters.filter((c) => FREE_FACTIONS.includes(c.faction)).map((c) => c.id);

  const ctx = await updatePlayersFile(env, (players) => {
    let player = findPlayer(players, targetUser.id);
    if (!player) {
      player = { name: targetUser.username, discordId: targetUser.id, owned: [], locked: [] };
      players.push(player);
    }
    player.name = targetUser.username;
    player.owned = player.owned || [];
    player.locked = player.locked || [];

    if (sub.name === 'donner') {
      const previousTier = player.vipTier;
      if (!player.vip) {
        // Ne recalcule "ce qui vient du VIP" que lors du premier octroi : réexécuter /vip donner
        // sur un joueur déjà VIP ne doit pas effacer ce qu'on sait devoir reverrouiller plus tard.
        player.vipGrantedIds = allIds.filter((id) => !player.owned.includes(id));
      }
      player.owned = allIds.slice();
      player.locked = [];
      player.vip = true;
      player.vipTier = group.name;
      return { message: `VIP (${tier.label}) accordé à ${targetUser.username}`, action: 'donner', previousTier };
    }

    if (sub.name === 'retirer') {
      const grantedByVip = new Set(player.vipGrantedIds || []);
      player.owned = player.owned.filter((id) => !grantedByVip.has(id));
      const stillMissing = allIds.filter((id) => !player.owned.includes(id) && !freeIds.includes(id));
      player.locked = [...new Set([...(player.locked || []), ...stillMissing])];
      player.vip = false;
      player.vipTier = null;
      player.vipGrantedIds = [];
      return { message: `VIP (${tier.label}) retiré à ${targetUser.username}`, action: 'retirer' };
    }

    return { skipWrite: true, unknownSub: true };
  });

  if (ctx.unknownSub) return reply('Sous-commande VIP inconnue.');

  if (ctx.action === 'donner') {
    if (ctx.previousTier && ctx.previousTier !== group.name) {
      const previousRoleId = env[VIP_TIERS[ctx.previousTier].roleEnvVar];
      await setDiscordRole(env, targetUser.id, previousRoleId, false);
    }
    await setDiscordRole(env, targetUser.id, roleId, true);
    return reply(`✅ ${targetUser.username} a maintenant le rôle ${tier.label} : tous les personnages sont débloqués.`);
  }

  await setDiscordRole(env, targetUser.id, roleId, false);
  return reply(`✅ Le rôle ${tier.label} de ${targetUser.username} a été retiré. Les personnages attribués individuellement sont conservés.`);
}

async function handleListe(env, interaction) {
  const opts = getFlatOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const targetUser = opts.joueur ? interaction.data.resolved.users[opts.joueur] : interaction.member.user;
  const { data: players } = await getPlayers(env);
  const player = findPlayer(players, targetUser.id);
  if (!player) return reply(`${targetUser.username} n'a aucun personnage enregistré.`);
  const owned = (player.owned || []).map((id) => charById[id]?.name || id).join(', ') || 'aucun';
  const locked = (player.locked || []).map((id) => charById[id]?.name || id).join(', ') || 'aucun';
  return reply(`**${targetUser.username}**\nDébloqués : ${owned}\nÀ débloquer : ${locked}`);
}

async function handleDebloquer(env, interaction) {
  const opts = getFlatOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const charId = opts.personnage;
  const character = charById[charId];
  if (!character) return reply(`Personnage inconnu : \`${charId}\`. Utilise l'autocomplétion pour choisir un personnage valide.`);

  const targetUser = interaction.data.resolved.users[opts.joueur];

  await updatePlayersFile(env, (players) => {
    let player = findPlayer(players, targetUser.id);
    if (!player) {
      player = { name: targetUser.username, discordId: targetUser.id, owned: [], locked: [] };
      players.push(player);
    } else {
      player.name = targetUser.username;
      player.owned = player.owned || [];
      player.locked = player.locked || [];
    }

    if (!player.owned.includes(charId)) player.owned.push(charId);
    player.locked = player.locked.filter((id) => id !== charId);
    if (player.vipGrantedIds) player.vipGrantedIds = player.vipGrantedIds.filter((id) => id !== charId);
    return { message: `Attribution de ${character.name} à ${targetUser.username}` };
  });

  return reply(`✅ ${character.name} attribué à ${targetUser.username}.`);
}

async function handleRetirer(env, interaction) {
  const opts = getFlatOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const charId = opts.personnage;
  const character = charById[charId];
  if (!character) return reply(`Personnage inconnu : \`${charId}\`. Utilise l'autocomplétion pour choisir un personnage valide.`);

  const targetUser = interaction.data.resolved.users[opts.joueur];

  const ctx = await updatePlayersFile(env, (players) => {
    const player = findPlayer(players, targetUser.id);
    if (!player) return { skipWrite: true, notFound: true };
    player.owned = (player.owned || []).filter((id) => id !== charId);
    return { message: `Retrait de ${character.name} à ${targetUser.username}` };
  });

  if (ctx.notFound) return reply(`${targetUser.username} n'a aucun personnage enregistré.`);
  return reply(`✅ ${character.name} retiré à ${targetUser.username}.`);
}

function modalResponse(customId, title, fields) {
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: customId,
        title,
        components: fields.map((f) => ({
          type: 1,
          components: [
            {
              type: 4,
              custom_id: f.id,
              label: f.label,
              style: f.style || 1, // 1 = court, 2 = paragraphe
              required: f.required !== false,
              placeholder: f.placeholder,
              max_length: f.maxLength,
            },
          ],
        })),
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function getModalValues(interaction) {
  const values = {};
  (interaction.data.components || []).forEach((row) => {
    const input = row.components?.[0];
    if (input) values[input.custom_id] = input.value;
  });
  return values;
}

async function handleInscription(env, interaction) {
  const sub = interaction.data.options?.[0];

  if (sub?.name === 'ouvrir') {
    return modalResponse('inscription_meta', 'Nouvelle saison (1/2)', [
      { id: 'titre', label: 'Titre de la saison (ex : Saison 50)', placeholder: 'Saison 50' },
      { id: 'type_saison', label: 'Type de saison', placeholder: 'Classique / Alternatif / Grande Échelle / Libre' },
      { id: 'places', label: 'Nombre de places disponibles', placeholder: '10' },
      { id: 'max_chapitres', label: 'Nombre de chapitres max (1 à 6)', placeholder: '5' },
      { id: 'min_perso', label: 'Nombre min. de personnages à proposer', placeholder: '3' },
    ]);
  }

  if (sub?.name === 'fermer') {
    await updateJsonFile(env, 'data/inscription.json', (data) => {
      Object.assign(data, {
        open: false,
        title: '',
        seasonType: '',
        slots: null,
        maxChapters: null,
        minCharacters: null,
        bannedCharacters: '',
        tone: '',
        planning: '',
        openedBy: null,
        updatedAt: new Date().toISOString(),
      });
      return { message: 'Fermeture des inscriptions' };
    });

    return reply('✅ Inscriptions fermées.', false);
  }

  return reply('Sous-commande inconnue.');
}

async function handleInscriptionMetaSubmit(interaction) {
  const v = getModalValues(interaction);
  // On mémorise le brouillon dans le custom_id du modal suivant, encodé en base64,
  // le Worker étant sans état entre deux interactions séparées.
  const draft = {
    titre: v.titre,
    type_saison: v.type_saison,
    places: v.places,
    max_chapitres: v.max_chapitres,
    min_perso: v.min_perso,
    openedBy: interaction.member.user.id,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(draft))));
  return modalResponse(`inscription_details:${encoded}`, 'Nouvelle saison (2/2)', [
    { id: 'bannis', label: 'Personnages bannis (laisser vide sinon)', style: 2, required: false, placeholder: 'Aucun' },
    { id: 'ton', label: 'Ton et attentes RP', style: 2 },
    { id: 'planning', label: 'Planning (horaires par chapitre)', style: 2, placeholder: 'Chap 1 : 18h-00h (pause 20h)\nChap 2 : ...' },
  ]);
}

async function handleInscriptionDetailsSubmit(env, interaction) {
  const encoded = interaction.data.custom_id.split(':').slice(1).join(':');
  const draft = JSON.parse(decodeURIComponent(escape(atob(encoded))));
  const v = getModalValues(interaction);

  await updateJsonFile(env, 'data/inscription.json', (data) => {
    Object.assign(data, {
      open: true,
      title: draft.titre,
      seasonType: draft.type_saison,
      slots: draft.places,
      maxChapters: draft.max_chapitres,
      minCharacters: draft.min_perso,
      bannedCharacters: v.bannis || '',
      tone: v.ton,
      planning: v.planning,
      openedBy: draft.openedBy,
      updatedAt: new Date().toISOString(),
    });
    return { message: `Ouverture des inscriptions : ${draft.titre}` };
  });

  return reply(`✅ Inscriptions ouvertes pour **${draft.titre}**. Le formulaire est en ligne sur la page Inscription du site.`, false);
}

async function handleModalSubmit(env, interaction) {
  const customId = interaction.data.custom_id;
  if (customId === 'inscription_meta') return handleInscriptionMetaSubmit(interaction);
  if (customId.startsWith('inscription_details:')) return handleInscriptionDetailsSubmit(env, interaction);
  return reply('Formulaire inconnu.');
}

async function handleCommand(env, interaction) {
  switch (interaction.data.name) {
    case 'register': return handleRegister(env, interaction);
    case 'help': return handleHelp();
    case 'vip': return handleVip(env, interaction);
    case 'liste': return handleListe(env, interaction);
    case 'debloquer': return handleDebloquer(env, interaction);
    case 'retirer': return handleRetirer(env, interaction);
    case 'inscription': return handleInscription(env, interaction);
    default: return reply('Commande inconnue.');
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function sendDirectMessage(env, userId, content) {
  const channel = await discordRequest(env, '/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: userId }),
  });
  await discordRequest(env, `/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

async function handleInscriptionResponse(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'JSON invalide.' });
  }

  const { pseudo, presence, remplacant, personnages, intentionTuer, placeReservee, mastermind } = payload;
  if (!pseudo || !Array.isArray(personnages) || personnages.length === 0) {
    return jsonResponse(400, { error: 'Champs manquants.' });
  }

  const { data: inscription } = await readJsonFile(env, 'data/inscription.json');
  if (!inscription.open) {
    return jsonResponse(400, { error: 'Les inscriptions sont fermées.' });
  }

  const { data: players } = await getPlayers(env);
  const player = players.find((p) => p.name.toLowerCase() === String(pseudo).toLowerCase());
  if (!player) {
    return jsonResponse(400, { error: 'Pseudo non reconnu. Utilise /register sur Discord avant de t\'inscrire.' });
  }

  const owned = new Set(player.owned || []);
  const invalid = personnages.filter((id) => !owned.has(id));
  if (invalid.length > 0) {
    return jsonResponse(400, { error: 'Un ou plusieurs personnages choisis ne t\'appartiennent pas.' });
  }

  const minCharacters = Number(inscription.minCharacters) || 1;
  if (personnages.length < minCharacters) {
    return jsonResponse(400, { error: `Propose au moins ${minCharacters} personnage(s).` });
  }

  if (!inscription.openedBy) {
    return jsonResponse(500, { error: 'Aucun responsable d\'inscription enregistré, contacte le staff.' });
  }

  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const persoNames = personnages.map((id) => charById[id]?.name || id).join(', ');

  const lines = [
    `📋 **Nouvelle inscription — ${inscription.title || 'saison en cours'}**`,
    `Pseudo : **${player.name}** (<@${player.discordId}>)`,
    `Présent tous les jours : ${presence === 'non' ? 'Non' : 'Oui'}${presence === 'non' && remplacant ? ` — remplaçant : ${remplacant}` : ''}`,
    `Personnages proposés : ${persoNames}`,
    `Intention de tuer : ${intentionTuer === 'oui' ? 'Oui' : 'Non'}`,
    `Place réservée : ${placeReservee || 'Pas de place réservée'}`,
    `Souhaite être mastermind : ${mastermind === 'oui' ? 'Oui' : 'Non'}`,
  ];

  try {
    await sendDirectMessage(env, inscription.openedBy, lines.join('\n'));
  } catch (err) {
    return jsonResponse(500, { error: 'Inscription enregistrée mais échec de l\'envoi du MP au staff : ' + err.message });
  }

  return jsonResponse(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/submit-inscription') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
      if (request.method !== 'POST') return jsonResponse(405, { error: 'Méthode non autorisée.' });
      return handleInscriptionResponse(request, env);
    }

    if (request.method !== 'POST') return new Response('Bot Danganronpa Rebirth RP en ligne.', { status: 200 });

    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const body = await request.text();
    const isValid = signature && timestamp && (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
    if (!isValid) return new Response('Signature invalide', { status: 401 });

    const interaction = JSON.parse(body);

    if (interaction.type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      return handleAutocomplete(env, interaction);
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      try {
        return await handleCommand(env, interaction);
      } catch (err) {
        return reply(`Erreur : ${err.message}`);
      }
    }

    if (interaction.type === InteractionType.MODAL_SUBMIT) {
      try {
        return await handleModalSubmit(env, interaction);
      } catch (err) {
        return reply(`Erreur : ${err.message}`);
      }
    }

    return new Response('Type d\'interaction non géré', { status: 400 });
  },
};
