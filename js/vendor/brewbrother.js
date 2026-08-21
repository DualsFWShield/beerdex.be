// brewbrother.js — Standalone Brew Brother Recommendation Engine (Adapted for BeerDex)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   const engine = new BrewBrother({ ...config });
//   const results = await engine.recommend(adapter);
// ═══════════════════════════════════════════════════════════════

(function (root) {
    'use strict';

    const DEFAULTS = {
        weights: {
            favorite: 3.0,
            ratedGood: 1.5, // 15-20
            ratedNeutral: 1.0, // 10-14
            ratedBad: -1.0, // <10
            drunk: 1.0,
        },
        influence: {
            type: 0.35,
            brewery: 0.20,
            abv: 0.20,
            flavor: 0.25
        },
        output: { maxResults: 20 },
    };

    function deepMerge(a, b) {
        const result = { ...a };
        for (const key of Object.keys(b)) {
            if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) && a[key]) {
                result[key] = deepMerge(a[key], b[key]);
            } else {
                result[key] = b[key];
            }
        }
        return result;
    }

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    // Helper to extract keywords from beer text
    const FLAVOR_KEYWORDS = [
        'fruité', 'houblonné', 'torréfié', 'épicé', 'acide', 'amer', 'doux',
        'caramel', 'agrumes', 'café', 'chocolat', 'floral', 'malté', 'herbacé',
        'fumé', 'boisé', 'vanille', 'coriandre', 'miel', 'sec', 'sucré'
    ];

    function extractFlavors(beer) {
        const text = `${beer.type || ''} ${beer.ingredients || ''} ${beer.title || ''}`.toLowerCase();
        return FLAVOR_KEYWORDS.filter(kw => text.includes(kw));
    }

    function BrewBrother(config) {
        this.config = deepMerge(DEFAULTS, config || {});
    }

    BrewBrother.prototype.buildProfile = async function(adapter) {
        const cfg = this.config;
        const typeAffinity = {};
        const breweryAffinity = {};
        const flavorAffinity = {};
        let abvSum = 0;
        let abvCount = 0;

        const processItem = (beer, weight, decay = 1.0) => {
            const finalWeight = weight * decay;
            
            if (beer.type) typeAffinity[beer.type] = (typeAffinity[beer.type] || 0) + finalWeight;
            if (beer.brewery) breweryAffinity[beer.brewery] = (breweryAffinity[beer.brewery] || 0) + finalWeight;
            
            const flavors = extractFlavors(beer);
            flavors.forEach(f => {
                flavorAffinity[f] = (flavorAffinity[f] || 0) + finalWeight;
            });

            const abv = parseFloat((beer.alcohol || '').toString().replace(',', '.'));
            if (!isNaN(abv) && abv > 0 && finalWeight > 0) {
                abvSum += abv * finalWeight;
                abvCount += finalWeight;
            }
        };

        const feedback = await adapter.getFeedback(); // [{ beer, weight, timestamp }]
        const now = Date.now();
        const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

        feedback.forEach(f => {
            let decay = 1.0;
            if (f.timestamp) {
                const age = now - f.timestamp;
                if (age > 0) decay = Math.max(0.5, 1.0 - (age / ONE_YEAR) * 0.5);
            }
            processItem(f.beer, f.weight, decay);
        });

        // Normalize affinities (0 to 1 scale relative to the most popular)
        const normalize = (aff) => {
            const max = Math.max(...Object.values(aff), 1);
            Object.keys(aff).forEach(k => aff[k] /= max);
        };
        normalize(typeAffinity);
        normalize(breweryAffinity);
        normalize(flavorAffinity);

        const idealAbv = abvCount > 0 ? abvSum / abvCount : null;

        this.lastProfile = { typeAffinity, breweryAffinity, flavorAffinity, idealAbv };
        return this.lastProfile;
    };

    BrewBrother.prototype.scoreBeer = function(beer, profile) {
        const cfg = this.config;
        // Handle empty profile (new user) -> everything gets a baseline score
        const isProfileEmpty = Object.keys(profile.typeAffinity).length === 0;

        let typeScore = profile.typeAffinity[beer.type] || 0;
        let breweryScore = profile.breweryAffinity[beer.brewery] || 0;
        
        let flavorScore = 0;
        const flavors = extractFlavors(beer);
        if (flavors.length > 0) {
            let sum = 0;
            flavors.forEach(f => sum += (profile.flavorAffinity[f] || 0));
            flavorScore = sum / flavors.length;
        }

        let abvScore = 0;
        const abv = parseFloat((beer.alcohol || '').toString().replace(',', '.'));
        if (!isNaN(abv) && profile.idealAbv !== null) {
            // Gaussian-like distance penalty: max 1.0 at ideal, drops off
            const diff = Math.abs(abv - profile.idealAbv);
            abvScore = Math.max(0, 1.0 - (diff / 4.0)); // drops to 0 at +-4%
        } else if (profile.idealAbv === null) {
            abvScore = 0.5; // neutral
        }

        // Base match score (0 to 1)
        let totalScore = 0;
        if (isProfileEmpty) {
            totalScore = 0.5; // Neutral baseline for brand new users
        } else {
            totalScore = (typeScore * cfg.influence.type) +
                         (breweryScore * cfg.influence.brewery) +
                         (flavorScore * cfg.influence.flavor) +
                         (abvScore * cfg.influence.abv);
        }

        // Community baseline (don't recommend 1-star beers)
        if (beer.community_rating) {
            const commScore = parseFloat(beer.community_rating) / 5.0; // 0 to 1
            // Blend 80% personal taste, 20% objective quality (or 50/50 if profile is empty)
            const qualityWeight = isProfileEmpty ? 0.5 : 0.2;
            const personalWeight = 1.0 - qualityWeight;
            totalScore = (totalScore * personalWeight) + (commScore * qualityWeight);
        }

        // Random jitter to break ties
        totalScore += Math.random() * 0.05;

        totalScore = clamp(totalScore, 0, 1);
        const score20 = parseFloat((totalScore * 20).toFixed(1));
        const percentage = Math.round(totalScore * 100);

        return { score20, percentage, typeScore, breweryScore, flavorScore, abvScore };
    };

    BrewBrother.prototype.recommend = async function (adapter, manualProfile = null) {
        const cfg = this.config;
        const profile = manualProfile || await this.buildProfile(adapter);
        
        const candidates = await adapter.getCandidates();
        const drunkIds = await adapter.getDrunkIds();
        
        const scoredCandidates = [];

        candidates.forEach(beer => {
            // NON BUES EVIDEMMENT
            if (drunkIds.has(String(beer.id))) return;

            const match = this.scoreBeer(beer, profile);
            
            // Generate reasons
            const reasons = [];
            if (match.typeScore > 0.7) reasons.push('brewbrother_reason_type');
            if (match.breweryScore > 0.7) reasons.push('brewbrother_reason_brewery');
            if (match.abvScore > 0.8 && profile.idealAbv !== null) reasons.push('brewbrother_reason_abv');
            if (match.flavorScore > 0.7) reasons.push('brewbrother_reason_flavor');
            if (beer.community_rating >= 4.0) reasons.push('brewbrother_reason_community');

            scoredCandidates.push({
                ...beer,
                _brewBrotherMatch: {
                    ...match,
                    reasons
                }
            });
        });

        scoredCandidates.sort((a, b) => b._brewBrotherMatch.score20 - a._brewBrotherMatch.score20);
        
        return {
            results: scoredCandidates.slice(0, cfg.output.maxResults),
            profile
        };
    };

    BrewBrother.prototype.getProfile = function() {
        return this.lastProfile || null;
    };

    BrewBrother.DEFAULTS = DEFAULTS;
    BrewBrother.FLAVOR_KEYWORDS = FLAVOR_KEYWORDS;

    if (typeof module !== 'undefined' && module.exports) module.exports = BrewBrother;
    else {
        root.BrewBrother = BrewBrother;
        root.Recommender = BrewBrother;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
