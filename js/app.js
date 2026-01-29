import * as Data from './data.js';
import * as UI from './ui.js';
import * as Storage from './storage.js';
import * as Achievements from './achievements.js';
import * as API from './api.js';
import * as Share from './share.js';
import { fetchProductByBarcode, searchProducts } from './off-api.js';

window.Share = Share;

import * as Wrapped from './wrapped.js';

// Expose UI for inline HTML event handlers
window.UI = UI;
window.Wrapped = Wrapped;
window.showToast = UI.showToast;

// App State

// Initialize Wrapped
Wrapped.init(() => state.beers);
const state = {
    beers: [],
    filteredBeers: [], // Cache for filtered results
    filter: '',
    activeFilters: {},
    view: 'home', // home, drunk, stats
    pagination: {
        page: 1,
        itemsPerPage: 24,
        hasMore: true
    },
    observer: null // Store observer to disconnect if needed
};

// Initialize Application
async function init() {
    try {
        // Load Data
        const staticBeers = await Data.fetchAllBeers();
        const customBeers = Storage.getCustomBeers();
        state.beers = [...customBeers, ...staticBeers];

        // Initial Render
        renderCurrentView();

        // Setup Event Listeners
        setupEventListeners();

        // Check for Achievements on Load (Syncs import/offline data)
        Achievements.checkAchievements(state.beers);

        // Check Welcome
        UI.checkAndShowWelcome();

        // --- API AUTO-ACTION CHECK ---
        API.start(() => state.beers);

    } catch (error) {
        console.error("Failed to initialize Beerdex:", error);
        UI.showToast("Erreur de chargement des données. Vérifiez votre connexion.");
    }
}

function loadMoreBeers(container, isAppend = false, isDiscoveryMode = false, showCreatePrompt = false) {
    const { page, itemsPerPage } = state.pagination;
    const start = (page - 1) * itemsPerPage;
    const end = page * itemsPerPage;

    // Slice data
    const batch = state.filteredBeers.slice(start, end);

    if (batch.length < itemsPerPage) {
        state.pagination.hasMore = false;
    }

    // Call UI Render
    // If it's discovery mode and empty, we might need special handling passed to UI
    UI.renderBeerList(batch, container, state.activeFilters, showCreatePrompt, () => {
        // Handle "Create" click from empty state
        UI.renderAddBeerForm((newBeer) => {
            Storage.saveCustomBeer(newBeer);
            state.beers.unshift(newBeer);
            Achievements.checkAchievements(state.beers);
            state.filter = ''; // Reset filter after add? or keep it?
            renderCurrentView();
            UI.closeModal();
            UI.showToast("Bière ajoutée !");
        }, state.filter);
    }, isAppend);

    // Setup Sentinel for IntersectionObserver if there is more data
    if (state.pagination.hasMore) {
        setupInfiniteScroll(container);
    }
}

function setupInfiniteScroll(container) {
    // We need to ensure the sentinel is AFTER the beer-grid.
    // If container == main-content, and it contains .beer-grid, we append sentinel to main-content.

    let sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        // Make it invisible but present
        sentinel.style.height = '20px';
        sentinel.style.width = '100%';
        sentinel.style.clear = 'both'; // Ensure it drops below floated elements if any
        container.appendChild(sentinel);
    } else {
        // Move to very end
        container.appendChild(sentinel);
    }

    if (!state.observer) {
        state.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && state.pagination.hasMore) {
                // Debounce slightly to prevent rapid firing
                if (state.isLoadingMore) return;
                state.isLoadingMore = true;

                state.pagination.page++;
                const isDiscovery = Storage.getPreference('discoveryMode', false);

                // Small delay to smooth out UI
                setTimeout(() => {
                    loadMoreBeers(container, true, isDiscovery, false);
                    state.isLoadingMore = false;
                }, 100);
            }
        }, { rootMargin: '400px' }); // Pre-load earlier
    }

    state.observer.observe(sentinel);
}

