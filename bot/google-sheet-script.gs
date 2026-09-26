// À coller dans Extensions > Apps Script d'un Google Sheet (voir bot/README.md, section Google Sheet).
// Remplace CLE_SECRETE par une chaîne de ton choix (la même que dans l'URL donnée au Worker).
const CLE_SECRETE = 'CLE_SECRETE';

const HEADERS = [
  'Date', 'Saison', 'Pseudo', 'Discord ID', 'Présent tous les jours', 'Remplaçant',
  'Personnages', 'Intention de tuer', 'Détails intention', 'Place réservée', 'Mastermind', 'OC', 'Questions perso',
];

const LARGEURS = [60, 150, 110, 150, 70, 150, 300, 95, 180, 200, 100, 180, 350];

// Nom d'onglet valide pour Google Sheets (pas de [ ] * ? : / \ , 100 caractères max).
function nomOnglet(saison) {
  const nom = String(saison || 'Inscriptions').replace(/[\[\]*?:\/\\]/g, '-').trim().slice(0, 90);
  return nom || 'Inscriptions';
}

// Un onglet par saison : réutilise celui de la saison, sinon recycle le premier onglet s'il est vide
// (ou ne contient que cette saison), sinon en crée un nouveau.
function getFeuilleSaison(saison) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nom = nomOnglet(saison);
  const existante = ss.getSheetByName(nom);
  if (existante) return existante;

  const premiere = ss.getSheets()[0];
  const nb = premiere.getLastRow();
  const saisons = nb > 1 ? premiere.getRange(2, 2, nb - 1, 1).getValues().map((r) => r[0]) : [];
  if (saisons.every((s) => s === saison)) {
    premiere.setName(nom);
    return premiere;
  }
  return ss.insertSheet(nom);
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
  sheet.getRange(2, 4, lignes - 1, 1).setNumberFormat('@');

  if (sheet.getBandings().length === 0) {
    corps.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }
}

// À lancer à la main pour remettre en forme tous les onglets.
function mettreEnForme() {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(formaterFeuille);
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

  const sheet = getFeuilleSaison(d.saison);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  const row = [
    new Date(), d.saison, d.pseudo, "'" + d.discordId, d.presence, d.remplacant,
    d.personnages, d.intentionTuer, d.intentionTuerDetails, d.placeReservee, d.mastermind, d.oc, d.questionsPerso || '',
  ];
  // Un joueur qui renvoie le formulaire pour la même saison met sa ligne à jour au lieu de la dupliquer.
  const nb = sheet.getLastRow();
  if (nb > 1) {
    const ids = sheet.getRange(2, 4, nb - 1, 1).getValues();
    const saisons = sheet.getRange(2, 2, nb - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).replace("'", '') === d.discordId && saisons[i][0] === d.saison) {
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
