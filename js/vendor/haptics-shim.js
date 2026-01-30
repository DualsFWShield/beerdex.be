/* js/vendor/haptics-shim.js */
/* 
   Shim for Haptics to allow running in browser/webview 
   without external dependencies. Uses standard navigator.vibrate API.
*/

export const ImpactStyle = {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY'
};

export const NotificationType = {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR'
};

export class Haptics {
    static async impact(options) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            // Mapping styles to duration (ms)
            const duration = options?.style === 'HEAVY' ? 20 : 10;
            navigator.vibrate(duration);
        }
    }

    static async notification(options) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            const type = options?.type;
            if (type === 'SUCCESS') {
                // Short-Long-Short
                navigator.vibrate([10, 30, 10]);
            } else if (type === 'ERROR') {
                // Long-Short-Long-Short-Long
                navigator.vibrate([30, 20, 30, 20, 50]);
            } else {
                navigator.vibrate([20, 20]); // Warning
            }
        }
    }

    static async vibrate(options) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(options?.duration || 300);
        }
    }

    // Dummy methods for selection (not supported by Web Vibrate API easily)
    static async selectionStart() { }
    static async selectionChanged() { }
    static async selectionEnd() { }
}
