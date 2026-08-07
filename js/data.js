import { calculateRarity } from './autoRarity.js';
import { MAPS } from './map.js';
import { i18n } from './i18n.js';

const ALL_DATA_FILES = [
    'data/belgiumbeer.json',
    'data/deutchbeer.json',
    'data/frenchbeer.json',
    'data/nlbeer.json',
    'data/usbeer.json',
    'data/newbeer.json',
    'data/cobeer.json'
];

export async function fetchAllBeers(files = ALL_DATA_FILES) {
    let allBeers = [];

    const promises = files.map(url =>
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${url}`);
                return response.json();
            })
            .then(data => {
                if (url.includes('newbeer.json')) {
                    return data.map(b => ({ ...b, removeBackground: true }));
                }
                return data;
            })
            .catch(err => {
                console.warn(`Error loading ${url}:`, err);
                return []; // Fail gracefully
            })
    );

    // We also fetch breweries.json to attach country/region metadata for searching
    promises.push(
        fetch('data/breweries.json')
            .then(res => res.ok ? res.json() : {})
            .catch(() => ({}))
    );

    const results = await Promise.all(promises);
    const breweryDataArr = results.pop() || []; // last promise is breweries.json
    const breweryData = Array.isArray(breweryDataArr) 
        ? Object.fromEntries(breweryDataArr.map(b => [b.name, b])) 
        : breweryDataArr;

    results.forEach(data => {
        if (Array.isArray(data)) {
            allBeers = allBeers.concat(data);
        }
    });

    // Normalize IDs if missing (fallback to title)
    // Map rarity_rank from data to internal rarity key
    const rarityMap = {
        'Base': 'base',
        'Commun': 'commun',
        'Rare': 'rare',
        'Super Rare': 'super_rare',
        'Épique': 'epique',
        'Mythique': 'mythique',
        'Légendaire': 'legendaire',
        'Ultra Légendaire': 'ultra_legendaire',
        'Saisonnière': 'saisonniere',
        'Fondateur': 'fondateur'
    };

    // Simple deterministic string hash for IDs
    const djb2Hash = (str) => {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return Math.abs(hash).toString(36);
    };

    const mapped = allBeers.map(beer => {
        // Find region data for search features
        let searchRegion = '';
        let searchCountry = '';
        const brewInfo = breweryData[beer.brewery];
        if (brewInfo) {
            let countryCode = brewInfo.country || 'BE'; // default BE
            let provinceCode = brewInfo.province;
            
            // Map the codes to human readable names from MAPS
            const mapObj = MAPS[countryCode.toLowerCase()];
            if (mapObj) {
                searchCountry = `${mapObj.icon} ${i18n.t(mapObj.titleKey)}`; // e.g. "🇧🇪 Belgique"
                if (mapObj.names && provinceCode) {
                    searchRegion = mapObj.names[provinceCode] || provinceCode;
                }
            }
        }

        return {
            ...beer,
            id: beer.id || beer.title.replace(/\s+/g, '_').toUpperCase() + '_' + djb2Hash(beer.title + (beer.brewery || '')),
            rarity: rarityMap[beer.rarity_rank] || beer.rarity || 'commun',
            isSeasonal: beer.rarity_rank === 'Saisonnière' || beer.isSeasonal || false,
            searchRegion: searchRegion,
            searchCountry: searchCountry
        };
    });

    // Deduplicate by ID (same beer can appear in multiple country files)
    const seen = new Set();
    return mapped.filter(beer => {
        if (seen.has(beer.id)) return false;
        seen.add(beer.id);
        return true;
    });
}

