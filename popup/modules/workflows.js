export const workflowMethods = {
    cancelWorkflowChanges() {
        if (this.originalWorkflowState) {
            // Restore original state
            this.currentWorkflow = JSON.parse(JSON.stringify(this.originalWorkflowState));
            this.loadDataSourcesFromWorkflow();
            document.getElementById('workflowName').value = this.currentWorkflow.name;
            this.displaySteps();
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
        document.getElementById('primaryDataSourceInput').style.display = 'none';
        document.getElementById('primaryDataInput').value = '';
        document.getElementById('primaryDataFields').innerHTML = '';
        document.getElementById('detailDataSources').innerHTML = '';
        document.getElementById('relationshipsSection').style.display = 'none';

        // Switch to builder tab
        document.querySelector('[data-tab="builder"]').click();
    },

    async loadWorkflows() {
        const result = await chrome.storage.local.get(['workflows']);
        this.workflows = result.workflows || [];
        this.displayWorkflows();
    },

    async loadResumeState() {
        const result = await chrome.storage.local.get(['resumeSkipByWorkflow']);
        this.resumeSkipByWorkflow = result.resumeSkipByWorkflow || {};
    },

    async saveWorkflow() {
        if (!this.currentWorkflow) return;

        this.currentWorkflow.name = document.getElementById('workflowName').value;

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

        this.showNotification('Workflow saved successfully!', 'success');
    },

    displayWorkflows() {
        const container = document.getElementById('workflowsList');
        container.innerHTML = '';

        if (this.workflows.length === 0) {
            container.innerHTML = '<p class="empty-state">No workflows yet. Click "New Workflow" to get started!</p>';
            return;
        }

        this.workflows.forEach(workflow => {
            const item = document.createElement('div');
            item.className = 'workflow-item';

            // Count loop blocks
            const loopStarts = workflow.steps.filter(s => s.type === 'loop-start').length;
            const hasData = workflow.dataSources?.primary?.type !== 'none';

            item.innerHTML = `
                <div class="workflow-info">
                    <h4>${workflow.name}</h4>
                    <p>${workflow.steps.length} steps${loopStarts > 0 ? `, ${loopStarts} loop(s)` : ''}${hasData ? ' • Has data' : ''}</p>
                </div>
                <div class="workflow-actions">
                    <button class="btn-icon" data-action="run" title="Run Workflow">▶️</button>
                    <button class="btn-icon" data-action="edit" title="Edit Workflow">✏️</button>
                    <button class="btn-icon" data-action="export" title="Export Workflow">📤</button>
                    <button class="btn-icon" data-action="delete" title="Delete Workflow">🗑️</button>
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
                    this.showNotification('Workflow deleted', 'success');
                }
            });

            container.appendChild(item);
        });
    },

    loadWorkflow(workflow) {
        this.currentWorkflow = JSON.parse(JSON.stringify(workflow));

        // Store original state for cancel functionality
        this.originalWorkflowState = JSON.parse(JSON.stringify(workflow));

        document.getElementById('workflowName').value = workflow.name;

        // Load data sources
        this.loadDataSourcesFromWorkflow();

        this.displaySteps();

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
            document.getElementById('primaryDataSourceInput').style.display = 'block';

            // Reconstruct the raw input if we have data
            if (this.dataSources.primary.data) {
                const type = this.dataSources.primary.type;
                let rawData = '';
                if (type === 'json') {
                    rawData = JSON.stringify(this.dataSources.primary.data, null, 2);
                } else if (type === 'csv') {
                    rawData = this.dataToCSV(this.dataSources.primary.data);
                } else if (type === 'excel') {
                    rawData = this.dataToTSV(this.dataSources.primary.data);
                }
                document.getElementById('primaryDataInput').value = rawData;
            }

            this.displayPrimaryDataFields();
        } else {
            document.getElementById('primaryDataSourceInput').style.display = 'none';
        }

        // Detail data sources
        this.renderDetailDataSources();

        // Relationships
        this.renderRelationships();
    },

    async executeWorkflow(workflow) {
        // Show run options modal first
        this.showRunOptionsModal(workflow);
    },

    async executeWorkflowWithOptions(workflow, runOptions) {
        try {
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
            const totalDataRows = workflow.dataSources?.primary?.data?.length || 0;
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
            this.executionState.currentWorkflowId = workflow.id;
            this.executionState.currentStepIndex = 0;
            this.executionState.totalSteps = workflow.steps.length;
            this.executionState.currentRow = 0;
            this.executionState.totalRows = totalDataRows;
            this.executionState.runOptions = runOptions;
            this.lastRunOptionsByWorkflow[workflow.id] = { ...runOptions };

            this.clearStepStatuses();
            this.updateExecutionBar();
            this.markWorkflowAsRunning(workflow.id);

            // Clear and open logs if dry run
            if (runOptions.dryRun) {
                this.logs = [];
                this.addLog('warning', 'DRY RUN MODE - No actual changes will be made');
                this.setLogsPanelOpen(true);
            }

            this.addLog('info', `Starting workflow: ${workflow.name}`);
            if (runOptions.skipRows > 0) {
                this.addLog('info', `Skipping first ${runOptions.skipRows} rows`);
            }
            if (runOptions.limitRows > 0) {
                this.addLog('info', `Limiting to ${runOptions.limitRows} rows`);
            }

            this.showNotification(`Running workflow: ${workflow.name}${runOptions.dryRun ? ' (DRY RUN)' : ''}...`, 'info');

            // Send workflow to content script for execution
            try {
                // Merge current UI settings into the workflow before executing
                const workflowToSend = JSON.parse(JSON.stringify(workflow));
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

    async importWorkflow() {
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

                    this.workflows.push(workflow);
                    await chrome.storage.local.set({ workflows: this.workflows });
                    this.displayWorkflows();
                    this.showNotification(`Workflow "${workflow.name}" imported successfully`, 'success');
                } catch (error) {
                    this.showNotification('Failed to import workflow: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
};

