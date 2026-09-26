// À coller dans Extensions > Apps Script d'un Google Sheet (voir bot/README.md, section Google Sheet).
// Remplace CLE_SECRETE par une chaîne de ton choix (la même que dans l'URL donnée au Worker).
const CLE_SECRETE = 'CLE_SECRETE';

const HEADERS = [
  'Date', 'Pseudo', 'Présent tous les jours', 'Remplaçant',
  'Personnages', 'Intention de tuer', 'Détails intention', 'Place réservée', 'Mastermind', 'OC', 'Questions perso',
];

const LARGEURS = [60, 110, 70, 150, 300, 95, 180, 200, 100, 180, 350];

// Nom d'onglet valide pour Google Sheets (pas de [ ] * ? : / \ , 100 caractères max).
function nomOnglet(saison) {
  const nom = String(saison || 'Inscriptions').replace(/[\[\]*?:\/\\]/g, '-').trim().slice(0, 90);
  return nom || 'Inscriptions';
}

// Chaque onglet mémorise sa saison (métadonnée cachée), puisque la colonne Saison n'existe plus.
function saisonDeLOnglet(sheet) {
  const trouves = sheet.createDeveloperMetadataFinder().withKey('saison').find();
  return trouves.length ? trouves[0].getValue() : null;
}

// Un onglet par saison : réutilise celui de la saison ; sinon récupère le premier onglet s'il n'est
// encore associé à aucune saison (cas de l'onglet existant) ; sinon en crée un nouveau.
function getFeuilleSaison(saison) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilles = ss.getSheets();
  const deja = feuilles.find((s) => saisonDeLOnglet(s) === saison);
  if (deja) return deja;

  const cible = saisonDeLOnglet(feuilles[0]) === null ? feuilles[0] : ss.insertSheet();
  cible.addDeveloperMetadata('saison', saison);

  const base = nomOnglet(saison);
  let nom = base;
  let n = 2;
  while (ss.getSheetByName(nom) && ss.getSheetByName(nom).getSheetId() !== cible.getSheetId()) {
    nom = base.slice(0, 85) + ' (' + n++ + ')';
  }
  cible.setName(nom);
  return cible;
}

function formaterFeuille(sheet) {
  const lignes = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  LARGEURS.forEach((l, i) => sheet.setColumnWidth(i + 1, l));

  const entete = sheet.getRange(1, 1, 1, HEADERS.length);
  entete.setBackground('#8b1a3a').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);

  const corps = sheet.getRange(2, 1, lignes - 1, HEADERS.length);
  corps.setVerticalAlignment('top').setWrap(true).setFontSize(10);
  sheet.getRange(2, 1, lignes - 1, 1).setNumberFormat('dd/MM');

  if (sheet.getBandings().length === 0) {
    corps.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }
}

// À lancer à la main pour remettre en forme tous les onglets.
function mettreEnForme() {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(formaterFeuille);
}

// À lancer UNE SEULE FOIS à la main : supprime les colonnes "Discord ID" et "Saison" des onglets
// existants (l'ancien format à 13 colonnes). Sans danger si relancée : ne touche que l'ancien format.
function migrerColonnes() {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach((sheet) => {
    if (sheet.getLastColumn() < 4) return;
    const entetes = sheet.getRange(1, 1, 1, 4).getValues()[0];
    if (entetes[1] === 'Saison' && entetes[3] === 'Discord ID') {
      // Avant de supprimer la colonne Saison, mémorise la saison de l'onglet pour ne pas la perdre.
      if (sheet.getLastRow() > 1 && saisonDeLOnglet(sheet) === null) {
        sheet.addDeveloperMetadata('saison', sheet.getRange(2, 2).getValue());
      }
      sheet.deleteColumn(4);
      sheet.deleteColumn(2);
      formaterFeuille(sheet);
    }
  });
}

function doPost(e) {
  if (e.parameter.key !== CLE_SECRETE) {
    return ContentService.createTextOutput('forbidden');
  }
  const d = JSON.parse(e.postData.contents);
  if (d.action === 'share') {
    SpreadsheetApp.getActiveSpreadsheet().addEditor(d.email);
    return ContentService.createTextOutput('shared');
  }

  if (d.action === 'open') {
    const nouvelle = getFeuilleSaison(d.saison);
    if (nouvelle.getLastRow() === 0) nouvelle.appendRow(HEADERS);
    formaterFeuille(nouvelle);
    return ContentService.createTextOutput('opened');
  }

  const sheet = getFeuilleSaison(d.saison);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  const row = [
    new Date(), d.pseudo, d.presence, d.remplacant,
    d.personnages, d.intentionTuer, d.intentionTuerDetails, d.placeReservee, d.mastermind, d.oc, d.questionsPerso || '',
  ];
  // Un joueur qui renvoie le formulaire met sa ligne à jour au lieu de la dupliquer (retrouvé par son pseudo Discord).
  const nb = sheet.getLastRow();
  if (nb > 1) {
    const pseudos = sheet.getRange(2, 2, nb - 1, 1).getValues();
    for (let i = 0; i < pseudos.length; i++) {
      if (pseudos[i][0] === d.pseudo) {
        sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
        formaterFeuille(sheet);
        return ContentService.createTextOutput('updated');
      }
    }
  }
  sheet.appendRow(row);
  formaterFeuille(sheet);
  return ContentService.createTextOutput('ok');
}
