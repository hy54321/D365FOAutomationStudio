import D365Inspector from './inspector/D365Inspector.js';
import { logStep, sendLog } from './utils/logging.js';
import { sleep } from './utils/async.js';
import { coerceBoolean, normalizeText } from './utils/text.js';
import { NavigationInterruptError } from './runtime/errors.js';
import { clickElement, applyGridFilter, waitUntilCondition, setInputValue, setGridCellValue, setLookupSelectValue, setCheckboxValue, navigateToForm, activateTab, activateActionPaneTab, expandOrCollapseSection, configureQueryFilter, configureBatchProcessing, closeDialog, configureRecurrence } from './steps/actions.js';


window.D365Inspector = D365Inspector;

// ====== Initialize and Listen for Messages ======

// Prevent duplicate initialization
if (window.d365InjectedScriptLoaded) {
    console.log('D365 injected script already loaded, skipping...');
} else {
    window.d365InjectedScriptLoaded = true;

    // Create inspector instance
    const inspector = new D365Inspector();

    // ====== Workflow Execution Engine ======
    let currentWorkflowSettings = {};
    window.d365CurrentWorkflowSettings = currentWorkflowSettings;
    let currentWorkflow = null;
    let executionControl = {
        isPaused: false,
        isStopped: false,
        currentStepIndex: 0,
        currentRowIndex: 0,
        totalRows: 0,
        currentDataRow: null,
        runOptions: {
            skipRows: 0,
            limitRows: 0,
            dryRun: false
        }
    };

    // Single unified message listener
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        // Discovery requests
        if (event.data.type === 'D365_DISCOVER_ELEMENTS') {
            const activeFormOnly = event.data.activeFormOnly || false;
            const elements = inspector.discoverElements(activeFormOnly);
            const activeForm = inspector.getActiveFormName();
            window.postMessage({
                type: 'D365_ELEMENTS_DISCOVERED',
                elements: elements.map(el => ({
                    ...el,
                    element: undefined // Remove DOM reference for serialization
                })),
                activeForm: activeForm
            }, '*');
        }

        if (event.data.type === 'D365_START_PICKER') {
            inspector.startElementPicker((element) => {
                // Add form name to picked element
                const formName = inspector.getElementFormName(document.querySelector(`[data-dyn-controlname="${element.controlName}"]`));
                window.postMessage({
                    type: 'D365_ELEMENT_PICKED',
                    element: { ...element, formName }
                }, '*');
            });
        }

        if (event.data.type === 'D365_STOP_PICKER') {
            inspector.stopElementPicker();
        }

        if (event.data.type === 'D365_EXECUTE_WORKFLOW') {
            executeWorkflow(event.data.workflow, event.data.data);
        }

        if (event.data.type === 'D365_NAV_BUTTONS_UPDATE') {
            updateNavButtons(event.data.payload);
        }
        
        // Execution controls
        if (event.data.type === 'D365_PAUSE_WORKFLOW') {
            executionControl.isPaused = true;
        }
        if (event.data.type === 'D365_RESUME_WORKFLOW') {
            executionControl.isPaused = false;
        }
        if (event.data.type === 'D365_STOP_WORKFLOW') {
            executionControl.isStopped = true;
            executionControl.isPaused = false;
        }
    });

    let pendingNavButtonsPayload = null;
    let navButtonsRetryTimer = null;

    function updateNavButtons(payload) {
        pendingNavButtonsPayload = payload || null;
        renderNavButtons();
    }

    function renderNavButtons() {
        const payload = pendingNavButtonsPayload;
        if (!payload) return;

        const navGroup = document.getElementById('navigationMainActionGroup');
        if (!navGroup) {
            if (!navButtonsRetryTimer) {
                navButtonsRetryTimer = setTimeout(() => {
                    navButtonsRetryTimer = null;
                    renderNavButtons();
                }, 1000);
            }
            return;
        }

        const existingContainer = document.getElementById('d365-nav-buttons-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
        if (!buttons.length) return;

        const currentMenuItem = (payload.menuItem || '').toLowerCase();

        const visibleButtons = buttons.filter((button) => {
            const menuItems = Array.isArray(button.menuItems) ? button.menuItems : [];
            if (!menuItems.length) return true;
            if (!currentMenuItem) return false;
            return menuItems.some((item) => (item || '').toLowerCase() === currentMenuItem);
        });

        if (!visibleButtons.length) return;

        const container = document.createElement('div');
        container.id = 'd365-nav-buttons-container';
        container.style.display = 'flex';
        container.style.gap = '6px';
        container.style.alignItems = 'center';
        container.style.marginRight = '6px';

        visibleButtons.forEach((buttonConfig) => {
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'navigationBar-company navigationBar-pinnedElement';

            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = 'navigationBar-search';
            buttonEl.textContent = buttonConfig.name || buttonConfig.workflowName || 'Workflow';
            buttonEl.title = buttonConfig.name || '';
            buttonEl.setAttribute('data-d365-nav-button-id', buttonConfig.id || '');
            buttonEl.style.height = '24px';
            buttonEl.style.padding = '0 8px';
            buttonEl.style.borderRadius = '4px';
            buttonEl.style.border = '1px solid rgba(255,255,255,0.35)';
            buttonEl.style.background = 'rgba(255,255,255,0.12)';
            buttonEl.style.color = '#ffffff';
            buttonEl.style.fontSize = '12px';
            buttonEl.style.fontWeight = '600';
            buttonEl.style.lineHeight = '22px';
            buttonEl.style.cursor = 'pointer';
            buttonEl.style.whiteSpace = 'nowrap';
            buttonEl.style.display = 'inline-flex';
            buttonEl.style.alignItems = 'center';
            buttonEl.style.justifyContent = 'center';
            buttonEl.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.08)';

            buttonEl.addEventListener('click', async () => {
                const workflow = buttonConfig.workflow;
                if (!workflow) {
                    sendLog('error', `Workflow not found for nav button: ${buttonConfig.name || buttonConfig.id}`);
                    return;
                }
                const data = workflow.dataSources?.primary?.data || workflow.dataSource?.data || [];
                executeWorkflow(workflow, data);
            });

            buttonWrapper.appendChild(buttonEl);
            container.appendChild(buttonWrapper);
        });

        navGroup.insertBefore(container, navGroup.firstChild);
    }

    // Helper to check and wait for pause/stop
    async function checkExecutionControl() {
    if (executionControl.isStopped) {
        throw new Error('Workflow stopped by user');
    }
    
    while (executionControl.isPaused) {
        await sleep(200);
        if (executionControl.isStopped) {
            throw new Error('Workflow stopped by user');
        }
    }
}

