export const configurationMethods = {
    async loadConfigurations() {
        const result = await this.chrome.storage.local.get(['configurations', 'selectedConfigurationId']);
        const rawConfigurations = result.configurations || [];
        let normalizedChanged = false;
        this.configurations = rawConfigurations.map(configuration => {
            const normalized = this.normalizeConfigurationShape(configuration);
            if (!Array.isArray(configuration?.workflowOrder)) {
                normalizedChanged = true;
            }
            return normalized;
        });
        this.selectedConfigurationId = result.selectedConfigurationId || 'all';

        if (this.selectedConfigurationId !== 'all' && this.selectedConfigurationId !== 'unassigned'
            && !this.configurations.find(c => c.id === this.selectedConfigurationId)) {
            this.selectedConfigurationId = 'all';
            await this.chrome.storage.local.set({ selectedConfigurationId: 'all' });
        }

        this.renderConfigurationFilter();
        this.renderConfigurationsManager();
        this.renderConfigurationTree();
        this.renderWorkflowConfigurations();

        if (normalizedChanged) {
            await this.chrome.storage.local.set({ configurations: this.configurations });
        }
    },

    setupConfigurationUI() {
        const filter = document.getElementById('configurationFilter');
        filter?.addEventListener('change', async (e) => {
            await this.selectConfigurationFilter(e.target.value || 'all', false);
        });

        document.getElementById('createConfiguration')?.addEventListener('click', () => this.createConfigurationFromInput());
        document.getElementById('newConfigurationName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createConfigurationFromInput();
            }
        });
        document.getElementById('addConfigurationQuick')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.createConfigurationByPrompt();
        });

        document.getElementById('runConfiguration')?.addEventListener('click', () => this.startSelectedConfigurationRun());
        document.getElementById('configurationsTree')?.addEventListener('contextmenu', (e) => {
            this.handleConfigurationTreeContextMenu(e);
        });
    },

    async selectConfigurationFilter(configurationId, clearProject = true) {
        this.selectedConfigurationId = configurationId || 'all';
        if (clearProject) {
            this.selectedProjectId = 'all';
        }

        await this.chrome.storage.local.set({
            selectedConfigurationId: this.selectedConfigurationId,
            selectedProjectId: this.selectedProjectId
        });

        this.renderConfigurationFilter();
        if (this.renderProjectFilter) {
            this.renderProjectFilter();
        }
        this.renderConfigurationTree();
        this.renderConfigurationsManager();
        if (this.renderProjectTree) {
            this.renderProjectTree();
        }
        this.displayWorkflows();
    },

    normalizeConfigurationShape(configuration) {
        return {
            ...(configuration || {}),
            workflowOrder: Array.isArray(configuration?.workflowOrder) ? configuration.workflowOrder.slice() : []
        };
    },

    getConfigurationById(configurationId) {
        return (this.configurations || []).find(c => c.id === configurationId) || null;
    },

    getConfigurationWorkflowOrder(configurationId) {
        const configuration = this.getConfigurationById(configurationId);
        if (!configuration) return [];
        if (!Array.isArray(configuration.workflowOrder)) {
            configuration.workflowOrder = [];
        }
        return configuration.workflowOrder;
    },

    syncConfigurationOrderForWorkflow(workflow) {
        if (!workflow?.id) return false;
        const selectedConfigIds = new Set(workflow.configurationIds || []);
        let changed = false;

        (this.configurations || []).forEach(configuration => {
            if (!Array.isArray(configuration.workflowOrder)) {
                configuration.workflowOrder = [];
                changed = true;
            }

            const idx = configuration.workflowOrder.indexOf(workflow.id);
            const shouldInclude = selectedConfigIds.has(configuration.id);

            if (shouldInclude && idx === -1) {
                configuration.workflowOrder.push(workflow.id);
                changed = true;
            }

            if (!shouldInclude && idx !== -1) {
                configuration.workflowOrder.splice(idx, 1);
                changed = true;
            }
        });

        return changed;
    },

    createConfigurationFromInput() {
        const input = document.getElementById('newConfigurationName');
        if (!input) return;
        const name = input.value.trim();
        if (!name) {
            this.showNotification('Configuration name is required', 'error');
            return;
        }
        this.createConfiguration(name);
        input.value = '';
    },

    createConfiguration(name) {
        if (!name) return false;
        if (this.configurations.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('A configuration with this name already exists', 'error');
            return false;
        }

        const configuration = { id: Date.now().toString(), name, workflowOrder: [] };
        this.configurations.push(configuration);

        this.chrome.storage.local.set({ configurations: this.configurations });
        this.renderConfigurationFilter();
        this.renderConfigurationsManager();
        this.renderConfigurationTree();
        this.renderWorkflowConfigurations();
        return true;
    },

    createConfigurationByPrompt() {
        const name = prompt('New configuration name');
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        this.createConfiguration(trimmed);
    },

    async deleteConfiguration(configurationId) {
        const configuration = this.configurations.find(c => c.id === configurationId);
        if (!configuration) return;
        if (!confirm(`Delete configuration "${configuration.name}"? This will unlink it from all workflows.`)) return;

        this.configurations = this.configurations.filter(c => c.id !== configurationId);
        this.workflows = (this.workflows || []).map(w => ({
            ...w,
            configurationIds: (w.configurationIds || []).filter(id => id !== configurationId)
        }));
        if (this.currentWorkflow?.configurationIds) {
            this.currentWorkflow.configurationIds = this.currentWorkflow.configurationIds.filter(id => id !== configurationId);
        }

        if (this.selectedConfigurationId === configurationId) {
            this.selectedConfigurationId = 'all';
        }

        await this.chrome.storage.local.set({
            configurations: this.configurations,
            workflows: this.workflows,
            selectedConfigurationId: this.selectedConfigurationId
        });

        this.renderConfigurationFilter();
        this.renderConfigurationsManager();
        this.renderConfigurationTree();
        this.renderWorkflowConfigurations();
        this.displayWorkflows();
    },

    async renameConfiguration(configurationId) {
        const configuration = this.configurations.find(c => c.id === configurationId);
        if (!configuration) return;
        const name = prompt('Rename configuration', configuration.name);
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (this.configurations.some(c => c.id !== configurationId && c.name.toLowerCase() === trimmed.toLowerCase())) {
            this.showNotification('A configuration with this name already exists', 'error');
            return;
        }

        configuration.name = trimmed;
        await this.chrome.storage.local.set({ configurations: this.configurations });
        this.renderConfigurationFilter();
        this.renderConfigurationsManager();
        this.renderConfigurationTree();
        this.renderWorkflowConfigurations();
        this.displayWorkflows();
    },

    async assignWorkflowToConfiguration(workflowId, configurationId) {
        const workflow = (this.workflows || []).find(w => w.id === workflowId);
        if (!workflow) return;

        let orderChanged = false;

        if (!Array.isArray(workflow.configurationIds)) {
            workflow.configurationIds = [];
        }

        if (configurationId === 'unassigned') {
            const existingConfigIds = new Set(workflow.configurationIds);
            workflow.configurationIds = [];
            (this.configurations || []).forEach(configuration => {
                if (!existingConfigIds.has(configuration.id)) return;
                const order = this.getConfigurationWorkflowOrder(configuration.id);
                const idx = order.indexOf(workflowId);
                if (idx !== -1) {
                    order.splice(idx, 1);
                    orderChanged = true;
                }
            });
        } else if (configurationId && !workflow.configurationIds.includes(configurationId)) {
            workflow.configurationIds.push(configurationId);
            const order = this.getConfigurationWorkflowOrder(configurationId);
            if (!order.includes(workflowId)) {
                order.push(workflowId);
                orderChanged = true;
            }
        }

        await this.chrome.storage.local.set(orderChanged
            ? { workflows: this.workflows, configurations: this.configurations }
            : { workflows: this.workflows });
        this.displayWorkflows();
        this.renderConfigurationsManager();
        this.renderConfigurationTree();
        this.renderWorkflowConfigurations();
    },

    attachConfigurationDropHandlers(node, targetConfigurationId) {
        if (!node) return;

        node.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            node.classList.add('drop-target');
        });

        node.addEventListener('dragleave', () => {
            node.classList.remove('drop-target');
        });

        node.addEventListener('drop', async (e) => {
            e.preventDefault();
            node.classList.remove('drop-target');
            const workflowId = e.dataTransfer?.getData('text/workflow-id');
            if (!workflowId) return;
            await this.assignWorkflowToConfiguration(workflowId, targetConfigurationId);
            const workflow = (this.workflows || []).find(w => w.id === workflowId);
            this.showNotification(`Workflow "${workflow?.name || workflowId}" linked to configuration`, 'success');
        });
    },

    renderConfigurationTree() {
        const container = document.getElementById('configurationsTree');
        if (!container) return;
        container.innerHTML = '';

        const unassigned = document.createElement('button');
        unassigned.className = 'tree-node';
        if (this.selectedConfigurationId === 'unassigned') {
            unassigned.classList.add('active');
        }
        unassigned.textContent = 'Unassigned workflows';
        unassigned.addEventListener('click', () => this.selectConfigurationFilter('unassigned', true));
        this.attachConfigurationDropHandlers(unassigned, 'unassigned');
        container.appendChild(unassigned);

        if (!this.configurations.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No configurations yet.';
            container.appendChild(empty);
            return;
        }

        this.configurations
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(configuration => {
                const item = document.createElement('button');
                item.className = 'tree-node';
                item.dataset.configurationId = configuration.id;
                item.dataset.nodeType = 'configuration';
                if (this.selectedConfigurationId === configuration.id) {
                    item.classList.add('active');
                }
                item.textContent = configuration.name;
                item.title = `Filter by configuration: ${configuration.name}`;
                item.addEventListener('click', () => this.selectConfigurationFilter(configuration.id, true));
                this.attachConfigurationDropHandlers(item, configuration.id);
                container.appendChild(item);
            });
    },

    renderConfigurationFilter() {
        const select = document.getElementById('configurationFilter');
        if (!select) return;
        select.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All configurations';
        select.appendChild(allOption);

        const unassignedOption = document.createElement('option');
        unassignedOption.value = 'unassigned';
        unassignedOption.textContent = 'Unassigned workflows';
        select.appendChild(unassignedOption);

        this.configurations.forEach(configuration => {
            const option = document.createElement('option');
            option.value = configuration.id;
            option.textContent = configuration.name;
            select.appendChild(option);
        });

        select.value = this.selectedConfigurationId || 'all';
    },

    renderConfigurationsManager() {
        // Left pane now only hosts configuration actions (run/select).
        // Ordering is managed from the middle workflows pane.
    },

    async reorderConfigurationWorkflow(configurationId, sourceWorkflowId, targetWorkflowId) {
        const order = this.getConfigurationWorkflowOrder(configurationId);
        if (!order.length) return;

        const sourceIndex = order.indexOf(sourceWorkflowId);
        const targetIndex = order.indexOf(targetWorkflowId);
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

        const [moved] = order.splice(sourceIndex, 1);
        order.splice(targetIndex, 0, moved);

        await this.chrome.storage.local.set({ configurations: this.configurations });
        this.renderConfigurationsManager();
        this.showNotification('Configuration order updated', 'success');
    },

    handleConfigurationTreeContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();

        const node = event.target.closest('.tree-node');
        const configurationId = node?.dataset.configurationId;

        if (configurationId) {
            const configuration = this.configurations.find(c => c.id === configurationId);
            if (!configuration) return;
            this.showTreeContextMenu([
                { label: 'Run configuration', action: () => this.startConfigurationRun(configuration.id) },
                { label: 'Rename configuration', action: () => this.renameConfiguration(configuration.id) },
                { label: 'Delete configuration', action: () => this.deleteConfiguration(configuration.id) }
            ], event.clientX, event.clientY);
            return;
        }

        this.showTreeContextMenu([
            { label: 'Add configuration', action: () => this.createConfigurationByPrompt() }
        ], event.clientX, event.clientY);
    },

    renderWorkflowConfigurations() {
        const container = document.getElementById('workflowConfigurationsList');
        if (!container) return;
        container.innerHTML = '';

        if (!this.currentWorkflow) {
            container.innerHTML = '<div class="empty-state">Open or create a workflow to assign configurations.</div>';
            return;
        }

        if (!this.configurations.length) {
            container.innerHTML = '<div class="empty-state">No configurations yet.</div>';
            return;
        }

        const selected = new Set(this.currentWorkflow?.configurationIds || []);
        this.configurations.forEach(configuration => {
            const label = document.createElement('label');
            label.className = 'project-checkbox';
            const checked = selected.has(configuration.id);
            label.innerHTML = `
                <input type="checkbox" value="${configuration.id}" ${checked ? 'checked' : ''}>
                <span>${configuration.name}</span>
            `;
            label.querySelector('input').addEventListener('change', (e) => {
                this.toggleWorkflowConfiguration(configuration.id, e.target.checked);
            });
            container.appendChild(label);
        });
    },

    toggleWorkflowConfiguration(configurationId, isChecked) {
        if (!this.currentWorkflow) return;
        const configurationIds = new Set(this.currentWorkflow.configurationIds || []);
        if (isChecked) {
            configurationIds.add(configurationId);
        } else {
            configurationIds.delete(configurationId);
        }
        this.currentWorkflow.configurationIds = Array.from(configurationIds);
    },

    syncCurrentWorkflowConfigurationsFromUI() {
        const container = document.getElementById('workflowConfigurationsList');
        if (!container || !this.currentWorkflow) return;
        const selected = Array.from(container.querySelectorAll('input[type="checkbox"]'))
            .filter(input => input.checked)
            .map(input => input.value);
        this.currentWorkflow.configurationIds = selected;
    },

    getConfigurationNamesByIds(configurationIds) {
        if (!configurationIds || !configurationIds.length) return [];
        const map = new Map(this.configurations.map(c => [c.id, c.name]));
        return configurationIds.map(id => map.get(id)).filter(Boolean);
    },

    getSelectedConfigurationName() {
        if (!this.selectedConfigurationId || this.selectedConfigurationId === 'all') return 'All configurations';
        if (this.selectedConfigurationId === 'unassigned') return 'unassigned workflows';
        return this.configurations.find(c => c.id === this.selectedConfigurationId)?.name || 'Unknown configuration';
    },

    getWorkflowsByConfiguration(configurationId) {
        const linked = (this.workflows || []).filter(w => (w.configurationIds || []).includes(configurationId));
        if (!linked.length) return [];

        const order = this.getConfigurationWorkflowOrder(configurationId);
        const byId = new Map(linked.map(workflow => [workflow.id, workflow]));
        const ordered = [];

        order.forEach(workflowId => {
            if (!byId.has(workflowId)) return;
            ordered.push(byId.get(workflowId));
            byId.delete(workflowId);
        });

        const unordered = Array.from(byId.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return [...ordered, ...unordered];
    },

    startSelectedConfigurationRun() {
        if (!this.selectedConfigurationId || this.selectedConfigurationId === 'all' || this.selectedConfigurationId === 'unassigned') {
            this.showNotification('Select a specific configuration first', 'warning');
            return;
        }
        this.startConfigurationRun(this.selectedConfigurationId);
    },

    async startConfigurationRun(configurationId) {
        if (!configurationId) return;
        if (this.executionState?.isRunning || this.executionState?.isLaunching) {
            this.showNotification('Another run is already in progress', 'warning');
            return;
        }

        const configuration = this.configurations.find(c => c.id === configurationId);
        if (!configuration) {
            this.showNotification('Configuration not found', 'error');
            return;
        }

        const workflows = this.getWorkflowsByConfiguration(configurationId);
        if (!workflows.length) {
            this.showNotification(`No workflows linked to "${configuration.name}"`, 'warning');
            return;
        }

        const runId = `cfg_${Date.now()}`;
        const workflowQueue = workflows.map((workflow, index) => ({
            key: `${runId}_${index}_${workflow.id || 'workflow'}`,
            workflow: JSON.parse(JSON.stringify(workflow))
        }));

        this.configurationRunState = {
            runId,
            configurationId,
            configurationName: configuration.name,
            workflowQueue,
            currentIndex: 0,
            runOptions: {
                skipRows: 0,
                limitRows: 0,
                dryRun: false,
                showLogs: true,
                learningMode: false,
                runUntilInterception: false
            }
        };

        this.setLogsPanelOpen(true);
        this.addLog('info', `Starting configuration run: ${configuration.name} (${workflows.length} workflows)`);
        await this.runNextWorkflowInConfiguration();
    },

    async runNextWorkflowInConfiguration() {
        const state = this.configurationRunState;
        if (!state) return;
        if (this.executionState?.isRunning || this.executionState?.isLaunching) return;

        if (state.currentIndex >= state.workflowQueue.length) {
            this.addLog('success', `Configuration run completed: ${state.configurationName}`);
            this.showNotification(`Configuration "${state.configurationName}" completed`, 'success');
            this.configurationRunState = null;
            return;
        }

        const queueEntry = state.workflowQueue[state.currentIndex];
        const workflow = queueEntry?.workflow;

        if (!workflow) {
            this.addLog('warning', `Skipping missing workflow at position ${state.currentIndex + 1}`);
            state.currentIndex += 1;
            await this.runNextWorkflowInConfiguration();
            return;
        }

        this.addLog('info', `Running configuration workflow ${state.currentIndex + 1}/${state.workflowQueue.length}: ${workflow.name}`);
        const started = await this.executeWorkflowWithOptions(workflow, state.runOptions, {
            origin: 'configuration',
            configurationRunId: state.runId,
            queueKey: queueEntry?.key
        });
        if (!started) {
            this.addLog('error', `Configuration run stopped at workflow: ${workflow.name}`);
            this.showNotification(`Configuration run failed at "${workflow.name}"`, 'error');
            this.configurationRunState = null;
        }
    }
};
