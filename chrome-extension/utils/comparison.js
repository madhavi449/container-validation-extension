function normalizeSeal(
    seal
) {

    if (
        seal === null ||
        seal === undefined
    ) {

        return "";
    }


    return String(seal)
        .trim()
        .toUpperCase();
}


function compareSeals(
    inputSeal,
    websiteSeal
) {

    const input =
        normalizeSeal(
            inputSeal
        );

    const website =
        normalizeSeal(
            websiteSeal
        );


    if (
        input === website
    ) {

        return "MATCH";
    }


    return "MISMATCH";
}