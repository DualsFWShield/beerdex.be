/**
 * share.js
 * Logic for generating "Insta-ready" images via Canvas
 */

// Load branding assets
const LOGO_PATH = "icons/logo-bnr.png";
const FOAM_PATH = "images/foam.png";

/**
 * Generates a "Polaroid style" image for a specific beer review
 * @param {Object} beer - The beer object
 * @param {number} rating - User rating (0-20)
 * @param {string} comment - User comment
 * @returns {Promise<Blob>} - The image blob
 */
export async function generateBeerCard(beer, rating, comment) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // High Res Canvas for mobile
    const width = 1080;
    const height = 1920; // Story format 9:16
    canvas.width = width;
    canvas.height = height;

    // --- 1. Background ---
    // Extract a dominant color or use a default gradient based on type
    const colorMap = {
        'Blonde': ['#FDC830', '#F37335'],
        'Brune': ['#3E5151', '#DECBA4'],
        'Ambrée': ['#d53369', '#daae51'],
        'Rouge': ['#cb2d3e', '#ef473a'],
        'Blanche': ['#E0EAFC', '#CFDEF3'],
        'Triple': ['#FFC000', '#D4AF37'],
        'Stout': ['#000000', '#434343'],
        'IPA': ['#56ab2f', '#a8e063']
    };

    // Normalize type for lookup
    let typeKey = 'Blonde';
    if (beer.type) {
        Object.keys(colorMap).forEach(k => {
            if (beer.type.includes(k)) typeKey = k;
        });
    }

    let gradientColors = colorMap[typeKey] || ['#141E30', '#243B55'];

    const grd = ctx.createLinearGradient(0, 0, width, height);
    grd.addColorStop(0, gradientColors[0]);
    grd.addColorStop(1, gradientColors[1]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

    // Overlay Pattern (Noise/Grain simulation for texture)
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, width, height);

    // --- DECORATION: Bubbles & Glows ---
    ctx.save();
    // 1. Large ambient glows
    const drawGlow = (x, y, r, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    };
    drawGlow(0, 0, 800, 'rgba(255,255,255,0.1)');
    drawGlow(width, height, 900, 'rgba(0,0,0,0.2)');

    // 2. Beer Bubbles
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = Math.random() * 20 + 5;
        const opa = Math.random() * 0.1;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opa})`;
        ctx.fill();

        // Shine on bubble
        ctx.beginPath();
        ctx.arc(x - r / 3, y - r / 3, r / 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opa + 0.1})`;
        ctx.fill();
    }

    // 3. Beer Foam (Image)
    try {
        const foamImg = await loadImage(FOAM_PATH);
        // Draw at top, full width, auto height driven by aspect ratio
        const foamH = width * (foamImg.height / foamImg.width);
        ctx.drawImage(foamImg, 0, -5, width, foamH); // -5 to cover very top edge edge cases
    } catch (e) {
        console.warn("Foam image not found, skipping");
    }

    ctx.restore();

    // --- 2. Polaroid / Card Container ---
    const cardMargin = 100;
    const cardY = 250;
    const cardWidth = width - (cardMargin * 2);
    const cardHeight = 1350; // Taller to fit info
    const borderRadius = 40;

    drawRoundedRect(ctx, cardMargin, cardY, cardWidth, cardHeight, borderRadius, '#1a1a1a');

    // Shadow for card
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 20;

    // --- 3. Content ---

    // Beer Image
    try {
        const img = await loadImage(beer.image);
        const imgH = 600;
        const imgW = 400; // Constrain width

        ctx.save();
        // Glow behind image
        ctx.shadowColor = "rgba(255,192,0,0.3)";
        ctx.shadowBlur = 40;
        drawImageProp(ctx, img, 0, 0, img.width, img.height, (width / 2) - (imgW / 2), cardY + 60, imgW, imgH);
        ctx.restore();
    } catch (e) {
        // Fallback Icon
        ctx.font = '300px serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('🍺', width / 2, cardY + 400);
    }

    // Reset Shadow
    ctx.shadowColor = "transparent";

    // Text Content
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';

    // Beer Name (Use beer.title !!)
    let displayTitle = beer.title || beer.name || "Bière Inconnue";
    ctx.font = 'bold 70px "Russo One", sans-serif';
    fitText(ctx, displayTitle, width / 2, cardY + 720, cardWidth - 60, 70);

    // Brewery
    ctx.font = 'italic 35px "Outfit", sans-serif';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText((beer.brewery || "Brasserie Inconnue").toUpperCase(), width / 2, cardY + 770);

    // --- BADGES (Type, Alc, Vol) ---
    const badgesY = cardY + 850;
    const badgeGap = 30;

    const infoItems = [
        { text: beer.type || '?', icon: '' },
        { text: beer.alcohol || '?', icon: '' },
        { text: beer.volume || '?', icon: '' }
    ];

    let totalWidth = 0;
    // Pre-calc width not easily possible with different text lengths without complex logic.
    // Instead, we center 3 fixed-width pills or flow them.

    const pillW = 220;
    const pillH = 100;
    const startX = (width - (pillW * 3 + badgeGap * 2)) / 2;

    infoItems.forEach((item, i) => {
        const x = startX + i * (pillW + badgeGap);
        drawRoundedRect(ctx, x, badgesY, pillW, pillH, 50, 'rgba(255,255,255,0.05)');
        // Border
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();

        ctx.fillStyle = '#FFC000';
        ctx.font = 'bold 35px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.text, x + (pillW / 2), badgesY + 65);
    });


    // Rating Stars
    const score = rating || 0;
    const starStr = "★".repeat(Math.round(score / 4)); // Max 5 stars
    const voidStr = "☆".repeat(5 - Math.round(score / 4));

    // Draw Stars
    ctx.font = '80px "Outfit", sans-serif';
    ctx.fillStyle = '#FFC000'; // Gold
    ctx.textAlign = 'center';
    ctx.fillText(starStr + voidStr, width / 2, cardY + 1080);

    // Score Number
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Outfit", sans-serif';
    ctx.fillText(`${score}/20`, width / 2, cardY + 1140);


    // Comment (if any)
    if (comment) {
        ctx.font = 'italic 30px "Outfit", serif';
        ctx.fillStyle = '#DDDDDD';
        wrapText(ctx, `"${comment}"`, width / 2, cardY + 1220, cardWidth - 100, 40);
    }

    // --- 4. Branding (Logo & Footer) ---
    const footerY = height - 280;

    // Logo
    try {
        const logo = await loadImage(LOGO_PATH);
        const logoW = 150; // Smaller branding to avoid overlap
        const logoH = logoW * (logo.height / logo.width);
        // Position logo centered between card (1600) and footer (approx 1800)
        // Card ends at 1600. Footer text starts around 1820-font_height.
        const logoY = 1610;

        drawImageProp(ctx, logo, 0, 0, logo.width, logo.height, (width / 2) - (logoW / 2), logoY, logoW, logoH);

    } catch (e) {
        // Fallback text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 60px "Russo One", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("BEERDEX", width / 2, footerY - 50);
    }

    // Website URL
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("beerdex.be", width / 2, height - 100);

    // Tagline (FR)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'italic 30px "Outfit", sans-serif';
    ctx.fillText("Disponible sur Android et iOS", width / 2, height - 50);


    // --- Export ---
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            resolve(blob);
        }, 'image/png', 0.95);
    });
}

