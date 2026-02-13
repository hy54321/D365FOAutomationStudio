export function findElementInActiveContext(controlName) {
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

export function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
}

export function isD365Loading() {
    // Check for common D365 loading indicators
    const loadingSelectors = [
        '.dyn-loading-overlay:not([style*="display: none"])',
        '.dyn-loading-indicator:not([style*="display: none"])',
        '.dyn-spinner:not([style*="display: none"])',
        '.loading-indicator:not([style*="display: none"])',
        '.dyn-messageBusy:not([style*="display: none"])',
        '[data-dyn-loading="true"]',
        '.busy-indicator',
        '.dyn-loadingStub:not([style*="display: none"])'
    ];

    for (const selector of loadingSelectors) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
            return true;
        }
    }

    // Check for AJAX requests in progress (D365 specific)
    if (window.$dyn && window.$dyn.isProcessing) {
        return window.$dyn.isProcessing();
    }

    return false;
}

export function findGridCellElement(controlName) {
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

        // Try finding in body rows - prefer the LAST visible cell.
        // After "Add line", D365 appends a new row at the bottom.
        // If the active-row attribute hasn't been set yet (race condition),
        // returning the first cell would target row 1 instead of the new row.
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            const cells = bodyContainer.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
            let lastVisibleCell = null;
            for (const cell of cells) {
                // Skip if in header
                const isInHeader = cell.closest('.fixedDataTableLayout_header, .dyn-headerCell');
                if (!isInHeader && cell.offsetParent !== null) {
                    lastVisibleCell = cell;
                }
            }
            if (lastVisibleCell) return lastVisibleCell;
        }
    }

    // Try to find in traditional D365 grid context - prefer last visible cell
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
        // Find all matching cells and prefer visible/editable ones
        const cells = grid.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
        let lastVisibleCell = null;
        for (const cell of cells) {
            // Check if it's in a data row (not header)
            const isInHeader = cell.closest('[data-dyn-role="ColumnHeader"], [role="columnheader"], thead');
            if (!isInHeader && cell.offsetParent !== null) {
                lastVisibleCell = cell;
            }
        }
        if (lastVisibleCell) return lastVisibleCell;
    }

    // Fallback to standard element finding
    return findElementInActiveContext(controlName);
}

export function hasLookupButton(element) {
    return element.classList.contains('field-hasLookupButton') ||
        element.querySelector('.lookup-button, [data-dyn-role="LookupButton"]') !== null ||
        element.nextElementSibling?.classList.contains('lookup-button');
}

export function findLookupButton(element) {
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

export function isElementVisibleGlobal(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return element.offsetParent !== null &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';
}

export function pickNearestRows(rows, targetElement) {
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

export function findLookupFilterInput(lookupDock) {
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
