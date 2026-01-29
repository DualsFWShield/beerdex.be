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
