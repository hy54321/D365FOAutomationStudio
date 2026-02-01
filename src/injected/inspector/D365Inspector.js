// D365FO Element Inspector and Discovery Module

export default class D365Inspector {
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

        // Find all radio button groups
        document.querySelectorAll('[data-dyn-role="RadioButton"], [role="radiogroup"], [data-dyn-role="FrameOptionButton"]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (!controlName) return;
            if (elements.some(e => e.controlName === controlName)) return;

            const formName = this.getElementFormName(el);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            const label = this.getElementLabel(el);
            const selectedRadio = el.querySelector('input[type="radio"]:checked, [role="radio"][aria-checked="true"]');
            const currentValue = selectedRadio?.value || selectedRadio?.getAttribute('aria-label') || '';
            
            elements.push({
                type: 'radio',
                controlName: controlName,
                displayText: label,
                visible: this.isElementVisible(el),
                currentValue: currentValue,
                selector: `[data-dyn-controlname="${controlName}"]`,
                formName: formName,
                element: el
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
        });

        // Find expandable sections (FastTabs, Groups, SectionPages)
        // These are collapsible sections in D365 dialogs and forms
        document.querySelectorAll('[data-dyn-role="Group"], [data-dyn-role="SectionPage"], [data-dyn-role="TabPage"], [data-dyn-role="FastTab"], .section-page, .fasttab').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (!controlName) return;
            
            // Skip if already added
            if (elements.some(e => e.controlName === controlName)) return;

            const formName = this.getElementFormName(el);
            
            // Filter by active form if requested
            if (activeFormOnly && activeForm && formName !== activeForm) return;

            // Check if this is actually an expandable section
            // Look for header elements or aria-expanded attribute
            const hasHeader = el.querySelector('.section-header, .group-header, [data-dyn-role="SectionPageHeader"], .section-page-caption, button[aria-expanded]');
            const isExpandable = el.hasAttribute('aria-expanded') || 
                                el.classList.contains('collapsible') ||
                                el.classList.contains('section-page') ||
                                hasHeader !== null ||
                                el.getAttribute('data-dyn-role') === 'Group' ||
                                el.getAttribute('data-dyn-role') === 'SectionPage';
            
            if (!isExpandable) return;

            // Determine current expanded state
            const isExpanded = el.getAttribute('aria-expanded') === 'true' ||
                              el.classList.contains('expanded') ||
                              !el.classList.contains('collapsed');

            const label = this.getExpandableSectionLabel(el) || controlName;
            
            elements.push({
                type: 'section',
                controlName: controlName,
                displayText: label,
                visible: this.isElementVisible(el),
                isExpanded: isExpanded,
                selector: `[data-dyn-controlname="${controlName}"]`,
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

    // Get label for expandable sections
    getExpandableSectionLabel(element) {
        // Try to find the header/caption element
        const headerSelectors = [
            '.section-page-caption',
            '.section-header',
            '.group-header',
            '.fasttab-header',
            '[data-dyn-role="SectionPageHeader"]',
            'button[aria-expanded] span',
            'button span',
            '.caption',
            'legend'
        ];
        
        for (const selector of headerSelectors) {
            const header = element.querySelector(selector);
            if (header) {
                const text = header.textContent?.trim();
                if (text) return text;
            }
        }
        
        // Try aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        
        // Try the button's text if the section has a toggle button
        const toggleBtn = element.querySelector('button');
        if (toggleBtn) {
            const text = toggleBtn.textContent?.trim();
            if (text && text.length < 100) return text;
        }
        
        return null;
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
