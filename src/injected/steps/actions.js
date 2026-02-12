import { logStep } from '../utils/logging.js';
import { setNativeValue, sleep } from '../utils/async.js';
import { findElementInActiveContext, isElementVisible, isD365Loading, findGridCellElement, hasLookupButton, findLookupButton, findLookupFilterInput } from '../utils/dom.js';
import { waitForLookupPopup, waitForLookupRows, waitForLookupDockForElement, waitForListboxForInput, collectComboOptions, findComboBoxButton } from '../utils/lookup.js';
import { typeValueSlowly, typeValueWithInputEvents, waitForInputValue, setValueOnce, setValueWithVerify, comboInputWithSelectedMethod as comboInputWithSelectedMethodWithMode, commitComboValue, dispatchClickSequence } from '../utils/combobox.js';
import { coerceBoolean, normalizeText } from '../utils/text.js';
import { NavigationInterruptError } from '../runtime/errors.js';
import { parseGridAndColumn, buildFilterFieldPatterns, buildApplyButtonPatterns, getFilterMethodSearchTerms, textIncludesAny } from './action-helpers.js';

function comboInputWithSelectedMethod(input, value) {
    const method = window.d365CurrentWorkflowSettings?.comboSelectMode || 'method3';
    return comboInputWithSelectedMethodWithMode(input, value, method);
}

function isSegmentedEntry(element) {
    if (!element) return false;

    if (element.getAttribute('data-dyn-role') === 'SegmentedEntry') return true;
    if (element.closest?.('[data-dyn-role="SegmentedEntry"]')) return true;

    const classList = element.classList;
    if (classList && (classList.contains('segmentedEntry') ||
        classList.contains('segmented-entry') ||
        classList.contains('segmentedEntry-segmentInput'))) {
        return true;
    }

    return !!element.querySelector?.('.segmentedEntry-segmentInput, .segmentedEntry-flyoutSegment');
}

export async function clickElement(controlName) {
    const element = findElementInActiveContext(controlName);
    if (!element) throw new Error(`Element not found: ${controlName}`);
    
    element.click();
    await sleep(800);
}

