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

function getOptions(interaction) {
  const sub = interaction.data.options?.[0];
  const opts = {};
  (sub?.options || []).forEach((o) => { opts[o.name] = o.value; });
  return { subcommand: sub?.name, opts };
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
    '`/register` — T\'inscrire sur la page Joueurs du site. Accessible à tout le monde.',
    '`/roster liste [joueur]` — Voir les personnages d\'un joueur (toi par défaut). Accessible à tout le monde.',
    '',
    '⚠️ **Commandes réservées au staff** (permission "Gérer le serveur") :',
    '`/roster donner <joueur> <personnage>` — Attribuer un personnage à un joueur.',
    '`/roster retirer <joueur> <personnage>` — Retirer un personnage à un joueur.',
    '`/roster debloquer <joueur> <personnage>` — Ajouter un personnage à la liste "à débloquer" d\'un joueur.',
  ];
  return reply(lines.join('\n'));
}

async function handleCommand(env, interaction) {
  if (interaction.data.name === 'register') {
    return handleRegister(env, interaction);
  }

  if (interaction.data.name === 'help') {
    return handleHelp();
  }

  const { subcommand, opts } = getOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));

  if (subcommand === 'liste') {
    const targetUser = opts.joueur ? interaction.data.resolved.users[opts.joueur] : interaction.member.user;
    const { data: players } = await getPlayers(env);
    const player = findPlayer(players, targetUser.id);
    if (!player) return reply(`${targetUser.username} n'a aucun personnage enregistré.`);
    const owned = (player.owned || []).map((id) => charById[id]?.name || id).join(', ') || 'aucun';
    const locked = (player.locked || []).map((id) => charById[id]?.name || id).join(', ') || 'aucun';
    return reply(`**${targetUser.username}**\nDébloqués : ${owned}\nÀ débloquer : ${locked}`);
  }

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

  if (subcommand === 'donner') {
    if (!player.owned.includes(charId)) player.owned.push(charId);
    player.locked = player.locked.filter((id) => id !== charId);
    await writeJsonFile(env, 'data/players.json', players, sha, `Attribution de ${character.name} à ${targetUser.username}`);
    return reply(`✅ ${character.name} attribué à ${targetUser.username}.`);
  }

  if (subcommand === 'retirer') {
    player.owned = player.owned.filter((id) => id !== charId);
    await writeJsonFile(env, 'data/players.json', players, sha, `Retrait de ${character.name} à ${targetUser.username}`);
    return reply(`✅ ${character.name} retiré à ${targetUser.username}.`);
  }

  if (subcommand === 'debloquer') {
    if (!player.locked.includes(charId) && !player.owned.includes(charId)) player.locked.push(charId);
    await writeJsonFile(env, 'data/players.json', players, sha, `${character.name} ajouté au déblocage de ${targetUser.username}`);
    return reply(`✅ ${character.name} ajouté à la liste "à débloquer" de ${targetUser.username}.`);
  }

  return reply('Sous-commande inconnue.');
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
