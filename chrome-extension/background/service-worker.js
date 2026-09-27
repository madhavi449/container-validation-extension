importScripts('../utils/helpers.js');

let isRunning = false;
let currentQueue = [];
let appUrl = "";
let stats = { processed: 0, match: 0, mismatch: 0, notFound: 0, error: 0, uploadFailed: 0 };
let localFailedResults = [];

const TEST_SINGLE_RECORD_ONLY = false;

function debug(...args) {
    console.log("[CV]", ...args);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_VALIDATION') {
        isRunning = true;
        currentQueue = Array.isArray(message.payload?.data) ? [...message.payload.data] : [];
        appUrl = message.payload?.appUrl || "";
        
        stats = { processed: 0, match: 0, mismatch: 0, notFound: 0, error: 0, uploadFailed: 0 };
        localFailedResults = [];
        
        processQueue();
    } else if (message.type === 'STOP_VALIDATION') {
        isRunning = false;
        currentQueue = [];
        debug("Validation stopped by user");
    }
});

async function processQueue() {
    while (isRunning && currentQueue.length > 0) {
        const record = currentQueue.shift();
        const container = record.container;
        const inputSeal = record.inputSeal;
        
        debug("==================================================");
        debug("CONTAINER START");
        debug(`Container: ${container || 'UNKNOWN'}`);
        debug("==================================================");
        
        let result;
        try {
            result = await validateOneContainer(record);
        } catch (error) {
            result = {
                status: "ERROR",
                remarks: error.message
            };
        }
        
        updateStats(result.status);
        
        try {
            const uploadObj = {
                row: record.row || "",
                container: container || "",
                inputSeal: inputSeal || "",
                websiteSeal: result.websiteSeal || "",
                result: result.status,
                remarks: result.remarks || ""
            };
            const uploadSuccess = await postResultToAppsScript(appUrl, uploadObj);
            if (uploadSuccess) {
                debug("[UPLOAD] Result uploaded");
            } else {
                throw new Error("Apps Script upload failed");
            }
        } catch (uploadError) {
            stats.uploadFailed++;
            debug(`[UPLOAD] Upload failed: ${uploadError.message}`);
        }
        
        broadcastStatus(container || 'UNKNOWN', result.status);
        debug("[QUEUE] Moving to next container");
        
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (currentQueue.length === 0) {
        broadcastStatus(null, "Validation completed.", true);
    }
}

async function validateOneContainer(record) {
    const container = record.container;
    const inputSeal = record.inputSeal;
    
    if (!container) {
        debug("[RESULT] ERROR");
        debug("Reason: Container number missing");
        return { status: "ERROR", remarks: "Container number missing" };
    }
    
    const tabs = await new Promise(res => chrome.tabs.query({active: true, lastFocusedWindow: true}, res));
    if (!tabs || tabs.length === 0) {
        debug("[RESULT] ERROR");
        debug("Reason: Active tab not found");
        return { status: "ERROR", remarks: "Active tab not found" };
    }
    
    const activeTabId = tabs[0].id;
    if (!tabs[0].url.includes("script.google.com") && !tabs[0].url.includes("script.googleusercontent.com")) {
        debug("[RESULT] ERROR");
        debug("Reason: OceanCrest company tracking portal not open");
        return { status: "ERROR", remarks: "OceanCrest company tracking portal not open" };
    }
    
    const trackingFrame = await findTrackingFrame(activeTabId);
    if (!trackingFrame) {
        debug("[RESULT] ERROR");
        debug("Reason: Tracking frame unavailable");
        return { status: "ERROR", remarks: "Tracking frame unavailable" };
    }
    
    debug(`[FRAME] Frame ID: ${trackingFrame.frameId}`);
    
    const execResult = await chrome.scripting.executeScript({
        target: { tabId: activeTabId, frameIds: [trackingFrame.frameId] },
        func: executeTrackingFlow,
        args: [container, inputSeal]
    });
    
    if (!execResult || execResult.length === 0 || !execResult[0].result) {
        debug("[RESULT] ERROR");
        debug("Reason: Service worker could not retrieve execution results");
        return { status: "ERROR", remarks: "Service worker could not retrieve execution results" };
    }
    
    const res = execResult[0].result;
    
    if (res.debugLogs && Array.isArray(res.debugLogs)) {
        res.debugLogs.forEach(log => debug(log));
    }
    
    return {
        status: res.status || "ERROR",
        websiteSeal: res.websiteSeal || "",
        remarks: res.remarks || res.errorMsg || ""
    };
}

async function findTrackingFrame(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => {
                const getInputs = () => Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
                const getBtns = () => Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a.track-btn'));
                
                const input = getInputs().find(el => {
                    if (el.id === 'q') return true;
                    if ((el.placeholder || '').toLowerCase().includes('container')) return true;
                    if ((el.getAttribute('aria-label') || '').toLowerCase().includes('container')) return true;
                    if ((el.name || '').toLowerCase().includes('container')) return true;
                    if ((el.id || '').toLowerCase().includes('container')) return true;
                    return false;
                });
                
                const button = getBtns().find(el => {
                    if (el.id === 'trackBtn') return true;
                    const txt = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toUpperCase();
                    return txt.includes('TRACK SHIPMENT') || txt.includes('TRACK') || txt.includes('SUBMIT');
                });
                
                return { 
                    url: location.href, 
                    isTrackingPage: !!input && !!button 
                };
            }
        });
        
        const validFrame = results.find(r => r.result && r.result.isTrackingPage);
        if (validFrame) {
            return { frameId: validFrame.frameId, url: validFrame.result.url };
        }
    } catch (err) {}
    return null;
}

