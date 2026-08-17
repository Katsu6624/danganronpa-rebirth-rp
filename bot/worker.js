import { verifyKey } from 'discord-interactions';

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, APPLICATION_COMMAND_AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 };
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  UPDATE_MESSAGE: 7,
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

// Séparé de handleRegister pour pouvoir être exécuté après une réponse différée (voir fetch()) :
// avec beaucoup d'inscriptions simultanées, les conflits d'écriture sur players.json et leurs
// réessais peuvent facilement dépasser les 3s que Discord accorde pour répondre à l'interaction.
async function handleRegisterAsync(env, interaction) {
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
    return `Tu es déjà enregistré en tant que ${ctx.existingName}. Retrouve-toi sur la page Personnages du site (recherche ton pseudo).`;
  }
  return `✅ Tu es enregistré, ${user.username} ! Tous les personnages de Trigger Happy Havoc, Goodbye Despair et Killing Harmony sont débloqués pour toi. Le reste est à débloquer. Retrouve-toi sur la page Personnages du site.`;
}

async function handleRegister(env, interaction) {
  return reply(await handleRegisterAsync(env, interaction));
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
    '`/inscription ouvrir titre type places max_chapitres min_perso` : ouvre un modal (bannis/ton/planning) puis ouvre les inscriptions à une saison.',
    '`/inscription image url:<lien>` : ajoute une image à la page Inscription (inscriptions déjà ouvertes).',
    '`/inscription fermer` : ferme les inscriptions.',
    '`/recompense perso joueur:@X` : envoie un MP au joueur pour qu\'il choisisse lui-même un personnage à débloquer.',
  ];
  return reply(lines.join('\n'));
}

const VIP_TIERS = {
  espoir: { roleEnvVar: 'DISCORD_ROLE_ESPOIR', label: "Lycéen de l'Espoir" },
  prepa: { roleEnvVar: 'DISCORD_ROLE_PREPA', label: 'Lycéen en Cours Préparatoire' },
};

async function handleVipAsync(env, interaction) {
  const group = interaction.data.options?.[0];
  const tier = VIP_TIERS[group?.name];
  if (!tier) return 'Palier VIP inconnu.';

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

  if (ctx.unknownSub) return 'Sous-commande VIP inconnue.';

  if (ctx.action === 'donner') {
    if (ctx.previousTier && ctx.previousTier !== group.name) {
      const previousRoleId = env[VIP_TIERS[ctx.previousTier].roleEnvVar];
      await setDiscordRole(env, targetUser.id, previousRoleId, false);
    }
    await setDiscordRole(env, targetUser.id, roleId, true);
    await notifyPlayer(env, targetUser.id, `✨ Le rôle **${tier.label}** vous a été donné par ${interaction.member.user.username} : tous les personnages sont débloqués.`);
    return `✅ ${targetUser.username} a maintenant le rôle ${tier.label} : tous les personnages sont débloqués.`;
  }

  await setDiscordRole(env, targetUser.id, roleId, false);
  await notifyPlayer(env, targetUser.id, `Le rôle **${tier.label}** vous a été retiré par ${interaction.member.user.username}. Les personnages attribués individuellement sont conservés.`);
  return `✅ Le rôle ${tier.label} de ${targetUser.username} a été retiré. Les personnages attribués individuellement sont conservés.`;
}

