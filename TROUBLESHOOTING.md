# Troubleshooting Guide

## Common Errors and Solutions

### Error: "window.close()" fails in popup.js

**Symptom:** Error at line 314 in popup.js when clicking "Pick from Page"

**Cause:** 
- Popup tries to close itself after starting element picker
- Chrome may block `window.close()` in certain contexts
- Popup closes before it can receive the picked element data

**Solution:** ✅ FIXED
- Extension now stores pick state in `chrome.storage.local`
- Popup can safely close
- When reopened, popup checks for picked element and restores state
- Element picker data survives the popup close/reopen cycle

**How it works now:**
1. Click "🎯 Pick from Page"
2. Popup stores current step and sets `waitingForPick` flag
3. Popup closes
4. User picks element on page
5. Element data stored in `chrome.storage.local`
6. User reopens extension
7. Popup detects picked element and automatically fills in the fields!

---

### Extension shows "Not connected"

**Cause:** Not on a D365FO page or page hasn't loaded

**Solutions:**
- Ensure you're on a D365FO page (URL contains `.dynamics.com`)
- Refresh the D365 page
- Close and reopen extension popup
- Check browser console for errors (F12)

---

### Element picker not working

**Symptom:** Nothing highlights when hovering, or clicks don't register

**Solutions:**
1. **Refresh the D365 page** - Content script may not have loaded
2. **Check console:** Open DevTools (F12) and look for errors
3. **Reload extension:** Go to `chrome://extensions/`, find extension, click reload button
4. **Try manual entry:** If picker fails, you can type control names manually

**To verify content script loaded:**
```javascript
// In browser console on D365 page:
console.log(typeof D365Inspector);
// Should show: "function"
```

---

### Values not being set in D365 fields

**Symptom:** Workflow runs but fields remain empty

**Causes & Solutions:**

1. **Timing too fast**
   - Go to Settings tab
   - Increase all delays by 50%
   - Add explicit Wait steps between operations

2. **Wrong field type**
   - Use Inspector to check actual field type
   - Enum fields need dropdown selection, not text input
   - Lookup fields may need lookup button click

3. **Field not visible yet**
   - Add Wait step after clicking buttons that open dialogs
   - Default 800ms may not be enough on slow systems
   - Try 1500-2000ms

4. **Data mapping mismatch**
   - Check data column names match exactly (case-sensitive!)
   - CSV: `language` not `Language`
   - JSON: Property names must match field mappings

---

### Extension won't load in Chrome

**Symptom:** Error when loading unpacked extension

**Common Issues:**

1. **Missing manifest.json**
   - Ensure you selected the `d365-automation-extension` folder
   - Not the parent folder

2. **Icon file errors**
   - Icons are required but can be any PNG files
   - Create 16x16, 48x48, 128x128 placeholder PNGs
   - Or temporarily remove icon references from manifest.json

3. **JSON syntax error**
   - Check manifest.json is valid JSON
   - No trailing commas
   - All strings in quotes

---

### "Element not found" during workflow execution

**Cause:** Control name wrong or element not visible

**Solutions:**

1. **Use Element Inspector**
   - Go to Inspector tab
   - Click "Refresh Elements"
   - Find the element you need
   - Copy exact control name

2. **Check visibility**
   - Element may be hidden until dialog opens
   - Add Wait step before accessing element
   - Ensure parent dialogs are opened first

3. **Verify in console:**
```javascript
// Test if element exists:
document.querySelector('[data-dyn-controlname="YourControlName"]');
// Should return the element, not null
```

---

### Workflow runs too fast/slow

**Symptom:** Steps execute but values don't "stick"

**Solution:** Adjust timing in Settings tab

**Recommended values:**

**Fast system/environment:**
- Delay After Click: 600ms
- Delay After Input: 300ms
- Delay After Save: 800ms

**Standard system:**
- Delay After Click: 800ms
- Delay After Input: 400ms
- Delay After Save: 1000ms

**Slow system/environment:**
- Delay After Click: 1200ms
- Delay After Input: 600ms
- Delay After Save: 1500ms

**Per-step override:**
Add Wait steps after critical operations.

---

### Data validation fails

**Symptom:** "Error: Invalid JSON" or "Error parsing CSV"

**Solutions:**

1. **JSON format:**
```json
[
    {"field1": "value1", "field2": "value2"},
    {"field1": "value3", "field2": "value4"}
]
```
   - Must be array of objects
   - Use double quotes
   - No trailing comma

