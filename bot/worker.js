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
  const [{ data: players, sha }, characters] = await Promise.all([getPlayers(env), getCharacters(env)]);
  const existing = findPlayer(players, user.id);
  if (existing) {
    return reply(`Tu es déjà enregistré en tant que ${existing.name}. Retrouve-toi sur la page Joueurs du site.`);
  }

  const owned = characters.filter((c) => FREE_FACTIONS.includes(c.faction)).map((c) => c.id);
  const locked = characters.filter((c) => !FREE_FACTIONS.includes(c.faction)).map((c) => c.id);

  players.push({ name: user.username, discordId: user.id, owned, locked });
  await writeJsonFile(env, 'data/players.json', players, sha, `Inscription de ${user.username} via /register`);
  return reply(`✅ Tu es enregistré, ${user.username} ! Tous les personnages de Trigger Happy Havoc, Goodbye Despair et Killing Harmony sont débloqués pour toi. Le reste est à débloquer. Retrouve-toi sur la page Joueurs du site.`);
}

function handleHelp() {
  const lines = [
    '**Commandes disponibles**',
    '',
    '`/register` : t\'inscrire sur la page Joueurs du site. Accessible à tout le monde.',
    '`/liste [joueur]` : voir les personnages d\'un joueur (toi par défaut). Accessible à tout le monde.',
    '',
    '⚠️ **Commandes réservées au staff** (permission "Gérer le serveur") :',
    '`/debloquer <joueur> <personnage>` : attribuer un personnage à un joueur.',
    '`/retirer <joueur> <personnage>` : retirer un personnage à un joueur.',
    '`/vip espoir donner <joueur>` : donne le rôle Lycéen de l\'Espoir et débloque tous les personnages.',
    '`/vip espoir retirer <joueur>` : retire le rôle Lycéen de l\'Espoir (les attributions individuelles sont conservées).',
    '`/vip prepa donner <joueur>` : donne le rôle Lycéen en Cours Préparatoire et débloque tous les personnages.',
    '`/vip prepa retirer <joueur>` : retire le rôle Lycéen en Cours Préparatoire (les attributions individuelles sont conservées).',
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

  const [{ data: players, sha }, characters] = await Promise.all([getPlayers(env), getCharacters(env)]);
  const allIds = characters.map((c) => c.id);
  const freeIds = characters.filter((c) => FREE_FACTIONS.includes(c.faction)).map((c) => c.id);

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
    await writeJsonFile(env, 'data/players.json', players, sha, `VIP (${tier.label}) accordé à ${targetUser.username}`);
    if (previousTier && previousTier !== group.name) {
      const previousRoleId = env[VIP_TIERS[previousTier].roleEnvVar];
      await setDiscordRole(env, targetUser.id, previousRoleId, false);
    }
    await setDiscordRole(env, targetUser.id, roleId, true);
    return reply(`✅ ${targetUser.username} a maintenant le rôle ${tier.label} : tous les personnages sont débloqués.`);
  }

  if (sub.name === 'retirer') {
    const grantedByVip = new Set(player.vipGrantedIds || []);
    player.owned = player.owned.filter((id) => !grantedByVip.has(id));
    const stillMissing = allIds.filter((id) => !player.owned.includes(id) && !freeIds.includes(id));
    player.locked = [...new Set([...(player.locked || []), ...stillMissing])];
    player.vip = false;
    player.vipTier = null;
    player.vipGrantedIds = [];
    await writeJsonFile(env, 'data/players.json', players, sha, `VIP (${tier.label}) retiré à ${targetUser.username}`);
    await setDiscordRole(env, targetUser.id, roleId, false);
    return reply(`✅ Le rôle ${tier.label} de ${targetUser.username} a été retiré. Les personnages attribués individuellement sont conservés.`);
  }

  return reply('Sous-commande VIP inconnue.');
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
  const { data: players, sha } = await getPlayers(env);
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
  await writeJsonFile(env, 'data/players.json', players, sha, `Attribution de ${character.name} à ${targetUser.username}`);
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
  const { data: players, sha } = await getPlayers(env);
  const player = findPlayer(players, targetUser.id);
  if (!player) return reply(`${targetUser.username} n'a aucun personnage enregistré.`);

  player.owned = (player.owned || []).filter((id) => id !== charId);
  await writeJsonFile(env, 'data/players.json', players, sha, `Retrait de ${character.name} à ${targetUser.username}`);
  return reply(`✅ ${character.name} retiré à ${targetUser.username}.`);
}

async function handleCommand(env, interaction) {
  switch (interaction.data.name) {
    case 'register': return handleRegister(env, interaction);
    case 'help': return handleHelp();
    case 'vip': return handleVip(env, interaction);
    case 'liste': return handleListe(env, interaction);
    case 'debloquer': return handleDebloquer(env, interaction);
    case 'retirer': return handleRetirer(env, interaction);
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
