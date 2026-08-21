/**
 * utils.js — Core utility functions for Beerdex
 * Handles data formatting, normalization, search matching, and common UI helpers.
 */

import * as BAC from './bac.js';
import * as Storage from './storage.js';

// ============================== //
// Volume Formatting & Parsing    //
// ============================== //

/**
 * Parses any volume string into milliliters (integer).
 * e.g., "33cl" -> 330, "0.33 L" -> 330, "330" -> 330, "1.5l" -> 1500
 * @param {string|number} vol 
 * @returns {number} volume in ml (or 0 if invalid)
 */
export function parseVolumeToMl(vol) {
    if (!vol) return 0;
    const s = String(vol).toLowerCase().replace(/\s/g, '').replace(',', '.');
    const match = s.match(/([0-9.]+)([a-z]*)/);
    if (!match) return 0;
    
    let val = parseFloat(match[1]);
    const unit = match[2];
    
    // If no unit, assume ml if > 100, otherwise assume cl if < 100, except if it's very small like 0.33
    if (!unit) {
        if (val < 10) return val * 1000; // e.g. 0.33 -> 330, 1 -> 1000
        if (val < 100) return val * 10;  // e.g. 33 -> 330
        return val;                      // e.g. 330 -> 330
    }
    
    if (unit === 'l') return val * 1000;
    if (unit === 'cl') return val * 10;
    if (unit === 'ml') return val;
    
    return 0;
}

/**
 * Formats a volume string/number into a standardized display string.
 * Output is in "cl" under 1 liter, and in "L" for 1 liter and above.
 * e.g., "330ml" -> "33cl", "500" -> "50cl", "1.5l" -> "1.5L"
 * @param {string|number} vol 
 * @returns {string} Formatted string
 */
export function formatVolume(vol) {
    const ml = parseVolumeToMl(vol);
    if (ml === 0) return '';
    
    if (ml >= 1000) {
        const liters = ml / 1000;
        return Number.isInteger(liters) ? `${liters}L` : `${liters.toFixed(1)}L`;
    }
    
    const cl = ml / 10;
    return Number.isInteger(cl) ? `${cl}cl` : `${cl.toFixed(1)}cl`;
}

/**
 * Parses an ABV degree string into a float.
 * e.g. "8.5%" -> 8.5
 */
