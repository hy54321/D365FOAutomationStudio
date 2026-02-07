// Content Script - Bridge between webpage and extension

// Prevent multiple injections and listeners
if (!window.d365ContentScriptLoaded) {
    window.d365ContentScriptLoaded = true;
    
    // Inject the inspector script into the page (only once)
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
        this.remove();
        
        // Check for pending workflow to resume after page load
        checkAndResumeWorkflow();
        initNavButtonsBridge();
    };
    (document.head || document.documentElement).appendChild(script);
    
    // Listen for messages from injected script (only once)
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        // Check if extension context is still valid
        if (!chrome.runtime?.id) return;
        
        try {
            if (event.data.type === 'D365_ELEMENTS_DISCOVERED') {
                chrome.runtime.sendMessage({
                    action: 'elementsDiscovered',
                    elements: event.data.elements
                });
            }

            if (event.data.type === 'D365_ELEMENT_PICKED') {
                chrome.runtime.sendMessage({
                    action: 'elementPicked',
                    element: event.data.element
                });
            }

            if (event.data.type === 'D365_WORKFLOW_PROGRESS') {
                chrome.runtime.sendMessage({
                    action: 'workflowProgress',
                    progress: event.data.progress
                });
            }

            if (event.data.type === 'D365_WORKFLOW_COMPLETE') {
                chrome.runtime.sendMessage({
                    action: 'workflowComplete',
                    result: event.data.result
                });
            }

            if (event.data.type === 'D365_WORKFLOW_ERROR') {
                chrome.runtime.sendMessage({
                    action: 'workflowError',
                    error: event.data.error
                });
            }

            if (event.data.type === 'D365_WORKFLOW_LOG') {
                chrome.runtime.sendMessage({
                    action: 'workflowLog',
                    log: event.data.log
                });
            }
            
            // Handle navigation event - save workflow state before page reload
            if (event.data.type === 'D365_WORKFLOW_NAVIGATING') {
                chrome.runtime.sendMessage({
                    action: 'workflowNavigating',
                    targetUrl: event.data.targetUrl,
                    waitForLoad: event.data.waitForLoad
                });
            }
        } catch (e) {
            // Extension context invalidated, ignore
        }
    });
}

let navButtonsBridgeInitialized = false;
let lastNavButtonsMenuItem = '';

function workflowHasLoops(workflow) {
    return (workflow?.steps || []).some(step => step.type === 'loop-start' || step.type === 'loop-end');
}

function normalizeParamName(name) {
    return (name || '').trim().toLowerCase();
}

