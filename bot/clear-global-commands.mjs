// Supprime les commandes globales (pour ne garder que les commandes de serveur, instantanées).
// Usage (PowerShell) :
//   $env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."; node clear-global-commands.mjs

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
  console.error('DISCORD_APP_ID et DISCORD_BOT_TOKEN doivent être définis dans l\'environnement.');
  process.exit(1);
}

const res = await fetch('https://discord.com/api/v10/applications/' + appId + '/commands', {
  method: 'PUT',
  headers: {
    Authorization: 'Bot ' + token,
    'Content-Type': 'application/json',
  },
  body: '[]',
});

if (!res.ok) {
  console.error('Échec :', res.status, await res.text());
  process.exit(1);
}

console.log('Commandes globales supprimées.');
