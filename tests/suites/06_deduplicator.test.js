/**
 * 06_deduplicator.test.js — Tests for text normalization, similarity, 
 * variant conflict detection, and deduplication matching.
 */
import { describe, it, expect } from '../core/test-framework.js';

let Utils;
try {
    Utils = await import('../../js/utils.js');
} catch (e) {
    console.error('Failed to import Utils:', e);
}

describe('🔗 Déduplication & Matching', () => {

    // ── Text Normalization ──
    it('normalize — supprime les accents', () => {
        expect(Utils.normalize('Spéciale Édition Bière')).toBe('speciale edition biere');
    });

    it('normalize — met en minuscules', () => {
        expect(Utils.normalize('CHIMAY BLEUE')).toBe('chimay bleue');
    });

    it('normalize — supprime les caractères spéciaux', () => {
        expect(Utils.normalize("L'Orval (2024)")).toBe('lorval 2024');
    });

    it('normalize — collapse les espaces multiples', () => {
        expect(Utils.normalize('Chimay   Bleue')).toBe('chimay bleue');
    });

    it('normalize — gère null/undefined', () => {
        expect(Utils.normalize(null)).toBe('');
        expect(Utils.normalize(undefined)).toBe('');
    });

    // ── Levenshtein Similarity ──
    it('similarity — chaînes identiques → 1.0', () => {
        expect(Utils.similarity('chimay', 'chimay')).toBe(1);
    });

    it('similarity — chaînes complètement différentes → proche de 0', () => {
        expect(Utils.similarity('chimay', 'xyz')).toBeLessThan(0.3);
    });

    it('similarity — variation mineure → score élevé', () => {
        const score = Utils.similarity('chimay bleue', 'chimay bleu');
        expect(score).toBeGreaterThan(0.85);
    });

    it('similarity — vide vs string → 0', () => {
        expect(Utils.similarity('', 'chimay')).toBe(0);
    });

    // ── Token Similarity (Jaccard) ──
    it('tokenSimilarity — même titre → 1.0', () => {
        expect(Utils.tokenSimilarity('Chimay Bleue', 'Chimay Bleue')).toBe(1);
    });

    it('tokenSimilarity — ordre inversé → score élevé', () => {
        const score = Utils.tokenSimilarity('Bleue Chimay', 'Chimay Bleue');
        expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('tokenSimilarity — un mot en commun sur deux → ~0.33-0.5', () => {
        const score = Utils.tokenSimilarity('Chimay Bleue', 'Chimay Rouge');
        expect(score).toBeGreaterThan(0.2);
        expect(score).toBeLessThan(0.8);
    });

    // ── Variant Conflict Detection ──
    it('hasVariantConflict — Blonde vs Brune → true', () => {
        expect(Utils.hasVariantConflict('Leffe Blonde', 'Leffe Brune')).toBe(true);
    });

    it('hasVariantConflict — Rouge vs Blonde → true', () => {
        expect(Utils.hasVariantConflict('Chimay Rouge', 'Chimay Blonde')).toBe(true);
    });

    it('hasVariantConflict — Triple vs Double → true', () => {
        expect(Utils.hasVariantConflict('Westmalle Triple', 'Westmalle Double')).toBe(true);
    });

    it('hasVariantConflict — Kriek vs pas Kriek → true', () => {
        expect(Utils.hasVariantConflict('Lindemans Kriek', 'Lindemans Gueuze')).toBe(true);
    });

    it('hasVariantConflict — même nom exact → false', () => {
        expect(Utils.hasVariantConflict('Chimay Bleue', 'Chimay Bleue')).toBe(false);
    });

    it('hasVariantConflict — aucune variante connue → false', () => {
        expect(Utils.hasVariantConflict('Orval', 'Orval Trappiste')).toBe(false);
    });

    // ── parseDegree ──
    it('parseDegree — "5.5%" → 5.5', () => {
        expect(Utils.parseDegree('5.5%')).toBeCloseTo(5.5, 1);
    });

    it('parseDegree — "12,5°" → 12.5', () => {
        expect(Utils.parseDegree('12,5°')).toBeCloseTo(12.5, 1);
    });

    it('parseDegree — "0" → 0', () => {
        expect(Utils.parseDegree('0')).toBe(0);
    });

    // ── Edge Cases: Integration-level similarity ──
    it('Similarity: "Stella Artois" vs "STELLA" → élevée', () => {
        const score = Utils.similarity(
            Utils.normalize('STELLA'),
            Utils.normalize('Stella Artois')
        );
        // Stella (6) vs Stella Artois (14) — substring match but not exact
        expect(score).toBeGreaterThan(0.35);
    });

    it('Similarity: "Duvel" vs "Duvel 6.66" → élevée', () => {
        const score = Utils.tokenSimilarity('Duvel', 'Duvel 6.66');
        expect(score).toBeGreaterThan(0.3);
    });

    it('Variant Conflict: "IPA" vs non-IPA → conflit', () => {
        expect(Utils.hasVariantConflict('Chouffe IPA', 'Chouffe Blonde')).toBe(true);
    });
});
