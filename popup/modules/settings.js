export const settingsMethods = {
    async loadSettings() {
        const STORAGE_KEY = 'd365-settings';
        const defaults = {
            delayAfterClick: 800,
            delayAfterInput: 400,
            delayAfterSave: 1000,
            maxRetries: 3,
            logVerbose: false,
            pauseOnError: false,
            comboSelectMode: 'method3',
            suppressLookupWarnings: false,
            labelLanguage: 'en-us',
            dateFormat: 'DDMMYYYY'  // Date format for D365: DDMMYYYY or MMDDYYYY
        };

        let storedSettings = null;
        try {
            const result = await this.chrome.storage.local.get([STORAGE_KEY]);
            const fromChrome = result?.[STORAGE_KEY];
            if (fromChrome && typeof fromChrome === 'object') {
                storedSettings = fromChrome;
            }
        } catch (error) {
            // Fall back to legacy localStorage below.
        }

        // Backward compatibility: migrate old localStorage settings once.
        if (!storedSettings) {
            try {
                const legacyRaw = localStorage.getItem(STORAGE_KEY);
                if (legacyRaw) {
                    const parsed = JSON.parse(legacyRaw);
                    if (parsed && typeof parsed === 'object') {
                        storedSettings = parsed;
                        await this.chrome.storage.local.set({ [STORAGE_KEY]: parsed });
                        localStorage.removeItem(STORAGE_KEY);
                    }
                }
            } catch (error) {
                // Ignore malformed legacy settings and continue with defaults.
            }
        }

        return { ...defaults, ...(storedSettings || {}) };
    },

    loadSettingsUI() {
        document.getElementById('delayAfterClick').value = this.settings.delayAfterClick;
        document.getElementById('delayAfterInput').value = this.settings.delayAfterInput;
        document.getElementById('delayAfterSave').value = this.settings.delayAfterSave;
        document.getElementById('maxRetries').value = this.settings.maxRetries;
        document.getElementById('logVerbose').checked = this.settings.logVerbose;
        document.getElementById('pauseOnError').checked = this.settings.pauseOnError;
        document.getElementById('comboSelectMode').value = this.settings.comboSelectMode || 'method3';
        document.getElementById('suppressLookupWarnings').checked = !!this.settings.suppressLookupWarnings;
        document.getElementById('labelLanguage').value = this.settings.labelLanguage || 'en-us';
        document.getElementById('dateFormat').value = this.settings.dateFormat || 'DDMMYYYY';
    },

    async saveSettings() {
        const STORAGE_KEY = 'd365-settings';
        this.settings = {
            delayAfterClick: parseInt(document.getElementById('delayAfterClick').value, 10),
            delayAfterInput: parseInt(document.getElementById('delayAfterInput').value, 10),
            delayAfterSave: parseInt(document.getElementById('delayAfterSave').value, 10),
            maxRetries: parseInt(document.getElementById('maxRetries').value, 10),
            logVerbose: document.getElementById('logVerbose').checked,
            pauseOnError: document.getElementById('pauseOnError').checked,
            comboSelectMode: document.getElementById('comboSelectMode').value,
            suppressLookupWarnings: document.getElementById('suppressLookupWarnings').checked,
            dateFormat: document.getElementById('dateFormat').value || 'DDMMYYYY'
        };

        // Read optional label language field
        const labelLangEl = document.getElementById('labelLanguage');
        this.settings.labelLanguage = labelLangEl ? (labelLangEl.value || 'en-us') : 'en-us';

        await this.chrome.storage.local.set({ [STORAGE_KEY]: this.settings });
        // Clean up legacy settings key if it exists.
        localStorage.removeItem(STORAGE_KEY);
        this.showNotification('Settings saved!', 'success');
    },

    async resetSettings() {
        const STORAGE_KEY = 'd365-settings';
        await this.chrome.storage.local.remove([STORAGE_KEY]);
        localStorage.removeItem(STORAGE_KEY);
        this.settings = await this.loadSettings();
        this.loadSettingsUI();
        this.showNotification('Settings reset to defaults!', 'info');
    }
};
