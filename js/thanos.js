/**
 * thanos.js — Thanos: The Ultimate Beer Reconciliation & Deduplication Engine
 * 
 * Capabilities:
 * 1. Deep Normalization: Agglutination / CamelCase split (LaGeuze -> La Geuze),
 *    diacritics removal, style synonyms (tripel == triple, geuze == gueuze),
 *    volume standardization (330ml, 0.33L -> 33cl) and ABV standardization (11, 11%, 11° -> 11°).
 * 2. Permutation-invariant token matching (Tripel La Geuze == La Geuze Triple).
 * 3. Canonical representation builder (Title + Volume + ABV + Brewery).
 * 4. Search bar relevance scoring: guarantees finding official beers regardless of query format.
 * 5. Unique count protection: identifies N-to-1 collapsing and alerts if uniqueCount will decrease.
 * 6. Historical ID alias resolution (data/thanos_aliases.json) for 100% retroactive data safety.
 */

// ============================================================ //
//  1. Canonical Dictionaries & Rules                           //
// ============================================================ //

export const CANONICAL_SYNONYMS = {
    // Styles & Colors
    'triple': 'triple',
    'tripel': 'triple',
    'trippel': 'triple',
    'double': 'double',
    'dubbel': 'double',
    'quadrupel': 'quadrupel',
    'quad': 'quadrupel',
    'blonde': 'blond',
    'blond': 'blond',
    'brune': 'brune',
    'bruin': 'brune',
    'brown': 'brune',
    'donker': 'brune',
    'dark': 'brune',
    'blanche': 'blanche',
    'wit': 'blanche',
    'witte': 'blanche',
    'white': 'blanche',
    'witbier': 'blanche',
    'tarwebier': 'blanche',
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
    'doree': 'doree',
    'gold': 'doree',
    'golden': 'doree',
    
    // Lambic / Spontaneous / Sours
    'gueuze': 'gueuze',
    'geuze': 'gueuze',
    'lambic': 'lambic',
    'lambiek': 'lambic',
    'kriek': 'kriek',
    'framboise': 'framboise',
    'frambozen': 'framboise',
    'peche': 'peche',
    'perzik': 'peche',
    'cerise': 'cerise',
    'cassis': 'cassis',

    // Alcohol-free variants
    'sans alcool': 'zero',
    '0.0': 'zero',
    '00': 'zero',
    '0°': 'zero',
    '0%': 'zero',
    'zero': 'zero',
    'virgin': 'zero',
    'alcoholvrij': 'zero',
    'na': 'zero',
    'non alcoholic': 'zero',

    // Styles & Hop
    'ipa': 'ipa',
    'neipa': 'neipa',
    'dipa': 'dipa',
    'stout': 'stout',
    'porter': 'porter',
    'pils': 'pils',
    'pilsner': 'pils',
    'lager': 'lager',
    'saison': 'saison',
    'barleywine': 'barleywine',

    // Seasonal & Edition Variants
    'noel': 'noel',
    'kerst': 'noel',
    'christmas': 'noel',
    'winter': 'winter',
    'paques': 'paques',
    'carnaval': 'carnaval',
    'cuvee': 'cuvee',
    'reserve': 'reserve',

    // Fruits & Flavors
    'passion': 'passion',
    'mango': 'mango',
    'mangue': 'mango',
    'banana': 'banane',
    'banane': 'banane',
    'apple': 'pomme',
    'pomme': 'pomme',
    'fraise': 'fraise',
    'fraisi': 'fraise',
    'fraisee': 'fraise',
    'strawberry': 'fraise',
    'citron': 'citron',
    'lemon': 'citron',
    'lime': 'lime',
    'myrtille': 'myrtille',
    'blueberry': 'myrtille',
    'watermelon': 'pasteque',
    'melon': 'melon',
    'mure': 'mure',
    'blackberry': 'mure',
    'ananas': 'ananas',
    'pineapple': 'ananas',
    'coco': 'coco',
    'coconut': 'coco',
    'pamplemousse': 'pamplemousse',
    'grapefruit': 'pamplemousse',
    'radler': 'radler',
    'rosee': 'rosee',
    'rose': 'rosee',

    // Barrel / Aging / Infused
    'smoked': 'smoked',
    'fume': 'smoked',
    'fumee': 'smoked',
    'oaked': 'oaked',
    'bourbon': 'bourbon',
    'whisky': 'whisky',
    'whiskey': 'whisky',
    'rum': 'rum',
    'rhum': 'rum',
    'calvados': 'calvados',
    'armagnac': 'armagnac',
    'sherry': 'sherry',
    'port': 'porto',
    'porto': 'porto',
    'tequila': 'tequila',

    // Hop varieties & Single hop editions
    'citra': 'citra',
    'cashmere': 'cashmere',
    'krush': 'krush',
    'hopsinjoor': 'hopsinjoor',

    // Distinct lineup sub-brands
    'agnus': 'agnus',
    'pater': 'pater',
    'alexander': 'alexander',
    'bovengronds': 'bovengronds',
    'ondergronds': 'ondergronds',
    'cister': 'cister',
    'noctis': 'noctis',
    'heaven': 'heaven',
    'hell': 'hell',
    'silver': 'silver',
    'chrome': 'chrome',
    'nickel': 'nickel',
    'mojito': 'mojito',
    'pina': 'pina',
    'bok': 'bok',
    'bock': 'bok'
};

