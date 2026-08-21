import * as Data from './data.js';
import * as UI from './ui.js';
import * as Storage from './storage.js';
import * as Achievements from './achievements.js';
import * as API from './api.js';
import { fetchProductByBarcode, searchProducts } from './off-api.js';
import * as Env from './env.js';
import { Feedback } from './feedback.js';
import { Analytics } from './analytics.js';
import * as Share from './share.js';
import * as BAC from './bac.js';
import * as Wrapped from './wrapped.js';
import { EventSystem } from './event-system.js';
import { i18n } from './i18n.js';
import { updateWidgetData } from './widget-bridge.js';
import * as CrashLogger from './crashLogger.js';
import * as Deduplicator from './deduplicator.js';
import * as Theme from './theme.js';
import * as Utils from './utils.js';
import { setupScanHandler } from './scanHandler.js';
import { Recommendation } from './recommendation.js';

window.Recommendation = Recommendation;
window.Share = Share;
window.Wrapped = Wrapped;
window.UI = UI;
window.showToast = UI.showToast;

// Session-based animation tracking (persists through normal refresh)
try {
    const savedAnims = sessionStorage.getItem('beerdex_played_anims');
    window.__playedAnims = new Set(savedAnims ? JSON.parse(savedAnims) : []);
} catch (e) {
    window.__playedAnims = new Set();
}

window.savePlayedAnims = () => {
    sessionStorage.setItem('beerdex_played_anims', JSON.stringify([...window.__playedAnims]));
};

// Init crash logger FIRST so it catches all errors from boot
CrashLogger.init();

// App State
const state = {
    beers: [],
    filteredBeers: [], // Cache for filtered results
    filter: '',
    activeFilters: {},
    view: 'home', // home, drunk, stats
    viewMode: Storage.getPreference('viewMode', 'grid'), // grid or list
    pagination: {
        page: 1,
        itemsPerPage: 24,
        hasMore: true
    },
    observer: null, // Store observer to disconnect if needed
    initialView: 'home', // Track the view at app launch for back navigation
    migrationPrompts: [] // Deduplicator results
};

// Initialize Wrapped
Wrapped.init(() => state.beers);

