/**
 * 02_storage.test.js — Tests for the Storage module.
 * 
 * Covers: ratings CRUD, favorites, custom beers, consumption,
 * cache invalidation, orphan cleanup, preference get/set, resets.
 */
import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';

// We re-import Storage fresh each time via dynamic import to get clean module state
let Storage, Utils;

try {
    Storage = await import('../../js/storage.js');
    Utils = await import('../../js/utils.js');
} catch (e) {
    console.error('Failed to import Storage/Utils for tests:', e);
}

describe('💾 Storage — CRUD & Logique Métier', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── Preferences ──
    it('getPreference retourne la valeur par défaut si rien n\'est sauvé', () => {
        const val = Storage.getPreference('nonexistent_key', 42);
        expect(val).toBe(42);
    });

    it('savePreference / getPreference round-trip', () => {
        Storage.savePreference('test_key', 'hello');
        expect(Storage.getPreference('test_key', null)).toBe('hello');
    });

    it('savePreference gère les objets JSON', () => {
        Storage.savePreference('test_obj', { a: 1, b: [2, 3] });
        const result = Storage.getPreference('test_obj', null);
        expect(result.a).toBe(1);
        expect(result.b).toEqual([2, 3]);
    });

    // ── Ratings ──
    it('getBeerRating retourne null pour une bière sans note', () => {
        const rating = Storage.getBeerRating('NONEXISTENT_BEER');
        expect(rating).toBeNull();
    });

    it('saveBeerRating enregistre une note', () => {
        Storage.saveBeerRating('TEST_BEER_001', { score: 15, comment: 'Excellente' });
        const data = Storage.getBeerRating('TEST_BEER_001');
        expect(data).not.toBeNull();
        expect(data.score).toBe(15);
        expect(data.comment).toBe('Excellente');
    });

    it('saveBeerRating crée automatiquement un historique si absent', () => {
        Storage.saveBeerRating('TEST_BEER_002', { score: 12 });
        const data = Storage.getBeerRating('TEST_BEER_002');
        expect(data.history).toBeDefined();
        expect(data.count).toBe(1);
    });

    // ── Consumption ──
    it('addConsumption incrémente le compteur', () => {
        Storage.addConsumption('BEER_A', '33cl');
        Storage.addConsumption('BEER_A', '50cl');
        const data = Storage.getBeerRating('BEER_A');
        expect(data.count).toBe(2);
        expect(data.history).toHaveLength(2);
    });

    it('addConsumption parse correctement les volumes', () => {
        Storage.addConsumption('BEER_B', '50cl');
        const data = Storage.getBeerRating('BEER_B');
        expect(data.history[0].volume).toBe(500);
    });

    it('removeConsumption décrémente le compteur', () => {
        Storage.addConsumption('BEER_C', '33cl');
        Storage.addConsumption('BEER_C', '33cl');
        Storage.removeConsumption('BEER_C');
        const data = Storage.getBeerRating('BEER_C');
        expect(data.count).toBe(1);
        expect(data.history).toHaveLength(1);
    });

    it('removeConsumption ne descend pas en dessous de 0', () => {
        Storage.addConsumption('BEER_D', '33cl');
        Storage.removeConsumption('BEER_D');
        Storage.removeConsumption('BEER_D');
        const data = Storage.getBeerRating('BEER_D');
        expect(data.count).toBe(0);
    });

    // ── Favorites ──
    it('isFavorite retourne false par défaut', () => {
        expect(Storage.isFavorite('BEER_FAV')).toBe(false);
    });

    it('toggleFavorite bascule le statut favori', () => {
        Storage.toggleFavorite('BEER_FAV');
        expect(Storage.isFavorite('BEER_FAV')).toBe(true);
        Storage.toggleFavorite('BEER_FAV');
        expect(Storage.isFavorite('BEER_FAV')).toBe(false);
    });

    // ── Sorting ──
    it('sortBeers place les favoris en premier', () => {
        Storage.toggleFavorite('B');
        const beers = [
            { id: 'A', title: 'Alpha' },
            { id: 'B', title: 'Beta' },
            { id: 'C', title: 'Charlie' }
        ];
        const sorted = Storage.sortBeers(beers);
        expect(sorted[0].id).toBe('B');
    });

    // ── Custom Beers ──
    it('saveCustomBeer / getCustomBeers roundtrip', () => {
        Storage.saveCustomBeer({ id: 'CUSTOM_001', title: 'Ma Bière', alcohol: '5%' });
        const customs = Storage.getCustomBeers();
        expect(customs.length).toBeGreaterThan(0);
        expect(customs[0].title).toBe('Ma Bière');
    });

    it('deleteCustomBeer supprime par ID', () => {
        Storage.saveCustomBeer({ id: 'CUSTOM_DEL', title: 'A Supprimer' });
        Storage.deleteCustomBeer('CUSTOM_DEL');
        const customs = Storage.getCustomBeers();
        const found = customs.find(b => b.id === 'CUSTOM_DEL');
        expect(found).toBeUndefined();
    });

    // ── Consumed Beer IDs ──
    it('getAllConsumedBeerIds retourne les IDs avec count > 0', () => {
        Storage.addConsumption('CONSUMED_1', '33cl');
        Storage.addConsumption('CONSUMED_2', '50cl');
        const ids = Storage.getAllConsumedBeerIds();
        expect(ids).toContain('CONSUMED_1');
        expect(ids).toContain('CONSUMED_2');
    });

    // ── Granular Resets ──
    it('resetRatingsOnly supprime les scores mais pas les counts', () => {
        Storage.addConsumption('RESET_BEER', '33cl');
        Storage.saveBeerRating('RESET_BEER', { score: 18, comment: 'Top' });
        Storage.resetRatingsOnly();
        const data = Storage.getBeerRating('RESET_BEER');
        expect(data).not.toBeNull();
        expect(data.score).toBeUndefined();
        expect(data.count).toBe(1);
    });

    it('resetFavoritesOnly met tous les favoris à false', () => {
        Storage.toggleFavorite('FAV_RESET');
        expect(Storage.isFavorite('FAV_RESET')).toBe(true);
        Storage.resetFavoritesOnly();
        expect(Storage.isFavorite('FAV_RESET')).toBe(false);
    });

    it('resetConsumptionHistoryOnly remet les counts à 0', () => {
        Storage.addConsumption('HIST_RESET', '33cl');
        Storage.addConsumption('HIST_RESET', '50cl');
        Storage.saveBeerRating('HIST_RESET', { score: 14 });
        Storage.resetConsumptionHistoryOnly();
        const data = Storage.getBeerRating('HIST_RESET');
        expect(data.count).toBe(0);
        expect(data.history).toHaveLength(0);
        // Score should be preserved
        expect(data.score).toBe(14);
    });

    it('resetCustomBeersOnly vide la liste de bières custom', () => {
        Storage.saveCustomBeer({ id: 'CUSTOM_RST', title: 'Custom Reset' });
        Storage.resetCustomBeersOnly();
        expect(Storage.getCustomBeers()).toHaveLength(0);
    });

    // ── Rating Template ──
    it('getRatingTemplate retourne un template par défaut valide', () => {
        const template = Storage.getRatingTemplate();
        expect(Array.isArray(template)).toBe(true);
        expect(template.length).toBeGreaterThan(0);
        expect(template[0]).toHaveProperty('id');
        expect(template[0]).toHaveProperty('type');
    });

    it('saveRatingTemplate / getRatingTemplate round-trip', () => {
        const custom = [{ id: 'taste', label: 'Goût', type: 'number', min: 0, max: 10 }];
        Storage.saveRatingTemplate(custom);
        const result = Storage.getRatingTemplate();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('taste');
    });
});
