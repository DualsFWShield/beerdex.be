// brewbrother_nlp.js — RosaeNLG-inspired Cohesive Narrative Synthesizer for BeerDex
// ══════════════════════════════════════════════════════════════════════════════════
(function (root) {
    const NLP = {
        dict: {},
        currentLang: null,
        
        init: async function(lang) {
            if (this.currentLang === lang && Object.keys(this.dict).length > 0) return;
            try {
                const response = await fetch(`data/locales/nlp_${lang}.json`);
                if (!response.ok) throw new Error('Network response was not ok');
                this.dict = await response.json();
                this.currentLang = lang;
            } catch (error) {
                console.error("Could not load NLP dictionary:", error);
                this.currentLang = lang;
            }
        },

        getRandom: function(array) {
            return array && array.length > 0 ? array[Math.floor(Math.random() * array.length)] : "";
        },

        getPrestigeLevel: function(beer) {
            const brewery = ((beer.brewery || '') + ' ' + (beer.title || '')).toLowerCase();
            const rarity = (beer.rarity || 'commun').toLowerCase();
            
            const isIndustrial = /heineken|leffe|kronenbourg|1664|jupiler|stella|maes|bavaria|carlsberg|budweiser|desperados|grimbergen|affligem|hoegaarden|skoll|pelforth|gordon|amstel|bavaroise/.test(brewery);
            const isPrestige = /cantillon|3 fonteinen|drie fonteinen|popihn|piggy|cloudwater|verdant|tree house|hill farmstead|bokke|westvleteren|rochefort|orval|chimay|westmalle|achel|la trappe|st\. bernardus|struise|dupont|paix dieu/.test(brewery) || ['epique', 'mythique', 'legendaire', 'ultra_legendaire'].includes(rarity);
            
            if (isIndustrial) return 'industrial';
            if (isPrestige) return 'prestige';
            if (['rare', 'super_rare'].includes(rarity)) return 'craft';
            return 'standard';
        },

        // RosaeNLG Surface Realization (Automatic French Elisions, Contractions, Spacing)
        surfaceRealize: function(text, lang) {
            if (!text) return "";
            let res = text;
            
            if (lang === 'fr') {
                // 1. Contractions de prépositions
                res = res.replace(/\bde\s+le\b/gi, 'du');
                res = res.replace(/\bde\s+les\b/gi, 'des');
                res = res.replace(/\bà\s+le\b/gi, 'au');
                res = res.replace(/\bà\s+les\b/gi, 'aux');
                
                // 2. Élisions devant voyelles / h muet (a, e, i, o, u, y, é, è, ê, à, â, î, ô, û, h)
                res = res.replace(/\b(de|du|le|la|ce|que|se|ne|me|te)\s+([aeiouyéèêàâîôûh][\wÀ-ÿ-]*)/gi, (match, prefix, word) => {
                    const pLower = prefix.toLowerCase();
                    if (pLower === 'de' || pLower === 'du') return `d'${word}`;
                    if (pLower === 'le' || pLower === 'la') return `l'${word}`;
                    if (pLower === 'ce') return `cet ${word}`;
                    if (pLower === 'que') return `qu'${word}`;
                    if (pLower === 'se') return `s'${word}`;
                    if (pLower === 'ne') return `n'${word}`;
                    if (pLower === 'me') return `m'${word}`;
                    if (pLower === 'te') return `t'${word}`;
                    return match;
                });

                res = res.replace(/\bsi\s+(il[s]?)\b/gi, "s'$1");
            } else {
                // English a/an
                res = res.replace(/\ba\s+([aeiou][\w-]*)/gi, 'an $1');
            }
            
            // 3. Typographie, Ponctuation & Espaces
            res = res.replace(/\s+/g, ' ');
            res = res.replace(/\s+([.,;:!?])/g, '$1');
            res = res.replace(/([.!?])\s*([a-zà-ÿ])/g, (m, p, l) => `${p} ${l.toUpperCase()}`);
            
            // Capitaliser premier caractère
            res = res.trim();
            if (res.length > 0) {
                res = res.charAt(0).toUpperCase() + res.slice(1);
            }
            
            return res;
        },

        formatSlots: function(template, beer, prestigeDesc, outro, lang) {
            let res = template;
            const title = beer.title || (lang === 'fr' ? 'cette bière' : 'this beer');
            const brewery = beer.brewery || (lang === 'fr' ? 'la brasserie' : 'the brewery');
            const type = beer.type || (lang === 'fr' ? 'bière' : 'beer');
            
            // Format Alcohol
            let abv = beer.alcohol || '';
            if (abv && !abv.includes('°') && !abv.includes('%')) {
                abv = `${abv}°`;
            } else if (!abv) {
                abv = lang === 'fr' ? 'degré moyen' : 'medium ABV';
            }

            res = res.replace(/\{title\}/g, title);
            res = res.replace(/\{brewery\}/g, brewery);
            res = res.replace(/\{abv\}/g, abv);
            res = res.replace(/\{prestige_desc\}/g, prestigeDesc || '');
            res = res.replace(/\{outro\}/g, outro || '');
            
            // French Grammatical tags for Type
            if (lang === 'fr') {
                const tLower = type.toLowerCase();
                const isMasc = ['lambic', 'bock', 'barleywine', 'farô'].some(m => tLower.includes(m));
                
                res = res.replace(/\{type\}/g, type)
                         .replace(/\{le_type\}/g, isMasc ? `le ${type}` : `la ${type}`)
                         .replace(/\{un_type\}/g, isMasc ? `un ${type}` : `une ${type}`)
                         .replace(/\{du_type\}/g, isMasc ? `du ${type}` : `de la ${type}`)
                         .replace(/\{de_type\}/g, `de ${type}`)
                         .replace(/\{ce_type\}/g, isMasc ? `ce ${type}` : `cette ${type}`);
            } else {
                res = res.replace(/\{type\}/g, type)
                         .replace(/\{le_type\}/g, `the ${type}`)
                         .replace(/\{un_type\}/g, `a ${type}`)
                         .replace(/\{du_type\}/g, `of the ${type}`)
                         .replace(/\{de_type\}/g, `of ${type}`)
                         .replace(/\{ce_type\}/g, `this ${type}`);
            }
            
            return res;
        },

        generateExplanation: async function(beer, match, tone = 'brewbrother', lang = 'fr') {
            await this.init(lang);
            
            const tGroup = this.dict[tone] || this.dict['brewbrother'] || Object.values(this.dict)[0];
            if (!tGroup) return "";
            
            // 1. Sentiment Analysis
            let sentiment = 'positive';
            if (match.percentage < 40) sentiment = 'negative';
            else if (match.percentage < 65) sentiment = 'mixed';
            
            const t = tGroup[sentiment];
            if (!t) return "";
            
            // 2. Prestige Analysis
            const prestigeLevel = this.getPrestigeLevel(beer);
            const prestigeDesc = (t.prestige_desc && t.prestige_desc[prestigeLevel]) || "";
            
            // 3. Outro selection
            const outro = this.getRandom(t.outros) || "";
            
            // 4. Cohesive Narrative Scenario Selection
            const scenarioTemplate = this.getRandom(t.scenarios) || "";
            
            let rawText = this.formatSlots(scenarioTemplate, beer, prestigeDesc, outro, lang);
            
            // 5. Already Tasted Injection
            if (window.Storage && typeof window.Storage.getBeerRating === 'function') {
                const existingData = window.Storage.getBeerRating(beer.id);
                if (existingData && (existingData.score > 0 || existingData.count > 0 || existingData.date)) {
                    const alreadyTastedPhrase = this.getRandom(tGroup.alreadyTasted);
                    if (alreadyTastedPhrase) {
                        rawText += " " + alreadyTastedPhrase;
                    }
                }
            }
            
            // 6. RosaeNLG Surface Realization (Elisions, Contractions, Spacing)
            return this.surfaceRealize(rawText, lang);
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = NLP;
    else {
        root.BrewBrotherNLP = NLP;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
