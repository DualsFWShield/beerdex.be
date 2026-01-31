const fs = require('fs');
const path = require('path');

const dataDir = 'c:/Users/Toyger/OneDrive/Projects51c/beerdex.be/data';
const files = ['belgiumbeer.json', 'newbeer.json', 'breweries.json', 'deutchbeer.json', 'frenchbeer.json', 'nlbeer.json', 'usbeer.json'];

let allBeers = [];

files.forEach(file => {
    try {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            data.forEach(item => {
                // Normalize some fields for better comparison
                item.sourceFile = file;
                allBeers.push(item);
            });
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

console.log(`Total beers loaded: ${allBeers.length}`);

// Find duplicates by Name (normalized)
const seen = new Map();
const duplicates = [];

allBeers.forEach(beer => {
    if (!beer.title) return;
    const key = beer.title.toLowerCase().trim();
    if (seen.has(key)) {
        duplicates.push({
            name: beer.title,
            original: seen.get(key).sourceFile,
            duplicate: beer.sourceFile,
            originalId: seen.get(key).id,
            duplicateId: beer.id
        });
    } else {
        seen.set(key, beer);
    }
});

console.log(`Found ${duplicates.length} duplicates.`);
duplicates.slice(0, 20).forEach(d => {
    console.log(`- "${d.name}": ${d.original} (${d.originalId}) vs ${d.duplicate} (${d.duplicateId})`);
});
