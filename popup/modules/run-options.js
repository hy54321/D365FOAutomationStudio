export const runOptionsMethods = {
    showRunOptionsModal(workflow) {
        this.pendingWorkflow = workflow;

        // Reset form
        document.getElementById('runSkipRows').value = '0';
        document.getElementById('runLimitRows').value = '0';
        document.getElementById('runDryMode').checked = false;
        document.getElementById('runWithLogs').checked = true;

        // Calculate total rows
        let totalRows = 0;
        try {
            const rows = this.buildExecutionRowsForWorkflow
                ? this.buildExecutionRowsForWorkflow(workflow)
                : [{}];
            totalRows = rows.length;
        } catch (e) {
            totalRows = 0;
        }

        // Show modal
        document.getElementById('runOptionsModal').classList.remove('is-hidden');
    },

    hideRunOptionsModal() {
        document.getElementById('runOptionsModal').classList.add('is-hidden');
        this.pendingWorkflow = null;
    },

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
            if (isLastRow) {
                resumeNextBtn.classList.add('is-hidden');
            } else {
                resumeNextBtn.classList.remove('is-hidden');
            }
        }

        document.getElementById('resumeModal').classList.remove('is-hidden');
    },

    hideResumeModal() {
        const modal = document.getElementById('resumeModal');
        if (modal) modal.classList.add('is-hidden');
    },

    resumeFromFailure(mode) {
        const info = this.lastFailureInfo;
        if (!info || !info.workflowId) return;

        const workflow = this.workflows.find(w => w.id === info.workflowId);
        if (!workflow) {
            this.showNotification('Workflow not found for resume', 'error');
            return;
        }

        let totalDataRows = 0;
        try {
            const rows = this.buildExecutionRowsForWorkflow
                ? this.buildExecutionRowsForWorkflow(workflow)
                : [{}];
            totalDataRows = rows.length;
        } catch (e) {
            this.showNotification(e.message || 'Failed to resolve data source for resume', 'error');
            return;
        }
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
        this.chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});

        this.hideResumeModal();
        this.executeWorkflowWithOptions(workflow, runOptions);
    },

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
            this.setLogsPanelOpen(true);
        }

        this.hideRunOptionsModal();
        this.executeWorkflowWithOptions(workflow, runOptions);
    }
};
