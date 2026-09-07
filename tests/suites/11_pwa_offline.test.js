/**
 * 11_pwa_offline.test.js — PWA & Service Worker cache integrity tests.
 * 
 * Validates: manifest.webmanifest, SW-listed assets existence (HTTP 200).
 */
import { describe, it, expect } from '../core/test-framework.js';

let manifest = null;

try {
    const res = await fetch('../manifest.webmanifest');
    if (res.ok) manifest = await res.json();
} catch (e) {
    console.error('Failed to load manifest:', e);
}

describe('📶 PWA & Intégrité Offline', () => {

    // ── Manifest Validation ──
    it('manifest.webmanifest se charge correctement', () => {
        expect(manifest).not.toBeNull();
    });

    it('manifest contient un name', () => {
        expect(manifest).toHaveProperty('name');
        expect(manifest.name).toBe('Beerdex');
    });

    it('manifest contient un short_name', () => {
        expect(manifest).toHaveProperty('short_name');
    });

    it('manifest contient un start_url', () => {
        expect(manifest).toHaveProperty('start_url');
    });

    it('manifest display est "standalone"', () => {
        expect(manifest.display).toBe('standalone');
    });

    it('manifest contient au moins 2 icônes', () => {
        expect(manifest).toHaveProperty('icons');
        expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    });

    it('manifest icônes ont des tailles 192 et 512', () => {
        const sizes = manifest.icons.map(i => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
    });

    it('manifest theme_color est défini', () => {
        expect(manifest).toHaveProperty('theme_color');
        expect(manifest.theme_color).toMatch(/^#/);
    });

    it('manifest background_color est défini', () => {
        expect(manifest).toHaveProperty('background_color');
        expect(manifest.background_color).toMatch(/^#/);
    });

    // ── Critical Asset Existence (HTTP HEAD checks) ──
    const criticalAssets = [
        '../index.html',
        '../style.css',
        '../js/app.js',
        '../js/ui.js',
        '../js/storage.js',
        '../js/data.js',
        '../js/bac.js',
        '../js/i18n.js',
        '../js/achievements.js',
        '../js/utils.js',
        '../js/theme.js',
        '../data/belgiumbeer.json',
        '../data/locales/fr.json',
        '../data/locales/en.json',
        '../data/bac_rules.json',
        '../data/breweries.json',
        '../offline.html',
        '../icons/logo-bnr.png'
    ];

    criticalAssets.forEach(asset => {
        const name = asset.split('/').pop();
        it(`Asset critique "${name}" est accessible (HTTP 200)`, async () => {
            try {
                const res = await fetch(asset, { method: 'HEAD' });
                expect(res.ok).toBe(true);
            } catch (err) {
                throw new Error(`Impossible de charger "${asset}": ${err.message}`);
            }
        });
    });

    // ── index.html integrity ──
    it('index.html contient le script app.js', async () => {
        try {
            const res = await fetch('../index.html');
            const html = await res.text();
            expect(html).toContain('js/app.js');
        } catch (e) {
            throw new Error('Impossible de lire index.html');
        }
    });

    it('index.html contient le meta viewport', async () => {
        try {
            const res = await fetch('../index.html');
            const html = await res.text();
            expect(html).toContain('viewport');
        } catch (e) {
            throw new Error('Impossible de lire index.html');
        }
    });

    it('index.html contient le link manifest', async () => {
        try {
            const res = await fetch('../index.html');
            const html = await res.text();
            expect(html).toContain('manifest.webmanifest');
        } catch (e) {
            throw new Error('Impossible de lire index.html');
        }
    });

    // ── Data Files Accessible ──
    const dataFiles = [
        '../data/belgiumbeer.json',
        '../data/newbeer.json',
        '../data/frenchbeer.json',
        '../data/deutchbeer.json',
        '../data/nlbeer.json',
        '../data/cobeer.json',
        '../data/krbeer.json',
        '../data/jpbeer.json',
        '../data/cnbeer.json'
    ];

    it('Tous les fichiers de données bière sont accessibles', async () => {
        const results = await Promise.all(
            dataFiles.map(async (file) => {
                try {
                    const res = await fetch(file, { method: 'HEAD' });
                    return { file, ok: res.ok };
                } catch {
                    return { file, ok: false };
                }
            })
        );

        const failures = results.filter(r => !r.ok);
        if (failures.length > 0) {
            throw new Error(
                `${failures.length} fichiers de données inaccessibles:\n` +
                failures.map(f => `  - ${f.file}`).join('\n')
            );
        }
        expect(failures.length).toBe(0);
    });
});
