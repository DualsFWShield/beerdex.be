const fs = require('fs');
const path = require('path');

const dataDir = 'c:/Users/Toyger/OneDrive/Projects51c/beerdex.be/data';
const files = ['belgiumbeer.json', 'newbeer.json', 'breweries.json', 'deutchbeer.json', 'frenchbeer.json', 'nlbeer.json', 'usbeer.json'];

let allBeers = [];
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const stats = {};

files.forEach(file => {
    try {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                stats[file] = data.length;
                data.forEach(item => {
                    item.sourceFile = file;
                    allBeers.push(item);
                });
            }
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

// Find duplicates
const seen = new Map();
const duplicates = [];

allBeers.forEach(beer => {
    if (!beer.title) return;
    const key = normalize(beer.title);

    if (seen.has(key)) {
        const existing = seen.get(key);
        // Deduplicate logic: prioritize keeping 'newbeer.json' content if it's cleaner? 
        // Or prioritize the one with more fields.
        duplicates.push({
            title: beer.title,
            originalFile: existing.sourceFile,
            duplicateFile: beer.sourceFile,
            originalId: existing.id,
            duplicateId: beer.id
        });
    } else {
        seen.set(key, beer);
    }
});

const report = {
    stats,
    totalDuplicates: duplicates.length,
    breakdown: {},
    duplicates: duplicates
};

duplicates.forEach(d => {
    const pair = `${d.originalFile} <-> ${d.duplicateFile}`;
    report.breakdown[pair] = (report.breakdown[pair] || 0) + 1;
});

fs.writeFileSync('duplicates_data.json', JSON.stringify(report, null, 2));
console.log('Done.');