async function executeWorkflow(workflow, data) {
    try {
        // Clear any stale pending navigation state before starting a new run
        try {
            sessionStorage.removeItem('d365_pending_workflow');
            if (workflow?.id) {
                sessionStorage.setItem('d365_active_workflow_id', workflow.id);
            }
        } catch (e) {
            // Ignore sessionStorage errors (e.g., in restricted contexts)
        }

        sendLog('info', `Starting workflow: ${workflow?.name || workflow?.id || 'unnamed'}`);
        window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: { phase: 'workflowStart', workflow: workflow?.name || workflow?.id } }, '*');
        // Reset execution control
        executionControl.isPaused = false;
        executionControl.isStopped = false;
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false };
        executionControl.stepIndexOffset = workflow?._originalStartIndex || 0;
        executionControl.currentStepIndex = executionControl.stepIndexOffset;
        currentWorkflow = workflow;
        
        // Preserve the original full workflow for navigation resume
        // If this is a resumed workflow, it may have _originalWorkflow attached
        // Otherwise, this IS the original workflow (first run)
        if (workflow._originalWorkflow) {
            window.d365OriginalWorkflow = workflow._originalWorkflow;
        } else if (!workflow._isResume) {
            // This is a fresh run, store the full workflow as the original
            window.d365OriginalWorkflow = workflow;
        }
        // If _isResume but no _originalWorkflow, keep existing d365OriginalWorkflow
        
        currentWorkflowSettings = workflow?.settings || {};
        window.d365CurrentWorkflowSettings = currentWorkflowSettings;
        // Expose current workflow and execution control to injected action modules
        window.d365CurrentWorkflow = currentWorkflow;
        window.d365ExecutionControl = executionControl;
        const steps = workflow.steps;
        
        // Get data from new dataSources structure or legacy dataSource
        let primaryData = [];
        let detailSources = {};
        let relationships = [];
        
        if (workflow.dataSources) {
            primaryData = workflow.dataSources.primary?.data || [];
            relationships = workflow.dataSources.relationships || [];
            
            // Index detail data sources by ID
            (workflow.dataSources.details || []).forEach(detail => {
                if (detail.data) {
                    detailSources[detail.id] = {
                        data: detail.data,
                        name: detail.name,
                        fields: detail.fields
                    };
                }
            });
        } else if (data) {
            // Legacy format
            primaryData = Array.isArray(data) ? data : [data];
        }
        
        // If no data, use a single empty row to run steps once
        if (primaryData.length === 0) {
            primaryData = [{}];
        }

        // Execute workflow with loop support
        await executeStepsWithLoops(steps, primaryData, detailSources, relationships, workflow.settings);

        sendLog('info', `Workflow complete: processed ${primaryData.length} rows`);
        window.postMessage({
            type: 'D365_WORKFLOW_COMPLETE',
            result: { processed: primaryData.length }
        }, '*');
    } catch (error) {
        // Navigation interrupts are not errors - the workflow will resume after page load
        if (error && error.isNavigationInterrupt) {
            sendLog('info', 'Workflow paused for navigation - will resume after page loads');
            return; // Don't report as error or complete
        }
        
        if (!error || !error._reported) {
            sendLog('error', `Workflow error: ${error?.message || String(error)}`);
            window.postMessage({
                type: 'D365_WORKFLOW_ERROR',
                error: error?.message || String(error),
                stack: error?.stack
            }, '*');
        }
    }
}

