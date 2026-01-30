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

    static achievementUnlock(title, icon = '🏆') {
        // Wrapper for positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'achievement-wrapper';
        wrapper.style.cssText = 'position:fixed; top:20px; left:0; right:0; display:flex; justify-content:center; z-index:2147483647; pointer-events:none;';

        // ToastContent for animation
        const div = document.createElement('div');
        div.className = 'achievement-toast toast-enter-anim';
        div.innerHTML = `
            <div class="ach-item" style="width:40px; height:40px; border:1px solid #FFC000; margin-right:0; cursor:default; background:#000 !important; box-shadow:none !important;">
                <div class="ach-icon" style="font-size:1.2rem;">${icon}</div>
            </div>
            <div class="ach-content">
                <div class="ach-label">Succès Déverrouillé !</div>
                <div class="ach-title">${title}</div>
            </div>
        `;
        wrapper.appendChild(div);
        document.body.appendChild(wrapper);

        // Sound
        import('./feedback.js').then(m => m.Feedback.playUnlock());
        import('./feedback.js').then(m => m.Feedback.impactMedium());

        // Remove after anim
        setTimeout(() => {
            div.classList.replace('toast-enter-anim', 'toast-exit-anim');
            setTimeout(() => wrapper.remove(), 1000);
        }, 4000);
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
