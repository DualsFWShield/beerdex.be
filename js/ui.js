import * as Storage from './storage.js';
import * as Share from './share.js';
import Match from './match.js';
import * as Map from './map.js';
import * as API from './api.js';
import * as Scanner from './scanner.js';
import { fetchProductByBarcode, searchProducts } from './off-api.js';

// We assume global libs: QRCode, Html5QrcodeScanner (handled via CDN)
const QRCodeLib = window.QRCode;
const Html5Qrcode = window.Html5Qrcode;

// Helpers
const modalContainer = document.getElementById('modal-container');

// Toast Queue
const toastQueue = [];
let isToastActive = false;

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

export function closeModal() {
    modalContainer.classList.add('hidden');
    modalContainer.setAttribute('aria-hidden', 'true');
    modalContainer.innerHTML = '';
    document.body.classList.remove('modal-open');
}

function openModal(content) {
    modalContainer.innerHTML = '';
    modalContainer.appendChild(content);
    modalContainer.classList.remove('hidden');
    modalContainer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // Close on click outside
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) closeModal();
    };
}

// --- Renders ---

// Helper to remove white background from images using flood fill from corners
// Helper to remove white background from images using flood fill from corners with edge feathering
// Helper to remove background using 'Magic Wand' style flood fill (color distance)
window.removeImageBackground = function (img) {
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

    // Filtering Logic
    let filteredBeers = beers;
    if (filters) {
        // --- Advanced Filtering ---

        // Type & Brewery
        if (filters.type && filters.type !== 'All') {
            filteredBeers = filteredBeers.filter(b => b.type === filters.type);
        }
        if (filters.brewery && filters.brewery !== 'All') {
            filteredBeers = filteredBeers.filter(b => b.brewery === filters.brewery);
        }

        // Helpers for parsing
        const getAlc = (b) => parseFloat((b.alcohol || '0').replace('%', '').replace('°', '')) || 0;
        const getVol = (b) => {
            const str = (b.volume || '').toLowerCase();
            if (str.includes('l') && !str.includes('ml') && !str.includes('cl')) {
                return parseFloat(str) * 1000; // Liters to ml
            }
            if (str.includes('cl')) return parseFloat(str) * 10;
            return parseFloat(str) || 330; // Default or raw
        };

        // Alcohol Filter
        if (filters.alcMode) {
            const max = parseFloat(filters.alcMax);
            const min = parseFloat(filters.alcMin);
            const exact = parseFloat(filters.alcExact);

            if (filters.alcMode === 'max' && !isNaN(max)) {
                filteredBeers = filteredBeers.filter(b => getAlc(b) <= max);
            } else if (filters.alcMode === 'range') {
                if (!isNaN(min)) filteredBeers = filteredBeers.filter(b => getAlc(b) >= min);
                if (!isNaN(max)) filteredBeers = filteredBeers.filter(b => getAlc(b) <= max);
            } else if (filters.alcMode === 'exact' && !isNaN(exact)) {
                // allow small epsilon for float comparison?
                filteredBeers = filteredBeers.filter(b => Math.abs(getAlc(b) - exact) < 0.1);
            }
        } else {
            // Backward compat / Default logic
            if (filters.maxAlcohol) {
                filteredBeers = filteredBeers.filter(b => getAlc(b) <= parseFloat(filters.maxAlcohol));
            }
        }

        // Volume Filter
        if (filters.volMode && filters.volMode !== 'any') {
            const min = parseFloat(filters.volMin);
            const max = parseFloat(filters.volMax);
            const exact = parseFloat(filters.volExact);

            if (filters.volMode === 'range') {
                if (!isNaN(min)) filteredBeers = filteredBeers.filter(b => getVol(b) >= min);
                if (!isNaN(max)) filteredBeers = filteredBeers.filter(b => getVol(b) <= max);
            } else if (filters.volMode === 'exact' && !isNaN(exact)) {
                // Approximate check for volumes (e.g. 330ml vs 33cl)
                filteredBeers = filteredBeers.filter(b => Math.abs(getVol(b) - exact) < 5);
            }
        }

        // Minimum Rating
        if (filters.minRating && parseInt(filters.minRating) > 0) {
            const minR = parseInt(filters.minRating);
            filteredBeers = filteredBeers.filter(b => {
                const r = Storage.getBeerRating(b.id);
                return r && r.score >= minR;
            });
        }

        // --- NEW FILTERS ---
        // Production Volume
        if (filters.production_volume && filters.production_volume !== 'All') {
            filteredBeers = filteredBeers.filter(b => b.production_volume === filters.production_volume);
        }

        // Distribution
        if (filters.distribution && filters.distribution !== 'All') {
            filteredBeers = filteredBeers.filter(b => b.distribution === filters.distribution);
        }

        // Barrel Aged
        if (filters.barrel_aged) {
            filteredBeers = filteredBeers.filter(b => b.barrel_aged === true);
        }

        // Community Rating
        if (filters.community_rating !== undefined && filters.community_rating !== '') {
            const minCommR = parseFloat(filters.community_rating);
            filteredBeers = filteredBeers.filter(b => (b.community_rating || 0) >= minCommR);
        }

        // Ingredients
        if (filters.ingredients) {
            const kw = filters.ingredients.toLowerCase();
            filteredBeers = filteredBeers.filter(b => (b.ingredients || '').toLowerCase().includes(kw));
        }

        // --- Sorting ---
        // Create unified sort function
        const sortFunc = (a, b) => {
            // 1. Favorites First (unless ignored)
            if (!filters.ignoreFavorites) {
                const favA = Storage.isFavorite(a.id) ? 1 : 0;
                const favB = Storage.isFavorite(b.id) ? 1 : 0;
                if (favA !== favB) return favB - favA;
            }

            // 2. Secondary Sort
            let valA, valB;
            if (filters.sortBy === 'brewery') {
                valA = a.brewery.toLowerCase();
                valB = b.brewery.toLowerCase();
            } else if (filters.sortBy === 'alcohol') {
                valA = parseFloat((a.alcohol || '0').replace('%', '').replace('°', '')) || 0;
                valB = parseFloat((b.alcohol || '0').replace('%', '').replace('°', '')) || 0;
            } else if (filters.sortBy === 'volume') {
                // Helper for volume (copied from logic elsewhere or simplified)
                const getV = (bb) => {
                    const str = (bb.volume || '').toLowerCase();
                    if (str.includes('l') && !str.includes('ml') && !str.includes('cl')) return parseFloat(str) * 1000;
                    if (str.includes('cl')) return parseFloat(str) * 10;
                    return parseFloat(str) || 330;
                };
                valA = getV(a);
                valB = getV(b);
            } else if (filters.sortBy === 'rarity') {
                const ranks = { 'base': 0, 'commun': 1, 'rare': 2, 'super_rare': 3, 'epique': 4, 'mythique': 5, 'legendaire': 6, 'ultra_legendaire': 7 };
                valA = ranks[a.rarity || 'base'] || 0;
                valB = ranks[b.rarity || 'base'] || 0;
            } else if (filters.sortBy === 'community_rating') {
                valA = a.community_rating || 0;
                valB = b.community_rating || 0;
            } else {
                valA = a.title.toLowerCase();
                valB = b.title.toLowerCase();
            }

            if (valA < valB) return filters.sortOrder === 'desc' ? 1 : -1;
            if (valA > valB) return filters.sortOrder === 'desc' ? -1 : 1;
            return 0;
        };

        filteredBeers.sort(sortFunc);

        // Custom Beer Filter
        if (filters.onlyCustom) {
            filteredBeers = filteredBeers.filter(b => String(b.id).startsWith('CUSTOM_'));
        }
        if (filters.onlyFavorites) {
            filteredBeers = filteredBeers.filter(b => Storage.isFavorite(b.id));
        }

        // Rarity Filter
        if (filters.rarity && filters.rarity.length > 0) {
            // If user checked "Unknown/Base", handle it
            filteredBeers = filteredBeers.filter(b => {
                const r = b.rarity || 'base';
                return filters.rarity.includes(r);
            });
        }
    }

    if (filteredBeers.length === 0) {
        if (showCreatePrompt && isDiscoveryCallback) {
            container.innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <p style="color: #888; margin-bottom: 20px;">La bière n'existe pas encore...</p>
                    <button id="btn-create-discovery" class="btn-primary" style="background:var(--accent-gold); color:var(--bg-dark);">
                        ➕ Créer cette bière
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
                    <h3>Mode Découverte</h3>
                    <p style="margin-top: 10px;">Votre collection est vide.</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">Utilisez la recherche 🔍 pour trouver et ajouter des bières.</p>
                </div>`;
            return;
        }

        // --- NEW: Empty Search State -> Propose API Search ---
        if (!isDiscoveryCallback && filters.query && filters.query.length > 2) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px 20px; color: #666;">
                    <h3 style="margin-bottom:10px;">Aucun résultat local 😢</h3>
                    <p style="font-size:0.9rem;">On cherche plus loin ?</p>
                    <button id="btn-search-api" class="btn-primary" style="margin-top:15px; background:var(--accent-gold); color:black;">
                        🌍 Recherche Approfondie (OFF API)
                    </button>
                    <div id="api-results-area" style="margin-top:20px;"></div>
                </div>`;

            // Bind Click
            setTimeout(() => {
                const btn = document.getElementById('btn-search-api');
                if (btn) {
                    btn.onclick = async () => {
                        btn.disabled = true;
                        btn.innerHTML = '<span class="spinner"></span> Recherche...';
                        try {
                            const { products, count } = await searchProducts(filters.query);
                            const area = document.getElementById('api-results-area');

                            if (products.length === 0) {
                                btn.innerHTML = '❌ Rien trouvé...';
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
                                    <p style="margin-top:30px; color:#666;">Toujours pas ?</p>
                                    <button id="btn-create-manual" class="form-input">➕ Créer manuellement</button>
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
                            btn.innerHTML = '⚠️ Erreur (Limite atteinte ?)';
                            alert(e.message);
                        }
                    };
                }
            }, 0);
            return;
        }

        container.innerHTML = '<div style="text-align:center; padding: 20px; color: #666;">Aucune bière ne correspond aux critères...</div>';
        return;
    }

    let grid;
    if (isAppend) {
        grid = container.querySelector('.beer-grid');
    }

    if (!grid) {
        if (!isAppend) container.innerHTML = '';
        grid = document.createElement('div');
        grid.className = 'beer-grid';
        container.appendChild(grid);
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

        // Apply Rarity Border
        // Logic: Reveal if Drunk OR if Setting "Reveal Rarity" is ON
        const revealRarity = isDrunk || Storage.getPreference('revealRarity', false);

        if (revealRarity && beer.rarity && beer.rarity !== 'base') {
            // Fallback to CSS variable or hardcoded lookup if var() doesn't work well inline
            card.style.borderColor = `var(--rarity-${beer.rarity})`;

            // Make border slightly thicker for high rarities?
            if (beer.rarity === 'super_rare' || beer.rarity === 'epique') card.style.borderWidth = '2px';
            if (beer.rarity === 'mythique' || beer.rarity === 'legendaire') card.style.borderWidth = '3px';

            if (beer.rarity === 'ultra_legendaire') {
                // Use class for constant animation instead of inline styles
                card.classList.add('card-anim-ultra_legendary');
            }
        } else {
            // Locked / Neutral State
            card.style.borderColor = 'var(--border-color)';
        }

        if (beer.isSeasonal) {
            // Add a small seasonal indicator if needed
            if (!beer.rarity || beer.rarity === 'base') {
                card.style.borderColor = 'var(--rarity-seasonal)';
            }
        }

        // Stats Badges
        const abv = beer.alcohol ? `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${beer.alcohol}</span>` : '';
        const vol = beer.volume ? `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${beer.volume}</span>` : '';
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

        card.innerHTML = `
            ${isFavorite ? '<div style="position:absolute; top:5px; left:5px; z-index:2; font-size:1.2rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">⭐</div>' : ''}
            <svg class="check-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div style="width:100%; height:120px; display:flex; justify-content:center; align-items:center;">
                <img src="${displayImage}" alt="${beer.title}" class="beer-image" loading="${index < 10 ? 'eager' : 'lazy'}" 
                     ${beer.removeBackground ? 'onload="removeImageBackground(this)"' : ''}
                     onerror="if(this.src.includes('${fallbackImage}')) return; this.src='${fallbackImage}';">
            </div>
            <div class="beer-info">
                <h3 class="beer-title">${beer.title}</h3>
                <p class="beer-brewery">${beer.brewery}</p>
                <div style="display:flex; gap:5px; justify-content:center; margin-top:5px; color:#aaa; flex-wrap:wrap;">
                    ${abv} ${vol} ${typeBadge}
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

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
                        alert(e.message);
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
                <span>${beer.alcohol}</span> <span>${beer.volume}</span>
            </div>
            <button class="btn-add-api" style="width:100%; margin-top:10px; font-size:0.8rem; padding:5px; background:#333; color:#fff; border:1px solid #555;">➕ Ajouter</button>
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
                showToast("Bière importée !");
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
    wrapper.className = 'modal-content';

    // Extract unique values
    const types = ['All', ...new Set(allBeers.map(b => b.type).filter(Boolean))].sort();
    const breweries = ['All', ...new Set(allBeers.map(b => b.brewery).filter(Boolean))].sort();
    const prodVolumes = ['All', ...new Set(allBeers.map(b => b.production_volume).filter(Boolean))].sort();
    const distributions = ['All', ...new Set(allBeers.map(b => b.distribution).filter(Boolean))].sort();

    // Helpers
    const createOptions = (list, selected) => list.map(item => `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`).join('');

    wrapper.innerHTML = `
        <h2 style="margin-bottom:20px;">Filtres & Tris</h2>
        <form id="filter-form">
            <!-- Sorting -->
            <div class="stat-card mb-20">
                <h4 style="margin-bottom:10px;">Trier par</h4>
                <div style="display:flex; gap:10px;">
                    <select name="sortBy" class="form-select" style="flex:2;">
                        <option value="default" ${activeFilters.sortBy === 'default' ? 'selected' : ''}>Défaut (Favoris > Nom)</option>
                        <option value="brewery" ${activeFilters.sortBy === 'brewery' ? 'selected' : ''}>Brasserie</option>
                        <option value="alcohol" ${activeFilters.sortBy === 'alcohol' ? 'selected' : ''}>Alcool (%)</option>
                        <option value="volume" ${activeFilters.sortBy === 'volume' ? 'selected' : ''}>Volume</option>
                        <option value="rarity" ${activeFilters.sortBy === 'rarity' ? 'selected' : ''}>Rareté</option>
                        <option value="community_rating" ${activeFilters.sortBy === 'community_rating' ? 'selected' : ''}>Note Communauté</option>
                    </select>
                    <select name="sortOrder" class="form-select" style="flex:1;">
                        <option value="asc" ${activeFilters.sortOrder === 'asc' ? 'selected' : ''}>⬆️ Croissant</option>
                        <option value="desc" ${activeFilters.sortOrder === 'desc' ? 'selected' : ''}>⬇️ Décroissant</option>
                    </select>
                </div>
                
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                     <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:8px;">
                        <label for="onlyFavorites" style="font-size:0.9rem; margin:0;">⭐ Favoris Uniquement</label>
                        <input type="checkbox" name="onlyFavorites" id="onlyFavorites" ${activeFilters.onlyFavorites ? 'checked' : ''} style="width:20px; height:20px;">
                    </div>
                     <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:8px;">
                        <label for="ignoreFavorites" style="font-size:0.9rem; margin:0; color:#aaa;">🚫 Ignorer le tri favoris</label>
                        <input type="checkbox" name="ignoreFavorites" id="ignoreFavorites" ${activeFilters.ignoreFavorites ? 'checked' : ''} style="width:20px; height:20px;">
                    </div>
                </div>
            </div>

            <!-- Rarity Filter -->
            <div class="stat-card mb-20">
                <h4 style="margin-bottom:10px;">Rareté</h4>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${['base', 'commun', 'rare', 'super_rare', 'epique', 'mythique', 'legendaire', 'ultra_legendaire'].map(r => `
                        <label style="display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); padding:5px 10px; border-radius:15px; cursor:pointer; border:1px solid var(--rarity-${r});">
                            <input type="checkbox" class="cb-rarity" value="${r}" ${activeFilters.rarity && activeFilters.rarity.includes(r) ? 'checked' : ''}>
                            <span style="font-size:0.8rem; text-transform:capitalize; color:#fff;">${r.replace(/_/g, ' ')}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- New Filters: Attributes -->
            <div class="stat-card mb-20">
                <h4 style="margin-bottom:10px;">Attributs</h4>
                
                <div class="form-group">
                    <label class="form-label">Volume Production</label>
                    <select name="production_volume" class="form-select">${createOptions(prodVolumes, activeFilters.production_volume || 'All')}</select>
                </div>

                <div class="form-group">
                    <label class="form-label">Distribution</label>
                    <select name="distribution" class="form-select">${createOptions(distributions, activeFilters.distribution || 'All')}</select>
                </div>

                <div class="form-group" style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                    <label for="barrel_aged" style="font-size:0.9rem; margin:0;">🪵 Vieillie en fût</label>
                    <input type="checkbox" name="barrel_aged" id="barrel_aged" ${activeFilters.barrel_aged ? 'checked' : ''} style="width:20px; height:20px;">
                </div>

                <div class="form-group" style="margin-top:10px;">
                    <label class="form-label">Ingrédients (Recherche)</label>
                    <input type="text" name="ingredients" class="form-input" placeholder="Ex: Coriandre, Cerise..." value="${activeFilters.ingredients || ''}">
                </div>
            </div>

            <!-- New Filters: Ratings -->
             <div class="stat-card mb-20">
                <h4 style="margin-bottom:10px;">Notes</h4>
                
                 <div class="form-group">
                    <label class="form-label">Note Perso Min (<span id="rate-val">${activeFilters.minRating || 0}</span>/20)</label>
                    <input type="range" name="minRating" class="form-input" min="0" max="20" step="1" value="${activeFilters.minRating || 0}" 
                        oninput="document.getElementById('rate-val').innerText = this.value">
                </div>

                 <div class="form-group">
                    <label class="form-label">Note Communauté Min (<span id="comm-rate-val">${activeFilters.community_rating || 0}</span>/5)</label>
                    <input type="range" name="community_rating" class="form-input" min="0" max="5" step="0.1" value="${activeFilters.community_rating || 0}" 
                        oninput="document.getElementById('comm-rate-val').innerText = this.value">
                </div>
            </div>

            <!-- Basic Filters -->
            <div class="form-group">
                <label class="form-label">Type</label>
                <select name="type" class="form-select">${createOptions(types, activeFilters.type || 'All')}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Brasserie</label>
                <select name="brewery" class="form-select">${createOptions(breweries, activeFilters.brewery || 'All')}</select>
            </div>

            <!-- Advanced Alcohol -->
            <div class="form-group" style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                <label class="form-label">Degré Alcool</label>
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <select id="alc-mode" name="alcMode" class="form-select">
                        <option value="max" ${activeFilters.alcMode === 'max' ? 'selected' : ''}>Maximum</option>
                        <option value="range" ${activeFilters.alcMode === 'range' ? 'selected' : ''}>Plage (Min-Max)</option>
                        <option value="exact" ${activeFilters.alcMode === 'exact' ? 'selected' : ''}>Exact</option>
                    </select>
                </div>
                <div id="alc-inputs"></div>
            </div>

            <!-- Advanced Volume -->
            <div class="form-group" style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                <label class="form-label">Volume (ml)</label>
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <select id="vol-mode" name="volMode" class="form-select">
                        <option value="any" ${!activeFilters.volMode || activeFilters.volMode === 'any' ? 'selected' : ''}>Peu importe</option>
                        <option value="range" ${activeFilters.volMode === 'range' ? 'selected' : ''}>Plage</option>
                        <option value="exact" ${activeFilters.volMode === 'exact' ? 'selected' : ''}>Exact</option>
                    </select>
                </div>
                <div id="vol-inputs"></div>
            </div>

            <div class="form-group" style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                 <label class="form-group" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" name="onlyCustom" ${activeFilters.onlyCustom ? 'checked' : ''} style="width:20px; height:20px;">
                    <span style="font-weight:bold; color:var(--accent-gold);">Mes Créations Uniquement</span>
                </label>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="button" id="btn-reset-filters" class="form-input" style="flex:1; color:#aaa;">Réinitialiser</button>
                <button type="submit" class="btn-primary" style="flex:2;">Appliquer</button>
            </div>
        </form>
    `;

    // Dynamic Alcohol Input logic
    const alcContainer = wrapper.querySelector('#alc-inputs');
    const alcModeSelect = wrapper.querySelector('#alc-mode');

    const renderAlcInputs = (mode) => {
        if (mode === 'max') {
            alcContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="range" name="alcMax" class="form-input" min="0" max="15" step="0.5" value="${activeFilters.alcMax || 15}" 
                        oninput="document.getElementById('alc-display-max').innerText = this.value">
                    <span style="min-width:40px;"><span id="alc-display-max">${activeFilters.alcMax || 15}</span>%</span>
                </div>
            `;
        } else if (mode === 'range') {
            alcContainer.innerHTML = `
                <div style="display:flex; gap:5px;">
                    <input type="number" name="alcMin" class="form-input" placeholder="Min" step="0.1" value="${activeFilters.alcMin || ''}">
                    <span style="align-self:center;">à</span>
                    <input type="number" name="alcMax" class="form-input" placeholder="Max" step="0.1" value="${activeFilters.alcMax || ''}">
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
            volContainer.innerHTML = '<div style="color:#aaa; font-style:italic;">Tous les volumes</div>';
        } else if (mode === 'range') {
            volContainer.innerHTML = `
                 <div style="display:flex; gap:5px;">
                    <input type="number" name="volMin" class="form-input" placeholder="Min (ml)" step="10" value="${activeFilters.volMin || ''}">
                    <span style="align-self:center;">à</span>
                    <input type="number" name="volMax" class="form-input" placeholder="Max (ml)" step="10" value="${activeFilters.volMax || ''}">
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

    wrapper.querySelector('#btn-reset-filters').onclick = () => {
        onApply({});
        closeModal();
    };

    wrapper.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        // Collect Rarity Checkboxes manually
        const rarity = [];
        wrapper.querySelectorAll('.cb-rarity:checked').forEach(cb => rarity.push(cb.value));

        const filters = Object.fromEntries(formData.entries());
        filters.onlyFavorites = formData.get('onlyFavorites') === 'on';
        filters.ignoreFavorites = formData.get('ignoreFavorites') === 'on';
        filters.onlyCustom = formData.get('onlyCustom') === 'on';
        filters.barrel_aged = formData.get('barrel_aged') === 'on';
        filters.rarity = rarity;

        onApply(filters);
        closeModal();
    };

    openModal(wrapper);
}

export function renderBeerDetail(beer, onSave) {
    const existingData = Storage.getBeerRating(beer.id) || {};
    const template = Storage.getRatingTemplate();

    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';

    let imgPath = beer.image;
    if (!imgPath) imgPath = 'images/beer/FUT.jpg';

    // Build Dynamic Form
    let formFields = template.map(field => {
        const value = existingData[field.id] !== undefined ? existingData[field.id] : '';

        if (field.type === 'number') {
            return `
                <div class="form-group">
                    <label class="form-label">${field.label}</label>
                    <input type="number" class="form-input" name="${field.id}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}" placeholder="Note... (0-20)">
                </div>`;
        } else if (field.type === 'textarea') {
            return `
                <div class="form-group">
                    <label class="form-label">${field.label}</label>
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
                        <span>${field.label}</span>
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
                        <label class="form-label" style="margin:0;">${field.label}</label>
                </div>`;
        }
        return '';
    }).join('');

    // --- Consumption Section ---
    const consumptionWrapper = document.createElement('div');
    consumptionWrapper.style.cssText = 'background:var(--bg-card); padding:15px; border-radius:12px; margin-bottom:20px; text-align:center;';

    // Default Volume logic
    let defaultVol = beer.volume || '33cl';
    // Clean string for display
    defaultVol = defaultVol.replace('.', ',');

    consumptionWrapper.innerHTML = `
                <h3 style="margin-bottom:10px; font-size:1rem;">Consommation</h3>
                <div style="font-size:2rem; font-weight:bold; color:var(--accent-gold); margin-bottom:10px;">
                    <span id="consumption-count">${existingData.count || 0}</span> <span style="font-size:1rem; color:#666;">fois</span>
                </div>

                <div class="form-group">
                    <label class="form-label">Volume bu</label>
                    <select id="consumption-volume" class="form-select" style="text-align:center;">
                        <option value="${defaultVol}" selected>${defaultVol} (Défaut)</option>
                        <option value="25cl">25cl</option>
                        <option value="33cl">33cl</option>
                        <option value="50cl">50cl (Pinte)</option>
                        <option value="1L">1L</option>
                        <option value="1.5L">1.5L</option>
                        <option value="2L">2L</option>
                    </select>
                </div>

                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="btn-drink" class="btn-primary" style="margin:0; background:var(--success);">+ Boire</button>
                    <button id="btn-undrink" class="btn-primary" style="margin:0; background:var(--bg-card); border:1px solid #444; color:#aaa; width:auto;">- Annuler</button>
                </div>
                <p style="font-size:0.75rem; color:#666; margin-top:10px;">Ajoute une consommation à l'historique.</p>
                `;

    // --- Custom Beer Actions ---
    let customActions = '';
    if (beer.id.startsWith('CUSTOM_')) {
        customActions = `
            <div style="margin-top:20px; border-top:1px solid #333; padding-top:20px; display:flex; gap:10px;">
                <button id="btn-edit-beer" class="form-input" style="flex:1;">✏️ Modifier</button>
                <button id="btn-delete-beer" class="form-input" style="flex:1; color:var(--danger); border-color:var(--danger);">🗑️ Supprimer</button>
            </div>
        `;
    }

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
                    badge.className = `rarity-badge rarity-${beer.rarity} anim-${beer.rarity}`;
                    badge.innerText = beer.rarity.replace('_', ' ');
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
                seasonBadge.innerHTML = '🍂 Saisonnière';
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
                    <img src="${displayImage}" style="height: 150px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));" 
                         ${beer.removeBackground ? 'onload="removeImageBackground(this)"' : ''}
                         onerror="if(this.src.includes('${fallbackImage}')) return; this.src='${fallbackImage}';">
                        <h2 style="margin-top: 10px; color: var(--accent-gold);">${beer.title}</h2>
                        <p style="color: #888;">${beer.brewery} - ${beer.type}</p>
                        <div style="display: flex; justify-content: center; gap: 15px; margin-top: 5px; font-size: 0.8rem; color: #aaa;">
                            <span>${beer.alcohol || '?'}</span>
                            <span>${beer.volume || '?'}</span>
                        </div>
                        <div id="rarity-badge-container" style="margin-top:10px; display:flex; justify-content:center; gap:5px; flex-wrap:wrap;">
                            <!-- Auto-injected by JS logic below -->
                        </div>
                </div>

                <details style="background:var(--bg-card); padding:10px; border-radius:12px; margin-bottom:15px;">
                    <summary style="font-weight:bold; cursor:pointer; list-style:none;">📊 Infos détaillées</summary>
                    <div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
                        ${beer.production_volume ? `<div><span style="color:#888;">Production:</span> ${beer.production_volume}</div>` : ''}
                        ${beer.distribution ? `<div><span style="color:#888;">Distribution:</span> ${beer.distribution}</div>` : ''}
                        ${beer.barrel_aged !== undefined ? `<div><span style="color:#888;">Barrel Aged:</span> ${beer.barrel_aged ? '✅ Oui' : '❌ Non'}</div>` : ''}
                        ${beer.community_rating ? `<div><span style="color:#888;">Note Communauté:</span> ⭐ ${beer.community_rating}/5</div>` : ''}
                        ${beer.ingredients ? `<div style="grid-column:span 2;"><span style="color:#888;">Ingrédients:</span> ${beer.ingredients}</div>` : ''}
                    </div>
                </details>

                ${consumptionWrapper.outerHTML}

                <details style="background:var(--bg-card); padding:10px; border-radius:12px; margin-bottom:20px;">
                    <summary style="font-weight:bold; cursor:pointer; list-style:none;">📝 Note de dégustation ${existingData.score ? '✅' : ''}</summary>
                    <form id="rating-form" style="margin-top:15px;">
                        ${formFields}
                        <button type="submit" class="btn-primary">Enregistrer la note</button>
                    </form>
                </details>

                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <button id="btn-share-beer" class="form-input" style="flex:1;">📤 Lien</button>
                    <button id="btn-share-insta" class="form-input" style="flex:1;">📸 Story Rapide</button>
                </div>
                <button id="btn-share-advanced" class="btn-primary" style="margin-top:0; border:1px solid var(--accent-gold); color:var(--accent-gold); background:transparent;">
                    ✨ Story Personnalisée
                </button>

                ${customActions}
                `;

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
        showToast("Préparation du partage...");
        await Storage.shareBeer(beer);
    };

    // Share Image Handler (Insta-Beer)
    wrapper.querySelector('#btn-share-insta').onclick = async () => {
        // Default behavior: uses existing score/comment
        showToast("Génération image...");
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
        btn.innerHTML = '⏳ Création...';

        try {
            // Get user data
            const existingData = Storage.getBeerRating(beer.id) || {};
            const userRating = existingData.score || 0;
            const userComment = existingData.comment || "";

            const blob = await Share.generateBeerCard(beer, userRating, userComment);
            await Share.shareImage(blob, `Check-in: ${beer.title}`);
            btn.innerHTML = originalText;
        } catch (err) {
            console.error(err);
            btn.innerHTML = originalText;
            showToast(err.message === 'Web Share API not supported' ? 'Partage fichier non supporté' : 'Erreur de partage');
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
            showToast("Bière sauvegardée dans votre Dex !");

            // 2. Mock the switch
            const oldId = beer.id;
            beer.id = newBeer.id;
            beer.fromAPI = false;

            // 3. Since we changed ID, existingData (rating) is theoretically empty (which is true for new API beer)
            // But we are about to add consumption.

            // 4. IMPORTANT: We must signal the app to reload the list because we added a beer
            // We can dispatch event, but current view might not update instantly if we don't force it.
            window.dispatchEvent(new CustomEvent('beerdex-action'));
        }

        const wasLocked = !existingData.count || existingData.count === 0;

        const vol = wrapper.querySelector('#consumption-volume').value;
        const newData = Storage.addConsumption(beer.id, vol);

        // Update local object reference for immediate UI updates relying on it
        existingData.count = newData.count;
        wrapper.querySelector('#consumption-count').innerText = newData.count;

        showToast(`🍻 Glou Glou ! (+${vol})`);

        // Reveal Sequence if FIRST TIME
        if (wasLocked && beer.rarity && beer.rarity !== 'base') {
            // Create Overlay
            const overlay = document.createElement('div');
            overlay.className = 'reveal-overlay';

            // Create Canvas for Particles
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;';

            // Get Rarity Color
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

            overlay.innerHTML = `
                <div class="reveal-card" style="border: 4px solid ${particleColor}; box-shadow: 0 0 50px ${particleColor};">
                    <span style="font-size: 4rem; animation: rarity-shake 0.1s infinite;">🍺</span>
                </div>
            `;
            overlay.appendChild(canvas);
            document.body.appendChild(overlay);

            // Particle System
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const particles = [];
            const particleCount = beer.rarity === 'ultra_legendaire' ? 300 : (beer.rarity === 'legendaire' ? 200 : 100);

            class Particle {
                constructor() {
                    this.x = canvas.width / 2;
                    this.y = canvas.height / 2;
                    this.size = Math.random() * 8 + 2;
                    this.speedX = (Math.random() - 0.5) * 20;
                    this.speedY = (Math.random() - 0.5) * 20;
                    this.color = particleColor;
                    this.alpha = 1;
                }
                update() {
                    this.x += this.speedX;
                    this.y += this.speedY;
                    this.alpha -= 0.015;
                    this.size *= 0.98;
                }
                draw() {
                    ctx.globalAlpha = this.alpha;
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            function spawnParticles() {
                for (let i = 0; i < particleCount; i++) {
                    particles.push(new Particle());
                }
            }

            function animateParticles() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                for (let i = particles.length - 1; i >= 0; i--) {
                    particles[i].update();
                    particles[i].draw();
                    if (particles[i].alpha <= 0) particles.splice(i, 1);
                }
                if (particles.length > 0) requestAnimationFrame(animateParticles);
            }

            // Trigger explosion after delay (sync with card animation)
            setTimeout(() => {
                spawnParticles();
                animateParticles();
            }, 1500); // Explode mid-shake

            // Wait for full animation then reveal
            setTimeout(() => {
                overlay.remove();

                // Show Rarity Badge
                initRarityLogic(true); // Force reveal update

                // Animate Badge
                const badge = wrapper.querySelector(`.rarity-${beer.rarity}`);
                if (badge) {
                    badge.animate([
                        { transform: 'scale(0) rotate(-180deg)', filter: 'brightness(3)' },
                        { transform: 'scale(2.5) rotate(10deg)', filter: 'brightness(2)' },
                        { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' }
                    ], { duration: 1000, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
                }

                // Play Sound (placeholder)
                // const audio = new Audio('sounds/reveal.mp3'); audio.play();

            }, 3000); // Sync with CSS animation length
        } else {
            // Normal update just in case
            initRarityLogic();
        }

        const Achievements = await import('./achievements.js');
        window.dispatchEvent(new CustomEvent('beerdex-action'));
    };

    wrapper.querySelector('#btn-undrink').onclick = () => {
        const newData = Storage.removeConsumption(beer.id);
        if (newData) {
            existingData.count = newData.count; // Update ref
            wrapper.querySelector('#consumption-count').innerText = newData.count;
            showToast("Consommation annulée.");

            // Re-lock if count back to 0
            if (newData.count === 0) {
                initRarityLogic(); // Will see count=0 and hide it
            }
        }
    };

    // Binding for Custom Actions
    if (customActions) {
        wrapper.querySelector('#btn-delete-beer').onclick = () => {
            if (confirm("Supprimer définitivement cette bière ?")) {
                Storage.deleteCustomBeer(beer.id);
                closeModal();
                showToast("Bière supprimée.");
                setTimeout(() => location.reload(), 500);
            }
        };

        wrapper.querySelector('#btn-edit-beer').onclick = () => {
            closeModal();
            renderAddBeerForm((updatedBeer) => {
                showToast("Bière modifiée !");
                setTimeout(() => location.reload(), 500);
            }, beer);
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
            alert("Veuillez mettre une note !");
            return;
        }

        onSave(data);

        // If API beer, we must save likely (auto-save on rate?)
        // Similar logic to drink. If user rates, we save the beer.
        if (beer.fromAPI) {
            const newBeer = { ...beer };
            newBeer.id = 'CUSTOM_' + Date.now();
            delete newBeer.fromAPI;
            Storage.saveCustomBeer(newBeer);
            beer.id = newBeer.id; // Switch ref

            // Now save the rating with new ID
            Storage.saveBeerRating(newBeer.id, data);

            window.dispatchEvent(new CustomEvent('beerdex-action'));
            showToast("Bière & Note sauvegardées !");
        } else {
            showToast("Note sauvegardée !");
        }

        wrapper.querySelector('details').open = false;
        wrapper.querySelector('summary').innerHTML = "📝 Note de dégustation ✅";
    };

    openModal(wrapper);
}

export function renderAddBeerForm(onSave, editModeBeer = null, prefillData = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';

    const title = editModeBeer ? "Modifier la bière" : "Ajouter une bière";
    const btnText = editModeBeer ? "Sauvegarder les modifications" : "Ajouter";

    // Fill values: Priority -> editModeBeer -> prefillData -> ''
    const v = (key) => {
        if (editModeBeer && editModeBeer[key]) return editModeBeer[key];
        if (prefillData && prefillData[key]) return prefillData[key];
        return '';
    };

    wrapper.innerHTML = `
                <h2 style="margin-bottom: 5px;">${title}</h2>
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                     <button type="button" id="btn-autofill-scan" class="form-input" style="font-size:0.8rem; padding: 5px; flex:1; display:flex; align-items:center; justify-content:center; gap:5px; background:rgba(255,255,255,0.1);">
                        📷 Scanner & Remplir
                    </button>
                    <button type="button" id="btn-autofill-name" class="form-input" style="font-size:0.8rem; padding: 5px; flex:1; display:flex; align-items:center; justify-content:center; gap:5px; background:rgba(255,255,255,0.1);">
                        🔍 Remplir via Nom
                    </button>
                    <!-- "Check DB" button could be here too but let's stick to request -->
                </div>
                <form id="add-beer-form">
                    <div class="form-group">
                        <label class="form-label">Nom de la bière</label>
                        <input type="text" class="form-input" name="title" value="${v('title')}" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Brasserie</label>
                        <input type="text" class="form-input" name="brewery" value="${v('brewery')}" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Province / Région</label>
                        <select class="form-select" name="province">
                            <option value="">-- Non spécifié --</option>
                            <optgroup label="🇧🇪 Belgique - Flandre">
                                <option value="ANT" ${v('province') === 'ANT' ? 'selected' : ''}>Anvers (ANT)</option>
                                <option value="OVL" ${v('province') === 'OVL' ? 'selected' : ''}>Flandre Orientale (OVL)</option>
                                <option value="WVL" ${v('province') === 'WVL' ? 'selected' : ''}>Flandre Occidentale (WVL)</option>
                                <option value="VBR" ${v('province') === 'VBR' ? 'selected' : ''}>Brabant Flamand (VBR)</option>
                                <option value="LIM" ${v('province') === 'LIM' ? 'selected' : ''}>Limbourg (LIM)</option>
                            </optgroup>
                            <optgroup label="🇧🇪 Belgique - Wallonie">
                                <option value="HAI" ${v('province') === 'HAI' ? 'selected' : ''}>Hainaut (HAI)</option>
                                <option value="NAM" ${v('province') === 'NAM' ? 'selected' : ''}>Namur (NAM)</option>
                                <option value="LIE" ${v('province') === 'LIE' ? 'selected' : ''}>Liège (LIE)</option>
                                <option value="LUX" ${v('province') === 'LUX' ? 'selected' : ''}>Luxembourg (LUX)</option>
                                <option value="WBR" ${v('province') === 'WBR' ? 'selected' : ''}>Brabant Wallon (WBR)</option>
                            </optgroup>
                            <optgroup label="🇧🇪 Belgique - Bruxelles">
                                <option value="BRU" ${v('province') === 'BRU' ? 'selected' : ''}>Bruxelles (BRU)</option>
                            </optgroup>
                            <optgroup label="🌍 Autres">
                                <option value="FR" ${v('province') === 'FR' ? 'selected' : ''}>France (FR)</option>
                                <option value="NL" ${v('province') === 'NL' ? 'selected' : ''}>Pays-Bas (NL)</option>
                                <option value="DE" ${v('province') === 'DE' ? 'selected' : ''}>Allemagne (DE)</option>
                                <option value="US" ${v('province') === 'US' ? 'selected' : ''}>États-Unis (US)</option>
                                <option value="OTHER" ${v('province') === 'OTHER' ? 'selected' : ''}>Autre</option>
                            </optgroup>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Type (Blonde, Brune...)</label>
                        <input type="text" class="form-input" name="type" value="${v('type')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Alcool (ex: 5°)</label>
                        <input type="text" class="form-input" name="alcohol" value="${v('alcohol')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Volume (ex: 33cl)</label>
                        <input type="text" class="form-input" name="volume" value="${v('volume')}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Distribution</label>
                        <select class="form-select" name="distribution">
                            <option value="1" ${v('distribution') === 'Partout' ? 'selected' : ''}>Partout (1 pt)</option>
                            <option value="2" ${v('distribution') === 'Supermarché' ? 'selected' : ''}>Supermarché (2 pts)</option>
                            <option value="3" ${v('distribution') === 'Cavistes' ? 'selected' : ''}>Cavistes (3 pts)</option>
                            <option value="4" ${v('distribution') === 'Cavistes spécialisés' ? 'selected' : ''}>Cavistes spécialisés (4 pts)</option>
                            <option value="5" ${v('distribution') === 'À la brasserie' ? 'selected' : ''}>À la brasserie uniquement (5 pts)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Disponibilité</label>
                        <select class="form-select" name="availability">
                            <option value="1">Permanente (1 pt)</option>
                            <option value="2">Saisonnière (2 pts)</option>
                            <option value="3">Édition limitée (3 pts)</option>
                            <option value="4">Batch unique (4 pts)</option>
                            <option value="5">Unique à vie (5 pts)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Ingrédients / Notes</label>
                        <input type="text" class="form-input" name="ingredients" value="${v('ingredients') || ''}" placeholder="ex: Barrel Aged, Houblons Citra...">
                    </div>

                    <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <input type="checkbox" name="barrel_aged" id="barrel_aged" ${v('barrel_aged') ? 'checked' : ''} style="width:20px; height:20px;">
                        <label for="barrel_aged" style="font-size:0.9rem; margin:0;">Vieillie en fût (Barrel Aged)</label>
                    </div>

                        <label class="form-label">Rareté</label>
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <select class="form-select" name="rarity" style="flex:1;">
                                <option value="" selected>-- Auto --</option>
                                <option value="base" ${v('rarity') === 'base' ? 'selected' : ''}>Base (Gris)</option>
                                <option value="commun" ${v('rarity') === 'commun' ? 'selected' : ''}>Commun (Vert)</option>
                                <option value="rare" ${v('rarity') === 'rare' ? 'selected' : ''}>Rare (Bleu)</option>
                                <option value="super_rare" ${v('rarity') === 'super_rare' ? 'selected' : ''}>Super Rare (Cyan)</option>
                                <option value="epique" ${v('rarity') === 'epique' ? 'selected' : ''}>Épique (Violet)</option>
                                <option value="mythique" ${v('rarity') === 'mythique' ? 'selected' : ''}>Mythique (Rouge)</option>
                                <option value="legendaire" ${v('rarity') === 'legendaire' ? 'selected' : ''}>Légendaire (Orange)</option>
                                <option value="ultra_legendaire" ${v('rarity') === 'ultra_legendaire' ? 'selected' : ''}>Ultra Légendaire (Gradient)</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" name="isSeasonal" id="isSeasonal" ${v('isSeasonal') ? 'checked' : ''} style="width:20px; height:20px;">
                            <label for="isSeasonal" style="font-size:0.9rem; margin:0;">Saisonnière / Évènementielle</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Image</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="file" id="image-file-input" accept="image/*" style="display: none;">
                                <button type="button" class="form-input" style="width: auto;" onclick="document.getElementById('image-file-input').click()">Choisir une photo</button>
                                <span id="file-name" style="font-size: 0.8rem; color: #888;">${editModeBeer ? 'Image actuelle conservée' : 'Par défaut: Fût'}</span>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary">${btnText}</button>
                </form>
                `;

    let imageBase64 = (editModeBeer ? editModeBeer.image : '') || (prefillData ? prefillData.image : '');

    // File Reader Logic with Resize
    const fileInput = wrapper.querySelector('#image-file-input');
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            wrapper.querySelector('#file-name').innerText = "Traitement...";
            resizeImage(file, 250, 250, (resizedBase64) => {
                imageBase64 = resizedBase64;
                wrapper.querySelector('#file-name').innerText = file.name + " (Redimensionné)";
            });
        }
    };

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

                    showToast("Analyse...");
                    const product = await fetchProductByBarcode(barcode);
                    if (product) {
                        renderAddBeerForm(onSave, editModeBeer, product);
                        showToast("Données trouvées !");
                    } else {
                        showToast("Produit inconnu.");
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
                    alert("Entrez au moins 3 lettres du nom dans le champ Titre.");
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
                        showToast("Meilleure correspondance appliquée.");
                    } else {
                        showToast("Rien trouvé.");
                        btnName.innerHTML = originalText;
                        btnName.disabled = false;
                    }
                } catch (e) {
                    alert(e.message);
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
        const distLabels = { '1': 'Partout', '2': 'Supermarché', '3': 'Cavistes', '4': 'Cavistes spécialisés', '5': 'À la brasserie' };

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
            type: formData.get('type') || 'Inconnu',
            alcohol: formData.get('alcohol'),
            volume: formData.get('volume'),
            distribution: distLabels[distributionPts] || 'Inconnu',
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

        onSave(newBeer);
    };

    openModal(wrapper);
}

export function renderScannerModal(onScan) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.innerHTML = `
        <h2 style="margin-bottom: 20px;">Scanner un Code-Barres</h2>
        <div style="position:relative; margin-bottom: 15px;">
            <div id="reader" style="width: 100%; min-height: 250px; background: #000; border-radius: 8px; overflow: hidden;"></div>
            <div id="scanner-feedback" style="position:absolute; bottom:10px; left:0; width:100%; text-align:center; color:white; font-weight:bold; text-shadow:0 1px 3px rgba(0,0,0,0.8); pointer-events:none; z-index:10; font-size:1.2rem; transition:opacity 0.3s;"></div>
        </div>
        <p style="text-align: center; color: #888; font-size: 0.9rem;">
            Placez le code-barres de la bière devant la caméra.
        </p>
        <button id="btn-close-scanner" class="btn-primary" style="background:#333; margin-top:15px;">Fermer</button>
    `;

    openModal(wrapper);

    // Give time for DOM to paint
    setTimeout(() => {
        Scanner.startScanner("reader", (decodedText, decodedResult) => {
            // Success
            // Stop scanner is handled inside startScanner callback wrapper usually or here
            onScan(decodedText);
        }, (errorMessage) => {
            // console.log(errorMessage);
        });
    }, 100);

    wrapper.querySelector('#btn-close-scanner').onclick = async () => {
        await Scanner.stopScanner();
        closeModal();
    };

    // Hook into global modal close to stop scanner if user clicks outside
    const originalClose = modalContainer.onclick;
    modalContainer.onclick = async (e) => {
        if (e.target === modalContainer) {
            await Scanner.stopScanner();
            closeModal();
        }
    };
}

export function setScannerFeedback(message, isError = false) {
    const el = document.getElementById('scanner-feedback');
    if (el) {
        el.innerHTML = message;
        el.style.color = isError ? '#ff4444' : 'white';
        // Add shake animation if error?
        if (isError) {
            el.style.textShadow = '0 0 5px red';
        } else {
            el.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
        }
    }
}

export function renderStats(allBeers, userData, container) {
    const totalBeers = allBeers.length;
    // Fix: Filter keys where count > 0
    const drunkCount = Object.values(userData).filter(u => (u.count || 0) > 0).length;
    const percentage = Math.round((drunkCount / totalBeers) * 100) || 0;

    const totalDrunkCount = Object.values(userData).reduce((acc, curr) => acc + (curr.count || 0), 0);

    container.innerHTML = `
                <div class="text-center p-20">
                    <!-- SVG Donut Chart -->
                    <div style="width:160px; height:160px; margin:0 auto; position:relative;">
                        <svg viewBox="0 0 36 36" class="circular-chart">
                            <path class="circle-bg"
                                d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path class="circle"
                                stroke-dasharray="${percentage}, 100"
                                d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                        </svg>
                        <div style="position:absolute; top:42%; left:50%; transform:translate(-50%, -50%); font-size:1.8rem; font-weight:bold; color:var(--accent-gold);">
                            ${percentage}%
                        </div>
                    </div>
                    <h2 class="mt-20">Statistiques</h2>
                    <p style="color: var(--text-secondary); margin-top: 10px;">
                        Vous avez goûté <strong style="color: #fff;">${drunkCount}</strong> bières uniques sur <strong style="color: #fff;">${totalBeers}</strong>.
                    </p>
                     <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        Total consommé : <strong style="color: var(--accent-gold);">${totalDrunkCount}</strong> verres 🍺
                    </p>

                    ${renderAdvancedStats(allBeers, userData)}

                    <div class="stat-card mt-20 text-center">
                        <div id="beer-map-container" style="min-height:200px;">
                            <span class="spinner"></span> Chargement de la carte...
                        </div>
                    </div>

                    <div id="card-achievements" class="stat-card mt-20 text-center">
                        <h3 style="margin-bottom:15px;">Succès 🏆</h3>
                        ${renderAchievementsList()}
                    </div>

                    <div class="stat-card mt-20 text-center">
                        <h3 style="margin-bottom:10px;">Beer Match ⚔️</h3>
                        <p style="font-size:0.8rem; color:#888; margin-bottom:15px;">Compare tes goûts avec un ami !</p>
                        <button type="button" id="btn-match" class="btn-primary" style="background:#222; border:1px solid var(--accent-gold); color:var(--accent-gold);">
                            ⚔️ Lancer un Duel
                        </button>
                    </div>

                    <div style="background: linear-gradient(135deg, #111, #222); padding: 15px; border-radius: 12px; border: 1px solid var(--accent-gold); margin-bottom: 20px; text-align: center; margin-top: 20px;">
                        <div style="font-size: 2rem; margin-bottom: 5px;">🎬</div>
                        <h3 style="margin: 0 0 10px 0; color: var(--accent-gold); font-family: 'Russo One', sans-serif;">Beerdex Wrapped</h3>
                        <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 15px;">Revivez vos moments forts de l'année !</p>
                        <button id="btn-open-wrapped" class="btn-primary" style="background: var(--accent-gold); color: black; font-weight: bold; width: 100%;">
                            ▶️ Lancer la Story
                        </button>
                    </div>
                </div>
                `;

    // Match
    const btnMatch = container.querySelector('#btn-match');
    if (btnMatch) btnMatch.onclick = () => renderMatchModal(allBeers);

    // Wrapped
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
}

export function renderSettings(allBeers, userData, container, isDiscovery = false, discoveryCallback = null) {
    container.innerHTML = `
        <div class="text-center p-20">
            <h2 class="mb-20" style="font-family:'Russo One'; color:var(--accent-gold);">Paramètres & Données</h2>

            <!-- 1. Interface -->
            <div class="stat-card">
                <h4 style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; text-align:left;">🎨 Interface</h4>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div style="text-align:left;">
                        <strong style="color:var(--text-primary); display:block; margin-bottom:4px;">Mode Découverte</strong>
                        <span style="font-size:0.8rem; color:#888;">Masquer les bières non trouvées</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="toggle-discovery" ${isDiscovery ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                     <button type="button" id="btn-template" class="btn-primary text-white" style="background:#222; border:1px solid #444; width:100%; margin:0;">
                        ⚙️ Configurer Notation
                    </button>
                </div>
                
                <div style="margin-top:15px; border-top:1px solid #333; padding-top:15px;">
                     <h5 style="color:#aaa; font-size:0.8rem; margin-bottom:10px; text-align:left;">Modèles de Notation</h5>
                     <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                        <button id="btn-preset-default" class="form-input" style="font-size:0.8rem; padding:8px; ${Storage.getPreference('activePreset') === 'default' ? 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 5px rgba(255,192,0,0.3);' : ''}">Standard</button>
                        <button id="btn-preset-tristan" class="form-input" style="font-size:0.8rem; padding:8px; ${Storage.getPreference('activePreset') === 'tristan' ? 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 5px rgba(255,192,0,0.3);' : ''}">Tristan</button>
                        <button id="btn-preset-noah" class="form-input" style="font-size:0.8rem; padding:8px; grid-column:span 2; ${Storage.getPreference('activePreset') === 'noah' ? 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 5px rgba(255,192,0,0.3);' : ''}">Noah</button>
                     </div>
                </div>
            </div>

            <!-- 2. Rareté (New) -->
            <div class="stat-card mt-20">
                <h4 style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; text-align:left;">💎 Rareté</h4>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div style="text-align:left;">
                        <strong style="color:var(--text-primary); display:block; margin-bottom:4px;">Révéler les Raretés</strong>
                        <span style="font-size:0.8rem; color:#888;">Voir la rareté même si la bière n'est pas bue (Spoil !)</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="check-reveal-rarity" ${Storage.getPreference('revealRarity', false) ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>

            <!-- 3. Données -->
            <div class="stat-card mt-20">
                <h4 style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; text-align:left;">💾 Données</h4>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                    <button id="btn-manage-export" class="btn-primary" style="background:var(--accent-gold); color:black; margin:0;">
                         ☁️ Sauvegarder
                    </button>
                    <button id="btn-manage-import" class="btn-primary" style="background:#222; border:1px solid var(--accent-gold); color:var(--accent-gold); margin:0;">
                         📥 Restaurer
                    </button>
                </div>
                <p style="font-size:0.75rem; color:#666; text-align:center;">
                    Gérez vos exports fichiers ou liens de partage.
                </p>
            </div>

            <!-- 3. System -->
            <div class="stat-card mt-20">
                <h4 style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; text-align:left;">🛠️ Système</h4>

                <button id="btn-check-update" class="btn-primary text-white" style="background:#222; border:1px solid #444; width:100%; margin-bottom:15px;">
                    🔄 Vérifier les Mises à jour
                </button>

                <button id="btn-restart-tuto" class="btn-primary text-white" style="background:#222; border:1px solid #444; width:100%; margin-bottom:15px;">
                    🎓 Refaire le Tutoriel
                </button>
                
                <details style="border-top:1px solid #333; padding-top:10px;">
                    <summary style="cursor:pointer; color:#888; font-size:0.8rem; text-align:left;">Zone de Danger</summary>
                    <div style="margin-top:15px;">
                        <h5 style="color:#aaa; font-size:0.75rem; margin-bottom:5px; text-align:left;">Réinitialisation Partielle</h5>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:15px;">
                            <button id="btn-reset-ratings" class="btn-primary" style="background:#331; color:#fa0; border:1px solid #540; font-size:0.7rem; padding:8px;">
                                Note Uniqt.
                            </button>
                            <button id="btn-reset-custom" class="btn-primary" style="background:#331; color:#fa0; border:1px solid #540; font-size:0.7rem; padding:8px;">
                                Bières Perso
                            </button>
                            <button id="btn-reset-history" class="btn-primary" style="background:#331; color:#fa0; border:1px solid #540; font-size:0.7rem; padding:8px;">
                                Historique
                            </button>
                             <button id="btn-reset-fav" class="btn-primary" style="background:#331; color:#fa0; border:1px solid #540; font-size:0.7rem; padding:8px;">
                                Favoris
                            </button>
                        </div>

                        <h5 style="color:red; font-size:0.75rem; margin-bottom:5px; text-align:left;">Réinitialisation Totale</h5>
                        <button id="btn-reset-app" class="btn-primary" style="background:rgba(255,0,0,0.1); color:red; border:1px solid red; width:100%;">
                            ☠️ RESET APPLICATION
                        </button>
                    </div>
                </details>
            </div>
           
            <div class="mt-40 text-center" style="margin-bottom: 60px;">
                <h3 style="color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:25px;">Crédits</h3>
                
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div>
                        <p style="color:var(--accent-gold); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Co-Fondateurs</p>
                        <p style="font-size:0.9rem; color:#eee;">Dorian Storms, Noah Bruijninckx, Tristan Storms & Maxance Veulemans</p>
                    </div>
                    
                    <div>
                        <p style="color:var(--accent-gold); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Design & Code</p>
                        <p style="font-size:0.9rem; color:#eee;">Noah Bruijninckx</p>
                    </div>
                </div>
                
                <div style="margin-top:30px; font-size:0.7rem; color:#444; border-top:1px solid #222; padding-top:15px; width:50%; margin-left:auto; margin-right:auto;">
                    Beerdex v2.0 &copy; 2026
                </div>
            </div>
        </div>
    `;

    // --- Handlers ---

    // Config
    container.querySelector('#btn-template').onclick = () => renderTemplateEditor();

    container.querySelector('#btn-preset-default').onclick = () => {
        if (confirm("Appliquer le modèle Standard (Note + Commentaire) ?")) {
            Storage.resetRatingTemplate();
            Storage.savePreference('activePreset', 'default');
            showToast("Modèle Standard appliqué !");
            container.querySelector('#btn-preset-default').style = 'border:1px solid var(--accent-gold); color:var(--accent-gold); box-shadow:0 0 5px rgba(255,192,0,0.3); padding:8px; font-size:0.8rem;';
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback); // Re-render to update UI state cleanly
        }
    };

    container.querySelector('#btn-preset-tristan').onclick = () => {
        if (confirm("Appliquer le modèle 'Tristan' ?\nCela changera les champs de notation.")) {
            applyTristanPreset();
            showToast("Modèle Tristan appliqué !");
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        }
    };

    container.querySelector('#btn-preset-noah').onclick = () => {
        if (confirm("Appliquer le modèle 'Noah' ?\nCela changera les champs de notation.")) {
            applyNoahPreset();
            showToast("Modèle Noah appliqué !");
            renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback);
        }
    };

    if (discoveryCallback) {
        container.querySelector('#toggle-discovery').onchange = (e) => {
            discoveryCallback(e.target.checked);
        };
    }

    // --- Bindings ---

    // Reveal Rarity
    const checkRarity = container.querySelector('#check-reveal-rarity');
    if (checkRarity) {
        checkRarity.onchange = (e) => {
            Storage.savePreference('revealRarity', e.target.checked);
            showToast("Paramètre enregistré !");
            // Reload to update cards immediately? Or just toast.
            // Cards won't update until re-render. User likely visits settings then goes back.
        };
    }

    container.querySelector('#btn-manage-import').onclick = () => renderImportModal();
    container.querySelector('#btn-manage-export').onclick = () => renderExportModal();

    // Bind new Reset Buttons (Zone de Danger)
    container.querySelector('#btn-reset-app').onclick = () => renderResetModal();
    container.querySelector('#btn-reset-ratings').onclick = () => { if (confirm("Supprimer uniquement vos notes ?\n(Vos bières custom restent)")) { Storage.clearRatings(); showToast("Notes supprimées"); renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback); } };
    container.querySelector('#btn-reset-custom').onclick = () => { if (confirm("Supprimer vos bières personnalisées ?")) { Storage.clearCustomBeers(); showToast("Bières perso supprimées"); renderSettings(allBeers, userData, container, isDiscovery, discoveryCallback); } };
    container.querySelector('#btn-reset-history').onclick = () => { if (confirm("Supprimer l'historique de dégustation ?")) { Storage.clearHistory(); showToast("Historique supprimé"); } };
    container.querySelector('#btn-reset-fav').onclick = () => { if (confirm("Supprimer vos favoris ?")) { Storage.clearFavorites(); showToast("Favoris supprimés"); } };

    // System
    container.querySelector('#btn-check-update').onclick = async () => {
        if ('serviceWorker' in navigator) {
            showToast("Forçage de la mise à jour...", "info");

            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map(key => caches.delete(key)));
                showToast("Caches vidés. Redémarrage...", "success");
                setTimeout(() => {
                    window.location.reload(true);
                }, 1500);

            } catch (e) {
                console.error("Update failed", e);
                showToast("Erreur mise à jour: " + e.message);
            }
        } else {
            showToast("Service Worker non supporté.");
        }
    };

    container.querySelector('#btn-restart-tuto').onclick = () => {
        // Go to Home first
        const homeBtn = document.querySelector('.nav-item[data-view="home"]');
        if (homeBtn) homeBtn.click();

        // Wait for view transition
        setTimeout(() => {
            TutorialSystem.start();
        }, 500);
    };

    // Granular Resets
    const confirmReset = (msg, action) => {
        if (confirm(msg)) {
            action();
            showToast("Données effacées.");
            setTimeout(() => location.reload(), 1000);
        }
    };

    const btnResetRatings = container.querySelector('#btn-reset-ratings');
    if (btnResetRatings) {
        btnResetRatings.onclick = () => confirmReset(
            "⚠️ Effacer UNIQUEMENT toutes les notes et commentaires ?",
            Storage.resetRatingsOnly
        );
    }

    const btnResetCustom = container.querySelector('#btn-reset-custom');
    if (btnResetCustom) {
        btnResetCustom.onclick = () => confirmReset(
            "⚠️ Effacer UNIQUEMENT toutes vos bières personnalisées ?",
            Storage.resetCustomBeersOnly
        );
    }

    const btnResetHistory = container.querySelector('#btn-reset-history');
    if (btnResetHistory) {
        btnResetHistory.onclick = () => confirmReset(
            "⚠️ Effacer l'historique de consommation ? (Les notes seront conservées)",
            Storage.resetConsumptionHistoryOnly
        );
    }

    const btnResetFav = container.querySelector('#btn-reset-fav');
    if (btnResetFav) {
        btnResetFav.onclick = () => confirmReset(
            "⚠️ Retirer tous les favoris ?",
            Storage.resetFavoritesOnly
        );
    }

    container.querySelector('#btn-reset-app').onclick = () => {
        if (confirm("⚠️ Êtes-vous certain de vouloir TOUT effacer ?\nCette action est irréversible !\n\nToutes vos notes, bières perso et préférences seront perdues.")) {
            if (confirm("Dernière chance : Confirmez-vous la suppression totale ?")) {
                Storage.resetAllData();
                location.reload();
            }
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
            btn.onclick = (e) => {
                if (confirm("Supprimer ce champ ?")) {
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
            btn.onclick = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const field = template[idx];

                // Simple Prompt-based edit for now to avoid nested complex modals
                const newLabel = prompt("Nouveau nom :", field.label);
                if (newLabel !== null && newLabel.trim() !== "") {
                    field.label = newLabel.trim();
                    // Optional: Allow changing type? 
                    // Switching type might break existing data display if format changes drastically?
                    // Actually data is stored by ID. ID should theoretically stay same to link to old data.
                    // But if user repurposes "Amertume" (range) to "Amertume" (text), old value '7' becomes text '7'. 
                    // It's mostly fine.
                    // Let's stick to label edit or advanced edit?
                    // User asked "modifier/supprimer". Modification implies Label fix or Type fix.
                    const newType = prompt("Nouveau Type (range/checkbox/textarea/number) :", field.type);
                    if (['range', 'checkbox', 'textarea', 'number'].includes(newType)) {
                        field.type = newType;
                        // Reset defaults if needed
                        if (newType === 'range') { field.min = 0; field.max = 10; field.step = 1; }
                    }
                    refreshList();
                }
            };
        });
    };

    wrapper.innerHTML = `
        <h2>Configuration Notation</h2>
                <div id="field-list" style="margin: 20px 0;"></div>

                <div style="border-top:1px solid #333; padding-top:20px;">
                    <h3>Ajouter un champ</h3>
                    <div class="form-group">
                        <input type="text" id="new-label" class="form-input" placeholder="Nom (ex: Amertume)">
                    </div>
                    <div class="form-group">
                        <select id="new-type" class="form-select">
                            <option value="range">Curseur (Slider 0-10)</option>
                            <option value="checkbox">Case à cocher (Oui/Non)</option>
                            <option value="textarea">Texte long</option>
                        </select>
                    </div>
                    <button id="add-field" class="btn-primary" style="background:var(--bg-card); border:1px solid var(--accent-gold); color:var(--accent-gold);">+ Ajouter le champ</button>
                </div>

                <button id="save-template" class="btn-primary" style="margin-top:20px;">Enregistrer la configuration</button>
                <button id="reset-template" class="form-input" style="margin-top:10px; background:none; border:none; color:red;">Réinitialiser par défaut</button>
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
        showToast("Configuration sauvegardée !");
    };

    // Reset
    wrapper.querySelector('#reset-template').onclick = () => {
        if (confirm("Revenir aux champs par défaut ?")) {
            Storage.resetRatingTemplate();
            closeModal();
            showToast("Réinitialisé !");
        }
    };

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

function renderAdvancedStats(allBeers, userData) {
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

    const totalLiters = (totalVolumeMl / 1000).toFixed(1);
    const alcoholLiters = (totalAlcoholMl / 1000).toFixed(2);

    // Fun Comparisons logic (Volume)
    const comparisons = [
        { label: 'Pintes (50cl)', vol: 500, icon: '🍺' },
        { label: 'Packs de 6', vol: 1980, icon: '📦' },
        { label: 'Seaux (10L)', vol: 10000, icon: '🪣' },
        { label: 'Fûts (30L)', vol: 30000, icon: '🛢️' },
        { label: 'Douches (60L)', vol: 60000, icon: '🚿' },
        { label: 'Baignoires (150L)', vol: 150000, icon: '🛁' },
        { label: 'Jacuzzis (1000L)', vol: 1000000, icon: '🧖' },
        { label: 'Camions Citerne (30k L)', vol: 30000000, icon: '🚚' },
        { label: 'Piscines (50k L)', vol: 50000000, icon: '🏊' },
        { label: 'Piscines Olympiques', vol: 2500000000, icon: '🏟️' }
    ];

    let compHTML = '';
    comparisons.forEach(c => {
        const val = (totalVolumeMl / c.vol).toFixed(1);
        if (parseFloat(val) >= 1) {
            compHTML += `
        <div style="background:var(--bg-card); padding:10px; border-radius:12px; font-size:0.85rem; color:#888; display:flex; gap:10px; align-items:center;">
                 <span style="font-size:1.2rem;">${c.icon}</span>
                 <span><strong>${val}</strong> ${c.label}</span>
             </div>`;
        }
    });

    // Alcohol Comparisons Logic
    // totalAlcoholMl is pure alcohol.
    const alcComps = [
        { label: 'Pintes de Pils (50cl, 5%)', pure: 25, icon: '🍺' },
        { label: 'Shots de Tequila (3cl, 40%)', pure: 12, icon: '🥃' },
        { label: 'Bouteilles de Vin (75cl, 12%)', pure: 90, icon: '🍷' },
        { label: 'Bouteilles de Whisky (70cl, 40%)', pure: 280, icon: '🍾' },
        { label: 'Bouteilles de Vodka (70cl, 40%)', pure: 280, icon: '🍸' }
    ];

    let alcHTML = '';
    alcComps.forEach(c => {
        const val = (totalAlcoholMl / c.pure).toFixed(0);
        if (parseInt(val) > 0) {
            alcHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:5px 0;">
                <span style="color:#aaa;">${c.icon} ${c.label}</span>
                <strong style="color:var(--text-primary);">${val}</strong>
            </div>`;
        }
    });

    // If nothing matches (too small volume), show at least one small one
    if (compHTML === '' && totalVolumeMl > 0) {
        compHTML = `
        <div class="comp-item">
                 <span style="font-size:1.2rem;">🍺</span>
                 <span><strong>${(totalVolumeMl / 500).toFixed(2)}</strong> Pintes</span>
             </div>`;
    }

    return `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px;">
                    <div class="stat-card">
                        <div class="stat-value">${totalLiters} L</div>
                        <div class="stat-label">Volume Total</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${alcoholLiters} L</div>
                        <div class="stat-label">Alcool Pur</div>
                    </div>
                </div>

                <div class="mt-20">
                    <h4 class="ach-category-title text-center">Équivalences Volume</h4>
                    <div class="ach-grid" style="grid-template-columns:1fr 1fr;">
                        ${compHTML}
                    </div>
                </div>

                <div class="stat-card mt-20">
                    <h4 class="text-center" style="color:var(--danger); font-size:0.9rem; margin-bottom:10px;">Équivalences Alcool</h4>
                    <p class="text-center" style="font-size:0.75rem; color:#888; margin-bottom:10px;">C'est comme si vous aviez bu...</p>
                    ${alcHTML}
                </div>
    `;
}