async function resolveStepValue(step, currentRow) {
    const source = step?.valueSource || (step?.fieldMapping ? 'data' : 'static');

    if (source === 'clipboard') {
        try {
            if (!navigator.clipboard?.readText) {
                throw new Error('Clipboard API not available');
            }
            const text = await navigator.clipboard.readText();
            return text ?? '';
        } catch (error) {
            sendLog('error', `Clipboard read failed: ${error?.message || String(error)}`);
            throw new Error('Clipboard read failed');
        }
    }

    if (source === 'data') {
        const row = currentRow || window.d365ExecutionControl?.currentDataRow || {};
        const field = step?.fieldMapping || '';
        if (!field) return '';
        const value = row[field];
        return value === undefined || value === null ? '' : String(value);
    }

    return step?.value ?? '';
}

// Execute a single step (maps step.type to action functions)
async function executeSingleStep(step, stepIndex, currentRow, detailSources, settings, dryRun) {
    executionControl.currentStepIndex = typeof step._absoluteIndex === 'number'
        ? step._absoluteIndex
        : (executionControl.stepIndexOffset || 0) + stepIndex;
    const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
    // Compute absolute step index (already stored on executionControl)
    const absoluteStepIndex = executionControl.currentStepIndex;
    window.postMessage({
        type: 'D365_WORKFLOW_PROGRESS',
        progress: { phase: 'stepStart', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
    }, '*');
    try {
        // Normalize step type (allow both camelCase and dash-separated types)
        const stepType = (step.type || '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${absoluteStepIndex + 1}: ${stepType} -> ${stepLabel}`);

        // Respect dry run mode
        if (dryRun) {
            sendLog('info', `Dry run - skipping action: ${step.type} ${step.controlName || ''}`);
            window.postMessage({
                type: 'D365_WORKFLOW_PROGRESS',
                progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
            }, '*');
            return;
        }

        let resolvedValue = null;
        if (['input', 'select', 'lookupSelect', 'gridInput', 'filter', 'queryFilter'].includes(stepType)) {
            resolvedValue = await resolveStepValue(step, currentRow);
        }

        const waitTarget = step.waitTargetControlName || step.controlName || '';
        const shouldWaitBefore = !!step.waitUntilVisible;
        const shouldWaitAfter = !!step.waitUntilHidden;

        if ((shouldWaitBefore || shouldWaitAfter) && !waitTarget) {
            sendLog('warning', `Wait option set but no control name on step ${absoluteStepIndex + 1}`);
        }

        if (shouldWaitBefore && waitTarget) {
            await waitUntilCondition(waitTarget, 'visible', null, 5000);
        }

        switch (stepType) {
            case 'click':
                await clickElement(step.controlName);
                break;

            case 'input':
            case 'select':
                await setInputValue(step.controlName, resolvedValue, step.fieldType);
                break;

            case 'lookupSelect':
                await setLookupSelectValue(step.controlName, resolvedValue);
                break;

            case 'checkbox':
                await setCheckboxValue(step.controlName, coerceBoolean(step.value));
                break;

            case 'gridInput':
                await setGridCellValue(step.controlName, resolvedValue, step.fieldType, !!step.waitForValidation);
                break;

            case 'filter':
                await applyGridFilter(step.controlName, resolvedValue, step.filterMethod || 'is exactly');
                break;
            case 'queryFilter':
                await configureQueryFilter(step.tableName, step.fieldName, resolvedValue, {
                    savedQuery: step.savedQuery,
                    closeDialogAfter: step.closeDialogAfter
                });
                break;

            case 'wait':
                await sleep(Number(step.duration) || 500);
                break;

            case 'waitUntil':
                await waitUntilCondition(
                    step.controlName,
                    step.waitCondition || 'visible',
                    step.waitValue,
                    step.timeout || 10000
                );
                break;

            case 'navigate':
                await navigateToForm(step);
                break;

            case 'activateTab':
                await activateTab(step.controlName);
                break;
            case 'tabNavigate':
                await activateTab(step.controlName);
                break;
            case 'actionPaneTab':
                await activateActionPaneTab(step.controlName);
                break;

            case 'expandSection':
                await expandOrCollapseSection(step.controlName, 'expand');
                break;

            case 'collapseSection':
                await expandOrCollapseSection(step.controlName, 'collapse');
                break;

            case 'closeDialog':
                await closeDialog();
                break;

            default:
                throw new Error(`Unsupported step type: ${step.type}`);
        }

        if (shouldWaitAfter && waitTarget) {
            await waitUntilCondition(waitTarget, 'hidden', null, 5000);
        }

        window.postMessage({
            type: 'D365_WORKFLOW_PROGRESS',
            progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
        }, '*');
    } catch (err) {
        // Re-throw navigation interrupts for upstream handling
        if (err && err.isNavigationInterrupt) throw err;
        sendLog('error', `Error executing step ${absoluteStepIndex + 1}: ${err?.message || String(err)}`);
        throw err;
    }
}
async function executeStepsWithLoops(steps, primaryData, detailSources, relationships, settings) {
    // Apply skip/limit rows from run options
    const { skipRows = 0, limitRows = 0, dryRun = false } = executionControl.runOptions;
    
    const originalTotalRows = primaryData.length;
    let startRowNumber = 0; // The starting row number for display
    
    if (skipRows > 0) {
        primaryData = primaryData.slice(skipRows);
        startRowNumber = skipRows;
        sendLog('info', `Skipped first ${skipRows} rows`);
    }
    
    if (limitRows > 0 && primaryData.length > limitRows) {
        primaryData = primaryData.slice(0, limitRows);
        sendLog('info', `Limited to ${limitRows} rows`);
    }
    
    const totalRowsToProcess = primaryData.length;
    executionControl.totalRows = originalTotalRows;
    
    // Find loop structures
    const loopPairs = findLoopPairs(steps);

    // Helper: find matching loop start/end pairs supporting nested loops and explicit loopRef linking
    function findLoopPairs(stepsList) {
        const stack = [];
        const pairs = [];

        for (let i = 0; i < stepsList.length; i++) {
            const s = stepsList[i];
            if (!s || !s.type) continue;

            if (s.type === 'loop-start') {
                // push start with its id (if present) so loop-end can match by loopRef
                stack.push({ startIndex: i, id: s.id });
            } else if (s.type === 'loop-end') {
                let matched = null;

                // If loop-end references a specific start id, try to match that
                if (s.loopRef) {
                    for (let j = stack.length - 1; j >= 0; j--) {
                        if (stack[j].id === s.loopRef) {
                            matched = { startIndex: stack[j].startIndex, endIndex: i };
                            stack.splice(j, 1);
                            break;
                        }
                    }
                }

                // Fallback: match the most recent unmatched loop-start (LIFO)
                if (!matched) {
                    const last = stack.pop();
                    if (last) {
                        matched = { startIndex: last.startIndex, endIndex: i };
                    } else {
                        // Unmatched loop-end - ignore but log
                        sendLog('error', `Unmatched loop-end at index ${i}`);
                    }
                }

                if (matched) pairs.push(matched);
            }
        }

        if (stack.length) {
            // Some loop-starts were not closed
            for (const rem of stack) {
                sendLog('error', `Unclosed loop-start at index ${rem.startIndex}`);
            }
        }

        // Sort pairs by start index ascending
        pairs.sort((a, b) => a.startIndex - b.startIndex);
        return pairs;
    }

    // If no loops, execute all steps for each primary data row (legacy behavior)
    if (loopPairs.length === 0) {
        for (let rowIndex = 0; rowIndex < primaryData.length; rowIndex++) {
            await checkExecutionControl(); // Check for pause/stop

            const row = primaryData[rowIndex];
            const displayRowNumber = startRowNumber + rowIndex; // Actual row number in original data
            executionControl.currentRowIndex = displayRowNumber;
            executionControl.currentDataRow = row;

            const rowProgress = {
                phase: 'rowStart',
                row: displayRowNumber,
                totalRows: originalTotalRows,
                processedRows: rowIndex + 1,
                totalToProcess: totalRowsToProcess,
                step: 'Processing row'
            };
            sendLog('info', `Processing row ${displayRowNumber + 1}/${originalTotalRows}`);
            window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: rowProgress }, '*');

            for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
                await checkExecutionControl(); // Check for pause/stop
                await executeSingleStep(steps[stepIndex], stepIndex, row, {}, settings, dryRun);
            }
        }
        return;
    }

    const loopPairMap = new Map(loopPairs.map(pair => [pair.startIndex, pair.endIndex]));
    const initialDataRow = primaryData[0] || {};

    const resolveLoopData = (loopDataSource, currentDataRow) => {
        let loopData = primaryData;

        if (loopDataSource !== 'primary' && detailSources[loopDataSource]) {
            const detailSource = detailSources[loopDataSource];

            // If there's a relationship, filter detail data by the current primary row
            const rel = relationships.find(r => r.detailId === loopDataSource);
            if (rel && currentDataRow[rel.primaryField] !== undefined) {
                loopData = detailSource.data.filter(d => 
                    String(d[rel.detailField]) === String(currentDataRow[rel.primaryField])
                );
            } else {
                loopData = detailSource.data;
            }
        }

        return loopData;
    };

    const executeRange = async (startIdx, endIdx, currentDataRow) => {
        if (currentDataRow) {
            executionControl.currentDataRow = currentDataRow;
        }
        let idx = startIdx;

        while (idx < endIdx) {
            await checkExecutionControl(); // Check for pause/stop

            const step = steps[idx];

            if (step.type === 'loop-start') {
                const loopEndIdx = loopPairMap.get(idx);
                if (loopEndIdx === undefined || loopEndIdx <= idx) {
                    throw new Error(`Loop start at index ${idx} has no matching end`);
                }

                const loopDataSource = step.loopDataSource || 'primary';
                let loopData = resolveLoopData(loopDataSource, currentDataRow);

                // Apply iteration limit
                const iterationLimit = step.iterationLimit || 0;
                if (iterationLimit > 0 && loopData.length > iterationLimit) {
                    loopData = loopData.slice(0, iterationLimit);
                }

                sendLog('info', `Entering loop: ${step.loopName || 'Loop'} (source=${loopDataSource}) - ${loopData.length} iterations`);
                for (let iterIndex = 0; iterIndex < loopData.length; iterIndex++) {
                    await checkExecutionControl(); // Check for pause/stop

                    const iterRow = { ...currentDataRow, ...loopData[iterIndex] };
                    const isPrimaryLoop = loopDataSource === 'primary';
                    const totalRowsForLoop = isPrimaryLoop ? originalTotalRows : loopData.length;
                    const totalToProcessForLoop = loopData.length;
                    const displayRowNumber = isPrimaryLoop ? startRowNumber + iterIndex : iterIndex;

                    const loopRowProgress = {
                        phase: 'rowStart',
                        row: displayRowNumber,
                        totalRows: totalRowsForLoop,
                        processedRows: iterIndex + 1,
                        totalToProcess: totalToProcessForLoop,
                        step: 'Processing row'
                    };
                    sendLog('info', `Loop iteration ${iterIndex + 1}/${loopData.length} for loop ${step.loopName || 'Loop'}`);
                    window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: loopRowProgress }, '*');

                    window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: { phase: 'loopIteration', iteration: iterIndex + 1, total: loopData.length, step: `Loop "${step.loopName || 'Loop'}": iteration ${iterIndex + 1}/${loopData.length}` } }, '*');

                    // Execute steps inside the loop (supports nested loops)
                    await executeRange(idx + 1, loopEndIdx, iterRow);
                }

                idx = loopEndIdx + 1;
                continue;
            }

            if (step.type === 'loop-end') {
                idx++;
                continue;
            }

            await executeSingleStep(step, idx, currentDataRow, detailSources, settings, executionControl.runOptions.dryRun);
            idx++;
        }
    };

    await executeRange(0, steps.length, initialDataRow);
}


} // End of injected script initialization guard
