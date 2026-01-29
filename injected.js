// D365FO Element Inspector and Discovery Module

class D365Inspector {
    constructor() {
        this.isInspecting = false;
        this.highlightElement = null;
        this.overlay = null;
    }

    // Get the form name that contains an element
    getElementFormName(element) {
        // Look for the closest form container
        const formContainer = element.closest('[data-dyn-form-name]');
        if (formContainer) {
            return formContainer.getAttribute('data-dyn-form-name');
        }
        
        // Try to find form via data-dyn-controlname on a form-level container
        const formElement = element.closest('[data-dyn-role="Form"]');
        if (formElement) {
            return formElement.getAttribute('data-dyn-controlname') || formElement.getAttribute('data-dyn-form-name');
        }
        
        // Try finding the workspace or page container
        const workspace = element.closest('.workspace-content, .workspace, [data-dyn-role="Workspace"]');
        if (workspace) {
            const workspaceName = workspace.getAttribute('data-dyn-controlname');
            if (workspaceName) return workspaceName;
        }
        
        // Check for dialog/modal context
        const dialog = element.closest('[data-dyn-role="Dialog"], .dialog-container, .modal-content');
        if (dialog) {
            const dialogName = dialog.getAttribute('data-dyn-controlname') || 
                               dialog.querySelector('[data-dyn-form-name]')?.getAttribute('data-dyn-form-name');
            if (dialogName) return dialogName;
        }
        
        // Try to find the root form by walking up the DOM
        let current = element;
        while (current && current !== document.body) {
            const formName = current.getAttribute('data-dyn-form-name') || 
                            (current.getAttribute('data-dyn-role') === 'Form' ? current.getAttribute('data-dyn-controlname') : null);
            if (formName) return formName;
            current = current.parentElement;
        }
        
        return 'Unknown';
    }

    // Get the active/focused form name
    getActiveFormName() {
        // Check for active dialog first (child forms are typically dialogs)
        const activeDialog = document.querySelector('[data-dyn-role="Dialog"]:not([style*="display: none"]), .dialog-container:not([style*="display: none"])');
        if (activeDialog) {
            const dialogForm = activeDialog.querySelector('[data-dyn-form-name]');
            if (dialogForm) return dialogForm.getAttribute('data-dyn-form-name');
            return activeDialog.getAttribute('data-dyn-controlname');
        }
        
        // Check for focused element and get its form
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body) {
            const formName = this.getElementFormName(activeElement);
            if (formName && formName !== 'Unknown') return formName;
        }
        
        // Look for the topmost/active form section
        const visibleForms = document.querySelectorAll('[data-dyn-form-name]');
        if (visibleForms.length > 0) {
            // Return the last one (typically the most recently opened/topmost)
            for (let i = visibleForms.length - 1; i >= 0; i--) {
                if (this.isElementVisible(visibleForms[i])) {
                    return visibleForms[i].getAttribute('data-dyn-form-name');
                }
            }
        }
        
