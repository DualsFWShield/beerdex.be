/**
 * ota-sync.js
 * P2P Over-The-Air (OTA) Synchronization Module for Beerdex.
 * Uses WebRTC (via P2PEngine / PeerJS) to synchronize multiple devices in real-time.
 * 
 * Supports:
 * - Unilateral sync (Host pushes to all receivers)
 * - Bilateral sync (All devices contribute, host consolidates additively, master payload distributed to all)
 * - No artificial limit on connected devices, with resilient peer disconnection handling
 * - Host defines allowed scope and sync mode
 * - Guests can tailor their export scope (within host limits) and customize their import mode (Merge vs Overwrite)
 */

import * as Storage from './storage.js';

// Device naming helper
function getLocalDeviceName() {
    const pseudo = Storage.getPreference('beermatch_pseudo', '');
    let platform = 'Appareil';
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) platform = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) platform = 'iOS';
        else if (/macintosh/i.test(ua)) platform = 'Mac';
        else if (/windows/i.test(ua)) platform = 'PC';
        else if (/linux/i.test(ua)) platform = 'Linux';
    }
    if (pseudo) return `${pseudo} (${platform})`;
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `${platform} #${rnd}`;
}

export const OTASyncManager = {
    p2p: null,
    isHost: false,
    roomCode: null,
    myPeerId: null,
    myDeviceName: null,
    syncMode: 'unilateral', // 'unilateral' | 'bilateral'
    
    // Master scopes allowed by host
    allowedScopes: {
        custom: true,
        ratings: true,
        history: true,
        bac: true,
        theme: false,
        prefs: false,
        template: true,
        achievements: true
    },

    // Map of peerId -> { name, isHost, status }
    members: new Map(),
    
    // State change callback for UI
    onUpdate: null,

    // Internal collection state for bilateral sync
    _bilateralCollector: null,

    /**
     * Initialize the P2P engine instance if not already ready.
     */
    _ensureP2P: function() {
        if (!window.P2PEngine) {
            throw new Error("P2PEngine non disponible. Vérifiez la connexion.");
        }
        if (!this.p2p) {
            this.p2p = new window.P2PEngine();
            this.p2p.on('connected', (peerId) => this._onPeerConnected(peerId));
            this.p2p.on('disconnected', (peerId) => this._onPeerDisconnected(peerId));
            this.p2p.on('message', (peerId, data) => this._onMessage(peerId, data));
        }
    },

    /**
     * Start a new OTA Session as Host.
     * @param {Object} initialScopes - Initial allowed data scopes
     * @param {string} syncMode - 'unilateral' or 'bilateral'
     * @param {Function} onUpdate - UI update handler
     * @returns {Promise<string>} The generated room code
     */
    createSession: async function(initialScopes = {}, syncMode = 'unilateral', onUpdate = null) {
        this.closeSession();
        this._ensureP2P();
        this.isHost = true;
        this.onUpdate = onUpdate;
        this.syncMode = syncMode;
        this.myDeviceName = getLocalDeviceName();

        if (initialScopes && Object.keys(initialScopes).length > 0) {
            this.allowedScopes = { ...this.allowedScopes, ...initialScopes };
        }

        // Generate clean 6-character room code (avoiding ambiguous chars)
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        this.roomCode = code;

        const hostPeerId = `beerdex-ota-${this.roomCode}`;
        this.myPeerId = await this.p2p.init(hostPeerId);

        this.members.clear();
        this.members.set(this.myPeerId, {
            peerId: this.myPeerId,
            name: this.myDeviceName,
            isHost: true,
            status: 'online'
        });

        this._emitUpdate({ type: 'session_ready', roomCode: this.roomCode });
        return this.roomCode;
    },

    /**
     * Join an existing OTA Session as Guest / Receiver.
     * @param {string} roomCode - 6-character code
     * @param {Function} onUpdate - UI update handler
     */
    joinSession: async function(roomCode, onUpdate = null) {
        this.closeSession();
        this._ensureP2P();
        this.isHost = false;
        this.onUpdate = onUpdate;
        this.roomCode = (roomCode || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
        this.myDeviceName = getLocalDeviceName();

        if (!this.roomCode || this.roomCode.length !== 6) {
            throw new Error("Code de salon invalide (6 caractères requis).");
        }

        this.myPeerId = await this.p2p.init();
        const hostPeerId = `beerdex-ota-${this.roomCode}`;

        this.members.clear();
        this.members.set(this.myPeerId, {
            peerId: this.myPeerId,
            name: this.myDeviceName,
            isHost: false,
            status: 'connecting'
        });

        this._emitUpdate({ type: 'connecting', roomCode: this.roomCode });

        // Connect to host
        await this.p2p.connectTo(hostPeerId);

        // Handshake: introduce ourselves
        this.p2p.sendMessage({
            type: 'ota_hello',
            peerId: this.myPeerId,
            name: this.myDeviceName
        }, [hostPeerId]);
    },

    /**
     * Host updates settings (sync mode or allowed scopes) and broadcasts to all clients.
     */
    updateHostSettings: function(syncMode, allowedScopes) {
        if (!this.isHost) return;
        if (syncMode) this.syncMode = syncMode;
        if (allowedScopes) this.allowedScopes = { ...this.allowedScopes, ...allowedScopes };

        this._broadcastConfig();
        this._emitUpdate({ type: 'config_updated' });
    },

    /**
     * Broadcast current configuration to all connected peers.
     */
    _broadcastConfig: function() {
        if (!this.isHost || !this.p2p) return;
        const memberList = Array.from(this.members.values());
        this.p2p.sendMessage({
            type: 'ota_config_broadcast',
            roomCode: this.roomCode,
            syncMode: this.syncMode,
            allowedScopes: this.allowedScopes,
            members: memberList
        });
    },

    /**
     * Peer connected event handler
     */
    _onPeerConnected: function(peerId) {
        console.log('[OTA] Peer connected:', peerId);
        if (this.isHost) {
            // Wait for ota_hello to get their device name
        } else {
            // Connected to host
            const hostPeerId = `beerdex-ota-${this.roomCode}`;
            if (peerId === hostPeerId) {
                const me = this.members.get(this.myPeerId);
                if (me) me.status = 'connected';
                this._emitUpdate({ type: 'connected_to_host' });
            }
        }
    },

    /**
     * Peer disconnected event handler (Resilient: others remain unaffected)
     */
    _onPeerDisconnected: function(peerId) {
        console.log('[OTA] Peer disconnected:', peerId);
        if (this.isHost) {
            this.members.delete(peerId);
            this._broadcastConfig();
            this._emitUpdate({ type: 'peer_left', peerId });

            // If a bilateral collection was waiting for this peer, resolve it
            if (this._bilateralCollector && this._bilateralCollector.waitingFor.has(peerId)) {
                this._bilateralCollector.waitingFor.delete(peerId);
                this._checkBilateralCollectionDone();
            }
        } else {
            const hostPeerId = `beerdex-ota-${this.roomCode}`;
            if (peerId === hostPeerId) {
                this._emitUpdate({ type: 'host_disconnected' });
            }
        }
    },

    /**
     * Message router for OTA protocol
     */
    _onMessage: function(peerId, data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'ota_hello': {
                if (this.isHost) {
                    this.members.set(peerId, {
                        peerId,
                        name: data.name || `Appareil (${peerId.slice(-4)})`,
                        isHost: false,
                        status: 'connected'
                    });
                    this._broadcastConfig();
                    this._emitUpdate({ type: 'peer_joined', peerId });
                }
                break;
            }

            case 'ota_config_broadcast': {
                if (!this.isHost) {
                    this.syncMode = data.syncMode || 'unilateral';
                    this.allowedScopes = data.allowedScopes || this.allowedScopes;
                    if (Array.isArray(data.members)) {
                        this.members.clear();
                        data.members.forEach(m => this.members.set(m.peerId, m));
                    }
                    this._emitUpdate({
                        type: 'config_received',
                        syncMode: this.syncMode,
                        allowedScopes: this.allowedScopes,
                        members: this.members
                    });
                }
                break;
            }

            case 'ota_push_payload': {
                // Received unilateral sync payload from host
                if (!this.isHost) {
                    this._emitUpdate({
                        type: 'payload_received',
                        mode: 'unilateral',
                        payload: data.payload,
                        scopes: data.scopes
                    });
                }
                break;
            }

            case 'ota_req_bilateral_data': {
                // Host requested guest data for bilateral sync
                if (!this.isHost) {
                    this._emitUpdate({
                        type: 'bilateral_request_received',
                        allowedScopes: data.allowedScopes
                    });
                }
                break;
            }

            case 'ota_guest_bilateral_payload': {
                // Host received data from one of the guests
                if (this.isHost && this._bilateralCollector) {
                    this._bilateralCollector.received.set(peerId, data.payload);
                    this._bilateralCollector.waitingFor.delete(peerId);
                    this._emitUpdate({
                        type: 'bilateral_peer_contributed',
                        peerId,
                        remaining: this._bilateralCollector.waitingFor.size
                    });
                    this._checkBilateralCollectionDone();
                }
                break;
            }

            case 'ota_master_bilateral_payload': {
                // Received final consolidated bilateral payload from host
                if (!this.isHost) {
                    this._emitUpdate({
                        type: 'master_bilateral_received',
                        payload: data.payload,
                        scopes: data.scopes
                    });
                }
                break;
            }

            case 'ota_ack': {
                this._emitUpdate({
                    type: 'peer_sync_completed',
                    peerId,
                    summary: data.summary
                });
                break;
            }

            default:
                break;
        }
    },

    /**
     * Trigger synchronization (Called by Host).
     * @param {Object} hostExportOptions - What host exports
     * @param {Object} hostImportOptions - How host imports (for bilateral)
     */
    startSync: async function(hostExportOptions = {}, hostImportOptions = {}) {
        if (!this.isHost) throw new Error("Seul l'hôte peut déclencher la synchronisation.");

        const remotePeers = Array.from(this.members.keys()).filter(id => id !== this.myPeerId);
        if (remotePeers.length === 0) {
            throw new Error("Aucun autre appareil n'est connecté à la session.");
        }

        this._emitUpdate({ type: 'sync_starting', mode: this.syncMode });

        if (this.syncMode === 'unilateral') {
            // Unilateral: Host exports and pushes directly to all clients
            const payload = Storage.generateExportObject(this._mapScopesToStorageExport(hostExportOptions));
            this.p2p.sendMessage({
                type: 'ota_push_payload',
                payload,
                scopes: hostExportOptions
            });
            this._emitUpdate({ type: 'sync_sent', mode: 'unilateral', count: remotePeers.length });
        } else {
            // Bilateral: Host asks all clients to send their data
            this._bilateralCollector = {
                waitingFor: new Set(remotePeers),
                received: new Map(),
                hostExportOptions,
                hostImportOptions,
                startTime: Date.now()
            };

            this.p2p.sendMessage({
                type: 'ota_req_bilateral_data',
                allowedScopes: this.allowedScopes
            });

            this._emitUpdate({
                type: 'bilateral_waiting_peers',
                total: remotePeers.length,
                remaining: remotePeers.length
            });

            // Safety timeout: if a peer never responds within 15s, continue anyway
            setTimeout(() => {
                if (this._bilateralCollector) {
                    console.warn('[OTA] Bilateral collection timeout reached, proceeding with available data.');
                    this._finishBilateralSync();
                }
            }, 15000);
        }
    },

    /**
     * Guest responds to host's bilateral request by sending its permitted data.
     */
    sendGuestBilateralPayload: function(guestOutgoingOptions) {
        if (this.isHost) return;
        const hostPeerId = `beerdex-ota-${this.roomCode}`;
        
        // Ensure guest cannot export anything forbidden by host's allowedScopes
        const sanitizedOptions = {};
        Object.keys(this.allowedScopes).forEach(k => {
            sanitizedOptions[k] = this.allowedScopes[k] && guestOutgoingOptions[k] === true;
        });

        const payload = Storage.generateExportObject(this._mapScopesToStorageExport(sanitizedOptions));
        this.p2p.sendMessage({
            type: 'ota_guest_bilateral_payload',
            payload
        }, [hostPeerId]);

        this._emitUpdate({ type: 'bilateral_contribution_sent' });
    },

    /**
     * Check if all peers have sent their data for bilateral sync.
     */
    _checkBilateralCollectionDone: function() {
        if (!this._bilateralCollector) return;
        if (this._bilateralCollector.waitingFor.size === 0) {
            this._finishBilateralSync();
        }
    },

    /**
     * Consolidate bilateral data on the host, then broadcast master payload to all.
     */
    _finishBilateralSync: function() {
        if (!this._bilateralCollector) return;
        const collector = this._bilateralCollector;
        this._bilateralCollector = null;

        try {
            // 1. Merge each guest's incoming data into host's local storage additively
            collector.received.forEach((guestPayload, peerId) => {
                try {
                    Storage.mergeUserData(guestPayload, {
                        importCustom: collector.hostExportOptions.custom ?? true,
                        importRatings: collector.hostExportOptions.ratings ?? true,
                        importHistory: collector.hostExportOptions.history ?? true,
                        importTheme: false, // Don't let peers overwrite host's visual theme
                        importBac: false,   // Don't overwrite personal BAC profile
                        importPrefs: false,
                        importTemplate: collector.hostExportOptions.template ?? false,
                        importAchievements: collector.hostExportOptions.achievements ?? true,
                        overwriteMode: false // Always additive merge for bilateral
                    });
                } catch (err) {
                    console.error('[OTA] Error merging data from peer', peerId, err);
                }
            });

            // 2. Generate consolidated master dataset
            const masterPayload = Storage.generateExportObject(
                this._mapScopesToStorageExport(collector.hostExportOptions)
            );

            // 3. Broadcast master payload to all connected peers
            this.p2p.sendMessage({
                type: 'ota_master_bilateral_payload',
                payload: masterPayload,
                scopes: collector.hostExportOptions
            });

            this._emitUpdate({
                type: 'bilateral_master_completed',
                contributors: collector.received.size + 1
            });
        } catch (e) {
            console.error('[OTA] Bilateral consolidation failed:', e);
            this._emitUpdate({ type: 'sync_error', error: e.message });
        }
    },

    /**
     * Apply received data to local storage.
     * @param {Object} payload - The received Beerdex data object
     * @param {Object} userImportChoices - User's customized checkboxes for what to apply
     * @param {boolean} overwriteMode - Whether to overwrite or merge
     * @returns {Object} Summary stats of imported items
     */
    applyReceivedData: function(payload, userImportChoices = {}, overwriteMode = false) {
        if (!payload) {
            console.error('[OTA] applyReceivedData: payload is null or undefined!');
            return { success: false, error: 'Payload vide' };
        }

        console.log('[OTA] Applying received payload data:', payload);

        const options = {
            importCustom: userImportChoices.custom ?? true,
            importRatings: userImportChoices.ratings ?? true,
            importHistory: userImportChoices.history ?? true,
            importTheme: userImportChoices.theme ?? false,
            importBac: userImportChoices.bac ?? false,
            importPrefs: userImportChoices.prefs ?? false,
            importTemplate: userImportChoices.template ?? false,
            importAchievements: userImportChoices.achievements ?? true,
            overwriteMode: !!overwriteMode
        };

        const beforeCustom = (Storage.getCustomBeers ? Storage.getCustomBeers().length : 0);
        const beforeRatings = Object.keys(Storage.getAllUserData ? Storage.getAllUserData() : {}).length;

        // Perform storage merge into local storage
        Storage.mergeUserData(payload, options);

        // Notify runtime if custom beers were added
        if (window.addImportedCustomBeers && payload.customBeers && Array.isArray(payload.customBeers)) {
            try {
                window.addImportedCustomBeers(payload.customBeers);
            } catch (e) {
                console.warn('[OTA] Failed to notify runtime of custom beers:', e);
            }
        }

        const afterCustom = (Storage.getCustomBeers ? Storage.getCustomBeers().length : 0);
        const afterRatings = Object.keys(Storage.getAllUserData ? Storage.getAllUserData() : {}).length;

        const summary = {
            success: true,
            mode: this.syncMode,
            customBeersAdded: Math.max(0, afterCustom - beforeCustom),
            ratingsUpdated: Math.max(0, afterRatings - beforeRatings)
        };

        console.log('[OTA] Applied received data summary:', summary);

        // Send ACK to host
        if (!this.isHost && this.roomCode) {
            const hostPeerId = `beerdex-ota-${this.roomCode}`;
            this.p2p.sendMessage({
                type: 'ota_ack',
                summary
            }, [hostPeerId]);
        }

        return summary;
    },

    /**
     * Convert simple scope keys ({ custom, ratings, ... }) to Storage options format.
     */
    _mapScopesToStorageExport: function(scopes = {}) {
        return {
            exportCustom: scopes.custom ?? true,
            exportRatings: scopes.ratings ?? true,
            exportHistory: scopes.history ?? true,
            exportTheme: scopes.theme ?? false,
            exportBac: scopes.bac ?? false,
            exportPrefs: scopes.prefs ?? false,
            exportTemplate: scopes.template ?? false,
            exportAchievements: scopes.achievements ?? true
        };
    },

    /**
     * Internal emitter for UI updates
     */
    _emitUpdate: function(event) {
        if (typeof this.onUpdate === 'function') {
            try {
                const meta = {
                    roomCode: this.roomCode,
                    isHost: this.isHost,
                    syncMode: this.syncMode,
                    allowedScopes: this.allowedScopes,
                    members: Array.from(this.members.values()),
                    myPeerId: this.myPeerId
                };
                const mergedEvent = { ...meta, ...event };
                this.onUpdate(mergedEvent, meta);
            } catch (err) {
                console.error('[OTA] UI update callback error:', err);
            }
        }
    },

    /**
     * Close the current session cleanly.
     */
    closeSession: function() {
        if (this.p2p) {
            try {
                this.p2p.destroy();
            } catch (e) { /* ignore */ }
            this.p2p = null;
        }
        this.members.clear();
        this.isHost = false;
        this.roomCode = null;
        this.myPeerId = null;
        this._bilateralCollector = null;
    }
};

window.OTASyncManager = OTASyncManager;
