// Background Service Worker

let studioWindowId = null;
let linkedTabId = null;

chrome.runtime.onInstalled.addListener(() => {
    console.log('D365FO Automation Extension installed');
});

// Handle extension icon click - open as standalone window
chrome.action.onClicked.addListener(async (tab) => {
    // Store the linked tab
    linkedTabId = tab.id;
    await chrome.storage.local.set({ linkedTabId: tab.id, linkedTabUrl: tab.url });
    
    // Check if studio window already exists
    if (studioWindowId !== null) {
        try {
            const existingWindow = await chrome.windows.get(studioWindowId);
            if (existingWindow) {
                // Focus existing window
                await chrome.windows.update(studioWindowId, { focused: true });
                return;
            }
        } catch (e) {
            // Window doesn't exist anymore
            studioWindowId = null;
        }
    }
    
    // Create new popup window
    const window = await chrome.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: 450,
        height: 700,
        top: 100,
        left: 100
    });
    
    studioWindowId = window.id;
});

// Track when the studio window is closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === studioWindowId) {
        studioWindowId = null;
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'elementsDiscovered') {
        // Forward to popup if open (will fail silently if closed)
        chrome.runtime.sendMessage(request).catch(() => {});
    }

    if (request.action === 'elementPicked') {
        // Store picked element for when popup reopens
        chrome.storage.local.set({ 
            pickedElement: request.element 
        }).then(() => {
            // Try to notify popup if it's open
            chrome.runtime.sendMessage(request).catch(() => {});
        });
    }

    // NOTE: workflowProgress, workflowComplete, workflowError are NOT forwarded here
    // because chrome.runtime.sendMessage from content.js already broadcasts to all
    // extension contexts (including popup). Re-forwarding would cause duplicate messages.
    
    // Handle getting the linked tab
    if (request.action === 'getLinkedTab') {
        sendResponse({ tabId: linkedTabId });
        return true;
    }
    
    // Handle setting the linked tab from popup
    if (request.action === 'setLinkedTab') {
        linkedTabId = request.tabId;
        chrome.storage.local.set({ linkedTabId: request.tabId });
        sendResponse({ success: true });
        return true;
    }
});
