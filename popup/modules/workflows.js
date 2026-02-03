export const workflowMethods = {
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
            dataSources: {
                primary: { type: 'none', data: null, fields: [] },
                details: [],
                relationships: []
            },
            settings: { ...this.settings }
        };

        // Reset data sources
        this.dataSources = {
            primary: { type: 'none', data: null, fields: [] },
            details: [],
            relationships: []
        };

        // Store original state for cancel functionality
        this.originalWorkflowState = JSON.parse(JSON.stringify(this.currentWorkflow));

        document.getElementById('workflowName').value = this.currentWorkflow.name;
        document.getElementById('stepsList').innerHTML = '';

        // Reset data source UI
        document.getElementById('primaryDataSourceType').value = 'none';
        document.getElementById('primaryDataSourceInput').classList.add('is-hidden');
        document.getElementById('primaryDataInput').value = '';
        document.getElementById('primaryDataFields').innerHTML = '';
        document.getElementById('detailDataSources').innerHTML = '';
        document.getElementById('relationshipsSection').classList.add('is-hidden');
        if (this.renderWorkflowProjects) {
            this.renderWorkflowProjects();
        }

        // Switch to builder tab
        document.querySelector('[data-tab="builder"]').click();
    },

    async loadWorkflows() {
        const result = await chrome.storage.local.get(['workflows']);
        this.workflows = result.workflows || [];
        this.displayWorkflows();
        if (this.updateNavButtonsWorkflowOptions) {
            this.updateNavButtonsWorkflowOptions();
        }
        if (this.renderProjectsManager) {
            this.renderProjectsManager();
        }
    },

    async loadResumeState() {
        const result = await chrome.storage.local.get(['resumeSkipByWorkflow']);
        this.resumeSkipByWorkflow = result.resumeSkipByWorkflow || {};
    },
    async saveWorkflow() {
        if (!this.currentWorkflow) return;

        this.currentWorkflow.name = document.getElementById('workflowName').value;
        if (this.syncCurrentWorkflowProjectsFromUI) {
            this.syncCurrentWorkflowProjectsFromUI();
        }

        // Save data sources with the workflow
        this.currentWorkflow.dataSources = JSON.parse(JSON.stringify(this.dataSources));

        // Update or add workflow
        const existingIndex = this.workflows.findIndex(w => w.id === this.currentWorkflow.id);
        if (existingIndex >= 0) {
            this.workflows[existingIndex] = this.currentWorkflow;
        } else {
            this.workflows.push(this.currentWorkflow);
        }

        await chrome.storage.local.set({ workflows: this.workflows });
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

        this.showNotification('Workflow saved successfully!', 'success');
    },
    displayWorkflows() {
        const container = document.getElementById('workflowsList');
        container.innerHTML = '';

        const workflows = this.getFilteredWorkflows ? this.getFilteredWorkflows() : this.workflows;

        if (this.workflows.length === 0) {
            container.innerHTML = '<p class="empty-state">No workflows yet. Click "New Workflow" to get started!</p>';
            return;
        }

        if (workflows.length === 0) {
            const projectName = this.getSelectedProjectName ? this.getSelectedProjectName() : 'this project';
            container.innerHTML = `<p class="empty-state">No workflows linked to ${projectName}.</p>`;
            return;
        }

        workflows.forEach(workflow => {
            const item = document.createElement('div');
            item.className = 'workflow-item';

            // Count loop blocks
            const loopStarts = workflow.steps.filter(s => s.type === 'loop-start').length;
            const hasData = workflow.dataSources?.primary?.type !== 'none';
            const projectNames = this.getProjectNamesByIds ? this.getProjectNamesByIds(workflow.projectIds || []) : [];

            item.innerHTML = `
                <div class="workflow-info">
                    <h4>${workflow.name}</h4>
                    <p>${workflow.steps.length} steps${loopStarts > 0 ? `, ${loopStarts} loop(s)` : ''}${hasData ? ' &bull; Has data' : ''}</p>
                    ${projectNames.length ? `<div class="workflow-project-tags">${projectNames.map(name => `<span class="project-tag">${name}</span>`).join('')}</div>` : ''}
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
                    await chrome.storage.local.set({ workflows: this.workflows });
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
                    this.showNotification('Workflow deleted', 'success');
                }
            });

            container.appendChild(item);
        });
    },
    loadWorkflow(workflow) {
        this.currentWorkflow = JSON.parse(JSON.stringify(workflow));
        if (!this.currentWorkflow.projectIds) {
            this.currentWorkflow.projectIds = [];
        }

        // Store original state for cancel functionality
        this.originalWorkflowState = JSON.parse(JSON.stringify(workflow));

        document.getElementById('workflowName').value = workflow.name;

        // Load data sources
        this.loadDataSourcesFromWorkflow();

        this.displaySteps();
        if (this.renderWorkflowProjects) {
            this.renderWorkflowProjects();
        }

        // Switch to builder tab
        document.querySelector('[data-tab="builder"]').click();
    },

    loadDataSourcesFromWorkflow() {
        if (this.currentWorkflow.dataSources) {
            this.dataSources = JSON.parse(JSON.stringify(this.currentWorkflow.dataSources));
        } else {
            // Legacy workflow - migrate old dataSource format
            this.dataSources = {
                primary: { type: 'none', data: null, fields: [] },
                details: [],
                relationships: []
            };

            if (this.currentWorkflow.dataSource && this.currentWorkflow.dataSource.type !== 'none') {
                this.dataSources.primary = {
                    type: this.currentWorkflow.dataSource.type,
                    data: this.currentWorkflow.dataSource.data,
                    fields: this.currentWorkflow.dataSource.data?.[0] ? Object.keys(this.currentWorkflow.dataSource.data[0]) : []
                };
            }
        }

        // Update UI
        this.updateDataSourceUIFromState();
    },

    updateDataSourceUIFromState() {
        // Primary data source
        document.getElementById('primaryDataSourceType').value = this.dataSources.primary.type;

        if (this.dataSources.primary.type !== 'none') {
            document.getElementById('primaryDataSourceInput').classList.remove('is-hidden');

            // Reconstruct the raw input if we have data
            if (this.dataSources.primary.data) {
                const type = this.dataSources.primary.type;
                let rawData = '';
                if (type === 'json') {
                    rawData = JSON.stringify(this.dataSources.primary.data, null, 2);
                } else if (type === 'csv') {
                    rawData = this.dataToCSV(this.dataSources.primary.data);
                }
                document.getElementById('primaryDataInput').value = rawData;
            }

            this.displayPrimaryDataFields();
        } else {
            document.getElementById('primaryDataSourceInput').classList.add('is-hidden');
        }

        // Detail data sources
        this.renderDetailDataSources();

        // Relationships
        this.renderRelationships();
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

    extractRequiredParamsFromWorkflow(workflow) {
        const params = new Set();
        (workflow?.steps || []).forEach(step => {
            this.extractRequiredParamsFromObject(step, params);
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
                warnings?.push(`Parameter "${name}" requires ${binding.valueSource} source but was used in text in ${contextLabel}.`);
                return '';
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

    async executeWorkflowWithOptions(workflow, runOptions) {
        try {
            let workflowToExecute = workflow;
            let expansionWarnings = [];
            try {
                const expansion = this.expandWorkflowForExecution(workflow);
                workflowToExecute = expansion.workflow;
                expansionWarnings = expansion.warnings || [];
            } catch (expansionError) {
                this.showNotification(expansionError.message || 'Failed to expand workflow', 'error');
                this.addLog('error', expansionError.message || 'Failed to expand workflow');
                return;
            }

            // Use linked tab if available
            let tab;
            if (this.linkedTabId) {
                try {
                    tab = await chrome.tabs.get(this.linkedTabId);
                } catch (e) {
                    this.linkedTabId = null;
                }
            }

            if (!tab) {
                // Try to find a D365 tab
                const tabs = await chrome.tabs.query({});
                tab = tabs.find(t => t.url && (t.url.includes('dynamics.com') || t.url.includes('cloudax.dynamics.com')));
            }

            if (!tab) {
                this.showNotification('No D365FO tab found. Please open D365FO and click the extension icon.', 'error');
                return;
            }

            // Check if we're on a valid URL
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                this.showNotification('Cannot run on Chrome internal pages', 'error');
                return;
            }

            // Initialize execution state
            const totalDataRows = workflowToExecute.dataSources?.primary?.data?.length || 0;
            let effectiveRowCount = totalDataRows;

            // Calculate how many rows will actually be processed
            if (runOptions.skipRows > 0) {
                effectiveRowCount = Math.max(0, effectiveRowCount - runOptions.skipRows);
            }
            if (runOptions.limitRows > 0) {
                effectiveRowCount = Math.min(effectiveRowCount, runOptions.limitRows);
            }

            this.executionState.isRunning = true;
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

            this.addLog('info', `Starting workflow: ${workflowToExecute.name}`);
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

                await chrome.tabs.sendMessage(tab.id, {
                    action: 'executeWorkflow',
                    workflow: workflowToSend,
                    data: workflowToSend.dataSources?.primary?.data || workflowToSend.dataSource?.data,
                    runOptions: runOptions
                });
            } catch (msgError) {
                // Content script not loaded - reload the page first
                if (msgError.message.includes('Receiving end does not exist')) {
                    this.showNotification('Please refresh the D365FO page first, then try again', 'error');
                    this.executionState.isRunning = false;
                    this.updateExecutionBar();
                    this.markWorkflowAsNotRunning();
                } else {
                    throw msgError;
                }
            }

        } catch (error) {
            console.error('Error executing workflow:', error);
            this.showNotification('Failed to run workflow: ' + error.message, 'error');
            this.executionState.isRunning = false;
            this.updateExecutionBar();
            this.markWorkflowAsNotRunning();
            this.addLog('error', `Failed to start workflow: ${error.message}`);
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

                    this.workflows.push(workflow);
                    await chrome.storage.local.set({ workflows: this.workflows });
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













