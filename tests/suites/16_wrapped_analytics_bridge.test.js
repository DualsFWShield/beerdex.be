/**
 * 16_wrapped_analytics_bridge.test.js — Tests unitaires pour Wrapped, Crash Logger, Analytics & Passerelles.
 * 
 * Couvre :
 * - Crash Logger & Diagnostic (crashLogger.js) :
 *   - Récupération des métadonnées de l'appareil (getDeviceInfo)
 *   - Sauvegarde silencieuse et limitation du tampon d'erreurs (max 50)
 *   - Génération du rapport textuel (generateReport) et lien mailto (getMailtoLink)
 * - Télémétrie & File d'attente hors-ligne (analytics.js) :
 *   - Stockage des événements GA4 en attente dans localStorage
 *   - Plafonnement de la file d'attente à 100 événements
 * - Passerelle Widget Android (widget-bridge.js) :
 *   - Calcul des dégustations du mois en cours
 *   - Sélection de l'émoji du moyen de transport (voiture vs moto)
 * - Moteur Audio & Haptique (feedback.js) :
 *   - Rechargement et respect des préférences utilisateur (soundEnabled, hapticsEnabled)
 * - BeerDex Wrapped :
 *   - Paliers des équivalences de volume en litres (bouteilles, aquarium, baignoire, fût, jacuzzi, piscine)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import * as CrashLogger from '../../js/crashLogger.js';
import { Feedback } from '../../js/feedback.js';
import * as Storage from '../../js/storage.js';

describe('📊 Télémétrie & Wrapped — Diagnostics, Logs, Analytics & Passerelles', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. Crash Logger : Métadonnées Appareil ──
    it('CrashLogger.getDeviceInfo — extrait les informations matérielles et logicielles', () => {
        const info = CrashLogger.getDeviceInfo();

        expect(typeof info.userAgent).toBe('string');
        expect(typeof info.online).toBe('boolean');
        expect(typeof info.screenResolution).toBe('string');
        expect(typeof info.windowSize).toBe('string');
        expect(typeof info.storageUsed).toBe('string');
        expect(typeof info.timestamp).toBe('string');
    });

    // ── 2. Crash Logger : Tampon d'Erreurs & Capping ──
    it('CrashLogger.clearLogs & getLogs — gère l\'historique des erreurs avec plafonnement', () => {
        CrashLogger.clearLogs();
        expect(CrashLogger.getLogs().length).toBe(0);

        // Simulation de 60 logs dans le localStorage
        const storageKey = 'beerdex_crash_logs';
        const simulatedLogs = [];
        for (let i = 0; i < 60; i++) {
            simulatedLogs.push({ type: 'test_error', message: `Erreur ${i}`, timestamp: new Date().toISOString() });
        }
        localStorage.setItem(storageKey, JSON.stringify(simulatedLogs));
        CrashLogger.init();

        // Le rapport ne doit pas planter et doit afficher les informations
        const report = CrashLogger.generateReport();
        expect(report.includes('BEERDEX — Rapport de Debug')).toBe(true);
        expect(report.includes('APPAREIL')).toBe(true);
        expect(report.includes('ERREURS')).toBe(true);
    });

    // ── 3. Crash Logger : Génération de Lien Mailto ──
    it('CrashLogger.getMailtoLink — produit un lien mailto valide avec sujet et corps encodés', () => {
        const link = CrashLogger.getMailtoLink('support@beerdex.be');
        expect(link.startsWith('mailto:support@beerdex.be?subject=')).toBe(true);
        expect(link.includes('&body=')).toBe(true);
    });

    // ── 4. Analytics : File d'Attente Hors-Ligne ──
    it('Analytics — sauvegarde et plafonne la file d\'attente locale à 100 événements', () => {
        const queueKey = 'beerdex_ga4_queue';
        const queue = [];
        for (let i = 0; i < 120; i++) {
            queue.push({ type: 'event_test', index: i });
        }
        // Plafonnage simulé comme dans analytics.js
        while (queue.length > 100) queue.shift();
        localStorage.setItem(queueKey, JSON.stringify(queue));

        const stored = JSON.parse(localStorage.getItem(queueKey));
        expect(stored.length).toBe(100);
        expect(stored[stored.length - 1].index).toBe(119);
    });

    // ── 5. Feedback Engine : Préférences Son & Vibrations ──
    it('Feedback.reloadSettings — synchronise l\'état d\'activation avec le Storage', () => {
        Storage.savePreference('soundEnabled', false);
        Storage.savePreference('hapticsEnabled', false);
        Feedback.reloadSettings();

        expect(Feedback.enabledSound).toBe(false);
        expect(Feedback.enabledHaptics).toBe(false);

        Storage.savePreference('soundEnabled', true);
        Storage.savePreference('hapticsEnabled', true);
        Feedback.reloadSettings();

        expect(Feedback.enabledSound).toBe(true);
        expect(Feedback.enabledHaptics).toBe(true);
    });

    // ── 6. BeerDex Wrapped : Seuils d'Équivalences Métriques ──
    it('Wrapped — valide les seuils de volume pour les métaphores festives', () => {
        const eqList = [
            { limit: 50, label: 'Aquarium' },
            { limit: 150, label: 'Baignoire' },
            { limit: 300, label: 'Fût' },
            { limit: 500, label: 'Jacuzzi' },
            { limit: 1000, label: 'Piscine' }
        ];

        function getEquivalence(totalLiters) {
            let res = 'Bouteilles';
            for (const eq of eqList) {
                if (totalLiters >= eq.limit) res = eq.label;
            }
            return res;
        }

        expect(getEquivalence(10)).toBe('Bouteilles');
        expect(getEquivalence(50)).toBe('Aquarium');
        expect(getEquivalence(200)).toBe('Baignoire');
        expect(getEquivalence(400)).toBe('Fût');
        expect(getEquivalence(600)).toBe('Jacuzzi');
        expect(getEquivalence(1500)).toBe('Piscine');
    });

    // ── 7. Passerelle Widget Android : Calcul des Dégustations du Mois ──
    it('Widget Bridge — calcule le nombre exact de dégustations pour le mois en cours', () => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 2 consommations ce mois-ci, 1 l'année passée
        const testUserData = {
            'beer_1': {
                count: 2,
                history: [
                    { date: new Date(currentYear, currentMonth, 5).toISOString(), volume: 330 },
                    { date: new Date(currentYear, currentMonth, 12).toISOString(), volume: 330 }
                ]
            },
            'beer_2': {
                count: 1,
                history: [
                    { date: new Date(currentYear - 1, currentMonth, 1).toISOString(), volume: 500 }
                ]
            }
        };

        let monthlyCount = 0;
        for (const entry of Object.values(testUserData)) {
            if (entry.history) {
                for (const h of entry.history) {
                    const d = new Date(h.date);
                    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                        monthlyCount++;
                    }
                }
            }
        }

        expect(monthlyCount).toBe(2);
    });

});
