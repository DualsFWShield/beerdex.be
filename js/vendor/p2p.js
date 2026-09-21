/**
 * AetherShare — P2P Engine (WebRTC via PeerJS)
 * Multi-Peer Mesh Edition
 * Supports bidirectional persistent data channels, multi-file sequential streaming,
 * broadcast sending, backpressure control, and instant reconnect.
 * 
 * Standalone Engine: Independent of DOM, suitable for external library use.
 */

class P2PEngine {
    constructor() {
        this.peer = null;
        this.peerId = null;
        this._initPromise = null;

        // Multi-peer maps
        this.connections = new Map(); // peerId -> DataConnection
        this.incomingFiles = new Map(); // peerId -> incomingFile state

        // Active connection event listeners
        this.eventListeners = {
            connected: [],
            disconnected: [],
            meta: [],
            progress: [],
            complete: [],
            error: [],
            message: []
        };
    }

    /**
     * Subscribe to engine events
     * @param {'connected'|'disconnected'|'meta'|'progress'|'complete'|'error'} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
        return this;
    }

    off(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
        }
        return this;
    }

    _emit(event, ...args) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(cb => {
                try { cb(...args); } catch (e) { console.error(`[P2P] Event ${event} error:`, e); }
            });
        }
    }

    /**
     * Initialize PeerJS and get a peer ID.
     * @param {string} customId Optional specific ID to request
     * @returns {Promise<string>} The assigned peer ID.
     */
    async init(customId = null) {
        if (this.peer && !this.peer.destroyed && this.peerId) {
            return this.peerId;
        }

        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            const config = {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' },
                        { urls: 'stun:stun.services.mozilla.com' },
                        { urls: 'stun:stun.cloudflare.com:3478' }
                    ]
                }
            };

            // Assuming PeerJS is loaded globally if used in browser
            const PeerClass = typeof window !== 'undefined' ? window.Peer : Peer;
            this.peer = customId ? new PeerClass(customId, config) : new PeerClass(config);

            this.peer.on('open', (id) => {
                this.peerId = id;
                console.log('[P2P] My peer ID:', id);
                this._initPromise = null;
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                console.log('[P2P] Incoming connection from:', conn.peer);
                if (conn.open) {
                    this._setupConnection(conn, false);
                } else {
                    conn.on('open', () => {
                        this._setupConnection(conn, false);
                    });
                }
            });

            this.peer.on('error', (err) => {
                console.error('[P2P] PeerJS Error:', err);
                this._emit('error', err);
                if (err.type === 'browser-incompatible' || err.type === 'invalid-id' || err.type === 'unavailable-id') {
                    this._initPromise = null;
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
                console.log('[P2P] Peer disconnected from signaling server. Reconnecting...');
                try { this.peer.reconnect(); } catch (e) { console.error(e); }
            });
        });

        return this._initPromise;
    }

    /**
     * Check if AT LEAST one peer connection is currently active.
     * @returns {boolean}
     */
    isConnected() {
        return this.connections.size > 0;
    }

    /**
     * Get a list of currently connected Peer IDs.
     * @returns {Array<string>}
     */
    getConnectedPeers() {
        return Array.from(this.connections.keys());
    }

    getReceiverHash() {
        return `P2P_RECV|${this.peerId}`;
    }

    getSenderHash(file) {
        if (file) {
            const safeName = encodeURIComponent(file.name);
            return `BEAM|${this.peerId}|${safeName}|${file.size}`;
        }
        return `BEAM|${this.peerId}`;
    }

    /**
     * Connect to a remote peer (outbound connection).
     * @param {string} remotePeerId
     * @returns {Promise<void>}
     */
    async connectTo(remotePeerId) {
        // Automatically init without customId if not already connected
        await this.init();

        if (remotePeerId === this.peerId) {
            throw new Error('Cannot connect to yourself.');
        }

        if (this.connections.has(remotePeerId)) {
            console.log('[P2P] Already connected to:', remotePeerId);
            return;
        }

        return new Promise((resolve, reject) => {
            console.log('[P2P] Connecting to peer:', remotePeerId);
            const conn = this.peer.connect(remotePeerId, {
                reliable: true,
                serialization: 'binary'
            });

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout (25s). Ensure the other device is online.'));
            }, 25000);

            conn.on('open', () => {
                clearTimeout(timeout);
                console.log('[P2P] Outbound connection opened with:', remotePeerId);
                this._setupConnection(conn, true);
                resolve();
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                console.error('[P2P] Outbound connection error:', err);
                this._emit('error', err);
                reject(err);
            });
        });
    }

    waitForSender(callbacks = {}) {
        if (callbacks.onConnected) this.on('connected', callbacks.onConnected);
        if (callbacks.onMeta) this.on('meta', callbacks.onMeta);
        if (callbacks.onProgress) this.on('progress', callbacks.onProgress);
        if (callbacks.onComplete) this.on('complete', callbacks.onComplete);
        if (callbacks.onError) this.on('error', callbacks.onError);
    }

    waitForReceiver(callbacks = {}) {
        if (callbacks.onReceiverConnected) this.on('connected', callbacks.onReceiverConnected);
        if (callbacks.onError) this.on('error', callbacks.onError);
    }

    async connectAndReceive(remotePeerId, callbacks = {}) {
        if (callbacks.onMeta) this.on('meta', callbacks.onMeta);
        if (callbacks.onProgress) this.on('progress', callbacks.onProgress);
        if (callbacks.onComplete) this.on('complete', callbacks.onComplete);
        if (callbacks.onError) this.on('error', callbacks.onError);
        await this.connectTo(remotePeerId);
    }

    /**
     * Internal: Attach data listeners to an open DataConnection.
     * @private
     */
    _setupConnection(conn, isOutbound) {
        const peerId = conn.peer;
        
        // Remove existing connection if any
        if (this.connections.has(peerId)) {
            try { this.connections.get(peerId).close(); } catch(e){}
        }

        this.connections.set(peerId, conn);
        this.incomingFiles.delete(peerId);

        conn.on('data', (data) => {
            this._handleIncomingData(data, peerId);
        });

        conn.on('close', () => {
            console.log('[P2P] Connection closed with:', peerId);
            this.connections.delete(peerId);
            this.incomingFiles.delete(peerId);
            this._emit('disconnected', peerId);
        });

        conn.on('error', (err) => {
            console.error(`[P2P] DataChannel error with ${peerId}:`, err);
            this._emit('error', err, peerId);
        });

        this._emit('connected', peerId, isOutbound);
    }

    /**
     * Internal: Process chunked stream data for a specific peer.
     * @private
     */
    _handleIncomingData(data, peerId) {
        try {
            if (data.type === 'meta') {
                console.log(`[P2P] Incoming file metadata from ${peerId}:`, data.filename, data.size);
                this.incomingFiles.set(peerId, {
                    meta: data,
                    chunks: [],
                    receivedSize: 0,
                    totalSize: data.size,
                    startTime: Date.now(),
                    initialized: true
                });

                this._emit('meta', peerId, {
                    filename: data.filename,
                    size: data.size,
                    fileType: data.fileType,
                    encrypted: data.encrypted,
                    salt: data.salt,
                    iv: data.iv,
                    fileIndex: data.fileIndex,
                    totalFiles: data.totalFiles
                });
            } else if (data.type === 'chunk') {
                const incomingFile = this.incomingFiles.get(peerId);
                
                if (!incomingFile || !incomingFile.initialized) {
                    console.warn(`[P2P] Received chunk before metadata from ${peerId}`);
                    return;
                }

                const chunkData = data.data;
                incomingFile.chunks.push(chunkData);

                const chunkSize = chunkData.byteLength || chunkData.size || 0;
                incomingFile.receivedSize += chunkSize;

                const elapsed = (Date.now() - incomingFile.startTime) / 1000;
                const percent = Math.min(100, Math.round(
                    (incomingFile.receivedSize / incomingFile.totalSize) * 100
                ));
                const speedMBps = elapsed > 0
                    ? ((incomingFile.receivedSize / (1024 * 1024)) / elapsed).toFixed(2)
                    : '—';

                this._emit('progress', peerId, percent, incomingFile.receivedSize, incomingFile.totalSize, speedMBps);

                // Check file completion
                if (incomingFile.receivedSize >= incomingFile.totalSize) {
                    console.log(`[P2P] File receive complete from ${peerId}:`, incomingFile.meta.filename);

                    const finalBlob = new Blob(incomingFile.chunks, {
                        type: incomingFile.meta.fileType || 'application/octet-stream'
                    });
                    const meta = incomingFile.meta;

                    // Reset buffer for this peer for the next file
                    this.incomingFiles.delete(peerId);

                    this._emit('complete', peerId, finalBlob, meta);
                }
            } else {
                // Generic data message (JSON / custom payload)
                this._emit('message', peerId, data);
            }
        } catch (err) {
            console.error(`[P2P] Data processing error for ${peerId}:`, err);
            this._emit('error', err, peerId);
        }
    }

    /**
     * Send arbitrary JSON/data message to peers.
     * @param {any} data 
     * @param {Array<string>} [targetPeerIds] 
     */
    sendMessage(data, targetPeerIds = null) {
        if (!this.isConnected()) return false;

        let targets = [];
        if (targetPeerIds && targetPeerIds.length > 0) {
            targets = targetPeerIds.map(id => this.connections.get(id)).filter(c => c && c.open);
        } else {
            targets = Array.from(this.connections.values()).filter(c => c && c.open);
        }

        for (const conn of targets) {
            try {
                conn.send(data);
            } catch (err) {
                console.error(`[P2P] Send message error to ${conn.peer}:`, err);
            }
        }
        return true;
    }

    /**
     * Send a single file over established connections.
     * @param {File|Blob} file 
     * @param {Object} [meta] 
     * @param {Function} [onProgress] 
     * @param {Array<string>} [targetPeerIds] - Array of specific peer IDs to send to. If empty/null, broadcasts to all.
     */
    async sendFile(file, meta = {}, onProgress, targetPeerIds = null) {
        if (!this.isConnected()) throw new Error('No active peer connections');

        let targets = [];
        if (targetPeerIds && targetPeerIds.length > 0) {
            targets = targetPeerIds.map(id => this.connections.get(id)).filter(c => c && c.open);
        } else {
            targets = Array.from(this.connections.values()).filter(c => c && c.open);
        }

        if (targets.length === 0) throw new Error('No valid target peers found');

        const CHUNK_SIZE = 16 * 1024; // 16KB
        const filename = meta.filename || file.name || 'file.bin';
        const totalSize = file.size;
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
        const startTime = Date.now();

        console.log(`[P2P] Broadcasting: ${filename} (${totalSize} bytes) to ${targets.length} peer(s)`);

        // 1. Send metadata header to all targets
        const header = {
            type: 'meta',
            filename,
            size: totalSize,
            fileType: file.type || 'application/octet-stream',
            totalChunks,
            ...meta
        };
        for (const conn of targets) {
            conn.send(header);
        }

        // 2. Stream chunks with multi-peer backpressure
        const arrayBuffer = await file.arrayBuffer();
        let offset = 0;
        let chunkIndex = 0;

        while (offset < totalSize) {
            const end = Math.min(offset + CHUNK_SIZE, totalSize);
            const chunk = arrayBuffer.slice(offset, end);

            const chunkPayload = {
                type: 'chunk',
                index: chunkIndex,
                data: chunk
            };

            for (const conn of targets) {
                conn.send(chunkPayload);
            }

            offset = end;
            chunkIndex++;

            const elapsed = (Date.now() - startTime) / 1000;
            const percent = Math.min(100, Math.round((offset / totalSize) * 100));
            const speedMBps = elapsed > 0 ? ((offset / (1024 * 1024)) / elapsed).toFixed(2) : '—';

            onProgress?.(percent, offset, totalSize, speedMBps);

            // Backpressure: yield every 25 chunks, wait for ALL targets to drain buffer
            if (chunkIndex % 25 === 0) {
                await Promise.all(targets.map(async (conn) => {
                    const dc = conn.dataChannel;
                    if (dc && dc.bufferedAmount > 1024 * 1024) {
                        return new Promise(resolve => {
                            const check = () => {
                                if (!dc || dc.bufferedAmount < 256 * 1024) {
                                    resolve();
                                } else {
                                    setTimeout(check, 20);
                                }
                            };
                            check();
                        });
                    }
                }));
                await new Promise(r => setTimeout(r, 4));
            }
        }

        console.log(`[P2P] Sent file successfully to ${targets.length} peer(s): ${filename}`);
    }

    /**
     * Send multiple files sequentially.
     */
    async sendFiles(files, metaProvider, onFileStart, onProgress, onFileComplete, targetPeerIds = null) {
        if (!this.isConnected()) throw new Error('No active peer connections');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const meta = metaProvider ? await metaProvider(file, i, files.length) : {};
            meta.fileIndex = i + 1;
            meta.totalFiles = files.length;
            meta.filename = meta.filename || file.name;

            onFileStart?.(file, i + 1, files.length);

            await this.sendFile(file, meta, (percent, sent, total, speed) => {
                onProgress?.(percent, sent, total, speed, i + 1, files.length);
            }, targetPeerIds);

            onFileComplete?.(file, i + 1, files.length);

            // Brief pause between files
            if (i < files.length - 1) {
                await new Promise(r => setTimeout(r, 80));
            }
        }
    }

    /**
     * Disconnect a specific peer, or ALL peers if no ID provided.
     */
    disconnect(peerId = null) {
        if (peerId) {
            const conn = this.connections.get(peerId);
            if (conn) {
                try { conn.close(); } catch(e){}
                this.connections.delete(peerId);
                this.incomingFiles.delete(peerId);
                this._emit('disconnected', peerId);
            }
        } else {
            for (const [id, conn] of this.connections.entries()) {
                try { conn.close(); } catch(e){}
                this.incomingFiles.delete(id);
                this._emit('disconnected', id);
            }
            this.connections.clear();
        }
    }

    /**
     * Destroy peer and cleanup completely.
     */
    destroy() {
        this.disconnect();
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { /* ignore */ }
            this.peer = null;
        }
        this.peerId = null;
        this._initPromise = null;
        this.eventListeners = {
            connected: [],
            disconnected: [],
            meta: [],
            progress: [],
            complete: [],
            error: []
        };
    }
}

// UMD / ES6 / Browser Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = P2PEngine;
}
if (typeof window !== 'undefined') {
    window.P2PEngine = P2PEngine;
    // Auto-instantiate for AetherShare legacy compatibility
    window.p2pEngine = new P2PEngine();
}
