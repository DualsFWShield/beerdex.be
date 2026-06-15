const STORAGE_KEY_RATINGS = 'beerdex_ratings';
const STORAGE_KEY_CUSTOM = 'beerdex_custom_beers';

// Get all ratings/notes
export function getAllUserData() {
    const data = localStorage.getItem(STORAGE_KEY_RATINGS);
    return data ? JSON.parse(data) : {};
}

// Get specific beer rating
export function getBeerRating(id) {
    const data = getAllUserData();
    return data[id] || null;
}

// Save rating (Separated from consumption, but linked)
export function saveBeerRating(id, ratingData) {
    const data = getAllUserData();
    if (!data[id]) data[id] = { count: 1, history: [] }; // Assume rating implies drinking once if not present

    data[id] = {
        ...data[id],
        ...ratingData,
        timestamp: new Date().toISOString()
    };

    // Ensure history exists
    if (!data[id].history) {
        data[id].history = [{ date: new Date().toISOString(), volume: 330 }];
        data[id].count = 1;
    }

    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
    autoBackup();
}

// Get list of all IDs that have data (e.g. have been drunk/rated)
export function getAllConsumedBeerIds() {
    const data = getAllUserData();
    return Object.keys(data).filter(id => data[id].count > 0);
}

// --- Favorites ---

export function isFavorite(id) {
    const data = getAllUserData();
    return data[id] && data[id].favorite === true;
}

export function toggleFavorite(id) {
    const data = getAllUserData();
    if (!data[id]) data[id] = { count: 0, history: [] }; // Init if empty

    data[id].favorite = !data[id].favorite;
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
    autoBackup();
    return data[id].favorite;
}

export function sortBeers(beers) {
    const data = getAllUserData();
    return beers.sort((a, b) => {
        // 1. Favorites First
        const favA = data[a.id] && data[a.id].favorite ? 1 : 0;
        const favB = data[b.id] && data[b.id].favorite ? 1 : 0;
        if (favA !== favB) return favB - favA;

        // 2. Alphabetical
        return a.title.localeCompare(b.title);
    });
}

// --- Custom Beers ---

export function getCustomBeers() {
    const data = localStorage.getItem(STORAGE_KEY_CUSTOM);
    return data ? JSON.parse(data) : [];
}

export function saveCustomBeer(beer) {
    const beers = getCustomBeers();
    beers.unshift(beer); // Add to top
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(beers));
    autoBackup();
}

export function deleteCustomBeer(id) {
    let beers = getCustomBeers();
    beers = beers.filter(b => b.id !== id);
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(beers));
    autoBackup();
}

/**
 * Migrate all user data (ratings, history, count, favorites, aromas)
 * from a custom beer (oldId) to an official beer (newId).
 * If the official beer already has data, histories are MERGED and counts ADDED.
 * The custom beer is deleted after migration.
 * 
 * @param {string} oldId - The custom beer's ID
 * @param {string} newId - The official beer's ID
 * @returns {{ success: boolean, transferred: object }}
 */
export function migrateBeerData(oldId, newId) {
    const data = getAllUserData();
    const oldData = data[oldId];

    if (!oldData) {
        deleteCustomBeer(oldId);
        autoBackup();
        return { success: true, transferred: { count: 0, history: 0 } };
    }

    // Get or init the target entry
    if (!data[newId]) {
        data[newId] = { count: 0, history: [] };
    }

    const target = data[newId];

    // Merge counts
    target.count = (target.count || 0) + (oldData.count || 0);

    // Merge histories
    const oldHistory = oldData.history || [];
    const newHistory = target.history || [];
    target.history = [...newHistory, ...oldHistory].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );

    // Transfer rating data (only if target doesn't have one)
    if (oldData.score !== undefined && target.score === undefined) {
        target.score = oldData.score;
    }
    if (oldData.comment && !target.comment) {
        target.comment = oldData.comment;
    }

    // Transfer favorite
    if (oldData.favorite) {
        target.favorite = true;
    }

    // Transfer aromas / custom fields
    if (oldData.aromas && !target.aromas) {
        target.aromas = oldData.aromas;
    }

    // Transfer timestamp (keep earliest)
    if (oldData.timestamp) {
        if (!target.timestamp || new Date(oldData.timestamp) < new Date(target.timestamp)) {
            target.timestamp = oldData.timestamp;
        }
    }

    // Remove old entry from ratings
    delete data[oldId];
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));

    // Remove from custom beers list
    deleteCustomBeer(oldId);

    autoBackup();

    return { success: true, transferred: { count: oldData.count || 0, history: oldHistory.length } };
}

