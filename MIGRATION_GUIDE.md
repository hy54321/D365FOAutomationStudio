# Migration Guide: From Hardcoded Script to Chrome Extension

This guide shows how to convert your existing `d365_translation_automation.js` script into a workflow configuration for the Chrome extension.

## Your Current Hardcoded Script

```javascript
const CONFIG = {
    delayAfterClick: 800,
    delayAfterInput: 400,
    delayAfterSave: 1000,
    // ... other hardcoded values
};

async function addSingleTranslation(chargeCode, language, text) {
    // 1. Filter charge code
    await filterChargeCode(chargeCode);
    
    // 2. Click Translations button
    await clickButton('LanguageTxt');
    
    // 3. Click New
    await clickButton('SystemDefinedNewButton');
    
    // 4. Set language
    await setInputValue('LanguageTxt_LanguageId1', language);
    
    // 5. Set text
    await setInputValue('Texts_Txt', text);
    
    // 6. Save
    await clickButton('SystemDefinedSaveButton');
    
    // 7. Close
    await clickButton('SystemDefinedCloseButton');
}
```

---

## Equivalent Extension Workflow Configuration

### Step 1: Create Workflow in Extension UI

1. Open extension popup
2. Click "New Workflow"
3. Name it: "Add Charge Translation"

### Step 2: Configure Steps

Here's how each hardcoded step maps to the extension:

#### **Original Step 1:** Filter Charge Code
```javascript
await filterChargeCode(chargeCode);
```

**Extension Configuration:**
- **Step Type:** Click Button
- **Control Name:** `ChargeCode_Filter` (or whatever the filter control is)
- **Then add:** Input step for the filter field
- **Value Source:** From Data Field
- **Data Field:** `chargeCode`

---

#### **Original Step 2:** Click Translations
```javascript
await clickButton('LanguageTxt');
```

**Extension Configuration:**
- **Step Type:** Click Button
- **Control Name:** `LanguageTxt`
- **Display Text:** "Translations" (for reference)
- **Add Wait:** 800ms (from your CONFIG.delayAfterClick)

---

#### **Original Step 3:** Click New
```javascript
await clickButton('SystemDefinedNewButton');
```

**Extension Configuration:**
- **Step Type:** Click Button
- **Control Name:** `SystemDefinedNewButton`
- **Display Text:** "New"
- **Add Wait:** 500ms

---

#### **Original Step 4:** Set Language
```javascript
await setInputValue('LanguageTxt_LanguageId1', language);
```

**Extension Configuration:**
- **Step Type:** Enter Text
- **Control Name:** `LanguageTxt_LanguageId1`
- **Value Source:** From Data Field
- **Data Field:** `language`

---

#### **Original Step 5:** Set Text
```javascript
await setInputValue('Texts_Txt', text);
```

**Extension Configuration:**
- **Step Type:** Enter Text
- **Control Name:** `Texts_Txt`
- **Value Source:** From Data Field
- **Data Field:** `text`

---

#### **Original Step 6:** Save
```javascript
await clickButton('SystemDefinedSaveButton');
```

**Extension Configuration:**
- **Step Type:** Click Button
- **Control Name:** `SystemDefinedSaveButton`
- **Display Text:** "Save"
- **Add Wait:** 1000ms (from your CONFIG.delayAfterSave)

---

#### **Original Step 7:** Close
```javascript
await clickButton('SystemDefinedCloseButton');
```

**Extension Configuration:**
- **Step Type:** Click Button
- **Control Name:** `SystemDefinedCloseButton`
- **Display Text:** "Close"

---

## Data Source Configuration

### Your Current Data Format

```javascript
const translationData = [
    { chargeCode: "AUF-DE", language: "de", text: "Aufwandspauschale" },
    { chargeCode: "AUF-DE", language: "en-gb", text: "Expense allowance" },
    // ... 144 total
];
```

### Extension Configuration

1. **Data Source Type:** JSON
2. **Paste Data:**
```json
[
    {"chargeCode": "AUF-DE", "language": "de", "text": "Aufwandspauschale"},
    {"chargeCode": "AUF-DE", "language": "en-gb", "text": "Expense allowance"}
]
```

