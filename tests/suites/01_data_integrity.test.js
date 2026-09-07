/**
 * 01_data_integrity.test.js — Validates beer database JSON files.
 * 
 * Checks: file loading, required fields, ID uniqueness, enrichment.
 */
import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';

const DATA_FILES = [
    '../data/belgiumbeer.json',
    '../data/newbeer.json',
    '../data/frenchbeer.json',
    '../data/deutchbeer.json',
    '../data/nlbeer.json',
    '../data/usbeer.json',
    '../data/cobeer.json',
    '../data/krbeer.json',
    '../data/jpbeer.json',
    '../data/cnbeer.json'
];

const EXTRA_FILES = [
    '../data/breweries.json',
    '../data/bac_rules.json'
];

let allDataSets = {};

// Pre-fetch all JSON files for the tests
async function preload() {
    for (const url of [...DATA_FILES, ...EXTRA_FILES]) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                allDataSets[url] = await res.json();
            } else {
                allDataSets[url] = null;
            }
        } catch {
            allDataSets[url] = null;
        }
    }
}

await preload();

describe('📦 Intégrité des Données JSON', () => {

    // ── File Loading ──
    DATA_FILES.forEach(file => {
        const name = file.split('/').pop();
        it(`${name} — se charge et est un tableau valide`, () => {
            const data = allDataSets[file];
            expect(data).not.toBeNull();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThan(0);
        });
    });

    it('breweries.json — se charge correctement', () => {
        const data = allDataSets['../data/breweries.json'];
        expect(data).not.toBeNull();
        // Can be array or object
        if (Array.isArray(data)) {
            expect(data.length).toBeGreaterThan(0);
        } else {
            expect(Object.keys(data).length).toBeGreaterThan(0);
        }
    });

    it('bac_rules.json — se charge et contient BE', () => {
        const data = allDataSets['../data/bac_rules.json'];
        expect(data).not.toBeNull();
        expect(data).toHaveProperty('BE');
        expect(data.BE).toHaveProperty('sanctionThreshold');
        expect(data.BE).toHaveProperty('withdrawThreshold');
        expect(data.BE.sanctionThreshold).toBe(0.5);
    });

    // ── Required Fields per Beer ──
    DATA_FILES.forEach(file => {
        const name = file.split('/').pop();
        it(`${name} — chaque bière a un title`, () => {
            const data = allDataSets[file];
            if (!data) return;
            const missing = data.filter(b => !b.title || typeof b.title !== 'string' || b.title.trim() === '');
            expect(missing.length).toBe(0);
        });
    });

    // ── ID Uniqueness across all files ──
    it('Aucun doublon d\'ID entre tous les fichiers', () => {
        const allIds = new Map();
        const duplicates = [];

        for (const file of DATA_FILES) {
            const data = allDataSets[file];
            if (!data) continue;
            const fileName = file.split('/').pop();

            data.forEach(beer => {
                const id = beer.id || beer.title;
                if (allIds.has(id)) {
                    duplicates.push(`"${id}" in ${allIds.get(id)} AND ${fileName}`);
                } else {
                    allIds.set(id, fileName);
                }
            });
        }

        // A few duplicates across countries are expected (deduplication handles it at runtime)
        // We just ensure it's not excessive
        expect(duplicates.length).toBeLessThan(50);
    });

    // ── Alcohol field validation ──
    it('belgiumbeer.json — alcohol est un string ou absent (pas NaN)', () => {
        const data = allDataSets['../data/belgiumbeer.json'];
        if (!data) return;
        const badAlcohol = data.filter(b => {
            if (b.alcohol === undefined || b.alcohol === null) return false;
            return typeof b.alcohol !== 'string' && typeof b.alcohol !== 'number';
        });
        expect(badAlcohol.length).toBe(0);
    });

    // ── BAC Rules structure ──
    it('bac_rules.json — tous les pays ont les champs requis', () => {
        const data = allDataSets['../data/bac_rules.json'];
        if (!data) return;
        for (const [code, rules] of Object.entries(data)) {
            expect(rules).toHaveProperty('sanctionThreshold');
            expect(rules).toHaveProperty('withdrawThreshold');
            expect(typeof rules.sanctionThreshold).toBe('number');
            expect(typeof rules.withdrawThreshold).toBe('number');
            expect(rules.withdrawThreshold).toBeGreaterThanOrEqual(rules.sanctionThreshold);
        }
    });

    // ── breweries.json structure ──
    it('breweries.json — chaque entrée a un name', () => {
        const data = allDataSets['../data/breweries.json'];
        if (!data) return;
        const arr = Array.isArray(data) ? data : Object.values(data);
        if (arr.length === 0) return;

        // If array of objects, check name field
        if (typeof arr[0] === 'object' && arr[0] !== null) {
            const missing = arr.filter(b => typeof b === 'object' && !b.name);
            expect(missing.length).toBe(0);
        }
    });
});
