// comparison.js
function normalizeSeal(seal) {
    if (seal === null || seal === undefined) return "";
    return String(seal).trim().toUpperCase();
}

function compareSeals(inputSeal, websiteSeal) {
    const normInput = normalizeSeal(inputSeal);
    const normWeb = normalizeSeal(websiteSeal);
    
    if (normInput === normWeb) {
        return "MATCH";
    }
    return "MISMATCH";
}
