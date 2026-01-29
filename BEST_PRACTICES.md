# D365FO Automation: Best Practices & Recommendations

## 🎯 Identification Methods Comparison

### Method 1: `data-dyn-controlname` (✅ RECOMMENDED)

**Pros:**
- ✅ Completely stable across sessions
- ✅ Unique identifier for each control
- ✅ Works immediately after page load
- ✅ Fast and reliable

**Cons:**
- ⚠️ Not human-readable
- ⚠️ Requires discovery step

**Best For:**
- All automation scenarios
- Production workflows
- Long-term maintainability

**Example:**
```javascript
document.querySelector('[data-dyn-controlname="LanguageTxt"]').click();
```

---

### Method 2: Text-Based Identification

**Pros:**
- ✅ Human-readable
- ✅ Easy to understand
- ✅ Works across languages (if using aria-label)

**Cons:**
- ❌ Multiple elements may have same text
- ❌ Text may change with translations
- ❌ Slower (must search all elements)
- ❌ May match hidden elements

**Best For:**
- Quick prototypes
- One-off scripts
- When control names are unknown

**Example:**
```javascript
// Risky - may match multiple buttons
[...document.querySelectorAll('button')].find(btn => 
    btn.textContent.includes('New')
).click();
```

---

### Method 3: Element IDs (❌ NOT RECOMMENDED)

**Pros:**
- ✅ Fast lookup
- ✅ Unique per page

**Cons:**
- ❌ **Session-specific** - changes every login
- ❌ **Page-specific** - different on each form
- ❌ **Unpredictable** - includes random strings

**Best For:**
- Nothing (avoid in D365FO)

**Example:**
```javascript
// DON'T USE - This ID will be different tomorrow
document.getElementById('markuptable_cust_2_LanguageTxt').click();
```

---

## 🔍 Field Type Detection Strategies

### Enum/Dropdown Detection

**Indicators:**
```javascript
function isEnumField(element) {
    return element.getAttribute('data-dyn-role') === 'ComboBox' ||
           element.querySelector('select') !== null ||
           element.classList.contains('comboBox');
}
```

**Usage:**
- Use dropdown selection instead of typing
- Extract available values for validation
- Provide dropdown options to user

---

### Lookup Field Detection

**Indicators:**
```javascript
function isLookupField(element) {
    return element.classList.contains('field-hasLookupButton') ||
           element.querySelector('.lookup-button') !== null ||
           element.nextElementSibling?.classList.contains('lookup-button');
}
```

**Usage:**
- May accept freetext if `allowFreetext` is true
- Otherwise must click lookup and select
- Check `lookup-only` class for strict lookups

---

### Textarea vs Input Detection

**Indicators:**
```javascript
function getInputElement(container) {
    const textarea = container.querySelector('textarea');
    if (textarea) return { element: textarea, type: 'textarea' };
    
    const input = container.querySelector('input');
    if (input) return { element: input, type: 'input' };
    
    return null;
}
```

**Critical Difference:**
```javascript
// ❌ WRONG - Causes "Illegal invocation" error
const setter = window.HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(setter, 'value').set.call(textarea, value);

// ✅ CORRECT - Use correct prototype
const isTextArea = input.tagName === 'TEXTAREA';
const setter = isTextArea ? 
    window.HTMLTextAreaElement.prototype : 
    window.HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(setter, 'value').set.call(input, value);
```

---

## 🏗️ Recommended Extension Architecture

### 1. **Manifest V3 Structure** (Current Standard)

```
manifest.json           → Extension configuration
popup.html/css/js       → User interface
background.js           → Service worker (event handling)
content.js              → Content script (bridge)
injected.js             → Page context script (D365 access)
```

**Why This Structure?**
- Manifest V3 required for new Chrome extensions
- Content scripts have limited access to page JavaScript
- Injected scripts run in page context (can access D365 internals)
- Message passing enables communication

---

### 2. **Data Flow**

