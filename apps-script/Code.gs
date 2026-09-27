const CONFIG = {

  SPREADSHEET_ID:
    "1TBAPGSLP23weX2Dtxa0rcw1nMu1FW7AyPcH7VsPlkQo",

  INPUT_SHEET:
    "Sheet1",

  RESULTS_SHEET:
    "Sheet2"
};


/* =========================================================
   GET CONTAINERS
========================================================= */

function doGet(e) {

  try {

    const ss =
      SpreadsheetApp.openById(
        CONFIG.SPREADSHEET_ID
      );


    const sheet =
      ss.getSheetByName(
        CONFIG.INPUT_SHEET
      );


    if (!sheet) {

      return jsonResponse({

        success: false,

        error:
          "Input sheet not found: " +
          CONFIG.INPUT_SHEET

      });
    }


    const data =
      sheet
        .getDataRange()
        .getValues();


    const records = [];


    /*
     * Row 1 = headers.
     */
    for (
      let i = 1;
      i < data.length;
      i++
    ) {

      const container =
        String(
          data[i][0] || ""
        ).trim();


      const inputSeal =
        String(
          data[i][1] || ""
        ).trim();


      if (
        container ||
        inputSeal
      ) {

        records.push({

          row:
            i + 1,

          container:
            container,

          inputSeal:
            inputSeal
        });
      }
    }


    return jsonResponse({

      success:
        true,

      containers:
        records

    });


  } catch (error) {

    return jsonResponse({

      success:
        false,

      error:
        error.toString()

    });
  }
}


/* =========================================================
   SAVE RESULT
========================================================= */

function doPost(e) {

  try {

    let requestData;


    /*
     * Chrome extension sends
     * application/x-www-form-urlencoded.
     */
    if (
      e.parameter &&
      e.parameter.container
    ) {

      requestData =
        e.parameter;

    } else if (
      e.postData &&
      e.postData.contents
    ) {

      requestData =
        JSON.parse(
          e.postData.contents
        );

    } else {

      return jsonResponse({

        success:
          false,

        error:
          "No data received"
      });
    }


    const ss =
      SpreadsheetApp.openById(
        CONFIG.SPREADSHEET_ID
      );


    let sheet =
      ss.getSheetByName(
        CONFIG.RESULTS_SHEET
      );


    if (!sheet) {

      sheet =
        ss.insertSheet(
          CONFIG.RESULTS_SHEET
        );


      sheet.appendRow([

        "Timestamp",

        "Input Row",

        "Container No.",

        "Input Seal",

        "Website Seal",

        "Result",

        "Remarks"

      ]);
    }


    const row =
      requestData.row || "";


    const container =
      requestData.container || "";


    const inputSeal =
      requestData.inputSeal || "";


    const websiteSeal =
      requestData.websiteSeal || "";


    const result =
      requestData.result || "";


    const remarks =
      requestData.remarks || "";


    sheet.appendRow([

      new Date(),

      row,

      container,

      inputSeal,

      websiteSeal,

      result,

      remarks

    ]);


    /*
     * Formatting.
     */
    const lastRow =
      sheet.getLastRow();


    const resultCell =
      sheet.getRange(
        lastRow,
        6
      );


    if (
      result === "MATCH"
    ) {

      resultCell.setBackground(
        "#d9ead3"
      );

    } else if (
      result === "MISMATCH"
    ) {

      resultCell.setBackground(
        "#fce5cd"
      );

    } else if (
      result === "NOT FOUND"
    ) {

      resultCell.setBackground(
        "#f3f3f3"
      );

    } else if (
      result === "ERROR"
    ) {

      resultCell.setBackground(
        "#f4cccc"
      );
    }


    return jsonResponse({

      success:
        true

    });


  } catch (error) {

    return jsonResponse({

      success:
        false,

      error:
        error.toString()

    });
  }
}


/* =========================================================
   JSON RESPONSE
========================================================= */

function jsonResponse(
  object
) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        object
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}