export async function applyGridFilter(controlName, filterValue, filterMethod = 'is exactly') {
    console.log(`Applying filter: ${controlName} ${filterMethod} "${filterValue}"`);
    
    // Extract grid name and column name from controlName
    // Format: GridName_ColumnName (e.g., "GridReadOnlyMarkupTable_MarkupCode")
    const { gridName, columnName } = parseGridAndColumn(controlName);
    
    console.log(`  Grid: ${gridName}, Column: ${columnName}`);
    
    // Helper function to find filter input with multiple patterns
    async function findFilterInput() {
        // D365 creates filter inputs with various patterns
        const filterFieldPatterns = buildFilterFieldPatterns(controlName, gridName, columnName);
        
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
    const applyBtnPatterns = buildApplyButtonPatterns(controlName, gridName, columnName);
    
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

export async function waitUntilCondition(controlName, condition, expectedValue, timeout) {
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

export async function setInputValue(controlName, value, fieldType) {
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

    // For RadioButton/FrameOptionButton groups, click the correct option
    const role = element.getAttribute('data-dyn-role');
    if (role === 'RadioButton' || role === 'FrameOptionButton' || element.querySelector('[role="radio"], input[type="radio"]')) {
        await setRadioButtonValue(element, value);
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

export async function setGridCellValue(controlName, value, fieldType, waitForValidation = false) {
    console.log(`Setting grid cell value: ${controlName} = "${value}" (waitForValidation=${waitForValidation})`);
    
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
    await sleep(200);
    
    // For grid cells, we need to properly commit the value
    // D365 React grids require the cell to lose focus for validation to occur
    
    // Method 1: Press Enter to confirm the value (important for lookup fields like ItemId)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    await sleep(300);
    
    // Method 2: Tab out to move to next cell (triggers blur and validation)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    await sleep(200);
    
    // Method 3: Dispatch blur event explicitly
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: null }));
    await sleep(200);
    
    // Method 4: Click outside the cell to ensure focus is lost
    // Find another cell or the row container to click
    const row = input.closest('.fixedDataTableRowLayout_main, [data-dyn-role="Row"]');
    if (row) {
        const otherCell = row.querySelector('.fixedDataTableCellLayout_main:not(:focus-within)');
        if (otherCell && otherCell !== input.closest('.fixedDataTableCellLayout_main')) {
            otherCell.click();
            await sleep(200);
        }
    }
    
    // Wait for D365 to process/validate the value (server-side lookup for ItemId, etc.)
    await sleep(500);
    
    // If waitForValidation is enabled, wait for D365 to complete the lookup validation
    // This is important for fields like ItemId that trigger server-side validation
    if (waitForValidation) {
        console.log(`  Waiting for D365 validation of ${controlName}...`);
        
        // Wait for any loading indicators to appear and disappear
        // D365 shows a loading spinner during server-side lookups
        await waitForD365Validation(controlName, 5000);
    }
    
    console.log(`  Grid cell value set: ${controlName} = "${value}"`);
}

export async function waitForD365Validation(controlName, timeout = 5000) {
    const startTime = Date.now();
    let lastLoadingState = false;
    let seenLoading = false;
    
    while (Date.now() - startTime < timeout) {
        // Check for D365 loading indicators
        const isLoading = isD365Loading();
        
        if (isLoading && !lastLoadingState) {
            console.log('    D365 validation started (loading indicator appeared)');
            seenLoading = true;
        } else if (!isLoading && lastLoadingState && seenLoading) {
            console.log('    D365 validation completed (loading indicator gone)');
            await sleep(300); // Extra buffer after loading completes
            return true;
        }
        
        lastLoadingState = isLoading;
        
        // Also check if the cell now shows validated content (e.g., product name appeared)
        // For ItemId, D365 shows the item number and name after validation
        const cell = findGridCellElement(controlName);
        if (cell) {
            const cellText = cell.textContent || '';
            const hasMultipleValues = cellText.split(/\s{2,}|\n/).filter(t => t.trim()).length > 1;
            if (hasMultipleValues) {
                console.log('    D365 validation completed (cell content updated)');
                await sleep(200);
                return true;
            }
        }
        
        await sleep(100);
    }
    
    // If we saw loading at some point, wait a bit more after timeout
    if (seenLoading) {
        console.log('    Validation timeout reached, but saw loading - waiting extra time');
        await sleep(500);
    }
    
    console.log('    Validation wait completed (timeout or no loading detected)');
    return false;
}

export async function activateGridRow(controlName) {
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

export async function setLookupSelectValue(controlName, value) {
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

export async function setCheckboxValue(controlName, value) {
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

export async function openLookupByKeyboard(input) {
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

export async function commitLookupValue(input) {
    // D365 segmented lookups often validate on Tab/Enter and blur
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(800);
}

export async function closeDialog(formName, action = 'ok') {
    const form = document.querySelector(`[data-dyn-form-name="${formName}"]`);
    if (!form) {
        logStep(`Warning: Form ${formName} not found to close`);
        return;
    }
    
    let buttonName;
    if (formName === 'SysRecurrence') {
        buttonName = action === 'ok' ? 'CommandButtonOk' : 'CommandButtonCancel';
    } else if (formName === 'SysQueryForm') {
        buttonName = action === 'ok' ? 'OkButton' : 'CancelButton';
    } else if (formName === 'SysOperationTemplateForm') {
        buttonName = action === 'ok' ? 'CommandButton' : 'CommandButtonCancel';
    } else {
        // Try generic names
        buttonName = action === 'ok' ? 'CommandButton' : 'CommandButtonCancel';
    }
    
    const button = form.querySelector(`[data-dyn-controlname="${buttonName}"]`);
    if (button) {
        button.click();
        await sleep(500);
        logStep(`Dialog ${formName} closed with ${action.toUpperCase()}`);
    } else {
        logStep(`Warning: ${action.toUpperCase()} button not found in ${formName}`);
    }
}

function getCurrentRowValue(fieldMapping) {
    if (!fieldMapping) return '';
    const row = window.d365ExecutionControl?.currentDataRow || {};
    const direct = row[fieldMapping];
    if (direct !== undefined && direct !== null) {
        return String(direct);
    }
    const fieldName = fieldMapping.includes(':') ? fieldMapping.split(':').pop() : fieldMapping;
    const value = row[fieldName];
    return value === undefined || value === null ? '' : String(value);
}

async function resolveDynamicText(text) {
    if (typeof text !== 'string' || !text) return text || '';

    let resolved = text;
    if (/__D365_PARAM_CLIPBOARD_[a-z0-9_]+__/i.test(resolved)) {
        if (!navigator.clipboard?.readText) {
            throw new Error('Clipboard API not available');
        }
        const clipboardText = await navigator.clipboard.readText();
        resolved = resolved.replace(/__D365_PARAM_CLIPBOARD_[a-z0-9_]+__/gi, clipboardText ?? '');
    }

    resolved = resolved.replace(/__D365_PARAM_DATA_([A-Za-z0-9%._~-]*)__/g, (_, encodedField) => {
        const field = decodeURIComponent(encodedField || '');
        return getCurrentRowValue(field);
    });

    return resolved;
}

export async function navigateToForm(step) {
    const { navigateMethod, menuItemName, menuItemType, navigateUrl, hostRelativePath, waitForLoad, openInNewTab } = step;

    const resolvedMenuItemName = await resolveDynamicText(menuItemName || '');
    const resolvedNavigateUrl = await resolveDynamicText(navigateUrl || '');
    const resolvedHostRelativePath = await resolveDynamicText(hostRelativePath || '');

    logStep(`Navigating to form: ${resolvedMenuItemName || resolvedNavigateUrl}`);
    
    let targetUrl;
    const baseUrl = window.location.origin + window.location.pathname;
    
    if (navigateMethod === 'url' && resolvedNavigateUrl) {
        // Use full URL path provided
        targetUrl = resolvedNavigateUrl.startsWith('http') ? resolvedNavigateUrl : baseUrl + resolvedNavigateUrl;
    } else if (navigateMethod === 'hostRelative' && resolvedHostRelativePath) {
        // Reuse current host dynamically, append provided path/query.
        const relativePart = String(resolvedHostRelativePath).trim();
        const normalized = relativePart.startsWith('/') || relativePart.startsWith('?')
            ? relativePart
            : `/${relativePart}`;
        targetUrl = `${window.location.protocol}//${window.location.host}${normalized}`;
    } else if (resolvedMenuItemName) {
        // Build URL from menu item name
        const params = new URLSearchParams(window.location.search);
        params.delete('q');
        const typePrefix = (menuItemType && menuItemType !== 'Display') ? `${menuItemType}:` : '';
        const rawMenuItem = String(resolvedMenuItemName).trim();

        // Support extended input like:
        // "SysTableBrowser&tableName=InventTable"
        // so extra query params are appended as real URL params, not encoded into mi.
        const separatorIndex = Math.min(
            ...['?', '&']
                .map(ch => rawMenuItem.indexOf(ch))
                .filter(idx => idx >= 0)
        );

        let menuItemBase = rawMenuItem;
        let extraQuery = '';

        if (Number.isFinite(separatorIndex)) {
            menuItemBase = rawMenuItem.slice(0, separatorIndex).trim();
            extraQuery = rawMenuItem.slice(separatorIndex + 1).trim();
        }

        params.set('mi', `${typePrefix}${menuItemBase}`);

        if (extraQuery) {
            const extras = new URLSearchParams(extraQuery);
            extras.forEach((value, key) => {
                if (key && key !== 'mi') {
                    params.set(key, value);
                }
            });
        }

        targetUrl = baseUrl + '?' + params.toString();
    } else {
        throw new Error('Navigate step requires either menuItemName or navigateUrl');
    }
    
    logStep(`Navigating to: ${targetUrl}`);

    if (openInNewTab) {
        window.open(targetUrl, '_blank', 'noopener');
        logStep('Opened navigation target in a new tab');
        await sleep(300);
        return;
    }

    // Save pending workflow state directly in sessionStorage before navigation
    try {
        const url = new URL(targetUrl);
        const targetMenuItemName = url.searchParams.get('mi') || '';
        
        // IMPORTANT: Persist pending navigation state from the currently executing workflow.
        // Prefer current workflow context first, then its original/full workflow when present.
        const currentWorkflow = window.d365CurrentWorkflow || null;
        const originalWorkflow = currentWorkflow?._originalWorkflow || currentWorkflow || window.d365OriginalWorkflow || null;
        
        const pendingState = {
            workflow: originalWorkflow,
            workflowId: originalWorkflow?.id || '',
            nextStepIndex: (window.d365ExecutionControl?.currentStepIndex ?? 0) + 1,
            currentRowIndex: window.d365ExecutionControl?.currentRowIndex || 0,
            totalRows: window.d365ExecutionControl?.totalRows || 0,
            data: window.d365ExecutionControl?.currentDataRow || null,
            targetMenuItemName: targetMenuItemName,
            waitForLoad: waitForLoad || 3000,
            savedAt: Date.now()
        };
        sessionStorage.setItem('d365_pending_workflow', JSON.stringify(pendingState));
        logStep(`Saved workflow state for navigation (nextStepIndex: ${pendingState.nextStepIndex})`);
    } catch (e) {
        console.warn('[D365] Failed to save workflow state in sessionStorage:', e);
    }
    
    // Signal navigation is about to happen - workflow state will be saved by the extension
    // We need to wait for the state to be saved before navigating
    window.postMessage({
        type: 'D365_WORKFLOW_NAVIGATING',
        targetUrl: targetUrl,
        waitForLoad: waitForLoad || 3000
    }, '*');
    
    // Wait longer to ensure the full chain completes:
    // postMessage -> content.js -> background.js -> popup -> chrome.scripting.executeScript
    // This chain involves multiple async hops, so we need sufficient time
    await sleep(500);
    
    // Navigate - this will cause page reload, script context will be lost
    window.location.href = targetUrl;
    
    // This code won't execute due to page navigation, but keep it for reference
    // The workflow will be resumed by the content script after page load
    await sleep(waitForLoad || 3000);
}

export async function activateTab(controlName) {
    logStep(`Activating tab: ${controlName}`);
    
    // Find the tab element - could be the tab content or the tab button itself
    let tabElement = findElementInActiveContext(controlName);
    
    // If not found directly, try finding by looking for tab headers/links
    if (!tabElement) {
        // Try finding the tab link/button that references this tab
        tabElement = document.querySelector(`[data-dyn-controlname="${controlName}_header"]`) ||
                     document.querySelector(`[data-dyn-controlname="${controlName}"] [role="tab"]`) ||
                     document.querySelector(`[aria-controls="${controlName}"]`) ||
                     document.querySelector(`a[href*="${controlName}"], button[data-target*="${controlName}"]`);
    }
    
    if (!tabElement) {
        throw new Error(`Tab element not found: ${controlName}`);
    }
    
    // For D365 parameter forms with vertical tabs, the clickable element structure varies
    // Try multiple approaches to find and click the right element
    
    // Approach 1: Look for the tab link inside a pivot/tab structure
    let clickTarget = tabElement.querySelector('.pivot-link, .tab-link, [role="tab"]');
    
    // Approach 2: The element itself might be the link
    if (!clickTarget && (tabElement.tagName === 'A' || tabElement.tagName === 'BUTTON' || tabElement.getAttribute('role') === 'tab')) {
        clickTarget = tabElement;
    }
    
    // Approach 3: For vertical tabs, look for the anchor or link element
    if (!clickTarget) {
        clickTarget = tabElement.querySelector('a, button') || tabElement;
    }
    
    // Approach 4: For PivotItem, find the header element
    if (!clickTarget || clickTarget === tabElement) {
        const headerName = controlName + '_header';
        const headerEl = document.querySelector(`[data-dyn-controlname="${headerName}"]`);
        if (headerEl) {
            clickTarget = headerEl.querySelector('a, button, .pivot-link') || headerEl;
        }
    }
    
    logStep(`Clicking tab element: ${clickTarget?.tagName || 'unknown'}`);
    
    // Focus and click
    if (clickTarget.focus) clickTarget.focus();
    await sleep(100);
    
    // Dispatch full click sequence
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    
    await sleep(300);
    
    // Also try triggering the D365 internal control
    if (typeof $dyn !== 'undefined' && $dyn.controls) {
        try {
            const control = $dyn.controls[controlName];
            if (control) {
                if (typeof control.ActivateTab === 'function') {
                    control.ActivateTab(true);
                    logStep(`Called ActivateTab on ${controlName}`);
                } else if (typeof control.activate === 'function') {
                    control.activate();
                    logStep(`Called activate on ${controlName}`);
                } else if (typeof control.select === 'function') {
                    control.select();
                    logStep(`Called select on ${controlName}`);
                }
            }
        } catch (e) {
            logStep(`D365 control method failed: ${e.message}`);
        }
    }
    
    // Wait for tab content to load
    await sleep(800);
    
    // Verify the tab is now active by checking for visible content
    const tabContent = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
    if (tabContent) {
        const isVisible = tabContent.offsetParent !== null;
        const isActive = tabContent.classList.contains('active') || 
                        tabContent.getAttribute('aria-selected') === 'true' ||
                        tabContent.getAttribute('aria-hidden') !== 'true';
        logStep(`Tab ${controlName} visibility check: visible=${isVisible}, active=${isActive}`);
    }
    
    logStep(`Tab ${controlName} activated`);
}

export async function activateActionPaneTab(controlName) {
    logStep(`Activating action pane tab: ${controlName}`);

    let tabElement = findElementInActiveContext(controlName);

    if (!tabElement) {
        const selectors = [
            `[data-dyn-controlname="${controlName}"]`,
            `.appBarTab[data-dyn-controlname="${controlName}"]`,
            `.appBarTab [data-dyn-controlname="${controlName}"]`,
            `[role="tab"][data-dyn-controlname="${controlName}"]`
        ];
        for (const selector of selectors) {
            tabElement = document.querySelector(selector);
            if (tabElement) break;
        }
    }

    if (!tabElement) {
        throw new Error(`Action pane tab not found: ${controlName}`);
    }

    let clickTarget = tabElement;

    const header = tabElement.querySelector?.('.appBarTab-header, .appBarTabHeader, .appBarTab_header');
    if (header) {
        clickTarget = header;
    }

    const focusSelector = tabElement.getAttribute?.('data-dyn-focus');
    if (focusSelector) {
        const focusTarget = tabElement.querySelector(focusSelector);
        if (focusTarget) {
            clickTarget = focusTarget;
        }
    }

    if (tabElement.getAttribute?.('role') === 'tab') {
        clickTarget = tabElement;
    }

    if (clickTarget === tabElement) {
        const buttonish = tabElement.querySelector?.('button, a, [role="tab"]');
        if (buttonish) clickTarget = buttonish;
    }

    if (clickTarget?.focus) clickTarget.focus();
    await sleep(100);
    dispatchClickSequence(clickTarget);

    if (typeof $dyn !== 'undefined' && $dyn.controls) {
        try {
            const control = $dyn.controls[controlName];
            if (control) {
                if (typeof control.activate === 'function') {
                    control.activate();
                } else if (typeof control.select === 'function') {
                    control.select();
                }
            }
        } catch (e) {
            logStep(`Action pane control method failed: ${e.message}`);
        }
    }

    await sleep(600);
    logStep(`Action pane tab ${controlName} activated`);
}

export async function expandOrCollapseSection(controlName, action) {
    logStep(`${action === 'expand' ? 'Expanding' : 'Collapsing'} section: ${controlName}`);
    
    const section = findElementInActiveContext(controlName);
    if (!section) {
        throw new Error(`Section element not found: ${controlName}`);
    }
    
    // D365 sections can have various structures. The toggle button is usually:
    // 1. A button with aria-expanded inside the section
    // 2. A section header element
    // 3. The section itself might be clickable
    
    // Find the toggle button - this is crucial for D365 dialogs
    let toggleButton = section.querySelector('button[aria-expanded]');
    
    // If not found, try other common patterns
    if (!toggleButton) {
        toggleButton = section.querySelector('.section-page-caption, .section-header, .group-header, [data-dyn-role="SectionPageHeader"]');
    }
    
    // For SysOperationTemplateForm sections (Records to include, Run in the background)
    // the button is often a direct child or sibling
    if (!toggleButton) {
        toggleButton = section.querySelector('button');
    }
    
    // Check if the section itself has aria-expanded (it might be the clickable element)
    if (!toggleButton && section.hasAttribute('aria-expanded')) {
        toggleButton = section;
    }
    
    // Determine current state from various sources
    let isExpanded = false;
    
    // Check the toggle button's aria-expanded
    if (toggleButton && toggleButton.hasAttribute('aria-expanded')) {
        isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
    } else if (section.hasAttribute('aria-expanded')) {
        isExpanded = section.getAttribute('aria-expanded') === 'true';
    } else {
        // Fallback to class-based detection
        isExpanded = section.classList.contains('expanded') || 
                    !section.classList.contains('collapsed');
    }
    
    logStep(`Section ${controlName} current state: ${isExpanded ? 'expanded' : 'collapsed'}`);
    
    const needsToggle = (action === 'expand' && !isExpanded) || (action === 'collapse' && isExpanded);
    
    if (needsToggle) {
        // Click the toggle element
        const clickTarget = toggleButton || section;
        logStep(`Clicking toggle element: ${clickTarget.tagName}, class=${clickTarget.className}`);
        
        // Dispatch full click sequence for D365 React components
        clickTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        clickTarget.click();
        
        await sleep(500);
        
        // Try D365 internal control API
        if (typeof $dyn !== 'undefined' && $dyn.controls) {
            try {
                const control = $dyn.controls[controlName];
                if (control) {
                    // Try various D365 methods
                    if (typeof control.ExpandedChanged === 'function') {
                        // ExpandedChanged takes 0 for expand, 1 for collapse in D365
                        control.ExpandedChanged(action === 'collapse' ? 1 : 0);
                        logStep(`Called ExpandedChanged(${action === 'collapse' ? 1 : 0}) on ${controlName}`);
                    } else if (typeof control.expand === 'function' && action === 'expand') {
                        control.expand();
                        logStep(`Called expand() on ${controlName}`);
                    } else if (typeof control.collapse === 'function' && action === 'collapse') {
                        control.collapse();
                        logStep(`Called collapse() on ${controlName}`);
                    } else if (typeof control.toggle === 'function') {
                        control.toggle();
                        logStep(`Called toggle() on ${controlName}`);
                    }
                }
            } catch (e) {
                logStep(`D365 control method failed: ${e.message}`);
            }
        }
        
        await sleep(300);
    } else {
        logStep(`Section ${controlName} already ${action}ed, no toggle needed`);
    }
    
    logStep(`Section ${controlName} ${action}ed`);
}

export async function configureQueryFilter(tableName, fieldName, criteriaValue, options = {}) {
    logStep(`Configuring query filter: ${tableName ? tableName + '.' : ''}${fieldName} = ${criteriaValue}`);
    
    // Find or open the query filter dialog
    let queryForm = document.querySelector('[data-dyn-form-name="SysQueryForm"]');
    if (!queryForm) {
        // Try to open the query dialog via Query button
        const filterButton = document.querySelector('[data-dyn-controlname="QuerySelectButton"]') ||
                            document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname*="Query"]');
        if (filterButton) {
            filterButton.click();
            await sleep(1000);
            queryForm = document.querySelector('[data-dyn-form-name="SysQueryForm"]');
        }
    }
    
    if (!queryForm) {
        throw new Error('Query filter dialog (SysQueryForm) not found. Make sure the filter dialog is open.');
    }
    
    // Helper to find element within query form
    const findInQuery = (name) => queryForm.querySelector(`[data-dyn-controlname="${name}"]`);
    
    // If savedQuery is specified, select it from the dropdown first
    if (options.savedQuery) {
        const savedQueryBox = findInQuery('SavedQueriesBox');
        if (savedQueryBox) {
            const input = savedQueryBox.querySelector('input');
            if (input) {
                input.click();
                await sleep(300);
                await setInputValueInForm(input, options.savedQuery);
                await sleep(500);
            }
        }
    }
    
    // Make sure we're on the Range tab
    const rangeTab = findInQuery('RangeTab') || findInQuery('RangeTab_header');
    if (rangeTab && !rangeTab.classList.contains('active') && rangeTab.getAttribute('aria-selected') !== 'true') {
        rangeTab.click();
        await sleep(300);
    }
    
    // Click Add to add a new filter row
    const addButton = findInQuery('RangeAdd');
    if (addButton) {
        addButton.click();
        await sleep(500);
    }
    
    // The grid uses ReactList - find the last row (newly added) and fill in values
    const grid = findInQuery('RangeGrid');
    if (!grid) {
        throw new Error('Range grid not found');
    }
    
    // Get all rows and find the last one (most recently added)
    const rows = grid.querySelectorAll('[role="row"], tr, .list-row');
    const lastRow = rows[rows.length - 1] || grid;
    
    // Set table name if provided
    if (tableName) {
        const tableCell = lastRow.querySelector('[data-dyn-controlname="RangeTable"]') || 
                         grid.querySelectorAll('[data-dyn-controlname="RangeTable"]');
        const lastTableCell = tableCell.length ? tableCell[tableCell.length - 1] : tableCell;
        if (lastTableCell) {
            const input = lastTableCell.querySelector('input') || lastTableCell;
            await setInputValueInForm(input, tableName);
            await sleep(300);
        }
    }
    
    // Set field name if provided
    if (fieldName) {
        const fieldCells = grid.querySelectorAll('[data-dyn-controlname="RangeField"]');
        const lastFieldCell = fieldCells[fieldCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeField"]');
        if (lastFieldCell) {
            const input = lastFieldCell.querySelector('input') || lastFieldCell;
            // Click to open dropdown/focus
            input.click?.();
            await sleep(200);
            await setInputValueInForm(input, fieldName);
            await sleep(300);
        }
    }
    
    // Set criteria value if provided
    if (criteriaValue) {
        const valueCells = grid.querySelectorAll('[data-dyn-controlname="RangeValue"]');
        const lastValueCell = valueCells[valueCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeValue"]');
        if (lastValueCell) {
            const input = lastValueCell.querySelector('input') || lastValueCell;
            input.click?.();
            await sleep(200);
            await setInputValueInForm(input, criteriaValue);
            await sleep(300);
        }
    }
    
    logStep('Query filter configured');
}

export async function configureBatchProcessing(enabled, taskDescription, batchGroup, options = {}) {
    logStep(`Configuring batch processing: ${enabled ? 'enabled' : 'disabled'}`);
    
    // Wait for dialog to be ready
    await sleep(300);
    
    // Find the batch processing checkbox - control name is Fld1_1 in SysOperationTemplateForm
    const batchToggle = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname="Fld1_1"]') ||
                        findElementInActiveContext('Fld1_1') ||
                        document.querySelector('[data-dyn-controlname="Fld1_1"]');
    
    if (batchToggle) {
        // Find the actual checkbox input or toggle button
        const checkbox = batchToggle.querySelector('input[type="checkbox"]') ||
                        batchToggle.querySelector('[role="checkbox"]') ||
                        batchToggle.querySelector('.toggle-button');
        
        const currentState = checkbox?.checked || 
                            batchToggle.classList.contains('on') || 
                            batchToggle.getAttribute('aria-checked') === 'true';
        
        if (currentState !== enabled) {
            const clickTarget = checkbox || batchToggle.querySelector('button, .toggle-switch, label') || batchToggle;
            clickTarget.click();
            await sleep(500);
        }
    } else {
        logStep('Warning: Batch processing toggle (Fld1_1) not found');
    }
    
    // Set task description if provided and batch is enabled (Fld2_1)
    if (enabled && taskDescription) {
        await setInputValue('Fld2_1', taskDescription);
        await sleep(200);
    }
    
    // Set batch group if provided and batch is enabled (Fld3_1)
    if (enabled && batchGroup) {
        await setInputValue('Fld3_1', batchGroup);
        await sleep(200);
    }
    
    // Set Private and Critical options if provided (Fld4_1 and Fld5_1)
    if (enabled && options.private !== undefined) {
        await setCheckbox('Fld4_1', options.private);
        await sleep(200);
    }
    
    if (enabled && options.criticalJob !== undefined) {
        await setCheckbox('Fld5_1', options.criticalJob);
        await sleep(200);
    }
    
    // Set Monitoring category if specified (Fld6_1)
    if (enabled && options.monitoringCategory) {
        await setComboBoxValue('Fld6_1', options.monitoringCategory);
        await sleep(200);
    }
    
    logStep('Batch processing configured');
}

export async function configureRecurrence(step) {
    const { patternUnit, patternCount, endDateOption, endAfterCount, endByDate, startDate, startTime, timezone } = step;
    
    const patternUnits = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
    logStep(`Configuring recurrence: every ${patternCount} ${patternUnits[patternUnit || 0]}`);
    
    // Click Recurrence button to open dialog if not already open
    let recurrenceForm = document.querySelector('[data-dyn-form-name="SysRecurrence"]');
    if (!recurrenceForm) {
        // MnuItm_1 is the Recurrence button in SysOperationTemplateForm
        const recurrenceButton = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname="MnuItm_1"]') ||
                                findElementInActiveContext('MnuItm_1');
        if (recurrenceButton) {
            recurrenceButton.click();
            await sleep(1000);
            recurrenceForm = document.querySelector('[data-dyn-form-name="SysRecurrence"]');
        }
    }
    
    if (!recurrenceForm) {
        logStep('Warning: Could not open SysRecurrence dialog');
        return;
    }
    
    // Helper to find element within recurrence form
    const findInRecurrence = (name) => recurrenceForm.querySelector(`[data-dyn-controlname="${name}"]`);
    
    // Set start date if provided
    if (startDate) {
        const startDateInput = findInRecurrence('StartDate')?.querySelector('input') ||
                              findInRecurrence('StartDate');
        if (startDateInput) {
            await setInputValueInForm(startDateInput, startDate);
            await sleep(300);
        }
    }
    
    // Set start time if provided
    if (startTime) {
        const startTimeInput = findInRecurrence('StartTime')?.querySelector('input') ||
                              findInRecurrence('StartTime');
        if (startTimeInput) {
            await setInputValueInForm(startTimeInput, startTime);
            await sleep(300);
        }
    }
    
    // Set timezone if provided
    if (timezone) {
        const timezoneControl = findInRecurrence('Timezone');
        if (timezoneControl) {
            const input = timezoneControl.querySelector('input');
            if (input) {
                input.click();
                await sleep(200);
                await setInputValueInForm(input, timezone);
                await sleep(300);
            }
        }
    }
    
    // Set pattern unit (radio buttons: Minutes=0, Hours=1, Days=2, Weeks=3, Months=4, Years=5)
    if (patternUnit !== undefined) {
        const patternUnitControl = findInRecurrence('PatternUnit');
        if (patternUnitControl) {
            // Radio buttons are typically rendered as a group with multiple options
            const radioInputs = patternUnitControl.querySelectorAll('input[type="radio"]');
            if (radioInputs.length > patternUnit) {
                radioInputs[patternUnit].click();
                await sleep(500); // Wait for UI to update with appropriate interval field
            } else {
                // Try clicking the nth option label/button
                const radioOptions = patternUnitControl.querySelectorAll('[role="radio"], label, button');
                if (radioOptions.length > patternUnit) {
                    radioOptions[patternUnit].click();
                    await sleep(500);
                }
            }
        }
    }
    
    // Set interval count based on pattern unit
    // The visible input field changes based on selected pattern unit
    if (patternCount) {
        const countControlNames = ['MinuteInt', 'HourInt', 'DayInt', 'WeekInt', 'MonthInt', 'YearInt'];
        const countControlName = countControlNames[patternUnit || 0];
        const countControl = findInRecurrence(countControlName);
        
        if (countControl) {
            const input = countControl.querySelector('input') || countControl;
            await setInputValueInForm(input, patternCount.toString());
            await sleep(300);
        }
    }
    
    // Set end date options
    if (endDateOption === 'noEndDate') {
        // Click on "No end date" group (EndDate1)
        const noEndDateGroup = findInRecurrence('EndDate1');
        if (noEndDateGroup) {
            const radio = noEndDateGroup.querySelector('input[type="radio"], [role="radio"]') || noEndDateGroup;
            radio.click();
            await sleep(300);
        }
    } else if (endDateOption === 'endAfter' && endAfterCount) {
        // Click on "End after" group (EndDate2) and set count
        const endAfterGroup = findInRecurrence('EndDate2');
        if (endAfterGroup) {
            const radio = endAfterGroup.querySelector('input[type="radio"], [role="radio"]') || endAfterGroup;
            radio.click();
            await sleep(300);
        }
        // Set the count (EndDateInt)
        const countControl = findInRecurrence('EndDateInt');
        if (countControl) {
            const input = countControl.querySelector('input') || countControl;
            await setInputValueInForm(input, endAfterCount.toString());
            await sleep(300);
        }
    } else if (endDateOption === 'endBy' && endByDate) {
        // Click on "End by" group (EndDate3) and set date
        const endByGroup = findInRecurrence('EndDate3');
        if (endByGroup) {
            const radio = endByGroup.querySelector('input[type="radio"], [role="radio"]') || endByGroup;
            radio.click();
            await sleep(300);
        }
        // Set the end date (EndDateDate)
        const dateControl = findInRecurrence('EndDateDate');
        if (dateControl) {
            const input = dateControl.querySelector('input') || dateControl;
            await setInputValueInForm(input, endByDate);
            await sleep(300);
        }
    }
    
    logStep('Recurrence configured');
}

export async function setInputValueInForm(inputElement, value) {
    if (!inputElement) return;
    
    // Focus the input
    inputElement.focus();
    await sleep(100);
    
    // Clear existing value
    inputElement.select?.();
    
    // Set the value
    inputElement.value = value;
    
    // Dispatch events
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
}

export async function setFilterMethod(filterContainer, method) {
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
    const searchTerms = getFilterMethodSearchTerms(method);
    
    // Look for options in listbox/dropdown
    const options = document.querySelectorAll('[role="option"], [role="listitem"], .dyn-listView-item');
    for (const opt of options) {
        const text = opt.textContent.toLowerCase();
        if (textIncludesAny(text, searchTerms)) {
            opt.click();
            await sleep(200);
            console.log(`  Set filter method: ${method}`);
            return;
        }
    }
    
    // Try select element
    const selectEl = operatorDropdown.querySelector('select');
    if (selectEl) {
        for (const opt of selectEl.options) {
            const text = opt.textContent.toLowerCase();
            if (textIncludesAny(text, searchTerms)) {
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(200);
                console.log(`  Set filter method: ${method}`);
                return;
            }
        }
    }
    
    console.log(`  ⚠ Could not set filter method "${method}", using default`);
}

export async function setRadioButtonValue(element, value) {
    logStep(`Setting radio button value: ${value}`);
    
    // Find all radio options in this group
    const radioInputs = element.querySelectorAll('input[type="radio"]');
    const radioRoles = element.querySelectorAll('[role="radio"]');
    const options = radioInputs.length > 0 ? Array.from(radioInputs) : Array.from(radioRoles);
    
    if (options.length === 0) {
        // Try finding clickable labels/buttons that act as radio options
        const labelButtons = element.querySelectorAll('label, button, [data-dyn-role="RadioButton"]');
        options.push(...Array.from(labelButtons));
    }
    
    if (options.length === 0) {
        throw new Error(`No radio options found in element`);
    }
    
    logStep(`Found ${options.length} radio options`);
    
    // Try to match by index (if value is a number or numeric string)
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue < options.length) {
        const targetOption = options[numValue];
        logStep(`Clicking radio option at index ${numValue}`);
        
        // Click the radio option or its associated label
        const clickTarget = targetOption.tagName === 'INPUT' 
            ? (targetOption.closest('label') || targetOption.parentElement?.querySelector('label') || targetOption)
            : targetOption;
        
        // Dispatch full click sequence
        clickTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        clickTarget.click();
        
        // Also try clicking the input directly
        if (targetOption.tagName === 'INPUT') {
            targetOption.checked = true;
            targetOption.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        await sleep(500);
        return;
    }
    
    // Try to match by label text
    const searchValue = String(value).toLowerCase();
    for (const option of options) {
        const label = option.closest('label') || option.parentElement?.querySelector('label');
        const text = label?.textContent?.trim().toLowerCase() || 
                    option.getAttribute('aria-label')?.toLowerCase() ||
                    option.textContent?.trim().toLowerCase() || '';
        
        if (text.includes(searchValue) || searchValue.includes(text)) {
            logStep(`Clicking radio option with text: ${text}`);
            const clickTarget = label || option;
            clickTarget.click();
            
            if (option.tagName === 'INPUT') {
                option.checked = true;
                option.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            await sleep(500);
            return;
        }
    }
    
    throw new Error(`Radio option not found for value: ${value}`);
}

export async function setSegmentedEntryValue(element, value) {
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
        if (!window.d365CurrentWorkflowSettings?.suppressLookupWarnings) {
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
        if (!window.d365CurrentWorkflowSettings?.suppressLookupWarnings) {
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

export async function setComboBoxValue(element, value) {
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

export async function setCheckbox(controlName, checked) {
    const container = findElementInActiveContext(controlName) ||
                     document.querySelector(`[data-dyn-controlname="${controlName}"]`);
    
    if (!container) {
        logStep(`Warning: Checkbox ${controlName} not found`);
        return;
    }
    
    const checkbox = container.querySelector('input[type="checkbox"]') ||
                    container.querySelector('[role="checkbox"]');
    
    const currentState = checkbox?.checked || 
                        container.getAttribute('aria-checked') === 'true' ||
                        container.classList.contains('on');
    
    if (currentState !== checked) {
        const clickTarget = checkbox || container.querySelector('label, button') || container;
        clickTarget.click();
    }
}
