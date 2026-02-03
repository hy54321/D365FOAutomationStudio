/**
 * D365 UI Discovery Scripts - Enhanced Version
 * 
 * Run these scripts in the browser console while on D365 pages
 * to discover UI elements, menu items, and form structures.
 * 
 * Copy and paste each function individually into the console.
 * 
 * USAGE:
 * 1. Open the batch job dialog (e.g., "Automated order completion")
 * 2. Run discoverBatchDialog() to see all elements in that dialog
 * 3. Click Recurrence, then run discoverRecurrenceDialog()
 * 4. Click Filter, then run discoverFilterDialog()
 */

// ========================================================
// 1. DISCOVER BATCH JOB DIALOG (SysOperationTemplateForm)
// Run this when you have opened an Action-type batch job
// ========================================================
function discoverBatchDialog() {
    const results = {
        dialogFound: false,
        formName: null,
        allControls: [],
        inputFields: [],
        checkboxes: [],
        comboboxes: [],
        buttons: [],
        groups: [],
        toggles: []
    };

    // Find the SysOperationTemplateForm or similar dialog
    const dialogForm = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"]') ||
                       document.querySelector('[data-dyn-form-name*="Dialog"]') ||
                       document.querySelector('.dialog-content [data-dyn-form-name]');
    
    if (!dialogForm) {
        console.log('No batch dialog found. Make sure you have opened an Action-type menu item.');
        return results;
    }

    results.dialogFound = true;
    results.formName = dialogForm.getAttribute('data-dyn-form-name');

    // Get ALL elements with data-dyn-controlname within the dialog
    dialogForm.querySelectorAll('[data-dyn-controlname]').forEach(el => {
        const info = {
            controlName: el.getAttribute('data-dyn-controlname'),
            role: el.getAttribute('data-dyn-role'),
            controlType: el.getAttribute('data-dyn-controltype'),
            label: el.querySelector('label')?.textContent?.trim() || 
                   el.getAttribute('aria-label') ||
                   el.getAttribute('title'),
            tagName: el.tagName,
            className: el.className?.substring(0, 100)
        };
        results.allControls.push(info);

        // Categorize by role
        const role = info.role?.toLowerCase() || '';
        if (role.includes('input') || role === 'string' || role === 'integer' || role === 'real') {
            results.inputFields.push(info);
        } else if (role.includes('checkbox') || role === 'yesno') {
            results.checkboxes.push(info);
        } else if (role.includes('combobox') || role === 'dropdown') {
            results.comboboxes.push(info);
        } else if (role.includes('button')) {
            results.buttons.push(info);
        } else if (role === 'group') {
            results.groups.push(info);
        }
    });

    // Look specifically for toggle switches (often used for batch processing)
    dialogForm.querySelectorAll('.toggle, [role="switch"], input[type="checkbox"]').forEach(el => {
        const container = el.closest('[data-dyn-controlname]');
        if (container) {
            results.toggles.push({
                controlName: container.getAttribute('data-dyn-controlname'),
                role: container.getAttribute('data-dyn-role'),
                label: container.querySelector('label')?.textContent?.trim(),
                isChecked: el.checked || el.getAttribute('aria-checked') === 'true'
            });
        }
    });

    console.log('=== Batch Dialog Discovery ===');
    console.log(JSON.stringify(results, null, 2));
    
    // Also provide a summary
    console.log('\n=== SUMMARY ===');
    console.log(`Form: ${results.formName}`);
    console.log(`Total controls: ${results.allControls.length}`);
    console.log(`Input fields: ${results.inputFields.length}`);
    console.log(`Checkboxes/Toggles: ${results.checkboxes.length + results.toggles.length}`);
    console.log(`Buttons: ${results.buttons.length}`);
    
    return results;
}