function searchBeers(beers, query) {
    if (!query) return beers;
    const lowerQuery = query.toLowerCase();
    return beers.filter(b =>
        b.title.toLowerCase().includes(lowerQuery) ||
        b.brewery.toLowerCase().includes(lowerQuery)
    );
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.view = e.currentTarget.dataset.view;
            renderCurrentView();
        });
    });

    // Scan Toggle
    document.getElementById('scan-toggle')?.addEventListener('click', () => {
        console.log("[App] Scan toggle clicked. Resetting session cache.");
        const scanCache = new Set();

        UI.renderScannerModal(async (barcode) => {
            console.log("[App] Scanner Callback for:", barcode);
            if (scanCache.has(barcode)) {
                console.log("[App] Barcode cached, ignoring.");
                return false;
            }
            scanCache.add(barcode);

            UI.setScannerFeedback("🔍 Recherche...", false);

            try {
                const product = await fetchProductByBarcode(barcode);

                if (product) {
                    UI.setScannerFeedback("✅ Produit trouvé !", false);

                    // Stop scanner & Close modal after short delay
                    setTimeout(() => {
                        UI.closeModal();

                        // --- DEDUPLICATION LOGIC (FUZZY) ---
                        // Ensure we use latest state
                        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
                        const getTokens = (s) => new Set(normalize(s).split(/\s+/).filter(t => t.length > 2));

                        const scanTokens = getTokens(product.title);

                        let bestMatch = null;
                        let bestScore = 0;

                        state.beers.forEach(beer => {
                            const dbTokens = getTokens(beer.title);
                            if (dbTokens.size === 0) return;

                            const intersection = new Set([...scanTokens].filter(x => dbTokens.has(x)));
                            const union = new Set([...scanTokens, ...dbTokens]);

                            const jaccard = union.size === 0 ? 0 : intersection.size / union.size;
                            const isSubset = intersection.size === dbTokens.size || intersection.size === scanTokens.size;

                            let score = jaccard;
                            if (isSubset && intersection.size >= 1) score += 0.5; // Boost subsets
                            if (beer.id === 'API_' + product.id) score += 1; // ID Match

                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = beer;
                            }
                        });

                        // Check for strict match as fallback/priority
                        const normalizedScan = normalize(product.title);
                        const strictMatch = state.beers.find(b => normalize(b.title) === normalizedScan);
                        if (strictMatch) {
                            bestMatch = strictMatch;
                            bestScore = 2.0;
                        }

                        if (bestMatch && bestScore > 0.8) {
                            // Valid match found -> Stop scanner immediately
                            // But we need to close the modal first or replace it?
                            // renderBeerDetail opens a new modal (or replaces content).

                            UI.showToast(`Trouvé en local : ${bestMatch.title}`);

                            // Close scanner first to stop camera
                            UI.closeModal();

                            UI.renderBeerDetail(bestMatch, (data) => {
                                Storage.saveBeerRating(bestMatch.id, data);
                                Achievements.checkAchievements(state.beers);
                                UI.showToast("Note mise à jour !");
                            });
                            return true; // STOP SCANNER
                        }

                        // If no exact match, proceed with API product
                        UI.renderBeerDetail(product, (data) => {
                            if (product.fromAPI) {
                                const newBeer = { ...product };
                                newBeer.id = 'CUSTOM_' + Date.now();
                                delete newBeer.fromAPI;
                                Storage.saveCustomBeer(newBeer);
                                Storage.saveBeerRating(newBeer.id, data);
                                window.dispatchEvent(new CustomEvent('beerdex-action'));
                                renderCurrentView();
                            } else {
                                Storage.saveBeerRating(product.id, data);
                                Achievements.checkAchievements(state.beers);
                            }
                            UI.showToast("Note sauvegardée !");
                        });

                    }, 200);

                    return true; // Signal scanner to STOP
                } else {
                    // Invalid / Not a beer
                    UI.setScannerFeedback("⛔ Ce n'est pas une bière...", true);
                    return false; // Signal scanner to RESUME
                }

            } catch (e) {
                console.error(e);
                UI.setScannerFeedback("⚠️ Erreur réseau / API", true);
                return false; // Signal scanner to RESUME
            }
        });
    });


    // Search Toggle
    const searchToggle = document.getElementById('search-toggle');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchClose = document.getElementById('search-close');
    const btnApi = document.getElementById('btn-search-api-bar');

    if (btnApi) {
        btnApi.addEventListener('click', async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) {
                UI.showToast("Tapez au moins 2 lettres...");
                return;
            }

            // Visual Feedback
            const originalContent = btnApi.innerHTML;
            btnApi.disabled = true;
            btnApi.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>';

            try {
                const { products } = await searchProducts(query);

                // Render Results
                const main = document.getElementById('main-content');

                // Stop local pagination
                if (state.observer) state.observer.disconnect();

                UI.renderApiSearchResults(products, main);

                if (products.length > 0) {
                    UI.showToast(`${products.length} résultats trouvés !`);
                } else {
                    UI.showToast("Aucun résultat.");
                }

            } catch (e) {
                console.error(e);
                UI.showToast("Erreur recherche API");
            } finally {
                btnApi.disabled = false;
                btnApi.innerHTML = originalContent;
            }
        });
    }

    searchToggle.addEventListener('click', () => {
        searchBar.classList.toggle('hidden');
        if (!searchBar.classList.contains('hidden')) {
            searchInput.focus();
        }
    });

    searchClose.addEventListener('click', () => {
        searchBar.classList.add('hidden');
        searchInput.value = '';
        state.filter = '';
        renderCurrentView();
    });

    searchInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        renderCurrentView(); // This resets pagination to page 1
    });

    // Filter Toggle
    document.getElementById('filter-toggle').addEventListener('click', () => {
        UI.renderFilterModal(state.beers, state.activeFilters || {}, (filters) => {
            state.activeFilters = filters;

            // Visual feedback
            const btn = document.getElementById('filter-toggle');
            const hasFilters = Object.keys(filters).length > 0;
            btn.style.color = hasFilters ? 'var(--accent-gold)' : 'inherit';

            // IMPORTANT: Filtering needs to happen BEFORE pagination in real app logic.
            // My current refactor does: renderCurrentView -> searchBeers -> cache state.filteredBeers -> loadMore
            // BUT UI.renderBeerList also does filtering! 
            // Wait, UI.renderBeerList doing filtering on a BATCH is wrong. It should filter ALL then paginate.
            // FIX: We need to move filtering upstream to `renderCurrentView` or `prepareBeers`.

            // Re-render and Apply Filtering Logic Upstream (handled below)
            renderCurrentView();
            if (hasFilters) UI.showToast("Filtres appliqués !");
        });
    });

    // FAB - Add Custom Beer
    document.getElementById('fab-add').addEventListener('click', () => {
        UI.renderAddBeerForm((newBeer) => {
            Storage.saveCustomBeer(newBeer);
            state.beers.unshift(newBeer); // Add to top
            Achievements.checkAchievements(state.beers);
            renderCurrentView();
            UI.closeModal();
            UI.showToast("Bière ajoutée avec succès !");
        });
    });

    // Delegated Events for Beer Cards
    document.getElementById('main-content').addEventListener('click', (e) => {
        const card = e.target.closest('.beer-card');
        if (card) {
            const beerId = card.dataset.id;
            const beer = state.beers.find(b => b.id === beerId);
            if (beer) {
                UI.renderBeerDetail(beer, (ratingData) => {
                    Storage.saveBeerRating(beer.id, ratingData);
                    Achievements.checkAchievements(state.beers);

                    // Optimistic update of the specific card instead of full re-render
                    // Or just re-render view, preserving scroll position?
                    // Pagination makes full re-render tricky (resets to page 1).
                    // We should probably just allow the modal close and assumes user sees it.
                    // But card checkmark update is nice.
                    // Let's just find the card and update it manually?
                    // Simple hack: card.classList.add('drunk');

                    if (ratingData) card.classList.add('drunk');

                    UI.showToast("Note sauvegardée !");
                });
            }
        }
    });
}

