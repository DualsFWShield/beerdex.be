import * as Storage from './storage.js';
import * as UI from './ui.js';
import * as Share from './share.js';

/**
 * api.js
 * Handles URL-based actions for automation and external integration.
 * Scheme: ?action=[add|export|share|import]
 */

let _allBeersProvider = null;

export function init() {
    // This is called on load, but we might wait for start() to actually process complex actions
    // Simple actions like 'import' can be handled if dependencies are ready
}

/**
 * Main entry point called by app.js when data is ready
 * @param {Function} allBeersCallback - Function returning list of all beers
 */
export function start(allBeersCallback) {
    _allBeersProvider = allBeersCallback;

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const mode = params.get('mode');

    // Handle specific modes that might coexist or replace actions
    if (mode === 'wrapped_share') {
        handleWrappedShare(params);
        return;
    }

    if (!action) return;

    console.log(`[API] Triggered action: ${action}`);

    switch (action) {
        case 'import':
        case 'add':
            handleImport(params);
            break;
        case 'export':
            // ?action=export&scope=[all|custom|ratings]&ids=[1,2,3]&mode=[file|url]
            const scope = params.get('scope') || 'all';
            const mode = params.get('mode') || 'file'; // 'file' or 'url'
            const idsRaw = params.get('ids');
            const ids = idsRaw ? idsRaw.split(',').filter(x => x) : null;
            handleExport(scope, ids, mode);
            break;
        case 'share':
            // ?action=share&id=123&score=15&comment=Bravo&fallback=true
            const id = params.get('id');
            if (id) {
                const score = params.get('score');
                const comment = params.get('comment');
                const fallback = params.get('fallback') === 'true';
                handleShare(id, score, comment, fallback);
            }
            break;
        default:
            console.warn(`[API] Unknown action: ${action}`);
    }
}

/**
 * Handle Wrapped Share Mode
 * Reconstructs stats from URL and generates/downloads the image.
 */
async function handleWrappedShare(params) {
    console.log("[API] Handling Wrapped Share...");
    UI.showToast("Génération du Wrapped partagé...", "info");

    try {
        // Reconstruct Stats
        const stats = {
            totalLiters: params.get('total_liters'),
            totalBeers: parseInt(params.get('total_count') || 0),
            uniqueBeers: params.get('total_count'),
            favoriteStyle: params.get('fav_style') || 'Inconnu',
            favoriteBeer: null,
            equivalence: { label: "Hydratation maximale", val: params.get('total_liters') }
        };

        // Reconstruct Equivalence Logic
        const l = parseFloat(stats.totalLiters);
        const nbBottles = Math.round(l * 1000 / 500);
        stats.equivalence = { label: nbBottles + " Bouteilles d'eau", val: l };

        let favBeer = null;
        if (params.get('fav_name')) {
            favBeer = {
                name: params.get('fav_name'),
                title: params.get('fav_name'),
                count: params.get('fav_count'),
                image: params.get('fav_image')
            };
            stats.favoriteBeer = favBeer;
        }

        const year = params.get('year');

        // Generate Image
        const blob = await Share.generateWrappedCard(stats, favBeer, year);

        // Download / Preview
        // Pass null for apiLink to avoid recursion/clutter in consumer view
        Share.shareImage(blob, `Beerdex Wrapped ${year || new Date().getFullYear()}`, null);

        // Clean URL to prevent re-triggering on reload
        cleanURL();
        UI.showToast("Wrapped téléchargé !", "success");

    } catch (e) {
        console.error("Wrapped generation failed", e);
        UI.showToast("Erreur lors de la génération du partage", "error");
    }
}

/**
 * Handle Import Action
 * Supports ?data=[LZString_Compressed_Base64]
 */
function handleImport(params) {
    const dataStr = params.get('data');
    const isDownload = params.get('download') === 'true';

    if (!dataStr) {
        UI.showToast("API Error: Pas de données à importer", "error");
        return;
    }

    // Attempt decompression
    let jsonStr = dataStr;
    try {
        if (window.LZString) {
            const decompressed = LZString.decompressFromEncodedURIComponent(dataStr);
            if (decompressed) jsonStr = decompressed;
        }
    } catch (e) {
        console.warn("[API] Decompression failed, trying raw", e);
    }

    // Delay slightly to ensure UI is ready
    setTimeout(() => {
        if (isDownload) {
            const timestamp = new Date().toISOString().slice(0, 10);
            Storage.downloadRawJSON(jsonStr, `beerdex_shared_${timestamp}.json`);
            UI.showToast("⬇️ Téléchargement lancé via API", "success");
            cleanURL();
        } else {
            const success = Storage.importData(jsonStr);
            if (success) {
                UI.showToast("📥 Importation réussie !", "success");
                cleanURL();
                // Refresh to show new data
                setTimeout(() => window.location.reload(), 1500);
            } else {
                UI.showToast("❌ Erreur format Import", "error");
            }
        }
    }, 500);
}