// ========================================================
// 2. DISCOVER RECURRENCE DIALOG (SysRecurrence)
// Run this when you have clicked the "Recurrence" button
// ========================================================
function discoverRecurrenceDialog() {
    const results = {
        dialogFound: false,
        formName: 'SysRecurrence',
        startDateTime: {},
        endOptions: {},
        pattern: {},
        buttons: [],
        allControls: []
    };

    const recurrenceForm = document.querySelector('[data-dyn-form-name="SysRecurrence"]');
    if (!recurrenceForm) {
        console.log('Recurrence dialog not found. Click the "Recurrence" button first.');
        return results;
    }

    results.dialogFound = true;

    // Categorize all controls
    recurrenceForm.querySelectorAll('[data-dyn-controlname]').forEach(el => {
        const controlName = el.getAttribute('data-dyn-controlname');
        const role = el.getAttribute('data-dyn-role');
        const label = el.querySelector('label')?.textContent?.trim() || 
                      el.getAttribute('aria-label');

        const info = { controlName, role, label };
        results.allControls.push(info);

        // Categorize by name patterns
        const nameLower = controlName?.toLowerCase() || '';
        
        if (nameLower === 'startdate') {
            results.startDateTime.startDate = info;
        } else if (nameLower === 'starttime') {
            results.startDateTime.startTime = info;
        } else if (nameLower === 'timezone') {
            results.startDateTime.timezone = info;
        } else if (nameLower === 'enddateint') {
            results.endOptions.count = info;
        } else if (nameLower === 'enddatedate') {
            results.endOptions.endDate = info;
        } else if (nameLower === 'patternunit') {
            results.pattern.unit = info;
        } else if (nameLower.includes('int') && (nameLower.includes('minute') || nameLower.includes('hour') || nameLower.includes('day') || nameLower.includes('week') || nameLower.includes('month') || nameLower.includes('year'))) {
            if (!results.pattern.intervals) results.pattern.intervals = [];
            results.pattern.intervals.push(info);
        } else if (role === 'CommandButton') {
            results.buttons.push(info);
        }
    });

    console.log('=== Recurrence Dialog Discovery ===');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\n=== KEY CONTROLS FOR AUTOMATION ===');
    console.log('Start Date:', results.startDateTime.startDate?.controlName);
    console.log('Start Time:', results.startDateTime.startTime?.controlName);
    console.log('Pattern Unit (radio):', results.pattern.unit?.controlName);
    console.log('End Count:', results.endOptions.count?.controlName);
    console.log('End Date:', results.endOptions.endDate?.controlName);
    
    return results;
}


// ========================================================
// 3. DISCOVER FILTER DIALOG (SysQueryForm)
// Run this when you have clicked the "Filter" button
// ========================================================
function discoverFilterDialog() {
    const results = {
        dialogFound: false,
        formName: 'SysQueryForm',
        tabs: [],
        gridInfo: {},
        savedQueries: null,
        buttons: [],
        checkboxes: [],
        allControls: []
    };

    const queryForm = document.querySelector('[data-dyn-form-name="SysQueryForm"]');
    if (!queryForm) {
        console.log('Filter dialog not found. Click the "Filter" button first.');
        return results;
    }

    results.dialogFound = true;

    // Get tabs
    queryForm.querySelectorAll('[data-dyn-role="PivotItem"]').forEach(el => {
        results.tabs.push({
            controlName: el.getAttribute('data-dyn-controlname'),
            label: el.textContent?.trim().split('\n')[0],
            isVisible: el.offsetParent !== null
        });
    });

    // Get grid info (RangeGrid)
    const grid = queryForm.querySelector('[data-dyn-controlname="RangeGrid"]');
    if (grid) {
        results.gridInfo = {
            controlName: 'RangeGrid',
            role: grid.getAttribute('data-dyn-role'),
            columns: ['RangeTable', 'RangePrefix', 'RangeField', 'RangeValue']
        };
    }

    // Get all controls
    queryForm.querySelectorAll('[data-dyn-controlname]').forEach(el => {
        const controlName = el.getAttribute('data-dyn-controlname');
        const role = el.getAttribute('data-dyn-role');
        const label = el.querySelector('label')?.textContent?.trim();

        const info = { controlName, role, label };
        results.allControls.push(info);

        if (controlName === 'SavedQueriesBox') {
            results.savedQueries = info;
        } else if (role === 'CommandButton' || role === 'Button') {
            results.buttons.push(info);
        } else if (role === 'CheckBox') {
            results.checkboxes.push(info);
        }
    });

    console.log('=== Filter Dialog Discovery ===');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\n=== KEY CONTROLS FOR AUTOMATION ===');
    console.log('Grid:', results.gridInfo.controlName);
    console.log('Add button: RangeAdd');
    console.log('Remove button: RangeRemove');
    console.log('OK button: OkButton');
    console.log('Tabs:', results.tabs.map(t => t.controlName).join(', '));
    
    return results;
}


