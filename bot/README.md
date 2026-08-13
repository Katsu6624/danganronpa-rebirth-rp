# Bot Discord : gestion du roster

Bot "serverless" (aucune machine à laisser allumée) : hébergé sur Cloudflare Workers,
il répond aux commandes Discord et met à jour `data/players.json` directement sur
GitHub, ce qui republie le site automatiquement.

## Commandes

- `/register` : accessible à tout le monde, inscrit le joueur et débloque automatiquement
  Trigger Happy Havoc, Goodbye Despair et Killing Harmony
- `/help` : liste les commandes disponibles
- `/liste joueur:@X` : affiche le roster d'un joueur (accessible à tout le monde)
- `/debloquer joueur:@X personnage:<nom>` : attribue un personnage à un joueur ⚠️ staff
- `/retirer joueur:@X personnage:<nom>` : retire un personnage ⚠️ staff
- `/vip espoir donner joueur:@X` : donne le rôle Lycéen de l'Espoir et débloque tous les personnages ⚠️ staff
- `/vip espoir retirer joueur:@X` : retire ce rôle et reverrouille ce qui a été débloqué par le VIP ⚠️ staff
- `/vip prepa donner joueur:@X` : donne le rôle Lycéen en Cours Préparatoire et débloque tous les personnages ⚠️ staff
- `/vip prepa retirer joueur:@X` : retire ce rôle et reverrouille ce qui a été débloqué par le VIP ⚠️ staff
- `/inscription ouvrir lien:<url Google Form>` : ouvre les inscriptions, met à jour la page
  Inscription du site ⚠️ staff
- `/inscription fermer` : ferme les inscriptions, remet la page Inscription en état "fermé" ⚠️ staff

Pour les deux paliers `/vip`, les personnages attribués individuellement via `/debloquer`
restent acquis même après le retrait du rôle.

Les commandes marquées ⚠️ staff nécessitent la permission Discord **"Gérer le serveur"**
(modifiable dans Discord : Paramètres du serveur → Intégrations → Danganronpa Rebirth RP Bot).

---

## Mise en place (à faire une seule fois)

Étapes que **toi seul** dois faire (identifiants/comptes personnels) :

### 1. Créer l'application Discord
1. Va sur https://discord.com/developers/applications → **New Application**.
2. Onglet **Bot** → **Add Bot** → copie le **Token** (garde-le secret).
3. Onglet **General Information** → copie l'**Application ID** et la **Public Key**.
4. Onglet **OAuth2 → URL Generator** : coche `bot` et `applications.commands`,
   permission `Send Messages`. Ouvre l'URL générée pour inviter le bot sur ton serveur.

### 1bis. Pour la commande /vip (optionnel)
Le bot doit pouvoir gérer les rôles Lycéen de l'Espoir et Lycéen en Cours Préparatoire lui-même :
1. Dans **Paramètres du serveur → Rôles**, place le rôle du bot **au-dessus** de ces deux rôles
   dans la liste (Discord interdit à un bot de gérer un rôle placé au-dessus du sien).
2. Coche la permission **Gérer les rôles** pour le bot (Paramètres du serveur → Intégrations
   → Danganronpa Rebirth RP Bot, ou en réinvitant le bot avec cette permission cochée dans
   l'URL Generator).
3. Les IDs des deux rôles sont déjà renseignés dans `bot/wrangler.toml`
   (`DISCORD_ROLE_ESPOIR`, `DISCORD_ROLE_PREPA`). Si tu dois les changer, mode développeur
   activé → clic droit sur le rôle → Copier l'ID.

### 2. Créer un token GitHub (accès en écriture au repo)
1. https://github.com/settings/tokens?type=beta → **Generate new token** (fine-grained).
2. Repository access : seulement `danganronpa-rebirth-rp`.
3. Permissions : **Contents → Read and write**.
4. Génère et copie le token (il ne sera plus affiché ensuite).

### 3. Installer et déployer sur Cloudflare Workers
Dans le dossier `bot/` :

```bash
npm install
npx wrangler login
```

Ceci ouvre ton navigateur pour connecter ton compte Cloudflare (gratuit).

Ensuite, définis les secrets (ils te seront demandés en saisie masquée, jamais stockés dans le repo) :

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put DISCORD_BOT_TOKEN
```

Colle la Public Key Discord, le token GitHub, puis le **Bot Token** Discord (étape 1, nécessaire
pour que le bot puisse attribuer/retirer le rôle VIP).

Déploie :

```bash
npm run deploy
```

Wrangler affiche une URL du type `https://danganronpa-rebirth-rp-bot.<ton-compte>.workers.dev`.
**Copie cette URL.**

### 4. Connecter Discord au Worker
Retourne sur https://discord.com/developers/applications → ton app → **General Information**
→ champ **Interactions Endpoint URL** → colle l'URL du Worker → Save.
(Discord vérifie automatiquement la signature ; si ça échoue, revérifie l'étape des secrets.)

### 5. Enregistrer les commandes slash
Toujours dans `bot/` :

```bash
# PowerShell
$env:DISCORD_APP_ID="ton_application_id"; $env:DISCORD_BOT_TOKEN="ton_bot_token"; node register-commands.mjs
```

Les commandes `/roster ...` apparaissent alors dans Discord : **jusqu'à 1h** pour des commandes
globales (comportement par défaut). Pour un test instantané sur un seul serveur, ajoute
`DISCORD_GUILD_ID` (clic droit sur l'icône du serveur en mode développeur → Copier l'ID) :

```bash
$env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."; $env:DISCORD_GUILD_ID="id_du_serveur"; node register-commands.mjs
```

---

## Mettre à jour le bot plus tard
Après une modif de `bot/worker.js` :

```bash
npm run deploy
```

Après une modif des commandes dans `bot/register-commands.mjs`, relance l'étape 5.
