import * as Storage from './storage.js';

// --- BAC (Blood Alcohol Content) Calculator ---
// Uses the Widmark formula: 
// BAC = (Alcohol consumed in grams) / (Body weight in grams * r)
// r = 0.68 for men, 0.55 for women
// Elimination rate = ~0.15 g/L per hour

import { i18n } from './i18n.js';

const MEN_R = 0.68;
const WOMEN_R = 0.55;
const AVERAGE_R = 0.615; // Average for "prefer not to say"
const ELIMINATION_RATE = 0.15; // g/l per hour

// Belgian 2026 legal thresholds & International limits
export let BAC_RULES = {};
try {
    const res = await fetch('data/bac_rules.json');
    BAC_RULES = await res.json();
} catch (e) {
    console.error("Failed to load BAC rules", e);
    // Safe Fallback
    BAC_RULES = {
        "BE": {
            "nameKey": "country_be", "sanctionThreshold": 0.5, "withdrawThreshold": 0.8,
            "airRatio": 0.44, "sanctionKey": "bac_be_sanction", "withdrawKey": "bac_be_withdraw"
        }
    };
}

export function getCurrentRules() {
    const defaultCountry = 'BE';
    const country = Storage.getPreference('bac_country', defaultCountry);
    return BAC_RULES[country] || BAC_RULES[defaultCountry];
}

/**
 * Parses volume string (e.g. "33cl", "330 ml", "33") to ml
 */
function parseVolumeToMl(volStr) {
    if (!volStr) return 0;
    if (typeof volStr === 'number') return volStr;
    const str = String(volStr).toLowerCase().replace(',', '.');
    const match = str.match(/([0-9.]+)/);
    if (!match) return 0;
    let val = parseFloat(match[1]);

    // Explicit cases based on standard user patterns
    if (str.includes('ml')) {
        return val;
    } else if (str.includes('cl')) {
        return val * 10;
    } else if (str.includes('l')) {
        return val * 1000;
    }

    // Fallbacks if no unit is given
    if (val > 0 && val < 5) return val * 1000;      // e.g. "0.33", "0.5" -> Liters
    if (val >= 5 && val < 100) return val * 10;     // e.g. "25", "33", "50" -> Centiliters
    return val; // Assume ML if > 100
}

/**
 * Parses ABV string (e.g. "8.5%", "8,5°", "8.5") to float
 */
function parseAbv(abvStr) {
    if (!abvStr) return 0;
    if (typeof abvStr === 'number') return abvStr;
    const str = String(abvStr).replace(',', '.');
    const match = str.match(/([0-9.]+)/);
    if (!match) return 0;
    return parseFloat(match[1]);
}

/**
 * Calculates grams of pure alcohol
 * @param {number|string} volumeMl Volume in ml (or relative string)
 * @param {number|string} abv Alcohol By Volume (percentage 0-100)
 */
export function calculateAlcoholGrams(volumeMl, abv) {
    const v = parseVolumeToMl(volumeMl);
    const a = parseAbv(abv);
    // formula: Volume (ml) * (ABV / 100) * 0.8 (density of alcohol)
    return v * (a / 100) * 0.8;
}

/**
 * Adds a drink to the BAC history
 */
export function addDrinkToBAC(volumeMl, abv) {
    if (!Storage.getPreference('bac_enabled', true)) return null;

    const vMl = parseVolumeToMl(volumeMl);
    const aPct = parseAbv(abv);

    if (vMl <= 0 || aPct <= 0) return null; // Invalid drink

    const history = Storage.getPreference('bac_history', []);

    // Clean up history older than 24 hours to save space
    const now = new Date().getTime();
    const filteredHistory = history.filter(d => (now - d.time) < 24 * 60 * 60 * 1000);

    filteredHistory.push({
        time: now,
        volume: vMl,
        abv: aPct,
        grams: calculateAlcoholGrams(vMl, aPct)
    });

    Storage.savePreference('bac_history', filteredHistory);
    return filteredHistory;
}

