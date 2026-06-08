/**
 * theme.js — Theme Engine for Beerdex.
 * 
 * Manages custom CSS variable overrides, presets, and import/export.
 * All theme data is stored in localStorage under 'beerdex_pref_theme_custom'.
 */

import * as Storage from './storage.js';

// ============================== //
// Customizable CSS Variables     //
// ============================== //

/**
 * The list of CSS variables that users can customize.
 * Each has a key (matching the CSS var name), a label, and a group.
 */
export const THEME_VARS = [
    // Background
    { key: '--bg-dark', label: 'theme_var_bg_dark', group: 'background', default: '#0a0a0a' },
    { key: '--bg-card', label: 'theme_var_bg_card', group: 'background', default: '#141414' },
    { key: '--bg-card-hover', label: 'theme_var_bg_card_hover', group: 'background', default: '#1f1f1f' },

    // Text
    { key: '--text-primary', label: 'theme_var_text_primary', group: 'text', default: '#ffffff' },
    { key: '--text-secondary', label: 'theme_var_text_secondary', group: 'text', default: '#a0a0a0' },

    // Accent
    { key: '--accent-gold', label: 'theme_var_accent_gold', group: 'accent', default: '#FFC000' },
    { key: '--accent-amber', label: 'theme_var_accent_amber', group: 'accent', default: '#FF9900' },
    { key: '--accent-foam', label: 'theme_var_accent_foam', group: 'accent', default: '#F0F0F0' },

    // Borders & misc
    { key: '--border-color', label: 'theme_var_border', group: 'misc', default: '#2d2d2d' },
    { key: '--success', label: 'theme_var_success', group: 'misc', default: '#2ecc71' },
    { key: '--danger', label: 'theme_var_danger', group: 'misc', default: '#e74c3c' },
];

// ============================== //
// Fonts                          //
// ============================== //

