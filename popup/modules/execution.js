export const executionMethods = {
    handleWorkflowInterruption(payload) {
        if (!payload?.requestId) return;
        this.pendingInterruptionRequest = payload;
        const kindEl = document.getElementById('interruptionKindText');
        const messageEl = document.getElementById('interruptionMessageText');
        const actionSelect = document.getElementById('interruptionActionSelect');
        const followupSelect = document.getElementById('interruptionFollowupActionSelect');
        const outcomeSelect = document.getElementById('interruptionOutcomeSelect');
        const matchModeSelect = document.getElementById('interruptionMatchModeSelect');
        const saveRule = document.getElementById('interruptionSaveRule');

        if (kindEl) kindEl.textContent = payload.kind || 'event';
        if (messageEl) messageEl.textContent = payload.text || '';

        const options = Array.isArray(payload.options) ? payload.options : [];
        if (actionSelect) {
            actionSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '__none__';
            defaultOption.textContent = 'No click action';
            actionSelect.appendChild(defaultOption);
            options.forEach((opt, idx) => {
                const optionEl = document.createElement('option');
                optionEl.value = String(idx);
                const label = [opt.controlName, opt.text].filter(Boolean).join(' - ') || `Option ${idx + 1}`;
                optionEl.textContent = label;
                actionSelect.appendChild(optionEl);
            });
            actionSelect.value = options.length ? '0' : '__none__';
        }
        if (followupSelect) {
            followupSelect.innerHTML = '';
            const noneOption = document.createElement('option');
            noneOption.value = '__none__';
            noneOption.textContent = 'No follow-up action';
            followupSelect.appendChild(noneOption);
            options.forEach((opt, idx) => {
                const optionEl = document.createElement('option');
                optionEl.value = String(idx);
                const label = [opt.controlName, opt.text].filter(Boolean).join(' - ') || `Option ${idx + 1}`;
                optionEl.textContent = label;
                followupSelect.appendChild(optionEl);
            });
            followupSelect.value = '__none__';
        }
        const refreshFollowupChoices = () => {
            if (!actionSelect || !followupSelect) return;
            const selectedPrimary = actionSelect.value;
            Array.from(followupSelect.options).forEach((opt) => {
                if (opt.value === '__none__') return;
                opt.disabled = opt.value === selectedPrimary && selectedPrimary !== '__none__';
            });
            if (followupSelect.value === selectedPrimary && selectedPrimary !== '__none__') {
                followupSelect.value = '__none__';
            }
        };
        if (actionSelect) {
            actionSelect.onchange = refreshFollowupChoices;
            refreshFollowupChoices();
        }

        if (outcomeSelect) {
            outcomeSelect.value = payload.kind === 'messageBar' ? 'continue-loop' : 'next-step';
        }
        if (matchModeSelect) {
            matchModeSelect.value = 'contains';
        }
        if (saveRule) saveRule.checked = true;

        this.executionState.isPaused = true;
        this.updateExecutionBar();
        this.addLog('warning', `Interruption decision required (${payload.kind || 'event'})`);
        const modal = document.getElementById('interruptionModal');
        if (modal) modal.classList.remove('is-hidden');
    },

    hideInterruptionModal() {
        const modal = document.getElementById('interruptionModal');
        if (modal) modal.classList.add('is-hidden');
    },

    async submitInterruptionDecision(mode = 'apply') {
        if (!this.pendingInterruptionRequest) return;
        const actionSelect = document.getElementById('interruptionActionSelect');
        const followupSelect = document.getElementById('interruptionFollowupActionSelect');
        const outcomeSelect = document.getElementById('interruptionOutcomeSelect');
        const matchModeSelect = document.getElementById('interruptionMatchModeSelect');
        const saveRule = document.getElementById('interruptionSaveRule');
        const request = this.pendingInterruptionRequest;
        const options = Array.isArray(request.options) ? request.options : [];

        let selectedOption = null;
        let selectedFollowupOption = null;
        let actionType = 'none';
        if (mode === 'stop') {
            actionType = 'stop';
        } else if (mode === 'apply') {
            const selectedValue = actionSelect?.value ?? '__none__';
            if (selectedValue !== '__none__') {
                const idx = Number(selectedValue);
                if (Number.isFinite(idx) && idx >= 0 && idx < options.length) {
                    selectedOption = options[idx];
                    actionType = 'clickOption';
                }
            }
            const followupValue = followupSelect?.value ?? '__none__';
            if (followupValue !== '__none__') {
                const followupIdx = Number(followupValue);
                if (Number.isFinite(followupIdx) && followupIdx >= 0 && followupIdx < options.length) {
                    selectedFollowupOption = options[followupIdx];
                }
            }
        }

        const decision = {
            requestId: request.requestId,
            actionType,
            selectedOption,
            selectedFollowupOption,
            outcome: mode === 'stop' ? 'stop' : (outcomeSelect?.value || 'next-step'),
            matchMode: matchModeSelect?.value === 'exact' ? 'exact' : 'contains',
            saveRule: !!saveRule?.checked
        };

        const tab = await this.getLinkedOrActiveTab();
        if (!tab) {
            this.addLog('error', 'No D365 tab found to submit interruption decision');
            return;
        }

        try {
            await this.chrome.tabs.sendMessage(tab.id, {
                action: 'applyInterruptionDecision',
                payload: decision
            });
        } catch (error) {
            this.addLog('error', `Failed to submit interruption decision: ${error?.message || String(error)}`);
            return;
        }

        this.pendingInterruptionRequest = null;
        this.hideInterruptionModal();
    },

    async handleWorkflowLearningRule(payload) {
        const workflowId = payload?.workflowId || '';
        const rule = payload?.rule || null;
        if (!workflowId || !rule) return;

        const workflows = Array.isArray(this.workflows) ? this.workflows : [];
        const workflowIndex = workflows.findIndex(w => w.id === workflowId);
        if (workflowIndex === -1) {
            this.addLog('warning', `Received learned rule for unknown workflow: ${workflowId}`);
            return;
        }

        const workflow = workflows[workflowIndex];
        const handlers = Array.isArray(workflow.unexpectedEventHandlers)
            ? workflow.unexpectedEventHandlers
            : [];
        const ruleKey = JSON.stringify({
            trigger: rule.trigger,
            actions: Array.isArray(rule?.actions) ? rule.actions : [rule?.action].filter(Boolean),
            outcome: rule?.outcome || 'next-step'
        });
        const alreadyExists = handlers.some(existing => {
            const existingKey = JSON.stringify({
                trigger: existing?.trigger,
                actions: Array.isArray(existing?.actions) ? existing.actions : [existing?.action].filter(Boolean),
                outcome: existing?.outcome || 'next-step'
            });
            return existingKey === ruleKey;
        });
        if (alreadyExists) {
            this.addLog('info', 'Learned handler already exists, skipping duplicate');
            return;
        }

        workflow.unexpectedEventHandlers = [...handlers, rule];
        this.workflows[workflowIndex] = workflow;
        if (this.currentWorkflow?.id === workflowId) {
            this.currentWorkflow = JSON.parse(JSON.stringify(workflow));
            if (this.renderInterruptionHandlersPanel) {
                this.renderInterruptionHandlersPanel();
            }
        }

        try {
            await this.chrome.storage.local.set({ workflows: this.workflows });
        } catch (error) {
            this.addLog('error', `Failed to persist learned handler: ${error?.message || String(error)}`);
            return;
        }

        this.addLog('success', `Learned interruption handler saved for "${workflow.name || workflowId}"`);
    },

    handleWorkflowProgress(progress) {
        if (progress.phase === 'stepStart') {
            this.executionState.isPaused = false;
            this.setStepStatus(progress.stepIndex, 'running');
            this.executionState.currentStepIndex = progress.stepIndex;
            this.updateExecutionBar();
            this.addLog('info', `Starting step ${progress.stepIndex + 1}: ${progress.stepName || 'Step'}`);
        } else if (progress.phase === 'pausedForConfirmation') {
            this.executionState.isPaused = true;
            this.executionState.currentStepIndex = typeof progress.stepIndex === 'number'
                ? progress.stepIndex
                : this.executionState.currentStepIndex;
            this.updateExecutionBar();
            this.addLog('warning', `Learning mode paused before step ${this.executionState.currentStepIndex + 1}. Click Resume to continue.`);
        } else if (progress.phase === 'pausedForInterruption') {
            this.executionState.isPaused = true;
            this.executionState.currentStepIndex = typeof progress.stepIndex === 'number'
                ? progress.stepIndex
                : this.executionState.currentStepIndex;
            this.updateExecutionBar();
            this.addLog('warning', `Interruption detected (${progress.kind || 'event'}): ${progress.message || 'Review the page and click Resume when done.'}`);
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
        this.pendingInterruptionRequest = null;
        if (this.hideInterruptionModal) {
            this.hideInterruptionModal();
        }
        this.executionState.isRunning = false;
        this.executionState.isLaunching = false;
        this.executionState.isPaused = false;
        this.updateExecutionBar();
        this.markWorkflowAsNotRunning();
        this.showNotification('Workflow completed successfully!', 'success');
        this.addLog('success', 'Workflow completed successfully');

        if (this.configurationRunState && this.activeRunContext?.origin === 'configuration') {
            const state = this.configurationRunState;
            const expectedEntry = state.workflowQueue?.[state.currentIndex];
            const isExpectedRun =
                !!expectedEntry &&
                this.activeRunContext?.configurationRunId === state.runId &&
                this.activeRunContext?.queueKey === expectedEntry.key;

            if (isExpectedRun) {
                this.configurationRunState.currentIndex += 1;
                this.runNextWorkflowInConfiguration();
            } else {
                this.addLog('warning', 'Ignoring out-of-order workflow completion during configuration run');
            }
        } else {
            this.configurationRunState = null;
        }

        this.activeRunContext = null;

        if (workflowId && this.resumeSkipByWorkflow?.[workflowId]) {
            delete this.resumeSkipByWorkflow[workflowId];
            this.chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});
        }
        if (this.executionState) {
            delete this.executionState.runningWorkflowSnapshot;
        }
    },

    handleWorkflowError(err) {
        this.pendingInterruptionRequest = null;
        if (this.hideInterruptionModal) {
            this.hideInterruptionModal();
        }
        const workflowId = this.executionState.currentWorkflowId;
        const stepIndex = typeof err.stepIndex === 'number' ? err.stepIndex : null;
        if (stepIndex !== null) {
            this.setStepStatus(stepIndex, 'error');
        }

        const stepLabel = err.step?.displayText || err.step?.controlName;
        const message = err.message || err.error || 'Workflow error';

        this.executionState.isRunning = false;
        this.executionState.isLaunching = false;
        this.executionState.isPaused = false;
        this.updateExecutionBar();
        this.markWorkflowAsNotRunning();

        this.addLog('error', `Error: ${stepLabel ? `Step "${stepLabel}": ` : ''}${message}`);
        this.showNotification(stepLabel ? `Step failed (${stepLabel}): ${message}` : message, 'error');

        if (this.configurationRunState) {
            const failedWorkflow = (this.workflows || []).find(w => w.id === workflowId);
            const workflowName = failedWorkflow?.name || workflowId || 'unknown workflow';
            this.addLog('error', `Configuration run stopped because "${workflowName}" failed`);
            this.configurationRunState = null;
        }

        this.activeRunContext = null;

        if (workflowId) {
            const resumeSkip = Math.max(0, this.executionState.currentRow);
            this.resumeSkipByWorkflow = this.resumeSkipByWorkflow || {};
            this.resumeSkipByWorkflow[workflowId] = resumeSkip;
            this.chrome.storage.local.set({ resumeSkipByWorkflow: this.resumeSkipByWorkflow }).catch(() => {});

            this.lastFailureInfo = {
                workflowId: workflowId,
                rowIndex: this.executionState.currentRow,
                totalRows: this.executionState.totalRows
            };
            this.showResumeModal();
        }
        if (this.executionState) {
            delete this.executionState.runningWorkflowSnapshot;
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
            await this.chrome.tabs.sendMessage(tab.id, { action: 'pauseWorkflow' });
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
            await this.chrome.tabs.sendMessage(tab.id, { action: 'resumeWorkflow' });
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
            await this.chrome.tabs.sendMessage(tab.id, { action: 'stopWorkflow' });
            this.executionState.isRunning = false;
            this.executionState.isLaunching = false;
            this.executionState.isPaused = false;
            this.configurationRunState = null;
            this.activeRunContext = null;
            this.updateExecutionBar();
            this.markWorkflowAsNotRunning();
            this.clearStepStatuses();
            this.addLog('error', 'Workflow stopped by user');
            this.showNotification('Workflow stopped', 'warning');
            if (this.executionState) {
                delete this.executionState.runningWorkflowSnapshot;
            }
        }
    },
    
    /**
     * Handle workflow navigation state save request
     * This is called when the injected script is about to navigate to a new page
     */
    async handleSaveWorkflowState(data) {
        const runningWorkflow = this.executionState?.runningWorkflowSnapshot
            || (this.executionState?.currentWorkflowId
                ? (this.workflows || []).find(w => w.id === this.executionState.currentWorkflowId)
                : null)
            || this.currentWorkflow;
        if (!this.executionState.isRunning || !runningWorkflow) {
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
            workflow: runningWorkflow,
            workflowId: runningWorkflow?.id || this.executionState.currentWorkflowId || '',
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
            await this.chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (state) => {
                    const existingRaw = sessionStorage.getItem('d365_pending_workflow');
                    if (existingRaw) {
                        try {
                            const existing = JSON.parse(existingRaw);
                            const existingSavedAt = Number(existing?.savedAt || 0);
                            const nextSavedAt = Number(state?.savedAt || 0);
                            const existingWorkflowId = existing?.workflowId || existing?.workflow?.id || '';
                            const nextWorkflowId = state?.workflowId || state?.workflow?.id || '';
                            if (existingWorkflowId && nextWorkflowId && existingWorkflowId !== nextWorkflowId && existingSavedAt >= nextSavedAt) {
                                return;
                            }
                        } catch (_) {}
                    }
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
        const { workflow, nextStepIndex, currentRowIndex, data: rowData, resumeHandled } = data;
        let workflowForResume = workflow;
        try {
            workflowForResume = this.resolveWorkflowDataSources
                ? this.resolveWorkflowDataSources(workflow)
                : workflow;
        } catch (e) {
            this.addLog('error', e.message || 'Failed to resolve shared data source for resume');
            this.showNotification(e.message || 'Failed to resolve shared data source for resume', 'error');
            return;
        }
        
        // Prevent duplicate resume handling (message may arrive from multiple sources)
        const resumeKey = `${workflowForResume?.id || 'unknown'}_${nextStepIndex}_${Date.now()}`;
        if (this._lastResumeKey && this._lastResumeKey === `${workflowForResume?.id || 'unknown'}_${nextStepIndex}`) {
            console.log('[Execution] Ignoring duplicate resume request');
            return;
        }
        this._lastResumeKey = `${workflowForResume?.id || 'unknown'}_${nextStepIndex}`;
        
        // Clear the deduplication key after a short delay to allow future resumes
        setTimeout(() => {
            if (this._lastResumeKey === `${workflowForResume?.id || 'unknown'}_${nextStepIndex}`) {
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
        this.currentWorkflow = workflowForResume;
        this.executionState.isRunning = true;
        this.executionState.isLaunching = false;
        this.executionState.isPaused = false;
        this.executionState.currentStepIndex = nextStepIndex;
        this.executionState.currentRow = currentRowIndex || 0;
        this.executionState.totalSteps = workflowForResume.steps?.length || 0;
        this.executionState.currentWorkflowId = workflowForResume.id;

        this.markWorkflowAsRunning(workflowForResume.id);
        this.updateExecutionBar();
        
        // Build data array
        let dataToProcess = [];
        if (rowData) {
            dataToProcess = Array.isArray(rowData) ? rowData : [rowData];
        } else if (this.buildExecutionRowsForWorkflow) {
            dataToProcess = this.buildExecutionRowsForWorkflow(workflowForResume);
        }
        
        if (resumeHandled) {
            return;
        }

        // Continue execution with remaining steps
        const remainingSteps = workflowForResume.steps
            .slice(nextStepIndex)
            .map((step, idx) => ({ ...step, _absoluteIndex: nextStepIndex + idx }));
        const continueWorkflow = {
            ...workflowForResume,
            steps: remainingSteps,
            _isResume: true,
            _originalStartIndex: nextStepIndex
        };

        try {
            await this.chrome.tabs.sendMessage(tab.id, {
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
