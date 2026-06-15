/**
 * Import / Export UI Module
 * Extracted from ui.js — handles all import, export, backup and share-link UI.
 */
import { i18n } from './i18n.js';
import * as Storage from './storage.js';
import { openModal, closeModal, showToast } from './ui.js';

// --- Auto Backup Prompt ---

export function checkAutoBackup() {
    const lastBackup = parseInt(Storage.getPreference('last_file_backup', '0'), 10);
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    // Only prompt if user has at least some data
    const userData = Storage.getAllUserData();
    if (Object.keys(userData).length === 0) return;

    if (now - lastBackup > SEVEN_DAYS) {
        const toast = document.createElement('div');
        toast.className = 'update-toast';
        toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#333; color:white; padding:15px; border-radius:8px; z-index:9999; display:flex; gap:10px; align-items:center; box-shadow:0 4px 10px rgba(0,0,0,0.5); border:1px solid var(--accent-gold);';

        toast.innerHTML = `
            <span>💾 Pensez à sauvegarder vos données !</span>
            <button id="btn-auto-backup" class="btn-primary" style="padding:5px 10px; font-size:0.8rem; margin:0;">Télécharger</button>
            <button id="btn-dismiss-backup" style="background:none; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
        `;
        document.body.appendChild(toast);

        toast.querySelector('#btn-auto-backup').onclick = () => {
            Storage.triggerExportFile('all');
            Storage.savePreference('last_file_backup', now.toString());
            toast.remove();
            showToast(i18n.t('toast_backup_downloaded'));
        };

        toast.querySelector('#btn-dismiss-backup').onclick = () => {
            Storage.savePreference('last_file_backup', now.toString()); // Dismiss for 7 days
            toast.remove();
        };
    }
}

// --- Share Link Modal ---

export function renderShareLink(link) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.textAlign = 'center';
    wrapper.innerHTML = `
        <h2>Lien de Partage</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:15px;">Si l'image ne s'affiche pas, utilisez ce lien :</p>
        <textarea readonly style="width:100%; height:80px; background:#111; color:#0f0; border:1px solid #333; margin-bottom:10px;">${link}</textarea>
        <button class="btn-primary" onclick="navigator.clipboard.writeText('${link}').then(() => showToast(i18n.t('toast_copied')))">${i18n.t('match_btn_copy')}</button>
    `;
    openModal(wrapper);
}

// --- Import Modal ---

