export function workflowHasLoops(workflow) {
    return (workflow?.steps || []).some(step => step.type === 'loop-start' || step.type === 'loop-end');
}

export function normalizeParamName(name) {
    return (name || '').trim().toLowerCase();
}

export function getParamNamesFromString(text) {
    const params = new Set();
    if (typeof text !== 'string') return params;
    const regex = /\$\{([A-Za-z0-9_]+)\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const startIndex = match.index;
        if (startIndex > 0 && text[startIndex - 1] === '\\') continue;
        params.add(normalizeParamName(match[1]));
    }
    return params;
}

export function extractRequiredParamsFromObject(obj, params) {
    if (!obj) return;
    if (typeof obj === 'string') {
        for (const name of getParamNamesFromString(obj)) {
            params.add(name);
        }
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach(item => extractRequiredParamsFromObject(item, params));
        return;
    }
    if (typeof obj === 'object') {
        Object.values(obj).forEach(value => extractRequiredParamsFromObject(value, params));
    }
}

export function getStepForParamExtraction(step) {
    if (!step || typeof step !== 'object') return step;

    if (step.type === 'navigate') {
        const method = step.navigateMethod || 'menuItem';
        const normalized = { ...step };

        if (method === 'url') {
            delete normalized.menuItemName;
            delete normalized.menuItemType;
            delete normalized.hostRelativePath;
        } else if (method === 'hostRelative') {
            delete normalized.menuItemName;
            delete normalized.menuItemType;
            delete normalized.navigateUrl;
        } else {
            delete normalized.navigateUrl;
            delete normalized.hostRelativePath;
        }

        return normalized;
    }

    return step;
}

export function extractRequiredParamsFromWorkflow(workflow) {
    const params = new Set();
    (workflow?.steps || []).forEach(step => {
        extractRequiredParamsFromObject(getStepForParamExtraction(step), params);
    });
    return Array.from(params);
}

export function normalizeBindingValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const source = value.valueSource || 'static';
        if (source === 'data') {
            return { valueSource: 'data', fieldMapping: value.fieldMapping || '' };
        }
        if (source === 'clipboard') {
            return { valueSource: 'clipboard' };
        }
        return { valueSource: 'static', value: value.value ?? '' };
    }
    return { valueSource: 'static', value: value ?? '' };
}

export function buildNormalizedBindings(bindings) {
    const normalized = {};
    Object.entries(bindings || {}).forEach(([key, value]) => {
        const name = normalizeParamName(key);
        if (!name) return;
        normalized[name] = normalizeBindingValue(value);
    });
    return normalized;
}

export function serializeDynamicBindingToken(name, binding) {
    const safeName = normalizeParamName(name).replace(/[^a-z0-9_]/g, '_') || 'param';
    if (binding?.valueSource === 'clipboard') {
        return `__D365_PARAM_CLIPBOARD_${safeName}__`;
    }
    if (binding?.valueSource === 'data') {
        const field = encodeURIComponent(String(binding.fieldMapping || '').trim());
        return `__D365_PARAM_DATA_${field}__`;
    }
    return '';
}

export function substituteParamsInString(text, bindings, options = {}) {
    if (typeof text !== 'string') return text;
    const warnings = Array.isArray(options.warnings) ? options.warnings : null;
    const contextLabel = options.contextLabel || 'workflow';

    return text.replace(/\\?\$\{([A-Za-z0-9_]+)\}/g, (match, name) => {
        if (match.startsWith('\\')) {
            return match.slice(1);
        }
        const key = normalizeParamName(name);
        if (!Object.prototype.hasOwnProperty.call(bindings || {}, key)) {
            warnings?.push(`Missing parameter "${name}" while expanding ${contextLabel}.`);
            return '';
        }
        const binding = bindings[key];
        if (binding?.valueSource && binding.valueSource !== 'static') {
            if (binding.valueSource === 'data' && !String(binding.fieldMapping || '').trim()) {
                warnings?.push(`Parameter "${name}" uses data source but has no mapped field in ${contextLabel}.`);
                return '';
            }
            return serializeDynamicBindingToken(name, binding);
        }
        const valueStr = binding?.value ?? '';
        if (warnings && valueStr === '') {
            warnings.push(`Parameter "${name}" resolved to empty value in ${contextLabel}.`);
        }
        return valueStr;
    });
}

