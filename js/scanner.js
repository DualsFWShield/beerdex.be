/**
 * Scanner Module for Beerdex
 * Wraps Html5Qrcode library for easy integration.
 */

// We assume Html5Qrcode is loaded globally via script tag in index.html
const Html5Qrcode = window.Html5Qrcode;

let html5QrCode;

/**
 * Starts the barcode scanner.
 * @param {string} elementId - The ID of the HTML element to mount the scanner.
 * @param {function} onScanSuccess - Callback when a code is scanned (decodedText, decodedResult).
 * @param {function} onScanFailure - Callback on scan error (optional).
 */
export async function startScanner(elementId, onScanSuccess, onScanFailure) {
    if (!Html5Qrcode) {
        console.error("Html5Qrcode library not loaded.");
        return;
    }

    try {
        // If instance exists, clear it first
        if (html5QrCode) {
            await stopScanner();
        }

        html5QrCode = new Html5Qrcode(elementId);

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        // Prefer back camera
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
            // Use the last camera (usually back camera on mobile) or specific logic
            const cameraId = cameras[cameras.length - 1].id;

            await html5QrCode.start(
                { facingMode: "environment" }, // Prefer environment facing
                config,
                (decodedText, decodedResult) => {
                    console.log("[Scanner] Code detected:", decodedText);
                    // Prevent multiple triggers if already processing
                    if (html5QrCode.isProcessing) {
                        console.log("[Scanner] Ignored - already processing");
                        return;
                    }
                    html5QrCode.isProcessing = true;
                    console.log("[Scanner] Processing...");

                    // Pause on success to prevent multiple triggers while processing
                    html5QrCode.pause();

                    // Allow callback to determine if we should stop (valid) or resume (invalid)
                    Promise.resolve(onScanSuccess(decodedText, decodedResult)).then((shouldStop) => {
                        if (shouldStop) {
                            console.log("[Scanner] Callback requested stop.");
                            stopScanner();
                        } else {
                            console.log("[Scanner] Callback requested resume.");
                            html5QrCode.isProcessing = false;
                            html5QrCode.resume();
                        }
                    }).catch(err => {
                        console.error("Scanner callback error:", err);
                        html5QrCode.isProcessing = false;
                        html5QrCode.resume(); // Resume on error?
                    });
                },
                (errorMessage) => {
                    // parse error, ignore mostly
                    if (onScanFailure) onScanFailure(errorMessage);
                }
            );
        } else {
            console.error("No cameras found.");
            alert("Aucune caméra trouvée.");
        }

    } catch (err) {
        console.error("Error starting scanner:", err);
        alert("Erreur démarrage caméra: " + err);
    }
}

/**
 * Stops the scanner and clears the UI element.
 */
export async function stopScanner() {
    if (html5QrCode) {
        try {
            if (html5QrCode.isScanning) {
                await html5QrCode.stop();
            }
            html5QrCode.clear();
        } catch (err) {
            console.error("Failed to stop scanner", err);
        } finally {
            html5QrCode = null;
            console.log("[Scanner] Instance cleared.");
        }
    }
}
