/**
 * Open Food Facts API Client for Beerdex
 * Handles fetching product data and mapping it to Beerdex schema.
 */

const API_BASE_URL = 'https://world.openfoodfacts.org/api/v2';
import { calculateRarity } from './autoRarity.js';

// Rate Limiting Config
const RATE_LIMITS = {
    search: { limit: 10, interval: 60 * 1000, timestamps: [] }, // 10 req/min
    product: { limit: 100, interval: 60 * 1000, timestamps: [] } // 100 req/min
};

function checkRateLimit(type) {
    const config = RATE_LIMITS[type];
    const now = Date.now();
    // Filter out old timestamps
    config.timestamps = config.timestamps.filter(ts => now - ts < config.interval);

    if (config.timestamps.length >= config.limit) {
        return false;
    }
    config.timestamps.push(now);
    return true;
}

/**
 * Fetches product data from Open Food Facts by barcode.
 * @param {string} barcode - The scanned barcode (EAN-13, EAN-8).
 * @returns {Promise<Object|null>} - Beerdex-formatted beer object or null if not found.
 */
export async function fetchProductByBarcode(barcode) {
    if (!checkRateLimit('product')) {
        console.warn('OFF API Key Limit Reached (Product)');
        return { status: 'rate_limit' };
    }

    try {
        const response = await fetch(`${API_BASE_URL}/product/${barcode}.json`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Beerdex/1.0 (clément.picoret@gmail.com)'
            }
        });

        if (!response.ok) {
            console.warn(`OFF API Error: ${response.status}`);
            return { status: 'error' };
        }

        const data = await response.json();

        if (data.status === 0 || !data.product) {
            console.warn('Product not found in OFF');
            return { status: 'not_found' };
        }

        // Map product
        const product = mapProductToBeer(data.product);

        // Check validity
        if (!product.isValidBeer) {
            return { status: 'not_beer', product: product };
        }

        return { status: 'success', product: product };

    } catch (error) {
        console.error('Error fetching from OFF:', error);
        return { status: 'error' };
    }
}

/**
 * Maps an Open Food Facts product to the Beerdex Beer Schema.
 * @param {Object} product - The raw OFF product object.
 * @returns {Object} - A partial Beerdex beer object.
 */
function mapProductToBeer(product) {
    // 1. Raw Data
    let rawTitle = product.product_name_fr || product.product_name || 'Bière Inconnue';
    const brands = product.brands || product.brands_tags?.[0] || 'Brasserie Inconnue';
    const categories = (product.categories || '') + ' ' + (product.categories_tags || []).join(' ');

    // 0. Beer Validation (Reject non-beers)
    const validKeywords = /bi[eè]re|beer|bier|cerveza|birra|pivo|ipa|ale|stout|porter|lager|pils|lambic|gueuze|trappist|abbaye|brewery|brasserie|brauerei|cidre/i;
    const validationText = (rawTitle + ' ' + categories + ' ' + brands).toLowerCase();

    let isValidBeer = true;
    if (!validKeywords.test(validationText)) {
        console.warn("Product might not be a beer:", rawTitle);
        isValidBeer = false;
    }


    // 2. Data Cleaning
    rawTitle = rawTitle
        .replace(/_/g, ' ') // Remove underscores from start
        .replace(/BLE DUVEL V/i, 'Duvel') // Specific User Fix
        .replace(/\bBLE\b/i, '') // Remove "BLE" orphan
        .replace(/\bV\b/i, ''); // Remove "V" orphan

    // Regex explanation:
    // \b\d+(?:\.|,)?\d*\s*(?:cl|ml|l)\b : Volume (33cl, 0.5l)
    // \b\d+(?:\.|,)?\d*\s*%\s*(?:vol)?\b : Alcohol (8%, 8 % vol)
    // \b(?:bi[eè]re|beer|cerveza)\b : Generic words
    // Case insensitive
    let simpleTitle = rawTitle
        .replace(/\b\d+(?:\.|,)?\d*\s*(?:cl|ml|l)\b/gi, '') // Remove Volume
        .replace(/\b\d+(?:\.|,)?\d*\s*%\s*(?:vol)?\b/gi, '') // Remove Alc
        .replace(/\b(?:bi[eè]re|beer|cerveza)\b/gi, '') // Remove Generic
        .replace(/\b(de|la|le|du)\b/gi, '$1') // Lowercase particles (optional, but keep Case)
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();

    // If title becomes empty (e.g. "Biere 33cl") or too short, fallback to raw or partial
    if (simpleTitle.length < 2) simpleTitle = rawTitle;

    // Capitalize properly (Title Case Helper)
    const title = toTitleCase(simpleTitle);

    // 3. Alcohol: 'alcohol_value' field OR Regex from Raw Title
    let alcoholVal = product.alcohol_value || product.alcohol;
    if (!alcoholVal) {
        // Try extract from raw title:
        // Matches: "8%", "8,5%", "8.5%", "0.0%", "0,0 %", "Alc. 5.5%"
        // Also supports: "5.5°", "5,5 °"
        // Avoids matching "100%" if it's not alcohol related? Usually in title it is.
        const alcMatch = rawTitle.match(/(?:alc\.?|vol\.?)?\s*(\d+(?:[\.,]\d+)?)?\s*(?:%|°)/i);
        if (alcMatch && alcMatch[1]) {
            alcoholVal = parseFloat(alcMatch[1].replace(',', '.'));
        }
    }

    let alcohol = 0;
    if (alcoholVal) {
        alcohol = parseFloat(alcoholVal).toFixed(1) + '°';
    } else {
        alcohol = '?';
    }

    // 4. Volume: Quantity
    let volume = product.quantity || product.product_quantity || '';
    if (!volume) {
        // Try extract from raw title
        const volMatch = rawTitle.match(/(\d+(?:[\.,]\d+)?)\s*(cl|ml|l)/i);
        if (volMatch) {
            volume = volMatch[1] + volMatch[2];
        }
    }
    volume = normalizeVolume(volume);

    // 5. Image: Front Image URL
    const image = product.image_front_url || product.image_url || '';

    // 6. Type: Categories -> Simple matching
    // Enhanced detection based on Title as well
    const allText = (product.categories || '') + ' ' + (product.categories_tags || []).join(' ') + ' ' + rawTitle;
    const type = detectType(allText);

    // 7. Ingredients
    let ingredients = product.ingredients_text_fr || product.ingredients_text || '';
    // Clean ingredients: Remove underscores, fix case
    ingredients = ingredients
        .replace(/_/g, '') // Remove underscores used for bolding in OFF
        .toLowerCase();
    ingredients = ingredients.charAt(0).toUpperCase() + ingredients.slice(1);

    // 8. Rarity Calculation
    // We construct a temporary object to pass to calculateRarity (expecting % format or number?)
    // calculateRarity expects string "8%" or "8"
    const tempBeer = {
        title: title,
        brewery: brands,
        type: type,
        alcohol: alcoholVal ? alcoholVal.toString() : '0'
    };
    const rarityData = calculateRarity(tempBeer);

    return {
        title: title,
        brewery: cleanBrand(brands),
        type: type,
        alcohol: alcohol,
        volume: volume,
        image: image,
        ingredients: ingredients.substring(0, 150) + (ingredients.length > 150 ? '...' : ''),
        // Defaults for required fields
        province: 'OTHER', // Can't reliably guess
        distribution: 'Supermarché', // Safe guess for scanned items
        barrel_aged: false,
        isSeasonal: false,
        rarity: rarityData.rarity, // Use calculated rarity
        fromAPI: true, // Marker for API-sourced data
        id: 'API_' + product._id, // Transient ID
        isValidBeer: isValidBeer
    };
}

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

