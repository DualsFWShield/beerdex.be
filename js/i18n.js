import * as Storage from './storage.js';

/**
 * INTERNATIONALIZATION (I18N) SYSTEM
 * 
 * To add a new language:
 * 1. Create a new JSON file in data/locales/ (e.g., es.json).
 * 2. Add the language code to the supportedLangs array below.
 * 3. Ensure all keys in fr.json/en.json are translated in the new file.
 * 4. Add the language to the UI selection (e.g., in Settings modal).
 */
export const supportedLangs = ['fr', 'en'];

class I18nManager {
    constructor() {
        this.cache = {}; // Cache for loaded locales
        this.currentLang = 'fr'; // Default
        this.supportedLangs = supportedLangs;
    }

    async init() {
        // Retrieve saved language from preferences or detect browser language
        let savedLang = Storage.getPreference('app_language', null);
        if (!savedLang) {
            const browserLang = navigator.language.split('-')[0];
            savedLang = this.supportedLangs.includes(browserLang) ? browserLang : 'en';
        }
        
        await this.setLanguage(savedLang);
    }

    async setLanguage(lang) {
        if (!this.supportedLangs.includes(lang)) {
            lang = 'en';
        }

        this.currentLang = lang;
        Storage.savePreference('app_language', lang);

        if (!this.cache[lang]) {
            try {
                const response = await fetch(`data/locales/${lang}.json?v=${Date.now()}`);
                if (response.ok) {
                    this.cache[lang] = await response.json();
                } else {
                    console.error('Failed to load locale:', lang);
                    this.cache[lang] = {};
                }
            } catch (err) {
                console.error('Error fetching locale:', err);
                this.cache[lang] = {};
            }
        }

        this.translateDOM();
        
        // Dispatch an event so the app knows the language changed
        document.dispatchEvent(new CustomEvent('i18n-changed', { detail: { lang }}));
    }

    t(key, data = {}) {
        if (!this.cache[this.currentLang]) return key;
        let translation = this.cache[this.currentLang][key] || key;
        
        // Simple placeholder support: replace {key} with data.key
        Object.keys(data).forEach(k => {
            const regex = new RegExp(`{${k}}`, 'g');
            translation = translation.replace(regex, data[k]);
        });
        
        return translation;
    }

    translateDOM(root = document) {
        // Elements with data-i18n attribute (textContent)
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation !== key) {
                el.textContent = translation;
            }
        });

        // Elements with data-i18n-placeholder attribute
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation !== key) {
                el.placeholder = translation;
            }
        });

        // Elements with data-i18n-label (aria-label)
        root.querySelectorAll('[data-i18n-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-label');
            const translation = this.t(key);
            if (translation !== key) {
                el.setAttribute('aria-label', translation);
            }
        });
    }
}

export const i18n = new I18nManager();
