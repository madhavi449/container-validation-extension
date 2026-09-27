# Container Validation Automation

A Chrome Extension + Google Apps Script automation system for validating shipping container numbers and their corresponding seal numbers against a tracking portal.

The system retrieves container records from Google Sheets, automatically enters each container number into the tracking portal, triggers shipment tracking, extracts the website seal number, compares it with the expected seal, and writes the validation result back to Google Sheets.

---

## 1. Project Purpose

This project automates container and seal-number validation.

For each container record, the system:

1. Fetches the container number and expected seal from Google Sheets.
2. Loads the records into the Chrome Extension.
3. Detects the tracking page and its tracking frame.
4. Enters the container number into the tracking input.
5. Clicks **TRACK SHIPMENT**.
6. Waits for the tracking result.
7. Detects whether the container was found.
8. Extracts the website seal number.
9. Compares the website seal with the provided seal.
10. Produces one of:

* `MATCH`
* `MISMATCH`
* `NOT FOUND`
* `ERROR`

11. Uploads the result to Google Sheets.
12. Automatically continues with the next container.

The queue is designed so that an error affecting one container does not stop processing of the remaining containers.

---

# 2. Architecture

The system consists of two primary components:

```text
                    ┌─────────────────────┐
                    │    Google Sheets    │
                    │                     │
                    │ ContainerNo         │
                    │ ProvidedSeal        │
                    └──────────┬──────────┘
                               │
                               │ GET
                               ▼
                    ┌─────────────────────┐
                    │  Google Apps Script │
                    │       Web App       │
                    └──────────┬──────────┘
                               │
                               │ Container Records
                               ▼
                    ┌─────────────────────┐
                    │   Chrome Extension  │
                    │                     │
                    │ Popup UI             │
                    │ Queue Manager        │
                    │ Service Worker       │
                    │ Validation Logic     │
                    └──────────┬──────────┘
                               │
                               │ Browser automation
                               ▼
                    ┌─────────────────────┐
                    │ OceanCrest Tracking │
                    │       Portal        │
                    │                     │
                    │ Enter Container     │
                    │ Track Shipment      │
                    │ Tracking Result     │
                    │ Seal Number         │
                    └──────────┬──────────┘
                               │
                               │ Validation Result
                               ▼
                    ┌─────────────────────┐
                    │  Google Apps Script │
                    │       Web App       │
                    └──────────┬──────────┘
                               │
                               │ POST
                               ▼
                    ┌─────────────────────┐
                    │    Google Sheets    │
                    │     Results Tab     │
                    └─────────────────────┘
```

---

# 3. Components

## 3.1 Google Apps Script

Google Apps Script acts as the backend bridge between the Chrome Extension and Google Sheets.

Responsibilities:

* Fetch container records.
* Return container numbers and provided seals.
* Receive validation results.
* Write results into the Results sheet.
* Preserve the original input row for duplicate-container handling.

The Apps Script Web App exposes GET/POST endpoints used by the extension.

---

## 3.2 Chrome Extension

The Chrome Extension is a Manifest V3 extension.

Main responsibilities:

* Load container records.
* Maintain the processing queue.
* Detect the tracking page.
* Locate the tracking frame.
* Enter container numbers.
* Click the tracking button.
* Wait for tracking results.
* Extract seal numbers.
* Compare seals.
* Handle failures and retries.
* Upload results.
* Continue processing until the queue is empty.

The extension uses:

* Chrome Extension Manifest V3
* Service Worker
* `chrome.scripting`
* `chrome.tabs`
* `chrome.webNavigation`
* `chrome.debugger` fallback
* Browser DOM automation
* Google Apps Script Web App

---

# 4. Project Structure

The project is organized approximately as follows:

```text
container-validation/
│
├── chrome-extension/
│   ├── manifest.json
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   │
│   ├── background/
│   │   └── service-worker.js
│   │
│   └── utils/
│       ├── comparison.js
│       └── helpers.js
│
├── apps-script/
│   └── Code.gs
│
├── .gitignore
└── README.md
```

