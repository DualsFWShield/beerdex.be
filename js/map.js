/**
 * map.js
 * Logic for "La Carte de la Soif" (Beer Map)
 * Loads images/belgium.svg and applies Heatmap coloring.
 */
import * as Storage from './storage.js';

let breweryData = null;
let svgContent = null;

// Mapping: My Internal Code -> New SVG ID
const ID_MAPPING = {
    'ANT': 'BE-VAN', // Antwerpen
    'LIM': 'BE-VLI', // Limburg
    'WVL': 'BE-VWV', // West-Vlaanderen
    'OVL': 'BE-VOV', // Oost-Vlaanderen
    'VBR': 'BE-VBR', // Vlaams-Brabant
    'BRU': 'BE-BRU', // Brussels
    'WBR': 'BE-WBR', // Brabant Wallon
    'HAI': 'BE-WHT', // Hainaut (Wait, SVG says BE-WHT for Hainaut? Yes usually BE-WHT)
    'NAM': 'BE-WNA', // Namur
    'LIE': 'BE-WLG', // Liege
    'LUX': 'BE-WLX'  // Luxembourg
};

// SVG ID 'BE-WHT' from file check logic:
// <path ... title="Hainaut" id="BE-WHT" /> -> Confirmed.

export async function renderMapWithData(container, historyWithBreweries) {
    if (!breweryData || !svgContent) {
        try {
            const [brewResp, svgResp] = await Promise.all([
                !breweryData ? fetch('data/breweries.json') : Promise.resolve({ json: () => breweryData }),
                !svgContent ? fetch('images/belgium.svg') : Promise.resolve({ text: () => svgContent })
            ]);

            if (!breweryData) breweryData = await brewResp.json();
            if (!svgContent) svgContent = await svgResp.text();

            // Clean SVG
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgContent, 'image/svg+xml');
            const svgRoot = doc.documentElement;

            // Ensure full width via CSS, remove fixed attributes to allow scaling
            svgRoot.removeAttribute('width');
            svgRoot.removeAttribute('height');
            svgRoot.style.width = "100%";
            svgRoot.style.height = "auto";

            // Check viewbox - file has mapsvg:geoViewBox but maybe standard viewBox?
            // width="752.16895" height="611.36615"
            if (!svgRoot.hasAttribute('viewBox')) {
                svgRoot.setAttribute('viewBox', '0 0 752 611');
            }

            svgContent = new XMLSerializer().serializeToString(doc);

        } catch (e) {
            console.error("Failed to load map assets", e);
            container.innerHTML = `<div class="p-20 text-red">Erreur chargement carte</div>`;
            return;
        }
    }

    // Process Stats (Unique Beers)
    const stats = {};
    Object.keys(ID_MAPPING).forEach(k => stats[k] = {
        count: 0,
        beers: new Set()
    });

    console.log("Map Debug: Loaded Brewery Data", Array.isArray(breweryData), breweryData.length);

    let matchCount = 0;
    let unmatchedCount = 0;

    // Debug: Track unmatched breweries to help user/dev
    const unmatchedBreweries = new Set();

    historyWithBreweries.forEach(item => {
        const brewName = (item.beer.brewery || "").toLowerCase();
        // FIX: Use .title instead of .name
        const beerName = item.beer.title;

        if (!brewName) {
            unmatchedCount++;
            return;
        }

        let foundCode = null;

        // New structure: Array of { name, province }
        // We look for a known brewery name inside the user's brewery string
        const match = breweryData.find(b => {
            // Robust match: Check if data entry has province AND if names match
            // Also handle partial matches better if needed
            return b.province && b.province.length === 3 && brewName.includes(b.name.toLowerCase());
        });

        if (match) {
            foundCode = match.province;
            matchCount++;
        } else {
            unmatchedCount++;
            unmatchedBreweries.add(item.beer.brewery);
        }

        if (foundCode && stats[foundCode]) {
            stats[foundCode].beers.add(beerName);
            stats[foundCode].count = stats[foundCode].beers.size;
        }
    });

    console.log(`Map Debug: Matched ${matchCount} beers. Unmatched: ${unmatchedCount}.`);
    if (unmatchedBreweries.size > 0) {
        console.warn("Map Debug: Unmatched Breweries:", Array.from(unmatchedBreweries));
    }
    console.log("Map Debug: Stats", stats);

    container.innerHTML = `
        <h3 style="margin-bottom:10px;">Carte de la Soif 🇧🇪</h3>
        <div id="map-wrapper" style="position:relative; width:100%; height:auto; background:#111; border-radius:12px; overflow:hidden; padding:10px;">
            ${svgContent}
            <div id="map-tooltip" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(0,0,0,0.9); padding:10px 15px; border-radius:8px; font-size:0.9rem; pointer-events:none; opacity:0; transition:opacity 0.2s; border:1px solid var(--accent-gold); color:#FFF; z-index:10; pointer-events: none; white-space: nowrap;">
                Info
            </div>
        </div>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:5px; font-size:0.8rem; color:#888;">
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#f1c40f; display:inline-block; border-radius:50%; margin-right:4px;"></span>1+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#f39c12; display:inline-block; border-radius:50%; margin-right:4px;"></span>3+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#d35400; display:inline-block; border-radius:50%; margin-right:4px;"></span>5+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#c0392b; display:inline-block; border-radius:50%; margin-right:4px;"></span>8+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#8e44ad; display:inline-block; border-radius:50%; margin-right:4px;"></span>12+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#2c3e50; display:inline-block; border-radius:50%; margin-right:4px;"></span>15+</span>
        </div>
    `;

    const svgEl = container.querySelector('svg');
    if (svgEl) {
        applyHeatmap(svgEl, stats, container.querySelector('#map-tooltip'));
    }
}

