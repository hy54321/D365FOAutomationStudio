export const workflowMethods = {
    async initBuilderPanels() {
        if (this._builderPanelsInitialized) {
            this.applyBuilderPanelState();
            this.refreshInterruptionHandlersPanelHeight();
            return;
        }

        const result = await this.chrome.storage.local.get(['builderPanelState']);
        this.builderPanelState = (result?.builderPanelState && typeof result.builderPanelState === 'object')
            ? result.builderPanelState
            : {};

        const panels = Array.from(document.querySelectorAll('.builder-panel[data-panel-key]'));
        panels.forEach((panel) => {
            const key = panel.getAttribute('data-panel-key');
            const header = panel.querySelector('.workflow-projects-header');
            if (!key || !header) return;
            if (!header.classList.contains('builder-panel-header-clickable')) {
                header.classList.add('builder-panel-header-clickable');
                header.setAttribute('role', 'button');
                header.setAttribute('tabindex', '0');
                header.addEventListener('click', () => {
                    const nextCollapsed = !panel.classList.contains('is-collapsed');
                    this.setBuilderPanelCollapsed(key, nextCollapsed, true);
                });
                header.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const nextCollapsed = !panel.classList.contains('is-collapsed');
                    this.setBuilderPanelCollapsed(key, nextCollapsed, true);
                });
            }
        });

        if (!this._builderPanelsResizeBound) {
            window.addEventListener('resize', () => this.refreshInterruptionHandlersPanelHeight());
            this._builderPanelsResizeBound = true;
        }

        this._builderPanelsInitialized = true;
        this.applyBuilderPanelState();
        this.refreshInterruptionHandlersPanelHeight();
    },

    applyBuilderPanelState() {
        const panels = Array.from(document.querySelectorAll('.builder-panel[data-panel-key]'));
        panels.forEach((panel) => {
            const key = panel.getAttribute('data-panel-key');
            if (!key) return;
            const collapsed = !!this.builderPanelState?.[key];
            this.setBuilderPanelCollapsed(key, collapsed, false);
        });
    },

    setBuilderPanelCollapsed(key, collapsed, persist = true) {
        const panel = document.querySelector(`.builder-panel[data-panel-key="${key}"]`);
        if (!panel) return;

        panel.classList.toggle('is-collapsed', !!collapsed);
        const header = panel.querySelector('.workflow-projects-header');
        if (header) {
            const expanded = !collapsed;
            header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            header.title = expanded ? 'Click to collapse panel' : 'Click to expand panel';
        }

        this.builderPanelState = this.builderPanelState || {};
        this.builderPanelState[key] = !!collapsed;

        if (persist) {
            this.chrome.storage.local.set({ builderPanelState: this.builderPanelState }).catch(() => {});
        }

        if (key === 'interruption-handlers') {
            this.refreshInterruptionHandlersPanelHeight();
        }
    },

    refreshInterruptionHandlersPanelHeight() {
        const panel = document.getElementById('workflowInterruptionHandlersPanel');
        const list = document.getElementById('interruptionHandlersList');
        const builderTab = document.getElementById('builder-tab');
        if (!panel || !list || !builderTab) return;

        if (panel.classList.contains('is-collapsed')) {
            list.style.removeProperty('--interruption-list-max-height');
            return;
        }

        if (!builderTab.classList.contains('active')) return;

        const rect = list.getBoundingClientRect();
        const available = Math.floor(window.innerHeight - rect.top - 16);
        const maxHeight = Math.max(220, available);
        list.style.setProperty('--interruption-list-max-height', `${maxHeight}px`);
    },

    handleDirectBuilderTabAccess() {
        this.currentWorkflow = null;
        this.currentStep = null;
        this.originalWorkflowState = null;

        const workflowName = document.getElementById('workflowName');
        if (workflowName) workflowName.value = '';

        const stepType = document.getElementById('stepType');
        if (stepType) stepType.value = 'click';

        this.displaySteps();
        if (this.renderWorkflowProjects) this.renderWorkflowProjects();
        if (this.renderWorkflowConfigurations) this.renderWorkflowConfigurations();
        if (this.renderInterruptionHandlersPanel) this.renderInterruptionHandlersPanel();
    },

    cancelWorkflowChanges() {
        if (this.originalWorkflowState) {
            // Restore original state
            this.currentWorkflow = JSON.parse(JSON.stringify(this.originalWorkflowState));
            this.loadDataSourcesFromWorkflow();
            document.getElementById('workflowName').value = this.currentWorkflow.name;
            this.displaySteps();
            if (this.renderWorkflowProjects) {
                this.renderWorkflowProjects();
            }
            if (this.renderWorkflowConfigurations) {
                this.renderWorkflowConfigurations();
            }
            if (this.renderInterruptionHandlersPanel) {
                this.renderInterruptionHandlersPanel();
            }
            this.showNotification('Changes discarded', 'info');
        }

        // Go back to workflows tab
        document.querySelector('[data-tab="workflows"]').click();
    },

    toggleDataSourcesPanel() {
        const header = document.getElementById('dataSourcesHeader');
        const body = document.getElementById('dataSourcesBody');
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
    },

    createNewWorkflow() {
        this.currentWorkflow = {
            id: Date.now().toString(),
            name: 'New Workflow',
            steps: [],
            projectIds: [],
            configurationIds: [],
            settings: {
                ...this.settings,
                errorDefaultMode: 'fail',
                errorDefaultRetryCount: this.settings?.maxRetries ?? 0,
                errorDefaultRetryDelay: 1000,
                errorDefaultGotoLabel: ''
            }
        };

        // Store original state for cancel functionality
        this.originalWorkflowState = JSON.parse(JSON.stringify(this.currentWorkflow));

        document.getElementById('workflowName').value = this.currentWorkflow.name;
        this.displaySteps();
        this.loadWorkflowDefaultsUI();

        if (this.renderWorkflowProjects) {
            this.renderWorkflowProjects();
        }
        if (this.renderWorkflowConfigurations) {
            this.renderWorkflowConfigurations();
        }
        if (this.renderInterruptionHandlersPanel) {
            this.renderInterruptionHandlersPanel();
        }

        // Switch to builder tab
        document.querySelector('[data-tab="builder"]').click();
    },

    async loadWorkflows() {
        const result = await this.chrome.storage.local.get(['workflows']);
        this.workflows = result.workflows || [];
        this.displayWorkflows();
        if (this.updateNavButtonsWorkflowOptions) {
            this.updateNavButtonsWorkflowOptions();
        }
        if (this.renderProjectsManager) {
            this.renderProjectsManager();
        }
        if (this.renderConfigurationsManager) {
            this.renderConfigurationsManager();
        }
        if (this.renderInterruptionHandlersPanel) {
            this.renderInterruptionHandlersPanel();
        }
    },

    async loadResumeState() {
        const result = await this.chrome.storage.local.get(['resumeSkipByWorkflow']);
        this.resumeSkipByWorkflow = result.resumeSkipByWorkflow || {};
    },
    async saveWorkflow() {
        if (!this.currentWorkflow) return;

        this.currentWorkflow.name = document.getElementById('workflowName').value;
        if (this.syncCurrentWorkflowProjectsFromUI) {
            this.syncCurrentWorkflowProjectsFromUI();
        }
        if (this.syncCurrentWorkflowConfigurationsFromUI) {
            this.syncCurrentWorkflowConfigurationsFromUI();
        }
        delete this.currentWorkflow.dataSources;
        delete this.currentWorkflow.dataSource;

        this.saveWorkflowDefaultsFromUI();

        // Update or add workflow
        const existingIndex = this.workflows.findIndex(w => w.id === this.currentWorkflow.id);
        if (existingIndex >= 0) {
            this.workflows[existingIndex] = this.currentWorkflow;
        } else {
            this.workflows.push(this.currentWorkflow);
        }

        const configurationOrderChanged = this.syncConfigurationOrderForWorkflow
            ? this.syncConfigurationOrderForWorkflow(this.currentWorkflow)
            : false;

        await this.chrome.storage.local.set(configurationOrderChanged
            ? { workflows: this.workflows, configurations: this.configurations }
            : { workflows: this.workflows });
        this.displayWorkflows();
        if (this.updateNavButtonsWorkflowOptions) {
            this.updateNavButtonsWorkflowOptions();
        }
        if (this.renderNavButtons) {
            this.renderNavButtons();
        }
        if (this.renderProjectsManager) {
            this.renderProjectsManager();
        }
        if (this.renderConfigurationsManager) {
            this.renderConfigurationsManager();
        }

        const steps = this.currentWorkflow.steps || [];
        const hasOpenInNewTabWithFollowingSteps = steps.some((step, index) =>
            step?.type === 'navigate' &&
            !!step?.openInNewTab &&
            index < (steps.length - 1)
        );

        if (hasOpenInNewTabWithFollowingSteps) {
            this.showNotification('This workflow contains "Navigate to Form" steps with "Open in new tab". Following steps continue on the current tab.', 'warning');
        }

        this.showNotification('Workflow saved successfully!', 'success');
    },
    displayWorkflows() {
        const container = document.getElementById('workflowsList');
        container.innerHTML = '';

        const workflows = this.getFilteredWorkflows ? this.getFilteredWorkflows() : this.workflows;
        const isConfigOrderMode = !!(this.selectedConfigurationId && this.selectedConfigurationId !== 'all' && this.selectedConfigurationId !== 'unassigned');

        if (this.workflows.length === 0) {
            container.innerHTML = '<p class="empty-state">No workflows yet. Click "New Workflow" to get started!</p>';
            return;
        }

        if (workflows.length === 0) {
            const parts = [];
            if (this.getSelectedProjectName && this.selectedProjectId !== 'all') {
                parts.push(this.getSelectedProjectName());
            }
            if (this.getSelectedConfigurationName && this.selectedConfigurationId !== 'all') {
                parts.push(this.getSelectedConfigurationName());
            }
            const filterLabel = parts.length ? parts.join(' and ') : 'the selected filters';
            container.innerHTML = `<p class="empty-state">No workflows linked to ${filterLabel}.</p>`;
            return;
        }

        workflows.forEach((workflow, visibleIndex) => {
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.draggable = true;
            item.dataset.workflowId = workflow.id;

            // Count loop blocks
            const loopStarts = workflow.steps.filter(s => s.type === 'loop-start').length;
            const projectNames = this.getProjectNamesByIds ? this.getProjectNamesByIds(workflow.projectIds || []) : [];
            const configurationNames = this.getConfigurationNamesByIds ? this.getConfigurationNamesByIds(workflow.configurationIds || []) : [];

            item.innerHTML = `
                <div class="workflow-info">
                    <h4>${isConfigOrderMode ? `<span class="workflow-order-chip">${visibleIndex + 1}</span>` : ''}${workflow.name}</h4>
                    <p>${workflow.steps.length} steps${loopStarts > 0 ? `, ${loopStarts} loop(s)` : ''}</p>
                    ${projectNames.length ? `<div class="workflow-project-tags">${projectNames.map(name => `<span class="project-tag">${name}</span>`).join('')}</div>` : ''}
                    ${configurationNames.length ? `<div class="workflow-project-tags">${configurationNames.map(name => `<span class="project-tag">${name}</span>`).join('')}</div>` : ''}
                </div>
                <div class="workflow-actions">
                    <button class="btn-icon" data-action="run" title="Run Workflow">&#9654;</button>
                    <button class="btn-icon" data-action="edit" title="Edit Workflow">&#9998;</button>
                    <button class="btn-icon" data-action="export" title="Export Workflow">&#128228;</button>
                    <button class="btn-icon" data-action="delete" title="Delete Workflow">&#128465;</button>
                </div>
            `;

            // Event delegation for action buttons
            item.querySelector('[data-action="run"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.executeWorkflow(workflow);
            });

            item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadWorkflow(workflow);
            });

            item.querySelector('[data-action="export"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportWorkflow(workflow);
            });

            item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete workflow "${workflow.name}"?`)) {
                    this.workflows = this.workflows.filter(w => w.id !== workflow.id);
                    let configurationOrderChanged = false;
                    if (Array.isArray(this.configurations)) {
                        this.configurations.forEach(configuration => {
                            if (!Array.isArray(configuration.workflowOrder)) return;
                            const idx = configuration.workflowOrder.indexOf(workflow.id);
                            if (idx !== -1) {
                                configuration.workflowOrder.splice(idx, 1);
                                configurationOrderChanged = true;
                            }
                        });
                    }

                    await this.chrome.storage.local.set(configurationOrderChanged
                        ? { workflows: this.workflows, configurations: this.configurations }
                        : { workflows: this.workflows });
                    this.displayWorkflows();
                    if (this.updateNavButtonsWorkflowOptions) {
                        this.updateNavButtonsWorkflowOptions();
                    }
                    if (this.renderNavButtons) {
                        this.renderNavButtons();
                    }
                    if (this.renderProjectsManager) {
                        this.renderProjectsManager();
                    }
                    if (this.renderConfigurationsManager) {
                        this.renderConfigurationsManager();
                    }
                    this.showNotification('Workflow deleted', 'success');
                }
            });

            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/workflow-id', workflow.id);
                if (isConfigOrderMode) {
                    e.dataTransfer.setData('text/config-workflow-id', workflow.id);
                }
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.tree-node.drop-target').forEach(node => node.classList.remove('drop-target'));
                document.querySelectorAll('.workflow-item.drop-target').forEach(node => node.classList.remove('drop-target'));
            });

            if (isConfigOrderMode) {
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    item.classList.add('drop-target');
                });

                item.addEventListener('dragleave', () => {
                    item.classList.remove('drop-target');
                });

                item.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    item.classList.remove('drop-target');
                    const sourceWorkflowId = e.dataTransfer?.getData('text/config-workflow-id') || e.dataTransfer?.getData('text/workflow-id');
                    const targetWorkflowId = item.dataset.workflowId;
                    if (!sourceWorkflowId || !targetWorkflowId || sourceWorkflowId === targetWorkflowId) return;
                    if (this.reorderConfigurationWorkflow) {
                        await this.reorderConfigurationWorkflow(this.selectedConfigurationId, sourceWorkflowId, targetWorkflowId);
                        this.displayWorkflows();
                    }
                });
            }

            container.appendChild(item);
        });
    },
    loadWorkflow(workflow) {
        this.currentWorkflow = JSON.parse(JSON.stringify(workflow));
        if (!this.currentWorkflow.projectIds) {
            this.currentWorkflow.projectIds = [];
        }
        if (!this.currentWorkflow.configurationIds) {
            this.currentWorkflow.configurationIds = [];
        }

        // Store original state for cancel functionality
        this.originalWorkflowState = JSON.parse(JSON.stringify(workflow));

        document.getElementById('workflowName').value = workflow.name;
        this.loadWorkflowDefaultsUI();

        this.displaySteps();
        if (this.renderWorkflowProjects) {
            this.renderWorkflowProjects();
        }
        if (this.renderWorkflowConfigurations) {
            this.renderWorkflowConfigurations();
        }
        if (this.renderInterruptionHandlersPanel) {
            this.renderInterruptionHandlersPanel();
        }

        // Switch to builder tab
        document.querySelector('[data-tab="builder"]').click();
    },

    loadDataSourcesFromWorkflow() {},

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    async persistCurrentWorkflowHandlers() {
        if (!this.currentWorkflow?.id) return;
        const workflowId = this.currentWorkflow.id;
        const index = (this.workflows || []).findIndex(w => w.id === workflowId);
        if (index === -1) return;
        this.workflows[index] = {
            ...this.workflows[index],
            unexpectedEventHandlers: JSON.parse(JSON.stringify(this.currentWorkflow.unexpectedEventHandlers || []))
        };
        await this.chrome.storage.local.set({ workflows: this.workflows });
    },

    renderInterruptionHandlersPanel() {
        const container = document.getElementById('interruptionHandlersList');
        if (!container) return;

        if (!this.currentWorkflow) {
            container.innerHTML = '<p class="empty-state">Open a workflow to view learned handlers.</p>';
            this.refreshInterruptionHandlersPanelHeight();
            return;
        }

        const handlers = Array.isArray(this.currentWorkflow.unexpectedEventHandlers)
            ? this.currentWorkflow.unexpectedEventHandlers
            : [];

        if (!handlers.length) {
            container.innerHTML = '<p class="empty-state">No interruption handlers yet. Run learning mode to create them.</p>';
            this.refreshInterruptionHandlersPanelHeight();
            return;
        }

        container.innerHTML = handlers.map((handler, index) => {
            const triggerKind = this.escapeHtml(handler?.trigger?.kind || 'event');
            const triggerText = this.escapeHtml(handler?.trigger?.textTemplate || '');
            const actionList = Array.isArray(handler?.actions) && handler.actions.length
                ? handler.actions
                : (handler?.action ? [handler.action] : []);
            const actionSummary = actionList.map((action) => {
                const actionType = this.escapeHtml(action?.type || 'none');
                const actionName = this.escapeHtml(action?.buttonControlName || action?.buttonText || '');
                return `${actionType}${actionName ? ` (${actionName})` : ''}`;
            }).join(' -> ');
            const mode = handler?.mode === 'alwaysAsk' ? 'alwaysAsk' : 'auto';
            const enabled = handler?.enabled !== false;
            const outcome = this.escapeHtml(handler?.outcome || 'next-step');
            const matchMode = this.escapeHtml(handler?.trigger?.matchMode || 'contains');
            return `
                <div class="interruption-handler-item" data-handler-index="${index}">
                    <div class="interruption-handler-main">
                        <div class="interruption-handler-trigger">${triggerKind}</div>
                        <div class="interruption-handler-actions">
                            <label><input type="checkbox" data-action="toggle-enabled" ${enabled ? 'checked' : ''}> enabled</label>
                            <select data-action="set-mode" class="form-control form-control-sm">
                                <option value="auto" ${mode === 'auto' ? 'selected' : ''}>Auto</option>
                                <option value="alwaysAsk" ${mode === 'alwaysAsk' ? 'selected' : ''}>Always ask</option>
                            </select>
                            <button class="btn btn-danger interruption-handler-delete" data-action="delete">Delete</button>
                        </div>
                    </div>
                    <div class="interruption-handler-sub">Trigger: ${triggerText || '(no text template)'}</div>
                    <div class="interruption-handler-sub">Match: ${matchMode}</div>
                    <div class="interruption-handler-sub">Action: ${actionSummary || 'none'}</div>
                    <div class="interruption-handler-sub">Outcome: ${outcome}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-action="toggle-enabled"]').forEach((inputEl) => {
            inputEl.addEventListener('change', async (event) => {
                const row = event.target.closest('[data-handler-index]');
                const index = Number(row?.getAttribute('data-handler-index'));
                if (!Number.isFinite(index)) return;
                const handlersList = this.currentWorkflow.unexpectedEventHandlers || [];
                handlersList[index] = { ...(handlersList[index] || {}), enabled: !!event.target.checked };
                this.currentWorkflow.unexpectedEventHandlers = handlersList;
                await this.persistCurrentWorkflowHandlers();
            });
        });

        container.querySelectorAll('[data-action="set-mode"]').forEach((selectEl) => {
            selectEl.addEventListener('change', async (event) => {
                const row = event.target.closest('[data-handler-index]');
                const index = Number(row?.getAttribute('data-handler-index'));
                if (!Number.isFinite(index)) return;
                const handlersList = this.currentWorkflow.unexpectedEventHandlers || [];
                handlersList[index] = { ...(handlersList[index] || {}), mode: event.target.value || 'auto' };
                this.currentWorkflow.unexpectedEventHandlers = handlersList;
                await this.persistCurrentWorkflowHandlers();
            });
        });

        container.querySelectorAll('[data-action="delete"]').forEach((buttonEl) => {
            buttonEl.addEventListener('click', async (event) => {
                const row = event.target.closest('[data-handler-index]');
                const index = Number(row?.getAttribute('data-handler-index'));
                if (!Number.isFinite(index)) return;
                const handlersList = this.currentWorkflow.unexpectedEventHandlers || [];
                handlersList.splice(index, 1);
                this.currentWorkflow.unexpectedEventHandlers = handlersList;
                await this.persistCurrentWorkflowHandlers();
                this.renderInterruptionHandlersPanel();
            });
        });

        this.refreshInterruptionHandlersPanelHeight();
    },

    updateDataSourceUIFromState() {},

    resolveWorkflowDataSources(workflow) {
        return JSON.parse(JSON.stringify(workflow || {}));
    },

    collectReferencedSharedSourceIds(workflow) {
        const ids = new Set();
        const collectMapping = (value) => {
            if (typeof value !== 'string') return;
            const idx = value.indexOf(':');
            if (idx <= 0) return;
            const sourceId = value.slice(0, idx);
            if (!sourceId) return;
            ids.add(sourceId);
        };

        (workflow?.steps || []).forEach(step => {
            collectMapping(step?.fieldMapping);
            collectMapping(step?.conditionFieldMapping);
            if (step?.type === 'loop-start' && step?.loopDataSource && step.loopDataSource !== 'primary') {
                ids.add(step.loopDataSource);
            }
        });

        return Array.from(ids);
    },

    buildExecutionRowsForWorkflow(workflow, sharedSourcesOverride = null) {
        const sourceIds = this.collectReferencedSharedSourceIds(workflow);
        if (!sourceIds.length) {
            return [{}];
        }

        const sharedSources = Array.isArray(sharedSourcesOverride) ? sharedSourcesOverride : (this.sharedDataSources || []);

        const resolvedSources = sourceIds.map((id) => {
            const source = sharedSources.find(s => s.id === id);
            if (!source) {
                throw new Error(`Shared data source not found: ${id}`);
            }
            if (!Array.isArray(source.data) || source.data.length === 0) {
                throw new Error(`Shared data source "${source.name || id}" has no rows`);
            }
            return source;
        });

        const maxRows = resolvedSources.reduce((max, source) => Math.max(max, source.data.length), 0);
        const rows = [];
        for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
            const row = {};
            resolvedSources.forEach((source) => {
                const sourceRow = source.data[rowIndex] || source.data[source.data.length - 1] || {};
                Object.entries(sourceRow).forEach(([field, value]) => {
                    const key = `${source.id}:${field}`;
                    row[key] = value;
                    if (!Object.prototype.hasOwnProperty.call(row, field)) {
                        row[field] = value;
                    }
                });
            });
            rows.push(row);
        }

        return rows.length ? rows : [{}];
    },

    async resolveRuntimeSharedDataSourcesForWorkflow(workflow) {
        const sourceIds = new Set(this.collectReferencedSharedSourceIds(workflow));
        const runtimeSources = (this.sharedDataSources || []).map(source => JSON.parse(JSON.stringify(source)));
        const dynamicSources = runtimeSources.filter(source =>
            sourceIds.has(source.id) && source.type === 'odata-dynamic'
        );

        if (!dynamicSources.length) {
            return runtimeSources;
        }

        for (const source of dynamicSources) {
            const query = (source.odataQuery || '').trim();
            if (!query) {
                throw new Error(`Dynamic OData source "${source.name || source.id}" is missing query`);
            }

            const result = this.fetchODataRowsFromActiveEnvironment
                ? await this.fetchODataRowsFromActiveEnvironment(query, { previewOnly: false })
                : null;
            const rows = Array.isArray(result?.rows) ? result.rows : [];
            if (!rows.length) {
                throw new Error(`Dynamic OData source "${source.name || source.id}" returned no rows`);
            }

            source.data = rows;
            source.fields = Object.keys(rows[0] || {});
            source.odataLastFetchedAt = Date.now();
            this.addLog('info', `Fetched dynamic OData source "${source.name || source.id}" (${rows.length} rows)`);
        }

        return runtimeSources;
    },

    loadWorkflowDefaultsUI() {
        if (!this.currentWorkflow) return;
        const settings = this.currentWorkflow.settings || {};
        const mode = settings.errorDefaultMode || 'fail';
        const retryCount = settings.errorDefaultRetryCount ?? (this.settings?.maxRetries ?? 0);
        const retryDelay = settings.errorDefaultRetryDelay ?? 1000;
        const gotoLabel = settings.errorDefaultGotoLabel || '';

        const modeEl = document.getElementById('workflowErrorDefaultMode');
        const retryCountEl = document.getElementById('workflowErrorDefaultRetryCount');
        const retryDelayEl = document.getElementById('workflowErrorDefaultRetryDelay');
        const gotoLabelEl = document.getElementById('workflowErrorDefaultGotoLabel');
        const gotoGroup = document.getElementById('workflowErrorDefaultGotoGroup');

        if (modeEl) modeEl.value = mode;
        if (retryCountEl) retryCountEl.value = retryCount;
        if (retryDelayEl) retryDelayEl.value = retryDelay;
        if (gotoLabelEl) gotoLabelEl.value = gotoLabel;
        if (gotoGroup) gotoGroup.classList.toggle('is-hidden', mode !== 'goto');
    },

    saveWorkflowDefaultsFromUI() {
        if (!this.currentWorkflow) return;
        this.currentWorkflow.settings = { ...(this.currentWorkflow.settings || {}) };

        const modeEl = document.getElementById('workflowErrorDefaultMode');
        const retryCountEl = document.getElementById('workflowErrorDefaultRetryCount');
        const retryDelayEl = document.getElementById('workflowErrorDefaultRetryDelay');
        const gotoLabelEl = document.getElementById('workflowErrorDefaultGotoLabel');

        this.currentWorkflow.settings.errorDefaultMode = modeEl?.value || 'fail';
        this.currentWorkflow.settings.errorDefaultRetryCount = parseInt(retryCountEl?.value) || 0;
        this.currentWorkflow.settings.errorDefaultRetryDelay = parseInt(retryDelayEl?.value) || 1000;
        this.currentWorkflow.settings.errorDefaultGotoLabel = gotoLabelEl?.value || '';
    },

    workflowHasLoops(workflow) {
        return (workflow?.steps || []).some(step => step.type === 'loop-start' || step.type === 'loop-end');
    },

    normalizeParamName(name) {
        return (name || '').trim().toLowerCase();
    },

    getParamNamesFromString(text) {
        const params = new Set();
        if (typeof text !== 'string') return params;
        const regex = /\$\{([A-Za-z0-9_]+)\}/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const startIndex = match.index;
            if (startIndex > 0 && text[startIndex - 1] === '\\') continue;
            params.add(this.normalizeParamName(match[1]));
        }
        return params;
    },

    extractRequiredParamsFromObject(obj, params) {
        if (!obj) return;
        if (typeof obj === 'string') {
            for (const name of this.getParamNamesFromString(obj)) {
                params.add(name);
            }
            return;
        }
        if (Array.isArray(obj)) {
            obj.forEach(item => this.extractRequiredParamsFromObject(item, params));
            return;
        }
        if (typeof obj === 'object') {
            Object.values(obj).forEach(value => this.extractRequiredParamsFromObject(value, params));
        }
    },

    getStepForParamExtraction(step) {
        if (!step || typeof step !== 'object') return step;

        if (step.type === 'navigate') {
            const method = step.navigateMethod || 'menuItem';
            const normalized = { ...step };

            if (method === 'url') {
                delete normalized.menuItemName;
                delete normalized.menuItemType;
                delete normalized.hostRelativePath;
            } else if (method === 'hostRelative') {
                delete normalized.menuItemName;
                delete normalized.menuItemType;
                delete normalized.navigateUrl;
            } else {
                // menuItem (default)
                delete normalized.navigateUrl;
                delete normalized.hostRelativePath;
            }

            return normalized;
        }

        return step;
    },

    extractRequiredParamsFromWorkflow(workflow) {
        const params = new Set();
        (workflow?.steps || []).forEach(step => {
            this.extractRequiredParamsFromObject(this.getStepForParamExtraction(step), params);
        });
        return Array.from(params);
    },

    normalizeBindingValue(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const source = value.valueSource || 'static';
            if (source === 'data') {
                return { valueSource: 'data', fieldMapping: value.fieldMapping || '' };
            }
            if (source === 'clipboard') {
                return { valueSource: 'clipboard' };
            }
            return { valueSource: 'static', value: value.value ?? '' };
        }
        return { valueSource: 'static', value: value ?? '' };
    },

    buildNormalizedBindings(bindings) {
        const normalized = {};
        Object.entries(bindings || {}).forEach(([key, value]) => {
            const name = this.normalizeParamName(key);
            if (!name) return;
            normalized[name] = this.normalizeBindingValue(value);
        });
        return normalized;
    },

    serializeDynamicBindingToken(name, binding) {
        const safeName = this.normalizeParamName(name).replace(/[^a-z0-9_]/g, '_') || 'param';
        if (binding?.valueSource === 'clipboard') {
            return `__D365_PARAM_CLIPBOARD_${safeName}__`;
        }
        if (binding?.valueSource === 'data') {
            const field = encodeURIComponent(String(binding.fieldMapping || '').trim());
            return `__D365_PARAM_DATA_${field}__`;
        }
        return '';
    },

    substituteParamsInString(text, bindings, warnings, contextLabel) {
        if (typeof text !== 'string') return text;
        return text.replace(/\\?\$\{([A-Za-z0-9_]+)\}/g, (match, name) => {
            if (match.startsWith('\\')) {
                return match.slice(1);
            }
            const key = this.normalizeParamName(name);
            if (!Object.prototype.hasOwnProperty.call(bindings, key)) {
                warnings?.push(`Missing parameter "${name}" while expanding ${contextLabel}.`);
                return '';
            }
            const binding = bindings[key];
            if (binding?.valueSource && binding.valueSource !== 'static') {
                if (binding.valueSource === 'data' && !String(binding.fieldMapping || '').trim()) {
                    warnings?.push(`Parameter "${name}" uses data source but has no mapped field in ${contextLabel}.`);
                    return '';
                }
                return this.serializeDynamicBindingToken(name, binding);
            }
            const valueStr = binding?.value ?? '';
            if (valueStr === '') {
                warnings?.push(`Parameter "${name}" resolved to empty value in ${contextLabel}.`);
            }
            return valueStr;
        });
    },

    applyParamBindingToValueField(rawValue, step, bindings, warnings, contextLabel) {
        const exactMatch = rawValue.match(/^\$\{([A-Za-z0-9_]+)\}$/);
        if (!exactMatch) return null;
        const name = exactMatch[1];
        const key = this.normalizeParamName(name);
        const binding = bindings[key];
        if (!binding) {
            warnings?.push(`Missing parameter "${name}" while expanding ${contextLabel}.`);
            return { value: '' };
        }

        const stepType = step?.type || '';
        const supportsValueSource = ['input', 'select', 'lookupSelect', 'grid-input', 'filter', 'query-filter'].includes(stepType);
        if (!supportsValueSource && binding.valueSource !== 'static') {
            warnings?.push(`Parameter "${name}" uses ${binding.valueSource} but step type "${stepType}" does not support it in ${contextLabel}.`);
            return { value: '' };
        }

        if (binding.valueSource === 'data') {
            return {
                value: '',
                valueSource: 'data',
                fieldMapping: binding.fieldMapping || ''
            };
        }

        if (binding.valueSource === 'clipboard') {
            return {
                value: '',
                valueSource: 'clipboard',
                fieldMapping: ''
            };
        }

        const valueStr = binding.value ?? '';
        if (valueStr === '') {
            warnings?.push(`Parameter "${name}" resolved to empty value in ${contextLabel}.`);
        }
        return {
            value: valueStr,
            valueSource: 'static'
        };
    },

    substituteParamsInObject(obj, bindings, warnings, contextLabel) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'string') {
            return this.substituteParamsInString(obj, bindings, warnings, contextLabel);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.substituteParamsInObject(item, bindings, warnings, contextLabel));
        }
        if (typeof obj === 'object') {
            const result = { ...obj };
            const overrideKeys = new Set();
            Object.entries(obj).forEach(([key, value]) => {
                if (key === 'value' && typeof value === 'string') {
                    const applied = this.applyParamBindingToValueField(value, obj, bindings, warnings, contextLabel);
                    if (applied) {
                        result.value = applied.value;
                        if (applied.valueSource !== undefined) {
                            result.valueSource = applied.valueSource;
                            overrideKeys.add('valueSource');
                        }
                        if (applied.fieldMapping !== undefined) {
                            result.fieldMapping = applied.fieldMapping;
                            overrideKeys.add('fieldMapping');
                        }
                        return;
                    }
                }

                if (overrideKeys.has(key)) return;
                result[key] = this.substituteParamsInObject(value, bindings, warnings, contextLabel);
            });
            return result;
        }
        return obj;
    },

    resolveBindingMap(rawBindings, parentBindings, warnings, contextLabel) {
        const normalized = this.buildNormalizedBindings(rawBindings);
        const resolved = {};
        Object.entries(normalized).forEach(([key, binding]) => {
            if (binding.valueSource === 'static') {
                const resolvedValue = this.substituteParamsInString(String(binding.value ?? ''), parentBindings, warnings, contextLabel);
                resolved[key] = { valueSource: 'static', value: resolvedValue };
            } else if (binding.valueSource === 'data') {
                const resolvedField = this.substituteParamsInString(String(binding.fieldMapping ?? ''), parentBindings, warnings, contextLabel);
                resolved[key] = { valueSource: 'data', fieldMapping: resolvedField };
            } else if (binding.valueSource === 'clipboard') {
                resolved[key] = { valueSource: 'clipboard' };
            } else {
                resolved[key] = { valueSource: 'static', value: '' };
            }
        });
        return resolved;
    },

    expandWorkflowForExecution(rootWorkflow) {
        const warnings = [];
        const expand = (workflow, bindings, stack) => {
            if (!workflow || !Array.isArray(workflow.steps)) {
                throw new Error('Invalid workflow structure.');
            }

            const workflowId = workflow.id || workflow.name || 'workflow';
            if (stack.includes(workflowId)) {
                const cycle = [...stack, workflowId].join(' -> ');
                throw new Error(`Subworkflow cycle detected: ${cycle}`);
            }

            const requiredParams = this.extractRequiredParamsFromWorkflow(workflow);
            const missing = requiredParams.filter(name => !Object.prototype.hasOwnProperty.call(bindings, name));
            if (missing.length) {
                const wfName = workflow.name || workflow.id || 'workflow';
                throw new Error(`Missing parameters for workflow "${wfName}": ${missing.join(', ')}`);
            }

            const nextStack = [...stack, workflowId];
            const expandedSteps = [];

            for (const step of workflow.steps) {
                if (step?.type === 'subworkflow') {
                    const subId = step.subworkflowId;
                    if (!subId) {
                        throw new Error(`Subworkflow step missing target in "${workflow.name || workflow.id}".`);
                    }
                    const subWorkflow = (this.workflows || []).find(w => w.id === subId);
                    if (!subWorkflow) {
                        throw new Error(`Subworkflow not found: ${subId}`);
                    }
                    if (this.workflowHasLoops(subWorkflow)) {
                        const subName = subWorkflow.name || subWorkflow.id || 'workflow';
                        throw new Error(`Subworkflow "${subName}" contains loops and cannot be used.`);
                    }

                    const resolvedBindings = this.resolveBindingMap(step.paramBindings || {}, bindings, warnings, `subworkflow "${subWorkflow.name || subWorkflow.id}"`);
                    const expandedSub = expand(subWorkflow, resolvedBindings, nextStack);
                    expandedSteps.push(...expandedSub.steps);
                } else {
                    const substituted = this.substituteParamsInObject(step, bindings, warnings, `workflow "${workflow.name || workflow.id}"`);
                    expandedSteps.push(substituted);
                }
            }

            return {
                ...workflow,
                steps: expandedSteps
            };
        };

        const expanded = expand(rootWorkflow, {}, []);
        return { workflow: expanded, warnings };
    },

    async executeWorkflow(workflow) {
        // Show run options modal first
        this.showRunOptionsModal(workflow);
    },

    async executeWorkflowWithOptions(workflow, runOptions, executionMeta = { origin: 'manual' }) {
        try {
            if (this.executionState?.isRunning || this.executionState?.isLaunching) {
                this.addLog('warning', 'A workflow run is already in progress');
                return false;
            }
            this.executionState.isLaunching = true;

            const runOrigin = executionMeta?.origin || 'manual';

            // If a standalone run starts while stale configuration state exists,
            // clear it so completion does not trigger queued configuration workflows.
            if (runOrigin !== 'configuration' && this.configurationRunState) {
                this.configurationRunState = null;
            }

            this.activeRunContext = {
                origin: runOrigin,
                configurationRunId: executionMeta?.configurationRunId || null,
                queueKey: executionMeta?.queueKey || null
            };

            let workflowToExecute = workflow;
            let expansionWarnings = [];
            let executionRows = [{}];
            let runtimeSharedSources = (this.sharedDataSources || []);
            try {
                const workflowWithResolvedSources = this.resolveWorkflowDataSources
                    ? this.resolveWorkflowDataSources(workflow, { strict: true })
                    : workflow;
                const expansion = this.expandWorkflowForExecution(workflowWithResolvedSources);
                workflowToExecute = expansion.workflow;
                expansionWarnings = expansion.warnings || [];
                runtimeSharedSources = this.resolveRuntimeSharedDataSourcesForWorkflow
                    ? await this.resolveRuntimeSharedDataSourcesForWorkflow(workflowToExecute)
                    : (this.sharedDataSources || []);
                executionRows = this.buildExecutionRowsForWorkflow
                    ? this.buildExecutionRowsForWorkflow(workflowToExecute, runtimeSharedSources)
                    : [{}];
            } catch (expansionError) {
                this.showNotification(expansionError.message || 'Failed to expand workflow', 'error');
                this.addLog('error', expansionError.message || 'Failed to expand workflow');
                this.executionState.isLaunching = false;
                return false;
            }

            // Use linked tab if available
            let tab;
            if (this.linkedTabId) {
                try {
                    tab = await this.chrome.tabs.get(this.linkedTabId);
                } catch (e) {
                    this.linkedTabId = null;
                }
            }

            if (!tab) {
                // Try to find a D365 tab
                const tabs = await this.chrome.tabs.query({});
                tab = tabs.find(t => t.url && (t.url.includes('dynamics.com') || t.url.includes('cloudax.dynamics.com')));
            }

            if (!tab) {
                this.showNotification('No D365FO tab found. Please open D365FO and click the extension icon.', 'error');
                this.executionState.isLaunching = false;
                return false;
            }

            // Check if we're on a valid URL
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                this.showNotification('Cannot run on Chrome internal pages', 'error');
                this.executionState.isLaunching = false;
                return false;
            }

            // Initialize execution state
            const totalDataRows = executionRows.length || 0;
            let effectiveRowCount = totalDataRows;

            // Calculate how many rows will actually be processed
            if (runOptions.skipRows > 0) {
                effectiveRowCount = Math.max(0, effectiveRowCount - runOptions.skipRows);
            }
            if (runOptions.limitRows > 0) {
                effectiveRowCount = Math.min(effectiveRowCount, runOptions.limitRows);
            }

            this.executionState.isRunning = true;
            this.executionState.isLaunching = false;
            this.executionState.isPaused = false;
            this.executionState.currentWorkflowId = workflowToExecute.id;
            this.executionState.currentStepIndex = 0;
            this.executionState.totalSteps = workflowToExecute.steps.length;
            this.executionState.currentRow = 0;
            this.executionState.totalRows = totalDataRows;
            this.executionState.runOptions = runOptions;
            this.lastRunOptionsByWorkflow[workflowToExecute.id] = { ...runOptions };

            this.clearStepStatuses();
            this.updateExecutionBar();
            this.markWorkflowAsRunning(workflowToExecute.id);

            // Clear and open logs if dry run
            if (runOptions.dryRun) {
                this.logs = [];
                this.addLog('warning', 'DRY RUN MODE - No actual changes will be made');
                this.setLogsPanelOpen(true);
            }

            this.addLog('info', `Dispatching workflow: ${workflowToExecute.name}`);
            if (runOptions.skipRows > 0) {
                this.addLog('info', `Skipping first ${runOptions.skipRows} rows`);
            }
            if (runOptions.limitRows > 0) {
                this.addLog('info', `Limiting to ${runOptions.limitRows} rows`);
            }

            if (expansionWarnings.length) {
                expansionWarnings.forEach(message => this.addLog('warning', message));
            }

            this.showNotification(`Running workflow: ${workflowToExecute.name}${runOptions.dryRun ? ' (DRY RUN)' : ''}...`, 'info');

            // Send workflow to content script for execution
            try {
                // Merge current UI settings into the workflow before executing
                const workflowToSend = JSON.parse(JSON.stringify(workflowToExecute));
                workflowToSend.settings = { ...(workflowToSend.settings || {}), ...(this.settings || {}) };
                workflowToSend.runOptions = runOptions;
                workflowToSend.dataSources = {
                    primary: {
                        type: 'computed',
                        data: executionRows,
                        fields: Object.keys(executionRows[0] || {})
                    },
                    details: (runtimeSharedSources || []).map(source => ({
                        id: source.id,
                        name: source.name || source.id,
                        data: Array.isArray(source.data) ? source.data : [],
                        fields: Array.isArray(source.fields)
                            ? source.fields
                            : Object.keys((Array.isArray(source.data) && source.data[0]) ? source.data[0] : {})
                    })),
                    relationships: (this.sharedDataSourceRelationships || [])
                        .filter(rel => rel.detailId && (rel.fieldMappings?.length || (rel.primaryField && rel.detailField)))
                        .map(rel => ({
                            parentSourceId: rel.parentSourceId || '',
                            detailId: rel.detailId,
                            primaryField: rel.primaryField,
                            detailField: rel.detailField,
                            fieldMappings: Array.isArray(rel.fieldMappings) && rel.fieldMappings.length
                                ? rel.fieldMappings.map(pair => ({
                                    primaryField: pair.primaryField,
                                    detailField: pair.detailField
                                }))
                                : [{ primaryField: rel.primaryField, detailField: rel.detailField }]
                        }))
                };

                // Keep an exact snapshot of the currently running workflow for
                // navigation resume handling (avoid relying on builder context).
                this.executionState.runningWorkflowSnapshot = JSON.parse(JSON.stringify(workflowToSend));

                await this.chrome.tabs.sendMessage(tab.id, {
                    action: 'executeWorkflow',
                    workflow: workflowToSend,
                    data: executionRows,
                    runOptions: runOptions
                });
            } catch (msgError) {
                // Content script not loaded - reload the page first
                if (msgError.message.includes('Receiving end does not exist')) {
                    this.showNotification('Please refresh the D365FO page first, then try again', 'error');
                    this.executionState.isRunning = false;
                    this.executionState.isLaunching = false;
                    this.activeRunContext = null;
                    this.updateExecutionBar();
                    this.markWorkflowAsNotRunning();
                    return false;
                } else {
                    throw msgError;
                }
            }

            return true;

        } catch (error) {
            console.error('Error executing workflow:', error);
            this.showNotification('Failed to run workflow: ' + error.message, 'error');
            this.executionState.isRunning = false;
            this.executionState.isLaunching = false;
            this.activeRunContext = null;
            this.updateExecutionBar();
            this.markWorkflowAsNotRunning();
            this.addLog('error', `Failed to start workflow: ${error.message}`);
            return false;
        }
    },

    exportWorkflow(workflow) {
        const dataStr = JSON.stringify(workflow, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.showNotification('Workflow exported', 'success');
    },

    initImportDropdown() {
        const importBtn = document.getElementById('importWorkflow');
        const dropdown = document.getElementById('importDropdownMenu');
        
        if (!importBtn || !dropdown) return;

        // Toggle dropdown on button click
        importBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.import-dropdown')) {
                dropdown.classList.remove('show');
            }
        });

        // Handle import options
        dropdown.querySelectorAll('.import-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                
                const importType = option.dataset.importType;
                if (importType === 'json') {
                    this.importJSONWorkflow();
                } else if (importType === 'xml') {
                    this.importTaskRecorderXML();
                }
            });
        });
    },
    async importJSONWorkflow() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const text = reader.result;
                    const workflow = JSON.parse(text);

                    // Validate workflow structure
                    if (!workflow.name || !workflow.steps) {
                        throw new Error('Invalid workflow file');
                    }

                    // Generate new ID to avoid conflicts
                    workflow.id = Date.now().toString();
                    workflow.projectIds = workflow.projectIds || [];
                    workflow.configurationIds = workflow.configurationIds || [];

                    this.workflows.push(workflow);
                    const configurationOrderChanged = this.syncConfigurationOrderForWorkflow
                        ? this.syncConfigurationOrderForWorkflow(workflow)
                        : false;

                    await this.chrome.storage.local.set(configurationOrderChanged
                        ? { workflows: this.workflows, configurations: this.configurations }
                        : { workflows: this.workflows });
                    this.displayWorkflows();
                    if (this.updateNavButtonsWorkflowOptions) {
                        this.updateNavButtonsWorkflowOptions();
                    }
                    if (this.renderNavButtons) {
                        this.renderNavButtons();
                    }
                    if (this.renderProjectsManager) {
                        this.renderProjectsManager();
                    }
                    if (this.renderConfigurationsManager) {
                        this.renderConfigurationsManager();
                    }
                    this.showNotification(`Workflow "${workflow.name}" imported successfully`, 'success');
                } catch (error) {
                    this.showNotification('Failed to import workflow: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    async importTaskRecorderXML() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xml';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                await this.handleXMLFileImport(file);
            } catch (error) {
                console.error('XML import error:', error);
                this.showNotification('Failed to import Task Recording: ' + error.message, 'error');
            }
        };
        input.click();
    }
};













