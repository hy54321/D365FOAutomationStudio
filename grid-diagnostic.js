// Grid Diagnostic Script for D365
// Run this in the browser console on a D365 page with a grid to understand the structure
// Copy the output and share it to help debug grid column discovery
// Supports both traditional D365 grids and React FixedDataTable grids

(function() {
    console.log('=== D365 Grid Structure Diagnostic ===\n');
    
    const results = { 
        traditionalGrids: [],
        reactGrids: []
    };
    
    // ====== Traditional D365 Grids ======
    const traditionalGrids = document.querySelectorAll('[data-dyn-role="Grid"]');
    console.log(`Found ${traditionalGrids.length} traditional D365 grid(s)\n`);
    
    traditionalGrids.forEach((grid, idx) => {
        const gridName = grid.getAttribute('data-dyn-controlname');
        console.log(`\n--- Traditional Grid ${idx + 1}: ${gridName} ---`);
        
        const gridResult = {
            name: gridName,
            headers: [],
            editableInputs: [],
            possibleItemFields: []
        };
        
        const headers = grid.querySelectorAll('[data-dyn-role="ColumnHeader"], [role="columnheader"]');
        headers.forEach(h => {
            const colName = h.getAttribute('data-dyn-controlname');
            const text = h.textContent?.trim()?.substring(0, 50);
            console.log(`  Header: "${colName}" | Text: "${text}"`);
            gridResult.headers.push({ controlName: colName, text });
        });
        
        results.traditionalGrids.push(gridResult);
    });
    
    // ====== React FixedDataTable Grids ======
    const reactGrids = document.querySelectorAll('.reactGrid');
    console.log(`\nFound ${reactGrids.length} React FixedDataTable grid(s)\n`);
    
    reactGrids.forEach((grid, idx) => {
        console.log(`\n--- React Grid ${idx + 1} ---`);
        
        const gridResult = {
            headers: [],
            cells: [],
            possibleItemFields: []
        };
        
        // Get column headers
        console.log('\n📋 Column Headers (dyn-headerCell):');
        const headerCells = grid.querySelectorAll('.fixedDataTableLayout_header .dyn-headerCell');
        headerCells.forEach((h, colIdx) => {
            const controlName = h.getAttribute('data-dyn-controlname');
            const label = h.querySelector('.dyn-headerCellLabel');
            const text = label?.textContent?.trim() || h.textContent?.trim()?.substring(0, 50);
            console.log(`  [${colIdx}] Control: "${controlName}" | Text: "${text}"`);
            gridResult.headers.push({ controlName, text, index: colIdx });
        });
        
        // Look for cells in body rows
        console.log('\n📦 Body Cells in First Row:');
        const bodyContainer = grid.querySelector('.fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer');
        if (bodyContainer) {
            const firstRow = bodyContainer.querySelector('.fixedDataTableRowLayout_main.public_fixedDataTableRow_main');
            if (firstRow) {
                const cells = firstRow.querySelectorAll('.fixedDataTableCellLayout_main.public_fixedDataTableCell_main');
                cells.forEach((cell, cellIdx) => {
                    // Look for data-dyn-controlname on cell or its children
                    let controlName = cell.getAttribute('data-dyn-controlname');
                    if (!controlName) {
                        const dynChild = cell.querySelector('[data-dyn-controlname]');
                        controlName = dynChild?.getAttribute('data-dyn-controlname');
                    }
                    const hasInput = cell.querySelector('input, select, textarea');
                    const role = cell.querySelector('[data-dyn-role]')?.getAttribute('data-dyn-role');
                    const text = cell.innerText?.trim()?.substring(0, 30);
                    console.log(`  [${cellIdx}] Control: "${controlName}" | Role: ${role} | HasInput: ${!!hasInput} | Text: "${text}"`);
                    gridResult.cells.push({ controlName, role, hasInput: !!hasInput, text, index: cellIdx });
                });
            }
        }
        
        // Look for editable inputs in grid
        console.log('\n✏️ Editable Inputs in Grid:');
        const inputs = grid.querySelectorAll('[data-dyn-role="Input"], [data-dyn-role="ComboBox"], [data-dyn-role="Lookup"], [data-dyn-role="ReferenceGroup"], input[data-dyn-controlname]');
        const uniqueInputs = new Set();
        inputs.forEach(inp => {
            let controlName = inp.getAttribute('data-dyn-controlname');
            if (!controlName) {
                const parent = inp.closest('[data-dyn-controlname]');
                controlName = parent?.getAttribute('data-dyn-controlname');
            }
            if (controlName && !uniqueInputs.has(controlName)) {
                uniqueInputs.add(controlName);
                const role = inp.getAttribute('data-dyn-role') || inp.tagName;
                const isVisible = inp.offsetParent !== null;
                console.log(`  - Control: "${controlName}" | Role: ${role} | Visible: ${isVisible}`);
            }
        });
        
        // Look for Item, Qty, Quantity, Product fields
        console.log('\n🔍 Searching for ItemId, ItemNumber, Qty related elements:');
        const allElements = grid.querySelectorAll('[data-dyn-controlname]');
        allElements.forEach(el => {
            const cn = el.getAttribute('data-dyn-controlname');
            if (cn && (cn.toLowerCase().includes('item') || cn.toLowerCase().includes('qty') || cn.toLowerCase().includes('quantity') || cn.toLowerCase().includes('product'))) {
                console.log(`  - Found: "${cn}" | Role: ${el.getAttribute('data-dyn-role')} | Visible: ${el.offsetParent !== null}`);
                gridResult.possibleItemFields.push({ controlName: cn, role: el.getAttribute('data-dyn-role'), visible: el.offsetParent !== null });
            }
        });
        
        results.reactGrids.push(gridResult);
    });
    
    // ====== Active/Selected Row Detection ======
    console.log('\n\n=== Active/Selected Row Detection ===');
    const activeRows = document.querySelectorAll('[aria-selected="true"], [data-dyn-row-active="true"]');
    console.log(`Found ${activeRows.length} selected rows with aria-selected or data-dyn-row-active`);
    activeRows.forEach(row => {
        console.log(`  - Class: ${row.className?.substring(0, 80)} | aria-selected: ${row.getAttribute('aria-selected')} | data-dyn-row-active: ${row.getAttribute('data-dyn-row-active')}`);
    });
    
    // ====== New Row / Add Line Elements ======
    console.log('\n=== New Row / Add Line Elements ===');
    const addButtons = document.querySelectorAll('[data-dyn-controlname*="Add"], [data-dyn-controlname*="New"], [data-dyn-controlname*="LineStrip"]');
    addButtons.forEach(btn => {
        const cn = btn.getAttribute('data-dyn-controlname');
        const label = btn.getAttribute('aria-label') || btn.textContent?.trim()?.substring(0, 40);
        console.log(`  - Control: "${cn}" | Label: "${label}"`);
    });
    
    console.log('\n=== End Diagnostic ===');
    console.log('\nJSON Results:');
    console.log(JSON.stringify(results, null, 2));
    
    return results;
})();
