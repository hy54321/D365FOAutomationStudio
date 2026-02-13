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
            generateSteps: 'adminGenerateSteps'
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
            generateSteps: 'Generated Steps'
        };
        if (resultsTitle) {
            resultsTitle.textContent = titles[result.inspectionType] || 'Inspection Result';
        }

        if (!result.success) {
            resultsContent.innerHTML = `<div class="admin-error">${this.escapeHtml(result.error || 'Inspection failed')}</div>`;
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
            default:
                return `<pre class="admin-json">${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }
    },

    renderOpenForms(data) {
        if (!data.forms || data.forms.length === 0) {
            return '<div class="admin-empty">No forms detected on the page.</div>';
        }
        let html = `<div class="admin-section">
            <div class="admin-stat">URL: <strong>${this.escapeHtml(data.currentUrl?.menuItem || data.currentUrl?.full || '-')}</strong></div>
            <div class="admin-stat">Company: <strong>${this.escapeHtml(data.currentUrl?.company || '-')}</strong></div>
        </div>`;
        html += '<div class="admin-section"><h4>Forms</h4><table class="admin-table"><tr><th>Form Name</th><th>Type</th><th>Visible</th></tr>';
        data.forms.forEach(f => {
            const typeClass = f.isDialog ? 'admin-tag-dialog' : 'admin-tag-form';
            html += `<tr>
                <td><code>${this.escapeHtml(f.formName)}</code></td>
                <td><span class="admin-tag ${typeClass}">${f.isDialog ? 'Dialog' : 'Form'}</span></td>
                <td>${f.isVisible ? '✓' : '—'}</td>
            </tr>`;
        });
        html += '</table></div>';
        if (data.dialogStack && data.dialogStack.length) {
            html += '<div class="admin-section"><h4>Dialog Stack (top-to-bottom)</h4><ol class="admin-list">';
            data.dialogStack.forEach(d => { html += `<li><code>${this.escapeHtml(d)}</code></li>`; });
            html += '</ol></div>';
        }
        return html;
    },

    renderScanPage(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Menu Item: <strong>${this.escapeHtml(data.url?.menuItem || '-')}</strong></div>
            <div class="admin-stat">Company: <strong>${this.escapeHtml(data.url?.company || '-')}</strong></div>
            <div class="admin-stat">Forms found: <strong>${data.forms?.length || 0}</strong></div>
        </div>`;

        if (data.byForm) {
            Object.entries(data.byForm).forEach(([formName, formData]) => {
                html += `<div class="admin-section"><h4>${this.escapeHtml(formName)}</h4>`;
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
                        html += `<li><code>${this.escapeHtml(i.controlName)}</code> <span class="admin-tag">${this.escapeHtml(i.role || '')}</span> ${this.escapeHtml(i.label || '')}</li>`;
                    });
                    html += '</ul></div>';
                }
                if (formData.buttons?.length) {
                    html += '<div class="admin-subsection"><strong>Buttons:</strong><ul class="admin-compact-list">';
                    formData.buttons.forEach(b => {
                        html += `<li><code>${this.escapeHtml(b.controlName)}</code> ${this.escapeHtml(b.label || '')}</li>`;
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
            <div class="admin-stat">Form: <strong>${this.escapeHtml(data.formName || '-')}</strong></div>
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
                    html += `<div class="admin-subsection"><strong>${cat.label}:</strong><pre class="admin-json-sm">${this.escapeHtml(JSON.stringify(items, null, 2))}</pre></div>`;
                }
            } else if (Array.isArray(items) && items.length > 0) {
                html += `<div class="admin-subsection"><strong>${cat.label} (${items.length}):</strong><ul class="admin-compact-list">`;
                items.forEach(i => {
                    html += `<li><code>${this.escapeHtml(i.controlName)}</code> <span class="admin-tag">${this.escapeHtml(i.role || '')}</span> ${this.escapeHtml(i.label || '')}</li>`;
                });
                html += '</ul></div>';
            }
        });

        return html;
    },

    renderFormTabs(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${this.escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${this.escapeHtml(data.activeTab || 'none detected')}</strong></div>
        </div>`;

        if (data.tabs?.length) {
            html += '<table class="admin-table"><tr><th>#</th><th>Control Name</th><th>Label</th><th>Active</th></tr>';
            data.tabs.forEach((tab, i) => {
                const active = tab.isActive ? '<span class="admin-tag admin-tag-active">ACTIVE</span>' : '';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><code>${this.escapeHtml(tab.controlName)}</code></td>
                    <td>${this.escapeHtml(tab.label || '')}</td>
                    <td>${active}</td>
                </tr>`;
            });
            html += '</table>';
        }
        return html;
    },

    renderActiveTab(data) {
        let html = `<div class="admin-section">
            <div class="admin-stat">Form: <strong>${this.escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${this.escapeHtml(data.activeTab || '-')}</strong></div>
        </div>`;

        // Sections
        if (data.sections?.length) {
            html += '<div class="admin-subsection"><strong>Sections (FastTabs):</strong><ul class="admin-compact-list">';
            data.sections.forEach(s => {
                const icon = s.isExpanded ? '▼' : '▶';
                html += `<li>${icon} <code>${this.escapeHtml(s.controlName)}</code> ${this.escapeHtml(s.label || '')}</li>`;
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
                    html += `<li><code>${this.escapeHtml(f.controlName)}</code> ${this.escapeHtml(f.label || '')}</li>`;
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
            <div class="admin-stat">Form: <strong>${this.escapeHtml(data.formName || '-')}</strong></div>
            <div class="admin-stat">Active tab: <strong>${this.escapeHtml(data.activeTab || 'none detected')}</strong></div>
        </div>`;

        if (data.tabs?.length) {
            html += '<table class="admin-table"><tr><th>#</th><th>Control Name</th><th>Label</th><th>Active</th></tr>';
            data.tabs.forEach((tab, i) => {
                const active = tab.isActive ? '<span class="admin-tag admin-tag-active">ACTIVE</span>' : '';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><code>${this.escapeHtml(tab.controlName)}</code></td>
                    <td>${this.escapeHtml(tab.label || '')}</td>
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
            <div class="admin-stat">Form: <strong>${this.escapeHtml(data.formName || '-')}</strong></div>
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
                    html += `<li><code>${this.escapeHtml(f.controlName)}</code> <span class="admin-tag">${this.escapeHtml(f.role || '')}</span> ${this.escapeHtml(f.label || '')}</li>`;
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
            <div class="admin-stat">Tab: <strong>${this.escapeHtml(data.activeTab || '-')}</strong></div>
            <div class="admin-stat">Steps generated: <strong>${data.steps.length}</strong></div>
        </div>`;
        html += '<table class="admin-table"><tr><th>#</th><th>Type</th><th>Control</th><th>Label</th></tr>';
        data.steps.forEach((step, i) => {
            html += `<tr>
                <td>${i + 1}</td>
                <td><span class="admin-tag">${this.escapeHtml(step.type)}</span></td>
                <td><code>${this.escapeHtml(step.controlName)}</code></td>
                <td>${this.escapeHtml(step.displayText || '')}</td>
            </tr>`;
        });
        html += '</table>';
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
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
};
