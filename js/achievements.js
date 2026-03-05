import * as Storage from './storage.js';
import { showToast } from './ui.js';
import { Feedback } from './feedback.js';

// --- Achievement Definitions ---
// Types: 'count', 'volume', 'variety', 'special'
const ACHIEVEMENTS = [
    // --- COMPTEUR (Total Drunk) --- (15)
    ...[
        { id: 'c_1', title: 'Premier Pas', desc: 'Boire 1 bière', icon: '🍺', condition: (s) => s.totalCount >= 1, rarity: 'commun' },
        { id: 'c_5', title: 'L\'Apéro', desc: 'Boire 5 bières', icon: '🥂', condition: (s) => s.totalCount >= 5, rarity: 'commun' },
        { id: 'c_10', title: 'Amateur', desc: 'Boire 10 bières', icon: '🍻', condition: (s) => s.totalCount >= 10, rarity: 'commun' },
        { id: 'c_25', title: 'Entraînement', desc: 'Boire 25 bières', icon: '🏋️', condition: (s) => s.totalCount >= 25, rarity: 'rare' },
        { id: 'c_50', title: 'Habitué', desc: 'Boire 50 bières', icon: '🏅', condition: (s) => s.totalCount >= 50, rarity: 'rare' },
        { id: 'c_69', title: 'Nice', desc: 'Boire 69 bières', icon: '😉', condition: (s) => s.totalCount >= 69, hidden: true, rarity: 'epique' },
        { id: 'c_75', title: 'Trois Quarts', desc: 'Boire 75 bières', icon: '🥧', condition: (s) => s.totalCount >= 75, rarity: 'rare' },
        { id: 'c_100', title: 'Centurion', desc: 'Boire 100 bières', icon: '🛡️', condition: (s) => s.totalCount >= 100, rarity: 'super_rare' },
        { id: 'c_150', title: 'Barman', desc: 'Boire 150 bières', icon: '👔', condition: (s) => s.totalCount >= 150, rarity: 'super_rare' },
        { id: 'c_200', title: 'Double Centurion', desc: 'Boire 200 bières', icon: '👀', condition: (s) => s.totalCount >= 200, rarity: 'epique' },
        { id: 'c_300', title: 'Spartiate', desc: 'Boire 300 bières', icon: '⚔️', condition: (s) => s.totalCount >= 300, rarity: 'epique' },
        { id: 'c_420', title: 'Chill', desc: 'Boire 420 bières', icon: '🌿', condition: (s) => s.totalCount >= 420, hidden: true, rarity: 'mythique' },
        { id: 'c_500', title: 'Demi-Millénaire', desc: 'Boire 500 bières', icon: '🧙‍♂️', condition: (s) => s.totalCount >= 500, rarity: 'mythique' },
        { id: 'c_666', title: 'The Beast', desc: 'Boire 666 bières', icon: '💀', condition: (s) => s.totalCount >= 666, hidden: true, rarity: 'legendaire' },
        { id: 'c_1000', title: 'Dieu de la Bière', desc: 'Boire 1000 bières', icon: '👑', condition: (s) => s.totalCount >= 1000, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, category: 'Compteur 🔢' })),

    // --- VARIÉTÉ (Unique Beers) --- (10)
    ...[
        { id: 'v_5', title: 'Curieux', desc: 'Goûter 5 bières différentes', icon: '🔍', condition: (s) => s.uniqueCount >= 5, rarity: 'commun' },
        { id: 'v_10', title: 'Dégustateur', desc: 'Goûter 10 bières différentes', icon: '🍴', condition: (s) => s.uniqueCount >= 10, rarity: 'commun' },
        { id: 'v_20', title: 'Explorateur', desc: 'Goûter 20 bières différentes', icon: '🧭', condition: (s) => s.uniqueCount >= 20, rarity: 'rare' },
        { id: 'v_30', title: 'Aventurier', desc: 'Goûter 30 bières différentes', icon: '🤠', condition: (s) => s.uniqueCount >= 30, rarity: 'super_rare' },
        { id: 'v_40', title: 'Voyageur', desc: 'Goûter 40 bières différentes', icon: '🧳', condition: (s) => s.uniqueCount >= 40, rarity: 'super_rare' },
        { id: 'v_50', title: 'Sommelier', desc: 'Goûter 50 bières différentes', icon: '🍷', condition: (s) => s.uniqueCount >= 50, rarity: 'epique' },
        { id: 'v_75', title: 'Connaisseur', desc: 'Goûter 75 bières différentes', icon: '🧠', condition: (s) => s.uniqueCount >= 75, rarity: 'epique' },
        { id: 'v_100', title: 'Encyclopédie', desc: 'Goûter 100 bières différentes', icon: '📖', condition: (s) => s.uniqueCount >= 100, rarity: 'mythique' },
        { id: 'v_200', title: 'Zythologue', desc: 'Goûter 200 bières différentes', icon: '🧬', condition: (s) => s.uniqueCount >= 200, rarity: 'legendaire' },
        { id: 'v_all', title: 'Gotta Drink Em All', desc: 'Goûter 500 bières différentes', icon: '🌎', condition: (s) => s.uniqueCount >= 500, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, category: 'Variété 🌈' })),

    // --- VOLUME (Total Liters) --- (15)
    ...[
        { id: 'vol_1', title: 'Petite Soif', desc: 'Boire 1L', icon: '💧', condition: (s) => s.totalLiters >= 1, rarity: 'commun' },
        { id: 'vol_5', title: 'Jerrycan', desc: 'Boire 5L', icon: '🚰', condition: (s) => s.totalLiters >= 5, rarity: 'commun' },
        { id: 'vol_10', title: 'Seau', desc: 'Boire 10L', icon: '🪣', condition: (s) => s.totalLiters >= 10, rarity: 'rare' },
        { id: 'vol_20', title: 'Valise', desc: 'Boire 20L', icon: '💼', condition: (s) => s.totalLiters >= 20, rarity: 'rare' },
        { id: 'vol_42', title: 'La Réponse', desc: 'Boire 42L', icon: '♾️', condition: (s) => s.totalLiters >= 42, hidden: true, rarity: 'super_rare' },
        { id: 'vol_50', title: 'Tonneau', desc: 'Boire 50L', icon: '🛢️', condition: (s) => s.totalLiters >= 50, rarity: 'super_rare' },
        { id: 'vol_100', title: 'Barrique', desc: 'Boire 100L', icon: '🪵', condition: (s) => s.totalLiters >= 100, rarity: 'epique' },
        { id: 'vol_150', title: 'Baignoire', desc: 'Boire 150L (Une baignoire !)', icon: '🛁', condition: (s) => s.totalLiters >= 150, rarity: 'epique' },
        { id: 'vol_250', title: 'Aquarium', desc: 'Boire 250L', icon: '🐠', condition: (s) => s.totalLiters >= 250, rarity: 'mythique' },
        { id: 'vol_500', title: 'Jacuzzi', desc: 'Boire 500L', icon: '🧖', condition: (s) => s.totalLiters >= 500, rarity: 'mythique' },
        { id: 'vol_1000', title: 'Citerne', desc: 'Boire 1000L (1 m3)', icon: '🚛', condition: (s) => s.totalLiters >= 1000, rarity: 'legendaire' },
        { id: 'vol_2000', title: 'Piscine', desc: 'Boire 2000L', icon: '🏊', condition: (s) => s.totalLiters >= 2000, rarity: 'legendaire' },
        { id: 'vol_5000', title: 'Lac', desc: 'Boire 5000L', icon: '⛵', condition: (s) => s.totalLiters >= 5000, rarity: 'ultra_legendaire' },
        { id: 'vol_10000', title: 'Océan', desc: 'Boire 10000L', icon: '🌊', condition: (s) => s.totalLiters >= 10000, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, category: 'Volume 💧' })),

    // --- ALCOOL (ABV Constraints) --- (10)
    ...[
        { id: 'abv_light', title: 'Eau Aromatisée', desc: 'Boire une bière < 2%', icon: '🥤', condition: (s) => s.minDegree > 0 && s.minDegree < 2, rarity: 'rare' },
        { id: 'abv_std', title: 'Standard', desc: 'Boire une bière à 5%', icon: '🖖', condition: (s) => s.hasDegree(5), rarity: 'commun' },
        { id: 'abv_strong', title: 'Costaud', desc: 'Boire une bière > 8%', icon: '💪', condition: (s) => s.maxDegree >= 8, rarity: 'rare' },
        { id: 'abv_heavy', title: 'Assommoir', desc: 'Boire une bière > 10%', icon: '🔨', condition: (s) => s.maxDegree >= 10, rarity: 'super_rare' },
        { id: 'abv_rocket', title: 'Carburant', desc: 'Boire une bière > 12%', icon: '🚀', condition: (s) => s.maxDegree >= 12, rarity: 'epique' },
        { id: 'abv_14', title: 'Illégal ?', desc: 'Boire une bière > 14%', icon: '🚔', condition: (s) => s.maxDegree >= 14, rarity: 'mythique' },
        { id: 'abv_devil', title: 'Diabolique', desc: 'Boire une bière à 6.66%', icon: '🔥', condition: (s) => s.hasDegree(6.66) || s.hasDegree(6.6), rarity: 'mythique', hidden: true },
        { id: 'abv_zero', title: 'Sobriété', desc: 'Boire une bière sans alcool (0.0%)', icon: '🚫', condition: (s) => s.hasDegree(0), rarity: 'rare' },
        { id: 'abv_pi', title: 'Matheux', desc: 'Boire une bière à 3.14% (ou approchant)', icon: '🧮', condition: (s) => s.degrees.some(d => Math.abs(d - 3.14) < 0.05), hidden: true, rarity: 'legendaire' },
        { id: 'abv_high_count', title: 'Tête Dure', desc: 'Boire 10 bières fortes (>8%)', icon: '⛑️', condition: (s) => s.strongCount >= 10, rarity: 'epique' },
    ].map(a => ({ ...a, category: 'Puissance 🔋' })),

    // --- NOTATION (Ratings) --- (10)
    ...[
        { id: 'rate_1', title: 'Critique en Herbe', desc: 'Noter une bière', icon: '🖊️', condition: (s) => s.ratedCount >= 1, rarity: 'commun' },
        { id: 'rate_10', title: 'Avis Tranché', desc: 'Noter 10 bières', icon: '🪶', condition: (s) => s.ratedCount >= 10, rarity: 'rare' },
        { id: 'rate_50', title: 'Influenceur', desc: 'Noter 50 bières', icon: '📢', condition: (s) => s.ratedCount >= 50, rarity: 'super_rare' },
        { id: 'rate_100', title: 'Le Guide Michelin', desc: 'Noter 100 bières', icon: '⭐', condition: (s) => s.ratedCount >= 100, rarity: 'epique' },
        { id: 'rate_hater', title: 'Hater', desc: 'Donner une note de 0/20', icon: '👎', condition: (s) => s.hasZeroRating, hidden: true, rarity: 'mythique' },
        { id: 'rate_severe', title: 'Sévère', desc: 'Donner 5 notes sous la moyenne (<10)', icon: '😠', condition: (s) => s.lowRatingCount >= 5, rarity: 'rare' },
        { id: 'rate_lover', title: 'Fan Absolu', desc: 'Donner une note de 20/20', icon: '❤️', condition: (s) => s.hasPerfectRating, rarity: 'super_rare' },
        { id: 'rate_generous', title: 'Genéreux', desc: 'Donner 10 notes > 18/20', icon: '😘', condition: (s) => s.highRatingCount >= 10, rarity: 'super_rare' },
        { id: 'rate_average', title: 'Indécis', desc: 'Donner une note pile de 10/20', icon: '⚖️', condition: (s) => s.hasAverageRating, rarity: 'rare' },
        { id: 'rate_all', title: 'Complétiste', desc: 'Noter toutes ses bières bues (min 10)', icon: '✅', condition: (s) => s.totalCount > 10 && s.ratedCount >= s.uniqueCount, rarity: 'mythique' },
    ].map(a => ({ ...a, category: 'Critique 📝' })),

    // --- BRASSERIES & TYPES (Expanded Logic needed) --- (15)
    // Assuming simple string matching for now
    ...[
        { id: 'type_ipa', title: 'Hop Head', desc: 'Boire 5 IPA', icon: '🌿', condition: (s) => s.countByType('IPA') >= 5, rarity: 'rare' },
        { id: 'type_stout', title: 'Dark Side', desc: 'Boire 5 Stouts ou Porters', icon: '🌑', condition: (s) => s.countByType('Stout') >= 5 || s.countByType('Porter') >= 5, rarity: 'rare' },
        { id: 'type_files', title: 'Gueuze', desc: 'Boire 3 Lambics/Gueuzes', icon: '🍋', condition: (s) => s.countByType('Lambic') >= 3 || s.countByType('Gueuze') >= 3, rarity: 'super_rare' },
        { id: 'type_white', title: 'Blanche Neige', desc: 'Boire 5 Blanches', icon: '❄️', condition: (s) => s.countByType('Blanche') >= 5 || s.countByType('Witbier') >= 5, rarity: 'rare' },
        { id: 'type_abbey', title: 'Moine', desc: 'Boire 5 Bières d\'Abbaye', icon: '⛪', condition: (s) => s.countByType('Abbaye') >= 5 || s.countByType('Abbey') >= 5, rarity: 'rare' },
        { id: 'type_fruit', title: '5 Fruits et Légumes', desc: 'Boire 5 Fruitées', icon: '🍎', condition: (s) => s.countByType('Fruit') >= 5 || s.countByType('Fruité') >= 5, rarity: 'rare' },
        { id: 'brew_trappiste', title: 'Trappiste', desc: 'Boire 3 Trappistes différentes', icon: '✝️', condition: (s) => s.countByType('Trappiste') >= 3, rarity: 'rare' },
    ].map(a => ({ ...a, category: 'Styles 🍺' })),

    // --- TRAPPEURS ---
    ...[
        { id: 'trappist_belgian', title: 'Trappeur Belge', desc: 'Goûter les 6 Trappistes Belges', icon: '💣', condition: (s) => ['chimay', 'orval', 'rochefort', 'westmalle', 'westvleteren', 'achel'].every(b => s.hasBrewery(b)), category: 'Styles 🍺', rarity: 'epique' },
        { id: 'trappist_world', title: 'Trappeur du Monde', desc: 'Goûter 12 Trappistes (Belges + Monde)', icon: '🌍', condition: (s) => ['chimay', 'orval', 'rochefort', 'westmalle', 'westvleteren', 'achel', 'la trappe', 'zundert', 'engelszell', 'spencer', 'tre fontane', 'tynt meadow'].every(b => s.hasBrewery(b)), category: 'Styles 🍺', rarity: 'mythique' },
    ],

    // --- FUN / HIDDEN --- (25)
    ...[
        { id: 'fun_names', title: 'Alphabet', desc: 'Boire des bières commençant par 5 lettres différentes', icon: '🔤', condition: (s) => s.alphabetCount >= 5, rarity: 'commun' },
        { id: 'fun_z', title: 'Zorro', desc: 'Boire une bière commençant par Z', icon: '🎭', condition: (s) => s.hasLetter('Z'), hidden: true, rarity: 'rare' },
        { id: 'fun_q', title: 'Q', desc: 'Boire une bière commençant par Q', icon: '🦅', condition: (s) => s.hasLetter('Q'), hidden: true, rarity: 'rare' },
        { id: 'fun_x', title: 'X-Men', desc: 'Boire une bière commençant par X', icon: '❌', condition: (s) => s.hasLetter('X'), hidden: true, rarity: 'rare' },
        { id: 'fun_long', title: 'À rallonge', desc: 'Boire une bière avec un nom > 25 caractères', icon: '📜', condition: (s) => s.maxNameLength >= 25, rarity: 'super_rare' },
        { id: 'fun_short', title: 'Court', desc: 'Boire une bière avec un nom < 4 caractères', icon: '🤏', condition: (s) => s.minNameLength > 0 && s.minNameLength < 4, rarity: 'super_rare' },
        { id: 'fun_custom', title: 'Homebrewer', desc: 'Créer une bière custom', icon: '⚗️', condition: (s) => s.hasCustomBeer, rarity: 'super_rare' },
        { id: 'fun_custom_10', title: 'Micro-Brasserie', desc: 'Créer 10 bières custom', icon: '🏭', condition: (s) => s.customCount >= 10, rarity: 'epique' },
        { id: 'fun_photo', title: 'Photographe', desc: 'Avoir une photo pour une bière custom', icon: '📷', condition: (s) => s.hasCustomPhoto, rarity: 'super_rare' },
        { id: 'secret_1', title: 'Glitch', desc: 'Avoir une bière avec des données manquantes', icon: '🐛', condition: (s) => s.hasGlitch, hidden: true, rarity: 'mythique' },
    ].map(a => ({ ...a, category: 'Fun & Secrets 🤫' })),

    // --- RARETÉ (Rarity Hunter) --- (10)
    ...[
        { id: 'rare_hunter', title: 'Chasseur de Trésors', desc: 'Boire 1 bière Rare', icon: '💎', condition: (s) => s.countByRarity('rare') >= 1, rarity: 'rare' },
        { id: 'rare_elite', title: 'Elite', desc: 'Boire 5 bières Rares', icon: '💰', condition: (s) => s.countByRarity('rare') >= 5, rarity: 'super_rare' },
        { id: 'super_rare_1', title: 'Chanceux', desc: 'Boire 1 bière Super Rare', icon: '🍀', condition: (s) => s.countByRarity('super_rare') >= 1, rarity: 'super_rare' },
        { id: 'super_rare_5', title: 'Collectionneur', desc: 'Boire 5 bières Super Rares', icon: '📦', condition: (s) => s.countByRarity('super_rare') >= 5, rarity: 'epique' },
        { id: 'epique_1', title: 'Épique', desc: 'Boire 1 bière Épique', icon: '🐉', condition: (s) => s.countByRarity('epique') >= 1, rarity: 'epique' },
        { id: 'mythique_1', title: 'Mythique', desc: 'Boire 1 bière Mythique', icon: '🧙', condition: (s) => s.countByRarity('mythique') >= 1, rarity: 'mythique' },
        { id: 'legendaire_1', title: 'Légende', desc: 'Boire 1 bière Légendaire', icon: '🏆', condition: (s) => s.countByRarity('legendaire') >= 1, rarity: 'legendaire' },
        { id: 'ultra_1', title: 'L\'Élu', desc: 'Boire 1 bière Ultra Légendaire', icon: '☀️', condition: (s) => s.countByRarity('ultra_legendaire') >= 1, rarity: 'ultra_legendaire' },
        { id: 'rarity_master', title: 'Collectionneur d\'Élite', desc: 'Boire au moins 1 bière de chaque rareté (sauf Ultra)', icon: '👑', condition: (s) => s.countByRarity('rare') >= 1 && s.countByRarity('super_rare') >= 1 && s.countByRarity('epique') >= 1 && s.countByRarity('mythique') >= 1 && s.countByRarity('legendaire') >= 1, rarity: 'legendaire' },
    ].map(a => ({ ...a, category: 'Rareté 💎' })),

    // --- ALPHABET CHALLENGE (26) ---
    // A-Z
    ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((char, index) => ({
        id: `alpha_${char}`,
        title: `Lettre ${char}`,
        desc: `Boire une bière commençant par ${char}`,
        icon: char, // A, B, C... (Simple & Robust)
        condition: (s) => s.hasLetter(char),
        category: 'Challenge Alphabet 🔤',
        rarity: ['X', 'Y', 'Z', 'Q', 'W'].includes(char) ? 'super_rare' : 'rare'
    })),

    // Filler to reach count
    ...[
        { id: 'fill_1', title: 'La Petite', desc: 'Boire une bière de 25cl', icon: '👶', condition: (s) => s.hasVolume(250), rarity: 'commun' },
        { id: 'fill_2', title: 'La Standard', desc: 'Boire une bière de 33cl', icon: '✓', condition: (s) => s.hasVolume(330), rarity: 'commun' },
        { id: 'fill_3', title: 'La Pinte', desc: 'Boire une bière de 50cl', icon: '🍺', condition: (s) => s.hasVolume(500), rarity: 'commun' },
        { id: 'fill_4', title: 'La Grande', desc: 'Boire une bière de 75cl', icon: '🍾', condition: (s) => s.hasVolume(750), rarity: 'rare' },
    ].map(a => ({ ...a, category: 'Formats 🍾' })),
];

