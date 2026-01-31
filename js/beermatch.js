/**
 * Beer Match Module
 * Compare two Beerdex profiles side-by-side
 */

import * as Storage from './storage.js';

// Session storage for opponent profile
const OPPONENT_KEY = 'beermatch_opponent';

/**
 * Import opponent profile from JSON data
 * @param {Object} jsonData - Exported Beerdex data
 * @returns {Object} Validated and normalized profile
 */
export function importOpponentProfile(jsonData) {
    // Validate format
    if (!jsonData || typeof jsonData !== 'object') {
        throw new Error('Format de données invalide');
    }

    // Check size (5MB max to prevent crashes)
    const jsonSize = JSON.stringify(jsonData).length;
    if (jsonSize > 5 * 1024 * 1024) {
        throw new Error('Profil trop volumineux (max 5MB)');
    }

    // Normalize profile structure
    const profile = {
        name: sanitizeName(jsonData.profile?.name || 'Adversaire'),
        avatar: jsonData.profile?.avatar || '🍺',
        ratings: jsonData.ratings || {},
        customBeers: jsonData.customBeers || [],
        stats: jsonData.stats || null,
        exportDate: jsonData.exportDate,
        version: jsonData.version || 3
    };

    // Store in sessionStorage
    sessionStorage.setItem(OPPONENT_KEY, JSON.stringify(profile));

    return profile;
}

/**
 * Get stored opponent profile
 */
export function getOpponentProfile() {
    const data = sessionStorage.getItem(OPPONENT_KEY);
    return data ? JSON.parse(data) : null;
}

/**
 * Clear opponent profile
 */
export function clearOpponentProfile() {
    sessionStorage.removeItem(OPPONENT_KEY);
}

/**
 * Calculate detailed comparison statistics
 * @param {Array} myBeers - My beer list
 * @param {Object} opponentProfile - Opponent's profile
 * @returns {Object} Match statistics
 */
export function calculateMatchStats(myBeers, opponentProfile) {
    const myData = Storage.getAllUserData();
    const opponentData = opponentProfile.ratings;

    // Calculate my stats
    const myStats = calculateUserStats(myData, myBeers);

    // Calculate opponent stats
    const opponentBeers = [...opponentProfile.customBeers, ...myBeers]; // Merge for lookup
    const opponentStats = calculateUserStats(opponentData, opponentBeers);

    // Find common beers
    const commonBeers = findCommonBeers(myData, opponentData, myBeers);

    // Find recommendations (beers opponent has that I don't)
    const recommendations = findRecommendations(myData, opponentData, myBeers);

    // Determine winners for each category
    const winners = {
        totalBeers: determineWinner(myStats.totalBeers, opponentStats.totalBeers),
        uniqueBeers: determineWinner(myStats.uniqueBeers, opponentStats.uniqueBeers),
        totalLiters: determineWinner(myStats.totalLiters, opponentStats.totalLiters),
        avgRating: determineWinner(myStats.avgRating, opponentStats.avgRating),
        rarestBeer: determineWinner(
            getRarityScore(myStats.rarestBeer?.rarity),
            getRarityScore(opponentStats.rarestBeer?.rarity)
        )
    };

    // Calculate overall winner (most categories won)
    const myWins = Object.values(winners).filter(w => w === 'me').length;
    const opponentWins = Object.values(winners).filter(w => w === 'opponent').length;
    const overallWinner = myWins > opponentWins ? 'me' :
        opponentWins > myWins ? 'opponent' : 'tie';

    return {
        me: {
            name: 'Moi',
            avatar: '👤',
            ...myStats
        },
        opponent: {
            name: opponentProfile.name,
            avatar: opponentProfile.avatar,
            ...opponentStats
        },
        winners,
        overallWinner,
        commonBeers,
        recommendations,
        myWins,
        opponentWins
    };
}

/**
 * Calculate stats for a user
 */
