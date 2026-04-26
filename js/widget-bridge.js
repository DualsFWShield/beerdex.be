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
 * 
 * Always active: the widget works autonomously even if the BAC calculator
 * is disabled in the app (uses default values: 70kg, M, BE).
 */
let isUpdating = false;
let updatePending = false;

export async function updateWidgetData() {
    // Gate: only run on native Capacitor platform
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

    // Concurrency control: prevent overlapping updates
    if (isUpdating) {
        updatePending = true;
        return;
    }

    isUpdating = true;

    try {
        const WidgetBridgePlugin = window.Capacitor.Plugins.WidgetBridgePlugin;
        if (!WidgetBridgePlugin) {
            console.warn('[WidgetBridge] Plugin not found');
            isUpdating = false;
            return;
        }

        // --- Check if BAC is enabled ---
        const bacEnabled = Storage.getPreference('bac_enabled', true);

        let bacValue = '0.00';
        let bacColor = '#4CAF50';
        let bacTitle = '';
        let bacMessage = '';
        let timeToDriveStr = '✅';
        let timeToZeroStr = '✅';
        let chartBase64 = '';

        if (bacEnabled) {
            // --- 1. BAC Simulation (full mode) ---
            const sim = BAC.simulateBAC();
            const bacStatus = BAC.getBACStatus(sim);
            bacValue = sim.currentBAC.toFixed(2);
            bacColor = bacStatus.color;
            bacTitle = bacStatus.title;
            bacMessage = bacStatus.message;

            const hoursToDrive = BAC.getHoursToDrive(sim);
            const hoursToZero = BAC.getHoursToZero(sim);
            timeToDriveStr = formatTime(hoursToDrive);
            timeToZeroStr = formatTime(hoursToZero);

            // --- 2. Draw Mini-Graph ---
            chartBase64 = drawMiniChart(bacStatus);
        }
        // If BAC is disabled, we send defaults (0.00, green, no chart) — widget still shows monthly count

        // --- 3. Monthly Tasting Count (always computed, independent of BAC) ---
        const allData = Storage.getAllUserData();
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        let monthlyCount = 0;

        for (const entry of Object.values(allData)) {
            if (entry.history) {
                for (const h of entry.history) {
                    const d = new Date(h.date);
                    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
                        monthlyCount++;
                    }
                }
            }
        }

        // --- 4. Vehicle emoji for widget ---
        const vehicle = Storage.getPreference('bac_vehicle', 'voiture');
        let vehicleEmoji = '🚗';
        if (vehicle === 'moto') vehicleEmoji = '🏍️';
        else if (vehicle === 'velo') vehicleEmoji = '🚲';
        else if (vehicle === 'pieton' || vehicle === 'pedestrian') vehicleEmoji = '🚶';
        else if (vehicle === 'ne_conduit_pas' || vehicle === 'none') vehicleEmoji = '🚶';

        // --- 5. Batch status items into a single JSON ---
        const statusData = JSON.stringify({
            bac_value: bacValue,
            bac_color: bacColor,
            bac_title: bacTitle,
            bac_message: bacMessage,
            time_to_drive: timeToDriveStr,
            time_to_zero: timeToZeroStr,
            monthly_count: String(monthlyCount),
            vehicle_emoji: vehicleEmoji,
            last_update: now.toISOString()
        });

        // Atomic write: 2 calls instead of 10
        await WidgetBridgePlugin.setItem({ key: 'widget_data_json', value: statusData, group: WIDGET_GROUP });
        if (chartBase64) {
            await WidgetBridgePlugin.setItem({ key: 'bac_chart_base64', value: chartBase64, group: WIDGET_GROUP });
        }

        // --- 6. Explicitly Register & Trigger native widget refresh ---
        await WidgetBridgePlugin.setRegisteredWidgets({ 
            widgets: [
                "be.beerdex.app.offline.BeerdexWidgetProvider",
                "be.beerdex.app.online.BeerdexWidgetProvider"
            ] 
        });
        await WidgetBridgePlugin.reloadAllTimelines();

    } catch (e) {
        console.warn('[WidgetBridge] Update failed:', e);
    } finally {
        isUpdating = false;
        // If an update was requested during the process, run it once now
        if (updatePending) {
            updatePending = false;
            setTimeout(updateWidgetData, 300); // 300ms debounce
        }
    }
}

// --- Helper Functions ---

function formatTime(hours) {
    if (hours <= 0) return '✅';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, '0')}`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
}

function drawMiniChart(bacStatus) {
    const curve = BAC.getBACCurveData();
    if (!curve || curve.length < 2) return '';
    
    const canvas = document.createElement('canvas');
    const width = 300; 
    const height = 120;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
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
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
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
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Current Time Marker
    const nowTime = Math.max(tMin, Math.min(tMax, new Date().getTime()));
    const nowX = ((nowTime - tMin) / tRange) * width;
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, height);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    
    // Current Point Dot
    const currentBacPt = curve.find(p => p.time >= nowTime) || curve[0];
    const ptY = height - ((currentBacPt.bac / bacMax) * height);
    ctx.beginPath();
    ctx.arc(nowX, ptY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = bacStatus.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}
