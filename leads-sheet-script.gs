// Shivangi Auto Clinic — Leads Google Sheet Script
// Sheet mein 2 tabs honge: "Leads" aur "Conversations"

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'addLead') {
      saveLead(ss, data);
    } else if (data.action === 'updateLead') {
      updateLead(ss, data);
    } else {
      saveConversation(ss, data);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveLead(ss, data) {
  var sheet = ss.getSheetByName('Leads');
  if (!sheet) {
    sheet = ss.insertSheet('Leads');
    sheet.appendRow(['Lead ID', 'Date', 'Naam', 'Mobile', 'Vehicle', 'Area', 'Assigned Date', 'Called', 'Service Done', 'Notes', 'Timestamp']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#25d366').setFontColor('white');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.id || '',
    data.assignedDate || '',
    data.naam || '',
    data.mobile || '',
    data.vehicle || '',
    data.area || '',
    data.assignedDate || '',
    'No',
    'No',
    '',
    data.timestamp || new Date().toLocaleString('en-IN')
  ]);
}

function updateLead(ss, data) {
  var sheet = ss.getSheetByName('Leads');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] == data.id) {
      var row = i + 2;
      if (data.called !== undefined) sheet.getRange(row, 8).setValue(data.called ? 'Yes' : 'No');
      if (data.serviceDone !== undefined) sheet.getRange(row, 9).setValue(data.serviceDone ? 'Yes' : 'No');
      if (data.notes) sheet.getRange(row, 10).setValue(data.notes);
      break;
    }
  }
}

function saveConversation(ss, data) {
  var sheet = ss.getSheetByName('Conversations');
  if (!sheet) {
    sheet = ss.insertSheet('Conversations');
    sheet.appendRow(['Date', 'Phone', 'Customer Message', 'Bot Reply', 'Timestamp']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('white');
    sheet.setFrozenRows(1);
  }

  var today = new Date().toLocaleDateString('en-IN');
  sheet.appendRow([
    today,
    data.userPhone || '',
    data.userMessage || '',
    data.botReply || '',
    data.timestamp || new Date().toLocaleString('en-IN')
  ]);
}
