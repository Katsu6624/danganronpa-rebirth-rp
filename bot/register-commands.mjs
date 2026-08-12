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
    name: 'roster',
    description: 'Gérer les personnages attribués aux joueurs',
    default_member_permissions: MANAGE_GUILD,
    dm_permission: false,
    options: [
      {
        type: 1, // SUB_COMMAND
        name: 'donner',
        description: 'Attribuer un personnage à un joueur',
        options: [
          { type: 6, name: 'joueur', description: 'Le joueur', required: true },
          { type: 3, name: 'personnage', description: 'Le personnage', required: true, autocomplete: true },
        ],
      },
      {
        type: 1,
        name: 'retirer',
        description: 'Retirer un personnage à un joueur',
        options: [
          { type: 6, name: 'joueur', description: 'Le joueur', required: true },
          { type: 3, name: 'personnage', description: 'Le personnage', required: true, autocomplete: true },
        ],
      },
      {
        type: 1,
        name: 'debloquer',
        description: 'Ajouter un personnage à la liste "à débloquer" d\'un joueur',
        options: [
          { type: 6, name: 'joueur', description: 'Le joueur', required: true },
          { type: 3, name: 'personnage', description: 'Le personnage', required: true, autocomplete: true },
        ],
      },
      {
        type: 1,
        name: 'liste',
        description: 'Voir les personnages d\'un joueur',
        options: [
          { type: 6, name: 'joueur', description: 'Le joueur (toi par défaut)', required: false },
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
