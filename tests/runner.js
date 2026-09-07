/**
 * runner.js — Test Suite Orchestrator for BeerDex QA Lab.
 * 
 * Dynamically imports all test suites, triggers execution,
 * updates the UI in real-time, and generates Markdown reports.
 */

import { getSuites, clearSuites, runAllSuites } from './core/test-framework.js';
import { Sandbox } from './core/sandbox.js';

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
                // Dynamic import — each module self-registers via describe()
                await import(mod.path + '?t=' + Date.now());
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
        const suite = suiteResults[index];
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
        const mod = SUITE_MODULES[sIdx];
        const hasFailures = suite.failed > 0;
        const statusClass = hasFailures ? 'has-failures' : 'all-passed';
        const expandedClass = hasFailures ? 'expanded' : '';

        html += `
        <div class="suite-block ${statusClass} ${expandedClass}" data-category="${mod ? mod.id : 'unknown'}">
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
