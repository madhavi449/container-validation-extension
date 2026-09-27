// --- CONFIGURATION / ADAPTER SECTION ---
// Update these selectors when migrating to the real shipping website
const CONFIG = {
    SELECTORS: {
        LOGIN_FORM: '#loginForm', 
        SEARCH_INPUT: '#containerSearchInput',
        SEARCH_BUTTON: '#searchButton',
        RESULT_CONTAINER: '#result',
        NOT_FOUND_INDICATOR: '#notFound',
        ERROR_INDICATOR: '#errorMessage', 
        SEAL_NUMBER_TEXT: '#sealNumber',
        LOADING_SPINNER: '#loading'
    },
    TIMEOUTS: {
        WAIT_FOR_RESULT_MS: 12000 
    }
};
// --- END CONFIGURATION ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROCESS_CONTAINER') {
        processContainerAsync(message.payload.container)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ status: 'ERROR', errorMsg: err.message }));
            
        return true; 
    }
});

async function processContainerAsync(containerNumber) {
    try {
        const isLoginPage = document.querySelector(CONFIG.SELECTORS.LOGIN_FORM);
        if (isLoginPage) {
            return { status: 'ERROR', errorMsg: 'Login expired or user not logged in.' };
        }
        
        await searchContainer(containerNumber);
        
        const resultType = await waitForSearchResult();
        
        if (resultType === 'NOT_FOUND') {
            return { status: 'NOT_FOUND' };
        } else if (resultType === 'SITE_ERROR') {
            return { status: 'ERROR', errorMsg: 'Website error state detected' };
        } else if (resultType === 'FOUND') {
            const websiteSeal = extractWebsiteSeal();
            return { status: 'FOUND', websiteSeal };
        } else {
            return { status: 'ERROR', errorMsg: 'Search timeout' };
        }
        
    } catch (err) {
        return { status: 'ERROR', errorMsg: err.message };
    }
}

async function searchContainer(containerNumber) {
    const input = document.querySelector(CONFIG.SELECTORS.SEARCH_INPUT);
    const btn = document.querySelector(CONFIG.SELECTORS.SEARCH_BUTTON);
    
    if (!input || !btn) {
        throw new Error("Search input or button not found on the page");
    }
    
    // Clear previous UI state if applicable
    const prevResult = document.querySelector(CONFIG.SELECTORS.RESULT_CONTAINER);
    if (prevResult && !prevResult.classList.contains('hidden')) {
        prevResult.classList.add('hidden');
    }
    const prevNotFound = document.querySelector(CONFIG.SELECTORS.NOT_FOUND_INDICATOR);
    if (prevNotFound && !prevNotFound.classList.contains('hidden')) {
        prevNotFound.classList.add('hidden');
    }
    const prevError = document.querySelector(CONFIG.SELECTORS.ERROR_INDICATOR);
    if (prevError && !prevError.classList.contains('hidden')) {
        prevError.classList.add('hidden');
    }
    
    input.value = containerNumber;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    btn.click();
}

async function waitForSearchResult() {
    return new Promise((resolve) => {
        let observer;
        
        const timeout = setTimeout(() => {
            if (observer) observer.disconnect();
            resolve('TIMEOUT');
        }, CONFIG.TIMEOUTS.WAIT_FOR_RESULT_MS);

        const checkCondition = () => {
            const loading = document.querySelector(CONFIG.SELECTORS.LOADING_SPINNER);
            if (loading && !loading.classList.contains('hidden')) {
                return false; 
            }
            
            const notFound = document.querySelector(CONFIG.SELECTORS.NOT_FOUND_INDICATOR);
            const found = document.querySelector(CONFIG.SELECTORS.RESULT_CONTAINER);
            const siteError = document.querySelector(CONFIG.SELECTORS.ERROR_INDICATOR);
            
            if (siteError && !siteError.classList.contains('hidden')) {
                clearTimeout(timeout);
                if (observer) observer.disconnect();
                resolve('SITE_ERROR');
                return true;
            } else if (notFound && !notFound.classList.contains('hidden')) {
                clearTimeout(timeout);
                if (observer) observer.disconnect();
                resolve('NOT_FOUND');
                return true;
            } else if (found && !found.classList.contains('hidden')) {
                clearTimeout(timeout);
                if (observer) observer.disconnect();
                resolve('FOUND');
                return true;
            }
            return false;
        };

        if (checkCondition()) return;

        observer = new MutationObserver(() => {
            checkCondition();
        });
        
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    });
}

function extractWebsiteSeal() {
    const sealElement = document.querySelector(CONFIG.SELECTORS.SEAL_NUMBER_TEXT);
    if (sealElement) {
        return sealElement.textContent.trim();
    }
    return "";
}
