document.addEventListener('DOMContentLoaded', () => {
    const appUrlInput = document.getElementById('appUrl');
    const loadBtn = document.getElementById('loadBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusMessage = document.getElementById('statusMessage');
    
    const els = {
        total: document.getElementById('totalCount'),
        processed: document.getElementById('processedCount'),
        remaining: document.getElementById('remainingCount'),
        match: document.getElementById('matchCount'),
        mismatch: document.getElementById('mismatchCount'),
        notFound: document.getElementById('notFoundCount'),
        error: document.getElementById('errorCount'),
        uploadFailed: document.getElementById('uploadFailedCount'),
        progressBar: document.getElementById('progressBar')
    };

    let loadedData = [];
    
    // Load saved URL
    chrome.storage.local.get(['appUrl'], function(result) {
        if (result.appUrl) {
            appUrlInput.value = result.appUrl;
        }
    });

    loadBtn.addEventListener('click', async () => {
        const url = appUrlInput.value.trim();
        if (!url) {
            statusMessage.textContent = "Please enter Apps Script URL.";
            return;
        }
        
        chrome.storage.local.set({ appUrl: url });
        statusMessage.textContent = "Loading containers...";
        loadBtn.disabled = true;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            
            if (data.success === false || data.error) {
                throw new Error(data.error || "Unknown error");
            }
            
            loadedData = data.containers || [];
            els.total.textContent = loadedData.length;
            els.remaining.textContent = loadedData.length;
            statusMessage.textContent = `Loaded ${loadedData.length} records successfully.`;
            
            if (loadedData.length > 0) {
                startBtn.disabled = false;
            }
        } catch (err) {
            statusMessage.textContent = `Error loading: ${err.message}`;
        } finally {
            loadBtn.disabled = false;
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'UPDATE_STATUS') {
            const { stats, currentContainer, status, isFinished } = message.payload;
            
            els.processed.textContent = stats.processed;
            
            const total = parseInt(els.total.textContent) || 0;
            els.remaining.textContent = Math.max(0, total - stats.processed);
            
            els.match.textContent = stats.match;
            els.mismatch.textContent = stats.mismatch;
            els.notFound.textContent = stats.notFound;
            els.error.textContent = stats.error;
            els.uploadFailed.textContent = stats.uploadFailed;
            
            const progress = total === 0 ? 0 : (stats.processed / total) * 100;
            els.progressBar.style.width = `${progress}%`;
            
            if (currentContainer) {
                statusMessage.textContent = `Processing: ${currentContainer} (${status})`;
            }
            
            if (isFinished || (total > 0 && stats.processed >= total)) {
                finishValidation();
            }
        }
    });

    startBtn.addEventListener('click', () => {
        if (!loadedData || loadedData.length === 0) return;
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        loadBtn.disabled = true;
        appUrlInput.disabled = true;
        
        statusMessage.textContent = "Starting validation...";
        
        els.processed.textContent = 0;
        els.remaining.textContent = loadedData.length;
        els.match.textContent = 0;
        els.mismatch.textContent = 0;
        els.notFound.textContent = 0;
        els.error.textContent = 0;
        els.uploadFailed.textContent = 0;
        els.progressBar.style.width = '0%';
        
        chrome.runtime.sendMessage({
            type: 'START_VALIDATION',
            payload: { 
                data: loadedData,
                appUrl: appUrlInput.value.trim()
            }
        });
    });
    
    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP_VALIDATION' });
        finishValidation("Stopped by user");
    });
    
    function finishValidation(msg = "Validation completed.") {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        loadBtn.disabled = false;
        appUrlInput.disabled = false;
        statusMessage.textContent = msg;
    }
});
