import * as Storage from './storage.js';

// --- BAC (Blood Alcohol Content) Calculator ---
// Uses the Widmark formula: 
// BAC = (Alcohol consumed in grams) / (Body weight in grams * r)
// r = 0.68 for men, 0.55 for women
// Elimination rate = ~0.15 g/L per hour

const MEN_R = 0.68;
const WOMEN_R = 0.55;
const ELIMINATION_RATE = 0.15; // g/l per hour

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
    if (!Storage.getPreference('bac_enabled', false)) return null;

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
    if (!Storage.getPreference('bac_enabled', false)) return null;

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
export function simulateBAC() {
    const enabled = Storage.getPreference('bac_enabled', false);
    if (!enabled) return { currentBAC: 0, curve: [] };

    const historyUnsorted = Storage.getPreference('bac_history', []);
    if (historyUnsorted.length === 0) return { currentBAC: 0, curve: [] };

    const now = new Date().getTime();
    // Filter history to last 24h just in case and strictly require numeric grams to avoid NaN poisoning
    const recentHistory = historyUnsorted.filter(d => d && !isNaN(d.grams) && (now - d.time) < 24 * 60 * 60 * 1000);
    if (recentHistory.length === 0) return { currentBAC: 0, curve: [] };

    const history = [...recentHistory].sort((a, b) => a.time - b.time);

    // Robust parsing for weight to prevent NaN from old saved literal string bugs
    let rawWeight = Storage.getPreference('bac_weight', 70);
    let weightKg = parseFloat(rawWeight);
    if (isNaN(weightKg) || weightKg < 20) weightKg = 70;

    const gender = Storage.getPreference('bac_gender', 'M');
    const r = gender === 'M' ? MEN_R : WOMEN_R;
    const BAC_PER_GRAM = 1 / (weightKg * r);
    const ELIMINATION_PER_MIN = ELIMINATION_RATE / 60;

    const ABSORPTION_MINS = 45;

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
    if (hoursDecimal <= 0) return "maintenant";

    const h = Math.floor(hoursDecimal);
    const m = Math.round((hoursDecimal - h) * 60);

    if (h === 0) {
        return `${m} minutes`;
    } else if (m === 0) {
        return `${h} heure${h > 1 ? 's' : ''}`;
    } else {
        return `${h} heure${h > 1 ? 's' : ''} et ${m} minute${m > 1 ? 's' : ''}`;
    }
}

/**
 * Calculates hours to wait until BAC drops below 0.5 g/L
 */
export function getHoursToDrive() {
    const sim = simulateBAC();
    const now = new Date().getTime();
    const futurePoints = sim.curve.filter(p => p.time >= now);

    let recoveryTime = null;

    // We scan backwards to find the last point where BAC was still >= 0.5.
    // The point right after that will be the moment it drops below the limit safely.
    for (let i = futurePoints.length - 1; i >= 0; i--) {
        if (futurePoints[i].bac >= 0.5) {
            if (i + 1 < futurePoints.length) {
                recoveryTime = futurePoints[i + 1].time;
            }
            break;
        }
    }

    if (recoveryTime) {
        return Math.max(0, (recoveryTime - now) / (1000 * 60 * 60));
    }

    // If it never went above 0.5 in the future prediction
    if (sim.currentBAC < 0.5 && (!futurePoints.length || futurePoints.every(p => p.bac < 0.5))) {
        return 0;
    }

    // Fallback if the simulation somehow cuts off early and never drops below 0.5
    const peakFuture = futurePoints.length > 0 ? Math.max(...futurePoints.map(p => p.bac)) : sim.currentBAC;
    const differenceToTarget = peakFuture - 0.49;
    return Math.max(0, differenceToTarget / ELIMINATION_RATE);
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

    // Use a more robust day comparison for "Après-demain"
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const driveStart = new Date(driveTime.getFullYear(), driveTime.getMonth(), driveTime.getDate()).getTime();
    const diffDays = Math.round((driveStart - nowStart) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `à ${hh}h${mm !== '00' ? mm : ''}`;
    } else if (diffDays === 1) {
        return `demain à ${hh}h${mm !== '00' ? mm : ''}`;
    } else if (diffDays === 2) {
        return `après-demain à ${hh}h${mm !== '00' ? mm : ''}`;
    } else {
        const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        return `${dayNames[driveTime.getDay()]} à ${hh}h${mm !== '00' ? mm : ''}`;
    }
}

/**
 * Gets the status message according to Belgian law and safety thresholds.
 * Evaluates based on the PEAK BAC (maximum in the curve) to warn early.
 */
export function getBACStatus() {
    const sim = simulateBAC();
    const currentBac = sim.currentBAC;

    // Find peak from NOW onwards
    const now = new Date().getTime();
    const futureCurve = sim.curve.filter(p => p.time >= now);
    const peakBac = futureCurve.length > 0 ? Math.max(...futureCurve.map(p => p.bac)) : currentBac;

    // Use the higher of current or peak for status
    const statusBac = Math.max(currentBac, peakBac);

    const timeToWait = formatHoursToTimeStr(getHoursToDrive());
    const timeAt = getTimeCanDriveStr();

    if (statusBac === 0) {
        return {
            level: 'zero', color: '#4CAF50', title: 'Sobre',
            message: 'Vous êtes parfaitement en état de conduire.',
            canDrive: true
        };
    } else if (statusBac < 0.2) {
        return {
            level: 'ok', color: '#8BC34A', title: 'Léger',
            message: `Taux très faible (${statusBac.toFixed(2)} g/l). État normal.`,
            canDrive: true
        };
    } else if (statusBac < 0.5) {
        return {
            level: 'caution', color: '#CDDC39', title: 'Prudence',
            message: `Vous approchez de la limite légale (0.5 g/l). Soyez vigilant.`,
            canDrive: true
        };
    } else if (statusBac < 0.8) {
        return {
            level: 'warning', color: '#FF9800', title: 'Ivre (Interdiction)',
            message: `Seuil légal dépassé. Vous pourrez reprendre le volant dans ${timeToWait} (${timeAt}).`,
            canDrive: false
        };
    } else if (statusBac < 1.5) {
        return {
            level: 'danger', color: '#F44336', title: 'Alcoolémie élevée',
            message: `Danger. Facultés fortement diminuées. Reprise possible dans ${timeToWait} (${timeAt}).`,
            canDrive: false
        };
    } else if (statusBac < 3.0) {
        return {
            level: 'severe', color: '#D32F2F', title: 'Écroulé',
            message: `Intoxication sévère. Risque de vomissements et perte d'équilibre. Reprise dans ${timeToWait} (${timeAt}).`,
            canDrive: false
        };
    } else if (statusBac < 4.0) {
        return {
            level: 'emergency', color: '#ff5252', title: 'Coma Éthylique',
            message: `URGENCE : Risque de perte de connaissance. Surveillance médicale recommandée.`,
            canDrive: false
        };
    } else {
        return {
            level: 'lethal', color: '#ff1744', title: 'DANGER DE MORT',
            message: `Taux potentiellement mortel ! APPELEZ LES SECOURS (112) IMMÉDIATEMENT.`,
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
    if (!Storage.getPreference('bac_enabled', false)) return;

    // Robust parsing for weight
    let rawWeight = Storage.getPreference('bac_weight', 70);
    let weightKg = parseFloat(rawWeight);
    if (isNaN(weightKg) || weightKg < 20) weightKg = 70;

    const gender = Storage.getPreference('bac_gender', 'M');
    const r = gender === 'M' ? MEN_R : WOMEN_R;

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
