import { Haptics, ImpactStyle, NotificationType } from './vendor/haptics-shim.js';
import * as Storage from './storage.js';

/*
    Feedback Engine
    - Handles Audio (Native Web Audio API)
    - Handles Haptics (Native/Shim)
*/

class FeedbackEngine {
    constructor() {
        this.ctx = null;
        this.enabledSound = Storage.getPreference('soundEnabled', true);
        this.enabledHaptics = Storage.getPreference('hapticsEnabled', true);

        // Lazy init AudioContext on first interaction to avoid startup warnings
        const initAudio = () => {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => console.log("AudioContext Resumed"));
            }
        };

        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('touchstart', initAudio, { once: true });
    }

    reloadSettings() {
        this.enabledSound = Storage.getPreference('soundEnabled', true);
        this.enabledHaptics = Storage.getPreference('hapticsEnabled', true);
    }

    // --- Native Web Audio Helpers ---

    _getOrCreateCtx() {
        if (!this.enabledSound) return null;
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        return this.ctx;
    }

    _osc(type, freq, start, duration, vol = 0.1) {
        const ctx = this._getOrCreateCtx();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        osc.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + start;
        osc.start(t);

        // Envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.stop(t + duration + 0.1);
    }

    _kick(start) {
        const ctx = this._getOrCreateCtx();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(150, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.5);

        gain.gain.setValueAtTime(0.5, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.5);
    }

    // --- Sound Effects ---

    async playUnlock() {
        if (!this.enabledSound) return;
        // Fanfare: Major Triad C5 E5 G5 -> High C6
        this._osc('triangle', 523.25, 0, 0.2); // C5
        this._osc('triangle', 659.25, 0.15, 0.2); // E5
        this._osc('triangle', 783.99, 0.3, 0.4); // G5
        this._osc('square', 1046.50, 0.4, 0.6, 0.05); // C6 (Sparkle)
    }

    async playSuccess() {
        if (!this.enabledSound) return;
        this._osc('sine', 523.25, 0, 0.1); // C5
        this._osc('sine', 659.25, 0.08, 0.1); // E5
    }

    async playError() {
        if (!this.enabledSound) return;
        this._osc('sawtooth', 110, 0, 0.3, 0.2); // Low buzz
        this._kick(0);
    }

    async playScan() {
        if (!this.enabledSound) return;
        this._osc('sine', 1200, 0, 0.05, 0.05); // High blip
    }

    async playRarity(rarity) {
        if (!this.enabledSound) return;

        switch (rarity) {
            case 'commun':
                this._osc('triangle', 440, 0, 0.2);
                break;
            case 'rare': // Major chord
                this._osc('triangle', 440, 0, 0.4);
                this._osc('triangle', 554.37, 0.05, 0.4); // C#
                this._osc('triangle', 659.25, 0.1, 0.6); // E
                break;
            case 'super_rare': // Higher + Sparkle
                this._osc('sine', 523.25, 0, 0.5);
                this._osc('sine', 659.25, 0.1, 0.5);
                this._osc('sine', 783.99, 0.2, 0.5);
                this._osc('square', 1046.50, 0.2, 0.5, 0.03);
                break;
            case 'epique': // Mystery/Suspense (Diminished?)
                this._osc('triangle', 392, 0, 1.0); // G4
                this._osc('triangle', 466.16, 0.2, 1.0); // Bb4
                this._osc('triangle', 554.37, 0.4, 1.0); // Db5
                this._kick(0);
                break;
            case 'mythique': // Epic Sweep
                this._osc('sawtooth', 261.63, 0, 1.5, 0.2); // C4
                this._osc('sawtooth', 392.00, 0.2, 1.5, 0.2); // G4
                this._osc('sawtooth', 523.25, 0.4, 1.5, 0.2); // C5
                this._osc('square', 1046.50, 0.6, 1.5, 0.1); // C6
                this._kick(0.6);
                break;
            case 'legendaire':
            case 'ultra_legendaire': // Heavenly
                // Arpeggio up
                [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98].forEach((freq, i) => {
                    this._osc('sine', freq, i * 0.1, 2.0 - (i * 0.2), 0.1);
                });
                this._kick(0);
                break;
        }
    }

    // --- Haptics Logic ---

    async impactLight() {
        if (!this.enabledHaptics) return;
        try {
            await Haptics.impact({ style: ImpactStyle.Light });
        } catch (e) { }
    }

    async impactMedium() {
        if (!this.enabledHaptics) return;
        try {
            await Haptics.impact({ style: ImpactStyle.Medium });
        } catch (e) { }
    }

    async impactHeavy() {
        if (!this.enabledHaptics) return;
        try {
            await Haptics.impact({ style: ImpactStyle.Heavy });
        } catch (e) { }
    }

    async vibrateSuccess() {
        if (!this.enabledHaptics) return;
        try {
            await Haptics.notification({ type: NotificationType.Success });
        } catch (e) { }
    }

    async vibrateError() {
        if (!this.enabledHaptics) return;
        try {
            await Haptics.notification({ type: NotificationType.Error });
        } catch (e) { }
    }
}

export const Feedback = new FeedbackEngine();
