document.addEventListener(
    "DOMContentLoaded",
    () => {

        const appUrlInput =
            document.getElementById(
                "appUrl"
            );

        const loadBtn =
            document.getElementById(
                "loadBtn"
            );

        const startBtn =
            document.getElementById(
                "startBtn"
            );

        const stopBtn =
            document.getElementById(
                "stopBtn"
            );

        const statusMessage =
            document.getElementById(
                "statusMessage"
            );


        const els = {

            total:
                document.getElementById(
                    "totalCount"
                ),

            processed:
                document.getElementById(
                    "processedCount"
                ),

            remaining:
                document.getElementById(
                    "remainingCount"
                ),

            match:
                document.getElementById(
                    "matchCount"
                ),

            mismatch:
                document.getElementById(
                    "mismatchCount"
                ),

            notFound:
                document.getElementById(
                    "notFoundCount"
                ),

            error:
                document.getElementById(
                    "errorCount"
                ),

            uploadFailed:
                document.getElementById(
                    "uploadFailedCount"
                ),

            progressBar:
                document.getElementById(
                    "progressBar"
                )
        };


        let loadedData = [];


        /*
         * Load saved Apps Script backend URL.
         */
        chrome.storage.local.get(
            ["appUrl"],
            result => {

                if (result.appUrl) {

                    appUrlInput.value =
                        result.appUrl;
                }
            }
        );


        /* =================================================
           LOAD CONTAINERS
        ================================================= */

        loadBtn.addEventListener(
            "click",
            async () => {

                const url =
                    appUrlInput.value.trim();


                if (!url) {

                    statusMessage.textContent =
                        "Please enter Apps Script Backend URL.";

                    return;
                }


                /*
                 * IMPORTANT:
                 *
                 * This must be your BACKEND Apps Script URL,
                 * NOT the company OceanCrest portal URL.
                 */
                chrome.storage.local.set({
                    appUrl: url
                });


                statusMessage.textContent =
                    "Loading containers...";


                loadBtn.disabled =
                    true;


                try {

                    const response =
                        await fetch(url);


                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error("HTTP 404: Apps Script Web App deployment is unavailable");
                        }
                        throw new Error(
                            `HTTP ${response.status}`
                        );
                    }


                    const data =
                        await response.json();


                    if (
                        data.success === false ||
                        data.error
                    ) {

                        throw new Error(
                            data.error ||
                            "Apps Script returned an error"
                        );
                    }


                    loadedData =
                        Array.isArray(
                            data.containers
                        )
                            ? data.containers
                            : [];


                    els.total.textContent =
                        loadedData.length;

                    els.processed.textContent =
                        "0";

                    els.remaining.textContent =
                        loadedData.length;


                    statusMessage.textContent =
                        `Loaded ${loadedData.length} records successfully.`;


                    startBtn.disabled =
                        loadedData.length === 0;


                } catch (error) {

                    statusMessage.textContent =
                        `Error loading: ${error.message}`;

                } finally {

                    loadBtn.disabled =
                        false;
                }
            }
        );


        /* =================================================
           RECEIVE STATUS
        ================================================= */

        chrome.runtime.onMessage.addListener(
            message => {

                if (
                    message.type !==
                    "UPDATE_STATUS"
                ) {

                    return;
                }


                const payload =
                    message.payload || {};


                const stats =
                    payload.stats || {};


                els.processed.textContent =
                    stats.processed || 0;


                const total =
                    parseInt(
                        els.total.textContent,
                        10
                    ) || 0;


                els.remaining.textContent =
                    Math.max(
                        0,
                        total -
                        (stats.processed || 0)
                    );


                els.match.textContent =
                    stats.match || 0;


                els.mismatch.textContent =
                    stats.mismatch || 0;


                els.notFound.textContent =
                    stats.notFound || 0;


                els.error.textContent =
                    stats.error || 0;


                els.uploadFailed.textContent =
                    stats.uploadFailed || 0;


                const progress =
                    total === 0
                        ? 0
                        :
                        (
                            stats.processed /
                            total
                        ) *
                        100;


                els.progressBar.style.width =
                    `${progress}%`;


                if (
                    payload.currentContainer
                ) {

                    statusMessage.textContent =
                        `Processing: ${payload.currentContainer} (${payload.status || ""})`;
                }


                if (
                    payload.isFinished
                ) {

                    finishValidation(
                        payload.status ||
                        "Validation completed."
                    );
                }
            }
        );


        /* =================================================
           START
        ================================================= */

        startBtn.addEventListener(
            "click",
            () => {

                if (
                    !loadedData.length
                ) {

                    return;
                }


                startBtn.disabled =
                    true;

                stopBtn.disabled =
                    false;

                loadBtn.disabled =
                    true;

                appUrlInput.disabled =
                    true;


                els.processed.textContent =
                    "0";

                els.remaining.textContent =
                    loadedData.length;

                els.match.textContent =
                    "0";

                els.mismatch.textContent =
                    "0";

                els.notFound.textContent =
                    "0";

                els.error.textContent =
                    "0";

                els.uploadFailed.textContent =
                    "0";

                els.progressBar.style.width =
                    "0%";


                statusMessage.textContent =
                    "Starting validation...";


                chrome.runtime.sendMessage({

                    type:
                        "START_VALIDATION",

                    payload: {

                        data:
                            loadedData,

                        appUrl:
                            appUrlInput.value.trim()
                    }

                });
            }
        );


        /* =================================================
           STOP
        ================================================= */

        stopBtn.addEventListener(
            "click",
            () => {

                chrome.runtime.sendMessage({

                    type:
                        "STOP_VALIDATION"

                });


                finishValidation(
                    "Stopped by user"
                );
            }
        );


        function finishValidation(
            message
        ) {

            startBtn.disabled =
                loadedData.length === 0;

            stopBtn.disabled =
                true;

            loadBtn.disabled =
                false;

            appUrlInput.disabled =
                false;


            statusMessage.textContent =
                message;
        }
    }
);