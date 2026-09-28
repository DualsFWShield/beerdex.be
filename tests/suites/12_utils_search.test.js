/**
 * 12_utils_search.test.js — Tests unitaires pour utils.js & Fuzzy Search.
 * 
 * Couvre :
 * - Parsing et formatage des volumes (cl, ml, L, heuristiques sans unité)
 * - Parsing des degrés d'alcool (ABV %, virgules, entiers)
 * - Normalisation de texte (accents, casse, ponctuation, espaces multiples)
 * - Calculs de similarité Levenshtein & Jaccard (tokenSimilarity avec invariance d'ordre)
 * - Détection des conflits de variantes de bières (hasVariantConflict)
 * - Moteur de recherche floue (fuzzyMatchBeers avec score, préfixes et tolérance aux fautes de frappe)
 * - Synchronisation différentielle BAC (syncBACFromCountDiff)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import {
    parseVolumeToMl,
    formatVolume,
    parseDegree,
    normalize,
    similarity,
    tokenSimilarity,
    hasVariantConflict,
    fuzzyMatchBeers,
    syncBACFromCountDiff
} from '../../js/utils.js';
import * as Storage from '../../js/storage.js';
import * as BAC from '../../js/bac.js';

describe('🔍 Utils — Utilitaires, Parsing & Recherche Floue', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. Parsing des Volumes ──
    it('parseVolumeToMl — parse correctement les formats cl, ml et L', () => {
        expect(parseVolumeToMl('33cl')).toBe(330);
        expect(parseVolumeToMl('25CL')).toBe(250);
        expect(parseVolumeToMl('500ml')).toBe(500);
        expect(parseVolumeToMl('0.33 L')).toBe(330);
        expect(parseVolumeToMl('0,75l')).toBe(750);
        expect(parseVolumeToMl('1.5L')).toBe(1500);
        expect(parseVolumeToMl('1 L')).toBe(1000);
    });

    it('parseVolumeToMl — applique les heuristiques pour les nombres bruts sans unité', () => {
        expect(parseVolumeToMl(0.33)).toBe(330);  // < 10 -> x1000
        expect(parseVolumeToMl(0.75)).toBe(750);
        expect(parseVolumeToMl(33)).toBe(330);     // < 100 -> x10
        expect(parseVolumeToMl(50)).toBe(500);
        expect(parseVolumeToMl(330)).toBe(330);   // >= 100 -> ml
        expect(parseVolumeToMl(500)).toBe(500);
    });

    it('parseVolumeToMl — gère les valeurs invalides et vides sans planter', () => {
        expect(parseVolumeToMl(null)).toBe(0);
        expect(parseVolumeToMl(undefined)).toBe(0);
        expect(parseVolumeToMl('')).toBe(0);
        expect(parseVolumeToMl('invalide')).toBe(0);
    });

    // ── 2. Formatage des Volumes ──
    it('formatVolume — formate en cl sous 1 litre et en L à partir de 1 litre', () => {
        expect(formatVolume('330ml')).toBe('33cl');
        expect(formatVolume('500ml')).toBe('50cl');
        expect(formatVolume('250ml')).toBe('25cl');
        expect(formatVolume('1000ml')).toBe('1L');
        expect(formatVolume('1500ml')).toBe('1.5L');
        expect(formatVolume('750ml')).toBe('75cl');
        expect(formatVolume(null)).toBe('');
        expect(formatVolume('')).toBe('');
    });

    // ── 3. Parsing des Degrés ABV ──
    it('parseDegree — extrait le pourcentage d\'alcool correctement', () => {
        expect(parseDegree('8.5%')).toBe(8.5);
        expect(parseDegree('12,0 %')).toBe(12.0);
        expect(parseDegree('0.0%')).toBe(0);
        expect(parseDegree(6.66)).toBe(6.66);
        expect(parseDegree('9.0%')).toBe(9.0);
        expect(parseDegree('9%')).toBe(9);
        expect(parseDegree(null)).toBe(0);
        expect(parseDegree('')).toBe(0);
    });

    // ── 4. Normalisation de Texte ──
    it('normalize — supprime accents, ponctuation, casse et espaces superflus', () => {
        expect(normalize('Bières & Brasseries Belges !')).toBe('bieres brasseries belges');
        expect(normalize('CHIMAY TRIPLE (8%)')).toBe('chimay triple 8');
        expect(normalize('  Orval   Trappiste  ')).toBe('orval trappiste');
        expect(normalize('Curaçao')).toBe('curacao');
        expect(normalize('')).toBe('');
        expect(normalize(null)).toBe('');
    });

    // ── 5. Calculs de Similarité ──
    it('similarity — calcule la similarité de Levenshtein normalisée', () => {
        expect(similarity('leffe', 'leffe')).toBe(1);
        expect(similarity('', '')).toBe(1);
        expect(similarity('leffe', '')).toBe(0);
        expect(similarity('leffe', 'leff')).toBeCloseTo(0.8, 1);
        expect(similarity('abc', 'xyz')).toBe(0);
    });

    it('tokenSimilarity — vérifie la similarité Jaccard insensible à l\'ordre des mots', () => {
        expect(tokenSimilarity('Tripel Karmeliet', 'Karmeliet Tripel')).toBe(1);
        expect(tokenSimilarity('Westmalle Trappist Tripel', 'Tripel Westmalle Trappist')).toBe(1);
        expect(tokenSimilarity('Leffe Blonde', 'Leffe')).toBeCloseTo(0.5, 1);
        expect(tokenSimilarity('Chimay Bleue', 'Orval')).toBe(0);
        expect(tokenSimilarity('', '')).toBe(1);
    });

    // ── 6. Détection de Conflit de Variantes ──
    it('hasVariantConflict — détecte les conflits entre déclinaisons (Blonde vs Brune, etc.)', () => {
        // Deux variantes différentes = conflit (ne doivent pas être fusionnées)
        expect(hasVariantConflict('Leffe Blonde', 'Leffe Brune')).toBe(true);
        expect(hasVariantConflict('Chimay Rouge', 'Chimay Triple')).toBe(true);
        expect(hasVariantConflict('Grimbergen Double', 'Grimbergen Blanche')).toBe(true);
        expect(hasVariantConflict('Duvel', 'Duvel Tripel Hop')).toBe(true);

        // Mêmes variantes ou sans conflit = pas de conflit
        expect(hasVariantConflict('Leffe Blonde', 'Leffe Blonde')).toBe(false);
        expect(hasVariantConflict('Westvleteren 12', 'Westvleteren 12')).toBe(false);
        expect(hasVariantConflict('Rochefort 10', 'Trappistes Rochefort 10')).toBe(false);
    });

    // ── 7. Moteur de Recherche Floue ──
    it('fuzzyMatchBeers — filtre et classe les bières par pertinence', () => {
        const testBeers = [
            { id: '1', title: 'Tripel Karmeliet', brewery: 'Bosteels', searchCountry: 'Belgique', searchRegion: 'Flandre' },
            { id: '2', title: 'Karmeliet Grand Cru', brewery: 'Bosteels', searchCountry: 'Belgique', searchRegion: 'Flandre' },
            { id: '3', title: 'Leffe Blonde', brewery: 'Abbaye de Leffe', searchCountry: 'Belgique', searchRegion: 'Namur' },
            { id: '4', title: 'Orval', brewery: 'Brasserie d\'Orval', searchCountry: 'Belgique', searchRegion: 'Luxembourg' }
        ];

        // Requête vide renvoie tout
        expect(fuzzyMatchBeers(testBeers, '').length).toBe(4);

        // Correspondance exacte de titre
        const exactMatch = fuzzyMatchBeers(testBeers, 'Orval');
        expect(exactMatch.length).toBeGreaterThan(0);
        expect(exactMatch[0].id).toBe('4');

        // Correspondance multi-mots
        const multiWord = fuzzyMatchBeers(testBeers, 'tripel bosteels');
        expect(multiWord.length).toBeGreaterThan(0);
        expect(multiWord[0].id).toBe('1');

        // Correspondance avec légère faute de frappe (Levenshtein pour mots >= 4 lettres)
        const typoMatch = fuzzyMatchBeers(testBeers, 'karmelit');
        expect(typoMatch.length).toBeGreaterThan(0);
        expect(typoMatch[0].id).toBe('1');
    });

    // ── 8. Synchronisation BAC depuis un Diff de Consommations ──
    it('syncBACFromCountDiff — ajoute ou retire des consommations au BAC', () => {
        Storage.savePreference('bac_enabled', true);
        Storage.savePreference('bac_manual_only', false);

        const beer = { id: 'B1', title: 'Duvel', volume: '33cl', alcohol: '8.5%' };

        // Simuler un ajout (+1 consommation)
        const initialDrinks = Storage.getPreference('bac_history', []);
        const initialCount = initialDrinks.length;

        syncBACFromCountDiff(beer, 0, 1);
        const afterAdd = Storage.getPreference('bac_history', []);
        expect(afterAdd.length).toBe(initialCount + 1);

        // Simuler une suppression (-1 consommation)
        syncBACFromCountDiff(beer, 1, 0);
        const afterRemove = Storage.getPreference('bac_history', []);
        expect(afterRemove.length).toBe(initialCount);
    });

    it('syncBACFromCountDiff — ne fait rien si bac_enabled est désactivé', () => {
        Storage.savePreference('bac_enabled', false);
        const beer = { id: 'B1', title: 'Duvel', volume: '33cl', alcohol: '8.5%' };

        const beforeDrinks = Storage.getPreference('bac_history', []).length;
        syncBACFromCountDiff(beer, 0, 2);
        const afterDrinks = Storage.getPreference('bac_history', []).length;

        expect(afterDrinks).toBe(beforeDrinks);
    });

});