// ========================================================
// 4. DISCOVER ALL OPEN FORMS/DIALOGS
// Run this to see what forms are currently open
// ========================================================
function discoverOpenForms() {
    const results = {
        currentUrl: {
            full: window.location.href,
            menuItem: new URLSearchParams(window.location.search).get('mi'),
            company: new URLSearchParams(window.location.search).get('cmp')
        },
        forms: [],
        dialogStack: []
    };

    // Find all forms
    document.querySelectorAll('[data-dyn-form-name]').forEach(el => {
        const formName = el.getAttribute('data-dyn-form-name');
        const isDialog = el.closest('.dialog-container') !== null || 
                         formName.includes('Dialog') ||
                         formName.includes('Form') ||
                         formName === 'SysRecurrence' ||
                         formName === 'SysQueryForm';
        
        results.forms.push({
            formName,
            isDialog,
            isVisible: el.offsetParent !== null,
            zIndex: window.getComputedStyle(el).zIndex
        });

        if (isDialog && el.offsetParent !== null) {
            results.dialogStack.push(formName);
        }
    });

    console.log('=== Open Forms Discovery ===');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\n=== DIALOG STACK (top to bottom) ===');
    results.dialogStack.reverse().forEach((form, i) => {
        console.log(`${i + 1}. ${form}`);
    });
    
    return results;
}


// ========================================================
// 5. DISCOVER FORM INPUTS (for any specific form)
// Run with a form name to see all input fields
// ========================================================
function discoverFormInputs(formName) {
    const form = formName 
        ? document.querySelector(`[data-dyn-form-name="${formName}"]`)
        : document.querySelector('[data-dyn-form-name]:last-of-type');
    
    if (!form) {
        console.log(`Form "${formName || 'any'}" not found.`);
        return null;
    }

    const actualFormName = form.getAttribute('data-dyn-form-name');
    const results = {
        formName: actualFormName,
        inputs: [],
        checkboxes: [],
        comboboxes: [],
        radioButtons: [],
        dateFields: [],
        timeFields: [],
        integerFields: [],
        stringFields: []
    };

    form.querySelectorAll('[data-dyn-controlname]').forEach(el => {
        const role = el.getAttribute('data-dyn-role');
        const controlName = el.getAttribute('data-dyn-controlname');
        const label = el.querySelector('label')?.textContent?.trim() ||
                      el.getAttribute('aria-label') ||
                      el.getAttribute('title');

        if (!role) return;

        const info = { controlName, role, label };
        results.inputs.push(info);

        // Categorize by role
        switch (role) {
            case 'CheckBox':
            case 'YesNo':
                results.checkboxes.push(info);
                break;
            case 'ComboBox':
            case 'DropdownList':
                results.comboboxes.push(info);
                break;
            case 'RadioButton':
                results.radioButtons.push(info);
                break;
            case 'Date':
                results.dateFields.push(info);
                break;
            case 'Time':
                results.timeFields.push(info);
                break;
            case 'Integer':
            case 'Real':
                results.integerFields.push(info);
                break;
            case 'String':
            case 'Input':
                results.stringFields.push(info);
                break;
        }
    });

    console.log(`=== Form Inputs for "${actualFormName}" ===`);
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\n=== SUMMARY ===');
    console.log(`Checkboxes: ${results.checkboxes.map(c => c.controlName).join(', ') || 'none'}`);
    console.log(`Comboboxes: ${results.comboboxes.map(c => c.controlName).join(', ') || 'none'}`);
    console.log(`Date fields: ${results.dateFields.map(c => c.controlName).join(', ') || 'none'}`);
    console.log(`Integer fields: ${results.integerFields.map(c => c.controlName).join(', ') || 'none'}`);
    
    return results;
}


