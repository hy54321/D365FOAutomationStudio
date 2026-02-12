import { describe, expect, it, vi } from 'vitest';
import { dataSourceMethods } from './data-sources.js';

describe('data source methods', () => {
    it('sanitizeSharedDataSourceRelationships keeps only valid mapped relationships', () => {
        const ctx = {
            sharedDataSources: [
                { id: 'parent', fields: ['Account', 'Name'] },
                { id: 'child', fields: ['CustAccount', 'LineNum'] }
            ],
            sharedDataSourceRelationships: [
                {
                    parentSourceId: 'parent',
                    detailId: 'child',
                    fieldMappings: [{ primaryField: 'Account', detailField: 'CustAccount' }]
                },
                {
                    parentSourceId: 'parent',
                    detailId: 'child',
                    fieldMappings: [{ primaryField: 'MissingField', detailField: 'CustAccount' }]
                },
                {
                    parentSourceId: 'missing',
                    detailId: 'child',
                    fieldMappings: [{ primaryField: 'Account', detailField: 'CustAccount' }]
                }
            ]
        };

        const result = dataSourceMethods.sanitizeSharedDataSourceRelationships.call(ctx);

        expect(result).toHaveLength(1);
        expect(result[0].primaryField).toBe('Account');
        expect(result[0].detailField).toBe('CustAccount');
        expect(result[0].fieldMappings).toEqual([{ primaryField: 'Account', detailField: 'CustAccount' }]);
    });

    it('parseCSV auto-detects delimiter and parses rows', () => {
        const csv = 'Account,Amount\nC001,100\nC002,250';
        const tsv = 'Account\tAmount\nC003\t300';

        const parsedCsv = dataSourceMethods.parseCSV.call({}, csv);
        const parsedTsv = dataSourceMethods.parseCSV.call({}, tsv);

        expect(parsedCsv).toEqual([
            { Account: 'C001', Amount: '100' },
            { Account: 'C002', Amount: '250' }
        ]);
        expect(parsedTsv).toEqual([{ Account: 'C003', Amount: '300' }]);
    });

    it('normalizeODataQueryPath trims, strips leading /data, and preserves full urls', () => {
        expect(dataSourceMethods.normalizeODataQueryPath.call({}, '  /data/CustCustomers  ')).toBe('CustCustomers');
        expect(dataSourceMethods.normalizeODataQueryPath.call({}, '/CustCustomers')).toBe('CustCustomers');
        expect(dataSourceMethods.normalizeODataQueryPath.call({}, 'https://contoso.dynamics.com/data/CustCustomers')).toBe(
            'https://contoso.dynamics.com/data/CustCustomers'
        );
    });

    it('getD365DataApiBaseUrl prefers linked/active tab over storage fallback', async () => {
        const ctx = {
            getLinkedOrActiveTab: vi.fn().mockResolvedValue({ id: 55, url: 'https://contoso.dynamics.com/?mi=CustTable' }),
            chrome: {
                storage: {
                    local: {
                        get: vi.fn()
                    }
                }
            }
        };

        const result = await dataSourceMethods.getD365DataApiBaseUrl.call(ctx);

        expect(result).toEqual({ origin: 'https://contoso.dynamics.com', tabId: 55 });
        expect(ctx.chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it('fetchODataRowsFromActiveEnvironment appends preview top and returns rows', async () => {
        const executeScript = vi.fn().mockResolvedValue([{ result: { rows: [{ Account: 'C001' }] } }]);
        const ctx = {
            normalizeODataQueryPath: dataSourceMethods.normalizeODataQueryPath,
            getD365DataApiBaseUrl: vi.fn().mockResolvedValue({ origin: 'https://contoso.dynamics.com', tabId: 77 }),
            chrome: {
                scripting: {
                    executeScript
                }
            }
        };

        const result = await dataSourceMethods.fetchODataRowsFromActiveEnvironment.call(
            ctx,
            'CustCustomers?$select=Account',
            { previewOnly: true }
        );

        expect(result.rows).toEqual([{ Account: 'C001' }]);
        expect(result.query).toBe('CustCustomers?$select=Account');
        expect(result.requestUrl).toContain('https://contoso.dynamics.com/data/CustCustomers?$select=Account');
        expect(result.requestUrl).toContain('$top=1');
        expect(executeScript).toHaveBeenCalledTimes(1);
        const [{ args }] = executeScript.mock.calls[0];
        expect(args[0]).toContain('$top=1');
        expect(args[1]).toBe(true);
    });
});
