/**
 * 15_events_wheel.test.js — Tests unitaires pour la Roue des Saveurs & le Système d'Événements.
 * 
 * Couvre :
 * - Roue des Saveurs (AromaWheel) :
 *   - 8 catégories maîtresses (Malté, Houblon, Fruité, Épicé, Torréfié, Floral, Herbacé, Levuré)
 *   - Couleurs et sous-arômes associés
 *   - Mathématiques de trigonométrie SVG (polarToCartesian, describeArc)
 *   - Gestion de l'état de sélection (selectedAromas)
 * - Système d'Événements (EventSystem) :
 *   - Activation automatique d'événements et détection de dates
 *   - Toggles automatiques (thème musée, BAC, widget) avec protection contre la ré-exécution (milestones)
 *   - Détection des bannières forcées (shouldForceBanner)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import { AromaWheel } from '../../js/aroma-wheel.js';
import { EventSystem } from '../../js/event-system.js';
import * as Storage from '../../js/storage.js';

describe('🎡 Saveurs & Événements — Roue des Arômes & Système Événementiel', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. Roue des Saveurs : Structure des Catégories ──
    it('AromaWheel — initialise les 8 catégories de zythologie avec couleurs et sous-arômes', () => {
        const dummyEl = document.createElement('div');
        const wheel = new AromaWheel(dummyEl);

        expect(wheel.categories.length).toBe(8);

        const categoryIds = wheel.categories.map(c => c.id);
        const expectedIds = ['malte', 'houblonne', 'fruite', 'epice', 'torrefie', 'floral', 'herbace', 'levure'];
        expectedIds.forEach(id => expect(categoryIds).toContain(id));

        // Chaque catégorie a une couleur et des sous-descripteurs
        wheel.categories.forEach(cat => {
            expect(cat.color.startsWith('#')).toBe(true);
            expect(Array.isArray(cat.sub)).toBe(true);
            expect(cat.sub.length).toBeGreaterThan(0);
        });
    });

    // ── 2. Roue des Saveurs : Géométrie SVG ──
    it('AromaWheel.polarToCartesian — convertit correctement les coordonnées polaires en cartésiennes', () => {
        const dummyEl = document.createElement('div');
        const wheel = new AromaWheel(dummyEl);

        // Au centre (0, 0) avec rayon 100 à 0° (sommet à cause de l'offset -90°)
        const topPoint = wheel.polarToCartesian(0, 0, 100, 0);
        expect(topPoint.x).toBeCloseTo(0, 1);
        expect(topPoint.y).toBeCloseTo(-100, 1);

        // À 90° (droite)
        const rightPoint = wheel.polarToCartesian(0, 0, 100, 90);
        expect(rightPoint.x).toBeCloseTo(100, 1);
        expect(rightPoint.y).toBeCloseTo(0, 1);
    });

    it('AromaWheel.describeArc — génère un chemin de tracé SVG valide', () => {
        const dummyEl = document.createElement('div');
        const wheel = new AromaWheel(dummyEl);

        const path = wheel.describeArc(100, 100, 30, 80, 0, 45);
        expect(typeof path).toBe('string');
        expect(path.startsWith('M')).toBe(true);
        expect(path.includes('A')).toBe(true);
        expect(path.includes('L')).toBe(true);
        expect(path.endsWith('Z')).toBe(true);
    });

    // ── 3. Roue des Saveurs : État de Sélection ──
    it('AromaWheel — gère l\'ensemble des arômes sélectionnés initialement', () => {
        const dummyEl = document.createElement('div');
        const initial = ['malte:Caramel', 'fruite:Banane'];
        const wheel = new AromaWheel(dummyEl, initial);

        expect(wheel.selectedAromas.has('malte:Caramel')).toBe(true);
        expect(wheel.selectedAromas.has('fruite:Banane')).toBe(true);
        expect(wheel.selectedAromas.has('epice:Poivre')).toBe(false);
    });

    // ── 4. Système d'Événements : Toggles Automatiques ──
    it('EventSystem._handleAutoToggles — active les options spécifiées et empêche le déclenchement multiple', () => {
        EventSystem._activeEvent = {
            id: 'fete_de_la_biere',
            automation: {
                museumTheme: true,
                bacCalculator: true,
                bacWidget: true
            }
        };

        // Première exécution -> activation des préférences
        EventSystem._handleAutoToggles();

        expect(Storage.getPreference('museumThemeEnabled', false)).toBe(true);
        expect(Storage.getPreference('bac_enabled', false)).toBe(true);
        expect(Storage.getPreference('bac_show_home', false)).toBe(true);
        expect(Storage.getPreference('eventAutoTriggered_fete_de_la_biere', false)).toBe(true);

        // Désactivation manuelle par l'utilisateur
        Storage.savePreference('museumThemeEnabled', false);

        // Deuxième appel -> le flag milestone empêche d'écraser le choix de l'utilisateur
        EventSystem._handleAutoToggles();
        expect(Storage.getPreference('museumThemeEnabled', false)).toBe(false);
    });

    // ── 5. Système d'Événements : Bannières Forcées ──
    it('EventSystem.shouldForceBanner — détecte si une bannière doit être affichée', () => {
        // Sans événement actif
        EventSystem._activeEvent = null;
        expect(EventSystem.shouldForceBanner()).toBe(false);

        // Événement avec forceDisplay
        EventSystem._activeEvent = {
            banner: { id: 'expo2026', forceDisplay: true }
        };
        expect(EventSystem.shouldForceBanner()).toBe(true);

        // Événement avec correspondance forceBannerId
        EventSystem._activeEvent = {
            banner: { id: 'expo2026', forceDisplay: false },
            automation: { forceBannerId: 'expo2026' }
        };
        expect(EventSystem.shouldForceBanner()).toBe(true);
    });

});