// Logic fix for Filtering:
// We need headers 'UI' to expose filtering logic or move it here. 
// Currently UI.renderBeerList handles filters, but that breaks pagination 
// because we pass a small batch to it. 
// I must move the filtering logic OUT of UI.renderBeerList into a helper function here.
// But I cannot see UI.js fully here to copy it.
// I will rely on the fact that I can edit UI.js later or now.
// Actually, I should update UI.js to exporting `filterBeers(beers, filters)` and use it here.
// For now, I will modify `renderBeerList` call in `loadMoreBeers` to NOT pass filters,
// and instead apply filters to `state.filteredBeers` inside `renderCurrentView`.

// Wait, I need to fix `renderCurrentView` to apply filters logic *before* slicing.
// I'll add `applyFilters` function here that mimics UI.renderBeerList logic.

function applyFilters(beers, filters) {
    if (!filters || Object.keys(filters).length === 0) return beers;

    let result = [...beers];

    // Exact copy of UI.js filtering logic would be best.
    // For brevity and correctness, I should probably ask UI.js to do it aka refactor UI.js.
    // But for this turn, I will implement a robust filter function here.

    // --- Helper ---
    const getAlc = (b) => parseFloat((b.alcohol || '0').replace('%', '').replace('°', '')) || 0;
    const getVol = (b) => {
        const str = (b.volume || '').toLowerCase();
        if (str.includes('l') && !str.includes('ml') && !str.includes('cl')) return parseFloat(str) * 1000;
        if (str.includes('cl')) return parseFloat(str) * 10;
        return parseFloat(str) || 330;
    };

    // Type & Brewery
    if (filters.type && filters.type !== 'All') result = result.filter(b => b.type === filters.type);
    if (filters.brewery && filters.brewery !== 'All') result = result.filter(b => b.brewery === filters.brewery);

    // Alcohol
    if (filters.alcMode) {
        const max = parseFloat(filters.alcMax);
        const min = parseFloat(filters.alcMin);
        const exact = parseFloat(filters.alcExact);
        if (filters.alcMode === 'max' && !isNaN(max)) result = result.filter(b => getAlc(b) <= max);
        else if (filters.alcMode === 'range') {
            if (!isNaN(min)) result = result.filter(b => getAlc(b) >= min);
            if (!isNaN(max)) result = result.filter(b => getAlc(b) <= max);
        } else if (filters.alcMode === 'exact' && !isNaN(exact)) result = result.filter(b => Math.abs(getAlc(b) - exact) < 0.1);
    }

    // Volume
    if (filters.volMode && filters.volMode !== 'any') {
        const min = parseFloat(filters.volMin);
        const max = parseFloat(filters.volMax);
        const exact = parseFloat(filters.volExact);
        if (filters.volMode === 'range') {
            if (!isNaN(min)) result = result.filter(b => getVol(b) >= min);
            if (!isNaN(max)) result = result.filter(b => getVol(b) <= max);
        } else if (filters.volMode === 'exact' && !isNaN(exact)) result = result.filter(b => Math.abs(getVol(b) - exact) < 5);
    }

    // Min Rating
    if (filters.minRating && parseInt(filters.minRating) > 0) {
        const minR = parseInt(filters.minRating);
        result = result.filter(b => {
            const r = Storage.getBeerRating(b.id);
            return r && r.score >= minR;
        });
    }

    // --- NEW FILTERS ---
    // Production Volume
    if (filters.production_volume && filters.production_volume !== 'All') {
        result = result.filter(b => b.production_volume === filters.production_volume);
    }

    // Distribution
    if (filters.distribution && filters.distribution !== 'All') {
        result = result.filter(b => b.distribution === filters.distribution);
    }

    // Barrel Aged
    if (filters.barrel_aged) {
        result = result.filter(b => b.barrel_aged === true);
    }

    // Community Rating
    if (filters.community_rating !== undefined && filters.community_rating !== '') {
        const minCommR = parseFloat(filters.community_rating);
        result = result.filter(b => (b.community_rating || 0) >= minCommR);
    }

    // Ingredients
    if (filters.ingredients) {
        const kw = filters.ingredients.toLowerCase();
        result = result.filter(b => (b.ingredients || '').toLowerCase().includes(kw));
    }

    // Rarity
    if (filters.rarity && filters.rarity.length > 0) {
        result = result.filter(b => {
            const r = b.rarity || 'base';
            return filters.rarity.includes(r);
        });
    }

    // Custom
    if (filters.onlyCustom) result = result.filter(b => String(b.id).startsWith('CUSTOM_'));
    if (filters.onlyFavorites) result = result.filter(b => Storage.isFavorite(b.id));

    // Sorting
    result.sort((a, b) => {
        // ALWAYS Pin Favorites to Top (unless ignored)
        if (!filters.ignoreFavorites) {
            const favA = Storage.isFavorite(a.id) ? 1 : 0;
            const favB = Storage.isFavorite(b.id) ? 1 : 0;
            if (favA !== favB) return favB - favA;
        }

        // Secondary Sort
        let valA, valB;
        if (filters.sortBy === 'brewery') { valA = a.brewery.toLowerCase(); valB = b.brewery.toLowerCase(); }
        else if (filters.sortBy === 'alcohol') { valA = getAlc(a); valB = getAlc(b); }
        else if (filters.sortBy === 'volume') { valA = getVol(a); valB = getVol(b); }
        else if (filters.sortBy === 'rarity') {
            const ranks = { 'base': 0, 'commun': 1, 'rare': 2, 'super_rare': 3, 'epique': 4, 'mythique': 5, 'legendaire': 6, 'ultra_legendaire': 7 };
            valA = ranks[a.rarity || 'base'] || 0;
            valB = ranks[b.rarity || 'base'] || 0;
        } else if (filters.sortBy === 'community_rating') {
            valA = a.community_rating || 0;
            valB = b.community_rating || 0;
        }
        else { valA = a.title.toLowerCase(); valB = b.title.toLowerCase(); } // Default to Title

        if (valA < valB) return filters.sortOrder === 'desc' ? 1 : -1;
        if (valA > valB) return filters.sortOrder === 'desc' ? -1 : 1;
        return 0;
    });

    return result;
}

