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
            lang = lang || 'fr';
            if (this.currentLang === lang && Object.keys(this.dict).length > 0) return;
            try {
                const response = await fetch(`data/locales/nlp_${lang}.json`);
                if (!response.ok) throw new Error('Network response was not ok');
                this.dict = await response.json();
                this.currentLang = lang;
                this._recent = {};
            } catch (error) {
                console.error("Could not load NLP dictionary for lang:", lang, error);
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
            if (isNaN(n)) return String(value || '');
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
            if (!key) return "";
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
            if (!beer) return 'standard';
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
                const isMasc = ['lambic', 'bock', 'barleywine', 'faro', 'farô', 'doppelbock', 'eisbock', 'roggenbier', 'rauchbier', 'stout', 'porter', 'lager', 'pils'].some(m => tLower.includes(m));
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
            match = match || {};
            const num = (v, dec) => (typeof v === 'number' && !isNaN(v)) ? this.formatNumber(v, lang, dec) : '';
            const flavorsList = Array.isArray(ev.flavors) && ev.flavors.length 
                ? ev.flavors 
                : (Array.isArray(match.flavors) ? match.flavors : []);

            const favType = ev.favoriteType || beer.type || (lang === 'fr' ? 'ce style' : 'this style');
            const favTypeCount = ev.favoriteTypeCount || ev.typeDrinks || ev.totalDrinks || 0;
            const idealAbvVal = ev.idealAbv != null ? num(ev.idealAbv, 1) : '';
            const prefAbvVal = ev.idealAbv != null ? `${num(ev.idealAbv, 1)}${lang === 'fr' ? '°' : '%'}` : (lang === 'fr' ? 'votre zone habituelle' : 'your usual range');

            const ctx = {
                title: beer.title || (lang === 'fr' ? 'cette bière' : 'this beer'),
                brewery: beer.brewery || (lang === 'fr' ? 'la brasserie' : 'the brewery'),
                type: beer.type || (lang === 'fr' ? 'bière' : 'beer'),
                abv: this.formatAbv(beer, lang),
                abv_beer: this.formatAbv(beer, lang),
                abv_ideal: idealAbvVal,
                abv_pref: prefAbvVal,
                abv_strength: this.describeAbv(beer.alcohol, lang),
                total_drinks: ev.totalDrinks || 0,
                distinct_beers: ev.profileSize || 0,
                match_pct: (match.percentage != null) ? match.percentage : '',
                loved_ref: ev.lovedRef || (lang === 'fr' ? 'vos références favorites' : 'your favorite references'),
                loved_ref_drinks: this.fmtTimes(ev.lovedRefDrinks || 1, lang),
                type_drinks: ev.typeDrinks || 0,
                type_avg: (typeof ev.typeAvg === 'number') ? num(ev.typeAvg, 1) : '',
                brewery_drinks: ev.breweryDrinks || 0,
                favorite_type: favType,
                favorite_type_count: favTypeCount,
                flavors: flavorsList.length ? this.formatList(flavorsList.map(k => this.getFlavorName(k)), lang) : (lang === 'fr' ? 'aromatique' : 'aromatic'),
                community_rating: (match.community && typeof match.community.rating === 'number') ? num(match.community.rating, 1) : (beer.community_rating ? num(parseFloat(beer.community_rating), 1) : '4'),
                community_count: (match.community && match.community.count) ? match.community.count : (beer.rating_count || 0),
                count: 1
            };
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
                ctx.abv_beer = num(d.beerAbv) + (lang === 'fr' ? '°' : '%');
                ctx.abv_ideal = num(d.idealAbv);
                ctx.abv_pref = d.idealAbv != null ? `${num(d.idealAbv)}${lang === 'fr' ? '°' : '%'}` : (lang === 'fr' ? 'votre zone habituelle' : 'your usual range');
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

            // Fallback for cases without enough personal data points
            if (pool.length === 0) {
                if (c.community && beer && beer.community_rating) pool.push(...c.community);
                else if (c.flavor && ev.flavors && ev.flavors.length > 0) pool.push(...c.flavor);
                else if (c.type) pool.push(...c.type);
            }

            if (pool.length === 0) return "";
            return this.pickFresh(pool, `clause_${lang}_${tier}`, 3);
        },

        formatSlots: function(template, beer, prestigeDesc, outro, lang, ctx) {
            ctx = ctx || {};
            const ev = ctx.evidence || {};
            const beerObj = beer || {};
            let res = template || "";
            
            // 1. Expand high-level blocks first
            if (res.includes('{prestige_desc}')) {
                res = res.replace(/\{prestige_desc\}/g, prestigeDesc || '');
            }
            if (res.includes('{outro}')) {
                res = res.replace(/\{outro\}/g, outro || '');
            }
            if (res.includes('{reason_clause}')) {
                res = res.replace(/\{reason_clause\}/g, ctx.reasonClause || '');
            }

            // 2. Build full replacement map
            const typeStr = beerObj.type || ev.type || (ctx.global && ctx.global.type) || '';
            const forms = this.getArticleForms(typeStr, lang);
            
            const merged = Object.assign({}, ctx.global, ctx.reason, {
                abv_strength: this.describeAbv(beerObj.alcohol, lang)
            });

            // 3. Multi-pass slot replacement to resolve nested / inserted tokens
            let prev = "";
            let passes = 0;
            while (res !== prev && passes < 3) {
                prev = res;
                passes++;

                // Article forms
                Object.keys(forms).forEach(k => {
                    const rx = new RegExp('\\{' + k + '\\}', 'g');
                    res = res.replace(rx, forms[k]);
                });

                // Context variables
                Object.keys(merged).forEach(k => {
                    const v = merged[k];
                    if (v !== undefined) {
                        const rx = new RegExp('\\{' + k + '\\}', 'g');
                        res = res.replace(rx, v == null ? '' : String(v));
                    }
                });
            }

            // 4. Remove any remaining unresolved {tags} if any
            res = res.replace(/\{[a-z0-9_]+\}/gi, '');

            return res;
        },

        surfaceRealize: function (text, lang) {
            if (!text) return "";
            let res = text;

            if (lang === 'fr') {
                // 1. Contractions de prépositions ("de le" -> "du", "de les" -> "des", "à le" -> "au", "à les" -> "aux")
                // Utilisation de (^|[^\p{L}\p{N}_]) pour éviter les faux positifs en fin de mot français accentué
                res = res.replace(/(^|[^\p{L}\p{N}_])de\s+le\b/gui, '$1du');
                res = res.replace(/(^|[^\p{L}\p{N}_])de\s+les\b/gui, '$1des');
                res = res.replace(/(^|[^\p{L}\p{N}_])à\s+le\b/gui, '$1au');
                res = res.replace(/(^|[^\p{L}\p{N}_])à\s+les\b/gui, '$1aux');

                // 2. Élisions devant voyelles / h muet (d', l', cet, qu', s', n', m', t')
                // Note : On utilise \p{L} avec le drapeau /u pour respecter l'ensemble des caractères Unicode français
                res = res.replace(/(^|[^\p{L}\p{N}_])(de|du|le|la|ce|que|se|ne|me|te)\s+([aeiouyéèêëàâäîïôöûü][\p{L}\p{N}-]*)/gui, (match, before, prefix, word) => {
                    const p = prefix.toLowerCase();
                    let elided = prefix;
                    if (p === 'de' || p === 'du') elided = "d'";
                    else if (p === 'le' || p === 'la') elided = "l'";
                    else if (p === 'ce') elided = 'cet ';
                    else if (p === 'que') elided = "qu'";
                    else if (p === 'se') elided = "s'";
                    else if (p === 'ne') elided = "n'";
                    else if (p === 'me') elided = "m'";
                    else if (p === 'te') elided = "t'";
                    
                    return before + elided + word;
                });

                res = res.replace(/(^|[^\p{L}\p{N}_])si\s+(ils?)\b/gui, "$1s'$2");
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
            if (lang === 'fr') {
                res = res.replace(/ ([!?;:])/g, '\u00A0$1'); // French non-breaking space
            } else {
                res = res.replace(/\s+([!?;:])/g, '$1');
            }

            // Fix capital after sentence-ending punctuation
            res = res.replace(/([.!?])\s*([\p{Ll}])/gu, (m, p, l) => p + ' ' + l.toUpperCase());
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

            const t = toneGroup[tier] || toneGroup['positive'] || toneGroup['mixed'] || toneGroup['negative'];
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
            const prestigePool = (t.prestige_desc && t.prestige_desc[prestigeLevel] && (t.prestige_desc[prestigeLevel][sentiment] || t.prestige_desc[prestigeLevel]['positive'] || t.prestige_desc[prestigeLevel]['negative'])) || [];
            const prestigeDesc = Array.isArray(prestigePool) ? this.getRandom(prestigePool) : (typeof prestigePool === 'string' ? prestigePool : "");

            // 3. Outro
            const outroPool = isAlreadyTasted ? ((toneGroup.alreadyTasted && toneGroup.alreadyTasted.once) || toneGroup.alreadyTasted || []) : (t.outros || []);
            const outro = Array.isArray(outroPool) ? this.pickFresh(outroPool, `outro_${tone}_${lang}_${tier}`) : "";

            // 4. Data-driven embedded Reason Clause
            const reasonClause = this.buildReasonClause(t, match, beer, lang, tier);

            // 5. Narrative Scenario
            const scenario = this.pickFresh(t.scenarios, `scen_${tone}_${lang}_${tier}`);

            // 6. Reasons Sentences (Budgeted)
            const reasons = Array.isArray(match.reasons) ? match.reasons : [];
            const budgets = { excellent: { pos: 3, neg: 1 }, positive: { pos: 3, neg: 1 }, mixed: { pos: 2, neg: 2 }, negative: { pos: 1, neg: 3 } };
            const budget = budgets[tier] || { pos: 2, neg: 1 };
            
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
            let rawText = scenario ? this.formatSlots(scenario, beer, prestigeDesc, outro, lang, fullCtx) : (opener || "");
            if (reasonSentences.length > 0) rawText += " " + reasonSentences.join(" ");

            // 8. Tasted Note Append (if not already handled in outro)
            if (isAlreadyTasted && toneGroup.alreadyTasted) {
                const tastedCount = Math.max(1, typeof isAlreadyTasted === 'number' ? Math.floor(isAlreadyTasted) : 1);
                const at = toneGroup.alreadyTasted || {};
                let pool = (tastedCount >= 2 && Array.isArray(at.multiple) && at.multiple.length) ? at.multiple : (at.once || (Array.isArray(at) ? at : []));
                if (!Array.isArray(pool)) pool = [];
                const note = this.getRandom(pool);
                if (note && !rawText.includes(note)) {
                    rawText += " " + this.formatSlots(note, beer, "", "", lang, { global: Object.assign({}, globalCtx, { count: tastedCount }) });
                }
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
    else { 
        root.NLP = NLP; 
        root.BrewBrotherNLP = NLP; 
    }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