function getParamNamesFromString(text) {
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

function extractRequiredParamsFromObject(obj, params) {
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

function getStepForParamExtraction(step) {
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

function extractRequiredParamsFromWorkflow(workflow) {
    const params = new Set();
    (workflow?.steps || []).forEach(step => {
        extractRequiredParamsFromObject(getStepForParamExtraction(step), params);
    });
    return Array.from(params);
}

function normalizeBindingValue(value) {
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

function buildNormalizedBindings(bindings) {
    const normalized = {};
    Object.entries(bindings || {}).forEach(([key, value]) => {
        const name = normalizeParamName(key);
        if (!name) return;
        normalized[name] = normalizeBindingValue(value);
    });
    return normalized;
}

function serializeDynamicBindingToken(name, binding) {
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

function substituteParamsInString(text, bindings) {
    if (typeof text !== 'string') return text;
    return text.replace(/\\?\$\{([A-Za-z0-9_]+)\}/g, (match, name) => {
        if (match.startsWith('\\')) {
            return match.slice(1);
        }
        const key = normalizeParamName(name);
        if (!Object.prototype.hasOwnProperty.call(bindings, key)) {
            return '';
        }
        const binding = bindings[key];
        if (binding?.valueSource && binding.valueSource !== 'static') {
            if (binding.valueSource === 'data' && !String(binding.fieldMapping || '').trim()) {
                return '';
            }
            return serializeDynamicBindingToken(name, binding);
        }
        return binding?.value ?? '';
    });
}

function applyParamBindingToValueField(rawValue, step, bindings) {
    const exactMatch = rawValue.match(/^\$\{([A-Za-z0-9_]+)\}$/);
    if (!exactMatch) return null;
    const name = exactMatch[1];
    const key = normalizeParamName(name);
    const binding = bindings[key];
    if (!binding) return { value: '' };

    const stepType = step?.type || '';
    const supportsValueSource = ['input', 'select', 'lookupSelect', 'grid-input', 'filter', 'query-filter'].includes(stepType);
    if (!supportsValueSource && binding.valueSource !== 'static') {
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

    return {
        value: binding.value ?? '',
        valueSource: 'static'
    };
}

function substituteParamsInObject(obj, bindings) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        return substituteParamsInString(obj, bindings);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => substituteParamsInObject(item, bindings));
    }
    if (typeof obj === 'object') {
        const result = { ...obj };
        const overrideKeys = new Set();
        Object.entries(obj).forEach(([key, value]) => {
            if (key === 'value' && typeof value === 'string') {
                const applied = applyParamBindingToValueField(value, obj, bindings);
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
            result[key] = substituteParamsInObject(value, bindings);
        });
        return result;
    }
    return obj;
}

function resolveBindingMap(rawBindings, parentBindings) {
    const normalized = buildNormalizedBindings(rawBindings);
    const resolved = {};
    Object.entries(normalized).forEach(([key, binding]) => {
        if (binding.valueSource === 'static') {
            const resolvedValue = substituteParamsInString(String(binding.value ?? ''), parentBindings);
            resolved[key] = { valueSource: 'static', value: resolvedValue };
        } else if (binding.valueSource === 'data') {
            const resolvedField = substituteParamsInString(String(binding.fieldMapping ?? ''), parentBindings);
            resolved[key] = { valueSource: 'data', fieldMapping: resolvedField };
        } else if (binding.valueSource === 'clipboard') {
            resolved[key] = { valueSource: 'clipboard' };
        } else {
            resolved[key] = { valueSource: 'static', value: '' };
        }
    });
    return resolved;
}

function expandWorkflowForNavButtons(rootWorkflow, workflowMap, rootBindings = {}) {
    const expand = (workflow, bindings, stack) => {
        if (!workflow || !Array.isArray(workflow.steps)) {
            throw new Error('Invalid workflow structure.');
        }

        const workflowId = workflow.id || workflow.name || 'workflow';
        if (stack.includes(workflowId)) {
            throw new Error(`Subworkflow cycle detected: ${[...stack, workflowId].join(' -> ')}`);
        }

        const requiredParams = extractRequiredParamsFromWorkflow(workflow);
        const missing = requiredParams.filter(name => !Object.prototype.hasOwnProperty.call(bindings, name));
        if (missing.length) {
            const wfName = workflow.name || workflow.id || 'workflow';
            throw new Error(`Missing parameters for workflow "${wfName}": ${missing.join(', ')}`);
        }

        const nextStack = [...stack, workflowId];
        const expandedSteps = [];

        for (const step of workflow.steps) {
            if (step?.type === 'subworkflow') {
                const subId = step.subworkflowId;
                if (!subId) {
                    throw new Error(`Subworkflow step missing target in "${workflow.name || workflow.id}".`);
                }
                const subWorkflow = workflowMap.get(subId);
                if (!subWorkflow) {
                    throw new Error(`Subworkflow not found: ${subId}`);
                }
                if (workflowHasLoops(subWorkflow)) {
                    const subName = subWorkflow.name || subWorkflow.id || 'workflow';
                    throw new Error(`Subworkflow "${subName}" contains loops and cannot be used.`);
                }

                const resolvedBindings = resolveBindingMap(step.paramBindings || {}, bindings);
                const expandedSub = expand(subWorkflow, resolvedBindings, nextStack);
                expandedSteps.push(...expandedSub.steps);
            } else {
                const substituted = substituteParamsInObject(step, bindings);
                expandedSteps.push(substituted);
            }
        }

        return {
            ...workflow,
            steps: expandedSteps
        };
    };

    return expand(rootWorkflow, buildNormalizedBindings(rootBindings || {}), []);
}

function initNavButtonsBridge() {
    if (navButtonsBridgeInitialized) return;
    navButtonsBridgeInitialized = true;

    // Initial load and send
    sendNavButtonsUpdate();

    // Refresh when storage changes (buttons or workflows)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.navButtons || changes.workflows || changes.sharedDataSources) {
            sendNavButtonsUpdate();
        }
    });

    // Poll for menu item (mi) changes in SPA navigation
    setInterval(() => {
        const currentMi = new URLSearchParams(window.location.search).get('mi') || '';
        if (currentMi !== lastNavButtonsMenuItem) {
            sendNavButtonsUpdate();
        }
    }, 1000);
}

async function sendNavButtonsUpdate() {
    try {
        const result = await chrome.storage.local.get(['navButtons', 'workflows', 'sharedDataSources']);
        const navButtons = result.navButtons || [];
        const workflows = result.workflows || [];
        const sharedDataSources = result.sharedDataSources || [];

        const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
        const sharedMap = new Map(sharedDataSources.map((source) => [source.id, source]));

        const menuItem = new URLSearchParams(window.location.search).get('mi') || '';
        lastNavButtonsMenuItem = menuItem;

        const payload = {
            menuItem,
            buttons: navButtons.map((button) => ({
                ...button,
                workflow: (() => {
                    const workflow = workflowMap.get(button.workflowId);
                    if (!workflow) return null;
                    try {
                        const resolvedWorkflow = (() => {
                            const candidate = { ...workflow, dataSources: { ...(workflow.dataSources || {}) } };
                            const primary = candidate.dataSources.primary || {};
                            if (primary.type !== 'shared') {
                                return candidate;
                            }
                            const shared = sharedMap.get(primary.sharedDataSourceId || '');
                            if (!shared) {
                                throw new Error(`Shared data source not found: ${primary.sharedDataSourceId || '(empty reference)'}`);
                            }
                            candidate.dataSources.primary = {
                                ...primary,
                                data: Array.isArray(shared.data) ? shared.data : [],
                                fields: Array.isArray(shared.fields) ? shared.fields : []
                            };
                            return candidate;
                        })();

                        return expandWorkflowForNavButtons(resolvedWorkflow, workflowMap, button.paramBindings || {});
                    } catch (error) {
                        console.warn('[D365 Extension] Failed to expand workflow for nav button:', button?.name || button?.id, error);
                        return null;
                    }
                })()
            }))
        };

        window.postMessage({ type: 'D365_NAV_BUTTONS_UPDATE', payload }, '*');
    } catch (e) {
        // Ignore storage errors
    }
}

/**
 * Check for pending workflow to resume after navigation
 */
function checkAndResumeWorkflow() {
    console.log('[D365 Extension] checkAndResumeWorkflow called');
    
    try {
        const pendingData = sessionStorage.getItem('d365_pending_workflow');
        console.log('[D365 Extension] Pending workflow data:', pendingData ? 'found' : 'not found');
        
        if (!pendingData) {
            console.log('[D365 Extension] No pending workflow in sessionStorage');
            return;
        }
        
        const pending = JSON.parse(pendingData);
        console.log('[D365 Extension] Parsed pending workflow:', {
            targetMenuItemName: pending.targetMenuItemName,
            nextStepIndex: pending.nextStepIndex,
            workflowName: pending.workflow?.name
        });

        // If a different workflow is now active, ignore stale pending data
        const activeWorkflowId = sessionStorage.getItem('d365_active_workflow_id');
        if (activeWorkflowId && pending.workflowId && pending.workflowId !== activeWorkflowId) {
            console.log('[D365 Extension] Pending workflow does not match active workflow, clearing');
            sessionStorage.removeItem('d365_pending_workflow');
            return;
        }
        
        // Check if this is the target URL (or close enough)
        const currentMi = new URLSearchParams(window.location.search).get('mi');
        const targetMi = pending.targetMenuItemName;
        
        console.log('[D365 Extension] URL check: current mi =', currentMi, ', target mi =', targetMi);
        
        if (currentMi && targetMi && currentMi.toLowerCase() === targetMi.toLowerCase()) {
            console.log('[D365 Extension] Found pending workflow to resume');
            
            // Clear the pending state immediately to prevent duplicate resumes
            sessionStorage.removeItem('d365_pending_workflow');
            
            // Wait for D365 to fully load with multiple checks
            // First wait for initial page load (minimum 2 seconds)
            const initialWait = Math.max(pending.waitForLoad || 3000, 2000);
            
            console.log(`[D365 Extension] Waiting ${initialWait}ms for initial page load...`);
            
            setTimeout(async () => {
                try {
                    // Now wait for D365 forms to be ready
                    console.log('[D365 Extension] Checking if D365 is ready...');
                    const isReady = await waitForD365Ready(30000);
                    
                    if (isReady) {
                        // Additional wait for D365 to stabilize (controls to initialize)
                        console.log('[D365 Extension] D365 forms detected, waiting for stabilization...');
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        console.log('[D365 Extension] D365 ready, resuming workflow in page context');

                        // Resume directly in the page so it works even when the popup is closed.
                        try {
                            const workflow = pending.workflow;
                            const nextStepIndex = pending.nextStepIndex || 0;

                            if (!workflow || !Array.isArray(workflow.steps)) {
                                console.error('[D365 Extension] Pending workflow is missing steps; cannot resume');
                            } else {
                                let remainingSteps = workflow.steps.slice(nextStepIndex);

                                // If the first remaining step is a navigate to the same menu item
                                // we're already on, skip it to avoid reloading the page again.
                                try {
                                    const currentMiLocal = new URLSearchParams(window.location.search).get('mi') || '';
                                    if (remainingSteps.length > 0 && (remainingSteps[0].type || '').toLowerCase() === 'navigate') {
                                        const navStep = remainingSteps[0];
                                        // Derive target mi for this navigate step
                                        const base = window.location.origin + window.location.pathname;
                                        let targetMi = '';
                                        if (navStep.navigateMethod === 'url' && navStep.navigateUrl) {
                                            try {
                                                const u = new URL(navStep.navigateUrl.startsWith('http') ? navStep.navigateUrl : base + navStep.navigateUrl);
                                                targetMi = u.searchParams.get('mi') || '';
                                            } catch (e) {}
                                        } else if (navStep.menuItemName) {
                                            targetMi = navStep.menuItemName || '';
                                        }

                                        if (currentMiLocal && targetMi && currentMiLocal.toLowerCase() === targetMi.toLowerCase()) {
                                            // Skip this navigate - we are already on the target page
                                            remainingSteps.shift();
                                            // Advance the nextStepIndex so logging and popup state remain accurate
                                            nextStepIndex = (nextStepIndex || 0) + 1;
                                            console.log('[D365 Extension] Skipping redundant navigate step on resume (already on target page)');
                                        }
                                    }
                                } catch (e) {
                                    console.warn('[D365 Extension] Error checking redundant navigate step:', e);
                                }

                                const remainingMapped = remainingSteps.map((step, idx) => ({ ...step, _absoluteIndex: nextStepIndex + idx }));
                                const continueWorkflow = {
                                    ...workflow,
                                    steps: remainingMapped,
                                    _isResume: true,
                                    _originalStartIndex: nextStepIndex,
                                    _originalWorkflow: workflow
                                };

                                let dataToProcess = [];
                                if (pending.data) {
                                    dataToProcess = Array.isArray(pending.data) ? pending.data : [pending.data];
                                } else if (workflow.dataSources?.primary?.data) {
                                    dataToProcess = workflow.dataSources.primary.data;
                                } else if (workflow.dataSource?.data) {
                                    dataToProcess = workflow.dataSource.data;
                                }

                                if (!Array.isArray(dataToProcess) || dataToProcess.length === 0) {
                                    dataToProcess = [{}];
                                }

                                window.postMessage({
                                    type: 'D365_EXECUTE_WORKFLOW',
                                    workflow: continueWorkflow,
                                    data: dataToProcess
                                }, '*');
                            }
                        } catch (e) {
                            console.error('[D365 Extension] Failed to resume workflow in page:', e);
                        }

                        console.log('[D365 Extension] Sending resumeAfterNavigation status to popup');
                        // Notify popup (if open) to update execution state without re-executing
                        chrome.runtime.sendMessage({
                            action: 'resumeAfterNavigation',
                            workflow: pending.workflow,
                            nextStepIndex: pending.nextStepIndex,
                            currentRowIndex: pending.currentRowIndex,
                            data: pending.data,
                            resumeHandled: true
                        });
                        console.log('[D365 Extension] resumeAfterNavigation message sent');
                    } else {
                        console.error('[D365 Extension] D365 did not become ready in time');
                    }
                } catch (e) {
                    console.error('[D365 Extension] Error during resume:', e);
                }
            }, initialWait);
        } else {
            // URL doesn't match, clear stale data
            console.log('[D365 Extension] URL mismatch, clearing pending workflow. Current:', currentMi, 'Target:', targetMi);
            sessionStorage.removeItem('d365_pending_workflow');
        }
    } catch (e) {
        console.error('[D365 Extension] Error checking pending workflow:', e);
        sessionStorage.removeItem('d365_pending_workflow');
    }
}

/**
 * Wait for D365 to be ready (forms loaded and interactive)
 * Checks for multiple indicators that D365 has finished loading
 */
function waitForD365Ready(maxWait = 30000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let formFoundAt = null;
        
        const check = () => {
            const elapsed = Date.now() - startTime;
            
            // Check for form elements
            const hasForm = document.querySelector('[data-dyn-role="Form"], [data-dyn-form-name]');
            const hasControls = document.querySelector('[data-dyn-controlname]');
            
            // Check if there's a loading indicator still active
            const isLoading = document.querySelector('.loading-container:not(.hidden), .appshell-busy, [data-dyn-role="BusyIndicator"]:not([style*="display: none"])');
            
            if (hasForm && hasControls) {
                if (!formFoundAt) {
                    formFoundAt = Date.now();
                    console.log('[D365 Extension] Forms detected, waiting for controls to stabilize...');
                }
                
                // Wait at least 1 second after form is found to ensure controls are ready
                // and check that loading indicators are gone
                if (!isLoading && (Date.now() - formFoundAt) >= 1000) {
                    console.log(`[D365 Extension] D365 ready after ${elapsed}ms`);
                    resolve(true);
                    return;
                }
            }
            
            if (elapsed > maxWait) {
                console.warn(`[D365 Extension] D365 did not become ready within ${maxWait}ms`);
                // Still return true if we have forms, even if loading indicator is present
                resolve(hasForm && hasControls);
                return;
            }
            
            setTimeout(check, 300);
        };
        check();
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkD365') {
        // Check if this is a D365FO page
        const isD365 = document.querySelector('[data-dyn-role]') !== null;
        sendResponse({ isD365: isD365 });
        return true; // Async response
    }

    if (request.action === 'discoverElements') {
        // Execute in page context
        window.postMessage({ 
            type: 'D365_DISCOVER_ELEMENTS',
            activeFormOnly: request.activeFormOnly || false
        }, '*');
        return false; // No response needed
    }

    if (request.action === 'startPicker') {
        window.postMessage({ type: 'D365_START_PICKER' }, '*');
        return false; // No response needed
    }

    if (request.action === 'stopPicker') {
        window.postMessage({ type: 'D365_STOP_PICKER' }, '*');
        return false; // No response needed
    }

    if (request.action === 'executeWorkflow') {
        window.postMessage({ 
            type: 'D365_EXECUTE_WORKFLOW', 
            workflow: request.workflow,
            data: request.data
        }, '*');
        return false; // No response needed
    }

    // Execution controls
    if (request.action === 'pauseWorkflow') {
        window.postMessage({ type: 'D365_PAUSE_WORKFLOW' }, '*');
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'resumeWorkflow') {
        window.postMessage({ type: 'D365_RESUME_WORKFLOW' }, '*');
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'stopWorkflow') {
        window.postMessage({ type: 'D365_STOP_WORKFLOW' }, '*');
        sendResponse({ success: true });
        return true;
    }

    // Resolve D365 labels via OData API
    if (request.action === 'resolveD365Labels') {
        const { labelIds, language = 'en-us' } = request;
        const results = {};
        
        console.log('[D365 Extension] Resolving labels:', labelIds);
        
        // Process labels in parallel
        Promise.all(
            labelIds.map(async (labelId) => {
                if (!labelId || !labelId.startsWith('@')) return;
                
                try {
                    // Don't encode the @ symbol - D365 expects it literally in the URL
                    const url = `/metadata/Labels(Id='${labelId}',Language='${language}')`;
                    console.log('[D365 Extension] Fetching label:', url);
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('[D365 Extension] Label resolved:', labelId, '->', data.Value);
                        if (data.Value) {
                            results[labelId] = data.Value;
                        }
                    } else {
                        console.warn('[D365 Extension] Label fetch failed:', labelId, response.status);
                    }
                } catch (error) {
                    console.warn(`[D365 Extension] Failed to resolve label ${labelId}:`, error);
                }
            })
        ).then(() => {
            console.log('[D365 Extension] All labels resolved:', results);
            sendResponse({ success: true, labels: results });
        }).catch(error => {
            console.error('[D365 Extension] Label resolution error:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Async response
    }

    return false;
});
