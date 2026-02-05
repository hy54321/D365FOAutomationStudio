export const dataSourceMethods = {
    getDataSourceEditorState() {
        if (!this.dataSourceEditorState) {
            this.dataSourceEditorState = {
                primaryExpanded: false,
                detailExpanded: {}
            };
        }
        return this.dataSourceEditorState;
    },

    applyPrimaryDataEditorState() {
        const state = this.getDataSourceEditorState();
        const textarea = document.getElementById('primaryDataInput');
        const toggleBtn = document.getElementById('togglePrimaryDataSize');
        if (!textarea || !toggleBtn) return;

        textarea.classList.toggle('editor-expanded', !!state.primaryExpanded);
        toggleBtn.textContent = state.primaryExpanded ? 'Minimize' : 'Maximize';
    },

    togglePrimaryDataEditorSize() {
        const state = this.getDataSourceEditorState();
        state.primaryExpanded = !state.primaryExpanded;
        this.applyPrimaryDataEditorState();
    },

    toggleDetailDataEditorSize(detailId) {
        const state = this.getDataSourceEditorState();
        state.detailExpanded[detailId] = !state.detailExpanded[detailId];
        this.renderDetailDataSources();
    },

    updatePrimaryDataSourceUI(type) {
        const inputContainer = document.getElementById('primaryDataSourceInput');
        const fieldsPreview = document.getElementById('primaryDataFields');

        if (type === 'none') {
            inputContainer.classList.add('is-hidden');
            fieldsPreview.innerHTML = '';
            this.dataSources.primary = { type: 'none', data: null, fields: [] };
        } else {
            inputContainer.classList.remove('is-hidden');

            const placeholder = type === 'json' ?
                '[{"chargeCode": "AUF-DE", "language": "de", "text": "Aufwandspauschale"}]' :
                'chargeCode,language,text\nAUF-DE,de,Aufwandspauschale';

            document.getElementById('primaryDataInput').placeholder = placeholder;
            this.dataSources.primary.type = type;
            this.applyPrimaryDataEditorState();
        }
    },

    validatePrimaryData() {
        const type = document.getElementById('primaryDataSourceType').value;
        const input = document.getElementById('primaryDataInput').value.trim();
        const statusEl = document.getElementById('primaryDataStatus');

        try {
            let data;
            if (type === 'json') {
                data = JSON.parse(input);
            } else if (type === 'csv') {
                data = this.parseCSV(input);
            }

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Data must be a non-empty array');
            }

            this.dataSources.primary.data = data;
            this.dataSources.primary.fields = Object.keys(data[0] || {});

            statusEl.textContent = `OK ${data.length} rows, ${this.dataSources.primary.fields.length} fields`;
            statusEl.className = 'data-status success';

            this.displayPrimaryDataFields();
            this.updateRelationshipsUI();

        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'data-status error';
        }
    },

    displayPrimaryDataFields() {
        const container = document.getElementById('primaryDataFields');
        if (this.dataSources.primary.fields.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.dataSources.primary.fields.map(f => 
            `<span class="field-tag">${f}</span>`
        ).join('');
    },

    addDetailDataSource() {
        const id = 'detail_' + Date.now();
        const newDetail = {
            id,
            name: `Detail ${this.dataSources.details.length + 1}`,
            type: 'none',
            data: null,
            fields: [],
            linkedTo: 'primary',
            linkFields: []
        };

        this.dataSources.details.push(newDetail);
        this.renderDetailDataSources();
        this.updateRelationshipsUI();
    },

    renderDetailDataSources() {
        const container = document.getElementById('detailDataSources');
        const editorState = this.getDataSourceEditorState();

        if (this.dataSources.details.length === 0) {
            container.innerHTML = '<p style="color: #999; font-size: 12px; text-align: center;">No detail data sources. Click "Add" to create one.</p>';
            return;
        }

        container.innerHTML = this.dataSources.details.map((detail, index) => {
            const isExpanded = !!editorState.detailExpanded[detail.id];
            return `
            <div class="detail-source-item" data-detail-id="${detail.id}">
                <div class="source-header">
                    <input type="text" class="form-control form-control-sm detail-name" value="${detail.name}" style="width: 150px;">
                    <select class="form-control form-control-sm detail-type" style="width: 100px;">
                        <option value="none" ${detail.type === 'none' ? 'selected' : ''}>No Data</option>
                        <option value="json" ${detail.type === 'json' ? 'selected' : ''}>JSON</option>
                        <option value="csv" ${detail.type === 'csv' ? 'selected' : ''}>CSV / TSV</option>
                    </select>
                    <button class="btn-remove" title="Remove">Remove</button>
                </div>
                <div class="detail-input ${detail.type === 'none' ? 'is-hidden' : ''}">
                    <textarea class="form-control detail-data ${isExpanded ? 'editor-expanded' : ''}" rows="3" placeholder="Paste data here...">${detail.data ? (detail.type === 'json' ? JSON.stringify(detail.data, null, 2) : this.dataToCSV(detail.data)) : ''}</textarea>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <button class="btn btn-secondary btn-sm validate-detail">Validate</button>
                        <button class="btn btn-secondary btn-sm toggle-detail-size">${isExpanded ? 'Minimize' : 'Maximize'}</button>
                        <span class="detail-status" style="font-size: 11px;">${detail.fields.length > 0 ? `OK ${detail.data?.length || 0} rows` : ''}</span>
                    </div>
                </div>
                <div class="detail-fields">${detail.fields.map(f => `<span class="field-tag">${f}</span>`).join('')}</div>
            </div>
        `;
        }).join('');

        // Add event listeners
        container.querySelectorAll('.detail-source-item').forEach(item => {
            const detailId = item.dataset.detailId;
            const detail = this.dataSources.details.find(d => d.id === detailId);

            item.querySelector('.detail-name').addEventListener('change', (e) => {
                detail.name = e.target.value;
            });

            item.querySelector('.detail-type').addEventListener('change', (e) => {
                detail.type = e.target.value;
                const inputEl = item.querySelector('.detail-input');
                if (e.target.value === 'none') {
                    inputEl.classList.add('is-hidden');
                } else {
                    inputEl.classList.remove('is-hidden');
                }
            });

            item.querySelector('.btn-remove').addEventListener('click', () => {
                this.dataSources.details = this.dataSources.details.filter(d => d.id !== detailId);
                this.renderDetailDataSources();
                this.updateRelationshipsUI();
            });

            item.querySelector('.validate-detail')?.addEventListener('click', () => {
                this.validateDetailData(detailId);
            });

            item.querySelector('.toggle-detail-size')?.addEventListener('click', () => {
                this.toggleDetailDataEditorSize(detailId);
            });
        });
    },

    validateDetailData(detailId) {
        const detail = this.dataSources.details.find(d => d.id === detailId);
        if (!detail) return;

        const item = document.querySelector(`[data-detail-id="${detailId}"]`);
        const input = item.querySelector('.detail-data').value.trim();
        const statusEl = item.querySelector('.detail-status');
        const fieldsEl = item.querySelector('.detail-fields');

        try {
            let data;
            if (detail.type === 'json') {
                data = JSON.parse(input);
            } else if (detail.type === 'csv') {
                data = this.parseCSV(input);
            }

            detail.data = data;
            detail.fields = Object.keys(data[0] || {});

            statusEl.textContent = `OK ${data.length} rows`;
            statusEl.style.color = '#28a745';
            fieldsEl.innerHTML = detail.fields.map(f => `<span class="field-tag">${f}</span>`).join('');

            this.updateRelationshipsUI();

        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.style.color = '#dc3545';
        }
    },

    updateRelationshipsUI() {
        const section = document.getElementById('relationshipsSection');
        const container = document.getElementById('dataRelationships');

        // Only show if we have primary data and at least one detail
        const hasData = this.dataSources.primary.fields.length > 0 && this.dataSources.details.some(d => d.fields.length > 0);

        if (!hasData) {
            section.classList.add('is-hidden');
            return;
        }

        section.classList.remove('is-hidden');
        this.renderRelationships();
    },

    renderRelationships() {
        const container = document.getElementById('dataRelationships');
        const detailsWithData = this.dataSources.details.filter(d => d.fields.length > 0);

        if (detailsWithData.length === 0) {
            container.innerHTML = '<p style="color: #999; font-size: 12px;">Add and validate detail data sources to configure relationships.</p>';
            return;
        }

        // Auto-detect common fields
        const autoRelations = [];
        detailsWithData.forEach(detail => {
            const commonFields = detail.fields.filter(f => this.dataSources.primary.fields.includes(f));
            if (commonFields.length > 0) {
                autoRelations.push({ detailId: detail.id, detailName: detail.name, commonFields });
            }
        });

        container.innerHTML = `
            ${autoRelations.length > 0 ? `
                <div style="background: #e8f5e9; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
                    Auto-detected common fields: ${autoRelations.map(r => `${r.detailName} (${r.commonFields.join(', ')})`).join('; ')}
                </div>
            ` : ''}
            ${detailsWithData.map(detail => {
                const existing = this.dataSources.relationships.find(r => r.detailId === detail.id) || {};
                return `
                    <div class="relationship-item" data-rel-detail="${detail.id}">
                        <span style="font-weight: 600; font-size: 12px;">${detail.name}</span>
                        <span class="relation-arrow"><-></span>
                        <span style="font-size: 12px;">Primary on</span>
                        <select class="primary-field form-control-sm">
                            <option value="">-- Select --</option>
                            ${this.dataSources.primary.fields.map(f => 
                                `<option value="${f}" ${existing.primaryField === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </select>
                        <span style="font-size: 12px;">=</span>
                        <select class="detail-field form-control-sm">
                            <option value="">-- Select --</option>
                            ${detail.fields.map(f => 
                                `<option value="${f}" ${existing.detailField === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </select>
                    </div>
                `;
            }).join('')}
        `;

        // Add event listeners
        container.querySelectorAll('.relationship-item').forEach(item => {
            const detailId = item.dataset.relDetail;

            const update = () => {
                const primaryField = item.querySelector('.primary-field').value;
                const detailField = item.querySelector('.detail-field').value;

                // Remove existing relationship for this detail
                this.dataSources.relationships = this.dataSources.relationships.filter(r => r.detailId !== detailId);

                if (primaryField && detailField) {
                    this.dataSources.relationships.push({ detailId, primaryField, detailField });
                }
            };

            item.querySelector('.primary-field').addEventListener('change', update);
            item.querySelector('.detail-field').addEventListener('change', update);
        });
    },

    parseCSV(text) {
        // Auto-detect delimiter: prefer tab if tabs are present and more frequent than commas
        const raw = text.trim();
        if (!raw) return [];
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Determine delimiter by inspecting the header line
        const headerLine = lines[0];
        const tabCount = (headerLine.match(/\t/g) || []).length;
        const commaCount = (headerLine.match(/,/g) || []).length;
        const delimiter = (tabCount > commaCount && tabCount > 0) ? '\t' : ',';

        const splitAndClean = (s) => s.split(delimiter).map(v => v.trim().replace(/^['\"]|['\"]$/g, ''));

        const headers = splitAndClean(headerLine);

        return lines.slice(1).map(line => {
            const values = splitAndClean(line);
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = values[i] || '';
            });
            return obj;
        });
    },

    dataToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const lines = [headers.join(',')];
        data.forEach(row => {
            lines.push(headers.map(h => row[h] || '').join(','));
        });
        return lines.join('\n');
    },
    
    dataToTSV(data) {
        // Keep for compatibility (not used) - convert to CSV output instead
        return this.dataToCSV(data);
    }
};