// ========================================================
// 6. GET ELEMENT DETAILS BY CLICKING
// Start monitoring and click elements to see their details
// ========================================================
let clickMonitorHandler = null;

function startClickMonitor() {
    clickMonitorHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Find the nearest control
        const target = e.target.closest('[data-dyn-controlname]') || e.target;
        const form = target.closest('[data-dyn-form-name]');
        
        const details = {
            controlName: target.getAttribute('data-dyn-controlname'),
            role: target.getAttribute('data-dyn-role'),
            controlType: target.getAttribute('data-dyn-controltype'),
            formName: form?.getAttribute('data-dyn-form-name'),
            label: target.querySelector('label')?.textContent?.trim() ||
                   target.getAttribute('aria-label') ||
                   target.getAttribute('title'),
            text: target.textContent?.trim().substring(0, 100),
            tagName: target.tagName,
            id: target.id,
            classes: target.className?.substring(0, 100),
            allDataAttrs: {}
        };

        // Get all data attributes
        Array.from(target.attributes)
            .filter(a => a.name.startsWith('data-'))
            .forEach(a => { details.allDataAttrs[a.name] = a.value; });

        console.log('=== Clicked Element ===');
        console.log(JSON.stringify(details, null, 2));
        
        // Also show how to target this element
        if (details.controlName) {
            console.log(`\n=== SELECTOR ===`);
            console.log(`document.querySelector('[data-dyn-controlname="${details.controlName}"]')`);
            if (details.formName) {
                console.log(`// Within form: [data-dyn-form-name="${details.formName}"]`);
            }
        }
        
        return false;
    };
    
    document.addEventListener('click', clickMonitorHandler, true);
    console.log('🔍 Click monitor STARTED. Click on any element to see its details.');
    console.log('   Run stopClickMonitor() to stop.');
}

function stopClickMonitor() {
    if (clickMonitorHandler) {
        document.removeEventListener('click', clickMonitorHandler, true);
        clickMonitorHandler = null;
        console.log('✓ Click monitor STOPPED.');
    } else {
        console.log('Click monitor was not running.');
    }
}


// ========================================================
// 7. COMPREHENSIVE PAGE SCAN
// Get everything on the current page
// ========================================================
function discoverEverything() {
    const results = {
        url: {
            full: window.location.href,
            menuItem: new URLSearchParams(window.location.search).get('mi'),
            company: new URLSearchParams(window.location.search).get('cmp')
        },
        forms: [],
        byForm: {}
    };

    // Get all forms
    document.querySelectorAll('[data-dyn-form-name]').forEach(formEl => {
        const formName = formEl.getAttribute('data-dyn-form-name');
        const isVisible = formEl.offsetParent !== null;
        
        results.forms.push({ formName, isVisible });
        
        if (!isVisible) return; // Skip hidden forms
        
        const formData = {
            tabs: [],
            sections: [],
            buttons: [],
            inputs: [],
            grids: []
        };

        // Tabs
        formEl.querySelectorAll('[data-dyn-role="PivotItem"]').forEach(el => {
            formData.tabs.push({
                controlName: el.getAttribute('data-dyn-controlname'),
                label: el.textContent?.trim().split('\n')[0]
            });
        });

        // Sections
        formEl.querySelectorAll('[data-dyn-role="SectionPage"], [data-dyn-role="Group"]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (controlName && !controlName.match(/^\d+$/)) { // Skip numeric IDs
                formData.sections.push({
                    controlName,
                    label: el.querySelector('label, .section-header')?.textContent?.trim()
                });
            }
        });

        // Buttons
        formEl.querySelectorAll('[data-dyn-role*="Button"]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (controlName && !controlName.match(/^\d+$/) && !controlName.includes('Clear')) {
                formData.buttons.push({
                    controlName,
                    role: el.getAttribute('data-dyn-role'),
                    label: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 50)
                });
            }
        });

        // Inputs (all types)
        const inputRoles = ['Input', 'String', 'Integer', 'Real', 'Date', 'Time', 
                           'CheckBox', 'YesNo', 'ComboBox', 'RadioButton'];
        inputRoles.forEach(role => {
            formEl.querySelectorAll(`[data-dyn-role="${role}"]`).forEach(el => {
                const controlName = el.getAttribute('data-dyn-controlname');
                if (controlName) {
                    formData.inputs.push({
                        controlName,
                        role,
                        label: el.querySelector('label')?.textContent?.trim()
                    });
                }
            });
        });

        // Grids
        formEl.querySelectorAll('[data-dyn-role="Grid"], [data-dyn-role="ReactList"]').forEach(el => {
            formData.grids.push({
                controlName: el.getAttribute('data-dyn-controlname'),
                role: el.getAttribute('data-dyn-role')
            });
        });

        results.byForm[formName] = formData;
    });

    console.log('=== Complete Page Discovery ===');
    console.log(JSON.stringify(results, null, 2));
    return results;
}


