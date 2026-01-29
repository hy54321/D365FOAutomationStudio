// Content Script - Bridge between webpage and extension

// Prevent multiple injections and listeners
if (!window.d365ContentScriptLoaded) {
    window.d365ContentScriptLoaded = true;
    
    // Inject the inspector script into the page (only once)
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
        this.remove();
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
        } catch (e) {
            // Extension context invalidated, ignore
        }
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

    return false;
});
