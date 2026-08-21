import * as Storage from './storage.js';

import { i18n } from './i18n.js';

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
        else if (tz.includes('Seoul')) currentMapScope = 'kr';
        else if (tz.includes('Tokyo')) currentMapScope = 'jp';
        else if (tz.includes('Shanghai') || tz.includes('Beijing') || tz.includes('Chongqing') || tz.includes('Urumqi') || tz.includes('Hong_Kong') || tz.includes('Taipei')) currentMapScope = 'cn';
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
    'be': { 
        titleKey: 'country_be', icon: '🇧🇪', svg: 'images/belgium.svg', countryCode: 'BE', 
        names: { 'ANT': 'Antwerpen', 'LIM': 'Limburg', 'VBR': 'Vlaams-Brabant', 'BRU': 'Bruxelles', 'WBR': 'Brabant Wallon', 'HAI': 'Hainaut', 'NAM': 'Namur', 'LIE': 'Liège', 'LUX': 'Luxembourg', 'WVL': 'West-Vlaanderen', 'OVL': 'Oost-Vlaanderen' },
        names_en: { 'ANT': 'Antwerp', 'LIM': 'Limburg', 'VBR': 'Flemish Brabant', 'BRU': 'Brussels', 'WBR': 'Walloon Brabant', 'HAI': 'Hainaut', 'NAM': 'Namur', 'LIE': 'Liège', 'LUX': 'Luxembourg', 'WVL': 'West Flanders', 'OVL': 'East Flanders' }
    },
    'fr': { 
        titleKey: 'country_fr', icon: '🇫🇷', svg: 'images/fr.svg', countryCode: 'FR', 
        names: { 'FRHDF': 'Hauts-de-France', 'FRGES': 'Grand Est', 'FRPAC': "Provence-Alpes-Côte d'Azur", 'FRARA': 'Auvergne-Rhône-Alpes', 'FRBFC': 'Bourgogne-Franche-Comté', 'FROCC': 'Occitanie', 'FRPDL': 'Pays de la Loire', 'FRBRE': 'Bretagne', 'FRNOR': 'Normandie', 'FR20R': 'Corse', 'FRNAQ': 'Nouvelle-Aquitaine', 'FRCVL': 'Centre-Val de Loire', 'FRIDF': 'Île-de-France' },
        names_en: { 'FRHDF': 'Hauts-de-France', 'FRGES': 'Grand Est', 'FRPAC': "Provence-Alpes-Côte d'Azur", 'FRARA': 'Auvergne-Rhône-Alpes', 'FRBFC': 'Bourgogne-Franche-Comté', 'FROCC': 'Occitanie', 'FRPDL': 'Pays de la Loire', 'FRBRE': 'Brittany', 'FRNOR': 'Normandy', 'FR20R': 'Corsica', 'FRNAQ': 'Nouvelle-Aquitaine', 'FRCVL': 'Centre-Val de Loire', 'FRIDF': 'Île-de-France' }
    },
    'de': { 
        titleKey: 'country_de', icon: '🇩🇪', svg: 'images/de.svg', countryCode: 'DE', 
        names: { 'DESN': 'Sachsen', 'DEBY': 'Bayern', 'DERP': 'Rheinland-Pfalz', 'DESL': 'Saarland', 'DESH': 'Schleswig-Holstein', 'DENI': 'Niedersachsen', 'DENW': 'Nordrhein-Westfalen', 'DEBW': 'Baden-Württemberg', 'DEBB': 'Brandenburg', 'DEMV': 'Mecklenburg-Vorpommern', 'DEHB': 'Bremen', 'DEHH': 'Hamburg', 'DEHE': 'Hessen', 'DETH': 'Thüringen', 'DEST': 'Sachsen-Anhalt', 'DEBE': 'Berlin' },
        names_en: { 'DESN': 'Saxony', 'DEBY': 'Bavaria', 'DERP': 'Rhineland-Palatinate', 'DESL': 'Saarland', 'DESH': 'Schleswig-Holstein', 'DENI': 'Lower Saxony', 'DENW': 'North Rhine-Westphalia', 'DEBW': 'Baden-Württemberg', 'DEBB': 'Brandenburg', 'DEMV': 'Mecklenburg-Western Pomerania', 'DEHB': 'Bremen', 'DEHH': 'Hamburg', 'DEHE': 'Hesse', 'DETH': 'Thuringia', 'DEST': 'Saxony-Anhalt', 'DEBE': 'Berlin' }
    },
    'nl': { 
        titleKey: 'country_nl', icon: '🇳🇱', svg: 'images/nl.svg', countryCode: 'NL', 
        names: { 'NLGR': 'Groningen', 'NLDR': 'Drenthe', 'NLOV': 'Overijssel', 'NLGE': 'Gelderland', 'NLLI': 'Limburg', 'NLZE': 'Zeeland', 'NLNB': 'Noord-Brabant', 'NLZH': 'Zuid-Holland', 'NLNH': 'Noord-Holland', 'NLFR': 'Friesland', 'NLFL': 'Flevoland', 'NLUT': 'Utrecht' },
        names_en: { 'NLGR': 'Groningen', 'NLDR': 'Drenthe', 'NLOV': 'Overijssel', 'NLGE': 'Gelderland', 'NLLI': 'Limburg', 'NLZE': 'Zeeland', 'NLNB': 'North Brabant', 'NLZH': 'South Holland', 'NLNH': 'North Holland', 'NLFR': 'Friesland', 'NLFL': 'Flevoland', 'NLUT': 'Utrecht' }
    },
    'us': { 
        titleKey: 'country_us', icon: '🇺🇸', svg: 'images/us.svg', countryCode: 'US', 
        names: { 'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'Californie','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Floride','GA':'Géorgie','HI':'Hawaï','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiane','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'Nouveau-Mexique','NY':'New York','NC':'Caroline du Nord','ND':'Dakota du Nord','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvanie','RI':'Rhode Island','SC':'Caroline du Sud','SD':'Dakota du Sud','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginie','WA':'État de Washington','WV':'Virginie-Occidentale','WI':'Wisconsin','WY':'Wyoming' },
        names_en: { 'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming' }
    },
    'co': { 
        titleKey: 'country_co', icon: '🇨🇴', svg: 'images/co.svg', countryCode: 'CO', 
        names: { 'COCUN': 'Cundinamarca', 'COANT': 'Antioquia', 'COVAL': 'Valle del Cauca', 'COATL': 'Atlántico', 'COBOL': 'Bolívar', 'COSAN': 'Santander', 'COMB': 'Bogotá D.C.', 'COBOY': 'Boyacá' },
        names_en: { 'COCUN': 'Cundinamarca', 'COANT': 'Antioquia', 'COVAL': 'Valle del Cauca', 'COATL': 'Atlántico', 'COBOL': 'Bolívar', 'COSAN': 'Santander', 'COMB': 'Bogotá D.C.', 'COBOY': 'Boyacá' }
    },
    'kr': { 
        titleKey: 'country_kr', icon: '🇰🇷', svg: 'images/kr.svg', countryCode: 'KR', 
        names: { 'KR11': 'Séoul', 'KR26': 'Busan', 'KR27': 'Daegu', 'KR28': 'Incheon', 'KR29': 'Gwangju', 'KR30': 'Daejeon', 'KR31': 'Ulsan', 'KR41': 'Gyeonggi', 'KR42': 'Gangwon', 'KR43': 'Chungcheong du Nord', 'KR44': 'Chungcheong du Sud', 'KR45': 'Jeolla du Nord', 'KR46': 'Jeolla du Sud', 'KR47': 'Gyeongsang du Nord', 'KR48': 'Gyeongsang du Sud', 'KR49': 'Jeju', 'KR50': 'Sejong' },
        names_en: { 'KR11': 'Seoul', 'KR26': 'Busan', 'KR27': 'Daegu', 'KR28': 'Incheon', 'KR29': 'Gwangju', 'KR30': 'Daejeon', 'KR31': 'Ulsan', 'KR41': 'Gyeonggi', 'KR42': 'Gangwon', 'KR43': 'North Chungcheong', 'KR44': 'South Chungcheong', 'KR45': 'North Jeolla', 'KR46': 'South Jeolla', 'KR47': 'North Gyeongsang', 'KR48': 'South Gyeongsang', 'KR49': 'Jeju', 'KR50': 'Sejong' }
    },
    'jp': { 
        titleKey: 'country_jp', icon: '🇯🇵', svg: 'images/jp.svg', countryCode: 'JP', 
        names: { 'JP01': 'Hokkaidō', 'JP02': 'Aomori', 'JP03': 'Iwate', 'JP04': 'Miyagi', 'JP05': 'Akita', 'JP06': 'Yamagata', 'JP07': 'Fukushima', 'JP08': 'Ibaraki', 'JP09': 'Tochigi', 'JP10': 'Gunma', 'JP11': 'Saitama', 'JP12': 'Chiba', 'JP13': 'Tokyo', 'JP14': 'Kanagawa', 'JP15': 'Niigata', 'JP16': 'Toyama', 'JP17': 'Ishikawa', 'JP18': 'Fukui', 'JP19': 'Yamanashi', 'JP20': 'Nagano', 'JP21': 'Gifu', 'JP22': 'Shizuoka', 'JP23': 'Aichi', 'JP24': 'Mie', 'JP25': 'Shiga', 'JP26': 'Kyōto', 'JP27': 'Ōsaka', 'JP28': 'Hyōgo', 'JP29': 'Nara', 'JP30': 'Wakayama', 'JP31': 'Tottori', 'JP32': 'Shimane', 'JP33': 'Okayama', 'JP34': 'Hiroshima', 'JP35': 'Yamaguchi', 'JP36': 'Tokushima', 'JP37': 'Kagawa', 'JP38': 'Ehime', 'JP39': 'Kōchi', 'JP40': 'Fukuoka', 'JP41': 'Saga', 'JP42': 'Nagasaki', 'JP43': 'Kumamoto', 'JP44': 'Ōita', 'JP45': 'Miyazaki', 'JP46': 'Kagoshima', 'JP47': 'Okinawa' },
        names_en: { 'JP01': 'Hokkaido', 'JP02': 'Aomori', 'JP03': 'Iwate', 'JP04': 'Miyagi', 'JP05': 'Akita', 'JP06': 'Yamagata', 'JP07': 'Fukushima', 'JP08': 'Ibaraki', 'JP09': 'Tochigi', 'JP10': 'Gunma', 'JP11': 'Saitama', 'JP12': 'Chiba', 'JP13': 'Tokyo', 'JP14': 'Kanagawa', 'JP15': 'Niigata', 'JP16': 'Toyama', 'JP17': 'Ishikawa', 'JP18': 'Fukui', 'JP19': 'Yamanashi', 'JP20': 'Nagano', 'JP21': 'Gifu', 'JP22': 'Shizuoka', 'JP23': 'Aichi', 'JP24': 'Mie', 'JP25': 'Shiga', 'JP26': 'Kyoto', 'JP27': 'Osaka', 'JP28': 'Hyogo', 'JP29': 'Nara', 'JP30': 'Wakayama', 'JP31': 'Tottori', 'JP32': 'Shimane', 'JP33': 'Okayama', 'JP34': 'Hiroshima', 'JP35': 'Yamaguchi', 'JP36': 'Tokushima', 'JP37': 'Kagawa', 'JP38': 'Ehime', 'JP39': 'Kochi', 'JP40': 'Fukuoka', 'JP41': 'Saga', 'JP42': 'Nagasaki', 'JP43': 'Kumamoto', 'JP44': 'Oita', 'JP45': 'Miyazaki', 'JP46': 'Kagoshima', 'JP47': 'Okinawa' }
    },
    'cn': { 
        titleKey: 'country_cn', icon: '🇨🇳', svg: 'images/cn.svg', countryCode: 'CN', 
        names: { 'CNSN': 'Shaanxi', 'CNSH': 'Shanghai', 'CNCQ': 'Chongqing', 'CNZJ': 'Zhejiang', 'CNJX': 'Jiangxi', 'CNYN': 'Yunnan', 'CNSD': 'Shandong', 'CNLN': 'Liaoning', 'CNXZ': 'Tibet', 'CNGS': 'Gansu', 'CNHK': 'Hong Kong', 'CNQH': 'Qinghai', 'CNBJ': 'Beijing', 'CNMO': 'Macao', 'CNNM': 'Mongolie-Intérieure', 'CNHB': 'Hubei', 'CNAH': 'Anhui', 'CNGZ': 'Guizhou', 'CNNX': 'Ningxia', 'CNJS': 'Jiangsu', 'CNXJ': 'Xinjiang', 'CNSX': 'Shanxi', 'CNHN': 'Hunan', 'CNSC': 'Sichuan', 'CNGX': 'Guangxi', 'CNJL': 'Jilin', 'CNTW': 'Taïwan', 'CNHE': 'Hebei', 'CNTJ': 'Tianjin', 'CNGD': 'Guangdong', 'CNFJ': 'Fujian', 'CNHL': 'Heilongjiang', 'CNHA': 'Henan', 'CNHI': 'Hainan' },
        names_en: { 'CNSN': 'Shaanxi', 'CNSH': 'Shanghai', 'CNCQ': 'Chongqing', 'CNZJ': 'Zhejiang', 'CNJX': 'Jiangxi', 'CNYN': 'Yunnan', 'CNSD': 'Shandong', 'CNLN': 'Liaoning', 'CNXZ': 'Tibet', 'CNGS': 'Gansu', 'CNHK': 'Hong Kong', 'CNQH': 'Qinghai', 'CNBJ': 'Beijing', 'CNMO': 'Macau', 'CNNM': 'Inner Mongolia', 'CNHB': 'Hubei', 'CNAH': 'Anhui', 'CNGZ': 'Guizhou', 'CNNX': 'Ningxia', 'CNJS': 'Jiangsu', 'CNXJ': 'Xinjiang', 'CNSX': 'Shanxi', 'CNHN': 'Hunan', 'CNSC': 'Sichuan', 'CNGX': 'Guangxi', 'CNJL': 'Jilin', 'CNTW': 'Taiwan', 'CNHE': 'Hebei', 'CNTJ': 'Tianjin', 'CNGD': 'Guangdong', 'CNFJ': 'Fujian', 'CNHL': 'Heilongjiang', 'CNHA': 'Henan', 'CNHI': 'Hainan' }
    },
    'eu': { 
        titleKey: 'map_scope_eu', icon: '🇪🇺', svg: 'images/europe.svg', isContinental: true, 
        names: { 'BE': 'Belgique', 'FR': 'France', 'DE': 'Allemagne', 'NL': 'Pays-Bas', 'IT': 'Italie', 'ES': 'Espagne', 'IE': 'Irlande', 'GB': 'Grande-Bretagne', 'DK': 'Danemark' },
        names_en: { 'BE': 'Belgium', 'FR': 'France', 'DE': 'Germany', 'NL': 'Netherlands', 'IT': 'Italy', 'ES': 'Spain', 'IE': 'Ireland', 'GB': 'United Kingdom', 'DK': 'Denmark' }
    },
    'wo': { 
        titleKey: 'map_scope_wo', icon: '🌍', svg: 'images/world.svg', isContinental: true, 
        names: { 'BE': 'Belgique', 'FR': 'France', 'DE': 'Allemagne', 'NL': 'Pays-Bas', 'US': 'États-Unis', 'CO': 'Colombie', 'KR': 'Corée du Sud', 'JP': 'Japon', 'CN': 'Chine', 'AU': 'Australie', 'ES': 'Espagne', 'IE': 'Irlande', 'GB': 'Grande-Bretagne', 'DK': 'Danemark', 'IT': 'Italie' },
        names_en: { 'BE': 'Belgium', 'FR': 'France', 'DE': 'Germany', 'NL': 'Netherlands', 'US': 'United States', 'CO': 'Colombia', 'KR': 'South Korea', 'JP': 'Japan', 'CN': 'China', 'AU': 'Australia', 'ES': 'Spain', 'IE': 'Ireland', 'GB': 'United Kingdom', 'DK': 'Denmark', 'IT': 'Italy' }
    }
};

