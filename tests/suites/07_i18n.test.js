/**
 * 07_i18n.test.js — Internationalization parity & translation tests.
 * 
 * Checks: key parity between FR and EN, interpolation, DOM translation.
 */
import { describe, it, expect } from '../core/test-framework.js';

let frLocale = null;
let enLocale = null;

try {
    const frRes = await fetch('../data/locales/fr.json');
    if (frRes.ok) frLocale = await frRes.json();

    const enRes = await fetch('../data/locales/en.json');
    if (enRes.ok) enLocale = await enRes.json();
} catch (e) {
    console.error('Failed to load locale files:', e);
}

describe('🌐 Internationalisation (i18n)', () => {

    // ── Locale Files Loading ──
    it('fr.json se charge correctement', () => {
        expect(frLocale).not.toBeNull();
        expect(typeof frLocale).toBe('object');
        expect(Object.keys(frLocale).length).toBeGreaterThan(100);
    });

    it('en.json se charge correctement', () => {
        expect(enLocale).not.toBeNull();
        expect(typeof enLocale).toBe('object');
        expect(Object.keys(enLocale).length).toBeGreaterThan(100);
    });

    // ── Key Parity ──
    it('Toutes les clés de fr.json existent dans en.json', () => {
        if (!frLocale || !enLocale) return;
        const frKeys = Object.keys(frLocale);
        const enKeys = new Set(Object.keys(enLocale));
        const missing = frKeys.filter(k => !enKeys.has(k));
        
        if (missing.length > 0) {
            throw new Error(
                `${missing.length} clés manquantes dans en.json:\n` +
                missing.slice(0, 20).map(k => `  - "${k}"`).join('\n') +
                (missing.length > 20 ? `\n  ... et ${missing.length - 20} de plus` : '')
            );
        }
        expect(missing.length).toBe(0);
    });

    it('Toutes les clés de en.json existent dans fr.json', () => {
        if (!frLocale || !enLocale) return;
        const enKeys = Object.keys(enLocale);
        const frKeys = new Set(Object.keys(frLocale));
        const missing = enKeys.filter(k => !frKeys.has(k));
        
        if (missing.length > 0) {
            throw new Error(
                `${missing.length} clés manquantes dans fr.json:\n` +
                missing.slice(0, 20).map(k => `  - "${k}"`).join('\n') +
                (missing.length > 20 ? `\n  ... et ${missing.length - 20} de plus` : '')
            );
        }
        expect(missing.length).toBe(0);
    });

    // ── No Empty Translations ──
    it('fr.json — aucune valeur vide', () => {
        if (!frLocale) return;
        const empty = Object.entries(frLocale).filter(([k, v]) => typeof v === 'string' && v.trim() === '');
        if (empty.length > 0) {
            throw new Error(`${empty.length} traductions vides dans fr.json:\n` + empty.slice(0, 10).map(([k]) => `  - "${k}"`).join('\n'));
        }
        expect(empty.length).toBe(0);
    });

    it('en.json — aucune valeur vide', () => {
        if (!enLocale) return;
        const empty = Object.entries(enLocale).filter(([k, v]) => typeof v === 'string' && v.trim() === '');
        if (empty.length > 0) {
            throw new Error(`${empty.length} traductions vides dans en.json:\n` + empty.slice(0, 10).map(([k]) => `  - "${k}"`).join('\n'));
        }
        expect(empty.length).toBe(0);
    });

    // ── Placeholder Consistency ──
    it('Les placeholders {xxx} sont identiques entre FR et EN', () => {
        if (!frLocale || !enLocale) return;

        const placeholderRegex = /\{(\w+)\}/g;
        const mismatches = [];

        for (const key of Object.keys(frLocale)) {
            if (!enLocale[key]) continue;
            const frVal = frLocale[key];
            const enVal = enLocale[key];

            if (typeof frVal !== 'string' || typeof enVal !== 'string') continue;

            const frPlaceholders = new Set([...frVal.matchAll(placeholderRegex)].map(m => m[1]));
            const enPlaceholders = new Set([...enVal.matchAll(placeholderRegex)].map(m => m[1]));

            // Check both directions
            for (const p of frPlaceholders) {
                if (!enPlaceholders.has(p)) {
                    mismatches.push(`"${key}": {${p}} in FR but not in EN`);
                }
            }
            for (const p of enPlaceholders) {
                if (!frPlaceholders.has(p)) {
                    mismatches.push(`"${key}": {${p}} in EN but not in FR`);
                }
            }
        }

        if (mismatches.length > 0) {
            throw new Error(`${mismatches.length} incohérences de placeholders:\n` + mismatches.slice(0, 15).map(m => `  - ${m}`).join('\n'));
        }
        expect(mismatches.length).toBe(0);
    });

    // ── Critical Keys Exist ──
    const criticalKeys = [
        'nav_home', 'nav_history', 'nav_stats', 'nav_settings',
        'search_placeholder', 'loading_app', 'status_offline',
        'bac_level_zero_title', 'bac_gamer_rank_global_elite',
        'toast_backup_downloaded', 'toast_copied'
    ];

    criticalKeys.forEach(key => {
        it(`Clé critique "${key}" existe dans FR et EN`, () => {
            if (!frLocale || !enLocale) return;
            expect(frLocale).toHaveProperty(key);
            expect(enLocale).toHaveProperty(key);
        });
    });

    // ── Interpolation Test (manual) ──
    it('Interpolation manuelle — {bac} remplacé dans une string', () => {
        const template = 'Your BAC is {bac} g/L';
        const result = template.replace(/\{bac\}/g, '0.50');
        expect(result).toBe('Your BAC is 0.50 g/L');
    });

    it('Interpolation manuelle — multiples placeholders', () => {
        const template = 'Wait {wait} to reach {limit} g/L';
        let result = template.replace(/\{wait\}/g, '2h30').replace(/\{limit\}/g, '0.5');
        expect(result).toBe('Wait 2h30 to reach 0.5 g/L');
    });
});
