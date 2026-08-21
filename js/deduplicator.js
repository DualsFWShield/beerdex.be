/**
 * deduplicator.js — Detects similar/duplicate beers.
 * 
 * 1. Compares user custom beers against the official DB using multiple similarity metrics.
 * 2. Scans the official DB for internal duplicates (console.warn only).
 * 
 * Improvements over v1:
 * - Token-based Jaccard similarity for word-order-insensitive matching
 * - Variant/color conflict detection (e.g. Blonde vs Brune = different beers)
 * - Proper field access (alcohol instead of degree)
 * - Alcohol delta penalty to reject beers with very different ABV
 * - No more artificial score forcing
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
 * @param {number} threshold - Minimum similarity (0-1). Default 0.65.
 * @returns {Array<{customBeer, officialBeer, score}>}
 */
export function findMatches(customBeers, officialBeers, threshold = 0.65, ignoreDismissed = false) {
    if (!customBeers || !officialBeers) return [];

    // Filter out already-dismissed matches
    const dismissed = ignoreDismissed ? [] : Storage.getPreference('dismissed_migrations', []);
    const dismissedSet = new Set(dismissed);

    const matches = [];

    for (const custom of customBeers) {
        const customTitle = Utils.normalize(custom.title);
        const customBrewery = Utils.normalize(custom.brewery);
        const customDeg = Utils.parseDegree(custom.alcohol || custom.degree);
        const customVol = Utils.parseVolumeToMl(custom.volume);

        let bestMatch = null;
        let bestScore = 0;

        for (const official of officialBeers) {
            // Skip if the official beer is itself a custom beer
            if (String(official.id).startsWith('CUSTOM_')) continue;

            const officialTitle = Utils.normalize(official.title);
            const officialBrewery = Utils.normalize(official.brewery);

            // --- Quick reject: if normalized titles share no significant words, skip ---
            const tokenSim = Utils.tokenSimilarity(custom.title, official.title);
            const levenSim = Utils.similarity(customTitle, officialTitle);
            
            // Best of both similarity methods (handles word-order differences AND typos)
            const titleSim = Math.max(tokenSim, levenSim);

            // Early exit: if title similarity is too low, skip entirely
            if (titleSim < 0.35) continue;

            // --- Variant/Color conflict check ---
            // If titles differ by a variant word (e.g. "Blonde" vs "Brune"), reject
            if (Utils.hasVariantConflict(custom.title, official.title)) continue;

            // --- Brewery similarity ---
            const brewerySim = Utils.similarity(customBrewery, officialBrewery);

            // --- Alcohol degree comparison ---
            const officialDeg = Utils.parseDegree(official.alcohol || official.degree);
            let degreePenalty = 0;
            let degreeMatch = 0;
            if (customDeg > 0 && officialDeg > 0) {
                const delta = Math.abs(customDeg - officialDeg);
                if (delta === 0) {
                    degreeMatch = 1;
                } else if (delta <= 0.5) {
                    degreeMatch = 0.7;
                } else if (delta <= 1.5) {
                    degreeMatch = 0.3;
                } else {
                    // Very different alcohol → strong penalty
                    degreePenalty = 0.15;
                }
            }

            // --- Volume comparison ---
            const officialVol = Utils.parseVolumeToMl(official.volume);
            const volumeMatch = (customVol > 0 && officialVol > 0 && customVol === officialVol) ? 1 : 0;

            // --- Weighted score ---
            // Title is heavily weighted because it's the primary identifier
            let score = (titleSim * 0.55) + (brewerySim * 0.25) + (degreeMatch * 0.10) + (volumeMatch * 0.10);
            
            // Apply alcohol penalty
            score -= degreePenalty;

            // --- Brewery conflict rejection ---
            // If both have breweries and they're very different, reject
            if (customBrewery && officialBrewery && customBrewery.length > 2 && officialBrewery.length > 2) {
                if (brewerySim < 0.25) {
                    // Very different breweries → hard reject unless title is nearly identical
                    if (titleSim < 0.90) continue;
                }
            }

            // --- Substring containment bonus ---
            // If one title fully contains the other (normalized), bonus
            if (customTitle.length > 3 && officialTitle.length > 3) {
                if (customTitle.includes(officialTitle) || officialTitle.includes(customTitle)) {
                    score = Math.max(score, 0.70);
                }
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

            // Skip if variant conflict
            if (Utils.hasVariantConflict(beers[i].title, beers[j].title)) continue;

            const titleSim = Math.max(
                Utils.similarity(Utils.normalize(beers[i].title), Utils.normalize(beers[j].title)),
                Utils.tokenSimilarity(beers[i].title, beers[j].title)
            );
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
    const matches = findMatches(customBeers, officialBeers, 0.65, ignoreDismissed);

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