const STOP_WORDS = new Set([
    'la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'the', 't', 'het', 'een', 'der', 'den', 'die', 'das',
    'biere', 'beer', 'bier', 'craft', 'original', 'tradition', 'special', 'speciale',
    'blik', 'can', 'canette', 'fles', 'bouteille', 'bottle', 'fut', 'draft', 'draught'
]);

const BREWERY_AFFIXES = [
    /^brasserie\s+(de\s+|du\s+|des\s+|d\s+)?/i,
    /^brouwerij\s+/i,
    /^brewery\s+/i,
    /^abbaye\s+(de\s+|du\s+|des\s+|notre-dame\s+de\s+|d\s+)?/i,
    /^cerveceria\s+/i,
    /^micro-?brasserie\s+/i,
    /\s+brewery$/i,
    /\s+brewing(\s+co)?$/i,
    /\s+brouwerij$/i,
    /\s+brasserie$/i,
    /\s+(sa|nv|srl|bvba|gmbh|llc|inc)\.?$/i
];

const BREWERY_PARENT_GROUPS = {
    'mort subite': 'Alken-Maes',
    'cristal': 'Alken-Maes',
    'maes': 'Alken-Maes',
    'grimbergen': 'Alken-Maes',
    'alken maes': 'Alken-Maes',
    'alken-maes': 'Alken-Maes',
    'stella': 'AB InBev',
    'stella artois': 'AB InBev',
    'jupiler': 'AB InBev',
    'leffe': 'AB InBev',
    'hoegaarden': 'AB InBev',
    'ab inbev': 'AB InBev',
    'inbev': 'AB InBev',
    'desperados': 'Heineken',
    'fischer': 'Heineken',
    'heineken': 'Heineken',
    'duvel': 'Duvel Moortgat',
    'duvel moortgat': 'Duvel Moortgat',
    'chouffe': 'Duvel Moortgat',
    'achouffe': 'Duvel Moortgat',
    'vedett': 'Duvel Moortgat',
    'maredsous': 'Duvel Moortgat',
    'liefmans': 'Duvel Moortgat',
    "d'ebly": 'Ebly',
    'ebly': 'Ebly',
    'st bernardus': 'St. Bernardus',
    'st. bernardus': 'St. Bernardus',
    'watou': 'St. Bernardus',
    'bosteels': 'Bosteels',
    'bosteels brewery': 'Bosteels',
    'westmalle': 'Westmalle',
    'trappistes rochefort': 'Abbaye Notre-Dame de Saint-Remy',
    'rochefort': 'Abbaye Notre-Dame de Saint-Remy',
    'chimay': 'Bières de Chimay'
};

// ============================================================ //
//  2. Text & Agglutination Normalizer                          //
// ============================================================ //

/**
 * Splits CamelCase or letter/number transitions, and compound -bier affixes.
 * Examples:
 * "LaGeuze" -> "La Geuze"
 * "Tripel10" -> "Tripel 10"
 * "Kasteelbier" -> "Kasteel bier"
 */
export function splitAgglutinations(str) {
    if (!str) return '';
    let res = String(str)
        // CamelCase: lower followed by upper (e.g. LaGeuze -> La Geuze)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // Letter followed by digits (e.g. Rochefort8 -> Rochefort 8)
        .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
        // Digits followed by letter (e.g. 33cl -> 33 cl handled elsewhere, but e.g. 8Blond -> 8 Blond)
        .replace(/([0-9])([a-zA-Z]{3,})/g, '$1 $2');

    // Split compound -bier / -beer / -biere when attached to a brand or name (e.g. Kasteelbier -> Kasteel bier)
    res = res.replace(/\b([a-zA-Z]{4,})(bier|biere|beer)\b/gi, (match, prefix, suffix) => {
        const pLower = prefix.toLowerCase();
        if (['wit', 'tarwe', 'bok', 'oer', 'tafel', 'fruit', 'kruiden', 'kerst'].includes(pLower)) {
            return match;
        }
        return `${prefix} ${suffix}`;
    });

    return res;
}

/**
 * Deep text normalization:
 * - Un-agglutinates CamelCase
 * - Lowercases and strips accents
 * - Replaces punctuation with spaces
 * - Replaces synonyms with canonical roots
 * - Collapses spaces
 */
export function normalizeText(str) {
    if (!str) return '';
    const split = splitAgglutinations(str);
    return split
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[^a-z0-9\s]/g, ' ')     // replace symbols with spaces
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Splits an agglutinated article prefix if present (e.g. "lefort" -> "fort", "lageuze" -> "geuze").
 */