// --- Consumption Logic ---

export function parseVolumeToMl(volStr) {
    if (!volStr) return 330; // Default
    let str = volStr.toLowerCase().replace(',', '.').replace(/\s/g, '');
    let val = parseFloat(str);
    if (isNaN(val)) return 330;

    if (str.includes('ml')) return val;
    if (str.includes('cl')) return val * 10;
    if (str.includes('l')) return val * 1000;

    // Fallback based on magnitude
    if (val < 10) return val * 1000; // Assume Liters
    if (val < 100) return val * 10; // Assume cl
    return val; // Assume ml
}

export function addConsumption(id, volumeStr, customDate = null) {
    const data = getAllUserData();
    if (!data[id]) {
        data[id] = { count: 0, history: [] };
    }

    // Migrate old data if necessary (if it has score but no count)
    if (data[id].score && data[id].count === undefined) {
        data[id].count = 1;
        data[id].history = [{
            date: data[id].timestamp,
            volume: 330 // Assumption for historical data
        }];
    }

    data[id].count = (data[id].count || 0) + 1;

    const volMl = parseVolumeToMl(volumeStr);

    if (!data[id].history) data[id].history = [];
    data[id].history.push({
        date: customDate ? new Date(customDate).toISOString() : new Date().toISOString(),
        volume: volMl
    });

    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
    autoBackup();
    return data[id];
}

export function removeConsumption(id) {
    const data = getAllUserData();
    if (data[id] && data[id].count > 0) {
        data[id].count--;
        if (data[id].history && data[id].history.length > 0) {
            data[id].history.pop();
        }

        if (data[id].count <= 0) {
            // Keep rating data even if count is 0? Or remove?
            // Requirement says "enlever une biere marquee comme bue".
            // If count is 0, we treat it as not drunk.
            data[id].count = 0;
        }
        localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
        autoBackup();
        return data[id];
    }
}

// --- Rating Template ---

const DEFAULT_TEMPLATE = [
    { id: 'score', label: 'preset_global_score', type: 'number', min: 0, max: 20, step: 0.5 },
    { id: 'comment', label: 'preset_comment', type: 'textarea' }
];

export function getRatingTemplate() {
    const data = localStorage.getItem('beerdex_rating_template');
    return data ? JSON.parse(data) : DEFAULT_TEMPLATE;
}

export function saveRatingTemplate(template) {
    localStorage.setItem('beerdex_rating_template', JSON.stringify(template));
}

export function resetRatingTemplate() {
    localStorage.setItem('beerdex_rating_template', JSON.stringify(DEFAULT_TEMPLATE));
    return DEFAULT_TEMPLATE;
}

// --- Granular Resets ---

export function resetRatingsOnly() {
    const data = getAllUserData();
    Object.keys(data).forEach(id => {
        delete data[id].score;
        delete data[id].comment;
        // Cleanup if empty
        if ((!data[id].count || data[id].count === 0) && !data[id].favorite) {
            delete data[id];
        }
    });
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
}

export function resetFavoritesOnly() {
    const data = getAllUserData();
    Object.keys(data).forEach(id => {
        if (data[id].favorite) {
            data[id].favorite = false;
        }
    });
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
}

export function resetConsumptionHistoryOnly() {
    const data = getAllUserData();
    Object.keys(data).forEach(id => {
        data[id].count = 0;
        data[id].history = [];
        // Note: We keep the entry if it has a rating or favorite
        if (!data[id].score && !data[id].comment && !data[id].favorite) {
            delete data[id];
        }
    });
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(data));
}

export function resetCustomBeersOnly() {
    localStorage.removeItem(STORAGE_KEY_CUSTOM);
}

export function resetAllData() {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('beerdex_')) {
            localStorage.removeItem(key);
        }
    });
}

// --- Specific Clears (Used by UI Danger Zone) ---

export function clearRatings() {
    resetRatingsOnly();
}

export function clearCustomBeers() {
    resetCustomBeersOnly();
}