async function handleVip(env, interaction) {
  return reply(await handleVipAsync(env, interaction));
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

async function handleDebloquerAsync(env, interaction) {
  const opts = getFlatOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const charId = opts.personnage;
  const character = charById[charId];
  if (!character) return `Personnage inconnu : \`${charId}\`. Utilise l'autocomplétion pour choisir un personnage valide.`;

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

  await notifyPlayer(env, targetUser.id, `🔓 **${character.name}** vous a été débloqué par ${interaction.member.user.username}.`);

  return `✅ ${character.name} attribué à ${targetUser.username}.`;
}

async function handleDebloquer(env, interaction) {
  return reply(await handleDebloquerAsync(env, interaction));
}

async function handleRetirerAsync(env, interaction) {
  const opts = getFlatOptions(interaction);
  const characters = await getCharacters(env);
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
  const charId = opts.personnage;
  const character = charById[charId];
  if (!character) return `Personnage inconnu : \`${charId}\`. Utilise l'autocomplétion pour choisir un personnage valide.`;

  const targetUser = interaction.data.resolved.users[opts.joueur];

  const ctx = await updatePlayersFile(env, (players) => {
    const player = findPlayer(players, targetUser.id);
    if (!player) return { skipWrite: true, notFound: true };
    player.owned = (player.owned || []).filter((id) => id !== charId);
    return { message: `Retrait de ${character.name} à ${targetUser.username}` };
  });

  if (ctx.notFound) return `${targetUser.username} n'a aucun personnage enregistré.`;

  await notifyPlayer(env, targetUser.id, `🔒 **${character.name}** vous a été retiré par ${interaction.member.user.username}.`);

  return `✅ ${character.name} retiré à ${targetUser.username}.`;
}

async function handleRetirer(env, interaction) {
  return reply(await handleRetirerAsync(env, interaction));
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

const MANAGE_GUILD_BIT = BigInt(0x20);

function isStaffOrMonokuma(env, interaction) {
  const perms = BigInt(interaction.member.permissions || '0');
  const hasManageGuild = (perms & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
  const monokumaRoleId = env.DISCORD_ROLE_MONOKUMA || '1178889299350003803';
  const hasMonokumaRole = (interaction.member.roles || []).includes(monokumaRoleId);
  return hasManageGuild || hasMonokumaRole;
}

async function handleInscription(env, interaction) {
  if (!isStaffOrMonokuma(env, interaction)) {
    return reply("Tu n'as pas la permission d'utiliser cette commande.");
  }

  const sub = interaction.data.options?.[0];

  if (sub?.name === 'ouvrir') {
    const opts = Object.fromEntries((sub.options || []).map((o) => [o.name, o.value]));
    // Un seul modal (pas de chaînage de modals, peu fiable côté API Discord) : les champs
    // courts sont des options de la commande, saisies avant l'envoi ; le custom_id du modal
    // les transporte jusqu'à la soumission (le Worker est sans état entre deux interactions).
    const draft = [opts.titre, opts.type, opts.places, opts.max_chapitres, opts.min_perso].join('|');
    return modalResponse(`insc_details:${draft}`, 'Ouverture des inscriptions', [
      { id: 'bannis', label: 'Personnages bannis (laisser vide sinon)', style: 2, required: false, placeholder: 'Aucun' },
      { id: 'ton', label: 'Ton et attentes RP', style: 2 },
      { id: 'planning', label: 'Planning (horaires par chapitre)', style: 2, placeholder: 'Chap 1 : 18h-00h (pause 20h)\nChap 2 : ...' },
    ]);
  }

  if (sub?.name === 'image') {
    const url = sub.options?.find((o) => o.name === 'url')?.value || '';
    if (!/^https?:\/\//.test(url)) {
      return reply("L'image doit être une URL valide (http:// ou https://).");
    }
    const ctx = await updateJsonFile(env, 'data/inscription.json', (data) => {
      if (!data.open) return { skipWrite: true, notOpen: true };
      data.imageUrl = url;
      data.updatedAt = new Date().toISOString();
      return { message: 'Ajout d\'une image aux inscriptions' };
    });
    if (ctx.notOpen) return reply('Aucune inscription n\'est ouverte actuellement.');
    return reply('✅ Image ajoutée à la page Inscription.', false);
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
        imageUrl: '',
        registrations: [],
        updatedAt: new Date().toISOString(),
      });
      return { message: 'Fermeture des inscriptions' };
    });

    return reply('✅ Inscriptions fermées.', false);
  }

  return reply('Sous-commande inconnue.');
}

