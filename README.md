# D365FO Automation Studio - Chrome Extension

## Overview

This Chrome extension provides a visual workflow builder for automating repetitive tasks in Dynamics 365 Finance & Operations (D365FO). Instead of manually creating scripts, you can configure automation workflows through a user-friendly interface.

## Features

### 1. **Visual Workflow Builder**
- Create multi-step automation workflows through UI
- No coding required
- Drag-and-drop step ordering
- Save and reuse workflows

### 2. **Element Inspector**
- Discover all interactive elements on D365FO pages
- Visual element picker (click to select)
- Automatic field type detection (text, enum, lookup)
- Search and filter elements

### 3. **Data Import**
- Support for JSON, CSV, and Excel (TSV) data
- Map data fields to form fields
- Batch processing with progress tracking

### 4. **Configurable Settings**
- Timing adjustments for slower systems
- Retry mechanisms
- Verbose logging options

## How Element Identification Works

### D365FO Control Structure

D365FO uses a consistent attribute system for controls:

```html
<button data-dyn-controlname="LanguageTxt"     ✅ STABLE
        data-dyn-role="Button"                  ✅ STABLE
        data-dyn-serverid="markuptable_cust_2"  ❌ Session-specific
        id="markuptable_cust_2_LanguageTxt">    ❌ Session-specific
    Translations
</button>
```

**Key Attributes:**
- `data-dyn-controlname`: **STABLE** - Unique identifier for each control (use this!)
- `data-dyn-role`: **STABLE** - Control type (Button, Input, ComboBox, etc.)
- `data-dyn-serverid`: **UNSTABLE** - Changes per session
- `id`: **UNSTABLE** - Includes session-specific prefixes

### Field Type Detection

The extension automatically detects field types by analyzing:

1. **Enum/Dropdown Fields**
   - Has `data-dyn-role="ComboBox"`
   - Contains `<select>` element
   - Has dropdown options

2. **Lookup Fields**
   - Has lookup button (`.lookup-button`)
   - Has class `field-hasLookupButton`
   - May allow freetext or be lookup-only

3. **Textarea Fields**
   - Has `data-dyn-role="MultilineInput"`
   - Contains `<textarea>` element

4. **Text Fields**
   - Has `data-dyn-role="Input"`
   - Contains `<input type="text">`

5. **Numeric Fields**
   - Contains `<input type="number">`

6. **Date Fields**
   - Has date-related CSS classes
   - Contains date picker elements

### Button Text Identification

Buttons are identified by multiple fallback methods:

1. `aria-label` attribute (highest priority)
2. Visible text content (excluding icons)
3. `title` attribute
4. Control name (last resort)

Example:
```javascript
// The inspector finds:
{
    type: 'button',
    controlName: 'SystemDefinedNewButton',
    displayText: 'New',           // User-friendly text
    selector: '[data-dyn-controlname="SystemDefinedNewButton"]'
}
```

## Installation

### Development Installation

1. Clone or download this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `d365-automation-extension` folder

### Creating Icons (Required)

Create three icon sizes in the `icons/` folder:
- `icon16.png` (16×16 pixels)
- `icon48.png` (48×48 pixels)
- `icon128.png` (128×128 pixels)

Quick way to create placeholders:
1. Use any image editor
2. Create simple blue/purple gradient squares
3. Add "D365" text in white

## Usage Guide

### Step 1: Create a Workflow

1. Click the extension icon in Chrome toolbar
2. Go to "Builder" tab
3. Click "New Workflow"
4. Enter a workflow name

### Step 2: Add Steps

Click "Add Step" and choose step type:

#### **Click Button**
- Use for clicking any button (New, Save, Translations, etc.)
- Pick element from page or enter control name manually
- Example: Click "New" button → `SystemDefinedNewButton`

#### **Enter Text**
- Use for text fields, textareas, or selecting from dropdowns
- Choose "Static Value" for fixed text
- Choose "From Data Field" to map to CSV/JSON column
- Example: Enter language code → `LanguageTxt_LanguageId1`

#### **Wait/Delay**
- Add pauses between steps for page loading
- Recommended after clicks that open forms

### Step 3: Configure Data Source (Optional)

For batch processing:

1. Select data type (JSON, CSV, or Excel TSV)
2. Paste your data
3. Click "Validate Data"
4. Map data fields to workflow steps

**JSON Example:**
```json
[
    {"chargeCode": "AUF-DE", "language": "de", "text": "Aufwandspauschale"},
    {"chargeCode": "AUF-DE", "language": "en-gb", "text": "Expense allowance"}
]
```

**CSV Example:**
```csv
chargeCode,language,text
AUF-DE,de,Aufwandspauschale
AUF-DE,en-gb,Expense allowance
```

### Step 4: Use Element Inspector

To discover available elements:

1. Go to "Inspector" tab
2. Click "Start Inspector"
3. Extension window will close
4. Hover over elements on D365 page
5. Click to select an element
6. Element details are copied to your workflow

The inspector shows:
- **Control Name**: Technical identifier
- **Display Text**: Human-readable label
- **Type**: button/input/grid
- **Field Type**: For inputs (text, enum, lookup, etc.)

### Step 5: Save and Run

1. Click "Save" to store your workflow
2. To run: Load the workflow and click "Run"
3. Monitor progress in console

## Example: Charge Translation Workflow

### Scenario
Add multiple translations for charge codes from CSV file

