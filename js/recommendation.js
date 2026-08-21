// recommendation.js — Bridge for BrewBrother
import * as Storage from './storage.js';

let engine = null;
let lastAllBeers = [];

export const Recommendation = {
    init: function(allBeers) {
        if (!window.BrewBrother) {
            console.error("BrewBrother script not loaded!");
            return;
        }
        engine = new window.BrewBrother();
        lastAllBeers = allBeers || [];
    },

    // Bridge adapter for BrewBrother
    createAdapter: function(allBeers) {
        const beers = allBeers || lastAllBeers || [];
        return {
            getFeedback: async () => {
                const feedback = [];
                const userData = Storage.getAllUserData();
                for (const id in userData) {
                    const u = userData[id];
                    const beer = beers.find(b => String(b.id) === String(id));
                    if (!beer) continue;

                    let weight = 0;
                    if (u.count > 0) weight += 1.0;
                    if (Storage.isFavorite(id)) weight += 3.0;
                    
                    const rating = Storage.getBeerRating(id);
                    if (rating && rating.score) {
                        if (rating.score >= 15) weight += 1.5;
                        else if (rating.score >= 10) weight += 1.0;
                        else weight -= 1.0;
                    }

                    if (weight !== 0) {
                        // Use latest history date as timestamp if available
                        let timestamp = Date.now();
                        if (u.history && u.history.length > 0) {
                            const last = new Date(u.history[u.history.length - 1].date).getTime();
                            if (!isNaN(last)) timestamp = last;
                        }
                        const count = parseInt(u.count, 10) || 1;
                        feedback.push({ 
                            beer, 
                            weight, 
                            timestamp, 
                            count, 
                            rating: rating ? rating.score : undefined 
                        });
                    }
                }
                return feedback;
            },
            getCandidates: async () => {
                return beers;
            },
            getDrunkIds: async () => {
                const drunk = new Set();
                const userData = Storage.getAllUserData();
                for (const id in userData) {
                    if (userData[id] && userData[id].count > 0) {
                        drunk.add(String(id));
                    }
                }
                return drunk;
            },
            getDrinkCounts: async () => {
                const counts = {};
                const userData = Storage.getAllUserData();
                for (const id in userData) {
                    if (userData[id] && userData[id].count > 0) {
                        counts[String(id)] = parseInt(userData[id].count, 10) || 1;
                    }
                }
                return counts;
            }
        };
    },

    getRecommendedBeers: async function(allBeers, options = {}) {
        if (!engine) this.init(allBeers);
        else if (allBeers) lastAllBeers = allBeers;
        
        const adapter = this.createAdapter(allBeers || lastAllBeers);
        
        let manualProfile = null;
        if (options.mode === 'manual' && options.manualPrefs) {
            manualProfile = {
                typeAffinity: {},
                breweryAffinity: {},
                flavorAffinity: {},
                idealAbv: (!isNaN(options.manualPrefs.idealAbv) && options.manualPrefs.idealAbv > 0) ? options.manualPrefs.idealAbv : null,
                confidence: 1.0
            };
            if (Array.isArray(options.manualPrefs.types)) {
                options.manualPrefs.types.forEach(t => { manualProfile.typeAffinity[t] = 1.0; });
            }
            if (Array.isArray(options.manualPrefs.flavors)) {
                options.manualPrefs.flavors.forEach(f => { manualProfile.flavorAffinity[f] = 1.0; });
            }
        }

        const { results } = await engine.recommend(adapter, manualProfile);
        
        // Filter by location if specified
        let filteredResults = results || [];
        if (options.country && options.country !== 'All') {
            filteredResults = filteredResults.filter(b => b.searchCountry === options.country);
        }
        if (options.region && options.region !== 'All') {
            filteredResults = filteredResults.filter(b => b.searchRegion === options.region);
        }

        // Slice to max 20 after location filtering
        return filteredResults.slice(0, 20);
    },

    getBeerMatchScore: async function(beer, allBeers) {
        if (!engine) this.init(allBeers || lastAllBeers);
        else if (allBeers) lastAllBeers = allBeers;
        
        const adapter = this.createAdapter(allBeers || lastAllBeers);
        let profile = engine.getProfile();
        if (!profile) {
            profile = await engine.buildProfile(adapter);
        }
        const match = engine.scoreBeer(beer, profile);
        const reasons = engine.buildReasons(beer, match, profile);
        match.reasons = reasons;
        match.reasonCodes = reasons.map(r => 'brewbrother_reason_' + r.code.replace('_mismatch', ''));
        return match;
    },

    getUserTasteProfile: async function(allBeers) {
        if (!engine) this.init(allBeers);
        else if (allBeers) lastAllBeers = allBeers;
        
        const adapter = this.createAdapter(allBeers || lastAllBeers);
        const profile = await engine.buildProfile(adapter);
        
        // Determine Archetype
        let archetype = "archetype_novice"; // default
        let archetypeIcon = "🍺";
        
        const sortedTypes = Object.entries(profile.typeAffinity || {}).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
        const sortedBreweries = Object.entries(profile.breweryAffinity || {}).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
        const sortedFlavors = Object.entries(profile.flavorAffinity || {}).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);

        const topType = sortedTypes[0];
        const topFlavor = sortedFlavors[0];
        
        const distinctBeers = profile.distinctBeers || 0;
        const totalDrinks = profile.totalDrinks || 0;
        const idealAbv = profile.idealAbv || 0;
        
        if (distinctBeers >= 15 && (!topType || topType[1] < 0.35)) {
            archetype = "archetype_explorer"; archetypeIcon = "🧭";
        } else if (idealAbv > 0 && idealAbv <= 5.5 && totalDrinks >= 5) {
            archetype = "archetype_session"; archetypeIcon = "🍻";
        } else if (idealAbv >= 8.5 && totalDrinks >= 5) {
            archetype = "archetype_strong"; archetypeIcon = "💪";
        } else if (topType && topType[1] > 0.3 && topType[0].toLowerCase().includes('ipa')) {
            archetype = "archetype_hophead"; archetypeIcon = "🌿";
        } else if (topType && topType[1] > 0.3 && (topType[0].toLowerCase().includes('stout') || topType[0].toLowerCase().includes('porter'))) {
            archetype = "archetype_stout_lover"; archetypeIcon = "☕";
        } else if (topType && topType[1] > 0.3 && (topType[0].toLowerCase().includes('trappist') || topType[0].toLowerCase().includes('abbaye') || topType[0].toLowerCase().includes('quadrupel'))) {
            archetype = "archetype_trappist"; archetypeIcon = "⛪";
        } else if ((topType && topType[1] > 0.3 && (topType[0].toLowerCase().includes('fruit') || topType[0].toLowerCase().includes('kriek'))) || (topFlavor && topFlavor[0] === 'fruity' && topFlavor[1] > 0.4)) {
            archetype = "archetype_fruity"; archetypeIcon = "🍓";
        } else if ((topType && topType[1] > 0.3 && (topType[0].toLowerCase().includes('sour') || topType[0].toLowerCase().includes('gueuze') || topType[0].toLowerCase().includes('lambic'))) || (topFlavor && topFlavor[0] === 'sour' && topFlavor[1] > 0.4)) {
            archetype = "archetype_sour"; archetypeIcon = "🍋";
        } else if (topType && topType[1] > 0.4 && (topType[0].toLowerCase().includes('pils') || topType[0].toLowerCase().includes('lager') || topType[0].toLowerCase() === 'blonde')) {
            archetype = "archetype_classic"; archetypeIcon = "👑";
        } else if (topFlavor && topFlavor[1] > 0.4 && (topFlavor[0] === 'sweet' || topFlavor[0] === 'caramel' || topFlavor[0] === 'chocolate')) {
            archetype = "archetype_sweet"; archetypeIcon = "🍫";
        } else if (topFlavor && topFlavor[1] > 0.4 && topFlavor[0] === 'bitter') {
            archetype = "archetype_bitter"; archetypeIcon = "😠";
        } else if (topFlavor && topFlavor[1] > 0.5) {
            archetype = "archetype_flavorful"; archetypeIcon = "👅";
        } else if (distinctBeers >= 5) {
            archetype = "archetype_curious"; archetypeIcon = "🧐";
        }

        return {
            profile,
            archetype,
            archetypeIcon,
            topTypes: sortedTypes.slice(0, 5),
            topBreweries: sortedBreweries.slice(0, 5),
            topFlavors: sortedFlavors.slice(0, 5)
        };
    }
};
