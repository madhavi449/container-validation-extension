function logMessage(
    level,
    message,
    containerId = "SYSTEM"
) {

    const prefix =
        `[${level}] [${containerId}]`;


    if (level === "ERROR") {

        console.error(
            `${prefix} ${message}`
        );

    } else if (
        level === "WARNING"
    ) {

        console.warn(
            `${prefix} ${message}`
        );

    } else {

        console.log(
            `${prefix} ${message}`
        );
    }
}