// Popup UI Controller

class PopupController {
    constructor() {
        this.currentWorkflow = null;
        this.currentStep = null;
        this.workflows = [];
        this.discoveredElements = [];
        this.settings = this.loadSettings();
        this.linkedTabId = null;
        this.originalWorkflowState = null; // For cancel functionality
        this.autoSaveTimeout = null;
        
        // Data sources management
        this.dataSources = {
            primary: { type: 'none', data: null, fields: [] },
            details: [], // Array of { id, name, type, data, fields, linkedTo, linkFields }
            relationships: [] // Array of { detailId, primaryField, detailField }
        };
        
        // Execution state
        this.executionState = {
            isRunning: false,
            isPaused: false,
            currentWorkflowId: null,
            currentStepIndex: 0,
            totalSteps: 0,
            currentRow: 0,
            totalRows: 0,
            runOptions: {
                skipRows: 0,
                limitRows: 0,
                dryRun: false,
                showLogs: false
            }
        };
        
        // Logs
        this.logs = [];
        this.resumeSkipByWorkflow = {};
        this.lastRunOptionsByWorkflow = {};
        this.lastFailureInfo = null;
        
        this.init();
    }

    async init() {
        await this.loadResumeState();
        // Get the linked tab from background
        await this.initLinkedTab();
        
        // Check if we're connected to a D365 page
        this.checkD365Status();

        // Load workflows from storage
        await this.loadWorkflows();

        // Set up tab navigation
        this.setupTabs();

        // Set up event listeners
        this.setupEventListeners();

        // Load settings into UI
        this.loadSettingsUI();

        // Check if we were waiting for an element pick (do this AFTER DOM setup)
        await this.checkForPickedElement();
    }
    
