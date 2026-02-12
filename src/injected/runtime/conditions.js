import { normalizeText } from '../utils/text.js';

export function extractRowValue(fieldMapping, currentRow) {
    if (!currentRow || !fieldMapping) return '';
    let value = currentRow[fieldMapping];
    if (value === undefined && fieldMapping.includes(':')) {
        const fieldName = fieldMapping.split(':').pop();
        value = currentRow[fieldName];
    }
    return value === undefined || value === null ? '' : String(value);
}

export function getElementTextForCondition(element) {
    if (!element) return '';
    const aria = element.getAttribute?.('aria-label');
    if (aria) return aria.trim();
    const text = element.textContent?.trim();
    return text || '';
}

export function getElementValueForCondition(element) {
    if (!element) return '';
    if ('value' in element && element.value !== undefined) {
        return String(element.value ?? '');
    }
    return getElementTextForCondition(element);
}

export function evaluateCondition(step, currentRow, deps = {}) {
    const findElement = deps.findElementInActiveContext || (() => null);
    const isVisible = deps.isElementVisible || (() => false);
    const type = step?.conditionType || 'ui-visible';

    if (type.startsWith('ui-')) {
        const controlName = step?.conditionControlName || step?.controlName || '';
        const element = controlName ? findElement(controlName) : null;

        switch (type) {
            case 'ui-visible':
                return !!element && isVisible(element);
            case 'ui-hidden':
                return !element || !isVisible(element);
            case 'ui-exists':
                return !!element;
            case 'ui-not-exists':
                return !element;
            case 'ui-text-equals': {
                const actual = normalizeText(getElementTextForCondition(element));
                const expected = normalizeText(step?.conditionValue || '');
                return actual === expected;
            }
            case 'ui-text-contains': {
                const actual = normalizeText(getElementTextForCondition(element));
                const expected = normalizeText(step?.conditionValue || '');
                return actual.includes(expected);
            }
            case 'ui-value-equals': {
                const actual = normalizeText(getElementValueForCondition(element));
                const expected = normalizeText(step?.conditionValue || '');
                return actual === expected;
            }
            case 'ui-value-contains': {
                const actual = normalizeText(getElementValueForCondition(element));
                const expected = normalizeText(step?.conditionValue || '');
                return actual.includes(expected);
            }
            default:
                return false;
        }
    }

    if (type.startsWith('data-')) {
        const fieldMapping = step?.conditionFieldMapping || '';
        const actualRaw = extractRowValue(fieldMapping, currentRow);
        const actual = normalizeText(actualRaw);
        const expected = normalizeText(step?.conditionValue || '');

        switch (type) {
            case 'data-equals':
                return actual === expected;
            case 'data-not-equals':
                return actual !== expected;
            case 'data-contains':
                return actual.includes(expected);
            case 'data-empty':
                return actual === '';
            case 'data-not-empty':
                return actual !== '';
            default:
                return false;
        }
    }

    return false;
}
