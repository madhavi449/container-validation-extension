const MOCK_DATA = {
    // --- ACTUAL CANDIDATE MOCK DATA (DEVELOPMENT TEST ONLY) ---
    "OCSU1000128": { seal: "OC8095028", status: "Active", location: "Singapore" }, // MATCH
    "OCSU1000004": { seal: "OC8000001", status: "Discharged", location: "Rotterdam" }, // MISMATCH
    "OCSU1000600": { seal: "OC8498111", status: "In Transit", location: "Mumbai" }, // MISSING INPUT SEAL
    "OCSU1999990": { seal: "OC9999901", status: "Active", location: "Shanghai" }, // ERROR (overridden in JS)
    
    // Remaining candidates (mostly MATCH)
    "OCSU1000025": { seal: "OC8015838", status: "Active", location: "Chennai" },
    "OCSU1000046": { seal: "OC8031676", status: "Active", location: "Mumbai" },
    "OCSU1000072": { seal: "OC8055450", status: "Active", location: "Singapore" },
    "OCSU1000093": { seal: "OC8071271", status: "Active", location: "Rotterdam" },
    "OCSU1000154": { seal: "OC8118785", status: "Active", location: "Chennai" },
    "OCSU1000180": { seal: "OC8142542", status: "Active", location: "Mumbai" },
    "OCSU1000215": { seal: "OC8166316", status: "Active", location: "Singapore" },
    "OCSU1000257": { seal: "OC8197975", status: "Active", location: "Rotterdam" },
    "OCSU1000299": { seal: "OC8229651", status: "Active", location: "Chennai" },
    "OCSU1000339": { seal: "OC8261327", status: "Active", location: "Mumbai" },
    "OCSU1000386": { seal: "OC8300922", status: "Active", location: "Singapore" },
    "OCSU1000447": { seal: "OC8348453", status: "Active", location: "Rotterdam" },
    "OCSU1000513": { seal: "OC8403869", status: "Active", location: "Chennai" },
    "OCSU1000576": { seal: "OC8451383", status: "Active", location: "Mumbai" },
    "OCSU1000637": { seal: "OC8498897", status: "Active", location: "Singapore" },
    "OCSU1000684": { seal: "OC8538492", status: "Active", location: "Rotterdam" },
    
    // --- PREVIOUS MOCK DATA ---
    "ABCD1234567": { seal: "SEAL001", status: "Active", location: "Chennai" },
    "ABCD1234568": { seal: "SEAL009", status: "In Transit", location: "Mumbai" },
    "ABCD1234570": { seal: "SEAL004", status: "Discharged", location: "Singapore" }
};

document.getElementById('searchButton').addEventListener('click', () => {
    const input = document.getElementById('containerSearchInput').value.trim();
    
    document.getElementById('result').classList.add('hidden');
    document.getElementById('notFound').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    
    document.getElementById('loading').classList.remove('hidden');
    
    setTimeout(() => {
        document.getElementById('loading').classList.add('hidden');
        
        if (!input) return;
        
        // Deterministic development-only error case
        if (input === 'ERROR0000001' || input === 'OCSU1999990') {
            document.getElementById('errorMessage').classList.remove('hidden');
            return;
        }
        
        const data = MOCK_DATA[input];
        if (data) {
            document.getElementById('containerNumber').textContent = input;
            document.getElementById('sealNumber').textContent = data.seal;
            document.getElementById('status').textContent = data.status;
            document.getElementById('location').textContent = data.location;
            document.getElementById('result').classList.remove('hidden');
        } else {
            document.getElementById('notFound').classList.remove('hidden');
        }
    }, 1500); // Realistic 1.5s delay
});