/**
 * Removes the most recent matching drink from the BAC history (for -1 undo)
 */
export function removeDrinkFromBAC(volumeMl, abv) {
    if (!Storage.getPreference('bac_enabled', true)) return null;

    const vMl = parseVolumeToMl(volumeMl);
    const aPct = parseAbv(abv);

    if (vMl <= 0 || aPct <= 0) return null;

    const history = Storage.getPreference('bac_history', []);

    // Find the newest matching drink
    let foundIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        // Allow a small margin of error for floating point parsed diffs
        if (Math.abs(history[i].volume - vMl) < 5 && Math.abs(history[i].abv - aPct) < 0.2) {
            foundIndex = i;
            break;
        }
    }

    if (foundIndex !== -1) {
        history.splice(foundIndex, 1);
        Storage.savePreference('bac_history', history);
    }
    return history;
}

/**
 * Gets current BAC value (g/l)
 */
export function simulateBAC(extraDrinks = []) {
    const enabled = Storage.getPreference('bac_enabled', true);
    if (!enabled) return { currentBAC: 0, curve: [] };

    const historyUnsorted = Storage.getPreference('bac_history', []);
    
    const now = new Date().getTime();
    // Filter history to last 24h just in case and strictly require numeric grams to avoid NaN poisoning
    const recentHistory = historyUnsorted.filter(d => d && !isNaN(d.grams) && (now - d.time) < 24 * 60 * 60 * 1000);
    
    // Add extra hypothetical drinks if provided (for speculative BAC)
    const allHistory = [...recentHistory];
    if (extraDrinks && extraDrinks.length > 0) {
        extraDrinks.forEach(d => allHistory.push(d));
    }

    if (allHistory.length === 0) return { currentBAC: 0, curve: [] };

    const history = [...allHistory].sort((a, b) => a.time - b.time);

    // Robust parsing for weight to prevent NaN from old saved literal string bugs
    let rawWeight = Storage.getPreference('bac_weight', 70);
    let weightKg = parseFloat(rawWeight);
    if (isNaN(weightKg) || weightKg < 20) weightKg = 70;

    const gender = Storage.getPreference('bac_gender', 'M');
    const r = gender === 'M' ? MEN_R : (gender === 'F' ? WOMEN_R : AVERAGE_R);
    const BAC_PER_GRAM = 1 / (weightKg * r);
    const ELIMINATION_PER_MIN = ELIMINATION_RATE / 60;

    // Drink duration (time to drink a beer) — spreads absorption over this period
    const drinkDurationMin = parseInt(Storage.getPreference('bac_drink_duration', 0)) || 0;
    const ABSORPTION_MINS = 45 + drinkDurationMin; // Base 45 min absorption + drinking time

    let simTime = history[0].time;

    // Dynamically extend simulation window if recovery takes longer than 24h
    // (Rate is ~0.15/h, so roughly 7 hours per 1.0 g/L)
    const estimatedHours = (history.reduce((acc, d) => acc + d.grams, 0) * BAC_PER_GRAM) / ELIMINATION_RATE;
    const durationMs = Math.max(24, Math.min(200, estimatedHours + 12)) * 60 * 60 * 1000;
    const maxEndTime = Math.max(simTime, now) + durationMs;

    let currentBac = 0;
    let curve = [];

    let absorptionQueue = [];
    let currentActualBAC = 0;

    const stepMs = 60 * 1000;
    let nextDrinkIndex = 0;

    while (simTime <= maxEndTime) {
        while (nextDrinkIndex < history.length && history[nextDrinkIndex].time <= simTime) {
            const drink = history[nextDrinkIndex];
            absorptionQueue.push({
                remainingGrams: drink.grams,
                ratePerMin: drink.grams / ABSORPTION_MINS
            });
            nextDrinkIndex++;
        }

        let absorbedGramsThisMin = 0;
        for (let i = 0; i < absorptionQueue.length; i++) {
            let chunk = absorptionQueue[i];
            if (chunk.remainingGrams > 0) {
                let toAbsorb = Math.min(chunk.ratePerMin, chunk.remainingGrams);
                absorbedGramsThisMin += toAbsorb;
                chunk.remainingGrams -= toAbsorb;
            }
        }

        currentBac += (absorbedGramsThisMin * BAC_PER_GRAM);

        if (currentBac > 0) {
            currentBac -= ELIMINATION_PER_MIN;
            if (currentBac < 0) currentBac = 0;
        }

        // Save curve every 5 minutes
        if (simTime % (5 * 60 * 1000) < stepMs) {
            curve.push({ time: simTime, bac: currentBac });
        }

        if (simTime >= now && simTime - stepMs < now) {
            currentActualBAC = currentBac;
        }

        if (simTime > now && nextDrinkIndex >= history.length && currentBac === 0 && absorptionQueue.every(q => q.remainingGrams <= 0)) {
            curve.push({ time: simTime, bac: 0 });
            break;
        }

        simTime += stepMs;
    }

    if (now < history[0].time) currentActualBAC = 0;

    return { currentBAC: currentActualBAC, curve };
}

