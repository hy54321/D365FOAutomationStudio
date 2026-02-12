export const stepMethods = {
    initStepCopyUI() {
        const selectAll = document.getElementById('stepsSelectAll');
        const targetSelect = document.getElementById('copyStepsTarget');
        const copyButton = document.getElementById('copyStepsButton');

        if (!selectAll || !targetSelect || !copyButton) return;

        selectAll.addEventListener('change', (e) => {
            this.toggleSelectAllSteps(e.target.checked);
        });

        targetSelect.addEventListener('change', () => {
            this.updateCopyButtonState();
        });

        copyButton.addEventListener('click', () => {
            this.copyFromWorkflow();
        });
    },

    ensureStepSelectionState() {
        if (!this.selectedStepIds) {
            this.selectedStepIds = new Set();
        }
    },

    populateCopyTargets() {
        const select = document.getElementById('copyStepsTarget');
        if (!select) return;

        const currentId = this.currentWorkflow?.id;
        const targets = (this.workflows || []).filter(w => w.id !== currentId);

        select.innerHTML = '';

        if (targets.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No other workflows';
            select.appendChild(option);
            select.disabled = true;
            this.updateCopyButtonState();
            return;
        }

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select source workflow';
        select.appendChild(placeholder);

        targets.forEach(workflow => {
            const option = document.createElement('option');
            option.value = workflow.id;
            option.textContent = workflow.name || 'Untitled Workflow';
            select.appendChild(option);
        });

        select.disabled = false;
        this.updateCopyButtonState();
    },

    updateSelectAllState() {
        const selectAll = document.getElementById('stepsSelectAll');
        if (!selectAll || !this.currentWorkflow) return;

        const total = this.currentWorkflow.steps.length;
        const selected = this.selectedStepIds?.size || 0;

        selectAll.indeterminate = selected > 0 && selected < total;
        selectAll.checked = total > 0 && selected === total;
    },

    updateCopyButtonState() {
        const copyButton = document.getElementById('copyStepsButton');
        const targetSelect = document.getElementById('copyStepsTarget');
        if (!copyButton || !targetSelect) return;

        const hasSource = !!targetSelect.value;
        copyButton.disabled = !hasSource;
    },

    toggleSelectAllSteps(isChecked) {
        if (!this.currentWorkflow) return;
        this.ensureStepSelectionState();

        if (isChecked) {
            this.currentWorkflow.steps.forEach(step => this.selectedStepIds.add(step.id));
        } else {
            this.selectedStepIds.clear();
        }

        this.displaySteps();
    },

    async copyFromWorkflow() {
        if (!this.currentWorkflow) return;

        const sourceSelect = document.getElementById('copyStepsTarget');
        const sourceId = sourceSelect?.value;
        if (!sourceId) {
            this.showNotification('Select a source workflow first', 'error');
            return;
        }

        const sourceWorkflow = (this.workflows || []).find(w => w.id === sourceId);
        if (!sourceWorkflow) {
            this.showNotification('Source workflow not found', 'error');
            return;
        }

        const sourceSteps = sourceWorkflow.steps || [];
        if (sourceSteps.length === 0) {
            this.showNotification('Source workflow has no steps', 'warning');
            return;
        }

        const loopStartIdMap = new Map();
        const copiedSteps = sourceSteps.map((step, index) => {
            const clone = JSON.parse(JSON.stringify(step));
            const newId = `${Date.now()}_${index}_${Math.random().toString(16).slice(2, 6)}`;
            if (step.type === 'loop-start') {
                loopStartIdMap.set(step.id, newId);
            }
            clone.id = newId;
            return clone;
        });

        copiedSteps.forEach((clone, index) => {
            if (clone.type !== 'loop-end') return;
            const originalRef = sourceSteps[index]?.loopRef;
            if (originalRef && loopStartIdMap.has(originalRef)) {
                clone.loopRef = loopStartIdMap.get(originalRef);
            }
        });

        this.currentWorkflow.steps = [...(this.currentWorkflow.steps || []), ...copiedSteps];
        this.displaySteps();
        this.showNotification(`Copied ${copiedSteps.length} step${copiedSteps.length > 1 ? 's' : ''} from "${sourceWorkflow.name || 'source workflow'}"`, 'success');
    },

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
        document.getElementById('stepsPanel').classList.add('is-hidden');
        document.getElementById('stepEditorOverlay').classList.remove('is-hidden');
        document.getElementById('stepType').value = this.currentStep.type;

        // Show delete button only for existing steps (not new ones)
        const isExistingStep = this.currentWorkflow?.steps?.some(s => s.id === this.currentStep.id);
        const deleteButton = document.getElementById('deleteStep');
        if (deleteButton) {
            if (isExistingStep) {
                deleteButton.classList.remove('is-hidden');
            } else {
                deleteButton.classList.add('is-hidden');
            }
        }
        document.getElementById('stepEditorTitle').textContent = isExistingStep ? 'Edit Step' : 'New Step';

        this.updateStepFields(this.currentStep.type);
    },

    hideStepEditor() {
        document.getElementById('stepEditorOverlay').classList.add('is-hidden');
        document.getElementById('stepsPanel').classList.remove('is-hidden');
    },

    isUIActionStep(stepType) {
        return ['click', 'input', 'select', 'lookupSelect', 'checkbox', 'grid-input'].includes(stepType);
    },

    workflowHasLoops(workflow) {
        return (workflow?.steps || []).some(step => step.type === 'loop-start' || step.type === 'loop-end');
    },

    normalizeParamBinding(binding) {
        if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
            return {
                valueSource: binding.valueSource || 'static',
                value: binding.value ?? '',
                fieldMapping: binding.fieldMapping ?? ''
            };
        }
        return {
            valueSource: 'static',
            value: binding ?? '',
            fieldMapping: ''
        };
    },

    renderParamFieldMappingDropdown(currentValue) {
        const grouped = this.getSharedFieldGroups ? this.getSharedFieldGroups() : [];
        return `
            <select class="form-control param-field">
                <option value="">Select data field</option>
                ${grouped.map(group => `
                    <optgroup label="${group.label}">
                        ${group.fields.map(field => `<option value="${field.value}" ${currentValue === field.value ? 'selected' : ''}>${field.label}</option>`).join('')}
                    </optgroup>
                `).join('')}
            </select>
        `;
    },

    renderSubworkflowParamRows(paramBindings, orderedNames = []) {
        const entries = Object.entries(paramBindings || {});
        const ordered = orderedNames.length
            ? orderedNames.map(name => [name, (paramBindings || {})[name]]).filter(([name]) => name)
            : entries;

        if (ordered.length === 0) {
            return `
                <div class="param-row">
                    <input type="text" class="form-control param-name" placeholder="Parameter name">
                    <select class="form-control param-source">
                        <option value="static" selected>Static Value</option>
                        <option value="data">From Data Field</option>
                        <option value="clipboard">Clipboard</option>
                    </select>
                    <div class="param-value-group">
                        <input type="text" class="form-control param-value" placeholder="Value">
                        <div class="param-field-group is-hidden">
                            ${this.renderParamFieldMappingDropdown('')}
                        </div>
                        <div class="param-clipboard-note is-hidden">Uses clipboard when the step runs.</div>
                    </div>
                    <button type="button" class="btn-icon param-remove" title="Remove">✕</button>
                </div>
            `;
        }

        return ordered.map(([name, binding]) => {
            const normalized = this.normalizeParamBinding(binding);
            const isStatic = normalized.valueSource === 'static';
            const isData = normalized.valueSource === 'data';
            const isClipboard = normalized.valueSource === 'clipboard';
            return `
                <div class="param-row">
                    <input type="text" class="form-control param-name" value="${name}" placeholder="Parameter name">
                    <select class="form-control param-source">
                        <option value="static" ${isStatic ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${isData ? 'selected' : ''}>From Data Field</option>
                        <option value="clipboard" ${isClipboard ? 'selected' : ''}>Clipboard</option>
                    </select>
                    <div class="param-value-group">
                        <input type="text" class="form-control param-value ${isStatic ? '' : 'is-hidden'}" value="${normalized.value ?? ''}" placeholder="Value">
                        <div class="param-field-group ${isData ? '' : 'is-hidden'}">
                            ${this.renderParamFieldMappingDropdown(normalized.fieldMapping)}
                        </div>
                        <div class="param-clipboard-note ${isClipboard ? '' : 'is-hidden'}">Uses clipboard when the step runs.</div>
                    </div>
                    <button type="button" class="btn-icon param-remove" title="Remove">✕</button>
                </div>
            `;
        }).join('');
    },

    addSubworkflowParamRow(name = '', value = '') {
        const container = document.getElementById('subworkflowParamsTable');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'param-row';
        const normalized = this.normalizeParamBinding({ valueSource: 'static', value, fieldMapping: '' });
        row.innerHTML = `
            <input type="text" class="form-control param-name" value="${name}" placeholder="Parameter name">
            <select class="form-control param-source">
                <option value="static" selected>Static Value</option>
                <option value="data">From Data Field</option>
                <option value="clipboard">Clipboard</option>
            </select>
            <div class="param-value-group">
                <input type="text" class="form-control param-value" value="${normalized.value ?? ''}" placeholder="Value">
                <div class="param-field-group is-hidden">
                    ${this.renderParamFieldMappingDropdown('')}
                </div>
                <div class="param-clipboard-note is-hidden">Uses clipboard when the step runs.</div>
            </div>
            <button type="button" class="btn-icon param-remove" title="Remove">✕</button>
        `;
        container.appendChild(row);
        this.setupAutoSaveListeners();
    },

    collectSubworkflowParamBindings() {
        const container = document.getElementById('subworkflowParamsTable');
        if (!container) return {};
        const bindings = {};
        container.querySelectorAll('.param-row').forEach(row => {
            const name = row.querySelector('.param-name')?.value?.trim() || '';
            const valueSource = row.querySelector('.param-source')?.value || 'static';
            const value = row.querySelector('.param-value')?.value ?? '';
            const fieldMapping = row.querySelector('.param-field')?.value ?? '';
            if (!name) return;
            if (valueSource === 'data') {
                bindings[name] = { valueSource, fieldMapping };
            } else if (valueSource === 'clipboard') {
                bindings[name] = { valueSource };
            } else {
                bindings[name] = { valueSource: 'static', value };
            }
        });
        return bindings;
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
                <small style="color: #666; font-size: 11px;">Uses this step's control name (if empty, the wait is skipped)</small>
            </div>
        `;
    },

    renderLabelOptions(currentValue) {
        const labels = (this.currentWorkflow?.steps || [])
            .filter(step => step.type === 'label' && step.labelName)
            .map(step => step.labelName);

        const uniqueLabels = Array.from(new Set(labels)).sort();

        if (uniqueLabels.length === 0) {
            return `<option value="">No labels defined</option>`;
        }

        return uniqueLabels.map(label => 
            `<option value="${label}" ${currentValue === label ? 'selected' : ''}>${label}</option>`
        ).join('');
    },

    renderConditionFields(prefix = 'step') {
        const type = this.currentStep?.conditionType || 'ui-visible';
        const controlName = this.currentStep?.conditionControlName || '';
        const value = this.currentStep?.conditionValue || '';
        const fieldMapping = this.currentStep?.conditionFieldMapping || '';

        const requiresControl = type.startsWith('ui-');
        const requiresValue = ['ui-text-equals', 'ui-text-contains', 'ui-value-equals', 'ui-value-contains', 'data-equals', 'data-not-equals', 'data-contains'].includes(type);
        const isDataCondition = type.startsWith('data-');
        const isDataEmpty = ['data-empty', 'data-not-empty'].includes(type);

        return `
            <div class="form-group">
                <label>Condition Type</label>
                <select id="${prefix}ConditionType" class="form-control">
                    <option value="ui-visible" ${type === 'ui-visible' ? 'selected' : ''}>Element is visible</option>
                    <option value="ui-hidden" ${type === 'ui-hidden' ? 'selected' : ''}>Element is hidden</option>
                    <option value="ui-exists" ${type === 'ui-exists' ? 'selected' : ''}>Element exists</option>
                    <option value="ui-not-exists" ${type === 'ui-not-exists' ? 'selected' : ''}>Element does not exist</option>
                    <option value="ui-text-equals" ${type === 'ui-text-equals' ? 'selected' : ''}>Element text equals</option>
                    <option value="ui-text-contains" ${type === 'ui-text-contains' ? 'selected' : ''}>Element text contains</option>
                    <option value="ui-value-equals" ${type === 'ui-value-equals' ? 'selected' : ''}>Element value equals</option>
                    <option value="ui-value-contains" ${type === 'ui-value-contains' ? 'selected' : ''}>Element value contains</option>
                    <option value="data-equals" ${type === 'data-equals' ? 'selected' : ''}>Data field equals</option>
                    <option value="data-not-equals" ${type === 'data-not-equals' ? 'selected' : ''}>Data field not equals</option>
                    <option value="data-contains" ${type === 'data-contains' ? 'selected' : ''}>Data field contains</option>
                    <option value="data-empty" ${type === 'data-empty' ? 'selected' : ''}>Data field is empty</option>
                    <option value="data-not-empty" ${type === 'data-not-empty' ? 'selected' : ''}>Data field is not empty</option>
                </select>
            </div>
            <div class="form-group ${requiresControl ? '' : 'is-hidden'}" id="${prefix}ConditionControlGroup">
                <label>Control Name</label>
                <input type="text" id="${prefix}ConditionControlName" class="form-control" 
                       value="${controlName}"
                       placeholder="e.g., SystemDefinedOptions">
                <button id="${prefix}PickConditionElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                    Select from Inspector Tab
                </button>
            </div>
            <div class="form-group ${isDataCondition ? '' : 'is-hidden'}" id="${prefix}ConditionFieldGroup">
                <label>Data Field</label>
                ${this.renderFieldMappingDropdown(fieldMapping)}
            </div>
            <div class="form-group ${requiresValue && !isDataEmpty ? '' : 'is-hidden'}" id="${prefix}ConditionValueGroup">
                <label>Expected Value</label>
                <input type="text" id="${prefix}ConditionValue" class="form-control" 
                       value="${value}"
                       placeholder="Enter value">
            </div>
        `;
    },

    renderErrorHandlingOptions() {
        const mode = this.currentStep?.onErrorMode || 'default';
        const retryCount = this.currentStep?.onErrorRetryCount ?? '';
        const retryDelay = this.currentStep?.onErrorRetryDelay ?? '';
        const gotoLabel = this.currentStep?.onErrorGotoLabel || '';

        return `
            <div class="form-group">
                <label>Error Handling</label>
                <select id="stepOnErrorMode" class="form-control">
                    <option value="default" ${mode === 'default' ? 'selected' : ''}>Use workflow defaults</option>
                    <option value="fail" ${mode === 'fail' ? 'selected' : ''}>Fail workflow</option>
                    <option value="skip" ${mode === 'skip' ? 'selected' : ''}>Skip step</option>
                    <option value="goto" ${mode === 'goto' ? 'selected' : ''}>Go to label</option>
                    <option value="break-loop" ${mode === 'break-loop' ? 'selected' : ''}>Break loop</option>
                    <option value="continue-loop" ${mode === 'continue-loop' ? 'selected' : ''}>Continue loop</option>
                </select>
                <small style="color: #666; font-size: 11px;">Retries apply before this action if configured.</small>
            </div>
            <div class="form-group">
                <label>Retry Count (override)</label>
                <input type="number" id="stepOnErrorRetryCount" class="form-control"
                       value="${retryCount}"
                       placeholder="Leave empty for workflow default"
                       min="0">
            </div>
            <div class="form-group">
                <label>Retry Delay (ms)</label>
                <input type="number" id="stepOnErrorRetryDelay" class="form-control"
                       value="${retryDelay}"
                       placeholder="Leave empty for workflow default"
                       min="0">
            </div>
            <div class="form-group ${mode !== 'goto' ? 'is-hidden' : ''}" id="stepOnErrorGotoGroup">
                <label>Go To Label</label>
                <select id="stepOnErrorGotoLabel" class="form-control">
                    ${this.renderLabelOptions(gotoLabel)}
                </select>
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
            `;
        } else if (stepType === 'input' || stepType === 'select' || stepType === 'lookupSelect') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const valueSource = this.currentStep?.valueSource || (hasFieldMapping ? 'data' : 'static');
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
                        <option value="static" ${valueSource === 'static' ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${valueSource === 'data' ? 'selected' : ''}>From Data Field</option>
                        <option value="clipboard" ${valueSource === 'clipboard' ? 'selected' : ''}>Clipboard</option>
                    </select>
                </div>
                <div class="form-group ${valueSource !== 'static' ? 'is-hidden' : ''}" id="staticValueGroup">
                    <label>Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Enter value">
                </div>
                <div class="form-group ${valueSource !== 'data' ? 'is-hidden' : ''}" id="dataFieldGroup">
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group ${valueSource !== 'clipboard' ? 'is-hidden' : ''}" id="clipboardValueGroup">
                    <label>Clipboard</label>
                    <small style="color: #666; font-size: 11px;">Uses the current clipboard text when the step runs.</small>
                </div>
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const source = e.target.value;
                    document.getElementById('staticValueGroup').classList.toggle('is-hidden', source !== 'static');
                    document.getElementById('dataFieldGroup').classList.toggle('is-hidden', source !== 'data');
                    document.getElementById('clipboardValueGroup').classList.toggle('is-hidden', source !== 'clipboard');
                });
            }, 0);
        } else if (stepType === 'checkbox') {
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
            const loopMode = this.currentStep?.loopMode || 'data';
            container.innerHTML = `
                <div class="form-group">
                    <label>Loop Name</label>
                    <input type="text" id="stepLoopName" class="form-control" 
                           value="${this.currentStep?.loopName || 'Main Loop'}" 
                           placeholder="e.g., Process Records">
                </div>
                <div class="form-group">
                    <label>Loop Mode</label>
                    <select id="stepLoopMode" class="form-control">
                        <option value="data" ${loopMode === 'data' ? 'selected' : ''}>Data source rows</option>
                        <option value="count" ${loopMode === 'count' ? 'selected' : ''}>Fixed number of times</option>
                        <option value="while" ${loopMode === 'while' ? 'selected' : ''}>While condition is true</option>
                    </select>
                </div>
                <div class="form-group ${loopMode !== 'data' ? 'is-hidden' : ''}">
                    <label>Data Source</label>
                    <select id="stepLoopDataSource" class="form-control">
                        <option value="primary" ${(this.currentStep?.loopDataSource || 'primary') === 'primary' ? 'selected' : ''}>Primary Execution Rows</option>
                        ${(this.sharedDataSources || []).map(source => 
                            `<option value="${source.id}" ${this.currentStep?.loopDataSource === source.id ? 'selected' : ''}>${source.name || source.id}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group ${loopMode !== 'data' ? 'is-hidden' : ''}">
                    <label>Iteration Limit (0 = unlimited)</label>
                    <input type="number" id="stepIterationLimit" class="form-control" 
                           value="${this.currentStep?.iterationLimit || 0}" 
                           min="0"
                           placeholder="0 for all rows">
                    <small style="color: #666; font-size: 11px;">Set a limit for testing, or 0 to process all rows</small>
                </div>
                <div class="form-group ${loopMode !== 'count' ? 'is-hidden' : ''}" id="loopCountGroup">
                    <label>Loop Count</label>
                    <input type="number" id="stepLoopCount" class="form-control" 
                           value="${this.currentStep?.loopCount || 1}" 
                           min="0"
                           placeholder="e.g., 5">
                </div>
                <div class="${loopMode !== 'while' ? 'is-hidden' : ''}" id="loopWhileGroup">
                    <div class="form-group">
                        <label>While Condition</label>
                    </div>
                    ${this.renderConditionFields('loop')}
                    <div class="form-group">
                        <label>Max Iterations (safety)</label>
                        <input type="number" id="stepLoopMaxIterations" class="form-control" 
                               value="${this.currentStep?.loopMaxIterations || 100}" 
                               min="1"
                               placeholder="100">
                        <small style="color: #666; font-size: 11px;">Stops the loop after this many iterations to avoid infinite loops.</small>
                    </div>
                </div>
            `;
            setTimeout(() => {
                document.getElementById('stepLoopMode')?.addEventListener('change', (e) => {
                    const mode = e.target.value;
                    document.getElementById('stepLoopDataSource')?.closest('.form-group')?.classList.toggle('is-hidden', mode !== 'data');
                    document.getElementById('stepIterationLimit')?.closest('.form-group')?.classList.toggle('is-hidden', mode !== 'data');
                    document.getElementById('loopCountGroup')?.classList.toggle('is-hidden', mode !== 'count');
                    document.getElementById('loopWhileGroup')?.classList.toggle('is-hidden', mode !== 'while');
                    this.autoSaveStep();
                });
            }, 0);
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
        } else if (stepType === 'if-start') {
            container.innerHTML = `
                ${this.renderConditionFields('step')}
            `;
        } else if (stepType === 'else') {
            container.innerHTML = `
                <p style="color: #666; font-size: 12px;">Else block: runs when the previous If condition is false.</p>
            `;
        } else if (stepType === 'if-end') {
            container.innerHTML = `
                <p style="color: #666; font-size: 12px;">End of If block.</p>
            `;
        } else if (stepType === 'continue-loop') {
            container.innerHTML = `
                <p style="color: #666; font-size: 12px;">Continue current loop: skip remaining steps in this iteration and move to the next iteration.</p>
            `;
        } else if (stepType === 'break-loop') {
            container.innerHTML = `
                <p style="color: #666; font-size: 12px;">Break current loop: stop iterating and continue after the matching Loop End step.</p>
            `;
        } else if (stepType === 'label') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Label Name</label>
                    <input type="text" id="stepLabelName" class="form-control" 
                           value="${this.currentStep?.labelName || ''}" 
                           placeholder="e.g., retryBlock">
                    <small style="color: #666; font-size: 11px;">Use labels with Go To steps or error handling.</small>
                </div>
            `;
        } else if (stepType === 'goto') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Go To Label</label>
                    <select id="stepGotoLabel" class="form-control">
                        ${this.renderLabelOptions(this.currentStep?.gotoLabel || '')}
                    </select>
                </div>
            `;
        } else if (stepType === 'subworkflow') {
            const currentId = this.currentWorkflow?.id;
            const eligible = (this.workflows || []).filter(w => w.id !== currentId && !this.workflowHasLoops(w));
            const selectedId = this.currentStep?.subworkflowId || (eligible[0]?.id || '');
            const options = eligible.length
                ? eligible.map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${w.name || 'Untitled Workflow'}</option>`).join('')
                : '<option value="">No eligible workflows</option>';

            container.innerHTML = `
                <div class="form-group">
                    <label>Subworkflow</label>
                    <select id="stepSubworkflowId" class="form-control" ${eligible.length ? '' : 'disabled'}>
                        ${options}
                    </select>
                    <small style="color: #666; font-size: 11px;">Workflows with loops cannot be used as subworkflows.</small>
                </div>
                <div class="form-group">
                    <label>Parameters</label>
                    <div class="param-table" id="subworkflowParamsTable">
                        ${this.renderSubworkflowParamRows(this.currentStep?.paramBindings)}
                    </div>
                    <button type="button" id="addSubworkflowParam" class="btn btn-secondary btn-sm">Add parameter</button>
                    <small style="color: #666; font-size: 11px;">Use \${ParameterName} inside subworkflow fields. Parameter names are case-insensitive.</small>
                </div>
            `;

            setTimeout(() => {
                document.getElementById('addSubworkflowParam')?.addEventListener('click', () => {
                    this.addSubworkflowParamRow();
                });

                const table = document.getElementById('subworkflowParamsTable');
                table?.addEventListener('click', (e) => {
                    if (e.target?.classList?.contains('param-remove')) {
                        e.target.closest('.param-row')?.remove();
                        this.autoSaveStep();
                    }
                });

                table?.addEventListener('change', (e) => {
                    if (e.target?.classList?.contains('param-source')) {
                        const row = e.target.closest('.param-row');
                        if (!row) return;
                        const source = e.target.value;
                        row.querySelector('.param-value')?.classList.toggle('is-hidden', source !== 'static');
                        row.querySelector('.param-field-group')?.classList.toggle('is-hidden', source !== 'data');
                        row.querySelector('.param-clipboard-note')?.classList.toggle('is-hidden', source !== 'clipboard');
                        this.autoSaveStep();
                    }
                });

                document.getElementById('stepSubworkflowId')?.addEventListener('change', (e) => {
                    const newId = e.target.value;
                    const selectedWorkflow = (this.workflows || []).find(w => w.id === newId);
                    if (!selectedWorkflow) return;
                    const required = (this.extractRequiredParamsFromWorkflow?.(selectedWorkflow) || []);
                    const existing = this.collectSubworkflowParamBindings();
                    const normalizedExisting = {};
                    Object.entries(existing).forEach(([key, value]) => {
                        normalizedExisting[(key || '').toLowerCase()] = { name: key, value };
                    });

                    const orderedNames = [];
                    const merged = {};
                    required.forEach(name => {
                        const key = (name || '').toLowerCase();
                        orderedNames.push(name);
                        if (normalizedExisting[key]) {
                            merged[name] = normalizedExisting[key].value;
                        } else {
                            merged[name] = { valueSource: 'static', value: '' };
                        }
                    });

                    Object.entries(existing).forEach(([key, value]) => {
                        const normalized = (key || '').toLowerCase();
                        if (required.map(n => n.toLowerCase()).includes(normalized)) return;
                        orderedNames.push(key);
                        merged[key] = value;
                    });

                    const paramTable = document.getElementById('subworkflowParamsTable');
                    if (paramTable) {
                        paramTable.innerHTML = this.renderSubworkflowParamRows(merged, orderedNames);
                    }
                    this.setupAutoSaveListeners();
                    this.autoSaveStep();
                });
            }, 0);
        } else if (stepType === 'filter') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const valueSource = this.currentStep?.valueSource || (hasFieldMapping ? 'data' : 'static');
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
                        <option value="static" ${valueSource === 'static' ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${valueSource === 'data' ? 'selected' : ''}>From Data Field</option>
                        <option value="clipboard" ${valueSource === 'clipboard' ? 'selected' : ''}>Clipboard</option>
                    </select>
                </div>
                <div class="form-group ${valueSource !== 'static' ? 'is-hidden' : ''}" id="staticValueGroup">
                    <label>Filter Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Value to filter by">
                </div>
                <div class="form-group ${valueSource !== 'data' ? 'is-hidden' : ''}" id="dataFieldGroup">
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group ${valueSource !== 'clipboard' ? 'is-hidden' : ''}" id="clipboardValueGroup">
                    <label>Clipboard</label>
                    <small style="color: #666; font-size: 11px;">Uses the current clipboard text when the step runs.</small>
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
                    const source = e.target.value;
                    document.getElementById('staticValueGroup').classList.toggle('is-hidden', source !== 'static');
                    document.getElementById('dataFieldGroup').classList.toggle('is-hidden', source !== 'data');
                    document.getElementById('clipboardValueGroup').classList.toggle('is-hidden', source !== 'clipboard');
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
                <div class="form-group ${this.currentStep?.waitCondition === 'has-value' ? '' : 'is-hidden'}" id="waitValueGroup">
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
                    document.getElementById('waitValueGroup').classList.toggle('is-hidden', !showValue);
                    this.autoSaveStep();
                });
            }, 0);
        } else if (stepType === 'navigate') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Navigation Method</label>
                    <select id="stepNavigateMethod" class="form-control">
                        <option value="menuItem" ${(this.currentStep?.navigateMethod || 'menuItem') === 'menuItem' ? 'selected' : ''}>Menu Item Name (URL parameter)</option>
                        <option value="url" ${this.currentStep?.navigateMethod === 'url' ? 'selected' : ''}>Full URL</option>
                        <option value="hostRelative" ${this.currentStep?.navigateMethod === 'hostRelative' ? 'selected' : ''}>Current Host + Path</option>
                    </select>
                </div>
                <div class="form-group ${this.currentStep?.navigateMethod === 'url' || this.currentStep?.navigateMethod === 'hostRelative' ? 'is-hidden' : ''}" id="menuItemGroup">
                    <label>Menu Item Name</label>
                    <input type="text" id="stepMenuItemName" class="form-control" 
                           value="${this.currentStep?.menuItemName || ''}" 
                           placeholder="e.g., MarkupTable_Cust, CustParameters, SalesTableListPage">
                    <small style="color: #666; font-size: 11px;">The D365 menu item name (mi parameter in URL). Found in task recordings as MenuItemName.</small>
                </div>
                <div class="form-group ${this.currentStep?.navigateMethod === 'url' || this.currentStep?.navigateMethod === 'hostRelative' ? 'is-hidden' : ''}" id="menuItemTypeGroup">
                    <label>Menu Item Type</label>
                    <select id="stepMenuItemType" class="form-control">
                        <option value="Display" ${(this.currentStep?.menuItemType || 'Display') === 'Display' ? 'selected' : ''}>Display (default)</option>
                        <option value="Action" ${this.currentStep?.menuItemType === 'Action' ? 'selected' : ''}>Action</option>
                        <option value="Output" ${this.currentStep?.menuItemType === 'Output' ? 'selected' : ''}>Output</option>
                    </select>
                    <small style="color: #666; font-size: 11px;">Use Action:MenuItemName or Output:MenuItemName for non-Display menu items.</small>
                </div>
                <div class="form-group ${this.currentStep?.navigateMethod !== 'url' ? 'is-hidden' : ''}" id="urlGroup">
                    <label>URL Path</label>
                    <input type="text" id="stepNavigateUrl" class="form-control" 
                           value="${this.currentStep?.navigateUrl || ''}" 
                           placeholder="e.g., ?mi=MarkupTable_Cust&q=...">
                    <small style="color: #666; font-size: 11px;">Relative URL path with query parameters</small>
                </div>
                <div class="form-group ${this.currentStep?.navigateMethod !== 'hostRelative' ? 'is-hidden' : ''}" id="hostRelativeGroup">
                    <label>Path After Current Host</label>
                    <input type="text" id="stepHostRelativePath" class="form-control" 
                           value="${this.currentStep?.hostRelativePath || ''}" 
                           placeholder="e.g., /data/CustomersV3?$filter=CustomerAccount eq '\${CustAccount}'">
                    <small style="color: #666; font-size: 11px;">Uses current page host dynamically, then appends this path/query.</small>
                </div>
                <div class="form-group">
                    <label>Wait for Form Load (ms)</label>
                    <input type="number" id="stepWaitForLoad" class="form-control" 
                           value="${this.currentStep?.waitForLoad || 3000}" 
                           min="1000"
                           placeholder="3000">
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="stepOpenInNewTab" ${this.currentStep?.openInNewTab ? 'checked' : ''}>
                        Open in new tab
                    </label>
                    <small style="color: #666; font-size: 11px;">Opens the target page in a new tab and continues on the current tab.</small>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Open Charges codes form">
                </div>
            `;

            setTimeout(() => {
                document.getElementById('stepNavigateMethod')?.addEventListener('change', (e) => {
                    const method = e.target.value;
                    const isUrl = method === 'url';
                    const isHostRelative = method === 'hostRelative';
                    document.getElementById('menuItemGroup').classList.toggle('is-hidden', isUrl || isHostRelative);
                    document.getElementById('menuItemTypeGroup').classList.toggle('is-hidden', isUrl || isHostRelative);
                    document.getElementById('urlGroup').classList.toggle('is-hidden', !isUrl);
                    document.getElementById('hostRelativeGroup').classList.toggle('is-hidden', !isHostRelative);
                    this.autoSaveStep();
                });
            }, 0);
        } else if (stepType === 'tab-navigate') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Tab Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., TabUpdates, TabGeneral, TabLedger">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">Select a tab (PivotItem) from the Inspector. In task recordings, look for ActivateTab command.</small>
                </div>
                <div class="form-group">
                    <label>Tab Label (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Updates, General, Ledger and sales tax">
                </div>
            `;
        } else if (stepType === 'action-pane-tab') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Action Pane Tab Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., SystemDefinedOptions, EDI">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">Select an Action Pane tab (AppBarTab). Use the Inspector to capture data-dyn-controlname.</small>
                </div>
                <div class="form-group">
                    <label>Tab Label (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Options, EDI, Sell">
                </div>
            `;
        } else if (stepType === 'expand-section') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Section Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="e.g., Query, UpdatePackingListFastTab">
                    <button id="pickElement" class="btn btn-secondary btn-block" style="margin-top: 8px;">
                        Select from Inspector Tab
                    </button>
                    <small style="color: #666; font-size: 11px;">Section/FastTab control name. In task recordings, look for ExpandedChanged command.</small>
                </div>
                <div class="form-group">
                    <label>Action</label>
                    <select id="stepExpandAction" class="form-control">
                        <option value="expand" ${(this.currentStep?.expandAction || 'expand') === 'expand' ? 'selected' : ''}>Expand</option>
                        <option value="collapse" ${this.currentStep?.expandAction === 'collapse' ? 'selected' : ''}>Collapse</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Section Label (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Records to include, Picking list">
                </div>
            `;
        } else if (stepType === 'close-dialog') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Form Name</label>
                    <select id="stepFormName" class="form-control">
                        <option value="SysOperationTemplateForm" ${(this.currentStep?.formName || 'SysOperationTemplateForm') === 'SysOperationTemplateForm' ? 'selected' : ''}>SysOperationTemplateForm (Batch Job Dialog)</option>
                        <option value="SysRecurrence" ${this.currentStep?.formName === 'SysRecurrence' ? 'selected' : ''}>SysRecurrence (Recurrence Dialog)</option>
                        <option value="SysQueryForm" ${this.currentStep?.formName === 'SysQueryForm' ? 'selected' : ''}>SysQueryForm (Filter Dialog)</option>
                    </select>
                    <small style="color: #666; font-size: 11px;">The dialog form to close</small>
                </div>
                <div class="form-group">
                    <label>Or Custom Control Name</label>
                    <input type="text" id="stepControlName" class="form-control" 
                           value="${this.currentStep?.controlName || ''}" 
                           placeholder="Leave empty to use form name above">
                    <small style="color: #666; font-size: 11px;">For dialogs not in the list above</small>
                </div>
                <div class="form-group">
                    <label>Action</label>
                    <select id="stepCloseAction" class="form-control">
                        <option value="ok" ${(this.currentStep?.closeAction || 'ok') === 'ok' ? 'selected' : ''}>Click OK</option>
                        <option value="cancel" ${this.currentStep?.closeAction === 'cancel' ? 'selected' : ''}>Click Cancel</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Submit batch job">
                </div>
            `;
        } else if (stepType === 'query-filter') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const valueSource = this.currentStep?.valueSource || (hasFieldMapping ? 'data' : 'static');
            container.innerHTML = `
                <div class="form-group">
                    <label>Table Name (RangeTable)</label>
                    <input type="text" id="stepTableName" class="form-control" 
                           value="${this.currentStep?.tableName || ''}" 
                           placeholder="e.g., SalesTable, Customers">
                    <small style="color: #666; font-size: 11px;">The table in the query filter grid (shown in Table column)</small>
                </div>
                <div class="form-group">
                    <label>Field Name (RangeField)</label>
                    <input type="text" id="stepFieldName" class="form-control" 
                           value="${this.currentStep?.fieldName || ''}" 
                           placeholder="e.g., Sales order, Customer account">
                    <small style="color: #666; font-size: 11px;">The field label shown in the Field column of the filter grid</small>
                </div>
                <div class="form-group">
                    <label>Value Source</label>
                    <select id="stepValueSource" class="form-control">
                        <option value="static" ${valueSource === 'static' ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${valueSource === 'data' ? 'selected' : ''}>From Data Field</option>
                        <option value="clipboard" ${valueSource === 'clipboard' ? 'selected' : ''}>Clipboard</option>
                    </select>
                </div>
                <div class="form-group ${valueSource !== 'static' ? 'is-hidden' : ''}" id="staticValueGroup">
                    <label>Criteria Value (RangeValue)</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="e.g., S*, 12345, US-001">
                    <small style="color: #666; font-size: 11px;">The value for the Criteria column. Use wildcards like S* for pattern matching.</small>
                </div>
                <div class="form-group ${valueSource !== 'data' ? 'is-hidden' : ''}" id="dataFieldGroup">
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group ${valueSource !== 'clipboard' ? 'is-hidden' : ''}" id="clipboardValueGroup">
                    <label>Clipboard</label>
                    <small style="color: #666; font-size: 11px;">Uses the current clipboard text when the step runs.</small>
                </div>
                <div class="form-group">
                    <label>Saved Query (optional)</label>
                    <input type="text" id="stepSavedQuery" class="form-control" 
                           value="${this.currentStep?.savedQuery || ''}" 
                           placeholder="Select from SavedQueriesBox dropdown">
                    <small style="color: #666; font-size: 11px;">If specified, selects a pre-saved query before adding filters</small>
                </div>
                <div class="form-group">
                    <label>Close Dialog After</label>
                    <select id="stepCloseDialogAfter" class="form-control">
                        <option value="" ${!this.currentStep?.closeDialogAfter ? 'selected' : ''}>Keep Open (manual close)</option>
                        <option value="ok" ${this.currentStep?.closeDialogAfter === 'ok' ? 'selected' : ''}>Click OK</option>
                        <option value="cancel" ${this.currentStep?.closeDialogAfter === 'cancel' ? 'selected' : ''}>Click Cancel</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Filter by Sales order">
                </div>
            `;

            setTimeout(() => {
                document.getElementById('stepValueSource')?.addEventListener('change', (e) => {
                    const source = e.target.value;
                    document.getElementById('staticValueGroup').classList.toggle('is-hidden', source !== 'static');
                    document.getElementById('dataFieldGroup').classList.toggle('is-hidden', source !== 'data');
                    document.getElementById('clipboardValueGroup').classList.toggle('is-hidden', source !== 'clipboard');
                });
            }, 0);
        } else if (stepType === 'batch-processing') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Batch Processing</label>
                    <select id="stepBatchEnabled" class="form-control">
                        <option value="true" ${this.currentStep?.batchEnabled === 'true' ? 'selected' : ''}>Enable (Yes)</option>
                        <option value="false" ${(this.currentStep?.batchEnabled || 'false') === 'false' ? 'selected' : ''}>Disable (No)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Task Description (Fld2_1)</label>
                    <input type="text" id="stepTaskDescription" class="form-control" 
                           value="${this.currentStep?.taskDescription || ''}" 
                           placeholder="e.g., Customer account statement">
                </div>
                <div class="form-group">
                    <label>Batch Group (Fld3_1)</label>
                    <input type="text" id="stepBatchGroup" class="form-control" 
                           value="${this.currentStep?.batchGroup || ''}" 
                           placeholder="Leave empty for default">
                </div>
                <div class="form-group">
                    <label>Private (Fld4_1)</label>
                    <select id="stepPrivateJob" class="form-control">
                        <option value="false" ${(this.currentStep?.privateJob || 'false') === 'false' ? 'selected' : ''}>No</option>
                        <option value="true" ${this.currentStep?.privateJob === 'true' ? 'selected' : ''}>Yes</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Critical Job (Fld5_1)</label>
                    <select id="stepCriticalJob" class="form-control">
                        <option value="false" ${(this.currentStep?.criticalJob || 'false') === 'false' ? 'selected' : ''}>No</option>
                        <option value="true" ${this.currentStep?.criticalJob === 'true' ? 'selected' : ''}>Yes</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Monitoring Category (Fld6_1)</label>
                    <input type="text" id="stepMonitoringCategory" class="form-control" 
                           value="${this.currentStep?.monitoringCategory || ''}" 
                           placeholder="Leave empty for default">
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Enable batch processing">
                </div>
            `;
        } else if (stepType === 'recurrence') {
            container.innerHTML = `
                <div class="form-group">
                    <label>Recurrence Pattern</label>
                    <select id="stepPatternUnit" class="form-control">
                        <option value="0" ${(this.currentStep?.patternUnit || '0') === '0' ? 'selected' : ''}>Minutes</option>
                        <option value="1" ${this.currentStep?.patternUnit === '1' ? 'selected' : ''}>Hours</option>
                        <option value="2" ${this.currentStep?.patternUnit === '2' ? 'selected' : ''}>Days</option>
                        <option value="3" ${this.currentStep?.patternUnit === '3' ? 'selected' : ''}>Weeks</option>
                        <option value="4" ${this.currentStep?.patternUnit === '4' ? 'selected' : ''}>Months</option>
                        <option value="5" ${this.currentStep?.patternUnit === '5' ? 'selected' : ''}>Years</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Count (Repeat Interval)</label>
                    <input type="number" id="stepPatternCount" class="form-control" 
                           value="${this.currentStep?.patternCount || 10}" 
                           min="1"
                           placeholder="10">
                    <small style="color: #666; font-size: 11px;">e.g., "10" with "Minutes" = repeat every 10 minutes</small>
                </div>
                <div class="form-group">
                    <label>End Date Option</label>
                    <select id="stepEndDateOption" class="form-control">
                        <option value="noEndDate" ${(this.currentStep?.endDateOption || 'noEndDate') === 'noEndDate' ? 'selected' : ''}>No end date</option>
                        <option value="endAfter" ${this.currentStep?.endDateOption === 'endAfter' ? 'selected' : ''}>End after N occurrences</option>
                        <option value="endBy" ${this.currentStep?.endDateOption === 'endBy' ? 'selected' : ''}>End by date</option>
                    </select>
                </div>
                <div class="form-group ${this.currentStep?.endDateOption !== 'endAfter' ? 'is-hidden' : ''}" id="endAfterGroup">
                    <label>End After (occurrences)</label>
                    <input type="number" id="stepEndAfterCount" class="form-control" 
                           value="${this.currentStep?.endAfterCount || 1}" 
                           min="1">
                </div>
                <div class="form-group ${this.currentStep?.endDateOption !== 'endBy' ? 'is-hidden' : ''}" id="endByGroup">
                    <label>End By Date (EndDateDate)</label>
                    <input type="date" id="stepEndByDate" class="form-control" 
                           value="${this.currentStep?.endByDate || ''}">
                </div>
                <div class="form-group">
                    <label>Start Date (StartDate - defaults to today)</label>
                    <input type="date" id="stepStartDate" class="form-control" 
                           value="${this.currentStep?.startDate || ''}">
                </div>
                <div class="form-group">
                    <label>Start Time (StartTime - defaults to current time)</label>
                    <input type="time" id="stepStartTime" class="form-control" 
                           value="${this.currentStep?.startTime || ''}">
                </div>
                <div class="form-group">
                    <label>Timezone (optional)</label>
                    <input type="text" id="stepTimezone" class="form-control" 
                           value="${this.currentStep?.timezone || ''}" 
                           placeholder="e.g., (GMT+01:00) Amsterdam, Berlin...">
                </div>
                <div class="form-group">
                    <label>Close Dialog After Config</label>
                    <select id="stepCloseDialogAfter" class="form-control">
                        <option value="" ${!this.currentStep?.closeDialogAfter ? 'selected' : ''}>Keep Open (manual close)</option>
                        <option value="ok" ${this.currentStep?.closeDialogAfter === 'ok' ? 'selected' : ''}>Click OK</option>
                        <option value="cancel" ${this.currentStep?.closeDialogAfter === 'cancel' ? 'selected' : ''}>Click Cancel</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Run every 4 hours">
                </div>
            `;

            setTimeout(() => {
                document.getElementById('stepEndDateOption')?.addEventListener('change', (e) => {
                    document.getElementById('endAfterGroup').classList.toggle('is-hidden', e.target.value !== 'endAfter');
                    document.getElementById('endByGroup').classList.toggle('is-hidden', e.target.value !== 'endBy');
                });
            }, 0);
        } else if (stepType === 'grid-input') {
            const hasFieldMapping = this.currentStep?.fieldMapping && this.currentStep.fieldMapping !== '';
            const valueSource = this.currentStep?.valueSource || (hasFieldMapping ? 'data' : 'static');
            const waitForValidation = this.currentStep?.waitForValidation ? 'checked' : '';
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
                        <option value="static" ${valueSource === 'static' ? 'selected' : ''}>Static Value</option>
                        <option value="data" ${valueSource === 'data' ? 'selected' : ''}>From Data Field</option>
                        <option value="clipboard" ${valueSource === 'clipboard' ? 'selected' : ''}>Clipboard</option>
                    </select>
                </div>
                <div class="form-group ${valueSource !== 'static' ? 'is-hidden' : ''}" id="staticValueGroup">
                    <label>Value</label>
                    <input type="text" id="stepValue" class="form-control" 
                           value="${this.currentStep?.value || ''}" 
                           placeholder="Enter value (e.g., item number, quantity)">
                </div>
                <div class="form-group ${valueSource !== 'data' ? 'is-hidden' : ''}" id="dataFieldGroup">
                    <label>Data Field</label>
                    ${this.renderFieldMappingDropdown(this.currentStep?.fieldMapping || '')}
                </div>
                <div class="form-group ${valueSource !== 'clipboard' ? 'is-hidden' : ''}" id="clipboardValueGroup">
                    <label>Clipboard</label>
                    <small style="color: #666; font-size: 11px;">Uses the current clipboard text when the step runs.</small>
                </div>
                <div class="form-group">
                    <label>Display Text (for reference)</label>
                    <input type="text" id="stepDisplayText" class="form-control" 
                           value="${this.currentStep?.displayText || ''}" 
                           placeholder="e.g., Item number">
                </div>
                <div class="form-group">
                    <label>Validation Options</label>
                    <div class="wait-options">
                        <label class="wait-option">
                            <input type="checkbox" id="stepWaitForValidation" ${waitForValidation}>
                            Wait for D365 to validate (recommended for Item number)
                        </label>
                    </div>
                    <small style="color: #666; font-size: 11px;">Waits up to 5 seconds for D365 to process lookup fields like Item number</small>
                </div>
            `;

            // Add event listener for value source change
            setTimeout(() => {
                document.getElementById('stepValueSource').addEventListener('change', (e) => {
                    const source = e.target.value;
                    document.getElementById('staticValueGroup').classList.toggle('is-hidden', source !== 'static');
                    document.getElementById('dataFieldGroup').classList.toggle('is-hidden', source !== 'data');
                    document.getElementById('clipboardValueGroup').classList.toggle('is-hidden', source !== 'clipboard');
                });
            }, 0);
        }

        const waitOptions = this.renderWaitOptions();
        container.insertAdjacentHTML('beforeend', waitOptions);

        const errorHandlingTypes = ['click', 'input', 'select', 'lookupSelect', 'checkbox', 'wait', 'navigate', 'tab-navigate', 'action-pane-tab', 'expand-section', 'close-dialog', 'query-filter', 'batch-processing', 'recurrence', 'wait-until', 'grid-input', 'filter'];
        if (errorHandlingTypes.includes(stepType)) {
            const errorOptions = this.renderErrorHandlingOptions();
            container.insertAdjacentHTML('beforeend', errorOptions);
        }

        // Add pick element listener
        setTimeout(() => {
            const pickBtn = document.getElementById('pickElement');
            if (pickBtn) {
                pickBtn.addEventListener('click', () => {
                    this.pickTarget = 'control';
                    this.switchToInspector();
                });
            }

            const conditionPickBtn = document.getElementById('stepPickConditionElement') || document.getElementById('loopPickConditionElement');
            if (conditionPickBtn) {
                conditionPickBtn.addEventListener('click', () => {
                    this.pickTarget = 'condition';
                    this.switchToInspector();
                });
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
                    const source = select.value;
                    const staticGroup = document.getElementById('staticValueGroup');
                    const dataGroup = document.getElementById('dataFieldGroup');
                    const clipboardGroup = document.getElementById('clipboardValueGroup');
                    if (staticGroup) staticGroup.classList.toggle('is-hidden', source !== 'static');
                    if (dataGroup) dataGroup.classList.toggle('is-hidden', source !== 'data');
                    if (clipboardGroup) clipboardGroup.classList.toggle('is-hidden', source !== 'clipboard');
                }
                if (select.id.endsWith('ConditionType')) {
                    const type = select.value;
                    const prefix = select.id.replace('ConditionType', '');
                    const controlGroup = document.getElementById(`${prefix}ConditionControlGroup`);
                    const fieldGroup = document.getElementById(`${prefix}ConditionFieldGroup`);
                    const valueGroup = document.getElementById(`${prefix}ConditionValueGroup`);

                    const requiresControl = type.startsWith('ui-');
                    const requiresValue = ['ui-text-equals', 'ui-text-contains', 'ui-value-equals', 'ui-value-contains', 'data-equals', 'data-not-equals', 'data-contains'].includes(type);
                    const isDataCondition = type.startsWith('data-');
                    const isDataEmpty = ['data-empty', 'data-not-empty'].includes(type);

                    if (controlGroup) controlGroup.classList.toggle('is-hidden', !requiresControl);
                    if (fieldGroup) fieldGroup.classList.toggle('is-hidden', !isDataCondition);
                    if (valueGroup) valueGroup.classList.toggle('is-hidden', !requiresValue || isDataEmpty);
                }
                if (select.id === 'stepOnErrorMode') {
                    const gotoGroup = document.getElementById('stepOnErrorGotoGroup');
                    if (gotoGroup) gotoGroup.classList.toggle('is-hidden', select.value !== 'goto');
                }
                if (select.id === 'stepMappingProjectFilter' || select.id === 'stepMappingSource' || select.id === 'stepMappingField') {
                    this.syncStepFieldMappingSelection();
                }
                this.autoSaveStep();
            });
        });

        this.syncStepFieldMappingSelection();
    },

    renderFieldMappingDropdown(currentValue) {
        const grouped = this.getSharedFieldGroups ? this.getSharedFieldGroups() : [];
        const allFields = grouped.flatMap(group => group.fields);

        if (allFields.length === 0) {
            return `
                <div class="field-mapping-select">
                    <input type="text" id="stepFieldMapping" class="form-control" 
                           value="${currentValue}" 
                           placeholder="e.g., shared_123:LanguageId">
                    <p class="no-fields">No shared data source available. Add one in the Data Sources tab.</p>
                </div>
            `;
        }

        const [initialSource = '', ...fieldParts] = String(currentValue || '').split(':');
        const initialField = fieldParts.join(':');
        const projectOptions = this.getFieldMappingProjectOptions();
        const sourceOptions = this.getFilteredSharedSourcesForFieldMapping('all', initialSource);
        const selectedSource = sourceOptions.some(source => source.id === initialSource)
            ? initialSource
            : (sourceOptions[0]?.id || '');
        const selectedSourceObj = sourceOptions.find(source => source.id === selectedSource) || null;
        const fields = Array.isArray(selectedSourceObj?.fields) ? selectedSourceObj.fields : [];
        const selectedField = fields.includes(initialField) ? initialField : (fields[0] || '');
        const resolvedMapping = (selectedSource && selectedField) ? `${selectedSource}:${selectedField}` : '';

        return `
            <div class="field-mapping-select">
                <div class="field-mapping-select-grid">
                    <div class="field-mapping-col">
                        <label>Project Filter</label>
                        <select id="stepMappingProjectFilter" class="form-control">
                            ${projectOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-mapping-col">
                        <label>Data Source</label>
                        <select id="stepMappingSource" class="form-control">
                            ${sourceOptions.map(source => `<option value="${source.id}" ${source.id === selectedSource ? 'selected' : ''}>${this.escapeHtml(source.name || source.id)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-mapping-col">
                        <label>Field</label>
                        <select id="stepMappingField" class="form-control">
                            <option value="">-- Select Field --</option>
                            ${fields.map(field => `<option value="${field}" ${field === selectedField ? 'selected' : ''}>${this.escapeHtml(field)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <input type="hidden" id="stepFieldMapping" value="${this.escapeHtml(resolvedMapping)}">
            </div>
        `;
    },

    getFieldMappingProjectOptions() {
        const projects = (this.projects || [])
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(project => ({ value: project.id, label: project.name || project.id }));
        return [
            { value: 'all', label: 'All projects' },
            { value: 'unassigned', label: 'Unassigned data sources' },
            ...projects
        ];
    },

    getFilteredSharedSourcesForFieldMapping(projectFilter = 'all', ensureSourceId = '') {
        const selectedFilter = projectFilter || 'all';
        const allSources = (this.sharedDataSources || []).filter(source => Array.isArray(source.fields) && source.fields.length > 0);
        let filtered = allSources;

        if (selectedFilter === 'unassigned') {
            filtered = allSources.filter(source => !(source.projectIds || []).length);
        } else if (selectedFilter !== 'all') {
            filtered = allSources.filter(source => (source.projectIds || []).includes(selectedFilter));
        }

        if (ensureSourceId && !filtered.some(source => source.id === ensureSourceId)) {
            const ensured = allSources.find(source => source.id === ensureSourceId);
            if (ensured) filtered = [ensured, ...filtered];
        }

        return filtered;
    },

    syncStepFieldMappingSelection() {
        const mappingInput = document.getElementById('stepFieldMapping');
        const projectSelect = document.getElementById('stepMappingProjectFilter');
        const sourceSelect = document.getElementById('stepMappingSource');
        const fieldSelect = document.getElementById('stepMappingField');

        if (!mappingInput || !projectSelect || !sourceSelect || !fieldSelect) return;

        const existingMapping = mappingInput.value || '';
        const [existingSourceId = '', ...existingFieldParts] = existingMapping.split(':');
        const existingField = existingFieldParts.join(':');

        const sourcePool = this.getFilteredSharedSourcesForFieldMapping(projectSelect.value || 'all', sourceSelect.value || existingSourceId);
        const currentSourceId = sourceSelect.value || existingSourceId;

        sourceSelect.innerHTML = sourcePool.length
            ? sourcePool.map(source => `<option value="${source.id}" ${source.id === currentSourceId ? 'selected' : ''}>${this.escapeHtml(source.name || source.id)}</option>`).join('')
            : '<option value="">No data sources found</option>';

        const resolvedSourceId = sourceSelect.value || '';
        const sourceObj = sourcePool.find(source => source.id === resolvedSourceId) || null;
        const fields = Array.isArray(sourceObj?.fields) ? sourceObj.fields : [];
        const currentField = fieldSelect.value || existingField;

        fieldSelect.innerHTML = '<option value="">-- Select Field --</option>'
            + fields.map(field => `<option value="${field}" ${field === currentField ? 'selected' : ''}>${this.escapeHtml(field)}</option>`).join('');

        const resolvedField = fieldSelect.value || '';
        mappingInput.value = (resolvedSourceId && resolvedField) ? `${resolvedSourceId}:${resolvedField}` : '';
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    getSharedFieldGroups() {
        return (this.sharedDataSources || [])
            .filter(source => Array.isArray(source.fields) && source.fields.length > 0)
            .map(source => ({
                label: source.name || source.id,
                fields: source.fields.map(field => ({
                    value: `${source.id}:${field}`,
                    label: field
                }))
            }));
    },

    getAllAvailableFields() {
        return this.getSharedFieldGroups()
            .flatMap(group => group.fields)
            .map(field => field.value);
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
        await this.chrome.storage.local.set({ 
            waitingForPick: true,
            currentStepData: this.currentStep,
            currentWorkflowData: this.currentWorkflow
        });

        await this.chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });

        // Note: Window stays open in standalone mode, no need to close
    },

    async handleElementPicked(element) {
        console.log('Handling picked element:', element);

        if (this.currentStep) {
            const pickTarget = this.pickTarget || 'control';
            if (pickTarget === 'condition') {
                this.currentStep.conditionControlName = element.controlName;
            } else {
                this.currentStep.controlName = element.controlName;
                this.currentStep.displayText = element.displayText;
                this.currentStep.role = element.role;
            }

            if (element.fieldType) {
                this.currentStep.fieldType = element.fieldType;
            }

            // Update UI - with retry in case DOM isn't ready
            setTimeout(() => {
                if (pickTarget === 'condition') {
                    const conditionInput = document.getElementById('stepConditionControlName') || document.getElementById('loopConditionControlName');
                    if (conditionInput) {
                        conditionInput.value = element.controlName;
                        console.log('Set condition controlName input:', element.controlName);
                    }
                } else {
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
                }

                // Auto-save after element pick
                this.autoSaveStep();
            }, 50);
        }

        this.pickTarget = null;

        // Clear the waiting flag
        await this.chrome.storage.local.remove(['waitingForPick', 'pickedElement', 'currentStepData', 'currentWorkflowData']);

        // Return to Builder tab after selection for the previous behavior.
        document.querySelector('[data-tab="builder"]')?.click();

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
            this.currentStep.valueSource = valueSource;
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else if (valueSource === 'data') {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            } else {
                this.currentStep.value = '';
                this.currentStep.fieldMapping = '';
            }
        } else if (this.currentStep.type === 'checkbox') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.value = document.getElementById('stepValue')?.value || '';
        } else if (this.currentStep.type === 'wait') {
            this.currentStep.duration = parseInt(document.getElementById('stepDuration')?.value) || 1000;
        } else if (this.currentStep.type === 'loop-start') {
            this.currentStep.loopName = document.getElementById('stepLoopName')?.value || '';
            this.currentStep.loopMode = document.getElementById('stepLoopMode')?.value || 'data';
            this.currentStep.loopDataSource = document.getElementById('stepLoopDataSource')?.value || '';
            this.currentStep.iterationLimit = parseInt(document.getElementById('stepIterationLimit')?.value) || 0;
            this.currentStep.loopCount = parseInt(document.getElementById('stepLoopCount')?.value) || 0;
            this.currentStep.loopMaxIterations = parseInt(document.getElementById('stepLoopMaxIterations')?.value) || 100;
            this.currentStep.conditionType = document.getElementById('loopConditionType')?.value || 'ui-visible';
            this.currentStep.conditionControlName = document.getElementById('loopConditionControlName')?.value || '';
            this.currentStep.conditionValue = document.getElementById('loopConditionValue')?.value || '';
            this.currentStep.conditionFieldMapping = document.getElementById('stepFieldMapping')?.value || '';
        } else if (this.currentStep.type === 'loop-end') {
            this.currentStep.loopRef = document.getElementById('stepLoopRef')?.value || '';
        } else if (this.currentStep.type === 'if-start') {
            this.currentStep.conditionType = document.getElementById('stepConditionType')?.value || 'ui-visible';
            this.currentStep.conditionControlName = document.getElementById('stepConditionControlName')?.value || '';
            this.currentStep.conditionValue = document.getElementById('stepConditionValue')?.value || '';
            this.currentStep.conditionFieldMapping = document.getElementById('stepFieldMapping')?.value || '';
        } else if (this.currentStep.type === 'else') {
            // No fields
        } else if (this.currentStep.type === 'if-end') {
            // No fields
        } else if (this.currentStep.type === 'continue-loop') {
            // No fields
        } else if (this.currentStep.type === 'break-loop') {
            // No fields
        } else if (this.currentStep.type === 'label') {
            this.currentStep.labelName = document.getElementById('stepLabelName')?.value || '';
        } else if (this.currentStep.type === 'goto') {
            this.currentStep.gotoLabel = document.getElementById('stepGotoLabel')?.value || '';
        } else if (this.currentStep.type === 'subworkflow') {
            this.currentStep.subworkflowId = document.getElementById('stepSubworkflowId')?.value || '';
            this.currentStep.paramBindings = this.collectSubworkflowParamBindings();
        } else if (this.currentStep.type === 'filter') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.filterMethod = document.getElementById('stepFilterMethod')?.value || 'is exactly';

            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            this.currentStep.valueSource = valueSource;
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else if (valueSource === 'data') {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            } else {
                this.currentStep.value = '';
                this.currentStep.fieldMapping = '';
            }
        } else if (this.currentStep.type === 'navigate') {
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.navigateMethod = document.getElementById('stepNavigateMethod')?.value || 'menuItem';
            this.currentStep.menuItemName = document.getElementById('stepMenuItemName')?.value || '';
            this.currentStep.menuItemType = document.getElementById('stepMenuItemType')?.value || 'Display';
            this.currentStep.navigateUrl = document.getElementById('stepNavigateUrl')?.value || '';
            this.currentStep.hostRelativePath = document.getElementById('stepHostRelativePath')?.value || '';
            this.currentStep.waitForLoad = parseInt(document.getElementById('stepWaitForLoad')?.value) || 3000;
            this.currentStep.openInNewTab = !!document.getElementById('stepOpenInNewTab')?.checked;
        } else if (this.currentStep.type === 'tab-navigate') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
        } else if (this.currentStep.type === 'action-pane-tab') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
        } else if (this.currentStep.type === 'expand-section') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.expandAction = document.getElementById('stepExpandAction')?.value || 'expand';
        } else if (this.currentStep.type === 'close-dialog') {
            this.currentStep.formName = document.getElementById('stepFormName')?.value || 'SysOperationTemplateForm';
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.closeAction = document.getElementById('stepCloseAction')?.value || 'ok';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
        } else if (this.currentStep.type === 'query-filter') {
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.tableName = document.getElementById('stepTableName')?.value || '';
            this.currentStep.fieldName = document.getElementById('stepFieldName')?.value || '';
            this.currentStep.savedQuery = document.getElementById('stepSavedQuery')?.value || '';
            this.currentStep.closeDialogAfter = document.getElementById('stepCloseDialogAfter')?.value || '';
            
            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            this.currentStep.valueSource = valueSource;
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else if (valueSource === 'data') {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            } else {
                this.currentStep.value = '';
                this.currentStep.fieldMapping = '';
            }
        } else if (this.currentStep.type === 'batch-processing') {
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.batchEnabled = document.getElementById('stepBatchEnabled')?.value || 'false';
            this.currentStep.taskDescription = document.getElementById('stepTaskDescription')?.value || '';
            this.currentStep.batchGroup = document.getElementById('stepBatchGroup')?.value || '';
            this.currentStep.privateJob = document.getElementById('stepPrivateJob')?.value || 'false';
            this.currentStep.criticalJob = document.getElementById('stepCriticalJob')?.value || 'false';
            this.currentStep.monitoringCategory = document.getElementById('stepMonitoringCategory')?.value || '';
        } else if (this.currentStep.type === 'recurrence') {
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.patternUnit = document.getElementById('stepPatternUnit')?.value || '0';
            this.currentStep.patternCount = parseInt(document.getElementById('stepPatternCount')?.value) || 10;
            this.currentStep.endDateOption = document.getElementById('stepEndDateOption')?.value || 'noEndDate';
            this.currentStep.endAfterCount = parseInt(document.getElementById('stepEndAfterCount')?.value) || 1;
            this.currentStep.endByDate = document.getElementById('stepEndByDate')?.value || '';
            this.currentStep.startDate = document.getElementById('stepStartDate')?.value || '';
            this.currentStep.startTime = document.getElementById('stepStartTime')?.value || '';
            this.currentStep.timezone = document.getElementById('stepTimezone')?.value || '';
            this.currentStep.closeDialogAfter = document.getElementById('stepCloseDialogAfter')?.value || '';
        } else if (this.currentStep.type === 'wait-until') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.waitCondition = document.getElementById('stepWaitCondition')?.value || 'visible';
            this.currentStep.waitValue = document.getElementById('stepWaitValue')?.value || '';
            this.currentStep.timeout = parseInt(document.getElementById('stepTimeout')?.value) || 10000;
        } else if (this.currentStep.type === 'grid-input') {
            this.currentStep.controlName = document.getElementById('stepControlName')?.value || '';
            this.currentStep.displayText = document.getElementById('stepDisplayText')?.value || '';
            this.currentStep.waitForValidation = document.getElementById('stepWaitForValidation')?.checked || false;

            const valueSource = document.getElementById('stepValueSource')?.value || 'static';
            this.currentStep.valueSource = valueSource;
            if (valueSource === 'static') {
                this.currentStep.value = document.getElementById('stepValue')?.value || '';
                this.currentStep.fieldMapping = '';
            } else if (valueSource === 'data') {
                this.currentStep.fieldMapping = document.getElementById('stepFieldMapping')?.value || '';
                this.currentStep.value = '';
            } else {
                this.currentStep.value = '';
                this.currentStep.fieldMapping = '';
            }
        }

        const waitOptions = this.getWaitOptionsFromUI();
        if (waitOptions.waitUntilVisible || waitOptions.waitUntilHidden) {
            this.currentStep.waitUntilVisible = waitOptions.waitUntilVisible;
            this.currentStep.waitUntilHidden = waitOptions.waitUntilHidden;
        } else {
            delete this.currentStep.waitUntilVisible;
            delete this.currentStep.waitUntilHidden;
        }

        const onErrorMode = document.getElementById('stepOnErrorMode')?.value || '';
        if (onErrorMode) {
            this.currentStep.onErrorMode = onErrorMode;
            const retryCountRaw = document.getElementById('stepOnErrorRetryCount')?.value;
            const retryDelayRaw = document.getElementById('stepOnErrorRetryDelay')?.value;
            if (retryCountRaw !== '') {
                this.currentStep.onErrorRetryCount = parseInt(retryCountRaw);
            } else {
                delete this.currentStep.onErrorRetryCount;
            }
            if (retryDelayRaw !== '') {
                this.currentStep.onErrorRetryDelay = parseInt(retryDelayRaw);
            } else {
                delete this.currentStep.onErrorRetryDelay;
            }
            this.currentStep.onErrorGotoLabel = document.getElementById('stepOnErrorGotoLabel')?.value || '';
        } else {
            delete this.currentStep.onErrorMode;
            delete this.currentStep.onErrorRetryCount;
            delete this.currentStep.onErrorRetryDelay;
            delete this.currentStep.onErrorGotoLabel;
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
            this.ensureStepSelectionState();
            this.selectedStepIds.clear();
            this.updateSelectAllState();
            this.populateCopyTargets();
            this.updateCopyButtonState();
            return;
        }

        this.ensureStepSelectionState();
        const stepIdSet = new Set(this.currentWorkflow.steps.map(step => step.id));
        Array.from(this.selectedStepIds).forEach(id => {
            if (!stepIdSet.has(id)) this.selectedStepIds.delete(id);
        });

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
                const inputVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Enter "${inputVal}" into ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'select') {
                stepIcon = 'SEL';
                const selectVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Select "${selectVal}" in ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'lookupSelect') {
                stepIcon = 'LOOK';
                const lookupVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Lookup "${lookupVal}" in ${step.displayText || step.controlName}${waitFlags}`;
            } else if (step.type === 'checkbox') {
                stepIcon = 'CHK';
                const action = step.value === 'true' ? 'Check' : 'Uncheck';
                stepDesc = `${action} "${step.displayText || step.controlName}"${waitFlags}`;
            } else if (step.type === 'wait') {
                stepIcon = 'WAIT';
                stepDesc = `Wait ${step.duration}ms`;
            } else if (step.type === 'loop-start') {
                stepIcon = 'LOOP';
                const mode = step.loopMode || 'data';
                if (mode === 'count') {
                    stepDesc = `<span class="loop-indicator">LOOP START:</span> ${step.loopName || 'Loop'} (count ${step.loopCount || 0})`;
                } else if (mode === 'while') {
                    stepDesc = `<span class="loop-indicator">LOOP START:</span> ${step.loopName || 'Loop'} (while ${step.conditionType || 'condition'})`;
                } else {
                    const limit = step.iterationLimit > 0 ? ` (max ${step.iterationLimit})` : ' (all rows)';
                    stepDesc = `<span class="loop-indicator">LOOP START:</span> ${step.loopName || 'Loop'}${limit}`;
                }
            } else if (step.type === 'loop-end') {
                stepIcon = 'LOOP';
                const refLoop = this.currentWorkflow.steps.find(s => s.id === step.loopRef);
                stepDesc = `<span class="loop-indicator">LOOP END:</span> ${refLoop?.loopName || 'Loop'}`;
            } else if (step.type === 'if-start') {
                stepIcon = 'IF';
                stepDesc = `IF ${step.conditionType || 'condition'}`;
            } else if (step.type === 'else') {
                stepIcon = 'ELSE';
                stepDesc = 'ELSE';
            } else if (step.type === 'if-end') {
                stepIcon = 'END';
                stepDesc = 'END IF';
            } else if (step.type === 'continue-loop') {
                stepIcon = 'CONT';
                stepDesc = 'CONTINUE LOOP';
            } else if (step.type === 'break-loop') {
                stepIcon = 'BRK';
                stepDesc = 'BREAK LOOP';
            } else if (step.type === 'label') {
                stepIcon = 'LBL';
                stepDesc = `Label: ${step.labelName || 'unnamed'}`;
            } else if (step.type === 'goto') {
                stepIcon = 'GOTO';
                stepDesc = `Go to: ${step.gotoLabel || 'label'}`;
            } else if (step.type === 'subworkflow') {
                stepIcon = 'SUB';
                const sub = (this.workflows || []).find(w => w.id === step.subworkflowId);
                const subName = sub?.name || 'Unknown Workflow';
                const paramCount = Object.keys(step.paramBindings || {}).length;
                const paramLabel = paramCount > 0 ? ` (${paramCount} param${paramCount > 1 ? 's' : ''})` : '';
                stepDesc = `Call subworkflow "${subName}"${paramLabel}`;
            } else if (step.type === 'filter') {
                stepIcon = 'FLT';
                const method = step.filterMethod || 'is exactly';
                const filterVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Filter "${step.displayText || step.controlName}" ${method} "${filterVal}"`;
            } else if (step.type === 'grid-input') {
                stepIcon = 'GRID';
                const gridVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Set grid cell "${step.displayText || step.controlName}" to "${gridVal}"${waitFlags}`;
            } else if (step.type === 'wait-until') {
                stepIcon = 'WAIT';
                const condition = step.waitCondition || 'visible';
                stepDesc = `Wait until "${step.displayText || step.controlName}" ${condition}`;
            } else if (step.type === 'navigate') {
                stepIcon = '🧭';
                const target = step.menuItemName || step.navigateUrl || step.hostRelativePath || 'form';
                stepDesc = `Navigate to "${step.displayText || target}"${step.openInNewTab ? ' (new tab)' : ''}`;
            } else if (step.type === 'tab-navigate') {
                stepIcon = '📑';
                stepDesc = `Switch to tab "${step.displayText || step.controlName}"`;
            } else if (step.type === 'action-pane-tab') {
                stepIcon = 'AP';
                stepDesc = `Switch action pane tab "${step.displayText || step.controlName}"`;
            } else if (step.type === 'expand-section') {
                stepIcon = '📂';
                const action = step.expandAction === 'collapse' ? 'Collapse' : 'Expand';
                stepDesc = `${action} section "${step.displayText || step.controlName}"`;
            } else if (step.type === 'query-filter') {
                stepIcon = '🔎';
                const filterVal = step.valueSource === 'clipboard'
                    ? 'clipboard'
                    : (step.value || this.formatFieldMappingForDisplay(step.fieldMapping));
                stepDesc = `Query filter: ${step.fieldName || 'field'} = "${filterVal}"`;
            } else if (step.type === 'batch-processing') {
                stepIcon = '⚙️';
                const enabled = step.batchEnabled === 'true' ? 'Enable' : 'Disable';
                stepDesc = `${enabled} batch processing`;
            } else if (step.type === 'recurrence') {
                stepIcon = '🔁';
                const units = ['Minutes', 'Hours', 'Days', 'Weeks', 'Months', 'Years'];
                const unit = units[parseInt(step.patternUnit) || 0] || 'Minutes';
                stepDesc = `${step.displayText || `Recurrence: every ${step.patternCount || 10} ${unit.toLowerCase()}`}`;
            } else if (step.type === 'close-dialog') {
                stepIcon = '✓';
                const action = step.closeAction === 'cancel' ? 'Cancel' : 'OK';
                const formName = step.formName || step.controlName || 'dialog';
                stepDesc = `Close ${formName} with ${action}`;
            }

            const isSelected = this.selectedStepIds.has(step.id);
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <input type="checkbox" class="step-select" data-step-id="${step.id}" ${isSelected ? 'checked' : ''}>
                    <span style="cursor: move; color: #999;">::</span>
                    <span>${stepIcon}</span>
                    <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>${index + 1}.</strong> ${stepDesc}
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-edit btn-icon" title="Edit" aria-label="Edit">✏️</button>
                    <button class="btn-delete btn-icon" title="Delete" aria-label="Delete">🗑️</button>
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

            item.querySelector('.step-select').addEventListener('change', (e) => {
                e.stopPropagation();
                if (e.target.checked) {
                    this.selectedStepIds.add(step.id);
                } else {
                    this.selectedStepIds.delete(step.id);
                }
                this.updateSelectAllState();
                this.updateCopyButtonState();
            });

            container.appendChild(item);
        });

        this.updateWorkflowLabelOptions();
        this.updateSelectAllState();
        this.populateCopyTargets();
        this.updateCopyButtonState();
    },

    updateWorkflowLabelOptions() {
        const labelSelect = document.getElementById('workflowErrorDefaultGotoLabel');
        if (labelSelect) {
            const current = labelSelect.value;
            labelSelect.innerHTML = this.renderLabelOptions(current);
            if (current && !Array.from(labelSelect.options).some(opt => opt.value === current)) {
                labelSelect.value = '';
            }
        }

        const stepGotoSelect = document.getElementById('stepGotoLabel');
        if (stepGotoSelect) {
            const current = stepGotoSelect.value;
            stepGotoSelect.innerHTML = this.renderLabelOptions(current);
        }

        const onErrorGotoSelect = document.getElementById('stepOnErrorGotoLabel');
        if (onErrorGotoSelect) {
            const current = onErrorGotoSelect.value;
            onErrorGotoSelect.innerHTML = this.renderLabelOptions(current);
        }
    },

    formatWaitFlags(step) {
        const flags = [];
        if (step.waitUntilVisible) flags.push('wait visible');
        if (step.waitUntilHidden) flags.push('wait hidden');
        if (flags.length === 0) return '';
        return ` <span class="wait-flags">(${flags.join(', ')})</span>`;
    },

    formatFieldMappingForDisplay(fieldMapping) {
        if (!fieldMapping) return '{}';
        const mappingText = String(fieldMapping);
        const separatorIndex = mappingText.indexOf(':');
        if (separatorIndex <= 0) {
            return `{${mappingText}}`;
        }

        const sourceId = mappingText.slice(0, separatorIndex);
        const fieldName = mappingText.slice(separatorIndex + 1);
        const source = (this.sharedDataSources || []).find(item => item.id === sourceId);
        const sourceLabel = source?.name || sourceId;
        return `{${sourceLabel}:${fieldName}}`;
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
