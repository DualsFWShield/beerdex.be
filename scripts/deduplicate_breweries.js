const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/breweries.json');
const BACKUP_FILE = path.join(__dirname, '../data/breweries.bak.json');

function deduplicate() {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const breweries = JSON.parse(rawData);

        console.log(`Original count: ${breweries.length}`);

        // Create Backup
        fs.writeFileSync(BACKUP_FILE, rawData);
        console.log(`Backup created at ${BACKUP_FILE}`);

        const seen = new Set();
        const uniqueBreweries = [];
        const duplicates = [];

        breweries.forEach(b => {
            // Normalize: lower case, remove specific chars
            // We focus on name primarily.
            if (!b.name) return;

            const normalized = b.name.toLowerCase().trim()
                .replace(/\s+/g, ' ')
                .replace(/['’]/g, ''); // Treat "d'Achouffe" same as "dachouffe"

            // Special handling for known dupes if needed, but generic should work for strict duplicates.
            // For "Orval" vs "ABBAYE D'ORVAL", those are different names.
            // The user said "les orvales sont dupliquées".
            // Let's check if we have identical names first.

            if (seen.has(normalized)) {
                duplicates.push(b.name);
            } else {
                seen.add(normalized);
                uniqueBreweries.push(b);
            }
        });

        console.log(`Duplicates found: ${duplicates.length}`);
        if (duplicates.length > 0) {
            console.log('Sample duplicates:', duplicates.slice(0, 10));
        }

        console.log(`New count: ${uniqueBreweries.length}`);

        // Sort alphabetically
        uniqueBreweries.sort((a, b) => a.name.localeCompare(b.name));

        fs.writeFileSync(DATA_FILE, JSON.stringify(uniqueBreweries, null, 2));
        console.log('File updated successfully.');

    } catch (e) {
        console.error('Error:', e);
    }
}

deduplicate();