export function clearHistory() {
    resetConsumptionHistoryOnly();
}

export function clearFavorites() {
    resetFavoritesOnly();
}

// --- Generic Preferences ---
export function getPreference(key, defaultValue) {
    const val = localStorage.getItem(`beerdex_pref_${key}`);
    if (val === null) return defaultValue;
    try {
        return JSON.parse(val);
    } catch {
        return val;
    }
}

export function savePreference(key, value) {
    localStorage.setItem(`beerdex_pref_${key}`, JSON.stringify(value));
}

// --- Import / Export ---

// --- Advanced Export / Sharing ---

export function autoBackup() {
    try {
        const data = getExportDataString(true);
        localStorage.setItem('beerdex_auto_backup', data);
        localStorage.setItem('beerdex_auto_backup_date', Date.now().toString());
    } catch (e) {
        console.warn("Auto-backup failed:", e);
    }
}

// --- Advanced Export / Sharing ---

export function triggerExportFile(scope = 'all', ids = null) {
    return exportDataAdvanced({ scope: scope, ids: ids });
}

export function generateExportObject(options = {}) {
    const isLegacyAll = !options.exportCustom && !options.exportRatings && !options.exportHistory && 
                        !options.exportTheme && !options.exportBac && !options.exportPrefs && !options.exportTemplate && !options.exportAchievements;
    const scope = options.scope || 'all'; // Legacy support

    const exportObj = {
        exportDate: new Date().toISOString(),
        version: 4,
        preferences: {}
    };

    // 1. Template
    if (isLegacyAll || options.exportTemplate) {
        exportObj.ratingTemplate = getRatingTemplate();
    }

    // 2. Preferences, Theme, BAC, Achievements, Stats Order, etc.
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        if (key === 'beerdex_achievements' && (isLegacyAll || options.exportAchievements)) {
            exportObj.preferences[key] = JSON.parse(localStorage.getItem(key) || '[]');
        } else if (key === 'beerdex_stats_order' && (isLegacyAll || options.exportPrefs)) {
            exportObj.preferences[key] = JSON.parse(localStorage.getItem(key) || '[]');
        } else if (key === 'defaultMapScope' && (isLegacyAll || options.exportPrefs)) {
            exportObj.preferences[key] = localStorage.getItem(key);
        } else if (key.startsWith('beerdex_pref_')) {
            const prefKey = key.replace('beerdex_pref_', '');
            
            let shouldExport = false;
            if (isLegacyAll) shouldExport = true;
            else if (prefKey === 'theme' && options.exportTheme) shouldExport = true;
            else if (prefKey.startsWith('bac') && options.exportBac) shouldExport = true;
            else if (prefKey !== 'theme' && !prefKey.startsWith('bac') && options.exportPrefs) shouldExport = true;

            if (shouldExport) {
                exportObj.preferences[prefKey] = getPreference(prefKey);
            }
        }
    }

    // 3. Ratings & History
    if (isLegacyAll || scope === 'ratings' || options.exportRatings || options.exportHistory) {
        const allRatings = getAllUserData();
        exportObj.ratings = {};
        
        Object.keys(allRatings).forEach(id => {
            
            const localData = allRatings[id];
            const exportItem = {};
            let hasData = false;

            if (isLegacyAll || options.exportRatings) {
                if (localData.score !== undefined) {
                    exportItem.score = localData.score;
                    exportItem.comment = localData.comment;
                    hasData = true;
                }
                if (localData.favorite !== undefined) {
                    exportItem.favorite = localData.favorite;
                    hasData = true;
                }
                if (localData.aromas !== undefined) {
                    exportItem.aromas = localData.aromas;
                    hasData = true;
                }
                if (localData.timestamp !== undefined) {
                    exportItem.timestamp = localData.timestamp;
                    hasData = true;
                }
            }
            if (isLegacyAll || options.exportHistory) {
                if (localData.count !== undefined) exportItem.count = localData.count;
                if (localData.history !== undefined) exportItem.history = localData.history;
                hasData = true;
            }

            if (hasData) {
                exportObj.ratings[id] = exportItem;
            }
        });
    }

    // 4. Custom Beers (customIds only applies to custom beers, not ratings)
    if (isLegacyAll || scope === 'custom' || options.exportCustom) {
        const allCustoms = getCustomBeers();
        const customIds = options.customIds; // Array of custom beer IDs or null
        if (customIds && customIds.length > 0) {
            exportObj.customBeers = allCustoms.filter(b => customIds.includes(String(b.id)));
        } else {
            exportObj.customBeers = allCustoms;
        }
    }

    return exportObj;
}