/**
 * Gets current BAC value (g/l)
 */
export function getCurrentBAC() {
    return simulateBAC().currentBAC;
}

/**
 * Formats time from decimal hours
 */
function formatHoursToTimeStr(hoursDecimal) {
    if (hoursDecimal <= 0) return i18n.t('time_now');

    const h = Math.floor(hoursDecimal);
    const m = Math.round((hoursDecimal - h) * 60);

    if (h === 0) {
        return `${m} ${i18n.t('time_minutes')}`;
    } else if (m === 0) {
        return `${h} ${i18n.t('time_hours')}`;
    } else {
        // Fallback or simpler format for mixed h/m if needed, but let's stick to a clean version
        return `${h}h${m.toString().padStart(2, '0')}`;
    }
}

/**
 * Calculates hours to wait until BAC drops below 0.5 g/L
 */
export function getHoursToDrive(simOverride = null) {
    const sim = simOverride || simulateBAC();
    const now = new Date().getTime();
    const futurePoints = sim.curve.filter(p => p.time >= now);
    const rules = getCurrentRules();
    const limit = rules.sanctionThreshold;

    let recoveryTime = null;

    // We scan backwards to find the last point where BAC was still >= limit.
    for (let i = futurePoints.length - 1; i >= 0; i--) {
        if (futurePoints[i].bac >= limit) {
            if (i + 1 < futurePoints.length) {
                recoveryTime = futurePoints[i + 1].time;
            }
            break;
        }
    }

    if (recoveryTime) {
        return Math.max(0, (recoveryTime - now) / (1000 * 60 * 60));
    }

    // If it never went above limit in the future prediction
    if (sim.currentBAC < limit && (!futurePoints.length || futurePoints.every(p => p.bac < limit))) {
        return 0;
    }

    return Math.max(0, (sim.currentBAC - limit) / ELIMINATION_RATE);
}

/**
 * Calculates hours to wait until BAC hits 0.0 g/L
 */
export function getHoursToZero(simOverride = null) {
    const sim = simOverride || simulateBAC();
    const now = new Date().getTime();
    if (sim.currentBAC === 0 && (!sim.curve.length || sim.curve.every(p => p.time < now || p.bac === 0))) {
        return 0;
    }

    const futurePoints = sim.curve.filter(p => p.time >= now);
    let recoveryTime = null;

    // Scan backwards to find the last point with any alcohol
    for (let i = futurePoints.length - 1; i >= 0; i--) {
        if (futurePoints[i].bac > 0) {
            recoveryTime = futurePoints[i].time;
            break;
        }
    }

    if (recoveryTime) {
        return Math.max(0, (recoveryTime - now) / (1000 * 60 * 60));
    }

    // Mathematical fallback: (current_bac / elimination_rate)
    return Math.max(0, sim.currentBAC / ELIMINATION_RATE);
}

