import { i18n } from './i18n.js';
import * as Env from './env.js';
import { Analytics } from './analytics.js';
import * as Storage from './storage.js';
import { EventSystem } from './event-system.js';
import * as Share from './share.js';
import Match from './match.js';
import * as Map from './map.js';
import * as API from './api.js';
import * as Scanner from './scanner.js';
import { fetchProductByBarcode, searchProducts } from './off-api.js';
import { Feedback } from './feedback.js';
import * as BAC from './bac.js';
import * as Achievements from './achievements.js';
import { AromaWheel } from './aroma-wheel.js';
import * as CrashLogger from './crashLogger.js';
import * as Deduplicator from './deduplicator.js';
import * as Theme from './theme.js';
import * as Utils from './utils.js';

let editModeBeer = null;
// We assume global libs: QRCode, Html5QrcodeScanner (handled via CDN)
const QRCodeLib = window.QRCode;
const Html5Qrcode = window.Html5Qrcode;

// Helpers
const modalContainer = document.getElementById('modal-container');

// Toast Queue
const toastQueue = [];
let isToastActive = false;
let modalCleanup = null;

let chartJsPromise = null;
function loadChartJs() {
    if (chartJsPromise) return chartJsPromise;
    chartJsPromise = new Promise((resolve, reject) => {
        if (window.Chart) {
            resolve();
            return;
        }
        const script1 = document.createElement('script');
        script1.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation";
            script2.onload = resolve;
            script2.onerror = reject;
            document.head.appendChild(script2);
        };
        script1.onerror = reject;
        document.head.appendChild(script1);
    });
    return chartJsPromise;
}

import { checkAutoBackup, renderImportModal, renderExportModal, renderShareLink } from './import-export.js';
export { checkAutoBackup, renderImportModal, renderExportModal, renderShareLink };


/**
 * Update UI state based on network connectivity
 * @param {boolean} isOnline 
 */
export function updateNetworkStatus(isOnline) {
    // Target all API-related buttons
    const apiButtons = [
        document.getElementById('btn-search-api-bar'),
        document.getElementById('btn-search-api'),
        document.getElementById('btn-search-api-footer')
    ];

    apiButtons.forEach(btn => {
        if (!btn) return;
        if (isOnline) {
            btn.style.opacity = '1';
            btn.style.filter = 'none';
        } else {
            btn.style.opacity = '0.5';
            btn.style.filter = 'grayscale(1)';
        }
    });

    // Check for offline edition
    Env.getEdition().then(edition => {
        if (edition === 'preview_offline') {
            const scanBtn = document.getElementById('fab-scan');
            if (scanBtn) scanBtn.style.display = 'none';
        }
    });
}

export function showToast(message, type = 'default') {
    toastQueue.push({ message, type });
    processToastQueue();
}

function processToastQueue() {
    if (isToastActive || toastQueue.length === 0) return;

    isToastActive = true;
    const { message, type } = toastQueue.shift();

    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '80px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(255, 192, 0, 0.9)';
    toast.style.color = '#000';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '20px';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '1000';
    toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    toast.innerText = message;

    document.body.appendChild(toast);

    // Initial Animation
    toast.animate([
        { transform: 'translateX(-50%) translateY(20px)', opacity: 0 },
        { transform: 'translateX(-50%) translateY(0)', opacity: 1 }
    ], { duration: 300, easing: 'ease-out' });

    setTimeout(() => {
        // Exit Animation
        const anim = toast.animate([
            { transform: 'translateX(-50%) translateY(0)', opacity: 1 },
            { transform: 'translateX(-50%) translateY(20px)', opacity: 0 }
        ], { duration: 300, easing: 'ease-in' });

        anim.onfinish = () => {
            toast.remove();
            isToastActive = false;
            // Small buffer between toasts
            setTimeout(processToastQueue, 300);
        };
    }, 3000);
}

let previousFocusElement = null;

function focusTrap(e) {
    if (e.key === 'Escape') {
        closeModal();
        return;
    }
    if (e.key === 'Tab') {
        const focusableElements = modalContainer.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) {
            e.preventDefault();
            return;
        }
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        } else if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        }
    }
}

export const modalStack = [];

// Flag to prevent popstate from interfering when we programmatically close a modal
let _closingModalProgrammatically = false;

window.addEventListener('popstate', (e) => {
    // If we triggered this popstate ourselves via closeModal -> history.back(), skip it
    if (_closingModalProgrammatically) {
        _closingModalProgrammatically = false;
        return;
    }

    // Priority 1: Close modals
    if (modalStack.length > 0) {
        const topModalClose = modalStack.pop();
        topModalClose(true); // pass true to indicate native back
        return;
    }

    // Priority 2: Close search bar if open
    const searchBar = document.getElementById('search-bar');
    if (searchBar && !searchBar.classList.contains('hidden')) {
        // Dispatch event for app.js to handle cleanup
        window.dispatchEvent(new CustomEvent('beerdex-close-search'));
        return;
    }

    // Priority 3: Navigate back to previous view
    if (e.state && e.state.view) {
        const targetView = e.state.view;
        // Update nav bar active state
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const navBtn = document.querySelector(`.nav-item[data-view="${targetView}"]`);
        if (navBtn) navBtn.classList.add('active');
        // Dispatch a custom event for app.js to handle the view change
        window.dispatchEvent(new CustomEvent('beerdex-navigate-back', { detail: { view: targetView } }));
    }
});

export function closeModal(fromPopState = false) {
    // If it's the standard modal, we handle its teardown
    if (modalCleanup) {
        modalCleanup();
        modalCleanup = null;
    }
    
    // If this wasn't triggered by native back, keep history stack clean
    if (fromPopState !== true && window.history.state && window.history.state.isModal) {
        _closingModalProgrammatically = true;
        window.history.back();
    }
    
    document.removeEventListener('keydown', focusTrap);
    
    // Blur any active element inside the modal before hiding it
    if (document.activeElement && modalContainer.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    
    if (previousFocusElement) {
        previousFocusElement.focus();
        previousFocusElement = null;
    }

    modalContainer.classList.add('hidden');
    modalContainer.setAttribute('aria-hidden', 'true');
    modalContainer.innerHTML = '';
    
    // Only remove body class if no other modals are open
    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
    }
}

export function openModal(content) {
    previousFocusElement = document.activeElement;
    
    modalContainer.innerHTML = '';
    modalContainer.appendChild(content);
    modalContainer.classList.remove('hidden');
    modalContainer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // Add state to browser history
    window.history.pushState({ isModal: true, timestamp: Date.now() }, '');
    
    // Apply rarity animations if the modal contains rarity badges
    applyRarityAnimations(modalContainer);

    // Push the standard close function to the stack
    modalStack.push(closeModal);

    // Close on click outside
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) closeModal();
    };
    
    document.addEventListener('keydown', focusTrap);
    
    // Auto focus first interactive element
    setTimeout(() => {
        const focusableElements = modalContainer.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length) focusableElements[0].focus();
    }, 10);
}

// ===== REUSABLE DIALOG MODALS (replaces prompt/confirm/alert) =====

/**
 * Shows a styled prompt modal. Returns a Promise that resolves with the entered value or null if cancelled.
 */
export function showPromptModal(title, defaultValue = '', opts = {}) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-dialog';
        wrapper.innerHTML = `
            <h3>${title}</h3>
            <input type="${opts.inputType || 'text'}" id="modal-prompt-input" class="form-input" 
                   value="${defaultValue}" placeholder="${opts.placeholder || ''}">
            <div class="modal-dialog-actions">
                <button id="modal-prompt-cancel" class="btn-cancel" data-i18n="btn_cancel">Annuler</button>
                <button id="modal-prompt-ok" class="btn-confirm" data-i18n="btn_confirm">Confirmer</button>
            </div>
        `;

        openModal(wrapper);

        const input = wrapper.querySelector('#modal-prompt-input');
        input.focus();
        input.select();

        const finish = (val) => {
            modalContainer.onclick = null;
            closeModal();
            resolve(val);
        };

        wrapper.querySelector('#modal-prompt-ok').onclick = () => finish(input.value);
        wrapper.querySelector('#modal-prompt-cancel').onclick = () => finish(null);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(input.value);
            if (e.key === 'Escape') finish(null);
        });

        modalContainer.onclick = (e) => {
            if (e.target === modalContainer) finish(null);
        };
    });
}

/**
 * Shows a styled confirm modal. Returns a Promise<boolean>.
 */
export function showConfirmModal(message, opts = {}) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-dialog';

        const isDanger = opts.danger !== false;
        const icon = isDanger ? '⚠️' : 'ℹ️';
        const dangerClass = isDanger ? ' danger' : '';

        wrapper.innerHTML = `
            <div class="dialog-icon">${icon}</div>
            <p>${message}</p>
            <div class="modal-dialog-actions">
                <button id="modal-confirm-cancel" class="btn-cancel">${opts.cancelText || i18n.t('btn_cancel')}</button>
                <button id="modal-confirm-ok" class="btn-confirm${dangerClass}">${opts.confirmText || i18n.t('btn_confirm')}</button>
            </div>
        `;

        openModal(wrapper);

        const finish = (val) => {
            modalContainer.onclick = null;
            closeModal();
            resolve(val);
        };

        wrapper.querySelector('#modal-confirm-ok').onclick = () => finish(true);
        wrapper.querySelector('#modal-confirm-cancel').onclick = () => finish(false);
        modalContainer.onclick = (e) => {
            if (e.target === modalContainer) finish(false);
        };
    });
}

/**
 * Shows a styled alert modal. Returns a Promise that resolves when dismissed.
 */
export function showAlertModal(message, opts = {}) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-dialog';

        const icon = opts.icon || 'ℹ️';
        const titleHtml = opts.title ? `<h3>${opts.title}</h3>` : '';

        wrapper.innerHTML = `
            <div class="dialog-icon">${icon}</div>
            ${titleHtml}
            <p>${message}</p>
            <button id="modal-alert-ok" class="btn-ok">OK</button>
        `;

        openModal(wrapper);

        const finish = () => {
            modalContainer.onclick = null;
            closeModal();
            resolve();
        };

        wrapper.querySelector('#modal-alert-ok').onclick = finish;
        modalContainer.onclick = (e) => {
            if (e.target === modalContainer) finish();
        };
    });
}

// --- App Welcome & Consent Flow ---

export function checkAndShowWelcome() {
    // Only show welcome if consent is already given
    if (localStorage.getItem('beerdex_consent') !== 'true') return;

    const HAS_SEEN_KEY = 'beerdex_welcome_seen_v3';
    if (localStorage.getItem(HAS_SEEN_KEY)) return;

    // Defer tutorial start to let UI settle
    setTimeout(() => {
        if (typeof TutorialSystem !== 'undefined') {
            TutorialSystem.start();
        }
    }, 1000);
}

export async function checkAndShowConsent(onAccept) {
    const activeEvent = EventSystem.getActiveEvent();
    const shouldForce = EventSystem.shouldForceBanner();

    // Check if we already showed the special event banner for this event
    const bannerShownKey = activeEvent ? `event_banner_shown_${activeEvent.id}` : null;
    const eventBannerShown = bannerShownKey ? Storage.getPreference(bannerShownKey, false) : false;

    // Normal flow: if no forced event today, or if we already showed it this session,
    // check normal consent.
    if (!shouldForce || eventBannerShown) {
        if (localStorage.getItem('beerdex_consent') === 'true') {
            if (onAccept) onAccept();
            return;
        }
    }

    const bannerData = activeEvent?.banner;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        background: var(--bg-card);
        width: 90%;
        max-width: 500px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        border-radius: 20px;
        padding: var(--spacing-lg);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
        border: 1px solid var(--accent-gold);
        position: relative;
    `;

    const bannerContent = (shouldForce && bannerData) ? `
        <div style="text-align: center; margin-bottom: 20px; flex-shrink: 0;">
            <div style="font-size: 3rem; margin-bottom: 10px;">🎭🏛️</div>
            <h2 style="color: var(--accent-gold); font-size: 1.6rem; margin-bottom: 10px;">${bannerData.title || "Exposition Beerdex"}</h2>
        </div>
        <div style="overflow-y: auto; flex: 1; padding-right: 5px; margin-bottom: 10px;">
            <div style="color: var(--text-primary); line-height: 1.6; font-size: 1.1rem; margin-bottom: 25px; text-align: center; background: rgba(255,192,0,0.1); padding: 20px; border-radius: 12px; border: 1px solid var(--accent-gold); font-family: 'Playfair Display', serif;">
                ${(bannerData.message || "").replace(/\n/g, '<br>')}
            </div>
        </div>
    ` : `
        <div style="text-align: center; margin-bottom: 20px; flex-shrink: 0;">
            <div style="font-size: 3rem; margin-bottom: 10px;">🍻</div>
            <h2 style="color: var(--accent-gold); font-size: 1.6rem; margin-bottom: 10px;">${i18n.t('filter_welcome')}</h2>
        </div>
        <div style="overflow-y: auto; flex: 1; padding-right: 5px; margin-bottom: 10px;">
            <div style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem; margin-bottom: 25px; text-align: justify; background: var(--bg-dark); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);">
                <p style="margin-bottom: 15px; font-weight: bold; color: var(--text-primary);">${i18n.t('consent_intro')}</p>
                <ul style="padding-left: 20px; list-style-type: '👉 ';">
                    <li style="margin-bottom: 10px;"><strong>${i18n.t('consent_age_label')} :</strong> ${i18n.t('consent_age_text')}</li>
                    <li style="margin-bottom: 10px;"><strong>${i18n.t('consent_prevention_label')} :</strong> ${i18n.t('consent_prevention_text')}</li>
                    <li><strong>${i18n.t('consent_stats_label')} :</strong> ${i18n.t('consent_stats_text')}</li>
                </ul>
            </div>
        </div>
    `;

    wrapper.innerHTML = `
        ${bannerContent}
        <div style="display: flex; justify-content: center; width: 100%; margin-top: 10px; flex-shrink: 0;">
            <button id="btn-accept-consent" class="btn-primary" style="font-size: 1.1rem; padding: 16px 40px; width: auto; min-width: 250px; margin-top: 0; box-shadow: 0 4px 15px rgba(255,192,0,0.3);">
                ${(shouldForce && bannerData && bannerData.button) ? bannerData.button : i18n.t('consent_btn_accept')}
            </button>
        </div>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '9999999';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.alignItems = 'center';

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            wrapper.style.transform = 'translateX(-10px)';
            setTimeout(() => wrapper.style.transform = 'translateX(10px)', 100);
            setTimeout(() => wrapper.style.transform = 'translateX(-10px)', 200);
            setTimeout(() => wrapper.style.transform = 'translateX(0)', 300);
        }
    };

    overlay.appendChild(wrapper);
    document.body.appendChild(overlay);

    wrapper.querySelector('#btn-accept-consent').onclick = () => {
        if (window.navigator && window.navigator.vibrate) navigator.vibrate(50);

        localStorage.setItem('beerdex_consent', 'true');

        // Ensure the banner doesn't show again for this event
        if (activeEvent && bannerShownKey) {
            console.log(`[UI] Dismissing banner for event: ${activeEvent.id}`);
            Storage.savePreference(bannerShownKey, true);
        }

        overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        overlay.style.opacity = '0';
        wrapper.style.transform = 'scale(0.9)';

        setTimeout(() => {
            overlay.remove();
            if (window.applyTheme) window.applyTheme();
            if (onAccept) onAccept();
            checkAndShowWelcome();
        }, 400);
    };
}

// --- Renders ---

// Helper to remove background using 'Magic Wand' style flood fill (color distance)
// Wrapped in requestIdleCallback for performance on low-end devices
window.removeImageBackground = function (img) {
    const doWork = () => _removeImageBackgroundSync(img);
    if (window.requestIdleCallback) {
        requestIdleCallback(doWork, { timeout: 500 });
    } else {
        setTimeout(doWork, 0);
    }
};

function _removeImageBackgroundSync(img) {
    if (img.dataset.processed) return;

    try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Settings for Magic Wand
        const tolerance = 20; // Allow slight variations in background color
        const toleranceSq = tolerance * tolerance;
        const featherRadius = 2; // Smooth edges

        // 1. Get Reference Color from Top-Left Corner
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];

        // Helper: Calculate Euclidean color distance squared
        const colorDistSq = (r1, g1, b1, r2, g2, b2) => {
            return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
        };

        // Mask: 0 = Keep, 1 = Remove
        const toRemove = new Uint8Array(width * height);

        // Helper to check if pixel matches background reference within tolerance
        const isBackground = (idx) => {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            return colorDistSq(r, g, b, bgR, bgG, bgB) <= toleranceSq;
        };

        // 2. Flood Fill from corners
        const floodFill = (startX, startY) => {
            const stack = [[startX, startY]];

            while (stack.length > 0) {
                const [x, y] = stack.pop();

                if (x < 0 || x >= width || y < 0 || y >= height) continue;

                const idx = y * width + x;
                if (toRemove[idx]) continue; // Already marked

                const dataIdx = idx * 4;

                // If this pixel matches the background color (tolerance)
                if (isBackground(dataIdx)) {
                    toRemove[idx] = 1;

                    stack.push([x + 1, y]);
                    stack.push([x - 1, y]);
                    stack.push([x, y + 1]);
                    stack.push([x, y - 1]);
                }
            }
        };

        // Trigger fill from corners if they match the background reference
        floodFill(0, 0);

        // Check other corners
        const checkAndFill = (x, y) => {
            const idx = (y * width + x) * 4;
            if (isBackground(idx)) floodFill(x, y);
        };
        checkAndFill(width - 1, 0);
        checkAndFill(0, height - 1);
        checkAndFill(width - 1, height - 1);

        // 3. Apply Alpha with Distance-Based Feathering
        let hasChanges = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const dataIdx = idx * 4;

                if (toRemove[idx]) {
                    data[dataIdx + 3] = 0; // Fully transparent
                    hasChanges = true;
                    continue;
                }

                // Check unremoved pixels for proximity to removed pixels (Feathering)
                let minDistance = featherRadius + 1;
                let foundRemoved = false;

                // Search neighborhood
                for (let dy = -featherRadius; dy <= featherRadius; dy++) {
                    for (let dx = -featherRadius; dx <= featherRadius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (toRemove[ny * width + nx]) {
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                if (dist < minDistance) {
                                    minDistance = dist;
                                    foundRemoved = true;
                                }
                            }
                        }
                    }
                }

                if (foundRemoved && minDistance <= featherRadius) {
                    // Smooth transition: 0 distance = 0 alpha (removed), Radius distance = 255 alpha
                    const alpha = Math.floor((minDistance / featherRadius) * 255);
                    data[dataIdx + 3] = Math.min(data[dataIdx + 3], alpha);
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            ctx.putImageData(imgData, 0, 0);
            img.src = canvas.toDataURL();
            img.dataset.processed = "true";
        }
    } catch (e) {
        // Silent fail
    }
};

export function renderBeerList(beers, container, filters = null, showCreatePrompt = false, isDiscoveryCallback = null, isAppend = false) {
    if (!isAppend) container.innerHTML = '';
    const userData = Storage.getAllUserData();

    // NOTE: Filtering & sorting is now handled upstream in app.js (applyFilters).
    // The beers array passed here is already filtered and sorted.
    let filteredBeers = beers;

    if (filteredBeers.length === 0) {
        if (showCreatePrompt && isDiscoveryCallback) {
            container.innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <p style="color: #888; margin-bottom: 20px;">${i18n.t('list_beer_not_exist')}</p>
                    <button id="btn-create-discovery" class="btn-primary" style="background:var(--accent-gold); color:var(--bg-dark);">
                        ${i18n.t('list_btn_create')}
                    </button>
                </div>`;
            document.getElementById('btn-create-discovery').onclick = isDiscoveryCallback;
            return;
        }

        // Specific Empty State for Discovery Mode (No Search, Empty Collection)
        if (isDiscoveryCallback && !showCreatePrompt) {
            container.innerHTML = `
                <div style="text-align:center; padding: 50px 20px; color: #888;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🕵️‍♂️</div>
                    <h3>${i18n.t('list_discovery_mode')}</h3>
                    <p style="margin-top: 10px;">${i18n.t('list_empty_collection')}</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">${i18n.t('list_use_search_desc')}</p>
                </div>`;
            return;
        }

        // --- NEW: Empty Search State -> Propose API Search ---
        if (!isDiscoveryCallback && filters.query && filters.query.length > 2) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px 20px; color: #666;">
                    <h3 style="margin-bottom:10px;">${i18n.t('list_no_local_results')}</h3>
                    <p style="font-size:0.9rem;">${i18n.t('list_search_further')}</p>
                    <button id="btn-search-api" class="btn-primary" style="margin-top:15px; background:var(--accent-gold); color:black;">
                        ${i18n.t('list_btn_search_api')}
                    </button>
                    <div id="api-results-area" style="margin-top:20px;"></div>
                </div>`;

            // Bind Click
            setTimeout(() => {
                const btn = document.getElementById('btn-search-api');
                if (btn) {
                    btn.onclick = async () => {
                        if (!navigator.onLine) {
                            showToast(i18n.t('error_offline_api'), "error");
                            return;
                        }
                        btn.disabled = true;
                        btn.innerHTML = `<span class="spinner"></span> ${i18n.t('list_searching')}`;
                        try {
                            const { products, count, status } = await searchProducts(filters.query);
                            const area = document.getElementById('api-results-area');

                            if (status === 'offline') {
                                showToast(i18n.t('error_offline_api'), "error");
                                btn.disabled = false;
                                return;
                            }

                            if (products.length === 0) {
                                btn.innerHTML = i18n.t('list_nothing_found');
                            } else {
                                btn.style.display = 'none'; // Hide button
                                // Render API Results
                                const grid = document.createElement('div');
                                grid.className = 'beer-grid';

                                products.forEach(p => {
                                    // Use basic card render logic or reuse renderBeerList helper (tricky due to innerHTML reset)
                                    // We'll create a simple specific renderer here for API results
                                    const card = createApiBeerCard(p);
                                    grid.appendChild(card);
                                });
                                area.appendChild(grid);

                                // Show manual add button at bottom if still not found
                                const manualDiv = document.createElement('div');
                                manualDiv.innerHTML = `
                                    <p style="margin-top:30px; color:#666;">${i18n.t('search_not_found')}</p>
                                    <button id="btn-create-manual" class="form-input">➕ ${i18n.t('search_btn_create_manual')}</button>
                                `;
                                area.appendChild(manualDiv);
                                manualDiv.querySelector('#btn-create-manual').onclick = () => {
                                    renderAddBeerForm((newBeer) => {
                                        Storage.saveCustomBeer(newBeer);
                                        // Trigger refresh via custom event or reload
                                        window.dispatchEvent(new CustomEvent('beerdex-action'));
                                        location.reload();
                                    });
                                };
                            }
                        } catch (e) {
                            btn.innerHTML = i18n.t('search_error_limit');
                            showAlertModal(e.message, { icon: '⚠️' });
                        }
                    };
                }
            }, 0);
            return;
        }

        container.innerHTML = `<div style="text-align:center; padding: 20px; color: #666;">${i18n.t('search_no_results')}</div>`;
        return;
    }

    let grid;
    if (isAppend) {
        grid = container.querySelector('.beer-grid');
    }

    const viewMode = Storage.getPreference('viewMode', 'grid');
    const gridClasses = viewMode === 'list' ? 'beer-grid view-list' : 'beer-grid';

    if (!grid) {
        if (!isAppend) container.innerHTML = '';
        grid = document.createElement('div');
        grid.className = gridClasses;
        container.appendChild(grid);
    } else if (!isAppend) {
        // Update grid class in case viewMode changed
        grid.className = gridClasses;
    }

    filteredBeers.forEach((beer, index) => {
        // ... (existing logic)
        // CHECK IF API BEER (Mixed results support)
        const isApi = beer.fromAPI;
        if (isApi) {
            const card = createApiBeerCard(beer);
            grid.appendChild(card);
            return; // Skip normal render
        }

        const u = userData[beer.id];
        const isDrunk = u && u.count > 0;
        const card = document.createElement('div');
        card.className = `beer-card ${isDrunk ? 'drunk' : ''}`;
        card.dataset.id = beer.id;

        // Apply Rarity Border via CSS classes
        // Logic: Reveal if Drunk OR if Setting "Reveal Rarity" is ON
        const revealRarity = isDrunk || Storage.getPreference('revealRarity', false);
        const animOnce = Storage.getPreference('anim_only_once', false);
        const hasPlayed = window.__playedAnims.has(beer.id);

        if (revealRarity && beer.rarity && beer.rarity !== 'base') {
            // Apply per-rarity CSS class for border color
            card.classList.add(`card-rarity-${beer.rarity}`);

            // Only add ANIMATION classes if:
            // 1. Beer is unlocked (isDrunk) -- as per user request
            // 2. Play Once setting is OFF OR it hasn't played yet
            if (isDrunk && (!animOnce || !hasPlayed)) {
                if (beer.rarity === 'ultra_legendaire') {
                    card.classList.add('card-anim-ultra_legendary');
                }
                // Mark as played for this session
                window.__playedAnims.add(beer.id);
                if (window.savePlayedAnims) window.savePlayedAnims();
            } else if (animOnce && hasPlayed) {
                // Ultra Légendaire cards ALWAYS stay animated
                if (beer.rarity === 'ultra_legendaire') {
                    card.classList.add('card-anim-ultra_legendary');
                } else {
                    // Force static if played once (other rarities only)
                    card.classList.add('stop-animations');
                }
            }
        } else {
            // Locked / Neutral State
            card.style.borderColor = 'var(--border-color)';
        }

        // --- ANTI AUTO-INIT CLEANUP ---
        // If not drunk, ensured no VanillaTilt behavior survives
        if (!isDrunk) {
            card.removeAttribute('data-tilt');
            if (card.vanillaTilt) card.vanillaTilt.destroy();
        }

        if (beer.isSeasonal) {
            // Add a small seasonal indicator if needed
            if (!beer.rarity || beer.rarity === 'base') {
                card.style.borderColor = 'var(--rarity-seasonal)';
            }
        }

        // Stats Badges
        const abv = beer.alcohol ? `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${beer.alcohol}</span>` : '';
        const vol = beer.volume ? `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${Utils.formatVolume(beer.volume)}</span>` : '';
        const typeBadge = beer.type ? `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${beer.type}</span>` : '';

        // Determine correct fallback/default image based on volume
        const isKeg = (vol) => {
            if (!vol) return false;
            const v = vol.toUpperCase();
            // Simple heuristic for Kegs
            return v.includes('20 L') || v.includes('30 L') || v.includes('50 L') || v.includes('FUT');
        };
        const fallbackImage = isKeg(beer.volume) ? 'images/beer/FUT.jpg' : 'images/beer/default.png';

        // If current image is FUT but it's not a keg, fix it immediately
        let displayImage = beer.image;
        if (!displayImage || (displayImage.includes('FUT.jpg') && !isKeg(beer.volume))) {
            displayImage = fallbackImage;
        }

        const isFavorite = Storage.isFavorite(beer.id);

        // Speculative BAC badge (if enabled)
        let bacBadgeHtml = '';
        if (Storage.getPreference('bac_enabled', true)) {
            const driveInfo = BAC.getSpeculativeDriveInfo(beer.volume, beer.alcohol);
            if (driveInfo) {
                const timeHtml = driveInfo.timeStr ? `<span class="bac-time"> · ${driveInfo.timeStr}</span>` : '';
                bacBadgeHtml = `<div class="beer-card-bac-row" style="display:flex; justify-content:center; margin-top:8px;">
                    <div class="bac-speculative-badge" style="color:${driveInfo.color}; border-color:${driveInfo.color}33; display:inline-flex;">
                        <span class="bac-icon">${driveInfo.icon}</span>
                        <span>+${driveInfo.delta.toFixed(2)}</span>${timeHtml}
                    </div>
                </div>`;
            }
        }
        // Card Stats Overlay
        let cardStatsHtml = '';
        if (isDrunk) {
            const showCount = Storage.getPreference('card_stat_count', false);
            const showVolume = Storage.getPreference('card_stat_volume', false);
            if (showCount || showVolume) {
                let statsParts = [];
                if (showCount) statsParts.push(`${u.count}x`);
                if (showVolume) {
                    let totalMl = 0;
                    if (u.history) {
                        totalMl = u.history.reduce((sum, h) => sum + (h.volume || 0), 0);
                    } else if (beer.volume) {
                        // Fallback: parse beer.volume * count
                        const parsed = Storage.parseVolumeToMl ? Storage.parseVolumeToMl(beer.volume) : 330;
                        totalMl = parsed * u.count;
                    }
                    if (totalMl > 0) {
                        if (totalMl >= 1000) statsParts.push(`${(totalMl/1000).toFixed(1)}L`);
                        else statsParts.push(`${totalMl}ml`);
                    }
                }
                if (statsParts.length > 0) {
                    cardStatsHtml = `<div class="bac-speculative-badge" style="color:#ddd; border-color:rgba(255,255,255,0.08); font-weight:normal; display:inline-flex;">
                        <span>${statsParts.join(' · ')}</span>
                    </div>`;
                }
            }
        }

        let badgesContainerHtml = '';
        if (cardStatsHtml) {
            badgesContainerHtml = `<div class="card-badges-left" style="position:absolute; top:5px; left:5px; z-index:2; display:flex; flex-direction:column; gap:4px; font-size:0.75rem;">
                ${cardStatsHtml}
            </div>`;
        }

        card.innerHTML = `
            ${badgesContainerHtml}
            ${isFavorite ? '<div style="position:absolute; top:5px; right:5px; z-index:2; font-size:1.2rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">⭐</div>' : ''}
            <svg class="check-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div class="beer-image-container" style="width:100%; height:120px; display:flex; justify-content:center; align-items:center;">
                <img src="${displayImage}" alt="${beer.title}" class="beer-image" loading="${index < 10 ? 'eager' : 'lazy'}" 
                     onload="removeImageBackground(this)"
                     onerror="if(this.src.includes('${fallbackImage}')) return; this.src='${fallbackImage}';">
            </div>
            <div class="beer-info">
                <h3 class="beer-title">${beer.title}</h3>
                <p class="beer-brewery">${beer.brewery}</p>
                <div class="beer-card-stats-row" style="display:flex; gap:5px; justify-content:center; margin-top:5px; color:#aaa; flex-wrap:wrap;">
                    ${abv} ${vol} ${typeBadge}
                </div>
                ${bacBadgeHtml}
            </div>
        `;

        grid.appendChild(card);
    });

    // Initialize premium 3D tilt effects — lazy, only on non-touch desktop
    // On mobile, VanillaTilt adds expensive touch/gyro listeners to every card.
    // Only init on devices where hover is supported and primary pointer is fine.
    const isTouchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isTouchPrimary && typeof VanillaTilt !== 'undefined') {
        setTimeout(() => {
            const cards = grid.querySelectorAll('.beer-card.drunk');
            VanillaTilt.init(cards, {
                max: 12,
                speed: 400,
                glare: true,
                "max-glare": 0.3,
                scale: 1.02,
                perspective: 1000,
                transition: true,
                gyroscope: false
            });
        }, 100);
    }

    // Apply rarity animations directly (replaces MutationObserver)
    applyRarityAnimations(grid);

    // --- CASE 2: Results exist BUT text search is active -> Propose API search at the bottom ---
    // Make sure we are not already in a callback or empty state that handles it
    if (!isDiscoveryCallback && filters && filters.query && filters.query.length > 2) {

        // Check if API Search Button Area already exists in this container (avoid dupes on append)
        let apiArea = container.querySelector('#api-search-container');
        if (!apiArea) {
            apiArea = document.createElement('div');
            apiArea.id = 'api-search-container';
            apiArea.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            apiArea.style.marginTop = '30px';
            apiArea.style.paddingTop = '20px';
            apiArea.style.textAlign = 'center';
            container.appendChild(apiArea);
        }

        apiArea.innerHTML = `
            <p style="color:#666; font-size:0.9rem; margin-bottom:15px;">Pas ce que vous cherchez ?</p>
            <button id="btn-search-api-footer" class="btn-primary" style="background:var(--accent-gold); color:black;">
                🌍 Recherche Approfondie (OFF API)
            </button>
            <div id="api-results-area-footer" style="margin-top:20px;"></div>
        `;

        // Bind Click (Footer)
        setTimeout(() => {
            const btn = document.getElementById('btn-search-api-footer');
            if (btn) {
                btn.onclick = async () => {
                    btn.disabled = true;
                    btn.innerHTML = '<span class="spinner"></span> Recherche...';
                    try {
                        const { products } = await searchProducts(filters.query);
                        const area = document.getElementById('api-results-area-footer');

                        if (products.length === 0) {
                            btn.innerHTML = '❌ Rien trouvé...';
                        } else {
                            btn.style.display = 'none';
                            const grid = document.createElement('div');
                            grid.className = 'beer-grid';
                            products.forEach(p => {
                                grid.appendChild(createApiBeerCard(p));
                            });
                            area.appendChild(grid);
                        }
                    } catch (e) {
                        btn.innerHTML = '⚠️ Erreur';
                        showAlertModal(e.message, { icon: '⚠️' });
                    }
                };
            }
        }, 0);
    }
}


export function renderApiSearchResults(products, container) {
    container.innerHTML = '';

    if (!products || products.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-secondary);">
                <h3>Aucun résultat en ligne 😢</h3>
                <p>Essayez avec d'autres mots-clés.</p>
            </div>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'beer-grid';

    products.forEach(product => {
        grid.appendChild(createApiBeerCard(product));
    });

    container.appendChild(grid);
}

// Helper to create API cards
function createApiBeerCard(beer) {
    const card = document.createElement('div');
    card.className = 'beer-card api-card'; // Special styling maybe
    card.dataset.id = beer.id;
    card.style.borderColor = 'var(--accent-gold)';
    card.style.opacity = '0.9';

    // Badge "API"
    const apiBadge = '<div style="position:absolute; top:5px; right:5px; background:var(--accent-gold); color:black; font-size:0.6rem; padding:2px 6px; border-radius:10px; font-weight:bold;">🌍 WEB</div>';

    // Image fallback
    let displayImage = beer.image || 'images/beer/default.png';

    card.innerHTML = `
        ${apiBadge}
        <div style="width:100%; height:120px; display:flex; justify-content:center; align-items:center;">
             <img src="${displayImage}" alt="${beer.title}" class="beer-image" loading="lazy" 
                  onerror="this.src='images/beer/default.png';">
        </div>
        <div class="beer-info">
            <h3 class="beer-title">${beer.title}</h3>
            <p class="beer-brewery">${beer.brewery}</p>
            <div style="display:flex; gap:5px; justify-content:center; margin-top:5px; color:#aaa; flex-wrap:wrap;">
                <span>${beer.alcohol}</span> <span>${Utils.formatVolume(beer.volume)}</span>
            </div>
            <button class="btn-add-api" style="width:100%; margin-top:10px; font-size:0.8rem; padding:5px; background:#333; color:#fff; border:1px solid #555;">${i18n.t('btn_add_api')}</button>
        </div>
    `;

    // Click handler for "Add" or "Details"
    // If click on card body -> Show Details (API Preview)
    card.onclick = (e) => {
        if (e.target.classList.contains('btn-add-api')) {
            e.stopPropagation();
            // Quick Add -> Convert to Custom
            renderAddBeerForm((newBeer) => {
                Storage.saveCustomBeer(newBeer);
                window.dispatchEvent(new CustomEvent('beerdex-action'));
                showToast(i18n.t('toast_beer_imported'));
                // Optional: Refresh triggers 
                setTimeout(() => location.reload(), 500);
            }, null, beer); // Autofill with API data
        } else {
            renderBeerDetail(beer, (data) => {
                // Save rating -> implies converting to Custom Beer first IF not exists
                // We need to handle this "Save Rating on API Beer" flow in renderBeerDetail's onSave
            });
        }
    };

    return card;
}

