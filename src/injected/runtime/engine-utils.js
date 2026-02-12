export function getWorkflowErrorDefaults(settings) {
    return {
        mode: settings?.errorDefaultMode || 'fail',
        retryCount: Number.isFinite(settings?.errorDefaultRetryCount) ? settings.errorDefaultRetryCount : 0,
        retryDelay: Number.isFinite(settings?.errorDefaultRetryDelay) ? settings.errorDefaultRetryDelay : 1000,
        gotoLabel: settings?.errorDefaultGotoLabel || ''
    };
}

export function getStepErrorConfig(step, settings) {
    const defaults = getWorkflowErrorDefaults(settings);
    const mode = step?.onErrorMode && step.onErrorMode !== 'default' ? step.onErrorMode : defaults.mode;
    const retryCount = Number.isFinite(step?.onErrorRetryCount) ? step.onErrorRetryCount : defaults.retryCount;
    const retryDelay = Number.isFinite(step?.onErrorRetryDelay) ? step.onErrorRetryDelay : defaults.retryDelay;
    const gotoLabel = step?.onErrorGotoLabel || defaults.gotoLabel;
    return { mode, retryCount, retryDelay, gotoLabel };
}

export function findLoopPairs(stepsList, onIssue = () => {}) {
    const stack = [];
    const pairs = [];

    for (let i = 0; i < stepsList.length; i++) {
        const s = stepsList[i];
        if (!s || !s.type) continue;

        if (s.type === 'loop-start') {
            stack.push({ startIndex: i, id: s.id });
            continue;
        }

        if (s.type !== 'loop-end') continue;

        let matched = null;
        if (s.loopRef) {
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].id === s.loopRef) {
                    matched = { startIndex: stack[j].startIndex, endIndex: i };
                    stack.splice(j, 1);
                    break;
                }
            }
        }

        if (!matched) {
            const last = stack.pop();
            if (last) {
                matched = { startIndex: last.startIndex, endIndex: i };
            } else {
                onIssue(`Unmatched loop-end at index ${i}`);
            }
        }

        if (matched) pairs.push(matched);
    }

    if (stack.length) {
        for (const rem of stack) {
            onIssue(`Unclosed loop-start at index ${rem.startIndex}`);
        }
    }

    pairs.sort((a, b) => a.startIndex - b.startIndex);
    return pairs;
}

export function findIfPairs(stepsList, onIssue = () => {}) {
    const stack = [];
    const ifToElse = new Map();
    const ifToEnd = new Map();
    const elseToEnd = new Map();

    for (let i = 0; i < stepsList.length; i++) {
        const s = stepsList[i];
        if (!s || !s.type) continue;

        if (s.type === 'if-start') {
            stack.push({ ifIndex: i, elseIndex: null });
            continue;
        }

        if (s.type === 'else') {
            if (stack.length === 0) {
                onIssue(`Else without matching if-start at index ${i}`);
                continue;
            }

            const top = stack[stack.length - 1];
            if (top.elseIndex === null) {
                top.elseIndex = i;
            } else {
                onIssue(`Multiple else blocks for if-start at index ${top.ifIndex}`);
            }
            continue;
        }

        if (s.type !== 'if-end') continue;

        const top = stack.pop();
        if (!top) {
            onIssue(`If-end without matching if-start at index ${i}`);
            continue;
        }

        ifToEnd.set(top.ifIndex, i);
        if (top.elseIndex !== null) {
            ifToElse.set(top.ifIndex, top.elseIndex);
            elseToEnd.set(top.elseIndex, i);
        }
    }

    if (stack.length) {
        for (const rem of stack) {
            onIssue(`Unclosed if-start at index ${rem.ifIndex}`);
        }
    }

    return { ifToElse, ifToEnd, elseToEnd };
}