async function handleInscriptionDetailsSubmit(env, interaction) {
  if (!isStaffOrMonokuma(env, interaction)) {
    return reply("Tu n'as pas la permission d'utiliser cette commande.");
  }

  const [titre, type_saison, places, max_chapitres, min_perso] = interaction.data.custom_id
    .slice('insc_details:'.length)
    .split('|');
  const v = getModalValues(interaction);
  const openedBy = interaction.member.user.id;

  await updateJsonFile(env, 'data/inscription.json', (data) => {
    Object.assign(data, {
      open: true,
      title: titre,
      seasonType: type_saison,
      slots: places,
      maxChapters: max_chapitres,
      minCharacters: min_perso,
      bannedCharacters: v.bannis || '',
      tone: v.ton,
      planning: v.planning,
      openedBy,
      imageUrl: '',
      registrations: [],
      updatedAt: new Date().toISOString(),
    });
    return { message: `Ouverture des inscriptions : ${titre}` };
  });

  return reply(`✅ Inscriptions ouvertes pour **${titre}**. Le formulaire est en ligne sur la page Inscription du site.`, false);
}

async function handleModalSubmit(env, interaction) {
  const customId = interaction.data.custom_id;
  if (customId.startsWith('insc_details:')) return handleInscriptionDetailsSubmit(env, interaction);
  return reply('Formulaire inconnu.');
}

async function handleRecompenseAsync(env, interaction) {
  if (!isStaffOrMonokuma(env, interaction)) {
    return "Tu n'as pas la permission d'utiliser cette commande.";
  }

  const sub = interaction.data.options?.[0];
  if (sub?.name !== 'perso') return 'Sous-commande inconnue.';

  const targetId = sub.options?.find((o) => o.name === 'joueur')?.value;
  const targetUser = interaction.data.resolved.users[targetId];

  const { data: players } = await getPlayers(env);
  const player = findPlayer(players, targetUser.id);
  if (!player) {
    return `${targetUser.username} n'est pas encore inscrit (utilise /register sur Discord).`;
  }

  const characters = await getCharacters(env);
  const lockedIds = new Set(player.locked || []);
  const lockedByFaction = {};
  characters.forEach((c) => {
    if (lockedIds.has(c.id)) {
      lockedByFaction[c.faction] = lockedByFaction[c.faction] || [];
      lockedByFaction[c.faction].push(c);
    }
  });
  const factions = Object.keys(lockedByFaction);

  if (factions.length === 0) {
    return `${targetUser.username} a déjà débloqué tous les personnages.`;
  }

  const staffName = interaction.member.user.username;
  const options = factions.slice(0, 25).map((f) => ({ label: f, value: f }));

  try {
    await sendDirectMessage(
      env,
      targetUser.id,
      `🎁 **${staffName}** vous offre un personnage au choix ! Choisissez d'abord une collection :`,
      [{ type: 1, components: [{ type: 3, custom_id: 'recomp_faction', placeholder: 'Choisir une collection...', options }] }]
    );
  } catch (err) {
    return `Échec de l'envoi du MP à ${targetUser.username} (MP probablement désactivés).`;
  }

  return `✅ Récompense envoyée en MP à ${targetUser.username}.`;
}

async function handleRecompense(env, interaction) {
  return reply(await handleRecompenseAsync(env, interaction));
}

