/**
 * Task Recorder XML Import Module
 * Converts D365 F&O Task Recorder XML recordings to extension workflow steps
 */

export const xmlImportMethods = {
    // Cache for resolved labels to avoid duplicate API calls
    _labelCache: {},

    /**
     * Get the D365 base URL from the linked tab
     * @returns {Promise<string|null>} The base URL or null if not available
     */
    async getD365BaseUrl() {
        try {
            const result = await chrome.storage.local.get(['linkedTabUrl']);
            if (result.linkedTabUrl) {
                const url = new URL(result.linkedTabUrl);
                return url.origin;
            }
            return null;
        } catch (error) {
            console.warn('Failed to get D365 base URL:', error);
            return null;
        }
    },

    /**
     * Resolve a D365 label ID (e.g., @SYS129848) to its display value
     * Uses the content script to make the request from the D365 page context
     * @param {string} labelId - The label ID starting with @
     * @param {string} language - Language code (default: en-us)
     * @returns {Promise<string|null>} The resolved label value or null
     */
    async resolveD365Label(labelId, language = 'en-us') {
        // Skip if not a valid label ID
        if (!labelId || !labelId.startsWith('@')) {
            return null;
        }

        // Check cache first
        const cacheKey = `${labelId}_${language}`;
        if (this._labelCache[cacheKey]) {
            return this._labelCache[cacheKey];
        }

        // This will be handled by resolveLabelsInBatch for efficiency
        return null;
    },

    /**
     * Resolve multiple labels via the content script
     * This is more efficient as it makes the request from the D365 page context
     * @param {Array<string>} labelIds - Array of label IDs to resolve
     * @returns {Promise<Object>} Map of labelId -> resolved value
     */
    async resolveLabelsInBatch(labelIds, language = 'en-us') {
        const uniqueLabels = [...new Set(labelIds.filter(id => id && id.startsWith('@')))];
        
        if (uniqueLabels.length === 0) {
            return {};
        }

        // Get the linked tab ID
        const result = await chrome.storage.local.get(['linkedTabId']);
        console.log('[XML Import] Linked tab ID:', result.linkedTabId);
        
        if (!result.linkedTabId) {
            console.warn('[XML Import] No D365 tab linked - cannot resolve labels');
            return {};
        }

        try {
            console.log('[XML Import] Sending label resolution request to content script...');
            
            // Send message to content script to resolve labels
            const langToUse = (this.settings && this.settings.labelLanguage) ? this.settings.labelLanguage : language;
            const response = await chrome.tabs.sendMessage(result.linkedTabId, {
                action: 'resolveD365Labels',
                labelIds: uniqueLabels,
                language: langToUse
            });

            console.log('[XML Import] Response from content script:', response);

            if (response?.success && response.labels) {
                // Cache the results using language-specific keys
                Object.entries(response.labels).forEach(([labelId, value]) => {
                    const cacheKey = `${labelId}_${(this.settings && this.settings.labelLanguage) ? this.settings.labelLanguage : language}`;
                    this._labelCache[cacheKey] = value;
                });
                
                console.log(`[XML Import] Resolved ${Object.keys(response.labels).length} labels:`, response.labels);
                return response.labels;
            } else {
                console.warn('[XML Import] Failed to resolve labels:', response?.error || 'Unknown error');
                return {};
            }
        } catch (error) {
            console.warn('[XML Import] Error communicating with content script:', error);
            return {};
        }
    },
    /**
     * Parse Task Recorder XML and convert to workflow steps
     * @param {string} xmlString - The raw XML content
     * @param {Object} options - Import options
     * @param {boolean} options.resolveLabels - Whether to resolve D365 labels (default: true)
     * @returns {Promise<Object>} - Converted workflow object with steps
     */
    async parseTaskRecorderXML(xmlString, options = {}) {
        const { resolveLabels = true } = options;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML format: ' + parseError.textContent);
        }

        // Extract recording metadata
        const recordingName = this.getXMLText(xmlDoc, 'Name') || 'Imported Recording';
        const description = this.getXMLText(xmlDoc, 'Description') || '';

        // Extract all user actions from the nested structure
        const userActions = this.extractUserActions(xmlDoc);
        
        // Collect all label IDs that need to be resolved
        let resolvedLabels = {};
        if (resolveLabels) {
            const labelIds = userActions
                .filter(a => a.valueLabel && a.valueLabel.startsWith('@'))
                .map(a => a.valueLabel);
            
            if (labelIds.length > 0) {
                console.log(`Resolving ${labelIds.length} D365 labels via OData API...`);
                resolvedLabels = await this.resolveLabelsInBatch(labelIds);
                console.log('Resolved labels:', resolvedLabels);
                
                if (Object.keys(resolvedLabels).length === 0) {
                    console.warn('No labels were resolved - make sure a D365 tab is linked');
                }
            }
        }
        
        // Convert actions to steps, passing resolved labels
        const steps = this.convertActionsToSteps(userActions, resolvedLabels);

        return {
            id: Date.now().toString(),
            name: recordingName,
            description: description,
            steps: steps,
            dataSources: {
                primary: { type: 'none', data: null, fields: [] },
                details: [],
                relationships: []
            },
            settings: {
                delayAfterClick: 800,
                delayAfterInput: 400,
                delayAfterSave: 1000,
                maxRetries: 3,
                logVerbose: false,
                pauseOnError: false,
                suppressLookupWarnings: true,
                comboSelectMode: 'method3'
            },
            importedFrom: 'TaskRecorder',
            importDate: new Date().toISOString()
        };
    },

    /**
     * Get text content of an XML element
     */
    getXMLText(doc, tagName) {
        const element = doc.querySelector(tagName);
        return element?.textContent?.trim() || '';
    },

    /**
     * Extract all user actions from the XML document
     * Task Recorder stores actions in nested Node elements with i:type attribute
     */
    extractUserActions(xmlDoc) {
        const actions = [];
        
        // Find all Node elements that are CommandUserAction or PropertyUserAction
        const allNodes = xmlDoc.querySelectorAll('Node');
        
        allNodes.forEach(node => {
            const nodeType = node.getAttribute('i:type');
            
            if (nodeType === 'CommandUserAction' || nodeType === 'PropertyUserAction') {
                const action = this.parseActionNode(node, nodeType);
                if (action) {
                    actions.push(action);
                }
            }
        });

        // Sort by sequence number to maintain order
        actions.sort((a, b) => a.sequence - b.sequence);
        
        return actions;
    },

    /**
     * Parse a single action node from the XML
     */
    parseActionNode(node, nodeType) {
        const sequence = parseInt(this.getNodeText(node, 'Sequence') || '0');
        const description = this.getNodeText(node, 'Description') || '';
        const controlName = this.getNodeText(node, 'ControlName') || '';
        const controlLabel = this.getNodeText(node, 'ControlLabel') || '';
        const controlType = this.getNodeText(node, 'ControlType') || '';
        const formId = this.getNodeText(node, 'FormId') || '';
        const listContext = this.getNodeText(node, 'ListContext') || '';
        const commandName = this.getNodeText(node, 'CommandName') || '';
        
        // For PropertyUserAction, get the value
        const value = this.getNodeText(node, 'Value') || '';
        const valueLabel = this.getNodeText(node, 'ValueLabel') || ''; // For ComboBox enum labels
        const boundProperty = this.getNodeText(node, 'BoundProperty') || '';
        const boundDataSource = this.getNodeText(node, 'BoundDataSource') || '';
        const propertyName = this.getNodeText(node, 'PropertyName') || '';
        const userActionType = this.getNodeText(node, 'UserActionType') || '';
        // Extract CommandArgument values for CommandUserAction (may contain JSON strings)
        let argumentsArray = [];
        if (nodeType === 'CommandUserAction') {
            try {
                const argNodes = node.querySelectorAll('Arguments > CommandArgument > Value');
                argNodes.forEach(a => {
                    if (a && a.textContent) argumentsArray.push(a.textContent.trim());
                });
            } catch (e) {
                // ignore
            }
        }
        return {
            sequence,
            nodeType,
            description,
            controlName,
            controlLabel,
            controlType,
            formId,
            listContext,
            commandName,
            value,
            valueLabel,
            boundProperty,
            boundDataSource,
            propertyName,
            userActionType,
            arguments: argumentsArray
        };
    },

    /**
     * Get direct child text content
     */
    getNodeText(node, tagName) {
        // Find direct children only to avoid getting nested values
        for (const child of node.children) {
            if (child.tagName === tagName || child.tagName.endsWith(':' + tagName)) {
                // Check if it has nil attribute
                if (child.getAttribute('i:nil') === 'true') {
                    return '';
                }
                return child.textContent?.trim() || '';
            }
        }
        return '';
    },

    /**
     * Convert extracted actions to extension step format
     * @param {Array} actions
     * @param {Object} resolvedLabels - Map of labelId -> resolved value
     */
    convertActionsToSteps(actions, resolvedLabels = {}) {
        const steps = [];
        const processedSequences = new Set();

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            
            // Skip if already processed (e.g., as part of a lookup sequence)
            if (processedSequences.has(action.sequence)) {
                continue;
            }

            // Skip noise actions that don't need conversion
            if (this.shouldSkipAction(action)) {
                processedSequences.add(action.sequence);
                continue;
            }

            // Check if this is part of a filter sequence (GetFilters -> ApplyFiltersForTaskRecorder)
            const filterResult = this.handleFilterSequence(actions, i, processedSequences);
            if (filterResult) {
                steps.push(filterResult.step);
                continue;
            }

            // Check if this is part of a lookup sequence
            const lookupResult = this.handleLookupSequence(actions, i, processedSequences);
            if (lookupResult) {
                steps.push(lookupResult.step);
                continue;
            }

            // Convert to step (pass resolvedLabels for ComboBox value resolution)
            const step = this.convertActionToStep(action, resolvedLabels);
            if (step) {
                steps.push(step);
            }
            processedSequences.add(action.sequence);
        }

        // Post-process: Add waitUntilVisible for grid-inputs after "Add line" clicks
        this.applyPostProcessingRules(steps);

        return steps;
    },

    /**
     * Apply post-processing rules to improve step timing
     */
    applyPostProcessingRules(steps) {
        for (let i = 0; i < steps.length - 1; i++) {
            const current = steps[i];
            const next = steps[i + 1];

            // After "Add line" click, the next grid-input should wait until visible
            // This ensures the new row is created before we try to enter data
            if (current.type === 'click' && 
                (current.controlName?.includes('LineStripNew') || 
                 current.controlName?.includes('AddLine') ||
                 current.displayText?.toLowerCase().includes('add line'))) {
                if (next.type === 'grid-input') {
                    next.waitUntilVisible = true;
                }
            }
        }
    },

    /**
     * Determine if an action should be skipped (noise filtering)
     */
    shouldSkipAction(action) {
        const skipCommands = [
            'MarkActiveRow',      // Grid row selection - automatic
            'TabShown',           // Tab navigation - usually not needed
            'NavigationAction',   // Clicking in lookup grid - value from RequestPopup
        ];

        if (skipCommands.includes(action.commandName)) {
            return true;
        }

        // Skip if it's a grid control action without a specific command
        if (action.controlType === 'Grid' && !action.commandName) {
            return true;
        }

        return false;
    },

    /**
     * Check if action is a lookup selection (RequestPopup)
     * These need special handling since Task Recorder doesn't capture the actual value
     */
    isLookupSelectionAction(action) {
        return action.commandName === 'RequestPopup';
    },

    /**
     * Handle lookup field sequences (RequestPopup -> Lookup interaction -> Selection)
     * If there's a PropertyUserAction with the value, skip RequestPopup
     * If not, RequestPopup will be converted to a placeholder input step
     */
    handleLookupSequence(actions, startIndex, processedSequences) {
        const action = actions[startIndex];
        
        // Check if this is a RequestPopup command (opening a lookup)
        if (action.commandName === 'RequestPopup') {
            // Find the corresponding PropertyUserAction that sets the value
            // This might be before or after the lookup interaction
            
            // Look for a PropertyUserAction with the same control name
            for (let j = startIndex - 5; j < startIndex + 10 && j < actions.length; j++) {
                if (j < 0 || j === startIndex) continue;
                
                const nearbyAction = actions[j];
                if (nearbyAction.nodeType === 'PropertyUserAction' && 
                    nearbyAction.controlName === action.controlName) {
                    // Found the value-setting action, skip this RequestPopup
                    // The PropertyUserAction will handle setting the value
                    processedSequences.add(action.sequence);
                    return null;
                }
            }
            
            // No PropertyUserAction found with value - this is a lookup-only selection
            // Don't skip it - let convertCommandAction create a placeholder step
            return null;
        }

        return null;
    },

    /**
     * Handle FilterManager sequences: GetFilters followed by ApplyFiltersForTaskRecorder
     * Creates a single `filter` step using data from both actions
     */
    handleFilterSequence(actions, startIndex, processedSequences) {
        const action = actions[startIndex];
        if (action.commandName !== 'GetFilters' || action.controlType !== 'FilterManager') {
            return null;
        }

        // Look ahead for ApplyFiltersForTaskRecorder
        for (let j = startIndex + 1; j < Math.min(startIndex + 8, actions.length); j++) {
            const a = actions[j];
            if (a.commandName === 'ApplyFiltersForTaskRecorder' && a.controlType === 'FilterManager') {
                // Parse GetFilters args: [0]=JSON metadata, [1]=gridControlName, [2]=fieldLabel
                const getArgs = action.arguments || [];
                const applyArgs = a.arguments || [];

                const gridControlName = getArgs[1] || '';
                const fieldLabel = getArgs[2] || (applyArgs[4] ? (JSON.parse(applyArgs[4])[0]?.FieldLabel || '') : '');

                // Try to parse filter details from ApplyFiltersForTaskRecorder first argument
                let filterMethod = '';
                let filterValue = '';
                try {
                    if (applyArgs[0]) {
                        const parsed = JSON.parse(applyArgs[0]);
                        if (Array.isArray(parsed) && parsed[0]) {
                            const p = parsed[0];
                            // Map Operator to friendly name
                            const op = (p.Operator || '').toLowerCase();
                            if (op === 'is') filterMethod = 'is exactly';
                            else if (op === 'matches') filterMethod = 'matches';
                            else if (op === 'contains') filterMethod = 'contains';
                            else filterMethod = p.Operator || '';

                            if (Array.isArray(p.Values) && p.Values.length > 0) {
                                filterValue = p.Values[0];
                            }
                        }
                    }
                } catch (e) {
                    // ignore parse errors
                }

                // Build step
                const step = {
                    id: `${Date.now()}_${action.sequence}_${Math.random().toString(36).substr(2,5)}`,
                    type: 'filter',
                    controlName: gridControlName || action.controlName,
                    displayText: fieldLabel || action.description || action.controlName,
                    fieldMapping: fieldLabel || '',
                    filterMethod: filterMethod || 'is exactly',
                    value: filterValue || '',
                    fieldType: { controlType: null, inputType: 'text' }
                };

                // Mark both actions as processed
                processedSequences.add(action.sequence);
                processedSequences.add(a.sequence);
                return { step };
            }
        }

        return null;
    },

    /**
     * Convert a single action to an extension step
     */
    convertActionToStep(action, resolvedLabels = {}) {
        const step = {
            id: `${Date.now()}_${action.sequence}_${Math.random().toString(36).substr(2, 5)}`,
            displayText: action.controlLabel || action.description || action.controlName,
            controlName: action.controlName,
            fieldMapping: '',
            waitUntilVisible: false,
            waitUntilHidden: false
        };

        if (action.nodeType === 'CommandUserAction') {
            return this.convertCommandAction(action, step);
        } else if (action.nodeType === 'PropertyUserAction') {
            return this.convertPropertyAction(action, step, resolvedLabels);
        }

        return null;
    },

    /**
     * Convert CommandUserAction to step
     */
    convertCommandAction(action, step) {
        // Skip if no control name
        if (!action.controlName) {
            return null;
        }

        // Handle RequestPopup (lookup selection) specially
        // Task Recorder doesn't capture the actual value selected from lookups
        if (action.commandName === 'RequestPopup') {
            const isGridContext = !!action.listContext;
            step.type = isGridContext ? 'grid-input' : 'input';
            step.value = ''; // Empty - user must fill in
            step.needsValue = true; // Flag for UI to highlight
            step.displayText = action.controlLabel || action.controlName;
            
            // Add field type info for lookups
            step.fieldType = {
                controlType: 'Input',
                inputType: 'lookup',
                isLookup: true,
                allowFreetext: true
            };

            // Add wait for validation for item-related fields
            if (this.isItemField(action.controlName, '')) {
                step.waitForValidation = true;
            }

            return step;
        }

        step.type = 'click';
        step.value = '';

        // Add smart wait conditions based on button type
        this.applySmartWaitConditions(action, step);

        return step;
    },

    /**
     * Convert PropertyUserAction to step
     * @param {Object} action - The action to convert
     * @param {Object} step - The step object being built
     * @param {Object} resolvedLabels - Map of label IDs to resolved values
     */
    convertPropertyAction(action, step, resolvedLabels = {}) {
        // Skip if no control name
        if (!action.controlName) {
            return null;
        }

        const isGridContext = !!action.listContext;
        const controlType = action.controlType?.toLowerCase() || '';

        // Detect checkbox
        if (controlType === 'checkbox' || action.boundProperty?.toLowerCase().includes('check')) {
            step.type = 'checkbox';
            step.value = action.value === '1' || action.value?.toLowerCase() === 'true' ? 'true' : 'false';
        }
        // ComboBox / Dropdown - resolve label value from OData
        else if (controlType === 'combobox') {
            step.type = 'select';
            
            // Try to get resolved label value
            console.log('[XML Import] ComboBox action:', action.controlName, 'valueLabel:', action.valueLabel, 'resolvedLabels:', resolvedLabels);
            const resolvedValue = action.valueLabel ? resolvedLabels[action.valueLabel] : null;
            console.log('[XML Import] Resolved value for', action.valueLabel, ':', resolvedValue);
            
            if (resolvedValue) {
                // We successfully resolved the label!
                step.value = resolvedValue;
                step.needsValue = false;
            } else {
                // Couldn't resolve - user must enter manually
                step.value = '';
                step.needsValue = true;
            }
            
            // Always store original values for reference
            step.originalEnumValue = action.value;
            step.originalLabelId = action.valueLabel;
            step.fieldType = {
                controlType: 'ComboBox',
                inputType: 'enum',
                isLookup: false,
                allowFreetext: false
            };
        }
        // Grid input
        else if (isGridContext) {
            step.type = 'grid-input';
            step.value = action.value || '';
            
            // Add wait for validation for item-related fields
            if (this.isItemField(action.controlName, action.boundProperty)) {
                step.waitForValidation = true;
            }
        }
        // Regular input
        else {
            step.type = 'input';
            step.value = action.value || '';

            // Detect if it's a lookup field
            if (action.controlType === 'Input' || action.userActionType === 'Input') {
                step.fieldType = {
                    controlType: 'Input',
                    inputType: 'lookup',
                    isLookup: true,
                    allowFreetext: true
                };
            }
        }

        // Add smart wait conditions
        this.applySmartWaitConditions(action, step);

        return step;
    },

    /**
     * Check if a field is an item-related field (needs validation wait)
     */
    isItemField(controlName, boundProperty) {
        const itemPatterns = [
            /item.*id/i,
            /itemid/i,
            /itemnumber/i,
            /item.*number/i,
            /product.*id/i,
            /inventdim/i
        ];

        const fieldName = controlName + ' ' + (boundProperty || '');
        return itemPatterns.some(pattern => pattern.test(fieldName));
    },

    /**
     * Apply smart wait conditions based on context
     */
    applySmartWaitConditions(action, step) {
        const controlName = action.controlName?.toLowerCase() || '';
        const controlLabel = action.controlLabel?.toLowerCase() || '';

        // Wait until visible for dialog buttons
        if (controlName.includes('ok') || controlName.includes('yes') || 
            controlName.includes('confirm') || controlLabel.includes('ok')) {
            step.waitUntilVisible = true;
        }

        // Wait until hidden for closing buttons
        if (controlName.includes('ok') || controlName.includes('close') ||
            controlLabel.includes('ok') || controlLabel.includes('close')) {
            step.waitUntilHidden = true;
        }

        // Wait until visible for fields that appear after button clicks
        if (action.nodeType === 'PropertyUserAction') {
            // First input after a dialog typically needs wait
            const prevFormId = action.formId?.split('_')[1] || '';
            if (prevFormId.includes('CreateOrder') || prevFormId.includes('Dialog')) {
                step.waitUntilVisible = true;
            }
        }
    },

    /**
     * Analyze XML and return a preview summary
     */
    analyzeTaskRecorderXML(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML format');
        }

        const recordingName = this.getXMLText(xmlDoc, 'Name') || 'Unnamed Recording';
        const actions = this.extractUserActions(xmlDoc);
        
        // Count action types
        const stats = {
            totalActions: actions.length,
            clicks: 0,
            inputs: 0,
            gridInputs: 0,
            checkboxes: 0,
            lookupPlaceholders: 0, // Lookups without values
            skipped: 0
        };

        const previewSteps = [];

        actions.forEach(action => {
            if (this.shouldSkipAction(action)) {
                stats.skipped++;
                return;
            }

            const isGridContext = !!action.listContext;
            const controlType = action.controlType?.toLowerCase() || '';

            if (action.nodeType === 'CommandUserAction') {
                // Check if this is a RequestPopup (lookup selection without value)
                if (action.commandName === 'RequestPopup') {
                    stats.lookupPlaceholders++;
                    previewSteps.push({
                        type: isGridContext ? 'grid-input' : 'input',
                        description: `⚠️ ${action.controlLabel || action.controlName} (needs value)`,
                        controlName: action.controlName,
                        value: '',
                        needsValue: true
                    });
                } else {
                    stats.clicks++;
                    previewSteps.push({
                        type: 'click',
                        description: action.description || `Click ${action.controlLabel || action.controlName}`,
                        controlName: action.controlName
                    });
                }
            } else if (action.nodeType === 'PropertyUserAction') {
                if (controlType === 'checkbox') {
                    stats.checkboxes++;
                    previewSteps.push({
                        type: 'checkbox',
                        description: `Set ${action.controlLabel || action.controlName}`,
                        controlName: action.controlName,
                        value: action.value
                    });
                } else if (controlType === 'combobox') {
                    // ComboBox / enum field - check if we have a label ID that can be resolved
                    const hasResolvableLabel = action.valueLabel && action.valueLabel.startsWith('@');
                    
                    if (hasResolvableLabel) {
                        stats.comboboxResolvable = (stats.comboboxResolvable || 0) + 1;
                        previewSteps.push({
                            type: 'select',
                            description: `🔄 ${action.controlLabel || action.controlName} (will resolve ${action.valueLabel})`,
                            controlName: action.controlName,
                            value: `label: ${action.valueLabel}`,
                            needsValue: false, // Will be resolved during import
                            labelId: action.valueLabel
                        });
                    } else {
                        stats.lookupPlaceholders++; // Count as needing attention
                        previewSteps.push({
                            type: 'select',
                            description: `⚠️ ${action.controlLabel || action.controlName} (needs display label)`,
                            controlName: action.controlName,
                            value: `enum: ${action.value}`,
                            needsValue: true
                        });
                    }
                } else if (isGridContext) {
                    stats.gridInputs++;
                    previewSteps.push({
                        type: 'grid-input',
                        description: action.description || `Enter ${action.controlLabel || action.controlName}`,
                        controlName: action.controlName,
                        value: action.value
                    });
                } else {
                    stats.inputs++;
                    previewSteps.push({
                        type: 'input',
                        description: action.description || `Enter ${action.controlLabel || action.controlName}`,
                        controlName: action.controlName,
                        value: action.value
                    });
                }
            }
        });

        return {
            recordingName,
            stats,
            previewSteps,
            forms: this.extractFormInfo(xmlDoc)
        };
    },

    /**
     * Extract form information from the XML
     */
    extractFormInfo(xmlDoc) {
        const forms = [];
        const formContexts = xmlDoc.querySelectorAll('FormContexts > *');
        
        formContexts.forEach(ctx => {
            const formName = ctx.querySelector('FormName')?.textContent || '';
            const menuItemLabel = ctx.querySelector('MenuItemLabel')?.textContent || '';
            
            if (formName) {
                forms.push({
                    name: formName,
                    label: menuItemLabel || formName
                });
            }
        });

        return forms;
    },

    /**
     * Show the import preview modal
     */
    showXMLImportPreview(analysis) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('xmlImportModal');
        if (!modal) {
            modal = this.createXMLImportModal();
            document.body.appendChild(modal);
        }

        // Populate modal content
        document.getElementById('xmlRecordingName').textContent = analysis.recordingName;
        
        // Stats - include lookup placeholders warning if any
        let statsHtml = `
            <div class="import-stat"><span class="stat-value">${analysis.stats.clicks}</span> Click actions</div>
            <div class="import-stat"><span class="stat-value">${analysis.stats.inputs}</span> Input fields</div>
            <div class="import-stat"><span class="stat-value">${analysis.stats.gridInputs}</span> Grid inputs</div>
            <div class="import-stat"><span class="stat-value">${analysis.stats.checkboxes}</span> Checkboxes</div>
            <div class="import-stat muted"><span class="stat-value">${analysis.stats.skipped}</span> Skipped (noise)</div>
        `;
        
        // Show resolvable ComboBox labels
        if (analysis.stats.comboboxResolvable > 0) {
            statsHtml += `
                <div class="import-stat success"><span class="stat-value">${analysis.stats.comboboxResolvable}</span> 🔄 Labels to resolve</div>
            `;
        }
        
        // Add warning for lookup placeholders
        if (analysis.stats.lookupPlaceholders > 0) {
            statsHtml += `
                <div class="import-stat warning"><span class="stat-value">${analysis.stats.lookupPlaceholders}</span> ⚠️ Need values</div>
            `;
        }
        document.getElementById('xmlImportStats').innerHTML = statsHtml;

        // Show info message about label resolution
        let warningHtml = '';
        
        if (analysis.stats.comboboxResolvable > 0) {
            warningHtml += `
                <div class="import-info">
                    <strong>🔄 ${analysis.stats.comboboxResolvable} dropdown label(s) will be resolved</strong>
                    <p>ComboBox values with @SYS labels will be automatically resolved via D365's OData API during import.</p>
                </div>
            `;
        }
        
        if (analysis.stats.lookupPlaceholders > 0) {
            warningHtml += `
                <div class="import-warning">
                    <strong>⚠️ ${analysis.stats.lookupPlaceholders} field(s) need values</strong>
                    <p>Task Recorder doesn't capture values when you select from a lookup by clicking. 
                    You'll need to enter these values manually after import.</p>
                </div>
            `;
        }
        
        // Forms used
        const formsHtml = analysis.forms.length > 0 
            ? analysis.forms.map(f => `<span class="form-tag">${f.label || f.name}</span>`).join('')
            : '<span class="muted">No forms detected</span>';
        document.getElementById('xmlImportForms').innerHTML = warningHtml + formsHtml;

        // Preview steps - highlight those needing values
        const stepsHtml = analysis.previewSteps.slice(0, 20).map((step, i) => `
            <div class="preview-step ${step.needsValue ? 'needs-value' : ''}">
                <span class="step-number">${i + 1}</span>
                <span class="step-type-badge ${step.type}">${step.type}</span>
                <span class="step-desc">${this.escapeHtml(step.description)}</span>
                ${step.value ? `<span class="step-value">"${this.escapeHtml(step.value)}"</span>` : ''}
            </div>
        `).join('');
        
        const moreSteps = analysis.previewSteps.length > 20 
            ? `<div class="more-steps">... and ${analysis.previewSteps.length - 20} more steps</div>` 
            : '';
        
        document.getElementById('xmlPreviewSteps').innerHTML = stepsHtml + moreSteps;

        // Store analysis for import
        this._pendingXMLImport = analysis;

        // Show modal
        modal.classList.remove('is-hidden');
    },

    /**
     * Create the XML import preview modal
     */
    createXMLImportModal() {
        const modal = document.createElement('div');
        modal.id = 'xmlImportModal';
        modal.className = 'modal-overlay is-hidden';
        modal.innerHTML = `
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h3>📥 Import Task Recording</h3>
                    <button class="btn-close" id="closeXMLImport">✕</button>
                </div>
                <div class="modal-body">
                    <div class="import-summary">
                        <h4 id="xmlRecordingName">Recording Name</h4>
                        <div class="import-stats" id="xmlImportStats"></div>
                    </div>
                    
                    <div class="import-section">
                        <h5>📋 Forms Used</h5>
                        <div class="import-forms" id="xmlImportForms"></div>
                    </div>

                    <div class="import-section">
                        <h5>👁️ Step Preview</h5>
                        <div class="preview-steps-list" id="xmlPreviewSteps"></div>
                    </div>

                    <div class="import-options">
                        <h5>⚙️ Import Options</h5>
                        <label class="import-option">
                            <input type="checkbox" id="xmlImportAddWaits" checked>
                            Add smart wait conditions (recommended)
                        </label>
                        <label class="import-option">
                            <input type="checkbox" id="xmlImportFilterNoise" checked>
                            Filter redundant actions (row selections, tab switches)
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelXMLImport" class="btn btn-secondary">Cancel</button>
                    <button id="confirmXMLImport" class="btn btn-success">📥 Import Workflow</button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('#closeXMLImport').addEventListener('click', () => {
            modal.classList.add('is-hidden');
        });
        
        modal.querySelector('#cancelXMLImport').addEventListener('click', () => {
            modal.classList.add('is-hidden');
        });

        modal.querySelector('#confirmXMLImport').addEventListener('click', () => {
            this.confirmXMLImport();
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('is-hidden');
            }
        });

        return modal;
    },

    /**
     * Confirm and complete the XML import
     */
    async confirmXMLImport() {
        if (!this._pendingXMLContent) {
            this.showNotification('No XML content to import', 'error');
            return;
        }

        // Get the import button and show loading state
        const importBtn = document.getElementById('confirmXMLImport');
        const originalText = importBtn?.innerHTML;
        if (importBtn) {
            importBtn.innerHTML = '⏳ Importing...';
            importBtn.disabled = true;
        }

        try {
            // Show status message
            this.showNotification('Resolving D365 labels...', 'info');
            
            // Parse XML and resolve labels (async)
            const workflow = await this.parseTaskRecorderXML(this._pendingXMLContent);
            
            // Count how many labels were resolved
            const resolvedCount = workflow.steps.filter(s => 
                s.type === 'select' && !s.needsValue && s.originalLabelId
            ).length;
            
            const unresolvedCount = workflow.steps.filter(s => 
                s.type === 'select' && s.needsValue
            ).length;
            
            // Add to workflows
            this.workflows.push(workflow);
            await chrome.storage.local.set({ workflows: this.workflows });
            
            // Update UI
            this.displayWorkflows();
            
            // Close modal
            document.getElementById('xmlImportModal')?.classList.add('is-hidden');
            
            // Build success message
            let message = `Imported "${workflow.name}" with ${workflow.steps.length} steps`;
            if (resolvedCount > 0) {
                message += `. ✓ Resolved ${resolvedCount} dropdown labels automatically!`;
            }
            if (unresolvedCount > 0) {
                message += ` (${unresolvedCount} still need values)`;
            }
            this.showNotification(message, 'success');
            
            // Clear pending import
            this._pendingXMLContent = null;
            this._pendingXMLImport = null;

            // Optionally open the imported workflow for editing
            this.loadWorkflow(workflow);

        } catch (error) {
            console.error('XML import error:', error);
            this.showNotification('Failed to import: ' + error.message, 'error');
        } finally {
            // Restore button state
            if (importBtn) {
                importBtn.innerHTML = originalText || '📥 Import Workflow';
                importBtn.disabled = false;
            }
        }
    },

    /**
     * Handle file selection for XML import
     */
    async handleXMLFileImport(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => {
                try {
                    const xmlContent = reader.result;
                    this._pendingXMLContent = xmlContent;
                    
                    // Analyze and show preview
                    const analysis = this.analyzeTaskRecorderXML(xmlContent);
                    this.showXMLImportPreview(analysis);
                    resolve(analysis);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },

    /**
     * Escape HTML for safe display
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
