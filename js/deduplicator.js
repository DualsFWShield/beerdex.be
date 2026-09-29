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
import * as Thanos from './thanos.js';



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

    const userData = typeof localStorage !== 'undefined' ? Storage.getAllUserData() : {};
    const thanosMatches = Thanos.findCustomMatchesWithSafety(customBeers, officialBeers, userData);

    return thanosMatches.filter(m => {
        const key = `${m.customBeer.id}__${m.officialBeer.id}`;
        return !dismissedSet.has(key) && (m.score / 100) >= threshold;
    });
}

// ============================== //
// Find Official Duplicates (Dev) //
// ============================== //

/**
 * Scans the official database for internal near-duplicates via Thanos.
 * Logs warnings to console only.
 * 
 * @param {Array} officialBeers 
 */
export function findOfficialDuplicates(officialBeers) {
    if (!officialBeers || officialBeers.length < 2) return;

    const dupes = Thanos.scanCatalogDuplicates(officialBeers, 75);

    if (dupes.length > 0) {
        console.warn(`[Thanos/Deduplicator] Found ${dupes.length} potential duplicate(s) in official DB:`);
        dupes.forEach(d => {
            console.warn(`  ⚠️ "${d.a.title}" (${d.a.id}) ↔ "${d.b.title}" (${d.b.id}) — ${d.score}% (${d.reason})`);
        });
    } else {
        console.log('[Thanos/Deduplicator] No internal duplicates found in official DB. ✅');
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
 * Main entry point. Called once after app boot or manually from settings.
 * Checks ONLY user custom beers against official database.
 * @param {Array} allBeers - Full beer list (custom + official)
 * @returns {Array} migration prompts
 */
export function runCheck(allBeers, ignoreDismissed = false) {
    const customBeers = Storage.getCustomBeers();
    const officialBeers = allBeers.filter(b => !String(b.id).startsWith('CUSTOM_'));

    // Find custom → official matches ONLY (users must never be asked to deduplicate official DB)
    const matches = findMatches(customBeers, officialBeers, 0.65, ignoreDismissed);

    if (matches.length > 0) {
        console.log(`[Deduplicator] Found ${matches.length} custom beer(s) matching official entries:`);
        matches.forEach(m => {
            console.log(`  🔄 "${m.customBeer.title}" → "${m.officialBeer.title}" (${m.score}%)`);
        });
    }

    return matches;
}
