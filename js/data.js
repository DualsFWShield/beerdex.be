import { calculateRarity } from './autoRarity.js';

const DATA_FILES = [
    'data/belgiumbeer.json',
    'data/deutchbeer.json',
    'data/frenchbeer.json',
    'data/nlbeer.json',
    'data/usbeer.json',
    'data/newbeer.json'
];

export async function fetchAllBeers() {
    let allBeers = [];

    const promises = DATA_FILES.map(url =>
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

    const results = await Promise.all(promises);

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
        'Saisonnière': 'saisonniere'
    };

    return allBeers.map(beer => ({
        ...beer,
        id: beer.id || beer.title.replace(/\s+/g, '_').toUpperCase() + '_' + Math.random().toString(36).substr(2, 5),
        rarity: rarityMap[beer.rarity_rank] || beer.rarity || 'commun',
        isSeasonal: beer.rarity_rank === 'Saisonnière' || beer.isSeasonal || false
    }));
}

