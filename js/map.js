import * as Storage from './storage.js';

let breweryData = null;
let mapCaches = {}; // cache for svg contents

// Map detection initialization
let currentMapScope = localStorage.getItem('defaultMapScope');
if (!currentMapScope) {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz.includes('Paris')) currentMapScope = 'fr';
        else if (tz.includes('Berlin')) currentMapScope = 'de';
        else if (tz.includes('Amsterdam')) currentMapScope = 'nl';
        else if (tz.includes('America') && !tz.includes('Bogota')) currentMapScope = 'us';
        else if (tz.includes('Bogota')) currentMapScope = 'co';
        else if (tz.startsWith('Europe')) currentMapScope = 'eu';
        else currentMapScope = 'wo'; // default fallback for other regions
    } catch (e) {
        currentMapScope = 'wo';
    }
}
// Special case overriding for specific apps
if (currentMapScope === 'wo' && Intl.DateTimeFormat().resolvedOptions().timeZone.includes('Brussels')) {
    currentMapScope = 'be';
}

export const MAPS = {
    'be': { title: '🇧🇪 Belgique', svg: 'images/belgium.svg', countryCode: 'BE', names: { 'ANT': 'Antwerpen', 'LIM': 'Limburg', 'VBR': 'Vlaams-Brabant', 'BRU': 'Bruxelles', 'WBR': 'Brabant Wallon', 'HAI': 'Hainaut', 'NAM': 'Namur', 'LIE': 'Liège', 'LUX': 'Luxembourg', 'WVL': 'West-Vlaanderen', 'OVL': 'Oost-Vlaanderen' }},
    'fr': { title: '🇫🇷 France', svg: 'images/fr.svg', countryCode: 'FR', names: { 'FRHDF': 'Hauts-de-France', 'FRGES': 'Grand Est', 'FRPAC': "Provence-Alpes-Côte d'Azur", 'FRARA': 'Auvergne-Rhône-Alpes', 'FRBFC': 'Bourgogne-Franche-Comté', 'FROCC': 'Occitanie', 'FRPDL': 'Pays de la Loire', 'FRBRE': 'Bretagne', 'FRNOR': 'Normandie', 'FR20R': 'Corse', 'FRNAQ': 'Nouvelle-Aquitaine', 'FRCVL': 'Centre-Val de Loire', 'FRIDF': 'Île-de-France' } },
    'de': { title: '🇩🇪 Allemagne', svg: 'images/de.svg', countryCode: 'DE', names: { 'DESN': 'Sachsen', 'DEBY': 'Bayern', 'DERP': 'Rheinland-Pfalz', 'DESL': 'Saarland', 'DESH': 'Schleswig-Holstein', 'DENI': 'Niedersachsen', 'DENW': 'Nordrhein-Westfalen', 'DEBW': 'Baden-Württemberg', 'DEBB': 'Brandenburg', 'DEMV': 'Mecklenburg-Vorpommern', 'DEHB': 'Bremen', 'DEHH': 'Hamburg', 'DEHE': 'Hessen', 'DETH': 'Thüringen', 'DEST': 'Sachsen-Anhalt', 'DEBE': 'Berlin' } },
    'nl': { title: '🇳🇱 Pays-Bas', svg: 'images/nl.svg', countryCode: 'NL', names: { 'NLGR': 'Groningen', 'NLDR': 'Drenthe', 'NLOV': 'Overijssel', 'NLGE': 'Gelderland', 'NLLI': 'Limburg', 'NLZE': 'Zeeland', 'NLNB': 'Noord-Brabant', 'NLZH': 'Zuid-Holland', 'NLNH': 'Noord-Holland', 'NLFR': 'Friesland', 'NLFL': 'Flevoland', 'NLUT': 'Utrecht' } },
    'us': { title: '🇺🇸 États-Unis', svg: 'images/us.svg', countryCode: 'US', names: { 'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'Californie','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Floride','GA':'Géorgie','HI':'Hawaï','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiane','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'Nouveau-Mexique','NY':'New York','NC':'Caroline du Nord','ND':'Dakota du Nord','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvanie','RI':'Rhode Island','SC':'Caroline du Sud','SD':'Dakota du Sud','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginie','WA':'État de Washington','WV':'Virginie-Occidentale','WI':'Wisconsin','WY':'Wyoming' } },
    'co': { title: '🇨🇴 Colombie', svg: 'images/co.svg', countryCode: 'CO', names: { 'COCUN': 'Cundinamarca', 'COANT': 'Antioquia', 'COVAL': 'Valle del Cauca', 'COATL': 'Atlántico', 'COBOL': 'Bolívar', 'COSAN': 'Santander', 'COMB': 'Bogotá D.C.' } },
    'eu': { title: '🇪🇺 Europe', svg: 'images/europe.svg', isContinental: true, names: { 'BE': 'Belgique', 'FR': 'France', 'DE': 'Allemagne', 'NL': 'Pays-Bas', 'ES': 'Espagne', 'IE': 'Irlande', 'GB': 'Grande-Bretagne', 'DK': 'Danemark' } },
    'wo': { title: '🌍 Monde', svg: 'images/world.svg', isContinental: true, names: { 'BE': 'Belgique', 'FR': 'France', 'DE': 'Allemagne', 'NL': 'Pays-Bas', 'US': 'États-Unis', 'CO': 'Colombie', 'AU': 'Australie', 'ES': 'Espagne', 'IE': 'Irlande', 'GB': 'Grande-Bretagne', 'DK': 'Danemark' } }
};

