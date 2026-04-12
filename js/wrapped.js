import { getAllUserData, getCustomBeers } from './storage.js';

let _allBeersProvider = null;

export function init(allBeersProvider) {
    _allBeersProvider = allBeersProvider;
}

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
        const beerId = key.split('_')[0];

        // Loose equality check for ID
        let beer = allBeers.find(b => b.id == beerId);
        if (!beer) beer = customBeers.find(b => b.id == beerId);

        // Fallback: Legacy data might use UPPERCASE TITLE as key
        if (!beer) {
            const cleanKey = beerId.toUpperCase().trim();
            beer = allBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
            // Also check custom beers by title
            if (!beer) beer = customBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
        }

        if (!beer && entry.count > 0) {
            console.warn(`[Wrapped] Beer not found for ID: ${beerId}`);
        }

        if (entry.count > 0) {
            uniqueCount++; // A unique beer actually drunk
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

            // User requested Type (fallback to Style)
            const rawType = beer ? (beer.type || beer.style) : null;
            if (rawType) {
                const type = rawType.split('-')[0].trim();
                styles[type] = (styles[type] || 0) + entry.count;
            } else if (beer) {
                console.warn(`[Wrapped] Beer found but NO TYPE/STYLE: ${beer.title} (ID: ${beerId})`);
            }
        }
    });

    topBeers.sort((a, b) => b.count - a.count);
    const favoriteBeer = topBeers.length > 0 ? topBeers[0] : null;

    const sortedStyles = Object.entries(styles).sort((a, b) => b[1] - a[1]);

    // Support multiple winners for Favorite Type
    let favoriteStyle = i18n.t('label_unknown');
    if (sortedStyles.length > 0) {
        const maxCount = sortedStyles[0][1];
        const winners = sortedStyles.filter(s => s[1] === maxCount).map(s => s[0]);
        favoriteStyle = winners.join(' & ');
    }

    // Top Brewery
    const sortedBreweries = Object.entries(breweries).sort((a, b) => b[1] - a[1]);
    const favoriteBrewery = sortedBreweries.length > 0 ? sortedBreweries[0] : null;

    // Top Month
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