export function splitArticlePrefix(word) {
    if (!word || typeof word !== 'string') return word;
    const m = word.match(/^(le|la|de|du|van|st)([a-z]{3,})$/i);
    return m ? m[2] : word;
}

/**
 * Tokenizes a string into canonical semantic tokens (word order independent).
 * Applies synonym replacement, article un-agglutination, and filters out non-discriminant stop words.
 */
export function extractCanonicalTokens(str) {
    const norm = normalizeText(str);
    if (!norm) return [];

    const rawTokens = norm.split(' ').filter(Boolean);
    const result = [];

    // First check multi-word synonyms (e.g. "sans alcool")
    let joined = norm;
    for (const [key, canon] of Object.entries(CANONICAL_SYNONYMS)) {
        if (key.includes(' ') && joined.includes(key)) {
            result.push(canon);
            joined = joined.replace(new RegExp(key, 'g'), ' ');
        }
    }

    const remainingTokens = joined.split(' ').filter(Boolean);
    for (const rawTok of remainingTokens) {
        // Strip pure numeric tokens from title semantics (e.g. "12" from "Bush 12°")
        if (/^\d+$/.test(rawTok)) continue;

        // Resolve article prefix (e.g. "lefort" -> "fort", "lageuze" -> "geuze")
        const unprefix = splitArticlePrefix(rawTok);
        const canonical = CANONICAL_SYNONYMS[unprefix] || CANONICAL_SYNONYMS[rawTok] || unprefix;
        if (!STOP_WORDS.has(canonical) && canonical.length > 0) {
            result.push(canonical);
        }
    }

    return Array.from(new Set(result));
}

// ============================================================ //
//  3. Volume & Alcohol Standardizers                           //
// ============================================================ //

/**
 * Parses any volume expression into milliliters and standard display string.
 * Inputs: "330 ml", "33 cl", "0.33 L", "330ml", "33cl", "0.33L", "0,33L", 33, 0.33
 * Returns: { ml: 330, canonical: "33cl" }
 * Note: If no digits exist and defaultIfEmpty is false, returns { ml: 0, canonical: "" }
 */
export function parseVolumeStandard(rawVol, defaultIfEmpty = false) {
    if (rawVol === null || rawVol === undefined || rawVol === '') {
        return defaultIfEmpty ? { ml: 330, canonical: '33cl' } : { ml: 0, canonical: '' };
    }

    const s = String(rawVol).toLowerCase().replace(/\s+/g, '').replace(',', '.');
    if (!/\d/.test(s)) {
        return defaultIfEmpty ? { ml: 330, canonical: '33cl' } : { ml: 0, canonical: '' };
    }

    const match = s.match(/([0-9.]+)([a-z]*)/);
    if (!match) {
        return defaultIfEmpty ? { ml: 330, canonical: '33cl' } : { ml: 0, canonical: '' };
    }

    let val = parseFloat(match[1]);
    const unit = match[2];
    let ml = 0;

    if (!unit) {
        if (val <= 0.1) ml = Math.round(val * 1000); // 0.05 -> 50
        else if (val < 3) ml = Math.round(val * 1000); // 0.33 -> 330, 0.75 -> 750
        else if (val <= 100) ml = Math.round(val * 10); // 25 -> 250, 33 -> 330, 75 -> 750
        else ml = Math.round(val);                     // 330 -> 330, 500 -> 500
    } else if (unit === 'l') {
        ml = Math.round(val * 1000);
    } else if (unit === 'cl') {
        ml = Math.round(val * 10);
    } else if (unit === 'ml') {
        ml = Math.round(val);
    } else if (unit === 'dl') {
        ml = Math.round(val * 100);
    }

    if (ml <= 0) return defaultIfEmpty ? { ml: 330, canonical: '33cl' } : { ml: 0, canonical: '' };

    // Canonical format: under 100cl -> "Xcl", >= 100cl -> "XL"
    let canonical = '';
    if (ml >= 1000) {
        const liters = ml / 1000;
        canonical = Number.isInteger(liters) ? `${liters}L` : `${liters.toFixed(2).replace(/\.?0+$/, '')}L`;
    } else {
        const cl = ml / 10;
        canonical = Number.isInteger(cl) ? `${cl}cl` : `${cl.toFixed(1).replace(/\.?0+$/, '')}cl`;
    }

    return { ml, canonical };
}

/**
 * Parses any alcohol expression into float degree and standard string.
 * Inputs: "11°", "11%", "11", "11.0°", "11,0%", 11
 * Returns: { abv: 11.0, canonical: "11°" }
 */