    async initLinkedTab() {
        // Get linked tab from storage/background
        const result = await chrome.storage.local.get(['linkedTabId', 'linkedTabUrl']);
        
        if (result.linkedTabId) {
            try {
                const tab = await chrome.tabs.get(result.linkedTabId);
                this.linkedTabId = tab.id;
                this.updateLinkedTabUI(tab);
            } catch (e) {
                // Tab no longer exists
                this.linkedTabId = null;
                this.updateLinkedTabUI(null);
            }
        } else {
            // Try to get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && (tab.url.includes('dynamics.com') || tab.url.includes('cloudax.dynamics.com'))) {
                this.linkedTabId = tab.id;
                await chrome.storage.local.set({ linkedTabId: tab.id, linkedTabUrl: tab.url });
                this.updateLinkedTabUI(tab);
            }
        }
    }
    
    updateLinkedTabUI(tab) {
        const linkedTabInfo = document.getElementById('linkedTabInfo');
        const linkedTabName = document.getElementById('linkedTabName');
        
        if (tab && tab.url) {
            linkedTabInfo.classList.remove('disconnected');
            // Extract page name from URL or title
            const pageName = tab.title ? tab.title.split(' - ')[0] : 'D365FO';
            linkedTabName.textContent = pageName.substring(0, 25) + (pageName.length > 25 ? '...' : '');
            linkedTabName.title = tab.title || tab.url;
        } else {
            linkedTabInfo.classList.add('disconnected');
            linkedTabName.textContent = 'No tab linked';
            linkedTabName.title = 'Click extension icon while on a D365FO page';
        }
    }
    
    async checkForPickedElement() {
        const result = await chrome.storage.local.get(['waitingForPick', 'pickedElement', 'currentStepData', 'currentWorkflowData']);
        
        if (result.waitingForPick && result.pickedElement) {
            console.log('Picked element detected:', result.pickedElement);
            
            // Restore current workflow if exists
            if (result.currentWorkflowData) {
                this.currentWorkflow = result.currentWorkflowData;
                document.getElementById('workflowName').value = this.currentWorkflow.name || '';
                this.loadDataSourcesFromWorkflow();
                this.displaySteps();
            }
            
            // Restore current step
            if (result.currentStepData) {
                this.currentStep = result.currentStepData;
            }
            
            // Switch to builder tab FIRST
            document.querySelector('[data-tab="builder"]').click();
            
            // Small delay to ensure tab content is visible
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Show the step editor
            this.showStepEditor();
            
            // Process the picked element
            await this.handleElementPicked(result.pickedElement);
            
            // Show success notification
            this.showNotification(`Element picked: ${result.pickedElement.displayText}`, 'success');
            
            console.log('Element applied to step:', this.currentStep);
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
            font-size: 14px;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    async checkD365Status() {
        try {
            // Use linked tab if available, otherwise try active tab
            let tab;
            if (this.linkedTabId) {
                try {
                    tab = await chrome.tabs.get(this.linkedTabId);
                } catch (e) {
                    // Linked tab no longer exists
                    this.linkedTabId = null;
                }
            }
            
            if (!tab) {
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            }
            
            if (!tab) {
                this.setStatus('disconnected', 'No tab available');
                return;
            }
            
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkD365' });
            
            if (response && response.isD365) {
                this.setStatus('connected', 'Connected to D365FO');
                // Update linked tab
                this.linkedTabId = tab.id;
                await chrome.storage.local.set({ linkedTabId: tab.id });
                this.updateLinkedTabUI(tab);
            } else {
                this.setStatus('disconnected', 'Not a D365FO page');
            }
        } catch (error) {
            this.setStatus('disconnected', 'Not connected');
        }
    }

    setStatus(status, text) {
        const indicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        
        if (status === 'connected') {
            indicator.classList.add('connected');
        } else {
            indicator.classList.remove('connected');
        }
        
        statusText.textContent = text;
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`${tabName}-tab`).classList.add('active');

                // Special actions when tabs are activated
                if (tabName === 'inspector') {
                    // Auto-refresh elements when inspector tab is opened
                }
            });
        });
    }

    setupEventListeners() {
        // Workflows tab
        document.getElementById('newWorkflow').addEventListener('click', () => this.createNewWorkflow());
        document.getElementById('importWorkflow').addEventListener('click', () => this.importWorkflow());

        // Builder tab
        document.getElementById('addStep').addEventListener('click', () => this.addStep());
        document.getElementById('saveWorkflow').addEventListener('click', () => this.saveWorkflow());
        document.getElementById('cancelWorkflow').addEventListener('click', () => this.cancelWorkflowChanges());
        document.getElementById('stepType').addEventListener('change', (e) => {
            this.updateStepFields(e.target.value);
            this.autoSaveStep();
        });
        document.getElementById('cancelStep').addEventListener('click', () => this.closeStepEditor());
        document.getElementById('closeEditor').addEventListener('click', () => this.closeStepEditor());
        document.getElementById('deleteStep').addEventListener('click', () => this.deleteCurrentStep());

        // Data Sources
        document.getElementById('primaryDataSourceType').addEventListener('change', (e) => this.updatePrimaryDataSourceUI(e.target.value));
        document.getElementById('validatePrimaryData').addEventListener('click', () => this.validatePrimaryData());
        document.getElementById('addDetailDataSource').addEventListener('click', () => this.addDetailDataSource());
        
        // Data Sources Panel Toggle
        document.getElementById('dataSourcesHeader').addEventListener('click', () => this.toggleDataSourcesPanel());

        // Inspector tab
        document.getElementById('startInspector').addEventListener('click', () => this.startInspector());
        document.getElementById('refreshElements').addEventListener('click', () => this.refreshElements());
        document.getElementById('elementFilter').addEventListener('input', (e) => this.filterElements(e.target.value));
        document.getElementById('elementTypeFilter').addEventListener('change', (e) => this.filterElements());

        // Settings tab
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());

        // Execution controls
        document.getElementById('toggleLogs')?.addEventListener('click', () => this.toggleLogsPanel());
        document.getElementById('pauseBtn')?.addEventListener('click', () => this.pauseExecution());
        document.getElementById('resumeBtn')?.addEventListener('click', () => this.resumeExecution());
        document.getElementById('stopBtn')?.addEventListener('click', () => this.stopExecution());
        
        // Logs panel controls
        document.getElementById('closeLogs')?.addEventListener('click', () => this.toggleLogsPanel());
        document.getElementById('clearLogs')?.addEventListener('click', () => this.clearLogs());
        document.getElementById('exportLogs')?.addEventListener('click', () => this.exportLogs());
        document.getElementById('logLevelFilter')?.addEventListener('change', (e) => this.filterLogs(e.target.value));
        
        // Run options modal
        document.getElementById('closeRunOptions')?.addEventListener('click', () => this.hideRunOptionsModal());
        document.getElementById('cancelRun')?.addEventListener('click', () => this.hideRunOptionsModal());
        document.getElementById('confirmRun')?.addEventListener('click', () => this.confirmRunWorkflow());

        // Resume modal
        document.getElementById('closeResumeModal')?.addEventListener('click', () => this.hideResumeModal());
        document.getElementById('resumeCancel')?.addEventListener('click', () => this.hideResumeModal());
        document.getElementById('resumeThisRecord')?.addEventListener('click', () => this.resumeFromFailure('current'));
        document.getElementById('resumeNextRecord')?.addEventListener('click', () => this.resumeFromFailure('next'));
        
        // Active form filter checkbox
        document.getElementById('activeFormOnly')?.addEventListener('change', () => this.refreshElements());
        
        // Form filter dropdown
        document.getElementById('formFilter')?.addEventListener('change', () => this.filterElements());

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'elementsDiscovered') {
                this.displayDiscoveredElements(request.elements, request.activeForm);
            }
            if (request.action === 'elementPicked') {
                this.handleElementPicked(request.element);
            }
            if (request.action === 'workflowProgress') {
                const progress = request.progress || {};
                this.handleWorkflowProgress(progress);
            }
            if (request.action === 'workflowComplete') {
                this.handleWorkflowComplete();
            }
            if (request.action === 'workflowError') {
                const err = request.error || {};
                this.handleWorkflowError(err);
            }
            if (request.action === 'workflowLog') {
                this.addLog(request.log.level, request.log.message);
            }
        });
        
        // Linked tab click - allow relinking
        document.getElementById('linkedTabInfo').addEventListener('click', () => this.relinkTab());
    }
    
    async relinkTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tab && tab.url && (tab.url.includes('dynamics.com') || tab.url.includes('cloudax.dynamics.com'))) {
                this.linkedTabId = tab.id;
                await chrome.storage.local.set({ linkedTabId: tab.id, linkedTabUrl: tab.url });
                this.updateLinkedTabUI(tab);
                this.checkD365Status();
                this.showNotification('Linked to: ' + tab.title, 'success');
            } else {
                this.showNotification('Please focus a D365FO tab first', 'error');
            }
        } catch (e) {
            this.showNotification('Failed to link tab', 'error');
        }
    }
    
    // === Execution State Management ===
    
    handleWorkflowProgress(progress) {
        if (progress.phase === 'stepStart') {
            this.setStepStatus(progress.stepIndex, 'running');
            this.executionState.currentStepIndex = progress.stepIndex;
            this.updateExecutionBar();
            this.addLog('info', `Starting step ${progress.stepIndex + 1}: ${progress.stepName || 'Step'}`);
        } else if (progress.phase === 'stepDone') {
            this.setStepStatus(progress.stepIndex, 'success');
            this.addLog('success', `Completed step ${progress.stepIndex + 1}`);
            this.updateExecutionBar();
        } else if (progress.phase === 'rowStart') {
            const rowIndex = typeof progress.row === 'number'
                ? progress.row
                : (typeof progress.processedRows === 'number' ? progress.processedRows - 1 : 0);
            const totalRows = typeof progress.totalRows === 'number'
                ? progress.totalRows
                : (typeof progress.totalToProcess === 'number' ? progress.totalToProcess : 0);
            
            // Update execution state with processed rows count (0-based)
            this.executionState.currentRow = rowIndex;
            this.executionState.totalRows = totalRows;
            this.updateExecutionBar();
            
            // Log with actual row number from original data
            const actualRowNum = rowIndex + 1;
            const totalInOriginal = totalRows;
            const processInfo = progress.totalToProcess && progress.totalToProcess < totalInOriginal
                ? ` (processing ${progress.processedRows} of ${progress.totalToProcess} selected rows)`
                : '';
            this.addLog('info', `Processing row ${actualRowNum} of ${totalInOriginal}${processInfo}`);
        } else if (progress.phase === 'loopIteration') {
            this.addLog('info', `Loop iteration ${progress.iteration} of ${progress.total}`);
        }
    }
    
    handleWorkflowComplete() {
        const workflowId = this.executionState.currentWorkflowId;
        this.executionState.isRunning = false;
        this.executionState.isPaused = false;
        this.updateExecutionBar();
        this.markWorkflowAsNotRunning();
        this.showNotification('Workflow completed successfully!', 'success');
        this.addLog('success', '✓ Workflow completed successfully');
        
        if (workflowId && this.resumeSkipByWorkflow?.[workflowId]) {
            delete this.resumeSkipByWorkflow[workflowId];
            chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});
        }
    }
    
    handleWorkflowError(err) {
        const workflowId = this.executionState.currentWorkflowId;
        const stepIndex = typeof err.stepIndex === 'number' ? err.stepIndex : null;
        if (stepIndex !== null) {
            this.setStepStatus(stepIndex, 'error');
        }
        const stepLabel = err.step?.displayText || err.step?.controlName;
        const message = err.message || err.error || 'Workflow error';
        
        this.executionState.isRunning = false;
        this.executionState.isPaused = false;
        this.updateExecutionBar();
        this.markWorkflowAsNotRunning();
        
        this.addLog('error', `Error: ${stepLabel ? `Step "${stepLabel}": ` : ''}${message}`);
        this.showNotification(stepLabel ? `Step failed (${stepLabel}): ${message}` : message, 'error');

        if (workflowId) {
            const resumeSkip = Math.max(0, this.executionState.currentRow);
            this.resumeSkipByWorkflow = this.resumeSkipByWorkflow || {};
            this.resumeSkipByWorkflow[workflowId] = resumeSkip;
            chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});

            this.lastFailureInfo = {
                workflowId: workflowId,
                rowIndex: this.executionState.currentRow,
                totalRows: this.executionState.totalRows
            };
            this.showResumeModal();
        }
    }
    
    updateExecutionBar() {
        const executionBar = document.getElementById('executionBar');
        const statusText = document.getElementById('executionStatus');
        const statusIndicator = document.querySelector('.running-indicator');
        const progressFill = document.getElementById('progressFill');
        const stepInfo = document.getElementById('executionStep');
        const rowInfo = document.getElementById('executionRow');
        const pauseBtn = document.getElementById('pauseBtn');
        const resumeBtn = document.getElementById('resumeBtn');
        
        if (!executionBar) return;
        
        if (this.executionState.isRunning) {
            executionBar.style.display = 'block';
            if (statusIndicator) statusIndicator.style.display = 'block';
            
            if (this.executionState.isPaused) {
                statusText.textContent = 'Paused';
                if (statusIndicator) statusIndicator.classList.add('paused');
                if (pauseBtn) pauseBtn.style.display = 'none';
                if (resumeBtn) resumeBtn.style.display = 'inline-flex';
            } else {
                statusText.textContent = 'Running';
                if (statusIndicator) statusIndicator.classList.remove('paused');
                if (pauseBtn) pauseBtn.style.display = 'inline-flex';
                if (resumeBtn) resumeBtn.style.display = 'none';
            }
            
            // Progress calculation
            const progress = this.executionState.totalSteps > 0 
                ? ((this.executionState.currentStepIndex + 1) / this.executionState.totalSteps) * 100 
                : 0;
            if (progressFill) progressFill.style.width = `${progress}%`;
            
            // Step info
            if (stepInfo) stepInfo.textContent = `Step ${this.executionState.currentStepIndex + 1}/${this.executionState.totalSteps}`;
            
            // Row info (if applicable)
            if (rowInfo) {
                if (this.executionState.totalRows > 0) {
                    rowInfo.textContent = `Row ${this.executionState.currentRow + 1}/${this.executionState.totalRows}`;
                    rowInfo.style.display = 'inline';
                } else {
                    rowInfo.style.display = 'none';
                }
            }
        } else {
            executionBar.style.display = 'none';
        }
    }
    
    markWorkflowAsRunning(workflowId) {
        this.executionState.currentWorkflowId = workflowId;
        const items = document.querySelectorAll('.workflow-item');
        items.forEach(item => {
            const workflow = this.workflows.find(w => item.querySelector('h4')?.textContent === w.name);
            if (workflow && workflow.id === workflowId) {
                item.classList.add('running');
            }
        });
    }
    
    markWorkflowAsNotRunning() {
        this.executionState.currentWorkflowId = null;
        document.querySelectorAll('.workflow-item.running').forEach(item => {
            item.classList.remove('running');
        });
    }
    
    // === Execution Controls ===
    
    async pauseExecution() {
        if (!this.executionState.isRunning || this.executionState.isPaused) return;
        
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'pauseWorkflow' });
            this.executionState.isPaused = true;
            this.updateExecutionBar();
            this.addLog('warning', '⏸ Workflow paused');
            this.showNotification('Workflow paused', 'warning');
        }
    }
    
    async resumeExecution() {
        if (!this.executionState.isRunning || !this.executionState.isPaused) return;
        
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'resumeWorkflow' });
            this.executionState.isPaused = false;
            this.updateExecutionBar();
            this.addLog('info', '▶ Workflow resumed');
            this.showNotification('Workflow resumed', 'info');
        }
    }
    
    async stopExecution() {
        if (!this.executionState.isRunning) return;
        
        if (!confirm('Stop the running workflow? This cannot be undone.')) return;
        
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'stopWorkflow' });
            this.executionState.isRunning = false;
            this.executionState.isPaused = false;
            this.updateExecutionBar();
            this.markWorkflowAsNotRunning();
            this.clearStepStatuses();
            this.addLog('error', '⏹ Workflow stopped by user');
            this.showNotification('Workflow stopped', 'warning');
        }
    }
    
    // === Logs Panel ===
    
    toggleLogsPanel() {
        const logsPanel = document.getElementById('logsPanel');
        if (logsPanel) {
            logsPanel.classList.toggle('open');
        }
    }
    
    addLog(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push({ level, message, timestamp });
        
        // Keep only last 500 logs
        if (this.logs.length > 500) {
            this.logs = this.logs.slice(-500);
        }
        
        this.renderLogs();
    }
    
    renderLogs() {
        const container = document.getElementById('logsContent');
        if (!container) return;
        
        const filter = document.getElementById('logLevelFilter')?.value || 'all';
        const filtered = filter === 'all' ? this.logs : this.logs.filter(l => l.level === filter);
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="log-empty">No logs yet. Run a workflow to see execution logs.</div>';
            return;
        }
        
        container.innerHTML = filtered.map(log => `
            <div class="log-entry ${log.level}">
                <span class="log-time">${log.timestamp}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');
        
        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }
    
    filterLogs(level) {
        this.renderLogs();
    }
    
    clearLogs() {
        this.logs = [];
        this.renderLogs();
        this.showNotification('Logs cleared', 'info');
    }
    
    exportLogs() {
        if (this.logs.length === 0) {
            this.showNotification('No logs to export', 'warning');
            return;
        }
        
        const logText = this.logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        this.showNotification('Logs exported', 'success');
    }
    
    // === Run Options Modal ===
    
    showRunOptionsModal(workflow) {
        this.pendingWorkflow = workflow;
        
        // Reset form
        document.getElementById('runSkipRows').value = '0';
        document.getElementById('runLimitRows').value = '0';
        document.getElementById('runDryMode').checked = false;
        document.getElementById('runWithLogs').checked = true;
        
        // Calculate total rows
        const totalRows = workflow.dataSources?.primary?.data?.length || 0;
        
        // Show modal
        document.getElementById('runOptionsModal').style.display = 'flex';
    }
    
    hideRunOptionsModal() {
        document.getElementById('runOptionsModal').style.display = 'none';
        this.pendingWorkflow = null;
    }

    showResumeModal() {
        const info = this.lastFailureInfo;
        if (!info || !info.workflowId) return;
        
        const rowNumber = typeof info.rowIndex === 'number' ? info.rowIndex + 1 : 1;
        const totalRows = typeof info.totalRows === 'number' ? info.totalRows : 0;
        const message = totalRows > 0
            ? `The workflow stopped at row ${rowNumber} of ${totalRows}.`
            : `The workflow stopped at row ${rowNumber}.`;
        
        const messageEl = document.getElementById('resumeMessage');
        if (messageEl) messageEl.textContent = message;
        
        const resumeNextBtn = document.getElementById('resumeNextRecord');
        if (resumeNextBtn) {
            const isLastRow = totalRows > 0 && rowNumber >= totalRows;
            resumeNextBtn.style.display = isLastRow ? 'none' : 'inline-flex';
        }
        
        document.getElementById('resumeModal').style.display = 'flex';
    }

    hideResumeModal() {
        const modal = document.getElementById('resumeModal');
        if (modal) modal.style.display = 'none';
    }

    resumeFromFailure(mode) {
        const info = this.lastFailureInfo;
        if (!info || !info.workflowId) return;
        
        const workflow = this.workflows.find(w => w.id === info.workflowId);
        if (!workflow) {
            this.showNotification('Workflow not found for resume', 'error');
            return;
        }
        
        const totalDataRows = workflow.dataSources?.primary?.data?.length || 0;
        const baseRunOptions = this.lastRunOptionsByWorkflow[info.workflowId] || this.executionState.runOptions || {};
        const baseSkip = baseRunOptions.skipRows || 0;
        const baseLimit = baseRunOptions.limitRows || 0;
        const baseEndExclusive = baseLimit > 0 ? baseSkip + baseLimit : totalDataRows;
        
        const resumeSkip = mode === 'next' ? (info.rowIndex + 1) : info.rowIndex;
        if (resumeSkip >= totalDataRows) {
            this.showNotification('No more rows to process', 'warning');
            return;
        }
        
        let resumeLimit = 0;
        if (baseLimit > 0) {
            const remaining = baseEndExclusive - resumeSkip;
            if (remaining <= 0) {
                this.showNotification('No remaining rows within the original limit', 'warning');
                return;
            }
            resumeLimit = remaining;
        }
        
        const runOptions = {
            skipRows: Math.max(0, resumeSkip),
            limitRows: resumeLimit,
            dryRun: !!baseRunOptions.dryRun,
            showLogs: typeof baseRunOptions.showLogs === 'boolean' ? baseRunOptions.showLogs : true
        };
        
        this.resumeSkipByWorkflow = this.resumeSkipByWorkflow || {};
        this.resumeSkipByWorkflow[info.workflowId] = runOptions.skipRows;
        chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});
        
        this.hideResumeModal();
        this.executeWorkflowWithOptions(workflow, runOptions);
    }
    
    confirmRunWorkflow() {
        if (!this.pendingWorkflow) return;
        
        // Save workflow reference BEFORE hiding modal (which sets pendingWorkflow to null)
        const workflow = this.pendingWorkflow;
        
        const runOptions = {
            skipRows: parseInt(document.getElementById('runSkipRows').value) || 0,
            limitRows: parseInt(document.getElementById('runLimitRows').value) || 0,
            dryRun: document.getElementById('runDryMode').checked,
            showLogs: document.getElementById('runWithLogs').checked
        };
        
        // Open logs panel if requested
        if (runOptions.showLogs) {
            document.getElementById('logsPanel')?.classList.add('open');
        }
        
        this.hideRunOptionsModal();
        this.executeWorkflowWithOptions(workflow, runOptions);
    }
    
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
    }

    toggleDataSourcesPanel() {
        const header = document.getElementById('dataSourcesHeader');
        const body = document.getElementById('dataSourcesBody');
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
    }

    // === Workflow Management ===

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
    }

    async loadWorkflows() {
        const result = await chrome.storage.local.get(['workflows']);
        this.workflows = result.workflows || [];
        this.displayWorkflows();
    }

    async loadResumeState() {
        const result = await chrome.storage.local.get(['resumeSkipByWorkflow']);
        this.resumeSkipByWorkflow = result.resumeSkipByWorkflow || {};
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    async executeWorkflow(workflow) {
        // Show run options modal first
        this.showRunOptionsModal(workflow);
    }
    
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
                this.addLog('warning', '🔬 DRY RUN MODE - No actual changes will be made');
                document.getElementById('logsPanel')?.classList.add('open');
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
    }

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
    }

    async importWorkflow() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            try {
                const file = e.target.files[0];
                if (!file) return;
                
                const text = await file.text();
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
        input.click();
    }

    // === Step Management ===

    addStep() {
        if (!this.currentWorkflow) {
            this.createNewWorkflow();
        }

        this.currentStep = {
            id: Date.now().toString(),
            type: 'click',
            controlName: '',
            value: '',
            fieldMapping: ''
        };

        this.showStepEditor();
    }

    showStepEditor() {
        document.getElementById('stepsPanel').style.display = 'none';
        document.getElementById('stepEditorOverlay').style.display = 'flex';
        document.getElementById('stepType').value = this.currentStep.type;
        
        // Show delete button only for existing steps (not new ones)
        const isExistingStep = this.currentWorkflow?.steps?.some(s => s.id === this.currentStep.id);
        document.getElementById('deleteStep').style.display = isExistingStep ? 'inline-flex' : 'none';
        document.getElementById('stepEditorTitle').textContent = isExistingStep ? 'Edit Step' : 'New Step';
        
        this.updateStepFields(this.currentStep.type);
    }

    hideStepEditor() {
        document.getElementById('stepEditorOverlay').style.display = 'none';
        document.getElementById('stepsPanel').style.display = 'block';
    }

    updateStepFields(stepType) {
        const container = document.getElementById('stepTypeFields');
        container.innerHTML = '';

        if (stepType === 'click') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Button Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., SystemDefinedNewButton">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        🔍 Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., New">
                </div>
            `;
        } else if (stepType === 'input' || stepType === 'select' || stepType === 'lookupSelect') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            container.innerHTML = `
                <div class="form-group">
                    <label>Field Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., LanguageTxt_LanguageId1">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        🔍 Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${!hasFieldMapping ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${hasFieldMapping ? 'selected' : ''}>From Data Field</option>
                    </select>
                </div>
                <div class="form-group" id="staticValueGroup" ${hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Enter value">
                </div>
                <div class="form-group" id="dataFieldGroup" ${!hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const isData = e.target.value === 'data';
                    document.getElementById('staticValueGroup').style.display = isData ? 'none' : 'block';
                    document.getElementById('dataFieldGroup').style.display = isData ? 'block' : 'none';
                });
            }, 0);
        } else if (stepType === 'checkbox') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Checkbox Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., Prorate">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        🔍 Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Prorate">
                </div>
                <div class="form-group">
                    <label>Action</label>
                    <select id="stepValue" class="form-control">
                        <option value="true" ${this.currentStep?.value === 'true' ? 'selected' : ''}>Check (Enable)</option>
                        <option value="false" ${this.currentStep?.value === 'false' ? 'selected' : ''}>Uncheck (Disable)</option>
                    </select>
                </div>
            `;
        } else if (stepType === 'wait') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Duration (milliseconds)</label>
                    <input type="number" id="stepDuration" class="form-control" 
                           value="${this.currentStep?.duration || 1000}" 
                           placeholder="1000">
                </div>
            `;
        } else if (stepType === 'loop-start') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Loop Name</label>
                    <input type="text" id="stepLoopName" class="form-control" 
                           value="${this.currentStep?.loopName || 'Main Loop'}" 
                           placeholder="e.g., Process Records">
                </div>
                <div class="form-group">
                    <label>Data Source</label>
                    <select id="stepLoopDataSource" class="form-control">
                        <option value="primary" ${(this.currentStep?.loopDataSource || 'primary') === 'primary' ? 'selected' : ''}>Primary Data Source</option>
                        ${this.dataSources.details.map(d => 
                            `<option value="${d.id}" ${this.currentStep?.loopDataSource === d.id ? 'selected' : ''}>${d.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Iteration Limit (0 = unlimited)</label>
                    <input type="number" id="stepIterationLimit" class="form-control" 
                           value="${this.currentStep?.iterationLimit || 0}" 
                           min="0"
                           placeholder="0 for all rows">
                    <small style="color: #666; font-size: 11px;">Set a limit for testing, or 0 to process all rows</small>
                </div>
            `;
        } else if (stepType === 'loop-end') {
            // Find available loop starts
            const loopStarts = this.currentWorkflow?.steps.filter(s => s.type === 'loop-start') || [];
            container.innerHTML = `
                <div class="form-group">
                    <label>End Loop</label>
                    <select id="stepLoopRef" class="form-control">
                        ${loopStarts.map(ls => 
                            `<option value="${ls.id}" ${this.currentStep?.loopRef === ls.id ? 'selected' : ''}>${ls.loopName || 'Unnamed Loop'}</option>`
                        ).join('')}
                        ${loopStarts.length === 0 ? '<option value="">No loop starts found</option>' : ''}
                    </select>
                    <small style="color: #666; font-size: 11px;">Select which loop this ends</small>
                </div>
            `;
        } else if (stepType === 'filter') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            container.innerHTML = `
                <div class="form-group">
                    <label>Column Header Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., GridReadOnlyMarkupTable_MarkupCode">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        🔍 Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">⚠️ Select the <strong>column header</strong> (e.g., GridName_ColumnName), NOT the FilterField input</small>
                </div>
                <div class="form-group">
                    <label>Filter Method</label>
                    <select id="stepFilterMethod" class="form-control">
                        <option value="is exactly" ${(this.currentStep?.filterMethod || 'is exactly') === 'is exactly' ? 'selected' : ''}>is exactly</option>
                        <option value="contains" ${this.currentStep?.filterMethod === 'contains' ? 'selected' : ''}>contains</option>
                        <option value="begins with" ${this.currentStep?.filterMethod === 'begins with' ? 'selected' : ''}>begins with</option>
                        <option value="is not" ${this.currentStep?.filterMethod === 'is not' ? 'selected' : ''}>is not</option>
                        <option value="does not contain" ${this.currentStep?.filterMethod === 'does not contain' ? 'selected' : ''}>does not contain</option>
                        <option value="is one of" ${this.currentStep?.filterMethod === 'is one of' ? 'selected' : ''}>is one of</option>
                        <option value="after" ${this.currentStep?.filterMethod === 'after' ? 'selected' : ''}>after (dates)</option>
                        <option value="before" ${this.currentStep?.filterMethod === 'before' ? 'selected' : ''}>before (dates)</option>
                        <option value="matches" ${this.currentStep?.filterMethod === 'matches' ? 'selected' : ''}>matches (regex)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${!hasFieldMapping ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${hasFieldMapping ? 'selected' : ''}>From Data Field</option>
                    </select>
                </div>
                <div class="form-group" id="staticValueGroup" ${hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Filter Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Value to filter by">
                </div>
                <div class="form-group" id="dataFieldGroup" ${!hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Charges code">
                </div>
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const isData = e.target.value === 'data';
                    document.getElementById('staticValueGroup').style.display = isData ? 'none' : 'block';
                    document.getElementById('dataFieldGroup').style.display = isData ? 'block' : 'none';
                });
            }, 0);
        } else if (stepType === 'wait-until') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Wait for Element</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., MessageBox_Yes">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        🔍 Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">The element to wait for (dialog, button, etc.)</small>
                </div>
                <div class="form-group">
                    <label>Wait Condition</label>
                    <select id="stepWaitCondition" class="form-control">
                        <option value="visible" ${(this.currentStep?.waitCondition || 'visible') === 'visible' ? 'selected' : ''}>Element becomes visible</option>
                        <option value="hidden" ${this.currentStep?.waitCondition === 'hidden' ? 'selected' : ''}>Element becomes hidden</option>
                        <option value="exists" ${this.currentStep?.waitCondition === 'exists' ? 'selected' : ''}>Element exists in DOM</option>
                        <option value="not-exists" ${this.currentStep?.waitCondition === 'not-exists' ? 'selected' : ''}>Element removed from DOM</option>
                        <option value="enabled" ${this.currentStep?.waitCondition === 'enabled' ? 'selected' : ''}>Element becomes enabled</option>
                        <option value="has-value" ${this.currentStep?.waitCondition === 'has-value' ? 'selected' : ''}>Element has specific value</option>
                    </select>
                </div>
                <div class="form-group" id="waitValueGroup" style="${this.currentStep?.waitCondition === 'has-value' ? '' : 'display: none;'}">
                    <label>Expected Value</label>
                    <input type="text" id="stepWaitValue" class="form-control" 
                           value="${this.currentStep?.waitValue || ''}" 
                           placeholder="Value to wait for">
                </div>
                <div class="form-group">
                    <label>Timeout (milliseconds)</label>
                    <input type="number" id="stepTimeout" class="form-control" 
                           value="${this.currentStep?.timeout || 10000}" 
                           min="1000"
                           placeholder="10000">
                    <small style="color: #666; font-size: 11px;">Maximum time to wait before failing (default: 10 seconds)</small>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Delete confirmation dialog">
                </div>
            `;

            // Add event listener for wait condition change
            setTimeout(() => {
                document.getElementById('stepWaitCondition')?.addEventListener('change', (e) => {
                    const showValue = e.target.value === 'has-value';
                    document.getElementById('waitValueGroup').style.display = showValue ? 'block' : 'none';
                    this.autoSaveStep();
                });
            }, 0);
        }

        // Add pick element listener
        setTimeout(() => {
            const pickBtn = document.getElementById('pickElement');
            if (pickBtn) {
                pickBtn.addEventListener('click', () => this.switchToInspector());
            }
            
            // Add auto-save listeners to all form fields
            this.setupAutoSaveListeners();
        }, 0);
    }
    
    setupAutoSaveListeners() {
        // All input fields
        const inputs = document.querySelectorAll('#stepTypeFields input, #stepTypeFields textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.autoSaveStep());
            input.addEventListener('change', () => this.autoSaveStep());
        });
        
        // All select fields
        const selects = document.querySelectorAll('#stepTypeFields select');
        selects.forEach(select => {
            select.addEventListener('change', () => {
                // Handle value source toggle
                if (select.id === 'stepValueSource') {
                    const isData = select.value === 'data';
                    const staticGroup = document.getElementById('staticValueGroup');
                    const dataGroup = document.getElementById('dataFieldGroup');
                    if (staticGroup) staticGroup.style.display = isData ? 'none' : 'block';
                    if (dataGroup) dataGroup.style.display = isData ? 'block' : 'none';
                }
                this.autoSaveStep();
            });
        });
    }

    renderFieldMappingDropdown(currentValue) {
        const allFields = this.getAllAvailableFields();
        
        if (allFields.length === 0) {
            return `
                <div class="field-mapping-select">
                    <input type="text" id="stepFieldMapping" class="form-control" 
                           value="${currentValue}" 
                           placeholder="e.g., LanguageId">
                    <p class="no-fields">No data source configured. Add data in the Data Sources panel below.</p>
                </div>
            `;
        }
        
        return `
            <div class="field-mapping-select">
                <select id="stepFieldMapping" class="form-control">
                    <option value="">-- Select Field --</option>
                    ${this.dataSources.primary.fields.length > 0 ? `
                        <optgroup label="📊 Primary Data">
                            ${this.dataSources.primary.fields.map(f => 
                                `<option value="${f}" ${currentValue === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </optgroup>
                    ` : ''}
                    ${this.dataSources.details.map(d => d.fields.length > 0 ? `
                        <optgroup label="📋 ${d.name}">
                            ${d.fields.map(f => 
                                `<option value="${d.id}:${f}" ${currentValue === `${d.id}:${f}` ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </optgroup>
                    ` : '').join('')}
                </select>
            </div>
        `;
    }

    getAllAvailableFields() {
        const fields = [...this.dataSources.primary.fields];
        this.dataSources.details.forEach(d => {
            d.fields.forEach(f => fields.push(`${d.name}.${f}`));
        });
        return fields;
    }

    async switchToInspector() {
        // Switch to Inspector tab
        document.querySelector('[data-tab="inspector"]').click();
        
        // Refresh elements if none discovered yet
        if (this.discoveredElements.length === 0) {
            await this.refreshElements();
        }
        
        // Show helpful message
        this.showNotification('Click any element below to select it for your step', 'info');
    }

    async pickElement() {
        const tab = await this.getLinkedOrActiveTab();
        
        if (!tab) {
            this.showNotification('No D365FO tab connected', 'error');
            return;
        }
        
        console.log('Starting element picker, current step:', this.currentStep);
        
        // Store that we're waiting for element pick
        await chrome.storage.local.set({ 
            waitingForPick: true,
            currentStepData: this.currentStep,
            currentWorkflowData: this.currentWorkflow
        });
        
        await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
        
        // Note: Window stays open in standalone mode, no need to close
    }

    async handleElementPicked(element) {
        console.log('Handling picked element:', element);
        
        if (this.currentStep) {
            this.currentStep.controlName = element.controlName;
            this.currentStep.displayText = element.displayText;
            this.currentStep.role = element.role;
            
            if (element.fieldType) {
                this.currentStep.fieldType = element.fieldType;
            }

            // Update UI - with retry in case DOM isn't ready
            setTimeout(() => {
                const controlNameInput = document.getElementById('stepControlName');
                if (controlNameInput) {
                    controlNameInput.value = element.controlName;
                    console.log('Set controlName input:', element.controlName);
                }

                const displayTextInput = document.getElementById('stepDisplayText');
                if (displayTextInput) {
                    displayTextInput.value = element.displayText;
                    console.log('Set displayText input:', element.displayText);
                }
                
                // Auto-save after element pick
                this.autoSaveStep();
            }, 50);
        }
        
        // Clear the waiting flag
        await chrome.storage.local.remove(['waitingForPick', 'pickedElement', 'currentStepData', 'currentWorkflowData']);
        
        // Show success notification
        this.showNotification(`Element selected: ${element.displayText || element.controlName}`, 'success');
    }

    // Auto-save step with debounce
    autoSaveStep() {
        // Clear any pending auto-save
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Debounce: save after 300ms of no changes
        this.autoSaveTimeout = setTimeout(() => {
            this.saveStep();
        }, 300);
    }

    saveStep() {
        if (!this.currentStep) return;

        this.currentStep.type = document.getElementById('stepType').value;

        if (this.currentStep.type === 'click') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
        } else if (this.currentStep.type === 'input' || this.currentStep.type === 'select' || this.currentStep.type === 'lookupSelect') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            
            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            }
        } else if (this.currentStep.type === 'checkbox') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.value = document.getElementById('stepValue')?.value || '';
        } else if (this.currentStep.type === 'wait') {
            this.currentStep.duration = parseInt(document.getElementById('stepDuration')?.value) || 1000;
        } else if (this.currentStep.type === 'loop-start') {
            this.currentStep.loopName = document.getElementById('stepLoopName')?.value || '';
            this.currentStep.loopDataSource = document.getElementById('stepLoopDataSource')?.value || '';
            this.currentStep.iterationLimit = parseInt(document.getElementById('stepIterationLimit')?.value) || 0;
        } else if (this.currentStep.type === 'loop-end') {
            this.currentStep.loopRef = document.getElementById('stepLoopRef')?.value || '';
        } else if (this.currentStep.type === 'filter') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.filterMethod = document.getElementById('stepFilterMethod')?.value || 'is exactly';
            
            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            }
        } else if (this.currentStep.type === 'wait-until') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.waitCondition = document.getElementById('stepWaitCondition')?.value || 'visible';
            this.currentStep.waitValue = document.getElementById('stepWaitValue')?.value || '';
            this.currentStep.timeout = parseInt(document.getElementById('stepTimeout')?.value) || 10000;
        }

        // Add or update step in workflow
        if (!this.currentWorkflow) {
            this.createNewWorkflow();
        }

        const existingIndex = this.currentWorkflow.steps.findIndex(s => s.id === this.currentStep.id);
        if (existingIndex >= 0) {
            this.currentWorkflow.steps[existingIndex] = { ...this.currentStep };
        } else {
            this.currentWorkflow.steps.push({ ...this.currentStep });
        }

        // Update steps display without closing editor
        this.displaySteps();
    }
    
    closeStepEditor() {
        // Final save before closing
        this.saveStep();
        this.currentStep = null;
        this.hideStepEditor();
    }
    
    deleteCurrentStep() {
        if (!this.currentStep || !this.currentWorkflow) return;
        
        const stepName = this.currentStep.displayText || this.currentStep.controlName || 'this step';
        if (confirm(`Delete "${stepName}"?`)) {
            this.currentWorkflow.steps = this.currentWorkflow.steps.filter(s => s.id !== this.currentStep.id);
            this.displaySteps();
            this.currentStep = null;
            this.hideStepEditor();
            this.showNotification('Step deleted', 'info');
        }
    }

    cancelStep() {
        // Keep for backward compatibility - same as closeStepEditor
        this.closeStepEditor();
    }

    displaySteps() {
        const container = document.getElementById('stepsList');
        container.innerHTML = '';

        if (!this.currentWorkflow || this.currentWorkflow.steps.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No steps yet. Click "Add Step" to begin.</p>';
            return;
        }

        // Track which steps are inside loops
        let loopDepth = 0;
        const loopStack = [];

        this.currentWorkflow.steps.forEach((step, index) => {
            const item = document.createElement('div');
            item.className = 'step-item';
            item.draggable = true;
            item.dataset.stepIndex = index;
            
            // Handle loop styling
            if (step.type === 'loop-start') {
                item.classList.add('loop-start');
                loopStack.push(step.id);
                loopDepth++;
            } else if (step.type === 'loop-end') {
                item.classList.add('loop-end');
                loopStack.pop();
                loopDepth = Math.max(0, loopDepth - 1);
            } else if (loopDepth > 0) {
                item.classList.add('in-loop');
                item.style.marginLeft = `${loopDepth * 20}px`;
            }
            
            let stepDesc = '';
            let stepIcon = '';
            
            if (step.type === 'click') {
                stepIcon = '🖱️';
                stepDesc = `Click "${step.displayText || step.controlName}"`;
            } else if (step.type === 'input') {
                stepIcon = '⌨️';
                stepDesc = `Enter "${step.value || '{' + step.fieldMapping + '}'}" into ${step.displayText || step.controlName}`;
            } else if (step.type === 'select') {
                stepIcon = '📋';
                stepDesc = `Select "${step.value || '{' + step.fieldMapping + '}'}" in ${step.displayText || step.controlName}`;
            } else if (step.type === 'lookupSelect') {
                stepIcon = '🔍';
                stepDesc = `Lookup "${step.value || '{' + step.fieldMapping + '}'}" in ${step.displayText || step.controlName}`;
            } else if (step.type === 'checkbox') {
                stepIcon = '☑️';
                const action = step.value === 'true' ? 'Check' : 'Uncheck';
                stepDesc = `${action} "${step.displayText || step.controlName}"`;
            } else if (step.type === 'wait') {
                stepIcon = '⏱️';
                stepDesc = `Wait ${step.duration}ms`;
            } else if (step.type === 'loop-start') {
                stepIcon = '🔄';
                const limit = step.iterationLimit > 0 ? ` (max ${step.iterationLimit})` : ' (all rows)';
                stepDesc = `<span class="loop-indicator">LOOP START:</span> ${step.loopName || 'Loop'}${limit}`;
            } else if (step.type === 'loop-end') {
                stepIcon = '🔄';
                const refLoop = this.currentWorkflow.steps.find(s => s.id === step.loopRef);
                stepDesc = `<span class="loop-indicator">LOOP END:</span> ${refLoop?.loopName || 'Loop'}`;
            } else if (step.type === 'filter') {
                stepIcon = '🔍';
                const method = step.filterMethod || 'is exactly';
                const filterVal = step.value || '{' + step.fieldMapping + '}';
                stepDesc = `Filter "${step.displayText || step.controlName}" ${method} "${filterVal}"`;
            } else if (step.type === 'wait-until') {
                stepIcon = '⏳';
                const condition = step.waitCondition || 'visible';
                stepDesc = `Wait until "${step.displayText || step.controlName}" ${condition}`;
            }

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <span style="cursor: move; color: #999;">⋮⋮</span>
                    <span>${stepIcon}</span>
                    <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>${index + 1}.</strong> ${stepDesc}
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-edit" title="Edit">✏️</button>
                    <button class="btn-delete" title="Delete">🗑️</button>
                </div>
            `;

            // Drag and drop handlers
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    if (e.clientY < midpoint) {
                        item.parentNode.insertBefore(dragging, item);
                    } else {
                        item.parentNode.insertBefore(dragging, item.nextSibling);
                    }
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                
                // Get the current DOM order to calculate the actual new index
                const allItems = Array.from(container.querySelectorAll('.step-item'));
                const draggingItem = container.querySelector('.dragging');
                const toIndex = allItems.indexOf(draggingItem);
                
                if (fromIndex !== toIndex) {
                    // Reorder the steps array to match the DOM order
                    const [movedStep] = this.currentWorkflow.steps.splice(fromIndex, 1);
                    this.currentWorkflow.steps.splice(toIndex, 0, movedStep);
                    this.displaySteps();
                    this.showNotification('Steps reordered', 'info');
                }
            });

            item.querySelector('.btn-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentStep = { ...step };
                this.showStepEditor();
            });

            item.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentWorkflow.steps.splice(index, 1);
                this.displaySteps();
            });

            container.appendChild(item);
        });
    }

    clearStepStatuses() {
        const container = document.getElementById('stepsList');
        if (!container) return;
        container.querySelectorAll('.step-item').forEach(item => {
            item.classList.remove('step-running', 'step-success', 'step-error');
        });
    }

    setStepStatus(stepIndex, status) {
        const container = document.getElementById('stepsList');
        if (!container) return;
        const items = Array.from(container.querySelectorAll('.step-item'));
        items.forEach(item => {
            if (item.dataset.stepIndex === String(stepIndex)) {
                item.classList.remove('step-running', 'step-success', 'step-error');
                if (status === 'running') item.classList.add('step-running');
                if (status === 'success') item.classList.add('step-success');
                if (status === 'error') item.classList.add('step-error');
            } else if (status === 'running') {
                item.classList.remove('step-running');
            }
        });
    }

    // === Data Sources ===

    updatePrimaryDataSourceUI(type) {
        const inputContainer = document.getElementById('primaryDataSourceInput');
        const fieldsPreview = document.getElementById('primaryDataFields');

        if (type === 'none') {
            inputContainer.style.display = 'none';
            fieldsPreview.innerHTML = '';
            this.dataSources.primary = { type: 'none', data: null, fields: [] };
        } else {
            inputContainer.style.display = 'block';
            
            const placeholder = type === 'json' ? 
                '[{"chargeCode": "AUF-DE", "language": "de", "text": "Aufwandspauschale"}]' :
                'chargeCode,language,text\\nAUF-DE,de,Aufwandspauschale';
            
            document.getElementById('primaryDataInput').placeholder = placeholder;
            this.dataSources.primary.type = type;
        }
    }

    validatePrimaryData() {
        const type = document.getElementById('primaryDataSourceType').value;
        const input = document.getElementById('primaryDataInput').value.trim();
        const statusEl = document.getElementById('primaryDataStatus');

        try {
            let data;
            if (type === 'json') {
                data = JSON.parse(input);
            } else if (type === 'csv') {
                data = this.parseCSV(input);
            } else if (type === 'excel') {
                data = this.parseTSV(input);
            }

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Data must be a non-empty array');
            }

            this.dataSources.primary.data = data;
            this.dataSources.primary.fields = Object.keys(data[0] || {});
            
            statusEl.textContent = `✅ ${data.length} rows, ${this.dataSources.primary.fields.length} fields`;
            statusEl.className = 'data-status success';
            
            this.displayPrimaryDataFields();
            this.updateRelationshipsUI();
            
        } catch (error) {
            statusEl.textContent = `❌ ${error.message}`;
            statusEl.className = 'data-status error';
        }
    }

    displayPrimaryDataFields() {
        const container = document.getElementById('primaryDataFields');
        if (this.dataSources.primary.fields.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = this.dataSources.primary.fields.map(f => 
            `<span class="field-tag">${f}</span>`
        ).join('');
    }

    addDetailDataSource() {
        const id = 'detail_' + Date.now();
        const newDetail = {
            id,
            name: `Detail ${this.dataSources.details.length + 1}`,
            type: 'none',
            data: null,
            fields: [],
            linkedTo: 'primary',
            linkFields: []
        };
        
        this.dataSources.details.push(newDetail);
        this.renderDetailDataSources();
        this.updateRelationshipsUI();
    }

    renderDetailDataSources() {
        const container = document.getElementById('detailDataSources');
        
        if (this.dataSources.details.length === 0) {
            container.innerHTML = '<p style="color: #999; font-size: 12px; text-align: center;">No detail data sources. Click "Add" to create one.</p>';
            return;
        }
        
        container.innerHTML = this.dataSources.details.map((detail, index) => `
            <div class="detail-source-item" data-detail-id="${detail.id}">
                <div class="source-header">
                    <input type="text" class="form-control form-control-sm detail-name" value="${detail.name}" style="width: 150px;">
                    <select class="form-control form-control-sm detail-type" style="width: 100px;">
                        <option value="none" ${detail.type === 'none' ? 'selected' : ''}>No Data</option>
                        <option value="json" ${detail.type === 'json' ? 'selected' : ''}>JSON</option>
                        <option value="csv" ${detail.type === 'csv' ? 'selected' : ''}>CSV</option>
                        <option value="excel" ${detail.type === 'excel' ? 'selected' : ''}>TSV</option>
                    </select>
                    <button class="btn-remove" title="Remove">✕</button>
                </div>
                <div class="detail-input" ${detail.type === 'none' ? 'style="display: none;"' : ''}>
                    <textarea class="form-control detail-data" rows="3" placeholder="Paste data here...">${detail.data ? (detail.type === 'json' ? JSON.stringify(detail.data, null, 2) : this.dataToCSV(detail.data)) : ''}</textarea>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <button class="btn btn-secondary btn-sm validate-detail">Validate</button>
                        <span class="detail-status" style="font-size: 11px;">${detail.fields.length > 0 ? `✅ ${detail.data?.length || 0} rows` : ''}</span>
                    </div>
                </div>
                <div class="detail-fields">${detail.fields.map(f => `<span class="field-tag">${f}</span>`).join('')}</div>
            </div>
        `).join('');
        
        // Add event listeners
        container.querySelectorAll('.detail-source-item').forEach(item => {
            const detailId = item.dataset.detailId;
            const detail = this.dataSources.details.find(d => d.id === detailId);
            
            item.querySelector('.detail-name').addEventListener('change', (e) => {
                detail.name = e.target.value;
            });
            
            item.querySelector('.detail-type').addEventListener('change', (e) => {
                detail.type = e.target.value;
                item.querySelector('.detail-input').style.display = e.target.value === 'none' ? 'none' : 'block';
            });
            
            item.querySelector('.btn-remove').addEventListener('click', () => {
                this.dataSources.details = this.dataSources.details.filter(d => d.id !== detailId);
                this.renderDetailDataSources();
                this.updateRelationshipsUI();
            });
            
            item.querySelector('.validate-detail')?.addEventListener('click', () => {
                this.validateDetailData(detailId);
            });
        });
    }

    validateDetailData(detailId) {
        const detail = this.dataSources.details.find(d => d.id === detailId);
        if (!detail) return;
        
        const item = document.querySelector(`[data-detail-id="${detailId}"]`);
        const input = item.querySelector('.detail-data').value.trim();
        const statusEl = item.querySelector('.detail-status');
        const fieldsEl = item.querySelector('.detail-fields');
        
        try {
            let data;
            if (detail.type === 'json') {
                data = JSON.parse(input);
            } else if (detail.type === 'csv') {
                data = this.parseCSV(input);
            } else if (detail.type === 'excel') {
                data = this.parseTSV(input);
            }
            
            detail.data = data;
            detail.fields = Object.keys(data[0] || {});
            
            statusEl.textContent = `✅ ${data.length} rows`;
            statusEl.style.color = '#28a745';
            fieldsEl.innerHTML = detail.fields.map(f => `<span class="field-tag">${f}</span>`).join('');
            
            this.updateRelationshipsUI();
            
        } catch (error) {
            statusEl.textContent = `❌ ${error.message}`;
            statusEl.style.color = '#dc3545';
        }
    }

    updateRelationshipsUI() {
        const section = document.getElementById('relationshipsSection');
        const container = document.getElementById('dataRelationships');
        
        // Only show if we have primary data and at least one detail
        const hasData = this.dataSources.primary.fields.length > 0 && this.dataSources.details.some(d => d.fields.length > 0);
        
        if (!hasData) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        this.renderRelationships();
    }

    renderRelationships() {
        const container = document.getElementById('dataRelationships');
        const detailsWithData = this.dataSources.details.filter(d => d.fields.length > 0);
        
        if (detailsWithData.length === 0) {
            container.innerHTML = '<p style="color: #999; font-size: 12px;">Add and validate detail data sources to configure relationships.</p>';
            return;
        }
        
        // Auto-detect common fields
        const autoRelations = [];
        detailsWithData.forEach(detail => {
            const commonFields = detail.fields.filter(f => this.dataSources.primary.fields.includes(f));
            if (commonFields.length > 0) {
                autoRelations.push({ detailId: detail.id, detailName: detail.name, commonFields });
            }
        });
        
        container.innerHTML = `
            ${autoRelations.length > 0 ? `
                <div style="background: #e8f5e9; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
                    🔗 Auto-detected common fields: ${autoRelations.map(r => `${r.detailName} (${r.commonFields.join(', ')})`).join('; ')}
                </div>
            ` : ''}
            ${detailsWithData.map(detail => {
                const existing = this.dataSources.relationships.find(r => r.detailId === detail.id) || {};
                return `
                    <div class="relationship-item" data-rel-detail="${detail.id}">
                        <span style="font-weight: 600; font-size: 12px;">${detail.name}</span>
                        <span class="relation-arrow">↔</span>
                        <span style="font-size: 12px;">Primary on</span>
                        <select class="primary-field form-control-sm">
                            <option value="">-- Select --</option>
                            ${this.dataSources.primary.fields.map(f => 
                                `<option value="${f}" ${existing.primaryField === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </select>
                        <span style="font-size: 12px;">=</span>
                        <select class="detail-field form-control-sm">
                            <option value="">-- Select --</option>
                            ${detail.fields.map(f => 
                                `<option value="${f}" ${existing.detailField === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </select>
                    </div>
                `;
            }).join('')}
        `;
        
        // Add event listeners
        container.querySelectorAll('.relationship-item').forEach(item => {
            const detailId = item.dataset.relDetail;
            
            const update = () => {
                const primaryField = item.querySelector('.primary-field').value;
                const detailField = item.querySelector('.detail-field').value;
                
                // Remove existing relationship for this detail
                this.dataSources.relationships = this.dataSources.relationships.filter(r => r.detailId !== detailId);
                
                if (primaryField && detailField) {
                    this.dataSources.relationships.push({ detailId, primaryField, detailField });
                }
            };
            
            item.querySelector('.primary-field').addEventListener('change', update);
            item.querySelector('.detail-field').addEventListener('change', update);
        });
    }

    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        
        return lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = values[i] || '';
            });
            return obj;
        });
    }

    parseTSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split('\t').map(h => h.trim());
        
        return lines.slice(1).map(line => {
            const values = line.split('\t').map(v => v.trim());
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = values[i] || '';
            });
            return obj;
        });
    }

    dataToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const lines = [headers.join(',')];
        data.forEach(row => {
            lines.push(headers.map(h => row[h] || '').join(','));
        });
        return lines.join('\n');
    }

    dataToTSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const lines = [headers.join('\t')];
        data.forEach(row => {
            lines.push(headers.map(h => row[h] || '').join('\t'));
        });
        return lines.join('\n');
    }

    // === Inspector ===

    async startInspector() {
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
        } else {
            this.showNotification('No D365FO tab connected', 'error');
        }
    }

    async refreshElements() {
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            const activeFormOnly = document.getElementById('activeFormOnly')?.checked || false;
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'discoverElements',
                activeFormOnly: activeFormOnly
            });
        } else {
            this.showNotification('No D365FO tab connected', 'error');
        }
    }
    
    async getLinkedOrActiveTab() {
        // Try linked tab first
        if (this.linkedTabId) {
            try {
                return await chrome.tabs.get(this.linkedTabId);
            } catch (e) {
                this.linkedTabId = null;
            }
        }
        // Fall back to active tab
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return tab;
    }

    displayDiscoveredElements(elements, activeForm) {
        this.discoveredElements = elements;
        
        // Update active form info
        const activeFormInfo = document.getElementById('activeFormInfo');
        const activeFormName = document.getElementById('activeFormName');
        if (activeForm && activeFormInfo && activeFormName) {
            activeFormInfo.style.display = 'block';
            activeFormName.textContent = activeForm;
        } else if (activeFormInfo) {
            activeFormInfo.style.display = 'none';
        }
        
        // Build form filter options
        const formFilter = document.getElementById('formFilter');
        if (formFilter) {
            const forms = [...new Set(elements.map(el => el.formName).filter(f => f && f !== 'Unknown'))];
            forms.sort();
            
            const currentValue = formFilter.value;
            formFilter.innerHTML = '<option value="all">All Forms</option>';
            forms.forEach(form => {
                const count = elements.filter(el => el.formName === form).length;
                formFilter.innerHTML += `<option value="${form}">${form} (${count})</option>`;
            });
            
            // Restore previous selection if still valid
            if (currentValue !== 'all' && forms.includes(currentValue)) {
                formFilter.value = currentValue;
            }
        }
        
        this.filterElements();
    }

    filterElements(searchText = '') {
        const search = searchText || document.getElementById('elementFilter').value;
        const typeFilter = document.getElementById('elementTypeFilter').value;
        const formFilter = document.getElementById('formFilter')?.value || 'all';
        
        let filtered = this.discoveredElements.filter(el => {
            if (typeFilter !== 'all' && el.type !== typeFilter) return false;
            if (formFilter !== 'all' && el.formName !== formFilter) return false;
            if (search && !el.displayText.toLowerCase().includes(search.toLowerCase()) && 
                !el.controlName.toLowerCase().includes(search.toLowerCase())) {
                return false;
            }
            return true;
        });

        this.displayElements(filtered);
    }

    displayElements(elements) {
        const container = document.getElementById('elementsList');
        container.innerHTML = '';

        elements.forEach(el => {
            const item = document.createElement('div');
            item.className = 'element-item';
            
            // Show form name as a badge if available
            const formBadge = el.formName && el.formName !== 'Unknown' 
                ? `<span class="element-form" title="Form: ${el.formName}">${el.formName}</span>` 
                : '';
            
            item.innerHTML = `
                <div>
                    <span class="element-type ${el.type}">${el.type}</span>
                    <span class="element-name">${el.displayText}</span>
                    ${formBadge}
                </div>
                <div class="element-control">${el.controlName}</div>
            `;
            item.addEventListener('click', () => {
                // If we're editing a step, populate it with this element
                if (this.currentStep) {
                    this.currentStep.controlName = el.controlName;
                    this.currentStep.displayText = el.displayText;
                    this.currentStep.role = el.role;
                    
                    if (el.fieldType) {
                        this.currentStep.fieldType = el.fieldType;
                    }

                    // Update UI fields
                    const controlNameInput = document.getElementById('stepControlName');
                    if (controlNameInput) {
                        controlNameInput.value = el.controlName;
                    }

                    const displayTextInput = document.getElementById('stepDisplayText');
                    if (displayTextInput) {
                        displayTextInput.value = el.displayText;
                    }

                    // Auto-save the step
                    this.autoSaveStep();

                    // Switch to builder tab to show the populated step
                    document.querySelector('[data-tab="builder"]').click();
                    
                    // Show success notification
                    this.showNotification(`Element selected: ${el.displayText}`, 'success');
                } else {
                    // No step being edited, just copy to clipboard
                    navigator.clipboard.writeText(el.controlName);
                    this.showNotification('Control name copied to clipboard', 'info');
                }
                
                // Visual feedback
                item.style.background = '#c8e6c9';
                setTimeout(() => {
                    item.style.background = '';
                }, 500);
            });
            container.appendChild(item);
        });

        if (elements.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999;">No elements found. Click "Refresh" to scan the page.</p>';
        }
    }

    // === Settings ===

    loadSettings() {
        const defaults = {
            delayAfterClick: 800,
            delayAfterInput: 400,
            delayAfterSave: 1000,
            maxRetries: 3,
            logVerbose: false,
            pauseOnError: false,
            comboSelectMode: 'method3',
            suppressLookupWarnings: false
        };

        const stored = localStorage.getItem('d365-settings');
        return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    }

    loadSettingsUI() {
        document.getElementById('delayAfterClick').value = this.settings.delayAfterClick;
        document.getElementById('delayAfterInput').value = this.settings.delayAfterInput;
        document.getElementById('delayAfterSave').value = this.settings.delayAfterSave;
        document.getElementById('maxRetries').value = this.settings.maxRetries;
        document.getElementById('logVerbose').checked = this.settings.logVerbose;
        document.getElementById('pauseOnError').checked = this.settings.pauseOnError;
        document.getElementById('comboSelectMode').value = this.settings.comboSelectMode || 'method3';
        document.getElementById('suppressLookupWarnings').checked = !!this.settings.suppressLookupWarnings;
    }

    saveSettings() {
        this.settings = {
            delayAfterClick: parseInt(document.getElementById('delayAfterClick').value),
            delayAfterInput: parseInt(document.getElementById('delayAfterInput').value),
            delayAfterSave: parseInt(document.getElementById('delayAfterSave').value),
            maxRetries: parseInt(document.getElementById('maxRetries').value),
            logVerbose: document.getElementById('logVerbose').checked,
            pauseOnError: document.getElementById('pauseOnError').checked,
            comboSelectMode: document.getElementById('comboSelectMode').value,
            suppressLookupWarnings: document.getElementById('suppressLookupWarnings').checked
        };

        localStorage.setItem('d365-settings', JSON.stringify(this.settings));
        this.showNotification('Settings saved!', 'success');
    }

    resetSettings() {
        localStorage.removeItem('d365-settings');
        this.settings = this.loadSettings();
        this.loadSettingsUI();
        this.showNotification('Settings reset to defaults!', 'info');
    }
}

// Initialize popup
const popup = new PopupController();
