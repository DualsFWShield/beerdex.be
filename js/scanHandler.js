import * as UI from './ui.js';
import * as Storage from './storage.js';
import * as Achievements from './achievements.js';
import * as BAC from './bac.js';
import * as Utils from './utils.js';
import { i18n } from './i18n.js';
import { fetchProductByBarcode } from './off-api.js';

export function setupScanHandler(state, renderCurrentView, updateWidgetData) {
    document.getElementById('fab-scan')?.addEventListener('click', () => {
        console.log("[App] Scan toggle clicked. Resetting session cache.");
        const scanCache = new Set();
        let consecutiveFailures = 0;

        UI.renderScannerModal(async (barcode) => {
            console.log("[App] Scanner Callback for:", barcode);
            if (scanCache.has(barcode)) {
                console.log("[App] Barcode cached, ignoring.");
                return 0; // Resume immediately if already cached
            }
            UI.setScannerFeedback(i18n.t('scanner_feedback_searching', "🔍 Recherche..."), false);

            try {
                // --- LOCAL BARCODE LOOKUP (offline-first) ---
                const localMatch = state.beers.find(b => b.barcode && b.barcode === barcode);
                if (localMatch) {
                    consecutiveFailures = 0;
                    scanCache.add(barcode);
                    UI.showToast(i18n.t('toast_found_local', { title: localMatch.title }));
                    UI.closeModal();
                    UI.renderBeerDetail(localMatch, (data) => {
                        const oldRating = Storage.getBeerRating(localMatch.id);
                        Storage.saveBeerRating(localMatch.id, data);
                        Achievements.checkAchievements(state.beers);
                        const oldCount = oldRating ? (parseInt(oldRating.count) || 0) : 0;
                        const newCount = Storage.getBeerRating(localMatch.id)?.count || 0;
                        Utils.syncBACFromCountDiff(localMatch, oldCount, newCount);
                        UI.showToast(i18n.t('toast_rating_updated'));
                        if(updateWidgetData) updateWidgetData();
                    });
                    return 5000;
                }

                // --- ONLINE API LOOKUP (fallback) ---
                const result = await fetchProductByBarcode(barcode);
                const { status, product } = result || { status: 'error' };

                if (status === 'success' && product) {
                    consecutiveFailures = 0;
                    scanCache.add(barcode);
                    UI.setScannerFeedback(i18n.t('scanner_found'), false);

                    // --- DEDUPLICATION LOGIC (FUZZY) ---
                    // Using our improved fuzzy match or a similar token logic
                    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
                    const getTokens = (s) => new Set(normalize(s).split(/\s+/).filter(t => t.length > 2));

                    const scanTokens = getTokens(product.title);
                    const scanBreweryTokens = product.brewery ? getTokens(product.brewery) : new Set();

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
                        if (isSubset && intersection.size >= 1) score += 0.5;
                        if (beer.id === 'API_' + product.id) score += 1;

                        if (beer.brewery && scanBreweryTokens.size > 0) {
                            const dbBreweryTokens = getTokens(beer.brewery);
                            const breweryInter = new Set([...scanBreweryTokens].filter(x => dbBreweryTokens.has(x)));
                            if (breweryInter.size > 0) score += 0.3;
                        }

                        if (score > bestScore || (score === bestScore && bestMatch && (String(bestMatch.id).startsWith('API_') || String(bestMatch.id).startsWith('CUSTOM_')))) {
                            bestScore = score;
                            bestMatch = beer;
                        }
                    });

                    const normalizedScan = normalize(product.title);
                    const strictMatch = state.beers.find(b => normalize(b.title) === normalizedScan);
                    if (strictMatch) {
                        bestMatch = strictMatch;
                        bestScore = 2.0;
                    }

                    if (bestMatch && bestScore > 0.8) {
                        UI.showToast(i18n.t('toast_found_local', { title: bestMatch.title }));
                        UI.closeModal();
                        UI.renderBeerDetail(bestMatch, (data) => {
                            const oldRating = Storage.getBeerRating(bestMatch.id);
                            Storage.saveBeerRating(bestMatch.id, data);
                            Achievements.checkAchievements(state.beers);
                            const oldCount = oldRating ? (parseInt(oldRating.count) || 0) : 0;
                            const newCount = Storage.getBeerRating(bestMatch.id)?.count || 0;
                            Utils.syncBACFromCountDiff(bestMatch, oldCount, newCount);
                            UI.showToast(i18n.t('toast_rating_updated'));
                            if(updateWidgetData) updateWidgetData();
                        });
                        return 5000;
                    }

                    UI.renderBeerDetail(product, (data) => {
                        let beerRef = product;
                        let oldRating = Storage.getBeerRating(product.id);
                        if (product.fromAPI) {
                            const newBeer = { ...product };
                            newBeer.id = 'CUSTOM_' + Date.now();
                            delete newBeer.fromAPI;
                            Storage.saveCustomBeer(newBeer);
                            Storage.saveBeerRating(newBeer.id, data);
                            window.dispatchEvent(new CustomEvent('beerdex-action'));
                            renderCurrentView();
                            beerRef = newBeer;
                        } else {
                            Storage.saveBeerRating(product.id, data);
                            Achievements.checkAchievements(state.beers);
                        }
                        const oldCount = oldRating ? (parseInt(oldRating.count) || 0) : 0;
                        const newCount = Storage.getBeerRating(beerRef.id)?.count || 0;
                        Utils.syncBACFromCountDiff(beerRef, oldCount, newCount);
                        UI.showToast(i18n.t('toast_rating_saved'));
                        if(updateWidgetData) updateWidgetData();
                    });
                    return 5000;

                } else if (status === 'not_beer') {
                    consecutiveFailures = 0;
                    UI.setScannerFeedback(
                        `<span>${i18n.t('scanner_not_beer')} <button id="btn-force-add" style="text-decoration:underline; background:none; border:none; color:inherit; cursor:pointer;">${i18n.t('scanner_btn_force_add')}</button></span>`,
                        true
                    );
                    setTimeout(() => {
                        document.getElementById('btn-force-add')?.addEventListener('click', (e) => {
                            e.stopPropagation();
                            UI.closeModal();
                            const prefill = product || {};
                            setTimeout(() => {
                                UI.renderAddBeerForm((newBeer) => {
                                    Storage.saveCustomBeer(newBeer);
                                    state.beers.unshift(newBeer);
                                    Achievements.checkAchievements(state.beers);
                                    renderCurrentView();
                                    UI.closeModal();
                                    UI.showToast(i18n.t('toast_beer_added'));
                                }, null, prefill);
                            }, 60);
                        }, { once: true });
                    }, 100);
                    return 5000;

                } else {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 10) {
                        consecutiveFailures = 0;
                        UI.setScannerFeedback(
                            `<span>⚠️ ${i18n.t('scanner_too_many_fails', "10 essais infructueux...")}<br>${i18n.t('scanner_try_manual', "Essayez la recherche manuelle ?")}<br>
                            <button id="btn-scan-search" style="text-decoration:underline; background:none; border:none; color:var(--accent-gold); cursor:pointer; font-weight:bold;">${i18n.t('scanner_btn_search_dex')}</button></span>`,
                            true
                        );
                        setTimeout(() => {
                            document.getElementById('btn-scan-search')?.addEventListener('click', () => {
                                UI.closeModal();
                                setTimeout(() => {
                                    const searchBtn = document.getElementById('search-toggle');
                                    if (searchBtn) searchBtn.click();
                                }, 300);
                            }, { once: true });
                        }, 100);
                        return 10000;
                    }

                    UI.setScannerFeedback(
                        `<span>${i18n.t('scanner_unknown')}
                        <button id="btn-scan-search" style="text-decoration:underline; background:none; border:none; color:var(--accent-gold); cursor:pointer; font-weight:bold;">${i18n.t('scanner_btn_search_dex')}</button></span>`,
                        true
                    );
                    setTimeout(() => {
                        document.getElementById('btn-scan-search')?.addEventListener('click', () => {
                            UI.closeModal();
                            setTimeout(() => {
                                const searchBtn = document.getElementById('search-toggle');
                                if (searchBtn) searchBtn.click();
                            }, 300);
                        }, { once: true });
                    }, 100);
                    return 0;
                }

            } catch (err) {
                consecutiveFailures++;
                console.error("[App] Scan process error:", err);
                const isNetworkError = err.name === 'TypeError' || err.message.includes('fetch');
                const errMsg = isNetworkError ? i18n.t('error_network', "Erreur Réseau/CORS 🌐") : i18n.t('error_unknown', "Erreur Inconnue ❌");
                UI.setScannerFeedback(errMsg, true);
                return 0;
            }
        });
    });
}
