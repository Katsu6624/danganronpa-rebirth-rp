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
  {
    name: 'inscription',
    description: 'Gérer les inscriptions à la saison en cours',
    // Pas de default_member_permissions : visible par tout le monde, mais le Worker
    // vérifie lui-même (permission "Gérer le serveur" OU rôle Monokuma) avant d'agir.
    dm_permission: false,
    options: [
      {
        type: 1,
        name: 'ouvrir',
        description: 'Ouvrir les inscriptions à une saison',
        options: [
          { type: 3, name: 'titre', description: 'Titre de la saison (ex : Saison 50)', required: true, max_length: 30 },
          {
            type: 3,
            name: 'type',
            description: 'Type de saison',
            required: true,
            choices: [
              { name: 'Classique', value: 'Classique' },
              { name: 'Jeu de la Mort Alternatif', value: 'Jeu de la Mort Alternatif' },
              { name: 'Grande Échelle', value: 'Grande Échelle' },
              { name: 'Libre', value: 'Libre' },
            ],
          },
          { type: 4, name: 'places', description: 'Nombre de places disponibles', required: true, min_value: 1 },
          { type: 4, name: 'max_chapitres', description: 'Nombre de chapitres max', required: true, min_value: 1, max_value: 6 },
          { type: 4, name: 'min_perso', description: 'Nombre min. de personnages à proposer', required: true, min_value: 1 },
        ],
      },
      {
        type: 1,
        name: 'image',
        description: 'Ajouter une image à la page Inscription (inscriptions déjà ouvertes)',
        options: [{ type: 3, name: 'url', description: "Lien de l'image", required: true }],
      },
      {
        type: 1,
        name: 'fermer',
        description: 'Fermer les inscriptions',
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