### Workflow Steps:
1. **Click** "Translations" button (`LanguageTxt`)
2. **Wait** 800ms
3. **Click** "New" button (`SystemDefinedNewButton`)
4. **Wait** 500ms
5. **Enter Text** Language field (`LanguageTxt_LanguageId1`) → Map to `{language}`
6. **Enter Text** Text field (`Texts_Txt`) → Map to `{text}`
7. **Click** "Save" button (`SystemDefinedSaveButton`)
8. **Wait** 1000ms
9. **Click** "Close" button

### Data Source (CSV):
```csv
language,text
de,Aufwandspauschale
en-gb,Expense allowance
es,Asignación de gastos
```

This workflow will run 3 times, once per data row.

## Best Practices

### ✅ Do's

1. **Use Stable Control Names**
   - Always use `data-dyn-controlname` for identification
   - Don't use element IDs (they change per session)

2. **Add Appropriate Delays**
   - After clicks that open new forms: 800-1000ms
   - After input: 400-500ms
   - After save operations: 1000-1500ms

3. **Test with Small Data First**
   - Test workflow with 1-3 rows before batch processing
   - Verify field mappings are correct

4. **Use Element Picker**
   - Easier than guessing control names
   - Ensures you get the exact selector

5. **Handle Errors Gracefully**
   - Enable "Pause on Error" in settings during testing
   - Check console logs for issues

### ❌ Don'ts

1. **Don't Use Element IDs**
   - IDs like `markuptable_cust_2_LanguageTxt` are session-specific
   - They will fail after page refresh

2. **Don't Rush Timing**
   - D365FO needs time to process changes
   - Too-fast automation will skip steps or enter wrong data

3. **Don't Forget Validation**
   - Always validate your data before running
   - Check that field names match exactly

4. **Don't Mix Static and Dynamic Values**
   - Be clear whether step uses static value or data field
   - One step = one value source

## D365FO-Specific Challenges

### 1. **Dynamic Element IDs**
**Problem**: D365 generates new IDs every session
**Solution**: Use `data-dyn-controlname` which is stable

### 2. **Lazy Loading**
**Problem**: Elements may not exist until user interacts
**Solution**: Add wait steps and use retry logic

### 3. **Complex Form Validation**
**Problem**: D365 has custom validation that triggers on blur/change
**Solution**: Extension dispatches proper events (input, change, blur)

### 4. **Textarea vs Input Handling**
**Problem**: Textareas require different property setter
**Solution**: Extension auto-detects tag type and uses correct prototype

### 5. **Enum/Lookup Fields**
**Problem**: Can't just type text, must select from options
**Solution**: Extension detects field type and handles appropriately

### 6. **Modal Dialogs**
**Problem**: Buttons may be duplicated (one on toolbar, one in dialog)
**Solution**: Inspector shows all matches; use the visible one

## Advanced: Understanding the Code

### Architecture

```
popup.html/popup.js     → Extension UI
    ↓ chrome.tabs.sendMessage
content.js              → Content script (bridge)
    ↓ window.postMessage
injected.js             → Page context (D365Inspector)
    → Accesses D365 DOM
```

### Why This Architecture?

- **Content Script**: Can communicate with extension but has limited DOM access
- **Injected Script**: Runs in page context, can access D365's JavaScript and full DOM
- **Message Passing**: Bridges the two contexts securely

### Key Classes

**D365Inspector** (`injected.js`):
- `discoverElements()`: Scans page for all controls
- `detectFieldType()`: Determines if field is enum/lookup/text
- `startElementPicker()`: Interactive element selection

**PopupController** (`popup.js`):
- `createNewWorkflow()`: Initializes workflow builder
- `saveStep()`: Persists workflow steps
- `executeWorkflow()`: Runs automation

## Troubleshooting

### Elements Not Found
- Check if page has loaded completely
- Verify control name spelling
- Use Element Inspector to verify control exists

### Values Not Setting
- Check field type (enum vs text vs lookup)
- Increase delay after input
- Check console for "Illegal invocation" errors

### Workflow Stops Mid-Execution
- Enable verbose logging in settings
- Check timing delays
- Verify data structure matches field mappings

### Extension Not Loading
- Check manifest.json for errors
- Ensure all files are in correct locations
- Check Chrome console for errors

## Future Enhancements

Potential features to add:

1. **Conditional Steps**: If/then logic based on field values
2. **Grid Operations**: Add/edit rows in grids
3. **Multi-Page Workflows**: Navigate between forms
4. **Error Recovery**: Auto-retry failed steps
5. **Recording Mode**: Record clicks and generate workflow
6. **Export/Import**: Share workflows as JSON
7. **Schedule Automation**: Run at specific times
8. **Screenshot on Error**: Visual debugging

## Security & Privacy

- Extension only runs on D365 domains
- No data is sent to external servers
- Workflows and data stored locally in browser
- All automation runs client-side

## Contributing

To extend this extension:

1. Add new step types in `popup.js` → `updateStepFields()`
2. Add execution logic in `content.js` → `executeStep()`
3. Enhance element detection in `injected.js` → `detectFieldType()`

## License

This is a sample implementation for educational purposes.

## Support

For D365FO-specific questions:
- Check control names using browser DevTools
- Test automation manually in console first
- Review D365FO's aria-labels and data attributes

---

**Version**: 1.0.0  
**Last Updated**: January 2026
#   D 3 6 5 F O A u t o m a t i o n S t u d i o  
 