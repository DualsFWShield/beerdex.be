import { getAllUserData, getCustomBeers } from './storage.js';
import { i18n } from './i18n.js';

let _allBeersProvider = null;

export function init(allBeersProvider) {
    _allBeersProvider = allBeersProvider;
}

/* ── Animated Counter ── */
function animateCounter(el, target, duration = 1200) {
    const start = performance.now();
    const update = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = Math.round(ease * target);
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

/* ── Stats Calculation (unchanged logic) ── */
function calculateStats() {
    const userData = getAllUserData();
    const customBeers = getCustomBeers();
    const allBeers = _allBeersProvider ? _allBeersProvider() : [];

    let totalBeers = 0;
    let totalVolumeMl = 0;
    let topBeers = [];
    let styles = {};
    let months = {};
    let breweries = {};
    const monthNames = [
        i18n.t('month_jan'), i18n.t('month_feb'), i18n.t('month_mar'), i18n.t('month_apr'),
        i18n.t('month_may'), i18n.t('month_jun'), i18n.t('month_jul'), i18n.t('month_aug'),
        i18n.t('month_sep'), i18n.t('month_oct'), i18n.t('month_nov'), i18n.t('month_dec')
    ];

    let uniqueCount = 0;

    Object.keys(userData).forEach(key => {
        const entry = userData[key];
        const beerId = key;

        let beer = allBeers.find(b => b.id == beerId);
        if (!beer) beer = customBeers.find(b => b.id == beerId);

        if (!beer) {
            const cleanKey = beerId.toUpperCase().trim();
            beer = allBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
            if (!beer) beer = customBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
        }

        if (!beer && entry.count > 0) {
            console.warn(`[Wrapped] Beer not found for ID: ${beerId}`);
        }

        if (entry.count > 0) {
            uniqueCount++;
        }

        if (entry.count > 0) {
            totalBeers += entry.count;
            if (beer) {
                topBeers.push({
                    name: beer.title,
                    count: entry.count,
                    image: beer.image,
                    id: beer.id
                });

                if (beer.brewery) {
                    const bname = beer.brewery.trim();
                    breweries[bname] = (breweries[bname] || 0) + entry.count;
                }
            }

            if (entry.history) {
                entry.history.forEach(h => {
                    totalVolumeMl += (h.volume || 330);
                    if (h.date) {
                        const month = new Date(h.date).getMonth();
                        months[month] = (months[month] || 0) + 1;
                    }
                });
            } else {
                totalVolumeMl += entry.count * 330;
            }

            const rawType = beer ? (beer.type || beer.style) : null;
            if (rawType) {
                const type = rawType.split('-')[0].trim();
                styles[type] = (styles[type] || 0) + entry.count;
            }
        }
    });

    topBeers.sort((a, b) => b.count - a.count);
    const favoriteBeer = topBeers.length > 0 ? topBeers[0] : null;

    const sortedStyles = Object.entries(styles).sort((a, b) => b[1] - a[1]);
    let favoriteStyle = i18n.t('label_unknown');
    if (sortedStyles.length > 0) {
        const maxCount = sortedStyles[0][1];
        const winners = sortedStyles.filter(s => s[1] === maxCount).map(s => s[0]);
        favoriteStyle = winners.join(' & ');
    }

    const sortedBreweries = Object.entries(breweries).sort((a, b) => b[1] - a[1]);
    const favoriteBrewery = sortedBreweries.length > 0 ? sortedBreweries[0] : null;

    const sortedMonths = Object.entries(months).sort((a, b) => b[1] - a[1]);
    let topMonth = null;
    if (sortedMonths.length > 0) {
        topMonth = {
            name: monthNames[parseInt(sortedMonths[0][0])],
            count: sortedMonths[0][1]
        };
    }

    const totalLiters = Math.round(totalVolumeMl / 1000);
    const nbBottles = Math.round(totalVolumeMl / 500);
    let equivalence = { label: nbBottles + " " + i18n.t('eq_bottles'), val: totalLiters };

    const eqList = [
        { limit: 50, label: i18n.t('eq_aquarium') },
        { limit: 150, label: i18n.t('eq_bathtub') },
        { limit: 300, label: i18n.t('eq_barrel') },
        { limit: 500, label: i18n.t('eq_jacuzzi') },
        { limit: 1000, label: i18n.t('eq_pool') }
    ];

    for (let eq of eqList) {
        if (totalLiters >= eq.limit) equivalence = { label: eq.label, val: totalLiters };
    }

    return {
        totalBeers,
        totalLiters,
        favoriteBeer,
        favoriteStyle,
        favoriteBrewery,
        topMonth,
        uniqueBeers: uniqueCount,
        equivalence
    };
}

export function start() {
    const stats = calculateStats();
    if (stats.totalBeers === 0) {
        window.UI.showToast(i18n.t('toast_wrapped_no_data'));
        return;
    }
    renderStory(stats);
}

/* ── Build Slide Definitions ── */
function buildSlides(stats) {
    const year = new Date().getFullYear();
    const slides = [];

    // 1. Intro
    slides.push({
        bg: 'wrapped-bg-intro',
        html: `
            <div class="wrapped-title animate-counter-pop">${i18n.t('wrapped_title')}</div>
            <div class="wrapped-subtitle" style="animation: fade-in 1s 0.4s both">${i18n.t('wrapped_subtitle')} ${year}</div>
            <div class="wrapped-emoji-float">🍺</div>
        `
    });

    // 2. Volume
    slides.push({
        bg: 'wrapped-bg-volume',
        html: `
            <div class="wrapped-label">${i18n.t('wrapped_you_drank')}</div>
            <div class="wrapped-big-num" data-counter="${stats.totalLiters}">0</div>
            <div class="wrapped-big-num wrapped-unit">${i18n.t('wrapped_liters')}</div>
            <div class="wrapped-sub">${i18n.t('wrapped_approx')}</div>
            <div class="wrapped-fun-fact">🌊 ${stats.equivalence.label}</div>
        `
    });

    // 3. Adventurer (count)
    slides.push({
        bg: 'wrapped-bg-count',
        html: `
            <div class="wrapped-label">${i18n.t('wrapped_adventurer')}</div>
            <div class="wrapped-big-num" data-counter="${stats.totalBeers}">0</div>
            <div class="wrapped-sub" style="margin-bottom:8px">${i18n.t('wrapped_beers_unlocked')}</div>
            <div class="wrapped-card">
                <div class="wrapped-card-row" style="border:none;padding:0;margin:0">
                    <div class="wrapped-card-stat">
                        <div class="wrapped-card-stat-num" data-counter="${stats.uniqueBeers}">0</div>
                        <div class="wrapped-card-stat-label">🧭 ${i18n.t('wrapped_unique_beers')}</div>
                    </div>
                </div>
            </div>
        `
    });

    // 4. Top Month (optional)
    if (stats.topMonth) {
        slides.push({
            bg: 'wrapped-bg-month',
            html: `
                <div class="wrapped-label">${i18n.t('wrapped_festive_month')}</div>
                <div style="font-size:4rem;margin-bottom:8px">📅</div>
                <div class="wrapped-big-text" style="color:#ffcc80">${stats.topMonth.name}</div>
                <div class="wrapped-sub">${i18n.t('wrapped_tastings', { count: stats.topMonth.count })}</div>
            `
        });
    }

    // 5. Top Brewery (optional)
    if (stats.favoriteBrewery) {
        slides.push({
            bg: 'wrapped-bg-brewery',
            html: `
                <div class="wrapped-label">${i18n.t('wrapped_top_brewery')}</div>
                <div style="font-size:4rem;margin-bottom:8px">🏭</div>
                <div class="wrapped-big-text" style="color:#b39ddb">${stats.favoriteBrewery[0]}</div>
                <div class="wrapped-sub">${i18n.t('wrapped_brewery_honor', { count: stats.favoriteBrewery[1] })}</div>
            `
        });
    }

    // 6. Favorite Beer (optional)
    if (stats.favoriteBeer) {
        const imgMarkup = stats.favoriteBeer.image
            ? `<img src="${stats.favoriteBeer.image}" class="wrapped-hero-img" alt="${stats.favoriteBeer.name}">`
            : `<div class="wrapped-hero-fallback">🍻</div>`;
        slides.push({
            bg: 'wrapped-bg-beer',
            html: `
                <div class="wrapped-label">${i18n.t('wrapped_fav_beer')}</div>
                <div class="wrapped-hero-ring">${imgMarkup}</div>
                <div class="wrapped-big-text" style="font-size:clamp(1.4rem,5vw,2.2rem)">${stats.favoriteBeer.name}</div>
                <div class="wrapped-sub">${i18n.t('wrapped_times_drunk', { count: stats.favoriteBeer.count })}</div>
            `
        });
    }

    // 7. Favorite Style
    slides.push({
        bg: 'wrapped-bg-style',
        html: `
            <div class="wrapped-label">${i18n.t('wrapped_favorite_style')}</div>
            <div style="font-size:4rem;margin-bottom:8px">🏆</div>
            <div class="wrapped-big-text" style="color:#FFC000">${stats.favoriteStyle}</div>
            <div class="wrapped-sub">${i18n.t('wrapped_good_taste')}</div>
        `
    });

    // 8. Thank You + Share
    slides.push({
        bg: 'wrapped-bg-thanks',
        isLast: true,
        html: `
            <div class="wrapped-title" style="font-size:clamp(2rem,8vw,3.5rem)">${i18n.t('wrapped_thanks')}</div>
            <div class="wrapped-sub" style="max-width:280px;margin:12px auto 28px;font-size:1rem;color:rgba(255,255,255,0.6)">${i18n.t('wrapped_reminder')}</div>
            <button id="btn-share-wrapped" class="wrapped-share-btn">
                <span>${i18n.t('wrapped_share_btn')}</span>
                <span>📸</span>
            </button>
        `
    });

    return slides;
}

/* ── Render the Story ── */
function renderStory(stats) {
    const slides = buildSlides(stats);

    const overlay = document.createElement('div');
    overlay.className = 'wrapped-overlay';

    // Decorative blobs
    overlay.innerHTML = `
        <div class="wrapped-blob wrapped-blob-1"></div>
        <div class="wrapped-blob wrapped-blob-2"></div>
        <div class="wrapped-blob wrapped-blob-3"></div>
        <div class="wrapped-year-badge">${new Date().getFullYear()}</div>
        <div class="wrapped-brand">BEERDEX.BE</div>
        <div class="wrapped-progress">${slides.map(() => `<div class="wrapped-progress-seg"><div class="wrapped-progress-fill"></div></div>`).join('')}</div>
        <button class="wrapped-close">&times;</button>
        <div class="wrapped-tap-left"></div>
        <div class="wrapped-tap-right"></div>
    `;

    // Create slide elements
    slides.forEach((slide, i) => {
        const el = document.createElement('div');
        el.className = `wrapped-slide ${slide.bg}`;
        el.innerHTML = slide.html;
        if (i === 0) el.classList.add('active');
        overlay.appendChild(el);
    });

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    // Add state to browser history
    window.history.pushState({ isModal: true, timestamp: Date.now() }, '');

    let current = 0;
    let timer = null;
    const slideEls = overlay.querySelectorAll('.wrapped-slide');
    const fills = overlay.querySelectorAll('.wrapped-progress-fill');

    function runCounters(slideEl) {
        slideEl.querySelectorAll('[data-counter]').forEach(el => {
            const target = parseInt(el.dataset.counter, 10);
            if (!isNaN(target)) animateCounter(el, target, 1000);
        });
    }

    function showSlide(index) {
        if (index >= slides.length) { close(); return; }
        if (index < 0) index = 0;

        // Transition out current
        slideEls[current]?.classList.remove('active');
        slideEls[current]?.classList.add('exit-left');

        current = index;

        // Reset all
        slideEls.forEach((el, i) => {
            if (i !== current) {
                el.classList.remove('active', 'exit-left');
            }
        });

        // Transition in next
        slideEls[current].classList.remove('exit-left');
        slideEls[current].classList.add('active');

        // Progress bars
        fills.forEach((fill, i) => {
            fill.style.transition = 'none';
            if (i < current) {
                fill.style.width = '100%';
            } else if (i > current) {
                fill.style.width = '0%';
            } else {
                fill.style.width = '0%';
                void fill.offsetWidth; // force reflow
                fill.style.transition = 'width 5s linear';
                fill.style.width = '100%';
            }
        });

        // Run counters
        runCounters(slideEls[current]);

        // Confetti on last slide
        if (slides[current].isLast && window.confetti) {
            setTimeout(() => {
                window.confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 }, colors: ['#FFC000', '#FF9900', '#fff'] });
            }, 400);
        }

        // Share button
        const shareBtn = slideEls[current].querySelector('#btn-share-wrapped');
        if (shareBtn) {
            shareBtn.onclick = (e) => {
                e.stopPropagation();
                if (timer) clearTimeout(timer);
                handleWrappedShare(stats);
            };
        }

        // Auto-advance
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => showSlide(current + 1), 5000);
    }

    function closeWrapped() {
        if (!overlay.parentNode) return;
        if (timer) clearTimeout(timer);
        overlay.classList.add('fade-out');
        document.body.classList.remove('modal-open');
        setTimeout(() => overlay.remove(), 400);
    }

    // Support native back button via app.js
    window.addEventListener('app-close-modals', closeWrapped);

    overlay.querySelector('.wrapped-close').onclick = () => {
        // Since we pushed state, let's close via history.back if possible,
        // which triggers popstate -> UI.closeModal -> app-close-modals -> closeWrapped
        if (window.history.state && window.history.state.isModal) {
            window.history.back();
        } else {
            closeWrapped();
        }
    };

    // Navigation
    overlay.querySelector('.wrapped-tap-left').onclick = () => showSlide(current - 1);
    overlay.querySelector('.wrapped-tap-right').onclick = () => showSlide(current + 1);

    // Swipe support
    let touchStartX = 0;
    overlay.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) {
            dx > 0 ? showSlide(current - 1) : showSlide(current + 1);
        }
    }, { passive: true });

    // Start
    requestAnimationFrame(() => showSlide(0));
}