```
User Action in Popup
    ↓ chrome.tabs.sendMessage()
Content Script (content.js)
    ↓ window.postMessage()
Injected Script (injected.js)
    ↓ Accesses D365 DOM
D365FO Page Elements
    ↓ window.postMessage() [results]
Content Script
    ↓ chrome.runtime.sendMessage()
Popup UI (shows results)
```

---

### 3. **Storage Strategy**

**chrome.storage.local** (✅ Recommended):
- Persists across sessions
- Syncs workflows between devices (if using sync)
- No size limit concerns for workflows
- Async API

**localStorage** (⚠️ Use for Settings Only):
- Simpler API
- Limited to 5MB
- Only accessible in popup context
- Good for user preferences

**Example:**
```javascript
// Save workflow
await chrome.storage.local.set({ 
    workflows: [workflow1, workflow2] 
});

// Save settings
localStorage.setItem('d365-settings', JSON.stringify(settings));
```

---

## 🚀 Implementation Recommendations

### 1. **Element Discovery**

**Recommendation:** Provide both automatic and manual options

```javascript
// Automatic: Scan entire page
function discoverAllElements() {
    return [...document.querySelectorAll('[data-dyn-controlname]')]
        .map(extractElementInfo);
}

// Manual: Interactive picker
function enableElementPicker(callback) {
    document.addEventListener('click', (e) => {
        e.preventDefault();
        const el = e.target.closest('[data-dyn-controlname]');
        callback(extractElementInfo(el));
    }, { once: true });
}
```

**Benefits:**
- Discovery mode: See all available options
- Picker mode: Point-and-click configuration
- Fallback: Manual entry for edge cases

---

### 2. **Workflow Configuration**

**Recommendation:** Visual builder with JSON export

**UI Components:**
- Step type selector (click, input, wait, etc.)
- Element picker button
- Field mapping for data sources
- Drag-to-reorder steps
- Test individual steps

**Data Structure:**
```json
{
    "id": "workflow_123",
    "name": "Add Charge Translations",
    "steps": [
        {
            "type": "click",
            "controlName": "LanguageTxt",
            "description": "Open translations dialog"
        },
        {
            "type": "input",
            "controlName": "LanguageTxt_LanguageId1",
            "value": "${language}",
            "fieldMapping": "language"
        }
    ],
    "dataSource": {
        "type": "csv",
        "columns": ["chargeCode", "language", "text"]
    }
}
```

---

### 3. **Error Handling**

**Recommendation:** Multi-layer approach

```javascript
async function executeStepWithRetry(step, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await executeStep(step);
            return { success: true };
        } catch (error) {
            if (attempt === maxRetries) {
                return { 
                    success: false, 
                    error: error.message,
                    step: step
                };
            }
            await sleep(500 * attempt); // Exponential backoff
        }
    }
}
```

**Error Recovery Options:**
1. Retry with delay
2. Skip and continue
3. Pause and alert user
4. Roll back changes

---

### 4. **Timing Configuration**

**Recommendation:** Per-step and global settings

```javascript
const DEFAULT_TIMINGS = {
    afterClick: 800,      // Buttons that open dialogs
    afterInput: 400,      // Field input
    afterSave: 1000,      // Save operations
    betweenSteps: 200,    // General delay
    gridRefresh: 1500     // Grid reload time
};

// Allow per-step override
{
    "type": "click",
    "controlName": "SaveButton",
    "delay": 2000  // Override default
}
```

---

## ⚠️ D365FO-Specific Challenges & Solutions

### Challenge 1: Lazy-Loaded Elements

**Problem:** Elements don't exist until user interaction

**Solution:**
```javascript
async function waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
            return element;
        }
        await sleep(100);
    }
    throw new Error(`Element not found: ${selector}`);
}
```

---

### Challenge 2: Form Validation Events

**Problem:** D365 requires specific events to trigger validation

**Solution:**
```javascript
function setFieldValue(input, value) {
    // Set value using correct prototype
    const descriptor = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? 
            window.HTMLTextAreaElement.prototype : 
            window.HTMLInputElement.prototype,
        'value'
    );
    descriptor.set.call(input, value);
    
    // Trigger all validation events
    const events = ['input', 'change', 'blur', 'keydown', 'keyup'];
    events.forEach(eventType => {
        input.dispatchEvent(new Event(eventType, { bubbles: true }));
    });
}
```