function renderStory(stats) {
    const slides = [
        {
            bg: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
            content: `
                <div class="story-title animate-pop-in">${i18n.t('wrapped_title')}</div>
                <div class="story-subtitle animate-slide-up" style="animation-delay:0.5s">${i18n.t('wrapped_subtitle')}</div>
                <div style="font-size:4rem; margin-top:20px;" class="animate-bounce">🎇</div>
            `
        },
        {
            bg: 'linear-gradient(135deg, #2c3e50 0%, #000000 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_you_drank')}</div>
                <div class="story-bento-card animate-scale-up" style="animation-delay:0.2s">
                    <div class="story-big-number">${stats.totalLiters} <span style="font-size:2rem">${i18n.t('wrapped_liters')}</span></div>
                    <div class="story-stat-sub">${i18n.t('wrapped_approx')}</div>
                    <div class="story-fun-fact" style="font-size:1.1rem; color:var(--accent-gold); margin-top:10px;">🌊 ${stats.equivalence.label}</div>
                </div>
            `
        },
        {
            bg: 'linear-gradient(135deg, #1b5e20 0%, #000000 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_adventurer')}</div>
                <div class="story-bento-card animate-scale-up" style="animation-delay:0.2s">
                    <div class="story-big-number" style="color:#a5d6a7;">${stats.totalBeers}</div>
                    <div class="story-stat-sub" style="margin-bottom:15px;">${i18n.t('wrapped_beers_unlocked')}</div>
                    <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:15px;">
                        <span style="color:#fff;font-weight:bold;font-size:1.4rem;">🧭 ${stats.uniqueBeers}</span>
                        <div style="font-size:0.9rem; color:#aaa;">${i18n.t('wrapped_unique_beers')}</div>
                    </div>
                </div>
            `
        },
        stats.topMonth ? {
            bg: 'linear-gradient(135deg, #e65100 0%, #3e2723 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_festive_month')}</div>
                <div class="story-bento-card animate-scale-up" style="animation-delay:0.2s">
                    <div style="font-size:3rem; margin-bottom:10px;">📅</div>
                    <div class="story-big-text" style="color:#ffcc80;">${stats.topMonth.name}</div>
                    <div class="story-stat-sub">${i18n.t('wrapped_tastings', { count: stats.topMonth.count })}</div>
                </div>
            `
        } : null,
        stats.favoriteBrewery ? {
            bg: 'linear-gradient(135deg, #311b92 0%, #000000 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_top_brewery')}</div>
                <div class="story-bento-card animate-scale-up" style="animation-delay:0.2s">
                    <div style="font-size:3rem; margin-bottom:10px;">🏭</div>
                    <div class="story-big-text" style="font-size:2.5rem; color:#b39ddb; margin:10px 0;">${stats.favoriteBrewery[0]}</div>
                    <div class="story-stat-sub">${i18n.t('wrapped_brewery_honor', { count: stats.favoriteBrewery[1] })}</div>
                </div>
            `
        } : null,
        stats.favoriteBeer ? {
            bg: 'linear-gradient(135deg, #4b1d1d 0%, #1a0505 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_fav_beer')}</div>
                <div style="position:relative; display:inline-block;" class="animate-rotate-in">
                    <div class="story-glow-bg"></div>
                    ${stats.favoriteBeer.image ? `<img src="${stats.favoriteBeer.image}" class="story-hero-img">` : '<div style="font-size:5rem; line-height:300px;">🍻</div>'}
                </div>
                <div class="story-bento-card animate-slide-up" style="animation-delay:0.4s; padding:15px; margin-top:0;">
                    <div class="story-beer-name" style="font-size:1.6rem;">${stats.favoriteBeer.name}</div>
                    <div class="story-stat-sub">${i18n.t('wrapped_times_drunk', { count: stats.favoriteBeer.count })}</div>
                </div>
            `
        } : null,
        {
            bg: 'linear-gradient(135deg, #5D4037 0%, #3E2723 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">${i18n.t('wrapped_favorite_style')}</div>
                <div class="story-bento-card animate-scale-up" style="animation-delay:0.2s">
                    <div style="font-size:3rem; margin-bottom:10px;">🏆</div>
                    <div class="story-big-text" style="color:var(--accent-gold);">${stats.favoriteStyle}</div>
                    <div class="story-stat-sub">${i18n.t('wrapped_good_taste')}</div>
                </div>
            `
        },
        {
            bg: 'linear-gradient(135deg, #000000 0%, #111 100%)',
            content: `
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                    <div class="story-title animate-pop-in" style="margin-bottom:0.5rem;">${i18n.t('wrapped_thanks')}</div>
                    <div class="story-stat-sub animate-slide-up" style="animation-delay:0.3s; margin-bottom:2rem; font-size:1.1rem; max-width:280px;">${i18n.t('wrapped_reminder')}</div>
                    
                    <button id="btn-share-wrapped" class="btn-primary animate-scale-up" style="animation-delay:0.6s; background:var(--accent-gold); color:black; padding:18px 32px; font-size:1.2rem; display:flex; align-items:center; gap:12px; border-radius:16px; font-weight:bold; box-shadow:0 10px 20px rgba(255, 192, 0, 0.2);">
                        <span>${i18n.t('wrapped_share_btn')}</span>
                        <span>📸</span>
                    </button>
                </div>
            `
        }
    ].filter(s => s !== null);

    const overlay = document.createElement('div');
    overlay.className = 'story-overlay';

    let progressHTML = '<div class="story-progress-container">';
    slides.forEach(() => {
        progressHTML += '<div class="story-progress-bar"><div class="story-progress-fill"></div></div>';
    });
    progressHTML += '</div>';

    overlay.innerHTML = `
        ${progressHTML}
        <button class="story-close-btn">&times;</button>
        <div class="story-content"></div>
        <div class="story-tap-left"></div>
        <div class="story-tap-right"></div>
    `;

    document.body.appendChild(overlay);

    let currentSlide = 0;
    const contentDiv = overlay.querySelector('.story-content');
    const progressFills = overlay.querySelectorAll('.story-progress-fill');
    let timer = null;

    const showSlide = (index) => {
        if (index >= slides.length) {
            close();
            return;
        }
        if (index < 0) index = 0;

        currentSlide = index;
        const slide = slides[currentSlide];

        overlay.style.background = slide.bg;
        contentDiv.innerHTML = slide.content;

        progressFills.forEach((fill, i) => {
            if (i < currentSlide) fill.style.width = '100%';
            else if (i > currentSlide) fill.style.width = '0%';
            else {
                fill.style.width = '0%';
                void fill.offsetWidth;
                fill.style.transition = 'width 5s linear';
                fill.style.width = '100%';
            }
        });

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            showSlide(currentSlide + 1);
        }, 5000);

        const shareBtn = contentDiv.querySelector('#btn-share-wrapped');
        if (shareBtn) {
            shareBtn.onclick = (e) => {
                e.stopPropagation();
                if (timer) clearTimeout(timer);
                handleWrappedShare(stats);
            };
        }
    };

    const close = () => {
        if (timer) clearTimeout(timer);
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.story-tap-left').onclick = (e) => { e.stopPropagation(); showSlide(currentSlide - 1); };
    overlay.querySelector('.story-tap-right').onclick = (e) => { e.stopPropagation(); showSlide(currentSlide + 1); };
    overlay.querySelector('.story-close-btn').onclick = close;

    requestAnimationFrame(() => showSlide(0));
}