export async function exportDataAdvanced(options = {}) {
    const exportObj = generateExportObject(options);
    const scope = options.scope || 'all';

    // Check if we have anything
    if ((!exportObj.ratings || Object.keys(exportObj.ratings).length === 0) &&
        (!exportObj.customBeers || exportObj.customBeers.length === 0)) {
        console.error("Export: No data found in ratings or customBeers.");
        return 0; // Return count implies empty
    }

    const jsonString = JSON.stringify(exportObj);
    const filename = `beerdex_${scope}_${new Date().toISOString().slice(0, 10)}.json`;

    // Preparation
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });

    // 1. Force Download (Priority for APK/Desktop)
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Clean up the URL object to prevent memory leak
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
        console.warn("Force download failed", e);
    }

    // --- CAPACITOR NATIVE BRIDGE (Base64 approach) ---
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const Plugins = window.Capacitor.Plugins;
            if (Plugins && Plugins.Filesystem && Plugins.Share) {
                const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
                const writeResult = await Plugins.Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: 'CACHE'
                });
                await Plugins.Share.share({
                    title: 'Export Beerdex',
                    text: 'Voici mon fichier de sauvegarde Beerdex',
                    url: writeResult.uri,
                    dialogTitle: 'Sauvegarder les données Beerdex'
                });
                return (exportObj.ratings ? Object.keys(exportObj.ratings).length : 0) + (exportObj.customBeers ? exportObj.customBeers.length : 0);
            }
        } catch (e) {
            console.warn("Native bridge (Filesystem/Share) failed", e);
        }
    }

    // File System Access API (Desktop specific, optional now)
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'Beerdex JSON', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            return (exportObj.ratings ? Object.keys(exportObj.ratings).length : 0) + (exportObj.customBeers ? exportObj.customBeers.length : 0);
        } catch (err) {
            console.warn("Save cancelled or failed", err);
            // Don't return 0 here, let it fall through to share if user cancelled picker but might want share?
            // Actually usually picker cancel means cancel.
        }
    }

    // Web Share API Level 2 (Mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Export Beerdex',
                text: 'Voici un export de données Beerdex.'
            });
        } catch (err) {
            if (err.name !== 'AbortError') console.warn("Share failed", err);
        }
    }

    return (exportObj.ratings ? Object.keys(exportObj.ratings).length : 0) + (exportObj.customBeers ? exportObj.customBeers.length : 0);
}

export function downloadRawJSON(jsonString, filename) {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function getShareableLink(options = {}, downloadMode = false) {
    let scope = 'all';
    let ids = null;
    
    // Backwards compatibility for old calls: getShareableLink('scope', ids)
    if (typeof options === 'string') {
        scope = options;
        ids = arguments[1] || null;
        downloadMode = arguments[2] || false;
        options = { scope: scope, ids: ids };
    }

    const exportObj = generateExportObject(options);

    // Minimal overhead
    const jsonStr = JSON.stringify(exportObj);

    if (!window.LZString) return null;
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);

    // Construct absolute URL
    // We assume index.html is root, so just ?action=import...
    const baseUrl = window.location.origin + window.location.pathname;
    let url = `${baseUrl}?action=import&data=${compressed}`;
    if (downloadMode) url += '&download=true';
    return url;
}

