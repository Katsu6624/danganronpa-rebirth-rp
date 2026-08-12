# Danganronpa Rebirth RP

Site vitrine du serveur Garry's Mod Danganronpa Rebirth RP, hébergé sur GitHub Pages.

## Structure

```
index.html          Accueil
regles.html          Règlement
personnages.html      Liste des personnages + statut (disponible/possédé)
joueurs.html          Fiche de chaque joueur (personnages débloqués / à débloquer)
css/style.css         Style (thème sombre Danganronpa)
js/main.js            Logique de chargement/affichage des données
data/characters.json  Liste des personnages du roster
data/players.json     Qui possède quoi
```

## Mettre à jour le contenu

### Ajouter / modifier un personnage
Édite `data/characters.json` :

```json
{ "id": "identifiant-unique", "name": "Nom affiché", "ultimate": "Ultime ...", "faction": "Classe 78" }
```

`id` doit être unique et sans espace (utilisé pour lier `players.json`).

Champ optionnel `image` : chemin ou URL vers un portrait du personnage
(ex: `"image": "assets/characters/makoto-naegi.jpg"`). Sans ce champ, la carte
affiche juste un emplacement vide avec le mot "Portrait".

### Attribuer / débloquer un personnage à un joueur
Édite `data/players.json` :

```json
{
  "name": "PseudoDuJoueur",
  "discordId": "",
  "owned": ["id-du-personnage-possede"],
  "locked": ["id-du-personnage-a-debloquer"]
}
```

- `owned` : personnages déjà incarnés par ce joueur (apparaît "Possédé par X" sur la page Personnages).
- `locked` : personnages que ce joueur pourra débloquer plus tard (juste indicatif sur sa fiche).

Un personnage ne devrait apparaître dans `owned` que pour **un seul joueur**.

### Liens à personnaliser
Dans `index.html`, remplace `VOTRE.IP.SERVEUR:PORT` par l'IP/port de connexion du serveur GMod
(bouton "Copier l'IP du serveur").

### Ajouter des images (recommandé)
Le site est volontairement construit sans dégradés ni décorations CSS. Les vraies images
(bannière du serveur, portraits de personnages) sont ce qui donnera au site une identité propre.

1. Crée un dossier `assets/` (ex: `assets/banner.jpg`, `assets/characters/makoto-naegi.jpg`).
2. **Bannière d'accueil** : dans `index.html`, sur la ligne `<div class="media-slot hero-media">`,
   ajoute `style="background-image:url('assets/banner.jpg')"` et vide le texte à l'intérieur.
3. **Portraits de personnages** : ajoute le champ `image` dans `data/characters.json` (voir ci-dessus),
   le portrait s'affiche automatiquement sur la page Personnages.

## Publier les changements

Après avoir édité un fichier :

```bash
git add -A
git commit -m "Mise à jour des personnages"
git push
```

Le site se met à jour automatiquement sur GitHub Pages après le push (1-2 minutes).

## Automatiser via Discord

Un bot Discord (`bot/`) permet au staff d'attribuer/débloquer des personnages
directement depuis Discord avec `/roster donner`, `/roster retirer`, etc. Il
édite `data/players.json` et push automatiquement. Voir [bot/README.md](bot/README.md)
pour la mise en place (nécessite des comptes Discord Developer et Cloudflare, gratuits).