export function getRegionName(scope, code) {
    const map = MAPS[scope];
    if (!map) return code;
    const isEn = i18n && i18n.currentLang === 'en';
    if (isEn && map.names_en && map.names_en[code]) {
        return map.names_en[code];
    }
    return (map.names && map.names[code]) || code;
}

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

        if (!brewName && !item.beer.province) return;

        const match = Array.isArray(breweryData) ? breweryData.find(b => b.name.toLowerCase() === brewName || brewName.includes(b.name.toLowerCase())) : breweryData[item.beer.brewery];
        
        let matchCountry = item.beer.countryCode || (match ? match.country : null);
        let matchProvince = item.beer.province || (match ? match.province : null);

        // If no brewery match in DB, try inferring country from custom beer's province code
        if (!matchCountry && item.beer.province) {
            for (const [scope, map] of Object.entries(MAPS)) {
                if (map.names && map.names[item.beer.province]) {
                    matchCountry = map.countryCode;
                    matchProvince = item.beer.province;
                    break;
                }
            }
        }

        if (matchCountry) {
            let svgId;
            let provCode;
            
            if (mapConfig.isContinental) {
                // Continental maps aggregate by Country Code
                // Only track if it matches the continental scope (EU vs WO could be filtered if needed, but world handles all)
                // Assuming EUROPE SVG has European country IDs, and WORLD has everything
                svgId = matchCountry;
                provCode = matchCountry;
            } else if (matchCountry === mapConfig.countryCode && matchProvince) {
                // Country maps aggregate by Province Code
                svgId = matchProvince;
                provCode = matchProvince;
                
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
        <div id="map-switcher-container" style="display:flex; overflow-x:auto; gap:10px; margin-bottom:15px; padding-bottom:10px; scrollbar-width: thin; scrollbar-color: var(--accent-gold) rgba(0,0,0,0.2);">
            ${Object.keys(MAPS).map(scope => `
                <button class="map-switch-btn ${scope === currentMapScope ? 'active' : ''}" data-scope="${scope}" 
                    style="background: ${scope === currentMapScope ? 'var(--accent-gold)' : 'rgba(255,255,255,0.05)'}; 
                           color: ${scope === currentMapScope ? '#000' : '#fff'};
                           border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; font-family:'Russo One'; 
                           font-size:0.9rem; flex-shrink:0; cursor:pointer; transition:0.3s; white-space:nowrap;">
                    ${MAPS[scope].icon} ${i18n.t(MAPS[scope].titleKey)}
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
        <div style="display:flex; justify-content:center; gap:10px; margin-top:5px; font-size:0.8rem; color:#888; flex-wrap:wrap;">
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#f1c40f; display:inline-block; border-radius:50%; margin-right:4px;"></span>1+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#f39c12; display:inline-block; border-radius:50%; margin-right:4px;"></span>3+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#d35400; display:inline-block; border-radius:50%; margin-right:4px;"></span>5+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#c0392b; display:inline-block; border-radius:50%; margin-right:4px;"></span>8+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#8e44ad; display:inline-block; border-radius:50%; margin-right:4px;"></span>12+</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; background:#2c3e50; display:inline-block; border-radius:50%; margin-right:4px;"></span>15+</span>
        </div>
    `;

    // Event listeners for switcher
    const switcherContainer = container.querySelector('#map-switcher-container');
    if (switcherContainer) {
        let isDown = false;
        let startX;
        let scrollLeft;

        switcherContainer.addEventListener('mousedown', (e) => {
            isDown = true;
            switcherContainer.style.cursor = 'grabbing';
            startX = e.pageX - switcherContainer.offsetLeft;
            scrollLeft = switcherContainer.scrollLeft;
        });
        switcherContainer.addEventListener('mouseleave', () => {
            isDown = false;
            switcherContainer.style.cursor = 'pointer';
        });
        switcherContainer.addEventListener('mouseup', () => {
            isDown = false;
            switcherContainer.style.cursor = 'pointer';
        });
        switcherContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - switcherContainer.offsetLeft;
            const walk = (x - startX) * 2;
            switcherContainer.scrollLeft = scrollLeft - walk;
        });
    }

    container.querySelectorAll('.map-switch-btn').forEach(btn => {
        btn.onclick = () => {
            currentMapScope = btn.getAttribute('data-scope');
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
            const regionName = getRegionName(currentMapScope, data.provCode) || mapConfig.names[data.provCode] || svgId;

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
            p.style.fillRule = 'evenodd'; // Fix potential filled holes in SVG
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

    // Ensure Brussels (enclave) is always drawn on top of Flemish Brabant
    const bruPath = svg.querySelector('#BE-BRU');
    if (bruPath && stats['BE-BRU']) {
        bruPath.parentNode.appendChild(bruPath);
    }
}
