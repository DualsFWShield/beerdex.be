/**
 * 17_p2p_sync.test.js — Tests unitaires pour le moteur P2P (P2PEngine) et la synchronisation OTA (OTASyncManager).
 * 
 * Couvre :
 * - P2PEngine :
 *   - Instanciation et bus d'événements (on, off, _emit)
 *   - État des connexions (isConnected, getConnectedPeers)
 *   - Calcul des empreintes de partage (getReceiverHash, getSenderHash)
 *   - Nettoyage et destruction (destroy)
 * - OTASyncManager :
 *   - Configuration des modes de synchronisation ('unilateral' vs 'bilateral')
 *   - Périmètre des données autorisées (allowedScopes)
 *   - Mappage des options d'exportation vers Storage (_mapScopesToStorageExport)
 *   - Application et fusion des données reçues (applyReceivedData)
 *   - Génération du profil local pour session P2P (Match.generateLocalProfile)
 */

import { describe, it, expect, beforeEach } from '../core/test-framework.js';
import { Sandbox } from '../core/sandbox.js';
import { OTASyncManager } from '../../js/ota-sync.js';
import Match from '../../js/match.js';
import * as Storage from '../../js/storage.js';

// Fallback if p2p.js is not preloaded via script tag
if (typeof window !== 'undefined' && !window.P2PEngine) {
    try {
        await import('../../js/vendor/p2p.js');
    } catch (_) {}
}

