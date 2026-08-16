# Danganronpa Rebirth RP

Site vitrine du serveur Garry's Mod Danganronpa Rebirth RP, hébergé sur GitHub Pages.
Couplé à un bot Discord (`bot/`) qui met à jour certaines pages automatiquement.

## Structure

```
index.html          Accueil
regles.html          Règlement HRP / RP (2 onglets)
saisons.html          Format des saisons, priorité de cast, galerie de captures
inscription.html      Formulaire d'inscription à la saison en cours (piloté par le bot)
personnages.html      Liste des personnages, filtres, fiche par joueur, infos OC/rôles
monocoins.html        Système de monnaie/dons du serveur
apropos.html          Origines, historique et staffs du serveur (3 onglets)
css/style.css         Style (thème sombre Danganronpa)
js/main.js            Logique de chargement/affichage des données
data/characters.json  Liste des personnages du roster
data/players.json     Qui possède quoi (mis à jour par le bot)
data/inscription.json État de l'inscription en cours (mis à jour par le bot)
assets/characters/    Portraits pixel art des personnages
assets/seasons/       Captures de saisons passées
bot/                  Bot Discord (Cloudflare Worker), voir bot/README.md
```

## Mettre à jour le contenu

### Ajouter / modifier un personnage
Édite `data/characters.json` :

```json
{ "id": "identifiant-unique", "name": "Nom affiché", "ultimate": "Ultime ...", "faction": "Trigger Happy Havoc", "roles": ["Support"] }
```

`id` doit être unique et sans espace (utilisé pour lier `players.json`). `faction` correspond
au jeu/à la saison d'origine (ex: "Trigger Happy Havoc", "Goodbye Despair", "Killing Harmony",
"Re:Birth" pour les personnages originaux du serveur).

Champ optionnel `image` : chemin vers le portrait du personnage
(ex: `"image": "assets/characters/makoto-naegi.png"`). Sans ce champ, la carte
affiche un emplacement vide avec le mot "Portrait" ; `assets/characters/default-portrait.png`
sert de portrait par défaut pour les personnages sans image dédiée.

Champ optionnel `paid` (`true`/`false`) : marque un personnage comme payant
(débloqué contre monocoins). Affiche "· payant" à côté de la faction sur la fiche.

Champ optionnel `roles` (tableau) : un ou plusieurs des 5 rôles (Leader, Support,
Troublemaker, Analyste, Fighter), utilisés pour le filtre de la page Personnages.

### Attribuer / débloquer un personnage à un joueur
Se fait normalement via le bot Discord (`/debloquer`, `/retirer`, `/vip`), qui édite
`data/players.json` automatiquement. Format d'une entrée :

```json
{
  "name": "PseudoDuJoueur",
  "discordId": "...",
  "owned": ["id-du-personnage-possede"],
  "locked": ["id-du-personnage-a-debloquer"]
}
```

- `owned` : personnages débloqués et jouables par ce joueur.
- `locked` : personnages que ce joueur n'a pas encore débloqués (indicatif sur sa fiche,
  affichée sur la page Personnages en cherchant son pseudo Discord).

À l'inscription (commande Discord `/register`), tous les personnages de Trigger Happy Havoc,
Goodbye Despair et Killing Harmony sont automatiquement ajoutés à `owned` ; le reste du roster
(collections payantes) est ajouté à `locked`.

### Ajouter des images de personnages
1. Ajoute le fichier dans `assets/characters/` (idéalement en pixel art, cohérent avec le
   reste du roster).
2. Renseigne le champ `image` dans `data/characters.json` (voir ci-dessus).

## Publier les changements

Après avoir édité un fichier :

```bash
git add -A
git commit -m "Mise à jour des personnages"
git push
```

Le site se met à jour automatiquement sur GitHub Pages après le push (1-2 minutes).

## Automatiser via Discord

Un bot Discord (`bot/`) permet au staff de gérer les personnages des joueurs (`/debloquer`,
`/retirer`, `/vip`) et les inscriptions à une saison (`/inscription ouvrir|image|fermer`)
directement depuis Discord. Il édite `data/players.json` et `data/inscription.json` et
push automatiquement sur GitHub. Voir [bot/README.md](bot/README.md) pour la mise en place
(nécessite des comptes Discord Developer et Cloudflare, gratuits).
