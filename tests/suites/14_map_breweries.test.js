/**
 * 14_map_breweries.test.js — Tests unitaires pour la cartographie interactive des brasseries.
 * 
 * Couvre :
 * - Configuration du registre des cartes (MAPS pour BE, FR, DE, NL, US, CO, KR, JP, CN, EU, WO)
 * - Propriétés obligatoires de chaque carte (titleKey, icon, svg, dictionnaire de noms)
 * - Fonction de localisation multilingue getRegionName (FR, EN et fallback)
 * - Cohérence des codes régionaux (provinces belges, régions françaises, etc.)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import { MAPS, getRegionName } from '../../js/map.js';
import { i18n } from '../../js/i18n.js';

describe('🗺️ Carte & Brasseries — Cartographie & Géolocalisation', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. Registre des Cartes ──
    it('MAPS — définit toutes les configurations régionales requises', () => {
        const expectedScopes = ['be', 'fr', 'de', 'nl', 'us', 'co', 'kr', 'jp', 'cn', 'eu', 'wo'];
        expectedScopes.forEach(scope => {
            expect(MAPS[scope]).toBeDefined();
            expect(typeof MAPS[scope].titleKey).toBe('string');
            expect(typeof MAPS[scope].icon).toBe('string');
            expect(typeof MAPS[scope].svg).toBe('string');
            expect(typeof MAPS[scope].names).toBe('object');
        });
    });

    it('MAPS — les cartes continentales/mondiales sont bien identifiées', () => {
        expect(MAPS['eu'].isContinental).toBe(true);
        expect(MAPS['wo'].isContinental).toBe(true);
        expect(MAPS['be'].isContinental).toBeUndefined();
    });

    // ── 2. Provinces Belges & Régions Clés ──
    it('MAPS["be"] — contient toutes les provinces belges officielles', () => {
        const beNames = MAPS['be'].names;
        const requiredProvinces = ['ANT', 'LIM', 'VBR', 'BRU', 'WBR', 'HAI', 'NAM', 'LIE', 'LUX', 'WVL', 'OVL'];
        requiredProvinces.forEach(code => {
            expect(beNames[code]).toBeDefined();
            expect(typeof beNames[code]).toBe('string');
        });
    });

    // ── 3. Traduction des Régions (getRegionName) ──
    it('getRegionName — renvoie la traduction française par défaut', () => {
        i18n.currentLang = 'fr';
        expect(getRegionName('be', 'BRU')).toBe('Bruxelles');
        expect(getRegionName('be', 'WVL')).toBe('West-Vlaanderen');
        expect(getRegionName('fr', 'FRIDF')).toBe('Île-de-France');
    });

    it('getRegionName — renvoie la traduction anglaise si la langue active est l\'anglais', () => {
        i18n.currentLang = 'en';
        expect(getRegionName('be', 'BRU')).toBe('Brussels');
        expect(getRegionName('be', 'WVL')).toBe('West Flanders');
        expect(getRegionName('be', 'ANT')).toBe('Antwerp');

        // Réinitialisation en français
        i18n.currentLang = 'fr';
    });

    it('getRegionName — renvoie le code brut si le scope ou le code est inconnu', () => {
        expect(getRegionName('inconnu', 'XYZ')).toBe('XYZ');
        expect(getRegionName('be', 'CODE_INEXISTANT')).toBe('CODE_INEXISTANT');
    });

});