export function parseAlcoholStandard(rawAlc) {
    if (rawAlc === null || rawAlc === undefined || rawAlc === '') {
        return { abv: 0, canonical: '0°' };
    }

    const s = String(rawAlc).replace(/[^0-9.,]/g, '').replace(',', '.');
    const abv = parseFloat(s) || 0;
    const rounded = Math.round(abv * 10) / 10;
    const canonical = Number.isInteger(rounded) ? `${rounded}°` : `${rounded.toFixed(1)}°`;

    return { abv: rounded, canonical };
}

// ============================================================ //
//  4. Brewery Normalizer                                       //
// ============================================================ //

/**
 * Normalizes a brewery name:
 * Strips corporate affixes, resolves parent company groups.
 */
export function normalizeBrewery(rawBrewery) {
    if (!rawBrewery) return '';
    let name = rawBrewery.trim();

    // Check parent groups first (case-insensitive)
    const lower = name.toLowerCase();
    for (const [key, group] of Object.entries(BREWERY_PARENT_GROUPS)) {
        if (lower === key || lower.startsWith(key + ' ') || lower.endsWith(' ' + key)) {
            return group;
        }
    }

    // Strip affixes
    for (const regex of BREWERY_AFFIXES) {
        name = name.replace(regex, '');
    }

    return name.trim() || rawBrewery.trim();
}

// ============================================================ //
//  5. Canonical Representation Builder                         //
// ============================================================ //

/**
 * Builds the canonical gold-standard representation of a beer:
 * e.g. "Triple LaGeuze 33cl 11° BRASSERIE"
 */
export function buildCanonicalBeer(beer) {
    const titleTokens = extractCanonicalTokens(beer.title || '');
    const cleanTitle = (beer.title || '').trim();
    const vol = parseVolumeStandard(beer.volume, true);
    const alc = parseAlcoholStandard(beer.alcohol || beer.degree);
    const brewery = normalizeBrewery(beer.brewery || '');

    // Canonical ID: Upper snake case of essential tokens + volume in cl + abv
    const tokenPart = titleTokens.slice(0, 4).map(t => t.toUpperCase()).join('_');
    const canonicalId = `${tokenPart || 'BEER'}_${vol.canonical.toUpperCase()}_${alc.canonical.replace('°', '')}`;

    const canonicalDisplay = `${cleanTitle} ${vol.canonical} ${alc.canonical} ${brewery.toUpperCase()}`.trim();

    return {
        ...beer,
        canonicalId,
        canonicalDisplay,
        standardVolume: vol.canonical,
        standardVolumeMl: vol.ml,
        standardAlcohol: alc.canonical,
        standardAbv: alc.abv,
        standardBrewery: brewery,
        tokens: titleTokens
    };
}

// ============================================================ //
//  6. Similarity & Matching Engine                             //
// ============================================================ //

/**
 * Calculates similarity between two strings via Jaccard on tokens + Levenshtein.
 */
function tokenJaccard(tokensA, tokensB) {
    if (tokensA.length === 0 && tokensB.length === 0) return 1;
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersection = 0;
    for (const t of setA) {
        if (setB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
}

function levenshteinSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const la = a.length;
    const lb = b.length;
    const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));

    for (let i = 0; i <= la; i++) dp[i][0] = i;
    for (let j = 0; j <= lb; j++) dp[0][j] = j;

    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    const maxLen = Math.max(la, lb);
    return maxLen === 0 ? 1 : 1 - dp[la][lb] / maxLen;
}

const ALL_VARIANT_KEYWORDS = new Set([
    'blond', 'brune', 'blanche', 'ambree', 'rouge', 'noire', 'doree',
    'kriek', 'framboise', 'peche', 'cerise', 'cassis',
    'zero', 'triple', 'quadrupel', 'double',
    'ipa', 'neipa', 'dipa', 'stout', 'porter', 'pils', 'saison', 'barleywine',
    'noel', 'winter', 'paques', 'carnaval', 'cuvee', 'reserve',
    'passion', 'mango', 'banane', 'pomme', 'fraise', 'citron', 'lime', 'myrtille', 'pasteque', 'melon', 'mure', 'ananas', 'coco', 'pamplemousse', 'radler', 'rosee',
    'smoked', 'oaked', 'bourbon', 'whisky', 'rum', 'calvados', 'armagnac', 'sherry', 'porto', 'tequila',
    'citra', 'cashmere', 'krush', 'hopsinjoor',
    'agnus', 'pater', 'alexander', 'bovengronds', 'ondergronds', 'cister', 'noctis', 'heaven', 'hell',
    'silver', 'chrome', 'nickel', 'mojito', 'pina', 'bok',
    'chocolat', 'chocolate', 'bio', 'biologique', 'talus'
]);

/**
 * Detects if two beer titles have a genuine variant conflict (different colors/flavors/types).
 * If one title specifies a variant that the other doesn't, or specifies a different one,
 * they MUST NOT be merged.
 */
