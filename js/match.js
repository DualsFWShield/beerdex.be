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
     * @param {Object} myUserData (Optional: Full user data for advanced stats)
     * @returns {Object} Stats results
     */
    compare: function (allBeers, myIds, friendData, myUserData = null) {
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
        const unionSize = (new Set([...mine, ...friendIds])).size;
        let score = 0;
        if (unionSize > 0) {
            score = Math.round((commonIds.length / unionSize) * 100);
        }

        // Hydrate with full beer objects for display
        const hydrationMap = new Map();
        allBeers.forEach(b => hydrationMap.set(b.id, b));

        const hydrate = (ids) => ids.map(id => hydrationMap.get(id)).filter(b => b);

        // --- ADVANCED STATS ---
        let myStats = null;
        if (myUserData) {
            myStats = this.calculateUserStats(myIds, myUserData, allBeers);
        }

        return {
            userName: friendData.u,
            score: score,
            common: hydrate(commonIds),
            discovery: hydrate(discoveryIds),
            commonCount: commonIds.length,
            friendTotal: friendIds.size,
            myTotal: mine.size,
            diff: Math.abs(mine.size - friendIds.size),
            myStats: myStats // New: advanced stats
        };
    },

    /**
     * Calculate advanced user statistics
     * @param {Array<string>} beerIds - List of beer IDs
     * @param {Object} userData - Full user data from Storage
     * @param {Array<Object>} allBeers - Full beer catalog
     * @returns {Object} Advanced stats
     */
    calculateUserStats: function (beerIds, userData, allBeers) {
        let totalBeers = 0;
        let totalVolumeMl = 0;
        let ratingSum = 0;
        let ratingCount = 0;
        let rarestBeer = null;
        let maxRarityScore = -1;

        const rarityScores = {
            'base': 0,
            'commun': 1,
            'rare': 2,
            'super_rare': 3,
            'epique': 4,
            'mythique': 5,
            'legendaire': 6,
            'ultra_legendaire': 7
        };

        beerIds.forEach(beerId => {
            const entry = userData[beerId + '_rating'] || userData[beerId];
            if (!entry) return;

            const count = entry.count || 0;
            if (count > 0) {
                totalBeers += count;

                // Volume
                if (entry.history) {
                    entry.history.forEach(h => {
                        totalVolumeMl += (h.volume || 330);
                    });
                } else {
                    totalVolumeMl += count * 330;
                }

                // Rating
                if (entry.score !== undefined && entry.score !== '') {
                    ratingSum += parseFloat(entry.score);
                    ratingCount++;
                }

                // Rarity
                const beer = allBeers.find(b => b.id == beerId);
                if (beer) {
                    const rarityScore = rarityScores[beer.rarity] || 0;
                    if (rarityScore > maxRarityScore) {
                        maxRarityScore = rarityScore;
                        rarestBeer = beer;
                    }
                }
            }
        });

        return {
            totalBeers: totalBeers,
            totalLiters: parseFloat((totalVolumeMl / 1000).toFixed(1)),
            avgRating: ratingCount > 0 ? parseFloat((ratingSum / ratingCount).toFixed(1)) : 0,
            rarestBeer: rarestBeer
        };
    }
};

// Export global or module
window.Match = Match;
export default Match; // For standard import if needed
