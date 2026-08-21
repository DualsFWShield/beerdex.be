// brewbrother.js — Standalone Brew Brother Recommendation Engine v2.0 (Adapted for BeerDex)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   const engine = new BrewBrother({ ...config });
//   const results = await engine.recommend(adapter);
//
// Adapter contract:
//   getFeedback()      -> [{ beer, weight, timestamp, count?, rating? }]
//                         count = number of times this beer was drunk (default 1).
//                         If several entries share the same beer id, they are
//                         merged and the entries are counted as extra drinks.
//   getCandidates()    -> [beer]
//   getDrunkIds()      -> Set of already-drunk beer ids (excluded from results)
//   getDrinkCounts()?  -> optional Map/Object { beerId -> times drunk }, used as
//                         the authoritative source when present.
// ═══════════════════════════════════════════════════════════════

(function (root) {
    'use strict';

    const DEFAULTS = {
        weights: {
            favorite: 3.0,
            ratedGood: 1.5,        // 15-20
            ratedNeutral: 1.0,     // 10-14
            ratedBad: -1.0,        // <10
            drunk: 1.0,
            // Diminishing-returns reinforcement per repeated drink of the SAME beer.
            // drinkFactor = 1 + repeatDrinkBonus * ln(drinks)   (1->1, 3->1.66, 10->2.38)
            repeatDrinkBonus: 0.6,
            // A style drunk at least this many times becomes a "loyalty" signal
            loyaltyThreshold: 3
        },
        influence: {
            type: 0.26,
            brewery: 0.14,
            abv: 0.16,
            flavor: 0.20,
            similarity: 0.24
        },
        blending: {
            communityWeightMin: 0.50, // thin profile -> trust the crowd
            communityWeightMax: 0.15, // rich profile  -> trust the user
            confidenceSample: 25      // distinct rated beers for full confidence
        },
        exploration: {
            bonus: 0.05 // nudge towards untried breweries/styles
        },
        diversity: {
            enabled: true,
            typePenalty: 0.02,   // per already-selected beer of the same type
            breweryPenalty: 0.04,
            maxPerBrewery: 3,
            maxPerType: 6
        },
        output: { maxResults: 20, maxReasons: 5 }
    };

    function deepMerge(target, source) {
        const out = Object.assign({}, target);
        if (source && typeof source === 'object') {
            Object.keys(source).forEach(key => {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    out[key] = deepMerge(target[key] || {}, source[key]);
                } else if (source[key] !== undefined) {
                    out[key] = source[key];
                }
            });
        }
        return out;
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function round1(v) { return Math.round(v * 10) / 10; }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function normalizeText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    function normalizeType(t) { return String(t || '').toLowerCase().trim(); }
    
    function lookupIgnoreCase(obj, key) {
        if (!obj || key == null) return 0;
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        const lower = String(key).toLowerCase();
        for (const k of Object.keys(obj)) {
            if (k.toLowerCase() === lower) return obj[k];
        }
        return 0;
    }

    function parseAbv(beer) {
        const raw = (beer.alcohol || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
        const v = parseFloat(raw);
        return (!isNaN(v) && v > 0 && v < 25) ? v : null;
    }

    function normalizeSigned(aff) {
        const vals = Object.values(aff);
        if (!vals.length) return;
        const max = Math.max(0, ...vals);
        const min = Math.min(0, ...vals);
        Object.keys(aff).forEach(k => {
            const v = aff[k];
            aff[k] = v >= 0 ? (max > 0 ? v / max : 0) : (min < 0 ? v / Math.abs(min) : 0);
        });
    }

    // ── Bilingual flavor lexicon (Canonical Keys) ────────────────────
    const FLAVOR_LEXICON = {
        fruity: ['fruite', 'fruitée', 'fruity', 'fruit', 'fruits secs', 'fruits exotiques'],
        hoppy: ['houblonne', 'houblonnée', 'hoppy', 'hops', 'houblon'],
        roasted: ['torrefie', 'roasted', 'roast', 'grille'],
        spicy: ['epice', 'spicy', 'epices', 'spices', 'poivre', 'pepper', 'reglisse'],
        sour: ['acide', 'sour', 'acidule', 'acidite', 'tart'],
        bitter: ['amertume', 'amere', 'bitter', 'bitterness'],
        sweet: ['doux', 'sucre', 'sweet', 'moelleux'],
        caramel: ['caramel', 'caramelise', 'toffee'],
        citrus: ['agrumes', 'citrus', 'citron', 'lemon', 'orange', 'pamplemousse', 'grapefruit', 'lime', 'bergamote'],
        coffee: ['cafe', 'coffee', 'espresso', 'moka'],
        chocolate: ['chocolat', 'chocolate', 'cacao', 'cacaote'],
        floral: ['floral', 'fleurs', 'flower', 'hibiscus'],
        malty: ['malt', 'malty', 'maltose'],
        herbal: ['herbace', 'herbal', 'herbes', 'herbs', 'menthe', 'mint'],
        smoky: ['fume', 'smoky', 'smoke', 'tourbe', 'peat', 'rauch'],
        woody: ['boise', 'woody', 'oak', 'chene', 'barrique'],
        vanilla: ['vanille', 'vanilla'],
        coriander: ['coriandre', 'coriander'],
        honey: ['miel', 'honey'],
        dry: ['seche', 'dry'],
        yeasty: ['levure', 'yeast', 'brioche'],
        wheat: ['ble', 'wheat', 'froment'],
        resinous: ['resine', 'resinous', 'resin', 'pin'],
        tropical: ['tropical', 'mangue', 'mango', 'ananas', 'pineapple', 'passion', 'litchi', 'lychee', 'guava', 'fruit de la passion'],
        redFruits: ['fruits rouges', 'framboise', 'raspberry', 'cerise', 'cherry', 'fraise', 'strawberry', 'cassis', 'blackcurrant', 'mure', 'blackberry', 'griotte']
    };

    const FLAVOR_MATCHERS = Object.keys(FLAVOR_LEXICON).map(kw => {
        const forms = FLAVOR_LEXICON[kw].map(term => new RegExp('(^|[^a-z0-9])' + escapeRegExp(normalizeText(term)), 'i'));
        return { kw, forms };
    });

    const FLAVOR_CACHE = new WeakMap();
    function extractFlavors(beer) {
        if (!beer) return [];
        if (FLAVOR_CACHE.has(beer)) return FLAVOR_CACHE.get(beer);
        const text = normalizeText([beer.type, beer.ingredients, beer.title, beer.description].filter(Boolean).join(' '));
        if (!text) return [];
        const found = [];
        FLAVOR_MATCHERS.forEach(m => {
            if (m.forms.some(rx => rx.test(text))) found.push(m.kw);
        });
        FLAVOR_CACHE.set(beer, found);
        return found;
    }

    // ── Beer-to-beer similarity ──────────────────────────────────
    function typeSimilarity(ta, tb) {
        ta = normalizeType(ta); tb = normalizeType(tb);
        if (!ta || !tb) return 0;
        if (ta === tb) return 1;
        const setA = new Set(ta.split(/[\s\-\/]+/).filter(Boolean));
        const setB = new Set(tb.split(/[\s\-\/]+/).filter(Boolean));
        let shared = 0;
        setA.forEach(tok => { if (setB.has(tok)) shared++; });
        const union = new Set([...setA, ...setB]).size;
        return union > 0 ? (shared / union) * 0.8 : 0; // partial family match
    }

    function beerSimilarity(a, b) {
        if (!a || !b) return 0;
        let sim = typeSimilarity(a.type, b.type) * 0.45;
        if (a.brewery && b.brewery && String(a.brewery).toLowerCase().trim() === String(b.brewery).toLowerCase().trim()) sim += 0.20;
        
        const fa = extractFlavors(a), fb = extractFlavors(b);
        if (fa.length || fb.length) {
            const setB = new Set(fb);
            const shared = fa.filter(f => setB.has(f)).length;
            const union = new Set([...fa, ...fb]).size;
            sim += (shared / union) * 0.20;
        }
        const abvA = parseAbv(a), abvB = parseAbv(b);
        if (abvA !== null && abvB !== null) {
            sim += Math.max(0, 1 - Math.abs(abvA - abvB) / 6) * 0.15;
        }
        return Math.min(1, sim);
    }

    function BrewBrother(config) {
        this.config = deepMerge(DEFAULTS, config || {});
        this.lastProfile = null;
        this.lastFeedbackCounts = null;
        this.lastDrinkCounts = null;
    }

    BrewBrother.prototype.buildProfile = async function (adapter) {
        const cfg = this.config;
        const w = cfg.weights;
        const sc = cfg.scoring;
        const now = Date.now();
        const rawFeedback = await adapter.getFeedback();
        const feedback = Array.isArray(rawFeedback) ? rawFeedback : [];

        // Optional authoritative drink counter (beerId -> times drunk)
        const drinkCountMap = (typeof adapter.getDrinkCounts === 'function') ? await adapter.getDrinkCounts() : null;
        const getCountFromMap = (id) => {
            if (!drinkCountMap || id == null) return 0;
            if (typeof drinkCountMap.get === 'function') return parseInt(drinkCountMap.get(String(id)) || drinkCountMap.get(id) || 0, 10) || 0;
            return parseInt(drinkCountMap[String(id)] || drinkCountMap[id] || 0, 10) || 0;
        };

        // 1. Aggregate feedback per beer (handles repeat drinks & duplicates)
        const byKey = new Map();
        feedback.forEach(f => {
            if (!f || !f.beer) return;
            const beer = f.beer;
            const key = beer.id != null ? String(beer.id) : `${beer.title || ''}|${beer.brewery || ''}`;
            if (!byKey.has(key)) byKey.set(key, { beer, weightSum: 0, entries: 0, explicitCount: 0, lastTs: 0, hasNegative: false });
            const e = byKey.get(key);
            const countProvided = parseInt(f.count || f.drinkCount || 0, 10) || 0;
            e.weightSum += (typeof f.weight === 'number' ? f.weight : w.drunk);
            e.entries++;
            e.explicitCount += countProvided;
            if (f.weight < 0) e.hasNegative = true;
            e.lastTs = Math.max(e.lastTs, f.timestamp || 0);
        });

        const typeAffinity = {}, breweryAffinity = {}, flavorAffinity = {};
        const typeDrinkCount = {}, breweryDrinkCount = {};
        const anchors = [], negativeAnchors = [];
        let abvSum = 0, abvSq = 0, abvW = 0;
        let distinctBeers = 0, totalDrinks = 0;
        const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

        byKey.forEach((e) => {
            const beer = e.beer;
            const drinkCount = Math.max(1, e.explicitCount, e.entries, getCountFromMap(beer.id));
            if (drinkCount <= 0) return;
            distinctBeers++;
            totalDrinks += drinkCount;

            const rating = e.weightSum / Math.max(1, e.entries); 
            // Loyalty: coming back to a beer N times strengthens the signal (diminishing returns)
            const repeatFactor = 1 + w.repeatDrinkBonus * Math.log(drinkCount);
            
            let decay = 1.0;
            if (e.lastTs) {
                const age = now - e.lastTs;
                if (age > 0) decay = Math.max(0.5, 1.0 - (age / ONE_YEAR) * 0.5);
            }

            const strength = rating * repeatFactor * decay;
            
            if (strength > 1.5) anchors.push({ beer, strength, drinkCount });
            else if (strength < -0.5) negativeAnchors.push({ beer, strength, drinkCount });

            const tKey = beer.type ? String(beer.type).trim() : '';
            if (tKey) {
                typeAffinity[tKey] = (typeAffinity[tKey] || 0) + strength;
                typeDrinkCount[tKey] = (typeDrinkCount[tKey] || 0) + drinkCount;
            }

            const bKey = beer.brewery ? String(beer.brewery).trim() : '';
            if (bKey) {
                breweryAffinity[bKey] = (breweryAffinity[bKey] || 0) + strength;
                breweryDrinkCount[bKey] = (breweryDrinkCount[bKey] || 0) + drinkCount;
            }

            extractFlavors(beer).forEach(fl => {
                flavorAffinity[fl] = (flavorAffinity[fl] || 0) + strength;
            });

            const abv = parseAbv(beer);
            if (abv !== null && strength > 0) {
                abvSum += abv * strength;
                abvSq += abv * abv * strength;
                abvW += strength;
            }
        });

        // Signed Normalization
        normalizeSigned(typeAffinity);
        normalizeSigned(breweryAffinity);
        normalizeSigned(flavorAffinity);

        anchors.sort((a, b) => b.strength - a.strength);
        negativeAnchors.sort((a, b) => a.strength - b.strength);

        // Gaussian ABV tolerance
        const idealAbv = abvW > 0 ? abvSum / abvW : null;
        let abvStd = null;
        if (abvW > 0) {
            const variance = Math.max(0, (abvSq / abvW) - (idealAbv * idealAbv));
            let std = Math.sqrt(variance);
            if (!isFinite(std) || std <= 0) std = 1.25;
            abvStd = clamp(std, 0.75, 3.5);
        }

        const confidenceVal = clamp(distinctBeers / cfg.blending.confidenceSample, 0, 1);

        this.lastProfile = {
            typeAffinity, breweryAffinity, flavorAffinity,
            typeDrinkCount, breweryDrinkCount,
            idealAbv, abvTolerance: abvStd,
            anchors: anchors.slice(0, 40), 
            negativeAnchors: negativeAnchors.slice(0, 15),
            confidence: confidenceVal,
            distinctBeers, 
            totalDrinks
        };

        this.lastFeedbackCounts = new Map(Array.from(byKey.values()).map(e => [String(e.beer.id), Math.max(e.explicitCount, e.entries)]));
        return this.lastProfile;
    };

    BrewBrother.prototype.scoreBeer = function (beer, profile) {
        const cfg = this.config;
        const inf = cfg.influence;
        profile = profile || {};

        const isProfileEmpty = (profile.confidence || 0) === 0 &&
            Object.keys(profile.typeAffinity || {}).length === 0 &&
            Object.keys(profile.flavorAffinity || {}).length === 0;

        const typeScore = lookupIgnoreCase(profile.typeAffinity, beer.type);
        const breweryScore = lookupIgnoreCase(profile.breweryAffinity, beer.brewery);

        const flavors = extractFlavors(beer);
        let flavorScore = 0;
        const likedFlavors = [], dislikedFlavors = [];
        if (flavors.length > 0) {
            let sum = 0;
            flavors.forEach(f => {
                const aff = profile.flavorAffinity ? (profile.flavorAffinity[f] || 0) : 0;
                sum += aff;
                if (aff >= 0.2) likedFlavors.push(f);
                else if (aff <= -0.15) dislikedFlavors.push(f);
            });
            flavorScore = clamp(sum / flavors.length, -1, 1);
        }

        let abvScore = 0.5;
        const abv = parseAbv(beer);
        if (abv !== null && profile.idealAbv != null) {
            const sigma = profile.abvTolerance || 2;
            const diff = abv - profile.idealAbv;
            abvScore = Math.exp(-(diff * diff) / (2 * sigma * sigma));
        }

        // kNN Similarity Score (Nearest loved beer)
        let similarityScore = 0, lovedRef = null, lovedRefDrinks = 0, bestSim = 0;
        if (profile.anchors && profile.anchors.length > 0) {
            let simSum = 0, wSum = 0;
            profile.anchors.forEach(a => {
                const s = beerSimilarity(beer, a.beer);
                simSum += s * a.strength;
                wSum += a.strength;
                if (s > bestSim) { bestSim = s; lovedRef = a.beer.title; lovedRefDrinks = a.drinkCount; }
            });
            if (wSum > 0) similarityScore = simSum / wSum;
            
            if (profile.negativeAnchors && profile.negativeAnchors.length > 0) {
                let negSum = 0, negW = 0;
                profile.negativeAnchors.forEach(a => {
                    negSum += beerSimilarity(beer, a.beer) * Math.abs(a.strength);
                    negW += Math.abs(a.strength);
                });
                if (negW > 0) similarityScore -= 0.8 * (negSum / negW);
            }
            similarityScore = clamp(similarityScore, -1, 1);
        }

        // Mapping signed [-1, 1] to bounded [0, 1] arrays for total score
        const type01 = beer.type ? (typeScore + 1) / 2 : 0.5;
        const brewery01 = beer.brewery ? (breweryScore + 1) / 2 : 0.5;
        const flavor01 = flavors.length ? (flavorScore + 1) / 2 : 0.5;
        const sim01 = profile.anchors && profile.anchors.length ? (similarityScore + 1) / 2 : 0.5;

        let totalScore = 0.5;
        if (!isProfileEmpty) {
            totalScore = (type01 * inf.type) + (brewery01 * inf.brewery) + (flavor01 * inf.flavor) + (abvScore * inf.abv) + (sim01 * inf.similarity);
            
            // Exploration nudge
            const typeUntried = !beer.type || !(lookupIgnoreCase(profile.typeDrinkCount, beer.type) > 0);
            const breweryUntried = !beer.brewery || !(lookupIgnoreCase(profile.breweryDrinkCount, beer.brewery) > 0);
            if (typeUntried || breweryUntried) totalScore += cfg.exploration.bonus;
        }

        let community = null;
        if (beer.community_rating && String(beer.community_rating) !== '') {
            const rating = parseFloat(beer.community_rating) || 0;
            const countRaw = beer.community_rating_count !== undefined ? beer.community_rating_count : beer.rating_count;
            const count = parseInt(countRaw, 10) || 0;
            const smoothed = count > 0 ? (rating * count + cfg.scoring.communityPriorRating * cfg.scoring.communityPrior) / (count + cfg.scoring.communityPrior) : rating;
            community = { rating, count, smoothed: parseFloat(smoothed.toFixed(2)) };

            const commScore = clamp(smoothed / 5.0, 0, 1);
            const qualityWeight = isProfileEmpty
                ? cfg.blending.communityWeightMin
                : cfg.blending.communityWeightMin + (cfg.blending.communityWeightMax - cfg.blending.communityWeightMin) * (profile.confidence || 0);
            totalScore = (totalScore * (1 - qualityWeight)) + (commScore * qualityWeight);
        }

        totalScore = Math.pow(clamp(totalScore + Math.random() * cfg.scoring.jitter, 0, 1), cfg.scoring.curve);

        return {
            score20: parseFloat((totalScore * 20).toFixed(1)),
            percentage: Math.round(totalScore * 100),
            total: totalScore,
            // Legacy / analytical fields
            typeScore: type01, breweryScore: brewery01, flavorScore: flavor01, abvScore, similarityScore: sim01,
            // For NLP
            abv, flavors, likedFlavors, dislikedFlavors, community,
            dims: { typeSigned: typeScore, brewerySigned: breweryScore, flavorSigned: flavorScore, abvScore, repeatSim: similarityScore },
            evidence: {
                typeDrinks: lookupIgnoreCase(profile.typeDrinkCount, beer.type),
                breweryDrinks: lookupIgnoreCase(profile.breweryDrinkCount, beer.brewery),
                lovedRef: (lovedRef && bestSim > 0.35) ? lovedRef : null,
                lovedRefDrinks,
                flavors,
                idealAbv: profile.idealAbv !== null ? round1(profile.idealAbv) : null,
                profileSize: profile.distinctBeers || 0,
                totalDrinks: profile.totalDrinks || 0,
                abvTolerance: profile.abvTolerance
            }
        };
    };

    BrewBrother.prototype.buildReasons = function (beer, match, profile) {
        const sc = this.config.scoring;
        const reasons = [];
        const d = match.dims || {};
        const ev = match.evidence || {};
        const type = beer.type ? String(beer.type).trim() : '';
        const brewery = beer.brewery ? String(beer.brewery).trim() : '';

        // Positives
        if (d.typeSigned >= sc.reasonThreshold && type) reasons.push({ code: 'type', strength: d.typeSigned, detail: ev });
        if (d.brewerySigned >= sc.reasonThreshold && brewery) reasons.push({ code: 'brewery', strength: d.brewerySigned, detail: ev });
        if (match.likedFlavors && match.likedFlavors.length && d.flavorSigned >= 0.3) reasons.push({ code: 'flavor', strength: Math.min(1, d.flavorSigned + 0.2), detail: ev });
        if (d.abvScore >= 0.75 && ev.idealAbv !== null && match.abv !== null) reasons.push({ code: 'abv', strength: d.abvScore, detail: ev });
        if (d.repeatSim >= 0.4 && ev.lovedRef) reasons.push({ code: 'similar', strength: d.repeatSim + 0.2, detail: ev });
        if (ev.typeDrinks >= this.config.weights.loyaltyThreshold && d.typeSigned > 0.4) reasons.push({ code: 'repeat', strength: d.typeSigned + 0.1, detail: ev });
        if (match.community && match.community.smoothed >= 4.0) reasons.push({ code: 'community', strength: Math.min(1, match.community.smoothed / 5), detail: ev });

        // Mismatches
        if (d.typeSigned <= sc.mismatchThreshold && type) reasons.push({ code: 'type_mismatch', strength: Math.min(1, -d.typeSigned), detail: ev });
        if (d.brewerySigned <= sc.mismatchThreshold && brewery) reasons.push({ code: 'brewery_mismatch', strength: Math.min(1, -d.brewerySigned), detail: ev });
        if (match.dislikedFlavors && match.dislikedFlavors.length && d.flavorSigned <= -0.15) reasons.push({ code: 'flavor_mismatch', strength: Math.min(1, 0.5 - d.flavorSigned), detail: ev });
        if (d.abvScore <= 0.25 && ev.idealAbv !== null && match.abv !== null) reasons.push({ code: 'abv_mismatch', strength: 1 - d.abvScore, detail: ev });

        reasons.sort((a, b) => b.strength - a.strength);
        return reasons.slice(0, this.config.output.maxReasons);
    };

    BrewBrother.prototype.recommend = async function (adapter, manualProfile = null) {
        const cfg = this.config;
        const profile = manualProfile || await this.buildProfile(adapter);
        const rawCandidates = await adapter.getCandidates();
        const candidates = Array.isArray(rawCandidates) ? rawCandidates : [];
        const drunkIdsRaw = await adapter.getDrunkIds();
        const drunkIds = drunkIdsRaw && typeof drunkIdsRaw.has === 'function' ? drunkIdsRaw : new Set();

        const scored = [];
        candidates.forEach(beer => {
            if (!beer || beer.id === undefined || beer.id === null) return;
            // NON BUES EVIDEMMENT
            if (drunkIds.has(String(beer.id))) return;

            const match = this.scoreBeer(beer, profile);
            const reasons = this.buildReasons(beer, match, profile);
            match.reasons = reasons;
            match.reasonCodes = reasons.map(r => 'brewbrother_reason_' + r.code.replace('_mismatch', ''));
            
            scored.push(Object.assign({}, beer, { _brewBrotherMatch: match }));
        });

        scored.sort((a, b) => b._brewBrotherMatch.total - a._brewBrotherMatch.total);

        // Diversity-aware selection (MMR-lite)
        const results = [];
        if (cfg.diversity.enabled) {
            const d = cfg.diversity;
            const typeCount = {}, breweryCount = {};
            const pool = scored.slice();

            while (results.length < cfg.output.maxResults && pool.length > 0) {
                let bestIdx = -1, bestVal = -Infinity;
                for (let i = 0; i < pool.length; i++) {
                    const c = pool[i];
                    const m = c._brewBrotherMatch;
                    const tKey = String(c.type || '').trim().toLowerCase();
                    const bKey = String(c.brewery || '').trim().toLowerCase();
                    
                    if (d.maxPerBrewery > 0 && (breweryCount[bKey] || 0) >= d.maxPerBrewery) continue;
                    if (d.maxPerType > 0 && (typeCount[tKey] || 0) >= d.maxPerType) continue;
                    
                    let val = m.total;
                    val -= d.typePenalty * (typeCount[tKey] || 0);
                    val -= d.breweryPenalty * (breweryCount[bKey] || 0);
                    
                    if (val > bestVal) { bestVal = val; bestIdx = i; }
                }

                if (bestIdx === -1) {
                    pool.sort((a, b) => b._brewBrotherMatch.total - a._brewBrotherMatch.total);
                    while (results.length < cfg.output.maxResults && pool.length > 0) results.push(pool.shift());
                    break;
                }

                const chosen = pool.splice(bestIdx, 1)[0];
                results.push(chosen);
                const t = String(chosen.type || '').trim().toLowerCase();
                const b = String(chosen.brewery || '').trim().toLowerCase();
                if (t) typeCount[t] = (typeCount[t] || 0) + 1;
                if (b) breweryCount[b] = (breweryCount[b] || 0) + 1;
            }
        } else {
            results.push(...scored.slice(0, cfg.output.maxResults));
        }

        results.forEach((item, i) => { item._brewBrotherMatch.rank = i + 1; });
        return { results, profile, drinkCounts: this.lastDrinkCounts || this.lastFeedbackCounts };
    };

    BrewBrother.prototype.getProfile = function () { return this.lastProfile; };
    BrewBrother.prototype.getDrinkCount = function (beerId) {
        const counts = this.lastDrinkCounts || this.lastFeedbackCounts;
        if (!counts) return 0;
        const key = String(beerId);
        if (typeof counts.get === 'function') return counts.get(key) || 0;
        return counts[key] || 0;
    };

    BrewBrother.DEFAULTS = DEFAULTS;
    BrewBrother.FLAVOR_LEXICON = FLAVOR_LEXICON;
    BrewBrother.FLAVOR_KEYWORDS = Object.keys(FLAVOR_LEXICON);
    BrewBrother.utils = { extractFlavors, beerSimilarity, parseAbv };

    if (typeof module !== 'undefined' && module.exports) module.exports = BrewBrother;
    else { root.BrewBrother = BrewBrother; root.Recommender = BrewBrother; }

})(typeof window !== 'undefined' ? window : this);

// brewbrother_nlp.js — RosaeNLG-inspired Cohesive Narrative Synthesizer v2.0 for BeerDex
// ══════════════════════════════════════════════════════════════════════════════════
// WHAT'S NEW IN v2.0
//   • Composed narratives instead of single canned scenarios: opener + prestige
//     clause + data-backed reason sentences + outro (+ tasted note).
//   • Reason sentences carry REAL numbers (tasting counts, average ratings,
//     ABV sweet spot, community stats, re-drink counts) provided by the
//     BrewBrother engine — no more generic one-size-fits-all text.
//   • Four sentiment tiers (excellent / positive / mixed / negative).
//   • Anti-repetition memory (pickFresh) ensures successive reviews vary.
//   • Advanced French surface realization (smart elisions, non-breaking spaces).
// ══════════════════════════════════════════════════════════════════════════════════

(function (root) {
    'use strict';

    const NLP = {
        dict: {},
        currentLang: null,
        _recent: {},

        init: async function(lang) {
            if (this.currentLang === lang && Object.keys(this.dict).length > 0) return;
            try {
                const response = await fetch(`data/locales/nlp_${lang}.json`);
                if (!response.ok) throw new Error('Network response was not ok');
                this.dict = await response.json();
                this.currentLang = lang;
                this._recent = {};
            } catch (error) {
                console.error("Could not load NLP dictionary:", error);
                this.currentLang = lang;
            }
        },

        getRandom: function(array) {
            return array && array.length > 0 ? array[Math.floor(Math.random() * array.length)] : "";
        },

        pickFresh: function(array, key, memory = 2) {
            if (!array || array.length === 0) return "";
            if (array.length === 1) return array[0];
            const recent = this._recent[key] || (this._recent[key] = []);
            const pool = array.filter(s => recent.indexOf(s) === -1);
            const finalPool = pool.length > 0 ? pool : array;
            const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
            recent.push(pick);
            if (recent.length > memory) recent.shift();
            return pick;
        },

        formatNumber: function (value, lang, decimals) {
            const n = Number(value);
            if (isNaN(n)) return String(value);
            let dec = decimals !== undefined ? decimals : (Number.isInteger(n) ? 0 : 1);
            const fixed = n.toFixed(dec);
            return lang === 'fr' ? fixed.replace('.', ',') : fixed;
        },

        formatList: function(items, lang) {
            if (!items || items.length === 0) return "";
            const parts = items.slice(0, 3);
            if (parts.length === 1) return parts[0];
            const joiner = lang === 'fr' ? ' et ' : (parts.length === 2 ? ' and ' : ', and ');
            if (parts.length === 2) return parts[0] + joiner + parts[1];
            return parts.slice(0, -1).join(', ') + joiner + parts[parts.length - 1];
        },

        getFlavorName: function (key) {
            const names = (this.dict && this.dict.flavorNames) || {};
            return names[key] || key;
        },

        fmtTimes: function(n, lang) {
            n = parseInt(n, 10);
            if (isNaN(n) || n < 1) n = 1;
            if (lang === 'fr') return n === 1 ? 'une fois' : (n === 2 ? 'deux fois' : `${n} fois`);
            return n === 1 ? 'once' : (n === 2 ? 'twice' : `${n} times`);
        },

        describeAbv: function(abvRaw, lang) {
            const v = parseFloat(String(abvRaw || '').replace(',', '.').replace(/[^0-9.]/g, ''));
            if (isNaN(v) || v <= 0) return '';
            const fr = v < 3.5 ? 'très modéré' : v < 5 ? 'léger' : v < 7.5 ? 'modéré' : v < 9.5 ? 'costaud' : 'puissant';
            const en = v < 3.5 ? 'very light' : v < 5 ? 'light' : v < 7.5 ? 'moderate' : v < 9.5 ? 'robust' : 'powerful';
            return lang === 'fr' ? fr : en;
        },

        formatAbv: function (beer, lang) {
            const raw = beer && beer.alcohol;
            if (raw === undefined || raw === null || String(raw).trim() === '') return lang === 'fr' ? 'degré moyen' : 'medium ABV';
            const n = parseFloat(String(raw).replace(',', '.'));
            if (isNaN(n)) return String(raw);
            return lang === 'fr' ? this.formatNumber(n, lang) + '°' : this.formatNumber(n, lang) + '%';
        },

        getPrestigeLevel: function(beer) {
            const brewery = ((beer.brewery || '') + ' ' + (beer.title || '')).toLowerCase();
            const rarity = (beer.rarity || 'commun').toLowerCase();

            const isIndustrial = /heineken|leffe|kronenbourg|1664|jupiler|stella|maes|bavaria|carlsberg|budweiser|desperados|grimbergen|affligem|hoegaarden|skoll|pelforth|gordon|amstel|bavaroise|fischer|kanterbr|schützen|corona|modelo|asahi|sapporo|kirin|tsingtao|peroni|moretti|warsteiner|bitburger|krombacher|veltins|erdinger|paulaner|franziskaner|spaten/.test(brewery);
            const isPrestige = /cantillon|3 fonteinen|drie fonteinen|popihn|piggy|cloudwater|verdant|tree house|hill farmstead|bokke|westvleteren|rochefort|orval|chimay|westmalle|achel|la trappe|st\. bernardus|struise|dupont|paix dieu|mikkeller|omnipollo|evil twin|de la senne|to øl|to ol|nogne|siren|thornbridge|cigar city|jolly pumpkin|other half|trillium|side project|de molen|lervig|buxton|beavertown/.test(brewery) || ['epique', 'mythique', 'legendaire', 'ultra_legendaire'].includes(rarity);

            if (isIndustrial) return 'industrial';
            if (isPrestige) return 'prestige';
            if (['rare', 'super_rare'].includes(rarity)) return 'craft';
            return 'standard';
        },

        sentimentTier: function (percentage) {
            if (percentage >= 85) return 'excellent';
            if (percentage >= 65) return 'positive';
            if (percentage >= 40) return 'mixed';
            return 'negative';
        },

        getArticleForms: function (type, lang) {
            const t = String(type || '').trim();
            const tLower = t.toLowerCase();
            if (lang === 'fr') {
                const isMasc = ['lambic', 'bock', 'barleywine', 'faro', 'farô', 'doppelbock', 'eisbock', 'roggenbier', 'rauchbier'].some(m => tLower.includes(m));
                return {
                    type: t,
                    le_type: isMasc ? 'le ' + t : 'la ' + t,
                    un_type: isMasc ? 'un ' + t : 'une ' + t,
                    du_type: isMasc ? 'du ' + t : 'de la ' + t,
                    de_type: 'de ' + t,
                    ce_type: isMasc ? 'ce ' + t : 'cette ' + t
                };
            }
            return {
                type: t,
                le_type: 'the ' + t,
                un_type: 'a ' + t,
                du_type: 'of the ' + t,
                de_type: 'of ' + t,
                ce_type: 'this ' + t
            };
        },

        buildGlobalCtx: function (beer, ev, match, lang) {
            beer = beer || {};
            ev = ev || {};
            const ctx = {
                title: beer.title || (lang === 'fr' ? 'cette bière' : 'this beer'),
                brewery: beer.brewery || (lang === 'fr' ? 'la brasserie' : 'the brewery'),
                type: beer.type || (lang === 'fr' ? 'bière' : 'beer'),
                abv: this.formatAbv(beer, lang)
            };
            ctx.total_drinks = ev.totalDrinks || 0;
            ctx.distinct_beers = ev.profileSize || 0;
            ctx.match_pct = (match && match.percentage != null) ? match.percentage : '';
            return ctx;
        },

        buildReasonCtx: function (reason, lang) {
            const d = (reason && reason.detail) || {};
            const ctx = {};
            const num = (v, dec) => (typeof v === 'number' && !isNaN(v)) ? this.formatNumber(v, lang, dec) : '';

            if (d.type) {
                ctx.type = d.type;
                ctx.type_drinks = d.drinkCount > 0 ? String(d.drinkCount) : (lang === 'fr' ? 'plusieurs' : 'several');
                ctx.type_avg = num(d.avgRating, 1);
            }
            if (d.brewery) {
                ctx.brewery = d.brewery;
                ctx.brewery_drinks = d.drinkCount || 0;
            }
            if (Array.isArray(d.flavors) && d.flavors.length) {
                ctx.flavors = this.formatList(d.flavors.map(k => this.getFlavorName(k)), lang);
            }
            if (typeof d.beerAbv === 'number') {
                ctx.abv_beer = num(d.beerAbv);
                ctx.abv_ideal = num(d.idealAbv);
                ctx.abv_pref = d.idealAbv != null ? `${num(d.idealAbv)}°` : (lang === 'fr' ? 'votre zone habituelle' : 'your usual range');
            }
            if (typeof d.rating === 'number') {
                ctx.community_rating = num(d.rating, 1);
                ctx.community_count = d.count || 0;
            }
            if (d.title) {
                ctx.loved_ref = d.title;
                ctx.loved_ref_drinks = this.fmtTimes(d.count || 1, lang);
            }
            return ctx;
        },

        pickReasonTemplate: function (reason, toneGroup) {
            const pools = (toneGroup.reasons && toneGroup.reasons[reason.code]) || null;
            if (!pools) return "";
            const tier = reason.strength >= 0.65 ? 'strong' : 'standard';
            const hasCount = reason.detail && typeof reason.detail.drinkCount === 'number' && reason.detail.drinkCount >= 2;

            if (hasCount && Array.isArray(pools[tier + '_count']) && pools[tier + '_count'].length) {
                return this.getRandom(pools[tier + '_count']);
            }
            if (Array.isArray(pools[tier]) && pools[tier].length) {
                return this.getRandom(pools[tier]);
            }
            const keys = Object.keys(pools);
            for (let i = 0; i < keys.length; i++) {
                if (Array.isArray(pools[keys[i]]) && pools[keys[i]].length) return this.getRandom(pools[keys[i]]);
            }
            return "";
        },

        buildReasonClause: function(t, match, beer, lang, tier) {
            if (!t || !t.reason_clauses) return "";
            const c = t.reason_clauses;
            const ev = (match && match.evidence) || {};
            const reasons = (match && match.reasons) || [];
            const rCodes = reasons.map(r => r.code);
            const d = match.dims || {};
            
            const neg = tier === 'negative';
            const mixed = tier === 'mixed';
            const pool = [];

            if (!neg && c.similar && ev.lovedRef && (ev.lovedRefDrinks || 0) >= 2) pool.push(...c.similar);
            if (c.type && (ev.typeDrinks || 0) >= 3) {
                if (neg ? (d.typeSigned < -0.05) : (mixed || d.typeSigned > 0.2)) pool.push(...c.type);
            }
            if (!neg && c.repeat && rCodes.includes('repeat')) pool.push(...c.repeat);
            if (c.brewery && (ev.breweryDrinks || 0) >= 2) {
                if (neg ? (d.brewerySigned < -0.05) : (mixed || d.brewerySigned > 0.1)) pool.push(...c.brewery);
            }
            if (c.abv && ev.idealAbv != null) {
                if (neg ? (d.abvScore < 0.45) : (mixed ? d.abvScore < 0.7 : d.abvScore > 0.7)) pool.push(...c.abv);
            }
            if (c.flavor && ev.flavors && ev.flavors.length > 0) {
                if (neg ? (d.flavorSigned < -0.05) : (mixed ? Math.abs(d.flavorSigned) > 0.15 : d.flavorSigned > 0.5)) pool.push(...c.flavor);
            }
            if (c.community && (rCodes.includes('community') || (beer && parseFloat(beer.community_rating) >= 4))) {
                pool.push(...c.community);
            }

            if (pool.length === 0) return "";
            return this.pickFresh(pool, `clause_${lang}_${tier}`, 3);
        },

        formatSlots: function(template, beer, prestigeDesc, outro, lang, ctx) {
            ctx = ctx || {};
            const ev = ctx.evidence || {};
            let res = template || "";
            const forms = this.getArticleForms(beer.type || ev.type, lang);
            
            Object.keys(forms).forEach(k => {
                res = res.split('{' + k + '}').join(forms[k]);
            });

            const merged = Object.assign({}, ctx.global, ctx.reason, {
                prestige_desc: prestigeDesc || '',
                outro: outro || '',
                reason_clause: ctx.reasonClause || '',
                abv_strength: this.describeAbv(beer.alcohol, lang)
            });

            Object.keys(merged).forEach(k => {
                const v = merged[k];
                res = res.split('{' + k + '}').join(v == null ? '' : String(v));
            });

            return res;
        },

        surfaceRealize: function (text, lang) {
            if (!text) return "";
            let res = text;

            if (lang === 'fr') {
                res = res.replace(/\bde\s+le\b/gi, 'du');
                res = res.replace(/\bde\s+les\b/gi, 'des');
                res = res.replace(/\bà\s+le\b/gi, 'au');
                res = res.replace(/\bà\s+les\b/gi, 'aux');
                res = res.replace(/\b(de|du|le|la|ce|que|se|ne|me|te)\s+([aeiouyéèêàâîôû][\wÀ-ÿ-]*)/gi, (match, prefix, word) => {
                    const p = prefix.toLowerCase();
                    if (p === 'de' || p === 'du') return "d'" + word;
                    if (p === 'le' || p === 'la') return "l'" + word;
                    if (p === 'ce') return 'cet ' + word;
                    if (p === 'que') return "qu'" + word;
                    if (p === 'se') return "s'" + word;
                    if (p === 'ne') return "n'" + word;
                    if (p === 'me') return "m'" + word;
                    if (p === 'te') return "t'" + word;
                    return match;
                });
                res = res.replace(/\bsi\s+(ils?)\b/gi, "s'$1");
            } else {
                const AN_EXCEPTIONS = /^(uni|use|usu|euro|one|once|ubiq)/i;
                const AN_EXTRA = /^(hour|honest|honor|heir)/i;
                res = res.replace(/\b([Aa])\s+([\w-]+)/g, (m, a, word) => {
                    const w = word.toLowerCase();
                    if ((/^[aeiou]/.test(w) && !AN_EXCEPTIONS.test(w)) || AN_EXTRA.test(w)) return (a === 'A' ? 'An' : 'an') + ' ' + word;
                    return m;
                });
            }

            // Cleanup & Typography
            res = res.replace(/\s+/g, ' ');
            res = res.replace(/\(\s*\)/g, '');
            res = res.replace(/,\s*,+/g, ',');
            res = res.replace(/([.,;:])(\s*[.,;:])+/g, '$1');
            res = res.replace(/\s+([.,])/g, '$1');
            if (lang === 'fr') res = res.replace(/ ([!?;:])/g, '\u00A0$1'); // French non-breaking space
            else res = res.replace(/\s+([!?;:])/g, '$1');

            res = res.replace(/([.!?])\s*([a-zà-ÿ])/g, (m, p, l) => p + ' ' + l.toUpperCase());
            res = res.trim();
            if (res.length > 0) res = res.charAt(0).toUpperCase() + res.slice(1);
            return res;
        },

        generateExplanation: async function (beer, match, tone = 'brewbrother', lang = 'fr', isAlreadyTasted = false) {
            await this.init(lang);

            let toneGroup = this.dict[tone] || this.dict['brewbrother'] || Object.values(this.dict)[0];
            if (!toneGroup) return "";

            match = match || {};
            const ev = match.evidence || {};
            const pct = match.percentage != null ? match.percentage : 50;
            const tier = this.sentimentTier(pct);
            const sentiment = (tier === 'excellent' || tier === 'positive') ? 'positive' : (tier === 'negative' ? 'negative' : 'mixed');

            const t = toneGroup[tier] || toneGroup['positive'] || toneGroup['mixed'];
            if (!t) return "";

            const globalCtx = this.buildGlobalCtx(beer, ev, match, lang);
            const parts = [];

            // 1. Opener (statistical vs standard)
            const openerPools = (toneGroup.openers && toneGroup.openers[tier]) || null;
            let openerPool = [];
            if (Array.isArray(openerPools)) {
                openerPool = openerPools;
            } else if (openerPools) {
                const useStats = ev.totalDrinks >= 5 && Array.isArray(openerPools.withStats) && openerPools.withStats.length > 0;
                openerPool = useStats ? openerPools.withStats : (openerPools.standard || []);
            }
            const opener = this.getRandom(openerPool);
            if (opener) parts.push(this.formatSlots(opener, beer, "", "", lang, { global: globalCtx }));

            // 2. Prestige
            const prestigeLevel = this.getPrestigeLevel(beer);
            const prestigePool = (t.prestige_desc && t.prestige_desc[prestigeLevel] && t.prestige_desc[prestigeLevel][sentiment]) || [];
            const prestigeDesc = this.getRandom(prestigePool);

            // 3. Outro
            const outroPool = isAlreadyTasted ? (toneGroup.alreadyTasted || []) : (t.outros || []);
            const outro = this.pickFresh(outroPool, `outro_${tone}_${lang}_${tier}`);

            // 4. Data-driven embedded Reason Clause
            const reasonClause = this.buildReasonClause(t, match, beer, lang, tier);

            // 5. Narrative Scenario
            const scenario = this.pickFresh(t.scenarios, `scen_${tone}_${lang}_${tier}`);

            // 6. Reasons Sentences (Budgeted)
            const reasons = Array.isArray(match.reasons) ? match.reasons : [];
            const budgets = { excellent: { pos: 3, neg: 1 }, positive: { pos: 3, neg: 1 }, mixed: { pos: 2, neg: 2 }, negative: { pos: 1, neg: 3 } };
            const budget = budgets[tier];
            
            const reasonSentences = [];
            let posUsed = 0, negUsed = 0;
            reasons.forEach(r => {
                const isNeg = r.code && r.code.includes('_mismatch');
                if (isNeg ? negUsed >= budget.neg : posUsed >= budget.pos) return;
                const rTpl = this.pickReasonTemplate(r, toneGroup);
                if (!rTpl) return;
                const rCtx = this.buildReasonCtx(r, lang);
                reasonSentences.push(this.formatSlots(rTpl, beer, "", "", lang, { global: globalCtx, reason: rCtx }));
                if (isNeg) negUsed++; else posUsed++;
            });

            // 7. Assembly
            const fullCtx = { global: globalCtx, evidence: ev, match, reasonClause };
            let rawText = this.formatSlots(scenario, beer, prestigeDesc, outro, lang, fullCtx);
            if (reasonSentences.length > 0) rawText += " " + reasonSentences.join(" ");

            // 8. Tasted Note Append (if not handled by outro swap)
            if (isAlreadyTasted) {
                const tastedCount = Math.max(1, typeof isAlreadyTasted === 'number' ? Math.floor(isAlreadyTasted) : 1);
                const at = toneGroup.alreadyTasted || {};
                let pool = (tastedCount >= 2 && Array.isArray(at.multiple) && at.multiple.length) ? at.multiple : (at.once || []);
                if (!Array.isArray(pool)) pool = [];
                const note = this.getRandom(pool);
                if (note) rawText += " " + this.formatSlots(note, beer, "", "", lang, { global: Object.assign({}, globalCtx, { count: tastedCount }) });
            }

            // Fallback for legacy dicts
            if (!rawText.trim() && toneGroup[sentiment] && toneGroup[sentiment].scenarios) {
                const legacyScenario = this.getRandom(toneGroup[sentiment].scenarios);
                rawText = this.formatSlots(legacyScenario, beer, prestigeDesc, outro, lang, fullCtx);
            }

            return this.surfaceRealize(rawText, lang);
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = NLP;
    else { root.NLP = NLP; root.BrewBrotherNLP = NLP; }

})(typeof window !== 'undefined' ? window : this);