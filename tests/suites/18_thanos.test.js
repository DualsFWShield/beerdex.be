/**
 * 18_thanos.test.js — Tests unitaires & d'intégration pour le moteur Thanos
 * 
 * Valide :
 * 1. Le découpage des agglutinations CamelCase (LaGeuze -> La Geuze)
 * 2. L'invariance d'ordre et permutations (Tripel Karmeliet == Karmeliet Tripel)
 * 3. Les synonymes de styles multilingues (tripel == triple, geuze == gueuze)
 * 4. La normalisation des volumes (330ml, 33cl, 0.33L, 0,33L -> 33cl / 330ml)
 * 5. La normalisation de l'alcool (11°, 11%, 11 -> 11°)
 * 6. La normalisation des brasseries et groupes
 * 7. La génération de la fiche canonique
 * 8. Le matching et rejet strict des conflits de variantes (Blonde vs Brune, Kriek vs Gueuze)
 * 9. La recherche universelle (barre de recherche trouvant l'officielle peu importe la saisie)
 * 10. Le bouclier anti-perte de bières uniques (prévention du bug 134 -> 126)
 */

import { describe, it, expect } from '../core/test-framework.js';
import * as Thanos from '../../js/thanos.js';
import { fuzzyMatchBeers } from '../../js/utils.js';