> The exact file structure may vary depending on the current implementation. Only production-required files should remain in the repository.

---

# 5. Chrome Extension Installation

### Step 1 — Open Chrome Extensions

Open:

```text
chrome://extensions/
```

### Step 2 — Enable Developer Mode

Enable **Developer mode** in the top-right corner.

### Step 3 — Load the Extension

Click:

**Load unpacked**

and select:

```text
chrome-extension/
```

The **Container Validation** extension should now appear in Chrome.

---

# 6. Apps Script Backend Setup

The backend uses Google Apps Script to communicate with Google Sheets.

### Step 1 — Open Google Sheets

Open the Google Spreadsheet containing the container data.

### Step 2 — Open Apps Script

Go to:

```text
Extensions → Apps Script
```

### Step 3 — Add the Backend Code

Copy the contents of:

```text
apps-script/Code.gs
```

into the Apps Script project.

### Step 4 — Deploy as Web App

Go to:

```text
Deploy → New deployment
```

Select:

```text
Web app
```

Configure access according to your deployment requirements.

For an extension running from the browser, the Web App must be accessible to the extension.

### Step 5 — Copy the `/exec` URL

The deployed Web App URL will look similar to:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Use the deployed `/exec` URL in the Chrome Extension.

> If you create a new deployment, make sure the extension uses the URL belonging to the currently active deployment.

---

# 7. Google Sheet Structure

The input sheet contains the container records.

## Input Sheet

| Column | Field        |
| ------ | ------------ |
| A      | ContainerNo  |
| B      | ProvidedSeal |

Example:

| ContainerNo | ProvidedSeal |
| ----------- | ------------ |
| OCSU1000004 | OC8015838    |
| OCSU1000025 | OC8015842    |
| OCSU1000180 | OC8015910    |

The extension preserves the original spreadsheet row when processing records.

---

# 8. Results Sheet

Validation results are written to the Results sheet.

Recommended structure:

| Field         |
| ------------- |
| Timestamp     |
| Input Row     |
| Container No. |
| Input Seal    |
| Website Seal  |
| Result        |
| Remarks       |

Example:

| Timestamp  | Input Row | Container No. | Input Seal | Website Seal | Result    | Remarks             |
| ---------- | --------: | ------------- | ---------- | ------------ | --------- | ------------------- |
| 2026-09-27 |         2 | OCSU1000004   | OC8015838  | OC8015838    | MATCH     | Seal matched        |
| 2026-09-27 |         3 | OCSU1000025   | OC8015842  | OC8015999    | MISMATCH  | Seal differs        |
| 2026-09-27 |         4 | OCSU1000180   | OC8015910  |              | NOT FOUND | Container not found |

---

# 9. Running the Validation

## Step 1 — Open the Tracking Portal

Open the actual OceanCrest tracking/training portal in a Chrome tab.

The extension operates against the tracking interface containing:

```text
Container input
TRACK SHIPMENT button
Tracking result
Seal number
```

The extension identifies the tracking UI dynamically rather than depending on a locally hosted mock website.

---

## Step 2 — Open the Extension

Click the **Container Validation** extension icon.

---

## Step 3 — Enter Apps Script Backend URL

Paste the deployed Google Apps Script `/exec` URL.

Example:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Click:

**Load Containers**

The extension should display the number of records retrieved.

Example:

```text
Total: 21
Processed: 0
Remaining: 21
MATCH: 0
MISMATCH: 0
NOT FOUND: 0
ERROR: 0
Upload Failed: 0
```

---

## Step 4 — Start Validation

Click:

**Start Validation**

The extension begins processing the queue.

For every record it performs:

```text
Container Number
       ↓
Find Tracking Page
       ↓
Find Tracking Frame
       ↓
Enter Container Number
       ↓
Click TRACK SHIPMENT
       ↓
Wait for Result
       ↓
Extract Website Seal
       ↓
Compare Seals
       ↓
Upload Result
       ↓
Next Container
```

---

# 10. Validation Results

## MATCH

The container was found and the provided seal matches the website seal.