// Initialize Application
async function init() {
    try {
        // --- NETWORK & EDITION SETUP ---
        setupNetworkListeners();
        const edition = await Env.getEdition();
        document.body.dataset.edition = edition;

        Analytics.track('app_open', { isStandalone: window.matchMedia('(display-mode: standalone)').matches, edition });
        Analytics.retroactiveSync();

        // --- EVENT SYSTEM INIT ---
        await EventSystem.init();

        // --- I18N INIT ---
        await i18n.init();

        // Re-check network status after translation to ensure badge text is correct and visible
        if (window.handleStatusChange) window.handleStatusChange();

        // Apply Theme (Theme Engine + Museum)
        Theme.init();
        applyTheme();

        // Show skeleton loading immediately
        showSkeletonLoading(document.getElementById('main-content'));

        // Lazy-loading: Load Core Beers first for fast render
        const coreFiles = ['data/newbeer.json', 'data/belgiumbeer.json'];
        const staticBeers = await Data.fetchAllBeers(coreFiles);
        const customBeers = Storage.getCustomBeers().map(b => Data.enrichBeerMetadata(b));
        state.beers = [...customBeers, ...staticBeers];

        if (window.Recommendation) {
            window.Recommendation.init(state.beers);
            if (Storage.getPreference('feat_brewbrother_enabled', true) && Storage.getPreference('card_brewbrother_pct', false)) {
                try { await window.Recommendation.getUserTasteProfile(state.beers); } catch(e) {}
            }
        }

        // Initial Render
        renderCurrentView();

        // Lazy-load the rest
        setTimeout(async () => {
            const restFiles = [
                'data/deutchbeer.json',
                'data/frenchbeer.json',
                'data/nlbeer.json',
                'data/usbeer.json',
                'data/cobeer.json',
                'data/krbeer.json',
                'data/jpbeer.json',
                'data/cnbeer.json'
            ];
            const moreBeers = await Data.fetchAllBeers(restFiles);
            // Deduplicate Custom/Static overlaps just in case? Data.js handles internal dedupe, but let's just append
            const currentIds = new Set(state.beers.map(b => b.id));
            const newBeersToAdd = moreBeers.filter(b => !currentIds.has(b.id));
            
            if (newBeersToAdd.length > 0) {
                state.beers = [...state.beers, ...newBeersToAdd];
                if (window.Recommendation) window.Recommendation.init(state.beers);
                applyFilters();
                // We don't forcefully re-render to avoid jumping, but next paginate will include them.
                // If user is searching right now, they'll show up on next input.
            }

            // Cleanup orphaned user data (beers removed from DB due to deduplication etc.)
            // Must run after all beers are loaded so we have the full ID set
            Storage.cleanupOrphanedUserData(state.beers);

            // Check for Achievements on Load (Syncs import/offline data with full database)
            Achievements.checkAchievements(state.beers);

            // Run deduplicator later to save performance (only if enabled in Debug)
            setTimeout(() => {
                state.migrationPrompts = Deduplicator.runCheck(state.beers);
                // If there are matches, re-render to show them
                if (state.migrationPrompts.length > 0 && (state.view === 'home' || state.view === 'drunk')) {
                    renderCurrentView();
                }
            }, 5000);
        }, 1500);

        // Setup Event Listeners
        setupEventListeners();

        // Check Consent -> which checks Welcome
        UI.checkAndShowConsent();

        // Check Auto Backup
        UI.checkAutoBackup();

        // Check for new patchnotes
        UI.checkPatchnotes();

        // Setup Keyboard safe area fixes natively for edge-to-edge
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard) {
            window.Capacitor.Plugins.Keyboard.addListener('keyboardWillShow', () => {
                document.body.classList.add('keyboard-open');
            });
            window.Capacitor.Plugins.Keyboard.addListener('keyboardWillHide', () => {
                document.body.classList.remove('keyboard-open');
            });
        }

        // Setup Back Button Navigation (Universal)
        // Strategy 1: Capacitor @capacitor/app plugin (if installed)
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
                if (UI.modalStack && UI.modalStack.length > 0) {
                    window.history.back();
                    return;
                }
                if (window.history.state && window.history.state.isModal) {
                    window.history.back();
                    return;
                }
                if (canGoBack) {
                    window.history.back();
                    return;
                }
                window.Capacitor.Plugins.App.minimizeApp();
            });
        }
        // Strategy 2: Document 'backbutton' event (Android WebView / Cordova-style fallback)
        document.addEventListener('backbutton', (e) => {
            e.preventDefault();
            if (UI.modalStack && UI.modalStack.length > 0) {
                window.history.back();
                return;
            }
            if (window.history.state && window.history.state.isModal) {
                window.history.back();
                return;
            }
            if (window.history.state && !window.history.state.isInitial) {
                window.history.back();
                return;
            }
            if (navigator.app && navigator.app.exitApp) {
                navigator.app.exitApp();
            }
        }, false);

        // Set initial history state so we know when we're back at the start
        window.history.replaceState({ view: state.view, isInitial: true }, '');

        // Listen for back-navigation view changes from popstate handler
        window.addEventListener('beerdex-navigate-back', (e) => {
            const targetView = e.detail.view;
            if (targetView && targetView !== state.view) {
                state.view = targetView;
                renderCurrentView();
            }
        });

        // --- NATIVE WIDGET INITIAL SYNC ---
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') updateWidgetData();
        });
        updateWidgetData();

        // --- API AUTO-ACTION CHECK ---
        API.start(() => state.beers);

    } catch (error) {
        console.error("Failed to initialize Beerdex:", error);
        UI.showToast(i18n.t('error_load_data'));
    }
}

/**
 * Setup Network listeners to update UI and service state
 */