describe('⚡ Thanos — Moteur de Réconciliation & Recherche Universelle', () => {

    // ── 1. Agglutinations & CamelCase ──
    it('splitAgglutinations — sépare le CamelCase et les chiffres collés', () => {
        expect(Thanos.splitAgglutinations('LaGeuze')).toBe('La Geuze');
        expect(Thanos.splitAgglutinations('TripelKarmeliet')).toBe('Tripel Karmeliet');
        expect(Thanos.splitAgglutinations('DuBocq')).toBe('Du Bocq');
        expect(Thanos.splitAgglutinations('Rochefort10')).toBe('Rochefort 10');
        expect(Thanos.splitAgglutinations('CorneTriple')).toBe('Corne Triple');
    });

    it('normalizeText — normalise, découpe et supprime les accents', () => {
        expect(Thanos.normalizeText('LaGeuze Spéciale')).toBe('la geuze speciale');
        expect(Thanos.normalizeText('Pêche Mel\' Bush (2024)')).toBe('peche mel bush 2024');
    });

    // ── 2. Tokens Canoniques & Synonymes ──
    it('extractCanonicalTokens — résout les synonymes bi-directionnels', () => {
        const tokens1 = Thanos.extractCanonicalTokens('Triple');
        const tokens2 = Thanos.extractCanonicalTokens('Tripel');
        expect(tokens1[0]).toBe('triple');
        expect(tokens2[0]).toBe('triple');

        const tokensGeuze = Thanos.extractCanonicalTokens('Geuze');
        const tokensGueuze = Thanos.extractCanonicalTokens('Gueuze');
        expect(tokensGeuze[0]).toBe('gueuze');
        expect(tokensGueuze[0]).toBe('gueuze');

        const tokensBlond = Thanos.extractCanonicalTokens('Blond');
        const tokensBlonde = Thanos.extractCanonicalTokens('Blonde');
        expect(tokensBlond[0]).toBe('blond');
        expect(tokensBlonde[0]).toBe('blond');

        const tokensDubbel = Thanos.extractCanonicalTokens('Dubbel');
        const tokensDouble = Thanos.extractCanonicalTokens('Double');
        expect(tokensDubbel[0]).toBe('double');
        expect(tokensDouble[0]).toBe('double');
    });

    // ── 3. Normalisation des Volumes ──
    it('parseVolumeStandard — standardise tous les formats vers cl et ml', () => {
        const formats = ['330 ml', '33 cl', '0.33 L', '330ml', '33cl', '0.33L', '0,33L', 33, 0.33];
        formats.forEach(f => {
            const res = Thanos.parseVolumeStandard(f);
            expect(res.ml).toBe(330);
            expect(res.canonical).toBe('33cl');
        });

        const formats75 = ['750 ml', '75 cl', '0.75 L', '75cl', '0.75L', 75, 0.75];
        formats75.forEach(f => {
            const res = Thanos.parseVolumeStandard(f);
            expect(res.ml).toBe(750);
            expect(res.canonical).toBe('75cl');
        });

        const formats150 = ['1.5L', '1,5 L', '150cl', '1500ml'];
        formats150.forEach(f => {
            const res = Thanos.parseVolumeStandard(f);
            expect(res.ml).toBe(1500);
            expect(res.canonical).toBe('1.5L');
        });
    });

    // ── 4. Normalisation de l'Alcool ──
    it('parseAlcoholStandard — standardise les degrés (11°, 11%, 11)', () => {
        const alcs = ['11°', '11%', '11', '11.0°', '11,0%', 11];
        alcs.forEach(a => {
            const res = Thanos.parseAlcoholStandard(a);
            expect(res.abv).toBe(11);
            expect(res.canonical).toBe('11°');
        });

        const alcsDec = ['8.5%', '8,5°', '8.5', 8.5];
        alcsDec.forEach(a => {
            const res = Thanos.parseAlcoholStandard(a);
            expect(res.abv).toBe(8.5);
            expect(res.canonical).toBe('8.5°');
        });
    });

    // ── 5. Normalisation des Brasseries ──
    it('normalizeBrewery — retire les mentions génériques et résout les groupes', () => {
        expect(Thanos.normalizeBrewery('Brasserie Cantillon')).toBe('Cantillon');
        expect(Thanos.normalizeBrewery('Brouwerij Bosteels')).toBe('Bosteels');
        expect(Thanos.normalizeBrewery('Mort Subite')).toBe('Alken-Maes');
        expect(Thanos.normalizeBrewery('Stella Artois')).toBe('AB InBev');
        expect(Thanos.normalizeBrewery('Desperados')).toBe('Heineken');
    });

    // ── 6. Représentation Canonique ──
    it('buildCanonicalBeer — génère le titre canonique complet', () => {
        const beer = {
            title: 'LaGeuze Triple',
            volume: '330 ml',
            alcohol: '11%',
            brewery: 'Brasserie Cantillon'
        };
        const canon = Thanos.buildCanonicalBeer(beer);
        expect(canon.canonicalDisplay).toBe('LaGeuze Triple 33cl 11° CANTILLON');
        expect(canon.standardVolume).toBe('33cl');
        expect(canon.standardAlcohol).toBe('11°');
    });

    // ── 7. Invariance aux Permutations & Exemples Réels ──
    it('matchBeers — identifie les permutations réelles (Tripel Karmeliet vs Karmeliet Tripel)', () => {
        const b1 = { id: 'OFF_1', title: 'TRIPEL KARMELIET', brewery: 'Bosteels', volume: '0.33 L', alcohol: '8.4°' };
        const b2 = { id: 'CUSTOM_1', title: 'Karmeliet Tripel', brewery: 'Bosteels', volume: '33cl', alcohol: '8.4%' };

        const match = Thanos.matchBeers(b1, b2);
        expect(match.isMatch).toBe(true);
        expect(match.score).toBeGreaterThanOrEqual(80);
    });

    it('matchBeers — identifie le vrai cas Vicaris Triple Gueuze peu importe la syntaxe', () => {
        const official = { id: 'VICARIS_TRIPLE_GUEUZE_BLONDE_0.33', title: 'Vicaris Triple Gueuze', brewery: 'Vicaris', volume: '0.33 L', alcohol: '8.5°' };
        
        // Toutes ces variations customs doivent matcher l'officielle
        const variations = [
            { title: 'Gueuze Triple Vicaris', volume: '33cl', alcohol: '8.5%' },
            { title: 'Vicaris Tripel Geuze', volume: '330ml', alcohol: '8.5°' },
            { title: 'Triple Gueuze Vicaris', volume: '0.33L', alcohol: '8.5' },
            { title: 'Tripel Gueuze', brewery: 'Vicaris', volume: '33cl', alcohol: '8.5%' }
        ];

        variations.forEach(v => {
            const res = Thanos.matchBeers(v, official);
            expect(res.isMatch).toBe(true);
            expect(res.score).toBeGreaterThanOrEqual(70);
        });
    });

    it('matchBeers — rejette strictement les conflits de variantes (Blonde vs Brune, etc.)', () => {
        const bBlonde = { title: 'Leffe Blonde', brewery: 'AB InBev', volume: '33cl', alcohol: '6.6°' };
        const bBrune = { title: 'Leffe Brune', brewery: 'AB InBev', volume: '33cl', alcohol: '6.5°' };
        const bTriple = { title: 'Leffe Triple', brewery: 'AB InBev', volume: '33cl', alcohol: '8.5°' };

        expect(Thanos.matchBeers(bBlonde, bBrune).isMatch).toBe(false);
        expect(Thanos.matchBeers(bBlonde, bTriple).isMatch).toBe(false);

        const bKriek = { title: 'Lindemans Kriek', brewery: 'Lindemans', volume: '25cl', alcohol: '3.5°' };
        const bGueuze = { title: 'Lindemans Gueuze', brewery: 'Lindemans', volume: '25cl', alcohol: '5.0°' };
        expect(Thanos.matchBeers(bKriek, bGueuze).isMatch).toBe(false);
    });

    // ── 8. Recherche Universelle (Barre de Recherche) ──
    it('fuzzyMatchBeers — trouve la bière officielle peu importe ce que l\'utilisateur écrit', () => {
        const catalog = [
            { id: 'KARMELIET', title: 'TRIPEL KARMELIET', brewery: 'Bosteels', volume: '0.33 L', alcohol: '8.4°', barcode: '5411222000010' },
            { id: 'VICARIS_TG', title: 'Vicaris Triple Gueuze', brewery: 'Vicaris', volume: '0.33 L', alcohol: '8.5°' },
            { id: 'ROCHEFORT_10', title: 'Rochefort 10 Trappistes', brewery: 'Abbaye Notre-Dame de Saint-Remy', volume: '0.33 L', alcohol: '11.3°' },
            { id: 'STELLA', title: 'Stella Artois', brewery: 'AB InBev', volume: '0.33 L', alcohol: '5.2°' },
            { id: 'DUVEL_666', title: 'Duvel 6.66', brewery: 'Duvel Moortgat', volume: '0.33 L', alcohol: '6.66°' }
        ];

        // 1. Ordre inversé
        const resReversed = fuzzyMatchBeers(catalog, 'karmeliet tripel');
        expect(resReversed.length).toBeGreaterThan(0);
        expect(resReversed[0].id).toBe('KARMELIET');

        // 2. Avec synonyme de style
        const resSynonym = fuzzyMatchBeers(catalog, 'karmeliet triple');
        expect(resSynonym.length).toBeGreaterThan(0);
        expect(resSynonym[0].id).toBe('KARMELIET');

        // 3. Cas agglutiné CamelCase
        const resAgglutinated = fuzzyMatchBeers(catalog, 'TripelKarmeliet');
        expect(resAgglutinated.length).toBeGreaterThan(0);
        expect(resAgglutinated[0].id).toBe('KARMELIET');

        // 4. Vicaris avec geuze au lieu de gueuze et ordre inversé
        const resVicaris = fuzzyMatchBeers(catalog, 'geuze triple vicaris');
        expect(resVicaris.length).toBeGreaterThan(0);
        expect(resVicaris[0].id).toBe('VICARIS_TG');

        // 5. Recherche avec degré et volume inclus
        const resWithSpecs = fuzzyMatchBeers(catalog, 'rochefort 10 11.3% 33cl');
        expect(resWithSpecs.length).toBeGreaterThan(0);
        expect(resWithSpecs[0].id).toBe('ROCHEFORT_10');

        // 6. Recherche par code-barre direct
        const resBarcode = fuzzyMatchBeers(catalog, '5411222000010');
        expect(resBarcode.length).toBeGreaterThan(0);
        expect(resBarcode[0].id).toBe('KARMELIET');

        // 7. Vrai cas réel "Triple Le Fort" -> trouve LEFORT TRIPLE et Le Fort Tripel, exclut les bières sans rapport
        const lefortCatalog = [
            { id: 'LEFORT_TRIPLE', title: 'LEFORT TRIPLE', brewery: 'OMER VANDER GHINSTE', volume: '0.33 L', alcohol: '8.8°' },
            { id: 'LE_FORT_TRIPEL', title: 'Le Fort Tripel', brewery: 'Omer Vander Ghinste', volume: '0.33 L', alcohol: '8.8°' },
            { id: 'FORT_LAPIN_8', title: 'Fort Lapin 8 Tripel', brewery: 'Fort Lapin', volume: '0.33 L', alcohol: '8°' },
            { id: 'KROMBACHER', title: 'Krombacher Pils', brewery: 'Krombacher', volume: '0.33 L', alcohol: '4.8°' },
            { id: 'ORVAL', title: 'Orval Trappist', brewery: 'Orval Brewery', volume: '0.33 L', alcohol: '6.2°' },
            { id: 'BOERKEN', title: 'Boerken', brewery: 'Den Ouden Advocaat', volume: '0.33 L', alcohol: '9.5°' }
        ];

        const resLeFort = fuzzyMatchBeers(lefortCatalog, 'Triple Le Fort');
        expect(resLeFort.length).toBeGreaterThanOrEqual(2);
        // Les 2 bières Le Fort doivent être en position 1 et 2
        const top2Ids = [resLeFort[0].id, resLeFort[1].id];
        expect(top2Ids).toContain('LEFORT_TRIPLE');
        expect(top2Ids).toContain('LE_FORT_TRIPEL');
        // Krombacher, Orval, Boerken ne doivent pas être renvoyés
        const allMatchedIds = resLeFort.map(b => b.id);
        expect(allMatchedIds).not.toContain('KROMBACHER');
        expect(allMatchedIds).not.toContain('ORVAL');
        expect(allMatchedIds).not.toContain('BOERKEN');

        // 8. Vrai cas réel "Bush Caractere"
        const bushCatalog = [
            { id: 'BUSH_CARACTERE_75', title: 'BUSH CARACTÈRE', brewery: 'BRASSERIE DUBUISSON', volume: '0.75 L', alcohol: '12.0°' },
            { id: 'BUSH_AMBREE_33', title: 'BUSH AMBREE CARACTERE', brewery: 'DUBUISSON', volume: '0.33 L', alcohol: '12°' },
            { id: 'BUSH_AMBER_12', title: 'Bush Amber 12° Caractere', brewery: 'Dubuisson', volume: '0.33 L', alcohol: '12°' },
            { id: 'JUPILER', title: 'Jupiler', brewery: 'AB InBev', volume: '0.33 L', alcohol: '5.2°' }
        ];
        const resBush = fuzzyMatchBeers(bushCatalog, 'Bush Caractere');
        expect(resBush.length).toBe(3);
        expect(resBush.map(b => b.id)).not.toContain('JUPILER');
    });

    // ── 9. Cas Réels Le Fort, Bush Caractère & Conflits de Séries ──
    it('matchBeers — réconcilie les doublons réels officiels (Le Fort Tripel / Bush Caractère)', () => {
        // Cas 1 : LEFORT TRIPLE ↔ Le Fort Tripel
        const bLeFort1 = { id: 'LEFORT TRIPLE_BLONDE_0.33', title: 'LEFORT TRIPLE', brewery: 'OMER VANDER GHINSTE', volume: '0.33 L', alcohol: '8.8°' };
        const bLeFort2 = { id: 'LE_FORT_TRIPEL_BIERE_0.33', title: 'Le Fort Tripel', brewery: 'Omer Vander Ghinste', volume: '0.33 L', alcohol: '8.8°' };

        const matchLeFort = Thanos.matchBeers(bLeFort1, bLeFort2);
        expect(matchLeFort.isMatch).toBe(true);
        expect(matchLeFort.score).toBeGreaterThanOrEqual(85);

        // Cas 2 : BUSH AMBREE CARACTERE ↔ Bush Amber 12° Caractere
        const bBush1 = { id: 'BUSH AMBREE CARACTERE_AMBREE_0.33', title: 'BUSH AMBREE CARACTERE', brewery: 'DUBUISSON', volume: '0.33 L', alcohol: '12°' };
        const bBush2 = { id: 'BUSH_AMBER_12_CARACTERE_BLONDE_0.33', title: 'Bush Amber 12° Caractere', brewery: 'Dubuisson', volume: '0.33 L', alcohol: '12°' };

        const matchBush = Thanos.matchBeers(bBush1, bBush2);
        expect(matchBush.isMatch).toBe(true);
        expect(matchBush.score).toBeGreaterThanOrEqual(85);

        // Cas 3 : Rejet strict des bières numérotées de même gamme (Rochefort 6 vs Rochefort 10)
        const bRochefort6 = { id: 'ROCHEFORT_6', title: 'Rochefort 6 Trappistes', brewery: 'Abbaye Notre-Dame de Saint-Remy', volume: '0.33 L', alcohol: '7.5°' };
        const bRochefort10 = { id: 'ROCHEFORT_10', title: 'Rochefort 10 Trappistes', brewery: 'Abbaye Notre-Dame de Saint-Remy', volume: '0.33 L', alcohol: '11.3°' };
        expect(Thanos.matchBeers(bRochefort6, bRochefort10).isMatch).toBe(false);

        const bFortLapin6 = { title: 'Fort Lapin 6 Dubbel', brewery: 'Fort Lapin', volume: '0.33 L', alcohol: '6°' };
        const bFortLapin10 = { title: 'Fort Lapin 10 Quadrupel', brewery: 'Fort Lapin', volume: '0.33 L', alcohol: '10°' };
        expect(Thanos.matchBeers(bFortLapin6, bFortLapin10).isMatch).toBe(false);
    });

    // ── 10. Bouclier Anti-Perte de Bières Uniques ──
    it('findCustomMatchesWithSafety — évalue avec précision l\'impact sur le compteur unique', () => {
        const customBeers = [
            { id: 'CUSTOM_KARM', title: 'Karmeliet Tripel', brewery: 'Bosteels', volume: '33cl', alcohol: '8.4%' },
            { id: 'CUSTOM_VIC', title: 'Vicaris Tripel Geuze', brewery: 'Vicaris', volume: '33cl', alcohol: '8.5%' }
        ];
        const officialBeers = [
            { id: 'KARMELIET', title: 'TRIPEL KARMELIET', brewery: 'Bosteels', volume: '0.33 L', alcohol: '8.4°' },
            { id: 'VICARIS_TG', title: 'Vicaris Triple Gueuze', brewery: 'Vicaris', volume: '0.33 L', alcohol: '8.5°' }
        ];

        // Scénario A : L'utilisateur a DÉJÀ bu Karmeliet (3 verres), mais n'a JAMAIS bu Vicaris
        const userData = {
            'KARMELIET': { count: 3, history: [{ date: '2026-01-01' }] }
        };

        const matches = Thanos.findCustomMatchesWithSafety(customBeers, officialBeers, userData);
        expect(matches.length).toBe(2);

        // Match 1 : Karmeliet -> fusion fait perdre -1 unique car l'officielle était déjà goûtée !
        const karmMatch = matches.find(m => m.customBeer.id === 'CUSTOM_KARM');
        expect(karmMatch.alreadyInDex).toBe(true);
        expect(karmMatch.uniqueImpact).toBe(-1);
        expect(karmMatch.officialExistingCount).toBe(3);

        // Match 2 : Vicaris -> fusion fait perdre 0 unique car l'officielle n'a JAMAIS été goûtée !
        const vicMatch = matches.find(m => m.customBeer.id === 'CUSTOM_VIC');
        expect(vicMatch.alreadyInDex).toBe(false);
        expect(vicMatch.uniqueImpact).toBe(0);
        expect(vicMatch.officialExistingCount).toBe(0);
    });

    // ── 11. Séparation stricte : Assistant Utilisateur vs Audit QA Lab ──
    it('Séparation stricte — runCheck ne traite que les customs, QA Lab audite les doublons officiels', () => {
        const allBeers = [
            { id: 'CUSTOM_LEFORT', title: 'Le Fort Tripel', brewery: 'Omer Vander Ghinste', volume: '33cl', alcohol: '8.8%' },
            { id: 'LEFORT TRIPLE_BLONDE_0.33', title: 'LEFORT TRIPLE', brewery: 'OMER VANDER GHINSTE', volume: '0.33 L', alcohol: '8.8°' },
            { id: 'LE_FORT_TRIPEL_BIERE_0.33', title: 'Le Fort Tripel', brewery: 'Omer Vander Ghinste', volume: '0.33 L', alcohol: '8.8°' }
        ];

        // 1. L'assistant utilisateur (runCheck) ne doit JAMAIS proposer de dédupliquer des bières officielles entre elles
        const userCustoms = [{ id: 'CUSTOM_LEFORT', title: 'Le Fort Tripel', brewery: 'Omer Vander Ghinste', volume: '33cl', alcohol: '8.8%' }];
        const officialOnly = allBeers.filter(b => !b.id.startsWith('CUSTOM_'));
        const userMatches = Thanos.findCustomMatchesWithSafety(userCustoms, officialOnly);
        expect(userMatches.length).toBe(1);
        expect(userMatches[0].customBeer.id).toBe('CUSTOM_LEFORT');

        // 2. Le scanner QA Lab (findCatalogDuplicatesFast) identifie les doublons internes officiels
        const qaDupes = Thanos.findCatalogDuplicatesFast(officialOnly, 80);
        expect(qaDupes.length).toBe(1);
        expect(qaDupes[0].score).toBeGreaterThanOrEqual(85);
        const dupeIds = [qaDupes[0].customBeer.id, qaDupes[0].officialBeer.id];
        expect(dupeIds).toContain('LEFORT TRIPLE_BLONDE_0.33');
        expect(dupeIds).toContain('LE_FORT_TRIPEL_BIERE_0.33');
    });

    // ── 12. Règle Canonique : Pas de 'bier' dans le titre (Kasteel Rouge vs Kasteelbier Rouge) ──
    it('Règle Canonique — privilégie Kasteel Rouge et rejette Kasteelbier Rouge', () => {
        const tokensA = Thanos.extractCanonicalTokens('KASTEEL ROUGE');
        const tokensB = Thanos.extractCanonicalTokens('Kasteelbier Rouge');
        expect(tokensA).toContain('kasteel');
        expect(tokensA).toContain('rouge');
        expect(tokensB).toContain('kasteel');
        expect(tokensB).toContain('rouge');
        expect(tokensB).not.toContain('bier');

        const kasteelOfficial = {
            id: 'KASTEEL ROUGE_ROUGE/RUBIS_0.33',
            title: 'KASTEEL ROUGE',
            brewery: 'VAN HONSEBROUCK',
            volume: '0.33 L',
            alcohol: '8°'
        };
        const kasteelDupe = {
            id: 'KASTEELBIER_ROUGE_AMBREE_0.33',
            title: 'Kasteelbier Rouge',
            brewery: 'Van Honsebrouck',
            volume: '0.33 L',
            alcohol: '8°'
        };
        const kasteelCan = {
            id: 'KASTEELBIER_ROUGE_BLIK_ROUGE___FRUIT_0.50',
            title: 'Kasteelbier Rouge Blik',
            brewery: 'Van Honsebrouck',
            volume: '0.50 L',
            alcohol: '8°'
        };

        const dupes = Thanos.findCatalogDuplicatesFast([kasteelOfficial, kasteelDupe, kasteelCan], 80);
        expect(dupes.length).toBe(2);

        // KASTEEL ROUGE doit être la cible canonique conservée pour les deux doublons
        dupes.forEach(d => {
            expect(d.officialBeer.id).toBe('KASTEEL ROUGE_ROUGE/RUBIS_0.33');
            expect(d.officialBeer.title).toBe('KASTEEL ROUGE');
        });

        const deletedIds = dupes.map(d => d.customBeer.id);
        expect(deletedIds).toContain('KASTEELBIER_ROUGE_AMBREE_0.33');
        expect(deletedIds).toContain('KASTEELBIER_ROUGE_BLIK_ROUGE___FRUIT_0.50');
    });
});


