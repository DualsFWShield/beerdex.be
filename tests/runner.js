/**
 * runner.js — Test Suite Orchestrator for BeerDex QA Lab.
 * 
 * Dynamically imports all test suites, triggers execution,
 * updates the UI in real-time, and generates Markdown reports.
 */

import { getSuites, clearSuites, runAllSuites } from './core/test-framework.js';
import { Sandbox } from './core/sandbox.js';
import * as Thanos from '../js/thanos.js';

// ============================================================ //
//  Suite Registry (modules to import)                          //
// ============================================================ //

const SUITE_MODULES = [
    { id: 'data',       label: '📦 Données',        path: './suites/01_data_integrity.test.js' },
    { id: 'storage',    label: '💾 Storage',         path: './suites/02_storage.test.js' },
    { id: 'bac',        label: '🧪 BAC & Gamer',    path: './suites/03_bac_gamer.test.js' },
    { id: 'ach',        label: '🏆 Succès',          path: './suites/04_achievements.test.js' },
    { id: 'rarity',     label: '✨ Rareté',          path: './suites/05_rarity.test.js' },
    { id: 'dedup',      label: '🔗 Déduplication',   path: './suites/06_deduplicator.test.js' },
    { id: 'i18n',       label: '🌐 i18n',            path: './suites/07_i18n.test.js' },
    { id: 'theme',      label: '🎨 Thème',           path: './suites/08_theme.test.js' },
    { id: 'importexp',  label: '📁 Import/Export',   path: './suites/09_import_export.test.js' },
    { id: 'ui',         label: '🖥️ UI Smoke',       path: './suites/10_ui_smoke.test.js' },
    { id: 'pwa',        label: '📶 PWA/Offline',     path: './suites/11_pwa_offline.test.js' },
    { id: 'utils',      label: '🔍 Utils & Fuzzy',   path: './suites/12_utils_search.test.js' },
    { id: 'match',      label: '🍻 Match & Social',  path: './suites/13_social_match.test.js' },
    { id: 'map',        label: '🗺️ Carte & Brasseries', path: './suites/14_map_breweries.test.js' },
    { id: 'eventswheel',label: '🎡 Saveurs & Événements', path: './suites/15_events_wheel.test.js' },
    { id: 'telemetry',  label: '📊 Télémétrie & Wrapped', path: './suites/16_wrapped_analytics_bridge.test.js' },
    { id: 'p2p',        label: '📡 P2P & Sync OTA',  path: './suites/17_p2p_sync.test.js' },
    { id: 'thanos',     label: '⚡ Thanos Engine',   path: './suites/18_thanos.test.js' }
];

// ============================================================ //
//  DOM References                                              //
// ============================================================ //

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let lastResults = null;

// ============================================================ //
//  Initialization                                              //
// ============================================================ //

document.addEventListener('DOMContentLoaded', () => {
    renderTabs();
    renderEmptyState();
    bindEvents();
});

function bindEvents() {
    $('#btn-run-all').addEventListener('click', handleRunAll);
    $('#btn-copy-report').addEventListener('click', handleCopyReport);
    $('#btn-thanos-audit')?.addEventListener('click', handleThanosAudit);
    $('#search-tests').addEventListener('input', handleSearchFilter);
    $('#btn-filter-failed').addEventListener('click', handleToggleFailedFilter);
}

// ============================================================ //
//  Tabs Rendering                                              //
// ============================================================ //

function renderTabs() {
    const container = $('#category-tabs');
    // "All" tab
    let html = `<button class="tab active" data-filter="all">Tous</button>`;
    SUITE_MODULES.forEach(m => {
        html += `<button class="tab" data-filter="${m.id}">${m.label} <span class="badge" id="badge-${m.id}">—</span></button>`;
    });
    container.innerHTML = html;

    container.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        filterResultsByCategory(tab.dataset.filter);
    });
}

// ============================================================ //
//  Run All Tests                                               //
// ============================================================ //

