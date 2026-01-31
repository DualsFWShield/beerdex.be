const fs = require('fs');
const path = require('path');

const dataDir = 'c:/Users/Toyger/OneDrive/Projects51c/beerdex.be/data';
const files = ['belgiumbeer.json', 'newbeer.json', 'breweries.json', 'deutchbeer.json', 'frenchbeer.json', 'nlbeer.json', 'usbeer.json'];

// Helper to normalize title
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const allBeers = [];
const fileMap = {}; // store data per file to rewrite

// 1. Read all files
files.forEach(file => {
    try {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                // Determine file priority (newbeer.json seems to be master)
                const priority = file === 'newbeer.json' ? 10 : 1;
                data.forEach(item => {
                    item._sourceFile = file;
                    item._priority = priority;
                    allBeers.push(item);
                });
            }
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

console.log(`Total beers before cleaning: ${allBeers.length}`);

// 2. Deduplicate (Keep best match by Title)
const uniqueBeers = new Map();
const duplicatesRemoved = [];

allBeers.forEach(beer => {
    if (!beer.title) return;
    const key = normalize(beer.title);

    if (uniqueBeers.has(key)) {
        const existing = uniqueBeers.get(key);
        // Decide which to keep
        // 1. Priority (newbeer > others)
        // 2. Metadata richness (has description/ingredients?) -> heuristic: JSON string length?
        // 3. Volume: Prefer 33cl over 25cl?

        let keepExisting = true;

        if (beer._priority > existing._priority) keepExisting = false;
        else if (beer._priority === existing._priority) {
            // Tie-break: Prefer 0.33L over others (standard)
            const volA = existing.volume || '';
            const volB = beer.volume || '';
            if (volB.includes('0.33') && !volA.includes('0.33')) keepExisting = false;
            // Else keep first found (usually from first file in list)
        }

        if (!keepExisting) {
            uniqueBeers.set(key, beer);
            duplicatesRemoved.push({ removed: existing.title, kept: beer.title, file: existing._sourceFile });
        } else {
            duplicatesRemoved.push({ removed: beer.title, kept: existing.title, file: beer._sourceFile });
        }
    } else {
        uniqueBeers.set(key, beer);
    }
});

console.log(`Removed ${duplicatesRemoved.length} duplicates.`);

// 3. Distribute back to files
// We want to rewrite the files such that:
// - 'newbeer.json' accumulates most data? 
// - OR we preserve the original file structure (beers stay in their files unless removed).
// - BUT if we removed a duplicate from 'belgiumbeer.json' because it's in 'newbeer.json', we shouldn't add it back to 'belgiumbeer.json'.

// Strategy:
// - Re-bucket beers into their originally assigned `_sourceFile`.
// - If the `_sourceFile` of the *winner* was 'newbeer.json', it stays there.
// - If we merged, the winner determines the file.

const buckets = {};
files.forEach(f => buckets[f] = []);

uniqueBeers.forEach(beer => {
    const targetFile = beer._sourceFile;
    // Remove internal props
    delete beer._sourceFile;
    delete beer._priority;

    if (buckets[targetFile]) {
        buckets[targetFile].push(beer);
    } else {
        // Fallback (shouldn't happen)
        buckets['newbeer.json'].push(beer);
    }
});

// 4. Write files
files.forEach(file => {
    const filePath = path.join(dataDir, file);
    const data = buckets[file] || [];
    // Sort slightly for tidiness?
    // data.sort((a, b) => a.title.localeCompare(b.title));

    if (data.length > 0 || fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Wrote ${data.length} beers to ${file}`);
    }
});

console.log("Cleanup complete.");