export async function shareBeer(beer) {
    // bundle single beer data + possible rating
    const rating = getBeerRating(beer.id);
    const exportObj = {
        beer: beer,
        rating: rating,
        image: beer.image,
        sharedAt: new Date().toISOString(),
        type: 'single_beer_share'
    };

    const jsonString = JSON.stringify(exportObj, null, 2);
    const filename = `beer_${beer.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;

    // 1. NATIVE TEXT SHARE (MOST RELIABLE)
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Beerdex: ${beer.title}`,
                text: `Découvre cette bière : ${beer.title} ! 🍺\nNote: ${rating ? rating.score + '/20' : 'Pas de note'}\n\n${rating ? rating.comment : ''}`
            });
            return true;
        } catch (e) {
            console.warn("Native text share failed, trying file share", e);
        }
    }

    // --- CAPACITOR NATIVE BRIDGE (Base64 approach) ---
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const Plugins = window.Capacitor.Plugins;
            if (Plugins && Plugins.Filesystem && Plugins.Share) {
                const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
                const writeResult = await Plugins.Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: 'CACHE'
                });
                await Plugins.Share.share({
                    title: `Beerdex: ${beer.title}`,
                    text: `Découvre cette bière : ${beer.title} ! 🍺`,
                    url: writeResult.uri
                });
                return true;
            }
        } catch (e) {
            console.warn("Capacitor Native Share failed", e);
        }
    }

    // --- MEDIAN / GONATIVE BRIDGE (Legacy) ---
    if (window.median) {
        try {
            window.median.share.sharePage({
                title: `Partage: ${beer.title}`,
                text: jsonString,
                label: "Partager Bière"
            });
            return true;
        } catch (e) {
            console.error("Median Share Error", e);
        }
    }

    // File System Access API
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'Beerdex Beer JSON', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            return true;
        } catch (e) {
            console.warn("Save cancelled", e);
            return false;
        }
    }

    // Preparation
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });

    // Web Share API (Mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: `Partage: ${beer.title}`,
                text: `Découvre cette bière : ${beer.title} ! 🍺`
            });
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn("Share failed, trying download fallback", err);
        }
    }

    // Fallback Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
}

// --- Text / Backup Helpers ---

export function getExportDataString(options = {}) {
    // Backwards compatibility for includeCustom = true/false
    if (typeof options === 'boolean') {
        options = options ? { scope: 'all' } : { scope: 'ratings' };
    }

    const exportObj = generateExportObject(options);
    return JSON.stringify(exportObj, null, 2);
}

