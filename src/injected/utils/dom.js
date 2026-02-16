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
        '.dyn-loadingStub:not([style*="display: none"])',
        '.dyn-processingMsg:not([style*="display: none"])'
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

    // Check for "Please wait" processing message overlays.
    // D365 shows these during server-side operations (e.g. after clicking OK
    // on the Create Sales Order dialog).
    if (isD365ProcessingMessage()) {
        return true;
    }

    return false;
}

/**
 * Detect the "Please wait. We're processing your request." message overlay
 * and similar D365 processing/blocking messages.
 * These are modal-style message boxes that block the UI while the server
 * processes a request.
 */
export function isD365ProcessingMessage() {
    // Pattern 1: D365 message bar / info box with "Please wait" text
    const messageSelectors = [
        '.messageBar',
        '.dyn-messageBar',
        '.dyn-msgBox',
        '.dyn-infoBox',
        '[data-dyn-role="MsgBox"]',
        '[data-dyn-role="InfoBox"]',
        '.dialog-container',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '.sysBoxContent',
        '.processing-dialog'
    ];

    const waitPhrases = [
        'please wait',
        'processing your request',
        'we\'re processing',
        'being processed',
        'please be patient',
        'operation in progress'
    ];

    for (const selector of messageSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            if (el && el.offsetParent !== null) {
                const text = (el.textContent || '').toLowerCase();
                if (waitPhrases.some(phrase => text.includes(phrase))) {
                    return true;
                }
            }
        }
    }

    // Pattern 2: Any visible element containing the processing text that
    // looks like a blocking overlay or modal
    const overlays = document.querySelectorAll(
        '.modal, .overlay, [class*="overlay"], [class*="modal"], [class*="blocking"]'
    );
    for (const el of overlays) {
        if (el && el.offsetParent !== null) {
            const text = (el.textContent || '').toLowerCase();
            if (waitPhrases.some(phrase => text.includes(phrase))) {
                return true;
            }
        }
    }

    return false;
}

export function findGridCellElement(controlName) {
    // Priority 0: If we have a pending-new-row marker (set by waitForNewGridRow
    // after an "Add line" click), look in THAT specific row first.
    // This eliminates the race condition where the old row is still selected.
    const pendingNew = window.__d365_pendingNewRow;
    if (pendingNew && pendingNew.rowElement && (Date.now() - pendingNew.timestamp < 15000)) {
        const cell = pendingNew.rowElement.querySelector(
            `[data-dyn-controlname="${controlName}"]`
        );
        if (cell && cell.offsetParent !== null) {
            return cell;
        }
    }

    // Priority 1: Find in an active/selected row (traditional D365 grids)
    const selectedRows = document.querySelectorAll('[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow');
    for (const row of selectedRows) {
        const cell = row.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell && cell.offsetParent !== null) {
            return cell;
        }
    }

    // Priority 2: React FixedDataTable grids - find active row
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

        // Priority 3: In body rows - prefer the LAST visible cell.
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

    // Priority 4: Traditional D365 grid context - prefer last visible cell
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

/**
 * Count visible data rows in all grids on the page.
 * Returns the total count across React FixedDataTable and traditional D365 grids.
 */
export function getGridRowCount() {
    let count = 0;

    // React FixedDataTable grids
    const reactGrids = document.querySelectorAll('.reactGrid');
    for (const grid of reactGrids) {
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            const rows = bodyContainer.querySelectorAll(
                '.fixedDataTableRowLayout_main, [role="row"]:not([role="columnheader"])'
            );
            // Only count rows that are visible and have content (not empty spacer rows)
            for (const row of rows) {
                if (row.offsetParent !== null && !row.closest('.fixedDataTableLayout_header')) {
                    count++;
                }
            }
        }
    }

    // Traditional D365 grids
    if (count === 0) {
        const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
        for (const grid of grids) {
            const rows = grid.querySelectorAll(
                '[data-dyn-role="Row"]:not([data-dyn-role="ColumnHeader"]), ' +
                '[role="row"]:not([role="columnheader"]):not(thead [role="row"]), ' +
                'tbody tr'
            );
            for (const row of rows) {
                if (row.offsetParent !== null) count++;
            }
        }
    }

    return count;
}