---

### Challenge 3: Grid Operations

**Problem:** Grids have complex selection and editing logic

**Solution:**
```javascript
function selectGridRow(gridControlName, rowIndex) {
    const grid = document.querySelector(
        `[data-dyn-controlname="${gridControlName}"]`
    );
    const rows = grid.querySelectorAll('[data-dyn-role="Row"]');
    if (rows[rowIndex]) {
        rows[rowIndex].click();
        return true;
    }
    return false;
}
```

---

### Challenge 4: Multiple Instances

**Problem:** Same control name appears multiple times (e.g., in toolbar and dialog)

**Solution:**
```javascript
function findVisibleElement(controlName) {
    const elements = document.querySelectorAll(
        `[data-dyn-controlname="${controlName}"]`
    );
    
    // Return first visible one
    for (const el of elements) {
        if (el.offsetParent !== null && 
            window.getComputedStyle(el).visibility === 'visible') {
            return el;
        }
    }
    return null;
}
```

---

### Challenge 5: Session Timeout

**Problem:** Long automations may exceed session timeout

**Solution:**
```javascript
async function executeWithKeepAlive(workflow) {
    const keepAliveInterval = setInterval(() => {
        // Touch session to keep alive
        fetch('/api/keepalive', { method: 'POST' });
    }, 5 * 60 * 1000); // Every 5 minutes
    
    try {
        await executeWorkflow(workflow);
    } finally {
        clearInterval(keepAliveInterval);
    }
}
```

---

## 📋 Testing Checklist

Before deploying automation:

- [ ] Test with single data row
- [ ] Test with 3-5 data rows
- [ ] Verify field values are set correctly
- [ ] Check for console errors
- [ ] Test on different D365 environments (if available)
- [ ] Test after browser refresh
- [ ] Test after session timeout
- [ ] Verify timing delays are appropriate
- [ ] Test error recovery (intentional failures)
- [ ] Document workflow steps

---

## 🎨 UI/UX Best Practices

### 1. **Clear Visual Feedback**
- Show progress (X of Y completed)
- Highlight active step
- Display errors prominently
- Celebrate completion

### 2. **Prevent Mistakes**
- Validate data before execution
- Confirm destructive actions
- Provide "dry run" mode
- Allow undo where possible

### 3. **Helpful Tooltips**
- Explain control names
- Show element locations
- Provide examples
- Link to documentation

### 4. **Responsive Design**
- Popup should be 600-800px wide
- Scrollable lists for many elements
- Collapsible sections
- Mobile-friendly (for future web version)

---

## 🔮 Future Enhancement Ideas

### High Priority
1. **Recording Mode**: Click through UI, automatically generate workflow
2. **Step Testing**: Test individual steps without running full workflow
3. **Version Control**: Track workflow changes
4. **Templates**: Pre-built workflows for common tasks

### Medium Priority
5. **Conditional Logic**: If/then/else based on field values
6. **Variables**: Store and reuse values between steps
7. **Error Screenshots**: Capture screen on failure
8. **Audit Log**: Track what was automated and when

### Low Priority
9. **Cloud Sync**: Share workflows across team
10. **Scheduling**: Run at specific times
11. **API Integration**: Trigger workflows externally
12. **Multi-language**: Support for non-English D365

---

## 📚 Resources

### D365FO Documentation
- [Form Control reference](https://docs.microsoft.com/dynamics365/fin-ops-core/dev-itpro/)
- [Task Recorder guide](https://docs.microsoft.com/dynamics365/fin-ops-core/dev-itpro/user-interface/task-recorder)

### Chrome Extension Development
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)

### Testing Tools
- Chrome DevTools (F12)
- Extension Inspection (chrome://extensions → inspect)
- Console logging for debugging

---

**Remember:** Start simple, test frequently, and iterate based on real usage!
