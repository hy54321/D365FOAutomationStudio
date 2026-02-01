import { sleep } from './async.js';
import { isElementVisibleGlobal, pickNearestRows } from './dom.js';

export async function waitForLookupPopup(timeoutMs = 2000) {
    const selectors = [
        '.lookup-buttonContainer',
        '.lookupDock-buttonContainer',
        '[role="dialog"]',
        '.lookup-flyout',
        '.lookupFlyout',
        '[data-dyn-role="Lookup"]',
        '[data-dyn-role="LookupGrid"]',
        '.lookup-container',
        '.lookup',
        '[role="grid"]',
        'table'
    ];
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        for (const selector of selectors) {
            const popup = document.querySelector(selector);
            if (!popup) continue;
            if (popup.classList?.contains('messageCenter')) continue;
            if (popup.getAttribute('aria-label') === 'Action center') continue;
            if (!isElementVisibleGlobal(popup)) continue;
            return popup;
        }
        await sleep(100);
    }
    return null;
}

export async function waitForLookupRows(lookupDock, targetElement, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        let rows = lookupDock?.querySelectorAll?.('tr[data-dyn-row], .lookup-row, [role="row"]') || [];
        if (rows.length) return rows;

        // Fallback: find visible lookup rows anywhere (some docks render outside the container)
        const globalRows = Array.from(document.querySelectorAll('tr[data-dyn-row], .lookup-row, [role="row"]'))
            .filter(isElementVisibleGlobal);
        if (globalRows.length) {
            return pickNearestRows(globalRows, targetElement);
        }
        await sleep(150);
    }
    return [];
}

export async function waitForLookupDockForElement(targetElement, timeoutMs = 3000) {
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
        const docks = Array.from(document.querySelectorAll('.lookupDock-buttonContainer'))
            .filter(isElementVisibleGlobal)
            .filter(dock => !dock.classList?.contains('messageCenter'));

        if (docks.length) {
            const withRows = docks.filter(dock => dock.querySelector('tr[data-dyn-row], .lookup-row, [role="row"], [role="grid"], table'));
            const candidates = withRows.length ? withRows : docks;
            const best = pickNearestDock(candidates, targetRect);
            if (best) return best;
        }
        await sleep(100);
    }
    return null;
}

export function pickNearestDock(docks, targetRect) {
    if (!docks.length) return null;
    if (!targetRect) return docks[0];
    let best = docks[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const dock of docks) {
        const rect = dock.getBoundingClientRect();
        const dx = Math.abs(rect.left - targetRect.left);
        const dy = Math.abs(rect.top - targetRect.bottom);
        const score = dx + dy;
        if (score < bestScore) {
            bestScore = score;
            best = dock;
        }
    }
    return best;
}

export async function waitForListboxForElement(targetElement, timeoutMs = 2000) {
    const selectors = ['[role="listbox"]', '.dropDownList', '.comboBoxDropDown', '.dropdown-menu', '.dropdown-list'];
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
        const lists = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)))
            .filter(isElementVisibleGlobal);
        if (lists.length) {
            return pickNearestDock(lists, targetRect);
        }
        await sleep(100);
    }
    return null;
}

export async function waitForListboxForInput(input, targetElement, timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const linked = getListboxFromInput(input);
        if (linked && isElementVisibleGlobal(linked)) {
            return linked;
        }
        const fallback = await waitForListboxForElement(targetElement, 200);
        if (fallback) return fallback;
        await sleep(100);
    }
    return null;
}

export function getListboxFromInput(input) {
    if (!input) return null;
    const id = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
    if (id) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    const activeId = input.getAttribute('aria-activedescendant');
    if (activeId) {
        const active = document.getElementById(activeId);
        const list = active?.closest?.('[role="listbox"]');
        if (list) return list;
    }
    return null;
}

export function findComboBoxButton(element) {
    const selectors = [
        '.lookupButton',
        '.comboBox-button',
        '.comboBox-dropDownButton',
        '.dropdownButton',
        '[data-dyn-role="DropDownButton"]',
        'button[aria-label*="Open"]',
        'button[aria-label*="Select"]'
    ];
    for (const selector of selectors) {
        const btn = element.querySelector(selector);
        if (btn) return btn;
    }
    const container = element.closest('.input_container, .form-group') || element.parentElement;
    if (!container) return null;
    for (const selector of selectors) {
        const btn = container.querySelector(selector);
        if (btn) return btn;
    }
    return null;
}

export function collectComboOptions(listbox) {
    const selectors = [
        '[role="option"]',
        '.comboBox-listItem',
        '.comboBox-item',
        'li',
        '.dropdown-list-item',
        '.comboBoxItem',
        '.dropDownListItem',
        '.dropdown-item'
    ];
    const found = [];
    for (const selector of selectors) {
        listbox.querySelectorAll(selector).forEach(el => {
            if (isElementVisibleGlobal(el)) found.push(el);
        });
    }
    return found.length ? found : Array.from(listbox.children).filter(isElementVisibleGlobal);
}