/**
 * Generates a "Wrapped Summary" stats card (Infographic Style)
 * Distinct from the Beer Card
 */
export async function generateWrappedCard(stats, favoriteBeer, year) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 1080;
    const height = 1920;
    canvas.width = width;
    canvas.height = height;

    const displayYear = year || new Date().getFullYear();

    // --- 1. Background (Premium Ambient) ---
    const grd = ctx.createLinearGradient(0, 0, 0, height);
    grd.addColorStop(0, '#10061e'); // Deep purple night tone
    grd.addColorStop(0.5, '#0b1324'); // Deep blue
    grd.addColorStop(1, '#030205'); // Absolute dark
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

    // Decorative ambient glow orbs
    const drawGlow = (gx, gy, gr, color) => {
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    };
    drawGlow(width * 0.2, 0, 900, 'rgba(138, 43, 226, 0.15)'); // Purple top-left
    drawGlow(width * 0.8, height, 1000, 'rgba(255, 192, 0, 0.1)'); // Gold bottom-right

    // Starry Noise/Texture
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 6000; i++) {
        const s = Math.random() * 2 + 1;
        ctx.fillRect(Math.random() * width, Math.random() * height, s, s);
    }

    // --- 2. Header ---
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFC000'; // Gold
    ctx.font = 'bold 130px "Russo One", sans-serif';
    ctx.fillText("WRAPPED", width / 2, 140);
    
    // Decorator line
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(width / 2 - 200, 210, 400, 2);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '300 36px "Outfit", sans-serif';
    ctx.letterSpacing = "12px";
    ctx.fillText(`${displayYear} EDITION`, width / 2, 240);
    ctx.letterSpacing = "0px"; // Reset

    // --- 3. Bento Grid Helper ---
    const drawCard = (x, y, w, h, title, value, sub, iconFallback = '⭐') => {
        // Card Background
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        drawRoundedRect(ctx, x, y, w, h, 24, ctx.fillStyle);
        
        // Subtle Border
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.stroke();

        ctx.textBaseline = 'middle';

        // Title Row
        ctx.fillStyle = 'rgba(255, 192, 0, 0.15)';
        ctx.beginPath();
        ctx.arc(x + 45, y + 45, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFC000';
        ctx.font = '20px "Outfit"';
        ctx.textAlign = 'center';
        ctx.fillText(iconFallback, x + 45, y + 47);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#BBBBBB';
        ctx.font = 'bold 22px "Outfit", sans-serif';
        ctx.fillText(title.toUpperCase(), x + 75, y + 45);

        // Value (Center aligned within the card)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFC000';
        // Sub gets drawn at y + h - 40. Midpoint between title line (y+45) and sub (y+h-40) is generally y + h/2.
        fitText(ctx, value ? String(value) : "?", x + w / 2, y + h / 2 + 10, w - 30, 70);

        // Subtitle
        if (sub) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'italic 22px "Outfit", sans-serif';
            ctx.fillText(sub, x + w / 2, y + h - 35);
        }
    };

    // --- ROW 1: General Stats ---
    const r1Y = 320;
    const cardH = 220;
    const halfW = 440;
    
    // Volume Card
    let volSub = stats.equivalence && stats.equivalence.label ? stats.equivalence.label.split(' ')[0] + " Bouteilles d'eau" : "Incroyable !";
    drawCard(80, r1Y, halfW, cardH, "Volume Total", stats.totalLiters + "L", volSub, '🌊');

    // Unique Beers Card
    drawCard(560, r1Y, halfW, cardH, "Découvertes", stats.uniqueBeers, "Bières Uniques", '🧭');

    // --- ROW 2: Spotlight ---
    const spotY = 570;
    const spotH = 500;

    // Spotlight Backglow
    const sg = ctx.createRadialGradient(width / 2, spotY + 230, 0, width / 2, spotY + 230, 350);
    sg.addColorStop(0, 'rgba(255, 192, 0, 0.12)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, spotY, width, spotH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFC000';
    ctx.font = 'bold 30px "Outfit", sans-serif';
    ctx.letterSpacing = "6px";
    ctx.fillText("TOP BIÈRE", width / 2, spotY + 20);
    ctx.letterSpacing = "0px";

    // Bottle Image
    let textY = spotY + 440; 
    if (favoriteBeer && favoriteBeer.image) {
        try {
            const img = await loadImage(favoriteBeer.image);
            const imgH = 350; 
            const imgW = imgH * (img.width / img.height);

            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 40;
            ctx.shadowOffsetY = 25;
            drawImageProp(ctx, img, 0, 0, img.width, img.height, (width / 2) - (imgW / 2), spotY + 60, imgW, imgH);
            ctx.restore();
        } catch (e) { /* fallback empty */ }
    } else {
        ctx.fillStyle = '#444';
        ctx.font = '100px "Outfit"';
        ctx.fillText('🍺', width / 2, spotY + 230);
    }

    // Name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 50px "Russo One", sans-serif';
    fitText(ctx, favoriteBeer ? favoriteBeer.title || favoriteBeer.name : "Aucune", width / 2, textY, 900, 50);

    ctx.fillStyle = '#AAAAAA';
    ctx.font = 'italic 26px "Outfit", sans-serif';
    ctx.fillText(`Dégustée ${favoriteBeer ? favoriteBeer.count : 0} fois`, width / 2, textY + 50);

    // --- ROW 3: Detailed Stats ---
    const r3Y = 1110;

    let brewText = stats.favoriteBrewery ? stats.favoriteBrewery[0] : "Inconnue";
    let brewSub = stats.favoriteBrewery ? `${stats.favoriteBrewery[1]} bières` : "Plus de données requises";
    drawCard(80, r3Y, halfW, cardH, "Top Brasserie", brewText, brewSub, '🏭');

    let monthText = stats.topMonth ? stats.topMonth.name : "Inconnu";
    let monthSub = stats.topMonth ? `Mois très festif (${stats.topMonth.count})` : "Plus de données requises";
    drawCard(560, r3Y, halfW, cardH, "Mois Festif", monthText, monthSub, '📅');

    // --- ROW 4: Style ---
    const r4Y = 1360;
    drawCard(80, r4Y, 920, 200, "Style Préféré", stats.favoriteStyle || "Inconnu", "Vous avez du beau goût !", '🏆');


    // --- 5. Footer ---
    const footerY = 1750;

    // Logo
    try {
        const logo = await loadImage(LOGO_PATH);
        const logoW = 100;
        const logoH = logoW * (logo.height / logo.width);
        drawImageProp(ctx, logo, 0, 0, logo.width, logo.height, (width / 2) - (logoW / 2), footerY - 100, logoW, logoH);
    } catch (e) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 45px "Russo One", sans-serif';
        ctx.fillText("BEERDEX", width / 2, footerY - 50);
    }

    // URL
    ctx.fillStyle = '#FFC000';
    ctx.font = 'bold 36px "Russo One", sans-serif';
    ctx.fillText("beerdex.be", width / 2, footerY + 30);

    // Tagline
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'italic 24px "Outfit", sans-serif';
    ctx.fillText("Disponible sur Android et iOS", width / 2, footerY + 80);

    // Restore default baseline just to be safe for other generations
    ctx.textBaseline = 'alphabetic';

    return new Promise(resolve => {
        canvas.toBlob(blob => {
            resolve(blob);
        }, 'image/png', 0.95);
    });
}

