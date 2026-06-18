/**
 * deduplicator.js — Detects similar/duplicate beers.
 * 
 * 1. Compares user custom beers against the official DB using Levenshtein.
 * 2. Scans the official DB for internal duplicates (console.warn only).
 */

import * as Storage from './storage.js';
import * as Utils from './utils.js';



// ============================== //
// Find Matches: Custom vs DB     //
// ============================== //

/**
 * Compare each custom beer against all official beers.
 * Returns an array of { customBeer, officialBeer, score } for strong matches.
 * 
 * @param {Array} customBeers - From Storage.getCustomBeers()
 * @param {Array} officialBeers - All non-custom beers from the DB
 * @param {number} threshold - Minimum similarity (0-1). Default 0.80.
 * @returns {Array<{customBeer, officialBeer, score}>}
 */
export function findMatches(customBeers, officialBeers, threshold = 0.60, ignoreDismissed = false) {
    if (!customBeers || !officialBeers) return [];

    // Filter out already-dismissed matches
    const dismissed = ignoreDismissed ? [] : Storage.getPreference('dismissed_migrations', []);
    const dismissedSet = new Set(dismissed);

    const matches = [];

    for (const custom of customBeers) {
        const customTitle = Utils.normalize(custom.title);
        const customBrewery = Utils.normalize(custom.brewery);
        const customDeg = Utils.parseDegree(custom.degree);
        const customVol = Utils.parseVolumeToMl(custom.volume);

        let bestMatch = null;
        let bestScore = 0;

        for (const official of officialBeers) {
            // Skip if the official beer is itself a custom beer
            if (String(official.id).startsWith('CUSTOM_')) continue;

            const titleSim = Utils.similarity(customTitle, Utils.normalize(official.title));
            const brewerySim = Utils.similarity(customBrewery, Utils.normalize(official.brewery));
            
            const officialDeg = Utils.parseDegree(official.degree);
            const degreeMatch = (customDeg > 0 && customDeg === officialDeg) ? 1 : 0;

            const officialVol = Utils.parseVolumeToMl(official.volume);
            const volumeMatch = (customVol > 0 && customVol === officialVol) ? 1 : 0;

            let points = 0;
            if (titleSim >= 0.5) points++;
            if (brewerySim >= 0.5) points++;
            if (degreeMatch) points++;
            if (volumeMatch) points++;

            // Weighted score
            let score = (titleSim * 0.5) + (brewerySim * 0.2) + (degreeMatch * 0.15) + (volumeMatch * 0.15);

            // If 2 or more elements correspond, ensure score meets threshold
            // User feedback: degree + volume alone is too generic. Must include brewery or title.
            let hasValidCombo = false;
            if (titleSim >= 0.5 && points >= 2) {
                hasValidCombo = true; // Title + something else
            } else if (brewerySim >= 0.5 && degreeMatch && volumeMatch) {
                hasValidCombo = true; // Brewery + Degree + Volume
            }

            if (hasValidCombo && score < threshold) {
                score = threshold;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = official;
            }
        }

        if (bestMatch && bestScore >= threshold) {
            const key = `${custom.id}__${bestMatch.id}`;
            if (!dismissedSet.has(key)) {
                matches.push({
                    customBeer: custom,
                    officialBeer: bestMatch,
                    score: Math.round(bestScore * 100)
                });
            }
        }
    }

    return matches;
}

// ============================== //
// Find Official Duplicates (Dev) //
// ============================== //

/**
 * Scans the official database for internal near-duplicates.
 * Logs warnings to console only. This is a dev-only diagnostic.
 * 
 * @param {Array} officialBeers 
 */
export function findOfficialDuplicates(officialBeers) {
    if (!officialBeers || officialBeers.length < 2) return;

    const dupes = [];

    // Only compare non-custom, non-API beers
    const beers = officialBeers.filter(b => {
        const id = String(b.id);
        return !id.startsWith('CUSTOM_') && !id.startsWith('API_') && !id.startsWith('OFF_');
    });

    // O(n²) but runs once and n is ~200 so it's fine
    for (let i = 0; i < beers.length; i++) {
        for (let j = i + 1; j < beers.length; j++) {
            // Exact ID match (shouldn't happen but check)
            if (beers[i].id === beers[j].id) {
                dupes.push({ a: beers[i], b: beers[j], reason: 'Exact ID match' });
                continue;
            }

            const titleSim = Utils.similarity(Utils.normalize(beers[i].title), Utils.normalize(beers[j].title));
            const brewerySim = Utils.similarity(Utils.normalize(beers[i].brewery), Utils.normalize(beers[j].brewery));
            const combined = titleSim * 0.7 + brewerySim * 0.3;

            if (combined > 0.90) {
                dupes.push({
                    a: beers[i],
                    b: beers[j],
                    reason: `Similarity: ${Math.round(combined * 100)}% (title: ${Math.round(titleSim * 100)}%, brewery: ${Math.round(brewerySim * 100)}%)`
                });
            }
        }
    }

    if (dupes.length > 0) {
        console.warn(`[Deduplicator] Found ${dupes.length} potential duplicate(s) in official DB:`);
        dupes.forEach(d => {
            console.warn(`  ⚠️ "${d.a.title}" (${d.a.id}) ↔ "${d.b.title}" (${d.b.id}) — ${d.reason}`);
        });
    } else {
        console.log('[Deduplicator] No internal duplicates found in official DB. ✅');
    }
}

// ============================== //
// Dismiss a match                //
// ============================== //

/**
 * Mark a match as dismissed so it doesn't show again.
 */
export function dismissMatch(customId, officialId) {
    const dismissed = Storage.getPreference('dismissed_migrations', []);
    const key = `${customId}__${officialId}`;
    if (!dismissed.includes(key)) {
        dismissed.push(key);
        Storage.savePreference('dismissed_migrations', dismissed);
    }
}

// ============================== //
// Run Full Check                 //
// ============================== //

/**
 * Main entry point. Called once after app boot.
 * @param {Array} allBeers - Full beer list (custom + official)
 * @returns {Array} migration prompts
 */
export function runCheck(allBeers, ignoreDismissed = false) {
    const customBeers = Storage.getCustomBeers();
    const officialBeers = allBeers.filter(b => !String(b.id).startsWith('CUSTOM_'));

    // 1. Find custom → official matches
    const matches = findMatches(customBeers, officialBeers, 0.60, ignoreDismissed);

    if (matches.length > 0) {
        console.log(`[Deduplicator] Found ${matches.length} custom beer(s) matching official entries:`);
        matches.forEach(m => {
            console.log(`  🔄 "${m.customBeer.title}" → "${m.officialBeer.title}" (${m.score}%)`);
        });
    }

    // 2. Check for official DB duplicates (dev-only console warning, heavy on performance)
    if (Storage.getPreference('feat_dedup_worker_enabled', false)) {
        findOfficialDuplicates(officialBeers);
    }

    return matches;
}
