# Container Validation Automation

## 1. Project Purpose
This project automates the validation of shipping container numbers and their corresponding seal numbers. It dynamically fetches records from Google Sheets, uses a Chrome Extension to query a shipping tracking portal, extracts seal data from the DOM, compares the values, and automatically posts the results (MATCH, MISMATCH, NOT FOUND, ERROR) back to Google Sheets.

## 2. Architecture
The system consists of three decoupled components:
* **Google Apps Script**: Handles data ingestion (GET) and data storage (POST) bridging the Chrome Extension with Google Sheets.
* **Chrome Extension**: A Manifest V3 extension containing a popup UI, a robust service worker queue, and an isolated website adapter (`shipping-site.js`) to interact with the shipping portal DOM.
* **Mock Shipping Portal**: A local HTML/JS development server mimicking realistic tracking website behaviors (loading spinners, DOM elements, success/error states).

## 3. Installation
1. Clone this repository locally.
2. In Google Chrome, go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `chrome-extension` directory.

## 4. How to Start Mock Shipping Website
1. Open a terminal.
2. Navigate to `mock-shipping-site/` folder.
3. Run `python -m http.server 5500`.
4. Navigate to `http://localhost:5500` in your Chrome browser.

## 5. How to Deploy Apps Script
1. Open your target Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Paste the contents of `apps-script/Code.gs`.
4. Click **Deploy > New deployment**.
5. Select **Web app**, set access to **Anyone**, and deploy.
6. Copy the resulting `/exec` URL. (Always deploy a *New Version* when making changes).

## 6. How to Load Chrome Extension
Ensure the extension is loaded as unpacked (see Installation). The icon will appear in your Chrome toolbar.

## 7. How to Run Validation
1. Open the Mock Shipping Website in a Chrome tab.
2. Click the extension icon.
3. Paste your Apps Script Web App URL and click **Load Containers**.
4. Click **Start Validation**.
5. The extension will automatically process the queue and post results back to your Google Sheet.

## 8. Google Sheet Structure
* **Input Tab**: `ContainerNo` (Col A), `ProvidedSeal` (Col B)
* **Results Tab**: `Timestamp`, `Input Row`, `Container No.`, `Input Seal`, `Website Seal`, `Result`, `Remarks`

## 9. Result Meanings
* **MATCH**: Container found and input seal matches website seal (case-insensitive, trimmed).
* **MISMATCH**: Container found, but input seal differs from website seal.
* **NOT FOUND**: Container does not exist on the tracking portal.
* **ERROR**: Missing input seal, search timeout, or simulated internal website failure.

## 10. Duplicate Handling
Duplicate containers (e.g., `OCSU1000128` on Row 7 and Row 20) are processed independently. They are tracked by their unique **Input Row** and will result in multiple distinct output rows on the Results sheet.

## 11. Error Handling
The queue architecture is 100% resilient. A website crash, missing DOM element, timeout, or missing seal will safely log an `ERROR` status for that specific container and immediately proceed to process the next record. One failure never terminates the queue.

## 12. Missing Data Handling
If a container number exists but the seal is blank (`OCSU1000600`), the extension queries the shipping portal anyway. If the query succeeds, the missing input triggers an explicit `ERROR` with the remark `"Input seal missing"`.

## 13. Mock Website Purpose
The mock website provides deterministic development testing. It simulates DOM rendering times, network delays, NOT FOUND states, and internal server errors without needing a live external dependency.

## 14. Real Shipping Website Limitation
**The task materials did not include the real shipping tracking website or login credentials. Therefore, this submission includes a local mock shipping portal for end-to-end validation. The website adapter is isolated so the real portal can be integrated later by updating the site-specific selectors and extraction logic.**