export function hasVariantConflict(beerA, beerB) {
    // 0. Founder / Creator protection: never deduplicate founder beers
    if (beerA.rarity_rank === 'Fondateur' || beerB.rarity_rank === 'Fondateur' ||
        beerA.brewery === 'Noah & Dorian' || beerB.brewery === 'Noah & Dorian') {
        return true;
    }

    // Version tags (e.g. v0, v1, v2, batch 1, etc.)
    const getVersionTag = (title) => {
        const m = String(title).match(/\b(v\d+|batch\s*\d+|edition\s*\d+)\b/i);
        return m ? m[1].toLowerCase().replace(/\s+/g, '') : null;
    };
    const verA = getVersionTag(beerA.title);
    const verB = getVersionTag(beerB.title);
    if (verA !== verB && (verA || verB)) {
        return true;
    }

    const textA = `${beerA.title || ''} ${beerA.type || ''}`;
    const textB = `${beerB.title || ''} ${beerB.type || ''}`;
    const tokensA = extractCanonicalTokens(textA);
    const tokensB = extractCanonicalTokens(textB);

    const varA = new Set(tokensA.filter(t => ALL_VARIANT_KEYWORDS.has(t)));
    const varB = new Set(tokensB.filter(t => ALL_VARIANT_KEYWORDS.has(t)));

    // If one has variant keywords that the other doesn't have, it's a conflict
    for (const v of varA) {
        if (!varB.has(v)) return true;
    }
    for (const v of varB) {
        if (!varA.has(v)) return true;
    }

    return false;
}

/**
 * Detects if two beer titles have contradictory series numbers (e.g. Rochefort 6 vs Rochefort 10).
 * Prevents false-positive merging across numbered lineup beers.
 */
export function hasNumberConflict(beerA, beerB) {
    const getSeriesNumbers = (beer) => {
        const title = (beer.title || '').replace(/\b(19|20)\d{2}\b/g, ''); // ignore vintage years
        // Remove explicit volume measurements (e.g. 33cl, 75cl, 330ml, 0.33l)
        const clean = title.replace(/\b\d+(\.\d+)?\s*(cl|ml|l|g|kg)\b/gi, '');
        const matches = clean.match(/\b\d+(\.\d+)?\b/g);
        if (!matches) return [];
        return matches.map(n => parseFloat(n)).filter(n => !isNaN(n));
    };

    const numsA = getSeriesNumbers(beerA);
    const numsB = getSeriesNumbers(beerB);

    if (numsA.length > 0 && numsB.length > 0) {
        const setB = new Set(numsB);
        const hasCommon = numsA.some(n => setB.has(n));
        if (!hasCommon) return true;
    }

    // Specific case: one title has 9000 or 6.66, but the other does not
    if ((numsA.includes(9000) && !numsB.includes(9000)) || (numsB.includes(9000) && !numsA.includes(9000))) {
        return true;
    }
    if ((numsA.includes(6.66) && !numsB.includes(6.66)) || (numsB.includes(6.66) && !numsA.includes(6.66))) {
        return true;
    }

    return false;
}

/**
 * Thanos Match: Evaluates if beerA and beerB are the exact same beer.
 * Returns { isMatch, score (0-100), reasons, impact }
 */
