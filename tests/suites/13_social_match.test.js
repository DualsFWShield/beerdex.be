/**
 * 13_social_match.test.js — Tests unitaires pour BeerMatch, comparaison P2P & statistiques sociales.
 * 
 * Couvre :
 * - Générateur de pseudonymes zythologiques aléatoires (getRandomPseudo)
 * - Accord grammatical du genre féminin/masculin (animaux, titres, adjectifs)
 * - Comparaison 1-vs-1 de profils de dégustation (Match.compute1on1)
 * - Agrégation des statistiques de groupe (Match.computeGroupStats, podiums, bières communes)
 * - Mise à jour du profil local (updateMyPseudo)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import Match, { getRandomPseudo, ANIMAL_NAMES, ADJECTIVES, TITLES } from '../../js/match.js';

describe('🍻 BeerMatch — Profils Sociaux, Dégustation P2P & Statistiques', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. Générateur de Pseudonymes ──
    it('getRandomPseudo — génère un pseudonyme non vide et structuré', () => {
        const pseudo = getRandomPseudo();
        expect(typeof pseudo).toBe('string');
        expect(pseudo.length).toBeGreaterThan(3);

        const words = pseudo.split(' ');
        expect(words.length).toBeGreaterThanOrEqual(2);
    });

    it('getRandomPseudo — contient des composants valides des listes de référence', () => {
        const pseudo = getRandomPseudo();
        // Vérifie qu'au moins un élément provient du lexique d'animaux
        const hasAnimal = ANIMAL_NAMES.some(a => pseudo.includes(a));
        expect(hasAnimal).toBe(true);
    });

    it('getRandomPseudo — respecte les accords grammaticaux féminins', () => {
        // Exécuter plusieurs tirages pour tester la cohérence de l'accord
        for (let i = 0; i < 20; i++) {
            const pseudo = getRandomPseudo();
            if (pseudo.includes('Chouette') || pseudo.includes('Loutre') || pseudo.includes('Panthère')) {
                // Doit utiliser un titre féminin s'il y a un titre
                expect(pseudo.includes('Baron ')).toBe(false);
                expect(pseudo.includes('Comte ')).toBe(false);
                expect(pseudo.includes('Lord ')).toBe(false);
                expect(pseudo.includes('Sir ')).toBe(false);
            }
        }
    });

    // ── 2. Comparaison 1-on-1 ──
    it('Match.compute1on1 — calcule correctement le score d\'affinité et les découvertes', () => {
        const allBeersMap = new Map([
            ['b1', { id: 'b1', title: 'Orval' }],
            ['b2', { id: 'b2', title: 'Chimay Bleue' }],
            ['b3', { id: 'b3', title: 'Rochefort 10' }],
            ['b4', { id: 'b4', title: 'Westmalle Tripel' }]
        ]);

        const myProfile = { tastedBeerIds: ['b1', 'b2', 'b3'] };
        const friendProfile = { tastedBeerIds: ['b2', 'b3', 'b4'] };

        const result = Match.compute1on1(myProfile, friendProfile, allBeersMap);

        // Communes: b2, b3 (2 bières)
        // Découvertes de l'ami: b4 (1 bière)
        // Union totale: b1, b2, b3, b4 (4 bières)
        // Score: 2 / 4 = 50%
        expect(result.score).toBe(50);
        expect(result.common.length).toBe(2);
        expect(result.discoveries.length).toBe(1);
        expect(result.discoveries[0].title).toBe('Westmalle Tripel');
    });

    it('Match.compute1on1 — gère les profils 100% identiques et 0% compatibles', () => {
        const allBeersMap = new Map([
            ['b1', { id: 'b1', title: 'Duvel' }],
            ['b2', { id: 'b2', title: 'Kwak' }]
        ]);

        // 100% identique
        const exactMatch = Match.compute1on1({ tastedBeerIds: ['b1'] }, { tastedBeerIds: ['b1'] }, allBeersMap);
        expect(exactMatch.score).toBe(100);
        expect(exactMatch.discoveries.length).toBe(0);

        // 0% identique
        const noMatch = Match.compute1on1({ tastedBeerIds: ['b1'] }, { tastedBeerIds: ['b2'] }, allBeersMap);
        expect(noMatch.score).toBe(0);
        expect(noMatch.common.length).toBe(0);
        expect(noMatch.discoveries.length).toBe(1);
    });

    // ── 3. Statistiques de Groupe ──
    it('Match.computeGroupAnalytics — agrège les totaux, podiums et bières les plus populaires', () => {
        const allBeersMap = new Map([
            ['b1', { id: 'b1', title: 'Gouden Carolus' }],
            ['b2', { id: 'b2', title: 'Tripel Karmeliet' }],
            ['b3', { id: 'b3', title: 'St. Bernardus Abt 12' }]
        ]);

        const members = new Map([
            ['user1', {
                pseudo: 'Alice',
                totalBeers: 4,
                totalLiters: 1.32,
                totalAlcoholLiters: 0.11,
                achievementsCount: 15,
                tastedBeerIds: ['b1', 'b2']
            }],
            ['user2', {
                pseudo: 'Bob',
                totalBeers: 7,
                totalLiters: 2.31,
                totalAlcoholLiters: 0.20,
                achievementsCount: 8,
                tastedBeerIds: ['b2', 'b3']
            }]
        ]);

        Match.members = members;
        const groupStats = Match.computeGroupAnalytics(allBeersMap);

        expect(groupStats.totalGroupBeers).toBe(11);
        expect(groupStats.totalGroupLiters).toBeCloseTo(3.63, 1);
        expect(groupStats.totalGroupAlcoholLiters).toBeCloseTo(0.31, 1);
        expect(groupStats.uniqueGroupBeers).toBe(3);

        // Podiums
        expect(groupStats.podiums.pilier.name).toBe('Bob');
        expect(groupStats.podiums.pilier.val).toBe(7);
        expect(groupStats.podiums.chasseur.name).toBe('Alice');
        expect(groupStats.podiums.chasseur.val).toBe(15);

        // Bière commune aux 2 participants: b2
        expect(groupStats.commonBeers.length).toBe(1);
        expect(groupStats.commonBeers[0].beer.title).toBe('Tripel Karmeliet');
        expect(groupStats.commonBeers[0].count).toBe(2);
    });

    // ── 4. Gestion du Pseudo Local ──
    it('Match.updateMyPseudo — met à jour le profil local et utilise un fallback aléatoire si vide', () => {
        Match.myProfile = { pseudo: 'AncienPseudo' };

        Match.updateMyPseudo('SuperBrasseur');
        expect(Match.myProfile.pseudo).toBe('SuperBrasseur');

        Match.updateMyPseudo('');
        expect(Match.myProfile.pseudo).not.toBe('');
        expect(Match.myProfile.pseudo).not.toBe('SuperBrasseur');
    });

});