/**
 * Handle Export Action
 */
function handleExport(scope, ids, mode) {
    setTimeout(() => {
        if (mode === 'file') {
            const count = Storage.triggerExportFile(scope, ids);
            if (count > 0) {
                UI.showToast(`📤 Export fichier lancé (${count} items)`, "info");
            } else {
                UI.showToast("⚠️ Aucune donnée à exporter", "warning");
            }
        } else if (mode === 'url') {
            const link = Storage.getShareableLink(scope, ids);
            if (!link) {
                UI.showToast("⚠️ Erreur génération lien", "error");
                return;
            }

            // Copy to clipboard or Prompt
            navigator.clipboard.writeText(link).then(() => {
                UI.showToast("🔗 Lien copié dans le presse-papier !", "success");
            }).catch(() => {
                // Fallback
                prompt("Copiez ce lien pour partager vos données :", link);
            });
        }
        cleanURL();
    }, 500);
}

/**
 * Handle Share Action
 */
async function handleShare(beerId, scoreOverride, commentOverride, isFallback) {
    setTimeout(async () => {
        const allBeers = _allBeersProvider ? _allBeersProvider() : [];
        let beer = allBeers.find(b => b.id == beerId);

        // Fallback: Check by Title for legacy shares
        if (!beer) {
            const cleanKey = String(beerId).toUpperCase().trim();
            beer = allBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
        }

        if (!beer) {
            UI.showToast("Bière introuvable pour partage", "error");
            cleanURL();
            return;
        }

        // Logic to trigger share
        // If fallback is true, we might want to alert the user about the link
        // But usually 'share' action means "Show me the image"

        // We open the detail view to ensure DOM is ready for screenshot if needed
        // We open the detail view to ensure DOM is ready for screenshot if needed
        if (UI.renderBeerDetail) UI.renderBeerDetail(beer);

        // Compute effective values
        const dbRating = Storage.getBeerRating(beerId) || {};
        const effectiveScore = scoreOverride !== null ? parseFloat(scoreOverride) : (dbRating.score || 0);
        const effectiveComment = commentOverride !== null ? commentOverride : (dbRating.comment || '');

        // Pass these to Share module
        // We need to modify Share logic to accept explicit values or DOM overrides
        // For now, we use our mock approach or just rely on DB if scoreOverride is null

        // BETTER: We directly call generateBeerCard -> Share
        // But we need the DOM to be visible for the "Fullscreen Preview"? 
        // Share.shareImage expects a Blob. Share.generateBeerCard(beer, rating, comment) -> Blob

        if (window.Share && window.Share.generateBeerCard) {
            try {
                // Generate Blob
                const blob = await window.Share.generateBeerCard(beer, effectiveScore, effectiveComment);

                // Share it
                window.Share.shareImage(blob, `Check-in ${beer.title}`);
            } catch (e) {
                console.error("Share gen failed", e);
                if (isFallback) {
                    // Generate link for this specific beer
                    // We assume 'all' scope + filter by ID covers both ratings and custom presence
                    const link = Storage.getShareableLink('all', [String(beerId)]);
                    UI.renderShareLink(link);
                }
            }
        }

        cleanURL();
    }, 1000); // Wait for app load
}

function cleanURL() {
    const url = new URL(window.location);
    // Standard API params
    const keysToRemove = [
        'action', 'data', 'id', 'score', 'comment', 'scope', 'mode',
        'ids', 'fallback', 'download', 'lang',
        // Wrapped Share API params
        'total_liters', 'total_count', 'year',
        'fav_name', 'fav_count', 'fav_image', 'fav_style'
    ];

    keysToRemove.forEach(key => url.searchParams.delete(key));

    history.replaceState(null, '', url.pathname + url.search);
}
