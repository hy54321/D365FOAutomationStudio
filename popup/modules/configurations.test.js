import { describe, expect, it, vi } from 'vitest';
import { configurationMethods } from './configurations.js';

describe('configuration methods', () => {
    it('normalizeConfigurationShape always provides workflowOrder array', () => {
        const normalized = configurationMethods.normalizeConfigurationShape.call({}, { id: 'c1', name: 'Config A' });
        expect(normalized.workflowOrder).toEqual([]);
    });

    it('syncConfigurationOrderForWorkflow adds/removes workflow id based on configurationIds', () => {
        const ctx = {
            configurations: [
                { id: 'cfg-1', workflowOrder: [] },
                { id: 'cfg-2', workflowOrder: ['wf-1'] }
            ]
        };
        const changed = configurationMethods.syncConfigurationOrderForWorkflow.call(ctx, {
            id: 'wf-1',
            configurationIds: ['cfg-1']
        });

        expect(changed).toBe(true);
        expect(ctx.configurations[0].workflowOrder).toEqual(['wf-1']);
        expect(ctx.configurations[1].workflowOrder).toEqual([]);
    });

    it('getWorkflowsByConfiguration returns configured order then alphabetical remainder', () => {
        const ctx = {
            workflows: [
                { id: 'wf-1', name: 'Zulu', configurationIds: ['cfg'] },
                { id: 'wf-2', name: 'Alpha', configurationIds: ['cfg'] },
                { id: 'wf-3', name: 'Mike', configurationIds: ['cfg'] }
            ],
            getConfigurationWorkflowOrder: vi.fn().mockReturnValue(['wf-3'])
        };

        const result = configurationMethods.getWorkflowsByConfiguration.call(ctx, 'cfg');
        expect(result.map(w => w.id)).toEqual(['wf-3', 'wf-2', 'wf-1']);
    });

    it('assignWorkflowToConfiguration unassigns workflow and removes order entries', async () => {
        const storageSet = vi.fn().mockResolvedValue(undefined);
        const ctx = {
            workflows: [{ id: 'wf-1', name: 'WF', configurationIds: ['cfg-1', 'cfg-2'] }],
            configurations: [
                { id: 'cfg-1', workflowOrder: ['wf-1'] },
                { id: 'cfg-2', workflowOrder: ['wf-1', 'wf-9'] }
            ],
            chrome: { storage: { local: { set: storageSet } } },
            getConfigurationWorkflowOrder: configurationMethods.getConfigurationWorkflowOrder,
            getConfigurationById: configurationMethods.getConfigurationById,
            displayWorkflows: vi.fn(),
            renderConfigurationsManager: vi.fn(),
            renderConfigurationTree: vi.fn(),
            renderWorkflowConfigurations: vi.fn()
        };

        await configurationMethods.assignWorkflowToConfiguration.call(ctx, 'wf-1', 'unassigned');

        expect(ctx.workflows[0].configurationIds).toEqual([]);
        expect(ctx.configurations[0].workflowOrder).toEqual([]);
        expect(ctx.configurations[1].workflowOrder).toEqual(['wf-9']);
        expect(storageSet).toHaveBeenCalledWith({
            workflows: ctx.workflows,
            configurations: ctx.configurations
        });
    });

    it('reorderConfigurationWorkflow persists new workflow order', async () => {
        const storageSet = vi.fn().mockResolvedValue(undefined);
        const ctx = {
            configurations: [{ id: 'cfg-1', workflowOrder: ['wf-1', 'wf-2', 'wf-3'] }],
            chrome: { storage: { local: { set: storageSet } } },
            getConfigurationWorkflowOrder: configurationMethods.getConfigurationWorkflowOrder,
            getConfigurationById: configurationMethods.getConfigurationById,
            renderConfigurationsManager: vi.fn(),
            showNotification: vi.fn()
        };

        await configurationMethods.reorderConfigurationWorkflow.call(ctx, 'cfg-1', 'wf-1', 'wf-3');

        expect(ctx.configurations[0].workflowOrder).toEqual(['wf-2', 'wf-3', 'wf-1']);
        expect(storageSet).toHaveBeenCalledWith({ configurations: ctx.configurations });
        expect(ctx.showNotification).toHaveBeenCalledWith('Configuration order updated', 'success');
    });
});
