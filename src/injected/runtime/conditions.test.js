import { describe, expect, it } from 'vitest';
import { evaluateCondition, extractRowValue, getElementTextForCondition, getElementValueForCondition } from './conditions.js';

describe('conditions runtime helpers', () => {
    it('extractRowValue supports namespaced fallback keys', () => {
        const row = { Account: 'C001' };
        expect(extractRowValue('customer:Account', row)).toBe('C001');
    });

    it('getElement text/value helpers prefer aria/value when available', () => {
        const el = {
            value: ' 123 ',
            textContent: 'ignored',
            getAttribute: (name) => (name === 'aria-label' ? 'ARIA LABEL' : null)
        };
        expect(getElementTextForCondition(el)).toBe('ARIA LABEL');
        expect(getElementValueForCondition(el)).toBe(' 123 ');
    });

    it('evaluates ui conditions via injected dom dependencies', () => {
        const element = {
            value: 'approved',
            textContent: 'Approved',
            getAttribute: () => null
        };
        const deps = {
            findElementInActiveContext: () => element,
            isElementVisible: () => true
        };

        expect(evaluateCondition({ conditionType: 'ui-visible', controlName: 'Status' }, {}, deps)).toBe(true);
        expect(evaluateCondition({ conditionType: 'ui-text-contains', controlName: 'Status', conditionValue: 'prov' }, {}, deps)).toBe(true);
        expect(evaluateCondition({ conditionType: 'ui-value-equals', controlName: 'Status', conditionValue: 'APPROVED' }, {}, deps)).toBe(true);
    });

    it('evaluates data conditions for equals/contains/empty', () => {
        const row = { Amount: '100', Customer: 'Contoso', EmptyField: '' };
        expect(evaluateCondition({ conditionType: 'data-equals', conditionFieldMapping: 'Amount', conditionValue: '100' }, row)).toBe(true);
        expect(evaluateCondition({ conditionType: 'data-contains', conditionFieldMapping: 'Customer', conditionValue: 'toso' }, row)).toBe(true);
        expect(evaluateCondition({ conditionType: 'data-empty', conditionFieldMapping: 'EmptyField' }, row)).toBe(true);
        expect(evaluateCondition({ conditionType: 'data-not-empty', conditionFieldMapping: 'Amount' }, row)).toBe(true);
    });
});