2. **CSV format:**
```csv
field1,field2
value1,value2
value3,value4
```
   - First row is header
   - Comma separated
   - No quotes unless value contains comma

3. **Excel/TSV format:**
   - Copy from Excel
   - Paste directly (preserves tabs)
   - First row is header

---

### Textarea "Illegal invocation" error

**Symptom:** Error when setting textarea field value

**Solution:** ✅ Already fixed in extension

The extension automatically detects textarea vs input and uses correct prototype:
```javascript
const isTextArea = input.tagName === 'TEXTAREA';
const prototype = isTextArea ? 
    window.HTMLTextAreaElement.prototype :
    window.HTMLInputElement.prototype;
```

If you still see this error, it means field detection failed. Report the specific field control name.

---

### Multiple elements with same control name

**Symptom:** Wrong element gets clicked (e.g., toolbar button instead of dialog button)

**Solution:**

Extension finds first **visible** element:
```javascript
// Prioritizes visible elements
element.offsetParent !== null
```

**If wrong element is selected:**
1. Ensure correct dialog is open before step executes
2. Add Wait step to let dialog fully render
3. Use Inspector to verify which elements are visible

---

### Workflow works once, then fails

**Symptom:** First run succeeds, subsequent runs fail

**Causes:**

1. **Dialog not closed properly**
   - Add explicit Close button click
   - Add Wait after close
   - Verify dialog is dismissed

2. **Grid selection persists**
   - Previous row still selected
   - Add step to clear selection or select new row

3. **Form validation from previous run**
   - Add Wait steps
   - Clear fields before setting new values

---

### Can't save workflow

**Symptom:** Save button does nothing or shows error

**Solutions:**

1. **Check browser storage**
```javascript
// In console:
chrome.storage.local.get(['workflows'], (result) => {
    console.log(result);
});
```

2. **Clear storage if corrupted**
```javascript
chrome.storage.local.remove(['workflows']);
```

3. **Export as backup**
   - Copy workflow JSON manually
   - Store in text file

---

## Debugging Tips

### Enable Verbose Logging

1. Go to Settings tab
2. Check "Enable Verbose Logging"
3. Open browser console (F12)
4. Run workflow
5. Check console for detailed execution log

### Inspect Extension State

```javascript
// In extension popup console (inspect popup):
popup.workflows         // See all workflows
popup.currentWorkflow   // Current workflow
popup.currentStep       // Current step being edited
popup.settings          // Settings
```

### Test Individual Steps

Instead of running full workflow:
1. Open D365 form manually
2. Open browser console (F12)
3. Test element selection:
```javascript
document.querySelector('[data-dyn-controlname="LanguageTxt"]').click();
```

### Check D365 Page State

```javascript
// Verify content script loaded:
console.log(typeof D365Inspector);

// List all buttons:
new D365Inspector().discoverElements()
    .filter(e => e.type === 'button')
    .forEach(b => console.log(b.displayText, '→', b.controlName));
```

---

## Getting Help

### Before Reporting Issue

1. Check this troubleshooting guide
2. Check browser console for errors (F12)
3. Try on different D365 form
4. Test with minimal workflow (1-2 steps)
5. Verify element exists using Inspector

### Information to Include

- Extension version
- Chrome version
- D365FO environment (cloud, on-prem, version)
- Exact error message
- Steps to reproduce
- Screenshot of error
- Workflow JSON (if relevant)
- Console log output

---

## Quick Fixes

### Nuclear Option: Reset Everything

If everything is broken:

1. Go to `chrome://extensions/`
2. Remove the extension
3. Close all D365 tabs
4. Clear browser cache
5. Reload extension
6. Refresh D365 page
7. Reopen extension

### Clear Extension Storage

```javascript
// In extension popup console:
chrome.storage.local.clear();
localStorage.clear();
location.reload();
```

### Reload Content Script

On D365 page:
1. Press F5 to refresh page
2. Reopen extension popup
3. Check "Connected to D365FO" status

---

## Known Limitations

1. **Session timeout:** Long workflows may exceed session timeout (add keep-alive)
2. **Tab must be active:** Chrome suspends inactive tabs
3. **File uploads:** Can't automate file picker (browser security)
4. **External API calls:** Limited by CORS policies
5. **Grid operations:** Complex grids may need custom handling

---

## Performance Tips

- Run workflows during off-peak hours
- Process in batches (100 rows at a time)
- Increase delays on slow systems
- Close unnecessary browser tabs
- Use faster D365 environment if available

---

**Last Updated:** January 2026  
**Extension Version:** 1.0.0
