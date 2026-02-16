import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowMethods } from './workflows.js';

function createWorkflowExecutionContext(overrides = {}) {
    return {
        executionState: { isRunning: false, isLaunching: false },
        configurationRunState: null,
        activeRunContext: null,
        linkedTabId: 10,
        settings: {},
        sharedDataSources: [],
        sharedDataSourceRelationships: [],
        lastRunOptionsByWorkflow: {},
        logs: [{ old: true }],
        chrome: {
            tabs: {
                get: vi.fn().mockResolvedValue({ id: 10, url: 'https://contoso.dynamics.com/' }),
                query: vi.fn().mockResolvedValue([]),
                sendMessage: vi.fn().mockResolvedValue(undefined)
            }
        },
        resolveWorkflowDataSources: vi.fn((wf) => wf),
        expandWorkflowForExecution: vi.fn((wf) => ({ workflow: wf, warnings: [] })),
        resolveRuntimeSharedDataSourcesForWorkflow: vi.fn().mockResolvedValue([]),
        buildExecutionRowsForWorkflow: vi.fn().mockReturnValue([{}]),
        clearStepStatuses: vi.fn(),
        updateExecutionBar: vi.fn(),
        markWorkflowAsRunning: vi.fn(),
        markWorkflowAsNotRunning: vi.fn(),
        setLogsPanelOpen: vi.fn(),
        addLog: vi.fn(),
        showNotification: vi.fn(),
        ...overrides
    };
}