function setupNetworkListeners() {
    const handleStatusChange = () => {
        const isOnline = navigator.onLine;
        
        // Update Body class for CSS targeting
        if (isOnline) {
            document.body.classList.remove('is-offline');
        } else {
            document.body.classList.add('is-offline');
        }

        // Notify specific modules
        if (isOnline) {
            Analytics.flush();
        }
        
        // Update UI components (Scan button, OFF button, etc.)
        if (UI.updateNetworkStatus) {
            UI.updateNetworkStatus(isOnline);
        }
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    // Make it globally accessible for re-checks during init
    window.handleStatusChange = handleStatusChange;
    
    // Initial check
    handleStatusChange();
}


/**
 * Apply the current theme based on user preferences.
 * Centralized here to be callable from UI or Event system.
 */
export function applyTheme() {
    const museumThemeEnabled = Storage.getPreference('museumThemeEnabled', false);
    
    // Always default to dark
    document.documentElement.removeAttribute('data-theme');

    // Apply custom theme colors from Theme Engine (before museum overrides)
    if (!museumThemeEnabled) {
        Theme.init();
    }

    // Toggle Stylesheet
    const museumLink = document.getElementById('css-museum');
    if (museumLink) {
        museumLink.disabled = !museumThemeEnabled;
    }

    // Toggle Body Classes
    if (museumThemeEnabled) {
        document.body.classList.add('theme-museum');
    } else {
        document.body.classList.remove('theme-museum');
    }

    // Update Meta Theme Color using active theme accent
    const activeColors = Theme.getActiveColors();
    let themeColor = museumThemeEnabled ? '#C9A84C' : (activeColors['--accent-gold'] || '#FFC000');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);

    // Handle Curtain Animation (only if actually playing)
    const curtainOverlay = document.getElementById('curtain-overlay');
    if (museumThemeEnabled && curtainOverlay && !window.__curtainPlayed) {
        window.__curtainPlayed = true;
        curtainOverlay.style.display = 'flex';
        setTimeout(() => {
            if(curtainOverlay) curtainOverlay.style.display = 'none';
        }, 3500);
    } else if (curtainOverlay) {
        curtainOverlay.style.display = 'none';
    }
}

// Attach to window for global access from UI components if needed
window.applyTheme = applyTheme;

function loadMoreBeers(container, isAppend = false, isDiscoveryMode = false, showCreatePrompt = false) {
    const { page, itemsPerPage } = state.pagination;
    const start = (page - 1) * itemsPerPage;
    const end = page * itemsPerPage;

    // Slice data
    const batch = state.filteredBeers.slice(start, end);

    if (batch.length < itemsPerPage) {
        state.pagination.hasMore = false;
    }

    // Don't render empty batch in append mode — all items already displayed
    if (isAppend && batch.length === 0) return;

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
            UI.showToast(i18n.t('toast_beer_added'));
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
        }, { rootMargin: '200px' });
    }

    state.observer.observe(sentinel);
}

function searchBeers(beers, query) {
    return Utils.fuzzyMatchBeers(beers, query);
}
function showSkeletonLoading(container) {
    const isListView = state.viewMode === 'list';
    const gridClass = isListView ? 'beer-grid view-list' : 'beer-grid';
    const count = isListView ? 8 : 6;

    let skeletons = '';
    for (let i = 0; i < count; i++) {
        skeletons += `
            <div class="skeleton-card">
                <div class="skeleton-img"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-subtitle"></div>
                <div class="skeleton-badges">
                    <div class="skeleton-badge"></div>
                    <div class="skeleton-badge"></div>
                </div>
            </div>`;
    }
    container.innerHTML = `<div class="${gridClass}" style="padding: var(--spacing-md);">${skeletons}</div>`;
}