        return null;
    }

    // Discover all interactive elements on the page
    discoverElements(activeFormOnly = false) {
        const elements = [];
        const activeForm = activeFormOnly ? this.getActiveFormName() : null;
        
        // Find all buttons
        document.querySelectorAll('[data-dyn-role="Button"], [data-dyn-role="CommandButton"], [data-dyn-role="MenuItemButton"]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (!controlName) return;

            const formName = this.getElementFormName(el);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            const text = this.getElementText(el);
            const visible = this.isElementVisible(el);
            
            elements.push({
                type: 'button',
                controlName: controlName,
                displayText: text,
                visible: visible,
                ariaLabel: el.getAttribute('aria-label') || '',
                selector: `[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                element: el
            });
        });
        
        // Find all input fields (expanded to catch more field types)
        document.querySelectorAll('[data-dyn-role="Input"], [data-dyn-role="MultilineInput"], [data-dyn-role="ComboBox"], [data-dyn-role="ReferenceGroup"], [data-dyn-role="Lookup"], [data-dyn-role="SegmentedEntry"], input[data-dyn-controlname], input[role="textbox"]').forEach(el => {
            // Get control name from element or parent
            let controlName = el.getAttribute('data-dyn-controlname');
            let targetElement = el;
            
            // If not found, check parent element (common for SegmentedEntry fields like Account)
            if (!controlName) {
                const parent = el.closest('[data-dyn-controlname]');
                if (parent) {
                    controlName = parent.getAttribute('data-dyn-controlname');
                    targetElement = parent;
                }
            }
            
            if (!controlName) return;

            // Skip if already added (avoid duplicates)
            if (elements.some(e => e.controlName === controlName)) return;

            const formName = this.getElementFormName(targetElement);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            const label = this.getElementLabel(targetElement);
            const fieldInfo = this.detectFieldType(targetElement);
            
            elements.push({
                type: 'input',
                controlName: controlName,
                displayText: label,
                visible: this.isElementVisible(targetElement),
                fieldType: fieldInfo,
                selector: `[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                element: targetElement
            });
        });

        // Find all checkboxes/toggles
        document.querySelectorAll('[data-dyn-role="CheckBox"], input[type="checkbox"][data-dyn-controlname]').forEach(el => {
            let controlName = el.getAttribute('data-dyn-controlname');
            let targetElement = el;
            
            // Check parent if not found
            if (!controlName) {
                const parent = el.closest('[data-dyn-controlname]');
                if (parent) {
                    controlName = parent.getAttribute('data-dyn-controlname');
                    targetElement = parent;
                }
            }
            
            if (!controlName) return;
            if (elements.some(e => e.controlName === controlName)) return;

            const formName = this.getElementFormName(targetElement);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            const label = this.getElementLabel(targetElement);
            const checkbox = targetElement.querySelector('input[type="checkbox"]') || targetElement;
            const isChecked = checkbox.checked || checkbox.getAttribute('aria-checked') === 'true';
            
            elements.push({
                type: 'checkbox',
                controlName: controlName,
                displayText: label,
                visible: this.isElementVisible(targetElement),
                checked: isChecked,
                selector: `[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                element: targetElement
            });
        });

        // Find all traditional D365 grids/tables
        document.querySelectorAll('[data-dyn-role="Grid"]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (!controlName) return;

            const formName = this.getElementFormName(el);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            elements.push({
                type: 'grid',
                controlName: controlName,
                displayText: this.getElementLabel(el) || 'Grid',
                visible: this.isElementVisible(el),
                selector: `[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                element: el
            });

            // Discover grid columns for input
            this.discoverGridColumns(el, controlName, formName, elements);
        });

        // Find React FixedDataTable grids (.reactGrid)
        document.querySelectorAll('.reactGrid').forEach(el => {
            const formName = this.getElementFormName(el);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            elements.push({
                type: 'grid',
                controlName: 'reactGrid',
                displayText: 'React Grid',
                visible: this.isElementVisible(el),
                selector: '.reactGrid',
                formName: formName,
                element: el
            });

            // Discover React grid columns for input
            this.discoverReactGridColumns(el, formName, elements);
        });

        return elements;
    }

    // Get readable text from an element
    getElementText(element) {
        // Try aria-label first
        let text = element.getAttribute('aria-label');
        if (text && text.trim()) return text.trim();

        // Try text content (excluding child buttons/icons)
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.button-icon, .fa, .glyphicon').forEach(icon => icon.remove());
        text = clone.textContent?.trim();
        if (text) return text;

        // Try title attribute
        text = element.getAttribute('title');
        if (text) return text;

        // Fallback to control name
        return element.getAttribute('data-dyn-controlname') || 'Unknown';
    }

    // Get label for input fields
    getElementLabel(element) {
        // Try aria-label
        let label = element.getAttribute('aria-label');
        if (label && label.trim()) return label.trim();

        // Try associated label element
        const labelElement = element.closest('.dyn-label-wrapper')?.querySelector('.dyn-label');
        if (labelElement) return labelElement.textContent?.trim();

        // Try parent container label
        const container = element.closest('.input_container, .form-group');
        if (container) {
            const containerLabel = container.querySelector('label');
            if (containerLabel) return containerLabel.textContent?.trim();
        }

        // Fallback to control name
        return element.getAttribute('data-dyn-controlname') || 'Unknown';
    }

    // Discover grid columns for input/editing
    discoverGridColumns(gridElement, gridName, formName, elements) {
        const addedColumns = new Set();
        
        // Method 1: Find column headers
        const headers = gridElement.querySelectorAll('[data-dyn-role="ColumnHeader"], [role="columnheader"], .dyn-headerCell');
        headers.forEach(header => {
            const colName = header.getAttribute('data-dyn-controlname');
            if (!colName || addedColumns.has(colName)) return;
            addedColumns.add(colName);
            
            const displayText = header.textContent?.trim() || header.getAttribute('aria-label') || colName;
            elements.push({
                type: 'grid-column',
                controlName: colName,
                displayText: `${displayText}`,
                gridName: gridName,
                visible: this.isElementVisible(header),
                selector: `[data-dyn-controlname="${colName}"]`,
                formName: formName,
                isHeader: true,
                element: header
            });
        });
        
        // Method 2: Find cells with inputs in the active/selected row
        const activeRow = gridElement.querySelector('[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow') ||
                         gridElement.querySelector('[data-dyn-role="Row"]:first-of-type, [role="row"]:not([role="columnheader"]):first-of-type');
        
        if (activeRow) {
            // Find all input fields in the row
            const cells = activeRow.querySelectorAll('[data-dyn-controlname]');
            cells.forEach(cell => {
                const colName = cell.getAttribute('data-dyn-controlname');
                if (!colName || addedColumns.has(colName)) return;
                
                const role = cell.getAttribute('data-dyn-role');
                const hasInput = cell.querySelector('input, select, textarea') !== null || 
                                ['Input', 'ComboBox', 'Lookup', 'ReferenceGroup', 'SegmentedEntry'].includes(role);
                
                if (hasInput || role) {
                    addedColumns.add(colName);
                    const displayText = this.getGridColumnLabel(gridElement, colName) || colName;
                    const fieldType = this.detectFieldType(cell);
                    
                    elements.push({
                        type: 'grid-column',
                        controlName: colName,
                        displayText: displayText,
                        gridName: gridName,
                        visible: this.isElementVisible(cell),
                        selector: `[data-dyn-controlname="${colName}"]`,
                        formName: formName,
                        isEditable: hasInput,
                        fieldType: fieldType,
                        role: role,
                        element: cell
                    });
                }
            });
        }
        
        // Method 3: Find any editable inputs inside the grid body
        const gridInputs = gridElement.querySelectorAll('[data-dyn-role="Input"], [data-dyn-role="ComboBox"], [data-dyn-role="Lookup"], [data-dyn-role="ReferenceGroup"]');
        gridInputs.forEach(input => {
            const colName = input.getAttribute('data-dyn-controlname');
            if (!colName || addedColumns.has(colName)) return;
            addedColumns.add(colName);
            
            const displayText = this.getGridColumnLabel(gridElement, colName) || this.getElementLabel(input) || colName;
            const fieldType = this.detectFieldType(input);
            
            elements.push({
                type: 'grid-column',
                controlName: colName,
                displayText: displayText,
                gridName: gridName,
                visible: this.isElementVisible(input),
                selector: `[data-dyn-controlname="${colName}"]`,
                formName: formName,
                isEditable: true,
                fieldType: fieldType,
                role: input.getAttribute('data-dyn-role'),
                element: input
            });
        });
    }
    
    // Get label for a grid column by looking at the header
    getGridColumnLabel(gridElement, columnControlName) {
        // Try to find the header cell for this column
        const header = gridElement.querySelector(`[data-dyn-role="ColumnHeader"][data-dyn-controlname="${columnControlName}"], [role="columnheader"][data-dyn-controlname="${columnControlName}"]`);
        if (header) {
            const text = header.textContent?.trim();
            if (text) return text;
        }
        
        // Try to find header by partial match (column name might be different in header vs cell)
        const allHeaders = gridElement.querySelectorAll('[data-dyn-role="ColumnHeader"], [role="columnheader"]');
        for (const h of allHeaders) {
            const headerName = h.getAttribute('data-dyn-controlname');
            if (headerName && (columnControlName.includes(headerName) || headerName.includes(columnControlName))) {
                const text = h.textContent?.trim();
                if (text) return text;
            }
        }
        
        return null;
    }

    // Discover columns in React FixedDataTable grids
    discoverReactGridColumns(gridElement, formName, elements) {
        const addedColumns = new Set();
        
        // Get column headers from .dyn-headerCell elements
        const headerCells = gridElement.querySelectorAll('.fixedDataTableLayout_header .dyn-headerCell');
        headerCells.forEach((header, colIndex) => {
            const controlName = header.getAttribute('data-dyn-controlname');
            if (!controlName || addedColumns.has(controlName)) return;
            addedColumns.add(controlName);
            
            const label = header.querySelector('.dyn-headerCellLabel');
            const displayText = label?.textContent?.trim() || header.textContent?.trim() || controlName;
            
            elements.push({
                type: 'grid-column',
                controlName: controlName,
                displayText: displayText,
                gridName: 'reactGrid',
                gridType: 'react',
                columnIndex: colIndex,
                visible: this.isElementVisible(header),
                selector: `.dyn-headerCell[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                isHeader: true,
                element: header
            });
        });
        
        // Also look for editable inputs inside the body rows
        const bodyContainer = gridElement.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            // Find active/selected row first, or fallback to first row
            const activeRow = bodyContainer.querySelector('.fixedDataTableRowLayout_main[aria-selected="true"], .fixedDataTableRowLayout_main[data-dyn-row-active="true"]') ||
                             bodyContainer.querySelector('.fixedDataTableRowLayout_main.public_fixedDataTableRow_main');
            
            if (activeRow) {
                // Find all cells with data-dyn-controlname
                const cells = activeRow.querySelectorAll('[data-dyn-controlname]');
                cells.forEach(cell => {
                    const colName = cell.getAttribute('data-dyn-controlname');
                    if (!colName || addedColumns.has(colName)) return;
                    
                    const role = cell.getAttribute('data-dyn-role');
                    const hasInput = cell.querySelector('input, select, textarea') !== null || 
                                    ['Input', 'ComboBox', 'Lookup', 'ReferenceGroup', 'SegmentedEntry'].includes(role);
                    
                    addedColumns.add(colName);
                    const displayText = this.getReactGridColumnLabel(gridElement, colName) || colName;
                    const fieldType = this.detectFieldType(cell);
                    
                    elements.push({
                        type: 'grid-column',
                        controlName: colName,
                        displayText: displayText,
                        gridName: 'reactGrid',
                        gridType: 'react',
                        visible: this.isElementVisible(cell),
                        selector: `[data-dyn-controlname="${colName}"]`,
                        formName: formName,
                        isEditable: hasInput,
                        fieldType: fieldType,
                        role: role,
                        element: cell
                    });
                });
            }
        }
        
        // Find any editable inputs in the grid body
        const gridInputs = gridElement.querySelectorAll('.fixedDataTableLayout_body [data-dyn-role="Input"], .fixedDataTableLayout_body [data-dyn-role="ComboBox"], .fixedDataTableLayout_body [data-dyn-role="Lookup"], .fixedDataTableLayout_body [data-dyn-role="ReferenceGroup"]');
        gridInputs.forEach(input => {
            const colName = input.getAttribute('data-dyn-controlname');
            if (!colName || addedColumns.has(colName)) return;
            addedColumns.add(colName);
            
            const displayText = this.getReactGridColumnLabel(gridElement, colName) || this.getElementLabel(input) || colName;
            const fieldType = this.detectFieldType(input);
            
            elements.push({
                type: 'grid-column',
                controlName: colName,
                displayText: displayText,
                gridName: 'reactGrid',
                gridType: 'react',
                visible: this.isElementVisible(input),
                selector: `[data-dyn-controlname="${colName}"]`,
                formName: formName,
                isEditable: true,
                fieldType: fieldType,
                role: input.getAttribute('data-dyn-role'),
                element: input
            });
        });
    }
    
    // Get label for a React grid column by looking at the header
    getReactGridColumnLabel(gridElement, columnControlName) {
        // Try to find the header cell with matching controlname
        const header = gridElement.querySelector(`.dyn-headerCell[data-dyn-controlname="${columnControlName}"]`);
        if (header) {
            const label = header.querySelector('.dyn-headerCellLabel');
            const text = label?.textContent?.trim() || header.textContent?.trim();
            if (text) return text;
        }
        
        // Partial match
        const allHeaders = gridElement.querySelectorAll('.dyn-headerCell[data-dyn-controlname]');
        for (const h of allHeaders) {
            const headerName = h.getAttribute('data-dyn-controlname');
            if (headerName && (columnControlName.includes(headerName) || headerName.includes(columnControlName))) {
                const label = h.querySelector('.dyn-headerCellLabel');
                const text = label?.textContent?.trim() || h.textContent?.trim();
                if (text) return text;
            }
        }
        
        return null;
    }

    // Detect field type (enum, lookup, freetext, etc.)
    detectFieldType(element) {
        const role = element.getAttribute('data-dyn-role');
        const controlName = element.getAttribute('data-dyn-controlname');
        
        // SegmentedEntry fields (like Account) have special lookup
        if (role === 'SegmentedEntry') {
            return { type: 'segmented-lookup', role: role };
        }
        
        // Check for lookup button
        const hasLookupButton = element.classList.contains('field-hasLookupButton') ||
                               element.querySelector('.lookup-button') !== null ||
                               element.nextElementSibling?.classList.contains('lookup-button');
        
        // Check for ComboBox/Dropdown
        const isComboBox = role === 'ComboBox' || element.classList.contains('comboBox');
        
        // Check for select element
        const select = element.querySelector('select');
        
        // MultilineInput detection
        const isMultiline = role === 'MultilineInput';
        
        // Detect numeric fields
        const isNumeric = element.querySelector('input[type="number"]') !== null;
        
        // Detect date fields
        const isDate = element.classList.contains('date-field') || 
                      element.querySelector('input[type="date"]') !== null;

        // Build field type info
        const fieldInfo = {
            controlType: role,
            inputType: 'text'
        };

        if (isMultiline) {
            fieldInfo.inputType = 'textarea';
            fieldInfo.isMultiline = true;
        } else if (isComboBox || select) {
            fieldInfo.inputType = 'enum';
            fieldInfo.isEnum = true;
            fieldInfo.values = this.extractEnumValues(element, select);
        } else if (hasLookupButton) {
            fieldInfo.inputType = 'lookup';
            fieldInfo.isLookup = true;
            fieldInfo.allowFreetext = !element.classList.contains('lookup-only');
        } else if (isNumeric) {
            fieldInfo.inputType = 'number';
        } else if (isDate) {
            fieldInfo.inputType = 'date';
        }

        // Get max length if available
        const input = element.querySelector('input, textarea');
        if (input && input.maxLength > 0) {
            fieldInfo.maxLength = input.maxLength;
        }

        return fieldInfo;
    }

    // Extract enum values from dropdown
    extractEnumValues(element, selectElement) {
        const select = selectElement || element.querySelector('select');
        if (!select) return null;

        return Array.from(select.options)
            .filter(opt => opt.value !== '')
            .map(opt => ({
                value: opt.value,
                text: opt.text.trim()
            }));
    }

    // Check if element is visible
    isElementVisible(element) {
        return element.offsetParent !== null && 
               window.getComputedStyle(element).visibility !== 'hidden' &&
               window.getComputedStyle(element).display !== 'none';
    }

    // Start interactive element picker
    startElementPicker(callback) {
        this.isInspecting = true;
        this.pickerCallback = callback;

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(102, 126, 234, 0.1);
            z-index: 999998;
            cursor: crosshair;
        `;
        document.body.appendChild(this.overlay);

        // Create highlight element
        this.highlightElement = document.createElement('div');
        this.highlightElement.style.cssText = `
            position: absolute;
            border: 2px solid #667eea;
            background: rgba(102, 126, 234, 0.1);
            pointer-events: none;
            z-index: 999999;
            transition: all 0.1s ease;
        `;
        document.body.appendChild(this.highlightElement);

        // Add event listeners
        this.mouseMoveHandler = (e) => this.handleMouseMove(e);
        this.clickHandler = (e) => this.handleClick(e);
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') this.stopElementPicker();
        };

        document.addEventListener('mousemove', this.mouseMoveHandler, true);
        document.addEventListener('click', this.clickHandler, true);
        document.addEventListener('keydown', this.escapeHandler, true);
    }

    handleMouseMove(e) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || target === this.overlay || target === this.highlightElement) return;

        // Find closest D365 control
        const control = target.closest('[data-dyn-controlname]');
        if (!control) {
            if (this.highlightElement) {
                this.highlightElement.style.display = 'none';
            }
            return;
        }

        // Ensure highlight element exists
        if (!this.highlightElement) return;

        // Highlight the element
        const rect = control.getBoundingClientRect();
        this.highlightElement.style.display = 'block';
        this.highlightElement.style.top = rect.top + window.scrollY + 'px';
        this.highlightElement.style.left = rect.left + window.scrollX + 'px';
        this.highlightElement.style.width = rect.width + 'px';
        this.highlightElement.style.height = rect.height + 'px';

        // Show tooltip
        const controlName = control.getAttribute('data-dyn-controlname');
        const role = control.getAttribute('data-dyn-role');
        this.highlightElement.setAttribute('title', `${role}: ${controlName}`);
    }

    handleClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = document.elementFromPoint(e.clientX, e.clientY);
        const control = target?.closest('[data-dyn-controlname]');
        
        if (control) {
            const controlName = control.getAttribute('data-dyn-controlname');
            const role = control.getAttribute('data-dyn-role');
            const text = this.getElementText(control);
            
            const elementInfo = {
                controlName: controlName,
                role: role,
                displayText: text,
                selector: `[data-dyn-controlname="${controlName}"]`
            };

            if (role === 'Input' || role === 'MultilineInput' || role === 'ComboBox') {
                elementInfo.fieldType = this.detectFieldType(control);
            }

            this.pickerCallback(elementInfo);
        }

        this.stopElementPicker();
    }

    stopElementPicker() {
        this.isInspecting = false;
        
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        if (this.highlightElement) {
            this.highlightElement.remove();
            this.highlightElement = null;
        }

        document.removeEventListener('mousemove', this.mouseMoveHandler, true);
        document.removeEventListener('click', this.clickHandler, true);
        document.removeEventListener('keydown', this.escapeHandler, true);
    }

    // Search elements by text
    findElementByText(text, elementType = null) {
        const elements = this.discoverElements();
        const searchText = text.toLowerCase().trim();

        return elements.filter(el => {
            if (elementType && el.type !== elementType) return false;
            
            const displayText = el.displayText.toLowerCase();
            const ariaLabel = (el.ariaLabel || '').toLowerCase();
            const controlName = el.controlName.toLowerCase();

            return displayText.includes(searchText) ||
                   ariaLabel.includes(searchText) ||
                   controlName.includes(searchText);
        });
    }
}

