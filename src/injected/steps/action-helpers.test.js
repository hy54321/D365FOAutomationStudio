import { describe, expect, it } from 'vitest';
import {
    buildApplyButtonPatterns,
    buildFilterFieldPatterns,
    getFilterMethodSearchTerms,
    parseGridAndColumn,
    textIncludesAny
} from './action-helpers.js';

describe('action helpers', () => {
    it('parses grid and column from control name', () => {
        expect(parseGridAndColumn('GridReadOnlyMarkupTable_MarkupCode')).toEqual({
            gridName: 'GridReadOnlyMarkupTable',
            columnName: 'MarkupCode'
        });
    });

    it('builds filter and apply patterns', () => {
        const filterPatterns = buildFilterFieldPatterns('Grid_Col', 'Grid', 'Col');
        const applyPatterns = buildApplyButtonPatterns('Grid_Col', 'Grid', 'Col');
        expect(filterPatterns[0]).toBe('FilterField_Grid_Col_Col_Input_0');
        expect(applyPatterns[0]).toBe('Grid_Col_ApplyFilters');
    });

    it('resolves filter method terms and checks inclusion', () => {
        expect(getFilterMethodSearchTerms('contains')).toContain('like');
        expect(textIncludesAny('is equal to', getFilterMethodSearchTerms('is exactly'))).toBe(true);
        expect(textIncludesAny('starts with', getFilterMethodSearchTerms('contains'))).toBe(false);
    });
});
