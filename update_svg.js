const fs = require('fs');
const file = 'js/ui.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /curveData\.forEach\([\s\S]*?svgGraphHtml = `[\s\S]*?`;/g;

const newCode = `        // Chart.js Graph Container
        svgGraphHtml = \`
            <div style="margin: 20px 0; background: #1a1a1a; padding: 15px; border-radius: 10px;">
                <div style="font-size: 0.8rem; color:#888; margin-bottom: 15px; text-align: left;">Évolution estimée (g/l)</div>
                <div style="position: relative; height: 250px; width: 100%;">
                    <canvas id="bacChartCanvas"></canvas>
                </div>
            </div>
        \`;
        
        // Let the DOM update, then initialize Chart.js
        setTimeout(() => {
            const ctx = document.getElementById('bacChartCanvas');
            if (ctx && curveData.length > 0) {
                if (window.bacChartInstance) {
                    window.bacChartInstance.destroy();
                }

                const chartData = curveData.map(d => ({
                    x: d.time,
                    y: parseFloat(d.bac.toFixed(3))
                }));

                const nowTime = new Date().getTime();
                
                // Emphasize the current time dot
                const currentBACPointIndex = chartData.findIndex(d => d.x >= nowTime);
                const pointColors = chartData.map((d, i) => (i === currentBACPointIndex) ? '#ffffff' : 'transparent');
                const pointRadii = chartData.map((d, i) => (i === currentBACPointIndex) ? 4 : 0);

                window.bacChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        datasets: [{
                            label: 'Taux (g/l)',
                            data: chartData,
                            borderColor: bacStatus.color,
                            backgroundColor: bacStatus.color + '33',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: pointColors,
                            pointBorderColor: pointColors,
                            pointRadius: pointRadii,
                            pointHitRadius: 10,
                            pointHoverRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: function(context) {
                                        const d = new Date(context[0].parsed.x);
                                        return d.getHours().toString().padStart(2, '0') + 'h' + d.getMinutes().toString().padStart(2, '0');
                                    },
                                    label: function(context) { return \` \${context.parsed.y} g/l\`; }
                                },
                                backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#fff', bodyColor: bacStatus.color
                            },
                            annotation: {
                                annotations: {
                                    limit05: {
                                        type: 'line', yMin: 0.5, yMax: 0.5, borderColor: '#FF9800', borderWidth: 1, borderDash: [5, 5],
                                        label: { display: true, content: '0.5 limit', position: 'end', backgroundColor: 'transparent', color: '#FF9800', font: { size: 10 } }
                                    },
                                    limit08: {
                                        type: 'line', yMin: 0.8, yMax: 0.8, borderColor: '#F44336', borderWidth: 1, borderDash: [5, 5],
                                        label: { display: true, content: '0.8 limit', position: 'end', backgroundColor: 'transparent', color: '#F44336', font: { size: 10 } }
                                    },
                                    nowLine: {
                                        type: 'line', xMin: nowTime, xMax: nowTime, borderColor: '#888', borderWidth: 1, borderDash: [2, 2],
                                        label: { display: true, content: 'Maintenant', position: 'start', backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', font: { size: 9 } }
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear', min: tMin, max: tMax, grid: { color: '#333', drawBorder: false },
                                ticks: {
                                    color: '#888', stepSize: 3600 * 1000,
                                    callback: function(value) { return new Date(value).getHours() + 'h'; }
                                }
                            },
                            y: { min: 0, suggestedMax: Math.max(0.8, bacMax * 1.2), grid: { color: '#333', drawBorder: false }, ticks: { color: '#888', stepSize: 0.2 } }
                        }
                    }
                });
            }
        }, 100);`;

if (!content.match(regex)) {
    console.log("No match found for SVG block");
} else {
    content = content.replace(regex, newCode);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Replaced successfully.");
}
