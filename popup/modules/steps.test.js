import { describe, expect, it } from 'vitest';
import { stepMethods } from './steps.js';

describe('step methods', () => {
    it('normalizeParamBinding supports object and primitive values', () => {
        expect(stepMethods.normalizeParamBinding.call({}, { valueSource: 'data', fieldMapping: 'src:Field' })).toEqual({
            valueSource: 'data',
            value: '',
            fieldMapping: 'src:Field'
        });

        expect(stepMethods.normalizeParamBinding.call({}, 'literal')).toEqual({
            valueSource: 'static',
            value: 'literal',
            fieldMapping: ''
        });
    });

    it('workflowHasLoops detects loop steps', () => {
        expect(stepMethods.workflowHasLoops.call({}, { steps: [{ type: 'click' }, { type: 'loop-start' }] })).toBe(true);
        expect(stepMethods.workflowHasLoops.call({}, { steps: [{ type: 'click' }, { type: 'wait' }] })).toBe(false);
    });

    it('getFilteredSharedSourcesForFieldMapping filters by project and ensures selected source remains visible', () => {
        const ctx = {
            sharedDataSources: [
                { id: 's1', name: 'Source 1', fields: ['A'], projectIds: ['p1'] },
                { id: 's2', name: 'Source 2', fields: ['B'], projectIds: [] },
                { id: 's3', name: 'Source 3', fields: ['C'], projectIds: ['p2'] }
            ]
        };

        const unassigned = stepMethods.getFilteredSharedSourcesForFieldMapping.call(ctx, 'unassigned');
        expect(unassigned.map(s => s.id)).toEqual(['s2']);

        const projectOnly = stepMethods.getFilteredSharedSourcesForFieldMapping.call(ctx, 'p1');
        expect(projectOnly.map(s => s.id)).toEqual(['s1']);

        const ensured = stepMethods.getFilteredSharedSourcesForFieldMapping.call(ctx, 'p1', 's3');
        expect(ensured.map(s => s.id)).toEqual(['s3', 's1']);
    });

    it('formatFieldMappingForDisplay uses shared source display names', () => {
        const ctx = {
            sharedDataSources: [{ id: 'cust', name: 'Customers' }]
        };

        expect(stepMethods.formatFieldMappingForDisplay.call(ctx, 'cust:Account')).toBe('{Customers:Account}');
        expect(stepMethods.formatFieldMappingForDisplay.call(ctx, 'unknown:Field')).toBe('{unknown:Field}');
        expect(stepMethods.formatFieldMappingForDisplay.call(ctx, '')).toBe('{}');
    });

    it('collectSubworkflowParamBindings reads rows and emits normalized bindings', () => {
        const rows = [
            {
                querySelector: (selector) => {
                    if (selector === '.param-name') return { value: 'customerId' };
                    if (selector === '.param-source') return { value: 'data' };
                    if (selector === '.param-value') return { value: '' };
                    if (selector === '.param-field') return { value: 'customer:Account' };
                    return null;
                }
            },
            {
                querySelector: (selector) => {
                    if (selector === '.param-name') return { value: 'note' };
                    if (selector === '.param-source') return { value: 'static' };
                    if (selector === '.param-value') return { value: 'hello' };
                    if (selector === '.param-field') return { value: '' };
                    return null;
                }
            },
            {
                querySelector: (selector) => {
                    if (selector === '.param-name') return { value: 'clip' };
                    if (selector === '.param-source') return { value: 'clipboard' };
                    if (selector === '.param-value') return { value: '' };
                    if (selector === '.param-field') return { value: '' };
                    return null;
                }
            }
        ];

        const originalDocument = global.document;
        global.document = {
            getElementById: (id) => {
                if (id !== 'subworkflowParamsTable') return null;
                return {
                    querySelectorAll: () => rows
                };
            }
        };

        const bindings = stepMethods.collectSubworkflowParamBindings.call({});

        expect(bindings).toEqual({
            customerId: { valueSource: 'data', fieldMapping: 'customer:Account' },
            note: { valueSource: 'static', value: 'hello' },
            clip: { valueSource: 'clipboard' }
        });

        global.document = originalDocument;
    });
});
