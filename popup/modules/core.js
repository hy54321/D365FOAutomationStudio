export const coreMethods = {
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

        // Restore logs panel open state
        await this.initLogsPanelState();

        // Check if we were waiting for an element pick (do this AFTER DOM setup)
        await this.checkForPickedElement();
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    setStatus(status, text) {
        const indicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');

        if (status === 'connected') {
            indicator.classList.add('connected');
        } else {
            indicator.classList.remove('connected');
        }

        statusText.textContent = text;
    },

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
    },

    setupEventListeners() {
        // Workflows tab
        document.getElementById('newWorkflow').addEventListener('click', () => this.createNewWorkflow());
        document.getElementById('importWorkflow').addEventListener('click', () => this.importWorkflow());

        // Builder tab
        document.getElementById('addStep').addEventListener('click', () => this.addStep());
        document.getElementById('saveWorkflow').addEventListener('click', () => this.saveWorkflow());
        document.getElementById('cancelWorkflow').addEventListener('click', () => this.cancelWorkflowChanges());
        this.initStepCopyUI();
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
    },

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
    },

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
};
