/**
 * Beerdex Custom Analytics Module (Google Analytics 4 - Offline-First)
 * Handles telemetry data and syncing to GA4.
 */

import * as Storage from './storage.js';

// TODO: Remplacer ceci par ton ID de Mesure Google Analytics (commence par G-)
const GA_MEASUREMENT_ID = 'G-JH9QGTJGXJ';

class AnalyticsTracker {
    constructor() {
        this.queueKey = 'beerdex_ga4_queue';
        this.isInitialized = false;

        // Listeners for sync triggers
        window.addEventListener('online', () => this.flush());

        // Inject GA4 Script if ID is configured
        this._injectGA();
    }

    _injectGA() {
        if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.includes('XXXXX')) {
            console.warn('[Analytics] Google Analytics non configuré. Ajoute ton G-ID dans analytics.js');
            return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); }
        window.gtag('js', new Date());
        window.gtag('config', GA_MEASUREMENT_ID, {
            'send_page_view': false // On gère nous mêmes
        });

        this.isInitialized = true;

        // Push queued events if we just initialized
        setTimeout(() => this.flush(), 1000);
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
        if (!this.isInitialized) return; // Silent skip if not configured

        const timestampMs = Date.now();

        if (navigator.onLine && window.gtag) {
            // Send directly
            this._sendToGA(type, data);
        } else {
            // Queue for later
            const queue = this._getQueue();
            queue.push({ type, data, timestamp: timestampMs });

            // Cap queue to avoid bloat
            if (queue.length > 100) queue.shift();
            this._saveQueue(queue);
        }
    }

    _sendToGA(type, data) {
        if (!window.gtag) return;

        if (type === 'app_open') {
            window.gtag('event', 'app_open', { ...data });
        } else if (type === 'view_change') {
            window.gtag('event', 'page_view', {
                page_title: data.view,
                page_location: location.href,
                page_path: '/' + data.view
            });
        } else {
            // Standard custom event
            window.gtag('event', type, data);
        }
    }

    /**
     * Flush queue to server when back online
     */
    flush() {
        if (!navigator.onLine || !this.isInitialized || !window.gtag) return;

        const queue = this._getQueue();
        if (queue.length === 0) return;

        // Send queued events
        queue.forEach(event => {
            // In GA4, passing timestamp offsets via Measurement Protocol is possible but complex.
            // Pushing standard events is best-effort.
            this._sendToGA(event.type, event.data);
        });

        this._saveQueue([]);
    }

    /**
     * Summarize historical usage
     */
    retroactiveSync() {
        if (!this.isInitialized || localStorage.getItem('beerdex_ga_retro_synced')) return;

        const allUserData = Storage.getAllUserData();
        const customBeers = Storage.getCustomBeers();

        let totalDrunk = 0;
        let totalFavorites = 0;
        let totalRatings = 0;

        Object.values(allUserData).forEach(d => {
            if (d.count > 0) totalDrunk++;
            if (d.favorite) totalFavorites++;
            if (d.score) totalRatings++;
        });

        this.track('retroactive_sync', {
            unique_beers: totalDrunk,
            favorites: totalFavorites,
            ratings: totalRatings,
            custom_beers: customBeers.length
        });

        localStorage.setItem('beerdex_ga_retro_synced', 'true');
    }
}

export const Analytics = new AnalyticsTracker();
