export const logsMethods = {
    toggleLogsPanel() {
        const logsPanel = document.getElementById('logsPanel');
        if (logsPanel) {
            const nextState = !logsPanel.classList.contains('open');
            this.setLogsPanelOpen(nextState);
        }
    },

    async initLogsPanelState() {
        const { logsPanelOpen } = await chrome.storage.local.get(['logsPanelOpen']);
        this.setLogsPanelOpen(!!logsPanelOpen);
    },

    setLogsPanelOpen(isOpen) {
        const logsPanel = document.getElementById('logsPanel');
        if (!logsPanel) return;
        logsPanel.classList.toggle('open', isOpen);
        chrome.storage.local.set({ logsPanelOpen: isOpen });
    },

    addLog(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push({ level, message, timestamp });

        // Keep only last 500 logs
        if (this.logs.length > 500) {
            this.logs = this.logs.slice(-500);
        }

        this.renderLogs();
    },

    renderLogs() {
        const container = document.getElementById('logsContent');
        if (!container) return;

        const filter = document.getElementById('logLevelFilter')?.value || 'all';
        const filtered = filter === 'all' ? this.logs : this.logs.filter(l => l.level === filter);

        if (filtered.length === 0) {
            container.innerHTML = '<div class="log-empty">No logs yet. Run a workflow to see execution logs.</div>';
            return;
        }

        container.innerHTML = filtered.map(log => `
            <div class="log-entry ${log.level}">
                <span class="log-time">${log.timestamp}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    },

    filterLogs() {
        this.renderLogs();
    },

    clearLogs() {
        this.logs = [];
        this.renderLogs();
        this.showNotification('Logs cleared', 'info');
    },

    exportLogs() {
        if (this.logs.length === 0) {
            this.showNotification('No logs to export', 'warning');
            return;
        }

        const logText = this.logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        this.showNotification('Logs exported', 'success');
    }
};
