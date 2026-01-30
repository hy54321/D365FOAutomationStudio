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
    }
};
