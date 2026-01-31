/**
 * Scanner Module for Beerdex
 * Wraps Html5Qrcode library for easy integration.
 */

// We assume Html5Qrcode is loaded globally via script tag in index.html
const Html5Qrcode = window.Html5Qrcode;

import { Feedback } from './feedback.js';

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
        // Ensure clean slate
        await stopScanner();

        html5QrCode = new Html5Qrcode(elementId);

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        // Prefer back camera
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
            // Use the last camera (usually back camera on mobile)
            const cameraId = cameras[cameras.length - 1].id;

            await html5QrCode.start(
                { facingMode: "environment" }, // Prefer environment facing
                config,
                (decodedText, decodedResult) => {
                    console.log("[Scanner] Code detected:", decodedText);
                    // Prevent multiple triggers
                    if (html5QrCode.isProcessing) return;

                    html5QrCode.isProcessing = true;
                    // Pause immediately
                    html5QrCode.pause();

                    // Feedback
                    Feedback.playSuccess();
                    Feedback.impactLight();

                    // Process
                    Promise.resolve(onScanSuccess(decodedText, decodedResult))
                        .then((shouldStop) => {
                            if (shouldStop) {
                                stopScanner();
                            } else {
                                html5QrCode.isProcessing = false;
                                html5QrCode.resume();
                            }
                        })
                        .catch(err => {
                            console.error("Scanner callback error:", err);
                            html5QrCode.isProcessing = false;
                            html5QrCode.resume();
                        });
                },
                (errorMessage) => {
                    // Ignore parse errors, they are noisy
                }
            );
        } else {
            console.error("No cameras found.");
            alert("Aucune caméra trouvée.");
        }

    } catch (err) {
        console.error("Error starting scanner:", err);
        // Don't alert if it's just a restart race condition, but log it
        if (!err.toString().includes("already scanning")) {
            alert("Erreur démarrage caméra: " + err);
        }
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
            console.warn("Failed to stop scanner (might be already stopped):", err);
        } finally {
            html5QrCode = null;
        }
    }
}
