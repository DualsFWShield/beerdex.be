/**
 * 03_bac_gamer.test.js — BAC calculation & Gamer stats tests.
 * 
 * Covers: parseAbv, calculateAlcoholGrams, Widmark formula,
 * gamer stats (ping, fps, aim, fov), ranks, resolution tiers.
 */
import { describe, it, expect } from '../core/test-framework.js';

let BAC, Utils;
try {
    BAC = await import('../../js/bac.js');
    Utils = await import('../../js/utils.js');
} catch (e) {
    console.error('Failed to import BAC/Utils:', e);
}

describe('🧪 BAC — Calculs d\'Alcoolémie & Gamer Stats', () => {

    // ── Volume Parsing (Utils) ──
    it('parseVolumeToMl — "33cl" → 330', () => {
        expect(Utils.parseVolumeToMl('33cl')).toBe(330);
    });

    it('parseVolumeToMl — "0.5l" → 500', () => {
        expect(Utils.parseVolumeToMl('0.5l')).toBe(500);
    });

    it('parseVolumeToMl — "330ml" → 330', () => {
        expect(Utils.parseVolumeToMl('330ml')).toBe(330);
    });

    it('parseVolumeToMl — "330" (sans unité, ≥100) → 330', () => {
        expect(Utils.parseVolumeToMl('330')).toBe(330);
    });

    it('parseVolumeToMl — "33" (sans unité, <100) → 330', () => {
        expect(Utils.parseVolumeToMl('33')).toBe(330);
    });

    it('parseVolumeToMl — "0.33" (sans unité, <10) → 330', () => {
        expect(Utils.parseVolumeToMl('0.33')).toBe(330);
    });

    it('parseVolumeToMl — "1.5l" → 1500', () => {
        expect(Utils.parseVolumeToMl('1.5l')).toBe(1500);
    });

    it('parseVolumeToMl — vide → 0', () => {
        expect(Utils.parseVolumeToMl('')).toBe(0);
        expect(Utils.parseVolumeToMl(null)).toBe(0);
    });

    // ── Format Volume ──
    it('formatVolume — 330ml → "33cl"', () => {
        expect(Utils.formatVolume('330')).toBe('33cl');
    });

    it('formatVolume — 1500ml → "1.5L"', () => {
        expect(Utils.formatVolume('1.5l')).toBe('1.5L');
    });

    it('formatVolume — 0 → ""', () => {
        expect(Utils.formatVolume(0)).toBe('');
    });

    // ── ABV Parsing ──
    it('parseDegree — "8.5%" → 8.5', () => {
        expect(Utils.parseDegree('8.5%')).toBeCloseTo(8.5, 1);
    });

    it('parseDegree — "8,5°" → 8.5', () => {
        expect(Utils.parseDegree('8,5°')).toBeCloseTo(8.5, 1);
    });

    it('parseDegree — null → 0', () => {
        expect(Utils.parseDegree(null)).toBe(0);
    });

    // ── Alcohol Grams Calculation ──
    it('calculateAlcoholGrams — 330ml à 5% → ~13.2g', () => {
        // Formula: 330 * (5/100) * 0.8 = 13.2
        const grams = BAC.calculateAlcoholGrams(330, 5);
        expect(grams).toBeCloseTo(13.2, 1);
    });

    it('calculateAlcoholGrams — 500ml à 8.5% → 34g', () => {
        // Formula: 500 * (8.5/100) * 0.8 = 34
        const grams = BAC.calculateAlcoholGrams(500, 8.5);
        expect(grams).toBeCloseTo(34, 1);
    });

    it('calculateAlcoholGrams — volume string "33cl" à "5%" → ~13.2g', () => {
        const grams = BAC.calculateAlcoholGrams('33cl', '5%');
        expect(grams).toBeCloseTo(13.2, 1);
    });

    it('calculateAlcoholGrams — 0ml → 0g', () => {
        expect(BAC.calculateAlcoholGrams(0, 5)).toBe(0);
    });

    it('calculateAlcoholGrams — 0% → 0g', () => {
        expect(BAC.calculateAlcoholGrams(330, 0)).toBe(0);
    });

    // ── Gamer Stats ──
    it('getGamerStats(0) — BAC à 0 = stats de base optimales', () => {
        const stats = BAC.getGamerStats(0);
        expect(stats.ping).toBe(200);
        expect(stats.fps).toBe(144);
        expect(stats.aimAssist).toBe(0);
        expect(stats.fov).toBe(110);
        expect(stats.rankKey).toBe('bac_gamer_rank_global_elite');
        expect(stats.resolutionKey).toBe('bac_gamer_res_4k');
        expect(stats.setupKey).toBe('bac_gamer_setup_esport');
    });

    it('getGamerStats(0.5) — BAC modéré = Gold rank', () => {
        const stats = BAC.getGamerStats(0.5);
        expect(stats.ping).toBeGreaterThan(200);
        expect(stats.fps).toBeLessThan(144);
        expect(stats.aimAssist).toBeGreaterThan(0);
        expect(stats.rankKey).toBe('bac_gamer_rank_gold');
    });

    it('getGamerStats(1.0) — BAC élevé = Silver rank', () => {
        const stats = BAC.getGamerStats(1.0);
        expect(stats.rankKey).toBe('bac_gamer_rank_silver');
        expect(stats.fps).toBeLessThanOrEqual(84);
    });

    it('getGamerStats(1.5) — BAC danger = Bronze rank', () => {
        const stats = BAC.getGamerStats(1.5);
        expect(stats.rankKey).toBe('bac_gamer_rank_bronze');
    });

    it('getGamerStats(2.0) — BAC extrême = Wood Division', () => {
        const stats = BAC.getGamerStats(2.0);
        expect(stats.rankKey).toBe('bac_gamer_rank_wood');
        expect(stats.resolutionKey).toBe('bac_gamer_res_144');
        expect(stats.setupKey).toBe('bac_gamer_setup_trackpad');
    });

    // ── FPS ne descend jamais sous 10 ──
    it('getGamerStats — FPS min clampé à 10', () => {
        const stats = BAC.getGamerStats(5.0);
        expect(stats.fps).toBeGreaterThanOrEqual(10);
    });

    // ── FOV ne descend jamais sous 60 ──
    it('getGamerStats — FOV min clampé à 60', () => {
        const stats = BAC.getGamerStats(5.0);
        expect(stats.fov).toBeGreaterThanOrEqual(60);
    });

    // ── Aim Assist max clampé à 100 ──
    it('getGamerStats — Aim Assist max clampé à 100', () => {
        const stats = BAC.getGamerStats(5.0);
        expect(stats.aimAssist).toBeLessThanOrEqual(100);
    });

    // ── Resolution Tiers ──
    it('getGamerStats — tiers de résolution cohérents', () => {
        expect(BAC.getGamerStats(0.10).resolutionKey).toBe('bac_gamer_res_4k');
        expect(BAC.getGamerStats(0.40).resolutionKey).toBe('bac_gamer_res_1080');
        expect(BAC.getGamerStats(0.80).resolutionKey).toBe('bac_gamer_res_720');
        expect(BAC.getGamerStats(1.30).resolutionKey).toBe('bac_gamer_res_480');
        expect(BAC.getGamerStats(2.00).resolutionKey).toBe('bac_gamer_res_144');
    });

    // ── Setup Tiers ──
    it('getGamerStats — tiers de setup cohérents', () => {
        expect(BAC.getGamerStats(0.20).setupKey).toBe('bac_gamer_setup_esport');
        expect(BAC.getGamerStats(0.50).setupKey).toBe('bac_gamer_setup_wireless');
        expect(BAC.getGamerStats(1.00).setupKey).toBe('bac_gamer_setup_drift');
        expect(BAC.getGamerStats(1.50).setupKey).toBe('bac_gamer_setup_cheap');
        expect(BAC.getGamerStats(2.00).setupKey).toBe('bac_gamer_setup_trackpad');
    });

    // ── BAC Rules Loading ──
    it('BAC_RULES contient au moins la Belgique (BE)', () => {
        expect(BAC.BAC_RULES).toHaveProperty('BE');
    });

    it('getCurrentRules retourne les règles avec sanctionThreshold', () => {
        const rules = BAC.getCurrentRules();
        expect(rules).toHaveProperty('sanctionThreshold');
        expect(rules).toHaveProperty('withdrawThreshold');
    });
});
