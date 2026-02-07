export const dataSourceMethods = {
    setDataSourceProcessingState(buttonId, processing, label) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        if (processing) {
            if (!button.dataset.originalLabel) {
                button.dataset.originalLabel = button.textContent || '';
            }
            button.disabled = true;
            button.classList.add('is-processing');
            if (label) {
                button.textContent = label;
            }
        } else {
            button.disabled = false;
            button.classList.remove('is-processing');
            if (button.dataset.originalLabel) {
                button.textContent = button.dataset.originalLabel;
            }
            delete button.dataset.originalLabel;
        }
    },

    async loadSharedDataSources() {
        const result = await chrome.storage.local.get([
            'sharedDataSources',
            'sharedDataSourceRelationships',
            'selectedDataSourceProjectId',
            'dataSourceEditorPaneCollapsed',
            'dataSourcesListPaneWidth'
        ]);
        this.sharedDataSources = Array.isArray(result.sharedDataSources) ? result.sharedDataSources : [];
        this.sharedDataSourceRelationships = Array.isArray(result.sharedDataSourceRelationships)
            ? result.sharedDataSourceRelationships
            : [];
        this.selectedDataSourceProjectId = result.selectedDataSourceProjectId || 'all';
        this.selectedSharedDataSourceId = this.selectedSharedDataSourceId || '';
        this.dataSourceEditorPaneCollapsed = !!result.dataSourceEditorPaneCollapsed;
        this.dataSourcesListPaneWidth = Number.isFinite(result.dataSourcesListPaneWidth)
            ? result.dataSourcesListPaneWidth
            : 480;
        this.sharedDataSourceRelationships = this.sanitizeSharedDataSourceRelationships();

        if (!this.dataSources) {
            this.dataSources = { primary: { type: 'json', data: null, fields: [], odataQuery: '', sharedDataSourceId: '' } };
        }
        if (!this.dataSources.primary) {
            this.dataSources.primary = { type: 'json', data: null, fields: [], odataQuery: '', sharedDataSourceId: '' };
        }

        this.renderSharedDataSourcesUI();
        this.applyDataSourceEditorPaneState();
        this.applyDataSourcesPaneWidth();

        if (!this.selectedSharedDataSourceId) {
            this.startNewSharedDataSource();
        }
    },

    async persistSharedDataSources() {
        await chrome.storage.local.set({ sharedDataSources: this.sharedDataSources });
    },

    async persistSharedDataSourceRelationships() {
        await chrome.storage.local.set({ sharedDataSourceRelationships: this.sharedDataSourceRelationships || [] });
    },

    getSharedDataSourceById(id) {
        if (!id) return null;
        return (this.sharedDataSources || []).find(source => source.id === id) || null;
    },

    getProjectNameMap() {
        return new Map((this.projects || []).map(project => [project.id, project.name]));
    },

    sanitizeSharedDataSourceRelationships() {
        const sourceMap = new Map((this.sharedDataSources || []).map(source => [source.id, source]));
        return (this.sharedDataSourceRelationships || []).map(rel => {
            if (!rel || !rel.parentSourceId || !rel.detailId) return null;
            const parent = sourceMap.get(rel.parentSourceId);
            const child = sourceMap.get(rel.detailId);
            if (!parent || !child) return null;
            const parentFields = Array.isArray(parent.fields) ? parent.fields : [];
            const childFields = Array.isArray(child.fields) ? child.fields : [];
            const rawMappings = Array.isArray(rel.fieldMappings) && rel.fieldMappings.length
                ? rel.fieldMappings
                : (rel.primaryField && rel.detailField
                    ? [{ primaryField: rel.primaryField, detailField: rel.detailField }]
                    : []);
            const fieldMappings = rawMappings
                .map(pair => ({
                    primaryField: pair?.primaryField || '',
                    detailField: pair?.detailField || ''
                }))
                .filter(pair => pair.primaryField && pair.detailField)
                .filter(pair => parentFields.includes(pair.primaryField) && childFields.includes(pair.detailField));
            if (!fieldMappings.length) return null;
            return {
                ...rel,
                fieldMappings,
                primaryField: fieldMappings[0].primaryField,
                detailField: fieldMappings[0].detailField
            };
        }).filter(Boolean);
    },

    getFilteredSharedDataSources() {
        const selected = this.selectedDataSourceProjectId || 'all';
        const list = Array.isArray(this.sharedDataSources) ? this.sharedDataSources : [];

        if (selected === 'all') return list;
        if (selected === 'unassigned') {
            return list.filter(source => !(source.projectIds || []).length);
        }

        return list.filter(source => (source.projectIds || []).includes(selected));
    },

    async selectDataSourceProjectFilter(projectId) {
        this.selectedDataSourceProjectId = projectId || 'all';
        await chrome.storage.local.set({ selectedDataSourceProjectId: this.selectedDataSourceProjectId });
        this.renderSharedDataSourcesUI();
    },

    renderDataSourcesProjectTree() {
        const container = document.getElementById('dataSourcesProjectsTree');
        if (!container) return;
        container.innerHTML = '';

        const selected = this.selectedDataSourceProjectId || 'all';
        if (selected !== 'all' && selected !== 'unassigned' && !(this.projects || []).some(project => project.id === selected)) {
            this.selectedDataSourceProjectId = 'all';
            chrome.storage.local.set({ selectedDataSourceProjectId: 'all' }).catch(() => {});
        }

        const createNode = (id, label, depth = 0) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tree-node';
            button.dataset.projectId = id;
            if ((this.selectedDataSourceProjectId || 'all') === id) {
                button.classList.add('active');
            }
            button.textContent = label;
            button.style.paddingLeft = `${8 + depth * 14}px`;
            button.addEventListener('click', () => this.selectDataSourceProjectFilter(id));
            this.attachDataSourceDropHandlers(button, id);
            container.appendChild(button);
        };

        createNode('all', 'All data sources', 0);
        createNode('unassigned', 'Unassigned data sources', 0);

        const renderChildren = (parentId, depth) => {
            const children = (this.getProjectChildren ? this.getProjectChildren(parentId) : [])
                .sort((a, b) => a.name.localeCompare(b.name));
            children.forEach(project => {
                createNode(project.id, project.name, depth);
                renderChildren(project.id, depth + 1);
            });
        };

        if (Array.isArray(this.projects) && this.projects.length) {
            renderChildren(null, 0);
        } else {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No projects yet.';
            container.appendChild(empty);
        }
    },

    renderSharedDataSourcesList() {
        const container = document.getElementById('sharedDataSourcesList');
        if (!container) return;

        const projectNameMap = this.getProjectNameMap();
        const filtered = this.getFilteredSharedDataSources()
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (this.selectedSharedDataSourceId && !filtered.some(source => source.id === this.selectedSharedDataSourceId)) {
            this.selectedSharedDataSourceId = '';
        }

        if (!filtered.length) {
            container.innerHTML = '<div class="empty-state">No data sources for this filter. Click "New Data Source" to create one.</div>';
            return;
        }

        container.innerHTML = filtered.map(source => {
            const projectIds = Array.isArray(source.projectIds) ? source.projectIds : [];
            const projectLabels = projectIds.length
                ? projectIds.map(id => projectNameMap.get(id) || id)
                : ['Unassigned'];
            return `
                <div class="shared-data-source-item ${this.selectedSharedDataSourceId === source.id ? 'active' : ''}" data-shared-source-id="${source.id}">
                    <div class="shared-data-source-head">
                        <span class="shared-data-source-name">${this.escapeHtml(source.name || source.id)}</span>
                        <div class="shared-data-source-actions">
                            <span class="shared-data-source-meta">${source.type === 'odata-dynamic' ? 'dynamic' : `${Array.isArray(source.data) ? source.data.length : 0} rows`}</span>
                            <button class="shared-data-source-delete" data-delete-source-id="${source.id}" title="Delete data source" aria-label="Delete data source">🗑</button>
                        </div>
                    </div>
                    <div class="shared-data-source-meta">${Array.isArray(source.fields) ? source.fields.length : 0} fields</div>
                    <div class="shared-data-source-projects">
                        ${projectLabels.map(label => `<span class="data-source-project-tag ${label === 'Unassigned' ? 'unassigned' : ''}">${this.escapeHtml(label)}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.shared-data-source-item').forEach(item => {
            item.addEventListener('click', () => {
                const sourceId = item.getAttribute('data-shared-source-id');
                this.selectSharedDataSourceFromList(sourceId);
            });
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (event) => {
                const sourceId = item.getAttribute('data-shared-source-id');
                if (!sourceId) return;
                event.dataTransfer?.setData('text/shared-data-source-id', sourceId);
                event.dataTransfer?.setData('text/plain', sourceId);
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'copyMove';
                }
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document
                    .querySelectorAll('#dataSourcesProjectsTree .tree-node.drop-target')
                    .forEach(node => node.classList.remove('drop-target'));
            });
        });

        container.querySelectorAll('.shared-data-source-delete').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const sourceId = button.getAttribute('data-delete-source-id');
                if (!sourceId) return;
                await this.deleteSharedDataSourceById(sourceId);
            });
        });
    },

    attachDataSourceDropHandlers(node, targetProjectId) {
        if (!node) return;

        node.addEventListener('dragover', (event) => {
            if (targetProjectId === 'all') return;

            const types = Array.from(event.dataTransfer?.types || []);
            const hasDataSourcePayload = types.includes('text/shared-data-source-id') || types.includes('text/plain');
            if (!hasDataSourcePayload) return;

            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = targetProjectId === 'unassigned' ? 'move' : 'copy';
            }
            node.classList.add('drop-target');
        });

        node.addEventListener('dragleave', () => {
            node.classList.remove('drop-target');
        });

        node.addEventListener('drop', async (event) => {
            event.preventDefault();
            node.classList.remove('drop-target');

            const sourceId = event.dataTransfer?.getData('text/shared-data-source-id')
                || event.dataTransfer?.getData('text/plain');
            if (!sourceId) return;

            await this.assignSharedDataSourceToProject(sourceId, targetProjectId);
        });
    },

    async assignSharedDataSourceToProject(sharedDataSourceId, projectId) {
        const source = this.getSharedDataSourceById(sharedDataSourceId);
        if (!source) return;

        if (projectId === 'all') return;

        const projectIds = new Set(source.projectIds || []);
        if (projectId === 'unassigned') {
            projectIds.clear();
        } else {
            projectIds.add(projectId);
        }

        source.projectIds = Array.from(projectIds);
        source.updatedAt = Date.now();
        this.selectedSharedDataSourceId = source.id;

        await this.persistSharedDataSources();
        this.renderSharedDataSourcesUI();

        const projectLabel = projectId === 'unassigned'
            ? 'Unassigned'
            : (this.projects || []).find(project => project.id === projectId)?.name || projectId;
        this.showNotification(`Data source "${source.name || source.id}" linked to ${projectLabel}`, 'success');
    },

    populateEditorFromSharedDataSource(source) {
        if (!source) return;

        this.selectedSharedDataSourceId = source.id;
        this.dataSources.primary = {
            type: source.type || 'json',
            data: Array.isArray(source.data) ? JSON.parse(JSON.stringify(source.data)) : [],
            fields: Array.isArray(source.fields) ? [...source.fields] : [],
            odataQuery: source.odataQuery || ''
        };

        const nameInput = document.getElementById('sharedDataSourceName');
        if (nameInput) {
            nameInput.value = source.name || '';
        }

        const typeSelect = document.getElementById('primaryDataSourceType');
        if (typeSelect) {
            typeSelect.value = source.type || 'json';
        }

        const input = document.getElementById('primaryDataInput');
        const queryInput = document.getElementById('primaryODataQuery');
        if (input) {
            if ((source.type || 'json') === 'json') {
                input.value = JSON.stringify(source.data || [], null, 2);
            } else if ((source.type || 'json') === 'odata-cached' || (source.type || 'json') === 'odata-dynamic') {
                input.value = JSON.stringify(source.data || [], null, 2);
            } else {
                input.value = this.dataToCSV(source.data || []);
            }
        }
        if (queryInput) {
            queryInput.value = source.odataQuery || '';
        }

        const statusEl = document.getElementById('primaryDataStatus');
        if (statusEl) {
            statusEl.textContent = `Editing existing data source (${(source.data || []).length} rows)`;
            statusEl.className = 'data-status success';
        }

        this.updatePrimaryDataSourceUI(source.type || 'json');
        this.displayPrimaryDataFields();
    },

    selectSharedDataSourceFromList(sharedDataSourceId) {
        if (!sharedDataSourceId) return;
        const source = this.getSharedDataSourceById(sharedDataSourceId);
        if (!source) return;

        this.populateEditorFromSharedDataSource(source);
        this.resetRelationshipBuilder();
        this.renderSharedDataSourcesUI();
    },

    startNewSharedDataSource() {
        this.selectedSharedDataSourceId = '';
        this.dataSources.primary = {
            type: 'json',
            data: null,
            fields: [],
            odataQuery: ''
        };

        const nameInput = document.getElementById('sharedDataSourceName');
        if (nameInput) {
            nameInput.value = '';
        }

        const typeSelect = document.getElementById('primaryDataSourceType');
        if (typeSelect) {
            typeSelect.value = 'json';
        }

        const input = document.getElementById('primaryDataInput');
        const queryInput = document.getElementById('primaryODataQuery');
        if (input) {
            input.value = '';
            input.placeholder = '[{"code": "A1", "text": "Example"}]';
        }
        if (queryInput) {
            queryInput.value = '';
        }

        const statusEl = document.getElementById('primaryDataStatus');
        if (statusEl) {
            statusEl.textContent = 'Creating new data source';
            statusEl.className = 'data-status';
        }

        this.updatePrimaryDataSourceUI('json');
        this.displayPrimaryDataFields();
        this.resetRelationshipBuilder();
        this.renderSharedDataSourcesUI();
    },

    async toggleSharedDataSourceProjectLink(projectId, isChecked) {
        const source = this.getSharedDataSourceById(this.selectedSharedDataSourceId);
        if (!source) return;

        const ids = new Set(source.projectIds || []);
        if (isChecked) ids.add(projectId);
        else ids.delete(projectId);
        source.projectIds = Array.from(ids);
        source.updatedAt = Date.now();

        await this.persistSharedDataSources();
        this.renderSharedDataSourcesUI();
    },

    renderDataSourceProjectLinks() {
        const container = document.getElementById('dataSourceProjectLinks');
        if (!container) return;
        container.innerHTML = '';

        const source = this.getSharedDataSourceById(this.selectedSharedDataSourceId);
        if (!source) {
            container.innerHTML = '<div class="empty-state">Select a data source from the list to link projects.</div>';
            return;
        }

        if (!Array.isArray(this.projects) || !this.projects.length) {
            container.innerHTML = '<div class="empty-state">No projects available.</div>';
            return;
        }

        const selected = new Set(source.projectIds || []);
        this.projects
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(project => {
                const label = document.createElement('label');
                label.className = 'project-checkbox';
                label.innerHTML = `
                    <input type="checkbox" value="${project.id}" ${selected.has(project.id) ? 'checked' : ''}>
                    <span>${this.escapeHtml(project.name)}</span>
                `;
                label.querySelector('input')?.addEventListener('change', (event) => {
                    this.toggleSharedDataSourceProjectLink(project.id, !!event.target.checked);
                });
                container.appendChild(label);
            });
    },

    renderSharedDataSourcesUI() {
        this.renderDataSourcesProjectTree();
        this.renderSharedDataSourcesList();
        this.renderDataSourceProjectLinks();
        this.renderDataSourceRelationshipsUI();
        this.applyDataSourceEditorPaneState();
        this.applyDataSourcesPaneWidth();
    },

    async refreshSharedDataSourcesUI() {
        await this.loadSharedDataSources();
        this.showNotification('Data sources refreshed', 'info');
    },

    getRelationshipSourceOptions() {
        return (this.sharedDataSources || [])
            .filter(source => Array.isArray(source.fields) && source.fields.length > 0)
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    getSourceFields(sourceId) {
        const source = this.getSharedDataSourceById(sourceId);
        return Array.isArray(source?.fields) ? source.fields : [];
    },

    getRelationshipDefaultSources() {
        const sources = this.getRelationshipSourceOptions();
        if (!sources.length) return { parentSourceId: '', detailSourceId: '' };
        return { parentSourceId: '', detailSourceId: '' };
    },

    resetRelationshipBuilder() {
        const parentSelect = document.getElementById('relationshipParentSource');
        const detailSelect = document.getElementById('relationshipDetailSource');
        if (!parentSelect || !detailSelect) return;
        parentSelect.value = '';
        detailSelect.value = '';
        this.renderRelationshipFieldPairRows([{ primaryField: '', detailField: '' }]);
    },

    renderRelationshipSourceOptions() {
        const parentSelect = document.getElementById('relationshipParentSource');
        const detailSelect = document.getElementById('relationshipDetailSource');
        if (!parentSelect || !detailSelect) return;

        const sources = this.getRelationshipSourceOptions();
        const previousParent = parentSelect.value;
        const previousDetail = detailSelect.value;
        const defaults = this.getRelationshipDefaultSources();

        const optionsHtml = sources.length
            ? `<option value="">-- Select Data Source --</option>${sources.map(source => `<option value="${source.id}">${this.escapeHtml(source.name || source.id)}</option>`).join('')}`
            : '<option value="">No data sources</option>';

        parentSelect.innerHTML = optionsHtml;
        detailSelect.innerHTML = optionsHtml;

        if (sources.length) {
            parentSelect.value = sources.some(source => source.id === previousParent) ? previousParent : defaults.parentSourceId;
            detailSelect.value = sources.some(source => source.id === previousDetail) ? previousDetail : defaults.detailSourceId;
        }
    },

    getRelationshipFieldPairDrafts() {
        const container = document.getElementById('relationshipFieldPairs');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.relationship-pair-row')).map(row => ({
            primaryField: row.querySelector('.relationship-parent-field')?.value || '',
            detailField: row.querySelector('.relationship-detail-field')?.value || ''
        }));
    },

    renderRelationshipFieldPairRows(seedPairs = null) {
        const container = document.getElementById('relationshipFieldPairs');
        const parentSourceSelect = document.getElementById('relationshipParentSource');
        const detailSourceSelect = document.getElementById('relationshipDetailSource');
        if (!container || !parentSourceSelect || !detailSourceSelect) return;

        const parentFields = this.getSourceFields(parentSourceSelect.value);
        const detailFields = this.getSourceFields(detailSourceSelect.value);
        const pairs = Array.isArray(seedPairs) && seedPairs.length
            ? seedPairs
            : (this.getRelationshipFieldPairDrafts().length ? this.getRelationshipFieldPairDrafts() : [{ primaryField: '', detailField: '' }]);

        container.innerHTML = pairs.map(() => `
            <div class="relationship-pair-row">
                <select class="form-control form-control-sm relationship-parent-field"></select>
                <span class="relationship-arrow">-></span>
                <select class="form-control form-control-sm relationship-detail-field"></select>
                <button type="button" class="relationship-pair-remove" title="Remove field pair" aria-label="Remove field pair">x</button>
            </div>
        `).join('');

        Array.from(container.querySelectorAll('.relationship-pair-row')).forEach((row, index) => {
            const parentFieldSelect = row.querySelector('.relationship-parent-field');
            const detailFieldSelect = row.querySelector('.relationship-detail-field');
            const removeButton = row.querySelector('.relationship-pair-remove');
            const pair = pairs[index] || {};

            parentFieldSelect.innerHTML = parentFields.length
                ? `<option value="">-- Select Field --</option>${parentFields.map(field => `<option value="${field}">${this.escapeHtml(field)}</option>`).join('')}`
                : '<option value="">No fields</option>';
            detailFieldSelect.innerHTML = detailFields.length
                ? `<option value="">-- Select Field --</option>${detailFields.map(field => `<option value="${field}">${this.escapeHtml(field)}</option>`).join('')}`
                : '<option value="">No fields</option>';

            if (parentFields.includes(pair.primaryField)) parentFieldSelect.value = pair.primaryField;
            else parentFieldSelect.value = '';
            if (detailFields.includes(pair.detailField)) detailFieldSelect.value = pair.detailField;
            else detailFieldSelect.value = '';

            removeButton.addEventListener('click', () => {
                const currentPairs = this.getRelationshipFieldPairDrafts();
                if (currentPairs.length <= 1) {
                    this.showNotification('At least one field pair is required', 'warning');
                    return;
                }
                currentPairs.splice(index, 1);
                this.renderRelationshipFieldPairRows(currentPairs);
            });
        });
    },

    addRelationshipFieldPair() {
        const pairs = this.getRelationshipFieldPairDrafts();
        pairs.push({ primaryField: '', detailField: '' });
        this.renderRelationshipFieldPairRows(pairs);
    },

    getRelationshipFieldPairsFromUI() {
        return this.getRelationshipFieldPairDrafts()
            .map(pair => ({
                primaryField: String(pair.primaryField || '').trim(),
                detailField: String(pair.detailField || '').trim()
            }))
            .filter(pair => pair.primaryField && pair.detailField);
    },

    renderDataSourceRelationshipsList() {
        const container = document.getElementById('dataSourceRelationshipsList');
        const scopeInfo = document.getElementById('relationshipScopeInfo');
        if (!container) return;

        const sourceMap = new Map((this.sharedDataSources || []).map(source => [source.id, source]));
        const selectedSourceId = this.selectedSharedDataSourceId || '';
        let relations = (this.sharedDataSourceRelationships || []).slice();
        if (selectedSourceId) {
            relations = relations.filter(rel => rel.parentSourceId === selectedSourceId || rel.detailId === selectedSourceId);
        }

        if (scopeInfo) {
            if (!selectedSourceId) {
                scopeInfo.textContent = 'Select a data source to view only the relationships linked to it.';
            } else {
                const selectedLabel = sourceMap.get(selectedSourceId)?.name || selectedSourceId;
                scopeInfo.textContent = `Showing relationships linked to: ${selectedLabel}`;
            }
        }

        if (!relations.length) {
            container.innerHTML = '<div class="empty-state">No relationships defined for this data source.</div>';
            return;
        }

        container.innerHTML = relations.map(rel => {
            const parent = sourceMap.get(rel.parentSourceId);
            const child = sourceMap.get(rel.detailId);
            const parentLabel = parent?.name || rel.parentSourceId;
            const childLabel = child?.name || rel.detailId;
            const mappingText = (rel.fieldMappings || []).map(pair => `${pair.primaryField}->${pair.detailField}`).join(', ');
            return `
                <div class="relationship-item">
                    <div class="relationship-text">
                        ${this.escapeHtml(parentLabel)} -> ${this.escapeHtml(childLabel)} (${this.escapeHtml(mappingText)})
                    </div>
                    <button class="relationship-delete" data-relationship-id="${rel.id}" title="Delete relationship" aria-label="Delete relationship">🗑</button>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.relationship-delete').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                const id = button.getAttribute('data-relationship-id');
                if (!id) return;
                await this.deleteDataSourceRelationshipById(id);
            });
        });
    },

    renderDataSourceRelationshipsUI() {
        this.renderRelationshipSourceOptions();
        this.renderRelationshipFieldPairRows();
        this.renderDataSourceRelationshipsList();
    },

    async saveDataSourceRelationship() {
        const parentSourceId = document.getElementById('relationshipParentSource')?.value || '';
        const detailId = document.getElementById('relationshipDetailSource')?.value || '';
        const fieldMappings = this.getRelationshipFieldPairsFromUI();

        if (!parentSourceId || !detailId) {
            this.showNotification('Select parent and child source first', 'warning');
            return;
        }
        if (!fieldMappings.length) {
            this.showNotification('Add at least one field pair', 'warning');
            return;
        }
        if (parentSourceId === detailId) {
            this.showNotification('Parent and child data source must be different', 'warning');
            return;
        }

        const now = Date.now();
        const existing = (this.sharedDataSourceRelationships || []).find(rel => rel.detailId === detailId);
        if (existing) {
            existing.parentSourceId = parentSourceId;
            existing.fieldMappings = fieldMappings;
            existing.primaryField = fieldMappings[0].primaryField;
            existing.detailField = fieldMappings[0].detailField;
            existing.updatedAt = now;
        } else {
            this.sharedDataSourceRelationships.push({
                id: `rel_${now}`,
                parentSourceId,
                detailId,
                fieldMappings,
                primaryField: fieldMappings[0].primaryField,
                detailField: fieldMappings[0].detailField,
                createdAt: now,
                updatedAt: now
            });
        }

        this.sharedDataSourceRelationships = this.sanitizeSharedDataSourceRelationships();
        await this.persistSharedDataSourceRelationships();
        this.resetRelationshipBuilder();
        this.renderDataSourceRelationshipsUI();
        this.showNotification('Relationship saved', 'success');
    },

    async deleteDataSourceRelationshipById(relationshipId) {
        const before = (this.sharedDataSourceRelationships || []).length;
        this.sharedDataSourceRelationships = (this.sharedDataSourceRelationships || []).filter(rel => rel.id !== relationshipId);
        if (this.sharedDataSourceRelationships.length === before) return;
        await this.persistSharedDataSourceRelationships();
        this.renderDataSourceRelationshipsUI();
        this.showNotification('Relationship deleted', 'info');
    },

    applyDataSourcesPaneWidth() {
        const mainPane = document.getElementById('dataSourcesMainPane');
        const listPane = document.getElementById('dataSourcesListPane');
        if (!mainPane || !listPane) return;

        if (window.matchMedia('(max-width: 1280px)').matches) {
            listPane.style.flexBasis = 'auto';
            return;
        }

        const totalWidth = mainPane.clientWidth || 0;
        const minLeft = 280;
        const maxLeft = Math.max(minLeft, totalWidth - 360);
        const requested = Number.isFinite(this.dataSourcesListPaneWidth) ? this.dataSourcesListPaneWidth : 480;
        const clamped = Math.min(Math.max(requested, minLeft), maxLeft);
        this.dataSourcesListPaneWidth = clamped;
        listPane.style.flexBasis = `${Math.round(clamped)}px`;
    },

    startDataSourcesPaneResize(event) {
        const mainPane = document.getElementById('dataSourcesMainPane');
        if (!mainPane || window.matchMedia('(max-width: 1280px)').matches) return;

        event.preventDefault();

        const onMove = (moveEvent) => {
            const rect = mainPane.getBoundingClientRect();
            const minLeft = 280;
            const maxLeft = Math.max(minLeft, rect.width - 360);
            const next = moveEvent.clientX - rect.left;
            this.dataSourcesListPaneWidth = Math.min(Math.max(next, minLeft), maxLeft);
            this.applyDataSourcesPaneWidth();
        };

        const onUp = async () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            await chrome.storage.local.set({
                dataSourcesListPaneWidth: Math.round(this.dataSourcesListPaneWidth || 480)
            });
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    },

    async toggleDataSourceEditorPane() {
        this.dataSourceEditorPaneCollapsed = !this.dataSourceEditorPaneCollapsed;
        await chrome.storage.local.set({ dataSourceEditorPaneCollapsed: !!this.dataSourceEditorPaneCollapsed });
        this.applyDataSourceEditorPaneState();
    },

    applyDataSourceEditorPaneState() {
        const collapsed = !!this.dataSourceEditorPaneCollapsed;
        const editorBody = document.getElementById('dataSourceEditorSectionBody');
        const saveSection = document.getElementById('dataSourceSaveSection');
        const linksSection = document.getElementById('dataSourceProjectLinksSection');
        const relationshipsSection = document.getElementById('dataSourceRelationshipsSection');
        const header = document.getElementById('dataSourceEditorHeader');
        const toggleIcon = document.getElementById('dataSourceEditorToggleIcon');

        if (editorBody) {
            editorBody.classList.toggle('is-hidden', collapsed);
        }
        if (saveSection) {
            saveSection.classList.toggle('is-hidden', collapsed);
        }
        if (linksSection) {
            linksSection.classList.toggle('is-hidden', collapsed);
        }
        if (relationshipsSection) {
            relationshipsSection.classList.toggle('is-hidden', collapsed);
        }
        if (header) {
            header.classList.toggle('collapsed', collapsed);
            header.title = collapsed ? 'Click to expand' : 'Click to collapse';
        }
        if (toggleIcon) {
            toggleIcon.textContent = collapsed ? '▶' : '▼';
        }
    },

    updatePrimaryDataSourceUI(type) {
        const inputContainer = document.getElementById('primaryDataSourceInput');
        const odataQueryContainer = document.getElementById('primaryODataQueryContainer');
        const odataDynamicNote = document.getElementById('primaryODataDynamicNote');
        const fieldsPreview = document.getElementById('primaryDataFields');

        if (!inputContainer || !fieldsPreview) return;

        inputContainer.classList.remove('is-hidden');
        const isOData = type === 'odata-cached' || type === 'odata-dynamic';
        if (odataQueryContainer) {
            odataQueryContainer.classList.toggle('is-hidden', !isOData);
        }
        if (odataDynamicNote) {
            odataDynamicNote.classList.toggle('is-hidden', type !== 'odata-dynamic');
        }

        let placeholder = 'code,text\nA1,Example';
        if (type === 'json') {
            placeholder = '[{"code": "A1", "text": "Example"}]';
        } else if (type === 'odata-cached' || type === 'odata-dynamic') {
            placeholder = 'Validated OData data preview will appear here...';
        }

        const input = document.getElementById('primaryDataInput');
        if (input) {
            input.placeholder = placeholder;
            input.classList.add('editor-expanded');
        }
        const queryInput = document.getElementById('primaryODataQuery');
        if (queryInput && isOData && !queryInput.value && this.dataSources?.primary?.odataQuery) {
            queryInput.value = this.dataSources.primary.odataQuery;
        }

        this.dataSources.primary.type = type || 'json';
    },

    async validatePrimaryData() {
        const type = document.getElementById('primaryDataSourceType')?.value || 'json';
        const input = document.getElementById('primaryDataInput')?.value?.trim() || '';
        const odataQuery = document.getElementById('primaryODataQuery')?.value?.trim() || '';
        const statusEl = document.getElementById('primaryDataStatus');
        const previewInput = document.getElementById('primaryDataInput');
        const isOData = type === 'odata-cached' || type === 'odata-dynamic';

        if (isOData) {
            this.setDataSourceProcessingState('validatePrimaryData', true, 'Validating...');
            if (statusEl) {
                statusEl.textContent = 'Processing OData query...';
                statusEl.className = 'data-status';
            }
        }

        try {
            let data;
            if (type === 'json') {
                data = JSON.parse(input);
            } else if (type === 'csv') {
                data = this.parseCSV(input);
            } else if (type === 'odata-cached' || type === 'odata-dynamic') {
                const previewOnly = type === 'odata-dynamic';
                const result = await this.fetchODataRowsFromActiveEnvironment(odataQuery, { previewOnly });
                data = result.rows;
                this.dataSources.primary.odataQuery = result.query;
            } else {
                throw new Error('Unsupported data source type');
            }

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Data must be a non-empty array');
            }

            this.dataSources.primary.data = type === 'odata-dynamic' ? [] : data;
            this.dataSources.primary.fields = Object.keys(data[0] || {});
            this.dataSources.primary.type = type;
            if (type === 'odata-cached' || type === 'odata-dynamic') {
                if (previewInput) {
                    previewInput.value = JSON.stringify(data, null, 2);
                }
            }

            if (statusEl) {
                if (type === 'odata-dynamic') {
                    statusEl.textContent = `OK preview ${data.length} row(s), ${this.dataSources.primary.fields.length} fields. Full results load at run time.`;
                } else {
                    statusEl.textContent = `OK ${data.length} rows, ${this.dataSources.primary.fields.length} fields`;
                }
                statusEl.className = 'data-status success';
            }

            this.displayPrimaryDataFields();
            return true;
        } catch (error) {
            this.dataSources.primary.data = null;
            this.dataSources.primary.fields = [];
            this.dataSources.primary.odataQuery = (type === 'odata-cached' || type === 'odata-dynamic') ? odataQuery : '';
            this.displayPrimaryDataFields();
            if (statusEl) {
                statusEl.textContent = `Error: ${error.message}`;
                statusEl.className = 'data-status error';
            }
            return false;
        } finally {
            if (isOData) {
                this.setDataSourceProcessingState('validatePrimaryData', false);
            }
        }
    },

    displayPrimaryDataFields() {
        const container = document.getElementById('primaryDataFields');
        if (!container) return;

        const fields = this.dataSources?.primary?.fields || [];
        if (!fields.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = fields.map(field => `<span class="field-tag">${this.escapeHtml(field)}</span>`).join('');
    },

    async saveCurrentPrimaryAsSharedDataSource() {
        const selectedType = document.getElementById('primaryDataSourceType')?.value || 'json';
        const isOData = selectedType === 'odata-cached' || selectedType === 'odata-dynamic';
        if (isOData) {
            this.setDataSourceProcessingState('saveAsSharedDataSource', true, 'Saving...');
        }

        try {
        const isValid = await this.validatePrimaryData();
        if (!isValid) {
            this.showNotification('Fix validation errors before saving', 'warning');
            return;
        }

        const primary = this.dataSources?.primary || {};
        if (!['json', 'csv', 'odata-cached', 'odata-dynamic'].includes(primary.type)) {
            this.showNotification('Choose JSON, CSV / TSV, or OData first', 'warning');
            return;
        }

        if (primary.type === 'odata-dynamic' && (!Array.isArray(primary.fields) || !primary.fields.length)) {
            this.showNotification('Validate OData query first to discover fields', 'warning');
            return;
        }

        if (primary.type !== 'odata-dynamic' && (!Array.isArray(primary.data) || primary.data.length === 0)) {
            this.showNotification('Validate data before saving', 'warning');
            return;
        }

        const nameInput = document.getElementById('sharedDataSourceName');
        const name = (nameInput?.value || '').trim();
        if (!name) {
            this.showNotification('Enter a data source name', 'warning');
            return;
        }

        const now = Date.now();
        const existing = this.getSharedDataSourceById(this.selectedSharedDataSourceId);

        if (existing) {
            existing.name = name;
            existing.type = primary.type;
            existing.data = JSON.parse(JSON.stringify(primary.data || []));
            existing.fields = [...(primary.fields || [])];
            existing.odataQuery = (primary.odataQuery || '').trim();
            existing.updatedAt = now;
        } else {
            const source = {
                id: `shared_${now}`,
                name,
                type: primary.type,
                data: JSON.parse(JSON.stringify(primary.data || [])),
                fields: [...(primary.fields || [])],
                odataQuery: (primary.odataQuery || '').trim(),
                projectIds: (this.selectedDataSourceProjectId && !['all', 'unassigned'].includes(this.selectedDataSourceProjectId))
                    ? [this.selectedDataSourceProjectId]
                    : [],
                createdAt: now,
                updatedAt: now
            };
            this.sharedDataSources.push(source);
            this.selectedSharedDataSourceId = source.id;
        }

        await this.persistSharedDataSources();
        await this.loadSharedDataSources();
        this.renderSharedDataSourcesUI();
        this.showNotification('Data source saved', 'success');
        } finally {
            if (isOData) {
                this.setDataSourceProcessingState('saveAsSharedDataSource', false);
            }
        }
    },

    async deleteSelectedSharedDataSource() {
        const selectedId = this.selectedSharedDataSourceId || '';
        if (!selectedId) {
            this.showNotification('Select a data source from the list first', 'warning');
            return;
        }
        await this.deleteSharedDataSourceById(selectedId);
    },

    async deleteSharedDataSourceById(sourceId) {
        const existing = this.getSharedDataSourceById(sourceId);
        if (!existing) {
            this.showNotification('Selected data source not found', 'error');
            return;
        }

        if (!confirm(`Delete data source "${existing.name}"?`)) return;

        this.sharedDataSources = this.sharedDataSources.filter(source => source.id !== sourceId);
        this.sharedDataSourceRelationships = (this.sharedDataSourceRelationships || []).filter(rel =>
            rel.parentSourceId !== sourceId && rel.detailId !== sourceId
        );
        if (this.selectedSharedDataSourceId === sourceId) {
            this.selectedSharedDataSourceId = '';
        }
        await this.persistSharedDataSources();
        await this.persistSharedDataSourceRelationships();
        await this.loadSharedDataSources();
        if (!this.selectedSharedDataSourceId) {
            this.startNewSharedDataSource();
        }
        this.showNotification('Data source deleted', 'success');
    },

    // Legacy no-op methods kept for compatibility with previous wiring.
    addDetailDataSource() {},
    renderDetailDataSources() {},
    validateDetailData() {},
    updateRelationshipsUI() {},
    renderRelationships() {},

    parseCSV(text) {
        const raw = text.trim();
        if (!raw) return [];
        const lines = raw.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        const headerLine = lines[0];
        const tabCount = (headerLine.match(/\t/g) || []).length;
        const commaCount = (headerLine.match(/,/g) || []).length;
        const delimiter = (tabCount > commaCount && tabCount > 0) ? '\t' : ',';

        const splitAndClean = (value) => value.split(delimiter).map(part => part.trim().replace(/^['\"]|['\"]$/g, ''));
        const headers = splitAndClean(headerLine);

        return lines.slice(1).map(line => {
            const values = splitAndClean(line);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            return row;
        });
    },

    normalizeODataQueryPath(query) {
        const raw = String(query || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        return raw.replace(/^\/+/, '').replace(/^data\/+/i, '');
    },

    async getD365DataApiBaseUrl() {
        const isD365Url = (url) => /https:\/\/.*(dynamics\.com|cloudax\.dynamics\.com)\//i.test(String(url || ''));
        const fromTab = async () => {
            const tab = this.getLinkedOrActiveTab ? await this.getLinkedOrActiveTab() : null;
            if (tab?.url && isD365Url(tab.url)) {
                const origin = new URL(tab.url).origin;
                return { origin, tabId: tab.id };
            }
            return null;
        };

        const tabInfo = await fromTab();
        if (tabInfo?.origin) {
            return tabInfo;
        }

        const result = await chrome.storage.local.get(['linkedTabUrl', 'linkedTabId']);
        if (result?.linkedTabUrl && isD365Url(result.linkedTabUrl)) {
            const origin = new URL(result.linkedTabUrl).origin;
            return { origin, tabId: result.linkedTabId || null };
        }

        throw new Error('No linked D365 environment found');
    },

    async fetchODataRowsFromActiveEnvironment(query, options = {}) {
        const previewOnly = !!options.previewOnly;
        const normalized = this.normalizeODataQueryPath(query);
        if (!normalized) {
            throw new Error('Enter an OData query path');
        }

        const { origin, tabId } = await this.getD365DataApiBaseUrl();
        let requestUrl = normalized;
        if (!/^https?:\/\//i.test(requestUrl)) {
            requestUrl = `${origin}/data/${requestUrl}`;
        }

        if (previewOnly && !/[?&]\$top=/i.test(requestUrl)) {
            requestUrl += (requestUrl.includes('?') ? '&' : '?') + '$top=1';
        }

        if (!tabId) {
            throw new Error('No D365 tab available for OData query');
        }

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (url, isPreview) => {
                const collectRows = (payload) => {
                    const sanitize = (row) => {
                        if (!row || typeof row !== 'object') return row;
                        const clone = { ...row };
                        delete clone['@odata.etag'];
                        return clone;
                    };
                    if (Array.isArray(payload)) return payload.map(sanitize);
                    if (Array.isArray(payload?.value)) return payload.value.map(sanitize);
                    if (payload && typeof payload === 'object') return [sanitize(payload)];
                    return [];
                };

                const maxRows = isPreview ? 1 : 5000;
                const maxPages = isPreview ? 1 : 50;
                const rows = [];
                let nextUrl = url;
                let page = 0;

                while (nextUrl && page < maxPages && rows.length < maxRows) {
                    const response = await fetch(nextUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers: { Accept: 'application/json' }
                    });
                    if (!response.ok) {
                        let text = '';
                        try { text = await response.text(); } catch (_) {}
                        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
                    }
                    const payload = await response.json();
                    const pageRows = collectRows(payload);
                    rows.push(...pageRows);
                    if (isPreview) break;
                    nextUrl = payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || '';
                    page += 1;
                }

                return { rows: rows.slice(0, maxRows) };
            },
            args: [requestUrl, previewOnly]
        });

        const rows = Array.isArray(result?.rows) ? result.rows : [];
        if (!rows.length) {
            throw new Error('OData query returned no rows');
        }

        return { rows, query: normalized, requestUrl };
    },

    dataToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const lines = [headers.join(',')];
        data.forEach(row => {
            lines.push(headers.map(header => row[header] || '').join(','));
        });
        return lines.join('\n');
    },

    dataToTSV(data) {
        return this.dataToCSV(data);
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
};