// Export for use in content script
window.D365Inspector = D365Inspector;

// ====== Initialize and Listen for Messages ======

// Prevent duplicate initialization
if (window.d365InjectedScriptLoaded) {
    console.log('D365 injected script already loaded, skipping...');
} else {
    window.d365InjectedScriptLoaded = true;

    // Create inspector instance
    const inspector = new D365Inspector();

    // ====== Workflow Execution Engine ======
    let currentWorkflowSettings = {};
    let executionControl = {
        isPaused: false,
        isStopped: false,
        runOptions: {
            skipRows: 0,
            limitRows: 0,
            dryRun: false
        }
    };

    // Single unified message listener
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        // Discovery requests
        if (event.data.type === 'D365_DISCOVER_ELEMENTS') {
            const activeFormOnly = event.data.activeFormOnly || false;
            const elements = inspector.discoverElements(activeFormOnly);
            const activeForm = inspector.getActiveFormName();
            window.postMessage({
                type: 'D365_ELEMENTS_DISCOVERED',
                elements: elements.map(el => ({
                    ...el,
                    element: undefined // Remove DOM reference for serialization
                })),
                activeForm: activeForm
            }, '*');
        }

        if (event.data.type === 'D365_START_PICKER') {
            inspector.startElementPicker((element) => {
                // Add form name to picked element
                const formName = inspector.getElementFormName(document.querySelector(`[data-dyn-controlname="${element.controlName}"]`));
                window.postMessage({
                    type: 'D365_ELEMENT_PICKED',
                    element: { ...element, formName }
                }, '*');
            });
        }

        if (event.data.type === 'D365_STOP_PICKER') {
            inspector.stopElementPicker();
        }

        if (event.data.type === 'D365_EXECUTE_WORKFLOW') {
            executeWorkflow(event.data.workflow, event.data.data);
        }
        
        // Execution controls
        if (event.data.type === 'D365_PAUSE_WORKFLOW') {
            executionControl.isPaused = true;
        }
        if (event.data.type === 'D365_RESUME_WORKFLOW') {
            executionControl.isPaused = false;
        }
        if (event.data.type === 'D365_STOP_WORKFLOW') {
            executionControl.isStopped = true;
            executionControl.isPaused = false;
        }
    });

    // Helper to check and wait for pause/stop
    async function checkExecutionControl() {
    if (executionControl.isStopped) {
        throw new Error('Workflow stopped by user');
    }
    
    while (executionControl.isPaused) {
        await sleep(200);
        if (executionControl.isStopped) {
            throw new Error('Workflow stopped by user');
        }
    }
}

async function executeWorkflow(workflow, data) {
    try {
        // Reset execution control
        executionControl.isPaused = false;
        executionControl.isStopped = false;
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false };
        
        currentWorkflowSettings = workflow?.settings || {};
        const steps = workflow.steps;
        
        // Get data from new dataSources structure or legacy dataSource
        let primaryData = [];
        let detailSources = {};
        let relationships = [];
        
        if (workflow.dataSources) {
            primaryData = workflow.dataSources.primary?.data || [];
            relationships = workflow.dataSources.relationships || [];
            
            // Index detail data sources by ID
            (workflow.dataSources.details || []).forEach(detail => {
                if (detail.data) {
                    detailSources[detail.id] = {
                        data: detail.data,
                        name: detail.name,
                        fields: detail.fields
                    };
                }
            });
        } else if (data) {
            // Legacy format
            primaryData = Array.isArray(data) ? data : [data];
        }
        
        // If no data, use a single empty row to run steps once
        if (primaryData.length === 0) {
            primaryData = [{}];
        }

        // Execute workflow with loop support
        await executeStepsWithLoops(steps, primaryData, detailSources, relationships, workflow.settings);

        window.postMessage({
            type: 'D365_WORKFLOW_COMPLETE',
            result: { processed: primaryData.length }
        }, '*');
    } catch (error) {
        if (!error || !error._reported) {
            window.postMessage({
                type: 'D365_WORKFLOW_ERROR',
                error: error?.message || String(error)
            }, '*');
        }
    }
}

async function executeStepsWithLoops(steps, primaryData, detailSources, relationships, settings) {
    // Apply skip/limit rows from run options
    const { skipRows = 0, limitRows = 0, dryRun = false } = executionControl.runOptions;
    
    const originalTotalRows = primaryData.length;
    let startRowNumber = 0; // The starting row number for display
    
    if (skipRows > 0) {
        primaryData = primaryData.slice(skipRows);
        startRowNumber = skipRows;
        sendLog('info', `Skipped first ${skipRows} rows`);
    }
    
    if (limitRows > 0 && primaryData.length > limitRows) {
        primaryData = primaryData.slice(0, limitRows);
        sendLog('info', `Limited to ${limitRows} rows`);
    }
    
    const totalRowsToProcess = primaryData.length;
    
    // Find loop structures
    const loopPairs = findLoopPairs(steps);
    
    // If no loops, execute all steps for each primary data row (legacy behavior)
    if (loopPairs.length === 0) {
        for (let rowIndex = 0; rowIndex < primaryData.length; rowIndex++) {
            await checkExecutionControl(); // Check for pause/stop
            
            const row = primaryData[rowIndex];
            const displayRowNumber = startRowNumber + rowIndex; // Actual row number in original data
            
            window.postMessage({
                type: 'D365_WORKFLOW_PROGRESS',
                progress: { 
                    phase: 'rowStart',
                    row: displayRowNumber, 
                    totalRows: originalTotalRows,
                    processedRows: rowIndex + 1,
                    totalToProcess: totalRowsToProcess,
                    step: 'Processing row' 
                }
            }, '*');
            
            for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
                await checkExecutionControl(); // Check for pause/stop
                await executeSingleStep(steps[stepIndex], stepIndex, row, {}, settings, dryRun);
            }
        }
        return;
    }
    
    // Execute steps with loop awareness
    let stepIndex = 0;
    let currentDataRow = primaryData[0] || {};
    
    while (stepIndex < steps.length) {
        await checkExecutionControl(); // Check for pause/stop
        const step = steps[stepIndex];
        
        if (step.type === 'loop-start') {
            // Find the matching loop-end
            const loopPair = loopPairs.find(p => p.startIndex === stepIndex);
            if (!loopPair) {
                throw new Error(`Loop start at index ${stepIndex} has no matching end`);
            }
            
            // Determine data source for this loop
            let loopData = primaryData;
            const loopDataSource = step.loopDataSource || 'primary';
            
            if (loopDataSource !== 'primary' && detailSources[loopDataSource]) {
                const detailSource = detailSources[loopDataSource];
                
                // If there's a relationship, filter detail data by the current primary row
                const rel = relationships.find(r => r.detailId === loopDataSource);
                if (rel && currentDataRow[rel.primaryField] !== undefined) {
                    loopData = detailSource.data.filter(d => 
                        String(d[rel.detailField]) === String(currentDataRow[rel.primaryField])
                    );
                } else {
                    loopData = detailSource.data;
                }
            }
            
            // Apply iteration limit
            const iterationLimit = step.iterationLimit || 0;
            if (iterationLimit > 0 && loopData.length > iterationLimit) {
                loopData = loopData.slice(0, iterationLimit);
            }
            
            // Execute the loop
            const loopSteps = steps.slice(loopPair.startIndex + 1, loopPair.endIndex);
            
            for (let iterIndex = 0; iterIndex < loopData.length; iterIndex++) {
                await checkExecutionControl(); // Check for pause/stop
                
                const iterRow = { ...currentDataRow, ...loopData[iterIndex] };
                const isPrimaryLoop = loopDataSource === 'primary';
                const totalRowsForLoop = isPrimaryLoop ? originalTotalRows : loopData.length;
                const totalToProcessForLoop = loopData.length;
                const displayRowNumber = isPrimaryLoop ? startRowNumber + iterIndex : iterIndex;
                
                window.postMessage({
                    type: 'D365_WORKFLOW_PROGRESS',
                    progress: {
                        phase: 'rowStart',
                        row: displayRowNumber,
                        totalRows: totalRowsForLoop,
                        processedRows: iterIndex + 1,
                        totalToProcess: totalToProcessForLoop,
                        step: 'Processing row'
                    }
                }, '*');
                
                window.postMessage({
                    type: 'D365_WORKFLOW_PROGRESS',
                    progress: {
                        phase: 'loopIteration',
                        iteration: iterIndex + 1,
                        total: loopData.length,
                        step: `Loop "${step.loopName || 'Loop'}": iteration ${iterIndex + 1}/${loopData.length}`
                    }
                }, '*');
                
                // Execute steps inside the loop
                for (let innerIdx = 0; innerIdx < loopSteps.length; innerIdx++) {
                    await checkExecutionControl(); // Check for pause/stop
                    
                    const innerStep = loopSteps[innerIdx];
                    const globalStepIndex = loopPair.startIndex + 1 + innerIdx;
                    
                    // Skip nested loops for now (handle recursively if needed)
                    if (innerStep.type === 'loop-start' || innerStep.type === 'loop-end') {
                        continue;
                    }
                    
                    await executeSingleStep(innerStep, globalStepIndex, iterRow, detailSources, settings, executionControl.runOptions.dryRun);
                }
            }
            
            // Jump past the loop-end
            stepIndex = loopPair.endIndex + 1;
        } else if (step.type === 'loop-end') {
            // Should not reach here if properly paired, but just skip
            stepIndex++;
        } else {
            // Regular step
            await executeSingleStep(step, stepIndex, currentDataRow, detailSources, settings, executionControl.runOptions.dryRun);
            stepIndex++;
        }
    }
}

// Helper to send logs
function sendLog(level, message) {
    window.postMessage({
        type: 'D365_WORKFLOW_LOG',
        log: { level, message }
    }, '*');
}

