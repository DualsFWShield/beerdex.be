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
            totalBeers += entry.count;
            if (beer) {
                topBeers.push({
                    name: beer.title,
                    count: entry.count,
                    image: beer.image,
                    id: beer.id
                });
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
    let favoriteStyle = 'Inconnu';
    if (sortedStyles.length > 0) {
        const maxCount = sortedStyles[0][1];
        const winners = sortedStyles.filter(s => s[1] === maxCount).map(s => s[0]);
        favoriteStyle = winners.join(' & ');
    }

    const totalLiters = Math.round(totalVolumeMl / 1000);
    const nbBottles = Math.round(totalVolumeMl / 500);
    let equivalence = { label: nbBottles + " bouteilles d'eau de 500ml", val: totalLiters };

    const eqList = [
        { limit: 50, label: "Un petit aquarium " },
        { limit: 150, label: "Une baignoire remplie " },
        { limit: 300, label: "Un tonneau de vin " },
        { limit: 500, label: "Un jacuzzi pour 2 " },
        { limit: 1000, label: "Une piscine gonflable " }
    ];

    for (let eq of eqList) {
        if (totalLiters >= eq.limit) equivalence = { label: eq.label, val: totalLiters };
    }

    return {
        totalBeers,
        totalLiters,
        favoriteBeer,
        favoriteStyle,
        equivalence,
        uniqueBeers: Object.keys(userData).length
    };
}

export function start() {
    const stats = calculateStats();
    if (stats.totalBeers === 0) {
        window.UI.showToast("Pas assez de données pour le Wrapped ! Buvez un coup d'abord. ");
        return;
    }
    renderStory(stats);
}

function renderStory(stats) {
    const slides = [
        {
            bg: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
            content: `
                <div class="story-title animate-pop-in">BEERDEX<br>WRAPPED</div>
                <div class="story-subtitle animate-slide-up" style="animation-delay:0.5s">Votre année en bières</div>
                <div style="font-size:4rem; margin-top:20px;" class="animate-bounce"></div>
            `
        },
        {
            bg: 'linear-gradient(135deg, #2c3e50 0%, #000000 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">Vous avez bu</div>
                <div class="story-big-number animate-scale-up">${stats.totalLiters} <span style="font-size:2rem">Litres</span></div>
                <div class="story-stat-sub animate-slide-up" style="animation-delay:0.3s">Soit environ</div>
                <div class="story-fun-fact animate-pop-in" style="animation-delay:0.6s">${stats.equivalence.label}</div>
            `
        },
        stats.favoriteBeer ? {
            bg: 'linear-gradient(135deg, #4b1d1d 0%, #1a0505 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">Votre coup de ❤️</div>
                ${stats.favoriteBeer.image ? `<img src="${stats.favoriteBeer.image}" class="story-beer-img animate-rotate-in">` : '<div style="font-size:5rem"></div>'}
                <div class="story-beer-name animate-slide-up">${stats.favoriteBeer.name}</div>
                <div class="story-stat-sub">Bue ${stats.favoriteBeer.count} fois</div>
            `
        } : null,
        {
            bg: 'linear-gradient(135deg, #5D4037 0%, #3E2723 100%)',
            content: `
                <div class="story-stat-label animate-fade-in">Votre type préféré</div>
                <div class="story-big-text animate-pop-in" style="color:var(--accent-gold);">${stats.favoriteStyle}</div>
                <div class="story-stat-sub animate-slide-up">Vous avez du goût !</div>
            `
        },
        {
            bg: 'linear-gradient(135deg, #000000 0%, #111 100%)',
            content: `
                <div class="story-title animate-pop-in">Merci !</div>
                <div class="story-stat-sub" style="margin-top:20px;">Et rappelez-vous, une bonne bière se déguste avec sagesse.</div>
                <button id="btn-share-wrapped" class="btn-primary animate-slide-up" style="margin-top:40px; background:var(--accent-gold); color:black;">Partager</button>
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
    if (shareBtn) shareBtn.textContent = "Génération...";

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
                    style: 'Inconnu'
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

            if (shareBtn) shareBtn.textContent = "Partager";
        } else {
            alert("Impossible de générer l'image (Module Share manquant)");
        }
    } catch (e) {
        console.error("Wrapped Share Error:", e);
        alert("Erreur lors du partage : " + e.message);
        if (shareBtn) shareBtn.textContent = "Erreur ⚠️";
    }
}
