/**
 * Auto Rarity Detection Module for Beerdex
 * Uses heuristics based on distribution, type, abv, and keywords.
 */

/*
    Rarity Levels:
    - base (Gris)
    - commun (Vert)
    - rare (Bleu)
    - super_rare (Cyan)
    - epique (Violet)
    - mythique (Rouge)
    - legendaire (Orange)
    - ultra_legendaire (Gradient)
    - fondateur (Or/Platine) -> Non-auto (Hardcoded uniquement pour les bières des fondateurs)
*/

export function calculateRarity(beer) {
    let score = 0;
    const reasons = [];

    const title = (beer.title || '').toLowerCase();
    const brewery = (beer.brewery || '').toLowerCase();
    const type = (beer.type || '').toLowerCase();
    const abvStr = (beer.alcohol || '0').replace('%', '').replace(',', '.');
    const abv = parseFloat(abvStr) || 0;

    // --- 1. Distribution / Brewery Prestige (Base Score) ---
    // Mass Market -> Negative
    if (brewery.match(/heineken|leffe|kronenbourg|1664|jupiler|stella|maes|bavaria|carlsberg|budweiser|desperados|grimbergen|affligem|hoegaarden/)) {
        score -= 5;
        reasons.push("Brasserie Industrielle (-5)");
    }
    // Classic Belgian/Trappist -> Bonus
    else if (brewery.match(/chimay|orval|rochefort|westmalle|achel|la trappe|mont des cats/)) {
        score += 3;
        reasons.push("Trappiste Classique (+3)");
    }
    // High Prestige / Craft Hype -> Big Bonus
    else if (brewery.match(/cantillon|3 fonteinen|drie fonteinen|popihn|piggy|cloudwater|verdant|tree house|hill farmstead|bokke/)) {
        score += 6;
        reasons.push("Brasserie Hype/Prestige (+6)");
    }
    // Ultra Exclusive
    else if (brewery.match(/westvleteren/)) {
        score += 8;
        reasons.push("Trappiste Exclusive (+8)");
    }
    // Small / Craft (Not Mass Market) -> Bonus
    else {
        score += 2;
        // reasons.push("Brasserie Indépendante (+2)"); 
    }

    // --- 2. Type / Style ---
    if (type.match(/pils|lager|blonde|pale ale|blanche|weizen/)) {
        score += 0; // Neutral
    }
    else if (type.match(/ipa|stout|porter|saison|tripel|double|quadrupel|abbaye|trappiste/)) {
        score += 2;
        reasons.push("Style Craft Standard (+2)");
    }
    else if (type.match(/sour|gose|berliner|wild|farmhouse/)) {
        score += 3;
        reasons.push("Style Fermentation Mixte/Sauvage (+3)");
    }
    else if (type.match(/gueuze|lambic|kriek (traditionnelle)/)) {
        score += 5;
        reasons.push("Lambic/Gueuze (+5)");
    }
    else if (type.match(/barrel aged|vieillie en f|barrique|ba /)) {
        score += 6;
        reasons.push("Vieillissement Barrique (+6)");
    }
    else if (type.match(/eisbock/)) {
        score += 5;
        reasons.push("Eisbock (+5)");
    }

    // --- 3. ABV ---
    if (abv > 14) {
        score += 4;
        reasons.push("Alcool Extrême > 14% (+4)");
    } else if (abv > 10) {
        score += 2;
        reasons.push("Alcool Fort > 10% (+2)");
    } else if (abv > 6.5) {
        score += 1;
        reasons.push("Alcool Soutenu > 6.5% (+1)");
    }

    // --- 4. Keywords ---
    if (title.includes('limited') || title.includes('limitée')) {
        score += 2;
        reasons.push("Édition Limitée (+2)");
    }
    if (title.includes('vintage') || title.includes('millésime')) {
        score += 3;
        reasons.push("Millésimée (+3)");
    }
    if (title.includes('anniversary') || title.includes('anniversaire')) {
        score += 2;
        reasons.push("Anniversaire (+2)");
    }
    if (title.includes('blend') || title.includes('assemblage')) {
        score += 1;
        reasons.push("Assemblage (+1)");
    }
    if (title.includes('grand cru')) {
        score += 2;
        reasons.push("Grand Cru (+2)");
    }

    // --- 5. Rarity determination ---
    // Scale:
    // < 0   : Base
    // 0-3   : Commun
    // 4-6   : Rare
    // 7-9   : Super Rare
    // 10-12 : Epique
    // 13-15 : Mythique
    // 16-19 : Legendaire
    // 20+   : Ultra Legendaire

    let rarity = 'commun';
    if (score < 0) rarity = 'base';
    else if (score <= 3) rarity = 'commun';
    else if (score <= 6) rarity = 'rare';
    else if (score <= 9) rarity = 'super_rare';
    else if (score <= 12) rarity = 'epique';
    else if (score <= 15) rarity = 'mythique';
    else if (score <= 19) rarity = 'legendaire';
    else rarity = 'ultra_legendaire';

    return {
        score,
        rarity,
        reasons
    };
}

// ============================== //
// Dynamic Import Rarity System   //
// ============================== //

/**
 * Rarity tier hierarchy (lowest to highest).
 * Used for rank promotion when import bonus is applied.
 */
