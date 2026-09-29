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
    syncBACFromCountDiff,
    BEER_TYPE_CATEGORIES,
    categorizeBeerType
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

    // ── 9. Variantes Synonymes & Détection de Volume Préréglé ──
    it('hasVariantConflict — gère les synonymes multilingues (tripel/triple, dubbel/double)', () => {
        expect(hasVariantConflict('LeFort Tripel', 'LEFORT TRIPLE')).toBe(false);
        expect(hasVariantConflict('Westmalle Dubbel', 'Westmalle Double')).toBe(false);
        expect(hasVariantConflict('Chouffe Blond', 'Chouffe Blonde')).toBe(false);
        expect(hasVariantConflict('Leffe Blonde', 'Leffe Triple')).toBe(true);
    });

    it('parseVolumeToMl — détecte les équivalences exactes des préréglages de volume', () => {
        const presets = [
            { key: '15cl', ml: 150 },
            { key: '25cl', ml: 250 },
            { key: '33cl', ml: 330 },
            { key: '50cl', ml: 500 },
            { key: '75cl', ml: 750 },
            { key: '150cl', ml: 1500 }
        ];

        // Format avec cl
        presets.forEach(p => {
            expect(parseVolumeToMl(p.key)).toBe(p.ml);
        });

        // Format en ml
        expect(parseVolumeToMl('330ml')).toBe(330);
        expect(parseVolumeToMl('500ml')).toBe(500);
        expect(parseVolumeToMl('1500ml')).toBe(1500);

        // Format en litres
        expect(parseVolumeToMl('0.33L')).toBe(330);
        expect(parseVolumeToMl('0.5L')).toBe(500);
        expect(parseVolumeToMl('1.5L')).toBe(1500);

        // Chiffre brut
        expect(parseVolumeToMl('33')).toBe(330);
        expect(parseVolumeToMl('50')).toBe(500);
    });

    // ── 8. Catégorisation Cohérente des Types de Bière ──
    it('BEER_TYPE_CATEGORIES — contient 16 macro-catégories avec id, label et icône', () => {
        expect(BEER_TYPE_CATEGORIES.length).toBe(16);
        const ids = BEER_TYPE_CATEGORIES.map(c => c.id);
        expect(ids.includes('Blonde')).toBe(true);
        expect(ids.includes('Brune')).toBe(true);
        expect(ids.includes('Ambrée')).toBe(true);
        expect(ids.includes('Blanche')).toBe(true);
        expect(ids.includes('IPA')).toBe(true);
        expect(ids.includes('Triple')).toBe(true);
        expect(ids.includes('Double')).toBe(true);
        expect(ids.includes('Quadruple')).toBe(true);
        expect(ids.includes('Stout / Porter')).toBe(true);
        expect(ids.includes('Fruitée')).toBe(true);
        expect(ids.includes('Sour / Gueuze')).toBe(true);
        expect(ids.includes('Saison')).toBe(true);
        expect(ids.includes('Pils / Lager')).toBe(true);
        expect(ids.includes('Sans Alcool')).toBe(true);
        expect(ids.includes('Noël / Saisonnière')).toBe(true);
        expect(ids.includes('Spéciale / Autre')).toBe(true);
    });

    it('categorizeBeerType — regroupe les sous-variantes et corrige le mojibake proprement', () => {
        // Ambrées & encodage
        expect(categorizeBeerType('Ale (Ambrée)')).toBe('Ambrée');
        expect(categorizeBeerType('Amber Ale')).toBe('Ambrée');
        expect(categorizeBeerType('AmbrÃ©e')).toBe('Ambrée');
        expect(categorizeBeerType('Ambrée Forte')).toBe('Ambrée');

        // Sans Alcool (prioritaire sur le sous-type)
        expect(categorizeBeerType('Blanche (Sans alcool)')).toBe('Sans Alcool');
        expect(categorizeBeerType('IPA Sans Alcool')).toBe('Sans Alcool');
        expect(categorizeBeerType('Bière 0.0%')).toBe('Sans Alcool');

        // IPA & Hazy
        expect(categorizeBeerType('American IPA')).toBe('IPA');
        expect(categorizeBeerType('NEIPA / Hazy')).toBe('IPA');
        expect(categorizeBeerType('Double IPA (DIPA)')).toBe('IPA');
        expect(categorizeBeerType('Session IPA')).toBe('IPA');

        // Styles belges
        expect(categorizeBeerType('Tripel')).toBe('Triple');
        expect(categorizeBeerType('Triple (Blonde)')).toBe('Triple');
        expect(categorizeBeerType('Double (Brune)')).toBe('Double');
        expect(categorizeBeerType('Quadruple (Brune)')).toBe('Quadruple');
        expect(categorizeBeerType('Belgian Blonde')).toBe('Blonde');
        expect(categorizeBeerType('Blonde (Houblonnée)')).toBe('Blonde');
        expect(categorizeBeerType('Brune (Vieillie)')).toBe('Brune');

        // Fruitées & Aromatisées
        expect(categorizeBeerType('Aux fruits')).toBe('Fruitée');
        expect(categorizeBeerType('Fruitée (Framboise)')).toBe('Fruitée');
        expect(categorizeBeerType('Bière aromatisée Pastèque')).toBe('Fruitée');

        // Saisons et Noël
        expect(categorizeBeerType('Saison (Blonde)')).toBe('Saison');
        expect(categorizeBeerType('de Noël')).toBe('Noël / Saisonnière');
        expect(categorizeBeerType('🍂 Traditionnelles et de Saison')).toBe('Noël / Saisonnière');

        // Stouts & Pils
        expect(categorizeBeerType('Imperial Stout')).toBe('Stout / Porter');
        expect(categorizeBeerType('Munich Helles')).toBe('Pils / Lager');
        expect(categorizeBeerType('Pils (Blonde)')).toBe('Pils / Lager');

        // Fallback
        expect(categorizeBeerType(null)).toBe('Spéciale / Autre');
        expect(categorizeBeerType('Inconnu')).toBe('Spéciale / Autre');
    });
});
