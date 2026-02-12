import { describe, expect, it, vi } from 'vitest';
import { PopupController } from './controller.js';

describe('PopupController', () => {
    it('does not auto-init when autoInit is false', () => {
        const initSpy = vi.spyOn(PopupController.prototype, 'init').mockResolvedValue();

        const controller = new PopupController({ autoInit: false, initialSettings: { delayAfterClick: 10 } });

        expect(initSpy).not.toHaveBeenCalled();
        expect(controller.settings).toEqual({ delayAfterClick: 10 });

        initSpy.mockRestore();
    });

    it('uses injected chrome dependency', () => {
        const fakeChrome = {
            storage: {
                local: {
                    get: vi.fn().mockResolvedValue({ linkedTabId: null, linkedTabUrl: null })
                }
            },
            tabs: {
                query: vi.fn().mockResolvedValue([])
            },
            runtime: {
                onMessage: {
                    addListener: vi.fn()
                }
            }
        };

        const controller = new PopupController({ autoInit: false, chromeApi: fakeChrome });

        expect(controller.chrome).toBe(fakeChrome);
    });
});
