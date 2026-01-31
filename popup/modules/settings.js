export const settingsMethods = {
    loadSettings() {
        const defaults = {
            delayAfterClick: 800,
            delayAfterInput: 400,
            delayAfterSave: 1000,
            maxRetries: 3,
            logVerbose: false,
            pauseOnError: false,
            comboSelectMode: 'method3',
            suppressLookupWarnings: false,
            labelLanguage: 'en-us'
        };

        const stored = localStorage.getItem('d365-settings');
        return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
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
    },

    saveSettings() {
        this.settings = {
            delayAfterClick: parseInt(document.getElementById('delayAfterClick').value),
            delayAfterInput: parseInt(document.getElementById('delayAfterInput').value),
            delayAfterSave: parseInt(document.getElementById('delayAfterSave').value),
            maxRetries: parseInt(document.getElementById('maxRetries').value),
            logVerbose: document.getElementById('logVerbose').checked,
            pauseOnError: document.getElementById('pauseOnError').checked,
            comboSelectMode: document.getElementById('comboSelectMode').value,
            suppressLookupWarnings: document.getElementById('suppressLookupWarnings').checked
        };

        // Read optional label language field
        const labelLangEl = document.getElementById('labelLanguage');
        this.settings.labelLanguage = labelLangEl ? (labelLangEl.value || 'en-us') : 'en-us';

        localStorage.setItem('d365-settings', JSON.stringify(this.settings));
        this.showNotification('Settings saved!', 'success');
    },

    resetSettings() {
        localStorage.removeItem('d365-settings');
        this.settings = this.loadSettings();
        this.loadSettingsUI();
        this.showNotification('Settings reset to defaults!', 'info');
    }
};