export function matchBeers(beerA, beerB) {
    if (!beerA || !beerB) return { isMatch: false, score: 0, reasons: [] };

    // 1. Variant conflict check (absolute veto)
    if (hasVariantConflict(beerA, beerB)) {
        return { isMatch: false, score: 0, reasons: ['Variant/flavor conflict'] };
    }

    // 2. Series number conflict check (e.g. 6 vs 8 vs 10 in Rochefort, Fort Lapin, etc.)
    if (hasNumberConflict(beerA, beerB)) {
        return { isMatch: false, score: 0, reasons: ['Series number conflict'] };
    }

    // 3. Barcode match (instant 100% win if present and matching)
    if (beerA.barcode && beerB.barcode && String(beerA.barcode).trim() === String(beerB.barcode).trim()) {
        return { isMatch: true, score: 100, reasons: ['Exact EAN/Barcode match'] };
    }

    const canonA = buildCanonicalBeer(beerA);
    const canonB = buildCanonicalBeer(beerB);

    // 4. Alcohol difference check (e.g. 0.0% vs regular 5% pils, or ABV delta > 1.2°)
    if (canonA.standardAbv !== undefined && canonB.standardAbv !== undefined) {
        if ((canonA.standardAbv <= 0.5 && canonB.standardAbv >= 1.2) || (canonB.standardAbv <= 0.5 && canonA.standardAbv >= 1.2)) {
            return { isMatch: false, score: 0, reasons: ['Alcohol vs Non-alcoholic conflict'] };
        }
        if (canonA.standardAbv > 0 && canonB.standardAbv > 0 && Math.abs(canonA.standardAbv - canonB.standardAbv) > 1.2) {
            return { isMatch: false, score: 0, reasons: ['Large ABV delta (> 1.2°)'] };
        }
    }

    // 5. Title similarity (Permutation invariant via tokens + Levenshtein)
    const jaccard = tokenJaccard(canonA.tokens, canonB.tokens);
    const leven = levenshteinSimilarity(normalizeText(beerA.title), normalizeText(beerB.title));
    const titleScore = Math.max(jaccard, leven);

    // If title has virtually no similarity, reject early
    if (titleScore < 0.35) {
        return { isMatch: false, score: Math.round(titleScore * 100), reasons: ['Title similarity too low'] };
    }

    // 5. Brewery similarity
    const brewA = canonA.standardBrewery.toLowerCase();
    const brewB = canonB.standardBrewery.toLowerCase();
    let brewScore = 0.5; // neutral if missing
    if (brewA && brewB) {
        if (brewA === brewB) brewScore = 1.0;
        else brewScore = Math.max(tokenJaccard([brewA], [brewB]), levenshteinSimilarity(brewA, brewB));
    }

    // 6. Alcohol degree delta
    let degreeScore = 0.8;
    if (canonA.standardAbv > 0 && canonB.standardAbv > 0) {
        const delta = Math.abs(canonA.standardAbv - canonB.standardAbv);
        if (delta === 0) degreeScore = 1.0;
        else if (delta <= 0.5) degreeScore = 0.85;
        else if (delta <= 1.5) degreeScore = 0.5;
        else degreeScore = 0.1; // Large ABV difference
    }

    // 7. Volume match
    let volumeScore = 0.8;
    if (canonA.standardVolumeMl > 0 && canonB.standardVolumeMl > 0) {
        if (canonA.standardVolumeMl === canonB.standardVolumeMl) volumeScore = 1.0;
        else volumeScore = 0.5; // different container size of same beer
    }

    // Weighted aggregate score
    let total = (titleScore * 0.55) + (brewScore * 0.25) + (degreeScore * 0.10) + (volumeScore * 0.10);

    // Substring / Agglutinated containment bonus
    const normA = normalizeText(beerA.title);
    const normB = normalizeText(beerB.title);
    const noSpaceA = normA.replace(/\s+/g, '');
    const noSpaceB = normB.replace(/\s+/g, '');
    if ((normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA))) ||
        (noSpaceA.length >= 4 && noSpaceB.length >= 4 && (noSpaceA.includes(noSpaceB) || noSpaceB.includes(noSpaceA)))) {
        total = Math.max(total, 0.85);
    }

    const finalScore = Math.round(total * 100);
    const isMatch = finalScore >= 68;

    return {
        isMatch,
        score: finalScore,
        canonA,
        canonB,
        reasons: [
            `Title: ${Math.round(titleScore * 100)}%`,
            `Brewery: ${Math.round(brewScore * 100)}%`,
            `ABV: ${Math.round(degreeScore * 100)}%`,
            `Volume: ${Math.round(volumeScore * 100)}%`
        ]
    };
}

// ============================================================ //
//  7. Search Bar Relevance Scorer                              //
// ============================================================ //

/**
 * Scores a beer against a user query for the Search Bar.
 * Guarantees that:
 * - Order permutation matches ("karmeliet tripel" finds "TRIPEL KARMELIET" at top score)
 * - Synonyms match ("geuze" finds "Gueuze", "triple" finds "Tripel")
 * - Agglutinations match ("Triple Le Fort" finds "LEFORT TRIPLE" and "Le Fort Tripel" tied at top)
 * - Volume / ABV query components match volume & alcohol fields ("stella 33cl", "rochefort 10 11.3%")
 * - Barcode or exact ID matches top the search with 1000 pts.
 * - Non-matching beers receive 0 pts and are not shown.
 */
