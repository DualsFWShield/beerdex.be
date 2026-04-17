import { i18n } from './i18n.js';

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

        let formatsToSupport = [];
        try {
            const F = window.Html5QrcodeSupportedFormats || {};
            formatsToSupport = [
                F.EAN_13 || 6,
                F.EAN_8 || 7,
                F.CODE_128 || 1,
                F.UPC_A || 11,
                F.UPC_E || 12,
                F.QR_CODE || 0
            ];
        } catch (e) {
            console.warn("Could not load barcode formats, using defaults.");
        }

        html5QrCode = new Html5Qrcode(elementId, { formatsToSupport });

        const config = { 
            fps: 20, 
            aspectRatio: 1.0,
            disableFlip: false, // Aide pour certaines orientations
            showTorchButtonIfSupported: true,
            showTorchButtonIfSupported: true,
            useBarCodeDetectorIfSupported: true,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        // Prefer back camera
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
            // Use the last camera (usually back camera on mobile) or specific logic
            const cameraId = cameras[cameras.length - 1].id;

            await html5QrCode.start(
                cameraId, 
                config,
                (decodedText, decodedResult) => {
                    // Update feedback immediately
                    if (window.UI && window.UI.setScannerFeedback) {
                         window.UI.setScannerFeedback("⚡ Code détecté !", false);
                    }
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

                    Promise.resolve(onScanSuccess(decodedText, decodedResult)).then((shouldStop) => {
                        if (shouldStop) {
                            console.log("[Scanner] Callback requested stop.");
                            stopScanner();
                        } else {
                            console.log("[Scanner] Callback requested resume. Waiting 5s...");
                            if (window.UI && window.UI.setScannerFeedback) {
                                window.UI.setScannerFeedback("📍 Scan terminé (Pause 5s...)", false);
                            }
                            
                            setTimeout(() => {
                                if (html5QrCode && !html5QrCode.isScanning) {
                                    console.log("[Scanner] Resuming after delay.");
                                    html5QrCode.isProcessing = false;
                                    html5QrCode.resume();
                                    if (window.UI && window.UI.setScannerFeedback) {
                                        window.UI.setScannerFeedback("🔍 Scan prêt", false);
                                    }
                                }
                            }, 5000);
                        }
                    }).catch(err => {
                        console.error("Scanner callback error:", err);
                        html5QrCode.isProcessing = false;
                        html5QrCode.resume(); // Resume on error
                    });
                },
                (errorMessage) => {
                    // parse error, ignore mostly
                    if (onScanFailure) onScanFailure(errorMessage);
                }
            );
        } else {
            console.error("No cameras found.");
            if (window.UI && window.UI.showAlertModal) window.UI.showAlertModal(i18n.t('error_no_camera'), { icon: '📷' });
            else console.error("Aucune caméra trouvée.");
        }

    } catch (err) {
        console.error("Error starting scanner:", err);
        if (window.UI && window.UI.showAlertModal) window.UI.showAlertModal(i18n.t('error_camera_start', { err }), { icon: '⚠️' });
        else console.error("Erreur démarrage caméra: " + err);
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
            if (html5QrCode) {
                html5QrCode.clear();
            }
        } catch (err) {
            console.error("Failed to stop scanner", err);
        } finally {
            html5QrCode = null;
            console.log("[Scanner] Instance cleared.");
        }
    }
}
