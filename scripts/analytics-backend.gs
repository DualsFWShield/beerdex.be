/**
 * Beerdex Analytics Backend - Google Apps Script
 * ===============================================
 * INSTRUCTIONS POUR NOAH :
 * 1. Créer un nouveau Google Sheet (Feuille de calcul)
 * 2. Aller dans "Extensions" -> "Apps Script"
 * 3. Copier-coller ce code à la place du code existant
 * 4. Remplacer `YOUR_SHEET_ID_HERE` par l'ID de votre Sheet (trouvable dans l'URL du sheet entre /d/ et /edit)
 * 5. Cliquer sur "Déployer" -> "Nouveau déploiement"
 * 6. Type: "Application Web"
 * 7. Exécuter en tant que : "Moi"
 * 8. Qui a accès : "Tout le monde"
 * 9. Copier l'URL Web de l'application générée et la coller dans `js/analytics.js` (const ENDPOINT_URL).
 */

const SHEET_ID = '1HPsvVaX4vyP56K-3OvCDSJkpizuWSVWWc7hUzG2ZGRk'; // <-- REMPLACER CECI

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    // Si c'est un tableau d'événements (batch/queue upload)
    if (Array.isArray(data)) {
      const rows = data.map(event => [
        new Date().toISOString(), // Received At
        event.timestamp || '',
        event.type || 'unknown',
        event.userId || 'anonymous',
        JSON.stringify(event.data || {}),
        event.device ? JSON.stringify(event.device) : ''
      ]);
      
      // Setup headers if sheet is empty
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Received Timestamp", "Event Timestamp", "Type", "User ID", "Data (JSON)", "Device Info"]);
        sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
      }
      
      if (rows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
    } 
    // Event simple (ex: webhook direct)
    else {
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Received Timestamp", "Event Timestamp", "Type", "User ID", "Data (JSON)", "Device Info"]);
        sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
      }
      sheet.appendRow([
        new Date().toISOString(),
        data.timestamp || new Date().toISOString(),
        data.type || 'unknown',
        data.userId || 'anonymous',
        JSON.stringify(data.data || {}),
        data.device ? JSON.stringify(data.device) : ''
      ]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ "status": "success" })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Optionnel: Gérer les requêtes GET pour éviter les erreurs quand on visite l'URL dans le navigateur
function doGet(e) {
  return ContentService.createTextOutput("Beerdex Analytics Tracker is active. Please use POST to send data.");
}