export const FONTS = {
    'default': { label: 'Outfit (Défaut)', css: '"Outfit", sans-serif', url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap' },
    'system': { label: 'Police Système', css: 'system-ui, -apple-system, sans-serif' },
    'inter': { label: 'Inter', css: '"Inter", sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap' },
    'roboto': { label: 'Roboto', css: '"Roboto", sans-serif', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap' }
};

// ============================== //
// Presets                        //
// ============================== //

export const THEME_PRESETS = {
    default: {
        name: 'Dark Gold',
        emoji: '🍺',
        colors: {
            '--bg-dark': '#0a0a0a',
            '--bg-card': '#141414',
            '--bg-card-hover': '#1f1f1f',
            '--text-primary': '#ffffff',
            '--text-secondary': '#a0a0a0',
            '--accent-gold': '#FFC000',
            '--accent-amber': '#FF9900',
            '--accent-foam': '#F0F0F0',
            '--border-color': '#2d2d2d',
            '--success': '#2ecc71',
            '--danger': '#e74c3c',
        }
    },
    cyberpunk: {
        name: 'Cyberpunk Neon',
        emoji: '🌃',
        colors: {
            '--bg-dark': '#0a0014',
            '--bg-card': '#140028',
            '--bg-card-hover': '#1e003c',
            '--text-primary': '#e0d0ff',
            '--text-secondary': '#8070a0',
            '--accent-gold': '#ff00ff',
            '--accent-amber': '#aa00ff',
            '--accent-foam': '#00ffff',
            '--border-color': '#3d1a5c',
            '--success': '#00ff88',
            '--danger': '#ff0044',
        }
    },
    forest: {
        name: 'Forest',
        emoji: '🌲',
        colors: {
            '--bg-dark': '#0a110a',
            '--bg-card': '#111c11',
            '--bg-card-hover': '#1a2e1a',
            '--text-primary': '#d4e8d4',
            '--text-secondary': '#7fa07f',
            '--accent-gold': '#8bc34a',
            '--accent-amber': '#4caf50',
            '--accent-foam': '#c8e6c9',
            '--border-color': '#2d3d2d',
            '--success': '#66bb6a',
            '--danger': '#ef5350',
        }
    },
    blood: {
        name: 'Blood Red',
        emoji: '🩸',
        colors: {
            '--bg-dark': '#0a0000',
            '--bg-card': '#1a0505',
            '--bg-card-hover': '#2a0a0a',
            '--text-primary': '#ffcccc',
            '--text-secondary': '#a07070',
            '--accent-gold': '#ff3333',
            '--accent-amber': '#cc0000',
            '--accent-foam': '#ffaaaa',
            '--border-color': '#3d1a1a',
            '--success': '#4caf50',
            '--danger': '#ff0000',
        }
    },
    ocean: {
        name: 'Deep Ocean',
        emoji: '🌊',
        colors: {
            '--bg-dark': '#020b14',
            '--bg-card': '#081828',
            '--bg-card-hover': '#0e2440',
            '--text-primary': '#cce5ff',
            '--text-secondary': '#6699cc',
            '--accent-gold': '#00bcd4',
            '--accent-amber': '#0097a7',
            '--accent-foam': '#b2ebf2',
            '--border-color': '#1a3a5c',
            '--success': '#26a69a',
            '--danger': '#ef5350',
        }
    },
    sunset: {
        name: 'Sunset',
        emoji: '🌅',
        colors: {
            '--bg-dark': '#120808',
            '--bg-card': '#1e0e0a',
            '--bg-card-hover': '#2d1810',
            '--text-primary': '#ffe0cc',
            '--text-secondary': '#b08060',
            '--accent-gold': '#ff6b35',
            '--accent-amber': '#e64a19',
            '--accent-foam': '#ffccbc',
            '--border-color': '#3d2219',
            '--success': '#66bb6a',
            '--danger': '#d32f2f',
        }
    }
};

// ============================== //
// Core Functions                 //
// ============================== //

/**
 * Get the currently saved custom theme colors.
 * Returns null if using a preset (no custom overrides).
 */
export function getCustomTheme() {
    return Storage.getPreference('theme_custom', null);
}

/**
 * Get the active preset name.
 */
export function getActivePreset() {
    return Storage.getPreference('theme_preset', 'default');
}

/**
 * Apply a theme preset by name.
 */
export function applyPreset(presetName) {
    const preset = THEME_PRESETS[presetName];
    if (!preset) {
        console.warn(`[Theme] Unknown preset: ${presetName}`);
        return;
    }

    // Do not clear custom overrides when switching to a preset, so the user can go back to "Custom"
    Storage.savePreference('theme_preset', presetName);
    applyColors(preset.colors);
}

/**
 * Apply custom color overrides.
 * @param {Object} colors — { '--bg-dark': '#123456', ... }
 */
export function applyColors(colors) {
    const root = document.documentElement;
    Object.entries(colors).forEach(([varName, value]) => {
        if (value) {
            root.style.setProperty(varName, value);
        }
    });

    // Update meta theme-color for the mobile status bar
    const accentGold = colors['--accent-gold'];
    if (accentGold) {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accentGold);
    }
}

/**
 * Save a single color override.
 */
export function setCustomColor(varName, value) {
    let custom = getCustomTheme() || {};
    custom[varName] = value;
    Storage.savePreference('theme_custom', custom);
    Storage.savePreference('theme_preset', 'custom');
    document.documentElement.style.setProperty(varName, value);
}

/**
 * Get the currently active colors (preset + custom overrides merged).
 */
export function getActiveColors() {
    const presetName = getActivePreset();
    const preset = THEME_PRESETS[presetName] || THEME_PRESETS.default;
    const custom = getCustomTheme();

    if (custom && presetName === 'custom') {
        // Merge: start from default, overlay custom
        return { ...THEME_PRESETS.default.colors, ...custom };
    }

    return { ...preset.colors };
}

/**
 * Reset to default theme.
 */
export function resetTheme() {
    Storage.savePreference('theme_custom', null);
    Storage.savePreference('theme_preset', 'default');
    Storage.savePreference('theme_font', 'default');
    applyColors(THEME_PRESETS.default.colors);
    applyFont('default');
}

// ============================== //
// Font Functions                 //
// ============================== //

export function getActiveFont() {
    return Storage.getPreference('theme_font', 'default');
}

export function applyFont(fontKey) {
    const font = FONTS[fontKey] || FONTS['default'];
    Storage.savePreference('theme_font', fontKey);

    // Inject Google Fonts link if URL exists and not already injected
    if (font.url) {
        let linkId = `font-${fontKey}`;
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = font.url;
            document.head.appendChild(link);
        }
    }

    // Apply CSS variable
    if (font.css) {
        document.documentElement.style.setProperty('--font-family-primary', font.css);
    } else {
        document.documentElement.style.removeProperty('--font-family-primary');
    }
}

// ============================== //
// Import / Export                //
// ============================== //

/**
 * Export the current theme as a shareable Base64 code.
 * Format: THEME_<base64 JSON>
 */
export function exportTheme() {
    const data = {
        preset: getActivePreset(),
        colors: getActiveColors(),
        exportDate: new Date().toISOString()
    };

    const json = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return `THEME_${b64}`;
}

/**
 * Import a theme from a Base64 code string.
 * @param {string} code — e.g. "THEME_eyJwcmVzZXQ..."
 * @returns {{ success: boolean, message: string }}
 */
export function importTheme(code) {
    try {
        if (!code || !code.startsWith('THEME_')) {
            return { success: false, message: 'Code invalide. Le code doit commencer par THEME_' };
        }

        const b64 = code.replace('THEME_', '');
        const json = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(json);

        if (!data.colors || typeof data.colors !== 'object') {
            return { success: false, message: 'Format de thème invalide.' };
        }

        // Save as custom
        Storage.savePreference('theme_custom', data.colors);
        Storage.savePreference('theme_preset', 'custom');
        applyColors(data.colors);

        return { success: true, message: 'Thème importé avec succès !' };
    } catch (e) {
        console.error('[Theme] Import error:', e);
        return { success: false, message: `Erreur d'import: ${e.message}` };
    }
}

// ============================== //
// Init — Apply saved theme       //
// ============================== //

export function init() {
    const presetName = getActivePreset();
    const custom = getCustomTheme();

    if (custom && presetName === 'custom') {
        // Apply custom overrides on top of default
        applyColors({ ...THEME_PRESETS.default.colors, ...custom });
    } else {
        const preset = THEME_PRESETS[presetName];
        if (preset) {
            applyColors(preset.colors);
        }
    }

    // Apply Font
    applyFont(getActiveFont());
}