function findLoopPairs(steps) {
    const pairs = [];
    const stack = [];
    
    steps.forEach((step, index) => {
        if (step.type === 'loop-start') {
            stack.push({ startIndex: index, startStep: step });
        } else if (step.type === 'loop-end') {
            const start = stack.pop();
            if (start) {
                pairs.push({
                    startIndex: start.startIndex,
                    endIndex: index,
                    loopId: start.startStep.id,
                    loopName: start.startStep.loopName
                });
            }
        }
    });
    
    return pairs;
}

async function executeSingleStep(step, stepIndex, dataRow, detailSources, settings, dryRun = false) {
    const stepName = step.displayText || step.controlName || step.loopName || `Step ${stepIndex + 1}`;
    
    window.postMessage({
        type: 'D365_WORKFLOW_PROGRESS',
        progress: { phase: 'stepStart', stepIndex, stepName, step }
    }, '*');
    
    try {
        if (dryRun) {
            // In dry run mode, just log what would happen
            const description = describeStep(step, dataRow);
            sendLog('info', `[DRY RUN] Would execute: ${description}`);
            await sleep(100); // Small delay for visual feedback
        } else {
            await executeStep(step, dataRow, detailSources);
        }
        
        window.postMessage({
            type: 'D365_WORKFLOW_PROGRESS',
            progress: { phase: 'stepDone', stepIndex, stepName, step }
        }, '*');
    } catch (stepError) {
        window.postMessage({
            type: 'D365_WORKFLOW_ERROR',
            error: { message: stepError.message, stepIndex, step }
        }, '*');
        stepError._reported = true;
        throw stepError;
    }
    
    await sleep(settings?.delayBetweenSteps || 200);
}

function getWaitSuffix(step) {
    const flags = [];
    if (step.waitUntilVisible) flags.push('wait visible');
    if (step.waitUntilHidden) flags.push('wait hidden');
    if (flags.length === 0) return '';
    return ` (${flags.join(', ')})`;
}

// Describe a step for dry run logging
function describeStep(step, dataRow) {
    const { type, controlName, value, fieldMapping, displayText } = step;
    let resolvedValue = value;
    
    if (fieldMapping) {
        if (fieldMapping.includes(':')) {
            const [, fieldName] = fieldMapping.split(':');
            resolvedValue = dataRow[fieldName] || `{${fieldMapping}}`;
        } else {
            resolvedValue = dataRow[fieldMapping] || `{${fieldMapping}}`;
        }
    }
    
    const name = displayText || controlName;
    
    switch (type) {
        case 'click':
            return `Click "${name}"${getWaitSuffix(step)}`;
        case 'input':
        case 'select':
            return `Set "${name}" to "${resolvedValue}"${getWaitSuffix(step)}`;
        case 'grid-input':
            return `Set grid cell "${name}" to "${resolvedValue}"${getWaitSuffix(step)}`;
        case 'lookupSelect':
            return `Lookup "${resolvedValue}" in "${name}"${getWaitSuffix(step)}`;
        case 'checkbox':
            return `${coerceBoolean(resolvedValue) ? 'Check' : 'Uncheck'} "${name}"${getWaitSuffix(step)}`;
        case 'wait':
            return `Wait ${step.duration}ms`;
        case 'filter':
            return `Filter "${name}" ${step.filterMethod || 'is exactly'} "${resolvedValue}"`;
        case 'wait-until':
            return `Wait until "${name}" ${step.waitCondition || 'visible'}`;
        default:
            return `${type}: ${name}`;
    }
}

async function executeStep(step, dataRow, detailSources = {}) {
    const { type, controlName, value, fieldMapping } = step;

    // Skip loop markers
    if (type === 'loop-start' || type === 'loop-end') {
        return;
    }

    // Resolve value from data row if using field mapping
    let resolvedValue = value;
    if (fieldMapping) {
        // Check if it's a detail source field (format: detailId:fieldName)
        if (fieldMapping.includes(':')) {
            const [sourceId, fieldName] = fieldMapping.split(':');
            if (dataRow[fieldName] !== undefined) {
                resolvedValue = dataRow[fieldName];
            }
        } else if (dataRow[fieldMapping] !== undefined) {
            resolvedValue = dataRow[fieldMapping];
        }
    }

    const supportsWaitFlags = ['click', 'input', 'select', 'lookupSelect', 'checkbox', 'grid-input'].includes(type);
    const waitTimeout = step.waitTimeout || 10000;

    if (supportsWaitFlags && step.waitUntilVisible && controlName) {
        await waitUntilCondition(controlName, 'visible', null, waitTimeout);
    }

    switch (type) {
        case 'click':
            await clickElement(controlName);
            break;
        case 'input':
            await setInputValue(controlName, resolvedValue, step.fieldType);
            break;
        case 'select':
            await setInputValue(controlName, resolvedValue, step.fieldType);
            break;
        case 'grid-input':
            await setGridCellValue(controlName, resolvedValue, step.fieldType);
            break;
        case 'lookupSelect':
            await setLookupSelectValue(controlName, resolvedValue);
            break;
        case 'checkbox':
            await setCheckboxValue(controlName, resolvedValue);
            break;
        case 'wait':
            await sleep(step.duration || 1000);
            break;
        case 'filter':
            await applyGridFilter(controlName, resolvedValue, step.filterMethod || 'is exactly');
            break;
        case 'wait-until':
            await waitUntilCondition(controlName, step.waitCondition || 'visible', step.waitValue, step.timeout || 10000);
            break;
    }

    if (supportsWaitFlags && step.waitUntilHidden && controlName) {
        await waitUntilCondition(controlName, 'hidden', null, waitTimeout);
    }
}

// Find the best matching element, preferring elements in the active form (dialog/child form)
function findElementInActiveContext(controlName) {
    const allMatches = document.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
    
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];
    
    // Multiple matches - prefer the one in the active/topmost context
    
    // Priority 1: Element in an active dialog/modal (child forms)
    for (const el of allMatches) {
        const dialog = el.closest('[data-dyn-role="Dialog"], .dialog-container, .flyout-container, [role="dialog"]');
        if (dialog && isElementVisible(dialog)) {
            console.log(`Found ${controlName} in dialog context`);
            return el;
        }
    }
    
    // Priority 2: Element in a FastTab or TabPage that's expanded/active
    for (const el of allMatches) {
        const tabPage = el.closest('[data-dyn-role="TabPage"], .tabPage');
        if (tabPage) {
            // Check if the tab is expanded
            const isExpanded = tabPage.classList.contains('expanded') || 
                              tabPage.getAttribute('aria-expanded') === 'true' ||
                              !tabPage.classList.contains('collapsed');
            if (isExpanded && isElementVisible(el)) {
                console.log(`Found ${controlName} in expanded tab context`);
                return el;
            }
        }
    }
    
    // Priority 3: Element in the form context that has focus or was recently interacted with
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
        const activeFormContext = activeElement.closest('[data-dyn-form-name], [data-dyn-role="Form"]');
        if (activeFormContext) {
            for (const el of allMatches) {
                if (activeFormContext.contains(el) && isElementVisible(el)) {
                    console.log(`Found ${controlName} in active form context`);
                    return el;
                }
            }
        }
    }
    
    // Priority 4: Any visible element (prefer later ones as they're often in child forms rendered on top)
    const visibleMatches = Array.from(allMatches).filter(el => isElementVisible(el));
    if (visibleMatches.length > 0) {
        // Return the last visible match (often the child form's element)
        return visibleMatches[visibleMatches.length - 1];
    }
    
    // Fallback: first match
    return allMatches[0];
}

function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && 
           rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
}

async function clickElement(controlName) {
    const element = findElementInActiveContext(controlName);
    if (!element) throw new Error(`Element not found: ${controlName}`);
    
    element.click();
    await sleep(800);
}