/**
 * Search products by text query.
 * @param {string} query 
 * @param {number} page 
 */
export async function searchProducts(query, page = 1) {
    if (!checkRateLimit('search')) {
        console.warn('OFF API Key Limit Reached (Search)');
        throw new Error("Limite de recherche atteinte. Attendez un peu.");
    }

    try {
        // Use the robust CGI search endpoint which handles text search better than V2
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=beers&json=1&page=${page}&page_size=24`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'Beerdex/1.0' }
        });

        if (!response.ok) return { products: [], count: 0 };

        const data = await response.json();
        // search.pl returns { products: [], count: ... } or sometimes just list in products
        const products = (data.products || []).map(mapProductToBeer).filter(b => b !== null);

        return {
            products: products,
            count: data.count || products.length,
            page: data.page || page
        };

    } catch (e) {
        console.error("Search API Error", e);
        return { products: [], count: 0 };
    }
}

/**
 * Simple heuristic to determine beer type from categories.
 */
function detectType(text) {
    const t = text.toLowerCase();

    // Specific styles first
    if (t.includes('ipa') || t.includes('india pale ale')) return 'IPA';
    if (t.includes('stout')) return 'Stout';
    if (t.includes('porter')) return 'Porter';
    if (t.includes('blanche') || t.includes('witbier') || t.includes('white') || t.includes('weizen')) return 'Blanche';
    if (t.includes('triple') || t.includes('tripel')) return 'Triple';
    if (t.includes('double') || t.includes('dubbel')) return 'Double';
    if (t.includes('quadruple') || t.includes('quadrupel')) return 'Quadruple';
    if (t.includes('fruit') || t.includes('kriek') || t.includes('framboise') || t.includes('cherry')) return 'Fruitée';
    if (t.includes('trappist')) return 'Trappiste';
    if (t.includes('abbaye') || t.includes('abbey')) return 'Abbaye';
    if (t.includes('saison')) return 'Saison';
    if (t.includes('lambic') || t.includes('gueuze')) return 'Lambic';

    // General Colors
    if (t.includes('brun') || t.includes('brown')) return 'Brune';
    if (t.includes('ambree') || t.includes('amber')) return 'Ambrée';
    if (t.includes('blonde') || t.includes('blond') || t.includes('golden')) return 'Blonde';
    if (t.includes('rouge') || t.includes('red')) return 'Rouge';

    // Standard Fallback
    if (t.includes('pils') || t.includes('lager')) return 'Pils / Lager';

    // Default fallback if really nothing provided
    return 'Inconnue';
}

/**
 * Normalizes volume strings (e.g. "330 ml" -> "33cl").
 */
function normalizeVolume(volStr) {
    if (!volStr) return '33cl';

    const v = volStr.toLowerCase().replace(/\s/g, '');

    // Check for Liters match first to avoid confusion
    if (v.includes('l') && !v.includes('ml') && !v.includes('cl') && !v.includes('dl')) {
        // e.g. "0.5l"
        return v.replace('l', 'L'); // Just capitalize
    }

    // Check ml
    if (v.includes('ml')) {
        const ml = parseFloat(v);
        if (!isNaN(ml)) {
            if (ml >= 1000) return (ml / 1000) + 'L';
            if (ml % 10 === 0) return (ml / 10) + 'cl'; // 330ml -> 33cl
            return ml + 'ml';
        }
    }

    // Check cl
    if (v.includes('cl')) {
        return v; // Keep as is usually
    }

    return volStr;
}

function cleanBrand(brand) {
    return brand.split(',')[0].trim();
}
