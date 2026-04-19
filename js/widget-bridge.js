/**
 * widget-bridge.js
 * Bridge between Beerdex JS and the native Android home screen widget.
 * Pushes BAC status, time-to-sober, and monthly tasting count
 * to SharedPreferences via capacitor-widget-bridge, which the
 * native AppWidgetProvider reads to render the widget.
 */

import * as BAC from './bac.js';
import * as Storage from './storage.js';

const WIDGET_GROUP = 'beerdex_widget';

/**
 * Pushes current BAC state + monthly stats to the native Android widget
 * via SharedPreferences bridge.
 * 
 * Call this after any BAC-affecting action (drink add/remove, manual BAC,
 * app startup, home view render).
 * 
 * No-op on web/non-native platforms.
 */
export async function updateWidgetData() {
    // Gate: only run on native Capacitor platform
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

    // Gate: user must have the widget feature enabled
    if (!Storage.getPreference('bac_enabled', true)) return;
    if (!Storage.getPreference('bac_widget_enabled', true)) return;

    try {
        const WidgetBridgePlugin = window.Capacitor.Plugins.WidgetBridgePlugin;
        if (!WidgetBridgePlugin) {
            console.warn('[WidgetBridge] Plugin not found');
            return;
        }

        // --- 1. BAC Simulation ---
        const sim = BAC.simulateBAC();
        const bacStatus = BAC.getBACStatus(sim);
        const bacValue = sim.currentBAC.toFixed(2);
        const hoursToDrive = BAC.getHoursToDrive(sim);
        const hoursToZero = BAC.getHoursToZero(sim);

        // --- 2. Monthly Tasting Count ---
        const allData = Storage.getAllUserData();
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        let monthlyCount = 0;

        Object.values(allData).forEach(entry => {
            if (entry.history) {
                entry.history.forEach(h => {
                    const d = new Date(h.date);
                    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
                        monthlyCount++;
                    }
                });
            }
        });

        // --- 3. Format Time Strings ---
        const formatTime = (hours) => {
            if (hours <= 0) return '✅';
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, '0')}`;
            if (h > 0) return `${h}h`;
            return `${m}min`;
        };

        // --- 4. Draw Mini-Graph for Widget ---
        const drawMiniChart = () => {
            const curve = BAC.getBACCurveData();
            if (!curve || curve.length < 2) return '';
            
            const canvas = document.createElement('canvas');
            const width = 800; // high res
            const height = 300;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Note: Transparent background to match widget styling natively.
            ctx.clearRect(0, 0, width, height);
            
            const tMin = curve[0].time;
            const tMax = curve[curve.length - 1].time;
            const tRange = tMax - tMin || 1;
            
            const rules = BAC.getCurrentRules() || { withdrawThreshold: 0.8 };
            const bacMax = Math.max(rules.withdrawThreshold, ...curve.map(d => d.bac)) * 1.1;
            
            // Limit line
            if (rules.sanctionThreshold > 0) {
                const yLimit = height - (rules.sanctionThreshold / bacMax) * height;
                ctx.beginPath();
                ctx.strokeStyle = '#FF9800';
                ctx.lineWidth = 4;
                ctx.setLineDash([10, 10]);
                ctx.moveTo(0, yLimit);
                ctx.lineTo(width, yLimit);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            // Fill
            ctx.beginPath();
            ctx.moveTo(0, height);
            curve.forEach((pt) => {
                const x = ((pt.time - tMin) / tRange) * width;
                const y = height - ((pt.bac / bacMax) * height);
                ctx.lineTo(x, y);
            });
            ctx.lineTo(width, height);
            ctx.closePath();
            ctx.fillStyle = `${bacStatus.color}44`; 
            ctx.fill();
            
            // Stroke
            ctx.beginPath();
            curve.forEach((pt, i) => {
                const x = ((pt.time - tMin) / tRange) * width;
                const y = height - ((pt.bac / bacMax) * height);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = bacStatus.color;
            ctx.lineWidth = 8;
            ctx.stroke();
            
            // Current Time Marker
            const nowTime = Math.max(tMin, Math.min(tMax, new Date().getTime()));
            const nowX = ((nowTime - tMin) / tRange) * width;
            ctx.beginPath();
            ctx.moveTo(nowX, 0);
            ctx.lineTo(nowX, height);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 8]);
            ctx.stroke();
            
            // Current Point Dot
            const currentBacPt = curve.find(p => p.time >= nowTime) || curve[0];
            const ptY = height - ((currentBacPt.bac / bacMax) * height);
            ctx.beginPath();
            ctx.arc(nowX, ptY, 16, 0, 2 * Math.PI);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = bacStatus.color;
            ctx.lineWidth = 6;
            ctx.stroke();
            
            return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        };

        const chartBase64 = drawMiniChart();

        // --- 5. Write to SharedPreferences via bridge ---
        const items = {
            bac_value: bacValue,
            bac_level: bacStatus.level,
            bac_color: bacStatus.color,
            bac_title: bacStatus.title,
            bac_message: bacStatus.message,
            bac_chart_base64: chartBase64,
            time_to_drive: formatTime(hoursToDrive),
            time_to_zero: formatTime(hoursToZero),
            monthly_count: String(monthlyCount),
            last_update: now.toISOString()
        };

        for (const [key, value] of Object.entries(items)) {
            await WidgetBridgePlugin.setItem({ key, value, group: WIDGET_GROUP });
        }

        // --- 6. Explicitly Register & Trigger native widget refresh ---
        // We register both possible package names (online/offline) to cover all app variants.
        await WidgetBridgePlugin.setRegisteredWidgets({ 
            widgets: [
                "be.beerdex.app.offline.BeerdexWidgetProvider",
                "be.beerdex.app.online.BeerdexWidgetProvider"
            ] 
        });
        await WidgetBridgePlugin.reloadAllTimelines();

    } catch (e) {
        // Fail silently — widget is a nice-to-have, not critical
        console.warn('[WidgetBridge] Update failed:', e);
    }
}