// ====== Grid Filter Function ======
async function applyGridFilter(controlName, filterValue, filterMethod = 'is exactly') {
    console.log(`Applying filter: ${controlName} ${filterMethod} "${filterValue}"`);
    
    // Extract grid name and column name from controlName
    // Format: GridName_ColumnName (e.g., "GridReadOnlyMarkupTable_MarkupCode")
    const lastUnderscoreIdx = controlName.lastIndexOf('_');
    const gridName = controlName.substring(0, lastUnderscoreIdx);
    const columnName = controlName.substring(lastUnderscoreIdx + 1);
    
    console.log(`  Grid: ${gridName}, Column: ${columnName}`);
    
    // Helper function to find filter input with multiple patterns
    async function findFilterInput() {
        // D365 creates filter inputs with various patterns
        const filterFieldPatterns = [
            `FilterField_${gridName}_${columnName}_${columnName}_Input_0`,
            `FilterField_${controlName}_${columnName}_Input_0`,
            `FilterField_${controlName}_Input_0`,
            `FilterField_${gridName}_${columnName}_Input_0`,
            // Additional patterns for different D365 versions
            `${controlName}_FilterField_Input`,
            `${gridName}_${columnName}_FilterField`
        ];
        
        let filterInput = null;
        let filterFieldContainer = null;
        
        // Try exact patterns first
        for (const pattern of filterFieldPatterns) {
            filterFieldContainer = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
            if (filterFieldContainer) {
                filterInput = filterFieldContainer.querySelector('input:not([type="hidden"])') || 
                             filterFieldContainer.querySelector('input');
                if (filterInput && filterInput.offsetParent !== null) {
                    console.log(`  Found filter field: ${pattern}`);
                    return { filterInput, filterFieldContainer };
                }
            }
        }
        
        // Try partial match on FilterField containing the column name
        const partialMatches = document.querySelectorAll(`[data-dyn-controlname*="FilterField"][data-dyn-controlname*="${columnName}"]`);
        for (const container of partialMatches) {
            filterInput = container.querySelector('input:not([type="hidden"])');
            if (filterInput && filterInput.offsetParent !== null) {
                console.log(`  Found filter field (partial match): ${container.getAttribute('data-dyn-controlname')}`);
                return { filterInput, filterFieldContainer: container };
            }
        }
        
        // Fallback: Find any visible filter input in filter dropdown/flyout area
        // Look for inputs inside filter-related containers
        const filterContainers = document.querySelectorAll('.dyn-filter-popup, .filter-panel, [data-dyn-role="FilterPane"], [class*="filter"]');
        for (const container of filterContainers) {
            filterInput = container.querySelector('input:not([type="hidden"]):not([readonly])');
            if (filterInput && filterInput.offsetParent !== null) {
                console.log(`  Found filter input in filter container`);
                return { filterInput, filterFieldContainer: container };
            }
        }
        
        // Last resort: Any visible FilterField input
        const visibleFilterInputs = document.querySelectorAll('[data-dyn-controlname*="FilterField"] input:not([type="hidden"])');
        for (const inp of visibleFilterInputs) {
            if (inp.offsetParent !== null) {
                filterFieldContainer = inp.closest('[data-dyn-controlname*="FilterField"]');
                console.log(`  Found visible filter field: ${filterFieldContainer?.getAttribute('data-dyn-controlname')}`);
                return { filterInput: inp, filterFieldContainer };
            }
        }
        
        return { filterInput: null, filterFieldContainer: null };
    }
    
    // First, check if the filter panel is already open
    let { filterInput, filterFieldContainer } = await findFilterInput();
    
    // If filter input not found, we need to click the column header to open the filter dropdown
    if (!filterInput) {
        console.log(`  Filter panel not open, clicking header to open...`);
        
        // Find the actual header cell
        const allHeaders = document.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
        let clickTarget = null;
        
        for (const h of allHeaders) {
            if (h.classList.contains('dyn-headerCell') || 
                h.id?.includes('header') ||
                h.closest('.dyn-headerCell') ||
                h.closest('[role="columnheader"]')) {
                clickTarget = h;
                break;
            }
        }
        
        // Try by ID pattern
        if (!clickTarget) {
            clickTarget = document.querySelector(`[id*="${controlName}"][id*="header"]`);
        }
        
        // Fallback to first element with controlName
        if (!clickTarget) {
            clickTarget = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
        }
        
        if (!clickTarget) {
            throw new Error(`Filter column header not found: ${controlName}`);
        }
        
        clickTarget.click();
        await sleep(800); // Wait longer for dropdown to open
        
        // Retry finding the filter input with a wait loop
        for (let attempt = 0; attempt < 10; attempt++) {
            ({ filterInput, filterFieldContainer } = await findFilterInput());
            if (filterInput) break;
            await sleep(200);
        }
    }
    
    if (!filterInput) {
        // Debug: Log what elements we can find
        const allFilterFields = document.querySelectorAll('[data-dyn-controlname*="FilterField"]');
        console.log(`  Debug: Found ${allFilterFields.length} FilterField elements:`);
        allFilterFields.forEach(el => {
            console.log(`    - ${el.getAttribute('data-dyn-controlname')}, visible: ${el.offsetParent !== null}`);
        });
        
        throw new Error(`Filter input not found. Make sure the filter dropdown is open. Expected pattern: FilterField_${gridName}_${columnName}_${columnName}_Input_0`);
    }
    
    // Step 4: Set the filter method if not "is exactly" (default)
    if (filterMethod && filterMethod !== 'is exactly') {
        await setFilterMethod(filterFieldContainer, filterMethod);
    }
    
    // Step 5: Enter the filter value
    filterInput.focus();
    await sleep(100);
    filterInput.select();
    
    // Clear existing value first
    filterInput.value = '';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    
    // Set the value using native setter
    setNativeValue(filterInput, filterValue);
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
    filterInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
    
    // Step 6: Apply the filter - find and click the Apply button
    // IMPORTANT: The pattern is {GridName}_{ColumnName}_ApplyFilters, not just {GridName}_ApplyFilters
    const applyBtnPatterns = [
        `${gridName}_${columnName}_ApplyFilters`,  // Most common: GridReadOnlyMarkupTable_MarkupCode_ApplyFilters
        `${controlName}_ApplyFilters`,
        `${gridName}_ApplyFilters`,
        `ApplyFilters`
    ];
    
    let applyBtn = null;
    for (const pattern of applyBtnPatterns) {
        applyBtn = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
        if (applyBtn && applyBtn.offsetParent !== null) {
            console.log(`  Found apply button: ${pattern}`);
            break;
        }
    }
    
    // Fallback: find any visible ApplyFilters button
    if (!applyBtn || applyBtn.offsetParent === null) {
        const allApplyBtns = document.querySelectorAll('[data-dyn-controlname*="ApplyFilters"]');
        for (const btn of allApplyBtns) {
            if (btn.offsetParent !== null) {
                applyBtn = btn;
                break;
            }
        }
    }
    
    if (applyBtn) {
        applyBtn.click();
        await sleep(1000);
        console.log(`  ✓ Filter applied: "${filterValue}"`);
    } else {
        // Try pressing Enter as alternative
        filterInput.dispatchEvent(new KeyboardEvent('keydown', { 
            key: 'Enter', keyCode: 13, code: 'Enter', bubbles: true 
        }));
        filterInput.dispatchEvent(new KeyboardEvent('keyup', { 
            key: 'Enter', keyCode: 13, code: 'Enter', bubbles: true 
        }));
        await sleep(1000);
        console.log(`  ✓ Filter applied via Enter: "${filterValue}"`);
    }
}

async function setFilterMethod(filterContainer, method) {
    // Find the filter operator dropdown near the filter input
    // D365 uses various patterns for the operator dropdown
    const operatorPatterns = [
        '[data-dyn-controlname*="FilterOperator"]',
        '[data-dyn-controlname*="_Operator"]',
        '.filter-operator',
        '[data-dyn-role="ComboBox"]'
    ];
    
    let operatorDropdown = null;
    const searchContainer = filterContainer?.parentElement || document;
    
    for (const pattern of operatorPatterns) {
        operatorDropdown = searchContainer.querySelector(pattern);
        if (operatorDropdown && operatorDropdown.offsetParent !== null) break;
    }
    
    if (!operatorDropdown) {
        console.log(`  ⚠ Filter operator dropdown not found, using default method`);
        return;
    }
    
    // Click to open the dropdown
    const dropdownButton = operatorDropdown.querySelector('button, [role="combobox"], .dyn-comboBox-button') || operatorDropdown;
    dropdownButton.click();
    await sleep(300);
    
    // Find and click the matching option
    const methodMappings = {
        'is exactly': ['is exactly', 'equals', 'is equal to', '='],
        'contains': ['contains', 'like'],
        'begins with': ['begins with', 'starts with'],
        'is not': ['is not', 'not equal', '!=', '<>'],
        'does not contain': ['does not contain', 'not like'],
        'is one of': ['is one of', 'in'],
        'after': ['after', 'greater than', '>'],
        'before': ['before', 'less than', '<'],
        'matches': ['matches', 'regex', 'pattern']
    };
    
    const searchTerms = methodMappings[method] || [method];
    
    // Look for options in listbox/dropdown
    const options = document.querySelectorAll('[role="option"], [role="listitem"], .dyn-listView-item');
    for (const opt of options) {
        const text = opt.textContent.toLowerCase();
        for (const term of searchTerms) {
            if (text.includes(term.toLowerCase())) {
                opt.click();
                await sleep(200);
                console.log(`  Set filter method: ${method}`);
                return;
            }
        }
    }
    
    // Try select element
    const selectEl = operatorDropdown.querySelector('select');
    if (selectEl) {
        for (const opt of selectEl.options) {
            const text = opt.textContent.toLowerCase();
            for (const term of searchTerms) {
                if (text.includes(term.toLowerCase())) {
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    await sleep(200);
                    console.log(`  Set filter method: ${method}`);
                    return;
                }
            }
        }
    }
    
    console.log(`  ⚠ Could not set filter method "${method}", using default`);
}

// ====== Wait Until Condition Function ======
async function waitUntilCondition(controlName, condition, expectedValue, timeout) {
    console.log(`Waiting for: ${controlName} to be ${condition} (timeout: ${timeout}ms)`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
        
        let conditionMet = false;
        
        switch (condition) {
            case 'visible':
                // Element exists and is visible (has layout)
                conditionMet = element && element.offsetParent !== null && 
                              getComputedStyle(element).visibility !== 'hidden' &&
                              getComputedStyle(element).display !== 'none';
                break;
                
            case 'hidden':
                // Element doesn't exist or is not visible
                conditionMet = !element || element.offsetParent === null ||
                              getComputedStyle(element).visibility === 'hidden' ||
                              getComputedStyle(element).display === 'none';
                break;
                
            case 'exists':
                // Element exists in DOM
                conditionMet = element !== null;
                break;
                
            case 'not-exists':
                // Element does not exist in DOM
                conditionMet = element === null;
                break;
                
            case 'enabled':
                // Element exists and is not disabled
                if (element) {
                    const input = element.querySelector('input, button, select, textarea') || element;
                    conditionMet = !input.disabled && !input.hasAttribute('aria-disabled');
                }
                break;
                
            case 'has-value':
                // Element has a specific value
                if (element) {
                    const input = element.querySelector('input, textarea, select') || element;
                    const currentValue = input.value || input.textContent || '';
                    conditionMet = currentValue.trim() === String(expectedValue).trim();
                }
                break;
        }
        
        if (conditionMet) {
            console.log(`  ✓ Condition met: ${controlName} is ${condition}`);
            await sleep(200); // Small stability delay
            return;
        }
        
        await sleep(100);
    }
    
    throw new Error(`Timeout waiting for "${controlName}" to be ${condition} (waited ${timeout}ms)`);
}

async function setInputValue(controlName, value, fieldType) {
    const element = findElementInActiveContext(controlName);
    if (!element) throw new Error(`Element not found: ${controlName}`);

    // For SegmentedEntry fields (Account, etc), use lookup button approach
    if (fieldType?.type === 'segmented-lookup' || isSegmentedEntry(element)) {
        await setSegmentedEntryValue(element, value);
        return;
    }

    // For ComboBox/enum fields, open dropdown and select
    if (fieldType?.inputType === 'enum' || element.getAttribute('data-dyn-role') === 'ComboBox') {
        await setComboBoxValue(element, value);
        return;
    }

    const input = element.querySelector('input, textarea, select');
    if (!input) throw new Error(`Input not found in: ${controlName}`);

    // Focus the input first
    input.focus();
    await sleep(150);

    if (input.tagName !== 'SELECT') {
        // Use the selected combobox input method
        await comboInputWithSelectedMethod(input, value);
    } else {
        setNativeValue(input, value);
    }

    // Dispatch events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(400);
}