async function handleRunAll() {
    const btn = $('#btn-run-all');
    btn.disabled = true;
    btn.innerHTML = '⏳ Exécution...';

    const progressTrack = $('#progress-track');
    const progressFill = $('#progress-fill');
    progressTrack.classList.add('active');
    progressFill.style.width = '0%';
    progressFill.classList.remove('has-failures');

    // Reset
    clearSuites();
    updateDashboard({ total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 });

    // Activate sandbox
    Sandbox.enter();

    try {
        // Import all test modules (each call describe() on import)
        for (const mod of SUITE_MODULES) {
            try {
                const countBefore = getSuites().length;
                await import(mod.path + '?t=' + Date.now());
                const countAfter = getSuites().length;
                for (let i = countBefore; i < countAfter; i++) {
                    getSuites()[i].moduleId = mod.id;
                }
            } catch (err) {
                console.error(`Failed to load test module: ${mod.path}`, err);
            }
        }

        const totalTests = getSuites().reduce((acc, s) => acc + s.tests.length, 0);
        let completed = 0;
        let hasAnyFail = false;

        // Run all suites
        lastResults = await runAllSuites((progress) => {
            completed++;
            const pct = Math.round((completed / totalTests) * 100);
            progressFill.style.width = pct + '%';
            if (progress.status === 'failed') {
                hasAnyFail = true;
                progressFill.classList.add('has-failures');
            }
        });

        // Render results
        updateDashboard(lastResults.summary);
        updateBadges(lastResults);
        renderResults(lastResults);

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        Sandbox.exit();
        btn.disabled = false;
        btn.innerHTML = '▶️ Exécuter tous les tests';
        progressFill.style.width = '100%';
        setTimeout(() => progressTrack.classList.remove('active'), 2000);
    }
}

// ============================================================ //
//  Dashboard Stats Update                                      //
// ============================================================ //

function updateDashboard(summary) {
    $('#stat-total').textContent = summary.total;
    $('#stat-passed').textContent = summary.passed;
    $('#stat-failed').textContent = summary.failed;
    $('#stat-skipped').textContent = summary.skipped;
    $('#stat-time').textContent = summary.durationMs + 'ms';
}

function updateBadges(results) {
    // Map suite names to module IDs
    const suiteResults = results.suites;
    SUITE_MODULES.forEach((mod, index) => {
        const badge = $(`#badge-${mod.id}`);
        if (!badge) return;
        const suite = suiteResults.find(s => s.moduleId === mod.id) || suiteResults[index];
        if (!suite) { badge.textContent = '—'; return; }

        if (suite.failed > 0) {
            badge.textContent = `${suite.failed}✗`;
            badge.className = 'badge fail';
        } else {
            badge.textContent = `${suite.passed}✓`;
            badge.className = 'badge';
        }
    });
}

// ============================================================ //
//  Results Rendering                                           //
// ============================================================ //

function renderEmptyState() {
    const container = $('#results-container');
    container.innerHTML = `
        <div class="empty-state">
            <div class="icon">🧪</div>
            <h2>BeerDex QA Lab</h2>
            <p>Cliquez sur <strong>Exécuter tous les tests</strong> pour lancer la batterie complète.</p>
        </div>
    `;
}