export function scoreSearchRelevance(beer, rawQuery) {
    if (!rawQuery || !rawQuery.trim()) return 1;

    const query = rawQuery.trim();
    const normQuery = normalizeText(query);
    const queryTokens = extractCanonicalTokens(query);

    // 1. Direct Barcode or ID Match
    if (beer.barcode && beer.barcode === query) return 1000;
    if (beer.id && beer.id.toUpperCase() === query.toUpperCase()) return 900;

    const canon = buildCanonicalBeer(beer);
    const normTitle = normalizeText(beer.title);
    const normBrewery = normalizeText(beer.brewery);

    let score = 0;

    // 2. Exact Title Match
    if (normTitle === normQuery) score += 300;
    else if (normTitle.startsWith(normQuery)) score += 150;
    else if (normTitle.includes(normQuery)) score += 80;

    // Agglutinated containment check (e.g. "le fort" matching "lefort")
    const cleanQueryNoSpaces = normQuery.replace(/\s+/g, '');
    const cleanTitleNoSpaces = normTitle.replace(/\s+/g, '');
    if (cleanTitleNoSpaces === cleanQueryNoSpaces) {
        score += 250;
    } else if (cleanTitleNoSpaces.startsWith(cleanQueryNoSpaces)) {
        score += 120;
    } else if (cleanTitleNoSpaces.includes(cleanQueryNoSpaces) && cleanQueryNoSpaces.length >= 5) {
        score += 60;
    }

    // 4. Token Overlap & Permutations
    let tokensMatched = 0;
    for (const qTok of queryTokens) {
        let tokenHit = false;

        // Matches beer title token (stem or canonical)
        if (canon.tokens.includes(qTok)) {
            score += 40;
            tokenHit = true;
        } else if (normTitle.includes(qTok)) {
            score += 20;
            tokenHit = true;
        } else if (normBrewery.includes(qTok)) {
            score += 15;
            tokenHit = true;
        } else if (/\d/.test(qTok)) {
            // ONLY check volume or alcohol if the token actually contains digits!
            const qVol = parseVolumeStandard(qTok);
            if (qVol.ml > 0 && qVol.ml === canon.standardVolumeMl) {
                score += 35;
                tokenHit = true;
            }
            const qAlc = parseAlcoholStandard(qTok);
            if (qAlc.abv > 0 && Math.abs(qAlc.abv - canon.standardAbv) <= 0.2) {
                score += 35;
                tokenHit = true;
            }
        }

        // Levenshtein fallback on title tokens for typos (min length 4)
        if (!tokenHit && qTok.length >= 4) {
            for (const bTok of canon.tokens) {
                if (bTok.length >= 4 && levenshteinSimilarity(qTok, bTok) >= 0.72) {
                    score += 15;
                    tokenHit = true;
                    break;
                }
            }
        }

        if (tokenHit) tokensMatched++;
    }

    // ZERO SCORE if no tokens matched and no exact/substring title match
    if (tokensMatched === 0 && score === 0) {
        return 0;
    }

    // All query tokens matched bonus (essential for "Tripel Karmeliet" / "Karmeliet Tripel")
    if (queryTokens.length > 0 && tokensMatched === queryTokens.length) {
        score += 80;
    }

    // Coverage bonus: ratio of beer tokens covered (promotes concise exact matches over wordy names)
    if (canon.tokens.length > 0 && tokensMatched > 0) {
        const coverage = tokensMatched / canon.tokens.length;
        score += Math.round(coverage * 50);
    }

    // Brewery Match Bonus
    if (normBrewery && (normBrewery.includes(normQuery) || (normQuery.length >= 4 && normBrewery.includes(normQuery)))) {
        score += 30;
    }

    return score;
}

// ============================================================ //
//  8. Unique Count Protection & Deduplication Wizard Engine    //
// ============================================================ //

/**
 * Compares custom beers against official beers and generates actionable migration prompts
 * with full transparency on the impact on the unique beer count.
 */
export function findCustomMatchesWithSafety(customBeers, officialBeers, userData = {}) {
    if (!customBeers || !officialBeers) return [];

    const matches = [];
    const usedOfficialIds = new Set();

    for (const custom of customBeers) {
        let bestMatch = null;
        let bestScore = 0;
        let matchReasons = [];

        for (const official of officialBeers) {
            if (String(official.id).startsWith('CUSTOM_')) continue;

            const res = matchBeers(custom, official);
            if (res.isMatch && res.score > bestScore) {
                bestScore = res.score;
                bestMatch = official;
                matchReasons = res.reasons;
            }
        }

        if (bestMatch && bestScore >= 68) {
            const officialData = userData[bestMatch.id] || {};
            const alreadyInDex = Boolean((officialData.count || 0) > 0 || officialData.score !== undefined || officialData.favorite);
            
            // Impact: If already in dex, merging collapses 2 unique entries into 1 (-1).
            // If NOT in dex, it's a 1-to-1 transfer, unique count is preserved (0).
            const uniqueImpact = alreadyInDex ? -1 : 0;
            const isCollidingWithPreviousMatch = usedOfficialIds.has(bestMatch.id);

            matches.push({
                customBeer: custom,
                officialBeer: bestMatch,
                score: bestScore,
                reasons: matchReasons,
                alreadyInDex,
                officialExistingCount: officialData.count || 0,
                uniqueImpact,
                isCollisionRisk: isCollidingWithPreviousMatch,
                canonicalDisplay: buildCanonicalBeer(bestMatch).canonicalDisplay
            });

            usedOfficialIds.add(bestMatch.id);
        }
    }

    return matches;
}

// ============================================================ //
//  9. Catalog Duplicate Scanner (Fast Indexer for Deduplicator) //
// ============================================================ //

/**
 * Evaluates the quality and canonical eligibility of a beer.
 * Higher score = more canonical.
 * Strictly penalizes generic words "bier / biere / beer" and container words "blik / canette".
 */
