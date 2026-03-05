/* js/fx.js - Premium Visual Effects using Canvas Confetti & Animate.css */

export class FX {
    static burst(x, y, color = '#FFC000') {
        const xNorm = x / window.innerWidth;
        const yNorm = y / window.innerHeight;

        if (window.confetti) {
            confetti({
                particleCount: 50,
                spread: 70,
                origin: { x: xNorm, y: yNorm },
                colors: [color, '#ffffff'],
                disableForReducedMotion: true,
                zIndex: 10000
            });
        }
    }

    static confetti() {
        if (window.confetti) {
            // premium skew
            var duration = 3000;
            var end = Date.now() + duration;

            (function frame() {
                // launch a few confetti from the left edge
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#FFC000', '#FF0000', '#0000FF']
                });
                // and launch a few from the right edge
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#FFC000', '#FF0000', '#0000FF']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
    }

    static achievementUnlock(title, icon = '🏆', rarity = 'commun') {
        const wrapper = document.createElement('div');
        wrapper.className = 'achievement-wrapper';
        wrapper.style.cssText = 'position:fixed; top:20px; left:0; right:0; display:flex; justify-content:center; z-index:2147483647; pointer-events:none;';

        const isHighTier = ['mythique', 'legendaire', 'ultra_legendaire'].includes(rarity);

        // Base classes for the new toast style
        let toastClass = `achievement-toast toast-enter-anim ach-rarity-${rarity}`;

        // If high tier, trigger screen shake
        if (isHighTier) {
            document.body.classList.add('premium-shake');
            setTimeout(() => document.body.classList.remove('premium-shake'), 600);
        }

        const div = document.createElement('div');
        div.className = toastClass;
        // The toast itself inherits the premium TCG foils.
        // We style it similar to the cards but adapted for a horizontal notification
        div.innerHTML = `
            <div class="ach-item" style="width:40px; height:40px; border:1px solid var(--rarity-${rarity}); margin-right:0; cursor:default; background:#000 !important; box-shadow:none !important; display:flex; align-items:center; justify-content:center; border-radius:8px;">
                <div class="ach-icon" style="font-size:1.5rem; line-height:1;">${icon}</div>
            </div>
            <div class="ach-content" style="z-index: 10; position:relative;">
                <div class="ach-label" style="color: var(--rarity-${rarity}); font-weight:bold; text-shadow: 0 0 5px rgba(255,255,255,0.3);">Succès Déverrouillé !</div>
                <div class="ach-title">${title}</div>
            </div>
        `;
        wrapper.appendChild(div);
        document.body.appendChild(wrapper);

        // Add 3D Tilt & Gyroscope support for premium foils
        if (typeof VanillaTilt !== 'undefined') {
            VanillaTilt.init(div, {
                max: 15,
                speed: 400,
                glare: true,
                "max-glare": 0.2,
                gyroscope: true,
                gyroscopeMinAngleX: -45,
                gyroscopeMaxAngleX: 45,
                gyroscopeMinAngleY: -45,
                gyroscopeMaxAngleY: 45
            });
        }

        // Sound based on rarity
        import('./feedback.js').then(m => {
            m.Feedback.playUnlock();
            if (isHighTier) {
                setTimeout(() => m.Feedback.impactHeavy(), 100);
            } else {
                m.Feedback.impactMedium();
            }
        });

        // Particles based on rarity
        setTimeout(() => {
            if (rarity === 'mythique') {
                FX.burst(window.innerWidth / 2, 80, '#e74c3c');
                FX.burst(window.innerWidth / 2 - 100, 100, '#ff9f43');
                FX.burst(window.innerWidth / 2 + 100, 100, '#ff9f43');
            } else if (rarity === 'legendaire' || rarity === 'ultra_legendaire') {
                FX.confetti(); // Full screen
                FX.burst(window.innerWidth / 2, 80, '#FFD700');
            } else if (rarity === 'epique') {
                FX.burst(window.innerWidth / 2, 80, '#9b59b6');
            } else {
                // Commun, Rare, Super Rare get a smaller burst
                FX.burst(window.innerWidth / 2, 80, '#FFC000');
            }
        }, 100);

        // Remove after anim
        const duration = isHighTier ? 6000 : 4000;
        setTimeout(() => {
            div.classList.replace('toast-enter-anim', 'toast-exit-anim');
            setTimeout(() => wrapper.remove(), 1000);
        }, duration);
    }
    static particleExplosion(canvas, color, count = 100) {
        const ctx = canvas.getContext('2d');
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();

        const particles = [];
        class Particle {
            constructor() {
                this.x = canvas.width / 2;
                this.y = canvas.height / 2;
                this.size = Math.random() * 8 + 2;
                this.speedX = (Math.random() - 0.5) * 20;
                this.speedY = (Math.random() - 0.5) * 20;
                this.color = color;
                this.alpha = 1;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.alpha -= 0.015;
                this.size *= 0.98;
            }
            draw() {
                ctx.globalAlpha = this.alpha;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                particles[i].draw();
                if (particles[i].alpha <= 0) particles.splice(i, 1);
            }
            if (particles.length > 0) requestAnimationFrame(animateParticles);
        }
        animateParticles();
    }
}
