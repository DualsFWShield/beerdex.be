#!/usr/bin/env node
/**
 * Fetch barcodes from OpenFoodFacts for beers in the Beerdex database.
 * Searches by beer name + brewery, and saves barcodes back into JSON files.
 *
 * Usage: node scripts/fetch-barcodes.js [file.json] [--dry-run]
 * Example: node scripts/fetch-barcodes.js data/belgiumbeer.json
 * Default: processes all beer JSON files
 */

const fs = require('fs');
const path = require('path');

const API_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const DELAY_MS = 700; // ~1.4 req/s to respect OFF rate limits

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const FILES = [
    'data/belgiumbeer.json',
    'data/frenchbeer.json',
    'data/deutchbeer.json',
    'data/nlbeer.json',
    'data/usbeer.json',
    'data/cobeer.json',
    'data/newbeer.json'
];

async function searchBarcode(beerName, brewery, retries = 2) {
    // Build query: beer name + brewery for better matching
    const query = `${beerName} ${brewery}`.replace(/[()]/g, '').trim();
    const url = `${API_SEARCH}?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=beers&json=1&page_size=5&fields=code,product_name,brands`;

    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'Beerdex/2.9 (barcode-fetcher; https://beerdex.be)' }
        });

        // Handle rate limiting / 503
        if (resp.status === 503 || resp.status === 429) {
            if (retries > 0) {
                const wait = (3 - retries) * 5000; // 5s, 10s backoff
                console.log(`  ⏳ Rate limited (${resp.status}), retrying in ${wait / 1000}s...`);
                await sleep(wait);
                return searchBarcode(beerName, brewery, retries - 1);
            }
            return null;
        }

        if (!resp.ok) return null;

        // Validate JSON response (OFF sometimes returns HTML on errors)
        const text = await resp.text();
        if (text.startsWith('<')) return null; // HTML response, not JSON

        const data = JSON.parse(text);

        if (!data.products || data.products.length === 0) return null;

        // Try to find the best match
        const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const nameNorm = normalize(beerName);

        for (const p of data.products) {
            const pName = normalize(p.product_name);
            // Check if the product name contains the beer name or vice versa
            if (pName.includes(nameNorm) || nameNorm.includes(pName) || nameNorm.split(' ').every(w => w.length < 3 || pName.includes(w))) {
                if (p.code && p.code.length >= 8) {
                    return p.code;
                }
            }
        }

        // Fallback: if only 1 result, trust it
        if (data.products.length === 1 && data.products[0].code) {
            return data.products[0].code;
        }

        return null;
    } catch (e) {
        console.error(`  Error searching "${beerName}":`, e.message);
        return null;
    }
}

async function processFile(filePath, dryRun = false) {
    const fullPath = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        return { total: 0, found: 0, skipped: 0 };
    }

    const beers = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    let found = 0;
    let skipped = 0;

    console.log(`\n📂 Processing ${filePath} (${beers.length} beers)...`);

    for (let i = 0; i < beers.length; i++) {
        const beer = beers[i];

        // Skip if already has a barcode
        if (beer.barcode) {
            skipped++;
            continue;
        }

        const barcode = await searchBarcode(beer.title, beer.brewery || '');

        if (barcode) {
            beer.barcode = barcode;
            found++;
            console.log(`  ✅ [${i + 1}/${beers.length}] ${beer.title} → ${barcode}`);
        } else {
            console.log(`  ❌ [${i + 1}/${beers.length}] ${beer.title} → not found`);
        }

        await sleep(DELAY_MS);
    }

    if (!dryRun && found > 0) {
        fs.writeFileSync(fullPath, JSON.stringify(beers, null, 2), 'utf8');
        console.log(`  💾 Saved ${found} barcodes to ${filePath}`);
    }

    return { total: beers.length, found, skipped };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const specificFile = args.find(a => a.endsWith('.json'));

    const files = specificFile ? [specificFile] : FILES;

    console.log('🍺 Beerdex Barcode Fetcher');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE (will modify files)'}`);
    console.log(`   Files: ${files.join(', ')}`);

    let totalFound = 0;
    let totalBeers = 0;
    let totalSkipped = 0;

    for (const file of files) {
        const result = await processFile(file, dryRun);
        totalBeers += result.total;
        totalFound += result.found;
        totalSkipped += result.skipped;
    }

    console.log('\n📊 Summary:');
    console.log(`   Total beers: ${totalBeers}`);
    console.log(`   Barcodes found: ${totalFound}`);
    console.log(`   Already had barcode: ${totalSkipped}`);
    console.log(`   No barcode found: ${totalBeers - totalFound - totalSkipped}`);
}

main().catch(console.error);