export async function shareBeerAsText(beer) {
    const rating = getBeerRating(beer.id);
    const exportObj = {
        beer: beer,
        rating: rating,
        image: beer.image,
        sharedAt: new Date().toISOString(),
        type: 'single_beer_share'
    };
    const jsonString = JSON.stringify(exportObj, null, 2);

    // Try native text share
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Partage: ${beer.title}`,
                text: jsonString
            });
            return true;
        } catch (e) {
            console.warn("Text share failed", e);
        }
    }

    // Return string for manual copy if share failed/unsupported
    return jsonString;
}

// Kept for backward compat or simple calls
export function exportData() {
    return exportDataAdvanced({ scope: 'all' });
}

export function analyzeImportData(jsonString) {
    const result = {
        isValid: false, isSingleShare: false, exportDate: null,
        hasCustom: false, hasRatings: false, hasHistory: false,
        hasTheme: false, hasBac: false, hasPrefs: false, hasTemplate: false, hasAchievements: false,
        customConflicts: 0, parsedData: null
    };

    try {
        const data = JSON.parse(jsonString);
        if (!data) return result;

        result.parsedData = data;
        result.isValid = true;

        if (data.type === 'single_beer_share') {
            result.isSingleShare = true;
            return result;
        }

        if (data.exportDate) result.exportDate = data.exportDate;
        
        if (data.customBeers && data.customBeers.length > 0) {
            result.hasCustom = true;
            const localCustoms = getCustomBeers();
            data.customBeers.forEach(cb => {
                if (localCustoms.some(lb => lb.id === cb.id)) {
                    result.customConflicts++;
                }
            });
        }

        if (data.ratings && Object.keys(data.ratings).length > 0) {
            // Check if ratings have score and/or history
            const keys = Object.keys(data.ratings);
            for (let k of keys) {
                const r = data.ratings[k];
                if (r.score !== undefined) result.hasRatings = true;
                if (r.history !== undefined || r.count !== undefined) result.hasHistory = true;
                if (result.hasRatings && result.hasHistory) break;
            }
        }

        if (data.ratingTemplate) result.hasTemplate = true;

        if (data.preferences && Object.keys(data.preferences).length > 0) {
            const prefKeys = Object.keys(data.preferences);
            if (prefKeys.includes('theme')) result.hasTheme = true;
            if (prefKeys.includes('beerdex_achievements')) result.hasAchievements = true;
            if (prefKeys.some(k => k.startsWith('bac'))) result.hasBac = true;
            if (prefKeys.some(k => k !== 'theme' && !k.startsWith('bac') && k !== 'beerdex_achievements')) result.hasPrefs = true;
        }

        return result;
    } catch (e) {
        return result;
    }
}

export function mergeUserData(importedData, options = {}) {
    const isLegacy = Object.keys(options).length === 0;
    const opt = {
        importCustom: isLegacy ? true : options.importCustom,
        importRatings: isLegacy ? true : options.importRatings,
        importHistory: isLegacy ? true : options.importHistory,
        importTheme: isLegacy ? true : options.importTheme,
        importBac: isLegacy ? true : options.importBac,
        importPrefs: isLegacy ? true : options.importPrefs,
        importTemplate: isLegacy ? true : options.importTemplate,
        importAchievements: isLegacy ? true : options.importAchievements,
        overwriteMode: isLegacy ? false : options.overwriteMode
    };

    // 1. Merge Custom Beers
    if (importedData.customBeers && opt.importCustom) {
        const localCustoms = getCustomBeers();
        const newCustoms = [...localCustoms];

        importedData.customBeers.forEach(importedBeer => {
            const existingIndex = localCustoms.findIndex(b => b.id === importedBeer.id);
            if (existingIndex === -1) {
                newCustoms.unshift(importedBeer); // Add new
            } else if (opt.overwriteMode) {
                // Completely overwrite existing custom beer
                newCustoms[existingIndex] = importedBeer;
            }
        });
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(newCustoms));
    }

    // 2. Merge Ratings / Consumptions
    if (importedData.ratings && (opt.importRatings || opt.importHistory)) {
        const localRatings = getAllUserData();

        Object.keys(importedData.ratings).forEach(beerId => {
            const importedR = importedData.ratings[beerId];
            if (!localRatings[beerId]) {
                localRatings[beerId] = {};
            }
            const localR = localRatings[beerId];

            if (opt.overwriteMode) {
                // Overwrite mode: replace fields if they exist in imported
                if (opt.importRatings && importedR.score !== undefined) {
                    localR.score = importedR.score;
                    localR.comment = importedR.comment;
                }
                if (opt.importRatings && importedR.favorite !== undefined) {
                    localR.favorite = importedR.favorite;
                }
                if (opt.importRatings && importedR.aromas !== undefined) {
                    localR.aromas = importedR.aromas;
                }
                if (opt.importRatings && importedR.timestamp !== undefined) {
                    localR.timestamp = importedR.timestamp;
                }
                if (opt.importHistory && (importedR.history !== undefined || importedR.count !== undefined)) {
                    localR.count = importedR.count;
                    if (importedR.history) {
                        const normalized = importedR.history.map(item => 
                            typeof item === 'string' ? { date: item, volume: 330 } : item
                        );
                        normalized.sort((a,b) => new Date(b.date) - new Date(a.date));
                        localR.history = normalized;
                    } else {
                        localR.history = importedR.history;
                    }
                }
            } else {
                // Merge mode
                if (opt.importRatings && importedR.score !== undefined) {
                    // Only set if we don't have one
                    if (localR.score === undefined) {
                        localR.score = importedR.score;
                        localR.comment = importedR.comment;
                    }
                }
                if (opt.importRatings && importedR.favorite !== undefined) {
                    // Favorite: imported true wins over local
                    if (importedR.favorite) localR.favorite = true;
                }
                if (opt.importRatings && importedR.aromas !== undefined) {
                    // Aromas: only set if we don't have them
                    if (!localR.aromas) localR.aromas = importedR.aromas;
                }
                if (opt.importRatings && importedR.timestamp !== undefined) {
                    // Timestamp: keep earliest
                    if (!localR.timestamp || new Date(importedR.timestamp) < new Date(localR.timestamp)) {
                        localR.timestamp = importedR.timestamp;
                    }
                }
                if (opt.importHistory && (importedR.history || importedR.count)) {
                    // Additive merge for history
                    let localHistory = localR.history || [];
                    const importedHistory = importedR.history || [];
                    
                    const combined = [...localHistory];
                    
                    importedHistory.forEach(item => {
                        // Normalize item to object format
                        const normItem = typeof item === 'string' ? { date: item, volume: 330 } : item;
                        
                        // Check if an entry with the exact same date already exists
                        const exists = combined.some(existing => {
                            const existingDate = typeof existing === 'string' ? existing : existing.date;
                            // Compare timestamps to handle minor formatting differences
                            return new Date(existingDate).getTime() === new Date(normItem.date).getTime();
                        });
                        
                        if (!exists) {
                            combined.push(normItem);
                        }
                    });
                    
                    // Normalize all entries in combined just in case localHistory had strings
                    const normalizedCombined = combined.map(item => 
                        typeof item === 'string' ? { date: item, volume: 330 } : item
                    );
                    
                    // Sort by date descending
                    normalizedCombined.sort((a,b) => new Date(b.date) - new Date(a.date));
                    
                    localR.history = normalizedCombined;
                    localR.count = normalizedCombined.length || (localR.count || 0) + (importedR.count || 0); // fallback to count sum if no history
                }
            }
            
            // Clean up if somehow empty (preserve entries with favorites or aromas)
            if (localR.score === undefined && !localR.count && (!localR.history || localR.history.length === 0) && !localR.favorite && !localR.aromas) {
                delete localRatings[beerId];
            }
        });
        localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(localRatings));
    }

    // 3. Template
    if (importedData.ratingTemplate && opt.importTemplate) {
        localStorage.setItem('beerdex_rating_template', JSON.stringify(importedData.ratingTemplate));
    }

    // 4. Preferences & Extra State
    if (importedData.preferences) {
        Object.keys(importedData.preferences).forEach(key => {
            const isTheme = key === 'theme';
            const isBac = key.startsWith('bac');
            const isAchievement = key === 'beerdex_achievements';
            const isPref = !isTheme && !isBac && !isAchievement;
            
            let shouldImport = false;
            if (isTheme && opt.importTheme) shouldImport = true;
            if (isBac && opt.importBac) shouldImport = true;
            if (isPref && opt.importPrefs) shouldImport = true;
            if (isAchievement && opt.importAchievements) shouldImport = true;

            if (shouldImport) {
                const value = importedData.preferences[key];
                
                // For achievements, handle merge vs overwrite
                if (isAchievement) {
                    if (opt.overwriteMode) {
                        localStorage.setItem(key, JSON.stringify(value));
                    } else {
                        // Merge achievements
                        const localAch = JSON.parse(localStorage.getItem(key) || '[]');
                        const importedAch = value || [];
                        const merged = [...localAch];
                        importedAch.forEach(id => {
                            if (!merged.includes(id)) merged.push(id);
                        });
                        localStorage.setItem(key, JSON.stringify(merged));
                    }
                } else {
                    const storageKey = key.startsWith('beerdex_') || key === 'defaultMapScope' ? key : `beerdex_pref_${key}`;
                    localStorage.setItem(storageKey, JSON.stringify(value));
                }
            }
        });
    }
}

export function importData(jsonString, options = {}) {
    try {
        const analysis = analyzeImportData(jsonString);
        if (!analysis.isValid) return false;

        const data = analysis.parsedData;

        // CASE 1: Single Beer Share
        if (data.type === 'single_beer_share' && data.beer) {
            const sharedBeer = data.beer;
            const sharedRating = data.rating;

            if (String(sharedBeer.id).startsWith('CUSTOM_')) {
                const customs = getCustomBeers();
                const exists = customs.find(b => b.id === sharedBeer.id);
                if (!exists) {
                    saveCustomBeer(sharedBeer);
                } else if (options.overwriteMode) {
                    const idx = customs.findIndex(b => b.id === sharedBeer.id);
                    customs[idx] = sharedBeer;
                    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customs));
                }
            }

            // Import Rating only if we don't have one, or if overwrite
            if (sharedRating) {
                const currentRatings = getAllUserData();
                if (!currentRatings[sharedBeer.id] || options.overwriteMode) {
                    saveBeerRating(sharedBeer.id, sharedRating);
                }
            }
            return true;
        }

        // CASE 2: Full Backup (Smart Merge)
        if (data.ratings || data.customBeers || data.preferences || data.ratingTemplate) {
            mergeUserData(data, options);
            return true;
        }

        return false;
    } catch (e) {
        console.error("Import failed:", e);
        return false;
    }
}
