/**
 * 08_theme.test.js — Theme engine tests.
 * 
 * Validates theme presets, CSS variables, and import/export.
 */
import { describe, it, expect } from '../core/test-framework.js';

let Theme;
try {
    Theme = await import('../../js/theme.js');
} catch (e) {
    console.error('Failed to import theme module:', e);
}

describe('🎨 Moteur de Thèmes', () => {

    // ── THEME_VARS Structure ──
    it('THEME_VARS est un tableau non vide', () => {
        expect(Array.isArray(Theme.THEME_VARS)).toBe(true);
        expect(Theme.THEME_VARS.length).toBeGreaterThan(5);
    });

    it('Chaque THEME_VAR a les champs requis (key, label, group, default)', () => {
        Theme.THEME_VARS.forEach(v => {
            expect(v).toHaveProperty('key');
            expect(v).toHaveProperty('label');
            expect(v).toHaveProperty('group');
            expect(v).toHaveProperty('default');
            expect(v.key).toStartWith('--');
        });
    });

    it('THEME_VARS contient les variables critiques', () => {
        const keys = Theme.THEME_VARS.map(v => v.key);
        expect(keys).toContain('--bg-dark');
        expect(keys).toContain('--accent-gold');
        expect(keys).toContain('--text-primary');
        expect(keys).toContain('--border-color');
    });

    // ── Presets ──
    it('THEME_PRESETS contient le preset "default"', () => {
        expect(Theme.THEME_PRESETS).toHaveProperty('default');
    });

    it('THEME_PRESETS contient le preset "cyberpunk"', () => {
        expect(Theme.THEME_PRESETS).toHaveProperty('cyberpunk');
    });

    it('THEME_PRESETS contient le preset "forest"', () => {
        expect(Theme.THEME_PRESETS).toHaveProperty('forest');
    });

    it('Chaque preset a un name, emoji et colors', () => {
        Object.entries(Theme.THEME_PRESETS).forEach(([key, preset]) => {
            expect(preset).toHaveProperty('name');
            expect(preset).toHaveProperty('emoji');
            expect(preset).toHaveProperty('colors');
            expect(typeof preset.colors).toBe('object');
        });
    });

    it('Chaque preset contient toutes les variables de THEME_VARS', () => {
        const varKeys = Theme.THEME_VARS.map(v => v.key);
        Object.entries(Theme.THEME_PRESETS).forEach(([name, preset]) => {
            varKeys.forEach(key => {
                expect(preset.colors).toHaveProperty(key);
            });
        });
    });

    it('Toutes les couleurs des presets sont des couleurs CSS valides (#hex)', () => {
        const hexRegex = /^#[0-9a-fA-F]{3,8}$/;
        Object.entries(Theme.THEME_PRESETS).forEach(([name, preset]) => {
            Object.entries(preset.colors).forEach(([key, color]) => {
                if (!hexRegex.test(color)) {
                    throw new Error(`Preset "${name}": la couleur "${key}" = "${color}" n'est pas un hex valide`);
                }
            });
        });
    });

    // ── Default Preset Colors ──
    it('Le preset default utilise les couleurs BeerDex classiques', () => {
        const defaults = Theme.THEME_PRESETS.default.colors;
        expect(defaults['--bg-dark']).toBe('#0a0a0a');
        expect(defaults['--accent-gold']).toBe('#FFC000');
    });

    // ── Fonts ──
    it('FONTS contient au moins "default" et "system"', () => {
        expect(Theme.FONTS).toHaveProperty('default');
        expect(Theme.FONTS).toHaveProperty('system');
    });

    it('Chaque FONT a un label et un css', () => {
        Object.entries(Theme.FONTS).forEach(([key, font]) => {
            expect(font).toHaveProperty('label');
            expect(font).toHaveProperty('css');
            expect(typeof font.css).toBe('string');
        });
    });
});