const RARITY_RANKS = [
    'base',           // 0
    'commun',         // 1
    'rare',           // 2
    'super_rare',     // 3
    'epique',         // 4
    'mythique',       // 5
    'legendaire',     // 6
    'ultra_legendaire' // 7
];

/**
 * Geographic proximity groups for import bonus calculation.
 * Countries in the same group are "neighbors" (low/no bonus).
 * Countries in different groups get higher bonuses.
 */
const GEO_GROUPS = {
    // Western Europe (close neighbors)
    'BE': 'eu_west', 'FR': 'eu_west', 'NL': 'eu_west', 'DE': 'eu_west',
    'LU': 'eu_west', 'GB': 'eu_west', 'IE': 'eu_west', 'DK': 'eu_west',
    // Southern Europe
    'IT': 'eu_south', 'ES': 'eu_south', 'PT': 'eu_south',
    // Americas
    'US': 'americas', 'CO': 'americas', 'BR': 'americas', 'MX': 'americas', 'CA': 'americas',
    // East Asia
    'JP': 'east_asia', 'KR': 'east_asia', 'CN': 'east_asia', 'TW': 'east_asia',
    // Oceania
    'AU': 'oceania', 'NZ': 'oceania'
};

/**
 * Returns the import bonus (number of rarity ranks to add) based on
 * the distance between beer origin country and user country.
 * 
 * @param {string} beerCountry - ISO country code of the beer's origin (e.g. 'JP')
 * @param {string} userCountry - ISO country code of the user (e.g. 'BE')
 * @returns {{ bonus: number, reason: string|null }}
 */
export function getImportBonus(beerCountry, userCountry) {
    if (!beerCountry || !userCountry) return { bonus: 0, reason: null };
    
    const bc = beerCountry.toUpperCase();
    const uc = userCountry.toUpperCase();
    
    // Same country = no bonus
    if (bc === uc) return { bonus: 0, reason: null };
    
    const beerGroup = GEO_GROUPS[bc];
    const userGroup = GEO_GROUPS[uc];
    
    // If either country is unknown, give a small default bonus
    if (!beerGroup || !userGroup) return { bonus: 1, reason: 'import_unknown' };
    
    // Same geographic group (e.g. both Western Europe)
    if (beerGroup === userGroup) {
        return { bonus: 1, reason: 'import_neighbor' };
    }
    
    // Adjacent groups (e.g. Western Europe ↔ Southern Europe, or East Asia ↔ East Asia)
    const ADJACENT_PAIRS = [
        ['eu_west', 'eu_south'],
        ['americas', 'americas'], // already same group, shouldn't reach here
    ];
    
    const isAdjacent = ADJACENT_PAIRS.some(([a, b]) => 
        (beerGroup === a && userGroup === b) || (beerGroup === b && userGroup === a)
    );
    
    if (isAdjacent) {
        return { bonus: 1, reason: 'import_close' };
    }
    
    // Different continents / distant groups (e.g. EU ↔ Asia, EU ↔ Americas)
    // These get the largest bonus
    const isIntercontinental = (
        (beerGroup.startsWith('eu') && !userGroup.startsWith('eu')) ||
        (!beerGroup.startsWith('eu') && userGroup.startsWith('eu')) ||
        (beerGroup === 'east_asia' && userGroup === 'americas') ||
        (beerGroup === 'americas' && userGroup === 'east_asia')
    );
    
    if (isIntercontinental) {
        return { bonus: 3, reason: 'import_intercontinental' };
    }
    
    // Default for other distant combinations
    return { bonus: 2, reason: 'import_distant' };
}

/**
 * Promotes a rarity by N ranks, capped at ultra_legendaire.
 * 
 * @param {string} baseRarity - Original rarity string (e.g. 'commun')
 * @param {number} ranks - Number of ranks to promote
 * @returns {string} Promoted rarity string
 */
export function promoteRarity(baseRarity, ranks) {
    if (ranks <= 0) return baseRarity;
    const currentIndex = RARITY_RANKS.indexOf(baseRarity);
    if (currentIndex < 0) return baseRarity; // Unknown rarity, return as-is
    const newIndex = Math.min(currentIndex + ranks, RARITY_RANKS.length - 1);
    return RARITY_RANKS[newIndex];
}

/**
 * Computes the effective (dynamic) rarity for a beer given the user's country.
 * Returns the base rarity if no import bonus applies.
 * 
 * @param {Object} beer - Beer object with countryCode and rarity fields
 * @param {string} userCountry - ISO country code of the user
 * @returns {{ rarity: string, baseRarity: string, importBonus: number, importReason: string|null }}
 */
export function getDynamicBeerRarity(beer, userCountry) {
    const baseRarity = beer.rarity || 'commun';
    const beerCountry = beer.countryCode || '';
    
    const { bonus, reason } = getImportBonus(beerCountry, userCountry);
    
    if (bonus <= 0) {
        return { rarity: baseRarity, baseRarity, importBonus: 0, importReason: null };
    }
    
    const promotedRarity = promoteRarity(baseRarity, bonus);
    
    return {
        rarity: promotedRarity,
        baseRarity,
        importBonus: bonus,
        importReason: reason
    };
}
