import { sleep, setNativeValue } from './async.js';

export async function typeValueSlowly(input, value) {
    if (typeof input.click === 'function') {
        input.click();
    }
    input.focus();
    await sleep(100);

    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);

    // Type character by character
    const stringValue = String(value);
    let buffer = '';
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        buffer += char;
        setNativeValue(input, buffer);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(80); // 80ms per character
    }

    await sleep(200);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await sleep(800); // Wait for validation
}

export async function typeValueWithInputEvents(input, value) {
    if (typeof input.click === 'function') {
        input.click();
    }
    input.focus();
    await sleep(80);

    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);

    const stringValue = String(value ?? '');
    let buffer = '';
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        buffer += char;
        setNativeValue(input, buffer);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(60);
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
}

export async function waitForInputValue(input, value, timeoutMs = 2000) {
    const expected = String(value ?? '').trim();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const current = String(input?.value ?? '').trim();
        if (current === expected) return true;
        await sleep(100);
    }
    return false;
}

export async function setValueOnce(input, value, clearFirst = false) {
    input.focus();
    await sleep(100);
    if (clearFirst) {
        setNativeValue(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);
    }
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
}

export async function setValueWithVerify(input, value) {
    const expected = String(value ?? '').trim();
    await setValueOnce(input, value, true);
    await sleep(150);
    if (String(input.value ?? '').trim() !== expected) {
        await typeValueSlowly(input, expected);
    }
}

// ============ 8 ComboBox Input Methods ============

/**
 * Method 1: Basic setValue (fast but may not trigger D365 filtering)
 */
export async function comboInputMethod1(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
    return input.value;
}

/**
 * Method 2: Paste simulation with InputEvent
 */
export async function comboInputMethod2(input, value) {
    input.focus();
    await sleep(100);

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

    await sleep(100);
    return input.value;
}

/**
 * Method 3: Character-by-character with full key events (RECOMMENDED)
 */
export async function comboInputMethod3(input, value) {
    input.focus();
    await sleep(100);

    // Clear the input first
    setNativeValue(input, '');
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    await sleep(50);

    const stringValue = String(value);
    let buffer = '';
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        buffer += char;
        const currentValue = buffer;

        // Fire keydown
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            code: getKeyCode(char),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        }));

        // Fire beforeinput
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

        await sleep(50);
    }

    await sleep(100);
    return input.value;
}

/**
 * Method 4: Character-by-character with keypress (legacy)
 */
export async function comboInputMethod4(input, value) {
    input.focus();
    await sleep(100);

    setNativeValue(input, '');
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward'
    }));
    await sleep(50);

    const stringValue = String(value);
    let buffer = '';
    for (let i = 0; i < stringValue.length; i++) {
        const char = stringValue[i];
        const charCode = char.charCodeAt(0);
        buffer += char;
        const currentValue = buffer;

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

        await sleep(50);
    }

    await sleep(100);
    return input.value;
}

/**
 * Method 5: execCommand insertText
 */
export async function comboInputMethod5(input, value) {
    input.focus();
    await sleep(100);

    // Select all and delete
    input.select();
    document.execCommand('delete');
    await sleep(50);

    // Insert text
    document.execCommand('insertText', false, value);

    await sleep(100);
    return input.value;
}

/**
 * Method 6: Paste + Backspace workaround
 */
export async function comboInputMethod6(input, value) {
    input.focus();
    await sleep(100);

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

    await sleep(100);
    return input.value;
}

/**
 * Method 7: D365 internal mechanism trigger
 */
export async function comboInputMethod7(input, value) {
    input.focus();
    await sleep(100);

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

        await sleep(50);
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

    await sleep(100);
    return input.value;
}

/**
 * Method 8: Composition events (IME-style)
 */
export async function comboInputMethod8(input, value) {
    input.focus();
    await sleep(100);

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

        await sleep(50);
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

    await sleep(100);
    return input.value;
}

/**
 * Helper to get key code from character
 */
export function getKeyCode(char) {
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

/**
 * Dispatcher function - uses the selected input method from settings
 */
export async function comboInputWithSelectedMethod(input, value, method) {
    console.log(`[D365] Using combobox input method: ${method}`);

    switch (method) {
        case 'method1': return await comboInputMethod1(input, value);
        case 'method2': return await comboInputMethod2(input, value);
        case 'method3': return await comboInputMethod3(input, value);
        case 'method4': return await comboInputMethod4(input, value);
        case 'method5': return await comboInputMethod5(input, value);
        case 'method6': return await comboInputMethod6(input, value);
        case 'method7': return await comboInputMethod7(input, value);
        case 'method8': return await comboInputMethod8(input, value);
        default: return await comboInputMethod3(input, value); // Default to method 3
    }
}

export function commitComboValue(input, value, element) {
    if (!input) return;
    input.focus();
    setNativeValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    input.blur();
    if (element) {
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    document.body?.click?.();
}

export function dispatchClickSequence(target) {
    if (!target) return;
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.click();
}
