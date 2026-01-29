/**
 * Script to apply rarity classification to all existing beers.
 * Run with: node scripts/apply-rarity.js
 */

const fs = require('fs');
const path = require('path');

// Rarity Calculation Logic (ported from autoRarity.js)
function calculateRarity(beer) {
    let score = 0;
    const title = (beer.title || '').toLowerCase();
    const brewery = (beer.brewery || '').toLowerCase();
    const type = (beer.type || '').toLowerCase();
    const abvStr = (beer.alcohol || '0').replace('%', '').replace(',', '.').replace('°', '');
    const abv = parseFloat(abvStr) || 0;

    // Distribution / Brewery Prestige
    if (brewery.match(/heineken|leffe|kronenbourg|1664|jupiler|stella|maes|bavaria|carlsberg|budweiser|grimbergen|affligem/)) {
        score -= 5;
    } else if (brewery.match(/chimay|orval|rochefort|westmalle|achel|la trappe|mont des cats|van steenberge|duvel|chouffe|brasserie d'achouffe/)) {
        score += 3;
    } else if (brewery.match(/cantillon|3 fonteinen|drie fonteinen|popihn|piggy|cloudwater|verdant|tree house|hill farmstead|bokke|boon|lindemans|girardin|)tilquin/)) {
        score += 6;
    } else if (brewery.match(/westvleteren/)) {
        score += 8;
    }

    // Type / Style
    if (type.match(/pils|lager|blonde|pale ale|blanche|weizen/)) {
        score += 0;
    } else if (type.match(/ipa|stout|porter|saison|tripel|dubbel|double|quadrupel/)) {
        score += 2;
    } else if (type.match(/sour|gose|berliner|wild|farmhouse|framboise|brut/)) {
        score += 3;
    } else if (type.match(/gueuze|lambic|kriek/)) {
        score += 5;
    } else if (type.match(/barrel aged|vieillie en f|barrique|ba |bourbon|cognac|whisky|rum/)) {
        score += 6;
    } else if (type.match(/eisbock|imperial/)) {
        score += 5;
    }

    // ABV
    if (abv > 14) {
        score += 4;
    } else if (abv > 10) {
        score += 2;
    }

    // Keywords
    if (title.includes('limited') || title.includes('limitée')) score += 2;
    if (title.includes('vintage') || title.includes('millésime')) score += 3;
    if (title.includes('anniversary') || title.includes('anniversaire')) score += 2;
    if (title.includes('blend') || title.includes('assemblage')) score += 1;
    if (title.includes('grand cru')) score += 2;
    if (title.includes('réserve') || title.includes('reserve')) score += 2;

    // Rarity determination
    let rarity = 'commun';
    if (score < 0) rarity = 'base';
    else if (score <= 3) rarity = 'commun';
    else if (score <= 6) rarity = 'rare';
    else if (score <= 9) rarity = 'super_rare';
    else if (score <= 12) rarity = 'epique';
    else if (score <= 15) rarity = 'mythique';
    else if (score <= 19) rarity = 'legendaire';
    else rarity = 'ultra_legendaire';

    return rarity;
}

// Files to process
const dataDir = path.join(__dirname, '..', 'data');
const files = [
    'belgiumbeer.json',
    'deutchbeer.json',
    'frenchbeer.json',
    'nlbeer.json',
    'usbeer.json',
    'newbeer.json'
];

let totalProcessed = 0;
const stats = {};

files.forEach(file => {
    const filePath = path.join(dataDir, file);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const beers = JSON.parse(content);

        const updated = beers.map(beer => {
            const rarity = calculateRarity(beer);
            if (!stats[rarity]) stats[rarity] = 0;
            stats[rarity]++;
            return { ...beer, rarity };
        });

        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
        console.log(`✅ Updated ${file} (${updated.length} beers)`);
        totalProcessed += updated.length;
    } catch (err) {
        console.error(`❌ Error processing ${file}:`, err.message);
    }
});

console.log(`\nTotal: ${totalProcessed} beers processed.`);
console.log('Rarity Distribution:', stats);