/**
 * Native Web Share API wrapper
 */
export async function shareImage(blob, title, apiLink = null) {
    if (!blob) {
        if (window.UI && window.UI.showAlertModal) window.UI.showAlertModal("Erreur: Image non générée (Blob invalide)", { icon: '⚠️' });
        else console.error("Erreur: Image non générée (Blob invalide)");
        return;
    }

    // 1. Force Download (Desktop/Mobile)
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beerdex-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // keep url alive for preview
    } catch (e) {
        console.warn("Download failed, proceeding to preview", e);
    }

    // 2. Show Preview (with API Link if provided)
    createFullscreenPreview(blob, apiLink);
}

export function createFullscreenPreview(blob, apiLink) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const overlay = document.createElement('div');
    overlay.className = 'story-overlay'; // Re-use story styling for consistent look
    overlay.style.background = 'rgba(0,0,0,0.95)';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';

    // Image
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.maxHeight = apiLink ? '60%' : '85%'; // Reduce height if link is shown
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.borderRadius = '12px';
    img.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';

    overlay.appendChild(img);

    // API Link Section
    if (apiLink) {
        const linkContainer = document.createElement('div');
        linkContainer.style.width = '100%';
        linkContainer.style.maxWidth = '600px';
        linkContainer.style.marginTop = '20px';
        linkContainer.style.textAlign = 'left';

        const label = document.createElement('div');
        label.innerHTML = '🔗 <strong>API Link</strong> (Generation)';
        label.style.color = '#FFC000';
        label.style.marginBottom = '5px';
        label.style.fontSize = '0.9rem';

        const textarea = document.createElement('textarea');
        textarea.value = apiLink;
        textarea.readOnly = true;
        textarea.style.width = '100%';
        textarea.style.height = '80px';
        textarea.style.background = '#222';
        textarea.style.color = '#aaa';
        textarea.style.border = '1px solid #444';
        textarea.style.borderRadius = '8px';
        textarea.style.padding = '10px';
        textarea.style.fontSize = '0.8rem';
        textarea.onclick = () => textarea.select();

        linkContainer.appendChild(label);
        linkContainer.appendChild(textarea);
        overlay.appendChild(linkContainer);
    }

    // Close Hint
    const hint = document.createElement('div');
    hint.innerHTML = '<div style="font-size:2rem; margin-bottom:10px;">✖️</div>Fermer';
    hint.style.color = '#fff';
    hint.style.marginTop = '20px';
    hint.style.cursor = 'pointer';
    hint.onclick = () => {
        document.body.removeChild(overlay);
        URL.revokeObjectURL(url);
    };

    overlay.appendChild(hint);
    document.body.appendChild(overlay);
}

// --- Helpers ---

function drawRoundedRect(ctx, x, y, width, height, radius, fill) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Important for local files or CORS
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Scale image like object-fit: contain
 */
function drawImageProp(ctx, img, x, y, w, h, offsetX, offsetY, containerW, containerH) {
    // Calculate aspect ratio
    const r = Math.min(containerW / w, containerH / h);
    const nw = w * r;
    const nh = h * r;
    const cx = (containerW - nw) / 2;
    const cy = (containerH - nh) / 2;
    ctx.drawImage(img, x, y, w, h, offsetX + cx, offsetY + cy, nw, nh);
}

function fitText(ctx, text, x, y, maxWidth, initialFontSize) {
    let fontSize = initialFontSize;
    ctx.font = `bold ${fontSize}px "Russo One", sans-serif`;
    while (ctx.measureText(text).width > maxWidth && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Russo One", sans-serif`;
    }
    ctx.fillText(text, x, y);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}
