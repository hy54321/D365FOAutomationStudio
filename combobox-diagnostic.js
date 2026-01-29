/**
 * D365 F&O ComboBox/Lookup Input Diagnostic Tool
 * 
 * This script helps diagnose why programmatic input (paste) doesn't work
 * while manual typing does in D365 F&O combobox fields.
 * 
 * USAGE:
 * 1. Open D365 F&O in Chrome
 * 2. Navigate to a form with a combobox field
 * 3. Open Chrome DevTools Console (F12 → Console tab)
 * 4. Copy and paste this entire script
 * 5. Click on a combobox field to select it
 * 6. Run: testComboInput('your-value-here')
 * 
 * The script will test multiple input methods and report which ones work.
 */

(function() {
    'use strict';

    // ============ Configuration ============
    const DEBUG = true;
    const CHAR_DELAY = 50;  // ms between characters
    const EVENT_DELAY = 100; // ms between major events
    
    // ============ Utility Functions ============
    
    function log(...args) {
        if (DEBUG) console.log('[D365-Diag]', ...args);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setNativeValue(input, value) {
        const descriptor = Object.getOwnPropertyDescriptor(
            input.tagName === 'TEXTAREA' 
                ? window.HTMLTextAreaElement.prototype 
                : window.HTMLInputElement.prototype, 
            'value'
        );
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }
    }

    function getActiveInput() {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            return active;
        }
        // Try to find focused combobox input
        const comboInput = document.querySelector('[data-dyn-role="ComboBox"] input:focus, [role="combobox"] input:focus');
        if (comboInput) return comboInput;
        
        // Find any visible combobox input
        const anyCombo = document.querySelector('[data-dyn-role="ComboBox"] input, [role="combobox"] input');
        if (anyCombo) return anyCombo;
        
        console.error('No input element found. Please click on a combobox field first.');
        return null;
    }

    // ============ Event Detection ============

    /**
     * Spy on all events fired on an element to understand D365's event handling
     */
    function spyOnEvents(input, duration = 5000) {
        const events = [];
        const eventTypes = [
            'focus', 'blur', 'focusin', 'focusout',
            'keydown', 'keyup', 'keypress',
            'input', 'change', 'beforeinput',
            'compositionstart', 'compositionupdate', 'compositionend',
            'paste', 'cut', 'copy',
            'click', 'mousedown', 'mouseup',
            'pointerdown', 'pointerup'
        ];

        const handlers = {};
        eventTypes.forEach(type => {
            handlers[type] = (e) => {
                events.push({
                    type: e.type,
                    time: Date.now(),
                    key: e.key,
                    data: e.data,
                    inputType: e.inputType,
                    isTrusted: e.isTrusted
                });
            };
            input.addEventListener(type, handlers[type], true);
        });

        console.log(`[D365-Diag] Event spy active for ${duration}ms. Type in the field to see events captured.`);
        
        return new Promise(resolve => {
            setTimeout(() => {
                eventTypes.forEach(type => {
                    input.removeEventListener(type, handlers[type], true);
                });
                console.log('[D365-Diag] Event spy results:');
                console.table(events);
                resolve(events);
            }, duration);
        });
    }

    // ============ Input Methods ============

    /**
     * Method 1: Basic programmatic input (what paste effectively does)
     * This typically FAILS because it doesn't fire character-level key events
     */
    async function method1_BasicSetValue(input, value) {
        log('Method 1: Basic setValue (simulates paste behavior)');
        input.focus();
        await sleep(EVENT_DELAY);
        
        setNativeValue(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 2: Set value with InputEvent (insertFromPaste)
     * Better simulation of paste, but still may not trigger D365's filtering
     */
    async function method2_PasteSimulation(input, value) {
        log('Method 2: Paste simulation with InputEvent');
        input.focus();
        await sleep(EVENT_DELAY);
        
        // Clear first
        setNativeValue(input, '');
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContentBackward'
        }));
        await sleep(50);
        
        // Simulate paste
        setNativeValue(input, value);
        input.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            data: value
        }));
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertFromPaste',
            data: value
        }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 3: Character-by-character with key events (proper typing simulation)
     * This should work because it mimics what the keyboard actually does
     */
    async function method3_CharacterByCharacter(input, value) {
        log('Method 3: Character-by-character with full key events');
        input.focus();
        await sleep(EVENT_DELAY);
        
        // Clear the input first
        setNativeValue(input, '');
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContentBackward'
        }));
        await sleep(50);
        
        const stringValue = String(value);
        for (let i = 0; i < stringValue.length; i++) {
            const char = stringValue[i];
            const currentValue = input.value + char;
            
            // Fire keydown
            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: char,
                code: getKeyCode(char),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true,
                cancelable: true
            }));
            
            // Fire beforeinput (modern browsers)
            input.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: char
            }));
            
            // Update value
            setNativeValue(input, currentValue);
            
            // Fire input event
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: char
            }));
            
            // Fire keyup
            input.dispatchEvent(new KeyboardEvent('keyup', {
                key: char,
                code: getKeyCode(char),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true
            }));
            
            await sleep(CHAR_DELAY);
        }
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 4: Character-by-character with keypress (legacy event)
     * Some older frameworks still listen for keypress
     */
    async function method4_WithKeypress(input, value) {
        log('Method 4: Character-by-character with keypress (legacy)');
        input.focus();
        await sleep(EVENT_DELAY);
        
        setNativeValue(input, '');
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContentBackward'
        }));
        await sleep(50);
        
        const stringValue = String(value);
        for (let i = 0; i < stringValue.length; i++) {
            const char = stringValue[i];
            const charCode = char.charCodeAt(0);
            const currentValue = input.value + char;
            
            // keydown
            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: char,
                code: getKeyCode(char),
                keyCode: charCode,
                which: charCode,
                bubbles: true,
                cancelable: true
            }));
            
            // keypress (deprecated but still used by some frameworks)
            input.dispatchEvent(new KeyboardEvent('keypress', {
                key: char,
                code: getKeyCode(char),
                keyCode: charCode,
                charCode: charCode,
                which: charCode,
                bubbles: true,
                cancelable: true
            }));
            
            // beforeinput
            input.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: char
            }));
            
            // Update value
            setNativeValue(input, currentValue);
            
            // input
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: char
            }));
            
            // keyup
            input.dispatchEvent(new KeyboardEvent('keyup', {
                key: char,
                code: getKeyCode(char),
                keyCode: charCode,
                which: charCode,
                bubbles: true
            }));
            
            await sleep(CHAR_DELAY);
        }
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 5: Use execCommand (older but sometimes works)
     */
    async function method5_ExecCommand(input, value) {
        log('Method 5: execCommand insertText');
        input.focus();
        await sleep(EVENT_DELAY);
        
        // Select all and delete
        input.select();
        document.execCommand('delete');
        await sleep(50);
        
        // Insert text
        document.execCommand('insertText', false, value);
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 6: Paste + Backspace workaround (based on user's observation)
     * Paste the value, then trigger a backspace to "wake up" D365's filtering
     */
    async function method6_PasteAndBackspace(input, value) {
        log('Method 6: Paste + Backspace workaround');
        input.focus();
        await sleep(EVENT_DELAY);
        
        // Set value directly (like paste)
        setNativeValue(input, value);
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertFromPaste',
            data: value
        }));
        
        await sleep(100);
        
        // Add a character and delete it to trigger filtering
        const valueWithExtra = value + 'X';
        setNativeValue(input, valueWithExtra);
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: 'X'
        }));
        
        await sleep(50);
        
        // Now delete that character with a real backspace event
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Backspace',
            code: 'Backspace',
            keyCode: 8,
            which: 8,
            bubbles: true,
            cancelable: true
        }));
        
        setNativeValue(input, value);
        
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContentBackward'
        }));
        
        input.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Backspace',
            code: 'Backspace',
            keyCode: 8,
            which: 8,
            bubbles: true
        }));
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 7: Trigger D365's internal value changed mechanism
     * D365 uses $dyn framework - try to trigger its internal handlers
     */
    async function method7_D365Internal(input, value) {
        log('Method 7: D365 internal mechanism trigger');
        input.focus();
        await sleep(EVENT_DELAY);
        
        // Try to find and use D365's internal data binding
        const dynBind = input.getAttribute('data-dyn-bind');
        log('data-dyn-bind:', dynBind);
        
        // Set value with full event sequence used by D365
        setNativeValue(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);
        
        // Type character by character but also dispatch on the parent control
        const stringValue = String(value);
        const parent = input.closest('[data-dyn-role]') || input.parentElement;
        
        for (let i = 0; i < stringValue.length; i++) {
            const char = stringValue[i];
            const currentValue = input.value + char;
            
            // Create a comprehensive event set
            const keyboardEventInit = {
                key: char,
                code: getKeyCode(char),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window
            };
            
            // Fire on input and potentially bubble to D365 handlers
            const keydownEvent = new KeyboardEvent('keydown', keyboardEventInit);
            const keyupEvent = new KeyboardEvent('keyup', keyboardEventInit);
            
            input.dispatchEvent(keydownEvent);
            
            // Set value BEFORE input event
            setNativeValue(input, currentValue);
            
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: char,
                composed: true,
                view: window
            }));
            
            input.dispatchEvent(keyupEvent);
            
            // Also dispatch on parent for D365 controls
            if (parent && parent !== input) {
                parent.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            await sleep(CHAR_DELAY);
        }
        
        // Final change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Try to trigger D365's ValueChanged command
        if (parent) {
            parent.dispatchEvent(new CustomEvent('ValueChanged', {
                bubbles: true,
                detail: { value: value }
            }));
        }
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    /**
     * Method 8: Use Composition Events (for IME-like input)
     * Some frameworks require composition events for text input
     */
    async function method8_CompositionEvents(input, value) {
        log('Method 8: Composition events (IME-style)');
        input.focus();
        await sleep(EVENT_DELAY);
        
        setNativeValue(input, '');
        await sleep(50);
        
        // Start composition
        input.dispatchEvent(new CompositionEvent('compositionstart', {
            bubbles: true,
            cancelable: true,
            data: ''
        }));
        
        const stringValue = String(value);
        let currentValue = '';
        
        for (let i = 0; i < stringValue.length; i++) {
            currentValue += stringValue[i];
            
            input.dispatchEvent(new CompositionEvent('compositionupdate', {
                bubbles: true,
                data: currentValue
            }));
            
            setNativeValue(input, currentValue);
            
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertCompositionText',
                data: currentValue
            }));
            
            await sleep(CHAR_DELAY);
        }
        
        // End composition
        input.dispatchEvent(new CompositionEvent('compositionend', {
            bubbles: true,
            data: value
        }));
        
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertFromComposition',
            data: value
        }));
        
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        await sleep(EVENT_DELAY);
        return input.value;
    }

    // ============ Keyboard Code Helper ============
    
    function getKeyCode(char) {
        const upperChar = char.toUpperCase();
        if (upperChar >= 'A' && upperChar <= 'Z') {
            return 'Key' + upperChar;
        }
        if (char >= '0' && char <= '9') {
            return 'Digit' + char;
        }
        const specialKeys = {
            ' ': 'Space',
            '-': 'Minus',
            '=': 'Equal',
            '[': 'BracketLeft',
            ']': 'BracketRight',
            '\\': 'Backslash',
            ';': 'Semicolon',
            "'": 'Quote',
            ',': 'Comma',
            '.': 'Period',
            '/': 'Slash',
            '`': 'Backquote'
        };
        return specialKeys[char] || 'Unidentified';
    }

    // ============ Main Test Function ============

    async function testComboInput(value, selectedMethod = null) {
        const input = getActiveInput();
        if (!input) return;
        
        console.log('\n======================================');
        console.log('D365 F&O ComboBox Input Diagnostic');
        console.log('======================================');
        console.log('Testing with value:', value);
        console.log('Input element:', input);
        console.log('Parent control:', input.closest('[data-dyn-role]'));
        console.log('');
        
        const methods = [
            { name: 'Method 1: Basic setValue', fn: method1_BasicSetValue },
            { name: 'Method 2: Paste simulation', fn: method2_PasteSimulation },
            { name: 'Method 3: Char-by-char with keys', fn: method3_CharacterByCharacter },
            { name: 'Method 4: With keypress (legacy)', fn: method4_WithKeypress },
            { name: 'Method 5: execCommand', fn: method5_ExecCommand },
            { name: 'Method 6: Paste + Backspace', fn: method6_PasteAndBackspace },
            { name: 'Method 7: D365 internal', fn: method7_D365Internal },
            { name: 'Method 8: Composition events', fn: method8_CompositionEvents }
        ];

        const results = [];

        if (selectedMethod !== null) {
            // Test only selected method
            const method = methods[selectedMethod - 1];
            if (method) {
                console.log(`Testing: ${method.name}`);
                try {
                    const result = await method.fn(input, value);
                    console.log('  Value after:', result);
                    console.log('  Check if dropdown filtered correctly!');
                } catch (e) {
                    console.error('  Error:', e.message);
                }
            }
            return;
        }

        // Test all methods
        for (const method of methods) {
            console.log(`\nTesting: ${method.name}`);
            console.log('-'.repeat(40));
            
            // Clear the input before each test
            setNativeValue(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(200);
            
            try {
                const result = await method.fn(input, value);
                const success = result === value;
                
                results.push({
                    method: method.name,
                    expectedValue: value,
                    actualValue: result,
                    valueSet: success ? '✓' : '✗',
                    note: 'Check if dropdown shows filtered results'
                });
                
                console.log('  Value set:', success ? '✓' : '✗');
                console.log('  Result:', result);
                console.log('  >> IMPORTANT: Manually check if the dropdown shows filtered results!');
                
            } catch (e) {
                results.push({
                    method: method.name,
                    expectedValue: value,
                    actualValue: 'ERROR',
                    valueSet: '✗',
                    note: e.message
                });
                console.error('  Error:', e.message);
            }
            
            // Wait for user to see results
            await sleep(1500);
        }

        console.log('\n======================================');
        console.log('Summary Results');
        console.log('======================================');
        console.table(results);
        
        console.log('\nINSTRUCTIONS:');
        console.log('1. After each method, the dropdown should show filtered options');
        console.log('2. If filtering worked, that method is compatible with D365');
        console.log('3. Report back which method number(s) worked');
        console.log('\nTo test a specific method again, run:');
        console.log('  testComboInput("your-value", methodNumber)');
        console.log('  Example: testComboInput("ABC", 3)');
    }

    // ============ Analyze D365 Control ============

    async function analyzeD365Control() {
        const input = getActiveInput();
        if (!input) return;
        
        console.log('\n======================================');
        console.log('D365 Control Analysis');
        console.log('======================================');
        
        // Gather all relevant attributes
        const attributes = {};
        for (const attr of input.attributes) {
            attributes[attr.name] = attr.value;
        }
        console.log('Input attributes:', attributes);
        
        // Check parent control
        const parent = input.closest('[data-dyn-role]');
        if (parent) {
            const parentAttrs = {};
            for (const attr of parent.attributes) {
                parentAttrs[attr.name] = attr.value;
            }
            console.log('Parent control attributes:', parentAttrs);
        }
        
        // Look for event handlers in D365's framework
        console.log('\nLooking for D365 bindings...');
        const dynBind = input.getAttribute('data-dyn-bind');
        if (dynBind) {
            console.log('data-dyn-bind:', dynBind);
            
            // Parse the binding expression
            const bindings = dynBind.split(',').map(b => b.trim());
            console.log('Parsed bindings:');
            bindings.forEach(b => console.log('  -', b));
        }
        
        // Check for related listbox/dropdown
        const ariaControls = input.getAttribute('aria-controls');
        const ariaOwns = input.getAttribute('aria-owns');
        console.log('\nARIA relationships:');
        console.log('  aria-controls:', ariaControls);
        console.log('  aria-owns:', ariaOwns);
        
        if (ariaControls) {
            const listbox = document.getElementById(ariaControls);
            if (listbox) {
                console.log('  Linked listbox found:', listbox);
            }
        }
        
        // Look for lookup button
        const lookupBtn = parent?.querySelector('.lookupButton, [data-dyn-role="LookupButton"], button[aria-label*="Open"]');
        console.log('\nLookup button:', lookupBtn);
        
        // Check for super tooltip (D365 specific)
        const superTooltip = input.closest('[dyn-data-supertooltip]');
        if (superTooltip) {
            console.log('Super tooltip container:', superTooltip.getAttribute('dyn-data-supertooltip'));
        }
        
        console.log('\n======================================');
        console.log('Event Spy');
        console.log('======================================');
        console.log('Starting 10-second event spy. Type in the field to see what events D365 expects...');
        await spyOnEvents(input, 10000);
    }

    // ============ Export to Window ============

    window.testComboInput = testComboInput;
    window.analyzeD365Control = analyzeD365Control;
    window.spyOnEvents = spyOnEvents;

    console.log('======================================');
    console.log('D365 ComboBox Diagnostic Tool Loaded');
    console.log('======================================');
    console.log('');
    console.log('Available commands:');
    console.log('');
    console.log('1. testComboInput("value")');
    console.log('   - Tests all 8 input methods and reports results');
    console.log('');
    console.log('2. testComboInput("value", 3)');
    console.log('   - Tests only method 3 (specify 1-8)');
    console.log('');
    console.log('3. analyzeD365Control()');
    console.log('   - Analyzes the current control structure and events');
    console.log('');
    console.log('4. spyOnEvents(element, duration)');
    console.log('   - Monitors all events on an element');
    console.log('');
    console.log('STEPS:');
    console.log('1. Click on a combobox field in D365');
    console.log('2. Run: testComboInput("your-search-value")');
    console.log('3. Watch which method triggers the dropdown filtering');
    console.log('4. Report back the method number that worked!');
    console.log('');

})();
