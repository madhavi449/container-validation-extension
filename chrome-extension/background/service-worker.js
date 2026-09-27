importScripts('../utils/helpers.js', '../utils/comparison.js');

let isRunning = false;
let currentQueue = [];
let appUrl = "";
let stats = { processed: 0, match: 0, mismatch: 0, notFound: 0, error: 0, uploadFailed: 0 };
let activeTabId = null;
let localFailedResults = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_VALIDATION') {
        isRunning = true;
        currentQueue = [...message.payload.data];
        appUrl = message.payload.appUrl;
        stats = { processed: 0, match: 0, mismatch: 0, notFound: 0, error: 0, uploadFailed: 0 };
        localFailedResults = [];
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length === 0) {
                logMessage('ERROR', 'No active tab found', 'SYSTEM');
                isRunning = false;
                return;
            }
            activeTabId = tabs[0].id;
            logMessage('INFO', 'Starting validation', 'SYSTEM');
            processQueue();
        });
    } else if (message.type === 'STOP_VALIDATION') {
        isRunning = false;
        currentQueue = [];
        logMessage('INFO', 'Validation stopped by user', 'SYSTEM');
    }
});

async function processQueue() {
    if (!isRunning || currentQueue.length === 0) {
        let msg = "Validation completed.";
        if (localFailedResults.length > 0) {
            msg += ` ${localFailedResults.length} uploads failed.`;
        }
        broadcastStatus(null, msg, true);
        logMessage('INFO', 'Validation completed', 'SYSTEM');
        return;
    }
    
    const record = currentQueue.shift();
    const container = record.container;
    const inputSeal = record.inputSeal;
    
    broadcastStatus(container || 'UNKNOWN', "Checking...");
    logMessage('INFO', `Processing ${container || 'Empty'}`, container || 'UNKNOWN');
    
    let finalStatus = "ERROR";
    let websiteSeal = "";
    let remarks = "";
    
    try {
        if (!container) {
            finalStatus = "ERROR";
            remarks = "Container number missing";
            logMessage('ERROR', remarks, 'UNKNOWN');
        } else {
            const result = await sendToContentScript(activeTabId, {
                type: 'PROCESS_CONTAINER',
                payload: { container: container }
            });
            
            if (result.status === 'FOUND') {
                websiteSeal = result.websiteSeal;
                if (!websiteSeal) {
                    finalStatus = "ERROR";
                    remarks = "Website seal unavailable";
                    logMessage('ERROR', remarks, container);
                } else if (!inputSeal) {
                    finalStatus = "ERROR";
                    remarks = "Input seal missing";
                    logMessage('ERROR', remarks, container);
                } else {
                    logMessage('INFO', `Container found`, container);
                    logMessage('INFO', `Website seal: ${websiteSeal}`, container);
                    finalStatus = compareSeals(inputSeal, websiteSeal);
                }
            } else if (result.status === 'NOT_FOUND') {
                finalStatus = "NOT FOUND";
                remarks = "Container not found on website";
                logMessage('INFO', remarks, container);
            } else if (result.status === 'ERROR') {
                finalStatus = "ERROR";
                remarks = result.errorMsg || 'Unknown error';
                if (!inputSeal) remarks = "Input seal missing"; // Favor missing input remark if error occurred
                logMessage('ERROR', remarks, container);
            }
        }
    } catch (err) {
        logMessage('ERROR', `Queue error: ${err.message}`, container || 'UNKNOWN');
        finalStatus = "ERROR";
        remarks = err.message;
    }
    
    logMessage('INFO', `Result: ${finalStatus}`, container || 'UNKNOWN');
    updateStats(finalStatus);
    broadcastStatus(container || 'UNKNOWN', `Saving result: ${finalStatus}...`);
    
    const resultObj = {
        row: record.row,
        container: container || "",
        inputSeal: inputSeal || "",
        websiteSeal: websiteSeal,
        result: finalStatus,
        remarks: remarks
    };
    
    const uploadSuccess = await postResultToAppsScript(appUrl, resultObj);
    if (!uploadSuccess) {
        stats.uploadFailed++;
        localFailedResults.push(resultObj);
        logMessage('ERROR', 'Failed to upload result to Google Sheets', container || 'UNKNOWN');
    }
    
    broadcastStatus(container || 'UNKNOWN', finalStatus);
    logMessage('INFO', `Continuing to next container`, 'SYSTEM');
    
    setTimeout(processQueue, 2000); // 2 second delay between requests
}

