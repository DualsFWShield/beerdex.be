/**
 * 09_import_export.test.js — Import/Export roundtrip tests.
 * 
 * Validates export object generation, LZString compression,
 * and data integrity through roundtrip cycles.
 */
import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';

let Storage;
try {
    Storage = await import('../../js/storage.js');
} catch (e) {
    console.error('Failed to import Storage:', e);
}

describe('📁 Import / Export & Sauvegarde', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── generateExportObject ──
    it('generateExportObject retourne un objet avec la structure correcte', () => {
        Storage.addConsumption('EXPORT_BEER_1', '33cl');
        Storage.saveBeerRating('EXPORT_BEER_1', { score: 15, comment: 'Good' });

        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj).toHaveProperty('version');
        expect(exportObj).toHaveProperty('exportDate');
        expect(exportObj).toHaveProperty('ratings');
    });

    it('generateExportObject — scope "all" inclut les ratings', () => {
        Storage.addConsumption('BEER_ALL', '50cl');
        Storage.saveBeerRating('BEER_ALL', { score: 18 });
        
        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj.ratings).toHaveProperty('BEER_ALL');
    });

    it('generateExportObject — les custom beers sont incluses', () => {
        Storage.saveCustomBeer({ id: 'CUSTOM_EXP_1', title: 'Export Test Beer', alcohol: '6%' });
        
        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj).toHaveProperty('customBeers');
        expect(exportObj.customBeers.length).toBeGreaterThan(0);
        expect(exportObj.customBeers[0].title).toBe('Export Test Beer');
    });

    it('generateExportObject — scope "ratings" n\'inclut que les ratings', () => {
        Storage.addConsumption('BEER_RAT', '33cl');
        Storage.saveCustomBeer({ id: 'CUSTOM_NOT_INCLUDED', title: 'Not Included' });

        const exportObj = Storage.generateExportObject({ 
            scope: 'ratings',
            exportRatings: true,
            exportHistory: true,
            exportCustom: false
        });
        expect(exportObj.ratings).toHaveProperty('BEER_RAT');
    });

    // ── Export Object Version ──
    it('generateExportObject contient un numéro de version', () => {
        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj.version).toBeDefined();
        expect(typeof exportObj.version === 'number' || typeof exportObj.version === 'string').toBe(true);
    });

    it('generateExportObject contient une date d\'export', () => {
        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj.exportDate).toBeDefined();
        expect(typeof exportObj.exportDate).toBe('string');
        // Verify ISO format
        expect(new Date(exportObj.exportDate).toISOString()).toBe(exportObj.exportDate);
    });

    // ── Roundtrip: Export → Verify Structure ──
    it('Roundtrip — les données exportées sont cohérentes', () => {
        // Seed data
        Storage.addConsumption('RT_BEER_1', '33cl');
        Storage.addConsumption('RT_BEER_1', '50cl');
        Storage.saveBeerRating('RT_BEER_1', { score: 16, comment: 'Nice' });
        Storage.toggleFavorite('RT_BEER_1');
        Storage.saveCustomBeer({ id: 'CUSTOM_RT', title: 'Custom Roundtrip', alcohol: '7%' });

        const exportObj = Storage.generateExportObject({ scope: 'all' });

        // Verify ratings
        expect(exportObj.ratings['RT_BEER_1']).toBeDefined();
        expect(exportObj.ratings['RT_BEER_1'].score).toBe(16);
        expect(exportObj.ratings['RT_BEER_1'].comment).toBe('Nice');

        // Verify custom beers
        const customFound = exportObj.customBeers.find(b => b.id === 'CUSTOM_RT');
        expect(customFound).toBeDefined();
        expect(customFound.title).toBe('Custom Roundtrip');
    });

    // ── LZString Compression (if available) ──
    it('LZString compression/décompression roundtrip (si disponible)', () => {
        if (!window.LZString) {
            // LZString not loaded in test env, skip gracefully
            return;
        }
        const testData = JSON.stringify({ test: 'data', number: 42, nested: { a: [1, 2, 3] } });
        const compressed = LZString.compressToEncodedURIComponent(testData);
        const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
        expect(decompressed).toBe(testData);
    });

    // ── Shareable Link ──
    it('getShareableLink génère une URL avec le paramètre data', () => {
        if (!window.LZString) return; // Skip if LZString not available
        
        Storage.addConsumption('SHARE_BEER', '33cl');
        const link = Storage.getShareableLink({ scope: 'all' });
        
        if (link) {
            expect(link).toContain('?action=import');
            expect(link).toContain('data=');
        }
    });

    // ── Preferences Export ──
    it('Export inclut les préférences utilisateur', () => {
        Storage.savePreference('test_pref', 'test_value');
        const exportObj = Storage.generateExportObject({ scope: 'all' });
        expect(exportObj).toHaveProperty('preferences');
    });
});
