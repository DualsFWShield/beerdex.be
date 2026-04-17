export class AromaWheel {
    constructor(containerIdOrEl, initialAromas = [], onChange = null) {
        this.container = typeof containerIdOrEl === 'string' ? document.getElementById(containerIdOrEl) : containerIdOrEl;
        this.selectedAromas = new Set(initialAromas);
        this.onChange = onChange;
        
        this.categories = [
            { id: 'malte', name: 'Malté', color: '#e67e22', sub: ['Pain', 'Caramel', 'Chocolat', 'Café'] },
            { id: 'houblonne', name: 'Houblon', color: '#2ecc71', sub: ['Résine', 'Agrumes', 'Tropical', 'Herbe'] },
            { id: 'fruite', name: 'Fruité', color: '#e74c3c', sub: ['Fruits rouges', 'Noyau', 'Banane', 'Pomme'] },
            { id: 'epice', name: 'Épicé', color: '#9b59b6', sub: ['Girofle', 'Poivre', 'Coriandre', 'Vanille'] },
            { id: 'torrefie', name: 'Torréfié', color: '#34495e', sub: ['Fumé', 'Cendré', 'Réglisse', 'Grillé'] },
            { id: 'floral', name: 'Floral', color: '#f1c40f', sub: ['Rose', 'Miel', 'Camomille', 'Géranium'] },
            { id: 'herbace', name: 'Herbacé', color: '#16a085', sub: ['Gazon', 'Menthe', 'Thé', 'Terreux'] },
            { id: 'levure', name: 'Levuré', color: '#f39c12', sub: ['Pâte', 'Biscuit', 'Cuir', 'Rustique'] }
        ];

        this.render();
    }

    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    }

    describeArc(x, y, innerRadius, outerRadius, startAngle, endAngle) {
        const startOuter = this.polarToCartesian(x, y, outerRadius, endAngle);
        const endOuter = this.polarToCartesian(x, y, outerRadius, startAngle);
        const startInner = this.polarToCartesian(x, y, innerRadius, endAngle);
        const endInner = this.polarToCartesian(x, y, innerRadius, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M", startOuter.x, startOuter.y,
            "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
            "L", endInner.x, endInner.y,
            "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
            "Z"
        ].join(" ");
    }

    render() {
        if (!this.container) return;

        const size = 370;
        const center = size / 2;
        const innerRadius = 45;
        const midRadius = 105;
        const outerRadius = 180;

        let svgItems = '';
        const catAngle = 360 / this.categories.length;

        const getRadialRotation = (angle) => {
            let rot = (angle - 90 + 360) % 360;
            if (rot > 90 && rot < 270) {
                rot -= 180;
            }
            return rot;
        };

        this.categories.forEach((cat, catIndex) => {
            const startAngle = catIndex * catAngle;
            const endAngle = (catIndex + 1) * catAngle;
            
            // Draw Category Slice
            const midAngle = startAngle + (catAngle / 2);
            const textPos = this.polarToCartesian(center, center, (innerRadius + midRadius) / 2, midAngle);
            const isCatSelected = cat.sub.some(s => this.selectedAromas.has(`${cat.id}:${s}`));

            svgItems += `
                <g class="wheel-group" style="cursor:default;">
                    <path d="${this.describeArc(center, center, innerRadius, midRadius, startAngle + 0.5, endAngle - 0.5)}" 
                          fill="${cat.color}" 
                          opacity="${isCatSelected ? '1' : '0.6'}"
                          stroke="#1a1a1a" stroke-width="2"/>
                    <text x="${textPos.x}" y="${textPos.y}" font-size="11" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-weight="bold" transform="rotate(${getRadialRotation(midAngle)}, ${textPos.x}, ${textPos.y})">
                        ${cat.name}
                    </text>
                </g>
            `;

            // Draw Sub-categories
            const subAngle = catAngle / cat.sub.length;
            cat.sub.forEach((subName, subIndex) => {
                const sStart = startAngle + (subIndex * subAngle);
                const sEnd = startAngle + ((subIndex + 1) * subAngle);
                const aromaId = `${cat.id}:${subName}`;
                const isSelected = this.selectedAromas.has(aromaId);
                
                const sMidAngle = sStart + (subAngle / 2);
                const sTextPos = this.polarToCartesian(center, center, (midRadius + outerRadius) / 2, sMidAngle);
                
                svgItems += `
                    <g class="wheel-slice" style="cursor:pointer; transition: opacity 0.2s;" data-aroma="${aromaId}">
                        <path d="${this.describeArc(center, center, midRadius, outerRadius, sStart + 0.2, sEnd - 0.2)}" 
                              fill="${cat.color}" 
                              opacity="${isSelected ? '1' : '0.3'}"
                              stroke="#1a1a1a" stroke-width="2" class="slice-path"/>
                        <text x="${sTextPos.x}" y="${sTextPos.y}" font-size="9" fill="${isSelected ? '#fff' : '#ccc'}" text-anchor="middle" dominant-baseline="middle" font-weight="${isSelected ? 'bold' : 'normal'}" transform="rotate(${getRadialRotation(sMidAngle)}, ${sTextPos.x}, ${sTextPos.y})">
                            ${subName}
                        </text>
                    </g>
                `;
            });
        });

        this.container.innerHTML = `
            <div style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center;">
                <svg width="100%" viewBox="0 0 ${size} ${size}" style="max-width: ${size}px; height: auto; display: block;">
                    <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="#1a1a1a" />
                    <text x="${center}" y="${center}" font-size="12" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-weight="bold" letter-spacing="1">ARÔMES</text>
                    ${svgItems}
                </svg>
                <div style="margin-top: 15px; font-size: 0.9rem; color: #aaa; background: rgba(255,255,255,0.05); padding: 5px 15px; border-radius: 20px;">
                    Sélectionnés : <span id="aroma-count" style="color:var(--accent-gold); font-weight:bold;">${this.selectedAromas.size}</span>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const slices = this.container.querySelectorAll('.wheel-slice');
        slices.forEach(slice => {
            slice.onclick = () => {
                const aroma = slice.getAttribute('data-aroma');
                if (this.selectedAromas.has(aroma)) {
                    this.selectedAromas.delete(aroma);
                } else {
                    this.selectedAromas.add(aroma);
                }
                this.render(); // Re-render for visual feedback
                if (this.onChange) this.onChange(Array.from(this.selectedAromas));
            };
        });
    }

    getSelected() {
        return Array.from(this.selectedAromas);
    }
}
