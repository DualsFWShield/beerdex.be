/**
 * utils.js — Core utility functions for Beerdex
 * Handles data formatting, normalization, search matching, and common UI helpers.
 */

import * as BAC from './bac.js';
import * as Storage from './storage.js';
import * as Thanos from './thanos.js';

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
    const tokensA = new Set(normalize(a).split(/\s+/).filter(t => t.length > 0).map(t => VARIANT_CANONICAL[t] || t));
    const tokensB = new Set(normalize(b).split(/\s+/).filter(t => t.length > 0).map(t => VARIANT_CANONICAL[t] || t));
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
/**
 * Canonical variant synonyms mapping:
 * Allows recognising that "tripel" == "triple", "blond" == "blonde", "dubbel" == "double", etc.
 */
const VARIANT_CANONICAL = {
    'blonde': 'blond',
    'blond': 'blond',
    'brune': 'brune',
    'bruin': 'brune',
    'brown': 'brune',
    'ambree': 'ambree',
    'amber': 'ambree',
    'rouge': 'rouge',
    'red': 'rouge',
    'rubis': 'rouge',
    'bleue': 'bleue',
    'bleu': 'bleue',
    'blue': 'bleue',
    'noire': 'noire',
    'black': 'noire',
    'blanche': 'blanche',
    'witte': 'blanche',
    'wit': 'blanche',
    'white': 'blanche',
    'gold': 'doree',
    'doree': 'doree',
    'triple': 'triple',
    'tripel': 'triple',
    'quadrupel': 'quadrupel',
    'quad': 'quadrupel',
    'double': 'double',
    'dubbel': 'double',
    'ipa': 'ipa',
    'stout': 'stout',
    'porter': 'porter',
    'pils': 'pils',
    'lager': 'lager',
    'kriek': 'kriek',
    'framboise': 'framboise',
    'peche': 'peche',
    'cerise': 'cerise',
    'gueuze': 'gueuze',
    'geuze': 'gueuze',
    'lambic': 'lambic',
    'grand cru': 'grand_cru',
    'sans alcool': 'zero',
    '0.0': 'zero',
    '00': 'zero',
    'zero': 'zero',
    'virgin': 'zero',
    'radler': 'radler',
    'saison': 'saison',
    'hiver': 'hiver',
    'noel': 'noel',
    'christmas': 'noel',
    'speciale': 'speciale',
    'special': 'speciale',
    'platinum': 'platinum',
    'silver': 'silver',
    'chrome': 'chrome',
    'carbon': 'carbon',
    'nickel': 'nickel',
    'scotch': 'scotch'
};