function renderResults(results) {
    const container = $('#results-container');
    if (!results || results.suites.length === 0) {
        renderEmptyState();
        return;
    }

    let html = '';
    results.suites.forEach((suite, sIdx) => {
        const mod = SUITE_MODULES.find(m => m.id === suite.moduleId) || SUITE_MODULES[sIdx];
        const categoryId = mod ? mod.id : (suite.moduleId || 'unknown');
        const hasFailures = suite.failed > 0;
        const statusClass = hasFailures ? 'has-failures' : 'all-passed';
        const expandedClass = hasFailures ? 'expanded' : '';

        html += `
        <div class="suite-block ${statusClass} ${expandedClass}" data-category="${categoryId}">
            <div class="suite-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="suite-name">
                    <span class="icon">${hasFailures ? '❌' : '✅'}</span>
                    ${escapeHtml(suite.name)}
                </div>
                <div class="suite-meta">
                    <span class="count-pass">${suite.passed}✓</span>
                    ${suite.failed > 0 ? `<span class="count-fail">${suite.failed}✗</span>` : ''}
                    ${suite.skipped > 0 ? `<span class="count-skip">${suite.skipped}⊘</span>` : ''}
                    <span class="duration">${suite.durationMs}ms</span>
                    <span class="suite-chevron">▶</span>
                </div>
            </div>
            <div class="suite-tests">
                ${suite.tests.map(t => renderTestRow(t)).join('')}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function renderTestRow(test) {
    const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '⊘';
    const iconClass = test.status;

    let errorHtml = '';
    if (test.error) {
        errorHtml = `
        <div class="error-detail">
            <div class="error-message">${escapeHtml(test.error.message)}</div>
            ${test.error.expected !== undefined ? `
            <div class="error-diff">
                <span class="label">Expected:</span>
                <span class="val-expected">${escapeHtml(prettyValue(test.error.expected))}</span>
                <span class="label">Received:</span>
                <span class="val-received">${escapeHtml(prettyValue(test.error.received))}</span>
            </div>` : ''}
            ${test.error.stack ? `<div class="error-stack">${escapeHtml(cleanStack(test.error.stack))}</div>` : ''}
        </div>`;
    }

    return `
    <div class="test-row" data-status="${test.status}" data-testname="${escapeHtml(test.name.toLowerCase())}">
        <div class="test-info">
            <div class="test-name">
                <span class="test-status-icon ${iconClass}">${icon}</span>
                ${escapeHtml(test.name)}
            </div>
            ${errorHtml}
        </div>
        <span class="test-duration">${test.durationMs}ms</span>
    </div>`;
}

// ============================================================ //
//  Filtering                                                   //
// ============================================================ //

function filterResultsByCategory(category) {
    $$('.suite-block').forEach(block => {
        if (category === 'all') {
            block.style.display = '';
        } else {
            block.style.display = block.dataset.category === category ? '' : 'none';
        }
    });
}

function handleSearchFilter() {
    const query = $('#search-tests').value.toLowerCase().trim();
    $$('.test-row').forEach(row => {
        const name = row.dataset.testname || '';
        row.style.display = (!query || name.includes(query)) ? '' : 'none';
    });
}

let failedFilterActive = false;
function handleToggleFailedFilter() {
    failedFilterActive = !failedFilterActive;
    const btn = $('#btn-filter-failed');
    btn.classList.toggle('active', failedFilterActive);

    $$('.test-row').forEach(row => {
        if (failedFilterActive) {
            row.style.display = row.dataset.status === 'failed' ? '' : 'none';
        } else {
            row.style.display = '';
        }
    });

    if (failedFilterActive) {
        // Auto-expand suites with failures
        $$('.suite-block.has-failures').forEach(b => b.classList.add('expanded'));
    }
}

// ============================================================ //
//  Markdown Report Generation                                  //
// ============================================================ //

function generateMarkdownReport(results) {
    if (!results) return '# No test results available.';

    const s = results.summary;
    const statusEmoji = s.failed === 0 ? '✅' : '❌';
    let md = `# ${statusEmoji} BeerDex Test Report\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Total | ${s.total} |\n`;
    md += `| Passed | ${s.passed} |\n`;
    md += `| Failed | ${s.failed} |\n`;
    md += `| Skipped | ${s.skipped} |\n`;
    md += `| Duration | ${s.durationMs}ms |\n`;
    md += `| Date | ${new Date().toISOString()} |\n\n`;

    results.suites.forEach(suite => {
        const icon = suite.failed > 0 ? '❌' : '✅';
        md += `## ${icon} ${suite.name} (${suite.passed}/${suite.passed + suite.failed})\n\n`;

        if (suite.failed > 0) {
            suite.tests.filter(t => t.status === 'failed').forEach(t => {
                md += `- **FAIL**: ${t.name}\n`;
                if (t.error) {
                    md += `  > ${t.error.message}\n`;
                    if (t.error.expected !== undefined) {
                        md += `  > Expected: \`${prettyValue(t.error.expected)}\`\n`;
                        md += `  > Received: \`${prettyValue(t.error.received)}\`\n`;
                    }
                }
                md += '\n';
            });
        }
    });

    return md;
}

function handleCopyReport() {
    const md = generateMarkdownReport(lastResults);
    navigator.clipboard.writeText(md).then(() => {
        const btn = $('#btn-copy-report');
        const original = btn.innerHTML;
        btn.innerHTML = '✅ Copié !';
        setTimeout(() => { btn.innerHTML = original; }, 2000);
    }).catch(err => {
        console.error('Clipboard copy failed:', err);
        alert(md); // Fallback: show in alert
    });
}

// ============================================================ //
//  Utilities                                                   //
// ============================================================ //

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function prettyValue(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'object') {
        try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val);
}

function cleanStack(stack) {
    if (!stack) return '';
    return stack
        .split('\n')
        .filter(line => !line.includes('test-framework.js'))
        .slice(0, 6)
        .join('\n');
}

// ============================================================ //
//  Thanos DB Audit (Official Database Duplicates Scanner)      //
// ============================================================ //

async function handleThanosAudit() {
    const container = $('#thanos-audit-container');
    if (!container) return;

    if (container.style.display !== 'none' && container.dataset.loaded === 'true') {
        container.style.display = 'none';
        return;
    }

    const btn = $('#btn-thanos-audit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Analyse Thanos en cours...';
    btn.disabled = true;

    try {
        const [resBelg, resNew] = await Promise.all([
            fetch('../data/belgiumbeer.json').then(r => r.json()),
            fetch('../data/newbeer.json').then(r => r.json())
        ]);
        const allOfficial = [...resBelg, ...resNew].filter(b => b && b.id && !String(b.id).startsWith('CUSTOM_'));
        const duplicates = Thanos.findCatalogDuplicatesFast(allOfficial, 80);

        renderThanosAuditView(container, duplicates, allOfficial);
        container.dataset.loaded = 'true';
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Erreur audit Thanos:', err);
        alert('Impossible de charger les fichiers de données: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function renderThanosAuditView(container, duplicates, allOfficial) {
    const deleteIds = duplicates.map(d => d.customBeer.id);

    container.innerHTML = `
        <div style="background: var(--bg-card); border: 1px solid var(--accent-gold); border-radius: var(--radius); padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h2 style="color: var(--accent-gold); font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
                        <span>⚡</span> Thanos DB Audit — Doublons Officiels Identifiés (${duplicates.length})
                    </h2>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;">
                        Ces doublons ont été identifiés dans la base officielle (belgiumbeer.json / newbeer.json) pour examen et suppression.
                    </p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary" id="btn-copy-thanos-json" style="font-size: 0.8rem; padding: 6px 12px;">
                        📋 Copier IDs (JSON)
                    </button>
                    <button class="btn btn-secondary" id="btn-download-thanos-json" style="font-size: 0.8rem; padding: 6px 12px;">
                        💾 Télécharger IDs (.json)
                    </button>
                    <button class="btn btn-secondary" id="btn-copy-thanos-md" style="font-size: 0.8rem; padding: 6px 12px;">
                        📝 Rapport Markdown
                    </button>
                    <button class="btn btn-secondary" id="btn-close-thanos-audit" style="font-size: 0.8rem; padding: 6px 12px;">
                        ✕ Fermer
                    </button>
                </div>
            </div>

            <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <input type="text" id="thanos-audit-search" class="search-input" placeholder="Filtrer un doublon (ex: Le Fort, Bush, Orval)..." style="flex: 1; min-width: 250px; padding: 8px 12px;">
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Commande CLI : <code style="color: var(--accent-gold); background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 4px;">node scripts/thanos_cleanup_official_dupes.js --apply</code></span>
            </div>

            <div id="thanos-audit-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 600px; overflow-y: auto;">
                ${duplicates.map((d) => `
                    <div class="thanos-dupe-card" data-search="${escapeHtml((d.customBeer.title + ' ' + d.officialBeer.title + ' ' + (d.customBeer.brewery || '')).toLowerCase())}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 250px;">
                            <div style="font-size: 0.75rem; color: #e74c3c; font-weight: bold; text-transform: uppercase;">🗑️ Doublon à supprimer :</div>
                            <div style="font-weight: 600; color: #fff; font-size: 0.95rem;">${escapeHtml(d.customBeer.title)}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(d.customBeer.brewery || '')} · ${escapeHtml(d.customBeer.alcohol || '')} · ${escapeHtml(d.customBeer.volume || '')}</div>
                            <code style="font-size: 0.7rem; color: #ff8a80; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">ID: ${escapeHtml(d.customBeer.id)}</code>
                        </div>

                        <div style="text-align: center; flex-shrink: 0;">
                            <span class="badge" style="background: rgba(255, 192, 0, 0.15); color: var(--accent-gold); border: 1px solid rgba(255, 192, 0, 0.4); padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85rem;">${d.score}%</span>
                            <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">Similarité</div>
                        </div>

                        <div style="flex: 1; min-width: 250px;">
                            <div style="font-size: 0.75rem; color: var(--success); font-weight: bold; text-transform: uppercase;">✨ Cible à conserver :</div>
                            <div style="font-weight: 600; color: #fff; font-size: 0.95rem;">${escapeHtml(d.officialBeer.title)}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(d.officialBeer.brewery || '')} · ${escapeHtml(d.officialBeer.alcohol || '')} · ${escapeHtml(d.officialBeer.volume || '')}</div>
                            <code style="font-size: 0.7rem; color: #81c784; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">ID: ${escapeHtml(d.officialBeer.id)}</code>
                        </div>

                        <div style="flex-shrink: 0;">
                            <button class="btn btn-secondary btn-copy-single-id" data-id="${escapeHtml(d.customBeer.id)}" style="font-size: 0.75rem; padding: 6px 10px;">
                                Copier ID
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Event listeners
    container.querySelector('#btn-close-thanos-audit').addEventListener('click', () => {
        container.style.display = 'none';
    });

    container.querySelector('#btn-copy-thanos-json').addEventListener('click', (e) => {
        const json = JSON.stringify(deleteIds, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            const btn = e.target;
            const orig = btn.innerText;
            btn.innerText = '✅ IDs Copiés !';
            setTimeout(() => btn.innerText = orig, 2000);
        });
    });

    container.querySelector('#btn-download-thanos-json').addEventListener('click', () => {
        const json = JSON.stringify(deleteIds, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thanos_official_duplicate_ids_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    container.querySelector('#btn-copy-thanos-md').addEventListener('click', (e) => {
        let md = `# ⚡ Thanos DB Audit — ${duplicates.length} Doublons Détectés\n\n`;
        md += `| Score | Doublon à supprimer (ID) | Cible à conserver (ID) | Brasserie |\n`;
        md += `|---|---|---|---|\n`;
        duplicates.forEach(d => {
            md += `| ${d.score}% | \`${d.customBeer.id}\` (${d.customBeer.title}) | \`${d.officialBeer.id}\` (${d.officialBeer.title}) | ${d.officialBeer.brewery || ''} |\n`;
        });
        navigator.clipboard.writeText(md).then(() => {
            const btn = e.target;
            const orig = btn.innerText;
            btn.innerText = '✅ Markdown Copié !';
            setTimeout(() => btn.innerText = orig, 2000);
        });
    });

    container.querySelectorAll('.btn-copy-single-id').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            navigator.clipboard.writeText(id).then(() => {
                const orig = btn.innerText;
                btn.innerText = 'Copié !';
                setTimeout(() => btn.innerText = orig, 1500);
            });
        });
    });

    const searchInput = container.querySelector('#thanos-audit-search');
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        container.querySelectorAll('.thanos-dupe-card').forEach(card => {
            const text = card.dataset.search || '';
            card.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
    });
}
