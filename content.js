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

function initNavButtonsBridge() {
    if (navButtonsBridgeInitialized) return;
    navButtonsBridgeInitialized = true;

    // Initial load and send
    sendNavButtonsUpdate();

    // Refresh when storage changes (buttons or workflows)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.navButtons || changes.workflows) {
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
        const result = await chrome.storage.local.get(['navButtons', 'workflows']);
        const navButtons = result.navButtons || [];
        const workflows = result.workflows || [];

        const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));

        const menuItem = new URLSearchParams(window.location.search).get('mi') || '';
        lastNavButtonsMenuItem = menuItem;

        const payload = {
            menuItem,
            buttons: navButtons.map((button) => ({
                ...button,
                workflow: workflowMap.get(button.workflowId) || null
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
                        
                        console.log('[D365 Extension] D365 ready, sending resumeAfterNavigation message');
                        // Signal to background/popup to resume
                        chrome.runtime.sendMessage({
                            action: 'resumeAfterNavigation',
                            workflow: pending.workflow,
                            nextStepIndex: pending.nextStepIndex,
                            currentRowIndex: pending.currentRowIndex,
                            data: pending.data
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
