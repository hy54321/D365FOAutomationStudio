import { describe, expect, it, vi } from 'vitest';
import { runOptionsMethods } from './run-options.js';

function createDoc(elements) {
    return {
        getElementById: (id) => elements[id] || null
    };
}

describe('run options methods', () => {
    it('confirmRunWorkflow reads form values and dispatches workflow execution', () => {
        const elements = {
            runSkipRows: { value: '3' },
            runLimitRows: { value: '20' },
            runDryMode: { checked: true },
            runWithLogs: { checked: true },
            runLearningMode: { checked: true },
            runLearningModeBehavior: { value: 'until-interception' }
        };
        const originalDocument = global.document;
        global.document = createDoc(elements);

        const workflow = { id: 'wf-1' };
        const ctx = {
            pendingWorkflow: workflow,
            setLogsPanelOpen: vi.fn(),
            hideRunOptionsModal: vi.fn(function () { this.pendingWorkflow = null; }),
            executeWorkflowWithOptions: vi.fn()
        };

        runOptionsMethods.confirmRunWorkflow.call(ctx);

        expect(ctx.setLogsPanelOpen).toHaveBeenCalledWith(true);
        expect(ctx.hideRunOptionsModal).toHaveBeenCalled();
        expect(ctx.executeWorkflowWithOptions).toHaveBeenCalledWith(workflow, {
            skipRows: 3,
            limitRows: 20,
            dryRun: true,
            showLogs: true,
            learningMode: true,
            runUntilInterception: true
        });

        global.document = originalDocument;
    });

    it('resumeFromFailure computes next-row skip and remaining limit, then persists', () => {
        const storageSet = vi.fn().mockResolvedValue(undefined);
        const workflow = { id: 'wf-2' };
        const ctx = {
            lastFailureInfo: { workflowId: 'wf-2', rowIndex: 4, totalRows: 10 },
            workflows: [workflow],
            executionState: { runOptions: {} },
            lastRunOptionsByWorkflow: {
                'wf-2': { skipRows: 2, limitRows: 6, dryRun: false, showLogs: true }
            },
            resumeSkipByWorkflow: {},
            chrome: {
                storage: {
                    local: { set: storageSet }
                }
            },
            buildExecutionRowsForWorkflow: vi.fn().mockReturnValue(new Array(12).fill({})),
            hideResumeModal: vi.fn(),
            executeWorkflowWithOptions: vi.fn(),
            showNotification: vi.fn()
        };

        runOptionsMethods.resumeFromFailure.call(ctx, 'next');

        expect(ctx.executeWorkflowWithOptions).toHaveBeenCalledWith(workflow, {
            skipRows: 5,
            limitRows: 3,
            dryRun: false,
            showLogs: true,
            learningMode: false,
            runUntilInterception: false
        });
        expect(storageSet).toHaveBeenCalledWith({ resumeSkipByWorkflow: { 'wf-2': 5 } });
        expect(ctx.hideResumeModal).toHaveBeenCalled();
    });

    it('resumeFromFailure warns when there are no remaining rows', () => {
        const workflow = { id: 'wf-3' };
        const ctx = {
            lastFailureInfo: { workflowId: 'wf-3', rowIndex: 5, totalRows: 6 },
            workflows: [workflow],
            executionState: { runOptions: {} },
            lastRunOptionsByWorkflow: {
                'wf-3': { skipRows: 0, limitRows: 6, dryRun: false, showLogs: true }
            },
            resumeSkipByWorkflow: {},
            chrome: { storage: { local: { set: vi.fn() } } },
            buildExecutionRowsForWorkflow: vi.fn().mockReturnValue(new Array(6).fill({})),
            hideResumeModal: vi.fn(),
            executeWorkflowWithOptions: vi.fn(),
            showNotification: vi.fn()
        };

        runOptionsMethods.resumeFromFailure.call(ctx, 'next');

        expect(ctx.executeWorkflowWithOptions).not.toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('No more rows to process', 'warning');
    });
});
