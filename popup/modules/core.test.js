import { describe, expect, it, vi } from 'vitest';
import { coreMethods } from './core.js';

describe('popup core methods', () => {
    it('initLinkedTab restores existing linked tab when it is still valid', async () => {
        const tab = { id: 101, url: 'https://contoso.dynamics.com/', title: 'Sales order - D365FO' };
        const ctx = {
            chrome: {
                storage: {
                    local: {
                        get: vi.fn().mockResolvedValue({ linkedTabId: 101, linkedTabUrl: tab.url }),
                        set: vi.fn()
                    }
                },
                tabs: {
                    get: vi.fn().mockResolvedValue(tab),
                    query: vi.fn()
                }
            },
            linkedTabId: null,
            updateLinkedTabUI: vi.fn()
        };

        await coreMethods.initLinkedTab.call(ctx);

        expect(ctx.linkedTabId).toBe(101);
        expect(ctx.chrome.tabs.get).toHaveBeenCalledWith(101);
        expect(ctx.updateLinkedTabUI).toHaveBeenCalledWith(tab);
        expect(ctx.chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('initLinkedTab falls back to active D365 tab and persists link', async () => {
        const activeTab = { id: 202, url: 'https://fabrikam.cloudax.dynamics.com/', title: 'Customers - D365FO' };
        const ctx = {
            chrome: {
                storage: {
                    local: {
                        get: vi.fn().mockResolvedValue({}),
                        set: vi.fn().mockResolvedValue()
                    }
                },
                tabs: {
                    get: vi.fn(),
                    query: vi.fn().mockResolvedValue([activeTab])
                }
            },
            linkedTabId: null,
            updateLinkedTabUI: vi.fn()
        };

        await coreMethods.initLinkedTab.call(ctx);

        expect(ctx.linkedTabId).toBe(202);
        expect(ctx.chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(ctx.chrome.storage.local.set).toHaveBeenCalledWith({
            linkedTabId: 202,
            linkedTabUrl: activeTab.url
        });
        expect(ctx.updateLinkedTabUI).toHaveBeenCalledWith(activeTab);
    });

    it('getLinkedOrActiveTab falls back to active tab when linked tab is unavailable', async () => {
        const activeTab = { id: 303, url: 'https://contoso.dynamics.com/' };
        const ctx = {
            chrome: {
                tabs: {
                    get: vi.fn().mockRejectedValue(new Error('missing tab')),
                    query: vi.fn().mockResolvedValue([activeTab])
                }
            },
            linkedTabId: 999
        };

        const result = await coreMethods.getLinkedOrActiveTab.call(ctx);

        expect(ctx.linkedTabId).toBeNull();
        expect(ctx.chrome.tabs.get).toHaveBeenCalledWith(999);
        expect(ctx.chrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
        expect(result).toBe(activeTab);
    });
});
