const CONFIG = {
  SPREADSHEET_ID: "1IYGq5Fh6VKR3mAtlfnQRWF9aAcZ_VKjaiecYF6VhljY",
  INPUT_SHEET: "Input",
  RESULTS_SHEET: "Results"
};

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Input sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    const records = [];
    
    // Assuming row 1 is header
    for (let i = 1; i < data.length; i++) {
      const container = String(data[i][0] || "").trim();
      const inputSeal = String(data[i][1] || "").trim();
      
      // Ignore completely empty rows, but accept partials (if at least one field exists)
      if (container || inputSeal) {
        records.push({
          row: i + 1,
          container: container,
          inputSeal: inputSeal
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      containers: records
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let requestData;
    
    // Support URL-encoded form data (from Chrome Extension)
    if (e.parameter && e.parameter.container) {
      requestData = e.parameter;
    } 
    // Fallback for JSON payload
    else if (e.postData && e.postData.contents) {
      requestData = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "No data received" })).setMimeType(ContentService.MimeType.JSON);
    }

    Logger.log(JSON.stringify(requestData));
    Logger.log("Writing result for container: " + requestData.container);
    Logger.log("Result: " + requestData.result);

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.RESULTS_SHEET);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.RESULTS_SHEET);
      sheet.appendRow(["Timestamp", "Input Row", "Container No.", "Input Seal", "Website Seal", "Result", "Remarks"]);
    }

    const { row, container, inputSeal, websiteSeal, result, remarks } = requestData;
    
    sheet.appendRow([
      new Date(),
      row || "",
      container || "",
      inputSeal || "",
      websiteSeal || "",
      result || "",
      remarks || ""
    ]);

    // Conditional formatting based on result
    const lastRow = sheet.getLastRow();
    const resultCell = sheet.getRange(lastRow, 6); // Column F (Result)
    
    if (result === "MATCH") resultCell.setBackground("#d9ead3"); // light green
    else if (result === "MISMATCH") resultCell.setBackground("#fce5cd"); // light orange
    else if (result === "NOT FOUND") resultCell.setBackground("#f3f3f3"); // grey
    else if (result === "ERROR") resultCell.setBackground("#f4cccc"); // light red

    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
