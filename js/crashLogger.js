/**
 * crashLogger.js — Silent error interception & device diagnostics.
 * 
 * Listens to window.onerror and unhandledrejection.
 * Stores the last 50 errors in localStorage under 'beerdex_crash_logs'.
 * Provides device info + report generation for user bug reports.
 */

const STORAGE_KEY = 'beerdex_crash_logs';
const MAX_LOGS = 50;

let _logs = [];

// ============================== //
// Init: Load existing logs       //
// ============================== //

function _loadLogs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        _logs = raw ? JSON.parse(raw) : [];
    } catch {
        _logs = [];
    }
}

function _saveLogs() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_logs));
    } catch (e) {
        // Storage full — silently fail
        console.warn('[CrashLogger] Could not save logs:', e);
    }
}

// ============================== //
// Log an error                   //
// ============================== //

function _addLog(entry) {
    _logs.push(entry);
    // Keep only last MAX_LOGS
    if (_logs.length > MAX_LOGS) {
        _logs = _logs.slice(-MAX_LOGS);
    }
    _saveLogs();
}

// ============================== //
// Global error interception      //
// ============================== //

function _setupListeners() {
    // Standard JS errors
    window.addEventListener('error', (event) => {
        _addLog({
            type: 'error',
            message: event.message || 'Unknown error',
            source: event.filename || '',
            line: event.lineno || 0,
            col: event.colno || 0,
            stack: event.error?.stack?.substring(0, 500) || '',
            timestamp: new Date().toISOString()
        });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        _addLog({
            type: 'promise_rejection',
            message: reason?.message || String(reason) || 'Unhandled Promise Rejection',
            stack: reason?.stack?.substring(0, 500) || '',
            timestamp: new Date().toISOString()
        });
    });

    // Console.error interception (non-destructive)
    const _origConsoleError = console.error;
    console.error = function (...args) {
        _addLog({
            type: 'console.error',
            message: args.map(a => {
                try { return typeof a === 'object' ? JSON.stringify(a).substring(0, 300) : String(a); }
                catch { return String(a); }
            }).join(' '),
            timestamp: new Date().toISOString()
        });
        _origConsoleError.apply(console, args);
    };
}

// ============================== //
// Device Info                    //
// ============================== //

export function getDeviceInfo() {
    const nav = navigator;
    const screen = window.screen;

    return {
        userAgent: nav.userAgent || 'N/A',
        platform: nav.platform || 'N/A',
        language: nav.language || 'N/A',
        cookiesEnabled: nav.cookieEnabled,
        online: nav.onLine,
        hardwareConcurrency: nav.hardwareConcurrency || 'N/A',
        deviceMemory: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A',
        screenResolution: `${screen.width}x${screen.height}`,
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: window.devicePixelRatio || 1,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        capacitor: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
        storageUsed: _getStorageUsed(),
        appVersion: document.querySelector('meta[name="version"]')?.content || 'N/A',
        timestamp: new Date().toISOString()
    };
}

function _getStorageUsed() {
    try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            total += (localStorage.getItem(key) || '').length;
        }
        return `${(total / 1024).toFixed(1)} KB`;
    } catch {
        return 'N/A';
    }
}

// ============================== //
// Public API                     //
// ============================== //

export function getLogs() {
    return [..._logs];
}

export function clearLogs() {
    _logs = [];
    _saveLogs();
}

/**
 * Generate a full debug report as a formatted string.
 */
export function generateReport() {
    const device = getDeviceInfo();
    const logs = getLogs();

    let report = `═══════════════════════════════\n`;
    report += `  BEERDEX — Rapport de Debug\n`;
    report += `  ${new Date().toLocaleString()}\n`;
    report += `═══════════════════════════════\n\n`;

    report += `📱 APPAREIL\n`;
    report += `───────────────────────────────\n`;
    report += `User-Agent: ${device.userAgent}\n`;
    report += `Plateforme: ${device.platform}\n`;
    report += `Langue: ${device.language}\n`;
    report += `Écran: ${device.screenResolution} (${device.pixelRatio}x)\n`;
    report += `Fenêtre: ${device.windowSize}\n`;
    report += `RAM: ${device.deviceMemory}\n`;
    report += `CPU Cores: ${device.hardwareConcurrency}\n`;
    report += `Standalone: ${device.standalone ? 'Oui' : 'Non'}\n`;
    report += `Capacitor: ${device.capacitor ? 'Oui' : 'Non'}\n`;
    report += `Online: ${device.online ? 'Oui' : 'Non'}\n`;
    report += `Storage: ${device.storageUsed}\n`;
    report += `Version: ${device.appVersion}\n\n`;

    report += `🐛 ERREURS (${logs.length} dernières)\n`;
    report += `───────────────────────────────\n`;

    if (logs.length === 0) {
        report += `Aucune erreur enregistrée. 🎉\n`;
    } else {
        logs.slice(-10).reverse().forEach((log, i) => {
            report += `\n[${i + 1}] ${log.type} — ${log.timestamp}\n`;
            report += `    ${log.message}\n`;
            if (log.source) report += `    Source: ${log.source}:${log.line}:${log.col}\n`;
            if (log.stack) report += `    Stack: ${log.stack.split('\n')[0]}\n`;
        });
    }

    report += `\n═══════════════════════════════\n`;
    return report;
}

/**
 * Generate a mailto: link pre-filled with the debug report.
 */
export function getMailtoLink(email = 'noah@beerdex.be') {
    const report = generateReport();
    const subject = encodeURIComponent(`[Beerdex Bug] Rapport de debug — ${new Date().toLocaleDateString()}`);
    const body = encodeURIComponent(report);
    return `mailto:${email}?subject=${subject}&body=${body}`;
}

// ============================== //
// Init                           //
// ============================== //

export function init() {
    _loadLogs();
    _setupListeners();
    // Log app start
    _addLog({
        type: 'info',
        message: `App started — ${new Date().toLocaleString()}`,
        timestamp: new Date().toISOString()
    });
}
