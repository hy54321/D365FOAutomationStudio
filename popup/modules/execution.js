export const executionMethods = {
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
    },

    handleWorkflowComplete() {
        const workflowId = this.executionState.currentWorkflowId;
        this.executionState.isRunning = false;
        this.executionState.isPaused = false;
        this.updateExecutionBar();
        this.markWorkflowAsNotRunning();
        this.showNotification('Workflow completed successfully!', 'success');
        this.addLog('success', 'Workflow completed successfully');

        if (workflowId && this.resumeSkipByWorkflow?.[workflowId]) {
            delete this.resumeSkipByWorkflow[workflowId];
            chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});
        }
    },

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
    },

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
            executionBar.classList.remove('is-hidden');
            if (statusIndicator) statusIndicator.classList.remove('is-hidden');

            if (this.executionState.isPaused) {
                statusText.textContent = 'Paused';
                if (statusIndicator) statusIndicator.classList.add('paused');
                if (pauseBtn) pauseBtn.classList.add('is-hidden');
                if (resumeBtn) resumeBtn.classList.remove('is-hidden');
            } else {
                statusText.textContent = 'Running';
                if (statusIndicator) statusIndicator.classList.remove('paused');
                if (pauseBtn) pauseBtn.classList.remove('is-hidden');
                if (resumeBtn) resumeBtn.classList.add('is-hidden');
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
                    rowInfo.classList.remove('is-hidden');
                } else {
                    rowInfo.classList.add('is-hidden');
                }
            }
        } else {
            executionBar.classList.add('is-hidden');
        }
    },

    markWorkflowAsRunning(workflowId) {
        this.executionState.currentWorkflowId = workflowId;
        const items = document.querySelectorAll('.workflow-item');
        items.forEach(item => {
            const workflow = this.workflows.find(w => item.querySelector('h4')?.textContent === w.name);
            if (workflow && workflow.id === workflowId) {
                item.classList.add('running');
            }
        });
    },

    markWorkflowAsNotRunning() {
        this.executionState.currentWorkflowId = null;
        document.querySelectorAll('.workflow-item.running').forEach(item => {
            item.classList.remove('running');
        });
    },

    async pauseExecution() {
        if (!this.executionState.isRunning || this.executionState.isPaused) return;

        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'pauseWorkflow' });
            this.executionState.isPaused = true;
            this.updateExecutionBar();
            this.addLog('warning', 'Workflow paused');
            this.showNotification('Workflow paused', 'warning');
        }
    },

    async resumeExecution() {
        if (!this.executionState.isRunning || !this.executionState.isPaused) return;

        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'resumeWorkflow' });
            this.executionState.isPaused = false;
            this.updateExecutionBar();
            this.addLog('info', 'Workflow resumed');
            this.showNotification('Workflow resumed', 'info');
        }
    },

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
            this.addLog('error', 'Workflow stopped by user');
            this.showNotification('Workflow stopped', 'warning');
        }
    },
    
    /**
     * Handle workflow navigation state save request
     * This is called when the injected script is about to navigate to a new page
     */
    async handleSaveWorkflowState(data) {
        if (!this.executionState.isRunning || !this.currentWorkflow) {
            if (this.settings?.logVerbose) {
                console.warn('[Execution] handleSaveWorkflowState: No running workflow to save');
            }
            return;
        }
        
        console.log('[Execution] Saving workflow state for navigation...');
        
        // Extract menu item name from target URL
        let targetMenuItemName = '';
        try {
            const url = new URL(data.targetUrl);
            targetMenuItemName = url.searchParams.get('mi') || '';
        } catch (e) {
            console.warn('[Execution] Could not parse target URL:', e);
        }
        
        // Save workflow state for resumption after page reload
        const pendingState = {
            workflow: this.currentWorkflow,
            nextStepIndex: this.executionState.currentStepIndex + 1, // Resume from next step
            currentRowIndex: this.executionState.currentRow,
            totalRows: this.executionState.totalRows,
            data: this.executionState.currentData || null,
            targetMenuItemName: targetMenuItemName,
            waitForLoad: data.waitForLoad || 3000,
            savedAt: Date.now()
        };
        
        console.log('[Execution] Pending state:', { 
            nextStepIndex: pendingState.nextStepIndex,
            targetMenuItemName: pendingState.targetMenuItemName,
            workflowName: pendingState.workflow?.name 
        });
        
        // Save to sessionStorage so it persists across page navigation
        // but not across browser sessions
        try {
            // We need to save this via the content script since we can't directly
            // access the tab's sessionStorage from the popup
            await this.savePendingWorkflowToTab(pendingState);
            console.log('[Execution] Workflow state saved successfully');
        } catch (e) {
            console.error('[Execution] Failed to save workflow state:', e);
        }
        
        this.addLog('info', 'Navigation in progress, workflow will resume after page load...');
    },
    
    /**
     * Save pending workflow state to the tab's sessionStorage
     */
    async savePendingWorkflowToTab(pendingState) {
        const tab = await this.getLinkedOrActiveTab();
        if (!tab) return;
        
        // Execute in the tab context to save to sessionStorage
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (state) => {
                    sessionStorage.setItem('d365_pending_workflow', JSON.stringify(state));
                },
                args: [pendingState]
            });
        } catch (e) {
            console.error('[Execution] Failed to save to tab sessionStorage:', e);
        }
    },
    
    /**
     * Handle workflow resume after navigation
     * This is called when the content script detects a pending workflow after page load
     */
    async handleResumeAfterNavigation(data) {
        const { workflow, nextStepIndex, currentRowIndex, data: rowData } = data;
        
        // Prevent duplicate resume handling (message may arrive from multiple sources)
        const resumeKey = `${workflow?.id || 'unknown'}_${nextStepIndex}_${Date.now()}`;
        if (this._lastResumeKey && this._lastResumeKey === `${workflow?.id || 'unknown'}_${nextStepIndex}`) {
            console.log('[Execution] Ignoring duplicate resume request');
            return;
        }
        this._lastResumeKey = `${workflow?.id || 'unknown'}_${nextStepIndex}`;
        
        // Clear the deduplication key after a short delay to allow future resumes
        setTimeout(() => {
            if (this._lastResumeKey === `${workflow?.id || 'unknown'}_${nextStepIndex}`) {
                this._lastResumeKey = null;
            }
        }, 5000);
        
        this.addLog('info', `Resuming workflow after navigation (step ${nextStepIndex + 1})`);
        
        // Resume the workflow from the next step
        const tab = await this.getLinkedOrActiveTab();
        if (!tab) {
            this.addLog('error', 'Could not find linked tab to resume workflow');
            return;
        }
        
        // Set up execution state
        this.currentWorkflow = workflow;
        this.executionState.isRunning = true;
        this.executionState.isPaused = false;
        this.executionState.currentStepIndex = nextStepIndex;
        this.executionState.currentRow = currentRowIndex || 0;
        this.executionState.totalSteps = workflow.steps?.length || 0;
        this.executionState.currentWorkflowId = workflow.id;
        
        this.markWorkflowAsRunning(workflow.id);
        this.updateExecutionBar();
        
        // Build data array
        let dataToProcess = [];
        if (rowData) {
            dataToProcess = Array.isArray(rowData) ? rowData : [rowData];
        } else if (this.dataSources?.primary?.data) {
            dataToProcess = this.dataSources.primary.data;
        }
        
        // Continue execution with remaining steps
        const remainingSteps = workflow.steps.slice(nextStepIndex);
        const continueWorkflow = {
            ...workflow,
            steps: remainingSteps,
            _isResume: true,
            _originalStartIndex: nextStepIndex
        };
        
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'executeWorkflow',
                workflow: continueWorkflow,
                data: dataToProcess.length > 0 ? dataToProcess : [{}]
            });
        } catch (e) {
            this.addLog('error', `Failed to resume workflow: ${e.message}`);
            this.executionState.isRunning = false;
            this.markWorkflowAsNotRunning();
            this.updateExecutionBar();
        }
    }
};
