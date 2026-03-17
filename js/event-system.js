import * as Storage from './storage.js';

/**
 * EventSystem handles special application events (like exhibitions, birthdays, etc.)
 * by centralizing their configuration and automation logic.
 */
export const EventSystem = {
    _config: null,
    _activeEvent: null,

    /**
     * Loads the event configuration and identifies if an event is active today.
     */
    async init() {
        try {
            const response = await fetch('event/events-config.json');
            this._config = await response.json();
            
            const now = new Date();

            this._activeEvent = this._config.events.find(event => {
                // 1. Force if debug is enabled
                if (event.debug) return true;

                // 2. Single-day check (v1)
                return (
                    now.getFullYear() === event.date.year &&
                    now.getMonth() === event.date.month &&
                    now.getDate() === event.date.day
                );
            });

            if (this._activeEvent) {
                this._handleAutoToggles();
            }
        } catch (e) {
            console.error("EventSystem: Failed to initialize events:", e);
        }
    },

    /**
     * Handles automatic preference toggles for the active event.
     * Uses a milestone flag to ensure it only triggers once.
     */
    _handleAutoToggles() {
        if (!this._activeEvent || !this._activeEvent.automation) return;

        const milestoneKey = `eventAutoTriggered_${this._activeEvent.id}`;
        const alreadyTriggered = Storage.getPreference(milestoneKey, false);

        if (!alreadyTriggered) {
            const auto = this._activeEvent.automation;
            
            if (auto.museumTheme) {
                Storage.savePreference('museumThemeEnabled', true);
            }
            if (auto.bacCalculator) {
                Storage.savePreference('bac_enabled', true);
            }
            if (auto.bacWidget) {
                Storage.savePreference('bac_show_home', true);
            }

            Storage.savePreference(milestoneKey, true);
            console.log(`EventSystem: Auto-enabled features for event "${this._activeEvent.id}"`);
        }
    },

    /**
     * Gets the active event if today corresponds to an event date.
     */
    getActiveEvent() {
        return this._activeEvent;
    },

    /**
     * Checks if a banner should be forced for the active event.
     */
    shouldForceBanner() {
        if (!this._activeEvent || !this._activeEvent.banner) return false;
        
        // Match if forceBannerId is defined in automation and matches the banner id
        const forceId = this._activeEvent.automation?.forceBannerId;
        const bannerId = this._activeEvent.banner.id;
        
        return (forceId && bannerId && forceId === bannerId) || this._activeEvent.banner.forceDisplay === true;
    }
};
