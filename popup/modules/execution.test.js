/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executionMethods } from './execution.js';

function createExecutionContext(overrides = {}) {
    return {
        chrome: {
            storage: {
                local: {
                    set: vi.fn().mockResolvedValue(undefined)
                }
            },
            scripting: {
                executeScript: vi.fn().mockResolvedValue(undefined)
            },
            tabs: {
                sendMessage: vi.fn().mockResolvedValue(undefined)
            }
        },
        workflows: [{ id: 'wf-1', name: 'Workflow 1' }],
        executionState: {
            isRunning: true,
            isLaunching: true,
            isPaused: false,
            currentWorkflowId: 'wf-1',
            currentStepIndex: 0,
            currentRow: 0,
            totalRows: 0,
            totalSteps: 3,
            runningWorkflowSnapshot: { id: 'wf-1' }
        },
        configurationRunState: { runId: 'cfg-1', workflowQueue: [], currentIndex: 0 },
        activeRunContext: { origin: 'configuration' },
        resumeSkipByWorkflow: {},
        getLinkedOrActiveTab: vi.fn().mockResolvedValue({ id: 123 }),
        updateExecutionBar: vi.fn(),
        addLog: vi.fn(),
        showNotification: vi.fn(),
        setStepStatus: vi.fn(),
        showResumeModal: vi.fn(),
        runNextWorkflowInConfiguration: vi.fn(),
        resolveWorkflowDataSources: vi.fn((wf) => wf),
        buildExecutionRowsForWorkflow: vi.fn().mockReturnValue([{ id: 1 }]),
        markWorkflowAsNotRunning: vi.fn(),
        markWorkflowAsRunning: vi.fn(),
        clearStepStatuses: vi.fn(),
        ...overrides
    };
}