export function parseDegree(deg) {
    if (!deg) return 0;
    const s = String(deg).replace(/[^0-9.,]/g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

// ============================== //
// Text Normalization             //
// ============================== //

/**
 * Normalizes a string for comparison.
 * Lowercases, strips accents, removes extra whitespace & special chars.
 */
export function normalize(str) {
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

export function similarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * Token-based Jaccard similarity.
 * Splits strings into word tokens (normalized) and computes overlap.
 * Handles word-order differences (e.g. "Tripel Karmeliet" vs "Karmeliet Tripel").
 */
export function tokenSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const tokensA = new Set(normalize(a).split(/\s+/).filter(t => t.length > 0));
    const tokensB = new Set(normalize(b).split(/\s+/).filter(t => t.length > 0));
    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const t of tokensA) {
        if (tokensB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Detects if two beer titles have a variant/color conflict.
 * If one title contains a variant word that the other doesn't (or has a different one),
 * they are different beers (e.g. "Leffe Blonde" vs "Leffe Brune").
 * Returns true if there IS a conflict (beers should NOT be merged).
 */
const VARIANT_WORDS = [
    'blonde', 'blond', 'brune', 'bruin', 'ambree', 'amber', 'rouge', 'rubis',
    'noire', 'black', 'blanche', 'witte', 'wit', 'gold', 'doree', 'triple',
    'tripel', 'quadrupel', 'quad', 'double', 'dubbel', 'ipa', 'stout', 'porter',
    'pils', 'lager', 'kriek', 'framboise', 'peche', 'cerise', 'grand cru',
    'sans alcool', '0.0', 'radler', 'saison', 'hiver', 'noel', 'christmas',
    'speciale', 'special', 'platinum', 'gold', 'silver', 'chrome', 'red',
    'carbon', 'nickel', 'scotch'
];

export function hasVariantConflict(titleA, titleB) {
    const normA = normalize(titleA);
    const normB = normalize(titleB);
    
    const variantsA = [];
    const variantsB = [];
    
    for (const v of VARIANT_WORDS) {
        // Check as whole word or substring
        if (normA.includes(v)) variantsA.push(v);
        if (normB.includes(v)) variantsB.push(v);
    }
    
    // If one has variant words that the other doesn't, it's a conflict
    for (const v of variantsA) {
        if (!variantsB.includes(v)) return true;
    }
    for (const v of variantsB) {
        if (!variantsA.includes(v)) return true;
    }
    
    return false;
}

// ============================== //
// Fuzzy Search                   //
// ============================== //

/**
 * Fuzzy searches beers by title, brewery, and metadata.
 * Returns the matched array sorted by relevance score.
 * 
 * @param {Array} beers - Array of beer objects
 * @param {string} query - User search query
 * @returns {Array} Filtered and sorted beers
 */
export function fuzzyMatchBeers(beers, query) {
    if (!query || query.trim() === '') return beers;
    
    const normQuery = normalize(query);
    const queryParts = normQuery.split(' ').filter(p => p.length > 0);
    
    if (queryParts.length === 0) return beers;

    const scoredBeers = [];

    for (const beer of beers) {
        const normTitle = normalize(beer.title);
        const normBrewery = normalize(beer.brewery);
        const normRegion = normalize(beer.searchRegion);
        const normCountry = normalize(beer.searchCountry);
        
        let score = 0;

        // Perfect matches
        if (normTitle === normQuery) score += 100;
        if (normBrewery === normQuery) score += 50;

        // Starts with (very good match)
        if (normTitle.startsWith(normQuery)) score += 60;
        else if (normTitle.includes(normQuery)) score += 30; // Contains full query string
        
        if (normBrewery.startsWith(normQuery)) score += 20;

        // Partial word matching (for multi-word queries like "tripe karm")
        let partsMatched = 0;
        for (const part of queryParts) {
            let partScore = 0;
            if (normTitle.includes(part)) partScore += 10;
            else if (normBrewery.includes(part)) partScore += 5;
            else if (normRegion.includes(part) || normCountry.includes(part)) partScore += 2;
            
            // Levenshtein fuzziness for slightly misspelled words (if length >= 4)
            if (partScore === 0 && part.length >= 4) {
                const titleWords = normTitle.split(' ');
                for (const word of titleWords) {
                    if (word.length >= 4 && similarity(part, word) > 0.7) {
                        partScore += 5;
                        break;
                    }
                }
            }
            
            if (partScore > 0) {
                score += partScore;
                partsMatched++;
            }
        }
        
        // Bonus if all words are matched
        if (partsMatched === queryParts.length && queryParts.length > 1) {
            score += 20;
        }

        if (score > 0) {
            scoredBeers.push({ beer, score });
        }
    }

    // Sort by descending score
    scoredBeers.sort((a, b) => b.score - a.score);
    
    return scoredBeers.map(item => item.beer);
}

// ============================== //
// BAC Helpers                    //
// ============================== //

/**
 * Synchronizes the user's BAC (Blood Alcohol Content) when their consumption count changes.
 * @param {Object} beer - The beer object containing volume and alcohol
 * @param {number} oldCount - Previous consumption count
 * @param {number} newCount - New consumption count
 */
export function syncBACFromCountDiff(beer, oldCount, newCount) {
    if (!Storage.getPreference('bac_enabled', true) || Storage.getPreference('bac_manual_only', false)) return;
    
    const diff = newCount - oldCount;
    if (diff === 0) return;
    
    const volumeMl = parseVolumeToMl(beer.volume) || 330;
    const abv = parseDegree(beer.alcohol);
    
    const absDiff = Math.abs(diff);
    for (let i = 0; i < absDiff; i++) {
        if (diff > 0) {
            BAC.addDrinkToBAC(volumeMl, abv);
        } else {
            BAC.removeDrinkFromBAC(volumeMl, abv);
        }
    }
}
