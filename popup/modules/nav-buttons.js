export const navButtonsMethods = {
    async loadNavButtons() {
        const result = await chrome.storage.local.get(['navButtons']);
        this.navButtons = result.navButtons || [];
    },

    async saveNavButtonsToStorage() {
        await chrome.storage.local.set({ navButtons: this.navButtons });
    },

    initNavButtonsUI() {
        const newButton = document.getElementById('newNavButton');
        const searchInput = document.getElementById('navButtonSearch');
        const menuFilterInput = document.getElementById('navButtonMenuFilter');
        const workflowFilter = document.getElementById('navButtonWorkflowFilter');
        const editorClose = document.getElementById('navButtonClose');
        const editorCancel = document.getElementById('navButtonCancel');
        const editorSave = document.getElementById('navButtonSave');
        const editorDelete = document.getElementById('navButtonDelete');
        const useCurrentMenu = document.getElementById('navButtonUseCurrentMenu');
        const refreshContext = document.getElementById('navButtonRefreshContext');

        if (newButton) {
            newButton.addEventListener('click', () => this.openNavButtonEditor());
        }
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderNavButtons());
        }
        if (menuFilterInput) {
            menuFilterInput.addEventListener('input', () => this.renderNavButtons());
        }
        if (workflowFilter) {
            workflowFilter.addEventListener('change', () => this.renderNavButtons());
        }
        if (editorClose) {
            editorClose.addEventListener('click', () => this.closeNavButtonEditor());
        }
        if (editorCancel) {
            editorCancel.addEventListener('click', () => this.closeNavButtonEditor());
        }
        if (editorSave) {
            editorSave.addEventListener('click', () => this.saveNavButtonFromEditor());
        }
        if (editorDelete) {
            editorDelete.addEventListener('click', () => this.deleteNavButtonFromEditor());
        }
        if (useCurrentMenu) {
            useCurrentMenu.addEventListener('click', () => this.addCurrentMenuItemToEditor());
        }
        if (refreshContext) {
            refreshContext.addEventListener('click', () => this.refreshNavButtonsContext());
        }

        this.updateNavButtonsWorkflowOptions();
        this.refreshNavButtonsContext();
    },

    async onTabActivated(tabName) {
        if (tabName === 'nav-buttons') {
            await this.refreshNavButtonsContext();
        }
    },

    async refreshNavButtonsContext() {
        await this.refreshCurrentMenuItem();
        this.renderNavButtons();
    },

    async refreshCurrentMenuItem() {
        let currentMenuItem = '';
        try {
            const tab = await this.getLinkedOrActiveTab();
            if (tab && tab.url && (tab.url.includes('dynamics.com') || tab.url.includes('cloudax.dynamics.com'))) {
                const url = new URL(tab.url);
                currentMenuItem = url.searchParams.get('mi') || '';
            }
        } catch (e) {
            currentMenuItem = '';
        }

        this.currentMenuItem = currentMenuItem;
        const label = document.getElementById('navButtonCurrentMenu');
        if (label) {
            label.textContent = currentMenuItem || 'None detected';
            label.title = currentMenuItem || 'No menu item detected from the linked tab';
        }
    },

    updateNavButtonsWorkflowOptions() {
        const workflowSelect = document.getElementById('navButtonWorkflowId');
        const workflowFilter = document.getElementById('navButtonWorkflowFilter');

        const workflows = Array.isArray(this.workflows) ? this.workflows : [];
        const currentEditorValue = workflowSelect?.value || '';
        const currentFilterValue = workflowFilter?.value || 'all';

        if (workflowSelect) {
            workflowSelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = workflows.length ? 'Select workflow...' : 'No workflows available';
            workflowSelect.appendChild(placeholder);

            workflows.forEach((workflow) => {
                const option = document.createElement('option');
                option.value = workflow.id;
                option.textContent = workflow.name || 'Untitled Workflow';
                workflowSelect.appendChild(option);
            });

            if (currentEditorValue) {
                workflowSelect.value = currentEditorValue;
            }
        }

        if (workflowFilter) {
            workflowFilter.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All workflows';
            workflowFilter.appendChild(allOption);

            workflows.forEach((workflow) => {
                const option = document.createElement('option');
                option.value = workflow.id;
                option.textContent = workflow.name || 'Untitled Workflow';
                workflowFilter.appendChild(option);
            });

            if (currentFilterValue) {
                workflowFilter.value = currentFilterValue;
            }
        }
    },

    openNavButtonEditor(navButton = null) {
        const editor = document.getElementById('navButtonEditor');
        if (!editor) return;

        this.editingNavButtonId = navButton?.id || null;

        document.getElementById('navButtonEditorTitle').textContent = navButton ? 'Edit Nav Button' : 'New Nav Button';
        document.getElementById('navButtonName').value = navButton?.name || '';
        document.getElementById('navButtonWorkflowId').value = navButton?.workflowId || '';
        document.getElementById('navButtonMenuItems').value = (navButton?.menuItems || []).join(', ');

        const deleteBtn = document.getElementById('navButtonDelete');
        if (deleteBtn) {
            deleteBtn.classList.toggle('is-hidden', !navButton);
        }

        editor.classList.remove('is-hidden');
    },

    closeNavButtonEditor() {
        const editor = document.getElementById('navButtonEditor');
        if (editor) {
            editor.classList.add('is-hidden');
        }
        this.editingNavButtonId = null;
        document.getElementById('navButtonName').value = '';
        document.getElementById('navButtonWorkflowId').value = '';
        document.getElementById('navButtonMenuItems').value = '';
    },

    addCurrentMenuItemToEditor() {
        if (!this.currentMenuItem) {
            this.showNotification('No menu item detected from linked tab', 'warning');
            return;
        }
        const input = document.getElementById('navButtonMenuItems');
        if (!input) return;

        const existing = this.parseMenuItems(input.value);
        if (!existing.includes(this.currentMenuItem)) {
            existing.push(this.currentMenuItem);
        }
        input.value = existing.join(', ');
    },

    parseMenuItems(rawValue) {
        return (rawValue || '')
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    },

    getWorkflowNameById(workflowId, fallbackName = '') {
        const workflow = (this.workflows || []).find((w) => w.id === workflowId);
        return workflow?.name || fallbackName || 'Missing workflow';
    },

    async saveNavButtonFromEditor() {
        const name = document.getElementById('navButtonName').value.trim();
        const workflowId = document.getElementById('navButtonWorkflowId').value;
        const menuItemsRaw = document.getElementById('navButtonMenuItems').value;
        const menuItems = this.parseMenuItems(menuItemsRaw);

        if (!name) {
            this.showNotification('Please enter a button name', 'error');
            return;
        }
        if (!workflowId) {
            this.showNotification('Please link a workflow to this button', 'error');
            return;
        }

        const workflowName = this.getWorkflowNameById(workflowId);
        const now = Date.now();

        if (this.editingNavButtonId) {
            const index = this.navButtons.findIndex((btn) => btn.id === this.editingNavButtonId);
            if (index >= 0) {
                this.navButtons[index] = {
                    ...this.navButtons[index],
                    name,
                    workflowId,
                    workflowName,
                    menuItems,
                    updatedAt: now
                };
            }
        } else {
            this.navButtons.push({
                id: now.toString(),
                name,
                workflowId,
                workflowName,
                menuItems,
                createdAt: now,
                updatedAt: now
            });
        }

        await this.saveNavButtonsToStorage();
        this.closeNavButtonEditor();
        this.renderNavButtons();
        this.showNotification('Nav button saved', 'success');
    },

    async deleteNavButtonFromEditor() {
        if (!this.editingNavButtonId) return;
        const navButton = this.navButtons.find((btn) => btn.id === this.editingNavButtonId);
        if (!navButton) return;

        if (confirm(`Delete nav button "${navButton.name}"?`)) {
            this.navButtons = this.navButtons.filter((btn) => btn.id !== this.editingNavButtonId);
            await this.saveNavButtonsToStorage();
            this.closeNavButtonEditor();
            this.renderNavButtons();
            this.showNotification('Nav button deleted', 'success');
        }
    },

    getNavButtonsSearchState() {
        const searchValue = document.getElementById('navButtonSearch')?.value?.trim().toLowerCase() || '';
        const menuFilterValue = document.getElementById('navButtonMenuFilter')?.value?.trim().toLowerCase() || '';
        const workflowFilterValue = document.getElementById('navButtonWorkflowFilter')?.value || 'all';
        return { searchValue, menuFilterValue, workflowFilterValue };
    },

    renderNavButtons() {
        const container = document.getElementById('navButtonsList');
        if (!container) return;

        const { searchValue, menuFilterValue, workflowFilterValue } = this.getNavButtonsSearchState();
        const currentMenuItem = (this.currentMenuItem || '').toLowerCase();

        let buttons = (this.navButtons || []).slice();

        buttons = buttons.filter((btn) => {
            const name = (btn.name || '').toLowerCase();
            const workflowName = this.getWorkflowNameById(btn.workflowId, btn.workflowName).toLowerCase();
            const menuItems = (btn.menuItems || []).map((item) => item.toLowerCase());

            if (searchValue) {
                const matchesSearch =
                    name.includes(searchValue) ||
                    workflowName.includes(searchValue) ||
                    menuItems.some((item) => item.includes(searchValue));
                if (!matchesSearch) return false;
            }

            if (menuFilterValue) {
                if (!menuItems.some((item) => item.includes(menuFilterValue))) return false;
            }

            if (workflowFilterValue !== 'all') {
                if (btn.workflowId !== workflowFilterValue) return false;
            }

            return true;
        });

        buttons.sort((a, b) => {
            const aMatches = currentMenuItem && (a.menuItems || []).some((item) => item.toLowerCase() === currentMenuItem);
            const bMatches = currentMenuItem && (b.menuItems || []).some((item) => item.toLowerCase() === currentMenuItem);
            if (aMatches !== bMatches) return aMatches ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        container.innerHTML = '';

        if (!buttons.length) {
            container.innerHTML = '<p class="empty-state">No nav buttons match your filters.</p>';
            return;
        }

        buttons.forEach((btn) => {
            const item = document.createElement('div');
            item.className = 'nav-button-item';

            const menuItems = btn.menuItems || [];
            const workflowName = this.getWorkflowNameById(btn.workflowId, btn.workflowName);
            const isRelevant = currentMenuItem && menuItems.some((mi) => mi.toLowerCase() === currentMenuItem);

            item.innerHTML = `
                <div class="nav-button-info">
                    <div class="nav-button-title">
                        <h4>${btn.name || 'Untitled'}</h4>
                        ${isRelevant ? '<span class="nav-badge">Current menu</span>' : ''}
                    </div>
                    <div class="nav-button-meta">
                        <span class="nav-meta-label">Workflow:</span>
                        <span class="nav-meta-value">${workflowName}</span>
                    </div>
                    <div class="nav-button-tags">
                        ${menuItems.length ? menuItems.map((mi) => `<span class="tag">${mi}</span>`).join('') : '<span class="tag muted">Global</span>'}
                    </div>
                </div>
                <div class="nav-button-actions">
                    <button class="btn-icon" data-action="edit" title="Edit">Edit</button>
                    <button class="btn-icon" data-action="delete" title="Delete">Delete</button>
                </div>
            `;

            item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openNavButtonEditor(btn);
            });

            item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editingNavButtonId = btn.id;
                this.deleteNavButtonFromEditor();
            });

            container.appendChild(item);
        });
    }
};
