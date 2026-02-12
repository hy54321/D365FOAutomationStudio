export function parseGridAndColumn(controlName) {
    const text = String(controlName || '');
    const lastUnderscoreIdx = text.lastIndexOf('_');
    if (lastUnderscoreIdx <= 0 || lastUnderscoreIdx === text.length - 1) {
        return { gridName: text, columnName: '' };
    }
    return {
        gridName: text.substring(0, lastUnderscoreIdx),
        columnName: text.substring(lastUnderscoreIdx + 1)
    };
}

export function buildFilterFieldPatterns(controlName, gridName, columnName) {
    return [
        `FilterField_${gridName}_${columnName}_${columnName}_Input_0`,
        `FilterField_${controlName}_${columnName}_Input_0`,
        `FilterField_${controlName}_Input_0`,
        `FilterField_${gridName}_${columnName}_Input_0`,
        `${controlName}_FilterField_Input`,
        `${gridName}_${columnName}_FilterField`
    ];
}

export function buildApplyButtonPatterns(controlName, gridName, columnName) {
    return [
        `${gridName}_${columnName}_ApplyFilters`,
        `${controlName}_ApplyFilters`,
        `${gridName}_ApplyFilters`,
        'ApplyFilters'
    ];
}

export function getFilterMethodSearchTerms(method) {
    const methodMappings = {
        'is exactly': ['is exactly', 'equals', 'is equal to', '='],
        contains: ['contains', 'like'],
        'begins with': ['begins with', 'starts with'],
        'is not': ['is not', 'not equal', '!=', '<>'],
        'does not contain': ['does not contain', 'not like'],
        'is one of': ['is one of', 'in'],
        after: ['after', 'greater than', '>'],
        before: ['before', 'less than', '<'],
        matches: ['matches', 'regex', 'pattern']
    };
    return methodMappings[method] || [String(method || '')];
}

export function textIncludesAny(text, terms) {
    const normalizedText = String(text || '').toLowerCase();
    return (terms || []).some(term => normalizedText.includes(String(term || '').toLowerCase()));
}
