import { verifyKey } from 'discord-interactions';

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, APPLICATION_COMMAND_AUTOCOMPLETE: 4 };
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
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
    '`/inscription ouvrir <lien>` : ouvre les inscriptions avec un lien de Google Form (mis à jour sur le site et dans le salon d\'inscription).',
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

function isGoogleFormUrl(url) {
  return /^https:\/\/docs\.google\.com\/forms\//.test(url);
}

async function handleInscription(env, interaction) {
  const sub = interaction.data.options?.[0];
  const channelId = env.DISCORD_CHANNEL_INSCRIPTION;

  if (sub?.name === 'ouvrir') {
    const lien = sub.options?.find((o) => o.name === 'lien')?.value || '';
    if (!isGoogleFormUrl(lien)) {
      return reply('Le lien doit être une URL Google Forms valide (https://docs.google.com/forms/...).');
    }

    const ctx = await updateJsonFile(env, 'data/inscription.json', (data) => {
      data.open = true;
      data.formUrl = lien;
      data.updatedAt = new Date().toISOString();
      return { message: 'Ouverture des inscriptions', messageId: data.messageId };
    });

    if (channelId) {
      const content = `📝 **Les inscriptions sont ouvertes !**\n${lien}`;
      await upsertInscriptionMessage(env, channelId, content, ctx.messageId);
    }

    return reply('✅ Inscriptions ouvertes. Le lien est en ligne sur la page Inscription du site et dans le salon dédié.', false);
  }

  if (sub?.name === 'fermer') {
    const ctx = await updateJsonFile(env, 'data/inscription.json', (data) => {
      data.open = false;
      data.formUrl = '';
      data.updatedAt = new Date().toISOString();
      return { message: 'Fermeture des inscriptions', messageId: data.messageId };
    });

    if (channelId) {
      const content = `🔒 **Les inscriptions sont fermées.** Aucune saison n'est ouverte aux inscriptions pour le moment.`;
      await upsertInscriptionMessage(env, channelId, content, ctx.messageId);
    }

    return reply('✅ Inscriptions fermées.', false);
  }

  return reply('Sous-commande inconnue.');
}

async function upsertInscriptionMessage(env, channelId, content, existingMessageId) {
  if (existingMessageId) {
    try {
      await discordRequest(env, `/channels/${channelId}/messages/${existingMessageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      return;
    } catch (err) {
      // Le message a peut-être été supprimé manuellement : on en renvoie un nouveau.
    }
  }
  const message = await discordRequest(env, `/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (message?.id) {
    await updateJsonFile(env, 'data/inscription.json', (data) => {
      data.messageId = message.id;
      return { message: 'Mémorisation du message d\'inscription' };
    });
  }
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

export default {
  async fetch(request, env) {
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

    return new Response('Type d\'interaction non géré', { status: 400 });
  },
};