function applyHeatmap(svg, stats, tooltip) {
    // Reset all paths
    const paths = svg.querySelectorAll('path');
    console.log("Map Debug: Total paths found in SVG:", paths.length);

    paths.forEach(p => {
        p.style.fill = '#222';
        p.style.stroke = '#444';
        p.style.strokeWidth = '1px';
        p.style.transition = 'fill 0.4s ease, stroke 0.4s ease'; // Smooth transition
        p.style.cursor = 'pointer';
    });

    Object.entries(ID_MAPPING).forEach(([myCode, svgId]) => {
        // svg.getElementById is not standard on elements. Use querySelector.
        const el = svg.querySelector(`#${svgId}`);

        if (!el) {
            console.warn(`Map Debug: Could not find element for ${myCode} -> #${svgId}`);
            return;
        }

        const data = stats[myCode] || { count: 0, beers: new Set() };
        const count = data.count;

        const name = {
            'ANT': 'Antwerpen', 'LIM': 'Limburg', 'VBR': 'Vlaams-Brabant',
            'BRU': 'Bruxelles', 'WBR': 'Brabant Wallon', 'HAI': 'Hainaut',
            'NAM': 'Namur', 'LIE': 'Liège', 'LUX': 'Luxembourg',
            'WVL': 'West-Vlaanderen', 'OVL': 'Oost-Vlaanderen'
        }[myCode] || myCode;

        // Progressive Color Scale (Darker/Richer)
        let fill = '#222';
        if (count >= 1) fill = '#f1c40f';  // Yellow (Brighter start)
        if (count >= 3) fill = '#f39c12';  // Darker Yellow/Orange
        if (count >= 5) fill = '#d35400';  // Pumpkin
        if (count >= 8) fill = '#c0392b';  // Deep Red
        if (count >= 12) fill = '#8e44ad'; // Purple
        if (count >= 15) fill = '#2c3e50'; // Dark Blue/Grey (Maximum Intensity)

        el.style.fill = fill;

        if (count > 0) {
            el.style.stroke = '#FFF';
            el.style.strokeWidth = '1.5px';
            // Bring to front logic for SVG (append to parent)
            el.parentNode.appendChild(el);
        }

        // Interaction
        const showTooltip = (e) => {
            el.style.filter = 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.3))';

            // Convert Set to Array and limit display
            const beerList = Array.from(data.beers);
            const displayedBeers = beerList.slice(0, 5);
            const remaining = beerList.length - 5;

            let listHtml = displayedBeers.map(b => `<div style="text-align:left; font-size:0.85em;">• ${b}</div>`).join('');
            if (remaining > 0) {
                listHtml += `<div style="text-align:left; font-size:0.8em; color:#aaa; margin-top:3px;">+ ${remaining} autres...</div>`;
            }

            tooltip.innerHTML = `
                <div style="text-align:center;">
                    <strong style="color:var(--accent-gold); font-family:'Russo One'; font-size:1.1em;">${name}</strong>
                    <div style="margin-top:4px; font-size:0.9em; color:#ddd; margin-bottom:5px;">
                        ${count} bière${count > 1 ? 's' : ''} unique${count > 1 ? 's' : ''}
                    </div>
                    <div style="border-top:1px solid #444; padding-top:5px; margin-top:5px;">
                        ${listHtml}
                    </div>
                </div>
             `;
            tooltip.style.opacity = 1;
        };
        const hideTooltip = () => {
            el.style.filter = 'none';
            tooltip.style.opacity = 0;
        };

        el.onmouseenter = showTooltip;
        el.onmouseleave = hideTooltip;
        el.onclick = (e) => {
            e.stopPropagation();
            showTooltip(e);
        };
    });
}