export function renderFilterModal(allBeers, activeFilters, onApply) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content filter-modal';
    wrapper.style.padding = '0'; // Handle padding inside for layout
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.maxHeight = '85vh';
    wrapper.style.overflow = 'hidden'; // Essential to prevent modal itself from scrolling, we scroll the form only

    const types = [...new Set(allBeers.map(b => b.type).filter(Boolean))].sort();
    const breweries = ['All', ...new Set(allBeers.map(b => b.brewery).filter(Boolean))].sort();
    const countries = ['All', ...new Set(allBeers.map(b => b.searchCountry).filter(Boolean))].sort();

    // Group regions by Country for a cleaner dropdown
    const regionByCountry = {};
    allBeers.forEach(b => {
        if (b.searchRegion && b.searchCountry) {
            if (!regionByCountry[b.searchCountry]) regionByCountry[b.searchCountry] = new Set();
            regionByCountry[b.searchCountry].add(b.searchRegion);
        }
    });

    let regionOptionsHtml = `<option value="All" ${activeFilters.region === 'All' || !activeFilters.region ? 'selected' : ''}>All</option>`;
    Object.keys(regionByCountry).sort().forEach(country => {
        regionOptionsHtml += `<optgroup label="${country}">`;
        [...regionByCountry[country]].sort().forEach(reg => {
            regionOptionsHtml += `<option value="${reg}" ${activeFilters.region === reg ? 'selected' : ''}>${reg}</option>`;
        });
        regionOptionsHtml += `</optgroup>`;
    });

    const prodVolumes = ['All', ...new Set(allBeers.map(b => b.production_volume).filter(Boolean))].sort();
    const distributions = ['All', ...new Set(allBeers.map(b => b.distribution).filter(Boolean))].sort();

    const createOptions = (list, selected) => list.map(item => `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`).join('');

    wrapper.innerHTML = `
        <!-- HEADER -->
        <div style="background:var(--bg-card); padding:15px 20px; border-bottom:1px solid rgba(255,255,255,0.1); border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
            <h2 style="margin:0; font-size:1.4rem;">${i18n.t('filter_title')}</h2>
            <button type="button" id="btn-reset-top" style="background:none; border:none; color:var(--accent-gold); font-size:0.9rem; cursor:pointer; font-weight:bold;">${i18n.t('btn_reset')}</button>
        </div>

        <!-- TABS -->
        <div class="filter-tabs" style="display:flex; overflow-x:auto; gap:10px; padding:15px 20px; scrollbar-width:none; flex-shrink:0; align-items:center;">
            <button type="button" class="ftab active" data-tab="tab-gen" style="background:var(--accent-gold); color:#000; border:none; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer; white-space:nowrap;">${i18n.t('tab_general')}</button>
            <button type="button" class="ftab" data-tab="tab-tri" style="background:#333; color:#fff; border:none; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer; white-space:nowrap;">${i18n.t('tab_sort_notes')}</button>
            <button type="button" class="ftab" data-tab="tab-attr" style="background:#333; color:#fff; border:none; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer; white-space:nowrap;">${i18n.t('tab_attributes')}</button>
        </div>

        <!-- SCROLLING FORM -->
        <form id="filter-form" style="padding:5px 20px 80px 20px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:20px;">
            
            <!-- TAB: GENERAL -->
            <div id="tab-gen" class="tab-pane">
                <div class="stat-card mb-20" style="margin-bottom:15px;">
                    <h4 style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        ${i18n.t('filter_type_label')} 
                        <span style="font-size:0.8rem; color:#888; font-weight:normal;">${i18n.t('filter_plural_suffix')}</span>
                    </h4>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${types.map(t => {
        const isChecked = activeFilters.type && activeFilters.type.includes(t);
        return `
                                <label style="display:flex; align-items:center; gap:6px; background:${isChecked ? 'rgba(255,192,0,0.2)' : 'rgba(255,255,255,0.05)'}; padding:6px 12px; border-radius:15px; cursor:pointer; border:1px solid ${isChecked ? 'var(--accent-gold)' : 'transparent'}; transition:all 0.2s;">
                                    <input type="checkbox" class="cb-type" value="${t}" ${isChecked ? 'checked' : ''} style="display:none;">
                                    <span style="font-size:0.85rem; color:${isChecked ? 'var(--accent-gold)' : '#fff'};">${t}</span>
                                </label>
                            `;
    }).join('')}
                    </div>
                </div>
                <!-- Rareté -->
                <div class="stat-card mb-20" style="margin-bottom:15px;">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_rarity_label')}</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${['base', 'commun', 'rare', 'super_rare', 'epique', 'mythique', 'legendaire', 'ultra_legendaire'].map(r => `
                            <label style="display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); padding:6px 12px; border-radius:15px; cursor:pointer; border:1px solid var(--rarity-${r});">
                                <input type="checkbox" class="cb-rarity" value="${r}" ${activeFilters.rarity && activeFilters.rarity.includes(r) ? 'checked' : ''} style="display:none;">
                                <span style="font-size:0.8rem; text-transform:capitalize; color:#fff;">${i18n.t('rarity_' + r)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group stat-card mb-20">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_country')}</h4>
                    <select name="country" class="form-select">${createOptions(countries, activeFilters.country || 'All')}</select>
                </div>
                <div class="form-group stat-card mb-20">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_region')}</h4>
                    <select name="region" class="form-select">${regionOptionsHtml}</select>
                </div>
                <div class="form-group stat-card mb-20">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_brewery')}</h4>
                    <select name="brewery" class="form-select">${createOptions(breweries, activeFilters.brewery || 'All')}</select>
                </div>
                <div class="form-group stat-card mb-20">
                     <label class="form-group" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:0;">
                        <input type="checkbox" name="onlyCustom" ${activeFilters.onlyCustom ? 'checked' : ''} style="width:20px; height:20px;">
                        <span style="font-weight:bold; color:var(--accent-gold);">${i18n.t('filter_my_creations')}</span>
                    </label>
                </div>
            </div>

            <!-- TAB: TRI ET NOTES -->
            <div id="tab-tri" class="tab-pane" style="display:none;">
                <div class="stat-card mb-20" style="margin-bottom:15px;">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_sort_by')}</h4>
                    <div style="display:flex; gap:10px;">
                        <select name="sortBy" class="form-select" style="flex:2;">
                            <option value="default" ${activeFilters.sortBy === 'default' ? 'selected' : ''}>${i18n.t('filter_sort_default')}</option>
                            <option value="brewery" ${activeFilters.sortBy === 'brewery' ? 'selected' : ''}>${i18n.t('filter_brewery')}</option>
                            <option value="alcohol" ${activeFilters.sortBy === 'alcohol' ? 'selected' : ''}>${i18n.t('filter_label_degree')} (%)</option>
                            <option value="volume" ${activeFilters.sortBy === 'volume' ? 'selected' : ''}>Volume</option>
                            <option value="rarity" ${activeFilters.sortBy === 'rarity' ? 'selected' : ''}>${i18n.t('filter_rarity_label')}</option>
                            <option value="community_rating" ${activeFilters.sortBy === 'community_rating' ? 'selected' : ''}>${i18n.t('filter_community_note')}</option>
                        </select>
                        <select name="sortOrder" class="form-select" style="flex:1;">
                            <option value="asc" ${activeFilters.sortOrder === 'asc' ? 'selected' : ''}>${i18n.t('filter_sort_asc')}</option>
                            <option value="desc" ${activeFilters.sortOrder === 'desc' ? 'selected' : ''}>${i18n.t('filter_sort_desc')}</option>
                        </select>
                    </div>
                    
                    <div style="margin-top:15px; display:flex; flex-direction:column; gap:8px;">
                         <label style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:8px; cursor:pointer;">
                            <span style="font-size:0.95rem;">${i18n.t('filter_only_favs')}</span>
                            <input type="checkbox" name="onlyFavorites" id="onlyFavorites" ${activeFilters.onlyFavorites ? 'checked' : ''} style="width:20px; height:20px;">
                        </label>
                         <label style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:8px; cursor:pointer;">
                            <span style="font-size:0.95rem; color:#aaa;">${i18n.t('filter_ignore_favs')}</span>
                            <input type="checkbox" name="ignoreFavorites" id="ignoreFavorites" ${activeFilters.ignoreFavorites ? 'checked' : ''} style="width:20px; height:20px;">
                        </label>
                    </div>
                </div>

                <div class="stat-card mb-20">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_min_ratings')}</h4>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label class="form-label" style="display:flex; justify-content:space-between;">${i18n.t('filter_personal_note')} <span><span id="rate-val">${activeFilters.minRating || 0}</span>/20</span></label>
                        <input type="range" name="minRating" class="form-input" min="0" max="20" step="1" value="${activeFilters.minRating || 0}" 
                            oninput="document.getElementById('rate-val').innerText = this.value" style="padding:0; height:30px;">
                    </div>
                    <div class="form-group">
                        <label class="form-label" style="display:flex; justify-content:space-between;">${i18n.t('filter_community_note')} <span><span id="comm-rate-val">${activeFilters.community_rating || 0}</span>/5</span></label>
                        <input type="range" name="community_rating" class="form-input" min="0" max="5" step="0.1" value="${activeFilters.community_rating || 0}" 
                            oninput="document.getElementById('comm-rate-val').innerText = this.value" style="padding:0; height:30px;">
                    </div>
                </div>
            </div>

            <!-- TAB: ATTRIBUTS -->
            <div id="tab-attr" class="tab-pane" style="display:none;">
                <div class="stat-card mb-20" style="margin-bottom:15px;">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_alc_vol')}</h4>
                    <div class="form-group" style="margin-bottom:15px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                        <label class="form-label">${i18n.t('filter_label_degree')}</label>
                        <select id="alc-mode" name="alcMode" class="form-select" style="margin-bottom:10px;">
                            <option value="max" ${activeFilters.alcMode === 'max' ? 'selected' : ''}>${i18n.t('filter_alc_max')}</option>
                            <option value="range" ${activeFilters.alcMode === 'range' ? 'selected' : ''}>${i18n.t('filter_alc_range')}</option>
                            <option value="exact" ${activeFilters.alcMode === 'exact' ? 'selected' : ''}>${i18n.t('filter_alc_exact')}</option>
                        </select>
                        <div id="alc-inputs"></div>
                    </div>
                    
                    <div class="form-group" style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                        <label class="form-label">Volume (ml)</label>
                        <select id="vol-mode" name="volMode" class="form-select" style="margin-bottom:10px;">
                            <option value="any" ${!activeFilters.volMode || activeFilters.volMode === 'any' ? 'selected' : ''}>${i18n.t('filter_any')}</option>
                            <option value="range" ${activeFilters.volMode === 'range' ? 'selected' : ''}>${i18n.t('filter_alc_range')}</option>
                            <option value="exact" ${activeFilters.volMode === 'exact' ? 'selected' : ''}>${i18n.t('filter_alc_exact')}</option>
                        </select>
                        <div id="vol-inputs"></div>
                    </div>
                </div>

                <div class="stat-card mb-20">
                    <h4 style="margin-bottom:10px;">${i18n.t('filter_production')}</h4>
                    <div class="form-group" style="margin-bottom:10px;">
                        <label class="form-label">${i18n.t('filter_production_label')}</label>
                        <select name="production_volume" class="form-select">${createOptions(prodVolumes, activeFilters.production_volume || 'All')}</select>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label class="form-label">${i18n.t('detail_distribution')}</label>
                        <select name="distribution" class="form-select">${createOptions(distributions, activeFilters.distribution || 'All')}</select>
                    </div>
                    <label style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:8px; cursor:pointer;">
                        <span style="font-size:0.95rem;">${i18n.t('detail_barrel_aged')}</span>
                        <input type="checkbox" name="barrel_aged" id="barrel_aged" ${activeFilters.barrel_aged ? 'checked' : ''} style="width:20px; height:20px;">
                    </label>
                    <div class="form-group" style="margin-top:15px;">
                        <label class="form-label">${i18n.t('detail_ingredients')}</label>
                        <input type="text" name="ingredients" class="form-input" placeholder="${i18n.t('detail_ingredients_placeholder')}" value="${activeFilters.ingredients || ''}">
                    </div>
                </div>
            </div>

        </form>

        <!-- FOOTER -->
        <div style="background:var(--bg-card); padding:15px 20px; border-top:1px solid rgba(255,255,255,0.1); border-radius:0 0 12px 12px; flex-shrink:0;">
            <button type="submit" form="filter-form" class="btn-primary" style="margin:0; width:100%; font-size:1.1rem; box-shadow:0 -5px 20px rgba(0,0,0,0.5);">${i18n.t('detail_btn_apply_filters')}</button>
        </div>
    `;

    // Dynamic Alcohol Input logic
    const alcContainer = wrapper.querySelector('#alc-inputs');
    const alcModeSelect = wrapper.querySelector('#alc-mode');

    const renderAlcInputs = (mode) => {
        if (mode === 'max') {
            alcContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="range" name="alcMax" class="form-input" min="0" max="15" step="0.5" value="${activeFilters.alcMax || 15}" 
                        oninput="document.getElementById('alc-display-max').innerText = this.value" style="padding:0; height:30px; flex:1;">
                    <span style="min-width:45px; text-align:right;"><span id="alc-display-max">${activeFilters.alcMax || 15}</span>%</span>
                </div>
            `;
        } else if (mode === 'range') {
            alcContainer.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="number" name="alcMin" class="form-input" placeholder="Min" step="0.1" value="${activeFilters.alcMin || ''}" style="flex:1;">
                    <span>${i18n.t('detail_range_separator')}</span>
                    <input type="number" name="alcMax" class="form-input" placeholder="Max" step="0.1" value="${activeFilters.alcMax || ''}" style="flex:1;">
                </div>
            `;
        } else if (mode === 'exact') {
            alcContainer.innerHTML = `
                 <input type="number" name="alcExact" class="form-input" placeholder="Ex: 5.5" step="0.1" value="${activeFilters.alcExact || ''}">
            `;
        }
    };

    alcModeSelect.onchange = (e) => renderAlcInputs(e.target.value);
    renderAlcInputs(activeFilters.alcMode || 'max'); // Init

    // Dynamic Volume Input logic
    const volContainer = wrapper.querySelector('#vol-inputs');
    const volModeSelect = wrapper.querySelector('#vol-mode');

    const renderVolInputs = (mode) => {
        if (mode === 'any') {
            volContainer.innerHTML = `<div style="color:#aaa; font-style:italic; font-size:0.9rem;">${i18n.t('detail_all_volumes')}</div>`;
        } else if (mode === 'range') {
            volContainer.innerHTML = `
                 <div style="display:flex; gap:10px; align-items:center;">
                    <input type="number" name="volMin" class="form-input" placeholder="Min (ml)" step="10" value="${activeFilters.volMin || ''}" style="flex:1;">
                    <span>${i18n.t('detail_range_separator')}</span>
                    <input type="number" name="volMax" class="form-input" placeholder="Max (ml)" step="10" value="${activeFilters.volMax || ''}" style="flex:1;">
                </div>
            `;
        } else if (mode === 'exact') {
            volContainer.innerHTML = `
                 <input type="number" name="volExact" class="form-input" placeholder="Ex: 330 (ml)" step="10" value="${activeFilters.volExact || ''}">
            `;
        }
    };

    volModeSelect.onchange = (e) => renderVolInputs(e.target.value);
    renderVolInputs(activeFilters.volMode || 'any');

    // Reset Button
    wrapper.querySelector('#btn-reset-top').onclick = () => {
        onApply({});
        closeModal();
    };

    // Tabs functionality
    const tabs = wrapper.querySelectorAll('.ftab');
    const panes = wrapper.querySelectorAll('.tab-pane');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => { t.style.background = '#333'; t.style.color = '#fff'; });
            tab.style.background = 'var(--accent-gold)';
            tab.style.color = '#000';
            const targetId = tab.getAttribute('data-tab');
            panes.forEach(pane => {
                pane.style.display = pane.id === targetId ? 'block' : 'none';
            });
        };
    });

    // Checkbox styling toggle on click (Type and Rarity)
    wrapper.querySelectorAll('label > .cb-type').forEach(cb => {
        cb.onchange = (e) => {
            const label = e.target.closest('label');
            const span = label.querySelector('span');
            if (e.target.checked) {
                label.style.background = 'rgba(255,192,0,0.2)';
                label.style.borderColor = 'var(--accent-gold)';
                span.style.color = 'var(--accent-gold)';
            } else {
                label.style.background = 'rgba(255,255,255,0.05)';
                label.style.borderColor = 'transparent';
                span.style.color = '#fff';
            }
        };
    });

    wrapper.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        // Collect Rarity & Type Checkboxes manually
        const rarity = [];
        wrapper.querySelectorAll('.cb-rarity:checked').forEach(cb => rarity.push(cb.value));

        const typeSelected = [];
        wrapper.querySelectorAll('.cb-type:checked').forEach(cb => typeSelected.push(cb.value));

        const filters = Object.fromEntries(formData.entries());
        filters.onlyFavorites = formData.get('onlyFavorites') === 'on';
        filters.ignoreFavorites = formData.get('ignoreFavorites') === 'on';
        filters.onlyCustom = formData.get('onlyCustom') === 'on';
        filters.barrel_aged = formData.get('barrel_aged') === 'on';
        filters.rarity = rarity;
        filters.type = typeSelected;

        onApply(filters);
        closeModal();
    };

    openModal(wrapper);
}

export function renderBeerDetail(beer, onSave) {
    const existingData = Storage.getBeerRating(beer.id) || {};
    const template = Storage.getRatingTemplate();

    const wrapper = document.createElement('div');
    const rarityClass = (existingData.count > 0 && beer.rarity && beer.rarity !== 'base') ? `modal-rarity-${beer.rarity}` : 'modal-rarity-base';
    wrapper.className = `modal-content ${rarityClass}`;

    // Assure that there is an explicit generic border class in CSS, we'll inline a fallback just in case or add it to style.css in next step.
    wrapper.style.border = '2px solid transparent'; // Will be overridden by CSS classes

    let imgPath = beer.image;
    if (!imgPath) imgPath = 'images/beer/default.png';

    const renderHistoryPanel = (historyData) => {
        const historyPanel = wrapper.querySelector('#beer-history-panel');
        if (!historyPanel) return;
        if (historyData && historyData.length > 0) {
            const sortedHistory = [...historyData].sort((a, b) => new Date(b.date) - new Date(a.date));
            let histHtml = `<h4 style="margin-bottom:10px; font-size:1rem; color:var(--accent-gold); text-align:left;">${i18n.t('detail_history')}</h4>`;
            histHtml += `<div style="max-height:150px; overflow-y:auto; padding-right:5px; scrollbar-width:thin; font-size:0.85rem; text-align:left;">`;
            sortedHistory.forEach(h => {
                const dt = new Date(h.date);
                const dateStr = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                histHtml += `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:8px 0;">
                        <span>${dateStr} ${timeStr}</span>
                        <span style="color:#aaa;">${h.volume ? h.volume + 'ml' : ''}</span>
                    </div>
                `;
            });
            histHtml += `</div>`;
            historyPanel.innerHTML = histHtml;
        } else {
            historyPanel.innerHTML = '';
        }
    };

    // Build Dynamic Form
    let formFields = template.map(field => {
        const value = existingData[field.id] !== undefined ? existingData[field.id] : '';
        const label = i18n.t(field.label);

        if (field.type === 'number') {
            return `
                <div class="form-group">
                    <label class="form-label">${label}</label>
                    <input type="number" class="form-input" name="${field.id}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}" placeholder="${i18n.t('detail_note_placeholder')}">
                </div>`;
        } else if (field.type === 'textarea') {
            return `
                <div class="form-group">
                    <label class="form-label">${label}</label>
                    <textarea class="form-textarea" name="${field.id}" rows="3">${value}</textarea>
                </div>`;
        } else if (field.type === 'range') {
            const min = field.min !== undefined ? field.min : 0;
            const max = field.max !== undefined ? field.max : 10;
            const step = field.step !== undefined ? field.step : 1;
            const displayVal = value !== '' ? value : min;

            return `
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;">
                        <span>${label}</span>
                        <span id="val-${field.id}">${displayVal}/${max}</span>
                    </label>
                    <input type="range" class="form-input" name="${field.id}" min="${min}" max="${max}" step="${step}" value="${displayVal}"
                        oninput="document.getElementById('val-${field.id}').innerText = this.value + '/${max}'"
                        style="padding:0; height:40px;">
                </div>`;
        } else if (field.type === 'checkbox') {
            return `
                <div class="form-group" style="display:flex; align-items:center; gap:10px; background:var(--bg-card); padding:10px; border-radius:8px;">
                    <input type="checkbox" name="${field.id}" ${value ? 'checked' : ''} style="width:20px; height:20px;">
                        <label class="form-label" style="margin:0;">${label}</label>
                </div>`;
        }
        return '';
    }).join('');

    // --- Consumption Section ---
    const consumptionWrapper = document.createElement('div');
    consumptionWrapper.style.cssText = 'background:var(--bg-card); padding:15px; border-radius:12px; margin-bottom:20px; text-align:center;';

    // Default Volume logic: always use the beer's own volume
    let defaultVol = Utils.formatVolume(beer.volume) || '33cl';
    // For kegs (>1L), default to 50cl since nobody drinks 20L at once
    const volStr = defaultVol.toLowerCase();
    const numericVol = parseFloat(volStr) || 0;
    const isKegVol = volStr.includes('fut') || volStr.includes('fût') ||
        (volStr.includes('l') && !volStr.includes('cl') && !volStr.includes('ml') && numericVol >= 1) ||
        (volStr.includes('ml') && numericVol >= 1000);
    if (isKegVol) defaultVol = '50cl';
    // Clean string for display
    defaultVol = defaultVol.replace('.', ',');

    // Always use the beer's volume, not the last user selection
    const lastVolume = defaultVol;

    consumptionWrapper.innerHTML = `
                <h3 style="margin-bottom:10px; font-size:1rem;">${i18n.t('detail_consumption_title')}</h3>
                <div style="font-size:2rem; font-weight:bold; color:var(--accent-gold); margin-bottom:10px;">
                    <span id="consumption-count">${existingData.count || 0}</span> <span style="font-size:1rem; color:#666;">${i18n.t('detail_times')}</span>
                </div>

                <div class="form-group">
                    <label class="form-label" style="margin-bottom:5px;">${i18n.t('detail_volume_drunk')}</label>
                    <div class="vol-preset-grid" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                        <button type="button" class="vol-btn" data-vol="15cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">15 cl</button>
                        <button type="button" class="vol-btn" data-vol="25cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">25 cl</button>
                        <button type="button" class="vol-btn" data-vol="33cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">33 cl</button>
                        <button type="button" class="vol-btn" data-vol="50cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">50 cl</button>
                        <button type="button" class="vol-btn" data-vol="75cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">75 cl</button>
                        <button type="button" class="vol-btn" data-vol="150cl" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">150 cl</button>
                        <button type="button" class="vol-btn" data-vol="custom" style="background:var(--bg-dark); border:1px solid #444; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.9rem; flex:1 1 30%; max-width:120px;">Personnalisé</button>
                    </div>
                    <div id="custom-vol-container" style="display: none; transition: 0.3s; text-align: center;">
                        <input type="text" id="custom-vol-input" class="form-input" placeholder="ex: 12.5cl ou 330ml" style="text-align: center;">
                    </div>
                    <div style="margin-top: 15px; margin-bottom: 15px;">
                        <label class="form-label" style="margin-bottom:5px; font-size: 0.85rem; color:#888;">${i18n.t('tasting_date_override')}</label>
                        <input type="datetime-local" id="consumption-date" class="form-input" style="text-align: center; background: var(--bg-dark); color: #fff; border: 1px solid #444; border-radius: 8px; color-scheme: dark; padding: 10px; width: 100%;">
                    </div>
                    <input type="hidden" id="consumption-volume" value="${lastVolume}">
                </div>

                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="btn-drink" class="btn-primary" style="margin:0; background:var(--success);">${i18n.t('detail_btn_drink')}</button>
                    <button id="btn-undrink" class="btn-primary" style="margin:0; background:var(--bg-card); border:1px solid #444; color:#aaa; width:auto;">${i18n.t('detail_btn_undrink')}</button>
                </div>
                <p style="font-size:0.75rem; color:#666; margin-top:10px;">${i18n.t('detail_drink_desc')}</p>
                <div id="beer-history-panel" style="margin-top: 15px; margin-bottom: 15px;"></div>
                `;

    // --- Custom Beer Actions ---
    // Always render the container; buttons are injected dynamically
    const customActionsHtml = beer.id.startsWith('CUSTOM_') ? `
        <div id="custom-actions-container" style="margin-top:20px; border-top:1px solid #333; padding-top:20px; display:flex; gap:10px;">
            <button id="btn-edit-beer" class="form-input" style="flex:1;">${i18n.t('detail_btn_edit')}</button>
            <button id="btn-delete-beer" class="form-input" style="flex:1; color:var(--danger); border-color:var(--danger);">${i18n.t('detail_btn_delete')}</button>
        </div>
    ` : `<div id="custom-actions-container"></div>`;

    // --- Rarity Logic Definition ---
    // Moved logic here: Reveal state is now tied to consumption (count > 0)
    const initRarityLogic = (forceReveal = false) => {
        const rarityContainer = wrapper.querySelector('#rarity-badge-container');
        if (!rarityContainer) return;

        // Determine if unlocked: Drunk at least once OR forceReveal triggered
        const isUnlocked = existingData.count > 0 || forceReveal;

        const renderBadge = () => {
            rarityContainer.innerHTML = '';

            if (beer.rarity && beer.rarity !== 'base') {
                if (isUnlocked) {
                    const badge = document.createElement('div');
                    const animOnce = Storage.getPreference('anim_only_once', false);
                    const hasPlayed = window.__playedAnims.has(`${beer.id}_modal`);

                    // Base badge class
                    badge.className = `rarity-badge rarity-${beer.rarity}`;

                    // Only add animation if it hasn't played or setting is OFF
                    if (!animOnce || !hasPlayed) {
                        badge.classList.add(`anim-${beer.rarity}`);
                        window.__playedAnims.add(`${beer.id}_modal`);
                        if (window.savePlayedAnims) window.savePlayedAnims();
                    }

                    badge.innerText = i18n.t('rarity_' + beer.rarity);
                    rarityContainer.appendChild(badge);
                } else {
                    const hiddenBadge = document.createElement('div');
                    hiddenBadge.className = 'rarity-badge rarity-hidden';
                    hiddenBadge.innerText = '???';
                    // No click handler anymore, must drink to unlock
                    rarityContainer.appendChild(hiddenBadge);
                }
            }

            if (beer.isSeasonal) {
                const seasonBadge = document.createElement('div');
                seasonBadge.className = 'rarity-badge rarity-saisonniere';
                seasonBadge.innerHTML = i18n.t('detail_seasonal');
                rarityContainer.appendChild(seasonBadge);
            }
        };

        renderBadge();
    };

    // Image Fallback Logic
    const isKeg = (vol) => {
        if (!vol) return false;
        const v = vol.toUpperCase();
        return v.includes('20 L') || v.includes('30 L') || v.includes('50 L') || v.includes('FUT');
    };
    const fallbackImage = isKeg(beer.volume) ? 'images/beer/FUT.jpg' : 'images/beer/default.png';

    let displayImage = imgPath;
    if (!displayImage || (displayImage.includes('FUT.jpg') && !isKeg(beer.volume))) {
        displayImage = fallbackImage;
    }

    const isFav = Storage.isFavorite(beer.id);

    wrapper.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <button id="btn-toggle-fav" style="background:none; border:none; font-size:1.8rem; cursor:pointer;">
                        ${isFav ? '⭐' : '🤍'}
                    </button>
                    <button id="btn-close-modal" style="background:none; border:none; color:#fff; font-size:1.8rem; cursor:pointer;">&times;</button>
                </div>

                <div style="text-align: center; margin-bottom: 20px;">
                    ${beer.id === 'NEVER_GONNA_GIVE_YOU_ALE_AMBREE_0.50' ? `
                        <video src="images/Rickroll.mp4" autoplay loop muted playsinline style="height: 150px; object-fit: contain; border-radius: 8px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));"></video>
                    ` : `
                        <img src="${displayImage}" style="height: 150px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));" 
                             onload="removeImageBackground(this)"
                             onerror="if(this.src.includes('${fallbackImage}')) return; this.src='${fallbackImage}';">
                    `}
                        <h2 style="margin-top: 10px; color: var(--accent-gold);">${beer.title}</h2>
                        <p style="color: #888;">${beer.brewery} - ${beer.type}</p>
                        <div style="display: flex; justify-content: center; gap: 15px; margin-top: 5px; font-size: 0.8rem; color: #aaa;">
                            <span>${beer.alcohol || '?'}</span>
                            <span>${Utils.formatVolume(beer.volume) || '?'}</span>
                        </div>
                        <div id="rarity-badge-container" style="margin-top:10px; display:flex; justify-content:center; gap:5px; flex-wrap:wrap;">
                            <!-- Auto-injected by JS logic below -->
                        </div>
                </div>

                ${consumptionWrapper.outerHTML}

                <div class="info-panel">
                    <h4>${i18n.t('info_title')}</h4>
                    <div class="info-stats-grid">
                        ${(() => {
            const abvVal = parseFloat((beer.alcohol || '0').replace('%', '').replace('°', '').replace(',', '.')) || 0;
            const volMl = (() => {
                const s = (beer.volume || '').toLowerCase();
                if (s.includes('ml')) return parseFloat(s) || 330;
                if (s.includes('cl')) return (parseFloat(s) || 33) * 10;
                if (s.includes('l')) return (parseFloat(s) || 0.33) * 1000;
                const v = parseFloat(s) || 33;
                return v < 5 ? v * 1000 : (v < 100 ? v * 10 : v);
            })();
            const gramsAlc = volMl * (abvVal / 100) * 0.8;
            const mlAlc = volMl * (abvVal / 100);
            const calories = Math.round(gramsAlc * 7 + (volMl * 0.03)); // ~7kcal/g alcohol + carbs approx

            // Speculative BAC
            let bacHtml = '';
            if (Storage.getPreference('bac_enabled', true)) {
                const driveInfo = BAC.getSpeculativeDriveInfo(beer.volume, beer.alcohol);
                if (driveInfo) {
                    const waitText = driveInfo.timeStr ? i18n.t('info_wait_drive', { time: driveInfo.timeStr }) : i18n.t('info_ok_drive');
                    bacHtml = `
                                        <div class="info-stat-card info-stat-wide bac-status-card" style="--bac-color:${driveInfo.color};">
                                            <span class="stat-icon">${driveInfo.icon}</span>
                                            <span class="stat-value" style="color:${driveInfo.color};">+${driveInfo.delta.toFixed(2)} g/l</span>
                                            <span class="stat-label">${waitText}</span>
                                        </div>
                                    `;
                }
            }

            return `
                                <div class="info-stat-card">
                                    <span class="stat-icon">🧪</span>
                                    <span class="stat-value">${gramsAlc.toFixed(1)}g</span>
                                    <span class="stat-label">${i18n.t('info_label_pure_alcohol')}</span>
                                </div>
                                <div class="info-stat-card">
                                    <span class="stat-icon">💧</span>
                                    <span class="stat-value">${mlAlc.toFixed(1)}ml</span>
                                    <span class="stat-label">${i18n.t('info_label_vol_alcohol')}</span>
                                </div>
                                <div class="info-stat-card">
                                    <span class="stat-icon">🔥</span>
                                    <span class="stat-value">${calories}</span>
                                    <span class="stat-label">${i18n.t('info_label_calories')}</span>
                                </div>
                                <div class="info-stat-card">
                                    <span class="stat-icon">🍺</span>
                                    <span class="stat-value">${abvVal}°</span>
                                    <span class="stat-label">${i18n.t('info_label_degree')}</span>
                                </div>
                                ${bacHtml}
                            `;
        })()}
                    </div>
                    ${(beer.production_volume || beer.distribution || beer.barrel_aged !== undefined || beer.community_rating || beer.ingredients) ? `
                    <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06);">
                        <div class="info-stats-grid">
                            ${beer.production_volume ? `
                                <div class="info-stat-card">
                                    <span class="stat-icon">🏭</span>
                                    <span class="stat-value" style="font-size:0.9rem;">${beer.production_volume}</span>
                                    <span class="stat-label">${i18n.t('info_label_production')}</span>
                                </div>` : ''}
                            ${beer.distribution ? `
                                <div class="info-stat-card">
                                    <span class="stat-icon">🚚</span>
                                    <span class="stat-value" style="font-size:0.9rem;">${beer.distribution}</span>
                                    <span class="stat-label">${i18n.t('info_label_distribution')}</span>
                                </div>` : ''}
                            ${beer.barrel_aged !== undefined ? `
                                <div class="info-stat-card">
                                    <span class="stat-icon">🪵</span>
                                    <span class="stat-value" style="font-size:0.9rem;">${beer.barrel_aged ? i18n.t('yes') : i18n.t('no')}</span>
                                    <span class="stat-label">${i18n.t('info_label_barrel_aged')}</span>
                                </div>` : ''}
                            ${beer.community_rating ? `
                                <div class="info-stat-card">
                                    <span class="stat-icon">⭐</span>
                                    <span class="stat-value" style="font-size:0.9rem;">${beer.community_rating}/5</span>
                                    <span class="stat-label">${i18n.t('info_label_community')}</span>
                                </div>` : ''}
                            ${beer.ingredients ? `
                                <div class="info-stat-card info-stat-wide" style="display:flex; flex-direction:row; align-items:center; gap:10px; padding:10px; justify-content: flex-start;">
                                    <span class="stat-icon" style="margin:0;">🌿</span>
                                    <div style="text-align:left;">
                                        <span class="stat-label" style="display:block; margin:0; text-align:left;">${i18n.t('info_label_ingredients')}</span>
                                        <span class="stat-value" style="font-size:0.85rem; line-height:1.2; white-space:normal; display:block; margin-top:2px; text-transform:none;">${beer.ingredients}</span>
                                    </div>
                                </div>` : ''}
                        </div>
                    </div>
                    ` : ''}
                </div>

                <details style="background:var(--bg-card); padding:10px; border-radius:12px; margin-bottom:20px;">
                    <summary style="font-weight:bold; cursor:pointer; list-style:none;">📝 ${i18n.t('info_label_tasting_note')} ${existingData.score ? '✅' : ''}</summary>
                    <form id="rating-form" style="margin-top:15px;">
                        ${formFields}

                        <div style="margin-top:20px; border-top:1px solid #333; padding-top:15px; padding-bottom: 15px;">
                            <label class="form-label" style="text-align:center; display:block; margin-bottom:10px;">Sélectionnez les arômes ressentis</label>
                            <div id="aroma-wheel-container"></div>
                        </div>

                        <button type="submit" class="btn-primary">${i18n.t('info_btn_save_note')}</button>
                    </form>
                </details>

                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <button id="btn-share-beer" class="form-input" style="flex:1;">📤 ${i18n.t('info_btn_link')}</button>
                    <button id="btn-share-insta" class="form-input" style="flex:1;">📸 ${i18n.t('info_btn_fast_story')}</button>
                </div>
                <button id="btn-share-advanced" class="btn-primary" style="margin-top:0; border:1px solid var(--accent-gold); color:var(--accent-gold); background:transparent;">
                    ✨ ${i18n.t('info_btn_custom_story')}
                </button>

                ${customActionsHtml}
                `;

    // Volume Presets Logic
    const volBtns = wrapper.querySelectorAll('.vol-btn');
    const hiddenVol = wrapper.querySelector('#consumption-volume');
    const customVolContainer = wrapper.querySelector('#custom-vol-container');
    const customVolInput = wrapper.querySelector('#custom-vol-input');

    const updateVolUI = (vol) => {
        let isCustom = true;
        volBtns.forEach(btn => {
            if (btn.dataset.vol === vol) {
                btn.style.background = 'var(--accent-gold)';
                btn.style.color = '#000';
                btn.style.borderColor = 'var(--accent-gold)';
                btn.style.fontWeight = 'bold';
                isCustom = false;
            } else {
                btn.style.background = 'var(--bg-dark)';
                btn.style.color = '#fff';
                btn.style.borderColor = '#444';
                btn.style.fontWeight = 'normal';
            }
        });
        
        if (isCustom) {
            const customBtn = wrapper.querySelector('[data-vol="custom"]');
            customBtn.style.background = 'var(--accent-gold)';
            customBtn.style.color = '#000';
            customBtn.style.borderColor = 'var(--accent-gold)';
            customBtn.style.fontWeight = 'bold';
            customVolContainer.style.display = 'block';
            customVolInput.value = vol;
        } else {
            customVolContainer.style.display = 'none';
        }
    };

    volBtns.forEach(btn => {
        btn.onclick = () => {
            const v = btn.dataset.vol;
            if (v === 'custom') {
                updateVolUI(customVolInput.value || '33cl');
            } else {
                hiddenVol.value = v;
                updateVolUI(v);
                Storage.savePreference('last_volume_preset', v);
            }
        };
    });

    customVolInput.oninput = (e) => {
        hiddenVol.value = e.target.value;
        Storage.savePreference('last_volume_preset', e.target.value);
    };

    // Init Volume UI
    updateVolUI(hiddenVol.value);

    // Initialize Aroma Wheel from within the modal wrapper
    let currentAromas = existingData.aromas || [];
    const aromaWheel = new AromaWheel(wrapper.querySelector('#aroma-wheel-container'), currentAromas, (selected) => {
        currentAromas = selected;
    });

    // Initialize Rarity Logic *after* HTML is in DOM
    initRarityLogic();

    // Close Modal Handler
    wrapper.querySelector('#btn-close-modal').onclick = () => {
        closeModal();
    };

    // Toggle Favorite Handler
    const btnFav = wrapper.querySelector('#btn-toggle-fav');
    btnFav.onclick = () => {
        const isNowFav = Storage.toggleFavorite(beer.id);
        btnFav.innerHTML = isNowFav ? '⭐' : '🤍';

        // Trigger save callback to update list if needed? 
        // Or just let user refresh manually. 
        // Achievements check might not be needed for favs, but consistent state is good.
        if (onSave) onSave(null);
    };

    // Share Link Handler
    wrapper.querySelector('#btn-share-beer').onclick = async () => {
        showToast(i18n.t('toast_preparing_share'));
        await Storage.shareBeer(beer);
    };

    // Share Image Handler (Insta-Beer)
    wrapper.querySelector('#btn-share-insta').onclick = async () => {
        // Default behavior: uses existing score/comment
        showToast(i18n.t('toast_generating_image'));
        // API.handleShare or Share.shareImage directly?
        // Let's use the API trigger to be safe or Share module directly if available
        // We need 'api.js' handleShare logic but without params overrides
        // Better: call Share directly for "Fast Mode"
        const blob = await window.Share.generateBeerCard(beer, existingData.score || 0, existingData.comment || '');
        window.Share.shareImage(blob, `Check-in ${beer.title}`);
    };

    // Advanced Share
    wrapper.querySelector('#btn-share-advanced').onclick = () => {
        renderAdvancedShareModal(beer, existingData);
    };
    wrapper.querySelector('#btn-share-insta').onclick = async () => {
        const btn = wrapper.querySelector('#btn-share-insta');
        const originalText = btn.innerHTML;
        btn.innerHTML = i18n.t('reveal_creating');

        try {
            // Get user data
            const existingData = Storage.getBeerRating(beer.id) || {};
            const userRating = existingData.score || 0;
            const userComment = existingData.comment || "";

            const blob = await Share.generateBeerCard(beer, userRating, userComment);
            await Share.shareImage(blob, i18n.t('share_title_checkin', { title: beer.title }));
            btn.innerHTML = originalText;
        } catch (err) {
            console.error(err);
            btn.innerHTML = originalText;
            showToast(err.message === 'Web Share API not supported' ? i18n.t('toast_share_unsupported') : i18n.t('toast_share_error'));
        }
    };

    // Re-binding Logic for Consumption
    wrapper.querySelector('#btn-drink').onclick = async () => {
        // --- SMART CACHING LOGIC ---
        // If beer is from API (Transient), we must save it first!
        if (beer.fromAPI) {
            const newBeer = { ...beer };
            // Use timestamp ID for permanent storage
            newBeer.id = 'CUSTOM_' + Date.now();
            delete newBeer.fromAPI; // Remove flag

            // Save
            Storage.saveCustomBeer(newBeer);

            // Update local beer reference in Modal
            // We can't easily swap the whole object reference for the caller, but we can update IDs
            // Actually it's better to update the 'beer' variable in this scope
            // But existingData is fetched by ID.

            // 1. Show Toast
            showToast(i18n.t('toast_beer_saved_dex'));

            // 2. Mock the switch
            const oldId = beer.id;
            beer.id = newBeer.id;
            beer.fromAPI = false;

            // 3. Since we changed ID, existingData (rating) is theoretically empty (which is true for new API beer)
            // But we are about to add consumption.

            // 4. IMPORTANT: We must signal the app to reload the list because we added a beer
            // We can dispatch event, but current view might not update instantly if we don't force it.
            window.dispatchEvent(new CustomEvent('beerdex-action'));

            // 5. Inject Edit/Delete buttons now that it's a CUSTOM_ beer
            const actionsContainer = wrapper.querySelector('#custom-actions-container');
            if (actionsContainer && !actionsContainer.querySelector('#btn-edit-beer')) {
                actionsContainer.innerHTML = `
                    <button id="btn-edit-beer" class="form-input" style="flex:1;">${i18n.t('detail_btn_edit')}</button>
                    <button id="btn-delete-beer" class="form-input" style="flex:1; color:var(--danger); border-color:var(--danger);">${i18n.t('detail_btn_delete')}</button>
                `;
                actionsContainer.style.cssText = 'margin-top:20px; border-top:1px solid #333; padding-top:20px; display:flex; gap:10px;';
                actionsContainer.querySelector('#btn-delete-beer').onclick = async () => {
                    if (await showConfirmModal(i18n.t('modal_confirm_delete_beer'))) {
                        Storage.deleteCustomBeer(beer.id);
                        closeModal();
                        showToast(i18n.t('toast_beer_deleted'));
                        setTimeout(() => location.reload(), 500);
                    }
                };
                actionsContainer.querySelector('#btn-edit-beer').onclick = () => {
                    closeModal();
                    setTimeout(() => {
                        renderAddBeerForm((updatedBeer) => {
                            showToast(i18n.t('toast_beer_modified'));
                            setTimeout(() => location.reload(), 500);
                        }, beer);
                    }, 60);
                };
            }
        }

        const wasLocked = !existingData.count || existingData.count === 0;

        if (beer.id === 'NEVER_GONNA_GIVE_YOU_ALE_AMBREE_0.50') {
            const trollAudio = new Audio('images/music/Trolololo.mp3');
            trollAudio.play().catch(err => console.log('Audio playback failed', err));
        }

        const vol = wrapper.querySelector('#consumption-volume').value;
        const dateOverride = wrapper.querySelector('#consumption-date') ? wrapper.querySelector('#consumption-date').value : null;
        const newData = Storage.addConsumption(beer.id, vol, dateOverride);

        // --- BAC INTEGRATION ---
        if (Storage.getPreference('bac_enabled', true) && !Storage.getPreference('bac_manual_only', false)) {
            BAC.addDrinkToBAC(vol, beer.alcohol || 5.0, dateOverride);
        }

        Analytics.track('beer_consumed', {
            beer_id: beer.id,
            name: beer.title,
            brewery: beer.brewery || i18n.t('label_unknown'),
            type: beer.type || i18n.t('label_unknown'),
            volume: vol
        });

        // Update local object reference for immediate UI updates relying on it
        existingData.count = newData.count;
        wrapper.querySelector('#consumption-count').innerText = newData.count;
        renderHistoryPanel(newData.history);

        showToast(i18n.t('toast_glou_glou', { vol: vol }));

        // Premium Reveal Sequence if FIRST TIME
        if (wasLocked && beer.rarity && beer.rarity !== 'base') {
            // Create Premium Overlay
            const overlay = document.createElement('div');
            overlay.className = 'reveal-overlay premium-reveal';

            // Get Rarity Info
            const rarityColors = {
                'commun': '#2ecc71',
                'rare': '#3498db',
                'super_rare': '#00bcd4',
                'epique': '#9b59b6',
                'mythique': '#e74c3c',
                'legendaire': '#f39c12',
                'ultra_legendaire': '#ff00cc'
            };
            const particleColor = rarityColors[beer.rarity] || '#FFC000';
            const rarityName = i18n.t('rarity_' + beer.rarity).toUpperCase();

            // Construct a clone of the actual card for the reveal
            const fallbackImage = isKeg(beer.volume) ? 'images/beer/FUT.jpg' : 'images/beer/default.png';
            let displayImage = beer.image;
            if (!displayImage || (displayImage.includes('FUT.jpg') && !isKeg(beer.volume))) {
                displayImage = fallbackImage;
            }

            // Create Canvas for Particles
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index: 5;';

            overlay.innerHTML = `
                <div class="premium-reveal-container" style="position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%;">
                    
                    <!-- Mystery Capsule (Phase 1) -->
                    <div id="mystery-box" style="width: 140px; height: 140px; background: linear-gradient(135deg, #222, #000); border: 4px solid var(--accent-gold); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 30px var(--accent-gold); transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                        <span style="font-size: 4rem; filter: drop-shadow(0 0 10px var(--accent-gold));">🍺</span>
                    </div>

                    <!-- Revealed Content (Phase 2) -->
                    <div id="revealed-content" style="display: none; flex-direction: column; align-items: center; width: 100%; padding: 20px;">
                        <h2 class="animate__animated animate__fadeInDown" style="color: ${particleColor}; text-shadow: 0 0 20px ${particleColor}; font-size: clamp(1.8rem, 5vw, 2.5rem); margin-bottom: 30px; text-transform: uppercase; font-weight: 900; letter-spacing: 2px; text-align: center;">${i18n.t('reveal_new_beer')}</h2>
                        
                        <div class="reveal-card-wrapper animate__animated animate__zoomIn" data-tilt data-tilt-glare data-tilt-max-glare="0.8" style="perspective: 1000px; max-width: 90vw;">
                            <div class="beer-card card-rarity-${beer.rarity} ${beer.rarity === 'ultra_legendaire' ? 'card-anim-ultra_legendary' : ''}" style="width: 260px; height: auto; min-height: 400px; margin: 0; background: var(--bg-card); display: flex; flex-direction: column; cursor: pointer; border-width: 3px;">
                                
                                <div style="width:100%; height:200px; display:flex; justify-content:center; align-items:center; margin-bottom: 15px;">
                                    ${beer.id === 'NEVER_GONNA_GIVE_YOU_ALE_AMBREE_0.50' ? `
                                        <video src="images/Rickroll.mp4" autoplay loop muted playsinline style="max-height: 180px; object-fit: contain; border-radius: 8px;"></video>
                                    ` : `
                                        <img src="${displayImage}" alt="${beer.title}" class="beer-image" style="max-height: 180px; object-fit: contain;" onload="removeImageBackground(this)">
                                    `}
                                </div>
                                <div class="beer-info" style="text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                                    <h3 class="beer-title" style="font-size: 1.5rem; margin-bottom: 5px;">${beer.title}</h3>
                                    <p class="beer-brewery" style="font-size: 1.1rem; color: #aaa;">${beer.brewery}</p>
                                </div>
                                <div class="reveal-rarity-banner" style="background: ${particleColor}; color: #000; text-align: center; font-weight: bold; padding: 10px; margin-top: 15px; border-radius: 5px; text-shadow: none; font-size: 1.2rem; text-transform: uppercase; box-shadow: 0 0 15px ${particleColor}; margin-bottom: 10px;">
                                    ${rarityName}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            overlay.appendChild(canvas);
            document.body.appendChild(overlay);

            const box = overlay.querySelector('#mystery-box');
            const content = overlay.querySelector('#revealed-content');

            // Sequence Timing
            // 1. Shake the Mystery Box
            setTimeout(() => {
                box.classList.add('rumble-effect');
                box.style.transform = 'scale(1.2)';
                box.style.boxShadow = `0 0 100px ${particleColor}`;
                box.style.borderColor = particleColor;
            }, 500);

            // 2. Explode & Reveal 
            setTimeout(() => {
                box.style.display = 'none';
                content.style.display = 'flex'; // Trigger display

                // Fireworks
                import('./fx.js').then(m => {
                    m.FX.burst(window.innerWidth / 2, window.innerHeight / 2, particleColor);
                    if (['epique', 'mythique', 'legendaire', 'ultra_legendaire'].includes(beer.rarity)) {
                        m.FX.confetti();
                    }
                    if (['mythique', 'legendaire', 'ultra_legendaire'].includes(beer.rarity)) {
                        const count = beer.rarity === 'ultra_legendaire' ? 300 : 200;
                        m.FX.particleExplosion(canvas, particleColor, count);
                    }
                }).catch(e => console.log('FX Module issue'));

                import('./feedback.js').then(m => m.Feedback.impactHeavy()).catch(e => { });

                // Initialize Tilt on Reveal
                setTimeout(() => {
                    const isTouchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
                    if (!isTouchPrimary && typeof VanillaTilt !== 'undefined') {
                        VanillaTilt.init(overlay.querySelector('.reveal-card-wrapper'), {
                            max: 15,
                            speed: 400,
                            glare: true,
                            "max-glare": 0.8,
                            scale: 1.05,
                            gyroscope: true,
                            gyroscopeMinAngleX: -45,
                            gyroscopeMaxAngleX: 45,
                            gyroscopeMinAngleY: -45,
                            gyroscopeMaxAngleY: 45
                        });
                    }
                }, 500);

            }, 2000);

            // 3. Close & cleanup after user views it or clicks
            const cleanup = () => {
                overlay.style.transition = 'opacity 0.6s';
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                    // Show Rarity Badge inside modal
                    initRarityLogic(true);

                    // Animate Badge
                    const badge = wrapper.querySelector(`.rarity-${beer.rarity}`);
                    if (badge) {
                        badge.animate([
                            { transform: 'scale(0) rotate(-180deg)', filter: 'brightness(3)' },
                            { transform: 'scale(2.5) rotate(10deg)', filter: 'brightness(2)' },
                            { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' }
                        ], { duration: 1000, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
                    }
                }, 600);
            };

            // Interaction to close
            setTimeout(() => {
                overlay.onclick = cleanup;
                setTimeout(cleanup, 5000);
            }, 4000);
        } else {
            // Normal update just in case
            initRarityLogic();
        }

        // Play Sound
        if (typeof Feedback !== 'undefined') {
            Feedback.playRarity(beer.rarity);
            Feedback.impactHeavy();
        }

        // Async achievements check
        import('./achievements.js').then(module => {
            // trigger achievement check if needed
        }).catch(err => console.error(err));

        window.dispatchEvent(new CustomEvent('beerdex-action'));
    };

    wrapper.querySelector('#btn-undrink').onclick = () => {
        const volInput = wrapper.querySelector('#consumption-volume');
        const vol = Utils.formatVolume(volInput ? volInput.value : beer.volume);
        const newData = Storage.removeConsumption(beer.id);
        if (newData) {
            // --- BAC INTEGRATION ---
            if (Storage.getPreference('bac_enabled', true) && !Storage.getPreference('bac_manual_only', false)) {
                BAC.removeDrinkFromBAC(vol, beer.alcohol || 5.0);
            }

            existingData.count = newData.count; // Update ref
            wrapper.querySelector('#consumption-count').innerText = newData.count;
            renderHistoryPanel(newData.history);
            showToast(i18n.t('toast_drink_cancelled'));

            // Re-lock if count back to 0
            if (newData.count === 0) {
                initRarityLogic(); // Will see count=0 and hide it
            }
        }
    };

    // Binding for Custom Actions (only if buttons already exist, i.e. beer was CUSTOM_ from the start)
    const existingEditBtn = wrapper.querySelector('#btn-edit-beer');
    const existingDeleteBtn = wrapper.querySelector('#btn-delete-beer');
    if (existingDeleteBtn) {
        existingDeleteBtn.onclick = async () => {
            if (await showConfirmModal(i18n.t('modal_confirm_delete_beer'))) {
                Storage.deleteCustomBeer(beer.id);
                closeModal();
                showToast(i18n.t('toast_beer_deleted'));
                setTimeout(() => location.reload(), 500);
            }
        };
    }
    if (existingEditBtn) {
        existingEditBtn.onclick = () => {
            closeModal();
            setTimeout(() => {
                renderAddBeerForm((updatedBeer) => {
                    showToast(i18n.t('toast_beer_modified'));
                    setTimeout(() => location.reload(), 500);
                }, beer);
            }, 60);
        };
    }

    wrapper.querySelector('#rating-form').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {};

        template.forEach(field => {
            if (field.type === 'checkbox') {
                data[field.id] = formData.get(field.id) === 'on';
            } else {
                data[field.id] = formData.get(field.id);
            }
        });

        // Validation for core score if present
        if (template.find(t => t.id === 'score') && !data.score) {
            showAlertModal("Veuillez mettre une note !", { icon: '⭐' });
            return;
        }

        data.aromas = currentAromas;

        onSave(data);

        // Track rating optionally filtering out null score
        if (data.score) {
            Analytics.track('beer_rated', {
                beer_id: beer.id,
                name: beer.title,
                score: data.score
            });
        }

        // If API beer, we must save likely (auto-save on rate?)
        // Similar logic to drink. If user rates, we save the beer.
        if (beer.fromAPI) {
            const newBeer = { ...beer };
            newBeer.id = 'CUSTOM_' + Date.now();
            delete newBeer.fromAPI;
            Storage.saveCustomBeer(newBeer);
            beer.id = newBeer.id; // Switch ref
            beer.fromAPI = false;

            // Now save the rating with new ID
            Storage.saveBeerRating(newBeer.id, data);

            window.dispatchEvent(new CustomEvent('beerdex-action'));
            showToast(i18n.t('toast_beer_note_saved'));

            // Inject Edit/Delete buttons now that it's a CUSTOM_ beer
            const actionsContainer = wrapper.querySelector('#custom-actions-container');
            if (actionsContainer && !actionsContainer.querySelector('#btn-edit-beer')) {
                actionsContainer.innerHTML = `
                    <button id="btn-edit-beer" class="form-input" style="flex:1;">${i18n.t('detail_btn_edit')}</button>
                    <button id="btn-delete-beer" class="form-input" style="flex:1; color:var(--danger); border-color:var(--danger);">${i18n.t('detail_btn_delete')}</button>
                `;
                actionsContainer.style.cssText = 'margin-top:20px; border-top:1px solid #333; padding-top:20px; display:flex; gap:10px;';
                actionsContainer.querySelector('#btn-delete-beer').onclick = async () => {
                    if (await showConfirmModal(i18n.t('modal_confirm_delete_beer'))) {
                        Storage.deleteCustomBeer(beer.id);
                        closeModal();
                        showToast(i18n.t('toast_beer_deleted'));
                        setTimeout(() => location.reload(), 500);
                    }
                };
                actionsContainer.querySelector('#btn-edit-beer').onclick = () => {
                    closeModal();
                    setTimeout(() => {
                        renderAddBeerForm((updatedBeer) => {
                            showToast(i18n.t('toast_beer_modified'));
                            setTimeout(() => location.reload(), 500);
                        }, beer);
                    }, 60);
                };
            }
        } else {
            showToast(i18n.t('toast_rating_saved'));
        }

        wrapper.querySelector('details').open = false;
        wrapper.querySelector('summary').innerHTML = "📝 Note de dégustation ✅";
    };

    renderHistoryPanel(existingData.history);
    openModal(wrapper);
}

export function renderAddBeerForm(onSave, editModeBeer = null, prefillData = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';

    const title = editModeBeer ? i18n.t('modal_title_edit') : i18n.t('modal_title_add');
    const btnText = editModeBeer ? i18n.t('btn_save_changes') : i18n.t('btn_add');

    // Fill values: Priority -> editModeBeer -> prefillData -> ''
    const v = (key) => {
        if (editModeBeer && editModeBeer[key]) return editModeBeer[key];
        if (prefillData && prefillData[key]) return prefillData[key];
        return '';
    };

    let provinceOptionsHtml = `<option value="">${i18n.t('form_option_unspecified')}</option>`;
    const currentProvince = v('province');

    Object.entries(Map.MAPS || {}).forEach(([scope, mapObj]) => {
        if (mapObj.isContinental) return;
        const groupLabel = `${mapObj.icon} ${i18n.t(mapObj.titleKey)}`;
        provinceOptionsHtml += `<optgroup label="${groupLabel}">`;
        if (mapObj.names) {
            Object.entries(mapObj.names).forEach(([code]) => {
                const selected = (currentProvince === code) ? 'selected' : '';
                const displayName = Map.getRegionName(scope, code);
                provinceOptionsHtml += `<option value="${code}" ${selected}>${displayName}</option>`;
            });
        }
        provinceOptionsHtml += `</optgroup>`;
    });
    provinceOptionsHtml += `
        <optgroup label="🌍 ${i18n.t('region_others') || 'Autres'}">
            <option value="OTHER" ${currentProvince === 'OTHER' ? 'selected' : ''}>${i18n.t('province_other') || 'Autre'}</option>
        </optgroup>
    `;

    wrapper.innerHTML = `
                <h2 style="margin-bottom: 5px;">${title}</h2>
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <button type="button" id="btn-autofill-name" class="form-input" style="font-size:0.8rem; padding: 5px; flex:1; display:flex; align-items:center; justify-content:center; gap:5px; background:rgba(255,255,255,0.1);">
                        🔍 ${i18n.t('btn_autofill_name') || 'Remplir via Nom'}
                    </button>
                </div>
                <form id="add-beer-form">
                    <div class="form-group">
                        <label class="form-label">${i18n.t('label_beer_name')}</label>
                        <input type="text" class="form-input" name="title" value="${v('title')}" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_brewery') || 'Brasserie'}</label>
                        <input type="text" class="form-input" name="brewery" value="${v('brewery')}" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_province')}</label>
                        <select class="form-select" name="province">
                            ${provinceOptionsHtml}
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_type')}</label>
                        <input type="text" class="form-input" name="type" value="${v('type')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_alcohol')}</label>
                        <input type="text" class="form-input" name="alcohol" value="${v('alcohol')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_volume')}</label>
                        <input type="text" class="form-input" name="volume" value="${v('volume')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_distribution')}</label>
                        <select class="form-select" name="distribution">
                            <option value="1" ${v('distribution') === 'Partout' ? 'selected' : ''}>${i18n.t('form_dist_partout')} (1 pt)</option>
                            <option value="2" ${v('distribution') === 'Supermarché' ? 'selected' : ''}>${i18n.t('form_dist_supermarket')} (2 pts)</option>
                            <option value="3" ${v('distribution') === 'Cavistes' ? 'selected' : ''}>${i18n.t('form_dist_cavistes')} (3 pts)</option>
                            <option value="4" ${v('distribution') === 'Cavistes spécialisés' ? 'selected' : ''}>${i18n.t('form_dist_cavistes_spec')} (4 pts)</option>
                            <option value="5" ${v('distribution') === 'À la brasserie' ? 'selected' : ''}>${i18n.t('form_dist_brewery')} (5 pts)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_availability')}</label>
                        <select class="form-select" name="availability">
                            <option value="1">${i18n.t('form_avail_perm')} (1 pt)</option>
                            <option value="2">${i18n.t('form_avail_seasonal')} (2 pts)</option>
                            <option value="3">${i18n.t('form_avail_limited')} (3 pts)</option>
                            <option value="4">${i18n.t('form_avail_batch')} (4 pts)</option>
                            <option value="5">${i18n.t('form_avail_unique')} (5 pts)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_ingr_notes')}</label>
                        <input type="text" class="form-input" name="ingredients" value="${v('ingredients') || ''}" placeholder="${i18n.t('detail_ingredients_placeholder')}">
                    </div>

                    <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <input type="checkbox" name="barrel_aged" id="barrel_aged" ${v('barrel_aged') ? 'checked' : ''} style="width:20px; height:20px;">
                        <label for="barrel_aged" style="font-size:0.9rem; margin:0;">${i18n.t('form_label_barrel_aged')}</label>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_rarity')}</label>
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <select class="form-select" name="rarity" style="flex:1;">
                                <option value="" selected>${i18n.t('form_rarity_auto')}</option>
                                <option value="base" ${v('rarity') === 'base' ? 'selected' : ''}>${i18n.t('form_rarity_base')}</option>
                                <option value="commun" ${v('rarity') === 'commun' ? 'selected' : ''}>${i18n.t('form_rarity_comm')}</option>
                                <option value="rare" ${v('rarity') === 'rare' ? 'selected' : ''}>${i18n.t('form_rarity_rare')}</option>
                                <option value="super_rare" ${v('rarity') === 'super_rare' ? 'selected' : ''}>${i18n.t('form_rarity_super')}</option>
                                <option value="epique" ${v('rarity') === 'epique' ? 'selected' : ''}>${i18n.t('form_rarity_epic')}</option>
                                <option value="mythique" ${v('rarity') === 'mythique' ? 'selected' : ''}>${i18n.t('form_rarity_myth')}</option>
                                <option value="legendaire" ${v('rarity') === 'legendaire' ? 'selected' : ''}>${i18n.t('form_rarity_legend')}</option>
                                <option value="ultra_legendaire" ${v('rarity') === 'ultra_legendaire' ? 'selected' : ''}>${i18n.t('form_rarity_ultra')}</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" name="isSeasonal" id="isSeasonal" ${v('isSeasonal') ? 'checked' : ''} style="width:20px; height:20px;">
                            <label for="isSeasonal" style="font-size:0.9rem; margin:0;">${i18n.t('form_label_event')}</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">${i18n.t('form_label_image')}</label>
                        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 5px;">
                            <input type="file" id="image-file-input" accept="image/*" style="display: none;">
                            <input type="file" id="image-camera-input" accept="image/*" capture="environment" style="display: none;">
                            <button type="button" class="form-input" style="flex:1; padding: 10px; font-size: 0.9rem;" onclick="document.getElementById('image-file-input').click()">📁 ${i18n.t('btn_gallery') || 'Galerie'}</button>
                            <button type="button" class="form-input" style="flex:1; padding: 10px; font-size: 0.9rem;" onclick="document.getElementById('image-camera-input').click()">📷 ${i18n.t('btn_photo') || 'Photo'}</button>
                        </div>
                        <div style="text-align: center;">
                            <span id="file-name" style="font-size: 0.8rem; color: #888;">${editModeBeer ? (i18n.t('form_status_img_keep') || 'Image conservée') : (i18n.t('form_status_img_default') || 'Aucune image')}</span>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary">${btnText}</button>
                </form>
                `;

    let imageBase64 = (editModeBeer ? editModeBeer.image : '') || (prefillData ? prefillData.image : '');

    // File Reader Logic with Resize
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            wrapper.querySelector('#file-name').innerText = i18n.t('status_processing') || "Traitement...";
            resizeImage(file, 250, 250, (resizedBase64) => {
                imageBase64 = resizedBase64;
                wrapper.querySelector('#file-name').innerText = file.name + " (" + (i18n.t('status_resized') || "Redimensionné") + ")";
            });
        }
    };
    
    wrapper.querySelector('#image-file-input').onchange = handleImageChange;
    wrapper.querySelector('#image-camera-input').onchange = handleImageChange;

    // Point-Based Rarity Calculation
    const calculatePointRarity = (distributionPts, typePts, availabilityPts, barrelAged) => {
        let score = parseInt(distributionPts) + parseInt(typePts) + parseInt(availabilityPts);
        if (barrelAged) score += 2; // Bonus for barrel aged

        // Score: 3-4 = Base, 5-6 = Commun, 7-8 = Rare, 9-10 = Super Rare, 11-12 = Epique, 13-14 = Mythique, 15+ = Légendaire
        if (score <= 4) return 'base';
        if (score <= 6) return 'commun';
        if (score <= 8) return 'rare';
        if (score <= 10) return 'super_rare';
        if (score <= 12) return 'epique';
        if (score <= 14) return 'mythique';
        return 'legendaire';
    };

    // Type Points Mapping
    const getTypePts = (type) => {
        const t = (type || '').toLowerCase();
        if (t.match(/pils|lager/)) return 1;
        if (t.match(/blonde|blanche|pils/)) return 1;
        if (t.match(/ipa|stout|porter|saison|tripel|dubbel|double|quadrupel/)) return 2;
        if (t.match(/sour|gose|berliner|wild|farmhouse|framboise|brut/)) return 3;
        if (t.match(/gueuze|lambic|kriek|barrel aged|vieillie|barrique|ba |bourbon|cognac|whisky|rum/)) return 4;
        return 2; // Default
    };

    // --- Bind Auto-Fill Logic ---
    setTimeout(() => {
        const btnScan = wrapper.querySelector('#btn-autofill-scan');
        const btnName = wrapper.querySelector('#btn-autofill-name');

        if (btnScan) {
            btnScan.onclick = () => {
                renderScannerModal(async (barcode) => {
                    closeModal(); // Scanner replaces modal content, so we close to reset or just rely on re-render
                    // Actually renderScannerModal uses openModal, so it overwrites current modal content.
                    // The callback is executed. 

                    showToast(i18n.t('toast_analyzing'));
                    const product = await fetchProductByBarcode(barcode);
                    if (product) {
                        renderAddBeerForm(onSave, editModeBeer, product);
                        showToast(i18n.t('toast_found_data'));
                        Feedback.playScan(); // Play sound on successful scan
                        Feedback.impactLight(); // Haptic feedback
                    } else {
                        showToast(i18n.t('toast_unknown_product'));
                        renderAddBeerForm(onSave, editModeBeer, prefillData);
                    }
                });
            };
        }

        if (btnName) {
            btnName.onclick = async () => {
                const titleInput = wrapper.querySelector('#title');
                const currentName = titleInput ? titleInput.value : '';

                if (!currentName || currentName.length < 3) {
                    showAlertModal(`${i18n.t('toast_enter_at_least')} 3 ${i18n.t('letters_of_name')}`, { icon: '✏️' });
                    return;
                }

                const originalText = btnName.innerHTML;
                btnName.innerHTML = "⏳...";
                btnName.disabled = true;

                try {
                    const { products } = await searchProducts(currentName);
                    if (products && products.length > 0) {
                        const product = products[0];
                        // Merge image if exists in product, otherwise keep current? 
                        // Logic of renderAddBeerForm prefers passed prefillData.
                        renderAddBeerForm(onSave, editModeBeer, product);
                        showToast(i18n.t('toast_match_applied'));
                    } else {
                        showToast(i18n.t('toast_nothing_found'));
                        btnName.innerHTML = originalText;
                        btnName.disabled = false;
                    }
                } catch (e) {
                    showAlertModal(e.message, { icon: '⚠️' });
                    btnName.innerHTML = originalText;
                    btnName.disabled = false;
                }
            };
        }
    }, 100);

    wrapper.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const distributionPts = formData.get('distribution');
        const availabilityPts = formData.get('availability');
        const barrelAged = formData.get('barrel_aged') === 'on';
        const typePts = getTypePts(formData.get('type'));

        // Distribution label mapping
        const distLabels = {
            '1': i18n.t('dist_everywhere'),
            '2': i18n.t('dist_supermarket'),
            '3': i18n.t('dist_bottleshop'),
            '4': i18n.t('dist_specialized'),
            '5': i18n.t('dist_brewery')
        };

        // Auto-calculate rarity if not manually selected
        let selectedRarity = formData.get('rarity');
        if (!selectedRarity || selectedRarity === '') {
            selectedRarity = calculatePointRarity(distributionPts, typePts, availabilityPts, barrelAged);
        }

        const newBeer = {
            id: editModeBeer ? editModeBeer.id : 'CUSTOM_' + Date.now(),
            title: formData.get('title'),
            brewery: formData.get('brewery'),
            province: formData.get('province') || '',
            type: formData.get('type') || i18n.t('label_unknown'),
            alcohol: formData.get('alcohol'),
            volume: formData.get('volume'),
            distribution: distLabels[distributionPts] || i18n.t('label_unknown'),
            barrel_aged: barrelAged,
            ingredients: formData.get('ingredients'),
            rarity: selectedRarity,
            isSeasonal: formData.get('isSeasonal') === 'on',
            image: imageBase64 || 'images/beer/FUT.jpg'
        };

        if (editModeBeer) {
            Storage.deleteCustomBeer(editModeBeer.id);
            Storage.saveCustomBeer(newBeer);
        }

        Analytics.track('beer_added', {
            beer_id: newBeer.id,
            name: newBeer.title,
            brewery: newBeer.brewery || i18n.t('label_unknown'),
            type: newBeer.type || i18n.t('label_unknown'),
            source: editModeBeer ? 'edit' : 'manual'
        });

        onSave(newBeer);
    };

    openModal(wrapper);
}

export function renderScannerModal(onScan) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.innerHTML = `
        <h2 style="margin-bottom: 20px;">${i18n.t('scan_title')}</h2>
        <div style="position:relative; margin-bottom: 15px;">
            <div id="reader" style="width: 100%; min-height: 250px; background: #000; border-radius: 8px; overflow: hidden;"></div>
            <div id="scanner-feedback" style="position:absolute; bottom:10px; left:0; width:100%; text-align:center; color:white; font-weight:bold; text-shadow:0 1px 3px rgba(0,0,0,0.8); pointer-events:none; z-index:10; font-size:1.2rem; transition:opacity 0.3s;"></div>
        </div>
        <p style="text-align: center; color: #888; font-size: 0.9rem;">
            ${i18n.t('scan_desc')}
        </p>
        <button id="btn-close-scanner" class="btn-primary" style="background:#333; margin-top:15px;">${i18n.t('scan_btn_close')}</button>
    `;

    openModal(wrapper);

    // Give time for DOM to paint
    setTimeout(() => {
        Scanner.startScanner("reader", (decodedText, decodedResult) => {
            return onScan(decodedText);
        }, (errorMessage) => {
        });
    }, 100);

    // Set cleanup for when modal closes
    modalCleanup = () => {
        Scanner.stopScanner();
    };

    wrapper.querySelector('#btn-close-scanner').onclick = () => {
        closeModal();
    };
}

export function setScannerFeedback(message, isError = false) {
    const el = document.getElementById('scanner-feedback');
    if (el) {
        el.innerHTML = message;
        el.style.color = isError ? '#ff4444' : 'white';
        // Allow clicks on interactive elements (buttons) in feedback
        el.style.pointerEvents = message.includes('<button') ? 'auto' : 'none';
        if (isError) {
            el.style.textShadow = '0 0 5px red';
        } else {
            el.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
        }
    }
}

export function renderStats(allBeers, userData, container) {
    const allBeerIds = new Set(allBeers.map(b => String(b.id)));
    const apiBeersCountFixed = 197452; // Static count retrieved from OFF (approx. March 2026)
    const historyApiIds = Object.keys(userData).filter(id => (id.startsWith('API_') || id.startsWith('OFF_')) && !allBeerIds.has(id));

    // The "Total" for summary purposes (Static API + Scanned history)
    const apiBeersCount = apiBeersCountFixed + historyApiIds.length;
    const jsonBeersCount = Math.max(0, allBeers.length - allBeers.filter(b => String(b.id).startsWith('CUSTOM_')).length - allBeers.filter(b => String(b.id).startsWith('API_') || String(b.id).startsWith('OFF_')).length);
    const customBeersCount = allBeers.filter(b => String(b.id).startsWith('CUSTOM_')).length;

    const totalBeers = jsonBeersCount + apiBeersCount + customBeersCount;
    const drunkCount = Object.values(userData).filter(u => (u.count || 0) > 0).length;

    // Progress is based on local collection (JSON + Custom), as the API is "infinite"
    const totalLocalBeers = jsonBeersCount + customBeersCount;
    const percentage = Math.round((drunkCount / totalLocalBeers) * 100) || 0;

    const totalDrunkCount = Object.values(userData).reduce((acc, curr) => acc + (curr.count || 0), 0);

    // Compute Rarity ranks
    let userRank = { name: i18n.t('stats_rank_novice'), color: "#888", nextRankThresh: 10 };
    const uniqueCount = Object.values(userData).filter(u => (u.count || 0) > 0).length;

    // Quick rank calculation
    if (uniqueCount >= 10) userRank = { name: i18n.t('stats_rank_amateur'), color: "#4CAF50", nextRankThresh: 50 };
    if (uniqueCount >= 50) userRank = { name: i18n.t('stats_rank_connaisseur'), color: "#2196F3", nextRankThresh: 100 };
    if (uniqueCount >= 100) userRank = { name: i18n.t('stats_rank_expert'), color: "#9C27B0", nextRankThresh: 250 };
    if (uniqueCount >= 250) userRank = { name: i18n.t('stats_rank_master'), color: "#E91E63", nextRankThresh: 500 };
    if (uniqueCount >= 500) userRank = { name: i18n.t('stats_rank_legend'), color: "var(--accent-gold)", nextRankThresh: 1000 };

    // --- Calculate Achievements for Badge Evolution ---
    let allAch = [];
    let unlockedIds = [];
    
    if (typeof Achievements !== 'undefined') {
        allAch = Achievements.getAllAchievements();
        unlockedIds = Achievements.getUnlockedAchievements();
    }
    
    const unlockedAch = allAch.filter(a => unlockedIds.includes(a.id));
    const achPct = allAch.length > 0 ? (unlockedAch.length / allAch.length) * 100 : 0;
    
    let trophies = { bronze: 0, silver: 0, gold: 0, plat: 0 };
    unlockedAch.forEach(a => {
        if (a.rarity === 'commun') trophies.bronze++;
        else if (['rare', 'super_rare'].includes(a.rarity)) trophies.silver++;
        else if (['epique', 'mythique'].includes(a.rarity)) trophies.gold++;
        else if (['legendaire', 'ultra_legendaire'].includes(a.rarity)) trophies.plat++;
    });
    // Le Graal (Platinum) for 100%
    if (achPct >= 100 && allAch.length > 0) trophies.plat++;

    // --- Valorant Badge Evolution ---
    let badgeGlow = "0 0 10px rgba(0,0,0,0)";
    let badgeStroke = userRank.color;
    let rankColor = userRank.color;
    let badgeFx = "";
    
    if (achPct >= 20 && achPct < 40) {
        badgeStroke = "url(#grad-bronze)";
        rankColor = "#cd7f32";
        badgeGlow = "0 0 15px rgba(205,127,50,0.5)";
    } else if (achPct >= 40 && achPct < 60) {
        badgeStroke = "url(#grad-silver)";
        rankColor = "#c0c0c0";
        badgeGlow = "0 0 20px rgba(192,192,192,0.6)";
    } else if (achPct >= 60 && achPct < 80) {
        badgeStroke = "url(#grad-gold)";
        rankColor = "var(--accent-gold)";
        badgeGlow = "0 0 25px rgba(255,215,0,0.7)";
    } else if (achPct >= 80 && achPct < 100) {
        badgeStroke = "url(#grad-diamond)";
        rankColor = "#00ffff";
        badgeGlow = "0 0 30px rgba(0,255,255,0.8)";
    } else if (achPct >= 100) {
        badgeStroke = "url(#grad-radiant)";
        rankColor = "#ff00ff";
        badgeFx = "animation: pulse-radiant 2s infinite;";
        badgeGlow = "0 0 40px rgba(255,0,255,1)";
    }

    let totalVolumeMl = 0;
    let totalAlcoholMl = 0;

    Object.keys(userData).forEach(id => {
        const user = userData[id];
        if (user.history) {
            user.history.forEach(h => {
                totalVolumeMl += h.volume;
                // Find beer data for alcohol
                const beer = allBeers.find(b => b.id === id);
                if (beer && beer.alcohol) {
                    const degree = parseFloat(beer.alcohol.replace('%', '').replace('°', ''));
                    if (!isNaN(degree)) {
                        totalAlcoholMl += h.volume * (degree / 100);
                    }
                }
            });
        }
    });

    const blocks = {
        'progression': `
            <style>
            @keyframes pulse-radiant {
                0% { filter: drop-shadow(0 0 20px #ff00ff) drop-shadow(0 0 40px #00ffff); }
                50% { filter: drop-shadow(0 0 40px #ff00ff) drop-shadow(0 0 20px #00ffff); }
                100% { filter: drop-shadow(0 0 20px #ff00ff) drop-shadow(0 0 40px #00ffff); }
            }
            </style>
            <svg width="0" height="0">
                <defs>
                    <linearGradient id="grad-bronze" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#cd7f32" /><stop offset="100%" stop-color="#8a5a22" /></linearGradient>
                    <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e6e6e6" /><stop offset="100%" stop-color="#808080" /></linearGradient>
                    <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffd700" /><stop offset="100%" stop-color="#b8860b" /></linearGradient>
                    <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00ffff" /><stop offset="100%" stop-color="#00008b" /></linearGradient>
                    <linearGradient id="grad-radiant" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#ff00ff"><animate attributeName="stop-color" values="#ff00ff;#00ffff;#ff00ff" dur="3s" repeatCount="indefinite"/></stop>
                        <stop offset="100%" stop-color="#00ffff"><animate attributeName="stop-color" values="#00ffff;#ff00ff;#00ffff" dur="3s" repeatCount="indefinite"/></stop>
                    </linearGradient>
                </defs>
            </svg>
            <!-- SVG Donut Chart with Valorant Evolution -->
            <div style="width:160px; height:160px; margin:0 auto; position:relative; border-radius:50%; box-shadow:${badgeGlow}; ${badgeFx}">
                <svg viewBox="0 0 36 36" style="width:100%; height:100%; transform: rotate(-90deg);">
                    <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#333" stroke-width="3" stroke-dasharray="100, 100" />
                    <path class="circle" stroke-dasharray="${percentage}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${badgeStroke}" stroke-width="3" style="transition: stroke-dasharray 1s ease-out;" />
                </svg>
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
                    <span style="font-size:2rem; font-family:'Russo One', sans-serif; color:${rankColor}; text-shadow:0 0 10px ${rankColor}66;">${uniqueCount}</span>
                    <span style="display:block; font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px; margin-top:-5px;">${i18n.t('stats_label_uniques')}</span>
                </div>
            </div>
            
            <h2 style="color:${rankColor}; margin-top:20px; font-family:'Russo One', sans-serif; letter-spacing:1px; text-shadow:0 0 10px ${rankColor}33;">${userRank.name}</h2>
            <p style="font-size:0.85rem; color:#888; margin-top:5px;">${i18n.t('stats_next_rank_desc', { count: Math.max(0, userRank.nextRankThresh - uniqueCount) })}</p>

            <!-- PlayStation Trophies Summary -->
            <div style="display:flex; justify-content:center; align-items:center; gap:12px; margin-top:15px; background:rgba(0,0,0,0.2); padding:10px 15px; border-radius:20px; border:1px solid rgba(255,255,255,0.05); width:fit-content; margin-inline:auto;">
                ${trophies.plat > 0 ? `<div style="display:flex; align-items:center; gap:5px; color:#ff00ff; text-shadow:0 0 8px #ff00ff; font-weight:bold;">🏆 ${trophies.plat}</div>` : ''}
                <div style="display:flex; align-items:center; gap:5px; color:var(--accent-gold); font-weight:bold;">🟡 ${trophies.gold}</div>
                <div style="display:flex; align-items:center; gap:5px; color:#c0c0c0; font-weight:bold;">⚪ ${trophies.silver}</div>
                <div style="display:flex; align-items:center; gap:5px; color:#cd7f32; font-weight:bold;">🟤 ${trophies.bronze}</div>
            </div>
            
            <div style="margin-top:20px; text-align:center; padding:15px; background:var(--bg-card); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:0.85rem; color:#aaa; margin-bottom:5px; text-transform:uppercase; font-weight:bold;">${i18n.t('stats_app_count_label')}</div>
                <div class="stats-total-app-count" style="font-size:1.5rem; font-weight:bold; color:#FFF;">${totalBeers.toLocaleString()}</div>
                <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-top:10px; font-size:0.75rem;">
                     <div class="stat-badge stat-badge-json"><span style="font-weight:bold;">${jsonBeersCount}</span> JSON</div>
                     <div class="stat-badge stat-badge-api"><span style="font-weight:bold;">${apiBeersCount}</span> API</div>
                     <div class="stat-badge stat-badge-custom"><span style="font-weight:bold;">${customBeersCount}</span> Custom</div>
                </div>
            </div>

            <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, rgba(30,30,30,0.8), rgba(15,15,15,0.9)); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;">
                <div style="font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">
                    ${i18n.t('stats_volume_total')} 
                </div>
                <div style="font-size: 2.2rem; font-family: 'Russo One', sans-serif; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                    ${totalDrunkCount} <span style="font-size: 1rem; color: #888; font-family: sans-serif; font-weight: normal;">${i18n.t('stats_beers_count')}</span>
                </div>
            </div>

            ${renderAdvancedStats(totalVolumeMl, totalAlcoholMl)}
        `,
        'equivalences': Storage.getPreference('feat_equivalences_enabled', true) ? `
            ${renderEquivalences(totalVolumeMl, totalAlcoholMl)}
        ` : '',
        'bac': Storage.getPreference('bac_enabled', true) ? `
            <!-- BAC Section -->
            <div class="stat-card mt-20 text-center" id="bac-stats-container" style="border-top: 2px solid var(--accent-gold);">
                <h3 style="margin-bottom:15px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    ${i18n.t('settings_bac_title')} <span style="font-size: 0.8rem; background: #333; padding: 2px 6px; border-radius: 10px; font-weight: normal;">${Storage.getPreference('bac_country', 'BE')}</span>
                </h3>
                
                <div id="bac-dynamic-content">
                    <div class="spinner"></div> ${i18n.t('loading_app')}
                </div>
            </div>` : '',
        'streak': Storage.getPreference('bac_show_streak', true) ? `
            <div class="stat-card mt-20 text-center">
                <div id="streak-container">
                    <div class="spinner"></div> ${i18n.t('loading_app')}
                </div>
            </div>` : '',
        'history': `
            <div class="stat-card mt-20 text-center">
                <h3 style="margin-bottom:15px;">${i18n.t('stats_block_history') || "Historique des consos"}</h3>
                <div id="history-only-container">
                    <div class="spinner"></div> ${i18n.t('loading_app')}
                </div>
            </div>
        `,
        'calendar': `
            <div class="stat-card mt-20 text-center">
                <h3 style="margin-bottom:15px;">${i18n.t('stats_block_calendar') || "Calendrier de l'Avent"}</h3>
                <div id="calendar-only-container">
                    <div class="spinner"></div> ${i18n.t('loading_app')}
                </div>
            </div>
        `,
        'achievements': `
            <div id="card-achievements" class="stat-card mt-20 text-center">
                <h3 style="margin-bottom:15px;">${i18n.t('stats_achievements_title')}</h3>
                ${renderAchievementsList()}
            </div>
        `,
        'map': Storage.getPreference('feat_map_enabled', true) ? `
            <div class="stat-card mt-20 text-center">
                <div id="beer-map-container" style="min-height:200px;">
                    <span class="spinner"></span> ${i18n.t('stats_loading_map')}
                </div>
            </div>
        ` : ''
    };

    const currentOrder = Storage.getPreference('stats_order', ['progression', 'equivalences', 'bac', 'streak', 'history', 'calendar', 'achievements', 'map']);

    const matchBlock = Storage.getPreference('feat_beermatch_enabled', true) ? `
        <div class="stat-card mt-20 text-center">
            <h3 style="margin-bottom:10px;">${i18n.t('stats_match_title')}</h3>
            <p style="font-size:0.8rem; color:#888; margin-bottom:15px;" data-i18n="stats_match_desc">${i18n.t('stats_match_desc')}</p>
            <button type="button" id="btn-match" class="btn-primary" style="background:#222; border:1px solid var(--accent-gold); color:var(--accent-gold);">
                ${i18n.t('stats_match_btn')}
            </button>
        </div>
    ` : '';

    const wrappedBlock = Storage.getPreference('feat_wrapped_enabled', true) ? `
        <div style="background: linear-gradient(135deg, #111, #222); padding: 15px; border-radius: 12px; border: 1px solid var(--accent-gold); margin-bottom: 20px; text-align: center; margin-top: 20px;">
            <div style="font-size: 2rem; margin-bottom: 5px;">🎬</div>
            <h3 style="margin: 0 0 10px 0; color: var(--accent-gold); font-family: 'Russo One', sans-serif;">Beerdex Wrapped</h3>
            <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 15px;">${i18n.t('wrapped_subtitle')}</p>
            <button id="btn-open-wrapped" class="btn-primary" style="background: var(--accent-gold); color: black; font-weight: bold; width: 100%;">
                ${i18n.t('wrapped_btn_start')}
            </button>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="stats-view-wrapper" style="max-width: 600px; margin: 0 auto; width: 100%;">
            <div class="text-center p-20">
                ${currentOrder.map(key => blocks[key] || '').join('')}
                ${matchBlock}
                ${wrappedBlock}
            </div>
        </div>
    `;

    // Hook up events
    const btnMatch = container.querySelector('#btn-match');
    if (btnMatch) btnMatch.onclick = () => renderMatchModal(allBeers);

    const btnWrapped = container.querySelector('#btn-open-wrapped');
    if (btnWrapped) {
        btnWrapped.onclick = () => window.Wrapped.start();
    }

    // Init Map
    setTimeout(() => {
        const history = [];
        const ratings = userData || {};
        Object.keys(ratings).forEach(ratingKey => {
            const coreId = ratingKey.split('_')[0];
            const beer = allBeers.find(b => b.id == coreId || b.id == ratingKey);
            const userRating = ratings[ratingKey];
            if (beer && userRating && (userRating.count || 0) > 0) {
                history.push({ beer: beer, rating: userRating });
            }
        });

        const mapContainer = container.querySelector('#beer-map-container');
        if (mapContainer) Map.renderMapWithData(mapContainer, history);
    }, 100);

    // Render BAC Content
    if (Storage.getPreference('bac_enabled', true)) {
        setTimeout(() => renderBACStatsContent(container.querySelector('#bac-dynamic-content')), 50);
    }

    // Render Streak
    setTimeout(() => {
        const streakCtn = container.querySelector('#streak-container');
        if (streakCtn) renderStreakSection(streakCtn, allBeers, userData);
    }, 60);

    // Render History
    setTimeout(() => {
        const histCtn = container.querySelector('#history-only-container');
        if (histCtn) _renderHistoryList(histCtn, allBeers, userData);
    }, 70);

    // Render Calendar
    setTimeout(() => {
        const calCtn = container.querySelector('#calendar-only-container');
        if (calCtn) _renderCalendar(calCtn, allBeers, userData);
    }, 80);
}

// ======================================= //
// Streak Section                           //
// ======================================= //

function _localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function _buildDayMap(allBeers, userData) {
    const dayMap = {}; // { 'YYYY-MM-DD': count }
    const ratings = userData || {};
    Object.keys(ratings).forEach(ratingKey => {
        const entry = ratings[ratingKey];
        if (!entry || !entry.history) return;
        entry.history.forEach(h => {
            if (!h.date) return;
            // Convert stored ISO date to local date key
            const day = _localDateKey(new Date(h.date));
            dayMap[day] = (dayMap[day] || 0) + 1;
        });
    });
    return dayMap;
}

function renderStreakSection(container, allBeers, userData) {
    const dayMap = _buildDayMap(allBeers, userData);
    const streakMode = Storage.getPreference('streak_mode', 'sober'); // 'sober' or 'party'
    const isSober = streakMode === 'sober';

    // If no drink data at all, show 0
    const hasDrinkData = Object.keys(dayMap).length > 0;
    let currentStreak = 0;
    let bestStreak = 0;

    if (hasDrinkData) {
        // Compute streaks using local dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let streak = 0;

        // Walk backward from today
        for (let i = 0; i < 3650; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = _localDateKey(d);
            const had = (dayMap[key] || 0) > 0;
            const streakContinues = isSober ? !had : had;

            if (i === 0 && !streakContinues) {
                // Today broke the streak: current = 0
                currentStreak = 0;
                // Still count best going backward from yesterday
                for (let j = 1; j < 3650; j++) {
                    const d2 = new Date(today);
                    d2.setDate(d2.getDate() - j);
                    const k2 = _localDateKey(d2);
                    const ok2 = isSober ? !(dayMap[k2] || 0) : (dayMap[k2] || 0) > 0;
                    if (ok2) streak++; else break;
                }
                bestStreak = streak;
                break;
            }

            if (streakContinues) {
                currentStreak++;
            } else {
                break;
            }
        }

        // For sobriety mode, cap current streak to days since first drink
        if (isSober) {
            const allDays = Object.keys(dayMap).sort();
            if (allDays.length > 0) {
                const firstDrinkDate = new Date(allDays[0]);
                const daysSinceFirst = Math.floor((today - firstDrinkDate) / 86400000) + 1;
                currentStreak = Math.min(currentStreak, daysSinceFirst);
            }
        }

        // Best ever (full scan)
        let runBest = 0;
        const allDays = Object.keys(dayMap).sort();
        if (allDays.length > 0) {
            const first = new Date(allDays[0]);
            const last = new Date();
            let run = 0;
            for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
                const key = _localDateKey(d);
                const had = (dayMap[key] || 0) > 0;
                const ok = isSober ? !had : had;
                if (ok) { run++; runBest = Math.max(runBest, run); }
                else { run = 0; }
            }
        }
        bestStreak = Math.max(bestStreak, runBest, currentStreak);
    }

    // Message
    const prefix = isSober ? 'stats_streak_msg' : 'stats_streak_party_msg';
    let msgKey;
    if (currentStreak === 0) msgKey = `${prefix}_0`;
    else if (currentStreak < 7) msgKey = `${prefix}_low`;
    else if (currentStreak < 30) msgKey = `${prefix}_mid`;
    else msgKey = `${prefix}_high`;

    // Flame intensity
    const flameSize = Math.min(3, 0.8 + currentStreak * 0.05);
    const titleKey = isSober ? 'stats_streak_sober_title' : 'stats_streak_party_title';

    container.innerHTML = `
        <div class="streak-section">
            <div class="streak-header">
                <h4>${i18n.t(titleKey)}</h4>
                <div class="streak-mode-toggle">
                    <button class="streak-mode-btn ${isSober ? 'active' : ''}" data-mode="sober">${i18n.t('stats_streak_mode_sober')}</button>
                    <button class="streak-mode-btn ${!isSober ? 'active' : ''}" data-mode="party">${i18n.t('stats_streak_mode_party')}</button>
                </div>
            </div>
            <div class="streak-counter">
                <div class="streak-flame" style="font-size:${flameSize}rem;">${isSober ? '🔥' : '🎉'}</div>
                <div class="streak-number">${currentStreak}</div>
                <div class="streak-label">${i18n.t('stats_streak_days')}</div>
            </div>
            <div class="streak-msg">${i18n.t(msgKey)}</div>
            <div class="streak-best">
                <span class="streak-best-label">${i18n.t('stats_streak_best')}:</span>
                <span class="streak-best-value">${bestStreak} ${i18n.t('stats_streak_days')}</span>
            </div>
        </div>
    `;

    // Mode toggle handlers
    container.querySelectorAll('.streak-mode-btn').forEach(btn => {
        btn.onclick = () => {
            Storage.savePreference('streak_mode', btn.dataset.mode);
            renderStreakSection(container, allBeers, userData);
        };
    });
}

// ======================================= //
// History & Calendar Section               //
// ======================================= //

function renderHistorySection(container, allBeers, userData) {
    const showHistory = Storage.getPreference('bac_show_history', true);
    const showCalendar = Storage.getPreference('bac_show_calendar', true);
    const activeTab = Storage.getPreference('history_tab', showHistory ? 'list' : 'calendar');

    let tabsHtml = '';
    if (showHistory && showCalendar) {
        tabsHtml = `
            <div class="history-tabs">
                <button class="history-tab-btn ${activeTab === 'list' ? 'active' : ''}" data-tab="list">${i18n.t('stats_history_tab_list')}</button>
                <button class="history-tab-btn ${activeTab === 'calendar' ? 'active' : ''}" data-tab="calendar">${i18n.t('stats_history_tab_calendar')}</button>
            </div>`;
    }

    container.innerHTML = `
        <div class="history-section">
            <h4>${i18n.t('stats_history_title')}</h4>
            ${tabsHtml}
            <div id="history-content"></div>
        </div>
    `;

    const contentDiv = container.querySelector('#history-content');

    if ((showHistory && activeTab === 'list') || (!showCalendar)) {
        _renderHistoryList(contentDiv, allBeers, userData);
    } else {
        _renderCalendar(contentDiv, allBeers, userData);
    }

    container.querySelectorAll('.history-tab-btn').forEach(btn => {
        btn.onclick = () => {
            Storage.savePreference('history_tab', btn.dataset.tab);
            renderHistorySection(container, allBeers, userData);
        };
    });
}

function _renderHistoryList(container, allBeers, userData) {
    const ratings = userData || {};
    const allDrinks = [];
    Object.keys(ratings).forEach(ratingKey => {
        const entry = ratings[ratingKey];
        if (!entry || !entry.history) return;
        const coreId = ratingKey.split('_')[0];
        const beer = allBeers.find(b => b.id == coreId || b.id == ratingKey);
        entry.history.forEach(h => {
            if (!h.date) return;
            allDrinks.push({ date: h.date, volume: h.volume || 330, beer: beer, beerId: ratingKey });
        });
    });

    allDrinks.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allDrinks.length === 0) {
        container.innerHTML = `<div class="history-empty">${i18n.t('stats_history_no_data')}</div>`;
        return;
    }

    const limit = 30;
    const shown = allDrinks.slice(0, limit);
    let html = '<div class="history-list">';
    shown.forEach(d => {
        const dt = new Date(d.date);
        const dateStr = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const name = d.beer ? (d.beer.title || d.beerId) : d.beerId;
        const vol = d.volume ? `${d.volume}ml` : '';
        html += `
            <div class="history-item" data-beer-id="${d.beerId}">
                <div class="history-item-date"><span class="history-date">${dateStr}</span> <span class="history-time">${timeStr}</span></div>
                <div class="history-item-info">
                    <span class="history-beer-name">${name}</span>
                    <span class="history-beer-vol">${vol}</span>
                </div>
            </div>`;
    });
    html += '</div>';

    if (allDrinks.length > limit) {
        html += `<button class="history-show-more" id="btn-history-more">${i18n.t('stats_history_show_more')} (${allDrinks.length - limit})</button>`;
    }

    container.innerHTML = html;

    // Click on beer opens its detail
    container.querySelectorAll('.history-item').forEach(el => {
        el.onclick = () => {
            const beerId = el.dataset.beerId;
            const beer = allBeers.find(b => b.id == beerId || b.id == beerId.split('_')[0]);
            if (beer) renderBeerDetail(beer, () => { location.reload(); });
        };
    });

    const btnMore = container.querySelector('#btn-history-more');
    if (btnMore) {
        btnMore.onclick = () => {
            // Show all
            const listDiv = container.querySelector('.history-list');
            allDrinks.slice(limit).forEach(d => {
                const dt = new Date(d.date);
                const dateStr = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const name = d.beer ? (d.beer.title || d.beerId) : d.beerId;
                const vol = d.volume ? `${d.volume}ml` : '';
                const el = document.createElement('div');
                el.className = 'history-item';
                el.dataset.beerId = d.beerId;
                el.innerHTML = `
                    <div class="history-item-date"><span class="history-date">${dateStr}</span> <span class="history-time">${timeStr}</span></div>
                    <div class="history-item-info">
                        <span class="history-beer-name">${name}</span>
                        <span class="history-beer-vol">${vol}</span>
                    </div>`;
                el.onclick = () => {
                    const beer = allBeers.find(b => b.id == d.beerId || b.id == d.beerId.split('_')[0]);
                    if (beer) renderBeerDetail(beer, () => { location.reload(); });
                };
                listDiv.appendChild(el);
            });
            btnMore.remove();
        };
    }
}

function _renderCalendar(container, allBeers, userData) {
    const dayMap = _buildDayMap(allBeers, userData);
    const calMonth = Storage.getPreference('cal_month', new Date().getMonth());
    const calYear = Storage.getPreference('cal_year', new Date().getFullYear());

    const now = new Date(calYear, calMonth, 1);
    const monthName = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const firstDay = now.getDay() || 7; // Monday = 1
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    // Max drinks in a day for color scaling
    let maxDrinks = 1;
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        maxDrinks = Math.max(maxDrinks, dayMap[key] || 0);
    }

    // Day names header
    const dayNames = [i18n.t('day_mon'), i18n.t('day_tue'), i18n.t('day_wed'), i18n.t('day_thu'), i18n.t('day_fri'), i18n.t('day_sat'), i18n.t('day_sun')];
    let headerHtml = dayNames.map(n => `<div class="cal-day-name">${n}</div>`).join('');

    // Build cells
    let cellsHtml = '';
    const offsetStart = (firstDay === 0 ? 6 : firstDay - 1);
    for (let i = 0; i < offsetStart; i++) cellsHtml += '<div class="cal-cell cal-empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const count = dayMap[key] || 0;
        const intensity = count > 0 ? Math.min(1, count / Math.max(maxDrinks, 1)) : 0;
        // Color: transparent → green → yellow → orange → red
        let bgColor = 'transparent';
        if (count > 0) {
            const h = Math.round(120 - (intensity * 120)); // 120=green, 0=red
            bgColor = `hsla(${h}, 70%, 45%, ${0.3 + intensity * 0.55})`;
        }
        const isToday = d === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
        cellsHtml += `<div class="cal-cell ${isToday ? 'cal-today' : ''} ${count > 0 ? 'cal-has-drinks' : ''}" data-day="${key}" style="background:${bgColor};">
            <span class="cal-day-num">${d}</span>
            ${count > 0 ? `<span class="cal-count">${count}</span>` : ''}
        </div>`;
    }

    container.innerHTML = `
        <div class="calendar-section">
            <div class="cal-nav">
                <button id="cal-prev" class="cal-nav-btn">◀</button>
                <span class="cal-month-name">${monthName}</span>
                <button id="cal-next" class="cal-nav-btn">▶</button>
            </div>
            <div class="cal-grid">
                ${headerHtml}
                ${cellsHtml}
            </div>
            <div id="cal-day-detail"></div>
        </div>
    `;

    // Navigation
    container.querySelector('#cal-prev').onclick = () => {
        let m = calMonth - 1, y = calYear;
        if (m < 0) { m = 11; y--; }
        Storage.savePreference('cal_month', m);
        Storage.savePreference('cal_year', y);
        _renderCalendar(container, allBeers, userData);
    };
    container.querySelector('#cal-next').onclick = () => {
        let m = calMonth + 1, y = calYear;
        if (m > 11) { m = 0; y++; }
        Storage.savePreference('cal_month', m);
        Storage.savePreference('cal_year', y);
        _renderCalendar(container, allBeers, userData);
    };

    // Click on day
    container.querySelectorAll('.cal-cell[data-day]').forEach(cell => {
        cell.onclick = () => {
            const dayKey = cell.dataset.day;
            const detail = container.querySelector('#cal-day-detail');
            // Find drinks for that day
            const ratings = userData || {};
            const drinks = [];
            Object.keys(ratings).forEach(ratingKey => {
                const entry = ratings[ratingKey];
                if (!entry || !entry.history) return;
                const coreId = ratingKey.split('_')[0];
                const beer = allBeers.find(b => b.id == coreId || b.id == ratingKey);
                entry.history.forEach(h => {
                    if (h.date && _localDateKey(new Date(h.date)) === dayKey) {
                        drinks.push({ beer, volume: h.volume || 330, date: h.date, beerId: ratingKey });
                    }
                });
            });

            if (drinks.length === 0) {
                detail.innerHTML = `<div class="cal-detail-empty">${i18n.t('stats_history_no_data_day')}</div>`;
            } else {
                detail.innerHTML = drinks.map(d => {
                    const name = d.beer ? (d.beer.title || d.beerId) : d.beerId;
                    const time = new Date(d.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    return `<div class="cal-detail-item" data-beer-id="${d.beerId}" style="cursor: pointer;"><span>${time}</span> <strong>${name}</strong> <span>${d.volume}ml</span></div>`;
                }).join('');

                detail.querySelectorAll('.cal-detail-item').forEach(el => {
                    el.onclick = () => {
                        const beerId = el.dataset.beerId;
                        const beer = allBeers.find(b => b.id == beerId || b.id == beerId.split('_')[0]);
                        if (beer) renderBeerDetail(beer, () => { location.reload(); });
                    };
                });
            }
        };
    });
}

export function renderBACStatsContent(container) {
    Storage.savePreference('stats_bac_used', true);
    window.dispatchEvent(new Event('beerdex-action'));
    if (!container) return;
    const rules = BAC.getCurrentRules() || { sanctionThreshold: 0.5, withdrawThreshold: 0.8 };
    const bacStatus = BAC.getBACStatus();
    const currentBAC = BAC.getCurrentBAC();
    const formattedBAC = currentBAC.toFixed(2);

    // Dynamic visualization range: always at least 1.0 g/l, or 1.5x the withdraw threshold, or 1.1x current
    const visualMax = Math.max(1.0, rules.withdrawThreshold * 1.5, currentBAC * 1.1);
    const percentageOfLimit = Math.min(100, (currentBAC / visualMax) * 100);

    const curveData = BAC.getBACCurveData();
    let svgGraphHtml = "";

    if (curveData && curveData.length > 1) {
        const width = 100;
        const height = 40;
        const tMin = curveData[0].time;
        const tMax = curveData[curveData.length - 1].time;
        const tRange = tMax - tMin || 1;
        const bacMax = Math.max(rules.withdrawThreshold, ...curveData.map(d => d.bac));

        let polylinePoints = "";
        let currentX = width;
        let currentY = height;
        const now = new Date().getTime();

        // CHART.JS INTEGRATION
        svgGraphHtml = `
            <div style="margin: 20px 0; background: #1a1a1a; padding: 15px; border-radius: 10px;">
                <div style="font-size: 0.8rem; color:#888; margin-bottom: 10px; text-align: left;">${i18n.t('bac_evolution_title')}</div>
                <div style="position: relative; height: 250px; width: 100%;">
                    <canvas id="bacChartCanvas"></canvas>
                </div>
            </div>
        `;

        // Let the DOM update, then initialize Chart.js
        setTimeout(async () => {
            const ctx = document.getElementById('bacChartCanvas');
            if (ctx && curveData.length > 0) {
                try {
                    await loadChartJs();
                } catch (e) {
                    console.error("Failed to load Chart.js", e);
                    return;
                }

                if (window.bacChartInstance) {
                    window.bacChartInstance.destroy();
                }

                const chartData = curveData.map(d => ({
                    x: d.time,
                    y: parseFloat(d.bac.toFixed(3))
                }));

                const nowTime = new Date().getTime();

                // Emphasize the current time dot
                const currentBACPointIndex = chartData.findIndex(d => d.x >= nowTime);
                const pointColors = chartData.map((d, i) => (i === currentBACPointIndex) ? '#ffffff' : 'transparent');
                const pointRadii = chartData.map((d, i) => (i === currentBACPointIndex) ? 4 : 0);

                window.bacChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        datasets: [{
                            label: i18n.t('bac_label'),
                            data: chartData,
                            borderColor: bacStatus.color,
                            backgroundColor: bacStatus.color + '33',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: pointColors,
                            pointBorderColor: pointColors,
                            pointRadius: pointRadii,
                            pointHitRadius: 10,
                            pointHoverRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: function (context) {
                                        const d = new Date(context[0].parsed.x);
                                        const now = new Date();
                                        const isToday = d.toDateString() === now.toDateString();
                                        const timeStr = d.getHours().toString().padStart(2, '0') + 'h' + d.getMinutes().toString().padStart(2, '0');
                                        if (isToday) return timeStr;

                                        const days = [
                                            i18n.t('day_sun'), i18n.t('day_mon'), i18n.t('day_tue'),
                                            i18n.t('day_wed'), i18n.t('day_thu'), i18n.t('day_fri'), i18n.t('day_sat')
                                        ];
                                        return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} - ${timeStr}`;
                                    },
                                    label: function (context) { return ` ${context.parsed.y} g/l`; }
                                },
                                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: bacStatus.color,
                                borderWidth: 1
                            },
                            annotation: {
                                annotations: (() => {
                                    const rules = BAC.getCurrentRules() || { sanctionThreshold: 0.5, withdrawThreshold: 0.8 };
                                    const l1 = rules.sanctionThreshold;
                                    const l2 = rules.withdrawThreshold;

                                    const limitLabel = i18n.t('bac_chart_limit');

                                    let annots = {};
                                    if (l1 > 0) {
                                        annots.limitSanction = {
                                            type: 'line', yMin: l1, yMax: l1, borderColor: '#FF9800', borderWidth: 1, borderDash: [5, 5],
                                            label: { display: true, content: `${l1} ${limitLabel}`, position: 'end', backgroundColor: 'transparent', color: '#FF9800', font: { size: 10 } }
                                        };
                                    }
                                    if (l2 > 0 && l2 !== l1) {
                                        annots.limitWithdraw = {
                                            type: 'line', yMin: l2, yMax: l2, borderColor: '#F44336', borderWidth: 1, borderDash: [5, 5],
                                            label: { display: true, content: `${l2} ${limitLabel}`, position: 'end', backgroundColor: 'transparent', color: '#F44336', font: { size: 10 } }
                                        };
                                    }

                                    annots.nowLine = {
                                        type: 'line', xMin: nowTime, xMax: nowTime, borderColor: '#888', borderWidth: 1, borderDash: [2, 2],
                                        label: { display: true, content: i18n.t('bac_now'), position: 'start', backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', font: { size: 9 } }
                                    };

                                    return annots;
                                })()
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear', min: tMin, max: tMax, grid: { color: '#333', drawBorder: false },
                                ticks: {
                                    color: '#888',
                                    stepSize: tRange > 12 * 3600 * 1000 ? 6 * 3600 * 1000 : 3600 * 1000,
                                    callback: function (value) {
                                        const d = new Date(value);
                                        const h = d.getHours();
                                        if (h === 0 || tRange > 24 * 3600 * 1000) {
                                            const days = [
                                                i18n.t('day_sun'), i18n.t('day_mon'), i18n.t('day_tue'),
                                                i18n.t('day_wed'), i18n.t('day_thu'), i18n.t('day_fri'), i18n.t('day_sat')
                                            ];
                                            return days[d.getDay()] + ' ' + d.getDate();
                                        }
                                        return h + 'h';
                                    }
                                }
                            },
                            y: { min: 0, suggestedMax: Math.max(0.8, bacMax * 1.2), grid: { color: '#333', drawBorder: false }, ticks: { color: '#888', stepSize: 0.2 } }
                        }
                    }
                });
            }
        }, 100);
    }

    const breathBAC = (currentBAC * 0.44).toFixed(2);

    container.innerHTML = `
        <div style="font-size: 3rem; font-family: 'Russo One'; color: ${bacStatus.color}; line-height: 1;">
            ${formattedBAC} <span style="font-size: 1.2rem; color: #888;">g/l</span>
        </div>
        <div style="font-size: 1rem; color: #888; margin-top: 8px; margin-bottom: 5px;">
            <i style="color: #666;">${i18n.t('bac_air_expired')}:</i> <span style="color: ${bacStatus.color}; font-weight: bold;">${breathBAC}</span> mg/l
        </div>
        
        <div style="margin: 25px 0 35px 0; background: #222; border-radius: 10px; height: 12px; position: relative; overflow: visible;">
            <!-- Limit markers -->
            ${rules.sanctionThreshold > 0 ? `
            <div style="position: absolute; left: ${(rules.sanctionThreshold / visualMax) * 100}%; top: -5px; bottom: -5px; width: 2px; background: #FF9800; z-index: 2;">
                <span style="position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 0.7rem; color: #FF9800;">${rules.sanctionThreshold}</span>
            </div>
            ` : ''}
            
            ${rules.withdrawThreshold > rules.sanctionThreshold ? `
            <div style="position: absolute; left: ${(rules.withdrawThreshold / visualMax) * 100}%; top: -5px; bottom: -5px; width: 2px; background: #F44336; z-index: 2;">
                <span style="position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 0.7rem; color: #F44336;">${rules.withdrawThreshold}</span>
            </div>
            ` : (rules.withdrawThreshold === rules.sanctionThreshold ? `
                <script>/* Withdrawal and Sanction are same, handled by one orange mark */</script>
            ` : `
            <div style="position: absolute; left: ${(rules.withdrawThreshold / visualMax) * 100}%; top: -5px; bottom: -5px; width: 2px; background: #F44336; z-index: 2;">
                 <span style="position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 0.7rem; color: #F44336;">${rules.withdrawThreshold}</span>
            </div>
            `)}

            <!-- Fill -->
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${percentageOfLimit}%; background: ${bacStatus.color}; z-index: 1; transition: width 1s ease; border-radius: 10px;"></div>
            
            <!-- Scale Labels -->
            <span style="position: absolute; left: 0; bottom: -18px; font-size: 0.7rem; color: #666;">0</span>
            <span style="position: absolute; right: 0; bottom: -18px; font-size: 0.7rem; color: #666;">${visualMax.toFixed(1)}+</span>
        </div>

        ${svgGraphHtml}
        
        <!-- Recovery Section -->
        ${currentBAC > 0 ? `
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom: 20px; text-align: left;">
            <div style="font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
                🕒 ${i18n.t('bac_recovery_title')}
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <!-- Drive Recovery -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.9rem; color: #ccc;">
                        🚗 ${i18n.t('bac_recovery_legal', { limit: rules.sanctionThreshold })}
                    </span>
                    <div style="text-align: right;">
                        <span style="display: block; font-weight: bold; color: ${bacStatus.canDrive ? '#4CAF50' : '#FF9800'};">
                            ${bacStatus.canDrive ? i18n.t('time_now') : i18n.t('bac_recovery_in', { wait: bacStatus.timeToWaitShort })}
                        </span>
                        <span style="display: block; font-size: 0.75rem; color: #777;">
                            ${bacStatus.canDrive ? '✅' : bacStatus.timeAt}
                        </span>
                    </div>
                </div>

                <!-- Sober Recovery -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #222; padding-top: 12px;">
                    <span style="font-size: 0.9rem; color: #ccc;">
                        ✨ ${i18n.t('bac_recovery_sober')}
                    </span>
                    <div style="text-align: right;">
                        <span style="display: block; font-weight: bold; color: #2196F3;">
                            ${i18n.t('bac_recovery_in', { wait: bacStatus.timeToZero })}
                        </span>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}

        <div class="bac-status-enhanced" style="background: ${bacStatus.color}11; border: 1px solid ${bacStatus.color}44; margin-bottom: 20px;">
            <h2 style="color:${bacStatus.color}; margin-bottom: 4px;">${bacStatus.title}</h2>
            ${bacStatus.subtitle ? `<div class="bac-subtitle" style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background:${bacStatus.color}22; color:${bacStatus.color}; margin-bottom: 12px; font-weight: bold; text-transform: uppercase;">${bacStatus.subtitle}</div>` : ''}
            <span style="color: #eee; font-size: 0.9rem; line-height:1.4; display:block;">${bacStatus.message}</span>
            ${bacStatus.symptoms ? `<div class="bac-symptoms" style="margin-top: 10px; font-size: 0.85rem; color: #ff9800; font-style: italic;">⚠️ ${bacStatus.symptoms}</div>` : ''}
        </div>

        ${Storage.getPreference('bac_vehicle', 'voiture') === 'gamer' ? (() => {
            const sim = BAC.simulateBAC();
            const now = new Date().getTime();
            const futureCurve = sim.curve.filter(p => p.time >= now);
            const peakBac = futureCurve.length > 0 ? Math.max(...futureCurve.map(p => p.bac)) : currentBAC;
            const peakVal = Math.max(currentBAC, peakBac);
            const cur = BAC.getGamerStats(currentBAC);
            const peak = BAC.getGamerStats(peakVal);
            const statColor = cur.rankColor;

            const statCard = (icon, label, curVal, peakV, unit = '') => `
                <div class="gamer-stat-card">
                    <div class="gamer-stat-icon">${icon}</div>
                    <div class="gamer-stat-label">${label}</div>
                    <div class="gamer-stat-values">
                        <div class="gamer-stat-val"><span class="gamer-stat-tag">${i18n.t('bac_gamer_current')}</span>${curVal}${unit}</div>
                        <div class="gamer-stat-val gamer-stat-peak"><span class="gamer-stat-tag">${i18n.t('bac_gamer_peak')}</span>${peakV}${unit}</div>
                    </div>
                </div>`;

            return `
            <div class="gamer-hud-container" style="margin-bottom: 20px;">
                <div class="gamer-hud-title">${i18n.t('bac_gamer_hud_title')}</div>

                <!-- Rank Badge -->
                <div class="gamer-rank-badge" style="border-color: ${cur.rankColor}44; background: ${cur.rankColor}11;">
                    <div class="gamer-rank-icon" style="color: ${cur.rankColor}; text-shadow: 0 0 15px ${cur.rankColor}66;">🏆</div>
                    <div class="gamer-rank-name" style="color: ${cur.rankColor};">${i18n.t(cur.rankKey)}</div>
                    <div class="gamer-rank-sub">${i18n.t(cur.rankSubKey)}</div>
                    ${peakVal > currentBAC ? `<div class="gamer-rank-peak" style="color: ${peak.rankColor};">${i18n.t('bac_gamer_peak')}: ${i18n.t(peak.rankKey)}</div>` : ''}
                </div>

                <!-- Stats Grid -->
                <div class="gamer-stats-grid">
                    ${statCard('📡', i18n.t('bac_gamer_ping'), cur.ping, peak.ping, i18n.t('bac_gamer_ping_unit'))}
                    ${statCard('🖥️', i18n.t('bac_gamer_fps'), cur.fps, peak.fps, '')}
                    ${statCard('🎯', i18n.t('bac_gamer_aim_assist'), cur.aimAssist, peak.aimAssist, '%')}
                    ${statCard('👁️', i18n.t('bac_gamer_fov'), cur.fov, peak.fov, i18n.t('bac_gamer_fov_unit'))}
                </div>
                <div class="gamer-stats-grid gamer-stats-grid-wide">
                    ${statCard('📺', i18n.t('bac_gamer_resolution'), i18n.t(cur.resolutionKey), i18n.t(peak.resolutionKey))}
                    ${statCard('🖱️', i18n.t('bac_gamer_setup'), i18n.t(cur.setupKey), i18n.t(peak.setupKey))}
                </div>
            </div>`;
        })() : ''}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button id="btn-bac-add-drink" class="btn-primary" style="margin: 0; padding: 10px; font-size: 0.9rem; background: #333;">
                ${i18n.t('bac_btn_add')}
            </button>
            <button id="btn-bac-set-manual" class="btn-primary" style="margin: 0; padding: 10px; font-size: 0.9rem; background: #222; border: 1px solid #444; color: #ccc;">
                ${i18n.t('bac_btn_manual')}
            </button>
        </div>
    `;

    container.querySelector('#btn-bac-add-drink').onclick = async () => {
        const vol = await showPromptModal(i18n.t('bac_prompt_vol'), "330", { placeholder: "ex: 330", inputType: "number" });
        if (!vol) return;
        const abv = await showPromptModal(i18n.t('bac_prompt_abv'), "5.0", { placeholder: "ex: 8.5", inputType: "text" });
        if (!abv) return;

        const v = parseFloat(vol);
        const a = parseFloat(abv.replace(',', '.'));
        if (!isNaN(v) && !isNaN(a)) {
            BAC.addDrinkToBAC(v, a);
            renderBACStatsContent(container); // Refresh
        }
    };

    container.querySelector('#btn-bac-set-manual').onclick = async () => {
        const val = await showPromptModal("Forcer le taux actuel (g/l)", "0.0", { placeholder: "ex: 0.5", inputType: "text" });
        if (val !== null) {
            const v = parseFloat(val.replace(',', '.'));
            if (!isNaN(v) && v >= 0) {
                BAC.logManualBAC(v);
                renderBACStatsContent(container); // Refresh
            }
        }
    };
}

export function renderSettings(allBeers, userData, container, isDiscovery = false, discoveryCallback = null) {
    const rules = BAC.getCurrentRules();
    
    // CSS pour les settings intégrés directement
    const settingsCSS = `
        <style>
            /* Card UI Pattern */
            .setting-group { margin-bottom: 25px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .setting-group h4 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-gold); margin: 0; padding: 12px 16px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
            .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: transparent; border: none; border-bottom: 1px solid rgba(255, 255, 255, 0.05); margin: 0; transition: background 0.2s; }
            .setting-row:last-child { border-bottom: none; }
            .setting-row:hover { background: rgba(255, 255, 255, 0.02); }
            
            .setting-info { text-align: left; flex: 1; padding-right: 15px; }
            .setting-title { color: #fff; display: block; margin-bottom: 4px; font-weight: 500; font-size: 1rem; }
            .setting-desc { font-size: 0.8rem; color: #aaa; line-height: 1.4; display: block; }
            
            .setting-action { display: flex; align-items: center; justify-content: flex-end; min-width: 100px; }
            .setting-action select { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 0.9rem; margin: 0; }
            .setting-btn { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #fff; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; text-align: center; width: 100%; }
            .setting-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
            .setting-btn.danger { color: #ff3b30; border-color: rgba(255, 59, 48, 0.3); background: rgba(255, 59, 48, 0.1); }
            .setting-btn.danger:hover { background: rgba(255, 59, 48, 0.2); }
            .setting-btn.primary { color: #000; background: var(--accent-gold); border: none; font-weight: 600; }
            .setting-btn.primary:hover { background: #ffca28; }
            
            /* Toggle Switch Styles */
            input[type="checkbox"].toggle-switch {
                appearance: none;
                -webkit-appearance: none;
                width: 46px;
                height: 26px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 13px;
                position: relative;
                outline: none;
                cursor: pointer;
                transition: background 0.3s;
                margin: 0;
                flex-shrink: 0;
            }
            input[type="checkbox"].toggle-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 22px;
                height: 22px;
                background: #fff;
                border-radius: 50%;
                transition: transform 0.3s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            input[type="checkbox"].toggle-switch:checked { background: var(--accent-gold); }
            input[type="checkbox"].toggle-switch:checked::after { transform: translateX(20px); }
        </style>
    `;

    container.innerHTML = `
        ${settingsCSS}
        <div class="text-center p-20" id="settings-container">
            <h2 class="mb-20" style="font-family:'Russo One'; color:var(--accent-gold);" data-i18n="settings_main_title">Paramètres & Données</h2>

            <!-- 1. Interface & Apparence -->
            <div class="setting-group" data-group="interface">
                <h4 data-i18n="settings_group_theme_appearance">${i18n.t('settings_group_theme_appearance') || '🎨 Interface & Apparence'}</h4>
                
                <div class="setting-row" data-keywords="langue language english français">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_language">Langue</span>
                        <span class="setting-desc" data-i18n="settings_language_desc">Choisir la langue d'affichage</span>
                    </div>
                    <div class="setting-action">
                        <select id="select-language" class="form-select" style="padding:8px; width:100%;">
                            <option value="fr" ${Storage.getPreference('app_language', 'fr') === 'fr' ? 'selected' : ''}>Français</option>
                            <option value="en" ${Storage.getPreference('app_language', 'fr') === 'en' ? 'selected' : ''}>English</option>
                        </select>
                    </div>
                </div>

                <div class="setting-row" data-keywords="thème couleurs theme color preset custom">
                    <div class="setting-info" style="width:100%;">
                        <span class="setting-title">${i18n.t('settings_theme_preset') || 'Thème & Couleurs'}</span>
                        <span class="setting-desc" data-i18n="settings_theme_desc">Personnalisez l'apparence de l'application</span>
                        <div id="theme-presets-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-top:8px;">
                            ${Object.entries(Theme.THEME_PRESETS).map(([key, preset]) => {
                                const isActive = Theme.getActivePreset() === key;
                                return `<button class="theme-preset-btn form-input" data-preset="${key}" style="font-size:0.85rem; padding:10px 14px; display:flex; align-items:center; gap:8px; justify-content:flex-start; ${isActive ? 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 8px rgba(255,192,0,0.3);' : ''}">
                                    <div style="font-size:1.2rem;">${preset.emoji}</div>
                                    <span>${preset.name}</span>
                                </button>`;
                            }).join('')}
                            <button class="theme-preset-btn form-input" data-preset="custom" style="font-size:0.85rem; padding:10px 14px; display:flex; align-items:center; gap:8px; justify-content:flex-start; ${Theme.getActivePreset() === 'custom' ? 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 8px rgba(255,192,0,0.3);' : ''}">
                                <div style="font-size:1.2rem;">✏️</div>
                                <span>Custom</span>
                            </button>
                        </div>

                        <div id="theme-custom-colors" style="display:${Theme.getActivePreset() === 'custom' ? 'block' : 'none'}; border-top:1px dashed #333; padding-top:12px; margin-top:12px;">
                            <strong style="color:var(--text-primary); display:block; margin-bottom:10px; font-size:0.85rem;">${i18n.t('settings_theme_colors') || 'Couleurs personnalisées'}</strong>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                ${Theme.THEME_VARS.map(v => {
                                    const currentColors = Theme.getActiveColors();
                                    return `<div style="display:flex; align-items:center; gap:8px;">
                                        <input type="color" class="theme-color-input" data-var="${v.key}" value="${currentColors[v.key] || v.default}" style="width:32px; height:32px; border:none; background:none; cursor:pointer; padding:0; border-radius:6px;">
                                        <span style="font-size:0.7rem; color:#888;">${i18n.t(v.label) || v.key.replace('--', '')}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                            <button id="btn-theme-export" class="setting-btn" style="display:flex; align-items:center; justify-content:center; gap:8px;">📤 ${i18n.t('settings_theme_export') || 'Exporter le thème'}</button>
                            <button id="btn-theme-import" class="setting-btn" style="display:flex; align-items:center; justify-content:center; gap:8px;">📥 ${i18n.t('settings_theme_import') || 'Importer un thème'}</button>
                            <button id="btn-theme-reset" class="setting-btn danger" style="display:flex; align-items:center; justify-content:center; gap:8px;">↩️ ${i18n.t('theme_btn_reset') || 'Réinitialiser le thème'}</button>
                        </div>
                    </div>
                </div>

                <div class="setting-row" data-keywords="police font écriture text">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_font_title') || "Police d'écriture"}</span>
                        <span class="setting-desc" data-i18n="settings_font_desc">Choisissez la police d'écriture de l'application</span>
                    </div>
                    <div class="setting-action">
                        <select id="select-font-family" class="form-select" style="padding:8px; width:100%;">
                            ${Object.keys(Theme.FONTS).map(fontKey => {
                                return `<option value="${fontKey}" ${Theme.getActiveFont() === fontKey ? 'selected' : ''}>${Theme.FONTS[fontKey].label}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>

                <div class="setting-row" data-keywords="découverte discovery exploration">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_discovery_title">${i18n.t('settings_discovery_title')}</span>
                        <span class="setting-desc" data-i18n="settings_discovery_desc">${i18n.t('settings_discovery_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-discovery" ${isDiscovery ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="musée museum 3d expo">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_museum_title">${i18n.t('settings_museum_title')}</span>
                        <span class="setting-desc" data-i18n="settings_museum_desc">${i18n.t('settings_museum_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-museum" ${Storage.getPreference('museumThemeEnabled', false) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" style="flex-direction: column; align-items: stretch;" data-keywords="grille notation rating note template critère">
                    <div class="setting-info" style="margin-bottom: 10px;">
                        <span class="setting-title" data-i18n="settings_rating_grid_title">${i18n.t('settings_rating_grid_title') || 'Grille de notation'}</span>
                        <span class="setting-desc" data-i18n="settings_rating_grid_desc">${i18n.t('settings_rating_grid_desc') || 'Personnalisez les critères de notation de vos bières.'}</span>
                    </div>
                    <button type="button" id="btn-template" class="setting-btn">
                        ${i18n.t('settings_btn_configure_rating')}
                    </button>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button id="btn-preset-default" class="setting-btn ${Storage.getPreference('activePreset') === 'default' ? 'primary' : ''}" style="flex:1;">${i18n.t('preset_default')}</button>
                        <button id="btn-preset-tristan" class="setting-btn ${Storage.getPreference('activePreset') === 'tristan' ? 'primary' : ''}" style="flex:1;">${i18n.t('preset_tristan')}</button>
                        <button id="btn-preset-noah" class="setting-btn ${Storage.getPreference('activePreset') === 'noah' ? 'primary' : ''}" style="flex:1;">${i18n.t('preset_noah')}</button>
                    </div>
                </div>
            </div>

            <!-- 2. Fonctionnalités & Immersion -->
            <div class="setting-group" data-group="features">
                <h4 data-i18n="settings_group_features_immersion">${i18n.t('settings_group_features_immersion') || '⚙️ Fonctionnalités & Immersion'}</h4>

                <div class="setting-row" data-keywords="carte map localisation soif">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_toggle_map') || 'Afficher la carte (Map)'}</span>
                        <span class="setting-desc" data-i18n="settings_map_desc">Affiche une carte interactive de vos dégustations</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-feat-map" ${Storage.getPreference('feat_map_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="carte défaut pays default map country">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_map_default')}</span>
                        <span class="setting-desc">${i18n.t('settings_map_default_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <select id="select-default-map" class="form-select" style="padding:8px; width:100%;">
                            <option value="" ${!localStorage.getItem('defaultMapScope') ? 'selected' : ''}>${i18n.t('settings_map_auto')}</option>
                            <option value="be" ${localStorage.getItem('defaultMapScope') === 'be' ? 'selected' : ''}>🇧🇪 ${i18n.t('country_be')}</option>
                            <option value="fr" ${localStorage.getItem('defaultMapScope') === 'fr' ? 'selected' : ''}>🇫🇷 ${i18n.t('country_fr')}</option>
                            <option value="de" ${localStorage.getItem('defaultMapScope') === 'de' ? 'selected' : ''}>🇩🇪 ${i18n.t('country_de')}</option>
                            <option value="nl" ${localStorage.getItem('defaultMapScope') === 'nl' ? 'selected' : ''}>🇳🇱 ${i18n.t('country_nl')}</option>
                            <option value="us" ${localStorage.getItem('defaultMapScope') === 'us' ? 'selected' : ''}>🇺🇸 ${i18n.t('country_us')}</option>
                            <option value="co" ${localStorage.getItem('defaultMapScope') === 'co' ? 'selected' : ''}>🇨🇴 ${i18n.t('country_co')}</option>
                            <option value="kr" ${localStorage.getItem('defaultMapScope') === 'kr' ? 'selected' : ''}>🇰🇷 ${i18n.t('country_kr')}</option>
                            <option value="jp" ${localStorage.getItem('defaultMapScope') === 'jp' ? 'selected' : ''}>🇯🇵 ${i18n.t('country_jp')}</option>
                            <option value="cn" ${localStorage.getItem('defaultMapScope') === 'cn' ? 'selected' : ''}>🇨🇳 ${i18n.t('country_cn')}</option>
                            <option value="eu" ${localStorage.getItem('defaultMapScope') === 'eu' ? 'selected' : ''}>🇪🇺 ${i18n.t('map_scope_eu')}</option>
                            <option value="wo" ${localStorage.getItem('defaultMapScope') === 'wo' ? 'selected' : ''}>🌍 ${i18n.t('map_scope_wo')}</option>
                        </select>
                    </div>
                </div>

                <div class="setting-row" data-keywords="rappels reminders notif">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_toggle_reminders') || 'Rappels (Notation & Duplications)'}</span>
                        <span class="setting-desc" data-i18n="settings_reminders_desc">Notifications pour les bières non notées ou les doublons</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-feat-reminders" ${Storage.getPreference('feat_reminders_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="équivalences alcool">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_toggle_equivalences') || 'Équivalences alcool'}</span>
                        <span class="setting-desc" data-i18n="settings_equivalences_desc">Affiche l'équivalent en verres standards (vin, shots)</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-feat-equivalences" ${Storage.getPreference('feat_equivalences_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="beer match tinder">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_toggle_beermatch') || 'Beer Match'}</span>
                        <span class="setting-desc" data-i18n="settings_beermatch_desc">Découvrez de nouvelles bières avec des recommandations</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-feat-beermatch" ${Storage.getPreference('feat_beermatch_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="wrapped bilan spotify">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_toggle_wrapped') || 'Beerdex Wrapped'}</span>
                        <span class="setting-desc" data-i18n="settings_wrapped_desc">Générez un bilan visuel annuel de vos dégustations</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-feat-wrapped" ${Storage.getPreference('feat_wrapped_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="son audio sound">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_sound_title">${i18n.t('settings_sound_title')}</span>
                        <span class="setting-desc" data-i18n="settings_sound_desc">${i18n.t('settings_sound_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-sound" ${Storage.getPreference('soundEnabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-row" data-keywords="haptique vibrations retour haptics">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_haptics_title">${i18n.t('settings_haptics_title')}</span>
                        <span class="setting-desc" data-i18n="settings_haptics_desc">${i18n.t('settings_haptics_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-haptics" ${Storage.getPreference('hapticsEnabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- 3. Suivi & Statistiques -->
            <div class="setting-group" data-group="stats">
                <h4 data-i18n="settings_group_stats_tracking">${i18n.t('settings_group_stats_tracking') || '📊 Suivi & Statistiques'}</h4>

                <!-- BAC Toggle -->
                <div class="setting-row" data-keywords="bac alcoolémie sang blood alcohol">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="settings_bac_enable_title">${i18n.t('settings_bac_enable_title')}</span>
                        <span class="setting-desc" data-i18n="settings_bac_enable_desc">${i18n.t('settings_bac_enable_desc')}</span>
                    </div>
                    <div class="setting-action">
                        <label class="switch">
                            <input type="checkbox" class="toggle-switch" id="toggle-bac-enabled" ${Storage.getPreference('bac_enabled', true) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <!-- BAC Config Sub-group -->
                <div id="bac-settings-group" style="display: ${Storage.getPreference('bac_enabled', true) ? 'block' : 'none'}; border-left: 2px solid #333; padding-left: 10px; margin-bottom: 15px;">
                    
                    <div class="setting-row" id="bac-weight-gender-row" style="display:${Storage.getPreference('bac_hide_weight_gender', false) ? 'none' : 'flex'}; flex-wrap:wrap; gap:10px;" data-keywords="poids genre weight gender bac sexe">
                        <div style="flex:1; min-width:120px;">
                            <span class="setting-desc" style="margin-bottom:4px;" data-i18n="settings_weight_label">${i18n.t('settings_weight_label')}</span>
                            <input type="number" id="input-bac-weight" class="form-input" value="${Storage.getPreference('bac_weight', '')}" placeholder="ex: 70" min="30" max="200" style="padding:8px; width:100%;">
                        </div>
                        <div style="flex:1; min-width:120px;">
                            <span class="setting-desc" style="margin-bottom:4px;" data-i18n="settings_gender_label">${i18n.t('settings_gender_label')}</span>
                            <select id="select-bac-gender" class="form-select" style="padding:8px; width:100%;">
                                <option value="" ${!Storage.getPreference('bac_gender', null) ? 'selected' : ''}>${i18n.t('settings_gender_none')}</option>
                                <option value="M" ${Storage.getPreference('bac_gender', null) === 'M' ? 'selected' : ''}>${i18n.t('gender_male')}</option>
                                <option value="F" ${Storage.getPreference('bac_gender', null) === 'F' ? 'selected' : ''}>${i18n.t('gender_female')}</option>
                                <option value="X" ${Storage.getPreference('bac_gender', null) === 'X' ? 'selected' : ''}>${i18n.t('gender_other')}</option>
                            </select>
                        </div>
                    </div>

                    <div class="setting-row" data-keywords="cacher poids genre hide weight gender bac">
                        <div class="setting-info">
                            <span class="setting-title">${i18n.t('settings_bac_hide_wg_title')}</span>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" class="toggle-switch" id="toggle-bac-hide-wg" ${Storage.getPreference('bac_hide_weight_gender', false) ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>

                    <div class="setting-row" data-keywords="pays rules bac law">
                        <div class="setting-info">
                            <span class="setting-title">${i18n.t('settings_bac_country')}</span>
                            <span class="setting-desc">${i18n.t('settings_bac_country_desc')}</span>
                        </div>
                        <div class="setting-action">
                            <select id="select-bac-country" class="form-select" style="padding:8px; width:100%;">
                                <option value="BE" ${Storage.getPreference('bac_country', 'BE') === 'BE' ? 'selected' : ''}>🇧🇪 BE</option>
                                <option value="FR" ${Storage.getPreference('bac_country', 'BE') === 'FR' ? 'selected' : ''}>🇫🇷 FR</option>
                                <option value="DE" ${Storage.getPreference('bac_country', 'BE') === 'DE' ? 'selected' : ''}>🇩🇪 DE</option>
                                <option value="NL" ${Storage.getPreference('bac_country', 'BE') === 'NL' ? 'selected' : ''}>🇳🇱 NL</option>
                                <option value="CO" ${Storage.getPreference('bac_country', 'BE') === 'CO' ? 'selected' : ''}>🇨🇴 CO</option>
                                <option value="US" ${Storage.getPreference('bac_country', 'BE') === 'US' ? 'selected' : ''}>🇺🇸 US</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="setting-row" data-keywords="manuel home accueil bac show manual">
                        <div class="setting-info" style="display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="setting-title">${i18n.t('settings_show_home_title')}</span>
                                    <span class="setting-desc" data-i18n="settings_show_home_desc">Permet d'ajouter un widget sur votre écran d'accueil</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-switch" id="toggle-bac-home" ${Storage.getPreference('bac_show_home', true) ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="setting-title">${i18n.t('settings_manual_only_title')}</span>
                                    <span class="setting-desc" data-i18n="settings_manual_only_desc">Seules les bières ajoutées manuellement impactent l'alcoolémie</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-switch" id="toggle-bac-manual" ${Storage.getPreference('bac_manual_only', false) ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="setting-row" style="flex-wrap:wrap; gap:10px;" data-keywords="durée véhicule duration vehicle bac">
                        <div style="flex:1; min-width:120px;">
                            <span class="setting-desc" style="margin-bottom:4px;">${i18n.t('settings_bac_duration')}</span>
                            <select id="select-bac-duration" class="form-select" style="padding:8px; width:100%;">
                                <option value="0" ${Storage.getPreference('bac_drink_duration', '0') === '0' ? 'selected' : ''}>${i18n.t('settings_bac_instant')}</option>
                                <option value="15" ${Storage.getPreference('bac_drink_duration', '0') === '15' ? 'selected' : ''}>15 min</option>
                                <option value="30" ${Storage.getPreference('bac_drink_duration', '0') === '30' ? 'selected' : ''}>30 min</option>
                                <option value="45" ${Storage.getPreference('bac_drink_duration', '0') === '45' ? 'selected' : ''}>45 min</option>
                                <option value="60" ${Storage.getPreference('bac_drink_duration', '0') === '60' ? 'selected' : ''}>1h</option>
                            </select>
                        </div>
                        <div style="flex:1; min-width:120px;">
                            <span class="setting-desc" style="margin-bottom:4px;">${i18n.t('settings_bac_vehicle')}</span>
                            <select id="select-bac-vehicle" class="form-select" style="padding:8px; width:100%;">
                                <option value="voiture" ${Storage.getPreference('bac_vehicle', 'voiture') === 'voiture' ? 'selected' : ''}>🚗</option>
                                <option value="moto" ${Storage.getPreference('bac_vehicle', 'voiture') === 'moto' ? 'selected' : ''}>🏍️</option>
                                <option value="velo" ${Storage.getPreference('bac_vehicle', 'voiture') === 'velo' ? 'selected' : ''}>🚲</option>
                                <option value="pieton" ${Storage.getPreference('bac_vehicle', 'voiture') === 'pieton' ? 'selected' : ''}>🚶</option>
                                <option value="gamer" ${Storage.getPreference('bac_vehicle', 'voiture') === 'gamer' ? 'selected' : ''}>🎮</option>
                                <option value="ne_conduit_pas" ${Storage.getPreference('bac_vehicle', 'voiture') === 'ne_conduit_pas' ? 'selected' : ''}>🚫</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="setting-row" data-keywords="historique calendrier série history calendar streak bac show">
                        <div class="setting-info" style="display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="setting-title" style="font-size:0.85rem;">${i18n.t('settings_bac_show_history')}</span>
                                    <span class="setting-desc" data-i18n="settings_bac_show_history_desc">Affiche vos récentes dégustations sur la page d'accueil</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-switch" id="toggle-show-history" ${Storage.getPreference('bac_show_history', true) ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="setting-title" style="font-size:0.85rem;">${i18n.t('settings_bac_show_calendar')}</span>
                                    <span class="setting-desc" data-i18n="settings_bac_show_calendar_desc">Affiche vos jours de consommation sous forme de calendrier</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-switch" id="toggle-show-calendar" ${Storage.getPreference('bac_show_calendar', true) ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="setting-title" style="font-size:0.85rem;">${i18n.t('settings_bac_show_streak')}</span>
                                    <span class="setting-desc" data-i18n="settings_bac_show_streak_desc">Affiche le nombre de jours consécutifs sans alcool</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-switch" id="toggle-show-streak" ${Storage.getPreference('bac_show_streak', true) ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="setting-row" data-keywords="rareté spoil anim reveal rarity animation">
                    <div class="setting-info" style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; flex-direction:column;">
                                <span class="setting-title">${i18n.t('settings_reveal_rarity_title')}</span>
                                <span class="setting-desc" data-i18n="settings_reveal_rarity_desc">Cache la rareté des bières non goûtées</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-switch" id="check-reveal-rarity" ${Storage.getPreference('revealRarity', false) ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; flex-direction:column;">
                                <span class="setting-title">${i18n.t('settings_anim_once_title')}</span>
                                <span class="setting-desc" data-i18n="settings_anim_once_desc">L'animation de rareté ne joue que la première fois</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-switch" id="check-anim-once" ${Storage.getPreference('anim_only_once', false) ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="setting-row" data-keywords="cartes stats overlay volume compteur count card">
                    <div class="setting-info" style="display:flex; flex-direction:column; gap:8px;">
                        <span class="setting-title" style="color:var(--accent-gold); margin-bottom:4px;">${i18n.t('settings_card_stats_title')}</span>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; flex-direction:column;">
                                <span class="setting-title" style="font-size:0.85rem;">${i18n.t('settings_card_stats_count_title')}</span>
                                <span class="setting-desc">${i18n.t('settings_card_stats_count_desc')}</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-switch" id="toggle-card-stat-count" ${Storage.getPreference('card_stat_count', false) ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; flex-direction:column;">
                                <span class="setting-title" style="font-size:0.85rem;">${i18n.t('settings_card_stats_volume_title')}</span>
                                <span class="setting-desc">${i18n.t('settings_card_stats_volume_desc')}</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-switch" id="toggle-card-stat-volume" ${Storage.getPreference('card_stat_volume', false) ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="setting-row" style="flex-direction: column; align-items: stretch;" data-keywords="ordre tri stats order sort position">
                    <div class="setting-info" style="margin-bottom: 10px;">
                        <span class="setting-title">${i18n.t('settings_group_stats_order') || '🔄 Ordre des Statistiques'}</span>
                        <span class="setting-desc" data-i18n="settings_group_stats_order_desc">Personnalisez l'ordre d'affichage des blocs sur la page Stats</span>
                    </div>
                    <div id="stats-order-list" style="display:flex; flex-direction:column; gap:8px;">
                        ${(() => {
                            const defaultOrder = ['progression', 'equivalences', 'bac', 'streak', 'history', 'calendar', 'achievements', 'map'];
                            let currentOrder = Storage.getPreference('stats_order', defaultOrder);
                            
                            if (currentOrder.includes('donut')) {
                                currentOrder = defaultOrder;
                            } else {
                                defaultOrder.forEach(k => {
                                    if (!currentOrder.includes(k)) {
                                        currentOrder.push(k);
                                    }
                                });
                                currentOrder = currentOrder.filter(k => defaultOrder.includes(k));
                            }
                            Storage.savePreference('stats_order', currentOrder);

                            const labels = {
                                'progression': i18n.t('stats_block_progression') || "Progression",
                                'bac': i18n.t('stats_block_bac') || "Taux d'alcool (BAC)",
                                'streak': i18n.t('stats_block_streak') || "Série (Streak)",
                                'equivalences': i18n.t('stats_block_equivalences') || "Équivalences",
                                'history': i18n.t('stats_block_history') || "Historique des consos",
                                'calendar': i18n.t('stats_block_calendar') || "Calendrier de dégustation",
                                'achievements': i18n.t('stats_block_achievements') || "Succès et Badges",
                                'map': i18n.t('stats_block_map') || "Carte de Dégustation"
                            };

                            return currentOrder.map((key, index) => {
                                return `
                                    <div class="stats-order-item" data-key="${key}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px 10px; border-radius:6px; border:1px solid #333;">
                                        <span style="color:#ddd; font-size:0.85rem;">${labels[key] || key}</span>
                                        <div style="display:flex; gap:5px;">
                                            <button class="btn-stat-move-up setting-btn" data-index="${index}" style="padding:4px 10px; width:auto; ${index === 0 ? 'opacity:0.3;' : ''}" ${index === 0 ? 'disabled' : ''}>↑</button>
                                            <button class="btn-stat-move-down setting-btn" data-index="${index}" style="padding:4px 10px; width:auto; ${index === currentOrder.length - 1 ? 'opacity:0.3;' : ''}" ${index === currentOrder.length - 1 ? 'disabled' : ''}>↓</button>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                </div>
            </div>

            <!-- 4. Données & Sauvegarde -->
            <div class="setting-group" data-group="data">
                <h4 data-i18n="settings_group_data_backup">${i18n.t('settings_group_data_backup') || '💾 Données & Sauvegarde'}</h4>

                <div class="setting-row" data-keywords="exporter importer données json export import data save">
                    <div class="setting-info" style="margin-bottom: 0;">
                        <span class="setting-title">${i18n.t('settings_group_data') || 'Gestion des données'}</span>
                        <span class="setting-desc" style="margin-bottom:10px;">${i18n.t('settings_data_desc')}</span>
                        <div style="display:flex; gap:8px;">
                            <button id="btn-manage-export" class="setting-btn primary" style="flex:1;">📤 ${i18n.t('export_btn_submit')}</button>
                            <button id="btn-manage-import" class="setting-btn" style="flex:1;">📥 ${i18n.t('import_title')}</button>
                        </div>
                    </div>
                </div>

                <div class="setting-row" data-keywords="réinitialiser supprimer reset clear effacer delete">
                    <div class="setting-info" style="width:100%;">
                        <span class="setting-title" style="color:#ff6b6b;">${i18n.t('settings_danger_zone')}</span>
                        <span class="setting-desc" data-i18n="settings_danger_desc" style="margin-bottom:10px;">${i18n.t('settings_danger_desc') || 'Suppression définitive des données'}</span>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
                            <button id="btn-reset-ratings" class="setting-btn" style="font-size:0.75rem;">${i18n.t('settings_reset_ratings')}</button>
                            <button id="btn-reset-custom" class="setting-btn" style="font-size:0.75rem;">${i18n.t('settings_reset_custom')}</button>
                            <button id="btn-reset-history" class="setting-btn" style="font-size:0.75rem;">${i18n.t('settings_reset_history')}</button>
                            <button id="btn-reset-fav" class="setting-btn" style="font-size:0.75rem;">${i18n.t('settings_reset_favs')}</button>
                        </div>
                        <button id="btn-reset-app" class="setting-btn danger">🔥 ${i18n.t('settings_reset_app')}</button>
                    </div>
                </div>
            </div>

            <!-- 5. Système & Support -->
            <div class="setting-group" data-group="system">
                <h4 data-i18n="settings_group_system_support">${i18n.t('settings_group_system_support') || '🛠️ Système & Support'}</h4>

                <div class="setting-row" data-keywords="mise à jour update actualiser version">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_check_update') || 'Vérifier les mises à jour'}</span>
                        <span class="setting-desc" data-i18n="settings_check_update_desc">Forcer la recherche de la dernière version de l'application</span>
                    </div>
                    <div class="setting-action">
                        <button id="btn-check-update" class="setting-btn">🔄 ${i18n.t('btn_refresh') || 'Actualiser'}</button>
                    </div>
                </div>

                <div class="setting-row" data-keywords="tutoriel guide aide tutorial tuto">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_restart_tuto') || 'Refaire le tutoriel'}</span>
                        <span class="setting-desc" data-i18n="settings_restart_tuto_desc">Relancer le guide de démarrage interactif</span>
                    </div>
                    <div class="setting-action">
                        <button id="btn-restart-tuto" class="setting-btn">🎓 ${i18n.t('btn_launch') || 'Lancer'}</button>
                    </div>
                </div>

                <div class="setting-row" data-keywords="demander ajouter bière request beer">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('request_beer_btn') || 'Demander une Bière'}</span>
                        <span class="setting-desc" data-i18n="settings_request_beer_desc">Soumettre une bière manquante pour ajout à la base</span>
                    </div>
                    <div class="setting-action">
                        <button id="btn-request-beer" class="setting-btn primary">🍺 ${i18n.t('btn_request') || 'Demander'}</button>
                    </div>
                </div>

                <div class="setting-row" data-keywords="nettoyer doublons deduplicate clean">
                    <div class="setting-info">
                        <span class="setting-title">${i18n.t('settings_btn_dedup') || 'Nettoyer les doublons'}</span>
                        <span class="setting-desc" data-i18n="settings_dedup_desc">Fusionner vos bières personnalisées avec les bières officielles</span>
                    </div>
                    <div class="setting-action">
                        <button id="btn-deduplicate-db" class="setting-btn">🧹 ${i18n.t('btn_clean') || 'Nettoyer'}</button>
                    </div>
                </div>

                <div class="setting-row" data-keywords="diagnostic debug log admin développeur console">
                    <div class="setting-info">
                        <span class="setting-title" data-i18n="debug_dev_settings">${i18n.t('debug_dev_settings') || 'Diagnostic & Debug'}</span>
                        <span class="setting-desc" data-i18n="settings_debug_desc">Outils avancés pour la réparation et le test</span>
                    </div>
                    <div class="setting-action">
                        <button id="btn-open-debug" class="setting-btn">⚙️ ${i18n.t('btn_open') || 'Ouvrir'}</button>
                    </div>
                </div>
            </div>
           
            <div class="mt-40 text-center">
                <h3 style="color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:25px;" data-i18n="settings_whats_new">${i18n.t('settings_whats_new')}</h3>
                ${renderPatchnotesSection()}
            </div>

            <div class="mt-40 text-center" style="margin-bottom: 60px;">
                <h3 style="color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:25px;" data-i18n="settings_credits">${i18n.t('settings_credits')}</h3>
                
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div>
                        <p style="color:var(--accent-gold); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;" data-i18n="settings_founders">${i18n.t('settings_founders')}</p>
                        <p style="font-size:0.9rem; color:#eee;">Dorian Storms, Noah Bruijninckx, Tristan Storms & Maxance Veulemans</p>
                    </div>
                    
                    <div>
                        <p style="color:var(--accent-gold); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;" data-i18n="settings_design_code">${i18n.t('settings_design_code')}</p>
                        <p style="font-size:0.9rem; color:#eee;">Noah Bruijninckx</p>
                    </div>
                </div>
                
                <div style="margin-top:30px; font-size:0.7rem; color:#444; border-top:1px solid #222; padding-top:15px; width:50%; margin-left:auto; margin-right:auto;">
                    Beerdex v4.1 &copy; 2026
                    <!-- Légal -->
                    <div style="border-top:1px dashed #333; padding-top:20px; margin-top:20px;">
                        <h4 style="color:#888; margin-bottom:12px; font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;" data-i18n="settings_legal_section">${i18n.t('settings_legal_section')}</h4>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <button id="btn-legal-tos" class="form-input" style="background:none; border:1px solid #333; color:#aaa; text-align:left; font-size:0.85rem; padding:10px;">📄 ${i18n.t('legal_tos_title')}</button>
                            <button id="btn-legal-privacy" class="form-input" style="background:none; border:1px solid #333; color:#aaa; text-align:left; font-size:0.85rem; padding:10px;">🛡️ ${i18n.t('legal_privacy_title')}</button>
                            <button id="btn-legal-copyright" class="form-input" style="background:none; border:1px solid #333; color:#aaa; text-align:left; font-size:0.85rem; padding:10px;">⚖️ ${i18n.t('legal_copyright_title')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- Handlers ---
    
    // --- Theme Handlers ---
    container.querySelectorAll('.theme-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'custom') {
                const customDiv = container.querySelector('#theme-custom-colors');
                if (customDiv) customDiv.style.display = 'block';
                Storage.savePreference('theme_preset', 'custom');
                Theme.applyColors(Theme.getActiveColors());
            } else {
                Theme.applyPreset(preset);
                const customDiv = container.querySelector('#theme-custom-colors');
                if (customDiv) customDiv.style.display = 'none';
            }
            showToast(i18n.t('toast_theme_applied') || 'Thème appliqué !', 'success');
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        });
    });

    container.querySelectorAll('.theme-color-input').forEach(input => {
        input.addEventListener('input', (e) => {
            Theme.setCustomColor(e.target.dataset.var, e.target.value);
        });
    });

    const btnThemeExport = container.querySelector('#btn-theme-export');
    if (btnThemeExport) {
        btnThemeExport.addEventListener('click', async () => {
            const code = Theme.exportTheme();
            try {
                await navigator.clipboard.writeText(code);
                Storage.savePreference('theme_shared', true);
                window.dispatchEvent(new Event('beerdex-action'));
                showToast(i18n.t('toast_theme_exported') || 'Code thème copié dans le presse-papiers !', 'success');
            } catch {
                prompt(i18n.t('toast_theme_export_manual') || 'Copiez ce code :', code);
            }
        });
    }

    const btnThemeImport = container.querySelector('#btn-theme-import');
    if (btnThemeImport) {
        btnThemeImport.addEventListener('click', () => {
            const code = prompt(i18n.t('settings_theme_import_prompt') || 'Collez le code du thème (THEME_...) :');
            if (code) {
                const result = Theme.importTheme(code.trim());
                if (result.success) {
                    showToast(result.message, 'success');
                    renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
                } else {
                    showToast(result.message, 'error');
                }
            }
        });
    }

    const btnThemeReset = container.querySelector('#btn-theme-reset');
    if (btnThemeReset) {
        btnThemeReset.addEventListener('click', () => {
            Theme.resetTheme();
            showToast(i18n.t('toast_theme_reset') || 'Thème réinitialisé', 'info');
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        });
    }

    const fontSelect = container.querySelector('#select-font-family');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            Theme.applyFont(e.target.value);
            showToast("Police d'écriture mise à jour");
        });
    }

    const btnDebug = container.querySelector('#btn-open-debug');
    if (btnDebug) {
        btnDebug.addEventListener('click', () => {
            renderDebugModal();
        });
    }

    const mapSelect = container.querySelector('#select-default-map');
    if (mapSelect) {
        mapSelect.onchange = (e) => {
            const val = e.target.value;
            if (val) localStorage.setItem('defaultMapScope', val);
            else localStorage.removeItem('defaultMapScope');
            showToast(i18n.t('toast_map_updated'));
        };
    }

    const toggles = [
        { id: '#toggle-feat-map', key: 'feat_map_enabled' },
        { id: '#toggle-feat-reminders', key: 'feat_reminders_enabled' },
        { id: '#toggle-feat-equivalences', key: 'feat_equivalences_enabled' },
        { id: '#toggle-feat-beermatch', key: 'feat_beermatch_enabled' },
        { id: '#toggle-feat-wrapped', key: 'feat_wrapped_enabled' }
    ];

    toggles.forEach(t => {
        const el = container.querySelector(t.id);
        if (el) {
            el.addEventListener('change', (e) => {
                Storage.savePreference(t.key, e.target.checked);
            });
        }
    });

    container.querySelector('#btn-template').onclick = () => renderTemplateEditor();

    container.querySelector('#btn-preset-default').onclick = async () => {
        if (await showConfirmModal(i18n.t('modal_confirm_std_preset'), { danger: false })) {
            Storage.resetRatingTemplate();
            Storage.savePreference('activePreset', 'default');
            showToast(i18n.t('toast_preset_std_applied'));
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        }
    };

    container.querySelector('#btn-preset-tristan').onclick = async () => {
        if (await showConfirmModal(i18n.t('modal_confirm_tristan_preset'), { danger: false })) {
            applyTristanPreset();
            showToast(i18n.t('toast_preset_tristan_applied'));
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        }
    };

    container.querySelector('#btn-preset-noah').onclick = async () => {
        if (await showConfirmModal(i18n.t('modal_confirm_noah_preset'), { danger: false })) {
            applyNoahPreset();
            showToast(i18n.t('toast_preset_noah_applied'));
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        }
    };

    if (discoveryCallback) {
        container.querySelector('#toggle-discovery').onchange = (e) => {
            discoveryCallback(e.target.checked);
        };
    }

    container.querySelectorAll('.btn-stat-move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            if (idx > 0) {
                const currentOrder = Storage.getPreference('stats_order', ['progression', 'equivalences', 'bac', 'streak', 'history', 'calendar', 'achievements', 'map']);
                const temp = currentOrder[idx];
                currentOrder[idx] = currentOrder[idx - 1];
                currentOrder[idx - 1] = temp;
                Storage.savePreference('stats_order', currentOrder);
                renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
            }
        });
    });

    container.querySelectorAll('.btn-stat-move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            const currentOrder = Storage.getPreference('stats_order', ['progression', 'equivalences', 'bac', 'streak', 'history', 'calendar', 'achievements', 'map']);
            if (idx < currentOrder.length - 1) {
                const temp = currentOrder[idx];
                currentOrder[idx] = currentOrder[idx + 1];
                currentOrder[idx + 1] = temp;
                Storage.savePreference('stats_order', currentOrder);
                renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
            }
        });
    });

    const toggleMuseum = container.querySelector('#toggle-museum');
    if (toggleMuseum) {
        toggleMuseum.onchange = (e) => {
            const enabled = e.target.checked;
            Storage.savePreference('museumThemeEnabled', enabled);
            window.dispatchEvent(new Event('beerdex-action'));
            const museumLink = document.getElementById('css-museum');
            if (museumLink) museumLink.disabled = !enabled;
            if (enabled) {
                document.body.classList.add('theme-museum');
                const curtainOverlay = document.getElementById('curtain-overlay');
                if (curtainOverlay) {
                    curtainOverlay.style.display = 'flex';
                    setTimeout(() => { curtainOverlay.style.display = 'none'; }, 3500);
                }
            } else {
                document.body.classList.remove('theme-museum');
            }
            showToast(enabled ? i18n.t('toast_museum_on') : i18n.t('toast_museum_off'));
        };
    }

    container.querySelector('#toggle-sound').onchange = (e) => {
        Storage.savePreference('soundEnabled', e.target.checked);
        Feedback.reloadSettings();
        if (e.target.checked) Feedback.playSuccess();
    };

    container.querySelector('#toggle-haptics').onchange = (e) => {
        Storage.savePreference('hapticsEnabled', e.target.checked);
        Feedback.reloadSettings();
        if (e.target.checked) Feedback.impactMedium();
    };

    const checkRarity = container.querySelector('#check-reveal-rarity');
    if (checkRarity) checkRarity.onchange = (e) => { Storage.savePreference('revealRarity', e.target.checked); showToast(i18n.t('toast_preference_saved')); };

    const checkAnimOnce = container.querySelector('#check-anim-once');
    if (checkAnimOnce) checkAnimOnce.onchange = (e) => { Storage.savePreference('anim_only_once', e.target.checked); showToast(i18n.t('toast_preference_saved')); };

    const toggleCardStatCount = container.querySelector('#toggle-card-stat-count');
    if (toggleCardStatCount) toggleCardStatCount.onchange = (e) => { Storage.savePreference('card_stat_count', e.target.checked); showToast(i18n.t('toast_preference_saved')); };

    const toggleCardStatVolume = container.querySelector('#toggle-card-stat-volume');
    if (toggleCardStatVolume) toggleCardStatVolume.onchange = (e) => { Storage.savePreference('card_stat_volume', e.target.checked); showToast(i18n.t('toast_preference_saved')); };

    const toggleBac = container.querySelector('#toggle-bac-enabled');
    if (toggleBac) {
        toggleBac.onchange = (e) => {
            const enabled = e.target.checked;
            Storage.savePreference('bac_enabled', enabled);
            const group = container.querySelector('#bac-settings-group');
            if (group) group.style.display = enabled ? 'block' : 'none';
            showToast(enabled ? i18n.t('toast_bac_on') : i18n.t('toast_bac_off'));
        };
    }

    const inputWeight = container.querySelector('#input-bac-weight');
    if (inputWeight) inputWeight.onchange = (e) => { let val = parseInt(e.target.value); if (isNaN(val) || val < 30) val = 30; Storage.savePreference('bac_weight', val); };

    const selectGender = container.querySelector('#select-bac-gender');
    if (selectGender) selectGender.onchange = (e) => { Storage.savePreference('bac_gender', e.target.value); };

    const toggleBacHome = container.querySelector('#toggle-bac-home');
    if (toggleBacHome) toggleBacHome.onchange = (e) => { Storage.savePreference('bac_show_home', e.target.checked); };

    const toggleBacHideWg = container.querySelector('#toggle-bac-hide-wg');
    if (toggleBacHideWg) {
        toggleBacHideWg.onchange = (e) => {
            const hide = e.target.checked;
            Storage.savePreference('bac_hide_weight_gender', hide);
            const row = container.querySelector('#bac-weight-gender-row');
            if (row) row.style.display = hide ? 'none' : 'flex';
        };
    }

    const toggleBacManual = container.querySelector('#toggle-bac-manual');
    if (toggleBacManual) toggleBacManual.onchange = (e) => { Storage.savePreference('bac_manual_only', e.target.checked); };

    const selectBacDuration = container.querySelector('#select-bac-duration');
    if (selectBacDuration) selectBacDuration.onchange = (e) => { Storage.savePreference('bac_drink_duration', e.target.value); showToast(i18n.t('toast_bac_duration_updated')); };

    const selectBacVehicle = container.querySelector('#select-bac-vehicle');
    if (selectBacVehicle) selectBacVehicle.onchange = (e) => { Storage.savePreference('bac_vehicle', e.target.value); showToast(i18n.t('toast_bac_vehicle_updated')); };

    const selectBacCountry = container.querySelector('#select-bac-country');
    if (selectBacCountry) selectBacCountry.onchange = (e) => { Storage.savePreference('bac_country', e.target.value); showToast(i18n.t('toast_bac_rule_updated')); };

    const toggleHistory = container.querySelector('#toggle-show-history');
    if (toggleHistory) toggleHistory.onchange = (e) => { Storage.savePreference('bac_show_history', e.target.checked); showToast(i18n.t('toast_preference_saved')); };
    const toggleCalendar = container.querySelector('#toggle-show-calendar');
    if (toggleCalendar) toggleCalendar.onchange = (e) => { Storage.savePreference('bac_show_calendar', e.target.checked); showToast(i18n.t('toast_preference_saved')); };
    const toggleStreak = container.querySelector('#toggle-show-streak');
    if (toggleStreak) toggleStreak.onchange = (e) => { Storage.savePreference('bac_show_streak', e.target.checked); showToast(i18n.t('toast_preference_saved')); };

    container.querySelector('#btn-legal-tos').onclick = () => renderLegalPage('tos');
    container.querySelector('#btn-legal-privacy').onclick = () => renderLegalPage('privacy');
    container.querySelector('#btn-legal-copyright').onclick = () => renderLegalPage('copyright');

    const selectLanguage = container.querySelector('#select-language');
    if (selectLanguage) {
        selectLanguage.onchange = async (e) => {
            const { i18n } = await import('./i18n.js');
            await i18n.setLanguage(e.target.value);
            showToast(i18n.t('toast_lang_updated'));
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        };
    }

    const patchnoteEl = container.querySelector('.patchnote-section[data-new="true"]');
    if (patchnoteEl) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    markPatchnotesSeen();
                    observer.disconnect();
                }
            });
        }, { threshold: 0.3 });
        observer.observe(patchnoteEl);
    }

    container.querySelector('#btn-manage-import').onclick = () => renderImportModal();
    container.querySelector('#btn-manage-export').onclick = () => renderExportModal();

    container.querySelector('#btn-check-update').onclick = async () => {
        if ('serviceWorker' in navigator) {
            showToast(i18n.t('toast_forcing_update'), "info");
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) await registration.unregister();
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map(key => caches.delete(key)));
                showToast(i18n.t('toast_caches_cleared'), "success");
                setTimeout(() => window.location.reload(true), 1500);
            } catch (e) {
                console.error("Update failed", e);
                showToast(i18n.t('toast_update_error', { err: e.message }));
            }
        } else {
            showToast(i18n.t('toast_sw_unsupported'));
        }
    };

    container.querySelector('#btn-restart-tuto').onclick = () => {
        const homeBtn = document.querySelector('.nav-item[data-view="home"]');
        if (homeBtn) homeBtn.click();
        setTimeout(() => TutorialSystem.start(), 500);
    };

    container.querySelector('#btn-request-beer').onclick = () => renderRequestBeerForm(allBeers);
    container.querySelector('#btn-deduplicate-db').onclick = () => renderDeduplicationWizard(allBeers);

    const confirmReset = async (msg, action) => {
        if (await showConfirmModal(msg)) {
            action();
            Analytics.track('data_reset', { action: action.name || 'unknown' });
            showToast(i18n.t('toast_data_clear_success'));
            setTimeout(() => location.reload(), 1000);
        }
    };

    const btnResetRatings = container.querySelector('#btn-reset-ratings');
    if (btnResetRatings) btnResetRatings.onclick = () => confirmReset(i18n.t('modal_confirm_delete_ratings'), Storage.resetRatingsOnly);

    const btnResetCustom = container.querySelector('#btn-reset-custom');
    if (btnResetCustom) btnResetCustom.onclick = () => confirmReset(i18n.t('modal_confirm_delete_custom'), Storage.resetCustomBeersOnly);

    const btnResetHistory = container.querySelector('#btn-reset-history');
    if (btnResetHistory) btnResetHistory.onclick = () => confirmReset(i18n.t('modal_confirm_delete_history'), Storage.resetConsumptionHistoryOnly);

    const btnResetFav = container.querySelector('#btn-reset-fav');
    if (btnResetFav) btnResetFav.onclick = () => confirmReset(i18n.t('modal_confirm_delete_favs'), Storage.resetFavoritesOnly);

    container.querySelector('#btn-reset-app').onclick = async () => {
        if (await showConfirmModal(i18n.t('modal_confirm_reset_app'))) {
            if (await showConfirmModal(i18n.t('modal_confirm_reset_app_final'), { confirmText: i18n.t('btn_reset') })) {
                Storage.resetAllData();
                location.reload();
            }
        }
    };

    i18n.translateDOM(container);
}

export function renderDeduplicationWizard(allBeers) {
    const matches = Deduplicator.runCheck(allBeers, true);
    if (!matches || matches.length === 0) {
        showToast(i18n.t('toast_nothing_found') || 'Aucun doublon trouvÃ©.');
        return;
    }

    let currentIndex = 0;

    const showNext = () => {
        if (currentIndex >= matches.length) {
            modalContainer.style.display = '';
            modalContainer.classList.add('hidden');
            modalContainer.innerHTML = '';
            showToast('Nettoyage terminé !');
            renderSettings(allBeers, Storage.getAllUserData(), document.getElementById('main-content'));
            return;
        }

        const match = matches[currentIndex];
        const { customBeer, officialBeer, score } = match;
        const userData = Storage.getAllUserData();
        const customData = userData[customBeer.id] || {};
        
        const customImg = customBeer.image || 'images/beer/default.png';
        const officialImg = officialBeer.image || 'images/beer/default.png';
        const drinkCount = customData.count || 0;
        const historyCount = (customData.history || []).length;
        const hasRating = customData.score !== undefined;

        const migrationTitleText = i18n.t('migration_title') || 'Transfert disponible';
        const migrationSubtitleText = `${currentIndex + 1} / ${matches.length} - ${i18n.t('migration_subtitle') || 'Voulez-vous fusionner ces entrées ?'}`;
        const migrationCustomLabel = i18n.t('migration_label_custom') || 'Personnalisée';
        const migrationOfficialLabel = i18n.t('migration_label_official') || 'Officielle';
        const migrationSimilarityText = i18n.t('migration_similarity') || 'Similarité :';
        const migrationDrinksText = i18n.t('migration_drinks') || 'Consommations';
        const migrationHistoryText = i18n.t('migration_history') || 'Historique';
        const migrationEntriesText = i18n.t('migration_entries') || 'entrées';
        const migrationRatingText = i18n.t('migration_rating') || 'Note';
        const migrationDismissText = i18n.t('migration_btn_dismiss') || 'Ignorer';
        const migrationTransferText = i18n.t('migration_btn_reconcile') || 'Fusionner et remplacer';

        modalContainer.innerHTML = `
            <div class="modal-overlay active" id="migration-overlay">
                <div class="modal-content" style="max-width: 420px; border: 1px solid rgba(255,192,0,0.3); background: var(--bg-card);">
                    <div style="text-align: center; padding: 20px 20px 10px;">
                        <div style="font-size: 2rem; margin-bottom: 10px;">🧹</div>
                        <h3 style="color: var(--accent-gold); font-family: 'Russo One', sans-serif; margin-bottom: 5px;">
                            ${migrationTitleText}
                        </h3>
                        <p style="font-size: 0.8rem; color: #888; margin-bottom: 20px;">
                            ${migrationSubtitleText}
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: center; gap: 15px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 12px; margin: 0 15px 15px;">
                        <div style="text-align: center; flex: 1;">
                            <img src="${customImg}" alt="" onerror="this.src='images/beer/default.png'" 
                                 style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #222; margin-bottom: 6px;">
                            <div style="font-size: 0.75rem; color: #aaa; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 auto;">${customBeer.title}</div>
                            <div style="font-size: 0.65rem; color: #666; margin-top: 2px;">${migrationCustomLabel}</div>
                        </div>

                        <div style="font-size: 1.5rem; color: var(--accent-gold);">→</div>

                        <div style="text-align: center; flex: 1;">
                            <img src="${officialImg}" alt="" onerror="this.src='images/beer/default.png'" 
                                 style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #222; margin-bottom: 6px;">
                            <div style="font-size: 0.75rem; color: #fff; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 auto;">${officialBeer.title}</div>
                            <div style="font-size: 0.65rem; color: var(--accent-gold); margin-top: 2px;">${migrationOfficialLabel}</div>
                        </div>
                    </div>

                    <div style="padding: 0 15px 15px; font-size: 0.8rem; color: #aaa;">
                        <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>${migrationSimilarityText}</span>
                                <span style="color: var(--accent-gold); font-weight: bold;">${score}%</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>${migrationDrinksText}</span>
                                <span style="color: #fff;">${drinkCount}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>${migrationHistoryText}</span>
                                <span style="color: #fff;">${historyCount} ${migrationEntriesText}</span>
                            </div>
                            ${hasRating ? `<div style="display: flex; justify-content: space-between;">
                                <span>${migrationRatingText}</span>
                                <span style="color: #fff;">${customData.score}/20</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; padding: 0 15px 20px;">
                        <button id="btn-wiz-dismiss" class="btn-primary" style="flex: 1; background: #222; border: 1px solid #444; color: #aaa; margin: 0;">
                            ${migrationDismissText}
                        </button>
                        <button id="btn-wiz-confirm" class="btn-primary" style="flex: 1; background: var(--accent-gold); color: #000; font-weight: bold; margin: 0;">
                            ${migrationTransferText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.classList.remove('hidden');

        const overlay = document.getElementById('migration-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                modalContainer.style.display = '';
                modalContainer.classList.add('hidden');
                modalContainer.innerHTML = '';
            }
        });

        document.getElementById('btn-wiz-dismiss').addEventListener('click', () => {
            Deduplicator.dismissMatch(customBeer.id, officialBeer.id);
            currentIndex++;
            showNext();
        });

        document.getElementById('btn-wiz-confirm').addEventListener('click', () => {
            const result = Storage.migrateBeerData(customBeer.id, officialBeer.id);
            if (result.success) {
                Feedback.playSuccess();
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(i18n.t('migration_error') || 'Erreur.', 'error');
            }
            currentIndex++;
            showNext();
        });
    };

    showNext();
}

function renderRequestBeerForm(allBeers = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.maxHeight = '85vh';
    wrapper.style.overflowY = 'auto';

    const sectionStyle = `background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:2px;`;
    const sectionTitle = (icon, text) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:1.1rem;">${icon}</span><strong style="color:var(--accent-gold);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;">${text}</strong></div>`;
    const reqStar = `<span style="color:#f44336;margin-left:2px;">*</span>`;

    wrapper.innerHTML = `
        <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:2.8rem;margin-bottom:6px;filter:drop-shadow(0 2px 8px rgba(245,158,11,0.4));">🍺</div>
            <h2 style="color:var(--accent-gold);margin-bottom:4px;font-size:1.3rem;">${i18n.t('request_beer_title')}</h2>
            <p style="font-size:0.8rem;color:#666;">${i18n.t('request_beer_subtitle')}</p>
        </div>

        <div style="background:linear-gradient(135deg,rgba(255,152,0,0.08),rgba(255,152,0,0.03));padding:10px 14px;border-radius:10px;margin-bottom:16px;text-align:left;border:1px solid rgba(255,152,0,0.15);">
            <span style="font-size:0.78rem;color:#ffb74d;line-height:1.5;">${i18n.t('request_beer_search_first')}</span>
        </div>

        <form id="request-beer-form" style="display:flex;flex-direction:column;gap:10px;">

            <!-- Section 1: Identity -->
            <div style="${sectionStyle}">
                ${sectionTitle('👤', i18n.t('request_beer_firstname').split(' ')[0] === 'First' ? 'Your Info' : 'Vos Infos')}
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;display:flex;align-items:center;gap:3px;">${i18n.t('request_beer_firstname')}${reqStar}</label>
                        <input type="text" class="form-input" name="firstname" required placeholder="${i18n.t('request_beer_firstname_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;display:flex;align-items:center;gap:3px;">${i18n.t('request_beer_lastname')}${reqStar}</label>
                        <input type="text" class="form-input" name="lastname" required placeholder="${i18n.t('request_beer_lastname_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                </div>
                <div>
                    <label class="form-label" style="font-size:0.78rem;display:flex;align-items:center;gap:3px;">📧 ${i18n.t('request_beer_email_label')}${reqStar}</label>
                    <input type="email" class="form-input" name="user_email" required placeholder="${i18n.t('request_beer_email_placeholder_v2')}" style="padding:10px;font-size:0.9rem;">
                </div>
            </div>

            <!-- Section 2: Beer Info -->
            <div style="${sectionStyle}">
                ${sectionTitle('🍻', i18n.t('request_beer_name').split(' ')[0] === 'Beer' ? 'Beer Details' : 'Détails Bière')}
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.78rem;display:flex;align-items:center;gap:3px;">${i18n.t('request_beer_name')}${reqStar}</label>
                    <input type="text" class="form-input" name="beer_name" required placeholder="${i18n.t('request_beer_name_placeholder')}" style="padding:10px;font-size:0.9rem;">
                </div>
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_brewery')}</label>
                    <input type="text" class="form-input" name="brewery" placeholder="${i18n.t('request_beer_brewery_placeholder')}" style="padding:10px;font-size:0.9rem;">
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_type')}</label>
                        <input type="text" class="form-input" name="beer_type" placeholder="${i18n.t('request_beer_type_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                    <div style="flex:0.5;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_alcohol')}</label>
                        <input type="text" class="form-input" name="alcohol" placeholder="${i18n.t('request_beer_alcohol_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_volume')}</label>
                        <input type="text" class="form-input" name="volume" placeholder="${i18n.t('request_beer_volume_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_country')}</label>
                        <input type="text" class="form-input" name="country" placeholder="${i18n.t('request_beer_country_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                </div>
            </div>

            <!-- Section 3: Extra Details -->
            <div style="${sectionStyle}">
                ${sectionTitle('📋', i18n.t('request_beer_region').split(' ')[0] === 'Region' ? 'Extra Details' : 'Détails Supplémentaires')}
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_region')}</label>
                    <input type="text" class="form-input" name="region" placeholder="${i18n.t('request_beer_region_placeholder')}" style="padding:10px;font-size:0.9rem;">
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_distribution')}</label>
                        <select class="form-select" name="distribution" style="padding:10px;font-size:0.9rem;">
                            <option value="">${i18n.t('request_beer_dist_unknown')}</option>
                            <option value="Partout">${i18n.t('form_dist_partout')}</option>
                            <option value="Supermarché">${i18n.t('form_dist_supermarket')}</option>
                            <option value="Cavistes">${i18n.t('form_dist_cavistes')}</option>
                            <option value="Cavistes spécialisés">${i18n.t('form_dist_cavistes_spec')}</option>
                            <option value="À la brasserie">${i18n.t('form_dist_brewery')}</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_barcode')}</label>
                        <input type="text" class="form-input" name="barcode" inputmode="numeric" placeholder="${i18n.t('request_beer_barcode_placeholder')}" style="padding:10px;font-size:0.9rem;">
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.78rem;">${i18n.t('request_beer_ingredients')}</label>
                    <input type="text" class="form-input" name="ingredients" placeholder="${i18n.t('request_beer_ingredients_placeholder')}" style="padding:10px;font-size:0.9rem;">
                </div>
                <div style="display:flex;gap:16px;padding:6px 0;margin-bottom:10px;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;">
                        <input type="checkbox" name="barrel_aged" style="width:18px;height:18px;accent-color:var(--accent-gold);">
                        ${i18n.t('request_beer_barrel')}
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;">
                        <input type="checkbox" name="seasonal" style="width:18px;height:18px;accent-color:var(--accent-gold);">
                        ${i18n.t('request_beer_seasonal')}
                    </label>
                </div>
                <div>
                    <label class="form-label" style="font-size:0.78rem;">🔗 ${i18n.t('request_beer_link')}</label>
                    <input type="url" class="form-input" name="link" placeholder="${i18n.t('request_beer_link_placeholder')}" style="padding:10px;font-size:0.9rem;">
                </div>
            </div>

            <button type="submit" id="btn-submit-request" class="btn-primary"
                style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;margin-top:4px;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.35);transition:transform 0.15s,box-shadow 0.15s;letter-spacing:0.3px;">
                ${i18n.t('request_beer_submit')}
            </button>
        </form>
    `;

    openModal(wrapper);

    const form = wrapper.querySelector('#request-beer-form');
    const submitBtn = wrapper.querySelector('#btn-submit-request');

    form.onsubmit = async (e) => {
        e.preventDefault();

        // --- Rate limiting (60s cooldown) ---
        const lastSent = parseInt(localStorage.getItem('beerdex_req_ts') || '0', 10);
        const cooldown = 60000;
        if (Date.now() - lastSent < cooldown) {
            const secs = Math.ceil((cooldown - (Date.now() - lastSent)) / 1000);
            showToast(`⏳ ${secs}s`, 'error');
            return;
        }

        // --- Sanitize helper ---
        const clean = (v) => (v || '').trim().replace(/[<>]/g, '');

        const firstname = clean(form.querySelector('[name="firstname"]').value);
        const lastname = clean(form.querySelector('[name="lastname"]').value);
        const userEmail = clean(form.querySelector('[name="user_email"]').value);

        if (!firstname || !lastname || !userEmail) {
            showToast(i18n.t('request_beer_identity_required'), 'error');
            return;
        }

        // Email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(userEmail)) {
            showToast(i18n.t('request_beer_identity_required'), 'error');
            return;
        }

        const beerName = clean(form.querySelector('[name="beer_name"]').value);
        if (!beerName) {
            showToast(i18n.t('request_beer_required'), 'error');
            return;
        }

        // --- Levenshtein distance for fuzzy matching ---
        const levenshtein = (a, b) => {
            const m = a.length, n = b.length;
            if (!m) return n; if (!n) return m;
            const d = Array.from({length: m + 1}, (_, i) => [i]);
            for (let j = 1; j <= n; j++) d[0][j] = j;
            for (let i = 1; i <= m; i++)
                for (let j = 1; j <= n; j++)
                    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(a[i-1]!==b[j-1]?1:0));
            return d[m][n];
        };

        if (allBeers && allBeers.length > 0) {
            const norm = (s) => (s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
            const searchN = norm(beerName);
            const matches = allBeers.filter(b => {
                if (!b || !b.title) return false;
                const tn = norm(b.title);
                if (tn === searchN || tn.includes(searchN) || searchN.includes(tn)) return true;
                return searchN.length > 3 && levenshtein(tn, searchN) <= 3;
            }).slice(0, 5);

            if (matches.length > 0) {
                const list = matches.map(b => `• ${b.title}${b.brewery ? ' ('+b.brewery+')' : ''}`).join('\n');
                const msg = `${i18n.t('request_beer_duplicate_warning')}\n\n${list}\n\n${i18n.t('request_beer_duplicate_confirm')}`;
                if (!await showConfirmModal(msg, { danger: false, confirmText: i18n.t('request_beer_submit') })) return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> ${i18n.t('request_beer_sending')}`;

        const brewery = clean(form.querySelector('[name="brewery"]').value);
        const beerType = clean(form.querySelector('[name="beer_type"]').value);
        const alcohol = clean(form.querySelector('[name="alcohol"]').value);
        const volume = clean(form.querySelector('[name="volume"]').value);
        const country = clean(form.querySelector('[name="country"]').value);
        const region = clean(form.querySelector('[name="region"]').value);
        const distribution = form.querySelector('[name="distribution"]').value;
        const ingredients = clean(form.querySelector('[name="ingredients"]').value);
        const barcode = clean(form.querySelector('[name="barcode"]').value);
        const barrelAged = form.querySelector('[name="barrel_aged"]').checked;
        const seasonal = form.querySelector('[name="seasonal"]').checked;
        const link = clean(form.querySelector('[name="link"]').value);

        const volNormalized = volume.replace(/[^0-9.]/g, '') || '0';
        const idBase = `${beerName}_${beerType}_${volNormalized}`
            .toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_.]/g, '');

        const beerEntry = {
            title: beerName.toUpperCase(), brewery: brewery.toUpperCase() || '',
            type: beerType || '', volume: volume ? `${volNormalized} L` : '',
            alcohol: alcohol || '', id: idBase, image: '', distribution: distribution || '',
            barrel_aged: barrelAged, community_rating: 0, ingredients: ingredients || '', isSeasonal: seasonal
        };
        if (region) beerEntry.province = region;
        if (country) beerEntry.country = country;
        if (barcode) beerEntry.barcode = barcode;
        if (link) beerEntry.link = link;

        const formData = {
            access_key: 'dc29b29d-99f5-4ea7-9a42-8c4f41ad1a14',
            subject: `🍺 Beer Request: ${beerName}`,
            from_name: `${firstname} ${lastname}`,
            replyto: userEmail,
            message: `From: ${firstname} ${lastname} (${userEmail})\n\n${JSON.stringify(beerEntry, null, 2)}`
        };

        try {
            const response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                localStorage.setItem('beerdex_req_ts', Date.now().toString());
                closeModal();
                showToast(i18n.t('toast_request_beer_success'));
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (err) {
            console.error('[RequestBeer] Error:', err);
            showToast(i18n.t('toast_request_beer_error'), 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = i18n.t('request_beer_submit');
        }
    };
}

function renderTemplateEditor() {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    let template = Storage.getRatingTemplate();

    const refreshList = () => {
        const listHtml = template.map((field, index) => `
        <div style="background:rgba(0,0,0,0.3); padding:10px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            ${index > 0 ? `<button type="button" data-idx="${index}" class="icon-btn mv-up" style="font-size:0.8rem; padding:0;">⬆️</button>` : '<div style="height:15px; width:15px;"></div>'}
                            ${index < template.length - 1 ? `<button type="button" data-idx="${index}" class="icon-btn mv-down" style="font-size:0.8rem; padding:0;">⬇️</button>` : '<div style="height:15px; width:15px;"></div>'}
                        </div>
                        <div>
                            <strong>${field.label}</strong> <span style="font-size:0.8rem; color:#888;">(${field.type})</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button type="button" data-idx="${index}" class="icon-btn edit-field">✏️</button>
                        ${field.id === 'score' || field.id === 'comment' ? '' : `<button type="button" data-idx="${index}" class="icon-btn delete-field" style="color:red;">🗑️</button>`}
                    </div>
                </div>
        `).join('');

        wrapper.querySelector('#field-list').innerHTML = listHtml;

        // Attach Handlers
        wrapper.querySelectorAll('.delete-field').forEach(btn => {
            btn.onclick = async (e) => {
                if (await showConfirmModal(i18n.t('modal_confirm_delete_field'))) {
                    template.splice(e.target.dataset.idx, 1);
                    refreshList();
                }
            };
        });

        wrapper.querySelectorAll('.mv-up').forEach(btn => {
            btn.onclick = (e) => {
                // target might be inner element if not careful, but button has no children here
                const idx = parseInt(e.target.dataset.idx);
                if (idx > 0) {
                    [template[idx], template[idx - 1]] = [template[idx - 1], template[idx]];
                    refreshList();
                }
            };
        });

        wrapper.querySelectorAll('.mv-down').forEach(btn => {
            btn.onclick = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (idx < template.length - 1) {
                    [template[idx], template[idx + 1]] = [template[idx + 1], template[idx]];
                    refreshList();
                }
            };
        });

        wrapper.querySelectorAll('.edit-field').forEach(btn => {
            btn.onclick = async (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const field = template[idx];

                const newLabel = await showPromptModal(i18n.t('prompt_new_name'), field.label);
                if (newLabel !== null && newLabel.trim() !== "") {
                    field.label = newLabel.trim();
                    const newType = await showPromptModal(i18n.t('prompt_new_type'), field.type);
                    if (['range', 'checkbox', 'textarea', 'number'].includes(newType)) {
                        field.type = newType;
                        if (newType === 'range') { field.min = 0; field.max = 10; field.step = 1; }
                    }
                    refreshList();
                }
            };
        });
    };

    wrapper.innerHTML = `
        <h2>${i18n.t('settings_btn_configure_rating')}</h2>
                <div id="field-list" style="margin: 20px 0;"></div>

                <div style="border-top:1px solid #333; padding-top:20px;">
                    <h3>${i18n.t('settings_add_field')}</h3>
                    <div class="form-group">
                        <input type="text" id="new-label" class="form-input" placeholder="${i18n.t('settings_field_name')}">
                    </div>
                    <div class="form-group">
                        <select id="new-type" class="form-select">
                            <option value="range">${i18n.t('settings_type_range')}</option>
                            <option value="checkbox">${i18n.t('settings_type_checkbox')}</option>
                            <option value="textarea">${i18n.t('settings_type_textarea')}</option>
                        </select>
                    </div>
                    <button id="add-field" class="btn-primary" style="background:var(--bg-card); border:1px solid var(--accent-gold); color:var(--accent-gold);">+ ${i18n.t('settings_btn_add')}</button>
                </div>

                <button id="save-template" class="btn-primary" style="margin-top:20px;">${i18n.t('btn_save')}</button>
                <button id="reset-template" class="form-input" style="margin-top:10px; background:none; border:none; color:red;">${i18n.t('btn_reset_default')}</button>
    `;

    setTimeout(refreshList, 0);

    // Add Field
    wrapper.querySelector('#add-field').onclick = () => {
        const label = wrapper.querySelector('#new-label').value;
        const type = wrapper.querySelector('#new-type').value;
        if (label) {
            const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            let field = { id, label, type };
            if (type === 'range') { field.min = 0; field.max = 10; field.step = 1; }
            template.push(field);
            refreshList();
            wrapper.querySelector('#new-label').value = '';
        }
    };

    // Save
    wrapper.querySelector('#save-template').onclick = () => {
        Storage.saveRatingTemplate(template);
        closeModal();
        showToast(i18n.t('toast_config_saved'));
    };

    // Reset
    wrapper.querySelector('#reset-template').onclick = async () => {
        if (await showConfirmModal(i18n.t('modal_confirm_default_fields'), { danger: false })) {
            Storage.resetRatingTemplate();
            closeModal();
            showToast(i18n.t('toast_reset_success'));
        }
    };

    openModal(wrapper);
}

function renderLegalPage(type) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-dialog legal-dialog';

    const title = i18n.t(`legal_${type}_title`);
    const content = i18n.t(`legal_${type}_content`);

    wrapper.innerHTML = `
        <div class="legal-header">
            <h2>${title}</h2>
            <div class="legal-title-underline"></div>
        </div>
        <div class="legal-body">
            <p>${content}</p>
        </div>
        <div class="legal-actions">
            <button id="btn-close-legal" class="btn-outline">${i18n.t('btn_close') || 'Fermer'}</button>
        </div>
    `;

    wrapper.querySelector('#btn-close-legal').onclick = () => closeModal();

    openModal(wrapper);
}

// Helper to resize image
export function resizeImage(file, maxWidth, maxHeight, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8)); // 0.8 quality jpeg
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderAdvancedStats(totalVolumeMl, totalAlcoholMl) {
    const totalLiters = (totalVolumeMl / 1000).toFixed(1);
    const alcoholLiters = (totalAlcoholMl / 1000).toFixed(2);

    return `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
            <div style="padding:15px; background:linear-gradient(135deg, rgba(30,30,30,0.8), rgba(15,15,15,0.9)); border-radius:12px; border:1px solid rgba(255,255,255,0.05); box-shadow:0 4px 15px rgba(0,0,0,0.3); text-align:center; display:flex; flex-direction:column; justify-content:center;">
                <div style="font-size:1.8rem; font-family:'Russo One', sans-serif; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.5);">${totalLiters} L</div>
                <div style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-top:5px;">${i18n.t('stats_volume_total')}</div>
            </div>
            <div style="padding:15px; background:linear-gradient(135deg, rgba(30,30,30,0.8), rgba(15,15,15,0.9)); border-radius:12px; border:1px solid rgba(255,255,255,0.05); box-shadow:0 4px 15px rgba(0,0,0,0.3); text-align:center; display:flex; flex-direction:column; justify-content:center;">
                <div style="font-size:1.8rem; font-family:'Russo One', sans-serif; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.5);">${alcoholLiters} L</div>
                <div style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-top:5px;">${i18n.t('stats_pure_alcohol')}</div>
            </div>
        </div>
    `;
}

function renderEquivalences(totalVolumeMl, totalAlcoholMl) {
    // Fun Comparisons logic (Volume)
    const comparisons = [
        { label: i18n.t('stats_label_pints'), vol: 500, icon: '🍺' },
        { label: i18n.t('stats_label_packs'), vol: 1980, icon: '📦' },
        { label: i18n.t('stats_label_buckets'), vol: 10000, icon: '🪣' },
        { label: i18n.t('stats_label_barrels'), vol: 30000, icon: '🛢️' },
        { label: i18n.t('stats_label_showers'), vol: 60000, icon: '🚿' },
        { label: i18n.t('stats_label_bathtubs'), vol: 150000, icon: '🛁' },
        { label: i18n.t('stats_label_jacuzzis'), vol: 1000000, icon: '🧖' },
        { label: i18n.t('stats_label_trucks'), vol: 30000000, icon: '🚚' },
        { label: i18n.t('stats_label_pools'), vol: 50000000, icon: '🏊' },
        { label: i18n.t('stats_label_olympic_pools'), vol: 2500000000, icon: '🏟️' }
    ];

    let compHTML = '';
    comparisons.forEach(c => {
        const val = (totalVolumeMl / c.vol).toFixed(1);
        if (parseFloat(val) >= 1) {
            compHTML += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:6px 12px; border-radius:20px; font-size:0.85rem; color:#ddd; display:inline-flex; gap:6px; align-items:center; white-space:nowrap;">
                    <span style="font-size:1.1rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${c.icon}</span>
                    <span><strong style="color:var(--accent-gold);">${val}</strong> ${c.label}</span>
                </div>`;
        }
    });

    // Alcohol Comparisons Logic
    // totalAlcoholMl is pure alcohol.
    const alcComps = [
        { label: i18n.t('stats_label_pints_pils'), pure: 25, icon: '🍺' },
        { label: i18n.t('stats_label_tequila_shots'), pure: 12, icon: '🥃' },
        { label: i18n.t('stats_label_wine_bottles'), pure: 90, icon: '🍷' },
        { label: i18n.t('stats_label_whisky_bottles'), pure: 280, icon: '🍾' },
        { label: i18n.t('stats_label_vodka_bottles'), pure: 280, icon: '🍸' }
    ];

    let alcHTML = '';
    alcComps.forEach(c => {
        const val = (totalAlcoholMl / c.pure).toFixed(0);
        if (parseInt(val) > 0) {
            alcHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding:10px 5px;">
                    <span style="color:#bbb; font-size:0.9rem; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.1rem; background:rgba(255,255,255,0.05); width:32px; height:32px; display:flex; justify-content:center; align-items:center; border-radius:8px;">${c.icon}</span> 
                        ${c.label}
                    </span>
                    <strong style="color:var(--accent-gold); font-size:1.1rem; text-shadow:0 0 10px rgba(255,192,0,0.3);">${val}</strong>
                </div>`;
        }
    });

    // If nothing matches (too small volume), show at least one small one
    if (compHTML === '' && totalVolumeMl > 0) {
        compHTML = `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:6px 12px; border-radius:20px; font-size:0.85rem; color:#ddd; display:inline-flex; gap:6px; align-items:center;">
                    <span style="font-size:1.1rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🍺</span>
                    <span><strong style="color:var(--accent-gold);">${(totalVolumeMl / 500).toFixed(2)}</strong> ${i18n.t('stats_label_pints')}</span>
                </div>`;
    }

    return `
        <div class="stat-card mt-20" style="padding:0; overflow:hidden; border:1px solid rgba(255,192,0,0.15); background:linear-gradient(180deg, rgba(20,20,20,0.6) 0%, rgba(10,10,10,0.8) 100%);">
            <div style="background: linear-gradient(90deg, rgba(255,192,0,0.1), transparent); padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <h4 style="color:var(--accent-gold); margin:0; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.2rem; filter:drop-shadow(0 2px 4px rgba(255,192,0,0.3));">⚖️</span> 
                    ${i18n.t('stats_equiv_alcohol').replace('Alcohol Equivalents', 'Equivalences').replace("Équivalences d'alcool", 'Équivalences')}
                </h4>
                <p style="font-size:0.75rem; color:#888; margin:5px 0 0 0;">${i18n.t('stats_equiv_desc')}</p>
            </div>
            
            <div style="padding: 15px;">
                <h5 style="color:#888; font-size:0.75rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                    <span style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></span>
                    ${i18n.t('stats_equiv_volume')}
                    <span style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></span>
                </h5>
                <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-bottom: 25px;">
                    ${compHTML}
                </div>

                <h5 style="color:#888; font-size:0.75rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                    <span style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></span>
                    ${i18n.t('stats_equiv_alcohol')}
                    <span style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></span>
                </h5>
                <div style="background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.03); padding: 5px 10px;">
                    ${alcHTML}
                </div>
            </div>
        </div>
    `;
}

// --- Achievements Helper ---

function renderAchievementsList() {
    const all = Achievements.getAllAchievements();
    const unlockedIds = Achievements.getUnlockedAchievements();

    // Group by Category
    const byCategory = {};
    all.forEach(ach => {
        const catKey = ach.categoryKey || 'ach_cat_fun';
        if (!byCategory[catKey]) byCategory[catKey] = [];
        byCategory[catKey].push(ach);
    });

    let html = '';

    Object.keys(byCategory).forEach(catKey => {
        const catTranslated = i18n.t(catKey);
        html += `<h4 class="ach-category-title text-center">${catTranslated}</h4>`;
        html += `<div class="ach-grid">`;

        html += byCategory[catKey].map(ach => {
            const isUnlocked = unlockedIds.includes(ach.id);
            const opacity = isUnlocked ? '1' : '0.4';
            const filter = isUnlocked ? 'none' : 'grayscale(100%)';

            let title = i18n.t(ach.titleKey, ach.titleData || {});
            let desc = i18n.t(ach.descKey, ach.descData || {});

            if (!isUnlocked && ach.hidden) {
                title = '???';
                desc = i18n.t('ach_hidden_desc'); // Or hardcoded if not in i18n
            }

            const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeDesc = desc.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeIcon = ach.icon.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            const rarityClass = isUnlocked && ach.rarity ? `ach-rarity-${ach.rarity}` : '';

            return `
        <div class="ach-item ${rarityClass}" style="opacity:${opacity}; filter:${filter}; position:relative; cursor:pointer;"
    onclick="UI.showAchievementDetails('${safeTitle}', '${safeDesc}', '${safeIcon}', ${isUnlocked}, '${ach.rarity || ''}')" >
        <div class="ach-icon">${ach.icon}</div>
                    </div>`;
        }).join('');

        html += `</div>`;
    });

    return html;
}


// --- Real App Overlay Tutorial ---

// --- Real App Overlay Tutorial ---

const TutorialSystem = {
    steps: [
        {
            id: 'intro',
            target: null,
            message: () => `
                <div style="font-size:3rem; margin-bottom:10px;">👋</div>
                <h3 style="color:var(--accent-gold); margin-bottom:10px;">${i18n.t('tuto_intro_title')}</h3>
                <p>${i18n.t('tuto_intro_msg')}</p>
                <button class="btn-primary mt-20" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_start')}</button>
            `
        },
        // --- HOME FEATURES ---
        {
            id: 'search',
            target: '#search-toggle',
            position: 'bottom',
            message: () => `
                <h3>${i18n.t('tuto_search_title')}</h3>
                <p>${i18n.t('tuto_search_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'scan',
            target: '#fab-scan',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_scan_title')}</h3>
                <p>${i18n.t('tuto_scan_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'filter',
            target: '#filter-toggle',
            position: 'bottom',
            message: () => `
                <h3>${i18n.t('tuto_filter_title')}</h3>
                <p>${i18n.t('tuto_filter_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'tap-beer',
            target: '.beer-card:first-child',
            position: 'auto',
            noClick: true,
            message: () => `
                <h3>${i18n.t('tuto_tap_title')}</h3>
                <p>${i18n.t('tuto_tap_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'add-beer',
            target: '#fab-add',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_add_title')}</h3>
                <p>${i18n.t('tuto_add_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        // --- STATS ---
        {
            id: 'go-stats',
            target: '[data-view="stats"]',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_stats_title')}</h3>
                <p>${i18n.t('tuto_stats_msg')}</p>
            `,
            waitFor: 'click'
        },
        {
            id: 'stats-map',
            target: '#beer-map-container',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_map_title')}</h3>
                <p>${i18n.t('tuto_map_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'stats-achievements',
            target: '#card-achievements',
            position: 'top',
            message: () => `
                <h3 style="color:var(--accent-gold);">${i18n.t('tuto_ach_title')}</h3>
                <p>${i18n.t('tuto_ach_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'stats-wrapped',
            target: '#btn-open-wrapped',
            position: 'top',
            message: () => `
                <h3 style="color:var(--accent-gold);">${i18n.t('wrapped_title')}</h3>
                <p>${i18n.t('tuto_wrapped_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        // --- SETTINGS ---
        {
            id: 'go-settings',
            target: '[data-view="settings"]',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_settings_title')}</h3>
                <p>${i18n.t('tuto_settings_msg')}</p>
            `,
            waitFor: 'click'
        },
        {
            id: 'set-discovery',
            target: '#toggle-discovery',
            position: 'bottom',
            message: () => `
                <h3>${i18n.t('tuto_discovery_title')}</h3>
                <p>${i18n.t('tuto_discovery_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'set-rarity',
            target: '#check-reveal-rarity',
            position: 'bottom',
            message: () => `
                <h3>${i18n.t('tuto_rarity_title')}</h3>
                <p>${i18n.t('tuto_rarity_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'set-data',
            target: '#btn-manage-export',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_data_title')}</h3>
                <p>${i18n.t('tuto_data_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'noah-preset',
            target: '#btn-preset-noah',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_presets_title')}</h3>
                <p>${i18n.t('tuto_presets_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        // --- NEW FEATURES ---
        {
            id: 'go-home-final',
            target: '[data-view="home"]',
            position: 'top',
            message: () => `
                <h3>${i18n.t('tuto_home_title')}</h3>
                <p>${i18n.t('tuto_home_msg')}</p>
            `,
            waitFor: 'click'
        },
        {
            id: 'view-toggle',
            target: '#view-toggle',
            position: 'bottom',
            message: () => `
                <h3>${i18n.t('tuto_view_title')}</h3>
                <p>${i18n.t('tuto_view_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'bac-badge',
            target: '.bac-speculative-badge',
            position: 'auto',
            message: () => `
                <h3>${i18n.t('tuto_bac_badge_title')}</h3>
                <p>${i18n.t('tuto_bac_badge_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'bac-config',
            target: null,
            message: () => `
                <div style="font-size:2rem; margin-bottom:10px;">🩸</div>
                <h3 style="color:var(--accent-gold); margin-bottom:10px;">${i18n.t('tuto_bac_config_title')}</h3>
                <p style="margin-bottom:12px; font-size:0.85rem;">${i18n.t('tuto_bac_config_msg')}</p>
                <div style="display:flex; gap:8px; margin-bottom:10px; text-align:left;">
                    <div style="flex:1;">
                        <label style="font-size:0.7rem; color:#888; display:block; margin-bottom:3px;">${i18n.t('settings_weight')} (kg)</label>
                        <input type="number" id="tuto-bac-weight" class="form-input" value="${Storage.getPreference('bac_weight', 70)}" min="30" max="200" style="padding:5px; font-size:0.85rem; width:100%;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:0.7rem; color:#888; display:block; margin-bottom:3px;">${i18n.t('settings_gender')}</label>
                        <select id="tuto-bac-gender" class="form-select" style="padding:5px; font-size:0.85rem; width:100%;">
                            <option value="M" ${Storage.getPreference('bac_gender', 'M') === 'M' ? 'selected' : ''}>${i18n.t('settings_male')}</option>
                            <option value="F" ${Storage.getPreference('bac_gender', 'M') === 'F' ? 'selected' : ''}>${i18n.t('settings_female')}</option>
                            <option value="X" ${Storage.getPreference('bac_gender', 'M') === 'X' ? 'selected' : ''}>${i18n.t('settings_not_specified')}</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex; gap:8px; margin-bottom:12px; text-align:left;">
                    <div style="flex:1;">
                        <label style="font-size:0.7rem; color:#888; display:block; margin-bottom:3px;">${i18n.t('tuto_bac_country_label')}</label>
                        <select id="tuto-bac-country" class="form-select" style="padding:5px; font-size:0.85rem; width:100%;">
                            <option value="BE" ${Storage.getPreference('bac_country', 'BE') === 'BE' ? 'selected' : ''}>🇧🇪 ${i18n.t('country_be')}</option>
                            <option value="FR" ${Storage.getPreference('bac_country', 'BE') === 'FR' ? 'selected' : ''}>🇫🇷 ${i18n.t('country_fr')}</option>
                            <option value="DE" ${Storage.getPreference('bac_country', 'BE') === 'DE' ? 'selected' : ''}>🇩🇪 ${i18n.t('country_de')}</option>
                            <option value="NL" ${Storage.getPreference('bac_country', 'BE') === 'NL' ? 'selected' : ''}>🇳🇱 ${i18n.t('country_nl')}</option>
                            <option value="US" ${Storage.getPreference('bac_country', 'BE') === 'US' ? 'selected' : ''}>🇺🇸 ${i18n.t('country_us')}</option>
                            <option value="CO" ${Storage.getPreference('bac_country', 'BE') === 'CO' ? 'selected' : ''}>🇨🇴 ${i18n.t('country_co')}</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:0.7rem; color:#888; display:block; margin-bottom:3px;">${i18n.t('tuto_bac_vehicle_label')}</label>
                        <select id="tuto-bac-vehicle" class="form-select" style="padding:5px; font-size:0.85rem; width:100%;">
                            <option value="voiture" ${Storage.getPreference('bac_vehicle', 'voiture') === 'voiture' ? 'selected' : ''}>🚗 ${i18n.t('settings_bac_car')}</option>
                            <option value="moto" ${Storage.getPreference('bac_vehicle', 'voiture') === 'moto' ? 'selected' : ''}>🏍️ ${i18n.t('settings_bac_moto')}</option>
                            <option value="velo" ${Storage.getPreference('bac_vehicle', 'voiture') === 'velo' ? 'selected' : ''}>🚲 ${i18n.t('settings_bac_bike')}</option>
                            <option value="pieton" ${Storage.getPreference('bac_vehicle', 'voiture') === 'pieton' ? 'selected' : ''}>🚶 ${i18n.t('settings_bac_pedestrian')}</option>
                            <option value="gamer" ${Storage.getPreference('bac_vehicle', 'voiture') === 'gamer' ? 'selected' : ''}>🎮 ${i18n.t('settings_bac_gamer')}</option>
                            <option value="ne_conduit_pas" ${Storage.getPreference('bac_vehicle', 'voiture') === 'ne_conduit_pas' ? 'selected' : ''}>❌ ${i18n.t('settings_bac_none')}</option>
                        </select>
                    </div>
                </div>
                <button class="btn-primary" style="width:100%; margin-bottom:8px;" onclick="TutorialSystem.saveBac()">${i18n.t('tuto_btn_save')}</button>
                <div style="font-size:0.75rem; color:#888; text-decoration:underline; cursor:pointer;" onclick="TutorialSystem.skipBac()">${i18n.t('tuto_btn_skip_bac')}</div>
            `
        },
        {
            id: 'widget-info',
            target: null,
            message: () => `
                <div style="font-size:2rem; margin-bottom:10px;">📱</div>
                <h3 style="color:var(--accent-gold); margin-bottom:10px;">${i18n.t('tuto_widget_title')}</h3>
                <p>${i18n.t('tuto_widget_msg')}</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">${i18n.t('tuto_btn_next')}</button>
            `
        },
        {
            id: 'finale',
            target: null,
            message: () => `
                <div style="font-size:3rem; margin-bottom:10px;">🍻</div>
                <h3 style="color:var(--accent-gold);">${i18n.t('tuto_finale_title')}</h3>
                <p>${i18n.t('tuto_finale_msg')}</p>
                <button class="btn-primary mt-20" onclick="TutorialSystem.finish()">${i18n.t('tuto_btn_finish')}</button>
            `
        }
    ],
    currentStep: 0,
    panes: [], // Top, Bottom, Left, Right
    spotlight: null,
    tooltip: null,

    init() {
        if (this.panes.length > 0) return;

        // Create 4 panes for the "Hole" approach
        const createPane = () => {
            const el = document.createElement('div');
            el.className = 'tutorial-pane';
            el.style.cssText = 'position:fixed; background:rgba(0,0,0,0.8); z-index:9998; transition:all 0.3s;';
            document.body.appendChild(el);
            return el;
        };
        this.panes = [createPane(), createPane(), createPane(), createPane()];

        this.spotlight = document.createElement('div');
        this.spotlight.className = 'tutorial-spotlight';
        this.spotlight.style.cssText = `
            position: fixed; border-radius: 8px;
            box-shadow: 0 0 15px rgba(255,192,0,0.5), inset 0 0 0 2px var(--accent-gold);
            z-index: 9999; pointer-events: none;
            transition: all 0.3s; opacity: 0;
        `;

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        this.tooltip.style.cssText = `
            position: fixed; background: #222; border: 1px solid var(--accent-gold);
            padding: 20px; border-radius: 12px; z-index: 10000;
            max-width: 280px; color: #eee; text-align: center;
            opacity: 0; transition: opacity 0.3s;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        `;

        document.body.appendChild(this.spotlight);
        document.body.appendChild(this.tooltip);

        // Resize handler
        window.addEventListener('resize', this.boundUpdateObj = () => this.updatePosition());
        window.addEventListener('scroll', this.boundUpdateObj, true);
    },

    start() {
        this.init();
        this.currentStep = 0;
        this.showStep();
    },

    next() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.finish();
        } else {
            this.showStep();
        }
    },

    saveBac() {
        const w = document.getElementById('tuto-bac-weight');
        const g = document.getElementById('tuto-bac-gender');
        const c = document.getElementById('tuto-bac-country');
        const v = document.getElementById('tuto-bac-vehicle');
        if (w) Storage.savePreference('bac_weight', parseInt(w.value) || 70);
        if (g) Storage.savePreference('bac_gender', g.value);
        if (c) Storage.savePreference('bac_country', c.value);
        if (v) Storage.savePreference('bac_vehicle', v.value);
        Storage.savePreference('bac_enabled', true);
        showToast(i18n.t('toast_bac_on'), 'success');
        this.next();
    },

    skipBac() {
        Storage.savePreference('bac_enabled', false);
        showToast(i18n.t('toast_bac_off'));
        this.next();
    },

    showStep() {
        const step = this.steps[this.currentStep];
        if (!step) return;

        // Message can be a string or a function returning localized HTML
        this.tooltip.innerHTML = typeof step.message === 'function' ? step.message() : step.message;

        let targetEl = null;

        if (step.target) {
            const attemptFind = () => {
                targetEl = document.querySelector(step.target);
                if (targetEl) {
                    this.highlight(targetEl, step);
                } else {
                    // Retry briefly if dynamic content
                    setTimeout(() => {
                        targetEl = document.querySelector(step.target);
                        if (targetEl) this.highlight(targetEl, step);
                        else {
                            if (step.target !== '#card-achievements') // Ignore strict fail on stats
                                console.warn("Tutorial target not found:", step.target);
                        }
                    }, 500);
                }
            };

            // Special Logic for Switches/Checkboxes targeting parent
            if (step.id === 'set-discovery' || step.id === 'set-rarity') {
                setTimeout(() => {
                    const inp = document.querySelector(step.target);
                    if (inp && inp.parentElement) {
                        this.highlight(inp.parentElement, step);
                    } else {
                        attemptFind();
                    }
                }, 400); // Slightly longer wait for settings render
                return;
            }

            // Wait for lazy views
            if (step.id === 'noah-preset' || step.id === 'stats-map' || step.id === 'stats-achievements' || step.id === 'stats-wrapped') {
                setTimeout(attemptFind, 600);
            } else {
                attemptFind();
            }

        } else {
            this.highlight(null, step);
        }
    },

    highlight(el, step) {
        // Auto Scroll
        if (el && !step.noScroll) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // 1. Calculate Hole Dimensions
        let rect;
        if (el) {
            rect = el.getBoundingClientRect();
        } else {
            // Intro
            rect = { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0, bottom: window.innerHeight / 2, right: window.innerWidth / 2 };
        }

        const pad = el ? 5 : 0;
        const top = Math.max(0, rect.top - pad);
        const left = Math.max(0, rect.left - pad);
        const width = rect.width + (pad * 2);
        const height = rect.height + (pad * 2);
        const right = left + width;
        const bottom = top + height;

        // 2. Position Panes
        const p = this.panes;
        p[0].style.top = '0'; p[0].style.left = '0'; p[0].style.width = '100vw'; p[0].style.height = top + 'px';
        p[1].style.top = bottom + 'px'; p[1].style.left = '0'; p[1].style.width = '100vw'; p[1].style.height = (window.innerHeight - bottom) + 'px';
        p[2].style.top = top + 'px'; p[2].style.left = '0'; p[2].style.width = left + 'px'; p[2].style.height = height + 'px';
        p[3].style.top = top + 'px'; p[3].style.left = right + 'px'; p[3].style.width = (window.innerWidth - right) + 'px'; p[3].style.height = height + 'px';

        // 3. Position Spotlight
        if (el) {
            this.spotlight.style.top = top + 'px';
            this.spotlight.style.left = left + 'px';
            this.spotlight.style.width = width + 'px';
            this.spotlight.style.height = height + 'px';
            this.spotlight.style.opacity = '1';

            // Activate anti-click barrier when the step proceeds via "Suivant" instead of clicking the target.
            this.spotlight.style.pointerEvents = step.waitFor === 'click' ? 'none' : 'auto';
        } else {
            this.spotlight.style.opacity = '0';
        }

        // 4. Position Tooltip
        if (this.currentHighlightId !== step.id) {
            const messageHtml = typeof step.message === 'function' ? step.message() : step.message;
            this.tooltip.innerHTML = messageHtml +
                `<div style="margin-top:10px; font-size:0.7rem; color:#888; text-decoration:underline; cursor:pointer;" onclick="TutorialSystem.finish()">${i18n.t('tuto_btn_skip')}</div>`;
        }
        this.tooltip.style.opacity = '1';

        requestAnimationFrame(() => {
            const ttW = this.tooltip.offsetWidth;
            const ttH = this.tooltip.offsetHeight;
            let ttTop, ttLeft;

            if (!el) {
                ttTop = (window.innerHeight - ttH) / 2;
                ttLeft = (window.innerWidth - ttW) / 2;
            } else {
                const fitsBottom = (bottom + ttH + 20) < window.innerHeight;
                let pos = step.position || 'auto';
                if (pos === 'auto') pos = fitsBottom ? 'bottom' : 'top';

                if (pos === 'top') {
                    ttTop = top - ttH - 15;
                } else if (pos === 'left') {
                    ttTop = top + (height / 2) - (ttH / 2);
                    ttLeft = left - ttW - 15;
                } else {
                    ttTop = bottom + 15;
                }

                if (pos !== 'left' && pos !== 'right') {
                    ttLeft = left + (width / 2) - (ttW / 2);
                }

                ttLeft = Math.max(10, Math.min(ttLeft, window.innerWidth - ttW - 10));

                if (ttTop < 10) ttTop = 10;
                if (ttTop + ttH > window.innerHeight) ttTop = window.innerHeight - ttH - 10;
            }

            this.tooltip.style.top = ttTop + 'px';
            this.tooltip.style.left = ttLeft + 'px';
        });

        // 5. Binding
        if (step.waitFor === 'click' && el && this.currentHighlightId !== step.id) {
            const oneTimeClick = (e) => {
                setTimeout(() => this.next(), 200);
            };
            el.addEventListener('click', oneTimeClick, { once: true });
        }

        this.currentHighlightId = step.id;
    },

    updatePosition() {
        if (this.currentStep < this.steps.length) {
            const step = this.steps[this.currentStep];
            if (step) this.showStep();
        }
    },

    finish() {
        Storage.savePreference('tutorial_completed', true);
        window.dispatchEvent(new Event('beerdex-action'));
        this.panes.forEach(p => p.style.opacity = '0');
        this.spotlight.style.opacity = '0';
        this.tooltip.style.opacity = '0';

        setTimeout(() => {
            this.panes.forEach(p => p.remove());
            this.panes = [];
            this.spotlight.remove();
            this.tooltip.remove();
            window.removeEventListener('resize', this.boundUpdateObj);
            window.removeEventListener('scroll', this.boundUpdateObj, true);
        }, 300);

        localStorage.setItem('beerdex_welcome_seen_v3', 'true');
        showToast(i18n.t('toast_tuto_finished'));
    }
};



window.restartTutorial = () => TutorialSystem.start();
window.TutorialSystem = TutorialSystem;

const PRESET_TRISTAN = [
    { id: 'score', label: 'preset_global_score', type: 'number', min: 0, max: 20, step: 0.1 },
    { id: 'comment', label: 'preset_comment', type: 'textarea' },

    // Visuel
    { id: 'apparence', label: 'preset_tristan_apparence', type: 'textarea' },
    { id: 'couleur', label: 'preset_tristan_couleur', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'transparence', label: 'preset_tristan_transparence', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'mousse', label: 'preset_tristan_mousse', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'mousse_tenue', label: 'preset_tristan_mousse_tenue', type: 'range', min: 1, max: 10, step: 1 },

    // Olfactif
    { id: 'aromes_txt', label: 'preset_tristan_aromes', type: 'textarea' },
    { id: 'cafe', label: 'preset_tristan_cafe', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'caramel', label: 'preset_tristan_caramel', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'cereales', label: 'preset_tristan_cereales', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'chocolat', label: 'preset_tristan_chocolat', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'sucre', label: 'preset_tristan_sucre', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'noisette', label: 'preset_tristan_noisette', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'pain', label: 'preset_tristan_pain', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'agrumes', label: 'preset_tristan_agrumes', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'epices', label: 'preset_tristan_epices', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'fleurs', label: 'preset_tristan_fleurs', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'herbes', label: 'preset_tristan_herbes', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'poivre', label: 'preset_tristan_poivre', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'resine', label: 'preset_tristan_resine', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'fruit', label: 'preset_tristan_fruit', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'mais', label: 'preset_tristan_mais', type: 'range', min: 0, max: 10, step: 1 },

    // Goût
    { id: 'intensite', label: 'preset_tristan_intensite', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'equilibre', label: 'preset_tristan_equilibre', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'impression', label: 'preset_tristan_impression', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'corps', label: 'preset_tristan_corps', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'carbonation', label: 'preset_tristan_carbonation', type: 'range', min: 1, max: 10, step: 1 },

    // Conclusion
    { id: 'synthese', label: 'preset_tristan_synthese', type: 'textarea' },
    { id: 'duree', label: 'preset_tristan_duree', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'intensite_globale', label: 'preset_tristan_intensite_globale', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'ensemble_equilibre', label: 'preset_tristan_qualite', type: 'range', min: 1, max: 10, step: 1 }
];

function applyTristanPreset() {
    Storage.saveRatingTemplate(PRESET_TRISTAN);
    Storage.savePreference('activePreset', 'tristan'); // Persist selection
}

const PRESET_NOAH = [
    { id: 'score', label: 'preset_global_score', type: 'number', min: 0, max: 20, step: 0.1 },
    { id: 'comment', label: 'preset_comment', type: 'textarea' },

    // Visuel (Expert)
    { id: 'robe', label: 'preset_noah_robe', type: 'textarea' },
    { id: 'mousse_aspect', label: 'preset_noah_mousse', type: 'textarea' },

    // Olfactif (Nez)
    { id: 'nez_intensite', label: 'preset_noah_nez_intensite', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'nez_notes', label: 'preset_noah_nez_notes', type: 'textarea' },

    // Gustatif (Bouche)
    { id: 'attaque', label: 'preset_noah_attaque', type: 'textarea' },
    { id: 'milieu_bouche', label: 'preset_noah_milieu', type: 'textarea' },
    { id: 'finale', label: 'preset_noah_finale', type: 'textarea' },

    // Sensations
    { id: 'corpulence', label: 'preset_noah_corpulence', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'petillance', label: 'preset_noah_petillance', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'amertume', label: 'preset_noah_amertume', type: 'range', min: 1, max: 10, step: 1 },

    // Accord
    { id: 'accord_mets', label: 'preset_noah_accord', type: 'textarea' },

    // Conclusion
    { id: 'potentiel_garde', label: 'preset_noah_garde', type: 'textarea' },
    { id: 'verdict', label: 'preset_noah_verdict', type: 'textarea' }
];

function applyNoahPreset() {
    Storage.saveRatingTemplate(PRESET_NOAH);
    Storage.savePreference('activePreset', 'noah');
}

export function showAchievementDetails(title, desc, icon, isUnlocked, rarity) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content text-center';

    let rarityHTML = '';
    if (rarity) {
        let rarityKey = '';
        let rarityColor = '#ccc';
        if (rarity === 'commun') { rarityColor = '#2ecc71'; rarityKey = 'rarity_commun'; }
        else if (rarity === 'rare') { rarityColor = '#3498db'; rarityKey = 'rarity_rare'; }
        else if (rarity === 'super_rare') { rarityColor = '#00bcd4'; rarityKey = 'rarity_super_rare'; }
        else if (rarity === 'epique') { rarityColor = '#9b59b6'; rarityKey = 'rarity_epique'; }
        else if (rarity === 'mythique') { rarityColor = '#e74c3c'; rarityKey = 'rarity_mythique'; }
        else if (rarity === 'legendaire') { rarityColor = '#f1c40f'; rarityKey = 'rarity_legendaire'; }
        else if (rarity === 'ultra_legendaire') { rarityColor = '#ff00cc'; rarityKey = 'rarity_ultra_legendaire'; }
        else if (rarity === 'fondateur') { rarityColor = '#FFD700'; rarityKey = 'rarity_fondateur'; }

        const rarityTranslated = i18n.t(rarityKey) || rarity;
        
        let specialClass = '';
        if (rarity === 'ultra_legendaire') specialClass = 'rarity-ultra_legendaire';
        if (rarity === 'fondateur') specialClass = 'rarity-fondateur';
        
        if (specialClass) {
            rarityHTML = `<div class="${specialClass}" style="display:inline-block; font-size:0.75rem; padding:4px 12px; border-radius:20px; margin-bottom:15px; text-transform:uppercase; border: none !important;">${rarityTranslated}</div>`;
        } else {
            rarityHTML = `<div style="display:inline-block; font-size:0.75rem; font-weight:800; color:${rarityColor}; background:rgba(255,255,255,0.05); padding:4px 12px; border-radius:20px; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; border:1px solid ${rarityColor}40;">${rarityTranslated}</div>`;
        }
    }

    const iconFilter = isUnlocked ? 'drop-shadow(0 4px 12px rgba(255,255,255,0.1))' : 'grayscale(100%) opacity(50%) drop-shadow(0 4px 12px rgba(255,255,255,0.05))';

    wrapper.innerHTML = `
        <div style="font-size:4rem; margin-bottom:20px; filter:${iconFilter};">${icon}</div>
        <h2 style="color:var(--accent-gold); margin-bottom:8px; font-family:'Russo One';">${title}</h2>
        ${rarityHTML}
        <p style="font-size:1.05rem; color:#ccc; margin-bottom:25px; line-height:1.5; padding:0 10px;">
            ${desc}
        </p>
        <button class="btn-primary" onclick="UI.closeModal()">${i18n.t('btn_close')}</button>
    `;

    openModal(wrapper);
}

// --- Beer Match (QR) ---

export function renderMatchModal(allBeers) {
    const wrapper = document.createElement('div');
    // Fix: Max-height logic for small screens, and better width
    wrapper.innerHTML = `
        <div class="modal-content text-center" style="width: min(95%, 450px); max-height: 85vh; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2 style="margin:0; font-family:'Russo One'; color:var(--accent-gold); font-size:1.5rem;">⚔️ Beer Match</h2>
                <button type="button" class="close-btn" style="background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>

            <div style="display:flex; border-bottom:1px solid #333; margin-bottom:20px;">
                <button id="tab-qr" style="flex:1; background:none; border:none; color:var(--accent-gold); padding:10px; border-bottom:2px solid var(--accent-gold); cursor:pointer;">${i18n.t('match_tab_my_code')}</button>
                <button id="tab-scan" style="flex:1; background:none; border:none; color:#666; padding:10px; cursor:pointer;">${i18n.t('match_tab_scan')}</button>
            </div>

            <div id="view-qr" style="display:block;">
                <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">${i18n.t('match_show_friend')}</p>
                <div id="qrcode-container" style="background:#FFF; padding:15px; border-radius:10px; display:inline-block; margin-bottom:15px;"></div>
                
                <!-- Text Fallback -->
                <div style="text-align:left;">
                    <p style="font-size:0.8rem; color:#888; margin-bottom:5px;">${i18n.t('match_text_fallback')}</p>
                    <textarea id="my-qr-text" readonly style="width:100%; height:60px; background:#222; border:1px solid #444; color:#aaa; font-size:0.7rem; padding:5px; border-radius:4px; resize:none;"></textarea>
                    <button id="btn-copy-code" class="form-input" style="padding:5px 10px; font-size:0.8rem; margin-top:5px; width:100%;">${i18n.t('match_btn_copy')}</button>
                </div>
            </div>

            <div id="view-scan" style="display:none;">
                <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">${i18n.t('match_scan_desc')}</p>
                <div id="reader" style="width:100%; height:250px; background:#000; border-radius:8px; overflow:hidden; position:relative;"></div>
                <div id="scan-feedback" style="margin-top:10px; color:var(--accent-gold); font-size:0.8rem; height:20px;"></div>
                
                <details style="margin-top:15px; text-align:left;">
                    <summary style="color:#555; cursor:pointer; font-size:0.8rem;">${i18n.t('match_camera_issue')}</summary>
                    <textarea id="manual-paste" placeholder="${i18n.t('match_paste_placeholder')}" style="width:100%; height:60px; background:#222; border:1px solid #444; color:#FFF; margin-top:5px; font-size:0.7rem; padding:5px;"></textarea>
                    <button id="btn-manual-compare" class="form-input" style="padding:5px 10px; font-size:0.8rem; margin-top:5px;">${i18n.t('match_btn_compare')}</button>
                </details>
            </div>

            <div id="view-result" style="display:none;"></div>
        </div>
    `;

    const tabQr = wrapper.querySelector('#tab-qr');
    const tabScan = wrapper.querySelector('#tab-scan');
    const viewQr = wrapper.querySelector('#view-qr');
    const viewScan = wrapper.querySelector('#view-scan');
    const viewResult = wrapper.querySelector('#view-result');
    let html5QrcodeScanner = null;
    let isScanning = false;

    // Stop Scanner Safely
    const stopScanner = async () => {
        if (!html5QrcodeScanner) return;
        try {
            if (html5QrcodeScanner.isScanning) {
                await html5QrcodeScanner.stop();
            }
            html5QrcodeScanner.clear();
        } catch (e) {
            console.warn("Scanner stop warning:", e);
        }
        html5QrcodeScanner = null;
        isScanning = false;
    };

    const switchTab = (tab) => {
        if (tab === 'qr') {
            tabQr.style.color = 'var(--accent-gold)'; tabQr.style.borderBottom = '2px solid var(--accent-gold)';
            tabScan.style.color = '#666'; tabScan.style.borderBottom = 'none';
            viewQr.style.display = 'block';
            viewScan.style.display = 'none';
            viewResult.style.display = 'none';
            stopScanner(); // Stop if switching to QR
        } else {
            tabScan.style.color = 'var(--accent-gold)'; tabScan.style.borderBottom = '2px solid var(--accent-gold)';
            tabQr.style.color = '#666'; tabQr.style.borderBottom = 'none';
            viewQr.style.display = 'none';
            viewScan.style.display = 'block';
            viewResult.style.display = 'none';
            // Start scanner with slight delay for UI render
            setTimeout(() => { if (!isScanning) startScanner(); }, 200);
        }
    };

    tabQr.onclick = () => switchTab('qr');
    tabScan.onclick = () => switchTab('scan');

    const generateMyQR = () => {
        const userData = Storage.getAllUserData();
        // Robust ID extraction: handle if userData is directly ratings or wrapper
        const ratings = userData.ratings || userData;
        const myIds = Object.keys(ratings).filter(k => ratings[k] && ratings[k].count > 0).map(k => k.split('_')[0]);

        if (myIds.length === 0) {
            wrapper.querySelector('#qrcode-container').innerHTML = `<p style='color:#ccc; padding:20px;'>${i18n.t('match_no_beers')}</p>`;
            wrapper.querySelector('#my-qr-text').value = i18n.t('match_nothing_to_share');
            return;
        }

        if (typeof LZString === 'undefined') {
            console.error("LZString missing");
            wrapper.querySelector('#qrcode-container').innerHTML = i18n.t('match_lib_missing');
            return;
        }

        const qrString = Match.generateQRData(myIds, "Ami");

        // set Text FIRST so it appears even if QR fails
        const txtArea = wrapper.querySelector('#my-qr-text');
        if (txtArea) txtArea.value = qrString;

        // QR Code
        const container = wrapper.querySelector('#qrcode-container');
        container.innerHTML = '';

        // Delay slightly to ensure modal is rendered and dimensions are known
        setTimeout(() => {
            if (window.QRCode) {
                try {
                    new QRCode(container, {
                        text: qrString,
                        width: 180,
                        height: 180,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (e) {
                    console.error("QR Gen Error", e);
                    container.innerHTML = i18n.t('match_qr_error');
                }
            } else {
                container.innerHTML = "Lib QR manquante";
            }
        }, 150);

        const btnCopy = wrapper.querySelector('#btn-copy-code');
        if (btnCopy) btnCopy.onclick = () => {
            if (window.navigator && window.navigator.clipboard) {
                txtArea.select();
                navigator.clipboard.writeText(qrString).then(() => {
                    showToast(i18n.t('match_code_copied'));
                }).catch(() => showToast(i18n.t('match_copy_error')));
            } else {
                txtArea.select();
                document.execCommand('copy');
                showToast(i18n.t('match_code_copied'));
            }
        };
    };

    const startScanner = () => {
        const feedback = wrapper.querySelector('#scan-feedback');
        feedback.textContent = i18n.t('match_camera_init');

        if (!window.Html5Qrcode) {
            feedback.textContent = i18n.t('match_lib_missing');
            return;
        }

        const html5QrCode = new Html5Qrcode("reader");
        html5QrcodeScanner = html5QrCode;

        const qrCodeSuccessCallback = (decodedText, decodedResult) => {
            feedback.textContent = i18n.t('match_code_detected');
            stopScanner().then(() => {
                processMatch(decodedText);
            });
        };

        const config = { fps: 10, qrbox: { width: 200, height: 200 } };

        html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
            .then(() => {
                isScanning = true;
                feedback.textContent = i18n.t('match_scan_prompt');
            })
            .catch(err => {
                console.error("Camera Error", err);
                feedback.textContent = i18n.t('match_camera_error');
                isScanning = false;
            });
    };

    const processMatch = (qrString) => {
        const friendData = Match.parseQRData(qrString);
        if (!friendData) {
            showAlertModal(i18n.t('match_invalid_code'), { icon: '❌' });
            // Restart scanner if valid fail? No, easier to stay stopped.
            return;
        }

        const userData = Storage.getAllUserData();
        const ratings = userData.ratings || userData;
        const myIdsList = Object.keys(ratings).filter(k => ratings[k] && ratings[k].count > 0).map(k => k.split('_')[0]);

        const results = Match.compare(allBeers, myIdsList, friendData);
        displayMatchResults(results);
    };

    const displayMatchResults = (results) => {
        viewQr.style.display = 'none';
        viewScan.style.display = 'none';
        viewResult.style.display = 'block';

        // Hide tabs
        tabQr.style.display = 'none';
        tabScan.style.display = 'none';

        const getStrokeColor = (score) => {
            if (score >= 80) return "var(--accent-gold)"; // Very High
            if (score >= 50) return "var(--success)"; // High
            if (score >= 20) return "var(--accent-amber, #FF9800)"; // Medium
            return "var(--danger)"; // Low
        };
        const circleColor = getStrokeColor(results.score);

        viewResult.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h3 style="color:var(--accent-gold); margin:0; font-family:'Russo One', sans-serif;">${i18n.t('match_with', { name: results.userName })}</h3>
                
                <div style="width:160px; height:160px; margin:20px auto; position:relative;">
                    <svg viewBox="0 0 36 36" style="width:100%; height:100%; transform: rotate(-90deg);">
                        <path class="circle-bg"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none" stroke="#222" stroke-width="3" />
                        <path class="circle"
                            stroke-dasharray="${results.score}, 100"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none" stroke="${circleColor}" stroke-width="3"
                            style="transition: stroke-dasharray 1s ease-out;" />
                    </svg>
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
                        <span style="font-size:2.5rem; font-family:'Russo One', sans-serif; color:${circleColor}; text-shadow:0 0 15px ${circleColor}66;">${results.score}%</span>
                        <span style="display:block; font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px; margin-top:-5px;">${i18n.t('match_compatibility')}</span>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:15px; border-radius:12px; text-align:center;">
                    <div style="font-size:2rem; font-weight:bold; color:#FFF;">${results.commonCount}</div>
                    <div style="font-size:0.8rem; color:#aaa; text-transform:uppercase;">${i18n.t('match_common_labels')}</div>
                </div>
                 <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:15px; border-radius:12px; text-align:center;">
                    <div style="font-size:2rem; font-weight:bold; color:var(--accent-gold);">${results.friendTotal}</div>
                    <div style="font-size:0.8rem; color:#aaa; text-transform:uppercase;">${i18n.t('match_friend_total')}</div>
                </div>
            </div>

            ${results.commonCount > 0 ? `
            <div style="text-align:left; margin-bottom:20px;">
                <strong style="color:var(--accent-gold); display:block; margin-bottom:10px; font-size:0.9rem; text-transform:uppercase; font-weight:bold;">${i18n.t('match_common_title')}</strong>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${results.common.slice(0, 5).map(b => `
                        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; align-items:center; gap:12px;">
                            ${b.image ? `<img src="${b.image}" style="height:35px; width:20px; object-fit:contain;">` : '<span style="font-size:1.2rem">🍻</span>'}
                            <span style="font-weight:bold; font-size:0.95rem; color:#fff;">${b.title}</span>
                        </div>`).join('')}
                    ${results.common.length > 5 ? `<div style="color:#666; font-style:italic; text-align:center; font-size:0.85rem; margin-top:5px;">${i18n.t('match_common_others', { count: results.common.length - 5 })}</div>` : ''}
                </div>
            </div>
            ` : ''}

            ${results.discovery.length > 0 ? `
            <div style="text-align:left; margin-bottom:10px;">
                <strong style="color:#2196F3; display:block; margin-bottom:10px; font-size:0.9rem; text-transform:uppercase; font-weight:bold;">${i18n.t('match_discoveries_title')}</strong>
                <div style="display:flex; flex-direction:column; gap:8px;">
                     ${results.discovery.slice(0, 3).map(b => `
                        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; align-items:center; gap:12px;">
                            ${b.image ? `<img src="${b.image}" style="height:35px; width:20px; object-fit:contain; filter:grayscale(1) opacity(0.6);">` : '<span style="font-size:1.2rem; filter:grayscale(1) opacity(0.6);">⭐</span>'}
                            <span style="font-weight:bold; color:#ccc; font-size:0.95rem;">${b.title}</span>
                        </div>`).join('')}
                </div>
            </div>
            ` : ''}
            
            <button id="btn-restart" class="form-input text-center mt-20" style="background:#333; margin-top:25px; padding:15px; border-radius:12px; font-weight:bold; cursor:pointer;">${i18n.t('match_btn_restart')}</button>
        `;

        wrapper.querySelector('#btn-restart').onclick = () => {
            // Reset UI
            tabQr.style.display = '';
            tabQr.style.color = '#666'; tabQr.style.borderBottom = 'none';
            tabScan.style.display = '';

            // Switch to scan
            switchTab('scan');
        };
    };

    wrapper.querySelector('#btn-manual-compare').onclick = () => {
        const txt = wrapper.querySelector('#manual-paste').value;
        if (txt) processMatch(txt);
    };

    const close = () => {
        stopScanner();
        closeModal();
    };
    wrapper.querySelector('.close-btn').onclick = close;

    // INITIAL CALL
    generateMyQR();

    openModal(wrapper);
}

export function renderAdvancedShareModal(beer, userRating) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.innerHTML = `
        <h2 data-i18n="share_story_title">${i18n.t('share_story_title')}</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:20px;" data-i18n="share_story_desc">
            ${i18n.t('share_story_desc')}
        </p>

        <div class="form-group">
            <label class="form-label" data-i18n="share_score_label">${i18n.t('share_score_label')}</label>
            <input type="number" id="share-score" class="form-input" value="${userRating.score || 0}" min="0" max="20" step="0.5">
        </div>

        <div class="form-group">
            <label class="form-label" data-i18n="share_comment_label">${i18n.t('share_comment_label')}</label>
            <textarea id="share-comment" class="form-textarea" rows="3">${userRating.comment || ''}</textarea>
        </div>

        <button id="btn-gen-link" class="btn-primary" style="margin-top:20px; background:var(--accent-gold); color:black;">
            ${i18n.t('share_btn_gen')}
        </button>
    `;

    wrapper.querySelector('#btn-gen-link').onclick = () => {
        const score = wrapper.querySelector('#share-score').value;
        const comment = wrapper.querySelector('#share-comment').value;

        // Construct API Link
        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}?action=share&id=${beer.id}&score=${score}&comment=${encodeURIComponent(comment)}&fallback=true`;

        renderShareLink(link);
    };

    openModal(wrapper);
}
// --- Rarity Animation Helper (replaces global MutationObserver) ---
// Called directly after rendering cards instead of watching the entire DOM tree.
export function applyRarityAnimations(container) {
    if (!container) return;
    const badges = container.querySelectorAll('.rarity-badge');
    badges.forEach(badge => {
        if (badge.dataset.animInit) return;
        badge.dataset.animInit = 'true';

        if (badge.classList.contains('rarity-mythique')) {
            badge.classList.add('anim-mythique', 'rarity-frame-mythique');
        }
        if (badge.classList.contains('rarity-legendaire')) {
            badge.classList.add('anim-legendaire');
        }
        if (badge.classList.contains('rarity-ultra_legendary')) {
            badge.classList.add('card-anim-ultra_legendary', 'rarity-frame-ultra_legendary');
        }
        if (badge.classList.contains('rarity-epique')) {
            badge.classList.add('anim-epique');
        }
        if (badge.classList.contains('rarity-rare')) {
            badge.classList.add('anim-rare');
        }
        if (badge.classList.contains('rarity-commun')) {
            badge.classList.add('anim-commun');
        }
        if (badge.classList.contains('rarity-super_rare')) {
            badge.classList.add('anim-super_rare');
        }
    });
}

// ======================================= //
// Patchnotes System                        //
// ======================================= //

const CURRENT_VERSION = '4.1.0';


export function checkPatchnotes() {
    const lastSeen = localStorage.getItem('beerdex_last_seen_version');
    if (lastSeen !== CURRENT_VERSION) {
        // Show notification dot on settings
        const settingsNav = document.querySelector('.nav-item[data-view="settings"]');
        if (settingsNav && !settingsNav.querySelector('.notification-dot')) {
            const dot = document.createElement('span');
            dot.className = 'notification-dot';
            settingsNav.appendChild(dot);
        }
    }
}

export function markPatchnotesSeen() {
    localStorage.setItem('beerdex_last_seen_version', CURRENT_VERSION);
    const dot = document.querySelector('.nav-item[data-view="settings"] .notification-dot');
    if (dot) dot.remove();
}

export function renderPatchnotesSection() {
    const lastSeen = localStorage.getItem('beerdex_last_seen_version');
    const isNew = lastSeen !== CURRENT_VERSION;

    const versionList = i18n.t('patchnote_versions').split(',');

    let html = '';
    versionList.forEach(version => {
        const isCurrentNew = (version === CURRENT_VERSION && isNew);
        const date = i18n.t(`patchnote_${version}_date`);
        const title = i18n.t(`patchnote_${version}_title`);

        // Items are stored as item_1, item_2... until not found
        let items = [];
        let i = 1;
        while (true) {
            const itemKey = `patchnote_${version}_item_${i}`;
            const translated = i18n.t(itemKey);
            if (translated === itemKey) break;
            items.push(translated);
            i++;
        }

        html += `
            <div class="patchnote-section" id="patchnote-${version}" ${isCurrentNew ? 'data-new="true"' : ''}>
                <div class="version-badge">
                    ${isCurrentNew ? '🆕 ' : ''}v${version} — ${date}
                </div>
                <h4 style="color:var(--text-primary); margin-bottom:10px; font-size:0.95rem;">${title}</h4>
                ${items.map(item => {
            const chars = Array.from(item.trim());
            const isEmoji = chars[0] && chars[0].match(/[^a-zA-Z0-9\s]/);
            const icon = isEmoji ? chars[0] : '✨';
            const text = isEmoji ? chars.slice(1).join('').trim() : item.trim();
            return `
                        <div class="patchnote-item">
                            <span class="pn-icon">${icon}</span>
                            <span>${text}</span>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    return html;
}

// ======================================= //
// Star Rating HTML Generator               //
// ======================================= //

export function generateStarRatingHTML(currentValue = 0, beerId = '', maxStars = 5) {
    // Each star can be empty, half, or full
    // Value is /10 (0-10), each star = 2 units
    const value = Math.min(maxStars * 2, Math.max(0, currentValue));

    let starsHtml = '';
    for (let i = 1; i <= maxStars; i++) {
        const starValue = i * 2;
        const halfValue = starValue - 1;

        let cls = '';
        if (value >= starValue) cls = 'full';
        else if (value >= halfValue) cls = 'half';

        starsHtml += `
            <div class="star ${cls}" data-beer="${beerId}" data-half="${halfValue}" data-full="${starValue}">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <clipPath id="star-left-${beerId}-${i}">
                            <rect x="0" y="0" width="12" height="24"/>
                        </clipPath>
                        <clipPath id="star-right-${beerId}-${i}">
                            <rect x="12" y="0" width="12" height="24"/>
                        </clipPath>
                    </defs>
                    <path class="star-bg" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    <path class="star-fill-left" clip-path="url(#star-left-${beerId}-${i})" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    <path class="star-fill-right" clip-path="url(#star-right-${beerId}-${i})" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </div>
        `;
    }

    const displayValue = value > 0 ? `${value}/10` : '';

    return `
        <div class="star-rating" data-beer="${beerId}" data-value="${value}">
            ${starsHtml}
        </div>
        <span class="star-label" data-beer="${beerId}">${displayValue}</span>
    `;
}

// ======================================= //
// Unrated Beer Banner/Carousel             //
// ======================================= //

export function renderUnratedBanner(allBeers, container, migrationPrompts = []) {
    const userData = Storage.getAllUserData();
    const consumedIds = Storage.getAllConsumedBeerIds();

    // Find beers that are consumed but not rated
    const unratedBeers = [];
    consumedIds.forEach(id => {
        const user = userData[id];
        const beer = allBeers.find(b => String(b.id) === String(id));
        if (beer && user && (user.count || 0) > 0 && (!user.score && user.score !== 0)) {
            unratedBeers.push({ beer, user });
        }
    });

    const hasMigrations = migrationPrompts && migrationPrompts.length > 0;
    if (unratedBeers.length === 0 && !hasMigrations) return ''; // Nothing to show

    // --- Migration chips (transfer suggestions) ---
    const migrationChipsHtml = hasMigrations ? migrationPrompts.map(m => {
        return `
            <div class="migration-chip" data-custom-id="${m.customBeer.id}" data-official-id="${m.officialBeer.id}" 
                 style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, rgba(255,192,0,0.12), rgba(255,153,0,0.08)); border: 1px solid rgba(255,192,0,0.3); padding: 5px 12px 5px 5px; border-radius: 24px; flex: 0 0 auto; cursor: pointer; backdrop-filter: blur(5px); box-shadow: 0 4px 10px rgba(255,192,0,0.1);">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,192,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 14px;">🔄</div>
                <span style="font-size: 0.75rem; font-weight: 600; color: var(--accent-gold); max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.customBeer.title}</span>
                <span style="font-size: 0.6rem; color: #888; padding: 1px 5px; background: rgba(255,255,255,0.05); border-radius: 8px;">${m.score}%</span>
            </div>
        `;
    }).join('') : '';

    // --- Unrated chips ---
    const slidesHtml = unratedBeers.slice(0, 15).map(({ beer }) => {
        const fallbackImg = 'images/beer/default.png';
        const img = beer.image || fallbackImg;

        return `
            <div class="unrated-chip" data-beer-id="${beer.id}" style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 5px 12px 5px 5px; border-radius: 24px; flex: 0 0 auto; cursor: pointer; backdrop-filter: blur(5px); box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                <img src="${img}" alt="" onerror="this.src='${fallbackImg}'" style="width: 28px; height: 28px; border-radius: 50%; object-fit: contain; background: #222;">
                <span style="font-size: 0.8rem; font-weight: 500; color: #fff; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${beer.title}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2.5" style="margin-left: 2px;"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path></svg>
            </div>
        `;
    }).join('');

    const totalCount = unratedBeers.length + (migrationPrompts ? migrationPrompts.length : 0);

    const bannerHtml = `
        <div class="unrated-banner-modern" style="margin: 10px 15px 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="font-size: 0.8rem; color: var(--accent-gold); margin: 0; display: flex; align-items: center; gap: 6px;">${hasMigrations ? (i18n.t('banner_actions_title') || '⚡ Actions') : i18n.t('unrated_banner_title')}</h4>
                <span style="font-size: 0.7rem; color: #888; background: rgba(255, 255, 255, 0.06); padding: 2px 8px; border-radius: 10px;">${totalCount}</span>
            </div>
            <div style="display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; padding-bottom: 5px; -webkit-overflow-scrolling: touch;">
                ${migrationChipsHtml}${slidesHtml}
            </div>
        </div>
    `;

    // Insert at beginning of container
    container.insertAdjacentHTML('afterbegin', bannerHtml);

    // Bind clicks for unrated chips (open beer detail)
    const banner = container.querySelector('.unrated-banner-modern');
    if (banner) {
        banner.querySelectorAll('.unrated-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const beerId = chip.dataset.beerId;
                const beer = allBeers.find(b => String(b.id) === String(beerId));
                if (beer) {
                    renderBeerDetail(beer, allBeers);
                }
            });
        });

        // Bind clicks for migration chips (open migration modal)
        banner.querySelectorAll('.migration-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const customId = chip.dataset.customId;
                const officialId = chip.dataset.officialId;
                const match = migrationPrompts.find(m => 
                    m.customBeer.id === customId && m.officialBeer.id === officialId
                );
                if (match) {
                    _renderMigrationModal(match, allBeers, container, migrationPrompts);
                }
            });
        });
    }

    return bannerHtml;
}

// ======================================= //
// Migration Modal                         //
// ======================================= //

function _renderMigrationModal(match, allBeers, parentContainer, migrationPrompts) {
    const { customBeer, officialBeer, score } = match;
    const userData = Storage.getAllUserData();
    const customData = userData[customBeer.id] || {};
    
    const customImg = customBeer.image || 'images/beer/default.png';
    const officialImg = officialBeer.image || 'images/beer/default.png';
    const drinkCount = customData.count || 0;
    const historyCount = (customData.history || []).length;
    const hasRating = customData.score !== undefined;

    const migrationTitleText = i18n.t('migration_title') || 'Transfert disponible';
    const migrationSubtitleText = i18n.t('migration_subtitle') || 'Votre bière personnalisée correspond à une bière officielle.';
    const migrationCustomLabel = i18n.t('migration_label_custom') || 'Personnalisée';
    const migrationOfficialLabel = i18n.t('migration_label_official') || 'Officielle';
    const migrationSimilarityText = i18n.t('migration_similarity') || 'Similarité';
    const migrationDrinksText = i18n.t('migration_drinks') || 'Consommations';
    const migrationHistoryText = i18n.t('migration_history') || 'Historique';
    const migrationEntriesText = i18n.t('migration_entries') || 'entrées';
    const migrationRatingText = i18n.t('migration_rating') || 'Note';
    const migrationDismissText = i18n.t('migration_btn_dismiss') || 'Ignorer';
    const migrationTransferText = i18n.t('migration_btn_reconcile') || 'Fusionner et remplacer';

    modalContainer.innerHTML = `
        <div class="modal-overlay active" id="migration-overlay">
            <div class="modal-content" style="max-width: 420px; border: 1px solid rgba(255,192,0,0.3); background: var(--bg-card);">
                <div style="text-align: center; padding: 20px 20px 10px;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">🔄</div>
                    <h3 style="color: var(--accent-gold); font-family: 'Russo One', sans-serif; margin-bottom: 5px;">
                        ${migrationTitleText}
                    </h3>
                    <p style="font-size: 0.8rem; color: #888; margin-bottom: 20px;">
                        ${migrationSubtitleText}
                    </p>
                </div>

                <div style="display: flex; align-items: center; justify-content: center; gap: 15px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 12px; margin: 0 15px 15px;">
                    <div style="text-align: center; flex: 1;">
                        <img src="${customImg}" alt="" onerror="this.src='images/beer/default.png'" 
                             style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #222; margin-bottom: 6px;">
                        <div style="font-size: 0.75rem; color: #aaa; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 auto;">${customBeer.title}</div>
                        <div style="font-size: 0.65rem; color: #666; margin-top: 2px;">${migrationCustomLabel}</div>
                    </div>

                    <div style="font-size: 1.5rem; color: var(--accent-gold);">→</div>

                    <div style="text-align: center; flex: 1;">
                        <img src="${officialImg}" alt="" onerror="this.src='images/beer/default.png'" 
                             style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #222; margin-bottom: 6px;">
                        <div style="font-size: 0.75rem; color: #fff; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 auto;">${officialBeer.title}</div>
                        <div style="font-size: 0.65rem; color: var(--accent-gold); margin-top: 2px;">${migrationOfficialLabel}</div>
                    </div>
                </div>

                <div style="padding: 0 15px 15px; font-size: 0.8rem; color: #aaa;">
                    <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span>${migrationSimilarityText}</span>
                            <span style="color: var(--accent-gold); font-weight: bold;">${score}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span>${migrationDrinksText}</span>
                            <span style="color: #fff;">${drinkCount}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span>${migrationHistoryText}</span>
                            <span style="color: #fff;">${historyCount} ${migrationEntriesText}</span>
                        </div>
                        ${hasRating ? `<div style="display: flex; justify-content: space-between;">
                            <span>${migrationRatingText}</span>
                            <span style="color: #fff;">${customData.score}/20</span>
                        </div>` : ''}
                    </div>
                </div>

                <div style="display: flex; gap: 10px; padding: 0 15px 20px;">
                    <button id="btn-migration-dismiss" class="btn-primary" style="flex: 1; background: #222; border: 1px solid #444; color: #aaa; margin: 0;">
                        ${migrationDismissText}
                    </button>
                    <button id="btn-migration-confirm" class="btn-primary" style="flex: 1; background: var(--accent-gold); color: #000; font-weight: bold; margin: 0;">
                        ${migrationTransferText}
                    </button>
                </div>
            </div>
        </div>
    `;

    modalContainer.style.display = '';
    modalContainer.classList.remove('hidden');

    // Close overlay
    const overlay = document.getElementById('migration-overlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            modalContainer.style.display = '';
            modalContainer.classList.add('hidden');
            modalContainer.innerHTML = '';
        }
    });

    // Dismiss (never show again)
    document.getElementById('btn-migration-dismiss').addEventListener('click', () => {
        Deduplicator.dismissMatch(customBeer.id, officialBeer.id);
        const idx = migrationPrompts.findIndex(m => m.customBeer.id === customBeer.id && m.officialBeer.id === officialBeer.id);
        if (idx !== -1) migrationPrompts.splice(idx, 1);
        modalContainer.style.display = '';
        modalContainer.classList.add('hidden');
        modalContainer.innerHTML = '';
        showToast(i18n.t('migration_dismissed') || 'Suggestion ignorée', 'info');
        // Re-render banner
        const existingBanner = parentContainer.querySelector('.unrated-banner-modern');
        if (existingBanner) existingBanner.remove();
        renderUnratedBanner(allBeers, parentContainer, migrationPrompts);
    });

    // Confirm transfer
    document.getElementById('btn-migration-confirm').addEventListener('click', () => {
        const result = Storage.migrateBeerData(customBeer.id, officialBeer.id);
        if (result.success) {
            Storage.savePreference('dedup_manually_triggered', true);
            window.dispatchEvent(new Event('beerdex-action'));
            const idx = migrationPrompts.findIndex(m => m.customBeer.id === customBeer.id && m.officialBeer.id === officialBeer.id);
            if (idx !== -1) migrationPrompts.splice(idx, 1);
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
            showToast(i18n.t('migration_success') || `Transféré ! ${result.transferred.count} conso(s) et ${result.transferred.history} entrée(s) d'historique.`, 'success');
            Feedback.playSuccess();
            // Re-render banner
            const existingBanner = parentContainer.querySelector('.unrated-banner-modern');
            if (existingBanner) existingBanner.remove();
            renderUnratedBanner(allBeers, parentContainer, migrationPrompts);
            
            // Reload to apply state change
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showToast(i18n.t('migration_error') || 'Erreur lors du transfert.', 'error');
        }
    });
}

// ======================================= //
// Debug / Crash Report Modal              //
// ======================================= //

export function renderDebugModal() {
    const report = CrashLogger.generateReport();
    const device = CrashLogger.getDeviceInfo();
    const logs = CrashLogger.getLogs();

    const debugTitleText = i18n.t('debug_title') || 'Diagnostic & Debug';
    const debugSubtitleText = i18n.t('debug_subtitle') || 'Informations techniques pour le support';
    const debugDeviceText = i18n.t('debug_device_title') || 'Appareil';
    const debugErrorsText = i18n.t('debug_errors_title') || 'Erreurs récentes';
    const debugNoErrorsText = i18n.t('debug_no_errors') || 'Aucune erreur enregistrée.';
    const debugCopyText = i18n.t('debug_btn_copy') || 'Copier le rapport';
    const debugEmailText = i18n.t('debug_btn_email') || 'Envoyer par email';
    const debugClearText = i18n.t('debug_btn_clear') || 'Effacer les logs';
    const debugCloseText = i18n.t('btn_close') || 'Fermer';
    const debugDownloadText = i18n.t('btn_download') || 'Télécharger';

    modalContainer.innerHTML = `
        <div class="modal-overlay active" id="debug-overlay">
            <div class="modal-content" style="max-width: 500px; max-height: 85vh; overflow-y: auto; background: var(--bg-card); border: 1px solid rgba(255,255,255,0.1);">
                <div style="text-align: center; padding: 20px 20px 10px;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">🛠️</div>
                    <h3 style="color: var(--accent-gold); font-family: 'Russo One', sans-serif; margin-bottom: 5px;">
                        ${debugTitleText}
                    </h3>
                    <p style="font-size: 0.75rem; color: #888;">
                        ${debugSubtitleText}
                    </p>
                </div>

                <!-- Device Info -->
                <div style="padding: 0 15px 10px;">
                    <h4 style="font-size: 0.8rem; color: var(--accent-gold); margin-bottom: 8px;">📱 ${debugDeviceText}</h4>
                    <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; font-size: 0.75rem; color: #aaa; font-family: monospace; line-height: 1.6;">
                        <div><span style="color:#888;">Platform:</span> ${device.platform}</div>
                        <div><span style="color:#888;">Screen:</span> ${device.screenResolution} (${device.pixelRatio}x)</div>
                        <div><span style="color:#888;">Window:</span> ${device.windowSize}</div>
                        <div><span style="color:#888;">RAM:</span> ${device.deviceMemory}</div>
                        <div><span style="color:#888;">CPU:</span> ${device.hardwareConcurrency} cores</div>
                        <div><span style="color:#888;">Storage:</span> ${device.storageUsed}</div>
                        <div><span style="color:#888;">Online:</span> ${device.online ? '✅' : '❌'}</div>
                        <div><span style="color:#888;">Standalone:</span> ${device.standalone ? '✅' : '❌'}</div>
                        <div><span style="color:#888;">Capacitor:</span> ${device.capacitor ? '✅' : '❌'}</div>
                        <div style="word-break: break-all; margin-top: 5px;"><span style="color:#888;">UA:</span> ${device.userAgent}</div>
                    </div>
                </div>

                <!-- Error Logs -->
                <div style="padding: 0 15px 10px;">
                    <h4 style="font-size: 0.8rem; color: var(--accent-gold); margin-bottom: 8px;">🐛 ${debugErrorsText} (${logs.length})</h4>
                    <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; max-height: 200px; overflow-y: auto; font-size: 0.7rem; color: #aaa; font-family: monospace; line-height: 1.5;">
                        ${logs.length === 0 
                            ? `<div style="text-align: center; color: #4CAF50; padding: 15px;">🎉 ${debugNoErrorsText}</div>`
                            : logs.slice(-10).reverse().map((log) => `
                                <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); ${log.type === 'error' || log.type === 'promise_rejection' ? 'color: #ff6b6b;' : ''}">
                                    <div style="color: #666;">[${log.timestamp?.substring(11, 19) || '??'}] <span style="color: ${log.type === 'info' ? '#4CAF50' : log.type === 'console.error' ? '#ff9800' : '#ff6b6b'};">${log.type}</span></div>
                                    <div style="word-break: break-all;">${(log.message || '(empty)').substring(0, 200)}</div>
                                    ${log.source ? `<div style="color: #555;">${log.source}:${log.line}</div>` : ''}
                                </div>
                            `).join('')
                        }
                    </div>
                </div>

                <!-- Dev Settings -->
                <div style="padding: 0 15px 10px;">
                    <h4 style="font-size: 0.8rem; color: var(--accent-gold); margin-bottom: 8px;">⚙️ ${i18n.t('debug_dev_settings') || 'Developer Settings'}</h4>
                    <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px;">
                        <span style="font-size:0.8rem; color:#aaa;">${i18n.t('debug_toggle_dedup') || 'Deduplicator Background Worker'}</span>
                        <label class="switch" style="transform: scale(0.8);">
                            <input type="checkbox" class="toggle-switch" id="toggle-debug-dedup" ${Storage.getPreference('debug_deduplicator_enabled', false) ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; flex-direction: column; gap: 8px; padding: 0 15px 20px;">
                    <button id="btn-debug-copy" class="btn-primary" style="background: var(--accent-gold); color: #000; font-weight: bold; margin: 0; width: 100%;">
                        📋 ${debugCopyText}
                    </button>
                    <button id="btn-debug-download" class="btn-primary" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); margin: 0; width: 100%; color: #fff;">
                        📥 ${debugDownloadText}
                    </button>
                    <a id="btn-debug-email" href="${CrashLogger.getMailtoLink()}" class="btn-primary" style="display: block; text-align: center; background: #222; border: 1px solid var(--accent-gold); color: var(--accent-gold); margin: 0; width: 100%; text-decoration: none; box-sizing: border-box;">
                        ✉️ ${debugEmailText}
                    </a>
                    <button id="btn-debug-clear" class="btn-primary" style="background: rgba(255,0,0,0.1); color: #ff6b6b; border: 1px solid rgba(255,0,0,0.3); margin: 0; width: 100%; font-size: 0.8rem;">
                        🗑️ ${debugClearText}
                    </button>
                    <button id="btn-debug-close" class="btn-primary" style="background: #333; color: #aaa; margin: 0; width: 100%;">
                        ${debugCloseText}
                    </button>
                </div>
            </div>
        </div>
    `;

    modalContainer.classList.remove('hidden');

    // Close overlay
    const overlay = document.getElementById('debug-overlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            modalContainer.classList.add('hidden');
        }
    });

    document.getElementById('btn-debug-close').addEventListener('click', () => {
        modalContainer.classList.add('hidden');
    });

    document.getElementById('toggle-debug-dedup').addEventListener('change', (e) => {
        Storage.savePreference('debug_deduplicator_enabled', e.target.checked);
        showToast(e.target.checked ? 'Deduplicator enabled (requires restart)' : 'Deduplicator disabled');
    });

    document.getElementById('btn-debug-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(report);
            showToast(i18n.t('debug_copied') || 'Rapport copié !', 'success');
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = report;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast(i18n.t('debug_copied') || 'Rapport copié !', 'success');
        }
    });

    document.getElementById('btn-debug-clear').addEventListener('click', () => {
        CrashLogger.clearLogs();
        showToast(i18n.t('debug_cleared') || 'Logs effacés', 'info');
        renderDebugModal(); // Re-render
    });

    document.getElementById('btn-debug-download').addEventListener('click', () => {
        try {
            const reportText = CrashLogger.generateReport();
            const blob = new Blob([reportText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            a.download = "beerdex-debug-" + timestamp + ".txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download log file:', err);
            showToast('Erreur lors du téléchargement');
        }
    });
}
export function filterSettings(query) {
    const container = document.getElementById('settings-container');
    if (!container) return;

    query = query ? query.toLowerCase().trim() : '';

    const groups = container.querySelectorAll('.setting-group');
    
    groups.forEach(group => {
        let hasVisibleRow = false;
        const rows = group.querySelectorAll('.setting-row');
        
        rows.forEach(row => {
            const keywords = (row.dataset.keywords || '').toLowerCase();
            const text = row.innerText.toLowerCase();
            
            if (!query || keywords.includes(query) || text.includes(query)) {
                // If it's a special row like bac-settings-group, we might need a different display.
                // But most are .setting-row which is flex.
                row.style.display = row.style.flexDirection === 'column' ? 'flex' : 'flex'; // Actually, just empty to restore CSS or 'flex'
                row.style.display = 'flex';
                hasVisibleRow = true;
            } else {
                row.style.display = 'none';
            }
        });

        group.style.display = hasVisibleRow ? 'block' : 'none';
    });
}