**Or use CSV:**
```csv
chargeCode,language,text
AUF-DE,de,Aufwandspauschale
AUF-DE,en-gb,Expense allowance
```

---

## Complete Workflow JSON Export

Here's what your workflow looks like as JSON (for import/export):

```json
{
    "id": "charge_translations_workflow",
    "name": "Add Charge Translation",
    "version": "1.0",
    "steps": [
        {
            "id": "1",
            "type": "click",
            "controlName": "LanguageTxt",
            "displayText": "Translations",
            "description": "Open translations dialog",
            "delay": 800
        },
        {
            "id": "2",
            "type": "wait",
            "duration": 800,
            "description": "Wait for dialog to open"
        },
        {
            "id": "3",
            "type": "click",
            "controlName": "SystemDefinedNewButton",
            "displayText": "New",
            "description": "Create new translation",
            "delay": 500
        },
        {
            "id": "4",
            "type": "input",
            "controlName": "LanguageTxt_LanguageId1",
            "displayText": "Language",
            "fieldMapping": "language",
            "description": "Enter language code",
            "delay": 400
        },
        {
            "id": "5",
            "type": "input",
            "controlName": "Texts_Txt",
            "displayText": "Text",
            "fieldMapping": "text",
            "description": "Enter translation text",
            "delay": 400
        },
        {
            "id": "6",
            "type": "click",
            "controlName": "SystemDefinedSaveButton",
            "displayText": "Save",
            "description": "Save translation",
            "delay": 1000
        },
        {
            "id": "7",
            "type": "wait",
            "duration": 1000,
            "description": "Wait for save to complete"
        },
        {
            "id": "8",
            "type": "click",
            "controlName": "SystemDefinedCloseButton",
            "displayText": "Close",
            "description": "Close translations dialog"
        }
    ],
    "dataSource": {
        "type": "json",
        "columns": ["chargeCode", "language", "text"]
    },
    "settings": {
        "delayAfterClick": 800,
        "delayAfterInput": 400,
        "delayAfterSave": 1000,
        "maxRetries": 3,
        "pauseOnError": true
    }
}
```

You can save this as `charge_translations_workflow.json` and import it directly into the extension!

---

## Key Differences & Improvements

### What You Gain:

✅ **No More Hardcoding**
- Control names configurable via UI
- Timing adjustments without editing code
- Data source changes without script modifications

✅ **Visual Configuration**
- See all steps at once
- Drag to reorder
- Edit individual steps

✅ **Reusability**
- Save multiple workflows
- Export/import workflows
- Share with team

✅ **Better Error Handling**
- Pause on error
- Retry failed steps
- Visual progress tracking

✅ **Data Flexibility**
- Switch between JSON, CSV, Excel
- No need to run Python converter
- Paste directly from Excel

### What You Lose:

⚠️ **Advanced Custom Logic**
- Your script's `verifyStep()` function would need separate implementation
- Complex conditionals not yet supported
- Custom retry logic needs extension enhancement

**Recommendation:** Keep your script for very complex scenarios, use extension for standard workflows.

---

## Migration Steps

### Phase 1: Install Extension ✅

1. Load extension in Chrome
2. Create icons (or use placeholders)
3. Navigate to D365FO

### Phase 2: Discover Elements 🔍

1. Open Inspector tab
2. Click "Refresh Elements"
3. Verify all your control names exist:
   - `LanguageTxt`
   - `SystemDefinedNewButton`
   - `LanguageTxt_LanguageId1`
   - `Texts_Txt`
   - `SystemDefinedSaveButton`
   - `SystemDefinedCloseButton`

### Phase 3: Build Workflow 🏗️

1. Create new workflow
2. Add steps one by one (use Element Picker!)
3. Set up data source
4. Configure timing in Settings

### Phase 4: Test 🧪

1. Test with 1 row
2. Test with 3 rows
3. Compare results to manual entry
4. Adjust timing if needed

### Phase 5: Production 🚀