// ========================================================
// 8. DISCOVER PARAMETER FORM TABS
// Lists all tabs and shows which one is active
// Run this first on parameter forms to see all tabs
// ========================================================
function discoverTabs() {
    const results = {
        formName: null,
        activeTab: null,
        tabs: []
    };

    // Find the main form (not dashboard)
    const forms = document.querySelectorAll('[data-dyn-form-name]');
    let mainForm = null;
    forms.forEach(f => {
        const name = f.getAttribute('data-dyn-form-name');
        if (name !== 'DefaultDashboard' && f.offsetParent !== null) {
            mainForm = f;
            results.formName = name;
        }
    });

    if (!mainForm) {
        console.log('No main form found.');
        return results;
    }

    // Find all tabs
    mainForm.querySelectorAll('[data-dyn-role="PivotItem"]').forEach(el => {
        const controlName = el.getAttribute('data-dyn-controlname');
        const isActive = el.classList.contains('active') || 
                        el.getAttribute('aria-selected') === 'true' ||
                        el.closest('[aria-selected="true"]') !== null;
        
        // Try to get the tab header for label
        const headerEl = mainForm.querySelector(`[data-dyn-controlname="${controlName}_header"]`);
        const label = headerEl?.textContent?.trim() || 
                     el.querySelector('.pivot-link-text')?.textContent?.trim() ||
                     el.textContent?.trim().split('\n')[0];

        const tabInfo = {
            controlName,
            label: label?.substring(0, 50),
            isActive
        };
        
        results.tabs.push(tabInfo);
        if (isActive) {
            results.activeTab = controlName;
        }
    });

    console.log('=== Parameter Form Tabs ===');
    console.log(`Form: ${results.formName}`);
    console.log(`Active Tab: ${results.activeTab}`);
    console.log('\nAll Tabs:');
    results.tabs.forEach((tab, i) => {
        const marker = tab.isActive ? ' ◀ ACTIVE' : '';
        console.log(`  ${i + 1}. ${tab.controlName} - "${tab.label || '(no label)'}"${marker}`);
    });
    
    console.log('\n💡 TIP: Click on each tab and run discoverActiveTab() to see its fields.');
    
    return results;
}


