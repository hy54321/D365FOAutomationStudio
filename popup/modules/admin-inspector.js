import { escapeHtml } from './utils.js';

// Admin Inspector Module - Quick-trigger D365 page inspection tools
// Replaces manual console script execution with one-click admin buttons

export const adminInspectorMethods = {
    adminInspectorLastResult: null,

    initAdminInspector() {
        // Button click handlers
        document.getElementById('adminScanPage')?.addEventListener('click', () => this.runAdminInspection('scanPage'));
        document.getElementById('adminOpenForms')?.addEventListener('click', () => this.runAdminInspection('openForms'));
        document.getElementById('adminBatchDialog')?.addEventListener('click', () => this.runAdminInspection('batchDialog'));
        document.getElementById('adminRecurrenceDialog')?.addEventListener('click', () => this.runAdminInspection('recurrenceDialog'));
        document.getElementById('adminFilterDialog')?.addEventListener('click', () => this.runAdminInspection('filterDialog'));
        document.getElementById('adminFormTabs')?.addEventListener('click', () => this.runAdminInspection('formTabs'));
        document.getElementById('adminActiveTab')?.addEventListener('click', () => this.runAdminInspection('activeTab'));
        document.getElementById('adminActionPaneTabs')?.addEventListener('click', () => this.runAdminInspection('actionPaneTabs'));
        document.getElementById('adminFormInputs')?.addEventListener('click', () => this.runAdminInspection('formInputs'));
        document.getElementById('adminGenerateSteps')?.addEventListener('click', () => this.runAdminInspection('generateSteps'));
        document.getElementById('adminGridState')?.addEventListener('click', () => this.runAdminInspection('gridState'));

        // Copy buttons
        document.getElementById('adminCopyJson')?.addEventListener('click', () => this.copyAdminResults('json'));
        document.getElementById('adminCopyForAI')?.addEventListener('click', () => this.copyAdminResults('ai'));
        document.getElementById('adminClearResults')?.addEventListener('click', () => this.clearAdminResults());

        // Collapsible toggle
        document.getElementById('adminToolsToggle')?.addEventListener('click', () => {
            const panel = document.getElementById('adminToolsPanel');
            const toggle = document.getElementById('adminToolsToggle');
            if (panel && toggle) {
                panel.classList.toggle('collapsed');
                toggle.textContent = panel.classList.contains('collapsed') ? '▶ Admin Tools' : '▼ Admin Tools';
            }
        });
    },

    async runAdminInspection(inspectionType) {
        const tab = await this.getLinkedOrActiveTab();
        if (!tab) {
            this.showNotification('No D365FO tab connected', 'error');
            return;
        }

        // Get optional form name for formInputs inspection
        let formName = null;
        if (inspectionType === 'formInputs') {
            const formFilter = document.getElementById('formFilter');
            formName = (formFilter && formFilter.value !== 'all') ? formFilter.value : null;
        }

        // Show loading state
        const resultsPanel = document.getElementById('adminResultsContent');
        if (resultsPanel) {
            resultsPanel.innerHTML = '<div class="admin-loading">⏳ Running inspection...</div>';
        }
        document.getElementById('adminResultsPanel')?.classList.remove('is-hidden');

        // Disable the button briefly
        const btnId = {
            scanPage: 'adminScanPage',
            openForms: 'adminOpenForms',
            batchDialog: 'adminBatchDialog',
            recurrenceDialog: 'adminRecurrenceDialog',
            filterDialog: 'adminFilterDialog',
            formTabs: 'adminFormTabs',
            activeTab: 'adminActiveTab',
            actionPaneTabs: 'adminActionPaneTabs',
            formInputs: 'adminFormInputs',
            generateSteps: 'adminGenerateSteps',
            gridState: 'adminGridState'
        }[inspectionType];
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            setTimeout(() => { btn.disabled = false; }, 3000);
        }

        try {
            await this.chrome.tabs.sendMessage(tab.id, {
                action: 'adminInspect',
                inspectionType: inspectionType,
                formName: formName
            });
        } catch (e) {
            this.showNotification('Failed to run inspection: ' + e.message, 'error');
            if (resultsPanel) {
                resultsPanel.innerHTML = '<div class="admin-error">Failed to communicate with D365 page. Make sure the page is loaded.</div>';
            }
        }
    },

    handleAdminInspectionResult(result) {
        this.adminInspectorLastResult = result;

        const resultsPanel = document.getElementById('adminResultsPanel');
        const resultsContent = document.getElementById('adminResultsContent');
        const resultsTitle = document.getElementById('adminResultsTitle');
        if (!resultsPanel || !resultsContent) return;

        resultsPanel.classList.remove('is-hidden');

        // Set title based on type
        const titles = {
            scanPage: 'Full Page Scan',
            openForms: 'Open Forms & Dialogs',
            batchDialog: 'Batch Dialog',
            recurrenceDialog: 'Recurrence Dialog',
            filterDialog: 'Filter Dialog',
            formTabs: 'Form Tabs',
            activeTab: 'Active Tab Fields',
            actionPaneTabs: 'Action Pane Tabs',
            formInputs: 'Form Inputs',
            generateSteps: 'Generated Steps',
            gridState: 'Grid State'
        };
        if (resultsTitle) {
            resultsTitle.textContent = titles[result.inspectionType] || 'Inspection Result';
        }

        if (!result.success) {
            resultsContent.innerHTML = `<div class="admin-error">${escapeHtml(result.error || 'Inspection failed')}</div>`;
            return;
        }

        // Render results based on type
        const html = this.renderAdminResult(result);
        resultsContent.innerHTML = html;
    },

    renderAdminResult(result) {
        const data = result.data;
        const type = result.inspectionType;

        switch (type) {
            case 'openForms':
                return this.renderOpenForms(data);
            case 'scanPage':
                return this.renderScanPage(data);
            case 'batchDialog':
            case 'recurrenceDialog':
            case 'filterDialog':
                return this.renderDialog(data, type);
            case 'formTabs':
                return this.renderFormTabs(data);
            case 'activeTab':
                return this.renderActiveTab(data);
            case 'actionPaneTabs':
                return this.renderActionPaneTabs(data);
            case 'formInputs':
                return this.renderFormInputs(data);
            case 'generateSteps':
                return this.renderGeneratedSteps(data);
            case 'gridState':
                return this.renderGridState(data);
            default:
                return `<pre class="admin-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }
    },

    renderOpenForms(data) {
        if (!data.forms || data.forms.length === 0) {
            return '<div class="admin-empty">No forms detected on the page.</div>';
        }
        let html = `<div class="admin-section">
            <div class="admin-stat">URL: <strong>${escapeHtml(data.currentUrl?.menuItem || data.currentUrl?.full || '-')}</strong></div>
            <div class="admin-stat">Company: <strong>${escapeHtml(data.currentUrl?.company || '-')}</strong></div>
        </div>`;
        html += '<div class="admin-section"><h4>Forms</h4><table class="admin-table"><tr><th>Form Name</th><th>Type</th><th>Visible</th></tr>';
        data.forms.forEach(f => {
            const typeClass = f.isDialog ? 'admin-tag-dialog' : 'admin-tag-form';
            html += `<tr>
                <td><code>${escapeHtml(f.formName)}</code></td>
                <td><span class="admin-tag ${typeClass}">${f.isDialog ? 'Dialog' : 'Form'}</span></td>
                <td>${f.isVisible ? '✓' : '—'}</td>
            </tr>`;
        });
        html += '</table></div>';
        if (data.dialogStack && data.dialogStack.length) {
            html += '<div class="admin-section"><h4>Dialog Stack (top-to-bottom)</h4><ol class="admin-list">';
            data.dialogStack.forEach(d => { html += `<li><code>${escapeHtml(d)}</code></li>`; });
            html += '</ol></div>';
        }
        return html;
    },

    renderScanPage(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Menu Item: <strong>${escapeHtml(data.url?.menuItem || '-')}</strong></div>
            <div class="admin-stat">Company: <strong>${escapeHtml(data.url?.company || '-')}</strong></div>
            <div class="admin-stat">Forms found: <strong>${data.forms?.length || 0}</strong></div>
        </div>`;

        if (data.byForm) {
            Object.entries(data.byForm).forEach(([formName, formData]) => {
                html += `<div class="admin-section"><h4>${escapeHtml(formName)}</h4>`;
                const counts = [];
                if (formData.tabs?.length) counts.push(`${formData.tabs.length} tabs`);
                if (formData.buttons?.length) counts.push(`${formData.buttons.length} buttons`);
                if (formData.inputs?.length) counts.push(`${formData.inputs.length} inputs`);
                if (formData.grids?.length) counts.push(`${formData.grids.length} grids`);
                if (formData.sections?.length) counts.push(`${formData.sections.length} sections`);
                html += `<div class="admin-stat">${counts.join(' · ')}</div>`;

                if (formData.inputs?.length) {
                    html += '<div class="admin-subsection"><strong>Inputs:</strong><ul class="admin-compact-list">';
                    formData.inputs.forEach(i => {
                        html += `<li><code>${escapeHtml(i.controlName)}</code> <span class="admin-tag">${escapeHtml(i.role || '')}</span> ${escapeHtml(i.label || '')}</li>`;
                    });
                    html += '</ul></div>';
                }
                if (formData.buttons?.length) {
                    html += '<div class="admin-subsection"><strong>Buttons:</strong><ul class="admin-compact-list">';
                    formData.buttons.forEach(b => {
                        html += `<li><code>${escapeHtml(b.controlName)}</code> ${escapeHtml(b.label || '')}</li>`;
                    });
                    html += '</ul></div>';
                }
                html += '</div>';
            });
        }
        return html;
    },

    renderDialog(data, type) {
        if (!data.dialogFound) {
            const labels = {
                batchDialog: 'batch job dialog',
                recurrenceDialog: 'recurrence dialog',
                filterDialog: 'filter dialog'
            };
            return `<div class="admin-empty">No ${labels[type] || 'dialog'} found. Make sure the dialog is open.</div>`;
        }
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Total controls: <strong>${data.allControls?.length || 0}</strong></div>
        </div>`;

        // Render categorized controls
        const categories = [
            { key: 'inputFields', label: 'Input Fields' },
            { key: 'checkboxes', label: 'Checkboxes' },
            { key: 'comboboxes', label: 'Dropdowns' },
            { key: 'buttons', label: 'Buttons' },
            { key: 'toggles', label: 'Toggles' },
            { key: 'tabs', label: 'Tabs' },
            // Recurrence-specific
            { key: 'startDateTime', label: 'Start Date/Time', isObject: true },
            { key: 'endOptions', label: 'End Options', isObject: true },
            { key: 'pattern', label: 'Pattern', isObject: true },
            // Filter-specific
            { key: 'gridInfo', label: 'Grid', isObject: true },
            { key: 'savedQueries', label: 'Saved Queries', isObject: true }
        ];

        categories.forEach(cat => {
            const items = data[cat.key];
            if (!items) return;
            if (cat.isObject) {
                if (typeof items === 'object' && Object.keys(items).length > 0) {
                    html += `<div class="admin-subsection"><strong>${cat.label}:</strong><pre class="admin-json-sm">${escapeHtml(JSON.stringify(items, null, 2))}</pre></div>`;
                }
            } else if (Array.isArray(items) && items.length > 0) {
                html += `<div class="admin-subsection"><strong>${cat.label} (${items.length}):</strong><ul class="admin-compact-list">`;
                items.forEach(i => {
                    html += `<li><code>${escapeHtml(i.controlName)}</code> <span class="admin-tag">${escapeHtml(i.role || '')}</span> ${escapeHtml(i.label || '')}</li>`;
                });
                html += '</ul></div>';
            }
        });

        return html;
    },

    renderFormTabs(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${escapeHtml(data.activeTab || 'none detected')}</strong></div>
        </div>`;

        if (data.tabs?.length) {
            html += '<table class="admin-table"><tr><th>#</th><th>Control Name</th><th>Label</th><th>Active</th></tr>';
            data.tabs.forEach((tab, i) => {
                const active = tab.isActive ? '<span class="admin-tag admin-tag-active">ACTIVE</span>' : '';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><code>${escapeHtml(tab.controlName)}</code></td>
                    <td>${escapeHtml(tab.label || '')}</td>
                    <td>${active}</td>
                </tr>`;
            });
            html += '</table>';
        }
        return html;
    },

    renderActiveTab(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${escapeHtml(data.activeTab || '-')}</strong></div>
        </div>`;

        // Sections
        if (data.sections?.length) {
            html += '<div class="admin-subsection"><strong>Sections (FastTabs):</strong><ul class="admin-compact-list">';
            data.sections.forEach(s => {
                const icon = s.isExpanded ? '▼' : '▶';
                html += `<li>${icon} <code>${escapeHtml(s.controlName)}</code> ${escapeHtml(s.label || '')}</li>`;
            });
            html += '</ul></div>';
        }

        // Fields by category
        const fieldGroups = [
            { key: 'inputs', label: 'Input Fields', icon: '📝' },
            { key: 'checkboxes', label: 'Checkboxes', icon: '☑️' },
            { key: 'comboboxes', label: 'Dropdowns', icon: '📋' },
            { key: 'integers', label: 'Number Fields', icon: '🔢' },
            { key: 'dates', label: 'Date/Time Fields', icon: '📅' }
        ];

        fieldGroups.forEach(group => {
            const items = data.fields?.[group.key];
            if (items?.length) {
                html += `<div class="admin-subsection"><strong>${group.icon} ${group.label} (${items.length}):</strong><ul class="admin-compact-list">`;
                items.forEach(f => {
                    html += `<li><code>${escapeHtml(f.controlName)}</code> ${escapeHtml(f.label || '')}</li>`;
                });
                html += '</ul></div>';
            }
        });

        // Summary
        if (data.summary) {
            html += '<div class="admin-subsection"><strong>Summary:</strong><div class="admin-stat">';
            html += Object.entries(data.summary).map(([k, v]) => `${k}: ${v}`).join(' · ');
            html += '</div></div>';
        }

        return html;
    },

    renderActionPaneTabs(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${escapeHtml(data.activeTab || 'none detected')}</strong></div>
        </div>`;

        if (data.tabs?.length) {
            html += '<table class="admin-table"><tr><th>#</th><th>Control Name</th><th>Label</th><th>Active</th></tr>';
            data.tabs.forEach((tab, i) => {
                const active = tab.isActive ? '<span class="admin-tag admin-tag-active">ACTIVE</span>' : '';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><code>${escapeHtml(tab.controlName)}</code></td>
                    <td>${escapeHtml(tab.label || '')}</td>
                    <td>${active}</td>
                </tr>`;
            });
            html += '</table>';
        } else {
            html += '<div class="admin-empty">No action pane tabs found.</div>';
        }
        return html;
    },

    renderFormInputs(data) {
        if (!data) return '<div class="admin-empty">Form not found.</div>';
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Total inputs: <strong>${data.inputs?.length || 0}</strong></div>
        </div>`;

        const groups = [
            { key: 'checkboxes', label: 'Checkboxes' },
            { key: 'comboboxes', label: 'Dropdowns' },
            { key: 'radioButtons', label: 'Radio Buttons' },
            { key: 'dateFields', label: 'Date Fields' },
            { key: 'timeFields', label: 'Time Fields' },
            { key: 'integerFields', label: 'Integer/Real Fields' },
            { key: 'stringFields', label: 'String/Input Fields' }
        ];

        groups.forEach(group => {
            const items = data[group.key];
            if (items?.length) {
                html += `<div class="admin-subsection"><strong>${group.label} (${items.length}):</strong><ul class="admin-compact-list">`;
                items.forEach(f => {
                    html += `<li><code>${escapeHtml(f.controlName)}</code> <span class="admin-tag">${escapeHtml(f.role || '')}</span> ${escapeHtml(f.label || '')}</li>`;
                });
                html += '</ul></div>';
            }
        });

        return html;
    },

    renderGeneratedSteps(data) {
        if (!data || !data.steps?.length) {
            return '<div class="admin-empty">No steps generated. Make sure you are on a tab with visible fields.</div>';
        }
        let html = `<div class="admin-section">
            <div class="admin-stat">Tab: <strong>${escapeHtml(data.activeTab || '-')}</strong></div>
            <div class="admin-stat">Steps generated: <strong>${data.steps.length}</strong></div>
        </div>`;
        html += '<table class="admin-table"><tr><th>#</th><th>Type</th><th>Control</th><th>Label</th></tr>';
        data.steps.forEach((step, i) => {
            html += `<tr>
                <td>${i + 1}</td>
                <td><span class="admin-tag">${escapeHtml(step.type)}</span></td>
                <td><code>${escapeHtml(step.controlName)}</code></td>
                <td>${escapeHtml(step.displayText || '')}</td>
            </tr>`;
        });
        html += '</table>';
        return html;
    },

    renderGridState(data) {
        if (!data || !data.grids?.length) {
            return '<div class="admin-empty">No grids detected on the page.</div>';
        }
        let html = `<div class="admin-section">
            <div class="admin-stat">Grids found: <strong>${data.gridCount}</strong></div>
            <div class="admin-stat">Pending new row marker: <strong>${data.pendingNewRow ? 'Yes (row ' + (data.pendingNewRowData?.rowIndex ?? '?') + ')' : 'No'}</strong></div>
        </div>`;
        data.grids.forEach((g, gi) => {
            html += `<div class="admin-section"><h4>Grid ${gi + 1}: ${escapeHtml(g.type)}${g.controlName ? ' (' + escapeHtml(g.controlName) + ')' : ''}</h4>`;
            html += `<div class="admin-stat">Total rows: <strong>${g.totalRows}</strong> | Selected: <strong>[${g.selectedRows?.join(', ') || 'none'}]</strong>`;
            if (g.activeRows) html += ` | Active: <strong>[${g.activeRows.join(', ') || 'none'}]</strong>`;
            html += '</div>';
            html += '<table class="admin-table"><tr><th>Row</th><th>State</th><th>Controls (first 5)</th></tr>';
            g.rows?.forEach(r => {
                const flags = [];
                if (r.isSelected) flags.push('<span class="admin-tag admin-tag-dialog">SELECTED</span>');
                if (r.isActive) flags.push('<span class="admin-tag">ACTIVE</span>');
                if (r.hasInput) flags.push('<span class="admin-tag admin-tag-form">HAS_INPUT</span>');
                const controlsText = r.cellControls?.slice(0, 5).join(', ') || '-';
                const moreText = r.cellControls?.length > 5 ? ` (+${r.cellControls.length - 5} more)` : '';
                html += `<tr><td>${r.index}</td><td>${flags.join(' ') || '-'}</td><td><code>${escapeHtml(controlsText + moreText)}</code></td></tr>`;
            });
            html += '</table></div>';
        });
        return html;
    },

    async copyAdminResults(format) {
        const result = this.adminInspectorLastResult;
        if (!result || !result.data) {
            this.showNotification('No results to copy', 'error');
            return;
        }

        let text;
        if (format === 'json') {
            text = JSON.stringify(result.data, null, 2);
        } else {
            // AI-optimized format - structured summary
            text = this.formatResultForAI(result);
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showNotification(`Results copied (${format === 'json' ? 'JSON' : 'AI format'})`, 'success');
        } catch (e) {
            // Fallback: select text in results panel
            this.showNotification('Copy failed, select text manually', 'error');
        }
    },

    formatResultForAI(result) {
        const data = result.data;
        const type = result.inspectionType;
        const lines = [];

        lines.push(`=== D365 Inspection: ${type} ===`);
        lines.push(`Timestamp: ${new Date().toISOString()}`);
        lines.push('');

        switch (type) {
            case 'openForms':
                lines.push(`URL Menu Item: ${data.currentUrl?.menuItem || '-'}`);
                lines.push(`Company: ${data.currentUrl?.company || '-'}`);
                lines.push('');
                lines.push('Open Forms:');
                data.forms?.forEach(f => {
                    lines.push(`  - ${f.formName} (${f.isDialog ? 'Dialog' : 'Form'}, visible: ${f.isVisible})`);
                });
                if (data.dialogStack?.length) {
                    lines.push('');
                    lines.push('Dialog Stack (top to bottom):');
                    data.dialogStack.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
                }
                break;

            case 'scanPage':
                lines.push(`Menu Item: ${data.url?.menuItem || '-'}`);
                lines.push(`Company: ${data.url?.company || '-'}`);
                if (data.byForm) {
                    Object.entries(data.byForm).forEach(([formName, formData]) => {
                        lines.push('');
                        lines.push(`Form: ${formName}`);
                        if (formData.inputs?.length) {
                            lines.push('  Inputs:');
                            formData.inputs.forEach(i => lines.push(`    - ${i.controlName} [${i.role}] "${i.label || ''}"`));
                        }
                        if (formData.buttons?.length) {
                            lines.push('  Buttons:');
                            formData.buttons.forEach(b => lines.push(`    - ${b.controlName} "${b.label || ''}"`));
                        }
                        if (formData.tabs?.length) {
                            lines.push('  Tabs:');
                            formData.tabs.forEach(t => lines.push(`    - ${t.controlName} "${t.label || ''}"`));
                        }
                        if (formData.grids?.length) {
                            lines.push('  Grids:');
                            formData.grids.forEach(g => lines.push(`    - ${g.controlName} [${g.role}]`));
                        }
                    });
                }
                break;

            case 'batchDialog':
            case 'recurrenceDialog':
            case 'filterDialog':
                lines.push(`Dialog Found: ${data.dialogFound}`);
                lines.push(`Form Name: ${data.formName || '-'}`);
                lines.push(`Total Controls: ${data.allControls?.length || 0}`);
                lines.push('');
                lines.push('All Controls:');
                data.allControls?.forEach(c => {
                    lines.push(`  - ${c.controlName} [${c.role || ''}] "${c.label || ''}"`);
                });
                break;

            case 'formTabs':
                lines.push(`Form: ${data.formName || '-'}`);
                lines.push(`Active Tab: ${data.activeTab || 'none'}`);
                lines.push('');
                lines.push('Tabs:');
                data.tabs?.forEach((t, i) => {
                    lines.push(`  ${i + 1}. ${t.controlName} - "${t.label || ''}"${t.isActive ? ' [ACTIVE]' : ''}`);
                });
                break;

            case 'activeTab':
                lines.push(`Form: ${data.formName || '-'}`);
                lines.push(`Active Tab: ${data.activeTab || '-'}`);
                if (data.sections?.length) {
                    lines.push('');
                    lines.push('Sections:');
                    data.sections.forEach(s => lines.push(`  ${s.isExpanded ? '▼' : '▶'} ${s.controlName} "${s.label || ''}"`));
                }
                if (data.fields) {
                    Object.entries(data.fields).forEach(([key, items]) => {
                        if (items?.length) {
                            lines.push('');
                            lines.push(`${key}:`);
                            items.forEach(f => lines.push(`  - ${f.controlName} "${f.label || ''}"`));
                        }
                    });
                }
                break;

            case 'actionPaneTabs':
                lines.push(`Form: ${data.formName || '-'}`);
                lines.push(`Active Tab: ${data.activeTab || 'none'}`);
                lines.push('');
                lines.push('Action Pane Tabs:');
                data.tabs?.forEach((t, i) => {
                    lines.push(`  ${i + 1}. ${t.controlName} - "${t.label || ''}"${t.isActive ? ' [ACTIVE]' : ''}`);
                });
                break;

            case 'formInputs':
                lines.push(`Form: ${data.formName || '-'}`);
                lines.push(`Total Inputs: ${data.inputs?.length || 0}`);
                const groups = ['checkboxes', 'comboboxes', 'radioButtons', 'dateFields', 'timeFields', 'integerFields', 'stringFields'];
                groups.forEach(g => {
                    if (data[g]?.length) {
                        lines.push('');
                        lines.push(`${g}:`);
                        data[g].forEach(f => lines.push(`  - ${f.controlName} [${f.role}] "${f.label || ''}"`));
                    }
                });
                break;

            case 'generateSteps':
                lines.push(`Active Tab: ${data.activeTab || '-'}`);
                lines.push(`Steps: ${data.steps?.length || 0}`);
                lines.push('');
                lines.push('Generated Steps:');
                data.steps?.forEach((s, i) => {
                    lines.push(`  ${i + 1}. [${s.type}] ${s.controlName} - "${s.displayText || ''}" value: "${s.value || ''}"`);
                });
                break;

            case 'gridState':
                lines.push(`Grid Count: ${data.gridCount || 0}`);
                lines.push(`Pending New Row: ${data.pendingNewRow ? 'Yes' : 'No'}`);
                if (data.pendingNewRowData) {
                    lines.push(`  Row Index: ${data.pendingNewRowData.rowIndex}`);
                    lines.push(`  Timestamp: ${new Date(data.pendingNewRowData.timestamp).toISOString()}`);
                }
                data.grids?.forEach((g, gi) => {
                    lines.push('');
                    lines.push(`Grid ${gi + 1} (${g.type}${g.controlName ? ' - ' + g.controlName : ''})`);
                    lines.push(`  Total Rows: ${g.totalRows}`);
                    lines.push(`  Selected Rows: [${g.selectedRows?.join(', ') || 'none'}]`);
                    if (g.activeRows) lines.push(`  Active Rows: [${g.activeRows.join(', ') || 'none'}]`);
                    g.rows?.forEach(r => {
                        const flags = [r.isSelected ? 'SELECTED' : '', r.isActive ? 'ACTIVE' : '', r.hasInput ? 'HAS_INPUT' : ''].filter(Boolean).join(', ');
                        lines.push(`  Row ${r.index}: ${flags || '-'} | Controls: ${r.cellControls?.slice(0, 5).join(', ') || '-'}${r.cellControls?.length > 5 ? '...' : ''}`);
                    });
                });
                break;

            default:
                lines.push(JSON.stringify(data, null, 2));
        }

        return lines.join('\n');
    },

    clearAdminResults() {
        this.adminInspectorLastResult = null;
        const resultsPanel = document.getElementById('adminResultsPanel');
        const resultsContent = document.getElementById('adminResultsContent');
        if (resultsPanel) resultsPanel.classList.add('is-hidden');
        if (resultsContent) resultsContent.innerHTML = '';
    }
};