// ====== Grid Cell Input Function ======
// Sets value in a grid cell (for creating/editing records in grids like Sales order lines)
async function setGridCellValue(controlName, value, fieldType) {
    console.log(`Setting grid cell value: ${controlName} = "${value}"`);
    
    // Find the cell element - prefer the one in an active/selected row
    let element = findGridCellElement(controlName);
    
    if (!element) {
        // Try clicking on the grid row first to activate it
        await activateGridRow(controlName);
        await sleep(300);
        element = findGridCellElement(controlName);
    }
    
    if (!element) {
        throw new Error(`Grid cell element not found: ${controlName}`);
    }
    
    // For React FixedDataTable grids, we need to click on the cell to enter edit mode
    // Find the actual cell container (fixedDataTableCellLayout_main)
    const reactCell = element.closest('.fixedDataTableCellLayout_main') || element;
    const isReactGrid = !!element.closest('.reactGrid');
    
    // Click on the cell to activate it for editing
    console.log(`  Clicking cell to activate: isReactGrid=${isReactGrid}`);
    reactCell.click();
    await sleep(300);
    
    // For React grids, D365 renders input fields dynamically after clicking
    // We need to re-find the element after clicking as D365 may have replaced the DOM
    if (isReactGrid) {
        await sleep(200); // Extra wait for React to render input
        element = findGridCellElement(controlName);
        if (!element) {
            throw new Error(`Grid cell element not found after click: ${controlName}`);
        }
    }
    
    // The click should activate the cell - now find the input
    let input = element.querySelector('input:not([type="hidden"]), textarea, select');
    
    // If no input found directly, look in the cell container
    if (!input && isReactGrid) {
        const cellContainer = element.closest('.fixedDataTableCellLayout_main');
        if (cellContainer) {
            input = cellContainer.querySelector('input:not([type="hidden"]), textarea, select');
        }
    }
    
    // If no input found directly, try getting it after click activation with retry
    if (!input) {
        for (let attempt = 0; attempt < 5; attempt++) {
            await sleep(200);
            input = element.querySelector('input:not([type="hidden"]), textarea, select');
            if (input && input.offsetParent !== null) break;
            
            // Also check if a new input appeared in the cell
            const cellContainer = element.closest('.fixedDataTableCellLayout_main');
            if (cellContainer) {
                input = cellContainer.querySelector('input:not([type="hidden"]), textarea, select');
                if (input && input.offsetParent !== null) break;
            }
        }
    }
    
    // Still no input? Check if the element itself is an input
    if (!input && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')) {
        input = element;
    }
    
    // Try to find input in the parent row
    if (!input) {
        const row = element.closest('.fixedDataTableRowLayout_main, [data-dyn-role="Row"], [role="row"], tr');
        if (row) {
            const possibleInputs = row.querySelectorAll(`[data-dyn-controlname="${controlName}"] input:not([type="hidden"]), [data-dyn-controlname="${controlName}"] textarea`);
            for (const inp of possibleInputs) {
                if (inp.offsetParent !== null) {
                    input = inp;
                    break;
                }
            }
        }
    }
    
    // Last resort: find any visible input in the active cell area
    if (!input && isReactGrid) {
        const activeCell = document.querySelector('.dyn-activeRowCell, .fixedDataTableCellLayout_main:focus-within');
        if (activeCell) {
            input = activeCell.querySelector('input:not([type="hidden"]), textarea, select');
        }
    }
    
    if (!input) {
        // Log available elements for debugging
        const gridContainer = element.closest('.reactGrid, [data-dyn-role="Grid"]');
        const allInputs = gridContainer?.querySelectorAll('input:not([type="hidden"])');
        console.log('Available inputs in grid:', Array.from(allInputs || []).map(i => ({
            name: i.closest('[data-dyn-controlname]')?.getAttribute('data-dyn-controlname'),
            visible: i.offsetParent !== null
        })));
        throw new Error(`Input not found in grid cell: ${controlName}. The cell may need to be clicked to become editable.`);
    }
    
    // Determine field type and use appropriate setter
    const role = element.getAttribute('data-dyn-role');
    
    if (fieldType?.type === 'segmented-lookup' || role === 'SegmentedEntry' || isSegmentedEntry(element)) {
        await setSegmentedEntryValue(element, value);
        return;
    }
    
    if (fieldType?.inputType === 'enum' || role === 'ComboBox') {
        await setComboBoxValue(element, value);
        return;
    }
    
    // Check for lookup fields
    if (role === 'Lookup' || role === 'ReferenceGroup' || hasLookupButton(element)) {
        await setLookupSelectValue(controlName, value);
        return;
    }
    
    // Standard input - focus and set value
    input.focus();
    await sleep(100);
    
    // Clear existing value
    input.select?.();
    await sleep(50);
    
    // Use the standard input method
    await comboInputWithSelectedMethod(input, value);
    
    // Dispatch events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Tab out to commit the value (important for D365 grids)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    await sleep(300);
    
    console.log(`  Grid cell value set: ${controlName} = "${value}"`);
}

// Find a grid cell element, preferring the one in the active/selected row
function findGridCellElement(controlName) {
    // First, try to find in an active/selected row (traditional D365 grids)
    const selectedRows = document.querySelectorAll('[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow');
    for (const row of selectedRows) {
        const cell = row.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell && cell.offsetParent !== null) {
            return cell;
        }
    }
    
    // Try React FixedDataTable grids - find active row
    const reactGrids = document.querySelectorAll('.reactGrid');
    for (const grid of reactGrids) {
        // Look for active/selected row
        const activeRow = grid.querySelector('.fixedDataTableRowLayout_main[aria-selected="true"], .fixedDataTableRowLayout_main[data-dyn-row-active="true"]');
        if (activeRow) {
            const cell = activeRow.querySelector(`[data-dyn-controlname="${controlName}"]`);
            if (cell && cell.offsetParent !== null) {
                return cell;
            }
        }
        
        // Try finding in body rows
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            const cells = bodyContainer.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
            for (const cell of cells) {
                // Skip if in header
                const isInHeader = cell.closest('.fixedDataTableLayout_header, .dyn-headerCell');
                if (!isInHeader && cell.offsetParent !== null) {
                    return cell;
                }
            }
        }
    }
    
    // Try to find in traditional D365 grid context
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
        // Find all matching cells and prefer visible/editable ones
        const cells = grid.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
        for (const cell of cells) {
            // Check if it's in a data row (not header)
            const isInHeader = cell.closest('[data-dyn-role="ColumnHeader"], [role="columnheader"], thead');
            if (!isInHeader && cell.offsetParent !== null) {
                return cell;
            }
        }
    }
    
    // Fallback to standard element finding
    return findElementInActiveContext(controlName);
}

// Try to activate a grid row for editing
async function activateGridRow(controlName) {
    // Try React FixedDataTable grids first
    const reactGrids = document.querySelectorAll('.reactGrid');
    for (const grid of reactGrids) {
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            const cell = bodyContainer.querySelector(`[data-dyn-controlname="${controlName}"]`);
            if (cell) {
                // Find the row containing this cell
                const row = cell.closest('.fixedDataTableRowLayout_main');
                if (row) {
                    // Click on the row to select it
                    row.click();
                    await sleep(200);
                    return true;
                }
            }
        }
    }
    
    // Try traditional D365 grids
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
        // Find the cell
        const cell = grid.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell) {
            // Find the row containing this cell
            const row = cell.closest('[data-dyn-role="Row"], [role="row"], tr');
            if (row) {
                // Click on the row to select it
                row.click();
                await sleep(200);
                return true;
            }
        }
    }
    return false;
}

// Check if element has a lookup button
function hasLookupButton(element) {
    return element.classList.contains('field-hasLookupButton') ||
           element.querySelector('.lookup-button, [data-dyn-role="LookupButton"]') !== null ||
           element.nextElementSibling?.classList.contains('lookup-button');
}

async function setSegmentedEntryValue(element, value) {
    const input = element.querySelector('input, [role="textbox"]');
    if (!input) throw new Error('Input not found in SegmentedEntry');

    // Find the lookup button
    const lookupButton = findLookupButton(element);
    
    // If no lookup button, try keyboard to open the flyout first
    if (!lookupButton) {
        await setValueWithVerify(input, value);
        await openLookupByKeyboard(input);
    }

    // Click the lookup button to open the dropdown
    if (lookupButton) {
        lookupButton.click();
        await sleep(800); // Wait for lookup to load
    }

    // Find the lookup popup/flyout
    const lookupPopup = await waitForLookupPopup();
    if (!lookupPopup) {
        if (!currentWorkflowSettings?.suppressLookupWarnings) {
            console.warn('Lookup popup not found, trying direct input');
        }
        await setValueWithVerify(input, value);
        await commitLookupValue(input);
        return;
    }

    // If a docked lookup flyout exists (segmented entry), type into its filter input
    const dock = await waitForLookupDockForElement(element, 1500);
    if (dock) {
        const dockInput = findLookupFilterInput(dock);
        if (dockInput) {
            dockInput.click?.();
            dockInput.focus();
            await sleep(50);
            await comboInputWithSelectedMethod(dockInput, value);
            dockInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            dockInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            await sleep(800);
        }
    }

    // Type value in the search/filter field of the lookup
    const lookupInput = lookupPopup.querySelector('input[type="text"], input[role="textbox"]');
    if (lookupInput) {
        lookupInput.click?.();
        lookupInput.focus();
        await sleep(50);
        await comboInputWithSelectedMethod(lookupInput, value);
        lookupInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        lookupInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        await sleep(1000); // Wait for server filter
    } else {
        await setValueWithVerify(input, value);
    }

    // Find and click the matching row
    const rows = await waitForLookupRows(lookupPopup, element, 5000);
    let foundMatch = false;
    
    for (const row of rows) {
        const text = row.textContent.trim().replace(/\s+/g, ' ');
        if (text.toLowerCase().includes(String(value).toLowerCase())) {
            const cell = row.querySelector('[role="gridcell"], td');
            (cell || row).click();
            foundMatch = true;
            await sleep(500);
            await commitLookupValue(input);
            break;
        }
    }

    if (!foundMatch) {
        const sample = Array.from(rows).slice(0, 8).map(r => r.textContent.trim().replace(/\s+/g, ' '));
        if (!currentWorkflowSettings?.suppressLookupWarnings) {
            console.warn('No matching lookup value found, closing popup', { value, sample });
        }
        // Try to close the popup
        const closeBtn = lookupPopup.querySelector('[data-dyn-controlname="Close"], .close-button');
        if (closeBtn) closeBtn.click();
        
        // Fallback to direct typing
        await sleep(300);
        await setValueWithVerify(input, value);
        await commitLookupValue(input);
    }
}