export async function renderMapWithData(container, historyWithBreweries) {
    if (!breweryData) {
        try {
            const brewResp = await fetch('data/breweries.json');
            breweryData = await brewResp.json();
            // User country detection for default map could be handled here or externally
        } catch (e) {
            console.error("Failed to load breweries", e);
            container.innerHTML = `<div class="p-20 text-red">Erreur chargement brasseries</div>`;
            return;
        }
    }

    const mapConfig = MAPS[currentMapScope];

    if (!mapCaches[currentMapScope]) {
        try {
            const svgResp = await fetch(mapConfig.svg);
            let svgText = await svgResp.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgRoot = doc.documentElement;
            svgRoot.removeAttribute('width');
            svgRoot.removeAttribute('height');
            svgRoot.style.width = "100%";
            svgRoot.style.height = "auto";
            if (!svgRoot.hasAttribute('viewBox')) {
                svgRoot.setAttribute('viewBox', '0 0 752 611'); // approximate fallback
            }
            mapCaches[currentMapScope] = new XMLSerializer().serializeToString(doc);
        } catch (e) {
            console.error("Failed to load map asset", e);
            container.innerHTML = `<div class="p-20 text-red">Erreur chargement carte</div>`;
            return;
        }
    }

    const stats = {};

    historyWithBreweries.forEach(item => {
        const brewName = (item.beer.brewery || "").toLowerCase();
        const beerName = item.beer.title;

        if (!brewName) return;

        const match = breweryData.find(b => b.name.toLowerCase() === brewName || brewName.includes(b.name.toLowerCase()));
        
        if (match && match.country) {
            let svgId;
            let provCode;
            
            if (mapConfig.isContinental) {
                // Continental maps aggregate by Country Code
                // Only track if it matches the continental scope (EU vs WO could be filtered if needed, but world handles all)
                // Assuming EUROPE SVG has European country IDs, and WORLD has everything
                svgId = match.country;
                provCode = match.country;
            } else if (match.country === mapConfig.countryCode && match.province) {
                // Country maps aggregate by Province Code
                svgId = match.province;
                provCode = match.province;
                
                // Hotfix for Belgian SVGs which prefix the province ID with "BE-"
                if (currentMapScope === 'be' && !svgId.startsWith('BE-')) {
                    const BE_MAPPING = { 'ANT': 'BE-VAN', 'LIM': 'BE-VLI', 'WVL': 'BE-VWV', 'OVL': 'BE-VOV', 'VBR': 'BE-VBR', 'BRU': 'BE-BRU', 'WBR': 'BE-WBR', 'HAI': 'BE-WHT', 'NAM': 'BE-WNA', 'LIE': 'BE-WLG', 'LUX': 'BE-WLX' };
                    svgId = BE_MAPPING[svgId] || svgId;
                }
            } else {
                return; // Doesn't match current country map scope
            }

            if (!stats[svgId]) stats[svgId] = { count: 0, beers: new Set(), provCode: provCode };
            stats[svgId].beers.add(beerName);
            stats[svgId].count = stats[svgId].beers.size;
        }
    });

    const switcherHtml = `
        <div style="display:flex; overflow-x:auto; gap:10px; margin-bottom:15px; padding-bottom:5px; scrollbar-width: none;">
            ${Object.keys(MAPS).map(scope => `
                <button class="map-switch-btn ${scope === currentMapScope ? 'active' : ''}" data-scope="${scope}" 
                    style="background: ${scope === currentMapScope ? 'var(--accent-gold)' : 'rgba(255,255,255,0.05)'}; 
                           color: ${scope === currentMapScope ? '#000' : '#fff'};
                           border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; font-family:'Russo One'; 
                           font-size:0.9rem; flex-shrink:0; cursor:pointer; transition:0.3s; white-space:nowrap;">
                    ${MAPS[scope].title}
                </button>
            `).join('')}
        </div>
    `;

    container.innerHTML = `
        ${switcherHtml}
        <div id="map-wrapper" style="position:relative; width:100%; height:auto; background:#111; border-radius:12px; overflow:hidden; padding:10px;">
            ${mapCaches[currentMapScope]}
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

    // Event listeners for switcher
    container.querySelectorAll('.map-switch-btn').forEach(btn => {
        btn.onclick = () => {
            currentMapScope = btn.getAttribute('data-scope');
            
            // Allow the user to save default?
            // Actually, an explicit Settings modal is better, but maybe long-press or auto-save?
            // Let's just automatically set it when they click? No, the explicit setting was requested maybe.
            // "Permet de choisir la map par défaut dans les paramètres, et affiche par défaut celle du pays de l'utilisateur"
            // So if they want to override, they do it in parameters. For the switcher, it's temporary.
            
            renderMapWithData(container, historyWithBreweries); // Re-render
        };
    });

    const svgEl = container.querySelector('svg');
    if (svgEl) {
        applyHeatmap(svgEl, stats, container.querySelector('#map-tooltip'), mapConfig);
    }
}

function applyHeatmap(svg, stats, tooltip, mapConfig) {
    const paths = svg.querySelectorAll('path');

    paths.forEach(p => {
        p.style.fill = '#222';
        p.style.stroke = '#444';
        p.style.strokeWidth = '1px';
        p.style.transition = 'fill 0.4s ease, stroke 0.4s ease'; 
        p.style.cursor = 'pointer';

        // Check if this path ID is in stats
        const svgId = p.getAttribute('id');
        if (svgId && stats[svgId]) {
            const data = stats[svgId];
            const count = data.count;
            const regionName = mapConfig.names[data.provCode] || svgId;

            let fill = '#222';
            if (count >= 1) fill = '#f1c40f';
            if (count >= 3) fill = '#f39c12';
            if (count >= 5) fill = '#d35400';
            if (count >= 8) fill = '#c0392b';
            if (count >= 12) fill = '#8e44ad';
            if (count >= 15) fill = '#2c3e50';

            p.style.fill = fill;
            p.style.stroke = '#FFF';
            p.style.strokeWidth = '1.5px';
            p.parentNode.appendChild(p);

            const showTooltip = (e) => {
                p.style.filter = 'brightness(1.2) drop-shadow(0 0 5px rgba(255,255,255,0.3))';

                const beerList = Array.from(data.beers);
                const displayedBeers = beerList.slice(0, 5);
                const remaining = beerList.length - 5;

                let listHtml = displayedBeers.map(b => `<div style="text-align:left; font-size:0.85em;">• ${b}</div>`).join('');
                if (remaining > 0) {
                    listHtml += `<div style="text-align:left; font-size:0.8em; color:#aaa; margin-top:3px;">+ ${remaining} autres...</div>`;
                }

                tooltip.innerHTML = `
                    <div style="text-align:center;">
                        <strong style="color:var(--accent-gold); font-family:'Russo One'; font-size:1.1em;">${regionName}</strong>
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
                p.style.filter = 'none';
                tooltip.style.opacity = 0;
            };

            p.onmouseenter = showTooltip;
            p.onmouseleave = hideTooltip;
            p.onclick = (e) => {
                e.stopPropagation();
                showTooltip(e);
            };
        }
    });
}
