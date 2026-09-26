// À coller dans Extensions > Apps Script d'un Google Sheet (voir bot/README.md, section Google Sheet).
// Remplace CLE_SECRETE par une chaîne de ton choix (la même que dans l'URL donnée au Worker).
const CLE_SECRETE = 'CLE_SECRETE';

const HEADERS = [
  'Date', 'Saison', 'Pseudo', 'Discord ID', 'Présent tous les jours', 'Remplaçant',
  'Personnages', 'Intention de tuer', 'Détails', 'Place réservée', 'Mastermind', 'OC',
];

function doPost(e) {
  if (e.parameter.key !== CLE_SECRETE) {
    return ContentService.createTextOutput('forbidden');
  }
  const d = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  const row = [
    new Date(), d.saison, d.pseudo, "'" + d.discordId, d.presence, d.remplacant,
    d.personnages, d.intentionTuer, d.intentionTuerDetails, d.placeReservee, d.mastermind, d.oc,
  ];
  // Un joueur qui renvoie le formulaire pour la même saison met sa ligne à jour au lieu de la dupliquer.
  const ids = sheet.getRange(2, 4, Math.max(sheet.getLastRow() - 1, 1), 2).getValues();
  const saisons = sheet.getRange(2, 2, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).replace("'", '') === d.discordId && saisons[i][0] === d.saison) {
      sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
      return ContentService.createTextOutput('updated');
    }
  }
  sheet.appendRow(row);
  return ContentService.createTextOutput('ok');
}