// ========================================================
// 9. DISCOVER ACTIVE TAB CONTENT
// Run this after clicking on a tab to see its fields
// ========================================================
function discoverActiveTab() {
    const results = {
        formName: null,
        activeTab: null,
        sections: [],
        fields: {
            inputs: [],
            checkboxes: [],
            comboboxes: [],
            integers: [],
            dates: []
        },
        summary: {}
    };

    // Find the main form
    const forms = document.querySelectorAll('[data-dyn-form-name]');
    let mainForm = null;
    forms.forEach(f => {
        const name = f.getAttribute('data-dyn-form-name');
        if (name !== 'DefaultDashboard' && f.offsetParent !== null) {
            mainForm = f;
            results.formName = name;
        }
    });

    if (!mainForm) {
        console.log('No main form found.');
        return results;
    }

    // Find active tab
    const activeTabEl = mainForm.querySelector('[data-dyn-role="PivotItem"].active, [data-dyn-role="PivotItem"][aria-selected="true"]');
    if (activeTabEl) {
        results.activeTab = activeTabEl.getAttribute('data-dyn-controlname');
    }

    // Find all visible sections (FastTabs) in the active tab area
    mainForm.querySelectorAll('[data-dyn-role="SectionPage"], [data-dyn-role="TabPage"]').forEach(el => {
        if (el.offsetParent === null) return; // Skip hidden sections
        
        const controlName = el.getAttribute('data-dyn-controlname');
        if (!controlName || controlName.match(/^\d+$/)) return;

        const headerEl = el.querySelector('[data-dyn-role="SectionPageHeader"], .section-header');
        const label = headerEl?.textContent?.trim()?.split('\n')[0];
        const isExpanded = !el.classList.contains('collapsed') && 
                          el.getAttribute('aria-expanded') !== 'false';

        results.sections.push({
            controlName,
            label: label?.substring(0, 50),
            isExpanded
        });
    });

    // Categorize all visible input fields
    mainForm.querySelectorAll('[data-dyn-controlname]').forEach(el => {
        if (el.offsetParent === null) return; // Skip hidden
        
        const controlName = el.getAttribute('data-dyn-controlname');
        const role = el.getAttribute('data-dyn-role');
        const label = el.querySelector('label')?.textContent?.trim() ||
                     el.getAttribute('aria-label');

        if (!role || !controlName || controlName.match(/^\d+$/)) return;

        const info = { controlName, label: label?.substring(0, 40) };

        switch (role) {
            case 'Input':
            case 'String':
                results.fields.inputs.push(info);
                break;
            case 'CheckBox':
            case 'YesNo':
                results.fields.checkboxes.push(info);
                break;
            case 'ComboBox':
            case 'DropdownList':
                results.fields.comboboxes.push(info);
                break;
            case 'Integer':
            case 'Real':
                results.fields.integers.push(info);
                break;
            case 'Date':
            case 'Time':
                results.fields.dates.push(info);
                break;
        }
    });

    // Summary counts
    results.summary = {
        sections: results.sections.length,
        inputs: results.fields.inputs.length,
        checkboxes: results.fields.checkboxes.length,
        comboboxes: results.fields.comboboxes.length,
        integers: results.fields.integers.length,
        dates: results.fields.dates.length
    };

    console.log(`=== Active Tab: ${results.activeTab} ===`);
    console.log(`Form: ${results.formName}`);
    console.log(`\nSections (FastTabs): ${results.sections.length}`);
    results.sections.forEach(s => {
        const exp = s.isExpanded ? '▼' : '▶';
        console.log(`  ${exp} ${s.controlName} - "${s.label || ''}"`);
    });

    console.log(`\n📝 Input Fields: ${results.fields.inputs.length}`);
    results.fields.inputs.forEach(f => console.log(`    • ${f.controlName} - "${f.label || ''}"`));

    console.log(`\n☑️ Checkboxes: ${results.fields.checkboxes.length}`);
    results.fields.checkboxes.forEach(f => console.log(`    • ${f.controlName} - "${f.label || ''}"`));

    console.log(`\n📋 Comboboxes: ${results.fields.comboboxes.length}`);
    results.fields.comboboxes.forEach(f => console.log(`    • ${f.controlName} - "${f.label || ''}"`));

    console.log(`\n🔢 Integer/Real Fields: ${results.fields.integers.length}`);
    results.fields.integers.forEach(f => console.log(`    • ${f.controlName} - "${f.label || ''}"`));

    console.log(`\n📅 Date/Time Fields: ${results.fields.dates.length}`);
    results.fields.dates.forEach(f => console.log(`    • ${f.controlName} - "${f.label || ''}"`));

    return results;
}