export function scoreBeerQuality(beer) {
    if (!beer) return -999;
    let score = 0;
    const t = (beer.title || '').toLowerCase();

    // Rule: Avoid generic "bier / biere / beer" in title (e.g. Kasteel Rouge > Kasteelbier Rouge)
    if (/\b(biere|bier|beer)\b/i.test(t) || /([a-z]{4,})(bier|biere|beer)\b/i.test(t)) {
        score -= 30;
    } else {
        score += 30;
    }

    // Container suffix penalty (e.g. "Blik", "Canette", "Fles" should be dropped in favor of clean title)
    if (/\b(blik|canette|can|fles|bouteille|bottle)\b/i.test(t)) {
        score -= 20;
    }

    if (beer.barcode) score += 10;
    if (beer.image && !beer.image.includes('default')) score += 5;
    if (beer.description && beer.description.length > 10) score += 3;
    const isUpper = beer.title === beer.title.toUpperCase() && /[a-z]/i.test(beer.title);
    if (!isUpper) score += 2;
    if (beer.country) score += 1;
    if (beer.rating || beer.community_rating) score += 1;
    if (beer.id) score += Math.max(0, 5 - (beer.id.length / 20));

    return score;
}

/**
 * Fast catalog duplicate scanner using inverted token and brewery indexing.
 * Scans thousands of beers in milliseconds, forms connected duplicate clusters,
 * picks the single best canonical target per cluster (favoring titles without "bier" or container suffixes),
 * and marks all other duplicates in the cluster for deletion.
 * Returns array of { customBeer (to delete), officialBeer (to keep), score, reasons, isOfficialDupe: true }
 */
export function findCatalogDuplicatesFast(officialBeers, minScore = 80) {
    if (!officialBeers || officialBeers.length < 2) return [];

    const beerById = new Map();
    const tokenIndex = new Map();
    for (const beer of officialBeers) {
        if (!beer || !beer.id || String(beer.id).startsWith('CUSTOM_')) continue;
        beerById.set(beer.id, beer);
        const tokens = extractCanonicalTokens(beer.title || '');
        const brewery = normalizeBrewery(beer.brewery || '').toLowerCase();

        if (brewery) {
            const key = `brew:${brewery}`;
            if (!tokenIndex.has(key)) tokenIndex.set(key, []);
            tokenIndex.get(key).push(beer);
        }
        for (const t of tokens) {
            if (t.length >= 3) {
                const key = `tok:${t}`;
                if (!tokenIndex.has(key)) tokenIndex.set(key, []);
                tokenIndex.get(key).push(beer);
            }
        }
    }

    const seenPairs = new Set();
    const adj = new Map();

    for (const [, group] of tokenIndex.entries()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];
                if (a.id === b.id) continue;
                const pairKey = a.id < b.id ? `${a.id}__${b.id}` : `${b.id}__${a.id}`;
                if (seenPairs.has(pairKey)) continue;
                seenPairs.add(pairKey);

                const res = matchBeers(a, b);
                if (res.isMatch && res.score >= minScore) {
                    if (!adj.has(a.id)) adj.set(a.id, []);
                    if (!adj.has(b.id)) adj.set(b.id, []);
                    adj.get(a.id).push({ peer: b, score: res.score, reasons: res.reasons });
                    adj.get(b.id).push({ peer: a, score: res.score, reasons: res.reasons });
                }
            }
        }
    }

    // Form connected components (clusters of duplicates)
    const visited = new Set();
    const duplicates = [];

    for (const id of adj.keys()) {
        if (visited.has(id)) continue;
        const cluster = [];
        const queue = [id];
        visited.add(id);

        while (queue.length > 0) {
            const currId = queue.shift();
            const currBeer = beerById.get(currId);
            if (currBeer) cluster.push(currBeer);

            for (const neighbor of adj.get(currId) || []) {
                if (!visited.has(neighbor.peer.id)) {
                    visited.add(neighbor.peer.id);
                    queue.push(neighbor.peer.id);
                }
            }
        }

        if (cluster.length < 2) continue;

        // Sort cluster by quality score descending -> cluster[0] is the canonical winner
        cluster.sort((a, b) => scoreBeerQuality(b) - scoreBeerQuality(a));
        const canonicalWinner = cluster[0];

        // All other beers in the cluster are marked for deletion
        for (let i = 1; i < cluster.length; i++) {
            const dropBeer = cluster[i];
            const matchInfo = matchBeers(dropBeer, canonicalWinner);
            duplicates.push({
                customBeer: dropBeer, // Item to delete
                officialBeer: canonicalWinner, // Canonical item to keep
                score: Math.max(matchInfo.score, minScore),
                reasons: matchInfo.reasons,
                isOfficialDupe: true,
                canonicalDisplay: buildCanonicalBeer(canonicalWinner).canonicalDisplay
            });
        }
    }

    return duplicates;
}

/**
 * Scans the official beer list for internal duplicates across datasets (legacy QA Lab helper).
 */
export function scanCatalogDuplicates(allBeers, minScore = 75) {
    return findCatalogDuplicatesFast(allBeers, minScore).map(d => ({
        a: d.customBeer,
        b: d.officialBeer,
        score: d.score,
        reason: d.reasons.join(', ')
    }));
}