describe('execution methods', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('handleWorkflowProgress updates state and logs for stepStart and rowStart', () => {
        const ctx = createExecutionContext();

        executionMethods.handleWorkflowProgress.call(ctx, {
            phase: 'stepStart',
            stepIndex: 1,
            stepName: 'Fill Form'
        });
        executionMethods.handleWorkflowProgress.call(ctx, {
            phase: 'rowStart',
            processedRows: 2,
            totalToProcess: 5
        });

        expect(ctx.setStepStatus).toHaveBeenCalledWith(1, 'running');
        expect(ctx.executionState.currentStepIndex).toBe(1);
        expect(ctx.executionState.currentRow).toBe(1);
        expect(ctx.executionState.totalRows).toBe(5);
        expect(ctx.addLog).toHaveBeenCalledWith('info', expect.stringContaining('Processing row 2 of 5'));
    });

    it('handleWorkflowComplete advances configuration queue for expected run', () => {
        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                isLaunching: true,
                isPaused: true,
                currentWorkflowId: 'wf-1',
                runningWorkflowSnapshot: { id: 'wf-1' }
            },
            configurationRunState: {
                runId: 'cfg-1',
                currentIndex: 0,
                workflowQueue: [{ key: 'wk-1' }]
            },
            activeRunContext: {
                origin: 'configuration',
                configurationRunId: 'cfg-1',
                queueKey: 'wk-1'
            },
            resumeSkipByWorkflow: { 'wf-1': 3 }
        });

        executionMethods.handleWorkflowComplete.call(ctx);

        expect(ctx.executionState.isRunning).toBe(false);
        expect(ctx.executionState.isLaunching).toBe(false);
        expect(ctx.executionState.isPaused).toBe(false);
        expect(ctx.configurationRunState.currentIndex).toBe(1);
        expect(ctx.runNextWorkflowInConfiguration).toHaveBeenCalled();
        expect(ctx.activeRunContext).toBeNull();
        expect(ctx.chrome.storage.local.set).toHaveBeenCalledWith({ resumeSkipByWorkflow: {} });
        expect(ctx.executionState.runningWorkflowSnapshot).toBeUndefined();
    });

    it('handleWorkflowComplete ignores out-of-order completion in configuration run', () => {
        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                currentWorkflowId: 'wf-1'
            },
            configurationRunState: {
                runId: 'cfg-1',
                currentIndex: 0,
                workflowQueue: [{ key: 'wk-1' }]
            },
            activeRunContext: {
                origin: 'configuration',
                configurationRunId: 'cfg-1',
                queueKey: 'wk-2'
            }
        });

        executionMethods.handleWorkflowComplete.call(ctx);

        expect(ctx.runNextWorkflowInConfiguration).not.toHaveBeenCalled();
        expect(ctx.addLog).toHaveBeenCalledWith('warning', 'Ignoring out-of-order workflow completion during configuration run');
    });

    it('handleWorkflowError stores resume state and marks failed step', () => {
        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                isLaunching: true,
                isPaused: false,
                currentWorkflowId: 'wf-1',
                currentRow: 4,
                totalRows: 10,
                runningWorkflowSnapshot: { id: 'wf-1' }
            },
            configurationRunState: null
        });

        executionMethods.handleWorkflowError.call(ctx, {
            stepIndex: 2,
            step: { displayText: 'Approve' },
            message: 'Bad value'
        });

        expect(ctx.setStepStatus).toHaveBeenCalledWith(2, 'error');
        expect(ctx.executionState.isRunning).toBe(false);
        expect(ctx.resumeSkipByWorkflow['wf-1']).toBe(4);
        expect(ctx.lastFailureInfo).toEqual({
            workflowId: 'wf-1',
            rowIndex: 4,
            totalRows: 10
        });
        expect(ctx.showResumeModal).toHaveBeenCalled();
        expect(ctx.executionState.runningWorkflowSnapshot).toBeUndefined();
    });

    it('updateExecutionBar renders paused/running states and row visibility', () => {
        document.body.innerHTML = `
            <div id="executionBar" class="is-hidden"></div>
            <div id="executionStatus"></div>
            <div class="running-indicator"></div>
            <div id="progressFill"></div>
            <div id="executionStep"></div>
            <div id="executionRow" class="is-hidden"></div>
            <button id="pauseBtn"></button>
            <button id="resumeBtn" class="is-hidden"></button>
        `;

        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                isPaused: true,
                currentStepIndex: 1,
                totalSteps: 4,
                currentRow: 0,
                totalRows: 2
            }
        });

        executionMethods.updateExecutionBar.call(ctx);
        expect(document.getElementById('executionStatus').textContent).toBe('Paused');
        expect(document.getElementById('pauseBtn').classList.contains('is-hidden')).toBe(true);
        expect(document.getElementById('resumeBtn').classList.contains('is-hidden')).toBe(false);
        expect(document.getElementById('executionRow').classList.contains('is-hidden')).toBe(false);

        ctx.executionState.isPaused = false;
        ctx.executionState.totalRows = 0;
        executionMethods.updateExecutionBar.call(ctx);
        expect(document.getElementById('executionStatus').textContent).toBe('Running');
        expect(document.getElementById('executionRow').classList.contains('is-hidden')).toBe(true);
    });

    it('markWorkflowAsRunning and markWorkflowAsNotRunning toggle classes', () => {
        document.body.innerHTML = `
            <div class="workflow-item"><h4>Workflow 1</h4></div>
            <div class="workflow-item"><h4>Workflow 2</h4></div>
        `;
        const ctx = createExecutionContext({
            workflows: [
                { id: 'wf-1', name: 'Workflow 1' },
                { id: 'wf-2', name: 'Workflow 2' }
            ]
        });

        executionMethods.markWorkflowAsRunning.call(ctx, 'wf-2');
        const items = Array.from(document.querySelectorAll('.workflow-item'));
        expect(items[0].classList.contains('running')).toBe(false);
        expect(items[1].classList.contains('running')).toBe(true);

        executionMethods.markWorkflowAsNotRunning.call(ctx);
        expect(items[1].classList.contains('running')).toBe(false);
    });

    it('pauseExecution sends pause message and updates state', async () => {
        const ctx = createExecutionContext();

        await executionMethods.pauseExecution.call(ctx);

        expect(ctx.chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'pauseWorkflow' });
        expect(ctx.executionState.isPaused).toBe(true);
        expect(ctx.updateExecutionBar).toHaveBeenCalled();
        expect(ctx.addLog).toHaveBeenCalledWith('warning', 'Workflow paused');
    });

    it('resumeExecution sends resume message and updates state', async () => {
        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                isLaunching: false,
                isPaused: true
            }
        });

        await executionMethods.resumeExecution.call(ctx);

        expect(ctx.chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'resumeWorkflow' });
        expect(ctx.executionState.isPaused).toBe(false);
        expect(ctx.updateExecutionBar).toHaveBeenCalled();
        expect(ctx.addLog).toHaveBeenCalledWith('info', 'Workflow resumed');
    });

    it('pauseExecution and resumeExecution are no-op when state preconditions fail', async () => {
        const notRunningCtx = createExecutionContext({
            executionState: { isRunning: false, isPaused: false }
        });
        await executionMethods.pauseExecution.call(notRunningCtx);
        expect(notRunningCtx.chrome.tabs.sendMessage).not.toHaveBeenCalled();

        const notPausedCtx = createExecutionContext({
            executionState: { isRunning: true, isPaused: false }
        });
        await executionMethods.resumeExecution.call(notPausedCtx);
        expect(notPausedCtx.chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('stopExecution does nothing when confirmation is rejected', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
        const ctx = createExecutionContext();

        await executionMethods.stopExecution.call(ctx);

        expect(ctx.chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(ctx.executionState.isRunning).toBe(true);
        vi.unstubAllGlobals();
    });

    it('stopExecution sends stop message and resets run state when confirmed', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
        const ctx = createExecutionContext();

        await executionMethods.stopExecution.call(ctx);

        expect(ctx.chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'stopWorkflow' });
        expect(ctx.executionState.isRunning).toBe(false);
        expect(ctx.executionState.isLaunching).toBe(false);
        expect(ctx.executionState.isPaused).toBe(false);
        expect(ctx.configurationRunState).toBeNull();
        expect(ctx.activeRunContext).toBeNull();
        expect(ctx.markWorkflowAsNotRunning).toHaveBeenCalled();
        expect(ctx.clearStepStatuses).toHaveBeenCalled();
        expect(ctx.executionState.runningWorkflowSnapshot).toBeUndefined();
        vi.unstubAllGlobals();
    });

    it('handleSaveWorkflowState exits when there is no running workflow', async () => {
        const ctx = createExecutionContext({
            executionState: { isRunning: false, currentWorkflowId: null },
            settings: { logVerbose: true }
        });

        await executionMethods.handleSaveWorkflowState.call(ctx, { targetUrl: 'https://contoso.dynamics.com/?mi=ABC' });
        expect(ctx.addLog).not.toHaveBeenCalled();
    });

    it('handleSaveWorkflowState builds pending state and delegates save', async () => {
        const ctx = createExecutionContext({
            executionState: {
                isRunning: true,
                currentWorkflowId: 'wf-1',
                currentStepIndex: 3,
                currentRow: 5,
                totalRows: 10,
                currentData: { Account: 'C001' },
                runningWorkflowSnapshot: { id: 'wf-1', name: 'Workflow 1' }
            },
            savePendingWorkflowToTab: vi.fn().mockResolvedValue(undefined)
        });

        await executionMethods.handleSaveWorkflowState.call(ctx, {
            targetUrl: 'https://contoso.dynamics.com/?mi=MenuItemA',
            waitForLoad: 1500
        });

        expect(ctx.savePendingWorkflowToTab).toHaveBeenCalledTimes(1);
        const pendingState = ctx.savePendingWorkflowToTab.mock.calls[0][0];
        expect(pendingState.workflowId).toBe('wf-1');
        expect(pendingState.nextStepIndex).toBe(4);
        expect(pendingState.currentRowIndex).toBe(5);
        expect(pendingState.targetMenuItemName).toBe('MenuItemA');
    });

    it('handleResumeAfterNavigation ignores duplicate resume requests', async () => {
        const ctx = createExecutionContext({
            _lastResumeKey: 'wf-1_2'
        });

        await executionMethods.handleResumeAfterNavigation.call(ctx, {
            workflow: { id: 'wf-1', steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
            nextStepIndex: 2,
            currentRowIndex: 0
        });

        expect(ctx.chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('handleResumeAfterNavigation sends executeWorkflow with remaining steps', async () => {
        vi.stubGlobal('setTimeout', vi.fn());
        const workflow = { id: 'wf-1', steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] };
        const ctx = createExecutionContext();

        await executionMethods.handleResumeAfterNavigation.call(ctx, {
            workflow,
            nextStepIndex: 1,
            currentRowIndex: 2,
            data: { Account: 'C001' },
            resumeHandled: false
        });

        const [tabId, payload] = ctx.chrome.tabs.sendMessage.mock.calls[0];
        expect(tabId).toBe(123);
        expect(payload.action).toBe('executeWorkflow');
        expect(payload.workflow.steps).toHaveLength(2);
        expect(payload.workflow.steps[0]._absoluteIndex).toBe(1);
        expect(payload.data).toEqual([{ Account: 'C001' }]);
        vi.unstubAllGlobals();
    });

    it('handleResumeAfterNavigation resets running state when sendMessage fails', async () => {
        vi.stubGlobal('setTimeout', vi.fn());
        const ctx = createExecutionContext({
            chrome: {
                tabs: {
                    sendMessage: vi.fn().mockRejectedValue(new Error('send failed'))
                }
            }
        });

        await executionMethods.handleResumeAfterNavigation.call(ctx, {
            workflow: { id: 'wf-1', steps: [{ id: 's1' }] },
            nextStepIndex: 0,
            currentRowIndex: 0,
            resumeHandled: false
        });

        expect(ctx.executionState.isRunning).toBe(false);
        expect(ctx.markWorkflowAsNotRunning).toHaveBeenCalled();
        expect(ctx.addLog).toHaveBeenCalledWith('error', 'Failed to resume workflow: send failed');
        vi.unstubAllGlobals();
    });
});
