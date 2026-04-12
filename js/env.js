/**
 * env.js
 * Environment and App Edition detection for Beerdex.
 */

export const EDITIONS = {
    WEBSITE: 'website',
    MAIN_OTA: 'main_ota',
    PREVIEW_OFFLINE: 'preview_offline'
};

/**
 * Detect current app edition
 * @returns {Promise<string>}
 */
export async function getEdition() {
    // 1. Check for Capacitor
    if (window.Capacitor) {
        try {
            // Differentiation by appId
            // be.beerdex.app.online -> Main OTA
            // be.beerdex.app.offline -> Preview
            // co.median.android.yeenpjz -> Play Store (Main/Production)
            
            // Note: Capacitor.getAppConfig() is not a standard call, 
            // but we can check the URL or use a global window variable injected if needed.
            // For now, we'll use the URL approach or the presence of 'beerdex' in the scheme.
            
            const url = window.location.href;
            if (url.includes('beerdex.app.offline') || url.includes('/offline/')) {
                return EDITIONS.PREVIEW_OFFLINE;
            }
            
            // Default native is Main OTA
            return EDITIONS.MAIN_OTA;
        } catch (e) {
            return EDITIONS.MAIN_OTA;
        }
    }
    
    // Default is Website
    return EDITIONS.WEBSITE;
}

/**
 * Check if the current edition is the offline preview.
 */
export async function isOfflinePreview() {
    const edition = await getEdition();
    return edition === EDITIONS.PREVIEW_OFFLINE;
}

/**
 * Check if user is currently online.
 */
export function isOnline() {
    return navigator.onLine;
}