async function handleRecompenseFactionSelect(env, interaction) {
  const faction = interaction.data.values?.[0];
  const userId = interaction.user.id;

  const { data: players } = await getPlayers(env);
  const player = findPlayer(players, userId);
  if (!player) return reply('Erreur : joueur introuvable.');

  const characters = await getCharacters(env);
  const lockedIds = new Set(player.locked || []);
  const options = characters
    .filter((c) => c.faction === faction && lockedIds.has(c.id))
    .slice(0, 25)
    .map((c) => ({ label: c.name, value: c.id, description: c.ultimate?.slice(0, 100) }));

  if (options.length === 0) {
    return new Response(
      JSON.stringify({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: { content: 'Tu as déjà tous les personnages de cette collection.', components: [] },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  return selectMenuResponse(
    InteractionResponseType.UPDATE_MESSAGE,
    `Collection **${faction}** : choisis le personnage à débloquer.`,
    'recomp_char',
    'Choisir un personnage...',
    options
  );
}

async function handleRecompenseCharSelect(env, interaction) {
  const charId = interaction.data.values?.[0];
  const userId = interaction.user.id;

  const characters = await getCharacters(env);
  const character = characters.find((c) => c.id === charId);
  if (!character) {
    return new Response(
      JSON.stringify({ type: InteractionResponseType.UPDATE_MESSAGE, data: { content: 'Personnage introuvable.', components: [] } }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  await updatePlayersFile(env, (players) => {
    const player = findPlayer(players, userId);
    if (!player) return { skipWrite: true };
    player.owned = player.owned || [];
    if (!player.owned.includes(charId)) player.owned.push(charId);
    player.locked = (player.locked || []).filter((id) => id !== charId);
    if (player.vipGrantedIds) player.vipGrantedIds = player.vipGrantedIds.filter((id) => id !== charId);
    return { message: `Récompense : ${character.name} débloqué pour ${player.name}` };
  });

  return new Response(
    JSON.stringify({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { content: `✅ Tu as débloqué **${character.name}** ! C'est mis à jour sur le site.`, components: [] },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

async function handleMessageComponent(env, interaction) {
  const customId = interaction.data.custom_id;
  if (customId === 'recomp_faction') return handleRecompenseFactionSelect(env, interaction);
  if (customId === 'recomp_char') return handleRecompenseCharSelect(env, interaction);
  return reply('Interaction inconnue.');
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
    case 'recompense': return handleRecompense(env, interaction);
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

// Édite la réponse d'une interaction différée (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE).
// N'a pas besoin du token du bot : le token de l'interaction s'authentifie lui-même.
async function editDeferredReply(interaction, content) {
  await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

async function sendDirectMessage(env, userId, content, components) {
  const channel = await discordRequest(env, '/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: userId }),
  });
  await discordRequest(env, `/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(components ? { content, components } : { content }),
  });
}

// Best-effort : un joueur qui a désactivé ses MP ne doit pas faire échouer la commande staff.
async function notifyPlayer(env, userId, content, components) {
  try {
    await sendDirectMessage(env, userId, content, components);
  } catch (err) {
    // silencieux
  }
}

// --- Connexion Discord (OAuth2) pour la page Inscription ---------------------------------
// But : empêcher qu'un joueur inscrive quelqu'un d'autre en tapant simplement son pseudo dans
// le formulaire. On authentifie via le vrai compte Discord (OAuth2) et on signe un jeton court
// (HMAC) que le site garde en localStorage et renvoie au Worker à la soumission.

function base64url(bytes) {
  let str = '';
  bytes.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signAuthToken(env, payload) {
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

async function verifyAuthToken(env, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  try {
    const key = await hmacKey(env);
    const valid = await crypto.subtle.verify('HMAC', key, base64urlDecode(sigB64), new TextEncoder().encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12h

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const siteUrl = env.SITE_URL || 'https://katsu6624.github.io/danganronpa-rebirth-rp';
  if (!code) return Response.redirect(`${siteUrl}/inscription.html#auth_error=1`, 302);

  const redirectUri = `${url.origin}/oauth/callback`;

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) return Response.redirect(`${siteUrl}/inscription.html#auth_error=1`, 302);
  const tokenData = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) return Response.redirect(`${siteUrl}/inscription.html#auth_error=1`, 302);
  const user = await userRes.json();

  const authToken = await signAuthToken(env, {
    id: user.id,
    username: user.username,
    exp: Date.now() + SESSION_DURATION_MS,
  });

  return Response.redirect(`${siteUrl}/inscription.html#auth=${authToken}`, 302);
}

function selectMenuResponse(type, content, customId, placeholder, options) {
  return new Response(
    JSON.stringify({
      type,
      data: {
        content,
        components: [
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: customId,
                placeholder,
                options,
              },
            ],
          },
        ],
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

async function handleInscriptionResponse(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'JSON invalide.' });
  }

  const { authToken, presence, remplacant, personnages, intentionTuer, intentionTuerDetails, placeReservee, mastermind, oc } = payload;
  if (!Array.isArray(personnages) || personnages.length === 0) {
    return jsonResponse(400, { error: 'Champs manquants.' });
  }

  const auth = await verifyAuthToken(env, authToken);
  if (!auth) {
    return jsonResponse(401, { error: 'Connecte-toi avec Discord avant de t\'inscrire (session expirée ou absente).' });
  }

  const { data: inscription } = await readJsonFile(env, 'data/inscription.json');
  if (!inscription.open) {
    return jsonResponse(400, { error: 'Les inscriptions sont fermées.' });
  }

  const { data: players } = await getPlayers(env);
  const player = findPlayer(players, auth.id);
  if (!player) {
    return jsonResponse(400, { error: 'Compte non reconnu. Utilise /register sur Discord avant de t\'inscrire.' });
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
    `Intention de tuer : ${intentionTuer === 'oui' ? 'Oui' : 'Non'}${intentionTuer === 'oui' && intentionTuerDetails ? ` — ${intentionTuerDetails}` : ''}`,
    `Place réservée : ${placeReservee || 'Pas de place réservée'}`,
    `Souhaite être mastermind : ${mastermind === 'oui' ? 'Oui' : 'Non'}`,
    `OC souhaité : ${oc ? oc : 'Aucun'}`,
  ];

  try {
    await sendDirectMessage(env, inscription.openedBy, lines.join('\n'));
  } catch (err) {
    return jsonResponse(500, { error: 'Inscription enregistrée mais échec de l\'envoi du MP au staff : ' + err.message });
  }

  // Compteur affiché sur la page Inscription : on ne compte qu'une fois par joueur
  // (un même joueur qui renvoie le formulaire met juste à jour sa place dans la liste).
  await updateJsonFile(env, 'data/inscription.json', (data) => {
    if (!data.open) return { skipWrite: true };
    data.registrations = [...new Set([...(data.registrations || []), player.discordId])];
    return { message: `Inscription de ${player.name} comptabilisée` };
  });

  return jsonResponse(200, { ok: true });
}

// Commandes qui écrivent sur GitHub (donc sujettes aux conflits/réessais) et/ou envoient des MP :
// on accuse réception tout de suite pour ne jamais dépasser les 3s accordées par Discord, puis
// on édite la réponse une fois le traitement terminé (voir fetch()).
const DEFERRED_COMMANDS = {
  register: handleRegisterAsync,
  vip: handleVipAsync,
  debloquer: handleDebloquerAsync,
  retirer: handleRetirerAsync,
  recompense: handleRecompenseAsync,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/submit-inscription') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
      if (request.method !== 'POST') return jsonResponse(405, { error: 'Méthode non autorisée.' });
      return handleInscriptionResponse(request, env);
    }

    if (url.pathname === '/oauth/callback') {
      return handleOAuthCallback(request, env);
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
      // /register peut être appelé en rafale (beaucoup de monde en même temps) : les conflits
      // d'écriture sur players.json et leurs réessais peuvent dépasser les 3s accordées par
      // Discord. On accuse réception tout de suite, puis on finalise en tâche de fond.
      const deferredHandler = DEFERRED_COMMANDS[interaction.data.name];
      if (deferredHandler) {
        ctx.waitUntil(
          deferredHandler(env, interaction)
            .then((content) => editDeferredReply(interaction, content))
            .catch((err) => editDeferredReply(interaction, `Erreur : ${err.message}`))
        );
        return new Response(
          JSON.stringify({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: 64 } }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      try {
        return await handleCommand(env, interaction);
      } catch (err) {
        return reply(`Erreur : ${err.message}`);
      }
    }

    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      try {
        return await handleMessageComponent(env, interaction);
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
