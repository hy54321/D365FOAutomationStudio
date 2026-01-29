export const stepMethods = {
    addStep() {
        if (!this.currentWorkflow) {
            this.createNewWorkflow();
        }

        this.currentStep = {
            id: Date.now().toString(),
            type: 'click',
            controlName: '',
            value: '',
            fieldMapping: ''
        };

        this.showStepEditor();
    },

    showStepEditor() {
        document.getElementById('stepsPanel').style.display = 'none';
        document.getElementById('stepEditorOverlay').style.display = 'flex';
        document.getElementById('stepType').value = this.currentStep.type;

        // Show delete button only for existing steps (not new ones)
        const isExistingStep = this.currentWorkflow?.steps?.some(s => s.id === this.currentStep.id);
        document.getElementById('deleteStep').style.display = isExistingStep ? 'inline-flex' : 'none';
        document.getElementById('stepEditorTitle').textContent = isExistingStep ? 'Edit Step' : 'New Step';

        this.updateStepFields(this.currentStep.type);
    },

    hideStepEditor() {
        document.getElementById('stepEditorOverlay').style.display = 'none';
        document.getElementById('stepsPanel').style.display = 'block';
    },

    isUIActionStep(stepType) {
        return ['click', 'input', 'select', 'lookupSelect', 'checkbox', 'grid-input'].includes(stepType);
    },

    renderWaitOptions() {
        const waitVisible = this.currentStep?.waitUntilVisible ? 'checked' : '';
        const waitHidden = this.currentStep?.waitUntilHidden ? 'checked' : '';

        return `
            <div class="form-group">
                <label>Wait Options</label>
                <div class="wait-options">
                    <label class="wait-option">
                        <input type="checkbox" id="stepWaitVisible" ${waitVisible}>
                        Wait until visible (before action)
                    </label>
                    <label class="wait-option">
                        <input type="checkbox" id="stepWaitHidden" ${waitHidden}>
                        Wait until hidden (after action)
                    </label>
                </div>
                <small style="color: #666; font-size: 11px;">Uses the same control name as this step</small>
            </div>
        `;
    },

    getWaitOptionsFromUI() {
        return {
            waitUntilVisible: document.getElementById('stepWaitVisible')?.checked || false,
            waitUntilHidden: document.getElementById('stepWaitHidden')?.checked || false
        };
    },

    updateStepFields(stepType) {
        const container = document.getElementById('stepTypeFields');
        container.innerHTML = '';

        if (stepType === 'click') {
            const waitOptions = this.renderWaitOptions();
            container.innerHTML = `
                <div class="form-group">
                    <label>Button Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., SystemDefinedNewButton">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., New">
                </div>
                ${waitOptions}
            `;
        } else if (stepType === 'input' || stepType === 'select' || stepType === 'lookupSelect') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const waitOptions = this.renderWaitOptions();
            container.innerHTML = `
                <div class="form-group">
                    <label>Field Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., LanguageTxt_LanguageId1">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${!hasFieldMapping ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${hasFieldMapping ? 'selected' : ''}>From Data Field</option>
                    </select>
                </div>
                <div class="form-group" id="staticValueGroup" ${hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Enter value">
                </div>
                <div class="form-group" id="dataFieldGroup" ${!hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                ${waitOptions}
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const isData = e.target.value === 'data';
                    document.getElementById('staticValueGroup').style.display = isData ? 'none' : 'block';
                    document.getElementById('dataFieldGroup').style.display = isData ? 'block' : 'none';
                });
            }, 0);
        } else if (stepType === 'checkbox') {
            const waitOptions = this.renderWaitOptions();
            container.innerHTML = `
                <div class="form-group">
                    <label>Checkbox Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., Prorate">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Prorate">
                </div>
                <div class="form-group">
                    <label>Action</label>
                    <select id="stepValue" class="form-control">
                        <option value="true" ${this.currentStep?.value === 'true' ? 'selected' : ''}>Check (Enable)</option>
                        <option value="false" ${this.currentStep?.value === 'false' ? 'selected' : ''}>Uncheck (Disable)</option>
                    </select>
                </div>
                ${waitOptions}
            `;
        } else if (stepType === 'wait') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Duration (milliseconds)</label>
                    <input type="number" id="stepDuration" class="form-control" 
                           value="${this.currentStep?.duration || 1000}" 
                           placeholder="1000">
                </div>
            `;
        } else if (stepType === 'loop-start') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Loop Name</label>
                    <input type="text" id="stepLoopName" class="form-control" 
                           value="${this.currentStep?.loopName || 'Main Loop'}" 
                           placeholder="e.g., Process Records">
                </div>
                <div class="form-group">
                    <label>Data Source</label>
                    <select id="stepLoopDataSource" class="form-control">
                        <option value="primary" ${(this.currentStep?.loopDataSource || 'primary') === 'primary' ? 'selected' : ''}>Primary Data Source</option>
                        ${this.dataSources.details.map(d => 
                            `<option value="${d.id}" ${this.currentStep?.loopDataSource === d.id ? 'selected' : ''}>${d.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Iteration Limit (0 = unlimited)</label>
                    <input type="number" id="stepIterationLimit" class="form-control" 
                           value="${this.currentStep?.iterationLimit || 0}" 
                           min="0"
                           placeholder="0 for all rows">
                    <small style="color: #666; font-size: 11px;">Set a limit for testing, or 0 to process all rows</small>
                </div>
            `;
        } else if (stepType === 'loop-end') {
            // Find available loop starts
            const loopStarts = this.currentWorkflow?.steps.filter(s => s.type === 'loop-start') || [];
            container.innerHTML = `
                <div class="form-group">
                    <label>End Loop</label>
                    <select id="stepLoopRef" class="form-control">
                        ${loopStarts.map(ls => 
                            `<option value="${ls.id}" ${this.currentStep?.loopRef === ls.id ? 'selected' : ''}>${ls.loopName || 'Unnamed Loop'}</option>`
                        ).join('')}
                        ${loopStarts.length === 0 ? '<option value="">No loop starts found</option>' : ''}
                    </select>
                    <small style="color: #666; font-size: 11px;">Select which loop this ends</small>
                </div>
            `;
        } else if (stepType === 'filter') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            container.innerHTML = `
                <div class="form-group">
                    <label>Column Header Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., GridReadOnlyMarkupTable_MarkupCode">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">Note: Select the <strong>column header</strong> (e.g., GridName_ColumnName), NOT the FilterField input</small>
                </div>
                <div class="form-group">
                    <label>Filter Method</label>
                    <select id="stepFilterMethod" class="form-control">
                        <option value="is exactly" ${(this.currentStep?.filterMethod || 'is exactly') === 'is exactly' ? 'selected' : ''}>is exactly</option>
                        <option value="contains" ${this.currentStep?.filterMethod === 'contains' ? 'selected' : ''}>contains</option>
                        <option value="begins with" ${this.currentStep?.filterMethod === 'begins with' ? 'selected' : ''}>begins with</option>
                        <option value="is not" ${this.currentStep?.filterMethod === 'is not' ? 'selected' : ''}>is not</option>
                        <option value="does not contain" ${this.currentStep?.filterMethod === 'does not contain' ? 'selected' : ''}>does not contain</option>
                        <option value="is one of" ${this.currentStep?.filterMethod === 'is one of' ? 'selected' : ''}>is one of</option>
                        <option value="after" ${this.currentStep?.filterMethod === 'after' ? 'selected' : ''}>after (dates)</option>
                        <option value="before" ${this.currentStep?.filterMethod === 'before' ? 'selected' : ''}>before (dates)</option>
                        <option value="matches" ${this.currentStep?.filterMethod === 'matches' ? 'selected' : ''}>matches (regex)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${!hasFieldMapping ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${hasFieldMapping ? 'selected' : ''}>From Data Field</option>
                    </select>
                </div>
                <div class="form-group" id="staticValueGroup" ${hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Filter Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Value to filter by">
                </div>
                <div class="form-group" id="dataFieldGroup" ${!hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Charges code">
                </div>
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const isData = e.target.value === 'data';
                    document.getElementById('staticValueGroup').style.display = isData ? 'none' : 'block';
                    document.getElementById('dataFieldGroup').style.display = isData ? 'block' : 'none';
                });
            }, 0);
        } else if (stepType === 'wait-until') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Wait for Element</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., MessageBox_Yes">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">The element to wait for (dialog, button, etc.)</small>
                </div>
                <div class="form-group">
                    <label>Wait Condition</label>
                    <select id="stepWaitCondition" class="form-control">
                        <option value="visible" ${(this.currentStep?.waitCondition || 'visible') === 'visible' ? 'selected' : ''}>Element becomes visible</option>
                        <option value="hidden" ${this.currentStep?.waitCondition === 'hidden' ? 'selected' : ''}>Element becomes hidden</option>
                        <option value="exists" ${this.currentStep?.waitCondition === 'exists' ? 'selected' : ''}>Element exists in DOM</option>
                        <option value="not-exists" ${this.currentStep?.waitCondition === 'not-exists' ? 'selected' : ''}>Element removed from DOM</option>
                        <option value="enabled" ${this.currentStep?.waitCondition === 'enabled' ? 'selected' : ''}>Element becomes enabled</option>
                        <option value="has-value" ${this.currentStep?.waitCondition === 'has-value' ? 'selected' : ''}>Element has specific value</option>
                    </select>
                </div>
                <div class="form-group" id="waitValueGroup" style="${this.currentStep?.waitCondition === 'has-value' ? '' : 'display: none;'}">
                    <label>Expected Value</label>
                    <input type="text" id="stepWaitValue" class="form-control" 
                           value="${this.currentStep?.waitValue || ''}" 
                           placeholder="Value to wait for">
                </div>
                <div class="form-group">
                    <label>Timeout (milliseconds)</label>
                    <input type="number" id="stepTimeout" class="form-control" 
                           value="${this.currentStep?.timeout || 10000}" 
                           min="1000"
                           placeholder="10000">
                    <small style="color: #666; font-size: 11px;">Maximum time to wait before failing (default: 10 seconds)</small>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Delete confirmation dialog">
                </div>
            `;

            // Add event listener for wait condition change
            setTimeout(() => {
                document.getElementById('stepWaitCondition')?.addEventListener('change', (e) => {
                    const showValue = e.target.value === 'has-value';
                    document.getElementById('waitValueGroup').style.display = showValue ? 'block' : 'none';
                    this.autoSaveStep();
                });
            }, 0);
        } else if (stepType === 'grid-input') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const waitOptions = this.renderWaitOptions();
            container.innerHTML = `
                <div class="form-group">
                    <label>Grid Column Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., ItemId or SalesLine_ItemId">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">Select a <strong>Grid Column</strong> from the Inspector to set its value in the active row</small>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${!hasFieldMapping ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${hasFieldMapping ? 'selected' : ''}>From Data Field</option>
                    </select>
                </div>
                <div class="form-group" id="staticValueGroup" ${hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Enter value (e.g., item number, quantity)">
                </div>
                <div class="form-group" id="dataFieldGroup" ${!hasFieldMapping ? 'style="display: none;"' : ''}>
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Item number">
                </div>
                ${waitOptions}
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const isData = e.target.value === 'data';
                    document.getElementById('staticValueGroup').style.display = isData ? 'none' : 'block';
                    document.getElementById('dataFieldGroup').style.display = isData ? 'block' : 'none';
                });
            }, 0);
        }

        // Add pick element listener
        setTimeout(() => {
            const pickBtn = document.getElementById('pickElement');
            if (pickBtn) {
                pickBtn.addEventListener('click', () => this.switchToInspector());
            }

            // Add auto-save listeners to all form fields
            this.setupAutoSaveListeners();
        }, 0);
    },
    setupAutoSaveListeners() {
        // All input fields
        const inputs = document.querySelectorAll('#stepTypeFields input, #stepTypeFields textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.autoSaveStep());
            input.addEventListener('change', () => this.autoSaveStep());
        });

        // All select fields
        const selects = document.querySelectorAll('#stepTypeFields select');
        selects.forEach(select => {
            select.addEventListener('change', () => {
                // Handle value source toggle
                if (select.id === 'stepValueSource') {
                    const isData = select.value === 'data';
                    const staticGroup = document.getElementById('staticValueGroup');
                    const dataGroup = document.getElementById('dataFieldGroup');
                    if (staticGroup) staticGroup.style.display = isData ? 'none' : 'block';
                    if (dataGroup) dataGroup.style.display = isData ? 'block' : 'none';
                }
                this.autoSaveStep();
            });
        });
    },

    renderFieldMappingDropdown(currentValue) {
        const allFields = this.getAllAvailableFields();

        if (allFields.length === 0) {
            return `
                <div class="field-mapping-select">
                    <input type="text" id="stepFieldMapping" class="form-control" 
                           value="${currentValue}" 
                           placeholder="e.g., LanguageId">
                    <p class="no-fields">No data source configured. Add data in the Data Sources panel below.</p>
                </div>
            `;
        }

        return `
            <div class="field-mapping-select">
                <select id="stepFieldMapping" class="form-control">
                    <option value="">-- Select Field --</option>
                    ${this.dataSources.primary.fields.length > 0 ? `
                        <optgroup label="Primary Data">
                            ${this.dataSources.primary.fields.map(f => 
                                `<option value="${f}" ${currentValue === f ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </optgroup>
                    ` : ''}
                    ${this.dataSources.details.map(d => d.fields.length > 0 ? `
                        <optgroup label="${d.name}">
                            ${d.fields.map(f => 
                                `<option value="${d.id}:${f}" ${currentValue === `${d.id}:${f}` ? 'selected' : ''}>${f}</option>`
                            ).join('')}
                        </optgroup>
                    ` : '').join('')}
                </select>
            </div>
        `;
    },

    getAllAvailableFields() {
        const fields = [...this.dataSources.primary.fields];
        this.dataSources.details.forEach(d => {
            d.fields.forEach(f => fields.push(`${d.name}.${f}`));
        });
        return fields;
    },

    async switchToInspector() {
        // Switch to Inspector tab
        document.querySelector('[data-tab="inspector"]').click();

        // Refresh elements if none discovered yet
        if (this.discoveredElements.length === 0) {
            await this.refreshElements();
        }

        // Show helpful message
        this.showNotification('Click any element below to select it for your step', 'info');
    },

    async pickElement() {
        const tab = await this.getLinkedOrActiveTab();

        if (!tab) {
            this.showNotification('No D365FO tab connected', 'error');
            return;
        }

        console.log('Starting element picker, current step:', this.currentStep);

        // Store that we're waiting for element pick
        await chrome.storage.local.set({ 
            waitingForPick: true,
            currentStepData: this.currentStep,
            currentWorkflowData: this.currentWorkflow
        });

        await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });

        // Note: Window stays open in standalone mode, no need to close
    },

    async handleElementPicked(element) {
        console.log('Handling picked element:', element);

        if (this.currentStep) {
            this.currentStep.controlName = element.controlName;
            this.currentStep.displayText = element.displayText;
            this.currentStep.role = element.role;

            if (element.fieldType) {
                this.currentStep.fieldType = element.fieldType;
            }

            // Update UI - with retry in case DOM isn't ready
            setTimeout(() => {
                const controlNameInput = document.getElementById('stepControlName');
                if (controlNameInput) {
                    controlNameInput.value = element.controlName;
                    console.log('Set controlName input:', element.controlName);
                }

                const displayTextInput = document.getElementById('stepDisplayText');
                if (displayTextInput) {
                    displayTextInput.value = element.displayText;
                    console.log('Set displayText input:', element.displayText);
                }

                // Auto-save after element pick
                this.autoSaveStep();
            }, 50);
        }

        // Clear the waiting flag
        await chrome.storage.local.remove(['waitingForPick', 'pickedElement', 'currentStepData', 'currentWorkflowData']);

        // Show success notification
        this.showNotification(`Element selected: ${element.displayText || element.controlName}`, 'success');
    },

    // Auto-save step with debounce
    autoSaveStep() {
        // Clear any pending auto-save
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Debounce: save after 300ms of no changes
        this.autoSaveTimeout = setTimeout(() => {
            this.saveStep();
        }, 300);
    },
    saveStep() {
        if (!this.currentStep) return;

        this.currentStep.type = document.getElementById('stepType').value;

        if (this.currentStep.type === 'click') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
        } else if (this.currentStep.type === 'input' || this.currentStep.type === 'select' || this.currentStep.type === 'lookupSelect') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';

            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            }
        } else if (this.currentStep.type === 'checkbox') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.value = document.getElementById('stepValue')?.value || '';
        } else if (this.currentStep.type === 'wait') {
            this.currentStep.duration = parseInt(document.getElementById('stepDuration')?.value) || 1000;
        } else if (this.currentStep.type === 'loop-start') {
            this.currentStep.loopName = document.getElementById('stepLoopName')?.value || '';
            this.currentStep.loopDataSource = document.getElementById('stepLoopDataSource')?.value || '';
            this.currentStep.iterationLimit = parseInt(document.getElementById('stepIterationLimit')?.value) || 0;
        } else if (this.currentStep.type === 'loop-end') {
            this.currentStep.loopRef = document.getElementById('stepLoopRef')?.value || '';
        } else if (this.currentStep.type === 'filter') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.filterMethod = document.getElementById('stepFilterMethod')?.value || 'is exactly';

            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            }
        } else if (this.currentStep.type === 'wait-until') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.waitCondition = document.getElementById('stepWaitCondition')?.value || 'visible';
            this.currentStep.waitValue = document.getElementById('stepWaitValue')?.value || '';
            this.currentStep.timeout = parseInt(document.getElementById('stepTimeout')?.value) || 10000;
        }

        if (this.isUIActionStep(this.currentStep.type)) {
            const waitOptions = this.getWaitOptionsFromUI();
            this.currentStep.waitUntilVisible = waitOptions.waitUntilVisible;
            this.currentStep.waitUntilHidden = waitOptions.waitUntilHidden;
        } else {
            delete this.currentStep.waitUntilVisible;
            delete this.currentStep.waitUntilHidden;
        }

        // Add or update step in workflow
        if (!this.currentWorkflow) {
            this.createNewWorkflow();
        }

        const existingIndex = this.currentWorkflow.steps.findIndex(s => s.id === this.currentStep.id);
        if (existingIndex >= 0) {
            this.currentWorkflow.steps[existingIndex] = { ...this.currentStep };
        } else {
            this.currentWorkflow.steps.push({ ...this.currentStep });
        }

        // Update steps display without closing editor
        this.displaySteps();
    },

    closeStepEditor() {
        // Final save before closing
        this.saveStep();
        this.currentStep = null;
        this.hideStepEditor();
    },

    deleteCurrentStep() {
        if (!this.currentStep || !this.currentWorkflow) return;

        const stepName = this.currentStep.displayText || this.currentStep.controlName || 'this step';
        if (confirm(`Delete "${stepName}"?`)) {
            this.currentWorkflow.steps = this.currentWorkflow.steps.filter(s => s.id !== this.currentStep.id);
            this.displaySteps();
            this.currentStep = null;
            this.hideStepEditor();
            this.showNotification('Step deleted', 'info');
        }
    },

    cancelStep() {
        // Keep for backward compatibility - same as closeStepEditor
        this.closeStepEditor();
    },
    displaySteps() {
        const container = document.getElementById('stepsList');
        container.innerHTML = '';

        if (!this.currentWorkflow || this.currentWorkflow.steps.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No steps yet. Click "Add Step" to begin.</p>';
            return;
        }

        // Track which steps are inside loops
        let loopDepth = 0;
        const loopStack = [];

        this.currentWorkflow.steps.forEach((step, index) => {
            const item = document.createElement('div');
            item.className = 'step-item';
            item.draggable = true;
            item.dataset.stepIndex = index;

            // Handle loop styling
            if (step.type === 'loop-start') {
                item.classList.add('loop-start');
                loopStack.push(step.id);
                loopDepth++;
            } else if (step.type === 'loop-end') {
                item.classList.add('loop-end');
                loopStack.pop();
                loopDepth = Math.max(0, loopDepth - 1);
            } else if (loopDepth > 0) {
                item.classList.add('in-loop');
                item.style.marginLeft = `${loopDepth * 20}px`;
            }

            let stepDesc = '';
            let stepIcon = '';
            const waitFlags = this.formatWaitFlags(step);

            if (step.type === 'click') {
                stepIcon = 'CLK';
                stepDesc = `Click "${step.displayText || step.controlName}"${waitFlags}`;
            } else if (step.type === 'input') {
                stepIcon = 'IN';
                stepDesc = `Enter "${step.value || '{' + step.fieldMapping + '}'}" into ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'select') {
                stepIcon = 'SEL';
                stepDesc = `Select "${step.value || '{' + step.fieldMapping + '}'}" in ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'lookupSelect') {
                stepIcon = 'LOOK';
                stepDesc = `Lookup "${step.value || '{' + step.fieldMapping + '}'}" in ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'checkbox') {
                stepIcon = 'CHK';
                const action = step.value === 'true' ? 'Check' : 'Uncheck';
                stepDesc = `${action} "${step.displayText || step.controlName}"${waitFlags}`;
            } else if (step.type === 'wait') {
                stepIcon = 'WAIT';
                stepDesc = `Wait ${step.duration}ms`;
            } else if (step.type === 'loop-start') {
                stepIcon = 'LOOP';
                const limit = step.iterationLimit > 0 ? ` (max ${step.iterationLimit})` : ' (all rows)';
                stepDesc = `<span class="loop-indicator">LOOP START:</span> ${step.loopName || 'Loop'}${limit}`;
            } else if (step.type === 'loop-end') {
                stepIcon = 'LOOP';
                const refLoop = this.currentWorkflow.steps.find(s => s.id === step.loopRef);
                stepDesc = `<span class="loop-indicator">LOOP END:</span> ${refLoop?.loopName || 'Loop'}`;
            } else if (step.type === 'filter') {
                stepIcon = 'FLT';
                const method = step.filterMethod || 'is exactly';
                const filterVal = step.value || '{' + step.fieldMapping + '}';
                stepDesc = `Filter "${step.displayText || step.controlName}" ${method} "${filterVal}"`;
            } else if (step.type === 'grid-input') {
                stepIcon = 'GRID';
                const gridVal = step.value || '{' + step.fieldMapping + '}';
                stepDesc = `Set grid cell "${step.displayText || step.controlName}" to "${gridVal}"${waitFlags}`;
            } else if (step.type === 'wait-until') {
                stepIcon = 'WAIT';
                const condition = step.waitCondition || 'visible';
                stepDesc = `Wait until "${step.displayText || step.controlName}" ${condition}`;
            }

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <span style="cursor: move; color: #999;">::</span>
                    <span>${stepIcon}</span>
                    <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>${index + 1}.</strong> ${stepDesc}
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-edit" title="Edit" aria-label="Edit">✏️</button>
                    <button class="btn-delete" title="Delete" aria-label="Delete">🗑️</button>
                </div>
            `;

            // Drag and drop handlers
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    if (e.clientY < midpoint) {
                        item.parentNode.insertBefore(dragging, item);
                    } else {
                        item.parentNode.insertBefore(dragging, item.nextSibling);
                    }
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));

                // Get the current DOM order to calculate the actual new index
                const allItems = Array.from(container.querySelectorAll('.step-item'));
                const draggingItem = container.querySelector('.dragging');
                const toIndex = allItems.indexOf(draggingItem);

                if (fromIndex !== toIndex) {
                    // Reorder the steps array to match the DOM order
                    const [movedStep] = this.currentWorkflow.steps.splice(fromIndex, 1);
                    this.currentWorkflow.steps.splice(toIndex, 0, movedStep);
                    this.displaySteps();
                    this.showNotification('Steps reordered', 'info');
                }
            });

            item.querySelector('.btn-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentStep = { ...step };
                this.showStepEditor();
            });

            item.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentWorkflow.steps.splice(index, 1);
                this.displaySteps();
            });

            container.appendChild(item);
        });
    },

    formatWaitFlags(step) {
        const flags = [];
        if (step.waitUntilVisible) flags.push('wait visible');
        if (step.waitUntilHidden) flags.push('wait hidden');
        if (flags.length === 0) return '';
        return ` <span class="wait-flags">(${flags.join(', ')})</span>`;
    },

    clearStepStatuses() {
        const container = document.getElementById('stepsList');
        if (!container) return;
        container.querySelectorAll('.step-item').forEach(item => {
            item.classList.remove('step-running', 'step-success', 'step-error');
        });
    },

    setStepStatus(stepIndex, status) {
        const container = document.getElementById('stepsList');
        if (!container) return;
        const items = Array.from(container.querySelectorAll('.step-item'));
        items.forEach(item => {
            if (item.dataset.stepIndex === String(stepIndex)) {
                item.classList.remove('step-running', 'step-success', 'step-error');
                if (status === 'running') item.classList.add('step-running');
                if (status === 'success') item.classList.add('step-success');
                if (status === 'error') item.classList.add('step-error');
            } else if (status === 'running') {
                item.classList.remove('step-running');
            }
        });
    }
};
