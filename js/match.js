/**
 * match.js
 * Logic for "Beer Match" (QR Code Comparison)
 * Dependencies: LZString (Global)
 */

const Match = {
    /**
     * Compress list of beer IDs to a string for QR Code
     * @param {Array<string>} beerIds 
     * @param {string} userName (Optional)
     * @returns {string} Compressed string prefixed with "BEERDEX:"
     */
    generateQRData: function (beerIds, userName = "Ami") {
        const payload = {
            u: userName,
            ids: beerIds
        };
        const json = JSON.stringify(payload);
        const compressed = LZString.compressToEncodedURIComponent(json);
        return "BEERDEX:" + compressed;
    },

    /**
     * Decompress QR string back to object
     * @param {string} qrString 
     * @returns {Object|null} { u: string, ids: Array } or null if invalid
     */
    parseQRData: function (qrString) {
        if (!qrString.startsWith("BEERDEX:")) return null;

        try {
            const compressed = qrString.substring(8); // Remove prefix
            const json = LZString.decompressFromEncodedURIComponent(compressed);
            if (!json) return null;
            return JSON.parse(json);
        } catch (e) {
            console.error("Match Parse Error", e);
            return null;
        }
    },

    /**
     * Compare local user's beers with scanned friend's beers
     * @param {Array<Object>} allBeers (Full Catalog)
     * @param {Array<string>} myIds (Local)
     * @param {Object} friendData (From QR: { u, ids })
     * @returns {Object} Stats results
     */
    compare: function (allBeers, myIds, friendData) {
        const friendIds = new Set(friendData.ids || []);
        const mine = new Set(myIds);

        const commonIds = [];    // Beers we both drank
        const discoveryIds = []; // Beers friend drank but I haven't (Recommendations)

        friendIds.forEach(id => {
            if (mine.has(id)) {
                commonIds.push(id);
            } else {
                discoveryIds.push(id);
            }
        });

        // Similarity Score (Jaccard Index)
        // Intersection / Union
        const unionSize = (new Set([...mine, ...friendIds])).size;
        let score = 0;
        if (unionSize > 0) {
            score = Math.round((commonIds.length / unionSize) * 100);
        }

        // Hydrate with full beer objects for display
        const hydrationMap = new Map(); // Cache for speed
        allBeers.forEach(b => hydrationMap.set(b.id, b));

        const hydrate = (ids) => ids.map(id => hydrationMap.get(id)).filter(b => b);

        return {
            userName: friendData.u,
            score: score,
            common: hydrate(commonIds),
            discovery: hydrate(discoveryIds),
            commonCount: commonIds.length,
            friendTotal: friendIds.size,
            diff: Math.abs(mine.size - friendIds.size)
        };
    }
};

// Export global or module
window.Match = Match;
export default Match; // For standard import if needed