async function ensureContentScript(tabId) {
    try {
        logMessage('INFO', '[Container Validator] Active tab: ' + tabId, 'SYSTEM');
        
        // Check if already injected
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => { return typeof window.processContainerAsync === 'function'; }
        });
        
        if (results && results[0] && results[0].result === true) {
            return true;
        }
        
        logMessage('INFO', '[Container Validator] Content script injection: injecting shipping-site.js', 'SYSTEM');
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content/shipping-site.js']
        });
        
        await new Promise(r => setTimeout(r, 500));
        return true;
    } catch (err) {
        logMessage('ERROR', `Injection failed: ${err.message}`, 'SYSTEM');
        return false;
    }
}

async function sendToContentScript(tabId, message) {
    const isReady = await ensureContentScript(tabId);
    if (!isReady) {
        return { status: 'ERROR', errorMsg: 'Failed to initialize content script on the active tab' };
    }
    
    return new Promise((resolve) => {
        logMessage('INFO', `[Container Validator] Message sent: PROCESS_CONTAINER`, message.payload.container);
        const timeout = setTimeout(() => {
            resolve({ status: 'ERROR', errorMsg: 'Search timeout' });
        }, 15000); // 15s absolute max
        
        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
                logMessage('ERROR', `[Container Validator] Content Script Error: ${chrome.runtime.lastError.message}`, message.payload.container);
                resolve({ status: 'ERROR', errorMsg: chrome.runtime.lastError.message });
            } else if (!response) {
                resolve({ status: 'ERROR', errorMsg: 'No response from content script (page might be reloading)' });
            } else {
                logMessage('INFO', `[Container Validator] Website response: ${response.status}`, message.payload.container);
                resolve(response);
            }
        });
    });
}

async function postResultToAppsScript(url, data, retries = 3) {
    if (!url) return false;
    
    // Convert JSON to URL-encoded form data to bypass Apps Script CORS preflight issues reliably
    const params = new URLSearchParams();
    for (const key in data) {
        params.append(key, data[key] === null || data[key] === undefined ? "" : data[key]);
    }
    
    for (let i = 0; i < retries; i++) {
        try {
            logMessage('INFO', `[UPLOAD] URL: ${url}`, data.container || 'UNKNOWN');
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            
            logMessage('INFO', `[UPLOAD] HTTP status: ${response.status}`, data.container || 'UNKNOWN');
            
            const text = await response.text();
            logMessage('INFO', `[UPLOAD] response text: ${text}`, data.container || 'UNKNOWN');
            
            let json;
            try {
                json = JSON.parse(text);
                logMessage('INFO', `[UPLOAD] parsed JSON: ${JSON.stringify(json)}`, data.container || 'UNKNOWN');
            } catch (e) {
                logMessage('ERROR', `[UPLOAD] error message: Failed to parse response as JSON`, data.container || 'UNKNOWN');
                throw new Error("Invalid JSON response");
            }

            if (json && json.success) {
                logMessage('INFO', `[UPLOAD] success/failure: SUCCESS`, data.container || 'UNKNOWN');
                return true;
            } else {
                const errorMsg = json.error || "Unknown Apps Script error";
                logMessage('ERROR', `[UPLOAD] error message: ${errorMsg}`, data.container || 'UNKNOWN');
                throw new Error(errorMsg);
            }
        } catch (err) {
            logMessage('WARNING', `[UPLOAD] success/failure: FAILURE - Retry ${i + 1} failed: ${err.message}`, data.container || 'UNKNOWN');
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return false;
}

function updateStats(status) {
    stats.processed++;
    if (status === 'MATCH') stats.match++;
    else if (status === 'MISMATCH') stats.mismatch++;
    else if (status === 'NOT FOUND') stats.notFound++;
    else stats.error++;
}

function broadcastStatus(container, statusStr, isFinished = false) {
    chrome.runtime.sendMessage({
        type: 'UPDATE_STATUS',
        payload: {
            stats,
            currentContainer: container,
            status: statusStr,
            isFinished
        }
    }).catch(() => {});
}