export function checkAchievements(allBeers) {
    const userData = Storage.getAllUserData();
    const previouslyUnlocked = getUnlockedAchievements();
    let currentUnlocked = [...previouslyUnlocked];

    // 1. Compute Stats State
    const stats = {
        totalCount: 0,
        uniqueCount: 0,
        totalLiters: 0,
        ratedCount: 0,
        maxDegree: 0,
        minDegree: 100,
        degrees: [],
        strongCount: 0, // >8%

        hasZeroRating: false,
        hasPerfectRating: false,
        hasAverageRating: false,
        lowRatingCount: 0, // < 10
        highRatingCount: 0, // > 18

        // Types/Breweries
        drunkTypes: [],
        countByType: (type) => stats.drunkTypes.filter(t => t.toLowerCase().includes(type.toLowerCase())).length,

        // Breweries
        drunkBreweries: new Set(),
        hasBrewery: (name) => Array.from(stats.drunkBreweries).some(b => b.includes(name.toLowerCase())),

        // Names
        maxNameLength: 0,
        minNameLength: 100,
        firstLetters: new Set(),
        hasLetter: (l) => stats.firstLetters.has(l.toUpperCase()),
        alphabetCount: 0,

        // Custom
        hasCustomBeer: false,
        customCount: 0,
        hasCustomPhoto: false,

        // Specifics
        hasDegree: (d) => stats.degrees.includes(d),
        hasVolume: (v) => false, // Will calculate
        volumes: new Set(),

        hasGlitch: false
    };

    const userIds = Object.keys(userData);
    // Correctly filter unique count for consumed beers only
    stats.uniqueCount = userIds.filter(id => (userData[id].count || 0) > 0).length;

    userIds.forEach(id => {
        const u = userData[id];
        const isConsumed = (u.count || 0) > 0;

        stats.totalCount += (u.count || 0);

        // Rating Stats (Independent of consumption count, but requires score)
        if (u.score !== undefined && u.score !== '') {
            stats.ratedCount++;
            const s = parseFloat(u.score);
            if (s === 0) stats.hasZeroRating = true;
            if (s === 20) stats.hasPerfectRating = true;
            if (s === 10) stats.hasAverageRating = true;
            if (s < 10) stats.lowRatingCount++;
            if (s > 18) stats.highRatingCount++;
        }

        // Custom Stats - Check if consumed? 
        // "Homebrewer" says "Créer". But here we scan user data. 
        // If favorited but not drunk, it shouldn't probably count as "consumed" custom beer?
        // Let's enforce consumption for consistency in "stats" object.
        if (isConsumed && id.startsWith('CUSTOM_')) {
            stats.hasCustomBeer = true;
            stats.customCount++;
            const cBeer = allBeers.find(b => b.id === id);
            if (cBeer && cBeer.image && !cBeer.image.includes('FUT.jpg')) stats.hasCustomPhoto = true;
        }

        // History interactions for volume
        if (u.history) {
            u.history.forEach(h => {
                const vol = h.volume || 0;
                stats.totalLiters += vol / 1000;
                stats.volumes.add(vol);
            });
        }

        // Beer Data Stats - REQUIRE CONSUMPTION
        if (isConsumed) {
            const beer = allBeers.find(b => b.id === id);
            if (beer) {
                // Alcohol
                if (beer.alcohol) {
                    const deg = parseFloat(beer.alcohol.replace(/[^0-9.]/g, ''));
                    if (!isNaN(deg)) {
                        stats.degrees.push(deg);
                        if (deg > stats.maxDegree) stats.maxDegree = deg;
                        if (deg < stats.minDegree) stats.minDegree = deg;
                        if (deg > 8) stats.strongCount++;
                    }
                } else {
                    stats.hasGlitch = true;
                }

                // Type
                if (beer.type) stats.drunkTypes.push(beer.type);
                // Brewery
                if (beer.brewery) stats.drunkBreweries.add(beer.brewery.toLowerCase());

                // Name
                if (beer.title) {
                    const len = beer.title.length;
                    if (len > stats.maxNameLength) stats.maxNameLength = len;
                    if (len < stats.minNameLength) stats.minNameLength = len;
                    stats.firstLetters.add(beer.title.charAt(0).toUpperCase());
                }
            }
        }
    });

    stats.alphabetCount = stats.firstLetters.size;
    stats.hasVolume = (v) => stats.volumes.has(v);

    // Rarity Stats
    stats.rarityCounts = {
        'base': 0, 'commun': 0, 'rare': 0, 'super_rare': 0,
        'epique': 0, 'mythique': 0, 'legendaire': 0, 'ultra_legendaire': 0
    };
    stats.countByRarity = (r) => stats.rarityCounts[r] || 0;

    // Populate Rarity Stats (Iterate drunk beers)
    userIds.forEach(id => {
        const u = userData[id];
        if ((u.count || 0) > 0) {
            const beer = allBeers.find(b => b.id === id);
            if (beer && beer.rarity) {
                // Normalize rarity string just in case
                const r = beer.rarity.toLowerCase();
                if (stats.rarityCounts[r] !== undefined) {
                    stats.rarityCounts[r]++;
                }
            }
        }
    });

    // 2. Check Conditions (Full Re-evaluation)
    let newUnlocks = [];
    let updatedUnlockList = [];

    ACHIEVEMENTS.forEach(ach => {
        let isMet = false;
        try {
            if (ach.condition(stats)) {
                isMet = true;
            }
        } catch (e) {
            console.warn("Achievement Check Failed", ach.id, e);
        }

        if (isMet) {
            updatedUnlockList.push(ach.id);
            // If it wasn't previously unlocked, it's a new unlock
            if (!previouslyUnlocked.includes(ach.id)) {
                newUnlocks.push(ach);
            }
        }
        // If not met, it simply isn't added to updatedUnlockList (effectively locked)
    });

    // 3. Save & Notify
    // Only save if status changed (array content difference)
    const hasChanged =
        updatedUnlockList.length !== previouslyUnlocked.length ||
        !updatedUnlockList.every(id => previouslyUnlocked.includes(id));

    if (hasChanged) {
        saveUnlockedAchievements(updatedUnlockList);

        // Notify for NEW unlocks only
        if (newUnlocks.length > 0) {
            newUnlocks.forEach(ach => {
                // Use new FX
                import('./fx.js').then(m => m.FX.achievementUnlock(ach.title, ach.icon, ach.rarity));
            });
            // Feedback handled inside FX
        }
    }

    return updatedUnlockList;
}

// Storage Helpers for Achievements
const STORAGE_KEY_ACHIEVEMENTS = 'beerdex_achievements';

export function getUnlockedAchievements() {
    const data = localStorage.getItem(STORAGE_KEY_ACHIEVEMENTS);
    return data ? JSON.parse(data) : [];
}

function saveUnlockedAchievements(list) {
    localStorage.setItem(STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(list));
}

export function getAllAchievements() {
    return ACHIEVEMENTS;
}
