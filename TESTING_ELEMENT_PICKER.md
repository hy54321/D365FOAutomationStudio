# Element Picker Testing Guide

## Issue Fixed
**Problem:** Element picker closed immediately after clicking, but selected element didn't appear in the step editor.

**Root Cause:** 
1. DOM elements weren't ready when trying to fill in values
2. Workflow state wasn't being preserved during picker operation
3. No visual feedback to user about successful pick

## Changes Made

### 1. Fixed Initialization Order
- Moved `checkForPickedElement()` to run AFTER DOM setup
- Ensures all UI elements exist before trying to populate them

### 2. Added Workflow State Preservation
- Now saves `currentWorkflowData` along with `currentStepData`
- Restores entire workflow context when popup reopens

### 3. Added Console Logging
- Track picker lifecycle in browser console
- Helps debug if issues occur

### 4. Added Success Notification
- Green notification appears when element is picked
- Shows element display text
- Auto-dismisses after 3 seconds

### 5. Added Timing Safeguards
- 100ms delay before showing step editor
- 50ms delay before updating input fields
- Ensures DOM is ready

## How to Test

### Step 1: Reload Extension
1. Go to `chrome://extensions/`
2. Find "D365FO Automation Studio"
3. Click reload (🔄)

### Step 2: Open Browser Console (For Debugging)
1. Right-click extension icon → Inspect Popup
2. Keep console open to see logs

### Step 3: Test Element Picker

**Test A: New Step**
1. Open extension on D365 page
2. Go to "Builder" tab
3. Click "Add Step"
4. Select "Click Button" step type
5. Click "🎯 Pick from Page" button
   - Console should log: "Starting element picker, current step: {...}"
   - Popup closes ✅
6. Click any button on D365 page (e.g., "New", "Translations")
   - Element should highlight before click
   - Inspector overlay disappears after click
7. Reopen extension (click icon)
   - Should see green notification: "Element picked: [Button Name]" ✅
   - Should be on Builder tab ✅
   - Step editor should be visible ✅
   - "Button Control Name" field should be filled ✅
   - "Display Text" field should be filled ✅
   - Console should log: "Picked element detected: {...}"

**Test B: Input Field**
1. Click "Add Step" again
2. Select "Enter Text" step type
3. Click "🎯 Pick from Page"
4. Open a dialog in D365 (e.g., click Translations)
5. Click on a text field (e.g., Language field)
6. Reopen extension
   - Should see notification ✅
   - "Field Control Name" should be filled ✅
   - Should detect field type (shown in console)

### Step 4: Verify Console Output

You should see logs like:
```
Starting element picker, current step: {id: "123...", type: "click", ...}
Picked element detected: {controlName: "LanguageTxt", displayText: "Translations", ...}
Set controlName input: LanguageTxt
Set displayText input: Translations
Element applied to step: {controlName: "LanguageTxt", ...}
```

## Troubleshooting

### Issue: Fields still empty after picking

**Check Console:**
- Are logs appearing? If not, extension didn't reload properly
- Does "Picked element detected" appear? If not, storage issue

**Solution:**
1. Hard refresh D365 page (Ctrl+Shift+R)
2. Reload extension again
3. Clear extension storage:
```javascript
// In popup console (right-click icon → Inspect):
chrome.storage.local.clear();
```

### Issue: No notification appears

**Check:**
- Is notification element being created? (Inspect popup DOM)
- Any JavaScript errors in console?

**Solution:**
- Ensure popup.css has the animation keyframes
- Check for CSS conflicts

### Issue: Wrong values appear

**Check Console:**
- What element was detected?
- Is it the correct control name?

**Possible Causes:**
- Multiple elements with same text
- Wrong element got clicked
- Element not fully loaded

**Solution:**
- Use Element Inspector tab to verify control names
- Wait for dialog to fully load before picking

### Issue: Step editor not showing

**Check:**
- Is Builder tab active?
- Is `stepEditor` element visible in DOM?

**Solution:**
```javascript
// In popup console:
popup.currentStep  // Should show step object
document.getElementById('stepEditor').style.display  // Should be 'block'
```

## Expected Behavior Flow

```
1. User clicks "Pick from Page"
   ↓
2. Console: "Starting element picker..."
   Storage: waitingForPick=true, currentStepData={...}
   ↓
3. Popup closes
   ↓
4. User clicks element on D365 page
   ↓
5. Background script stores picked element
   ↓
6. User reopens extension
   ↓
7. Console: "Picked element detected..."
   UI: Switches to Builder tab
   UI: Shows step editor
   UI: Fills in control name & display text
   UI: Shows green notification
   Storage: Clears picker flags
   ↓
8. User clicks "Save Step"
   ↓
9. Step added to workflow with picked element
```

## Debugging Commands

Open popup console (right-click icon → Inspect):

```javascript
// Check current state
popup.currentStep
popup.currentWorkflow

// Check storage
chrome.storage.local.get(['waitingForPick', 'pickedElement'], console.log)

// Manually trigger element picked (for testing)
popup.handleElementPicked({
    controlName: 'TestButton',
    displayText: 'Test',
    role: 'Button'
})

// Show notification manually
popup.showNotification('Test message', 'success')
```

## Success Criteria

✅ Console shows "Starting element picker"  
✅ Popup closes after clicking "Pick from Page"  
✅ Element highlights when hovering on D365 page  
✅ Inspector closes after clicking element  
✅ Popup reopens to Builder tab automatically  
✅ Step editor is visible  
✅ Control name field is populated  
✅ Display text field is populated (for buttons)  
✅ Green notification appears  
✅ Console shows "Element applied to step"  
✅ "Save Step" works and adds step to workflow  

---

**If all criteria pass:** Element picker is working correctly! 🎉  
**If any fail:** Check console logs and follow troubleshooting steps above.