// THIS FUNCTION RUNS COMPLETELY ISOLATED INSIDE THE PAGE'S JS CONTEXT
async function executeTrackingFlow(containerNumber, inputSeal) {
    const logs = [];
    const dbg = (msg) => logs.push(msg);
    const RESULT_TIMEOUT_MS = 30000;
    
    try {
        dbg("[FRAME] Tracking context found");
        
        // 1. Gather baseline snapshot
        const getElHtml = (sel) => document.querySelector(sel)?.innerHTML || "";
        const getElText = (sel) => document.querySelector(sel)?.innerText || "";
        const getElClass = (sel) => document.querySelector(sel)?.className || "";
        
        const snapshot = {
            bodyText: document.body.innerText || "",
            resultHTML: getElHtml("#resultCard, section.hero#tracking, .result-container"),
            resultClass: getElClass("#resultCard, section.hero#tracking, .result-container"),
            errorHTML: getElHtml("#errorCard, .error-card, #notFound, #errorMessage"),
            errorClass: getElClass("#errorCard, .error-card, #notFound, #errorMessage"),
            loadingClass: getElClass("#loadingCard, .loading, #loading")
        };
        
        const toastText = "Tracking is not enabled in this training portal";
        const hasToastBefore = snapshot.bodyText.includes(toastText);
        
        dbg("[SNAPSHOT]");
        dbg(`Existing result detected: ${!!snapshot.resultHTML}`);
        dbg(`Existing error detected: ${!!snapshot.errorHTML}`);
        dbg(`Existing tracking-disabled message: ${hasToastBefore}`);
        
        // 2. Locate elements
        const getInputs = () => Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
        const getBtns = () => Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a.track-btn'));
        
        const input = getInputs().find(el => {
            if (el.id === 'q') return true;
            if ((el.placeholder || '').toLowerCase().includes('container')) return true;
            if ((el.getAttribute('aria-label') || '').toLowerCase().includes('container')) return true;
            if ((el.name || '').toLowerCase().includes('container')) return true;
            if ((el.id || '').toLowerCase().includes('container')) return true;
            return false;
        });
        
        const button = getBtns().find(el => {
            if (el.id === 'trackBtn') return true;
            const txt = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toUpperCase();
            return txt.includes('TRACK SHIPMENT') || txt.includes('TRACK') || txt.includes('SUBMIT');
        });
        
        if (!input) {
            return { status: 'ERROR', errorMsg: 'INPUT_NOT_FOUND', debugLogs: logs };
        }
        if (!button) {
            return { status: 'ERROR', errorMsg: 'BUTTON_NOT_FOUND', debugLogs: logs };
        }
        
        dbg("[INPUT]");
        dbg(`Found: true`);
        dbg(`Before: ${input.value}`);
        
        // 3. Clear and set input
        input.scrollIntoView({ behavior: 'instant', block: 'center' });
        input.focus();
        input.value = "";
        
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
            setter.call(input, containerNumber);
        } else {
            input.value = containerNumber;
        }
        
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: containerNumber }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        dbg(`After: ${input.value}`);
        
        if (input.value.trim().toUpperCase() !== containerNumber.trim().toUpperCase()) {
            return { status: 'ERROR', errorMsg: `INPUT_ASSIGNMENT_FAILED`, debugLogs: logs };
        }
        
        dbg("[BUTTON]");
        dbg(`Found: true`);
        const style = window.getComputedStyle(button);
        dbg(`Disabled: ${button.disabled}`);
        dbg(`Connected: ${button.isConnected}`);
        
        // 4. Click
        dbg("[CLICK]");
        dbg("Track Shipment clicked");
        try {
            button.click();
        } catch(e) {
            button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
            button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
            button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        }
        
        dbg("[WAIT]");
        dbg("Waiting for current search result...");
        
        // 5. Wait for current result
        const waitResult = await new Promise((resolve) => {
            let observer;
            const timeout = setTimeout(() => {
                if (observer) observer.disconnect();
                resolve({ type: 'TIMEOUT' });
            }, RESULT_TIMEOUT_MS);

            let loadingSeen = false;

            const checkCondition = () => {
                const currentText = document.body.innerText || "";
                
                // Track loading state explicitly
                const loadingEl = document.querySelector("#loadingCard, .loading, #loading");
                if (loadingEl && !loadingEl.classList.contains("hidden")) {
                    loadingSeen = true;
                }
                
                // Verify if the toast appeared NEWLY after click
                if (!hasToastBefore && currentText.includes(toastText)) {
                    clearTimeout(timeout);
                    if (observer) observer.disconnect();
                    resolve({ type: 'TRACKING_DISABLED' });
                    return true;
                }
                
                // Verify specific Result / Error Cards
                const resultCard = document.querySelector("#resultCard, section.hero#tracking, .result-container, #result");
                const errorCard = document.querySelector("#errorCard, .error-card, #notFound, #errorMessage");
                
                if (errorCard && !errorCard.classList.contains("hidden") && errorCard.innerHTML !== snapshot.errorHTML) {
                    const errTxt = errorCard.innerText.toUpperCase();
                    if (errTxt.includes("CONTAINER NOT FOUND") || errTxt.includes("NO RESULTS FOUND") || errTxt.includes("NO TRACKING INFORMATION") || errTxt.includes("DOES NOT EXIST") || errTxt.includes("NO SHIPMENT FOUND")) {
                        clearTimeout(timeout);
                        if (observer) observer.disconnect();
                        resolve({ type: 'NOT_FOUND' });
                        return true;
                    }
                    if (errTxt.includes("INTERNAL SERVER ERROR") || errTxt.includes("SERVICE UNAVAILABLE") || errTxt.includes("AN ERROR OCCURRED")) {
                        clearTimeout(timeout);
                        if (observer) observer.disconnect();
                        resolve({ type: 'SITE_ERROR' });
                        return true;
                    }
                }
                
                if (resultCard && !resultCard.classList.contains("hidden") && resultCard.innerHTML !== snapshot.resultHTML) {
                    const resTxt = resultCard.innerText.toUpperCase();
                    // Must correspond to CURRENT container
                    if (resTxt.includes(containerNumber.toUpperCase())) {
                        clearTimeout(timeout);
                        if (observer) observer.disconnect();
                        resolve({ type: 'FOUND' });
                        return true;
                    }
                }
                
                // Fallback text check if cards aren't distinctly identifiable, but only if we know loading passed or DOM mutated significantly
                if (loadingSeen && loadingEl && loadingEl.classList.contains("hidden")) {
                    if (currentText.toUpperCase().includes("CONTAINER NOT FOUND") || currentText.toUpperCase().includes("NO RESULTS FOUND") || currentText.toUpperCase().includes("NO SHIPMENT FOUND")) {
                        clearTimeout(timeout);
                        if (observer) observer.disconnect();
                        resolve({ type: 'NOT_FOUND' });
                        return true;
                    }
                    if (currentText.toUpperCase().includes("CONTAINER TRACKING RESULT") || currentText.toUpperCase().includes("ROUTE OVERVIEW")) {
                        if (currentText.toUpperCase().includes(containerNumber.toUpperCase())) {
                            clearTimeout(timeout);
                            if (observer) observer.disconnect();
                            resolve({ type: 'FOUND' });
                            return true;
                        }
                    }
                }
                
                return false;
            };

            if (checkCondition()) return;
            observer = new MutationObserver(() => {
                dbg("[DOM] Mutation observed");
                checkCondition();
            });
            observer.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
        });
        
        dbg("[RESULT]");
        if (waitResult.type === 'TRACKING_DISABLED') {
            dbg("ERROR");
            dbg("Reason: Tracking disabled by portal");
            return { status: 'ERROR', errorMsg: 'Tracking disabled by portal', debugLogs: logs };
        } else if (waitResult.type === 'NOT_FOUND') {
            dbg("NOT_FOUND");
            return { status: 'NOT FOUND', remarks: 'Container not found', debugLogs: logs };
        } else if (waitResult.type === 'SITE_ERROR') {
            dbg("ERROR");
            dbg("Reason: Website error");
            return { status: 'ERROR', errorMsg: 'Website error', debugLogs: logs };
        } else if (waitResult.type === 'TIMEOUT') {
            dbg("ERROR");
            dbg("Reason: Tracking result timeout");
            return { status: 'ERROR', errorMsg: 'Tracking result timeout', debugLogs: logs };
        } else if (waitResult.type === 'FOUND') {
            dbg("FOUND");
            
            dbg("[SEAL]");
            dbg(`Input seal: ${inputSeal || ""}`);
            
            let websiteSeal = "";
            const els = Array.from(document.querySelectorAll('#resultCard *, section.hero#tracking *, .result-container *, #result *'));
            const searchEls = els.length > 0 ? els : Array.from(document.querySelectorAll('*'));
            
            for (const el of searchEls) {
                if (el.children.length === 0 && el.textContent.trim().toUpperCase() === 'SEAL NUMBER') {
                    let current = el.nextElementSibling;
                    if (current && current.textContent.trim()) { websiteSeal = current.textContent.trim(); break; }
                    
                    if (el.parentElement) {
                        current = el.parentElement.nextElementSibling;
                        if (current && current.textContent.trim()) { websiteSeal = current.textContent.trim(); break; }
                        
                        if (el.parentElement.parentElement) {
                            current = el.parentElement.parentElement.nextElementSibling;
                            if (current && current.textContent.trim() && !current.textContent.toUpperCase().includes('SEAL NUMBER') && !current.textContent.toUpperCase().includes('CONTAINER TYPE')) {
                                websiteSeal = current.textContent.trim(); break;
                            }
                        }
                    }
                }
            }
            
            if (!websiteSeal) {
                for (const el of searchEls) {
                    const txt = el.textContent.trim().toUpperCase();
                    if (txt.includes('SEAL NUMBER')) {
                        const match = txt.match(/SEAL\s*NUMBER\s*[:\-]?\s*([A-Z0-9]+)/i);
                        if (match && match[1]) { websiteSeal = match[1]; break; }
                    }
                }
            }
            
            if (!websiteSeal) {
                dbg("ERROR");
                dbg("Reason: SEAL_NOT_FOUND");
                return { status: 'ERROR', errorMsg: 'SEAL_NOT_FOUND', debugLogs: logs };
            }
            
            dbg(`Website seal: ${websiteSeal}`);
            
            const normalizedInputSeal = inputSeal ? inputSeal.trim().toUpperCase() : "";
            const normalizedWebsiteSeal = websiteSeal.trim().toUpperCase();
            
            dbg("[COMPARISON]");
            let finalStatus, remarks = "";
            if (!normalizedInputSeal) {
                finalStatus = "ERROR";
                remarks = "Input seal missing";
            } else if (normalizedInputSeal === normalizedWebsiteSeal) {
                finalStatus = "MATCH";
            } else {
                finalStatus = "MISMATCH";
                remarks = "Seal differs";
            }
            
            dbg(finalStatus);
            return { status: finalStatus, websiteSeal: websiteSeal, remarks: remarks, debugLogs: logs };
        }
    } catch (err) {
        dbg("[RESULT]");
        dbg("ERROR");
        dbg(`Reason: EXEC_EXCEPTION: ${err.message}`);
        return { status: 'ERROR', errorMsg: `EXEC_EXCEPTION: ${err.message}`, debugLogs: logs };
    }
}

async function postResultToAppsScript(url, data, retries = 3) {
    if (!url) return false;
    
    const params = new URLSearchParams();
    for (const key in data) {
        params.append(key, data[key] === null || data[key] === undefined ? "" : data[key]);
    }
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: params.toString()
            });
            const text = await response.text();
            const json = JSON.parse(text);
            if (json && json.success) return true;
        } catch (err) {
            if (i === retries - 1) return false;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return false;
}

function updateStats(status) {
    stats.processed++;
    if (status === 'MATCH') stats.match++;
    else if (status === 'MISMATCH') stats.mismatch++;
    else if (status === 'NOT FOUND' || status === 'NOT_FOUND') stats.notFound++;
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