/* ── Share Handler (unchanged logic) ── */
async function handleWrappedShare(stats) {
    const shareBtn = document.getElementById('btn-share-wrapped');
    if (shareBtn) shareBtn.textContent = i18n.t('toast_generating_image');

    try {
        const allBeers = _allBeersProvider ? _allBeersProvider() : [];
        let beer = null;

        if (stats.favoriteBeer) {
            beer = allBeers.find(b => b.id == stats.favoriteBeer.id);
            if (!beer) {
                const cleanKey = stats.favoriteBeer.name.toUpperCase().trim();
                beer = allBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
            }

            if (!beer) {
                beer = {
                    id: stats.favoriteBeer.id,
                    title: stats.favoriteBeer.name || "Bière Archivée",
                    name: stats.favoriteBeer.name || "Bière Archivée",
                    image: null,
                    style: i18n.t('label_unknown')
                };
            }
        }

        if (!beer) {
            beer = allBeers[0] || { title: 'Beerdex', name: 'Beerdex', image: null };
        }

        if (window.Share && (window.Share.generateWrappedCard || window.Share.generateBeerCard) && beer) {
            let blob;
            if (window.Share.generateWrappedCard) {
                blob = await window.Share.generateWrappedCard(stats, beer);
            } else {
                const lines = [
                    `🏆 Mon Beerdex Wrapped 🏆`,
                    `🍺 Consommation : ${stats.totalLiters} Litres !`,
                    `❤️ Top : ${stats.favoriteBeer ? stats.favoriteBeer.name : 'Aucune'} (${stats.favoriteBeer ? stats.favoriteBeer.count : 0} fois)`,
                    `🏅 Style : ${stats.favoriteStyle}`
                ];
                const comment = lines.join('\n');
                blob = await window.Share.generateBeerCard(beer, 10, comment);
            }

            const baseUrl = window.location.origin + window.location.pathname;
            const apiUrl = new URL(baseUrl);
            apiUrl.searchParams.set("mode", "wrapped_share");
            apiUrl.searchParams.set("year", new Date().getFullYear());
            apiUrl.searchParams.set("total_liters", stats.totalLiters);
            apiUrl.searchParams.set("total_count", stats.totalBeers);
            if (stats.favoriteBeer) {
                apiUrl.searchParams.set("fav_name", stats.favoriteBeer.name);
                apiUrl.searchParams.set("fav_count", stats.favoriteBeer.count);
                apiUrl.searchParams.set("fav_image", stats.favoriteBeer.image || '');
            }
            apiUrl.searchParams.set("fav_style", stats.favoriteStyle);

            await window.Share.shareImage(blob, `Mon Beerdex Wrapped ${new Date().getFullYear()}`, apiUrl.toString());

            if (shareBtn) shareBtn.textContent = i18n.t('btn_share');
        } else {
            window.UI.showAlertModal("Impossible de générer l'image (Module Share manquant)", { icon: '⚠️' });
        }
    } catch (e) {
        console.error("Wrapped Share Error:", e);
        window.UI.showAlertModal("Erreur lors du partage : " + e.message, { icon: '⚠️' });
        if (shareBtn) shareBtn.textContent = i18n.t('error_label') + " ⚠️";
    }
}
