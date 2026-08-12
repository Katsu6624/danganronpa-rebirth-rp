// Exécute ce script UNE FOIS (ou après avoir modifié les commandes) pour les enregistrer auprès de Discord.
// Nécessite les variables d'environnement DISCORD_APP_ID et DISCORD_BOT_TOKEN (définis par toi localement,
// jamais commités dans le repo).
//
// Sans DISCORD_GUILD_ID : commandes globales (propagation jusqu'à 1h, valables sur tous les serveurs).
// Avec DISCORD_GUILD_ID : commandes propres à ce serveur (instantané, pratique pour tester).
//
// Usage (PowerShell) :
//   $env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."; $env:DISCORD_GUILD_ID="..."; node register-commands.mjs

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !token) {
  console.error('DISCORD_APP_ID et DISCORD_BOT_TOKEN doivent être définis dans l\'environnement.');
  process.exit(1);
}

const MANAGE_GUILD = '32'; // permission bit pour restreindre par défaut aux membres avec "Gérer le serveur"

const commands = [
  {
    name: 'help',
    description: 'Voir toutes les commandes disponibles',
    dm_permission: false,
  },
  {
    name: 'register',
    description: 'T\'inscrire sur la page Joueurs du site',
    dm_permission: false,
  },
  {
    name: 'liste',
    description: 'Voir les personnages d\'un joueur',
    dm_permission: false,
    options: [
      { type: 6, name: 'joueur', description: 'Le joueur (toi par défaut)', required: false },
    ],
  },
  {
    name: 'debloquer',
    description: 'Attribuer un personnage à un joueur',
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
    options: [
      { type: 6, name: 'joueur', description: 'Le joueur', required: true },
      { type: 3, name: 'personnage', description: 'Le personnage', required: true, autocomplete: true },
    ],
  },
  {
    name: 'retirer',
    description: 'Retirer un personnage à un joueur',
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
    options: [
      { type: 6, name: 'joueur', description: 'Le joueur', required: true },
      { type: 3, name: 'personnage', description: 'Le personnage', required: true, autocomplete: true },
    ],
  },
  {
    name: 'vip',
    description: 'Gérer les paliers VIP (débloquent tous les personnages tant qu\'ils sont actifs)',
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
    options: [
      {
        type: 2, // SUB_COMMAND_GROUP
        name: 'espoir',
        description: 'Palier Lycéen de l\'Espoir',
        options: [
          {
            type: 1,
            name: 'donner',
            description: 'Donner le rôle Lycéen de l\'Espoir et débloquer tous les personnages',
            options: [{ type: 6, name: 'joueur', description: 'Le joueur', required: true }],
          },
          {
            type: 1,
            name: 'retirer',
            description: 'Retirer le rôle Lycéen de l\'Espoir (attributions individuelles conservées)',
            options: [{ type: 6, name: 'joueur', description: 'Le joueur', required: true }],
          },
        ],
      },
      {
        type: 2,
        name: 'prepa',
        description: 'Palier Lycéen en Cours Préparatoire',
        options: [
          {
            type: 1,
            name: 'donner',
            description: 'Donner le rôle Lycéen en Cours Préparatoire et débloquer tous les personnages',
            options: [{ type: 6, name: 'joueur', description: 'Le joueur', required: true }],
          },
          {
            type: 1,
            name: 'retirer',
            description: 'Retirer le rôle Lycéen en Cours Préparatoire (attributions individuelles conservées)',
            options: [{ type: 6, name: 'joueur', description: 'Le joueur', required: true }],
          },
        ],
      },
    ],
  },
];

const endpoint = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(endpoint, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error('Échec de l\'enregistrement des commandes :', res.status, await res.text());
  process.exit(1);
}

console.log(`Commandes enregistrées avec succès${guildId ? ' (serveur ' + guildId + ', instantané)' : ' (globales, jusqu\'à 1h de propagation)'}.`);