1. Save workflow
2. Run full 144-row dataset
3. Monitor console for errors
4. Export workflow as backup

---

## Quick Start: Using Element Picker

Instead of manually typing control names, use the visual picker:

1. Navigate to the form in D365FO
2. Open extension, go to Builder tab
3. Click "Add Step" → select step type
4. Click "🎯 Pick from Page" button
5. Extension window closes
6. **Hover over elements** on D365 page (they'll highlight)
7. **Click the element** you want
8. Extension automatically fills in control name!

This is much easier than:
- Inspecting elements manually
- Copying control names from DevTools
- Risking typos

---

## Customization Options

### Add Custom Verification Step

If you want to keep your `verifyStep()` logic:

**Option 1: Enhance Extension**
Add new step type "Verify Field Value":
```javascript
// In content.js, add to executeStep():
case 'verify':
    const value = await getFieldValue(step.controlName);
    if (value !== step.expectedValue) {
        throw new Error(`Verification failed: ${value} !== ${step.expectedValue}`);
    }
    break;
```

**Option 2: Hybrid Approach**
Run extension workflow, then run verification script:
```javascript
// After extension completes
await runVerification();
```

---

### Adjust Timing Per Environment

If you have slower D365 environment:

1. Go to Settings tab
2. Increase all delays by 50%:
   - Delay After Click: 800 → 1200
   - Delay After Input: 400 → 600
   - Delay After Save: 1000 → 1500
3. Save settings

The workflow will use these timings automatically.

---

### Handle Multiple Charge Codes

Your current script processes one charge code at a time.

**Extension Approach:**

**Option A: Include in Data**
```csv
chargeCode,language,text
AUF-DE,de,Aufwandspauschale
AUF-DE,en-gb,Expense allowance
FUEL,de,Kraftstoffzuschlag
FUEL,en-gb,Fuel surcharge
```

Add step to filter by `{chargeCode}` at the start.

**Option B: Separate Workflows**
Create one workflow per charge code, or filter manually before running.

---

## Troubleshooting Migration

### "Element not found" errors

**Cause:** Control names changed or element not visible
**Solution:** 
- Use Element Inspector to find current control names
- Add wait steps before accessing elements
- Check if element is in a dialog that needs to be opened first

### Values not setting correctly

**Cause:** Field type mismatch (enum vs text)
**Solution:**
- Use Element Picker to auto-detect field type
- Check Inspector tab to see field type
- Ensure proper events are dispatched (extension handles this)

### Timing issues

**Cause:** D365 needs more time to process
**Solution:**
- Increase delays in Settings
- Add explicit Wait steps between operations
- Check "Pause on Error" to identify slow steps

### Data import errors

**Cause:** Column names don't match field mappings
**Solution:**
- Use exact column names from your data
- Click "Validate Data" before running
- Check that field mappings match data columns exactly

---

## Benefits Summary

| Aspect | Hardcoded Script | Chrome Extension |
|--------|-----------------|------------------|
| **Setup Time** | Write 700+ lines of code | 10 minutes in UI |
| **Modification** | Edit code, reload | Click and change |
| **Sharing** | Share .js file, explain setup | Export JSON, import |
| **Data Changes** | Re-run Python converter | Paste new data |
| **Error Handling** | Custom code | Built-in with UI |
| **Documentation** | Code comments | Visual workflow |
| **Learning Curve** | JavaScript required | Point and click |
| **Flexibility** | Unlimited | Limited to supported steps |
| **Maintenance** | Manual updates | Settings UI |

---

## Next Steps

1. ✅ Install the extension (already created for you!)
2. 📋 Create icon placeholders (see icons/README.md)
3. 🔍 Use Inspector to verify your control names still work
4. 🏗️ Build your workflow using the UI
5. 🧪 Test with small dataset
6. 🚀 Run full automation

**Estimated time to migrate:** 15-30 minutes for your charge translation workflow!

---

**Pro Tip:** Keep your original script as a backup for complex scenarios, but use the extension for day-to-day automation. You get the best of both worlds! 🎯