// ========================================================
// 10. GENERATE WORKFLOW STEPS FOR CURRENT TAB
// Creates step templates you can copy into your workflow
// ========================================================
function generateStepsForTab() {
    const tabData = discoverActiveTab();
    if (!tabData.activeTab) {
        console.log('Could not determine active tab.');
        return;
    }

    const steps = [];
    
    // Add tab navigation step
    steps.push({
        type: 'tab-navigate',
        controlName: tabData.activeTab,
        displayText: `Switch to ${tabData.activeTab} tab`
    });

    // Add input steps
    tabData.fields.inputs.forEach(f => {
        steps.push({
            type: 'input',
            controlName: f.controlName,
            value: '', // User fills this
            displayText: f.label || f.controlName
        });
    });

    // Add checkbox steps
    tabData.fields.checkboxes.forEach(f => {
        steps.push({
            type: 'checkbox',
            controlName: f.controlName,
            value: 'true', // or 'false'
            displayText: f.label || f.controlName
        });
    });

    // Add combobox steps
    tabData.fields.comboboxes.forEach(f => {
        steps.push({
            type: 'select',
            controlName: f.controlName,
            value: '', // User fills this
            displayText: f.label || f.controlName
        });
    });

    // Add integer steps
    tabData.fields.integers.forEach(f => {
        steps.push({
            type: 'input',
            controlName: f.controlName,
            value: '', // User fills this
            displayText: f.label || f.controlName
        });
    });

    console.log('=== Generated Step Templates ===');
    console.log('Copy these into your workflow and fill in the values:\n');
    console.log(JSON.stringify(steps, null, 2));
    
    console.log('\n📋 Quick Summary:');
    console.log(`   Tab navigation: 1 step`);
    console.log(`   Input fields: ${tabData.fields.inputs.length} steps`);
    console.log(`   Checkboxes: ${tabData.fields.checkboxes.length} steps`);
    console.log(`   Comboboxes: ${tabData.fields.comboboxes.length} steps`);
    console.log(`   Integer fields: ${tabData.fields.integers.length} steps`);

    return steps;
}


// ========================================================
// 11. DISCOVER ACTION PANE TABS (Horizontal ribbon tabs)
// These are the tabs at the top: Sales order, Sell, Manage, etc.
// ========================================================
function discoverActionPaneTabs() {
    const results = {
        formName: null,
        activeTab: null,
        tabs: []
    };

    // Find the main form (not dashboard)
    const forms = document.querySelectorAll('[data-dyn-form-name]');
    let mainForm = null;
    forms.forEach(f => {
        const name = f.getAttribute('data-dyn-form-name');
        if (name !== 'DefaultDashboard' && f.offsetParent !== null) {
            mainForm = f;
            results.formName = name;
        }
    });

    // Search in the AppBar area for action pane tabs
    const appBar = document.querySelector('.appBar, [data-dyn-role="ActionPane"], .action-pane');
    
    // Method 1: Find tabs by role="tab"
    document.querySelectorAll('[role="tab"]').forEach(el => {
        // Check if it's in the app bar / action pane area (not in a dialog)
        if (el.closest('.dialog-content, [data-dyn-form-name="SysQueryForm"]')) return;
        
        const controlName = el.getAttribute('data-dyn-controlname');
        const label = el.getAttribute('aria-label') || el.textContent?.trim();
        const isActive = el.getAttribute('aria-selected') === 'true' || 
                        el.classList.contains('active') ||
                        el.classList.contains('selected');
        
        if (!controlName && !label) return;
        
        const tabInfo = {
            controlName: controlName || label?.replace(/\s+/g, ''),
            label: label,
            isActive: isActive,
            tagName: el.tagName,
            classes: el.className?.substring(0, 100)
        };
        
        // Avoid duplicates
        if (!results.tabs.some(t => t.controlName === tabInfo.controlName)) {
            results.tabs.push(tabInfo);
            if (isActive) {
                results.activeTab = tabInfo.controlName;
            }
        }
    });

    // Method 2: Find tabs with data-dyn-controlname inside app bar
    if (appBar) {
        appBar.querySelectorAll('button[data-dyn-controlname], [data-dyn-controlname]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            if (!controlName) return;
            
            // Skip if already found or if it's a button inside a tab
            if (results.tabs.some(t => t.controlName === controlName)) return;
            if (el.closest('[role="tabpanel"]')) return;
            
            const label = el.getAttribute('aria-label') || el.textContent?.trim();
            const isActive = el.getAttribute('aria-selected') === 'true' || 
                            el.classList.contains('active') ||
                            el.classList.contains('selected');
            
            // Only include items that look like tabs
            const isTabLike = el.getAttribute('role') === 'tab' ||
                             el.tagName === 'BUTTON' ||
                             el.classList.contains('appBar-tab') ||
                             el.classList.contains('appBar-tabButton');
            
            if (!isTabLike) return;
            
            results.tabs.push({
                controlName: controlName,
                label: label,
                isActive: isActive,
                tagName: el.tagName,
                classes: el.className?.substring(0, 100)
            });
            
            if (isActive) {
                results.activeTab = controlName;
            }
        });
    }

    // Method 3: Look in tablist
    document.querySelectorAll('[role="tablist"]').forEach(tablist => {
        // Skip if in dialog
        if (tablist.closest('.dialog-content')) return;
        
        tablist.querySelectorAll('[role="tab"], button, [data-dyn-controlname]').forEach(el => {
            const controlName = el.getAttribute('data-dyn-controlname');
            const label = el.getAttribute('aria-label') || el.textContent?.trim();
            
            if (!controlName && !label) return;
            if (results.tabs.some(t => t.controlName === (controlName || label))) return;
            
            const isActive = el.getAttribute('aria-selected') === 'true' || 
                            el.classList.contains('active');
            
            const tabInfo = {
                controlName: controlName || label,
                label: label,
                isActive: isActive,
                tagName: el.tagName,
                classes: el.className?.substring(0, 100)
            };
            
            results.tabs.push(tabInfo);
            if (isActive) {
                results.activeTab = tabInfo.controlName;
            }
        });
    });

    console.log('=== Action Pane Tabs (Ribbon Tabs) ===');
    console.log(`Form: ${results.formName}`);
    console.log(`Active Tab: ${results.activeTab || '(none detected)'}`);
    console.log('\nAll Action Pane Tabs:');
    results.tabs.forEach((tab, i) => {
        const marker = tab.isActive ? ' ◀ ACTIVE' : '';
        console.log(`  ${i + 1}. ${tab.controlName} - "${tab.label || '(no label)'}"${marker}`);
        console.log(`      Tag: ${tab.tagName}, Classes: ${tab.classes?.substring(0, 50) || 'none'}`);
    });
    
    console.log('\n💡 Use these control names in the "Switch Action Pane Tab" step.');
    console.log('   Example: action-pane-tab step with controlName = "' + (results.tabs[0]?.controlName || 'TabName') + '"');

    return results;
}


