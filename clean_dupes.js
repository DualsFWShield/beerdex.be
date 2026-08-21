const fs = require('fs');
const path = require('path');

const dupesText = fs.readFileSync('dupes.txt', 'utf8');
const lines = dupesText.split('\n');

const files = {
    'belgiumbeer.json': JSON.parse(fs.readFileSync('data/belgiumbeer.json')),
    'frenchbeer.json': JSON.parse(fs.readFileSync('data/frenchbeer.json')),
    'deutchbeer.json': JSON.parse(fs.readFileSync('data/deutchbeer.json')),
    'newbeer.json': JSON.parse(fs.readFileSync('data/newbeer.json'))
};

function scoreBeer(b) {
    let score = 0;
    if (b.ingredients && b.ingredients.length > 3) score += 2;
    if (b.barcode) score += 5;
    if (b.community_rating) score += 2;
    if (b.rarity && b.rarity !== 'base') score += 1;
    if (b.image && !b.image.includes('default')) score += 3;
    if (b.description && b.description.length > 10) score += 3;
    return score;
}

const toRemove = []; 

for (const line of lines) {
    // Example: [75%] "STELLA" (belgiumbeer.json) <-> "Stella Artois" (newbeer.json)
    const regex = /\[\d+%\] "(.*?)" \((.*?)\) <-> "(.*?)" \((.*?)\)/;
    const m = line.match(regex);
    if (m) {
        const [_, title1, file1, title2, file2] = m;
        const b1 = files[file1].find(b => b.title.toLowerCase() === title1.toLowerCase());
        const b2 = files[file2].find(b => b.title.toLowerCase() === title2.toLowerCase());
        
        if (b1 && b2 && b1.id !== b2.id) {
            // Don't merge Alcohol free vs Normal
            const isZero1 = b1.title.includes('0°') || b1.title.includes('0.0') || b1.title.toLowerCase().includes('alcoholvrij') || b1.title.toLowerCase().includes('virgin') || (b1.alcohol === '0' || b1.alcohol === '0%');
            const isZero2 = b2.title.includes('0°') || b2.title.includes('0.0') || b2.title.toLowerCase().includes('alcoholvrij') || b2.title.toLowerCase().includes('virgin') || (b2.alcohol === '0' || b2.alcohol === '0%');
            
            if (isZero1 !== isZero2) {
                console.log(`Skipping zero alcohol variant: ${b1.title} vs ${b2.title}`);
                continue;
            }

            // Don't merge explicitly different flavor variants (e.g. Kriek vs Pêche, Triple vs Double, Rouge vs Blonde)
            const flavors = ['rouge', 'blanche', 'blonde', 'brune', 'ambrée', 'kriek', 'pêche', 'framboise', 'triple', 'double', 'quadrupel', 'ipa'];
            const t1 = b1.title.toLowerCase();
            const t2 = b2.title.toLowerCase();
            let variantConflict = false;
            for (let f of flavors) {
                if (t1.includes(f) && !t2.includes(f)) variantConflict = true;
                if (!t1.includes(f) && t2.includes(f)) variantConflict = true;
            }
            if (variantConflict) {
                console.log(`Skipping potential variant conflict: ${b1.title} vs ${b2.title}`);
                continue;
            }

            const score1 = scoreBeer(b1);
            const score2 = scoreBeer(b2);
            
            if (score1 >= score2) {
                toRemove.push({ file: file2, id: b2.id, title: b2.title });
            } else {
                toRemove.push({ file: file1, id: b1.id, title: b1.title });
            }
        }
    }
}

// Intra-file exact duplicates (like Stella Artois in newbeer.json)
for (const fileKey of Object.keys(files)) {
    const seen = new Map();
    for (const b of files[fileKey]) {
        const key = b.title.toLowerCase() + '|' + b.brewery.toLowerCase();
        if (seen.has(key)) {
            const existing = seen.get(key);
            if (existing.id !== b.id) {
                // Remove the one with lower score
                if (scoreBeer(b) > scoreBeer(existing)) {
                    toRemove.push({ file: fileKey, id: existing.id, title: existing.title });
                    seen.set(key, b);
                } else {
                    toRemove.push({ file: fileKey, id: b.id, title: b.title });
                }
            }
        } else {
            seen.set(key, b);
        }
    }
}

let counts = {};
for (const rm of toRemove) {
    const origLen = files[rm.file].length;
    files[rm.file] = files[rm.file].filter(b => b.id !== rm.id);
    if (files[rm.file].length < origLen) {
        counts[rm.file] = (counts[rm.file] || 0) + 1;
        console.log(`Removed ${rm.title} (${rm.id}) from ${rm.file}`);
    }
}

for (const f of Object.keys(files)) {
    if (counts[f] > 0) {
        fs.writeFileSync(path.join('data', f), JSON.stringify(files[f], null, 4));
        console.log(`Saved ${f} (${counts[f]} removed)`);
    }
}
