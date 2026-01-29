// Background Service Worker

let studioWindowId = null;
let linkedTabId = null;
let boundsSaveTimer = null;

async function cleanupOrphanStudioWindow() {
    const { studioWindowId: storedWindowId } = await chrome.storage.local.get(['studioWindowId']);
    if (!storedWindowId) return;

    try {
        const win = await chrome.windows.get(storedWindowId, { populate: true });
        const tabs = win.tabs || [];
        const studioUrl = chrome.runtime.getURL('popup.html');
        const hasStudioTab = tabs.some(tab => (tab.url || '') === studioUrl);
        const onlyNewTab = tabs.length === 1 && (tabs[0].url || '').startsWith('chrome://newtab');

        if (!hasStudioTab || onlyNewTab) {
            await chrome.windows.remove(storedWindowId);
            await chrome.storage.local.remove(['studioWindowId']);
            return;
        }

        // Restore in-memory state if the studio window is still valid.
        studioWindowId = storedWindowId;
    } catch (e) {
        // Window doesn't exist anymore.
        await chrome.storage.local.remove(['studioWindowId']);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    console.log('D365FO Automation Extension installed');
    cleanupOrphanStudioWindow().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
    cleanupOrphanStudioWindow().catch(() => {});
});

// Best effort cleanup when service worker starts (e.g., after extension reload)
cleanupOrphanStudioWindow().catch(() => {});

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
    
    const { studioWindowBounds } = await chrome.storage.local.get(['studioWindowBounds']);
    const fallbackBounds = { width: 450, height: 700, top: 100, left: 100 };
    const bounds = { ...fallbackBounds, ...(studioWindowBounds || {}) };

    // Create new popup window
    const window = await chrome.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: bounds.width,
        height: bounds.height,
        top: bounds.top,
        left: bounds.left
    });
    
    studioWindowId = window.id;
    await chrome.storage.local.set({ studioWindowId });
});

// Track when the studio window is closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === studioWindowId) {
        studioWindowId = null;
        chrome.storage.local.remove(['studioWindowId']).catch(() => {});
    }
});

chrome.windows.onBoundsChanged.addListener((window) => {
    if (window.id !== studioWindowId) return;
    if (boundsSaveTimer) {
        clearTimeout(boundsSaveTimer);
    }

    boundsSaveTimer = setTimeout(async () => {
        try {
            const current = await chrome.windows.get(studioWindowId);
            await chrome.storage.local.set({
                studioWindowBounds: {
                    width: current.width,
                    height: current.height,
                    top: current.top,
                    left: current.left
                }
            });
        } catch (e) {
            // Window may have closed; ignore.
        }
    }, 250);
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