describe('📡 P2P & Synchronisation OTA — Moteur Réseau & Échanges Sans Serveur', () => {

    beforeEach(() => {
        Sandbox.reset();
    });

    // ── 1. P2PEngine : Bus d'Événements ──
    it('P2PEngine — instancie le moteur avec les collections et listes d\'écouteurs vides', () => {
        const engine = new window.P2PEngine();
        expect(engine).toBeDefined();
        expect(engine.isConnected()).toBe(false);
        expect(engine.getConnectedPeers().length).toBe(0);
        expect(engine.connections.size).toBe(0);
    });

    it('P2PEngine.on / off / _emit — gère les souscriptions et la diffusion d\'événements', () => {
        const engine = new window.P2PEngine();
        let callCount = 0;
        let lastPayload = null;

        const listener = (data) => {
            callCount++;
            lastPayload = data;
        };

        engine.on('message', listener);
        engine._emit('message', { hello: 'world' });

        expect(callCount).toBe(1);
        expect(lastPayload.hello).toBe('world');

        // Désinscription
        engine.off('message', listener);
        engine._emit('message', { hello: 'again' });
        expect(callCount).toBe(1); // Pas d'incrémentation
    });

    it('P2PEngine.getReceiverHash & getSenderHash — génère des signatures cohérentes', () => {
        const engine = new window.P2PEngine();
        engine.peerId = 'PEER_TEST_123';

        const recvHash = engine.getReceiverHash();
        expect(recvHash).toBe('P2P_RECV|PEER_TEST_123');

        const senderHash = engine.getSenderHash({ name: 'backup.json', size: 1024 });
        expect(senderHash).toBe('BEAM|PEER_TEST_123|backup.json|1024');

        const emptyFileHash = engine.getSenderHash(null);
        expect(emptyFileHash).toBe('BEAM|PEER_TEST_123');
    });

    it('P2PEngine.destroy — nettoie les connexions, fichiers temporaires et écouteurs', () => {
        const engine = new window.P2PEngine();
        engine.peerId = 'TO_DESTROY';
        engine.on('connected', () => {});

        engine.destroy();

        expect(engine.peerId).toBeNull();
        expect(engine.connections.size).toBe(0);
        expect(engine.eventListeners.connected.length).toBe(0);
    });

    // ── 2. OTASyncManager : Configuration & Scopes ──
    it('OTASyncManager — possède une configuration de scopes initiale valide', () => {
        expect(OTASyncManager.allowedScopes).toBeDefined();
        expect(OTASyncManager.allowedScopes.custom).toBe(true);
        expect(OTASyncManager.allowedScopes.ratings).toBe(true);
        expect(OTASyncManager.allowedScopes.history).toBe(true);
        expect(OTASyncManager.allowedScopes.bac).toBe(true);
        expect(OTASyncManager.allowedScopes.achievements).toBe(true);
    });

    it('OTASyncManager._mapScopesToStorageExport — mappe les drapeaux simples en options Storage', () => {
        const simpleScopes = {
            custom: true,
            ratings: false,
            history: true,
            theme: true
        };

        const mapped = OTASyncManager._mapScopesToStorageExport(simpleScopes);

        expect(mapped.exportCustom).toBe(true);
        expect(mapped.exportRatings).toBe(false);
        expect(mapped.exportHistory).toBe(true);
        expect(mapped.exportTheme).toBe(true);
        expect(mapped.exportAchievements).toBe(true); // default true
    });

    it('OTASyncManager.updateHostSettings — met à jour le mode et fusionne les scopes autorisés', () => {
        OTASyncManager.isHost = true;
        OTASyncManager.updateHostSettings('bilateral', { theme: true, prefs: true });

        expect(OTASyncManager.syncMode).toBe('bilateral');
        expect(OTASyncManager.allowedScopes.theme).toBe(true);
        expect(OTASyncManager.allowedScopes.prefs).toBe(true);
        expect(OTASyncManager.allowedScopes.custom).toBe(true); // Préservé

        // Remise à l'état initial
        OTASyncManager.isHost = false;
        OTASyncManager.syncMode = 'unilateral';
    });

    // ── 3. OTASyncManager : Application des Données Reçues ──
    it('OTASyncManager.applyReceivedData — fusionne un payload reçu et renvoie un rapport synthétique', () => {
        const payload = {
            version: '2.0',
            ratings: {
                'SYNC_BEER_1': {
                    count: 3,
                    score: 18,
                    comment: 'Excellente bière synchro',
                    history: [
                        { date: new Date(Date.now() - 20000).toISOString(), volume: 330 },
                        { date: new Date(Date.now() - 10000).toISOString(), volume: 330 },
                        { date: new Date().toISOString(), volume: 330 }
                    ]
                }
            },
            customBeers: [
                { id: 'CUSTOM_SYNC_1', title: 'Brassin Maison OTA', alcohol: '7.0%' }
            ]
        };

        const summary = OTASyncManager.applyReceivedData(payload, { custom: true, ratings: true, history: true });

        expect(summary.success).toBe(true);
        expect(summary.customBeersAdded).toBeGreaterThanOrEqual(1);

        // Vérification de la présence dans Storage
        const allCustom = Storage.getCustomBeers();
        expect(allCustom.some(b => b.id === 'CUSTOM_SYNC_1')).toBe(true);

        const allUser = Storage.getAllUserData();
        expect(allUser['SYNC_BEER_1']).toBeDefined();
        expect(allUser['SYNC_BEER_1'].count).toBe(3);
    });

    it('OTASyncManager.applyReceivedData — gère les payloads nuls sans lever d\'exception non gérée', () => {
        const summary = OTASyncManager.applyReceivedData(null);
        expect(summary.success).toBe(false);
    });

    // ── 4. Match : Profil Local pour Échange P2P ──
    it('Match.generateLocalProfile — extrait les statistiques de consommation pour la session P2P', () => {
        // Enregistrer une note de bière pour le profil
        Storage.addConsumption('BEER_P2P_TEST', '33cl');
        Storage.addConsumption('BEER_P2P_TEST', '33cl');
        Storage.savePreference('beermatch_pseudo', 'Zythologue_Expert');

        const mockBeers = [
            { id: 'BEER_P2P_TEST', title: 'Test Ale', volume: '33cl', alcohol: '8.0%' }
        ];

        const profile = Match.generateLocalProfile(mockBeers);

        expect(profile.pseudo).toBe('Zythologue_Expert');
        expect(profile.totalBeers).toBeGreaterThanOrEqual(2);
        expect(profile.tastedBeerIds).toContain('BEER_P2P_TEST');
    });

});