/**
 * Formatted string for when the user can drive again (e.g. "à 14h30", "demain à 07h00")
 */
/**
 * Formatted string for when the user can drive again (e.g. "à 14h30", "demain à 07h00")
 */
export function getTimeCanDriveStr() {
    const hours = getHoursToDrive();
    if (hours === 0) return "";

    const now = new Date();
    const driveTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    const hh = String(driveTime.getHours()).padStart(2, '0');
    const mm = String(driveTime.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}h${mm !== '00' ? mm : ''}`;

    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const driveStart = new Date(driveTime.getFullYear(), driveTime.getMonth(), driveTime.getDate()).getTime();
    const diffDays = Math.round((driveStart - nowStart) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return i18n.t('time_at', { time: timeStr });
    } else if (diffDays === 1) {
        return i18n.t('time_tomorrow', { time: timeStr });
    } else if (diffDays === 2) {
        return i18n.t('time_after_tomorrow', { time: timeStr });
    } else {
        const dayNames = [
            i18n.t('day_sun'), i18n.t('day_mon'), i18n.t('day_tue'), 
            i18n.t('day_wed'), i18n.t('day_thu'), i18n.t('day_fri'), i18n.t('day_sat')
        ];
        return `${dayNames[driveTime.getDay()]} ${i18n.t('time_at', { time: timeStr })}`;
    }
}

/**
 * Gets the status message according to Belgian law and safety thresholds.
 * Evaluates based on the PEAK BAC (maximum in the curve) to warn early.
 */
export function getBACStatus(simOverride = null) {
    const sim = simOverride || simulateBAC();
    const currentBac = sim.currentBAC;

    // Find peak from NOW onwards
    const now = new Date().getTime();
    const futureCurve = sim.curve.filter(p => p.time >= now);
    const peakBac = futureCurve.length > 0 ? Math.max(...futureCurve.map(p => p.bac)) : currentBac;

    // Use the higher of current or peak for status
    const statusBac = Math.max(currentBac, peakBac);

    const timeToWait = formatHoursToTimeStr(getHoursToDrive(sim));
    const timeToZero = formatHoursToTimeStr(getHoursToZero(sim));
    const timeAt = getTimeCanDriveStr();

    // Vehicle type context for sanctions
    const vehicle = Storage.getPreference('bac_vehicle', 'voiture');
    const isDriver = (vehicle !== 'pieton' && vehicle !== 'ne_conduit_pas' && vehicle !== 'none' && vehicle !== 'pedestrian');
    const isBike = vehicle === 'velo' || vehicle === 'moto';

    const rules = getCurrentRules();
    const sanctionLimit = rules.sanctionThreshold;
    const withdrawLimit = rules.withdrawThreshold;

    const b = statusBac.toFixed(2);

    const baseStatus = {
        currentBac,
        peakBac,
        timeToWaitLong: timeToWait,
        timeToWaitShort: timeToWait.replace(' ' + i18n.t('time_minutes'), 'min').replace(' ' + i18n.t('time_hours'), 'h'),
        timeToZero,
        timeAt,
        rules
    };

    if (statusBac === 0) {
        return {
            ...baseStatus,
            level: 'zero', color: '#4CAF50', title: i18n.t('bac_level_zero_title'),
            subtitle: i18n.t('bac_subtitle_sober'),
            symptoms: '',
            message: isDriver ? i18n.t('bac_level_zero_msg_drive') : i18n.t('bac_level_zero_msg_other'),
            canDrive: true
        };
    } else if (statusBac < 0.2) {
        return {
            ...baseStatus,
            level: 'ok', color: '#8BC34A', title: i18n.t('bac_level_ok_title'),
            subtitle: i18n.t('bac_subtitle_sober'),
            symptoms: '',
            message: i18n.t('bac_level_ok_msg', { bac: b }),
            canDrive: true
        };
    } else if (statusBac < sanctionLimit) {
        return {
            ...baseStatus,
            level: 'caution', color: '#CDDC39', title: i18n.t('bac_level_caution_title'),
            subtitle: i18n.t('bac_subtitle_legal_near'),
            symptoms: '',
            message: i18n.t('bac_level_caution_msg', { bac: b, limit: sanctionLimit }),
            canDrive: true
        };
    } else if (statusBac < withdrawLimit) {
        return {
            ...baseStatus,
            level: 'warning', color: '#FF9800', title: i18n.t('bac_level_warning_title'),
            subtitle: isDriver ? (isBike ? i18n.t('bac_bike_fine') : i18n.t('bac_subtitle_fine')) : i18n.t('bac_subtitle_legal_over'),
            symptoms: '',
            message: isDriver ? i18n.t('bac_level_warning_msg_drive', { bac: b, wait: timeToWait, time: timeAt }) : i18n.t('bac_level_warning_msg_other', { bac: b }),
            canDrive: false
        };
    } else if (statusBac < 1.5) {
        return {
            ...baseStatus,
            level: 'danger', color: '#F44336', title: i18n.t('bac_level_danger_title'),
            subtitle: isDriver ? i18n.t('bac_subtitle_withdrawal') : i18n.t('bac_subtitle_danger'),
            symptoms: '',
            message: isDriver ? i18n.t('bac_level_danger_msg_drive', { bac: b, wait: timeToWait }) : i18n.t('bac_level_danger_msg_other', { bac: b }),
            canDrive: false
        };
    } else if (statusBac < 3.0) {
        return {
            ...baseStatus,
            level: 'severe', color: '#D32F2F', title: i18n.t('bac_level_severe_title'),
            subtitle: i18n.t('bac_subtitle_medical'),
            symptoms: '',
            message: i18n.t('bac_level_severe_msg', { bac: b, wait: timeToWait }),
            canDrive: false
        };
    } else if (statusBac < 4.0) {
        return {
            ...baseStatus,
            level: 'emergency', color: '#ff5252', title: i18n.t('bac_level_emergency_title'),
            subtitle: i18n.t('bac_subtitle_emergency'),
            symptoms: '',
            message: i18n.t('bac_level_emergency_msg'),
            canDrive: false
        };
    } else {
        return {
            ...baseStatus,
            level: 'lethal', color: '#ff1744', title: i18n.t('bac_level_lethal_title'),
            subtitle: i18n.t('bac_subtitle_lethal'),
            symptoms: '',
            message: i18n.t('bac_level_lethal_msg'),
            canDrive: false
        };
    }
}

/**
 * Generate data points for the BAC chart (past and future predictions)
 */
export function getBACCurveData() {
    return simulateBAC().curve;
}

/**
 * Manual override for BAC
 */
export function logManualBAC(bacValue) {
    if (!Storage.getPreference('bac_enabled', true)) return;

    // Robust parsing for weight
    let rawWeight = Storage.getPreference('bac_weight', 70);
    let weightKg = parseFloat(rawWeight);
    if (isNaN(weightKg) || weightKg < 20) weightKg = 70;

    const gender = Storage.getPreference('bac_gender', 'M');
    const r = gender === 'M' ? MEN_R : (gender === 'F' ? WOMEN_R : AVERAGE_R);

    const gramsNeeded = (bacValue * weightKg * r) || 0;

    // Back-date the drink by 45 mins so that it is already fully absorbed "now"
    const ABSORPTION_MINS = 45;
    const pastTime = new Date().getTime() - (ABSORPTION_MINS * 60 * 1000);

    const drink = {
        time: pastTime,
        volume: 0,
        abv: 0,
        grams: gramsNeeded
    };

    // Reset history to this single reference point for manual override
    Storage.savePreference('bac_history', [drink]);
}

/**
 * Calculates speculative BAC if the user were to drink a specific beer NOW.
 * Does NOT modify history — purely predictive.
 * @returns {{ currentBAC: number, speculativeBAC: number, delta: number, peakBAC: number }}
 */
export function getSpeculativeBAC(volumeMl, abv) {
    if (!Storage.getPreference('bac_enabled', true)) return null;

    const vMl = parseVolumeToMl(volumeMl);
    const aPct = parseAbv(abv);
    if (vMl <= 0 || aPct <= 0) return null;

    const currentSim = simulateBAC();
    const currentBAC = currentSim.currentBAC;

    // Create a hypothetical drink at NOW
    const now = new Date().getTime();
    const drinkDurationMin = parseInt(Storage.getPreference('bac_drink_duration', 0)) || 0;
    const drinkTime = now + (drinkDurationMin * 60 * 1000); // drink starts being absorbed after drinking duration

    const hypotheticalDrink = {
        time: now,
        volume: vMl,
        abv: aPct,
        grams: calculateAlcoholGrams(vMl, aPct)
    };

    const specSim = simulateBAC([hypotheticalDrink]);

    // Calculate theoretical delta strictly based on Widmark formula (grams added / (weight * r))
    let rawWeight = Storage.getPreference('bac_weight', null);
    let weightKg = parseFloat(rawWeight);
    if (!rawWeight || isNaN(weightKg) || weightKg < 20) weightKg = 70; // fallback if unconfigured
    const gender = Storage.getPreference('bac_gender', 'M');
    const r = gender === 'M' ? MEN_R : (gender === 'F' ? WOMEN_R : AVERAGE_R);
    const BAC_PER_GRAM = 1 / (weightKg * r);
    const theoreticalDelta = hypotheticalDrink.grams * BAC_PER_GRAM;

    // Find peak BAC from speculative simulation
    const futurePoints = specSim.curve.filter(p => p.time >= now);
    const peakBAC = futurePoints.length > 0 ? Math.max(...futurePoints.map(p => p.bac)) : specSim.currentBAC;

    return {
        currentBAC,
        speculativeBAC: Math.max(specSim.currentBAC, peakBAC),
        delta: theoreticalDelta,
        peakBAC
    };
}

/**
 * Returns drive info for speculative BAC (for beer card badges).
 * @returns {{ canDrive: boolean, icon: string, timeStr: string, color: string, level: string }}
 */
export function getSpeculativeDriveInfo(volumeMl, abv) {
    const spec = getSpeculativeBAC(volumeMl, abv);
    if (!spec) return null;

    const rules = getCurrentRules();
    const sanctionLimit = rules.sanctionThreshold;
    const withdrawLimit = rules.withdrawThreshold;
    const peakBAC = spec.speculativeBAC;

    // Determine drive status based on peak
    let canDrive = peakBAC < sanctionLimit;
    let icon, color, level;

    if (peakBAC < sanctionLimit) {
        icon = '✅'; color = '#4CAF50'; level = 'ok';
    } else if (peakBAC < withdrawLimit) {
        icon = '⚠️'; color = '#FF9800'; level = 'warning';
    } else {
        icon = '🚫'; color = '#F44336'; level = 'danger';
    }

    // Time to drive: rough estimate based on peak -> how long to drop below limit
    const excessGrams = (peakBAC - (sanctionLimit - 0.01));
    const hoursToWait = canDrive ? 0 : Math.max(0, excessGrams / ELIMINATION_RATE);

    let timeStr = '';
    if (hoursToWait > 0) {
        const h = Math.floor(hoursToWait);
        const m = Math.round((hoursToWait - h) * 60);
        timeStr = h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`;
    }

    return {
        canDrive,
        icon,
        timeStr,
        color,
        level,
        delta: spec.delta,
        peakBAC
    };
}