/**
 * Get the DOM element of the currently selected/active grid row.
 * Returns { row, rowIndex } or null.
 */
export function getGridSelectedRow() {
    // React grids
    const reactGrids = document.querySelectorAll('.reactGrid');
    for (const grid of reactGrids) {
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (!bodyContainer) continue;
        const allRows = Array.from(bodyContainer.querySelectorAll(
            '.fixedDataTableRowLayout_main'
        )).filter(r => r.offsetParent !== null && !r.closest('.fixedDataTableLayout_header'));

        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i].getAttribute('aria-selected') === 'true' ||
                allRows[i].getAttribute('data-dyn-row-active') === 'true') {
                return { row: allRows[i], rowIndex: i, totalRows: allRows.length };
            }
        }
    }

    // Traditional grids
    const selectedRows = document.querySelectorAll(
        '[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow'
    );
    for (const row of selectedRows) {
        if (row.offsetParent !== null) {
            return { row, rowIndex: -1, totalRows: -1 };
        }
    }

    return null;
}

/**
 * Collect comprehensive grid state information for diagnostics.
 */
export function inspectGridState() {
    const grids = [];

    // React FixedDataTable grids
    const reactGridEls = document.querySelectorAll('.reactGrid');
    for (const grid of reactGridEls) {
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (!bodyContainer) continue;
        const allRows = Array.from(bodyContainer.querySelectorAll(
            '.fixedDataTableRowLayout_main'
        )).filter(r => r.offsetParent !== null && !r.closest('.fixedDataTableLayout_header'));

        const rowDetails = allRows.map((row, idx) => {
            const isSelected = row.getAttribute('aria-selected') === 'true';
            const isActive = row.getAttribute('data-dyn-row-active') === 'true';
            const cellControls = Array.from(row.querySelectorAll('[data-dyn-controlname]'))
                .map(c => c.getAttribute('data-dyn-controlname'));
            const hasInput = !!row.querySelector('input:not([type="hidden"]), textarea, select');
            return { index: idx, isSelected, isActive, cellControls, hasInput };
        });

        grids.push({
            type: 'ReactGrid',
            totalRows: allRows.length,
            selectedRows: rowDetails.filter(r => r.isSelected).map(r => r.index),
            activeRows: rowDetails.filter(r => r.isActive).map(r => r.index),
            rows: rowDetails
        });
    }

    // Traditional D365 grids
    const tradGrids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of tradGrids) {
        const controlName = grid.getAttribute('data-dyn-controlname') || 'unknown';
        const rows = Array.from(grid.querySelectorAll(
            '[data-dyn-role="Row"], [role="row"]:not(thead [role="row"]), tbody tr'
        )).filter(r => r.offsetParent !== null);

        const rowDetails = rows.map((row, idx) => {
            const isSelected = row.getAttribute('data-dyn-selected') === 'true' ||
                              row.getAttribute('aria-selected') === 'true' ||
                              row.classList.contains('dyn-selectedRow');
            const cellControls = Array.from(row.querySelectorAll('[data-dyn-controlname]'))
                .map(c => c.getAttribute('data-dyn-controlname'));
            return { index: idx, isSelected, cellControls };
        });

        grids.push({
            type: 'TraditionalGrid',
            controlName,
            totalRows: rows.length,
            selectedRows: rowDetails.filter(r => r.isSelected).map(r => r.index),
            rows: rowDetails
        });
    }

    return {
        gridCount: grids.length,
        grids,
        pendingNewRow: !!window.__d365_pendingNewRow,
        pendingNewRowData: window.__d365_pendingNewRow || null
    };
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