// ========================================================
// USAGE INSTRUCTIONS
// ========================================================
console.log(`
╔══════════════════════════════════════════════════════════╗
║         D365 UI Discovery Scripts - Enhanced             ║
╠══════════════════════════════════════════════════════════╣
║ Available functions:                                     ║
║                                                          ║
║ BATCH JOB DIALOGS:                                       ║
║ 1. discoverBatchDialog()      - When batch job is open   ║
║ 2. discoverRecurrenceDialog() - When Recurrence clicked  ║
║ 3. discoverFilterDialog()     - When Filter clicked      ║
║                                                          ║
║ PARAMETER FORMS (with tabs):                             ║
║ 8. discoverTabs()             - List all form tabs       ║
║ 9. discoverActiveTab()        - Fields on current tab    ║
║ 10.generateStepsForTab()      - Create workflow steps    ║
║                                                          ║
║ ACTION PANE TABS (Ribbon):                               ║
║ 11.discoverActionPaneTabs()   - Ribbon tabs at top       ║
║                                                          ║
║ GENERAL:                                                 ║
║ 4. discoverOpenForms()        - See all open forms       ║
║ 5. discoverFormInputs(name)   - Inputs in specific form  ║
║ 6. startClickMonitor()        - Click to see details     ║
║    stopClickMonitor()         - Stop monitoring          ║
║ 7. discoverEverything()       - Full page scan           ║
║                                                          ║
║ WORKFLOW FOR PARAMETER FORMS:                            ║
║ 1. Open the parameter form (e.g., CustParameters)        ║
║ 2. Run discoverTabs() to see all tabs                    ║
║ 3. Click on a tab, then run discoverActiveTab()          ║
║ 4. Repeat step 3 for each tab you need                   ║
║ 5. Use generateStepsForTab() to create workflow steps    ║
╚══════════════════════════════════════════════════════════╝
`);