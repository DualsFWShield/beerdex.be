import * as Storage from './storage.js';

const ANIMAL_NAMES = ["Renard", "Chouette", "Loup", "Ours", "Castor", "Faucon", "Aigle", "Tigre", "Lion", "Cerf", "Pangolin", "Loutre", "Pingouin", "Koala"];
const ADJECTIVES = ["Joyeux", "Anonyme", "Rapide", "Furieux", "Discret", "Rusé", "Majestueux", "Brillant", "Féroce", "Assoiffé"];

function getRandomPseudo() {
    const animal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    return `${animal} ${adj}`;
}

const Match = {
    p2p: null,
    roomCode: null,
    isHost: false,
    myProfile: null,
    members: new Map(), // Map of peerId -> profile
    onStateChange: null, // Callback for UI updates

    init: async function(allBeers) {
        if (!window.P2PEngine) {
            console.error("P2PEngine non chargé !");
            return false;
        }
        if (!this.p2p) {
            this.p2p = new window.P2PEngine();
            this.p2p.on('connected', (peerId) => this.handlePeerConnected(peerId));
            this.p2p.on('disconnected', (peerId) => this.handlePeerDisconnected(peerId));
            this.p2p.on('message', (peerId, data) => this.handleMessage(peerId, data));
        }
        this.myProfile = this.generateLocalProfile(allBeers);
        return true;
    },

    generateLocalProfile: function(allBeers) {
        const p = {};
        
        let pseudo = Storage.getPreference('beermatch_pseudo', '');
        if (!pseudo) pseudo = getRandomPseudo();
        p.pseudo = pseudo;

        const userData = Storage.getAllUserData();
        const ratings = userData.ratings || userData;
        
        const validKeys = Object.keys(ratings).filter(k => ratings[k] && ratings[k].count > 0);
        const allConsumed = validKeys; 
        
        let total = 0;
        let totalLiters = 0;
        let totalAlcoholLiters = 0;
        
        const isMap = allBeers instanceof window.Map;

        validKeys.forEach(k => { 
            const count = parseInt(ratings[k].count) || 1;
            total += count; 
            
            let beerObj = null;
            if (isMap) beerObj = allBeers.get(k);
            else if (Array.isArray(allBeers)) beerObj = allBeers.find(b => b.id === k);
            
            if (beerObj) {
                let volL = 0;
                let abv = 0;
                if (beerObj.volume) {
                    const v = parseFloat(String(beerObj.volume).replace(',', '.'));
                    if (!isNaN(v)) {
                        const vStr = String(beerObj.volume).toLowerCase();
                        if (vStr.includes('cl')) volL = v / 100;
                        else if (vStr.includes('ml')) volL = v / 1000;
                        else volL = v; // assume L
                    }
                }
                if (beerObj.alcohol || beerObj.abv) {
                    const abvStr = String(beerObj.alcohol || beerObj.abv);
                    const a = parseFloat(abvStr.replace(',', '.'));
                    if (!isNaN(a)) abv = a;
                }
                
                totalLiters += volL * count;
                totalAlcoholLiters += volL * (abv / 100) * count;
            }
        });

        if (Storage.getPreference('beermatch_share_total', true)) {
            p.totalBeers = total;
            p.totalLiters = totalLiters;
            p.totalAlcoholLiters = totalAlcoholLiters;
        }
        if (Storage.getPreference('beermatch_share_unique', true)) {
            p.uniqueBeers = allConsumed.length;
        }
        if (Storage.getPreference('beermatch_share_top', true) && validKeys.length > 0) {
            const sorted = [...validKeys].sort((a,b) => (ratings[b].count||0) - (ratings[a].count||0));
            p.topBeerId = sorted[0];
            p.topBeers = sorted.slice(0, 5);
        }
        if (Storage.getPreference('beermatch_share_catalog', true)) {
            p.tastedBeerIds = allConsumed;
        }
        if (Storage.getPreference('beermatch_share_achievements', true)) {
            const ach = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
            p.achievementsCount = ach.length;
        }
        if (Storage.getPreference('beermatch_share_archetype', true)) {
            p.archetype = localStorage.getItem('last_archetype') || 'archetype_novice';
        }
        
        return p;
    },

    createParty: async function(allBeers, onStateChange) {
        this.onStateChange = onStateChange;
        this.isHost = true;
        this.members.clear();
        
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        this.roomCode = '';
        for (let i = 0; i < 6; i++) this.roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
        
        const hostId = `beerdex-party-${this.roomCode}`;
        await this.init(allBeers);
        
        try {
            await this.p2p.init(hostId);
        } catch (e) {
            console.error("Erreur host P2P:", e);
            throw e;
        }

        this.members.set(hostId, { ...this.myProfile, isHost: true });
        this.broadcastState();
        return this.roomCode;
    },

    joinParty: async function(roomCode, allBeers, onStateChange) {
        this.onStateChange = onStateChange;
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase().trim();
        this.members.clear();
        
        await this.init(allBeers);
        const myPeerId = await this.p2p.init(); 
        
        const hostId = `beerdex-party-${this.roomCode}`;
        await this.p2p.connectTo(hostId);
        this.members.set(myPeerId, { ...this.myProfile, isHost: false, me: true });
        
        this.p2p.sendMessage({ type: 'guest_profile', profile: this.myProfile }, [hostId]);
    },

    leaveParty: function() {
        if (this.p2p) {
            this.p2p.disconnect();
        }
        this.members.clear();
        this.roomCode = null;
    },

    handlePeerConnected: function(peerId) {
        console.log("Peer connected:", peerId);
    },

    handlePeerDisconnected: function(peerId) {
        console.log("Peer disconnected:", peerId);
        if (this.isHost) {
            this.members.delete(peerId);
            this.broadcastState();
        } else {
            if (peerId === `beerdex-party-${this.roomCode}`) {
                if (this.onStateChange) this.onStateChange({ type: 'host_disconnected' });
            }
        }
    },

    handleMessage: function(peerId, data) {
        if (this.isHost) {
            if (data.type === 'guest_profile') {
                this.members.set(peerId, data.profile);
                this.broadcastState();
            }
            if (data.type === 'share_custom_beer') {
                // Broadcast to all other peers
                this.p2p.sendMessage(data);
                // Trigger local UI
                if (this.onStateChange) this.onStateChange(data);
            }
        } else {
            if (data.type === 'party_state') {
                this.members.clear();
                for (const [id, profile] of Object.entries(data.members)) {
                    this.members.set(id, profile);
                }
                if (this.onStateChange) this.onStateChange({ type: 'update', members: this.members });
            }
            if (data.type === 'share_custom_beer') {
                if (this.onStateChange) this.onStateChange(data);
            }
        }
    },

    broadcastState: function() {
        if (!this.isHost) return;
        const membersObj = Object.fromEntries(this.members);
        this.p2p.sendMessage({ type: 'party_state', members: membersObj });
        if (this.onStateChange) this.onStateChange({ type: 'update', members: this.members });
    },

    shareCustomBeer: function(customBeer) {
        if (!this.p2p || !this.roomCode) return false;
        
        const payload = {
            type: 'share_custom_beer',
            sender: this.myProfile.pseudo,
            beer: customBeer
        };
        
        if (this.isHost) {
            this.p2p.sendMessage(payload); // Broadcast to all
        } else {
            this.p2p.sendMessage(payload, [`beerdex-party-${this.roomCode}`]); // Send to host for rebroadcast
        }
        return true;
    },

    computeGroupAnalytics: function(allBeersMap) {
        const members = Array.from(this.members.values());
        if (members.length === 0) return null;

        let totalGroupBeers = 0;
        let totalGroupLiters = 0;
        let totalGroupAlcoholLiters = 0;
        const allUniqueBeers = new Set();
        const beerCounts = new Map(); 
        const memberCount = members.length;
        
        const podiums = {
            pilier: { name: '-', val: 0 },
            explorateur: { name: '-', val: 0 },
            chasseur: { name: '-', val: 0 }
        };

        members.forEach(m => {
            if (m.totalBeers) {
                totalGroupBeers += m.totalBeers;
                if (m.totalBeers > podiums.pilier.val) podiums.pilier = { name: m.pseudo, val: m.totalBeers };
            }
            if (m.totalLiters) totalGroupLiters += m.totalLiters;
            if (m.totalAlcoholLiters) totalGroupAlcoholLiters += m.totalAlcoholLiters;
            
            if (m.uniqueBeers && m.uniqueBeers > podiums.explorateur.val) {
                podiums.explorateur = { name: m.pseudo, val: m.uniqueBeers };
            }
            if (m.achievementsCount && m.achievementsCount > podiums.chasseur.val) {
                podiums.chasseur = { name: m.pseudo, val: m.achievementsCount };
            }
            
            if (m.tastedBeerIds) {
                m.tastedBeerIds.forEach(id => {
                    allUniqueBeers.add(id);
                    beerCounts.set(id, (beerCounts.get(id) || 0) + 1);
                });
            }
        });

        const sortedBeers = Array.from(beerCounts.entries()).sort((a,b) => b[1] - a[1]);
        const commonBeers = sortedBeers.filter(e => e[1] > 1).map(e => ({ beer: allBeersMap.get(e[0]), count: e[1], total: memberCount })).filter(e=>e.beer);
        const popularBeers = sortedBeers.slice(0, 5).map(e => allBeersMap.get(e[0])).filter(b=>b);
        const topGroupBeer = sortedBeers.length > 0 ? allBeersMap.get(sortedBeers[0][0]) : null;

        return {
            totalGroupBeers,
            totalGroupLiters,
            totalGroupAlcoholLiters,
            uniqueGroupBeers: allUniqueBeers.size,
            podiums,
            commonBeers,
            popularBeers,
            topGroupBeer
        };
    },
    
    compute1on1: function(myProfile, friendProfile, allBeersMap) {
        const mine = new Set(myProfile.tastedBeerIds || []);
        const theirs = new Set(friendProfile.tastedBeerIds || []);
        
        const commonIds = [];
        const discoveriesIds = [];

        theirs.forEach(id => {
            if (mine.has(id)) commonIds.push(id);
            else discoveriesIds.push(id);
        });

        const unionSize = (new Set([...mine, ...theirs])).size;
        let score = 0;
        if (unionSize > 0) score = Math.round((commonIds.length / unionSize) * 100);

        return {
            score,
            common: commonIds.map(id => allBeersMap.get(id)).filter(b=>b),
            discoveries: discoveriesIds.map(id => allBeersMap.get(id)).filter(b=>b)
        };
    }
};

window.Match = Match;
export default Match;