async function handleWrappedShare(stats) {
    const shareBtn = document.getElementById('btn-share-wrapped');
    if (shareBtn) shareBtn.textContent = i18n.t('toast_generating_image');

    try {
        const allBeers = _allBeersProvider ? _allBeersProvider() : [];
        let beer = null;

        if (stats.favoriteBeer) {
            beer = allBeers.find(b => b.id == stats.favoriteBeer.id);
            if (!beer) {
                // Fallback by title
                const cleanKey = stats.favoriteBeer.name.toUpperCase().trim();
                beer = allBeers.find(b => b.title.toUpperCase().trim() === cleanKey);
            }

            // Fix: If still not found, DO NOT default to allBeers[0].
            // Use the info we have in stats (Ghost Beer)
            if (!beer) {
                beer = {
                    id: stats.favoriteBeer.id,
                    title: stats.favoriteBeer.name || "Bière Archivée",
                    name: stats.favoriteBeer.name || "Bière Archivée",
                    image: null, // Use default in generation
                    style: i18n.t('label_unknown')
                };
            }
        }

        // Use a default beer ONLY if really no stats (empty profile)
        if (!beer) {
            beer = allBeers[0] || { title: 'Beerdex', name: 'Beerdex', image: null };
        }

        // Check for generateWrappedCard (new design) or fallback to generateBeerCard
        if (window.Share && (window.Share.generateWrappedCard || window.Share.generateBeerCard) && beer) {

            let blob;
            if (window.Share.generateWrappedCard) {
                // New Premium Design
                blob = await window.Share.generateWrappedCard(stats, beer);
            } else {
                // Fallback to old design
                const lines = [
                    `🏆 Mon Beerdex Wrapped 🏆`,
                    `🍺 Consommation : ${stats.totalLiters} Litres !`,
                    `❤️ Top : ${stats.favoriteBeer ? stats.favoriteBeer.name : 'Aucune'} (${stats.favoriteBeer ? stats.favoriteBeer.count : 0} fois)`,
                    `🏅 Style : ${stats.favoriteStyle}`
                ];
                const comment = lines.join('\n');
                blob = await window.Share.generateBeerCard(beer, 10, comment);
            }



            // Mock API generation URL
            const baseUrl = window.location.origin + window.location.pathname;
            const apiUrl = new URL(baseUrl);
            apiUrl.searchParams.set("mode", "wrapped_share"); // Trigger flag
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
