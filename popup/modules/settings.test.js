/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsMethods } from './settings.js';

function createSettingsContext(overrides = {}) {
    return {
        settings: {
            delayAfterClick: 800,
            delayAfterInput: 400,
            delayAfterSave: 1000,
            maxRetries: 3,
            logVerbose: false,
            pauseOnError: false,
            comboSelectMode: 'method3',
            suppressLookupWarnings: false,
            labelLanguage: 'en-us',
            dateFormat: 'DDMMYYYY'
        },
        showNotification: vi.fn(),
        loadSettings: settingsMethods.loadSettings,
        loadSettingsUI: settingsMethods.loadSettingsUI,
        ...overrides
    };
}

function renderSettingsForm(includeLabelLanguage = true) {
    document.body.innerHTML = `
        <input id="delayAfterClick" />
        <input id="delayAfterInput" />
        <input id="delayAfterSave" />
        <input id="maxRetries" />
        <input id="logVerbose" type="checkbox" />
        <input id="pauseOnError" type="checkbox" />
        <select id="comboSelectMode"><option value="method1">m1</option><option value="method3">m3</option></select>
        <input id="suppressLookupWarnings" type="checkbox" />
        ${includeLabelLanguage ? '<input id="labelLanguage" />' : ''}
        <select id="dateFormat"><option value="DDMMYYYY">DDMMYYYY</option><option value="MMDDYYYY">MMDDYYYY</option></select>
    `;
}

describe('settings methods', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('loadSettings returns defaults when localStorage is empty', () => {
        const ctx = createSettingsContext();
        const settings = settingsMethods.loadSettings.call(ctx);

        expect(settings).toEqual({
            delayAfterClick: 800,
            delayAfterInput: 400,
            delayAfterSave: 1000,
            maxRetries: 3,
            logVerbose: false,
            pauseOnError: false,
            comboSelectMode: 'method3',
            suppressLookupWarnings: false,
            labelLanguage: 'en-us',
            dateFormat: 'DDMMYYYY'
        });
    });

    it('loadSettings merges persisted values over defaults', () => {
        localStorage.setItem('d365-settings', JSON.stringify({
            maxRetries: 9,
            pauseOnError: true,
            dateFormat: 'MMDDYYYY'
        }));
        const ctx = createSettingsContext();

        const settings = settingsMethods.loadSettings.call(ctx);

        expect(settings.maxRetries).toBe(9);
        expect(settings.pauseOnError).toBe(true);
        expect(settings.dateFormat).toBe('MMDDYYYY');
        expect(settings.delayAfterClick).toBe(800);
    });

    it('loadSettingsUI pushes context settings into form controls', () => {
        renderSettingsForm();
        const ctx = createSettingsContext({
            settings: {
                delayAfterClick: 1200,
                delayAfterInput: 600,
                delayAfterSave: 1600,
                maxRetries: 6,
                logVerbose: true,
                pauseOnError: true,
                comboSelectMode: 'method1',
                suppressLookupWarnings: true,
                labelLanguage: 'tr-tr',
                dateFormat: 'MMDDYYYY'
            }
        });

        settingsMethods.loadSettingsUI.call(ctx);

        expect(document.getElementById('delayAfterClick').value).toBe('1200');
        expect(document.getElementById('delayAfterInput').value).toBe('600');
        expect(document.getElementById('delayAfterSave').value).toBe('1600');
        expect(document.getElementById('maxRetries').value).toBe('6');
        expect(document.getElementById('logVerbose').checked).toBe(true);
        expect(document.getElementById('pauseOnError').checked).toBe(true);
        expect(document.getElementById('comboSelectMode').value).toBe('method1');
        expect(document.getElementById('suppressLookupWarnings').checked).toBe(true);
        expect(document.getElementById('labelLanguage').value).toBe('tr-tr');
        expect(document.getElementById('dateFormat').value).toBe('MMDDYYYY');
    });

    it('saveSettings persists parsed values and emits notification', () => {
        renderSettingsForm();
        document.getElementById('delayAfterClick').value = '1500';
        document.getElementById('delayAfterInput').value = '500';
        document.getElementById('delayAfterSave').value = '1700';
        document.getElementById('maxRetries').value = '8';
        document.getElementById('logVerbose').checked = true;
        document.getElementById('pauseOnError').checked = true;
        document.getElementById('comboSelectMode').value = 'method1';
        document.getElementById('suppressLookupWarnings').checked = true;
        document.getElementById('labelLanguage').value = 'de-de';
        document.getElementById('dateFormat').value = 'MMDDYYYY';

        const ctx = createSettingsContext();
        settingsMethods.saveSettings.call(ctx);

        expect(ctx.settings).toEqual({
            delayAfterClick: 1500,
            delayAfterInput: 500,
            delayAfterSave: 1700,
            maxRetries: 8,
            logVerbose: true,
            pauseOnError: true,
            comboSelectMode: 'method1',
            suppressLookupWarnings: true,
            labelLanguage: 'de-de',
            dateFormat: 'MMDDYYYY'
        });
        expect(JSON.parse(localStorage.getItem('d365-settings'))).toEqual(ctx.settings);
        expect(ctx.showNotification).toHaveBeenCalledWith('Settings saved!', 'success');
    });

    it('saveSettings defaults labelLanguage to en-us when control is missing', () => {
        renderSettingsForm(false);
        document.getElementById('delayAfterClick').value = '800';
        document.getElementById('delayAfterInput').value = '400';
        document.getElementById('delayAfterSave').value = '1000';
        document.getElementById('maxRetries').value = '3';
        document.getElementById('comboSelectMode').value = 'method3';
        document.getElementById('dateFormat').value = 'DDMMYYYY';

        const ctx = createSettingsContext();
        settingsMethods.saveSettings.call(ctx);

        expect(ctx.settings.labelLanguage).toBe('en-us');
    });

    it('resetSettings clears storage, reloads defaults into UI, and notifies', () => {
        renderSettingsForm();
        localStorage.setItem('d365-settings', JSON.stringify({ maxRetries: 9 }));
        const ctx = createSettingsContext({
            settings: { maxRetries: 9 },
            loadSettings: vi.fn().mockReturnValue({
                delayAfterClick: 800,
                delayAfterInput: 400,
                delayAfterSave: 1000,
                maxRetries: 3,
                logVerbose: false,
                pauseOnError: false,
                comboSelectMode: 'method3',
                suppressLookupWarnings: false,
                labelLanguage: 'en-us',
                dateFormat: 'DDMMYYYY'
            }),
            loadSettingsUI: vi.fn()
        });

        settingsMethods.resetSettings.call(ctx);

        expect(localStorage.getItem('d365-settings')).toBeNull();
        expect(ctx.loadSettings).toHaveBeenCalled();
        expect(ctx.settings.maxRetries).toBe(3);
        expect(ctx.loadSettingsUI).toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('Settings reset to defaults!', 'info');
    });
});