describe('workflow methods', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('getInterruptionHandlerSignature treats action and actions formats consistently', () => {
        const handlerV1 = {
            trigger: { kind: 'modal', textTemplate: 'Unsaved changes', matchMode: 'contains' },
            action: { type: 'click', buttonText: 'Yes' },
            outcome: 'next-step'
        };
        const handlerV2 = {
            trigger: { kind: 'modal', textTemplate: 'Unsaved changes', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'Yes' }],
            outcome: 'next-step'
        };
        const ctx = {
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const sig1 = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerV1);
        const sig2 = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerV2);
        expect(sig1).toBe(sig2);
    });

    it('mergeInterruptionHandlersIntoCurrent appends only new handler signatures', () => {
        const existingHandler = {
            trigger: { kind: 'modal', textTemplate: 'Unsaved changes', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'Yes' }],
            outcome: 'next-step'
        };
        const newHandler = {
            trigger: { kind: 'warning', textTemplate: 'Number sequence', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'OK' }],
            outcome: 'next-step'
        };
        const ctx = {
            currentWorkflow: { unexpectedEventHandlers: [existingHandler] },
            getInterruptionHandlerSignature: workflowMethods.getInterruptionHandlerSignature,
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const result = workflowMethods.mergeInterruptionHandlersIntoCurrent.call(ctx, [
            existingHandler,
            newHandler
        ]);

        expect(result).toEqual({ addedCount: 1, skippedCount: 1 });
        expect(ctx.currentWorkflow.unexpectedEventHandlers).toHaveLength(2);
        expect(ctx.currentWorkflow.unexpectedEventHandlers[1].trigger.textTemplate).toBe('number sequence');
    });

    it('buildInterruptionRepository de-duplicates by signature and combines sources', () => {
        const sharedHandler = {
            trigger: { kind: 'modal', textTemplate: 'Unsaved changes', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'Yes' }],
            outcome: 'next-step'
        };
        const ctx = {
            interruptionHandlerRepository: [sharedHandler],
            workflows: [
                { id: 'w1', name: 'Workflow A', unexpectedEventHandlers: [sharedHandler] },
                {
                    id: 'w2',
                    name: 'Workflow B',
                    unexpectedEventHandlers: [{
                        trigger: { kind: 'warning', textTemplate: 'Number sequence', matchMode: 'contains' },
                        actions: [{ type: 'click', buttonText: 'OK' }],
                        outcome: 'next-step'
                    }]
                }
            ],
            currentWorkflow: null,
            getInterruptionHandlerSignature: workflowMethods.getInterruptionHandlerSignature,
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const entries = workflowMethods.buildInterruptionRepository.call(ctx);
        expect(entries).toHaveLength(2);

        const modalEntry = entries.find((entry) => entry.handler?.trigger?.textTemplate === 'unsaved changes');
        expect(modalEntry.sources).toEqual(['Repository', 'Workflow A']);
    });

    it('buildInterruptionRepository can ignore stored repository entries when requested', () => {
        const repoOnlyHandler = {
            trigger: { kind: 'modal', textTemplate: 'Repository only', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'OK' }],
            outcome: 'next-step'
        };
        const workflowHandler = {
            trigger: { kind: 'warning', textTemplate: 'Workflow only', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'Yes' }],
            outcome: 'next-step'
        };
        const ctx = {
            interruptionHandlerRepository: [repoOnlyHandler],
            workflows: [{ id: 'w1', name: 'Workflow A', unexpectedEventHandlers: [workflowHandler] }],
            currentWorkflow: null,
            getInterruptionHandlerSignature: workflowMethods.getInterruptionHandlerSignature,
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const entries = workflowMethods.buildInterruptionRepository.call(ctx, { includeStoredRepository: false });
        expect(entries).toHaveLength(1);
        expect(entries[0].handler.trigger.textTemplate).toBe('workflow only');
        expect(entries[0].sources).toEqual(['Workflow A']);
    });

    it('deleteSelectedRepositoryHandlers removes selected signatures across workflows and persists', async () => {
        const sharedHandler = {
            trigger: { kind: 'modal', textTemplate: 'Unsaved changes', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'Yes' }],
            outcome: 'next-step'
        };
        const keepHandler = {
            trigger: { kind: 'warning', textTemplate: 'Keep me', matchMode: 'contains' },
            actions: [{ type: 'click', buttonText: 'OK' }],
            outcome: 'next-step'
        };
        const chromeSet = vi.fn().mockResolvedValue(undefined);
        const ctx = {
            workflows: [
                { id: 'w1', name: 'Workflow A', unexpectedEventHandlers: [sharedHandler, keepHandler] },
                { id: 'w2', name: 'Workflow B', unexpectedEventHandlers: [sharedHandler] }
            ],
            currentWorkflow: { id: 'w1', name: 'Workflow A', unexpectedEventHandlers: [sharedHandler, keepHandler] },
            interruptionHandlerRepository: [sharedHandler],
            chrome: { storage: { local: { set: chromeSet } } },
            showNotification: vi.fn(),
            renderInterruptionHandlersPanel: vi.fn(),
            getSelectedRepositoryEntries: vi.fn().mockReturnValue([
                { signature: workflowMethods.getInterruptionHandlerSignature.call({
                    cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
                    normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
                    normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
                }, sharedHandler), handler: sharedHandler, sources: ['Workflow A'] }
            ]),
            buildInterruptionRepository: workflowMethods.buildInterruptionRepository,
            getInterruptionHandlerSignature: workflowMethods.getInterruptionHandlerSignature,
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        await workflowMethods.deleteSelectedRepositoryHandlers.call(ctx);

        expect(ctx.workflows[0].unexpectedEventHandlers).toHaveLength(1);
        expect(ctx.workflows[0].unexpectedEventHandlers[0].trigger.textTemplate).toBe('Keep me');
        expect(ctx.workflows[1].unexpectedEventHandlers).toHaveLength(0);
        expect(ctx.currentWorkflow.unexpectedEventHandlers).toHaveLength(1);
        expect(chromeSet).toHaveBeenCalledTimes(1);
        expect(ctx.showNotification).toHaveBeenCalledWith('Deleted 2 handlers from central repository', 'success');
    });

    it('getInterruptionHandlerSignature normalizes cannot-create-record messages across tables and fields', () => {
        const handlerA = {
            trigger: {
                kind: 'dialog',
                textTemplate: 'cannot create a record in translations (languagext). language: en-us. the record already exists.',
                matchMode: 'contains'
            },
            actions: [{ type: 'clickButton', buttonControlName: 'Close' }],
            outcome: 'next-step'
        };
        const handlerB = {
            trigger: {
                kind: 'dialog',
                textTemplate: 'cannot create a record in charges code (markuptable). charges code: FR-EU-NR. the record already exists.',
                matchMode: 'contains'
            },
            actions: [{ type: 'clickButton', buttonControlName: 'Close' }],
            outcome: 'next-step'
        };
        const ctx = {
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const sigA = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerA);
        const sigB = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerB);

        expect(sigA).toBe(sigB);
    });

    it('getInterruptionHandlerSignature normalizes required-field message across field names', () => {
        const handlerA = {
            trigger: {
                kind: 'messageBar',
                textTemplate: "Field 'line of business' must be filled in.",
                matchMode: 'contains'
            },
            actions: [{ type: 'closeMessageBar', controlName: 'MessageBarClose' }],
            outcome: 'repeat-loop'
        };
        const handlerB = {
            trigger: {
                kind: 'messageBar',
                textTemplate: "Field 'Customer group' must be filled in.",
                matchMode: 'contains'
            },
            actions: [{ type: 'closeMessageBar', controlName: 'MessageBarClose' }],
            outcome: 'repeat-loop'
        };
        const ctx = {
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const sigA = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerA);
        const sigB = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerB);

        expect(sigA).toBe(sigB);
    });

    it('getInterruptionHandlerSignature normalizes dependent-delete message across entities', () => {
        const handlerA = {
            trigger: {
                kind: 'messageBar',
                textTemplate: 'charges code cannot be deleted while dependent auto charges exist. delete dependent auto charges and try again.',
                matchMode: 'contains'
            },
            actions: [{ type: 'closeMessageBar', controlName: 'MessageBarClose' }],
            outcome: 'next-step'
        };
        const handlerB = {
            trigger: {
                kind: 'messageBar',
                textTemplate: 'customer groups cannot be deleted while dependent customers exist. delete dependent customers and try again.',
                matchMode: 'contains'
            },
            actions: [{ type: 'closeMessageBar', controlName: 'MessageBarClose' }],
            outcome: 'next-step'
        };
        const ctx = {
            cloneInterruptionHandler: workflowMethods.cloneInterruptionHandler,
            normalizeInterruptionTextTemplate: workflowMethods.normalizeInterruptionTextTemplate,
            normalizeInterruptionHandler: workflowMethods.normalizeInterruptionHandler
        };

        const sigA = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerA);
        const sigB = workflowMethods.getInterruptionHandlerSignature.call(ctx, handlerB);

        expect(sigA).toBe(sigB);
    });

    it('collectReferencedSharedSourceIds returns ids from field and condition mappings and loop data source', () => {
        const workflow = {
            steps: [
                { fieldMapping: 'customer:Account' },
                { conditionFieldMapping: 'orders:OrderId' },
                { type: 'loop-start', loopDataSource: 'details' },
                { type: 'loop-start', loopDataSource: 'primary' },
                { fieldMapping: 'invalid-no-source' }
            ]
        };

        const ids = workflowMethods.collectReferencedSharedSourceIds.call({}, workflow);
        expect(ids.sort()).toEqual(['customer', 'details', 'orders']);
    });

    it('buildExecutionRowsForWorkflow returns one empty row when no shared source ids are referenced', () => {
        const ctx = {
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue([]),
            sharedDataSources: []
        };

        const rows = workflowMethods.buildExecutionRowsForWorkflow.call(ctx, { steps: [] });
        expect(rows).toEqual([{}]);
    });

    it('buildExecutionRowsForWorkflow throws when referenced shared source is missing', () => {
        const ctx = {
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['missing']),
            sharedDataSources: []
        };

        expect(() => workflowMethods.buildExecutionRowsForWorkflow.call(ctx, { steps: [] }))
            .toThrow('Shared data source not found: missing');
    });

    it('buildExecutionRowsForWorkflow throws when shared source has no rows', () => {
        const ctx = {
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['customer']),
            sharedDataSources: [{ id: 'customer', name: 'Customer Source', data: [] }]
        };

        expect(() => workflowMethods.buildExecutionRowsForWorkflow.call(ctx, { steps: [] }))
            .toThrow('Shared data source "Customer Source" has no rows');
    });

    it('buildExecutionRowsForWorkflow builds merged rows and reuses last row for shorter sources', () => {
        const ctx = {
            sharedDataSources: [
                {
                    id: 'customer',
                    data: [
                        { Account: 'C001', Name: 'Alpha' },
                        { Account: 'C002', Name: 'Beta' }
                    ]
                },
                {
                    id: 'order',
                    data: [{ OrderId: 'SO-100' }]
                }
            ],
            collectReferencedSharedSourceIds: workflowMethods.collectReferencedSharedSourceIds
        };

        const workflow = {
            steps: [
                { type: 'input', fieldMapping: 'customer:Account' },
                { type: 'input', fieldMapping: 'order:OrderId' }
            ]
        };

        const rows = workflowMethods.buildExecutionRowsForWorkflow.call(ctx, workflow);

        expect(rows).toEqual([
            {
                'customer:Account': 'C001',
                'customer:Name': 'Alpha',
                Account: 'C001',
                Name: 'Alpha',
                'order:OrderId': 'SO-100',
                OrderId: 'SO-100'
            },
            {
                'customer:Account': 'C002',
                'customer:Name': 'Beta',
                Account: 'C002',
                Name: 'Beta',
                'order:OrderId': 'SO-100',
                OrderId: 'SO-100'
            }
        ]);
    });

    it('resolveRuntimeSharedDataSourcesForWorkflow throws when dynamic source query is missing', async () => {
        const ctx = {
            sharedDataSources: [{ id: 'dyn1', name: 'Dyn Source', type: 'odata-dynamic', odataQuery: '   ' }],
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['dyn1']),
            fetchODataRowsFromActiveEnvironment: vi.fn(),
            addLog: vi.fn()
        };

        await expect(workflowMethods.resolveRuntimeSharedDataSourcesForWorkflow.call(ctx, { steps: [] }))
            .rejects.toThrow('Dynamic OData source "Dyn Source" is missing query');
    });

    it('resolveRuntimeSharedDataSourcesForWorkflow throws when dynamic source returns no rows', async () => {
        const ctx = {
            sharedDataSources: [{ id: 'dyn1', name: 'Dyn Source', type: 'odata-dynamic', odataQuery: '$top=5' }],
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['dyn1']),
            fetchODataRowsFromActiveEnvironment: vi.fn().mockResolvedValue({ rows: [] }),
            addLog: vi.fn()
        };

        await expect(workflowMethods.resolveRuntimeSharedDataSourcesForWorkflow.call(ctx, { steps: [] }))
            .rejects.toThrow('Dynamic OData source "Dyn Source" returned no rows');
    });

    it('resolveRuntimeSharedDataSourcesForWorkflow updates dynamic source rows and fields', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(123456);
        const ctx = {
            sharedDataSources: [{ id: 'dyn1', name: 'Dyn Source', type: 'odata-dynamic', odataQuery: '$top=5', data: [] }],
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['dyn1']),
            fetchODataRowsFromActiveEnvironment: vi.fn().mockResolvedValue({
                rows: [{ Account: 'C001', Name: 'Acme' }]
            }),
            addLog: vi.fn()
        };

        const resolved = await workflowMethods.resolveRuntimeSharedDataSourcesForWorkflow.call(ctx, { steps: [] });
        expect(resolved[0].data).toEqual([{ Account: 'C001', Name: 'Acme' }]);
        expect(resolved[0].fields).toEqual(['Account', 'Name']);
        expect(resolved[0].odataLastFetchedAt).toBe(123456);
        expect(ctx.addLog).toHaveBeenCalledWith('info', 'Fetched dynamic OData source "Dyn Source" (1 rows)');
    });

    it('getRandomSampleRows returns a unique subset when requested count is smaller than rows', () => {
        const ctx = {
            parseOptionalPositiveInt: workflowMethods.parseOptionalPositiveInt
        };
        const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

        const sample = workflowMethods.getRandomSampleRows.call(ctx, rows, 2);

        expect(sample).toHaveLength(2);
        const ids = sample.map(row => row.id);
        expect(new Set(ids).size).toBe(2);
        expect(ids.every(id => [1, 2, 3, 4].includes(id))).toBe(true);
    });

    it('resolveRuntimeSharedDataSourcesForWorkflow samples odata-cached source rows when random limit is configured', async () => {
        const ctx = {
            sharedDataSources: [
                {
                    id: 'cached1',
                    name: 'Customers',
                    type: 'odata-cached',
                    randomSampleCount: 2,
                    data: [
                        { Account: 'C001' },
                        { Account: 'C002' },
                        { Account: 'C003' },
                        { Account: 'C004' }
                    ],
                    fields: ['Account']
                }
            ],
            collectReferencedSharedSourceIds: vi.fn().mockReturnValue(['cached1']),
            parseOptionalPositiveInt: workflowMethods.parseOptionalPositiveInt,
            getRandomSampleRows: workflowMethods.getRandomSampleRows,
            addLog: vi.fn()
        };

        const resolved = await workflowMethods.resolveRuntimeSharedDataSourcesForWorkflow.call(ctx, { steps: [] });
        expect(resolved[0].data).toHaveLength(2);
        expect(resolved[0].data.every(row => ['C001', 'C002', 'C003', 'C004'].includes(row.Account))).toBe(true);
        expect(ctx.addLog).toHaveBeenCalledWith('info', 'Sampled 2 random rows from OData source "Customers"');
    });

    it('expandWorkflowForExecution throws when required params are missing', () => {
        const ctx = {
            extractRequiredParamsFromWorkflow: vi.fn().mockReturnValue(['customerid']),
            workflowHasLoops: vi.fn().mockReturnValue(false),
            resolveBindingMap: vi.fn(),
            substituteParamsInObject: vi.fn(),
            workflows: []
        };

        expect(() => workflowMethods.expandWorkflowForExecution.call(ctx, { id: 'wf-main', name: 'Main', steps: [] }))
            .toThrow('Missing parameters for workflow "Main": customerid');
    });

    it('expandWorkflowForExecution throws for subworkflow cycles', () => {
        const rootWorkflow = {
            id: 'A',
            name: 'Workflow A',
            steps: [{ type: 'subworkflow', subworkflowId: 'B', paramBindings: {} }]
        };
        const childWorkflow = {
            id: 'B',
            name: 'Workflow B',
            steps: [{ type: 'subworkflow', subworkflowId: 'A', paramBindings: {} }]
        };
        const ctx = {
            workflows: [rootWorkflow, childWorkflow],
            extractRequiredParamsFromWorkflow: vi.fn().mockReturnValue([]),
            workflowHasLoops: vi.fn().mockReturnValue(false),
            resolveBindingMap: vi.fn().mockReturnValue({}),
            substituteParamsInObject: vi.fn((step) => step)
        };

        expect(() => workflowMethods.expandWorkflowForExecution.call(ctx, rootWorkflow))
            .toThrow('Subworkflow cycle detected: A -> B -> A');
    });

    it('executeWorkflowWithOptions dispatches executeWorkflow message with merged settings and computed data sources', async () => {
        const executionRows = [{ customer: 'C001' }];
        const runtimeSharedSources = [
            {
                id: 'detailSource',
                name: 'Detail Source',
                data: [{ LineId: 1, Amount: 25 }],
                fields: ['LineId', 'Amount']
            }
        ];
        const workflow = {
            id: 'wf-1',
            name: 'Workflow 1',
            steps: [{ type: 'click', controlName: 'Save' }],
            settings: { delayAfterSave: 1200 }
        };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };

        const ctx = {
            executionState: { isRunning: false, isLaunching: false },
            configurationRunState: null,
            activeRunContext: null,
            linkedTabId: 10,
            settings: { delayAfterClick: 900, maxRetries: 5 },
            sharedDataSources: runtimeSharedSources,
            sharedDataSourceRelationships: [],
            lastRunOptionsByWorkflow: {},
            logs: [],
            chrome: {
                tabs: {
                    get: vi.fn().mockResolvedValue({ id: 10, url: 'https://contoso.dynamics.com/' }),
                    query: vi.fn(),
                    sendMessage: vi.fn().mockResolvedValue(undefined)
                }
            },
            resolveWorkflowDataSources: vi.fn((wf) => wf),
            expandWorkflowForExecution: vi.fn((wf) => ({ workflow: wf, warnings: [] })),
            resolveRuntimeSharedDataSourcesForWorkflow: vi.fn().mockResolvedValue(runtimeSharedSources),
            buildExecutionRowsForWorkflow: vi.fn().mockReturnValue(executionRows),
            clearStepStatuses: vi.fn(),
            updateExecutionBar: vi.fn(),
            markWorkflowAsRunning: vi.fn(),
            markWorkflowAsNotRunning: vi.fn(),
            setLogsPanelOpen: vi.fn(),
            addLog: vi.fn(),
            showNotification: vi.fn()
        };

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(true);
        expect(ctx.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
        const [tabId, payload] = ctx.chrome.tabs.sendMessage.mock.calls[0];
        expect(tabId).toBe(10);
        expect(payload.action).toBe('executeWorkflow');
        expect(payload.runOptions).toEqual(runOptions);
        expect(payload.data).toEqual(executionRows);
        expect(payload.workflow.dataSources.primary.data).toEqual(executionRows);
        expect(payload.workflow.dataSources.details).toHaveLength(1);
        expect(payload.workflow.settings.delayAfterClick).toBe(900);
        expect(payload.workflow.settings.delayAfterSave).toBe(1200);
        expect(ctx.executionState.isRunning).toBe(true);
        expect(ctx.executionState.currentWorkflowId).toBe('wf-1');
    });

    it('executeWorkflowWithOptions returns false when workflow expansion fails', async () => {
        const workflow = { id: 'wf-exp', name: 'Workflow Expand', steps: [{ type: 'click' }] };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            expandWorkflowForExecution: vi.fn(() => {
                throw new Error('Expansion failed');
            })
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.executionState.isLaunching).toBe(false);
        expect(ctx.showNotification).toHaveBeenCalledWith('Expansion failed', 'error');
        expect(ctx.addLog).toHaveBeenCalledWith('error', 'Expansion failed');
    });

    it('executeWorkflowWithOptions exits early when run is already in progress', async () => {
        const workflow = { id: 'wf-running', name: 'Workflow Running', steps: [{ type: 'click' }] };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            executionState: { isRunning: true, isLaunching: false }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.addLog).toHaveBeenCalledWith('warning', 'A workflow run is already in progress');
        expect(ctx.chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('executeWorkflowWithOptions clears stale configuration state for manual runs', async () => {
        const workflow = { id: 'wf-manual', name: 'Workflow Manual', steps: [{ type: 'click' }] };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            configurationRunState: { runId: 'stale' }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions, { origin: 'manual' });

        expect(ok).toBe(true);
        expect(ctx.configurationRunState).toBeNull();
        expect(ctx.activeRunContext).toEqual({
            origin: 'manual',
            configurationRunId: null,
            queueKey: null
        });
    });

    it('executeWorkflowWithOptions returns false for invalid Chrome internal tab URL', async () => {
        const workflow = { id: 'wf-internal', name: 'Workflow Internal', steps: [{ type: 'click' }] };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            chrome: {
                tabs: {
                    get: vi.fn().mockResolvedValue({ id: 10, url: 'chrome://extensions' }),
                    query: vi.fn().mockResolvedValue([]),
                    sendMessage: vi.fn().mockResolvedValue(undefined)
                }
            }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.executionState.isLaunching).toBe(false);
        expect(ctx.showNotification).toHaveBeenCalledWith('Cannot run on Chrome internal pages', 'error');
        expect(ctx.chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('executeWorkflowWithOptions returns false when no D365 tab is available', async () => {
        const workflow = { id: 'wf-notab', name: 'Workflow No Tab', steps: [{ type: 'click' }] };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            linkedTabId: null,
            chrome: {
                tabs: {
                    get: vi.fn(),
                    query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
                    sendMessage: vi.fn().mockResolvedValue(undefined)
                }
            }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.showNotification).toHaveBeenCalledWith(
            'No D365FO tab found. Please open D365FO and click the extension icon.',
            'error'
        );
    });

    it('executeWorkflowWithOptions enables dry-run logging behavior', async () => {
        const workflow = {
            id: 'wf-dry',
            name: 'Workflow Dry',
            steps: [{ type: 'click', controlName: 'Save' }],
            settings: {}
        };
        const runOptions = { skipRows: 1, limitRows: 2, dryRun: true };
        const ctx = createWorkflowExecutionContext({
            settings: { delayAfterClick: 1000 }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(true);
        expect(ctx.logs).toEqual([]);
        expect(ctx.setLogsPanelOpen).toHaveBeenCalledWith(true);
        expect(ctx.addLog).toHaveBeenCalledWith('warning', 'DRY RUN MODE - No actual changes will be made');
        expect(ctx.addLog).toHaveBeenCalledWith('info', 'Skipping first 1 rows');
        expect(ctx.addLog).toHaveBeenCalledWith('info', 'Limiting to 2 rows');
    });

    it('executeWorkflowWithOptions logs expansion warnings and maps relationship payload', async () => {
        const workflow = {
            id: 'wf-rel',
            name: 'Workflow Relationships',
            steps: [{ type: 'click', controlName: 'Save' }],
            settings: {}
        };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const runtimeSharedSources = [{ id: 'detailA', name: 'Detail A', data: [{ LineId: 1 }] }];
        const ctx = createWorkflowExecutionContext({
            sharedDataSourceRelationships: [
                {
                    parentSourceId: 'primary',
                    detailId: 'detailA',
                    fieldMappings: [{ primaryField: 'Account', detailField: 'AccountId' }]
                }
            ],
            resolveRuntimeSharedDataSourcesForWorkflow: vi.fn().mockResolvedValue(runtimeSharedSources),
            buildExecutionRowsForWorkflow: vi.fn().mockReturnValue([{ Account: 'C001' }]),
            expandWorkflowForExecution: vi.fn((wf) => ({ workflow: wf, warnings: ['Warning 1'] }))
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);
        expect(ok).toBe(true);
        expect(ctx.addLog).toHaveBeenCalledWith('warning', 'Warning 1');

        const [, payload] = ctx.chrome.tabs.sendMessage.mock.calls[0];
        expect(payload.workflow.dataSources.relationships).toEqual([{
            parentSourceId: 'primary',
            detailId: 'detailA',
            primaryField: undefined,
            detailField: undefined,
            fieldMappings: [{ primaryField: 'Account', detailField: 'AccountId' }]
        }]);
    });

    it('executeWorkflowWithOptions handles non-receiver sendMessage errors via outer catch', async () => {
        const workflow = {
            id: 'wf-boom',
            name: 'Workflow Boom',
            steps: [{ type: 'click' }],
            settings: {}
        };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };
        const ctx = createWorkflowExecutionContext({
            chrome: {
                tabs: {
                    get: vi.fn().mockResolvedValue({ id: 10, url: 'https://contoso.dynamics.com/' }),
                    query: vi.fn().mockResolvedValue([]),
                    sendMessage: vi.fn().mockRejectedValue(new Error('Boom failure'))
                }
            }
        });

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.showNotification).toHaveBeenCalledWith('Failed to run workflow: Boom failure', 'error');
        expect(ctx.addLog).toHaveBeenCalledWith('error', 'Failed to start workflow: Boom failure');
    });

    it('executeWorkflowWithOptions handles missing content-script receiver and resets run state', async () => {
        const workflow = {
            id: 'wf-2',
            name: 'Workflow 2',
            steps: [{ type: 'click' }],
            settings: {}
        };
        const runOptions = { skipRows: 0, limitRows: 0, dryRun: false };

        const ctx = {
            executionState: { isRunning: false, isLaunching: false },
            configurationRunState: null,
            activeRunContext: null,
            linkedTabId: 11,
            settings: {},
            sharedDataSources: [],
            sharedDataSourceRelationships: [],
            lastRunOptionsByWorkflow: {},
            logs: [],
            chrome: {
                tabs: {
                    get: vi.fn().mockResolvedValue({ id: 11, url: 'https://contoso.dynamics.com/' }),
                    query: vi.fn(),
                    sendMessage: vi.fn().mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'))
                }
            },
            resolveWorkflowDataSources: vi.fn((wf) => wf),
            expandWorkflowForExecution: vi.fn((wf) => ({ workflow: wf, warnings: [] })),
            resolveRuntimeSharedDataSourcesForWorkflow: vi.fn().mockResolvedValue([]),
            buildExecutionRowsForWorkflow: vi.fn().mockReturnValue([{}]),
            clearStepStatuses: vi.fn(),
            updateExecutionBar: vi.fn(),
            markWorkflowAsRunning: vi.fn(),
            markWorkflowAsNotRunning: vi.fn(),
            setLogsPanelOpen: vi.fn(),
            addLog: vi.fn(),
            showNotification: vi.fn()
        };

        const ok = await workflowMethods.executeWorkflowWithOptions.call(ctx, workflow, runOptions);

        expect(ok).toBe(false);
        expect(ctx.executionState.isRunning).toBe(false);
        expect(ctx.executionState.isLaunching).toBe(false);
        expect(ctx.activeRunContext).toBeNull();
        expect(ctx.markWorkflowAsNotRunning).toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith(
            'Please refresh the D365FO page first, then try again',
            'error'
        );
    });

    describe('computeUnifiedPattern', () => {
        const ctx = {
            computeLCS: workflowMethods.computeLCS,
            tokenizeForAlignment: workflowMethods.tokenizeForAlignment,
            computeUnifiedPattern: workflowMethods.computeUnifiedPattern
        };

        it('returns the single text unchanged when only one is given', () => {
            const result = workflowMethods.computeUnifiedPattern.call(ctx, [
                'cannot create a record for john'
            ]);
            expect(result).toBe('cannot create a record for john');
        });

        it('generalizes varying person names into a placeholder', () => {
            const texts = [
                'standard view match found there might already be a record for john johnson',
                'standard view match found there might already be a record for joseph anderson',
                'standard view match found there might already be a record for william davis',
                'standard view match found there might already be a record for james jones'
            ];
            const result = workflowMethods.computeUnifiedPattern.call(ctx, texts);
            // The common structure should be preserved with a variable for the name
            expect(result).toContain('standard');
            expect(result).toContain('view');
            expect(result).toContain('record');
            expect(result).toContain('for');
            expect(result).toContain('{variable');
            // Should NOT contain any specific person name
            expect(result).not.toContain('john');
            expect(result).not.toContain('joseph');
            expect(result).not.toContain('william');
            expect(result).not.toContain('james');
        });

        it('generalizes completely different texts into wildcards', () => {
            const texts = [
                'error processing order 12345',
                'error processing invoice 67890'
            ];
            const result = workflowMethods.computeUnifiedPattern.call(ctx, texts);
            expect(result).toContain('error');
            expect(result).toContain('processing');
            expect(result).toContain('{variable');
        });

        it('handles texts with different address details', () => {
            const texts = [
                'name search name addresses name or descriptionaddresspurposeprimary21094 e hampden pl aurora, co # usa',
                'name search name addresses name or descriptionaddresspurposeprimary1413 jefferson avenue sheboygan, wi # usa',
                'name search name addresses name or descriptionaddresspurposeprimary707 1st ave san mateo, ca # usa',
                'name search name addresses name or descriptionaddresspurposeprimary3947 state route # midland, oh # usa'
            ];
            const result = workflowMethods.computeUnifiedPattern.call(ctx, texts);
            expect(result).toContain('name');
            expect(result).toContain('search');
            expect(result).toContain('addresses');
            expect(result).toContain('{variable');
            expect(result).toContain('usa');
        });

        it('returns empty string for empty input', () => {
            expect(workflowMethods.computeUnifiedPattern.call(ctx, [])).toBe('');
            expect(workflowMethods.computeUnifiedPattern.call(ctx, null)).toBe('');
        });
    });

    describe('patternToRegex', () => {
        const ctx = {};

        it('converts placeholders to lazy wildcards', () => {
            const regex = workflowMethods.patternToRegex.call(ctx, 'record for {variable}');
            expect(regex).toContain('.*?');
            expect(regex).toContain('record for ');
        });

        it('escapes regex special characters in the fixed text', () => {
            const regex = workflowMethods.patternToRegex.call(ctx, 'field (name) has {variable}');
            // Parentheses should be escaped
            expect(regex).toContain('\\(name\\)');
        });
    });

    describe('validatePatternAgainstTexts', () => {
        const ctx = {
            patternToRegex: workflowMethods.patternToRegex
        };

        it('validates all texts match with regex mode', () => {
            const pattern = 'record for {variable}';
            const texts = [
                'record for john johnson',
                'record for william davis'
            ];
            const result = workflowMethods.validatePatternAgainstTexts.call(ctx, pattern, texts, 'regex');
            expect(result.allMatch).toBe(true);
        });

        it('detects when a text does not match', () => {
            const pattern = 'record for {variable}';
            const texts = [
                'record for john',
                'completely different message'
            ];
            const result = workflowMethods.validatePatternAgainstTexts.call(ctx, pattern, texts, 'regex');
            expect(result.allMatch).toBe(false);
            expect(result.results[0].matched).toBe(true);
            expect(result.results[1].matched).toBe(false);
        });
    });

    describe('computeLCS', () => {
        const ctx = {};

        it('finds common subsequence of two token arrays', () => {
            const a = ['a', 'b', 'c', 'd'];
            const b = ['a', 'x', 'c', 'd'];
            const result = workflowMethods.computeLCS.call(ctx, a, b);
            expect(result.map(r => r.token)).toEqual(['a', 'c', 'd']);
        });

        it('returns empty for completely different arrays', () => {
            const result = workflowMethods.computeLCS.call(ctx, ['a', 'b'], ['x', 'y']);
            expect(result).toEqual([]);
        });
    });
});