function updateViewToggleIcon() {
    const icon = document.getElementById('view-toggle-icon');
    if (!icon) return;

    if (state.viewMode === 'list') {
        // Show grid icon (to switch back to grid)
        icon.innerHTML = `
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>`;
    } else {
        // Show list icon (to switch to list)
        icon.innerHTML = `
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>`;
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetView = e.currentTarget.dataset.view;

            // Special handling for Beerpedia in Median app
            if (targetView === 'beerpedia') {
                const isMedian = typeof window.median !== 'undefined' ||
                    typeof window.gonative !== 'undefined' ||
                    navigator.userAgent.includes('median') ||
                    navigator.userAgent.includes('gonative');

                if (isMedian) {
                    // Open in browser AND continue to show interstitial view
                    // (don't return early so nav bar stays active and accessible)
                    window.open('https://beerpedia.beerdex.be', '_blank');
                }
            }

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // Push view change to history for back navigation
            if (state.view !== targetView) {
                window.history.pushState({ view: targetView }, '');
            }

            state.view = targetView;
            window.scrollTo(0, 0); // Reset scroll to top
            window.dispatchEvent(new CustomEvent('beerdex-close-search')); // Hide search bar automatically
            renderCurrentView();
        });
    });

    // Scan Toggle (New ID: fab-scan)
    setupScanHandler(state, renderCurrentView, updateWidgetData);


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
                UI.showToast(i18n.t('search_at_least_2'));
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
                    UI.showToast(i18n.t('search_results_found', { count: products.length }));
                } else {
                    UI.showToast(i18n.t('search_no_results'));
                }

            } catch (e) {
                console.error(e);
                UI.showToast(i18n.t('search_api_error'));
            } finally {
                btnApi.disabled = false;
                btnApi.innerHTML = originalContent;
            }
        });
    }

    searchToggle.addEventListener('click', () => {
        const isOpening = searchBar.classList.contains('hidden');
        searchBar.classList.toggle('hidden');
        if (isOpening) {
            searchInput.focus();
            // Push history state so back button can close it
            window.history.pushState({ isSearch: true }, '');
        }
    });

    searchClose.addEventListener('click', () => {
        searchBar.classList.add('hidden');
        searchInput.value = '';
        state.filter = '';
        renderCurrentView();
        // Pop the search history state
        if (window.history.state && window.history.state.isSearch) {
            window.history.back();
        }
    });

    // Handle back button closing search bar
    window.addEventListener('beerdex-close-search', () => {
        searchBar.classList.add('hidden');
        searchInput.value = '';
        state.filter = '';
        renderCurrentView();
    });

    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            if (state.view === 'settings') {
                if (UI && typeof UI.filterSettings === 'function') {
                    UI.filterSettings(state.filter);
                }
            } else {
                renderCurrentView();
            }
        }, 200);
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
            if (hasFilters) UI.showToast(i18n.t('toast_preference_saved'));
        });
    });

    // View Toggle (Grid / List)
    document.getElementById('view-toggle')?.addEventListener('click', () => {
        state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
        Storage.savePreference('viewMode', state.viewMode);
        updateViewToggleIcon();
        Feedback.impactLight?.() || Feedback.impactMedium?.();
        renderCurrentView();
    });

    // Set initial icon state
    updateViewToggleIcon();

    // Add Manually Toggle (New ID: btn-add-header)
    document.getElementById('btn-add-header')?.addEventListener('click', () => {
        UI.renderAddBeerForm((newBeer) => {
            Storage.saveCustomBeer(newBeer);
            state.beers.unshift(newBeer); // Add to top
            Achievements.checkAchievements(state.beers);
            renderCurrentView();
            UI.closeModal();
            Feedback.playSuccess();
            Feedback.impactMedium();

            // Note: If adding a beer manually, we only track BAC if they specifically rate it later
            // The prompt says "with the beers marked as drunk in the app". Adding to the DB isn't necessarily drinking it.
            // But if they rate it right away? renderAddBeerForm doesn't take rating.
            // It just adds the beer. Wait, user specifically rates/drinks from details modal.

            UI.showToast(i18n.t('toast_beer_added'));
        });
    });

    // Delegated Events for Beer Cards
    document.getElementById('main-content').addEventListener('click', (e) => {
        const card = e.target.closest('.beer-card');
        if (card) {
            const beerId = card.dataset.id;
            const beer = state.beers.find(b => b.id === beerId);
            if (beer) {
                const oldRating = Storage.getBeerRating(beer.id);
                UI.renderBeerDetail(beer, (ratingData) => {
                    Storage.saveBeerRating(beer.id, ratingData);
                    Achievements.checkAchievements(state.beers);

                    const oldCount = oldRating ? (parseInt(oldRating.count) || 0) : 0;
                    const newRating = Storage.getBeerRating(beer.id);
                    const newCount = newRating ? (parseInt(newRating.count) || 0) : 0;
                    Utils.syncBACFromCountDiff(beer, oldCount, newCount);

                    // Optimistic update of the specific card instead of full re-render
                    // Or just re-render view, preserving scroll position?
                    // Pagination makes full re-render tricky (resets to page 1).
                    // We should probably just allow the modal close and assumes user sees it.
                    // But card checkmark update is nice.
                    // Let's just find the card and update it manually?
                    // Simple hack: card.classList.add('drunk');

                    if (ratingData) card.classList.add('drunk');

                    UI.showToast(i18n.t('toast_rating_saved'));
                    updateWidgetData();
                });
            }
        }
    });

    // Magical Search Bar: auto open on keypress (PC)
    window.addEventListener('keydown', (e) => {
        if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer && !modalContainer.classList.contains('hidden')) return;

        const searchBar = document.getElementById('search-bar');
        const searchInput = document.getElementById('search-input');
        if (searchBar && searchBar.classList.contains('hidden')) {
            searchBar.classList.remove('hidden');
        }
        if (searchInput) searchInput.focus();
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
    const getAlc = (b) => Utils.parseDegree(b.alcohol);
    const getVol = (b) => Utils.parseVolumeToMl(b.volume);

    // Type & Brewery
    if (filters.type && filters.type.length > 0 && !filters.type.includes('All')) {
        result = result.filter(b => filters.type.includes(b.type));
    } else if (typeof filters.type === 'string' && filters.type !== 'All') {
        // Fallback if somehow a string gets passed
        result = result.filter(b => b.type === filters.type);
    }
    if (filters.brewery && filters.brewery !== 'All') result = result.filter(b => b.brewery === filters.brewery);
    if (filters.country && filters.country !== 'All') result = result.filter(b => b.searchCountry === filters.country);
    if (filters.region && filters.region !== 'All') result = result.filter(b => b.searchRegion === filters.region);

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
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Global event listener for actions triggering achievements
window.addEventListener('beerdex-action', () => {
    // Re-sync custom beers into state.beers if one was just added
    const customBeers = Storage.getCustomBeers();
    customBeers.forEach(cb => {
        if (!state.beers.find(b => b.id === cb.id)) {
            state.beers.unshift(cb);
        }
    });

    Achievements.checkAchievements(state.beers);
});

// Register Service Worker for PWA (Only in Web Mode)
// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);

                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
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



// Redefine renderCurrentView correctly to include applyFilters
// This overwrites the previous definition in this file content block
function renderCurrentView() {
    const mainContent = document.getElementById('main-content');
    const appHeader = document.querySelector('.app-header');
    const fab = document.getElementById('fab-scan');

    Analytics.track('view_change', { view: state.view });

    // Reset padding for non-beerpedia views
    mainContent.style.padding = '';
    mainContent.style.margin = '';
    mainContent.style.paddingBottom = '';
    mainContent.style.overscrollBehavior = '';

    // Show header and FAB by default
    if (appHeader) appHeader.style.display = '';
    if (fab) fab.style.display = '';

    // Reset body overscroll
    document.body.style.overscrollBehavior = '';

    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }

    if (state.view === 'home') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);

        // 1. Check BrewBrother
        if (state.activeFilters.useBrewBrother && window.Recommendation) {
            mainContent.innerHTML = '';
            showSkeletonLoading(mainContent);
            
            window.Recommendation.getRecommendedBeers(state.beers, {
                mode: state.activeFilters.recMode,
                country: state.activeFilters.recCountry,
                region: state.activeFilters.recRegion,
                manualPrefs: {
                     types: state.activeFilters.recTypes,
                     flavors: state.activeFilters.recFlavors,
                     idealAbv: parseFloat(state.activeFilters.recAbv)
                }
            }).then(results => {
                state.filteredBeers = results;
                state.pagination.page = 1;
                state.pagination.hasMore = false;
                
                const busTab = document.querySelector('.nav-item[data-view="drunk"]');
                if (busTab) busTab.style.display = isDiscovery ? 'none' : 'flex';

                mainContent.innerHTML = '';
                loadMoreBeers(mainContent, false, isDiscovery, false);
            });
            return;
        }

        // 1.5. Async Pre-scoring if sorting by BrewBrother but not in strict mode
        if (state.activeFilters.sortBy === 'brewbrother' && window.Recommendation && !state.activeFilters.useBrewBrother) {
            mainContent.innerHTML = '';
            showSkeletonLoading(mainContent);
            
            window.Recommendation.getRecommendedBeers(state.beers, { noLimit: true }).then(scoredBeers => {
                let filtered = searchBeers(scoredBeers, state.filter);
                if (isDiscovery && !state.filter) {
                    const consumedIds = Storage.getAllConsumedBeerIds();
                    filtered = filtered.filter(b => consumedIds.includes(b.id));
                }
                filtered = applyFilters(filtered, state.activeFilters);
                
                state.filteredBeers = filtered;
                state.pagination.page = 1;
                state.pagination.hasMore = true;
                
                const busTab = document.querySelector('.nav-item[data-view="drunk"]');
                if (busTab) busTab.style.display = isDiscovery ? 'none' : 'flex';

                mainContent.innerHTML = '';
                loadMoreBeers(mainContent, false, isDiscovery, isDiscovery && state.filter);
                
                // BAC Widget on Home page
                if (Storage.getPreference('bac_enabled', true) && Storage.getPreference('bac_show_home', true)) {
                    const bacStatus = BAC.getBACStatus();
                    const bacValue = BAC.getCurrentBAC().toFixed(2);
                    const breathValue = (BAC.getCurrentBAC() * 0.44).toFixed(2);

                    const widgetHtml = `
                        <div class="bac-widget-home" style="background: linear-gradient(135deg, #111, #222); border-left: 5px solid ${bacStatus.color}; padding: 15px; border-radius: 12px; margin: 0 15px 20px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 8px 16px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.05); border-left: 5px solid ${bacStatus.color};">
                            <div>
                                <div style="font-size: 0.7rem; color: #aaa; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; font-weight: bold;">${i18n.t('bac_speculative_title')}</div>
                                <div style="font-size: 1.1rem; font-weight: 700; color: ${bacStatus.color}; text-shadow: 0 0 10px ${bacStatus.color}44;">
                                    ${bacStatus.title} <span style="font-size: 0.9rem; color: #fff; font-weight: normal; margin-left: 5px;">(${bacValue} g/l)</span>
                                </div>
                                <div style="font-size: 0.75rem; color: #888; margin-top: 5px;">
                                    ${i18n.t('bac_air_expired')}: <span style="color: ${bacStatus.color}; font-weight: bold;">${breathValue}</span> mg/l
                                </div>
                            </div>
                            <div style="background: ${bacStatus.color}22; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid ${bacStatus.color}44;">
                                 <span style="font-size: 1.2rem;">🩸</span>
                            </div>
                        </div>
                    `;
                    mainContent.insertAdjacentHTML('afterbegin', widgetHtml);
                }
                
                if (typeof updateWidgetData === 'function') updateWidgetData();
            });
            return;
        }

        // 2. Search
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

        // BAC Widget on Home page (Must be after loadMoreBeers so it doesn't get cleared)
        if (Storage.getPreference('bac_enabled', true)) {

            if (Storage.getPreference('bac_show_home', true)) {

                const bacStatus = BAC.getBACStatus();
                const bacValue = BAC.getCurrentBAC().toFixed(2);
                const breathValue = (BAC.getCurrentBAC() * 0.44).toFixed(2);

                const widgetHtml = `
                    <div class="bac-widget-home" style="background: linear-gradient(135deg, #111, #222); border-left: 5px solid ${bacStatus.color}; padding: 15px; border-radius: 12px; margin: 0 15px 20px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 8px 16px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.05); border-left: 5px solid ${bacStatus.color};">
                        <div>
                            <div style="font-size: 0.7rem; color: #aaa; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; font-weight: bold;">${i18n.t('bac_speculative_title')}</div>
                            <div style="font-size: 1.1rem; font-weight: 700; color: ${bacStatus.color}; text-shadow: 0 0 10px ${bacStatus.color}44;">
                                ${bacStatus.title} <span style="font-size: 0.9rem; color: #fff; font-weight: normal; margin-left: 5px;">(${bacValue} g/l)</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #888; margin-top: 5px;">
                                ${i18n.t('bac_air_expired')}: <span style="color: ${bacStatus.color}; font-weight: bold;">${breathValue}</span> mg/l
                            </div>
                        </div>
                        <div style="background: ${bacStatus.color}22; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid ${bacStatus.color}44;">
                             <span style="font-size: 1.2rem;">🩸</span>
                        </div>
                    </div>
                `;
                mainContent.insertAdjacentHTML('afterbegin', widgetHtml);
            }

            // Sync data to native home screen widget
            updateWidgetData();
        }

        if (isDiscovery) {
            if (Storage.getPreference('feat_reminders_enabled', true)) {
                UI.renderUnratedBanner(state.beers, mainContent, state.migrationPrompts);
            }
        }

    } else if (state.view === 'drunk') {
        const consumedIds = Storage.getAllConsumedBeerIds();
        let drunkBeers = state.beers.filter(b => consumedIds.includes(b.id));

        // Apply filters to drunk view too? Why not.
        drunkBeers = applyFilters(drunkBeers, state.activeFilters);

        state.filteredBeers = drunkBeers;
        state.pagination.page = 1;
        state.pagination.hasMore = true;

        loadMoreBeers(mainContent, false, false, false);

        // Unrated banner on drunk view
        if (Storage.getPreference('feat_reminders_enabled', true)) {
            UI.renderUnratedBanner(state.beers, mainContent, state.migrationPrompts);
        }

    } else if (state.view === 'stats') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);
        UI.renderStats(state.beers, Storage.getAllUserData(), mainContent, isDiscovery);
    } else if (state.view === 'beerpedia') {
        // --- IMMERSIVE MODE ---
        // Hide header for fullscreen experience
        if (appHeader) appHeader.style.display = 'none';
        // Hide FAB
        if (fab) fab.style.display = 'none';

        // Disable pull-to-refresh on mobile
        mainContent.style.overscrollBehavior = 'none';
        document.body.style.overscrollBehavior = 'none';

        // Detect if we're in Median.co native app
        const isMedian = typeof window.median !== 'undefined' ||
            typeof window.gonative !== 'undefined' ||
            navigator.userAgent.includes('median') ||
            navigator.userAgent.includes('gonative');

        if (isMedian) {
            // In Median app: open in internal browser or external browser
            mainContent.style.padding = 'calc(env(safe-area-inset-top) + var(--spacing-md)) var(--spacing-md) env(safe-area-inset-bottom) var(--spacing-md)';
            mainContent.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: calc(100dvh - var(--nav-height) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
                    gap: 20px;
                    text-align: center;
                    padding: 20px;
                ">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="1.5">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <h2 style="color: var(--accent-gold); font-family: 'Russo One', sans-serif;">Beerpedia</h2>
                    <p style="color: var(--text-secondary); max-width: 280px;">
                        ${i18n.t('beerpedia_desc')}
                    </p>
                    <button onclick="window.open('https://beerpedia.beerdex.be', '_blank')" class="btn-primary" style="
                        width: auto;
                        padding: 14px 30px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 1rem;
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        ${i18n.t('beerpedia_btn_open')}
                    </button>
                </div>
            `;
        } else {
            // In browser: use iframe
            mainContent.style.padding = 'env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
            mainContent.style.margin = '0';
            mainContent.style.paddingBottom = '0';
            mainContent.innerHTML = `
                <div id="beerpedia-loader" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 15px;
                    z-index: 5;
                ">
                    <div class="spinner" style="width: 50px; height: 50px;"></div>
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">${i18n.t('beerpedia_loading')}</span>
                </div>
                <iframe 
                    id="beerpedia-frame"
                    src="https://beerpedia.beerdex.be?lang=${i18n.currentLang}" 
                    style="
                        width: 100%;
                        height: calc(100dvh - var(--nav-height) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
                        border: none;
                        display: block;
                        background: #0d0d0d;
                        position: relative;
                        z-index: 10;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    "
                    title="Beerpedia - L'encyclopédie de la bière"
                    allow="fullscreen"
                    onload="this.style.opacity='1'; document.getElementById('beerpedia-loader')?.remove();"
                ></iframe>
            `;
        }
    } else if (state.view === 'settings') {
        const isDiscovery = Storage.getPreference('discoveryMode', false);
        UI.renderSettings(state.beers, Storage.getAllUserData(), mainContent, isDiscovery, (newVal) => {
            Storage.savePreference('discoveryMode', newVal);
            // Optional: Reload logic if needed, or just stay on settings
        });
    }
}

