/**
 * Beerdex Custom Analytics Module (Offline-First)
 * Handles telemetry data and syncing to Google Apps Script endpoint.
 */

import * as Storage from './storage.js';

// TODO: Noah doit remplacer ceci par l'URL "Application Web" de Google Apps Script.
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbyIFsFsLFoNh_VyFkRZIxJ6TAZuYucIyuIV9a1R4aKAAGfVBR6KMzLGYPsZ1FD3MxLN/exec';

class AnalyticsTracker {
    constructor() {
        this.queueKey = 'beerdex_analytics_queue';
        this.userIdKey = 'beerdex_anon_id';
        this.userId = this._getOrGenerateId();
        this.deviceInfo = this._getDeviceInfo();

        // Listeners for sync triggers
        window.addEventListener('online', () => this.flush());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });

        // Optional periodic flush
        setInterval(() => this.flush(), 5 * 60 * 1000); // 5 mins
    }

    _getOrGenerateId() {
        let id = localStorage.getItem(this.userIdKey);
        if (!id) {
            id = 'anon_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem(this.userIdKey, id);
        }
        return id;
    }

    _getDeviceInfo() {
        return {
            ua: navigator.userAgent,
            platform: navigator.platform || 'unknown',
            screen: `${window.screen.width}x${window.screen.height}`,
            lang: navigator.language || 'unknown',
            isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || false,
            isMedian: !!window.median
        };
    }

    _getQueue() {
        try {
            const q = localStorage.getItem(this.queueKey);
            return q ? JSON.parse(q) : [];
        } catch {
            return [];
        }
    }

    _saveQueue(q) {
        localStorage.setItem(this.queueKey, JSON.stringify(q));
    }

    /**
     * Push event to tracking queue. 
     * @param {string} type - Event Type (e.g. 'beer_added', 'app_open')
     * @param {Object} data - Contextual data payload
     */
    track(type, data = {}) {
        if (!ENDPOINT_URL) return; // Skip if backend not configured

        const event = {
            timestamp: new Date().toISOString(),
            type,
            userId: this.userId,
            device: this.deviceInfo,
            data
        };

        const queue = this._getQueue();
        queue.push(event);

        // Cap queue to 100 to prevent localstorage bloat
        if (queue.length > 100) queue.shift();

        this._saveQueue(queue);

        // Try Immediate sync if we're online
        if (navigator.onLine) {
            this.flush();
        }
    }

    /**
     * Flush queue to server using POST beacon
     */
    flush() {
        if (!navigator.onLine || !ENDPOINT_URL) return;

        const queue = this._getQueue();
        if (queue.length === 0) return;

        const payload = JSON.stringify(queue);

        // Try Beacon for background send, fallback to fetch
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(ENDPOINT_URL, payload);
            if (success) {
                this._saveQueue([]); // clear queue optimally
                return;
            }
        }

        // Fallback fetch
        fetch(ENDPOINT_URL, {
            method: 'POST',
            body: payload,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // Simple text to avoid CORS preflight problems on Google Apps Script
        }).then(res => {
            if (res.ok) {
                this._saveQueue([]);
            }
        }).catch(err => {
            console.warn('[Analytics] Flush failed, will retry later.', err);
        });
    }

    /**
     * Runs once to summarize history into a single event
     */
    retroactiveSync() {
        if (!ENDPOINT_URL) return;
        if (localStorage.getItem('beerdex_retro_synced')) return;

        const allUserData = Storage.getAllUserData();
        const customBeers = Storage.getCustomBeers();

        let totalDrunk = 0;
        let totalFavorites = 0;
        let totalRatings = 0;
        let earliestDate = null;

        Object.values(allUserData).forEach(d => {
            if (d.count > 0) totalDrunk++;
            if (d.favorite) totalFavorites++;
            if (d.score) totalRatings++;
            if (d.timestamp) {
                const tsDate = new Date(d.timestamp);
                if (!earliestDate || tsDate < earliestDate) earliestDate = tsDate;
            }
        });

        this.track('retroactive_sync', {
            total_unique_beers_drunk: totalDrunk,
            total_favorites: totalFavorites,
            total_ratings: totalRatings,
            total_custom_beers: customBeers.length,
            earliest_activity_date: earliestDate ? earliestDate.toISOString() : null
        });

        localStorage.setItem('beerdex_retro_synced', 'true');
    }
}

export const Analytics = new AnalyticsTracker();
