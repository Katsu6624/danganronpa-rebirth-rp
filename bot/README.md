# Bot Discord — gestion du roster

Bot "serverless" (aucune machine à laisser allumée) : hébergé sur Cloudflare Workers,
il répond aux commandes Discord `/roster ...` et met à jour `data/players.json`
directement sur GitHub, ce qui republie le site automatiquement.

## Commandes

- `/roster donner joueur:@X personnage:<nom>` — attribue un personnage à un joueur
- `/roster retirer joueur:@X personnage:<nom>` — retire un personnage
- `/roster debloquer joueur:@X personnage:<nom>` — ajoute à la liste "à débloquer"
- `/roster liste joueur:@X` — affiche le roster d'un joueur

Par défaut, seuls les membres avec la permission Discord **"Gérer le serveur"**
peuvent utiliser `/roster` (modifiable dans Discord : Paramètres du serveur →
Intégrations → Danganronpa Rebirth RP Bot).

---

## Mise en place (à faire une seule fois)

Étapes que **toi seul** dois faire (identifiants/comptes personnels) :

### 1. Créer l'application Discord
1. Va sur https://discord.com/developers/applications → **New Application**.
2. Onglet **Bot** → **Add Bot** → copie le **Token** (garde-le secret).
3. Onglet **General Information** → copie l'**Application ID** et la **Public Key**.
4. Onglet **OAuth2 → URL Generator** : coche `bot` et `applications.commands`,
   permission `Send Messages`. Ouvre l'URL générée pour inviter le bot sur ton serveur.

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
```

Colle la Public Key Discord et le token GitHub quand demandé.

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

Les commandes `/roster ...` apparaissent alors dans Discord — **jusqu'à 1h** pour des commandes
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
