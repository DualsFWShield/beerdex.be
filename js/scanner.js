/**
 * Scanner Module for Beerdex
 * Wraps Html5Qrcode library for easy integration.
 */

// We assume Html5Qrcode is loaded globally via script tag in index.html
const Html5Qrcode = window.Html5Qrcode;

let html5QrCode;
let activeTrack = null;

/**
 * Get list of video input devices
 */
export async function getCameras() {
    if (!Html5Qrcode) return [];
    try {
        return await Html5Qrcode.getCameras();
    } catch (e) {
        console.error("Error getting cameras", e);
        return [];
    }
}

/**
 * Starts the barcode scanner.
 * @param {string} elementId - The ID of the HTML element to mount the scanner.
 * @param {function} onScanSuccess - Callback when a code is scanned (decodedText, decodedResult).
 * @param {function} onScanFailure - Callback on scan error (optional).
 * @param {string} cameraId - Optional specific camera ID to use
 * @returns {Promise<Object>} - Returns capabilities (zoom, etc)
 */
export async function startScanner(elementId, onScanSuccess, onScanFailure, cameraId = null) {
    if (!Html5Qrcode) {
        console.error("Html5Qrcode library not loaded.");
        return;
    }

    try {
        // If instance exists, clear it first
        if (html5QrCode) {
            await stopScanner();
        }

        // Initialize with Experimental Features (Native Barcode Detector)
        html5QrCode = new Html5Qrcode(elementId, {
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        });

        const config = {
            fps: 10,
            // qrbox: { width: 250, height: 250 }, // Commented out to scan full frame for better performance
            aspectRatio: 1.0,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ],
            videoConstraints: {
                focusMode: 'continuous',
                advanced: [{ focusMode: 'continuous' }] // Try to force continuous focus
            }
        };

        // Camera Logic
        let selectedCameraId = cameraId;

        // If no ID provided, we let Html5Qrcode use facingMode: environment
        // preventing manual guess work that might pick front camera
        // Define Callback inline to ensure it exists
        const onScan = (decodedText, decodedResult) => {
            // Prevent multiple triggers
            if (html5QrCode.isProcessing) return;
            html5QrCode.isProcessing = true;
            html5QrCode.pause();

            Promise.resolve(onScanSuccess(decodedText, decodedResult)).then((shouldStop) => {
                if (shouldStop) {
                    stopScanner();
                } else {
                    html5QrCode.isProcessing = false;
                    html5QrCode.resume();
                }
            }).catch(err => {
                console.error("Scanner callback error:", err);
                html5QrCode.isProcessing = false;
                html5QrCode.resume();
            });
        };

        const onError = (errorMessage) => {
            if (onScanFailure) onScanFailure(errorMessage);
        };

        // Camera Logic
        // If no ID provided, we let Html5Qrcode use facingMode: environment
        if (selectedCameraId) {
            await html5QrCode.start(selectedCameraId, config, onScan, onError);
        } else {
            await html5QrCode.start({ facingMode: "environment" }, config, onScan, onError);
        }

        // Capture Active Track for Constraints (Zoom/Focus)
        // HTML5Qrcode doesn't expose the stream directly easily, but we can hack it or use native query
        // Actually, html5QrCode.getRunningTrackCapabilities() exists? No.
        // We have to find the video element and get the stream
        const videoElement = document.querySelector(`#${elementId} video`);
        if (videoElement && videoElement.srcObject) {
            const track = videoElement.srcObject.getVideoTracks()[0];
            activeTrack = track;

            // Return capabilities to UI
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            const settings = track.getSettings ? track.getSettings() : {};
            return { capabilities, settings, activeId: selectedCameraId };
        }

        return { activeId: selectedCameraId };

    } catch (err) {
        console.error("Error starting scanner:", err);
        // alert("Erreur démarrage caméra: " + err); // Silent fail preferred in UI loop
        throw err;
    }
}

/**
 * Apply constraints (Zoom, Focus)
 * @param {Object} constraints - e.g. { zoom: 2.0 } or { advanced: [{focusMode: "manual", focusDistance: 1.0}] }
 */
export async function applyConstraints(constraints) {
    if (!activeTrack) return;
    try {
        await activeTrack.applyConstraints(constraints);
    } catch (e) {
        console.warn("Constraint application failed", e);
    }
}

/**
 * Trigger Autofocus attempt
 */
export async function triggerFocus() {
    if (!activeTrack) return;
    try {
        // Try resetting focus mode
        await activeTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) {
        // console.warn("Focus trigger failed");
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
            activeTrack = null;
        }
    }
}
