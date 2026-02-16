import { generateId } from './id.js';
import { escapeHtml } from './utils.js';
import {
    workflowHasLoops as workflowHasLoopsUtil,
    normalizeParamName as normalizeParamNameUtil,
    getParamNamesFromString as getParamNamesFromStringUtil,
    extractRequiredParamsFromObject as extractRequiredParamsFromObjectUtil,
    getStepForParamExtraction as getStepForParamExtractionUtil,
    extractRequiredParamsFromWorkflow as extractRequiredParamsFromWorkflowUtil,
    normalizeBindingValue as normalizeBindingValueUtil,
    buildNormalizedBindings as buildNormalizedBindingsUtil,
    serializeDynamicBindingToken as serializeDynamicBindingTokenUtil,
    substituteParamsInString as substituteParamsInStringUtil,
    applyParamBindingToValueField as applyParamBindingToValueFieldUtil,
    substituteParamsInObject as substituteParamsInObjectUtil,
    resolveBindingMap as resolveBindingMapUtil
} from '../../shared/workflow-param-utils.js';

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

        this.refreshInterruptionHandlersPanelHeight();
    },

    refreshInterruptionHandlersPanelHeight() {
        const handlersPanel = document.getElementById('workflowInterruptionHandlersPanel');
        const handlersList = document.getElementById('interruptionHandlersList');
        const repositoryPanel = document.getElementById('workflowInterruptionRepositoryPanel');
        const repositoryList = document.getElementById('interruptionRepositoryList');
        const builderTab = document.getElementById('builder-tab');
        if (!builderTab) return;

        const hasHandlersPanel = !!(handlersPanel && handlersList);
        const hasRepositoryPanel = !!(repositoryPanel && repositoryList);
        if (!hasHandlersPanel && !hasRepositoryPanel) return;

        if (!builderTab.classList.contains('active')) return;

        const actionBar = builderTab.querySelector('.workflow-actions-bar');
        const reserveBottom = (actionBar?.offsetHeight || 0) + 20;

        if (hasHandlersPanel) {
            if (handlersPanel.classList.contains('is-collapsed')) {
                handlersList.style.removeProperty('--interruption-list-max-height');
            } else {
                const rect = handlersList.getBoundingClientRect();
                const available = Math.floor(window.innerHeight - rect.top - reserveBottom);
                const maxHeight = Math.max(220, available);
                handlersList.style.setProperty('--interruption-list-max-height', `${maxHeight}px`);
            }
        }

        if (hasRepositoryPanel) {
            if (repositoryPanel.classList.contains('is-collapsed')) {
                repositoryList.style.removeProperty('--interruption-repo-list-max-height');
            } else {
                const repoRect = repositoryList.getBoundingClientRect();
                const repoAvailable = Math.floor(window.innerHeight - repoRect.top - reserveBottom);
                const repoMaxHeight = Math.max(180, repoAvailable);
                repositoryList.style.setProperty('--interruption-repo-list-max-height', `${repoMaxHeight}px`);
            }
        }
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
            id: generateId('workflow'),
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
        const result = await this.chrome.storage.local.get(['workflows', 'interruptionHandlerRepository']);
        this.workflows = result.workflows || [];
        this.interruptionHandlerRepository = Array.isArray(result.interruptionHandlerRepository)
            ? result.interruptionHandlerRepository
            : [];
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

        const repositoryEntries = this.buildInterruptionRepository({ includeStoredRepository: false });
        this.interruptionHandlerRepository = repositoryEntries.map((entry) => this.cloneInterruptionHandler(entry.handler));
        await this.chrome.storage.local.set(configurationOrderChanged
            ? {
                workflows: this.workflows,
                configurations: this.configurations,
                interruptionHandlerRepository: this.interruptionHandlerRepository
            }
            : {
                workflows: this.workflows,
                interruptionHandlerRepository: this.interruptionHandlerRepository
            });
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
                    const repositoryEntries = this.buildInterruptionRepository({ includeStoredRepository: false });
                    this.interruptionHandlerRepository = repositoryEntries.map((entry) => this.cloneInterruptionHandler(entry.handler));

                    await this.chrome.storage.local.set(configurationOrderChanged
                        ? {
                            workflows: this.workflows,
                            configurations: this.configurations,
                            interruptionHandlerRepository: this.interruptionHandlerRepository
                        }
                        : {
                            workflows: this.workflows,
                            interruptionHandlerRepository: this.interruptionHandlerRepository
                        });
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

    async persistCurrentWorkflowHandlers() {
        if (!this.currentWorkflow?.id) return;
        const workflowId = this.currentWorkflow.id;
        const index = (this.workflows || []).findIndex(w => w.id === workflowId);
        if (index === -1) return;
        this.workflows[index] = {
            ...this.workflows[index],
            unexpectedEventHandlers: JSON.parse(JSON.stringify(this.currentWorkflow.unexpectedEventHandlers || []))
        };
        const repositoryEntries = this.buildInterruptionRepository({ includeStoredRepository: false });
        this.interruptionHandlerRepository = repositoryEntries.map((entry) => this.cloneInterruptionHandler(entry.handler));
        await this.chrome.storage.local.set({
            workflows: this.workflows,
            interruptionHandlerRepository: this.interruptionHandlerRepository
        });
    },

    getInterruptionHandlerSignature(handler) {
        const source = this.normalizeInterruptionHandler(handler);
        const trigger = source.trigger && typeof source.trigger === 'object' ? source.trigger : {};
        const actionsRaw = Array.isArray(source.actions) && source.actions.length
            ? source.actions
            : (source.action ? [source.action] : []);
        const actions = actionsRaw.map((action) => ({
            type: action?.type || '',
            buttonControlName: action?.buttonControlName || '',
            buttonText: action?.buttonText || ''
        }));
        return JSON.stringify({
            trigger: {
                kind: trigger.kind || '',
                textTemplate: trigger.textTemplate || '',
                matchMode: trigger.matchMode || 'contains'
            },
            actions,
            outcome: source.outcome || 'next-step'
        });
    },

    normalizeInterruptionTextTemplate(rawText) {
        let value = String(rawText || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        if (!value) return '';

        value = value
            .replace(/\bcustomer\s+\d+\b/gi, 'customer {number}')
            .replace(/\bitem number\s+[a-z0-9_-]+\b/gi, 'item number {value}')
            .replace(/\b\d[\d,./-]*\b/g, '{number}');

        // Generalize duplicate create-record interruptions across tables/fields.
        // Example:
        // cannot create a record in translations (languagext). language: en-us. the record already exists.
        // -> cannot create a record in {record}. {field}: {value}. the record already exists.
        value = value.replace(
            /(\bcannot create a record in )([^.]+?)(\.)/i,
            '$1{record}$3'
        );

        value = value.replace(
            /\bfield\s+['"]?([^'".]+?)['"]?\s+must be filled in\.?/i,
            "field '{field}' must be filled in."
        );

        value = value.replace(
            /\b[a-z][a-z0-9 _()/-]*\s+cannot be deleted while dependent\s+[a-z][a-z0-9 _()/-]*\s+exist\.?/i,
            '{entity} cannot be deleted while dependent {dependency} exist.'
        );

        value = value.replace(
            /\bdelete dependent\s+[a-z][a-z0-9 _()/-]*\s+and try again\.?/i,
            'delete dependent {dependency} and try again.'
        );

        value = value.replace(
            /(\.\s*)([a-z][a-z0-9 _()/-]*)(\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
            '$1{field}: {value}$5'
        );

        value = value.replace(
            /(\b[a-z][a-z0-9 _()/-]*\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
            '{field}: {value}$3'
        );

        return value
            .replace(/\s+/g, ' ')
            .trim();
    },

    cloneInterruptionHandler(handler) {
        return JSON.parse(JSON.stringify(handler || {}));
    },

    normalizeInterruptionHandler(handler) {
        const clone = this.cloneInterruptionHandler(handler);
        if (!clone || typeof clone !== 'object') return {};
        clone.trigger = clone.trigger && typeof clone.trigger === 'object'
            ? { ...clone.trigger }
            : {};
        clone.trigger.textTemplate = this.normalizeInterruptionTextTemplate(clone.trigger.textTemplate || '');
        return clone;
    },

    buildInterruptionRepository(options = {}) {
        const includeStoredRepository = options.includeStoredRepository !== false;
        const signatureToEntry = new Map();
        const repoHandlers = Array.isArray(this.interruptionHandlerRepository)
            ? this.interruptionHandlerRepository
            : [];
        const workflowList = Array.isArray(this.workflows) ? this.workflows : [];

        const ingest = (handler, sourceName) => {
            if (!handler || typeof handler !== 'object') return;
            const normalizedHandler = this.normalizeInterruptionHandler(handler);
            const signature = this.getInterruptionHandlerSignature(normalizedHandler);
            if (!signature) return;
            let entry = signatureToEntry.get(signature);
            if (!entry) {
                entry = {
                    signature,
                    handler: normalizedHandler,
                    sources: new Set()
                };
                signatureToEntry.set(signature, entry);
            }
            if (sourceName) {
                entry.sources.add(sourceName);
            }
        };

        if (includeStoredRepository) {
            repoHandlers.forEach((handler) => {
                if (handler && typeof handler === 'object' && handler.handler) {
                    ingest(handler.handler, 'Repository');
                    return;
                }
                ingest(handler, 'Repository');
            });
        }
        workflowList.forEach((workflow) => {
            const sourceName = workflow?.name || workflow?.id || 'Workflow';
            const handlers = Array.isArray(workflow?.unexpectedEventHandlers)
                ? workflow.unexpectedEventHandlers
                : [];
            handlers.forEach((handler) => ingest(handler, sourceName));
        });

        if (this.currentWorkflow) {
            const currentName = this.currentWorkflow.name || this.currentWorkflow.id || 'Current Workflow';
            const handlers = Array.isArray(this.currentWorkflow.unexpectedEventHandlers)
                ? this.currentWorkflow.unexpectedEventHandlers
                : [];
            handlers.forEach((handler) => ingest(handler, currentName));
        }

        return Array.from(signatureToEntry.values()).map((entry) => ({
            signature: entry.signature,
            handler: entry.handler,
            sources: Array.from(entry.sources).sort()
        }));
    },

    summarizeInterruptionHandler(handler) {
        const actionList = Array.isArray(handler?.actions) && handler.actions.length
            ? handler.actions
            : (handler?.action ? [handler.action] : []);
        const actionSummary = actionList.map((action) => {
            const actionType = action?.type || 'none';
            const actionName = action?.buttonControlName || action?.buttonText || '';
            return `${actionType}${actionName ? ` (${actionName})` : ''}`;
        }).join(' -> ');
        return {
            triggerKind: handler?.trigger?.kind || 'event',
            triggerText: handler?.trigger?.textTemplate || '',
            actionSummary,
            outcome: handler?.outcome || 'next-step',
            matchMode: handler?.trigger?.matchMode || 'contains'
        };
    },

    mergeInterruptionHandlersIntoCurrent(handlersToAdd = []) {
        if (!this.currentWorkflow) {
            return { addedCount: 0, skippedCount: 0 };
        }

        const existingHandlers = Array.isArray(this.currentWorkflow.unexpectedEventHandlers)
            ? this.currentWorkflow.unexpectedEventHandlers
            : [];
        const existingSignatures = new Set(existingHandlers.map((handler) => this.getInterruptionHandlerSignature(handler)));
        const additions = [];

        handlersToAdd.forEach((handler) => {
            if (!handler || typeof handler !== 'object') return;
            const signature = this.getInterruptionHandlerSignature(handler);
            if (!signature || existingSignatures.has(signature)) return;
            existingSignatures.add(signature);
            additions.push(this.normalizeInterruptionHandler(handler));
        });

        this.currentWorkflow.unexpectedEventHandlers = [...existingHandlers, ...additions];
        return {
            addedCount: additions.length,
            skippedCount: handlersToAdd.length - additions.length
        };
    },

    populateInterruptionHandlerCopyTargets() {
        const select = document.getElementById('copyHandlerSourceWorkflow');
        const button = document.getElementById('copyHandlersButton');
        if (!select || !button) return;

        if (!this.currentWorkflow) {
            select.innerHTML = '<option value="">Open a workflow first</option>';
            select.disabled = true;
            button.disabled = true;
            return;
        }

        const currentId = this.currentWorkflow.id;
        const targets = (this.workflows || []).filter((workflow) =>
            workflow.id !== currentId &&
            Array.isArray(workflow.unexpectedEventHandlers) &&
            workflow.unexpectedEventHandlers.length > 0
        );

        if (!targets.length) {
            select.innerHTML = '<option value="">No workflows with handlers</option>';
            select.disabled = true;
            button.disabled = true;
            return;
        }

        select.disabled = false;
        select.innerHTML = '<option value="">Select source workflow</option>' + targets.map((workflow) => {
            const name = escapeHtml(workflow.name || 'Untitled Workflow');
            const count = workflow.unexpectedEventHandlers.length;
            return `<option value="${escapeHtml(workflow.id || '')}">${name} (${count})</option>`;
        }).join('');
        button.disabled = !select.value;
    },

    async copyInterruptionHandlersFromSelectedWorkflow() {
        if (!this.currentWorkflow) return;
        const select = document.getElementById('copyHandlerSourceWorkflow');
        const sourceId = select?.value;
        if (!sourceId) {
            this.showNotification('Select a source workflow first', 'warning');
            return;
        }

        const sourceWorkflow = (this.workflows || []).find((workflow) => workflow.id === sourceId);
        const sourceHandlers = Array.isArray(sourceWorkflow?.unexpectedEventHandlers)
            ? sourceWorkflow.unexpectedEventHandlers
            : [];
        if (!sourceHandlers.length) {
            this.showNotification('Selected workflow has no interruption handlers', 'warning');
            return;
        }

        const result = this.mergeInterruptionHandlersIntoCurrent(sourceHandlers);
        if (!result.addedCount) {
            this.showNotification('All handlers from this workflow already exist in current workflow', 'info');
            return;
        }

        await this.persistCurrentWorkflowHandlers();
        this.renderInterruptionHandlersPanel();
        this.showNotification(`Copied ${result.addedCount} interruption handler${result.addedCount > 1 ? 's' : ''} from "${sourceWorkflow?.name || 'workflow'}"`, 'success');
    },

    async copySelectedRepositoryHandlersToCurrent() {
        if (!this.currentWorkflow) return;
        const checkboxes = Array.from(document.querySelectorAll('.repo-handler-select:checked'));
        if (!checkboxes.length) {
            this.showNotification('Select at least one repository handler', 'warning');
            return;
        }

        const repository = this.buildInterruptionRepository({ includeStoredRepository: false });
        const selectedHandlers = checkboxes.map((checkbox) => {
            const index = Number(checkbox.getAttribute('data-repo-index'));
            return repository[index]?.handler || null;
        }).filter(Boolean);

        const result = this.mergeInterruptionHandlersIntoCurrent(selectedHandlers);
        if (!result.addedCount) {
            this.showNotification('Selected handlers already exist in current workflow', 'info');
            return;
        }

        await this.persistCurrentWorkflowHandlers();
        this.renderInterruptionHandlersPanel();
        this.showNotification(`Added ${result.addedCount} handler${result.addedCount > 1 ? 's' : ''} from repository`, 'success');
    },

    getSelectedRepositoryEntries() {
        const checkboxes = Array.from(document.querySelectorAll('.repo-handler-select:checked'));
        if (!checkboxes.length) return [];
        const repository = this.buildInterruptionRepository({ includeStoredRepository: false });
        return checkboxes.map((checkbox) => {
            const index = Number(checkbox.getAttribute('data-repo-index'));
            return repository[index] || null;
        }).filter(Boolean);
    },

    async unifySelectedRepositoryHandlers() {
        if (!this.currentWorkflow) return;
        const selectedEntries = this.getSelectedRepositoryEntries();
        if (selectedEntries.length < 2) {
            this.showNotification('Select at least 2 handlers to unify', 'warning');
            return;
        }
        this.openUnifyHandlersModal(selectedEntries.map((entry) => entry.handler));
    },

    async deleteSelectedRepositoryHandlers() {
        const selectedEntries = this.getSelectedRepositoryEntries();
        if (!selectedEntries.length) {
            this.showNotification('Select at least one repository handler', 'warning');
            return;
        }

        const signaturesToDelete = new Set(selectedEntries.map((entry) => entry.signature));
        let deletedCount = 0;

        (this.workflows || []).forEach((workflow) => {
            if (!Array.isArray(workflow?.unexpectedEventHandlers)) return;
            const before = workflow.unexpectedEventHandlers.length;
            workflow.unexpectedEventHandlers = workflow.unexpectedEventHandlers.filter((handler) => {
                const signature = this.getInterruptionHandlerSignature(handler);
                return !signaturesToDelete.has(signature);
            });
            deletedCount += Math.max(0, before - workflow.unexpectedEventHandlers.length);
        });

        if (this.currentWorkflow && Array.isArray(this.currentWorkflow.unexpectedEventHandlers)) {
            this.currentWorkflow.unexpectedEventHandlers = this.currentWorkflow.unexpectedEventHandlers.filter((handler) => {
                const signature = this.getInterruptionHandlerSignature(handler);
                return !signaturesToDelete.has(signature);
            });
        }

        const repositoryEntries = this.buildInterruptionRepository({ includeStoredRepository: false });
        this.interruptionHandlerRepository = repositoryEntries.map((entry) => this.cloneInterruptionHandler(entry.handler));
        await this.chrome.storage.local.set({
            workflows: this.workflows,
            interruptionHandlerRepository: this.interruptionHandlerRepository
        });
        this.renderInterruptionHandlersPanel();
        this.showNotification(
            `Deleted ${deletedCount} handler${deletedCount === 1 ? '' : 's'} from central repository`,
            'success'
        );
    },

    renderInterruptionHandlersPanel() {
        const container = document.getElementById('interruptionHandlersList');
        const repositoryContainer = document.getElementById('interruptionRepositoryList');
        const copySelect = document.getElementById('copyHandlerSourceWorkflow');
        const copyButton = document.getElementById('copyHandlersButton');
        const copySelectedButton = document.getElementById('copySelectedRepositoryHandlersButton');
        const unifySelectedButton = document.getElementById('unifySelectedRepositoryHandlersButton');
        const deleteSelectedButton = document.getElementById('deleteSelectedRepositoryHandlersButton');
        if (!container) return;

        if (copySelect && !copySelect.dataset.bound) {
            copySelect.addEventListener('change', () => {
                if (copyButton) {
                    copyButton.disabled = !copySelect.value;
                }
            });
            copySelect.dataset.bound = 'true';
        }
        if (copyButton && !copyButton.dataset.bound) {
            copyButton.addEventListener('click', () => this.copyInterruptionHandlersFromSelectedWorkflow());
            copyButton.dataset.bound = 'true';
        }
        if (copySelectedButton && !copySelectedButton.dataset.bound) {
            copySelectedButton.addEventListener('click', () => this.copySelectedRepositoryHandlersToCurrent());
            copySelectedButton.dataset.bound = 'true';
        }
        if (unifySelectedButton && !unifySelectedButton.dataset.bound) {
            unifySelectedButton.addEventListener('click', () => this.unifySelectedRepositoryHandlers());
            unifySelectedButton.dataset.bound = 'true';
        }
        if (deleteSelectedButton && !deleteSelectedButton.dataset.bound) {
            deleteSelectedButton.addEventListener('click', () => this.deleteSelectedRepositoryHandlers());
            deleteSelectedButton.dataset.bound = 'true';
        }
        this.populateInterruptionHandlerCopyTargets();

        if (!this.currentWorkflow) {
            container.innerHTML = '<p class="empty-state">Open a workflow to view learned handlers.</p>';
            if (repositoryContainer) {
                repositoryContainer.innerHTML = '<p class="empty-state">Open a workflow to browse repository handlers.</p>';
            }
            if (copySelectedButton) {
                copySelectedButton.disabled = true;
            }
            if (unifySelectedButton) {
                unifySelectedButton.disabled = true;
            }
            if (deleteSelectedButton) {
                deleteSelectedButton.disabled = true;
            }
            this.refreshInterruptionHandlersPanelHeight();
            return;
        }

        const handlers = Array.isArray(this.currentWorkflow.unexpectedEventHandlers)
            ? this.currentWorkflow.unexpectedEventHandlers
            : [];

        if (!handlers.length) {
            container.innerHTML = '<p class="empty-state">No interruption handlers yet. Run learning mode to create them.</p>';
        } else {
            container.innerHTML = handlers.map((handler, index) => {
                const summary = this.summarizeInterruptionHandler(handler);
                const triggerKind = escapeHtml(summary.triggerKind);
                const triggerText = escapeHtml(summary.triggerText);
                const actionSummary = escapeHtml(summary.actionSummary);
                const outcome = escapeHtml(summary.outcome);
                const matchMode = escapeHtml(summary.matchMode);
                const mode = handler?.mode === 'alwaysAsk' ? 'alwaysAsk' : 'auto';
                const enabled = handler?.enabled !== false;
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
        }

        const repository = this.buildInterruptionRepository({ includeStoredRepository: false });
        if (repositoryContainer) {
            if (!repository.length) {
                repositoryContainer.innerHTML = '<p class="empty-state">No interruption handlers in repository yet.</p>';
            } else {
                repositoryContainer.innerHTML = repository.map((entry, index) => {
                    const summary = this.summarizeInterruptionHandler(entry.handler);
                    const triggerKind = escapeHtml(summary.triggerKind);
                    const triggerText = escapeHtml(summary.triggerText);
                    const actionSummary = escapeHtml(summary.actionSummary);
                    const sourceSummary = escapeHtml((entry.sources || []).join(', ') || 'Repository');
                    return `
                        <div class="interruption-repository-item">
                            <div class="interruption-repository-select">
                                <label>
                                    <input type="checkbox" class="repo-handler-select" data-repo-index="${index}">
                                    ${triggerKind}
                                </label>
                                <span class="interruption-repository-source">${sourceSummary}</span>
                            </div>
                            <div class="interruption-handler-sub">Trigger: ${triggerText || '(no text template)'}</div>
                            <div class="interruption-handler-sub">Action: ${actionSummary || 'none'}</div>
                        </div>
                    `;
                }).join('');
            }
        }

        const updateRepositorySelectionState = () => {
            const checkedCount = document.querySelectorAll('.repo-handler-select:checked').length;
            if (copySelectedButton) {
                copySelectedButton.disabled = checkedCount === 0;
            }
            if (unifySelectedButton) {
                unifySelectedButton.disabled = checkedCount < 2;
            }
            if (deleteSelectedButton) {
                deleteSelectedButton.disabled = checkedCount === 0;
            }
        };

        document.querySelectorAll('.repo-handler-select').forEach((checkbox) => {
            checkbox.addEventListener('change', updateRepositorySelectionState);
        });
        updateRepositorySelectionState();

        if (handlers.length) {
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
        }

        this.refreshInterruptionHandlersPanelHeight();
    },

    updateDataSourceUIFromState() {},

    /**
     * Compute the longest common subsequence (LCS) of two arrays of tokens.
     * Returns an array of { token, indexA, indexB } describing matched positions.
     */
    computeLCS(tokensA, tokensB) {
        const m = tokensA.length;
        const n = tokensB.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (tokensA[i - 1] === tokensB[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        const result = [];
        let i = m;
        let j = n;
        while (i > 0 && j > 0) {
            if (tokensA[i - 1] === tokensB[j - 1]) {
                result.push({ token: tokensA[i - 1], indexA: i - 1, indexB: j - 1 });
                i--;
                j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return result.reverse();
    },

    /**
     * Tokenize a trigger text into words and punctuation for alignment.
     * Keeps punctuation as separate tokens so structural punctuation is preserved.
     */
    tokenizeForAlignment(text) {
        return (text || '').split(/(\s+|[.,;:!?'"()\[\]{}])/g).filter(t => t && t.trim());
    },

    /**
     * Given multiple trigger text strings, compute a generalized pattern that
     * captures the common structure and replaces variable parts with wildcards.
     *
     * Algorithm:
     *  1. Tokenize all texts.
     *  2. Iteratively compute the LCS between the running common pattern and
     *     each additional text's tokens.
     *  3. Contiguous gaps between LCS-matched tokens become {variable} placeholders.
     *  4. Adjacent placeholders are merged.
     *
     * This is fully data-driven — no hardcoded D365 message patterns required.
     */
    computeUnifiedPattern(texts) {
        if (!texts || !texts.length) return '';
        if (texts.length === 1) return texts[0];

        const normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const normalized = texts.map(normalize);

        // Start with the tokens of the first text as the baseline.
        let commonTokens = this.tokenizeForAlignment(normalized[0]);
        // Track which tokens in commonTokens are "fixed" vs "wildcard".
        // Initially, all tokens are fixed.
        let isWild = new Array(commonTokens.length).fill(false);

        for (let ti = 1; ti < normalized.length; ti++) {
            const nextTokens = this.tokenizeForAlignment(normalized[ti]);
            const lcs = this.computeLCS(commonTokens, nextTokens);

            // Build a new common token list that keeps only LCS matches and marks
            // gaps between them as wildcards.
            const newTokens = [];
            const newIsWild = [];
            let prevIdxA = -1;
            let prevIdxB = -1;

            for (const match of lcs) {
                // If the original already had wild tokens between prevIdxA and match.indexA,
                // or there is a gap of skipped tokens in either A or B, insert a wildcard.
                const gapA = match.indexA - prevIdxA - 1;
                const gapB = match.indexB - prevIdxB - 1;

                // Check if any skipped token in A was already wild
                let hadWild = false;
                for (let k = prevIdxA + 1; k < match.indexA; k++) {
                    if (isWild[k]) { hadWild = true; break; }
                }

                if (gapA > 0 || gapB > 0 || hadWild) {
                    // Only add a wildcard if the last entry isn't already one
                    if (!newIsWild.length || !newIsWild[newIsWild.length - 1]) {
                        newTokens.push('{...}');
                        newIsWild.push(true);
                    }
                }

                newTokens.push(match.token);
                newIsWild.push(false);
                prevIdxA = match.indexA;
                prevIdxB = match.indexB;
            }

            // Trailing gap
            if (prevIdxA < commonTokens.length - 1 || prevIdxB < nextTokens.length - 1) {
                if (!newIsWild.length || !newIsWild[newIsWild.length - 1]) {
                    newTokens.push('{...}');
                    newIsWild.push(true);
                }
            }

            commonTokens = newTokens;
            isWild = newIsWild;
        }

        // Rebuild pattern string. Multiple adjacent wildcards should already be
        // collapsed. Add nice placeholder names for readability.
        let wildcardCount = 0;
        const parts = commonTokens.map((token, idx) => {
            if (isWild[idx]) {
                wildcardCount++;
                return `{variable${wildcardCount > 1 ? wildcardCount : ''}}`;
            }
            return token;
        });

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    },

    /**
     * Convert a unified pattern with {variable} placeholders into a regex string.
     * Each placeholder becomes a `.*?` lazy wildcard.  Fixed text is escaped.
     */
    patternToRegex(pattern) {
        const placeholder = /\{[^}]+\}/g;
        const segments = pattern.split(placeholder);
        const matches = pattern.match(placeholder) || [];
        let regex = '';
        for (let i = 0; i < segments.length; i++) {
            regex += segments[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (i < matches.length) {
                regex += '.*?';
            }
        }
        return regex;
    },

    /**
     * Test a regex pattern against an array of original texts.
     * Returns { allMatch, results: [{ text, matched }] }.
     */
    validatePatternAgainstTexts(pattern, texts, matchMode) {
        const normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const normalizedPattern = normalize(pattern);

        if (matchMode === 'regex') {
            const regexStr = this.patternToRegex(normalizedPattern);
            let re;
            try {
                re = new RegExp(regexStr, 'i');
            } catch {
                return {
                    allMatch: false,
                    results: texts.map((text) => ({ text, matched: false, error: 'Invalid regex' }))
                };
            }
            const results = texts.map((text) => ({
                text,
                matched: re.test(normalize(text))
            }));
            return { allMatch: results.every((r) => r.matched), results };
        }

        // Contains mode: either the event text contains the pattern, or vice versa
        const results = texts.map((text) => {
            const normText = normalize(text);
            // For contains mode with placeholders, convert to regex under the hood
            if (normalizedPattern.includes('{')) {
                const regexStr = this.patternToRegex(normalizedPattern);
                try {
                    const re = new RegExp(regexStr, 'i');
                    return { text, matched: re.test(normText) };
                } catch {
                    return { text, matched: false };
                }
            }
            return {
                text,
                matched: normText.includes(normalizedPattern) || normalizedPattern.includes(normText)
            };
        });
        return { allMatch: results.every((r) => r.matched), results };
    },

    /**
     * Open the Unify Handlers modal with the selected repository handlers.
     */
    openUnifyHandlersModal(selectedHandlers) {
        if (!selectedHandlers || selectedHandlers.length < 2) {
            this.showNotification('Select at least 2 handlers to unify', 'warning');
            return;
        }

        // Collect trigger texts
        const triggerTexts = selectedHandlers.map((h) =>
            this.normalizeInterruptionTextTemplate(h?.trigger?.textTemplate || '')
        ).filter(Boolean);

        if (triggerTexts.length < 2) {
            this.showNotification('Selected handlers must have trigger texts to unify', 'warning');
            return;
        }

        // Compute unified pattern
        const pattern = this.computeUnifiedPattern(triggerTexts);

        // Show modal
        const modal = document.getElementById('unifyHandlersModal');
        if (!modal) return;

        // Populate source texts
        document.getElementById('unifyHandlerCount').textContent = String(selectedHandlers.length);
        const sourceTextsEl = document.getElementById('unifySourceTexts');
        sourceTextsEl.innerHTML = triggerTexts.map((t, i) =>
            `<div style="margin-bottom: 4px;"><strong>${i + 1}.</strong> ${escapeHtml(t)}</div>`
        ).join('');

        // Populate pattern
        const patternEl = document.getElementById('unifyPatternPreview');
        patternEl.value = pattern;

        // Action summary from first handler
        const firstSummary = this.summarizeInterruptionHandler(selectedHandlers[0]);
        document.getElementById('unifyActionSummary').textContent =
            `${firstSummary.actionSummary || 'none'} → ${firstSummary.outcome || 'next-step'}`;

        // Set outcome
        const outcomeEl = document.getElementById('unifyOutcomeSelect');
        outcomeEl.value = selectedHandlers[0]?.outcome || 'next-step';

        // Match mode
        const matchModeEl = document.getElementById('unifyMatchMode');
        matchModeEl.value = 'contains';

        // Store context for save
        this._unifyContext = {
            selectedHandlers: selectedHandlers.map((h) => this.cloneInterruptionHandler(h)),
            originalTexts: triggerTexts
        };

        // Update validation and regex preview
        this._updateUnifyPreview();

        // Show modal
        modal.classList.remove('is-hidden');
    },

    /**
     * Update the validation and regex preview in the unify modal.
     */
    _updateUnifyPreview() {
        const pattern = (document.getElementById('unifyPatternPreview')?.value || '').trim();
        const matchMode = document.getElementById('unifyMatchMode')?.value || 'contains';
        const regexGroup = document.getElementById('unifyRegexGroup');
        const regexPreview = document.getElementById('unifyRegexPreview');
        const validationEl = document.getElementById('unifyValidationResult');

        // Show/hide regex preview
        if (regexGroup) {
            regexGroup.style.display = matchMode === 'regex' ? '' : 'none';
        }

        // Generate regex preview
        if (regexPreview && pattern) {
            try {
                regexPreview.value = this.patternToRegex(
                    pattern.toLowerCase().replace(/\s+/g, ' ').trim()
                );
            } catch {
                regexPreview.value = '(invalid)';
            }
        }

        // Validate
        if (!validationEl || !this._unifyContext) return;
        const texts = this._unifyContext.originalTexts || [];
        if (!pattern) {
            validationEl.textContent = 'Enter a pattern to validate.';
            validationEl.style.background = '#fefce8';
            validationEl.style.borderColor = '#fde68a';
            return;
        }

        const validation = this.validatePatternAgainstTexts(pattern, texts, matchMode);
        if (validation.allMatch) {
            validationEl.innerHTML = `<strong>All ${texts.length} texts match the pattern.</strong>`;
            validationEl.style.background = '#f0fdf4';
            validationEl.style.borderColor = '#bbf7d0';
        } else {
            const failCount = validation.results.filter((r) => !r.matched).length;
            const details = validation.results.map((r, i) =>
                `<div style="margin: 2px 0; color: ${r.matched ? '#16a34a' : '#dc2626'};">${r.matched ? 'OK' : 'NO'} ${i + 1}. ${escapeHtml(r.text.slice(0, 100))}${r.text.length > 100 ? '...' : ''}</div>`
            ).join('');
            validationEl.innerHTML = `<strong style="color: #dc2626;">${failCount} of ${texts.length} texts do not match.</strong>${details}`;
            validationEl.style.background = '#fef2f2';
            validationEl.style.borderColor = '#fecaca';
        }
    },

    /**
     * Save the unified handler - creates a single handler with the computed pattern
     * and optionally removes the originals.
     */
    async saveUnifiedHandler() {
        if (!this._unifyContext || !this.currentWorkflow) return;

        const pattern = (document.getElementById('unifyPatternPreview')?.value || '').trim();
        const matchMode = document.getElementById('unifyMatchMode')?.value || 'contains';
        const outcome = document.getElementById('unifyOutcomeSelect')?.value || 'next-step';
        const removeOriginals = document.getElementById('unifyRemoveOriginals')?.checked ?? true;

        if (!pattern) {
            this.showNotification('Pattern cannot be empty', 'warning');
            return;
        }

        // Build the unified handler from the first selected handler as a base
        const baseHandler = this._unifyContext.selectedHandlers[0];
        const unifiedHandler = this.cloneInterruptionHandler(baseHandler);
        unifiedHandler.id = generateId('rule');
        unifiedHandler.createdAt = Date.now();
        unifiedHandler.trigger = {
            ...(unifiedHandler.trigger || {}),
            textTemplate: pattern,
            matchMode: matchMode === 'regex' ? 'regex' : 'contains'
        };
        if (matchMode === 'regex') {
            unifiedHandler.trigger.regex = this.patternToRegex(
                pattern.toLowerCase().replace(/\s+/g, ' ').trim()
            );
        }
        unifiedHandler.outcome = outcome;
        unifiedHandler.enabled = true;
        unifiedHandler.mode = 'auto';
        unifiedHandler.priority = 200; // higher priority than standard rules

        // Optionally remove original handlers from all workflows
        if (removeOriginals) {
            const originalSignatures = new Set(
                this._unifyContext.selectedHandlers.map((h) => this.getInterruptionHandlerSignature(h))
            );

            // Remove from current workflow
            if (Array.isArray(this.currentWorkflow.unexpectedEventHandlers)) {
                this.currentWorkflow.unexpectedEventHandlers = this.currentWorkflow.unexpectedEventHandlers.filter((h) => {
                    const sig = this.getInterruptionHandlerSignature(h);
                    return !originalSignatures.has(sig);
                });
            }

            // Remove from all workflows
            (this.workflows || []).forEach((wf) => {
                if (!Array.isArray(wf.unexpectedEventHandlers)) return;
                wf.unexpectedEventHandlers = wf.unexpectedEventHandlers.filter((h) => {
                    const sig = this.getInterruptionHandlerSignature(h);
                    return !originalSignatures.has(sig);
                });
            });
        }

        // Add unified handler to current workflow
        if (!Array.isArray(this.currentWorkflow.unexpectedEventHandlers)) {
            this.currentWorkflow.unexpectedEventHandlers = [];
        }
        this.currentWorkflow.unexpectedEventHandlers.push(unifiedHandler);

        const replacedCount = this._unifyContext?.selectedHandlers?.length || 0;

        // Persist
        await this.persistCurrentWorkflowHandlers();
        this.renderInterruptionHandlersPanel();

        // Close modal
        document.getElementById('unifyHandlersModal')?.classList.add('is-hidden');
        this._unifyContext = null;

        this.showNotification(
            `Created unified rule${removeOriginals ? ` (replaced ${replacedCount} originals)` : ''}`,
            'success'
        );
    },

    /**
     * Initialize the unify modal event listeners.
     */
    initUnifyHandlersModal() {
        const closeBtn = document.getElementById('closeUnifyModal');
        const cancelBtn = document.getElementById('unifyCancelBtn');
        const saveBtn = document.getElementById('unifySaveBtn');
        const patternEl = document.getElementById('unifyPatternPreview');
        const matchModeEl = document.getElementById('unifyMatchMode');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('unifyHandlersModal')?.classList.add('is-hidden');
                this._unifyContext = null;
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.getElementById('unifyHandlersModal')?.classList.add('is-hidden');
                this._unifyContext = null;
            });
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveUnifiedHandler());
        }
        if (patternEl) {
            patternEl.addEventListener('input', () => this._updateUnifyPreview());
        }
        if (matchModeEl) {
            matchModeEl.addEventListener('change', () => this._updateUnifyPreview());
        }
    },

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

    parseOptionalPositiveInt(value, max = 10000) {
        const parsed = parseInt(String(value ?? '').trim(), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.min(parsed, max);
    },

    getRandomSampleRows(rows, requestedCount) {
        if (!Array.isArray(rows)) return [];
        const count = this.parseOptionalPositiveInt(requestedCount);
        if (!count || rows.length <= count) {
            return rows.slice();
        }

        const copy = rows.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, count);
    },

    async resolveRuntimeSharedDataSourcesForWorkflow(workflow) {
        const sourceIds = new Set(this.collectReferencedSharedSourceIds(workflow));
        const runtimeSources = (this.sharedDataSources || []).map(source => JSON.parse(JSON.stringify(source)));
        const parseLimit = typeof this.parseOptionalPositiveInt === 'function'
            ? (value) => this.parseOptionalPositiveInt(value)
            : (value) => {
                const parsed = parseInt(String(value ?? '').trim(), 10);
                if (!Number.isFinite(parsed) || parsed <= 0) return null;
                return Math.min(parsed, 10000);
            };
        const sampleRows = typeof this.getRandomSampleRows === 'function'
            ? (rows, limit) => this.getRandomSampleRows(rows, limit)
            : (rows, limit) => {
                if (!Array.isArray(rows)) return [];
                if (!limit || rows.length <= limit) return rows.slice();
                const copy = rows.slice();
                for (let i = copy.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [copy[i], copy[j]] = [copy[j], copy[i]];
                }
                return copy.slice(0, limit);
            };

        const dynamicSources = runtimeSources.filter(source =>
            sourceIds.has(source.id) && source.type === 'odata-dynamic'
        );
        const fakerSources = runtimeSources.filter(source =>
            sourceIds.has(source.id) && source.type === 'faker'
        );

        // Resolve OData dynamic sources
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

        // Resolve faker sources - generate fresh random data at runtime
        for (const source of fakerSources) {
            const fakerFields = Array.isArray(source.fakerFields) ? source.fakerFields : [];
            const rowCount = source.fakerRowCount || 10;
            if (!fakerFields.length) {
                throw new Error(`Faker source "${source.name || source.id}" has no field definitions`);
            }

            const rows = this.generateFakerRows
                ? this.generateFakerRows(fakerFields, rowCount)
                : [];
            if (!rows.length) {
                throw new Error(`Faker source "${source.name || source.id}" generated no rows`);
            }

            source.data = rows;
            source.fields = Object.keys(rows[0] || {});
            this.addLog('info', `Generated faker data source "${source.name || source.id}" (${rows.length} rows)`);
        }

        // Optionally limit OData sources to a random runtime sample
        const referencedODataSources = runtimeSources.filter(source =>
            sourceIds.has(source.id) && (source.type === 'odata-cached' || source.type === 'odata-dynamic')
        );
        for (const source of referencedODataSources) {
            const limit = parseLimit(source.randomSampleCount);
            if (!limit || !Array.isArray(source.data) || source.data.length <= limit) continue;
            source.data = sampleRows(source.data, limit);
            source.fields = Object.keys(source.data[0] || {});
            this.addLog('info', `Sampled ${source.data.length} random rows from OData source "${source.name || source.id}"`);
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
        return workflowHasLoopsUtil(workflow);
    },

    normalizeParamName(name) {
        return normalizeParamNameUtil(name);
    },

    getParamNamesFromString(text) {
        return getParamNamesFromStringUtil(text);
    },

    extractRequiredParamsFromObject(obj, params) {
        extractRequiredParamsFromObjectUtil(obj, params);
    },

    getStepForParamExtraction(step) {
        return getStepForParamExtractionUtil(step);
    },

    extractRequiredParamsFromWorkflow(workflow) {
        return extractRequiredParamsFromWorkflowUtil(workflow);
    },

    normalizeBindingValue(value) {
        return normalizeBindingValueUtil(value);
    },

    buildNormalizedBindings(bindings) {
        return buildNormalizedBindingsUtil(bindings);
    },

    serializeDynamicBindingToken(name, binding) {
        return serializeDynamicBindingTokenUtil(name, binding);
    },

    substituteParamsInString(text, bindings, warnings, contextLabel) {
        return substituteParamsInStringUtil(text, bindings, { warnings, contextLabel });
    },

    applyParamBindingToValueField(rawValue, step, bindings, warnings, contextLabel) {
        return applyParamBindingToValueFieldUtil(rawValue, step, bindings, { warnings, contextLabel });
    },

    substituteParamsInObject(obj, bindings, warnings, contextLabel) {
        return substituteParamsInObjectUtil(obj, bindings, { warnings, contextLabel });
    },

    resolveBindingMap(rawBindings, parentBindings, warnings, contextLabel) {
        return resolveBindingMapUtil(rawBindings, parentBindings, { warnings, contextLabel });
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
                    workflow.id = generateId('workflow');
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