export function renderImportModal() {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.textAlign = 'center';

    let importOptions = {
        importCustom: true,
        importRatings: true,
        importHistory: true,
        importTheme: true,
        importBac: true,
        importPrefs: true,
        importTemplate: true,
        importAchievements: true,
        overwriteMode: false
    };

    let currentAnalysis = null;

    const sec = `background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:14px;text-align:left;`;
    const secHead = (icon, text) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-size:1rem;">${icon}</span><strong style="color:var(--accent-gold);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">${text}</strong></div>`;

    wrapper.innerHTML = `
        <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:2.4rem;margin-bottom:6px;filter:drop-shadow(0 2px 8px rgba(245,158,11,0.3));">📥</div>
            <h2 style="color:var(--accent-gold);font-size:1.3rem;margin-bottom:4px;">${i18n.t('import_title')}</h2>
            <p style="font-size:0.8rem;color:#666;">${i18n.t('import_desc')}</p>
        </div>

        <div style="${sec}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <label class="text-btn" style="cursor:pointer; display:flex; align-items:center; gap:5px; padding:8px 12px; background:rgba(255,255,255,0.05); border-radius:8px;">
                    📁 ${i18n.t('import_btn_file')}
                    <input type="file" id="import-file-input" accept=".json, .txt" style="display:none;">
                </label>
                <button id="btn-paste" class="text-btn" style="padding:8px 12px; background:rgba(255,255,255,0.05); border-radius:8px;">📋 ${i18n.t('import_btn_paste')}</button>
            </div>
            <textarea id="import-area" class="form-textarea" rows="3" placeholder="${i18n.t('import_placeholder')}" style="font-size:0.75rem; color:#888; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1);"></textarea>
        </div>

        <div id="import-dynamic-section" style="display:none;">
            <div id="import-save-date-alert" style="display:none; padding:10px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px; color:var(--accent-gold); font-size:0.8rem; margin-bottom:14px; text-align:center;"></div>
            <div id="import-conflict-alert" style="display:none; padding:10px; background:rgba(255,50,50,0.1); border:1px solid rgba(255,50,50,0.3); border-radius:8px; color:#ffaaaa; font-size:0.8rem; margin-bottom:14px;"></div>
            
            <div id="import-scope-container" style="${sec}">
                ${secHead('📦', i18n.t('import_scope_label'))}
                <div id="import-checkboxes" style="display:flex;flex-direction:column;gap:2px;"></div>
            </div>

            <div style="${sec}">
                ${secHead('⚙️', i18n.t('import_mode_label'))}
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
                    <input type="radio" name="importMode" value="merge" checked style="accent-color:var(--accent-gold);width:16px;height:16px;">
                    <div>
                        <div style="font-size:0.85rem;color:#ddd;">${i18n.t('import_mode_merge')}</div>
                        <div style="font-size:0.7rem;color:#888;">${i18n.t('import_mode_merge_desc')}</div>
                    </div>
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="radio" name="importMode" value="overwrite" style="accent-color:var(--accent-gold);width:16px;height:16px;">
                    <div>
                        <div style="font-size:0.85rem;color:#ddd;">${i18n.t('import_mode_overwrite')}</div>
                        <div style="font-size:0.7rem;color:#888;">${i18n.t('import_mode_overwrite_desc')}</div>
                    </div>
                </label>
            </div>
        </div>

        <button id="btn-do-import" class="btn-primary" style="width:100%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.3);letter-spacing:0.3px; opacity:0.5; pointer-events:none;">
            ${i18n.t('import_btn_submit')}
        </button>
    `;

    const textarea = wrapper.querySelector('#import-area');
    const dynamicSection = wrapper.querySelector('#import-dynamic-section');
    const btnDoImport = wrapper.querySelector('#btn-do-import');
    const chkContainer = wrapper.querySelector('#import-checkboxes');
    const scopeContainer = wrapper.querySelector('#import-scope-container');
    const conflictAlert = wrapper.querySelector('#import-conflict-alert');
    const saveDateAlert = wrapper.querySelector('#import-save-date-alert');

    const mkCheckbox = (key, label) => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
            <input type="checkbox" class="cb-import-opt" data-key="${key}" ${importOptions[key] ? 'checked' : ''} style="accent-color:var(--accent-gold);width:16px;height:16px;">
            <span style="font-size:0.85rem;color:#ddd;">${label}</span>
        </label>
    `;

    const processJson = (text) => {
        if (!text || !text.trim()) {
            dynamicSection.style.display = 'none';
            btnDoImport.style.opacity = '0.5';
            btnDoImport.style.pointerEvents = 'none';
            return;
        }

        currentAnalysis = Storage.analyzeImportData(text);

        if (!currentAnalysis.isValid) {
            dynamicSection.style.display = 'none';
            btnDoImport.style.opacity = '0.5';
            btnDoImport.style.pointerEvents = 'none';
            return;
        }

        // It's valid JSON for Beerdex
        dynamicSection.style.display = 'block';
        btnDoImport.style.opacity = '1';
        btnDoImport.style.pointerEvents = 'auto';

        if (currentAnalysis.exportDate) {
            saveDateAlert.style.display = 'block';
            saveDateAlert.innerHTML = `<strong>${i18n.t('import_save_date')}</strong> ${new Date(currentAnalysis.exportDate).toLocaleString()}`;
        } else {
            saveDateAlert.style.display = 'none';
        }

        if (currentAnalysis.customConflicts > 0) {
            conflictAlert.style.display = 'block';
            const template = i18n.t('import_conflict_warning') || "⚠️ Attention, {count} bières personnalisées existent déjà.";
            conflictAlert.innerHTML = template.replace('{count}', currentAnalysis.customConflicts);
        } else {
            conflictAlert.style.display = 'none';
        }

        if (currentAnalysis.isSingleShare) {
            scopeContainer.style.display = 'none';
        } else {
            scopeContainer.style.display = 'block';
            chkContainer.innerHTML = '';
            let html = '';
            if (currentAnalysis.hasCustom) html += mkCheckbox('importCustom', i18n.t('export_opt_custom') || 'Bières Personnalisées');
            if (currentAnalysis.hasRatings) html += mkCheckbox('importRatings', i18n.t('export_opt_ratings') || 'Notes');
            if (currentAnalysis.hasHistory) html += mkCheckbox('importHistory', i18n.t('export_opt_history') || 'Historique');
            if (currentAnalysis.hasBac) html += mkCheckbox('importBac', i18n.t('export_opt_bac') || 'Profil Alcoolémie');
            if (currentAnalysis.hasTheme) html += mkCheckbox('importTheme', i18n.t('export_opt_theme') || 'Thème');
            if (currentAnalysis.hasPrefs) html += mkCheckbox('importPrefs', i18n.t('export_opt_prefs') || 'Préférences');
            if (currentAnalysis.hasTemplate) html += mkCheckbox('importTemplate', i18n.t('export_opt_template') || 'Modèle Notation');
            if (currentAnalysis.hasAchievements) html += mkCheckbox('importAchievements', i18n.t('export_opt_achievements') || 'Succès');
            
            chkContainer.innerHTML = html;

            // Bind events for dynamically created checkboxes
            wrapper.querySelectorAll('.cb-import-opt').forEach(cb => {
                cb.onchange = (e) => {
                    importOptions[e.target.dataset.key] = e.target.checked;
                };
            });
        }
    };

    textarea.addEventListener('input', (e) => processJson(e.target.value));

    // Paste Button
    wrapper.querySelector('#btn-paste').onclick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                textarea.value = text;
                processJson(text);
            } else {
                showToast(i18n.t('toast_clipboard_empty'));
            }
        } catch (e) {
            showToast(i18n.t('toast_clipboard_denied'));
            textarea.focus();
        }
    };

    // File Input Handler
    wrapper.querySelector('#import-file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target.result;
            textarea.value = content;
            processJson(content);
            showToast(i18n.t('toast_file_loaded'));
        };
        reader.readAsText(file);
    };

    // Mode Radios
    wrapper.querySelectorAll('input[name="importMode"]').forEach(rb => {
        rb.onchange = (e) => {
            importOptions.overwriteMode = e.target.value === 'overwrite';
        };
    });

    // Import Button
    wrapper.querySelector('#btn-do-import').onclick = () => {
        if (!currentAnalysis || !currentAnalysis.isValid) return;

        const btn = wrapper.querySelector('#btn-do-import');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> ...';

        setTimeout(() => {
            if (Storage.importData(textarea.value, importOptions)) {
                closeModal();
                showToast(i18n.t('toast_import_success'), "success");
                setTimeout(() => location.reload(), 1500);
            } else {
                showToast(i18n.t('toast_import_invalid'), "error");
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }, 100);
    };

    openModal(wrapper);
}

// --- Export Modal ---

export function renderExportModal() {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.textAlign = 'center';

    let currentMode = 'file';
    let downloadMode = false;

    let exportOptions = {
        exportCustom: true,
        exportRatings: true,
        exportHistory: true,
        exportTheme: true,
        exportBac: true,
        exportPrefs: true,
        exportTemplate: true,
        exportAchievements: true
    };

    let allCustomBeers = [];
    let selectedCustomIds = [];
    if (Storage.getCustomBeers) {
        allCustomBeers = Storage.getCustomBeers();
        selectedCustomIds = allCustomBeers.map(b => b.id);
    }

    const sec = `background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:14px;text-align:left;`;
    const secHead = (icon, text) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-size:1rem;">${icon}</span><strong style="color:var(--accent-gold);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">${text}</strong></div>`;
    
    const mkCheckbox = (key, label) => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
            <input type="checkbox" class="cb-export-opt" data-key="${key}" ${exportOptions[key] ? 'checked' : ''} style="accent-color:var(--accent-gold);width:16px;height:16px;">
            <span style="font-size:0.85rem;color:#ddd;">${label}</span>
        </label>
    `;

    const mkModeBtn = (id, label, val) => {
        const a = currentMode === val;
        return `<button id="${id}" style="flex:1;padding:10px 6px;border-radius:10px;border:1px solid ${a?'var(--accent-gold)':'rgba(255,255,255,0.08)'};background:${a?'rgba(245,158,11,0.12)':'rgba(255,255,255,0.02)'};color:${a?'var(--accent-gold)':'#888'};font-size:0.78rem;font-weight:${a?'600':'400'};cursor:pointer;transition:all 0.2s;">${label}</button>`;
    };

    const renderContent = () => {
        let customSelectionHTML = '';
        if (exportOptions.exportCustom && allCustomBeers.length > 0) {
            customSelectionHTML = `
                <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;margin-top:5px;max-height:140px;overflow-y:auto;border:1px solid rgba(255,255,255,0.06);margin-left:24px;">
                    <div style="font-size:0.72rem;color:#666;margin-bottom:6px;">${i18n.t('share_selection_desc')}</div>
                    ${allCustomBeers.map(b => `
                        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                            <input type="checkbox" class="cb-custom" value="${b.id}" ${selectedCustomIds.includes(b.id) ? 'checked' : ''} style="accent-color:var(--accent-gold);">
                            <span style="font-size:0.82rem;color:#ddd;">${b.title}</span>
                        </label>
                    `).join('')}
                </div>`;
        }

        wrapper.innerHTML = `
            <div style="text-align:center;margin-bottom:18px;">
                <div style="font-size:2.4rem;margin-bottom:6px;filter:drop-shadow(0 2px 8px rgba(245,158,11,0.3));">💾</div>
                <h2 style="color:var(--accent-gold);font-size:1.3rem;margin-bottom:4px;">${i18n.t('export_title')}</h2>
                <p style="font-size:0.8rem;color:#666;">${i18n.t('export_desc')}</p>
            </div>

            <div style="${sec}">
                ${secHead('📦', i18n.t('export_scope_label'))}
                <div style="display:flex;flex-direction:column;gap:2px;">
                    ${mkCheckbox('exportCustom', i18n.t('export_opt_custom') || 'Bières Personnalisées')}
                    ${customSelectionHTML}
                    ${mkCheckbox('exportRatings', i18n.t('export_opt_ratings') || 'Notes')}
                    ${mkCheckbox('exportHistory', i18n.t('export_opt_history') || 'Historique')}
                    ${mkCheckbox('exportBac', i18n.t('export_opt_bac') || 'Profil Alcoolémie')}
                    ${mkCheckbox('exportTheme', i18n.t('export_opt_theme') || 'Thème')}
                    ${mkCheckbox('exportPrefs', i18n.t('export_opt_prefs') || 'Préférences')}
                    ${mkCheckbox('exportTemplate', i18n.t('export_opt_template') || 'Modèle Notation')}
                    ${mkCheckbox('exportAchievements', i18n.t('export_opt_achievements') || 'Succès')}
                </div>
            </div>

            <div style="${sec}">
                ${secHead('📤', i18n.t('export_method_label'))}
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    ${mkModeBtn('mode-file', i18n.t('export_method_file'), 'file')}
                    ${mkModeBtn('mode-url', i18n.t('export_method_url'), 'url')}
                    ${mkModeBtn('mode-text', i18n.t('export_method_text'), 'text')}
                </div>
            </div>

            <button id="btn-do-export" class="btn-primary" style="width:100%;margin-top:4px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.3);letter-spacing:0.3px;">
                ${currentMode === 'file' ? i18n.t('export_btn_download') : currentMode === 'url' ? i18n.t('export_btn_generate') : i18n.t('export_btn_view')}
            </button>
        `;

        // Bind Option Checkboxes
        wrapper.querySelectorAll('.cb-export-opt').forEach(cb => {
            cb.onchange = (e) => {
                const key = e.target.dataset.key;
                exportOptions[key] = e.target.checked;
                if (key === 'exportCustom') renderContent(); // re-render to show/hide sub-list
            };
        });

        // Bind Custom Beer Checkboxes
        wrapper.querySelectorAll('.cb-custom').forEach(cb => {
            cb.onchange = (e) => {
                if (e.target.checked) {
                    if (!selectedCustomIds.includes(e.target.value)) selectedCustomIds.push(e.target.value);
                } else {
                    selectedCustomIds = selectedCustomIds.filter(id => id !== e.target.value);
                }
            };
        });

        // Bind Mode
        wrapper.querySelector('#mode-file').onclick = () => { currentMode = 'file'; renderContent(); };
        wrapper.querySelector('#mode-url').onclick = () => { currentMode = 'url'; renderContent(); };
        wrapper.querySelector('#mode-text').onclick = () => { currentMode = 'text'; renderContent(); };

        // Bind Action
        wrapper.querySelector('#btn-do-export').onclick = async () => {
            const btn = wrapper.querySelector('#btn-do-export');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> ...';

            // Build options object
            const finalOptions = { ...exportOptions };
            finalOptions.customIds = finalOptions.exportCustom ? selectedCustomIds : null;

            setTimeout(async () => {
                if (currentMode === 'file') {
                    // triggerExportFile uses options now
                    Storage.exportDataAdvanced(finalOptions);
                    showToast(i18n.t('toast_export_success'), "success");
                    closeModal();
                } else if (currentMode === 'url') {
                    const link = Storage.getShareableLink(finalOptions, downloadMode);
                    if (link) {
                        showLinkResult(link, 'all');
                    } else {
                        showToast(i18n.t('toast_export_error'), "error");
                        btn.disabled = false; btn.innerHTML = originalText;
                    }
                } else if (currentMode === 'text') {
                    let exportObj = Storage.generateExportObject(finalOptions);
                    showLinkResult(JSON.stringify(exportObj, null, 2), 'all', true);
                }
            }, 300);
        };
    };

    const showLinkResult = (content, scopeName, isText = false) => {
        wrapper.innerHTML = `
            <div style="text-align:center;margin-bottom:18px;">
                <div style="font-size:2rem;margin-bottom:6px;">${isText ? '📝' : '🔗'}</div>
                <h2 style="color:var(--accent-gold);font-size:1.2rem;margin-bottom:4px;">${isText ? i18n.t('export_result_title_json') : i18n.t('export_result_title_link')}</h2>
                <p style="font-size:0.8rem;color:#888;">
                    ${isText ? i18n.t('export_result_desc_json') : i18n.t('export_result_desc_link', { scope: scopeName })}
                </p>
            </div>

            <div style="${sec}">
                <textarea id="result-area" readonly style="width:100%;height:140px;background:rgba(0,0,0,0.4);color:#4caf50;border:1px solid rgba(255,255,255,0.06);border-radius:8px;font-family:monospace;font-size:0.72rem;padding:10px;resize:none;">${content}</textarea>
            </div>

            <button id="btn-copy-result" class="btn-primary" style="width:100%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.3);">
                ${i18n.t('match_btn_copy')}
            </button>
            <button id="btn-back" style="width:100%;margin-top:10px;padding:12px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#888;font-size:0.9rem;cursor:pointer;transition:all 0.2s;">
                ${i18n.t('btn_back')}
            </button>
        `;

        wrapper.querySelector('#btn-copy-result').onclick = () => {
            wrapper.querySelector('#result-area').select();
            navigator.clipboard.writeText(content).then(() => showToast(i18n.t('toast_copied'), "success"));
        };
        wrapper.querySelector('#btn-back').onclick = () => renderContent();
    };

    renderContent();
    openModal(wrapper);
}
