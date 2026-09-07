/**
 * 05_rarity.test.js — Auto-rarity engine & dynamic import bonus tests.
 * 
 * Covers: calculateRarity, getImportBonus, promoteRarity, getDynamicBeerRarity.
 */
import { describe, it, expect } from '../core/test-framework.js';

let Rarity;
try {
    Rarity = await import('../../js/autoRarity.js');
} catch (e) {
    console.error('Failed to import autoRarity:', e);
}

describe('✨ Moteur d\'Auto-Rareté & Import Dynamique', () => {

    // ── calculateRarity: Industrial breweries ──
    it('Brasserie industrielle (Jupiler) → score négatif → base', () => {
        const result = Rarity.calculateRarity({ title: 'Jupiler', brewery: 'Jupiler', type: 'pils', alcohol: '5.2%' });
        expect(result.rarity).toBe('base');
        expect(result.score).toBeLessThan(0);
    });

    it('Brasserie industrielle (Heineken) → base', () => {
        const result = Rarity.calculateRarity({ title: 'Heineken', brewery: 'Heineken', type: 'lager', alcohol: '5%' });
        expect(result.rarity).toBe('base');
    });

    // ── calculateRarity: Trappist ──
    it('Trappiste classique (Chimay) → commun/rare', () => {
        const result = Rarity.calculateRarity({ title: 'Chimay Bleue', brewery: 'Chimay', type: 'Trappiste', alcohol: '9%' });
        expect(result.score).toBeGreaterThan(3);
    });

    // ── calculateRarity: Hype/Prestige ──
    it('Brasserie prestige (Cantillon) → score élevé', () => {
        const result = Rarity.calculateRarity({ title: 'Cantillon Gueuze', brewery: 'Cantillon', type: 'gueuze', alcohol: '5%' });
        expect(result.score).toBeGreaterThanOrEqual(10);
    });

    // ── calculateRarity: Westvleteren ──
    it('Westvleteren 12 → très haute rareté', () => {
        const result = Rarity.calculateRarity({ title: 'Westvleteren 12', brewery: 'Westvleteren', type: 'Quadrupel', alcohol: '10.2%' });
        expect(result.score).toBeGreaterThanOrEqual(10);
    });

    // ── calculateRarity: Style bonuses ──
    it('Style Gueuze/Lambic → bonus de style', () => {
        const result = Rarity.calculateRarity({ title: 'Oude Gueuze', brewery: 'TestBrewery', type: 'gueuze', alcohol: '6%' });
        expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('Style Barrel Aged → bonus de style', () => {
        const result = Rarity.calculateRarity({ title: 'BA Imperial Stout', brewery: 'TestBrewery', type: 'barrel aged stout', alcohol: '11%' });
        expect(result.score).toBeGreaterThanOrEqual(8);
    });

    it('Style IPA standard → bonus modéré', () => {
        const result = Rarity.calculateRarity({ title: 'Test IPA', brewery: 'TestBrewery', type: 'ipa', alcohol: '6.5%' });
        expect(result.score).toBeGreaterThanOrEqual(2);
    });

    // ── calculateRarity: ABV bonuses ──
    it('Alcool > 14% → bonus extrême', () => {
        const result = Rarity.calculateRarity({ title: 'Extreme', brewery: 'TestBrewery', type: 'barleywine', alcohol: '15%' });
        expect(result.score).toBeGreaterThanOrEqual(6);
    });

    it('Alcool > 10% → bonus fort', () => {
        const result = Rarity.calculateRarity({ title: 'Strong', brewery: 'TestBrewery', type: 'stout', alcohol: '11%' });
        expect(result.score).toBeGreaterThanOrEqual(4);
    });

    // ── calculateRarity: Keywords ──
    it('Mot-clé "limited" → bonus', () => {
        const result = Rarity.calculateRarity({ title: 'Test Limited Edition', brewery: 'TestBrewery', type: 'ipa', alcohol: '7%' });
        const withoutKw = Rarity.calculateRarity({ title: 'Test Edition', brewery: 'TestBrewery', type: 'ipa', alcohol: '7%' });
        expect(result.score).toBeGreaterThan(withoutKw.score);
    });

    it('Mot-clé "vintage" → bonus +3', () => {
        const result = Rarity.calculateRarity({ title: 'Test Vintage 2020', brewery: 'TestBrewery', type: 'stout', alcohol: '8%' });
        const withoutKw = Rarity.calculateRarity({ title: 'Test 2020', brewery: 'TestBrewery', type: 'stout', alcohol: '8%' });
        expect(result.score - withoutKw.score).toBe(3);
    });

    it('Mot-clé "grand cru" → bonus', () => {
        const result = Rarity.calculateRarity({ title: 'Test Grand Cru', brewery: 'TestBrewery', type: 'tripel', alcohol: '9%' });
        const withoutKw = Rarity.calculateRarity({ title: 'Test', brewery: 'TestBrewery', type: 'tripel', alcohol: '9%' });
        expect(result.score).toBeGreaterThan(withoutKw.score);
    });

    // ── Rarity Tier Mapping ──
    it('Score < 0 → base', () => {
        expect(Rarity.calculateRarity({ title: 'Cheap', brewery: 'Heineken', type: 'lager', alcohol: '5%' }).rarity).toBe('base');
    });

    it('Score 4-6 → rare', () => {
        // Craft IPA ~6-7%: +2 (indep) +2 (IPA style) +1 (ABV 6.5+) = 5
        const result = Rarity.calculateRarity({ title: 'Craft IPA', brewery: 'SmallBrewery', type: 'ipa', alcohol: '7%' });
        expect(['rare', 'super_rare']).toContain(result.rarity);
    });

    // ── getImportBonus ──
    it('Même pays → bonus 0', () => {
        const result = Rarity.getImportBonus('BE', 'BE');
        expect(result.bonus).toBe(0);
        expect(result.reason).toBeNull();
    });

    it('Pays voisin EU (BE → FR) → bonus 1', () => {
        const result = Rarity.getImportBonus('FR', 'BE');
        expect(result.bonus).toBe(1);
    });

    it('Intercontinental (JP → BE) → bonus 3', () => {
        const result = Rarity.getImportBonus('JP', 'BE');
        expect(result.bonus).toBe(3);
        expect(result.reason).toBe('import_intercontinental');
    });

    it('Intercontinental (US → BE) → bonus 3', () => {
        const result = Rarity.getImportBonus('US', 'BE');
        expect(result.bonus).toBe(3);
    });

    it('Pays inconnu → bonus 1', () => {
        const result = Rarity.getImportBonus('ZZ', 'BE');
        expect(result.bonus).toBe(1);
    });

    it('Pays null → bonus 0', () => {
        const result = Rarity.getImportBonus(null, 'BE');
        expect(result.bonus).toBe(0);
    });

    // ── promoteRarity ──
    it('promoteRarity(commun, 2) → epique non, super_rare', () => {
        // commun(1) + 2 = super_rare(3)
        expect(Rarity.promoteRarity('commun', 2)).toBe('super_rare');
    });

    it('promoteRarity(legendaire, 5) → clampé à ultra_legendaire', () => {
        expect(Rarity.promoteRarity('legendaire', 5)).toBe('ultra_legendaire');
    });

    it('promoteRarity(commun, 0) → reste commun', () => {
        expect(Rarity.promoteRarity('commun', 0)).toBe('commun');
    });

    it('promoteRarity(base, 1) → commun', () => {
        expect(Rarity.promoteRarity('base', 1)).toBe('commun');
    });

    // ── getDynamicBeerRarity ──
    it('Bière locale (BE beer for BE user) → pas de promotion', () => {
        const result = Rarity.getDynamicBeerRarity({ rarity: 'commun', countryCode: 'BE' }, 'BE');
        expect(result.rarity).toBe('commun');
        expect(result.importBonus).toBe(0);
    });

    it('Bière japonaise pour utilisateur belge → rareté promue de 3 rangs', () => {
        const result = Rarity.getDynamicBeerRarity({ rarity: 'commun', countryCode: 'JP' }, 'BE');
        expect(result.importBonus).toBe(3);
        expect(result.rarity).toBe('epique'); // commun + 3 = epique
        expect(result.baseRarity).toBe('commun');
    });

    it('Bière française pour utilisateur belge → rareté promue de 1 rang', () => {
        const result = Rarity.getDynamicBeerRarity({ rarity: 'rare', countryCode: 'FR' }, 'BE');
        expect(result.importBonus).toBe(1);
        expect(result.rarity).toBe('super_rare');
    });
});