// --- Achievements Helper ---
// We import dynamically or rely on global scope if needed, 
// but since we are in a module we can just import at top or here if supported.
// For simplicity in this file-based module structure, let's assume we import at top.
// Wait, we need to add the import statement at the top of the file too.

import * as Achievements from './achievements.js';

function renderAchievementsList() {
    const all = Achievements.getAllAchievements();
    const unlockedIds = Achievements.getUnlockedAchievements();

    // Group by Category
    const byCategory = {};
    all.forEach(ach => {
        const cat = ach.category || 'Autres';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(ach);
    });

    let html = '';

    Object.keys(byCategory).forEach(cat => {
        html += `<h4 class="ach-category-title text-center">${cat}</h4>`;
        html += `<div class="ach-grid">`;

        html += byCategory[cat].map(ach => {
            const isUnlocked = unlockedIds.includes(ach.id);
            const opacity = isUnlocked ? '1' : '0.4'; // Improved visibility for locked items
            const filter = isUnlocked ? 'none' : 'grayscale(100%)';

            let title = ach.title;
            let desc = ach.desc;

            // Only mask if locked AND hidden
            if (!isUnlocked && ach.hidden) {
                title = '???';
                desc = 'Mystère... Continuez à explorer !';
            }

            // Escape quotes for function arguments
            // We need \\' for JS string inside HTML attribute
            const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeDesc = desc.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeIcon = ach.icon.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            return `
        <div class="ach-item" style="opacity:${opacity}; filter:${filter}; position:relative; cursor:pointer;"
    onclick="UI.showAchievementDetails('${safeTitle}', '${safeDesc}', '${safeIcon}', ${isUnlocked})" >
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
            message: `
                <div style="font-size:3rem; margin-bottom:10px;">👋</div>
                <h3 style="color:var(--accent-gold); margin-bottom:10px;">Le Grand Tour</h3>
                <p>Découvrons ensemble toutes les fonctionnalités de Beerdex !</p>
                <button class="btn-primary mt-20" onclick="TutorialSystem.next()">C'est parti !</button>
            `
        },
        // --- HOME FEATURES ---
        {
            id: 'search',
            target: '#search-toggle',
            position: 'bottom',
            message: `
                <h3>Recherche</h3>
                <p>Trouvez vos bières instantanément.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'filter',
            target: '#filter-toggle',
            position: 'bottom',
            message: `
                <h3>Filtres Intelligents</h3>
                <p>Triez par goût, couleur, brasserie ou rareté.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'tap-beer',
            target: '.beer-card:first-child',
            position: 'auto',
            message: `
                <h3>Noter une Bière</h3>
                <p>Touchez une carte pour ouvrir la fiche de dégustation.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'add-beer',
            target: '#fab-add',
            position: 'left',
            message: `
                <h3>Ajouter</h3>
                <p>Scanner un code-barre ou ajouter manuellement.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        // --- STATS ---
        {
            id: 'go-stats',
            target: '[data-view="stats"]',
            position: 'top',
            message: `
                <h3>Statistiques</h3>
                <p>Allons voir vos progrès. Cliquez ici !</p>
            `,
            waitFor: 'click'
        },
        {
            id: 'stats-map',
            target: '#beer-map-container',
            position: 'top',
            message: `
                <h3>Carte des Bières</h3>
                <p>Visualisez la provenance de vos dégustations.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'stats-achievements',
            target: '#card-achievements',
            position: 'top',
            message: `
                <h3>Succès</h3>
                <p>Débloquez des badges en découvrant de nouveaux styles !</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'stats-match',
            target: '#btn-match',
            position: 'top',
            message: `
                <h3>Beer Match ⚔️</h3>
                <p>Comparez vos goûts avec ceux d'un ami via QR Code.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'stats-wrapped',
            target: '#btn-open-wrapped',
            position: 'top',
            message: `
                <h3>Wrapped 🎬</h3>
                <p>Revivez votre année brassicole en Story animée !</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        // --- SETTINGS ---
        {
            id: 'go-settings',
            target: '[data-view="settings"]',
            position: 'top',
            message: `
                <h3>Paramètres</h3>
                <p>Passons à la configuration. Cliquez ici !</p>
            `,
            waitFor: 'click'
        },
        {
            id: 'set-discovery',
            target: '#toggle-discovery', // Requires checking actual structure logic in showStep
            position: 'bottom',
            message: `
                <h3>Mode Découverte</h3>
                <p>Cache les bières non bues pour garder le mystère.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'set-rarity',
            target: '#check-reveal-rarity', // Check logic
            position: 'bottom',
            message: `
                <h3>Révéler la Rareté</h3>
                <p>Affiche le cadre coloré même pour les bières non bues.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'set-data',
            target: '#btn-manage-export',
            position: 'top',
            message: `
                <h3>Sauvegarde</h3>
                <p>Exportez vos données pour ne jamais les perdre.</p>
                <button class="btn-primary mt-10" style="font-size:0.8rem;" onclick="TutorialSystem.next()">Suivant</button>
            `
        },
        {
            id: 'noah-preset',
            target: '#btn-preset-noah',
            position: 'top',
            message: `
                <h3>Modèle prédéfinis</h3>
                <p>Activez 'Noah' pour des notes détaillées (Nez, Bouche, Robe).</p>
                <button class="btn-primary mt-10" onclick="TutorialSystem.finish()">Terminer</button>
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

    showStep() {
        const step = this.steps[this.currentStep];
        if (!step) return;

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
        } else {
            this.spotlight.style.opacity = '0';
        }

        // 4. Position Tooltip
        this.tooltip.innerHTML = step.message +
            `<div style="margin-top:10px; font-size:0.7rem; color:#888; text-decoration:underline; cursor:pointer;" onclick="TutorialSystem.finish()">Passer le tutoriel</div>`;
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
        if (step.waitFor === 'click' && el) {
            const oneTimeClick = (e) => {
                setTimeout(() => this.next(), 200);
            };
            el.addEventListener('click', oneTimeClick, { once: true });
        }
    },

    updatePosition() {
        if (this.currentStep < this.steps.length) {
            const step = this.steps[this.currentStep];
            if (step) this.showStep();
        }
    },

    finish() {
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
        showToast("Tutoriel terminé ! À vous de jouer 🍻");
    }
};

export function checkAndShowWelcome() {
    const HAS_SEEN_KEY = 'beerdex_welcome_seen_v3';
    if (localStorage.getItem(HAS_SEEN_KEY)) return;
    setTimeout(() => { TutorialSystem.start(); }, 1000);
}

window.restartTutorial = () => TutorialSystem.start();
window.TutorialSystem = TutorialSystem;

const PRESET_TRISTAN = [
    { id: 'score', label: 'Note Globale (/20)', type: 'number', min: 0, max: 20, step: 0.1 },
    { id: 'comment', label: 'Commentaire', type: 'textarea' },

    // Visuel
    { id: 'apparence', label: 'Apparence', type: 'textarea' },
    { id: 'couleur', label: 'Couleur (1=Blanche, 10=Noire)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'transparence', label: 'Transparence (1=Transp, 10=Opaque)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'mousse', label: 'Mousse (1=Plate, 10=Incontrôlable)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'mousse_tenue', label: 'Ténacité Mousse (1=Instant, 10=Eternelle)', type: 'range', min: 1, max: 10, step: 1 },

    // Olfactif
    { id: 'aromes_txt', label: 'Arômes (Desc)', type: 'textarea' },
    { id: 'cafe', label: 'Café', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'caramel', label: 'Caramel', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'cereales', label: 'Céréales', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'chocolat', label: 'Chocolat', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'sucre', label: 'Sucré', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'noisette', label: 'Noisette', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'pain', label: 'Pain', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'agrumes', label: 'Agrumes', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'epices', label: 'Épices', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'fleurs', label: 'Fleurs', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'herbes', label: 'Herbes', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'poivre', label: 'Poivre', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'resine', label: 'Résine', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'fruit', label: 'Fruit', type: 'range', min: 0, max: 10, step: 1 },
    { id: 'mais', label: 'Maïs', type: 'range', min: 0, max: 10, step: 1 },

    // Goût
    { id: 'intensite', label: 'Intensité (1=Faible, 10=Puissante)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'equilibre', label: 'Equilibre (1=Doux, 10=Amer)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'impression', label: 'Impression (1=Déplaisante, 10=Plaisante)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'corps', label: 'Corps (1=Léger, 10=Plein)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'carbonation', label: 'Carbonation (1=Plate, 10=Explosion)', type: 'range', min: 1, max: 10, step: 1 },

    // Conclusion
    { id: 'synthese', label: 'Synthèse', type: 'textarea' },
    { id: 'duree', label: 'Durée (1=Fugace, 10=Forcing)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'intensite_globale', label: 'Intensité Globale', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'ensemble_equilibre', label: 'Ensemble & Équilibre (Qualité)', type: 'range', min: 1, max: 10, step: 1 }
];

function applyTristanPreset() {
    Storage.saveRatingTemplate(PRESET_TRISTAN);
    Storage.savePreference('activePreset', 'tristan'); // Persist selection
}

const PRESET_NOAH = [
    { id: 'score', label: 'Note Globale (/20)', type: 'number', min: 0, max: 20, step: 0.1 },
    { id: 'comment', label: 'Commentaire', type: 'textarea' },

    // Visuel (Expert)
    { id: 'robe', label: 'Robe (Couleur/Turbidité)', type: 'textarea' },
    { id: 'mousse_aspect', label: 'Aspect Mousse', type: 'textarea' },

    // Olfactif (Nez)
    { id: 'nez_intensite', label: 'Intensité Nez (1-10)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'nez_notes', label: 'Notes Olfactives', type: 'textarea' },

    // Gustatif (Bouche)
    { id: 'attaque', label: 'Attaque', type: 'textarea' },
    { id: 'milieu_bouche', label: 'Milieu de Bouche', type: 'textarea' },
    { id: 'finale', label: 'Finale / Arrière-goût', type: 'textarea' },

    // Sensations
    { id: 'corpulence', label: 'Corpulence (1=Eau, 10=Sirop)', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'petillance', label: 'Pétillance', type: 'range', min: 1, max: 10, step: 1 },
    { id: 'amertume', label: 'Amertume Ressentie', type: 'range', min: 1, max: 10, step: 1 },

    // Accord
    { id: 'accord_mets', label: 'Accord ideal', type: 'textarea' },

    // Conclusion
    { id: 'potentiel_garde', label: 'Potentiel de Garde', type: 'textarea' },
    { id: 'verdict', label: 'Verdict de l\'Expert', type: 'textarea' }
];

function applyNoahPreset() {
    Storage.saveRatingTemplate(PRESET_NOAH);
    Storage.savePreference('activePreset', 'noah');
}

export function showAchievementDetails(title, desc, icon, isUnlocked) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content text-center';

    wrapper.innerHTML = `
        <div style="font-size:4rem; margin-bottom:20px; filter:${isUnlocked ? 'none' : 'grayscale(100%)'}; opacity:${isUnlocked ? '1' : '0.5'};">${icon}</div>
        <h2 style="color:var(--accent-gold); margin-bottom:10px; font-family:'Russo One';">${title}</h2>
        <p style="font-size:1.1rem; color:#ddd; margin-bottom:30px; line-height:1.5;">
            ${desc}
        </p>
        <button class="btn-primary" onclick="UI.closeModal()">Fermer</button>
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
                <button id="tab-qr" style="flex:1; background:none; border:none; color:var(--accent-gold); padding:10px; border-bottom:2px solid var(--accent-gold); cursor:pointer;">Mon Code</button>
                <button id="tab-scan" style="flex:1; background:none; border:none; color:#666; padding:10px; cursor:pointer;">Scanner</button>
            </div>

            <div id="view-qr" style="display:block;">
                <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">Montrez ce code à un ami.</p>
                <div id="qrcode-container" style="background:#FFF; padding:15px; border-radius:10px; display:inline-block; margin-bottom:15px;"></div>
                
                <!-- Text Fallback -->
                <div style="text-align:left;">
                    <p style="font-size:0.8rem; color:#888; margin-bottom:5px;">Code Texte (Copier si le scan échoue) :</p>
                    <textarea id="my-qr-text" readonly style="width:100%; height:60px; background:#222; border:1px solid #444; color:#aaa; font-size:0.7rem; padding:5px; border-radius:4px; resize:none;"></textarea>
                    <button id="btn-copy-code" class="form-input" style="padding:5px 10px; font-size:0.8rem; margin-top:5px; width:100%;">📋 Copier le code</button>
                </div>
            </div>

            <div id="view-scan" style="display:none;">
                <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">Scannez le code.</p>
                <div id="reader" style="width:100%; height:250px; background:#000; border-radius:8px; overflow:hidden; position:relative;"></div>
                <div id="scan-feedback" style="margin-top:10px; color:var(--accent-gold); font-size:0.8rem; height:20px;"></div>
                
                <details style="margin-top:15px; text-align:left;">
                    <summary style="color:#555; cursor:pointer; font-size:0.8rem;">Problème de caméra ?</summary>
                    <textarea id="manual-paste" placeholder="Collez le code texte ici (BEERDEX:...)" style="width:100%; height:60px; background:#222; border:1px solid #444; color:#FFF; margin-top:5px; font-size:0.7rem; padding:5px;"></textarea>
                    <button id="btn-manual-compare" class="form-input" style="padding:5px 10px; font-size:0.8rem; margin-top:5px;">Comparer</button>
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
            wrapper.querySelector('#qrcode-container').innerHTML = "<p style='color:#ccc; padding:20px;'>Aucune bière notée !<br><small>Buvez d'abord... 😉</small></p>";
            wrapper.querySelector('#my-qr-text').value = "Rien à partager.";
            return;
        }

        if (typeof LZString === 'undefined') {
            console.error("LZString missing");
            wrapper.querySelector('#qrcode-container').innerHTML = "Erreur: Lib Compression manquante";
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
                    container.innerHTML = "Erreur Génération QR";
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
                    showToast("Code copié !");
                }).catch(() => showToast("Erreur copie"));
            } else {
                txtArea.select();
                document.execCommand('copy');
                showToast("Code copié (legacy)");
            }
        };
    };

    const startScanner = () => {
        const feedback = wrapper.querySelector('#scan-feedback');
        feedback.textContent = "Initialisation caméra...";

        if (!window.Html5Qrcode) {
            feedback.textContent = "Erreur: Librairie QR non chargée";
            return;
        }

        const html5QrCode = new Html5Qrcode("reader");
        html5QrcodeScanner = html5QrCode;

        const qrCodeSuccessCallback = (decodedText, decodedResult) => {
            feedback.textContent = "Code détecté !";
            stopScanner().then(() => {
                processMatch(decodedText);
            });
        };

        const config = { fps: 10, qrbox: { width: 200, height: 200 } };

        html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
            .then(() => {
                isScanning = true;
                feedback.textContent = "Scannez un code...";
            })
            .catch(err => {
                console.error("Camera Error", err);
                feedback.textContent = "Caméra inaccessible (Permissions ?)";
                isScanning = false;
            });
    };

    const processMatch = (qrString) => {
        const friendData = Match.parseQRData(qrString);
        if (!friendData) {
            alert("Code invalide !");
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

        viewResult.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h3 style="color:var(--accent-gold); margin:0;">Match avec ${results.userName}</h3>
                <div style="font-size:3rem; font-weight:bold; color:#FFF; margin:10px 0;">
                    ${results.score}%
                </div>
                <div style="color:#aaa; font-size:0.9rem;">de compatibilité</div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:#222; padding:10px; border-radius:8px;">
                    <div style="font-size:1.5rem; font-weight:bold; color:#FFF;">${results.commonCount}</div>
                    <div style="font-size:0.8rem; color:#888; white-space:nowrap;">En commun</div>
                </div>
                 <div style="background:#222; padding:10px; border-radius:8px;">
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--accent-gold);">${results.friendTotal}</div>
                    <div style="font-size:0.8rem; color:#888; white-space:nowrap;">Total Ami</div>
                </div>
            </div>

            ${results.commonCount > 0 ? `
            <div style="text-align:left; margin-bottom:20px;">
                <strong style="color:#aaa; display:block; margin-bottom:5px;">Bières en commun (Top 5)</strong>
                <div style="background:#111; padding:10px; border-radius:8px; font-size:0.9rem;">
                    ${results.common.slice(0, 5).map(b => `<div style="margin-bottom:2px;">🍺 ${b.title}</div>`).join('')}
                    ${results.common.length > 5 ? `<div style="color:#666; font-style:italic;">...et ${results.common.length - 5} autres</div>` : ''}
                </div>
            </div>
            ` : ''}

            ${results.discovery.length > 0 ? `
            <div style="text-align:left;">
                <strong style="color:var(--accent-gold); display:block; margin-bottom:5px;">À découvrir (Top 3)</strong>
                <div style="background:#111; padding:10px; border-radius:8px; font-size:0.9rem;">
                     ${results.discovery.slice(0, 3).map(b => `<div style="margin-bottom:2px;">⭐ ${b.title}</div>`).join('')}
                </div>
            </div>
            ` : ''}
            
            <button id="btn-restart" class="form-input text-center mt-20" style="background:#333; margin-top:20px;">Nouveau Scan</button>
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

// Fixed Import Modal
export function renderImportModal() {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    // Ensure Flex Column for layout stability
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.height = 'auto';
    wrapper.style.maxHeight = '80vh';

    wrapper.innerHTML = `
        <h2 style="margin-bottom:20px;">Restaurer / Importer</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:20px;">
            Collez le code JSON ou le lien magique ci-dessous, ou chargez un fichier.
        </p>

        <textarea id="import-area" class="form-textarea" rows="5" placeholder='{"ratings":...} ou URL...'></textarea>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <button id="btn-paste" class="text-btn">📋 Coller</button>
            <label class="text-btn" style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                📂 Charger Fichier
                <input type="file" id="import-file-input" accept=".json, .txt" style="display:none;">
            </label>
        </div>

        <button id="btn-do-import" class="btn-primary" style="margin-top:20px; background:var(--accent-gold); color:black;">
            📥 Importer
        </button>
    `;

    const textarea = wrapper.querySelector('#import-area');

    // Auto-Focus
    setTimeout(() => textarea.focus(), 100);

    // Paste Button
    wrapper.querySelector('#btn-paste').onclick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) textarea.value = text;
            else showToast("Presse-papier vide ou inaccessible");
        } catch (e) {
            showToast("Accès presse-papier refusé. Collez manuellement.");
            textarea.focus();
        }
    };

    // Import Button
    wrapper.querySelector('#btn-do-import').onclick = () => {
        const text = textarea.value;
        if (!text.trim()) {
            showToast("Veuillez coller des données.");
            return;
        }

        if (Storage.importData(text)) {
            closeModal();
            showToast("Importation réussie !");
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast("Format invalide.");
        }
    };

    // File Input Handler
    wrapper.querySelector('#import-file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target.result;
            textarea.value = content;
            showToast("Fichier chargé ! Cliquez sur Importer.");
        };
        reader.readAsText(file);
    };

    openModal(wrapper);
}

export function renderAdvancedShareModal(beer, userRating) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.innerHTML = `
        <h2>✨ Story Personnalisée</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:20px;">
            Modifiez la note et le commentaire pour cette story (ne change pas vos données réelles).
        </p>

        <div class="form-group">
            <label class="form-label">Note affichée (/20)</label>
            <input type="number" id="share-score" class="form-input" value="${userRating.score || 0}" min="0" max="20" step="0.5">
        </div>

        <div class="form-group">
            <label class="form-label">Commentaire affiché</label>
            <textarea id="share-comment" class="form-textarea" rows="3">${userRating.comment || ''}</textarea>
        </div>

        <button id="btn-gen-link" class="btn-primary" style="margin-top:20px; background:var(--accent-gold); color:black;">
            🔗 Générer le Lien API
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

// --- NEW EXPORT MODAL ---
export function renderExportModal(defaultScope = 'all') {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.textAlign = 'center';

    let currentScope = defaultScope;
    let currentMode = 'file'; // file | url | text
    let selectedCustomIds = []; // For custom beer selection
    let downloadMode = false; // For URL mode

    // Pre-load custom beers status
    let allCustomBeers = [];
    if (Storage.getCustomBeers) {
        allCustomBeers = Storage.getCustomBeers();
        selectedCustomIds = allCustomBeers.map(b => b.id); // Default select all
    }

    const renderContent = () => {
        let customSelectionHTML = '';
        if (currentScope === 'custom' && allCustomBeers.length > 0) {
            customSelectionHTML = `
                <div style="text-align:left; background:#111; padding:10px; border-radius:8px; margin-bottom:15px; max-height:150px; overflow-y:auto; border:1px solid #333;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:5px;">Sélectionnez les bières :</div>
                    ${allCustomBeers.map(b => `
                        <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
                            <input type="checkbox" class="cb-custom" value="${b.id}" ${selectedCustomIds.includes(b.id) ? 'checked' : ''}>
                            <span style="font-size:0.85rem; color:#fff;">${b.title}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        }

        wrapper.innerHTML = `
            <h2>Sauvegarder & Partager</h2>
            <p style="color:#888; margin-bottom:20px;">Exportez vos données pour les sauvegarder ou les transférer.</p>

            <div style="margin-bottom:20px; text-align:left;">
                <label style="display:block; color:var(--accent-gold); margin-bottom:8px;">1. Quoi exporter ?</label>
                <div class="scope-selector" style="display:flex; gap:10px; margin-bottom:10px;">
                    <button class="btn-scope ${currentScope === 'all' ? 'active' : ''}" data-scope="all" style="flex:1; padding:10px; border-radius:8px; border:1px solid #444; background:${currentScope === 'all' ? 'var(--accent-gold)' : '#222'}; color:${currentScope === 'all' ? 'black' : '#fff'};">
                        Tout
                    </button>
                    <button class="btn-scope ${currentScope === 'custom' ? 'active' : ''}" data-scope="custom" style="flex:1; padding:10px; border-radius:8px; border:1px solid #444; background:${currentScope === 'custom' ? 'var(--accent-gold)' : '#222'}; color:${currentScope === 'custom' ? 'black' : '#fff'};">
                        Bières Perso
                    </button>
                    <button class="btn-scope ${currentScope === 'ratings' ? 'active' : ''}" data-scope="ratings" style="flex:1; padding:10px; border-radius:8px; border:1px solid #444; background:${currentScope === 'ratings' ? 'var(--accent-gold)' : '#222'}; color:${currentScope === 'ratings' ? 'black' : '#fff'};">
                        Notes
                    </button>
                </div>
                ${customSelectionHTML}
            </div>

            <div style="margin-bottom:20px; text-align:left;">
                <label style="display:block; color:var(--accent-gold); margin-bottom:8px;">2. Méthode d'export</label>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-bottom:15px;">
                    <button id="mode-file" class="btn-primary" style="font-size:0.75rem; padding:8px; background:${currentMode === 'file' ? '#333' : '#111'}; color:#fff; border:1px solid ${currentMode === 'file' ? 'var(--accent-gold)' : '#444'}; opacity:${currentMode === 'file' ? 1 : 0.7};">
                        📄 Fichier
                    </button>
                    <button id="mode-url" class="btn-primary" style="font-size:0.75rem; padding:8px; background:${currentMode === 'url' ? '#333' : '#111'}; color:#fff; border:1px solid ${currentMode === 'url' ? 'var(--accent-gold)' : '#444'}; opacity:${currentMode === 'url' ? 1 : 0.7};">
                        🔗 Lien
                    </button>
                    <button id="mode-text" class="btn-primary" style="font-size:0.75rem; padding:8px; background:${currentMode === 'text' ? '#333' : '#111'}; color:#fff; border:1px solid ${currentMode === 'text' ? 'var(--accent-gold)' : '#444'}; opacity:${currentMode === 'text' ? 1 : 0.7};">
                        📝 Texte
                    </button>
                </div>

                ${currentMode === 'file' ? `
                    <div style="background:#222; padding:10px; border-radius:8px; font-size:0.85rem; color:#ccc;">
                        Télécharge un fichier <code>.json</code>. Utilisez "Restaurer" pour l'importer plus tard.
                    </div>
                ` : currentMode === 'url' ? `
                    <div style="background:#222; padding:10px; border-radius:8px; font-size:0.85rem; color:#ccc;">
                        <div style="margin-bottom:10px;">Type de lien :</div>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:5px;">
                            <input type="radio" name="urlTxType" class="rb-url-type" value="import" ${!downloadMode ? 'checked' : ''}>
                            <span>Lien d'Import (Direct)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="radio" name="urlTxType" class="rb-url-type" value="download" ${downloadMode ? 'checked' : ''}>
                            <span>Lien de Téléchargement (Fichier)</span>
                        </label>
                    </div>
                ` : `
                    <div style="background:#222; padding:10px; border-radius:8px; font-size:0.85rem; color:#ccc;">
                        Affiche le code JSON brut à copier/coller manuellement.
                    </div>
                `}
            </div>

            <button id="btn-do-export" class="btn-primary" style="width:100%; margin-top:10px;">
                ${currentMode === 'file' ? '📥 Télécharger' : currentMode === 'url' ? '✨ Générer Lien' : '👀 Voir le Code'}
            </button>
        `;

        // Bind Scope
        wrapper.querySelectorAll('.btn-scope').forEach(btn => {
            btn.onclick = () => {
                currentScope = btn.dataset.scope;
                renderContent();
            };
        });

        // Bind Checkboxes
        wrapper.querySelectorAll('.cb-custom').forEach(cb => {
            cb.onchange = (e) => {
                if (e.target.checked) {
                    if (!selectedCustomIds.includes(e.target.value)) selectedCustomIds.push(e.target.value);
                } else {
                    selectedCustomIds = selectedCustomIds.filter(id => id !== e.target.value);
                }
            };
        });

        // Bind Mode
        wrapper.querySelector('#mode-file').onclick = () => { currentMode = 'file'; renderContent(); };
        wrapper.querySelector('#mode-url').onclick = () => { currentMode = 'url'; renderContent(); };
        wrapper.querySelector('#mode-text').onclick = () => { currentMode = 'text'; renderContent(); };

        // Bind URL Type Radio
        wrapper.querySelectorAll('.rb-url-type').forEach(rb => {
            rb.onchange = (e) => {
                downloadMode = e.target.value === 'download';
            };
        });

        // Bind Action
        wrapper.querySelector('#btn-do-export').onclick = async () => {
            const btn = wrapper.querySelector('#btn-do-export');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ ...';

            // Prepare IDs if custom
            let idsToExport = null;
            if (currentScope === 'custom') {
                idsToExport = selectedCustomIds;
            }
            // NOTE: 'ratings' scope with specific IDs logic is supported in Storage but we don't expose checkbox UI for ratings (too many)

            setTimeout(async () => {
                if (currentMode === 'file') {
                    const count = Storage.triggerExportFile(currentScope, idsToExport);
                    if (count > 0) {
                        showToast(`Export réussi !`, "success");
                        closeModal();
                    } else {
                        showToast("Rien à exporter !", "warning");
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }
                } else if (currentMode === 'url') {
                    const link = Storage.getShareableLink(currentScope, idsToExport, downloadMode);
                    if (link) {
                        showLinkResult(link, currentScope);
                    } else {
                        showToast("Erreur ou Trop de données", "error");
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }
                } else if (currentMode === 'text') {
                    // Get object
                    // We need a helper in Storage to just get the object
                    // getShareableLink gets compressed string.
                    // triggerExportFile saves file.
                    // exportDataAdvanced returns nothing useful for text display directly.
                    // Let's implement a quick helper or reuse logic
                    // Actually Storage.exportDataAdvanced is async and writes to file.

                    // Helper:
                    const dataStr = Storage.getExportDataString(currentScope === 'custom' ? false : true);
                    // Wait, getExportDataString doesn't support scopes nicely.
                    // Let's call a new helper or just manually use existing methods if possible.
                    // Since Storage.getExportDataString exists, let's use it but it might include too much.

                    // Better: Use `getShareableLink` logic but without compression? 
                    // Or just `exportDataAdvanced` adapted? 
                    // Let's modify renderContent to show text result using a hack:
                    // We'll use `Storage.triggerExportFile`? No.

                    let exportObj = {};
                    if (currentScope === 'all' || currentScope === 'ratings') exportObj.ratings = Storage.getAllUserData();
                    if (currentScope === 'all' || currentScope === 'custom') {
                        let customs = Storage.getCustomBeers();
                        if (idsToExport) customs = customs.filter(b => idsToExport.includes(String(b.id)));
                        exportObj.customBeers = customs;
                    }
                    const json = JSON.stringify(exportObj, null, 2);
                    showLinkResult(json, currentScope, true); // true = text mode
                }
            }, 300);
        };
    };

    const showLinkResult = (content, scopeName, isText = false) => {
        wrapper.innerHTML = `
            <h2>${isText ? '📝 Code JSON' : '🔗 Lien Prêt !'}</h2>
            <p style="font-size:0.85rem; color:#ccc; margin-bottom:15px;">
                ${isText ? 'Copiez ce code pour le sauvegarder ou l\'envoyer.' : `Copiez ce lien pour importer : <strong>${scopeName}</strong>.`}
            </p>
            
            <textarea id="result-area" readonly style="width:100%; height:150px; background:#111; color:#0f0; border:1px solid #333; border-radius:4px; font-family:monospace; font-size:0.7rem; padding:5px;">${content}</textarea>
            
            <button id="btn-copy-result" class="btn-primary" style="width:100%; margin-top:10px;">
                📋 Copier
            </button>
            
            <button id="btn-back" class="btn-primary" style="margin-top:15px; background:transparent; border:1px solid #444; color:#fff;">Retour</button>
        `;

        wrapper.querySelector('#btn-copy-result').onclick = () => {
            const area = wrapper.querySelector('#result-area');
            area.select();
            navigator.clipboard.writeText(content).then(() => {
                showToast("Copié !", "success");
            });
        };

        wrapper.querySelector('#btn-back').onclick = () => {
            renderContent();
        };
    };

    renderContent();
    openModal(wrapper);
}

export function renderShareLink(link) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.textAlign = 'center';
    wrapper.innerHTML = `
        <h2>Lien de Partage</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:15px;">Si l'image ne s'affiche pas, utilisez ce lien :</p>
        <textarea readonly style="width:100%; height:80px; background:#111; color:#0f0; border:1px solid #333; margin-bottom:10px;">${link}</textarea>
        <button class="btn-primary" onclick="navigator.clipboard.writeText('${link}').then(() => showToast('Copié !'))">Copier</button>
    `;
    openModal(wrapper);
}

