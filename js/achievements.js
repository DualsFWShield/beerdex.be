import { i18n } from './i18n.js';
import * as Storage from './storage.js';

// --- Achievement Definitions ---
// Types: 'count', 'volume', 'variety', 'special'
const ACHIEVEMENTS = [
    // --- COMPTEUR (Total Drunk) --- (15)
    ...[
        { id: 'c_1', titleKey: 'ach_c_1_title', descKey: 'ach_c_1_desc', icon: '🍺', condition: (s) => s.totalCount >= 1, rarity: 'commun' },
        { id: 'c_5', titleKey: 'ach_c_5_title', descKey: 'ach_c_5_desc', icon: '🥂', condition: (s) => s.totalCount >= 5, rarity: 'commun' },
        { id: 'c_10', titleKey: 'ach_c_10_title', descKey: 'ach_c_10_desc', icon: '🍻', condition: (s) => s.totalCount >= 10, rarity: 'commun' },
        { id: 'c_25', titleKey: 'ach_c_25_title', descKey: 'ach_c_25_desc', icon: '🏋️', condition: (s) => s.totalCount >= 25, rarity: 'rare' },
        { id: 'c_50', titleKey: 'ach_c_50_title', descKey: 'ach_c_50_desc', icon: '🏅', condition: (s) => s.totalCount >= 50, rarity: 'rare' },
        { id: 'c_69', titleKey: 'ach_c_69_title', descKey: 'ach_c_69_desc', icon: '😉', condition: (s) => s.totalCount >= 69, hidden: true, rarity: 'epique' },
        { id: 'c_75', titleKey: 'ach_c_75_title', descKey: 'ach_c_75_desc', icon: '🥧', condition: (s) => s.totalCount >= 75, rarity: 'rare' },
        { id: 'c_100', titleKey: 'ach_c_100_title', descKey: 'ach_c_100_desc', icon: '🛡️', condition: (s) => s.totalCount >= 100, rarity: 'super_rare' },
        { id: 'c_150', titleKey: 'ach_c_150_title', descKey: 'ach_c_150_desc', icon: '👔', condition: (s) => s.totalCount >= 150, rarity: 'super_rare' },
        { id: 'c_200', titleKey: 'ach_c_200_title', descKey: 'ach_c_200_desc', icon: '👀', condition: (s) => s.totalCount >= 200, rarity: 'epique' },
        { id: 'c_300', titleKey: 'ach_c_300_title', descKey: 'ach_c_300_desc', icon: '⚔️', condition: (s) => s.totalCount >= 300, rarity: 'epique' },
        { id: 'c_420', titleKey: 'ach_c_420_title', descKey: 'ach_c_420_desc', icon: '🌿', condition: (s) => s.totalCount >= 420, hidden: true, rarity: 'mythique' },
        { id: 'c_500', titleKey: 'ach_c_500_title', descKey: 'ach_c_500_desc', icon: '🧙‍♂️', condition: (s) => s.totalCount >= 500, rarity: 'mythique' },
        { id: 'c_666', titleKey: 'ach_c_666_title', descKey: 'ach_c_666_desc', icon: '💀', condition: (s) => s.totalCount >= 666, hidden: true, rarity: 'legendaire' },
        { id: 'c_1000', titleKey: 'ach_c_1000_title', descKey: 'ach_c_1000_desc', icon: '👑', condition: (s) => s.totalCount >= 1000, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_counter' })),

    // --- VARIÉTÉ (Unique Beers) --- (10)
    ...[
        { id: 'v_5', titleKey: 'ach_v_5_title', descKey: 'ach_v_5_desc', icon: '🔍', condition: (s) => s.uniqueCount >= 5, rarity: 'commun' },
        { id: 'v_10', titleKey: 'ach_v_10_title', descKey: 'ach_v_10_desc', icon: '🍴', condition: (s) => s.uniqueCount >= 10, rarity: 'commun' },
        { id: 'v_20', titleKey: 'ach_v_20_title', descKey: 'ach_v_20_desc', icon: '🧭', condition: (s) => s.uniqueCount >= 20, rarity: 'rare' },
        { id: 'v_30', titleKey: 'ach_v_30_title', descKey: 'ach_v_30_desc', icon: '🤠', condition: (s) => s.uniqueCount >= 30, rarity: 'super_rare' },
        { id: 'v_40', titleKey: 'ach_v_40_title', descKey: 'ach_v_40_desc', icon: '🧳', condition: (s) => s.uniqueCount >= 40, rarity: 'super_rare' },
        { id: 'v_50', titleKey: 'ach_v_50_title', descKey: 'ach_v_50_desc', icon: '🍷', condition: (s) => s.uniqueCount >= 50, rarity: 'epique' },
        { id: 'v_75', titleKey: 'ach_v_75_title', descKey: 'ach_v_75_desc', icon: '🧠', condition: (s) => s.uniqueCount >= 75, rarity: 'epique' },
        { id: 'v_100', titleKey: 'ach_v_100_title', descKey: 'ach_v_100_desc', icon: '📖', condition: (s) => s.uniqueCount >= 100, rarity: 'mythique' },
        { id: 'v_200', titleKey: 'ach_v_200_title', descKey: 'ach_v_200_desc', icon: '🧬', condition: (s) => s.uniqueCount >= 200, rarity: 'legendaire' },
        { id: 'v_all', titleKey: 'ach_v_all_title', descKey: 'ach_v_all_desc', icon: '🌎', condition: (s) => s.uniqueCount >= 500, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_variety' })),

    // --- VOLUME (Total Liters) --- (15)
    ...[
        { id: 'vol_1', titleKey: 'ach_vol_1_title', descKey: 'ach_vol_1_desc', icon: '💧', condition: (s) => s.totalLiters >= 1, rarity: 'commun' },
        { id: 'vol_5', titleKey: 'ach_vol_5_title', descKey: 'ach_vol_5_desc', icon: '🚰', condition: (s) => s.totalLiters >= 5, rarity: 'commun' },
        { id: 'vol_10', titleKey: 'ach_vol_10_title', descKey: 'ach_vol_10_desc', icon: '🪣', condition: (s) => s.totalLiters >= 10, rarity: 'rare' },
        { id: 'vol_20', titleKey: 'ach_vol_20_title', descKey: 'ach_vol_20_desc', icon: '💼', condition: (s) => s.totalLiters >= 20, rarity: 'rare' },
        { id: 'vol_42', titleKey: 'ach_vol_42_title', descKey: 'ach_vol_42_desc', icon: '♾️', condition: (s) => s.totalLiters >= 42, hidden: true, rarity: 'super_rare' },
        { id: 'vol_50', titleKey: 'ach_vol_50_title', descKey: 'ach_vol_50_desc', icon: '🛢️', condition: (s) => s.totalLiters >= 50, rarity: 'super_rare' },
        { id: 'vol_100', titleKey: 'ach_vol_100_title', descKey: 'ach_vol_100_desc', icon: '🪵', condition: (s) => s.totalLiters >= 100, rarity: 'epique' },
        { id: 'vol_150', titleKey: 'ach_vol_150_title', descKey: 'ach_vol_150_desc', icon: '🛁', condition: (s) => s.totalLiters >= 150, rarity: 'epique' },
        { id: 'vol_250', titleKey: 'ach_vol_250_title', descKey: 'ach_vol_250_desc', icon: '🐠', condition: (s) => s.totalLiters >= 250, rarity: 'mythique' },
        { id: 'vol_500', titleKey: 'ach_vol_500_title', descKey: 'ach_vol_500_desc', icon: '🧖', condition: (s) => s.totalLiters >= 500, rarity: 'mythique' },
        { id: 'vol_1000', titleKey: 'ach_vol_1000_title', descKey: 'ach_vol_1000_desc', icon: '🚛', condition: (s) => s.totalLiters >= 1000, rarity: 'legendaire' },
        { id: 'vol_2000', titleKey: 'ach_vol_2000_title', descKey: 'ach_vol_2000_desc', icon: '🏊', condition: (s) => s.totalLiters >= 2000, rarity: 'legendaire' },
        { id: 'vol_5000', titleKey: 'ach_vol_5000_title', descKey: 'ach_vol_5000_desc', icon: '⛵', condition: (s) => s.totalLiters >= 5000, rarity: 'ultra_legendaire' },
        { id: 'vol_10000', titleKey: 'ach_vol_10000_title', descKey: 'ach_vol_10000_desc', icon: '🌊', condition: (s) => s.totalLiters >= 10000, rarity: 'ultra_legendaire' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_volume' })),

    // --- ALCOOL (ABV Constraints) --- (10)
    ...[
        { id: 'abv_light', titleKey: 'ach_abv_light_title', descKey: 'ach_abv_light_desc', icon: '🥤', condition: (s) => s.degrees.some(d => d > 0 && d < 2) || s.hasLowAlcoholString, rarity: 'rare' },
        { id: 'abv_std', titleKey: 'ach_abv_std_title', descKey: 'ach_abv_std_desc', icon: '🖖', condition: (s) => s.hasDegree(5), rarity: 'commun' },
        { id: 'abv_strong', titleKey: 'ach_abv_strong_title', descKey: 'ach_abv_strong_desc', icon: '💪', condition: (s) => s.maxDegree >= 8, rarity: 'rare' },
        { id: 'abv_heavy', titleKey: 'ach_abv_heavy_title', descKey: 'ach_abv_heavy_desc', icon: '🔨', condition: (s) => s.maxDegree >= 10, rarity: 'super_rare' },
        { id: 'abv_rocket', titleKey: 'ach_abv_rocket_title', descKey: 'ach_abv_rocket_desc', icon: '🚀', condition: (s) => s.maxDegree >= 12, rarity: 'epique' },
        { id: 'abv_14', titleKey: 'ach_abv_14_title', descKey: 'ach_abv_14_desc', icon: '🚔', condition: (s) => s.maxDegree >= 14, rarity: 'mythique' },
        { id: 'abv_devil', titleKey: 'ach_abv_devil_title', descKey: 'ach_abv_devil_desc', icon: '🔥', condition: (s) => s.hasDegree(6.66) || s.hasDegree(6.6), rarity: 'mythique', hidden: true },
        { id: 'abv_zero', titleKey: 'ach_abv_zero_title', descKey: 'ach_abv_zero_desc', icon: '🚫', condition: (s) => s.hasDegree(0), rarity: 'rare' },
        { id: 'abv_ pi', titleKey: 'ach_abv_pi_title', descKey: 'ach_abv_pi_desc', icon: '🧮', condition: (s) => s.degrees.some(d => Math.abs(d - 3.14) < 0.05), hidden: true, rarity: 'legendaire' },
        { id: 'abv_high_count', titleKey: 'ach_abv_high_count_title', descKey: 'ach_abv_high_count_desc', icon: '⛑️', condition: (s) => s.strongCount >= 10, rarity: 'epique' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_power' })),

    // --- NOTATION (Ratings) --- (10)
    ...[
        { id: 'rate_1', titleKey: 'ach_rate_1_title', descKey: 'ach_rate_1_desc', icon: '🖊️', condition: (s) => s.ratedCount >= 1, rarity: 'commun' },
        { id: 'rate_10', titleKey: 'ach_rate_10_title', descKey: 'ach_rate_10_desc', icon: '🪶', condition: (s) => s.ratedCount >= 10, rarity: 'rare' },
        { id: 'rate_50', titleKey: 'ach_rate_50_title', descKey: 'ach_rate_50_desc', icon: '📢', condition: (s) => s.ratedCount >= 50, rarity: 'super_rare' },
        { id: 'rate_100', titleKey: 'ach_rate_100_title', descKey: 'ach_rate_100_desc', icon: '⭐', condition: (s) => s.ratedCount >= 100, rarity: 'epique' },
        { id: 'rate_hater', titleKey: 'ach_rate_hater_title', descKey: 'ach_rate_hater_desc', icon: '👎', condition: (s) => s.hasZeroRating, hidden: true, rarity: 'mythique' },
        { id: 'rate_severe', titleKey: 'ach_rate_severe_title', descKey: 'ach_rate_severe_desc', icon: '😠', condition: (s) => s.lowRatingCount >= 5, rarity: 'rare' },
        { id: 'rate_lover', titleKey: 'ach_rate_lover_title', descKey: 'ach_rate_lover_desc', icon: '❤️', condition: (s) => s.hasPerfectRating, rarity: 'super_rare' },
        { id: 'rate_generous', titleKey: 'ach_rate_generous_title', descKey: 'ach_rate_generous_desc', icon: '😘', condition: (s) => s.highRatingCount >= 10, rarity: 'super_rare' },
        { id: 'rate_average', titleKey: 'ach_rate_average_title', descKey: 'ach_rate_average_desc', icon: '⚖️', condition: (s) => s.hasAverageRating, rarity: 'rare' },
        { id: 'rate_all', titleKey: 'ach_rate_all_title', descKey: 'ach_rate_all_desc', icon: '✅', condition: (s) => s.totalCount > 10 && s.ratedCount >= s.uniqueCount, rarity: 'mythique' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_critic' })),

    // --- BRASSERIES & TYPES (Expanded Logic needed) --- (15)
    ...[
        { id: 'type_ipa', titleKey: 'ach_type_ipa_title', descKey: 'ach_type_ipa_desc', icon: '🌿', condition: (s) => s.countByType('IPA') >= 5, rarity: 'rare' },
        { id: 'type_stout', titleKey: 'ach_type_stout_title', descKey: 'ach_type_stout_desc', icon: '🌑', condition: (s) => s.countByType('Stout') >= 5 || s.countByType('Porter') >= 5, rarity: 'rare' },
        { id: 'type_files', titleKey: 'ach_type_files_title', descKey: 'ach_type_files_desc', icon: '🍋', condition: (s) => s.countByType('Lambic') >= 3 || s.countByType('Gueuze') >= 3, rarity: 'super_rare' },
        { id: 'type_white', titleKey: 'ach_type_white_title', descKey: 'ach_type_white_desc', icon: '❄️', condition: (s) => s.countByType('Blanche') >= 5 || s.countByType('Witbier') >= 5, rarity: 'rare' },
        { id: 'type_abbey', titleKey: 'ach_type_abbey_title', descKey: 'ach_type_abbey_desc', icon: '⛪', condition: (s) => s.countByType('Abbaye') >= 5 || s.countByType('Abbey') >= 5, rarity: 'rare' },
        { id: 'type_fruit', titleKey: 'ach_type_fruit_title', descKey: 'ach_type_fruit_desc', icon: '🍎', condition: (s) => s.fruitCount >= 5, rarity: 'rare' },
        { id: 'brew_trappiste', titleKey: 'ach_brew_trappiste_title', descKey: 'ach_brew_trappiste_desc', icon: '✝️', condition: (s) => s.countByType('Trappiste') >= 3, rarity: 'rare' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_styles' })),

    // --- TRAPPEURS ---
    ...[
        { id: 'trappist_belgian', titleKey: 'ach_trappist_belgian_title', descKey: 'ach_trappist_belgian_desc', icon: '💣', condition: (s) => ['chimay', 'orval', 'rochefort', 'westmalle', 'westvleteren', 'achel'].every(b => s.hasBrewery(b)), categoryKey: 'ach_cat_styles', rarity: 'epique' },
        { id: 'trappist_world', titleKey: 'ach_trappist_world_title', descKey: 'ach_trappist_world_desc', icon: '🌍', condition: (s) => ['chimay', 'orval', 'rochefort', 'westmalle', 'westvleteren', 'achel', 'la trappe', 'zundert', 'engelszell', 'spencer', 'tre fontane', 'tynt meadow'].every(b => s.hasBrewery(b)), categoryKey: 'ach_cat_styles', rarity: 'mythique' },
    ],

    // --- FUN / HIDDEN --- (25)
    ...[
        { id: 'fun_names', titleKey: 'ach_fun_names_title', descKey: 'ach_fun_names_desc', icon: '🔤', condition: (s) => s.alphabetCount >= 5, rarity: 'commun' },
        { id: 'fun_z', titleKey: 'ach_fun_z_title', descKey: 'ach_fun_z_desc', icon: '🎭', condition: (s) => s.hasLetter('Z'), hidden: true, rarity: 'rare' },
        { id: 'fun_q', titleKey: 'ach_fun_q_title', descKey: 'ach_fun_q_desc', icon: '🦅', condition: (s) => s.hasLetter('Q'), hidden: true, rarity: 'rare' },
        { id: 'fun_x', titleKey: 'ach_fun_x_title', descKey: 'ach_fun_x_desc', icon: '❌', condition: (s) => s.hasLetter('X'), hidden: true, rarity: 'rare' },
        { id: 'fun_long', titleKey: 'ach_fun_long_title', descKey: 'ach_fun_long_desc', icon: '📜', condition: (s) => s.maxNameLength >= 25, rarity: 'super_rare' },
        { id: 'fun_short', titleKey: 'ach_fun_short_title', descKey: 'ach_fun_short_desc', icon: '🤏', condition: (s) => s.minNameLength > 0 && s.minNameLength < 4, rarity: 'super_rare' },
        { id: 'fun_custom', titleKey: 'ach_fun_custom_title', descKey: 'ach_fun_custom_desc', icon: '⚗️', condition: (s) => s.hasCustomBeer, rarity: 'super_rare' },
        { id: 'fun_custom_10', titleKey: 'ach_fun_custom_10_title', descKey: 'ach_fun_custom_10_desc', icon: '🏭', condition: (s) => s.customCount >= 10, rarity: 'epique' },
        { id: 'fun_photo', titleKey: 'ach_fun_photo_title', descKey: 'ach_fun_photo_desc', icon: '📷', condition: (s) => s.hasCustomPhoto, rarity: 'super_rare' },
        { id: 'secret_1', titleKey: 'ach_secret_1_title', descKey: 'ach_secret_1_desc', icon: '🐛', condition: (s) => s.hasGlitch, hidden: true, rarity: 'mythique' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_fun' })),

    // --- RARETÉ (Rarity Hunter) --- (10)
    ...[
        { id: 'rare_hunter', titleKey: 'ach_rare_hunter_title', descKey: 'ach_rare_hunter_desc', icon: '💎', condition: (s) => s.countByRarity('rare') >= 1, rarity: 'rare' },
        { id: 'rare_elite', titleKey: 'ach_rare_elite_title', descKey: 'ach_rare_elite_desc', icon: '💰', condition: (s) => s.countByRarity('rare') >= 5, rarity: 'super_rare' },
        { id: 'super_rare_1', titleKey: 'ach_super_rare_1_title', descKey: 'ach_super_rare_1_desc', icon: '🍀', condition: (s) => s.countByRarity('super_rare') >= 1, rarity: 'super_rare' },
        { id: 'super_rare_5', titleKey: 'ach_super_rare_5_title', descKey: 'ach_super_rare_5_desc', icon: '📦', condition: (s) => s.countByRarity('super_rare') >= 5, rarity: 'epique' },
        { id: 'epique_1', titleKey: 'ach_epique_1_title', descKey: 'ach_epique_1_desc', icon: '🐉', condition: (s) => s.countByRarity('epique') >= 1, rarity: 'epique' },
        { id: 'mythique_1', titleKey: 'ach_mythique_1_title', descKey: 'ach_mythique_1_desc', icon: '🧙', condition: (s) => s.countByRarity('mythique') >= 1, rarity: 'mythique' },
        { id: 'legendaire_1', titleKey: 'ach_legendaire_1_title', descKey: 'ach_legendaire_1_desc', icon: '🏆', condition: (s) => s.countByRarity('legendaire') >= 1, rarity: 'legendaire' },
        { id: 'ultra_1', titleKey: 'ach_ultra_1_title', descKey: 'ach_ultra_1_desc', icon: '☀️', condition: (s) => s.countByRarity('ultra_legendaire') >= 1, rarity: 'ultra_legendaire' },
        { id: 'rarity_master', titleKey: 'ach_rarity_master_title', descKey: 'ach_rarity_master_desc', icon: '👑', condition: (s) => s.countByRarity('rare') >= 1 && s.countByRarity('super_rare') >= 1 && s.countByRarity('epique') >= 1 && s.countByRarity('mythique') >= 1 && s.countByRarity('legendaire') >= 1, rarity: 'legendaire' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_rarity' })),

    // --- ALPHABET CHALLENGE (26) ---
    // A-Z
    ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((char, index) => ({
        id: `alpha_${char}`,
        titleKey: 'ach_alpha_title', 
        titleData: { char },
        descKey: 'ach_alpha_desc',
        descData: { char },
        icon: char, // A, B, C... (Simple & Robust)
        condition: (s) => s.hasLetter(char),
        categoryKey: 'ach_cat_alphabet',
        rarity: ['X', 'Y', 'Z', 'Q', 'W'].includes(char) ? 'super_rare' : 'rare'
    })),

    // --- TEMPS & SOBRIÉTÉ (Time & Sobriety) --- (6)
    ...[
        { id: 'time_matin', titleKey: 'ach_time_matin_title', descKey: 'ach_time_matin_desc', icon: '🌅', condition: (s) => s.timeMatin > 0, rarity: 'mythique' },
        { id: 'time_midi', titleKey: 'ach_time_midi_title', descKey: 'ach_time_midi_desc', icon: '☀️', condition: (s) => s.timeMidi > 0, rarity: 'rare' },
        { id: 'time_aprem', titleKey: 'ach_time_aprem_title', descKey: 'ach_time_aprem_desc', icon: '🌤️', condition: (s) => s.timeAprem > 0, rarity: 'commun' },
        { id: 'time_soir', titleKey: 'ach_time_soir_title', descKey: 'ach_time_soir_desc', icon: '🌆', condition: (s) => s.timeSoir > 0, rarity: 'commun' },
        { id: 'time_nuit', titleKey: 'ach_time_nuit_title', descKey: 'ach_time_nuit_desc', icon: '🦉', condition: (s) => s.timeNuit > 0, rarity: 'epique' },
        { id: 'sobriety_tournee', titleKey: 'ach_sobriety_tournee_title', descKey: 'ach_sobriety_tournee_desc', icon: '💧', condition: (s) => s.tourneeMinerale, rarity: 'epique' }
    ].map(a => ({ ...a, categoryKey: 'ach_cat_time' })),

    // --- UX & EXPLORATEUR --- (7)
    ...[
        { id: 'ux_tutorial', titleKey: 'ach_ux_tutorial_title', descKey: 'ach_ux_tutorial_desc', icon: '🎓', condition: (s) => s.prefs.tutorialCompleted, rarity: 'commun' },
        { id: 'ux_bac', titleKey: 'ach_ux_bac_title', descKey: 'ach_ux_bac_desc', icon: '🩸', condition: (s) => s.prefs.bacUsed, rarity: 'commun' },
        { id: 'ux_theme', titleKey: 'ach_ux_theme_title', descKey: 'ach_ux_theme_desc', icon: '🎨', condition: (s) => s.prefs.themeChanged, rarity: 'commun' },
        { id: 'ux_share', titleKey: 'ach_ux_share_title', descKey: 'ach_ux_share_desc', icon: '📤', condition: (s) => s.prefs.themeShared, rarity: 'rare' },
        { id: 'ux_museum', titleKey: 'ach_ux_museum_title', descKey: 'ach_ux_museum_desc', icon: '🏛️', condition: (s) => s.prefs.museumUsed, rarity: 'rare' },
        { id: 'ux_dedup', titleKey: 'ach_ux_dedup_title', descKey: 'ach_ux_dedup_desc', icon: '🧹', condition: (s) => s.prefs.dedupUsed, rarity: 'rare' },
        { id: 'ux_support', titleKey: 'ach_ux_support_title', descKey: 'ach_ux_support_desc', icon: '☕', condition: (s) => s.prefs.supportedDev, rarity: 'epique', hidden: true },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_ux' })),

    // Filler to reach count
    ...[
        { id: 'fill_1', titleKey: 'ach_fill_1_title', descKey: 'ach_fill_1_desc', icon: '👶', condition: (s) => s.hasVolume(250), rarity: 'commun' },
        { id: 'fill_2', titleKey: 'ach_fill_2_title', descKey: 'ach_fill_2_desc', icon: '✓', condition: (s) => s.hasVolume(330), rarity: 'commun' },
        { id: 'fill_3', titleKey: 'ach_fill_3_title', descKey: 'ach_fill_3_desc', icon: '🍺', condition: (s) => s.hasVolume(500), rarity: 'commun' },
        { id: 'fill_4', titleKey: 'ach_fill_4_title', descKey: 'ach_fill_4_desc', icon: '🍾', condition: (s) => s.hasVolume(750), rarity: 'rare' },
    ].map(a => ({ ...a, categoryKey: 'ach_cat_formats' })),
];

export function checkAchievements(allBeers) {
    const userData = Storage.getAllUserData();
    const previouslyUnlocked = getUnlockedAchievements();
    let currentUnlocked = [...previouslyUnlocked];

    // O(1) lookup map instead of O(n) find() per beer
    const beerMap = new Map();
    allBeers.forEach(b => beerMap.set(b.id, b));

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

        timeMatin: 0,
        timeMidi: 0,
        timeAprem: 0,
        timeSoir: 0,
        timeNuit: 0,
        tourneeMinerale: false,

        hasZeroRating: false,
        hasPerfectRating: false,
        hasAverageRating: false,
        lowRatingCount: 0, // < 10
        highRatingCount: 0, // > 18

        // Types/Breweries
        drunkTypes: [],
        countByType: (type) => stats.drunkTypes.filter(t => t.toLowerCase().includes(type.toLowerCase())).length,
        fruitCount: 0, 

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
        hasLowAlcoholString: false, 

        hasGlitch: false,
        
        // UX & Preferences
        prefs: {
            tutorialCompleted: Storage.getPreference('tutorial_completed', false),
            bacUsed: Storage.getPreference('stats_bac_used', false),
            themeChanged: Storage.getPreference('theme_preset', 'default') !== 'default' || Storage.getPreference('theme_custom', null) !== null,
            themeShared: Storage.getPreference('theme_shared', false),
            museumUsed: Storage.getPreference('museumThemeEnabled', false),
            dedupUsed: Storage.getPreference('dedup_manually_triggered', false),
            supportedDev: Storage.getPreference('supported_dev', false)
        }
    };

    const userIds = Object.keys(userData);
    // Correctly filter unique count for consumed beers only
    stats.uniqueCount = userIds.filter(id => (userData[id].count || 0) > 0 || userData[id].score !== undefined).length;

    let allTimestamps = [];

    userIds.forEach(id => {
        const u = userData[id];
        const isConsumed = (u.count || 0) > 0 || (u.score !== undefined && u.score !== '');

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
            const cBeer = beerMap.get(id);
            if (cBeer && cBeer.image && !cBeer.image.includes('FUT.jpg')) stats.hasCustomPhoto = true;
        }

        // History interactions for volume
        if (u.history) {
            u.history.forEach(h => {
                const vol = h.volume || 0;
                stats.totalLiters += vol / 1000;
                stats.volumes.add(vol);

                const ts = h.timestamp || h.date;
                if (ts) {
                    allTimestamps.push(new Date(ts).getTime());
                    const d = new Date(ts);
                    const h_val = d.getHours();
                    if (h_val >= 5 && h_val < 11) stats.timeMatin++;
                    else if (h_val >= 11 && h_val < 14) stats.timeMidi++;
                    else if (h_val >= 14 && h_val < 18) stats.timeAprem++;
                    else if (h_val >= 18 && h_val < 24) stats.timeSoir++;
                    else if (h_val >= 0 && h_val < 5) stats.timeNuit++;
                }
            });
        }

        // Beer Data Stats - REQUIRE CONSUMPTION
        if (isConsumed) {
            const beer = beerMap.get(id);
            if (beer) {
                // Alcohol
                if (beer.alcohol) {
                    const match = beer.alcohol.toString().match(/(\d+([.,]\d+)?)/);
                    if (match) {
                        const deg = parseFloat(match[1].replace(',', '.'));
                        if (!isNaN(deg)) {
                            stats.degrees.push(deg);
                            if (deg > stats.maxDegree) stats.maxDegree = deg;
                            if (deg < stats.minDegree) stats.minDegree = deg;
                            if (deg > 8) stats.strongCount++;
                        }
                    }
                    // Emergency fallback: search for low strings if parseFloat is tricky
                    const raw = beer.alcohol.toString().toLowerCase();
                    if (raw.includes('0.') || raw.includes('1.') || raw.includes('0,') || raw.includes('1,')) {
                        stats.hasLowAlcoholString = true;
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

    // Post-process fruit count 
    const fruitRegex = /fruit|rouge|rubis|kriek|framboise|pêche|radler|rosée|cerise|myrtille|fraise/i;
    stats.fruitCount = stats.drunkTypes.filter(t => fruitRegex.test(t)).length;

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
            const beer = beerMap.get(id);
            if (beer && beer.rarity) {
                // Normalize rarity string just in case
                const r = beer.rarity.toLowerCase();
                if (stats.rarityCounts[r] !== undefined) {
                    stats.rarityCounts[r]++;
                }
            }
        }
    });

    // Tournée Minérale logic (28 days gap)
    if (allTimestamps.length > 0) {
        allTimestamps.sort((a, b) => a - b);
        let maxGap = 0;
        // Check gaps between consecutive drinks
        for (let i = 1; i < allTimestamps.length; i++) {
            const gap = allTimestamps[i] - allTimestamps[i - 1];
            if (gap > maxGap) maxGap = gap;
        }
        // Check gap from last drink to NOW
        const gapToNow = Date.now() - allTimestamps[allTimestamps.length - 1];
        if (gapToNow > maxGap) maxGap = gapToNow;

        if (maxGap >= 28 * 24 * 60 * 60 * 1000) {
            stats.tourneeMinerale = true;
        }
    }

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

        // Make UX achievements permanent
        if (!isMet && ach.categoryKey === 'ach_cat_ux' && previouslyUnlocked.includes(ach.id)) {
            isMet = true;
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
                import('./fx.js').then(m => m.FX.achievementUnlock(i18n.t(ach.titleKey, ach.titleData), ach.icon, ach.rarity));
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