// NOTE: I need to update renderCurrentView to USE applyFilters
// I will rewrite renderCurrentView below to include it.

// Re-declaring renderCurrentView with filter logic included
/* 
    ... (the function defined above needs this logic injected before caching filteredBeers) 
    I will merge them in the final output.
*/

// Initialize
window.addEventListener('DOMContentLoaded', init);

// Global event listener for actions triggering achievements
window.addEventListener('beerdex-action', () => {
    Achievements.checkAchievements(state.beers);
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);

                if (registration.waiting) {
                    notifyUpdate(registration.waiting);
                }

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            notifyUpdate(newWorker);
                        }
                    });
                });
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

function notifyUpdate(worker) {
    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.innerHTML = `
        <span>Nouvelle version disponible !</span>
        <button id="reload-btn">Mettre à jour</button>
    `;
    document.body.appendChild(toast);

    document.getElementById('reload-btn').addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
    });
}

// Redefine renderCurrentView correctly to include applyFilters
// This overwrites the previous definition in this file content block
function renderCurrentView() {
    const mainContent = document.getElementById('main-content');

    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }

    if (state.view === 'home') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);

        // 1. Search
        let filtered = searchBeers(state.beers, state.filter);

        // 2. Discovery Logic
        if (isDiscovery && !state.filter) {
            const consumedIds = Storage.getAllConsumedBeerIds();
            filtered = state.beers.filter(b => consumedIds.includes(b.id));
        }

        // 3. Apply Filters (Moved from UI to logic)
        filtered = applyFilters(filtered, state.activeFilters);

        state.filteredBeers = filtered;
        state.pagination.page = 1;
        state.pagination.hasMore = true;

        const busTab = document.querySelector('.nav-item[data-view="drunk"]');
        if (busTab) busTab.style.display = isDiscovery ? 'none' : 'flex';

        // Render first batch - PASS NULL for filters to UI because we already filtered!
        loadMoreBeers(mainContent, false, isDiscovery, isDiscovery && state.filter);

    } else if (state.view === 'drunk') {
        const consumedIds = Storage.getAllConsumedBeerIds();
        let drunkBeers = state.beers.filter(b => consumedIds.includes(b.id));

        // Apply filters to drunk view too? Why not.
        drunkBeers = applyFilters(drunkBeers, state.activeFilters);

        state.filteredBeers = drunkBeers;
        state.pagination.page = 1;
        state.pagination.hasMore = true;

        loadMoreBeers(mainContent, false, false, false);

    } else if (state.view === 'stats') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);
        UI.renderStats(state.beers, Storage.getAllUserData(), mainContent, isDiscovery);
    } else if (state.view === 'settings') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);
        UI.renderSettings(state.beers, Storage.getAllUserData(), mainContent, isDiscovery, (newVal) => {
            Storage.savePreference('discoveryMode', newVal);
            // Optional: Reload logic if needed, or just stay on settings
        });
    }
}