async function setComboBoxValue(element, value) {
    const input = element.querySelector('input, [role="textbox"], select');
    if (!input) throw new Error('Input not found in ComboBox');

    // If it's a native select, use option selection
    if (input.tagName === 'SELECT') {
        const options = Array.from(input.options);
        const target = options.find(opt => opt.text.trim().toLowerCase() === String(value).toLowerCase()) ||
                       options.find(opt => opt.text.toLowerCase().includes(String(value).toLowerCase()));
        if (!target) throw new Error(`Option not found: ${value}`);
        input.value = target.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(300);
        return;
    }

    // Open the dropdown (button preferred)
    const comboButton = findComboBoxButton(element);
    if (comboButton) {
        comboButton.click();
    } else {
        input.click?.();
    }
    input.focus();
    await sleep(200);

    // Try typing to filter when allowed (use selected input method)
    if (!input.readOnly && !input.disabled) {
        await comboInputWithSelectedMethod(input, value);
    }

    // Find listbox near the field or linked via aria-controls
    const listbox = await waitForListboxForInput(input, element);
    if (!listbox) {
        // Fallback: press Enter to commit typed value
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        await sleep(300);
        return;
    }

    const options = collectComboOptions(listbox);
    const search = normalizeText(value);
    let matched = false;
    for (const option of options) {
        const text = normalizeText(option.textContent);
        if (text === search || text.includes(search)) {
            // Try to mark selection for ARIA-based comboboxes
            options.forEach(opt => opt.setAttribute('aria-selected', 'false'));
            option.setAttribute('aria-selected', 'true');
            if (!option.id) {
                option.id = `d365opt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            }
            input.setAttribute('aria-activedescendant', option.id);

            option.scrollIntoView({ block: 'nearest' });
            const optionText = option.textContent.trim();

            // Click the option to select it
            dispatchClickSequence(option);

            const applied = await waitForInputValue(input, optionText, 800);
            if (!applied) {
                // Some D365 combos commit on key selection rather than click
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            }

            // Force input value update for D365 comboboxes
            await sleep(400);
            if (normalizeText(input.value) !== normalizeText(optionText)) {
                commitComboValue(input, optionText, element);
            } else {
                commitComboValue(input, input.value, element);
            }

            matched = true;
            await sleep(300);
            break;
        }
    }

    if (!matched) {
        throw new Error(`Option not found: ${value}`);
    }
}

async function setLookupSelectValue(controlName, value) {
    const element = findElementInActiveContext(controlName);
    if (!element) throw new Error(`Element not found: ${controlName}`);

    const input = element.querySelector('input, [role="textbox"]');
    if (!input) throw new Error('Input not found in lookup field');

    const lookupButton = findLookupButton(element);
    if (lookupButton) {
        lookupButton.click();
        await sleep(800);
    } else {
        // Try to open by focusing and keyboard
        input.focus();
        await sleep(100);
        await setValueWithVerify(input, value);
        await openLookupByKeyboard(input);
    }

    const lookupDock = await waitForLookupDockForElement(element);
    if (!lookupDock) {
        throw new Error('Lookup flyout not found');
    }

    // Try typing into a lookup flyout input if present (e.g., MainAccount)
    const dockInput = findLookupFilterInput(lookupDock);
    if (dockInput) {
        dockInput.click();
        dockInput.focus();
        await sleep(50);
        await comboInputWithSelectedMethod(dockInput, value);
        dockInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        dockInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        await sleep(600);
    }

    const rows = await waitForLookupRows(lookupDock, element);
    if (!rows.length) {
        throw new Error('Lookup list is empty');
    }

    const searchValue = String(value ?? '').toLowerCase();
    let matched = false;
    for (const row of rows) {
        const text = row.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
        const firstCell = row.querySelector('[role="gridcell"], td');
        const firstText = firstCell ? firstCell.textContent.trim().toLowerCase() : '';
        if (firstText === searchValue || text.includes(searchValue)) {
            const target = firstCell || row;
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            target.click();
            matched = true;
            await sleep(500);
            // Some D365 lookups require Enter or double-click to commit selection
            target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            await commitLookupValue(input);
            const applied = await waitForInputValue(input, value);
            if (!applied) {
                // Try a second commit pass if the value did not stick
                target.click();
                await sleep(200);
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
                await commitLookupValue(input);
            }
            break;
        }
    }

    if (!matched) {
        throw new Error(`Lookup value not found: ${value}`);
    }
}

async function typeValueSlowly(input, value) {
    if (typeof input.click === 'function') {
        input.click();
    }
    input.focus();
    await sleep(100);
    
    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    
    // Type character by character
    const stringValue = String(value);
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        setNativeValue(input, input.value + char);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(80); // 80ms per character
    }
    
    await sleep(200);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await sleep(800); // Wait for validation
}

async function typeValueWithInputEvents(input, value) {
    if (typeof input.click === 'function') {
        input.click();
    }
    input.focus();
    await sleep(80);

    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);

    const stringValue = String(value ?? '');
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        setNativeValue(input, input.value + char);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(60);
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
}

async function waitForInputValue(input, value, timeoutMs = 2000) {
    const expected = String(value ?? '').trim();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const current = String(input?.value ?? '').trim();
        if (current === expected) return true;
        await sleep(100);
    }
    return false;
}

async function setCheckboxValue(controlName, value) {
    const element = findElementInActiveContext(controlName);
    if (!element) throw new Error(`Element not found: ${controlName}`);

    // D365 checkboxes can be:
    // 1. Standard input[type="checkbox"]
    // 2. Custom toggle with role="checkbox" or role="switch"
    // 3. Element with aria-checked attribute (the container itself)
    // 4. Element with data-dyn-role="CheckBox"
    
    let checkbox = element.querySelector('input[type="checkbox"]');
    let isCustomToggle = false;
    
    if (!checkbox) {
        // Try to find custom toggle element
        checkbox = element.querySelector('[role="checkbox"], [role="switch"]');
        if (checkbox) {
            isCustomToggle = true;
        }
    }
    
    if (!checkbox) {
        // Check if the element itself is the toggle (D365 often does this)
        if (element.getAttribute('aria-checked') !== null || 
            element.getAttribute('role') === 'checkbox' ||
            element.getAttribute('role') === 'switch' ||
            element.getAttribute('data-dyn-role') === 'CheckBox') {
            checkbox = element;
            isCustomToggle = true;
        }
    }
    
    if (!checkbox) {
        // Last resort: find any clickable toggle-like element
        checkbox = element.querySelector('button, [tabindex="0"]');
        if (checkbox) {
            isCustomToggle = true;
        }
    }
    
    if (!checkbox) throw new Error(`Checkbox not found in: ${controlName}. Element HTML: ${element.outerHTML.substring(0, 200)}`);

    const shouldCheck = coerceBoolean(value);
    
    // Determine current state
    let isCurrentlyChecked;
    if (isCustomToggle) {
        isCurrentlyChecked = checkbox.getAttribute('aria-checked') === 'true' || 
                            checkbox.classList.contains('checked') ||
                            checkbox.classList.contains('on') ||
                            checkbox.getAttribute('data-checked') === 'true';
    } else {
        isCurrentlyChecked = checkbox.checked;
    }

    // Only click if state needs to change
    if (shouldCheck !== isCurrentlyChecked) {
        checkbox.click();
        await sleep(300);
        
        // For custom toggles, also try dispatching events if click didn't work
        if (isCustomToggle) {
            checkbox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            checkbox.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setNativeValue(input, value) {
    const isTextArea = input.tagName === 'TEXTAREA';
    const descriptor = isTextArea ? 
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') :
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

    if (descriptor && descriptor.set) {
        descriptor.set.call(input, value);
    } else {
        input.value = value;
    }
}

function isSegmentedEntry(element) {
    if (element.getAttribute('data-dyn-role') === 'SegmentedEntry') return true;
    if (element.classList.contains('segmentedEntry') || element.classList.contains('segmented-entry')) return true;
    if (element.querySelector('[data-dyn-role="SegmentedEntry"]')) return true;
    return false;
}

async function setValueOnce(input, value, clearFirst = false) {
    input.focus();
    await sleep(100);
    if (clearFirst) {
        setNativeValue(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);
    }
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
}

async function setValueWithVerify(input, value) {
    const expected = String(value ?? '').trim();
    await setValueOnce(input, value, true);
    await sleep(150);
    if (String(input.value ?? '').trim() !== expected) {
        await typeValueSlowly(input, expected);
    }
}

function findLookupButton(element) {
    const selectors = ['.lookup-button', '.lookupButton', '[data-dyn-role="LookupButton"]'];
    for (const selector of selectors) {
        const direct = element.querySelector(selector);
        if (direct) return direct;
    }
    const container = element.closest('.input_container, .form-group, .lookupField') || element.parentElement;
    if (!container) return null;
    for (const selector of selectors) {
        const inContainer = container.querySelector(selector);
        if (inContainer) return inContainer;
    }
    const ariaButton = container.querySelector('button[aria-label*="Lookup"], button[aria-label*="Open"], button[aria-label*="Select"]');
    if (ariaButton) return ariaButton;
    return null;
}

async function openLookupByKeyboard(input) {
    input.focus();
    await sleep(50);
    // Try Alt+Down then F4 (common D365/Win controls)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', altKey: true, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', altKey: true, bubbles: true }));
    await sleep(150);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', code: 'F4', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'F4', code: 'F4', bubbles: true }));
    await sleep(300);
}

async function commitLookupValue(input) {
    // D365 segmented lookups often validate on Tab/Enter and blur
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(800);
}

async function waitForLookupPopup(timeoutMs = 2000) {
    const selectors = [
        '.lookup-buttonContainer',
        '.lookupDock-buttonContainer',
        '[role="dialog"]',
        '.lookup-flyout',
        '.lookupFlyout',
        '[data-dyn-role="Lookup"]',
        '[data-dyn-role="LookupGrid"]',
        '.lookup-container',
        '.lookup',
        '[role="grid"]',
        'table'
    ];
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        for (const selector of selectors) {
            const popup = document.querySelector(selector);
            if (!popup) continue;
            if (popup.classList?.contains('messageCenter')) continue;
            if (popup.getAttribute('aria-label') === 'Action center') continue;
            if (!isElementVisibleGlobal(popup)) continue;
            return popup;
        }
        await sleep(100);
    }
    return null;
}

function isElementVisibleGlobal(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return element.offsetParent !== null &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';
}

async function waitForLookupRows(lookupDock, targetElement, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        let rows = lookupDock?.querySelectorAll?.('tr[data-dyn-row], .lookup-row, [role="row"]') || [];
        if (rows.length) return rows;

        // Fallback: find visible lookup rows anywhere (some docks render outside the container)
        const globalRows = Array.from(document.querySelectorAll('tr[data-dyn-row], .lookup-row, [role="row"]'))
            .filter(isElementVisibleGlobal);
        if (globalRows.length) {
            return pickNearestRows(globalRows, targetElement);
        }
        await sleep(150);
    }
    return [];
}

function pickNearestRows(rows, targetElement) {
    if (!rows.length) return rows;
    const targetRect = targetElement?.getBoundingClientRect?.();
    if (!targetRect) return rows;
    return rows.slice().sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const da = Math.abs(ra.left - targetRect.left) + Math.abs(ra.top - targetRect.bottom);
        const db = Math.abs(rb.left - targetRect.left) + Math.abs(rb.top - targetRect.bottom);
        return da - db;
    });
}

function findLookupFilterInput(lookupDock) {
    if (!lookupDock) return null;
    const candidates = Array.from(
        lookupDock.querySelectorAll('input[type="text"], input[role="textbox"]')
    );
    if (!candidates.length) return null;

    // Prefer inputs inside segmented entry flyout (MainAccount input in the right panel)
    const segmentInput = candidates.find(input => input.closest('.segmentedEntry-flyoutSegment'));
    if (segmentInput) return segmentInput;

    // Some flyouts wrap the input in a container; try to find the actual input inside
    const segmentContainer = lookupDock.querySelector('.segmentedEntry-flyoutSegment .segmentedEntry-segmentInput');
    if (segmentContainer) {
        const inner = segmentContainer.querySelector('input, [role="textbox"]');
        if (inner) return inner;
    }

    // Prefer inputs inside grid header/toolbar or near the top-right (like the marked box)
    const headerCandidate = candidates.find(input =>
        input.closest('.lookup-header, .lookup-toolbar, .grid-header, [role="toolbar"]')
    );
    if (headerCandidate) return headerCandidate;

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const input of candidates) {
        const rect = input.getBoundingClientRect();
        const score = rect.top * 2 + rect.left; // bias towards top row
        if (score < bestScore) {
            bestScore = score;
            best = input;
        }
    }
    return best;
}

async function waitForLookupDockForElement(targetElement, timeoutMs = 3000) {
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
        const docks = Array.from(document.querySelectorAll('.lookupDock-buttonContainer'))
            .filter(isElementVisibleGlobal)
            .filter(dock => !dock.classList?.contains('messageCenter'));

        if (docks.length) {
            const withRows = docks.filter(dock => dock.querySelector('tr[data-dyn-row], .lookup-row, [role="row"], [role="grid"], table'));
            const candidates = withRows.length ? withRows : docks;
            const best = pickNearestDock(candidates, targetRect);
            if (best) return best;
        }
        await sleep(100);
    }
    return null;
}

function pickNearestDock(docks, targetRect) {
    if (!docks.length) return null;
    if (!targetRect) return docks[0];
    let best = docks[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const dock of docks) {
        const rect = dock.getBoundingClientRect();
        const dx = Math.abs(rect.left - targetRect.left);
        const dy = Math.abs(rect.top - targetRect.bottom);
        const score = dx + dy;
        if (score < bestScore) {
            bestScore = score;
            best = dock;
        }
    }
    return best;
}

async function waitForListboxForElement(targetElement, timeoutMs = 2000) {
    const selectors = ['[role="listbox"]', '.dropDownList', '.comboBoxDropDown', '.dropdown-menu', '.dropdown-list'];
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
        const lists = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)))
            .filter(isElementVisibleGlobal);
        if (lists.length) {
            return pickNearestDock(lists, targetRect);
        }
        await sleep(100);
    }
    return null;
}

async function waitForListboxForInput(input, targetElement, timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const linked = getListboxFromInput(input);
        if (linked && isElementVisibleGlobal(linked)) {
            return linked;
        }
        const fallback = await waitForListboxForElement(targetElement, 200);
        if (fallback) return fallback;
        await sleep(100);
    }
    return null;
}

function getListboxFromInput(input) {
    if (!input) return null;
    const id = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
    if (id) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    const activeId = input.getAttribute('aria-activedescendant');
    if (activeId) {
        const active = document.getElementById(activeId);
        const list = active?.closest?.('[role="listbox"]');
        if (list) return list;
    }
    return null;
}

function findComboBoxButton(element) {
    const selectors = [
        '.lookupButton',
        '.comboBox-button',
        '.comboBox-dropDownButton',
        '.dropdownButton',
        '[data-dyn-role="DropDownButton"]',
        'button[aria-label*="Open"]',
        'button[aria-label*="Select"]'
    ];
    for (const selector of selectors) {
        const btn = element.querySelector(selector);
        if (btn) return btn;
    }
    const container = element.closest('.input_container, .form-group') || element.parentElement;
    if (!container) return null;
    for (const selector of selectors) {
        const btn = container.querySelector(selector);
        if (btn) return btn;
    }
    return null;
}

function collectComboOptions(listbox) {
    const selectors = [
        '[role="option"]',
        '.comboBox-listItem',
        '.comboBox-item',
        'li',
        '.dropdown-list-item',
        '.comboBoxItem',
        '.dropDownListItem',
        '.dropdown-item'
    ];
    const found = [];
    for (const selector of selectors) {
        listbox.querySelectorAll(selector).forEach(el => {
            if (isElementVisibleGlobal(el)) found.push(el);
        });
    }
    return found.length ? found : Array.from(listbox.children).filter(isElementVisibleGlobal);
}

function normalizeText(value) {
    return String(value ?? '').trim().replace(/\\s+/g, ' ').toLowerCase();
}

function coerceBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);

    const text = normalizeText(value);
    if (text === '') return false;

    if (['true', '1', 'yes', 'y', 'on', 'checked'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'off', 'unchecked'].includes(text)) return false;

    return false;
}

function getComboInputMethod() {
    return currentWorkflowSettings?.comboSelectMode || 'method3';
}

// ============ 8 ComboBox Input Methods ============

/**
 * Method 1: Basic setValue (fast but may not trigger D365 filtering)
 */
async function comboInputMethod1(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
    return input.value;
}

/**
 * Method 2: Paste simulation with InputEvent
 */
async function comboInputMethod2(input, value) {
    input.focus();
    await sleep(100);
    
    // Clear first
    setNativeValue(input, '');
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    await sleep(50);
    
    // Simulate paste
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertFromPaste',
        data: value
    }));
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: value
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    await sleep(100);
    return input.value;
}

/**
 * Method 3: Character-by-character with full key events (RECOMMENDED)
 */
async function comboInputMethod3(input, value) {
    input.focus();
    await sleep(100);
    
    // Clear the input first
    setNativeValue(input, '');
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    await sleep(50);
    
    const stringValue = String(value);
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        const currentValue = input.value + char;
        
        // Fire keydown
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            code: getKeyCode(char),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        }));
        
        // Fire beforeinput
        input.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: char
        }));
        
        // Update value
        setNativeValue(input, currentValue);
        
        // Fire input event
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: char
        }));
        
        // Fire keyup
        input.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            code: getKeyCode(char),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true
        }));
        
        await sleep(50);
    }
    
    await sleep(100);
    return input.value;
}

/**
 * Method 4: Character-by-character with keypress (legacy)
 */
async function comboInputMethod4(input, value) {
    input.focus();
    await sleep(100);
    
    setNativeValue(input, '');
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    await sleep(50);
    
    const stringValue = String(value);
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        const charCode = char.charCodeAt(0);
        const currentValue = input.value + char;
        
        // keydown
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            code: getKeyCode(char),
            keyCode: charCode,
            which: charCode,
            bubbles: true,
            cancelable: true
        }));
        
        // keypress (deprecated but still used by some frameworks)
        input.dispatchEvent(new KeyboardEvent('keypress', {
            key: char,
            code: getKeyCode(char),
            keyCode: charCode,
            charCode: charCode,
            which: charCode,
            bubbles: true,
            cancelable: true
        }));
        
        // beforeinput
        input.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: char
        }));
        
        // Update value
        setNativeValue(input, currentValue);
        
        // input
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: char
        }));
        
        // keyup
        input.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            code: getKeyCode(char),
            keyCode: charCode,
            which: charCode,
            bubbles: true
        }));
        
        await sleep(50);
    }
    
    await sleep(100);
    return input.value;
}

/**
 * Method 5: execCommand insertText
 */
async function comboInputMethod5(input, value) {
    input.focus();
    await sleep(100);
    
    // Select all and delete
    input.select();
    document.execCommand('delete');
    await sleep(50);
    
    // Insert text
    document.execCommand('insertText', false, value);
    
    await sleep(100);
    return input.value;
}

/**
 * Method 6: Paste + Backspace workaround
 */
async function comboInputMethod6(input, value) {
    input.focus();
    await sleep(100);
    
    // Set value directly (like paste)
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: value
    }));
    
    await sleep(100);
    
    // Add a character and delete it to trigger filtering
    const valueWithExtra = value + 'X';
    setNativeValue(input, valueWithExtra);
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'X'
    }));
    
    await sleep(50);
    
    // Now delete that character with a real backspace event
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Backspace',
        code: 'Backspace',
        keyCode: 8,
        which: 8,
        bubbles: true,
        cancelable: true
    }));
    
    setNativeValue(input, value);
    
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    
    input.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Backspace',
        code: 'Backspace',
        keyCode: 8,
        which: 8,
        bubbles: true
    }));
    
    await sleep(100);
    return input.value;
}

/**
 * Method 7: D365 internal mechanism trigger
 */
async function comboInputMethod7(input, value) {
    input.focus();
    await sleep(100);
    
    // Set value with full event sequence used by D365
    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    
    // Type character by character but also dispatch on the parent control
    const stringValue = String(value);
    const parent = input.closest('[data-dyn-role]') || input.parentElement;
    
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        const currentValue = input.value + char;
        
        // Create a comprehensive event set
        const keyboardEventInit = {
            key: char,
            code: getKeyCode(char),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        };
        
        // Fire on input and potentially bubble to D365 handlers
        const keydownEvent = new KeyboardEvent('keydown', keyboardEventInit);
        const keyupEvent = new KeyboardEvent('keyup', keyboardEventInit);
        
        input.dispatchEvent(keydownEvent);
        
        // Set value BEFORE input event
        setNativeValue(input, currentValue);
        
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: char,
            composed: true,
            view: window
        }));
        
        input.dispatchEvent(keyupEvent);
        
        // Also dispatch on parent for D365 controls
        if (parent && parent !== input) {
            parent.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        await sleep(50);
    }
    
    // Final change event
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Try to trigger D365's ValueChanged command
    if (parent) {
        parent.dispatchEvent(new CustomEvent('ValueChanged', {
            bubbles: true,
            detail: { value: value }
        }));
    }
    
    await sleep(100);
    return input.value;
}

/**
 * Method 8: Composition events (IME-style)
 */
async function comboInputMethod8(input, value) {
    input.focus();
    await sleep(100);
    
    setNativeValue(input, '');
    await sleep(50);
    
    // Start composition
    input.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true,
        cancelable: true,
        data: ''
    }));
    
    const stringValue = String(value);
    let currentValue = '';
    
    for (let i = 0; i < stringValue.length; i++) {
        currentValue += stringValue[i];
        
        input.dispatchEvent(new CompositionEvent('compositionupdate', {
            bubbles: true,
            data: currentValue
        }));
        
        setNativeValue(input, currentValue);
        
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertCompositionText',
            data: currentValue
        }));
        
        await sleep(50);
    }
    
    // End composition
    input.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true,
        data: value
    }));
    
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromComposition',
        data: value
    }));
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    await sleep(100);
    return input.value;
}

/**
 * Helper to get key code from character
 */
function getKeyCode(char) {
    const upperChar = char.toUpperCase();
    if (upperChar >= 'A' && upperChar <= 'Z') {
        return 'Key' + upperChar;
    }
    if (char >= '0' && char <= '9') {
        return 'Digit' + char;
    }
    const specialKeys = {
        ' ': 'Space',
        '-': 'Minus',
        '=': 'Equal',
        '[': 'BracketLeft',
        ']': 'BracketRight',
        '\\': 'Backslash',
        ';': 'Semicolon',
        "'": 'Quote',
        ',': 'Comma',
        '.': 'Period',
        '/': 'Slash',
        '`': 'Backquote'
    };
    return specialKeys[char] || 'Unidentified';
}

/**
 * Dispatcher function - uses the selected input method from settings
 */
async function comboInputWithSelectedMethod(input, value) {
    const method = getComboInputMethod();
    console.log(`[D365] Using combobox input method: ${method}`);
    
    switch (method) {
        case 'method1': return await comboInputMethod1(input, value);
        case 'method2': return await comboInputMethod2(input, value);
        case 'method3': return await comboInputMethod3(input, value);
        case 'method4': return await comboInputMethod4(input, value);
        case 'method5': return await comboInputMethod5(input, value);
        case 'method6': return await comboInputMethod6(input, value);
        case 'method7': return await comboInputMethod7(input, value);
        case 'method8': return await comboInputMethod8(input, value);
        default: return await comboInputMethod3(input, value); // Default to method 3
    }
}

function commitComboValue(input, value, element) {
    if (!input) return;
    input.focus();
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    input.blur();
    if (element) {
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    document.body?.click?.();
}

function dispatchClickSequence(target) {
    if (!target) return;
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.click();
}

} // End of injected script initialization guard