export function applyParamBindingToValueField(rawValue, step, bindings, options = {}) {
    const warnings = Array.isArray(options.warnings) ? options.warnings : null;
    const contextLabel = options.contextLabel || 'workflow';

    const exactMatch = rawValue.match(/^\$\{([A-Za-z0-9_]+)\}$/);
    if (!exactMatch) return null;
    const name = exactMatch[1];
    const key = normalizeParamName(name);
    const binding = (bindings || {})[key];
    if (!binding) {
        warnings?.push(`Missing parameter "${name}" while expanding ${contextLabel}.`);
        return { value: '' };
    }

    const stepType = step?.type || '';
    const supportsValueSource = ['input', 'select', 'lookupSelect', 'grid-input', 'filter', 'query-filter'].includes(stepType);
    if (!supportsValueSource && binding.valueSource !== 'static') {
        warnings?.push(`Parameter "${name}" uses ${binding.valueSource} but step type "${stepType}" does not support it in ${contextLabel}.`);
        return { value: '' };
    }

    if (binding.valueSource === 'data') {
        return {
            value: '',
            valueSource: 'data',
            fieldMapping: binding.fieldMapping || ''
        };
    }

    if (binding.valueSource === 'clipboard') {
        return {
            value: '',
            valueSource: 'clipboard',
            fieldMapping: ''
        };
    }

    const valueStr = binding.value ?? '';
    if (warnings && valueStr === '') {
        warnings.push(`Parameter "${name}" resolved to empty value in ${contextLabel}.`);
    }
    return {
        value: valueStr,
        valueSource: 'static'
    };
}

export function substituteParamsInObject(obj, bindings, options = {}) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        return substituteParamsInString(obj, bindings, options);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => substituteParamsInObject(item, bindings, options));
    }
    if (typeof obj === 'object') {
        const result = { ...obj };
        const overrideKeys = new Set();
        Object.entries(obj).forEach(([key, value]) => {
            if (key === 'value' && typeof value === 'string') {
                const applied = applyParamBindingToValueField(value, obj, bindings, options);
                if (applied) {
                    result.value = applied.value;
                    if (applied.valueSource !== undefined) {
                        result.valueSource = applied.valueSource;
                        overrideKeys.add('valueSource');
                    }
                    if (applied.fieldMapping !== undefined) {
                        result.fieldMapping = applied.fieldMapping;
                        overrideKeys.add('fieldMapping');
                    }
                    return;
                }
            }

            if (overrideKeys.has(key)) return;
            result[key] = substituteParamsInObject(value, bindings, options);
        });
        return result;
    }
    return obj;
}

export function resolveBindingMap(rawBindings, parentBindings, options = {}) {
    const normalized = buildNormalizedBindings(rawBindings);
    const resolved = {};
    Object.entries(normalized).forEach(([key, binding]) => {
        if (binding.valueSource === 'static') {
            const resolvedValue = substituteParamsInString(String(binding.value ?? ''), parentBindings, options);
            resolved[key] = { valueSource: 'static', value: resolvedValue };
        } else if (binding.valueSource === 'data') {
            const resolvedField = substituteParamsInString(String(binding.fieldMapping ?? ''), parentBindings, options);
            resolved[key] = { valueSource: 'data', fieldMapping: resolvedField };
        } else if (binding.valueSource === 'clipboard') {
            resolved[key] = { valueSource: 'clipboard' };
        } else {
            resolved[key] = { valueSource: 'static', value: '' };
        }
    });
    return resolved;
}
