/**
 * deduplicator.js — Detects similar/duplicate beers.
 * 
 * 1. Compares user custom beers against the official DB using Levenshtein.
 * 2. Scans the official DB for internal duplicates (console.warn only).
 */

import * as Storage from './storage.js';

// ============================== //
// Levenshtein Distance           //
// ============================== //

function levenshtein(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    
    const la = a.length;
    const lb = b.length;
    const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));

    for (let i = 0; i <= la; i++) dp[i][0] = i;
    for (let j = 0; j <= lb; j++) dp[0][j] = j;

    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,      // Deletion
                dp[i][j - 1] + 1,      // Insertion
                dp[i - 1][j - 1] + cost // Substitution
            );
        }
    }
    return dp[la][lb];
}

/**
 * Compute similarity ratio between two strings (0 to 1).
 */
function similarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * Normalize a beer name for comparison.
 * Lowercases, strips accents, removes extra whitespace & special chars.
 */
function normalize(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Strip accents
        .replace(/[^a-z0-9\s]/g, '')     // Remove special chars
        .replace(/\s+/g, ' ')            // Collapse spaces
        .trim();
}

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
export function findMatches(customBeers, officialBeers, threshold = 0.80) {
    if (!customBeers || !officialBeers) return [];

    // Filter out already-dismissed matches
    const dismissed = Storage.getPreference('dismissed_migrations', []);
    const dismissedSet = new Set(dismissed);

    const matches = [];

    for (const custom of customBeers) {
        const customTitle = normalize(custom.title);
        const customBrewery = normalize(custom.brewery);

        let bestMatch = null;
        let bestScore = 0;

        for (const official of officialBeers) {
            // Skip if the official beer is itself a custom beer
            if (String(official.id).startsWith('CUSTOM_')) continue;

            const titleSim = similarity(customTitle, normalize(official.title));
            const brewerySim = similarity(customBrewery, normalize(official.brewery));

            // Weighted score: title is more important (70%) than brewery (30%)
            const score = titleSim * 0.7 + brewerySim * 0.3;

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

            const titleSim = similarity(normalize(beers[i].title), normalize(beers[j].title));
            const brewerySim = similarity(normalize(beers[i].brewery), normalize(beers[j].brewery));
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
export function runCheck(allBeers) {
    const customBeers = Storage.getCustomBeers();
    const officialBeers = allBeers.filter(b => !String(b.id).startsWith('CUSTOM_'));

    // 1. Find custom → official matches
    const matches = findMatches(customBeers, officialBeers);

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