function calculateUserStats(userData, allBeers) {
    let totalBeers = 0;
    let uniqueBeers = 0;
    let totalVolumeMl = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let rarestBeer = null;
    let maxRarityScore = -1;

    Object.keys(userData).forEach(beerId => {
        const entry = userData[beerId];
        const count = entry.count || 0;

        if (count > 0) {
            totalBeers += count;
            uniqueBeers++;

            // Volume calculation
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

            // Find rarest beer
            const beer = allBeers.find(b => b.id == beerId);
            if (beer) {
                const rarityScore = getRarityScore(beer.rarity);
                if (rarityScore > maxRarityScore) {
                    maxRarityScore = rarityScore;
                    rarestBeer = {
                        ...beer,
                        count: count
                    };
                }
            }
        }
    });

    return {
        totalBeers,
        uniqueBeers,
        totalLiters: parseFloat((totalVolumeMl / 1000).toFixed(1)),
        avgRating: ratingCount > 0 ? parseFloat((ratingSum / ratingCount).toFixed(1)) : 0,
        rarestBeer
    };
}

/**
 * Find beers that both users have consumed
 */
function findCommonBeers(myData, opponentData, allBeers) {
    const commonIds = Object.keys(myData).filter(id => {
        const myCount = myData[id]?.count || 0;
        const opponentCount = opponentData[id]?.count || 0;
        return myCount > 0 && opponentCount > 0;
    });

    return commonIds.map(id => {
        const beer = allBeers.find(b => b.id == id);
        return {
            beer,
            myCount: myData[id].count,
            opponentCount: opponentData[id].count,
            myRating: myData[id].score,
            opponentRating: opponentData[id].score
        };
    }).filter(c => c.beer); // Remove nulls
}

/**
 * Find beers opponent has that I don't
 */
function findRecommendations(myData, opponentData, allBeers) {
    const recommendations = [];

    Object.keys(opponentData).forEach(id => {
        const opponentCount = opponentData[id]?.count || 0;
        const myCount = myData[id]?.count || 0;

        // Opponent has it but I don't
        if (opponentCount > 0 && myCount === 0) {
            const beer = allBeers.find(b => b.id == id);
            if (beer) {
                recommendations.push({
                    beer,
                    opponentCount: opponentCount,
                    opponentRating: opponentData[id].score
                });
            }
        }
    });

    // Sort by opponent's rating (best first)
    recommendations.sort((a, b) => {
        const ratingA = parseFloat(a.opponentRating) || 0;
        const ratingB = parseFloat(b.opponentRating) || 0;
        return ratingB - ratingA;
    });

    return recommendations.slice(0, 10); // Top 10
}

/**
 * Determine winner for a stat
 */
function determineWinner(myValue, opponentValue) {
    if (myValue > opponentValue) return 'me';
    if (opponentValue > myValue) return 'opponent';
    return 'tie';
}

/**
 * Get numeric score for rarity level
 */
function getRarityScore(rarity) {
    const scores = {
        'base': 0,
        'commun': 1,
        'rare': 2,
        'super_rare': 3,
        'epique': 4,
        'mythique': 5,
        'legendaire': 6,
        'ultra_legendaire': 7
    };
    return scores[rarity] || 0;
}

/**
 * Sanitize user input name
 */
function sanitizeName(name) {
    if (!name || typeof name !== 'string') return 'Adversaire';

    // Remove HTML tags
    let clean = name.replace(/<[^>]*>/g, '');

    // Limit length
    clean = clean.substring(0, 20);

    // Remove special chars except spaces, letters, numbers, emojis
    clean = clean.replace(/[^\w\s\u{1F300}-\u{1F9FF}]/gu, '');

    return clean.trim() || 'Adversaire';
}

/**
 * Export my profile for sharing
 */
export function exportMyProfile(allBeers, customName = null, customAvatar = null) {
    const userData = Storage.getAllUserData();
    const customBeers = Storage.getCustomBeers();

    // Calculate stats
    const stats = calculateUserStats(userData, allBeers);

    const profile = {
        version: 3,
        exportDate: new Date().toISOString(),
        profile: {
            name: customName || 'Anonyme',
            avatar: customAvatar || '🍺'
        },
        ratings: userData,
        customBeers: customBeers,
        stats: stats
    };

    return profile;
}
