const fs = require('fs');
const path = require('path');

const dataDir = 'c:/Users/Toyger/OneDrive/Projects51c/beerdex.be/data';
const files = ['belgiumbeer.json', 'newbeer.json', 'breweries.json', 'deutchbeer.json', 'frenchbeer.json', 'nlbeer.json', 'usbeer.json'];

let allBeers = [];
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

files.forEach(file => {
    try {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                console.log(`Loaded ${data.length} beers from ${file}`);
                data.forEach(item => {
                    item.sourceFile = file;
                    allBeers.push(item);
                });
            } else {
                console.log(`Skipped ${file}: not an array`);
            }
        } else {
            console.log(`Skipped ${file}: not found`);
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

console.log(`Total beers loaded: ${allBeers.length}`);

// Find duplicates by Normalized Name
const seen = new Map();
const duplicates = [];

allBeers.forEach(beer => {
    if (!beer.title) return;
    const key = normalize(beer.title);

    // Check if key exists
    if (seen.has(key)) {
        const existing = seen.get(key);
        // Only consider it a duplicate if it's not the exact same ID (some files might be included twice if I messed up the script? no, loop is distinct)
        // Check for cross-file or same-file duplicates
        duplicates.push({
            name: beer.title,
            original: existing.sourceFile,
            duplicate: beer.sourceFile,
            originalId: existing.id,
            duplicateId: beer.id,
            key: key
        });
    } else {
        seen.set(key, beer);
    }
});

console.log(`Found ${duplicates.length} potential duplicates (by title).`);

// Group by file pairs
const filePairs = {};
duplicates.forEach(d => {
    const pair = `${d.original} <-> ${d.duplicate}`;
    filePairs[pair] = (filePairs[pair] || 0) + 1;
});
console.log('Duplicates breakdown:', filePairs);

console.log('Example Duplicates:');
duplicates.slice(0, 50).forEach(d => {
    console.log(`- [${d.name}] in ${d.original} AND ${d.duplicate}`);
});