Comparison is performed after trimming whitespace and normalizing case.

Example:

```text
Input Seal:   OC8015838
Website Seal: oc8015838

Result: MATCH
```

---

## MISMATCH

The container was found, but the provided seal differs from the website seal.

Example:

```text
Input Seal:   OC8015838
Website Seal: OC9999999

Result: MISMATCH
```

---

## NOT FOUND

The tracking portal indicates that the requested container does not exist or no tracking result was returned for the container.

```text
Result: NOT FOUND
```

---

## ERROR

An unexpected processing failure occurred.

Examples include:

* Tracking frame unavailable
* Search timeout
* Tracking page error
* Missing tracking input
* Missing tracking button
* Failed browser execution
* Seal extraction failure
* Backend communication failure

An error for one container should not terminate the entire queue.

---

# 11. Queue Processing

The extension processes containers sequentially.

Example:

```text
Container 1
    ↓
Result
    ↓
Container 2
    ↓
Result
    ↓
Container 3
    ↓
Result
    ↓
...
    ↓
Container 21
```

Each container receives an independent result.

If a container fails:

```text
Container 5 → ERROR
                  ↓
             Container 6
```

The queue continues processing.

The extension should not terminate the entire validation run because of an individual container failure.

---

# 12. Duplicate Container Handling

Duplicate container numbers are processed independently.

For example:

```text
Row 7  → OCSU1000128
Row 20 → OCSU1000128
```

These are treated as two separate validation records because each record has a different input row and potentially different provided seal.

The Results sheet therefore records both validations independently.

---

# 13. Missing Seal Handling

A container may have a blank provided seal.

Example:

```text
ContainerNo: OCSU1000600
ProvidedSeal:
```

The extension can still query the tracking portal.

If the container is successfully found but the input seal is missing, the validation result is recorded as:

```text
ERROR
```

with an appropriate remark such as:

```text
Input seal missing
```

---

# 14. Tracking Page Automation

The extension is designed to work with the actual tracking page rather than a locally simulated website.

The browser automation handles:

### Container Input

The extension locates the tracking input and enters the container number.

### Track Shipment

The extension triggers the:

```text
TRACK SHIPMENT
```

action.

### Result Detection

The extension waits for the tracking result instead of assuming the response is immediately available.

### Seal Extraction

Once the result is available, the extension extracts the website seal number from the tracking result.

---

# 15. Frame Detection

The tracking interface may be rendered inside a frame created by the web application.

The extension therefore performs frame discovery before processing a container.

The service worker can:

* Inspect available frames.
* Identify the frame containing the tracking interface.
* Verify that the required input and button exist.
* Re-discover the frame when necessary.
* Use browser execution APIs to interact with the frame.

This avoids assuming that the tracking interface always exists in the top-level document.

---

# 16. Debugger Fallback

The extension includes a `chrome.debugger` fallback for cases where the tracking interface is rendered inside a browser context that cannot be reached through normal extension script injection.

The fallback is intended for difficult frame/execution-context situations.

The extension should use the normal execution path whenever possible and only use the debugger fallback when required.

Chrome may display a browser notification indicating that the extension is debugging the tab while this fallback is active.

---

# 17. Retry Handling

Transient failures should not immediately terminate validation for a container.

The validation logic can retry operations such as:

* Frame discovery
* Input entry
* Tracking execution
* Result detection
* Browser execution

After the configured retry attempts are exhausted, the container is recorded as:

```text
ERROR
```

and the queue continues with the next container.

---

# 18. Upload Handling

After each container is validated, the extension sends the result to the Apps Script backend.

The backend writes the result to the Results sheet.

The extension tracks upload failures separately:

```text
Upload Failed: 0
```

A failed upload should be distinguishable from a validation failure.

---

# 19. Extension Status

The popup provides live progress information.

Example:

```text
Total: 21
Processed: 8
Remaining: 13

MATCH: 5
MISMATCH: 2
NOT FOUND: 1
ERROR: 0

Upload Failed: 0
```

During processing, the popup also displays the container currently being processed.

Example:

```text
Processing: OCSU1000180
```

---

# 20. Stopping Validation

The user can stop the queue using:

**Stop**

Stopping validation prevents additional containers from being processed.

Already completed records remain recorded in Google Sheets.

A new validation run can be started from the extension.

---

# 21. Troubleshooting

## "Error loading: HTTP 404"

Verify that:

1. The Apps Script deployment still exists.
2. The `/exec` URL is correct.
3. The extension is using the current deployment URL.
4. The Web App has appropriate access permissions.
5. The Apps Script project has been deployed successfully.

---

## "Tracking page not detected"

Verify that:

1. The real tracking page is open.
2. The tracking interface has finished loading.
3. The tracking input is visible.
4. The `TRACK SHIPMENT` button is available.
5. The extension has permission to access the page.

Open the extension service-worker console to inspect frame discovery diagnostics.

---

## Container number is not entered

Check the service-worker console for:

```text
frame discovery
input detection
input verification
```

The extension should verify that the entered value matches the container being processed.

---

## TRACK SHIPMENT does not execute

Check:

* The tracking button is present.
* The button is enabled.
* The correct tracking frame was selected.
* The tracking page has finished loading.
* The service-worker console for click/execution errors.

---

## Validation returns ERROR

Inspect the service-worker console.

Useful diagnostic information includes:

```text
[CV]
[DIAG]
FRAME DISCOVERY
PROCESSING
MATCH
MISMATCH
NOT FOUND
ERROR
```

The exact error should be checked before changing selectors or queue logic.

---

# 22. Security

Do not commit sensitive credentials to GitHub.

Never commit:

```text
.env
API keys
Passwords
Access tokens
Private credentials
Service account private keys
Secret configuration files
```

Use `.gitignore` for sensitive local files.

The Apps Script Web App URL may be stored as user configuration rather than hardcoded into the extension source.

---

# 23. Development Notes

The current project is intended to operate against the actual available tracking/training portal.

The previous local mock shipping portal was a development/testing component and is no longer part of the production project.

The repository should therefore contain only the production-relevant extension and Apps Script implementation.

---

# 24. Technology Stack

### Frontend / Extension

* JavaScript
* HTML
* CSS
* Chrome Extensions Manifest V3

### Browser APIs

* `chrome.scripting`
* `chrome.tabs`
* `chrome.webNavigation`
* `chrome.storage`
* `chrome.debugger`

### Backend

* Google Apps Script
* Google Sheets

### Automation

* DOM interaction
* Frame detection
* Browser execution contexts
* Queue processing
* Retry handling

---

# 25. End-to-End Flow

```text
                    GOOGLE SHEETS
                         │
                         │
                         ▼
                 GOOGLE APPS SCRIPT
                         │
                         │ GET
                         ▼
                CHROME EXTENSION
                         │
                         ▼
                  LOAD CONTAINERS
                         │
                         ▼
                  START VALIDATION
                         │
                         ▼
                FIND TRACKING PAGE
                         │
                         ▼
                  FIND TRACKING FRAME
                         │
                         ▼
                ENTER CONTAINER NUMBER
                         │
                         ▼
                 TRACK SHIPMENT
                         │
                         ▼
                WAIT FOR TRACKING
                         │
                         ▼
                  EXTRACT SEAL
                         │
                         ▼
                COMPARE WITH INPUT
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           MATCH      MISMATCH    NOT FOUND
             │           │           │
             └───────────┼───────────┘
                         │
                         ▼
                       ERROR
                  (if processing fails)
                         │
                         ▼
                UPLOAD RESULT
                         │
                         ▼
                  NEXT CONTAINER
                         │
                         ▼
                 QUEUE COMPLETE
                         │
                         ▼
                    RESULTS SHEET
```

---

# 26. Project Status

The project is designed as a production-oriented container validation automation system.

Current workflow:

**Google Sheets → Apps Script → Chrome Extension → Real Tracking Portal → Seal Extraction → Validation → Apps Script → Google Sheets**

The local mock tracking website is no longer required for the normal validation workflow.
