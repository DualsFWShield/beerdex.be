/**
 * Import / Export UI Module
 * Extracted from ui.js — handles all import, export, backup and share-link UI.
 */
import { i18n } from './i18n.js';
import * as Storage from './storage.js';
import { openModal, closeModal, showToast } from './ui.js';
import { OTASyncManager } from './ota-sync.js';

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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">
                <label class="text-btn" style="cursor:pointer; display:flex; align-items:center; gap:5px; padding:8px 12px; background:rgba(255,255,255,0.05); border-radius:8px;">
                    📁 ${i18n.t('import_btn_file')}
                    <input type="file" id="import-file-input" accept=".json, .txt" style="display:none;">
                </label>
                <button id="btn-paste" class="text-btn" style="padding:8px 12px; background:rgba(255,255,255,0.05); border-radius:8px;">📋 ${i18n.t('import_btn_paste')}</button>
                <button id="btn-open-ota-join" class="text-btn" style="padding:8px 12px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:var(--accent-gold); border-radius:8px; font-weight:600;">📡 ${i18n.t('import_btn_ota') || 'DraftSync'}</button>
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

    // OTA Join Button
    const btnOtaJoin = wrapper.querySelector('#btn-open-ota-join');
    if (btnOtaJoin) {
        btnOtaJoin.onclick = () => {
            closeModal();
            renderOtaSyncModal(null, 'join');
        };
    }

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
                    ${mkModeBtn('mode-ota', i18n.t('export_method_ota') || '📡 DraftSync', 'ota')}
                    ${mkModeBtn('mode-text', i18n.t('export_method_text'), 'text')}
                </div>
            </div>

            <button id="btn-do-export" class="btn-primary" style="width:100%;margin-top:4px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.3);letter-spacing:0.3px;">
                ${currentMode === 'file' ? i18n.t('export_btn_download') : currentMode === 'ota' ? (i18n.t('export_btn_ota') || '📡 Lancer DraftSync') : i18n.t('export_btn_view')}
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
        wrapper.querySelector('#mode-ota').onclick = () => { currentMode = 'ota'; renderContent(); };
        wrapper.querySelector('#mode-text').onclick = () => { currentMode = 'text'; renderContent(); };

        // Bind Action
        wrapper.querySelector('#btn-do-export').onclick = async () => {
            const finalOptions = { ...exportOptions };
            finalOptions.customIds = finalOptions.exportCustom ? selectedCustomIds : null;

            if (currentMode === 'ota') {
                closeModal();
                renderOtaSyncModal(finalOptions, 'host');
                return;
            }

            const btn = wrapper.querySelector('#btn-do-export');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> ...';

            setTimeout(async () => {
                if (currentMode === 'file') {
                    Storage.exportDataAdvanced(finalOptions);
                    showToast(i18n.t('toast_export_success'), "success");
                    closeModal();
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

// --- DraftSync (OTA Synchronization Modal) ---

export function renderOtaSyncModal(initialExportOptions = null, defaultTab = 'host', autoConnectCode = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-content';
    wrapper.style.cssText = 'max-width: 480px; width: 95%; padding: 22px; text-align: center; border-radius: 20px; box-sizing: border-box; max-height: 90vh; overflow-y: auto;';

    let activeTab = autoConnectCode ? 'join' : defaultTab; // 'host' or 'join'
    let hostSyncMode = 'unilateral'; // 'unilateral' or 'bilateral'
    let currentRoomCode = autoConnectCode ? autoConnectCode.toUpperCase().trim() : null;
    let html5QrScanner = null;
    let isConnectedToHost = false;
    let isSyncing = false;
    let syncResultSummary = null;

    // Scopes initialized from export options if provided
    let hostScopes = {
        custom: initialExportOptions ? !!initialExportOptions.exportCustom : true,
        ratings: initialExportOptions ? !!initialExportOptions.exportRatings : true,
        history: initialExportOptions ? !!initialExportOptions.exportHistory : true,
        bac: initialExportOptions ? !!initialExportOptions.exportBac : true,
        theme: initialExportOptions ? !!initialExportOptions.exportTheme : false,
        prefs: initialExportOptions ? !!initialExportOptions.exportPrefs : false,
        template: initialExportOptions ? !!initialExportOptions.exportTemplate : false,
        achievements: initialExportOptions ? !!initialExportOptions.exportAchievements : true
    };

    // Guest outgoing choices (for bilateral) & incoming reception choices
    let guestExportScopes = { ...hostScopes };
    let guestImportScopes = { ...hostScopes };
    let guestOverwriteMode = false;
    let hostAllowedScopes = { ...hostScopes };
    let membersList = [];

    const sec = `background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:14px;text-align:left;`;
    const secHead = (icon, text) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-size:1rem;">${icon}</span><strong style="color:var(--accent-gold);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">${text}</strong></div>`;

    const scopeLabels = {
        custom: i18n.t('export_opt_custom') || 'Bières Personnalisées',
        ratings: i18n.t('export_opt_ratings') || 'Notes & Commentaires',
        history: i18n.t('export_opt_history') || 'Historique de consommation',
        bac: i18n.t('export_opt_bac') || 'Profil Alcoolémie',
        achievements: i18n.t('export_opt_achievements') || 'Succès',
        template: i18n.t('export_opt_template') || 'Modèle Notation',
        theme: i18n.t('export_opt_theme') || 'Thème',
        prefs: i18n.t('export_opt_prefs') || 'Préférences'
    };

    const stopScanner = () => {
        if (html5QrScanner) {
            try {
                html5QrScanner.stop().then(() => html5QrScanner.clear()).catch(() => {});
            } catch (e) {}
            html5QrScanner = null;
        }
    };

    let syncWatchdog = null;
    const setSyncWatchdog = () => {
        if (syncWatchdog) clearTimeout(syncWatchdog);
        syncWatchdog = setTimeout(() => {
            if (isSyncing) {
                console.warn('[OTA] Sync watchdog timeout triggered (30s).');
                isSyncing = false;
                showToast("Délai de synchronisation dépassé.", "error");
                renderContent();
            }
        }, 30000);
    };
    const clearSyncWatchdog = () => {
        if (syncWatchdog) {
            clearTimeout(syncWatchdog);
            syncWatchdog = null;
        }
    };

    const closeAndCleanup = () => {
        stopScanner();
        clearSyncWatchdog();
        OTASyncManager.closeSession();
        closeModal();
    };

    // --- Host P2P Event Handler ---
    const onHostUpdate = (event, data) => {
        if (event.type === 'session_ready') {
            currentRoomCode = event.roomCode || (data && data.roomCode);
            membersList = event.members || (data && data.members) || [];
            renderContent();
        } else if (event.type === 'peer_joined') {
            membersList = event.members || (data && data.members) || [];
            showToast(i18n.t('ota_device_connected'), "info");
            renderContent();
        } else if (event.type === 'peer_left') {
            membersList = event.members || (data && data.members) || [];
            showToast(i18n.t('ota_device_left'), "info");
            renderContent();
        } else if (event.type === 'sync_sent') {
            isSyncing = false;
            syncResultSummary = { success: true, count: event.count || (data && data.count) || 1, mode: 'unilateral' };
            renderContent();
        } else if (event.type === 'peer_sync_completed') {
            showToast(i18n.t('ota_peer_sync_completed'), "success");
        } else if (event.type === 'bilateral_master_completed') {
            isSyncing = false;
            syncResultSummary = { success: true, contributors: event.contributors || (data && data.contributors) || 1, mode: 'bilateral' };
            renderContent();
        } else if (event.type === 'sync_error') {
            isSyncing = false;
            showToast(event.error || i18n.t('ota_sync_error'), "error");
            renderContent();
        }
    };

    // --- Guest P2P Event Handler ---
    const onGuestUpdate = (event, data) => {
        if (event.type === 'connected_to_host') {
            isConnectedToHost = true;
            renderContent();
        } else if (event.type === 'config_received') {
            isConnectedToHost = true;
            hostSyncMode = event.syncMode || (data && data.syncMode) || 'unilateral';
            hostAllowedScopes = event.allowedScopes || (data && data.allowedScopes) || {};
            membersList = event.members || (data && data.members) || [];

            // Align guest default checkboxes with host authorized scopes
            Object.keys(hostAllowedScopes).forEach(k => {
                if (hostAllowedScopes[k] === false) {
                    guestExportScopes[k] = false;
                    guestImportScopes[k] = false;
                }
            });
            renderContent();
        } else if (event.type === 'payload_received') {
            // Unilateral payload from host
            isSyncing = true;
            setSyncWatchdog();
            renderContent();
            setTimeout(() => {
                const payload = event.payload || (data && data.payload);
                if (!payload) {
                    console.error('[OTA] Received empty payload from host!', event, data);
                    showToast(i18n.t('ota_sync_error'), "error");
                    clearSyncWatchdog();
                    isSyncing = false;
                    renderContent();
                    return;
                }
                const summary = OTASyncManager.applyReceivedData(payload, guestImportScopes, guestOverwriteMode);
                clearSyncWatchdog();
                isSyncing = false;
                syncResultSummary = summary;
                renderContent();
            }, 300);
        } else if (event.type === 'bilateral_request_received') {
            // Host requested data for bilateral merge
            isSyncing = true;
            setSyncWatchdog();
            renderContent();
            OTASyncManager.sendGuestBilateralPayload(guestExportScopes).catch(err => {
                console.error('[OTA] Error sending guest bilateral payload:', err);
            });
        } else if (event.type === 'master_bilateral_received') {
            // Final master bilateral payload from host
            isSyncing = true;
            setSyncWatchdog();
            renderContent();
            setTimeout(() => {
                const payload = event.payload || (data && data.payload);
                if (!payload) {
                    console.error('[OTA] Received empty bilateral payload from host!', event, data);
                    showToast(i18n.t('ota_sync_error'), "error");
                    clearSyncWatchdog();
                    isSyncing = false;
                    renderContent();
                    return;
                }
                const summary = OTASyncManager.applyReceivedData(payload, guestImportScopes, guestOverwriteMode);
                clearSyncWatchdog();
                isSyncing = false;
                syncResultSummary = summary;
                renderContent();
            }, 300);
        } else if (event.type === 'host_disconnected') {
            clearSyncWatchdog();
            isConnectedToHost = false;
            isSyncing = false;
            showToast(i18n.t('ota_host_disconnected'), "error");
            renderContent();
        }
    };

    const renderContent = () => {
        // --- View 1: Success / Summary Screen ---
        if (syncResultSummary) {
            wrapper.innerHTML = `
                <div style="text-align:center;padding:10px 0;">
                    <div style="font-size:3rem;margin-bottom:12px;filter:drop-shadow(0 4px 12px rgba(245,158,11,0.5));">✨</div>
                    <h2 style="color:var(--accent-gold);font-size:1.4rem;margin-bottom:8px;font-family:'Russo One', sans-serif;">
                        ${i18n.t('ota_sync_success')}
                    </h2>
                    <p style="font-size:0.85rem;color:#aaa;margin-bottom:20px;">
                        ${i18n.t('ota_sync_success_desc')}
                    </p>

                    <div style="${sec}background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);text-align:center;">
                        <div style="font-size:0.9rem;color:#ddd;margin-bottom:4px;">
                            ${syncResultSummary.mode === 'unilateral' 
                                ? (OTASyncManager.isHost ? i18n.t('ota_sync_sent_count', { count: syncResultSummary.count }) : i18n.t('ota_sync_received'))
                                : i18n.t('ota_sync_bilateral_done')}
                        </div>
                        ${syncResultSummary.customBeersAdded !== undefined ? `
                            <div style="font-size:0.82rem;color:var(--accent-gold);margin-top:6px;">
                                ${i18n.t('ota_sync_stats', { beers: syncResultSummary.customBeersAdded, ratings: syncResultSummary.ratingsUpdated })}
                            </div>
                        ` : ''}
                    </div>

                    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
                        ${OTASyncManager.isHost ? `
                            <button id="btn-ota-back-lobby" class="btn-primary" style="padding:13px;border-radius:12px;font-weight:bold;font-size:0.95rem;background:linear-gradient(135deg,var(--accent-gold),var(--accent-amber));color:#000;border:none;cursor:pointer;box-shadow:0 4px 15px rgba(245,158,11,0.25);">
                                ${i18n.t('ota_btn_stay_lobby')}
                            </button>
                        ` : ''}
                        <button id="btn-ota-reload" class="btn-primary" style="padding:12px;border-radius:12px;font-weight:bold;font-size:0.95rem;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);cursor:pointer;">
                            ${i18n.t('ota_btn_reload')}
                        </button>
                        <button id="btn-ota-finish" class="btn-cancel" style="padding:10px;border-radius:12px;background:none;color:#888;border:1px solid rgba(255,255,255,0.1);cursor:pointer;">
                            ${i18n.t('ota_btn_close')}
                        </button>
                    </div>
                </div>
            `;

            const backLobbyBtn = wrapper.querySelector('#btn-ota-back-lobby');
            if (backLobbyBtn) {
                backLobbyBtn.onclick = () => {
                    syncResultSummary = null;
                    renderContent();
                };
            }

            wrapper.querySelector('#btn-ota-reload').onclick = () => {
                closeAndCleanup();
                location.reload();
            };
            wrapper.querySelector('#btn-ota-finish').onclick = () => closeAndCleanup();
            return;
        }

        // --- View 2: Sync in Progress Screen ---
        if (isSyncing) {
            wrapper.innerHTML = `
                <div style="text-align:center;padding:30px 15px;">
                    <div class="spinner" style="width:50px;height:50px;margin:0 auto 20px auto;border-width:4px;border-color:rgba(245,158,11,0.2);border-top-color:var(--accent-gold);"></div>
                    <h3 style="color:var(--accent-gold);font-size:1.3rem;margin-bottom:10px;font-family:'Russo One',sans-serif;">
                        ${i18n.t('ota_sync_in_progress')}
                    </h3>
                    <p style="font-size:0.85rem;color:#888;max-width:320px;margin:0 auto;">
                        ${i18n.t('ota_sync_in_progress_desc')}
                    </p>
                </div>
            `;
            return;
        }

        // --- View 3: Normal Navigation (Host / Join Tabs) ---
        const tabStyle = (active) => `
            flex: 1; padding: 11px 8px; border-radius: 12px; cursor: pointer; font-size: 0.85rem; font-weight: ${active ? '600' : '400'};
            background: ${active ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.03)'};
            color: ${active ? 'var(--accent-gold)' : '#888'};
            border: 1px solid ${active ? 'var(--accent-gold)' : 'rgba(255,255,255,0.08)'};
            transition: all 0.2s ease;
        `;

        wrapper.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.5rem;">📡</span>
                    <h2 style="color:var(--accent-gold);font-size:1.25rem;margin:0;font-family:'Russo One',sans-serif;">${i18n.t('ota_title')}</h2>
                </div>
                <button id="btn-close-ota" style="background:none;border:none;color:#888;font-size:1.5rem;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>
            </div>
            <p style="font-size:0.78rem;color:#888;margin-bottom:16px;text-align:left;">
                ${i18n.t('ota_desc')}
            </p>

            <!-- Tab Switcher -->
            <div style="display:flex;gap:8px;margin-bottom:18px;">
                <button id="tab-btn-host" style="${tabStyle(activeTab === 'host')}">
                    ${i18n.t('ota_tab_host')}
                </button>
                <button id="tab-btn-join" style="${tabStyle(activeTab === 'join')}">
                    ${i18n.t('ota_tab_join')}
                </button>
            </div>

            <!-- Tab Content Area -->
            <div id="ota-tab-content"></div>
        `;

        wrapper.querySelector('#btn-close-ota').onclick = () => closeAndCleanup();

        wrapper.querySelector('#tab-btn-host').onclick = () => {
            if (activeTab !== 'host') {
                stopScanner();
                activeTab = 'host';
                renderContent();
                initHostSession();
            }
        };

        wrapper.querySelector('#tab-btn-join').onclick = () => {
            if (activeTab !== 'join') {
                activeTab = 'join';
                renderContent();
            }
        };

        const contentContainer = wrapper.querySelector('#ota-tab-content');

        // -------------------------------------------------------------
        // HOST TAB CONTENT
        // -------------------------------------------------------------
        if (activeTab === 'host') {
            const remotePeersCount = Math.max(0, membersList.length - 1);

            contentContainer.innerHTML = `
                <!-- Room Code & QR Box -->
                <div style="${sec};text-align:center;background:linear-gradient(180deg, rgba(245,158,11,0.06), rgba(0,0,0,0.4));border-color:rgba(245,158,11,0.25);">
                    <div style="font-size:0.75rem;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">
                        ${i18n.t('ota_room_code_label')}
                    </div>
                    <div id="ota-room-code-badge" style="font-family:'Russo One',monospace;font-size:1.9rem;letter-spacing:4px;color:var(--accent-gold);margin-bottom:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;" title="${i18n.t('ota_code_copied')}">
                        <span>${currentRoomCode || '......'}</span>
                        <span style="font-size:1rem;opacity:0.7;">📋</span>
                    </div>

                    <!-- QR Code Frame -->
                    <div id="ota-host-qr-box" style="background:#fff;padding:10px;border-radius:14px;width:150px;height:150px;margin:0 auto 12px auto;box-shadow:0 4px 18px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;">
                        <div id="ota-host-qr"></div>
                    </div>
                    <div style="font-size:0.72rem;color:#777;">${i18n.t('ota_host_qr_hint')}</div>
                </div>

                <!-- Sync Mode Selector -->
                <div style="${sec}">
                    ${secHead('⚙️', i18n.t('ota_mode_label'))}
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:${hostSyncMode==='unilateral'?'rgba(245,158,11,0.1)':'rgba(255,255,255,0.02)'};padding:10px;border-radius:10px;border:1px solid ${hostSyncMode==='unilateral'?'rgba(245,158,11,0.3)':'rgba(255,255,255,0.05)'};">
                            <input type="radio" name="hostSyncMode" value="unilateral" ${hostSyncMode==='unilateral'?'checked':''} style="margin-top:2px;accent-color:var(--accent-gold);">
                            <div>
                                <div style="font-size:0.85rem;color:#eee;font-weight:600;">${i18n.t('ota_mode_unilateral')}</div>
                                <div style="font-size:0.72rem;color:#888;">${i18n.t('ota_mode_unilateral_desc')}</div>
                            </div>
                        </label>

                        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:${hostSyncMode==='bilateral'?'rgba(245,158,11,0.1)':'rgba(255,255,255,0.02)'};padding:10px;border-radius:10px;border:1px solid ${hostSyncMode==='bilateral'?'rgba(245,158,11,0.3)':'rgba(255,255,255,0.05)'};">
                            <input type="radio" name="hostSyncMode" value="bilateral" ${hostSyncMode==='bilateral'?'checked':''} style="margin-top:2px;accent-color:var(--accent-gold);">
                            <div>
                                <div style="font-size:0.85rem;color:#eee;font-weight:600;">${i18n.t('ota_mode_bilateral')}</div>
                                <div style="font-size:0.72rem;color:#888;">${i18n.t('ota_mode_bilateral_desc')}</div>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Scope Selection (Controlled by Host) -->
                <div style="${sec}">
                    ${secHead('📦', i18n.t('ota_scope_label'))}
                    <div style="font-size:0.72rem;color:#777;margin-bottom:8px;">
                        ${i18n.t('ota_scope_hint')}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        ${Object.keys(hostScopes).map(k => `
                            <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#ddd;cursor:pointer;">
                                <input type="checkbox" class="cb-host-scope" data-key="${k}" ${hostScopes[k]?'checked':''} style="accent-color:var(--accent-gold);">
                                <span>${scopeLabels[k] || k}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- Connected Devices Pill & List -->
                <div style="${sec}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        ${secHead('🟢', `${membersList.length} ${i18n.t('ota_connected_devices')}`)}
                        <span style="font-size:0.72rem;color:var(--accent-gold);background:rgba(245,158,11,0.12);padding:2px 8px;border-radius:10px;">
                            ${remotePeersCount > 0 ? i18n.t('ota_guests_count', { count: remotePeersCount }) : i18n.t('ota_status_waiting')}
                        </span>
                    </div>

                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${membersList.map(m => `
                            <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:5px 10px;border-radius:16px;font-size:0.75rem;display:flex;align-items:center;gap:6px;">
                                <span>${m.isHost ? '👑' : '📱'}</span>
                                <span style="color:${m.isHost ? 'var(--accent-gold)' : '#ccc'};">${m.name || m.peerId}</span>
                                ${m.isHost ? `<span style="font-size:0.65rem;color:#888;">(${i18n.t('ota_host_badge')})</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Start Action Button -->
                <button id="btn-ota-host-start" class="btn-primary" style="width:100%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:bold;padding:15px;font-size:1rem;border-radius:12px;box-shadow:0 4px 20px rgba(245,158,11,0.3);letter-spacing:0.3px;${remotePeersCount===0?'opacity:0.5;pointer-events:none;':''}">
                    ${remotePeersCount > 0 ? `${i18n.t('ota_btn_start')} (${remotePeersCount})` : i18n.t('ota_waiting_peers')}
                </button>
            `;

            // Bind Copy Room Code
            const codeBadge = contentContainer.querySelector('#ota-room-code-badge');
            if (codeBadge && currentRoomCode) {
                codeBadge.onclick = () => {
                    navigator.clipboard.writeText(currentRoomCode).then(() => {
                        showToast(i18n.t('ota_code_copied'), "success");
                    });
                };
            }

            // Render QR Code in Host Box
            const qrEl = contentContainer.querySelector('#ota-host-qr');
            if (qrEl && currentRoomCode && window.QRCode) {
                qrEl.innerHTML = '';
                new window.QRCode(qrEl, {
                    text: `DRAFTSYNC:${currentRoomCode}`,
                    width: 140,
                    height: 140,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: window.QRCode.CorrectLevel.M
                });
            }

            // Bind Sync Mode Radio
            contentContainer.querySelectorAll('input[name="hostSyncMode"]').forEach(rb => {
                rb.onchange = (e) => {
                    hostSyncMode = e.target.value;
                    OTASyncManager.updateHostSettings(hostSyncMode, hostScopes);
                    renderContent();
                };
            });

            // Bind Host Scopes Checkboxes
            contentContainer.querySelectorAll('.cb-host-scope').forEach(cb => {
                cb.onchange = (e) => {
                    const key = e.target.dataset.key;
                    hostScopes[key] = e.target.checked;
                    OTASyncManager.updateHostSettings(hostSyncMode, hostScopes);
                };
            });

            // Bind Start Sync Button
            const btnStart = contentContainer.querySelector('#btn-ota-host-start');
            if (btnStart) {
                btnStart.onclick = async () => {
                    btnStart.disabled = true;
                    btnStart.innerHTML = `<span class="spinner" style="width:18px;height:18px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> ${i18n.t('ota_sync_in_progress')}`;
                    try {
                        await OTASyncManager.startSync(hostScopes, { overwriteMode: false });
                    } catch (e) {
                        showToast(e.message || i18n.t('ota_sync_error'), "error");
                        btnStart.disabled = false;
                        btnStart.innerHTML = i18n.t('ota_btn_start');
                    }
                };
            }
        }

        // -------------------------------------------------------------
        // JOIN TAB CONTENT
        // -------------------------------------------------------------
        if (activeTab === 'join') {
            if (!isConnectedToHost) {
                // Not connected yet: show room code input & scanner
                contentContainer.innerHTML = `
                    <div style="${sec}">
                        ${secHead('🔑', i18n.t('ota_room_code_label'))}
                        <input type="text" id="ota-join-input" maxlength="6" placeholder="Ex: 8F3K9M" style="width:100%;box-sizing:border-box;font-family:'Russo One',monospace;font-size:1.4rem;text-align:center;letter-spacing:4px;text-transform:uppercase;padding:12px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:var(--accent-gold);margin-bottom:12px;">

                        <div style="display:flex;gap:8px;">
                            <button id="btn-ota-toggle-scanner" class="text-btn" style="flex:1;padding:11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:0.82rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;">
                                ${i18n.t('ota_btn_scan_qr')}
                            </button>
                            <button id="btn-ota-do-connect" class="btn-primary" style="flex:1;padding:11px;border-radius:10px;font-size:0.85rem;font-weight:bold;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;">
                                ${i18n.t('ota_btn_connect')}
                            </button>
                        </div>

                        <!-- Embedded Camera Scanner Area -->
                        <div id="ota-scanner-wrapper" style="display:none;margin-top:14px;border-radius:12px;overflow:hidden;background:#000;position:relative;">
                            <div id="ota-scanner-view" style="width:100%;max-width:320px;margin:0 auto;"></div>
                            <button id="btn-ota-stop-scanner" class="btn-cancel" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);padding:6px 14px;font-size:0.75rem;border-radius:16px;">
                                ${i18n.t('ota_btn_close_camera')}
                            </button>
                        </div>
                    </div>
                `;

                const joinInput = contentContainer.querySelector('#ota-join-input');
                const btnConnect = contentContainer.querySelector('#btn-ota-do-connect');
                const btnToggleScanner = contentContainer.querySelector('#btn-ota-toggle-scanner');
                const scannerWrapper = contentContainer.querySelector('#ota-scanner-wrapper');
                const btnStopScanner = contentContainer.querySelector('#btn-ota-stop-scanner');

                const doJoin = async (code) => {
                    const cleanCode = (code || '').toUpperCase().trim();
                    if (cleanCode.length !== 6) {
                        showToast(i18n.t('ota_code_length_error'), "error");
                        return;
                    }
                    stopScanner();
                    btnConnect.disabled = true;
                    btnConnect.innerHTML = `<span class="spinner" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> ${i18n.t('ota_btn_connecting')}`;

                    try {
                        await OTASyncManager.joinSession(cleanCode, onGuestUpdate);
                        currentRoomCode = cleanCode;
                    } catch (e) {
                        showToast(e.message || i18n.t('ota_join_error'), "error");
                        btnConnect.disabled = false;
                        btnConnect.innerHTML = i18n.t('ota_btn_connect');
                    }
                };

                btnConnect.onclick = () => doJoin(joinInput.value);

                joinInput.onkeydown = (e) => {
                    if (e.key === 'Enter') doJoin(joinInput.value);
                };

                // Camera Scanner Handler
                btnToggleScanner.onclick = () => {
                    if (!window.Html5Qrcode) {
                        showToast(i18n.t('ota_camera_unavailable'), "error");
                        return;
                    }
                    scannerWrapper.style.display = 'block';
                    html5QrScanner = new window.Html5Qrcode("ota-scanner-view");
                    html5QrScanner.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 220, height: 220 } },
                        (scannedText) => {
                            let text = (scannedText || '').trim();
                            if (text.startsWith('DRAFTSYNC:')) text = text.replace('DRAFTSYNC:', '').trim();
                            else if (text.startsWith('BEERDEX-OTA:')) text = text.replace('BEERDEX-OTA:', '').trim();
                            if (text.length === 6) {
                                joinInput.value = text.toUpperCase();
                                stopScanner();
                                scannerWrapper.style.display = 'none';
                                doJoin(text);
                            }
                        },
                        () => {}
                    ).catch(err => {
                        console.error(err);
                        showToast(i18n.t('ota_camera_denied'), "error");
                        scannerWrapper.style.display = 'none';
                    });
                };

                btnStopScanner.onclick = () => {
                    stopScanner();
                    scannerWrapper.style.display = 'none';
                };

            } else {
                // Connected to Host
                const isBilateral = hostSyncMode === 'bilateral';

                contentContainer.innerHTML = `
                    <div style="${sec};background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.3);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--accent-gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">
                            ${i18n.t('ota_connected_badge', { code: `<strong>${currentRoomCode}</strong>` })}
                        </div>
                        <div style="font-size:0.85rem;color:#eee;font-weight:600;margin-bottom:4px;">
                            ${isBilateral ? i18n.t('ota_mode_bilateral') : i18n.t('ota_mode_unilateral')}
                        </div>
                        <div style="font-size:0.72rem;color:#aaa;">
                            ${isBilateral 
                                ? i18n.t('ota_bilateral_exchange_desc')
                                : i18n.t('ota_unilateral_exchange_desc')}
                        </div>
                    </div>

                    ${isBilateral ? `
                        <!-- What guest exports to host (Bilateral only) -->
                        <div style="${sec}">
                            ${secHead('📤', i18n.t('ota_guest_export_scope_label'))}
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                                ${Object.keys(hostScopes).map(k => {
                                    const allowed = hostAllowedScopes[k] !== false;
                                    return `
                                        <label style="display:flex;align-items:center;gap:6px;font-size:0.76rem;color:${allowed ? '#ddd' : '#555'};cursor:${allowed ? 'pointer' : 'not-allowed'};">
                                            <input type="checkbox" class="cb-guest-export" data-key="${k}" ${guestExportScopes[k] && allowed ? 'checked' : ''} ${!allowed ? 'disabled' : ''} style="accent-color:var(--accent-gold);">
                                            <span>${scopeLabels[k] || k}</span>
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Reception Mode (Merge vs Overwrite) -->
                    <div style="${sec}">
                        ${secHead('⚙️', i18n.t('ota_reception_label'))}
                        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
                            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
                                <input type="radio" name="guestReceptionMode" value="merge" ${!guestOverwriteMode?'checked':''} style="margin-top:2px;accent-color:var(--accent-gold);">
                                <div>
                                    <div style="font-size:0.82rem;color:#eee;">${i18n.t('ota_reception_merge')}</div>
                                </div>
                            </label>
                            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
                                <input type="radio" name="guestReceptionMode" value="overwrite" ${guestOverwriteMode?'checked':''} style="margin-top:2px;accent-color:var(--accent-gold);">
                                <div>
                                    <div style="font-size:0.82rem;color:#eee;">${i18n.t('ota_reception_overwrite')}</div>
                                </div>
                            </label>
                        </div>

                        ${secHead('📥', i18n.t('ota_reception_scope_label'))}
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            ${Object.keys(hostScopes).map(k => {
                                const allowed = hostAllowedScopes[k] !== false;
                                return `
                                    <label style="display:flex;align-items:center;gap:6px;font-size:0.76rem;color:${allowed ? '#ddd' : '#555'};cursor:${allowed ? 'pointer' : 'not-allowed'};">
                                        <input type="checkbox" class="cb-guest-import" data-key="${k}" ${guestImportScopes[k] && allowed ? 'checked' : ''} ${!allowed ? 'disabled' : ''} style="accent-color:var(--accent-gold);">
                                        <span>${scopeLabels[k] || k}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Waiting Status Card -->
                    <div style="padding:14px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <span class="spinner" style="width:16px;height:16px;"></span>
                        <span style="font-size:0.82rem;color:var(--accent-gold);">${i18n.t('ota_waiting_host')}</span>
                    </div>
                `;

                // Bind Guest Export Checkboxes
                contentContainer.querySelectorAll('.cb-guest-export').forEach(cb => {
                    cb.onchange = (e) => {
                        const key = e.target.dataset.key;
                        guestExportScopes[key] = e.target.checked;
                    };
                });

                // Bind Guest Reception Mode Radio
                contentContainer.querySelectorAll('input[name="guestReceptionMode"]').forEach(rb => {
                    rb.onchange = (e) => {
                        guestOverwriteMode = e.target.value === 'overwrite';
                    };
                });

                // Bind Guest Import Checkboxes
                contentContainer.querySelectorAll('.cb-guest-import').forEach(cb => {
                    cb.onchange = (e) => {
                        const key = e.target.dataset.key;
                        guestImportScopes[key] = e.target.checked;
                    };
                });
            }
        }
    };

    // Auto-create host session if starting on host tab
    const initHostSession = async () => {
        if (!currentRoomCode) {
            try {
                await OTASyncManager.createSession(hostScopes, hostSyncMode, onHostUpdate);
            } catch (e) {
                showToast(e.message || i18n.t('ota_sync_error'), "error");
            }
        }
    };

    if (activeTab === 'host') {
        initHostSession();
    } else if (autoConnectCode) {
        setTimeout(async () => {
            try {
                await OTASyncManager.joinSession(autoConnectCode, onGuestUpdate);
                currentRoomCode = autoConnectCode;
                renderContent();
            } catch (e) {
                showToast(e.message || i18n.t('ota_join_error'), "error");
            }
        }, 150);
    }

    renderContent();
    openModal(wrapper);
}