export function hasVariantConflict(titleA, titleB) {
    const normA = normalize(titleA);
    const normB = normalize(titleB);
    const tokensA = normA.split(/\s+/);
    const tokensB = normB.split(/\s+/);
    
    const getCanonicalVariants = (tokens, normStr) => {
        const canonical = new Set();
        for (const [v, canon] of Object.entries(VARIANT_CANONICAL)) {
            if (v.includes(' ')) {
                if (normStr.includes(v)) canonical.add(canon);
            } else if (tokens.includes(v)) {
                canonical.add(canon);
            }
        }
        return canonical;
    };
    
    const canonA = getCanonicalVariants(tokensA, normA);
    const canonB = getCanonicalVariants(tokensB, normB);
    
    // If one has variant words that the other doesn't, it's a conflict
    for (const v of canonA) {
        if (!canonB.has(v)) return true;
    }
    for (const v of canonB) {
        if (!canonA.has(v)) return true;
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
    
    const rawQuery = query.trim();
    const normQuery = normalize(rawQuery);
    const queryParts = normQuery.split(' ').filter(p => p.length > 0);
    
    if (queryParts.length === 0) return beers;

    const scoredBeers = [];

    for (const beer of beers) {
        // Thanos relevance scoring (permutations, synonyms, CamelCase, volume, ABV, barcode)
        let score = Thanos.scoreSearchRelevance(beer, rawQuery);

        // Region & Country metadata matching: ONLY apply if user explicitly searched for a full country/region name
        const normRegion = normalize(beer.searchRegion);
        const normCountry = normalize(beer.searchCountry);

        if (normCountry && (normCountry === normQuery || (normQuery.length >= 4 && normCountry.includes(normQuery)))) {
            score += 40;
        } else if (normRegion && (normRegion === normQuery || (normQuery.length >= 4 && normRegion.includes(normQuery)))) {
            score += 30;
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

// ============================== //
// Beer Type Categorization       //
// ============================== //

export const BEER_TYPE_CATEGORIES = [
    { id: 'Blonde', label: 'Blonde', icon: '🍺' },
    { id: 'Brune', label: 'Brune', icon: '🍫' },
    { id: 'Ambrée', label: 'Ambrée', icon: '🍯' },
    { id: 'Blanche', label: 'Blanche', icon: '🌾' },
    { id: 'Triple', label: 'Triple', icon: '⚡' },
    { id: 'Double', label: 'Double', icon: '✌️' },
    { id: 'Quadruple', label: 'Quadruple', icon: '👑' },
    { id: 'IPA', label: 'IPA', icon: '🌿' },
    { id: 'Stout / Porter', label: 'Stout / Porter', icon: '☕' },
    { id: 'Fruitée', label: 'Fruitée', icon: '🍒' },
    { id: 'Sour / Gueuze', label: 'Sour / Gueuze', icon: '🍋' },
    { id: 'Saison', label: 'Saison', icon: '🧑‍🌾' },
    { id: 'Pils / Lager', label: 'Pils / Lager', icon: '🧊' },
    { id: 'Sans Alcool', label: 'Sans Alcool', icon: '🚫' },
    { id: 'Noël / Saisonnière', label: 'Noël / Saisonnière', icon: '🎄' },
    { id: 'Spéciale / Autre', label: 'Spéciale / Autre', icon: '✨' }
];

export function categorizeBeerType(rawType) {
    if (!rawType) return 'Spéciale / Autre';
    const clean = String(rawType).replace(/Ã©/g, 'é').replace(/Ã/g, 'à').trim();
    const sc = clean.toLowerCase();

    // 1. Sans Alcool (check first)
    if (sc.includes('sans alcool') || sc.includes('sans-alcool') || sc.includes('non-alcoholic') || sc.includes('0.0') || sc.includes('0%')) {
        return 'Sans Alcool';
    }
    // 2. IPA (before blonde/ambree even if 'IPA (Blonde)')
    if (sc.includes('ipa') || sc.includes('neipa') || sc.includes('dipa')) {
        return 'IPA';
    }
    // 3. Quadruple
    if (sc.includes('quadruple') || sc.includes('quadrupel') || sc.includes('quad')) {
        return 'Quadruple';
    }
    // 4. Triple
    if (sc.includes('triple') || sc.includes('tripel')) {
        return 'Triple';
    }
    // 5. Double
    if (sc.includes('double') || sc.includes('dubbel')) {
        return 'Double';
    }
    // 6. Stout & Porter
    if (sc.includes('stout') || sc.includes('porter') || sc.includes('black fuel') || sc === 'black' || sc === 'noire') {
        return 'Stout / Porter';
    }
    // 7. Sour / Gueuze / Lambic
    if (sc.includes('sour') || sc.includes('gueuze') || sc.includes('lambic') || sc.includes('rouge des flandres')) {
        return 'Sour / Gueuze';
    }
    // 8. Saison
    if (sc.includes('saison') && !sc.includes('traditionnelle')) {
        return 'Saison';
    }
    // 9. Blanche / Wheat
    if (sc.includes('blanche') || sc.includes('witbier') || sc.includes('weissbier') || sc.includes('wheat') || sc.includes('weizen')) {
        return 'Blanche';
    }
    // 10. Fruitée / Rouge
    if (sc.includes('fruit') || sc.includes('kriek') || sc.includes('cassis') || sc.includes('cerise') || sc.includes('framboise') || 
        sc.includes('peche') || sc.includes('pêche') || sc.includes('rood') || sc.includes('rosee') || sc.includes('rosée') || 
        sc.includes('rouge') || sc.includes('pasteque') || sc.includes('pastèque') || sc.includes('orange') || sc.includes('aromatise') || sc.includes('aromatisé')) {
        return 'Fruitée';
    }
    // 11. Ambrée
    if (sc.includes('ambree') || sc.includes('ambrée') || sc.includes('amber')) {
        return 'Ambrée';
    }
    // 12. Brune
    if (sc.includes('brune') || sc.includes('brown') || sc.includes('dark ale') || sc.includes('bock')) {
        return 'Brune';
    }
    // 13. Pils / Lager
    if (sc.includes('pils') || sc.includes('lager') || sc.includes('helles')) {
        return 'Pils / Lager';
    }
    // 14. Blonde
    if (sc.includes('blonde') || sc.includes('doree') || sc.includes('dorée') || sc.includes('pale ale')) {
        return 'Blonde';
    }
    // 15. Noël / Saisonnière
    if (sc.includes('noel') || sc.includes('noël') || sc.includes('saison') || sc.includes('hiver')) {
        return 'Noël / Saisonnière';
    }
    return 'Spéciale / Autre';
}

// ============================== //
// Trappist Beers & Badges        //
// ============================== //

export const TRAPPIST_BREWERIES = [
    'scourmont', 'chimay', 'orval', 'rochefort', 'saint-remy', 'saint-rémy',
    'westmalle', 'westvleteren', 'saint-sixte', 'sint-sixtus', 'achel', 'achelse kluis',
    'koningshoeven', 'la trappe', 'de kievit', 'zundert',
    'tre fontane', 'fontane', 'cardeña', 'cardena', 'san pedro de cardeña',
    'mount st bernard', 'mount saint-bernard', 'tynt meadow',
    'engelszell', 'spencer', 'mont des cats'
];

export const TRAPPIST_TITLES = [
    'chimay', 'orval', 'rochefort', 'westmalle', 'westvleteren', 'achel',
    'la trappe', 'zundert', 'tre fontane', 'cardeña', 'cardena',
    'tynt meadow', 'engelszell', 'gregorius', 'benno', 'nivard', 'spencer', 'mont des cats'
];

/**
 * Identifies if a given beer is an authentic or historic Trappist beer.
 * @param {Object} beer
 * @returns {boolean}
 */
export function isTrappistBeer(beer) {
    if (!beer) return false;
    const brew = (beer.brewery || '').toLowerCase();
    const title = (beer.title || '').toLowerCase();
    const id = (beer.id || '').toLowerCase();
    const type = (beer.type || '').toLowerCase();

    if (type.includes('trappiste') || type.includes('trappist')) return true;
    if (id.includes('trappist')) return true;

    if (TRAPPIST_BREWERIES.some(tb => brew.includes(tb))) return true;
    if (TRAPPIST_TITLES.some(tt => title.startsWith(tt) || title.includes(' ' + tt) || title.includes(tt + ' '))) return true;

    return false;
}

/**
 * Resolves the canonical Trappist Abbey key for achievements and grouping.
 * @param {Object} beer
 * @returns {string|null}
 */
export function getTrappistAbbey(beer) {
    if (!beer) return null;
    const brew = (beer.brewery || '').toLowerCase();
    const title = (beer.title || '').toLowerCase();
    const id = (beer.id || '').toLowerCase();

    // Mont des Cats is brewed at Scourmont (Chimay), check it first before scourmont brewery match
    if (brew.includes('mont des cats') || title.includes('mont des cats') || title.includes('cats') || id.includes('mont_des_cats')) return 'mont des cats';

    if (brew.includes('scourmont') || brew.includes('chimay') || title.includes('chimay') || id.includes('chimay')) return 'chimay';
    if (brew.includes('orval') || title.includes('orval') || id.includes('orval')) return 'orval';
    if (brew.includes('rochefort') || brew.includes('saint-remy') || brew.includes('saint-rémy') || title.includes('rochefort') || id.includes('rochefort')) return 'rochefort';
    if (brew.includes('westmalle') || title.includes('westmalle') || id.includes('westmalle')) return 'westmalle';
    if (brew.includes('westvleteren') || brew.includes('saint-sixte') || brew.includes('sint-sixtus') || title.includes('westvleteren') || id.includes('westvleteren')) return 'westvleteren';
    if (brew.includes('achel') || title.includes('achel') || id.includes('achel')) return 'achel';
    if (brew.includes('koningshoeven') || brew.includes('la trappe') || title.includes('la trappe') || id.includes('la_trappe')) return 'la trappe';
    if (brew.includes('zundert') || brew.includes('kievit') || title.includes('zundert') || id.includes('zundert')) return 'zundert';
    if (brew.includes('tre fontane') || brew.includes('fontane') || title.includes('tre fontane') || id.includes('tre_fontane')) return 'tre fontane';
    if (brew.includes('cardeña') || brew.includes('cardena') || title.includes('cardena') || id.includes('cardena')) return 'cardena';
    if (brew.includes('mount st') || brew.includes('tynt meadow') || title.includes('tynt meadow') || id.includes('tynt_meadow')) return 'tynt meadow';
    if (brew.includes('engelszell') || title.includes('engelszell') || title.includes('gregorius') || title.includes('benno') || title.includes('nivard') || id.includes('engelszell')) return 'engelszell';
    if (brew.includes('spencer') || title.includes('spencer') || id.includes('spencer')) return 'spencer';

    return null;
}

/**
 * Returns the HTML markup for the Trappist seal badge on beer cards.
 * Adapts dynamically to user theme variables.
 * @param {Object} beer
 * @returns {string}
 */
export function getTrappistBadgeHtml(beer) {
    if (!isTrappistBeer(beer)) return '';
    return `<div class="card-trappist-badge" title="Bière Trappiste Authentique / Authentique Produit Trappiste">
        <div class="trappist-logo-icon"></div>
    </div>`;
}

