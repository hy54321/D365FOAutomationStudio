/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findElementInActiveContext,
    findGridCellElement,
    findLookupButton,
    findLookupFilterInput,
    isD365Loading,
    pickNearestRows
} from './dom.js';

function setRect(el, { left = 0, top = 0, width = 100, height = 20 } = {}) {
    Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height
        })
    });
}

function setOffsetParentVisible(el, visible = true) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return visible ? document.body : null;
        }
    });
}

describe('dom utils', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        delete window.$dyn;
    });

    it('findElementInActiveContext returns null when no element exists', () => {
        expect(findElementInActiveContext('Missing')).toBeNull();
    });

    it('findElementInActiveContext returns single matching element', () => {
        const el = document.createElement('div');
        el.setAttribute('data-dyn-controlname', 'Single');
        document.body.appendChild(el);
        expect(findElementInActiveContext('Single')).toBe(el);
    });

    it('findElementInActiveContext prefers visible dialog match', () => {
        const outside = document.createElement('div');
        outside.setAttribute('data-dyn-controlname', 'Customer');
        setRect(outside);
        document.body.appendChild(outside);

        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        setRect(dialog, { width: 500, height: 300 });
        const insideDialog = document.createElement('div');
        insideDialog.setAttribute('data-dyn-controlname', 'Customer');
        setRect(insideDialog);
        dialog.appendChild(insideDialog);
        document.body.appendChild(dialog);

        expect(findElementInActiveContext('Customer')).toBe(insideDialog);
    });

    it('findElementInActiveContext prefers expanded tab-page element', () => {
        const collapsedTab = document.createElement('div');
        collapsedTab.className = 'tabPage collapsed';
        const collapsedEl = document.createElement('div');
        collapsedEl.setAttribute('data-dyn-controlname', 'FieldX');
        setRect(collapsedEl);
        collapsedTab.appendChild(collapsedEl);
        document.body.appendChild(collapsedTab);

        const expandedTab = document.createElement('div');
        expandedTab.className = 'tabPage expanded';
        const expandedEl = document.createElement('div');
        expandedEl.setAttribute('data-dyn-controlname', 'FieldX');
        setRect(expandedEl);
        expandedTab.appendChild(expandedEl);
        document.body.appendChild(expandedTab);

        expect(findElementInActiveContext('FieldX')).toBe(expandedEl);
    });

    it('findElementInActiveContext falls back to last visible match', () => {
        const first = document.createElement('div');
        first.setAttribute('data-dyn-controlname', 'LastVisible');
        setRect(first, { left: 10 });
        document.body.appendChild(first);

        const second = document.createElement('div');
        second.setAttribute('data-dyn-controlname', 'LastVisible');
        setRect(second, { left: 20 });
        document.body.appendChild(second);

        expect(findElementInActiveContext('LastVisible')).toBe(second);
    });

    it('isD365Loading detects visible loading selectors and dyn processing state', () => {
        const busy = document.createElement('div');
        busy.className = 'busy-indicator';
        setOffsetParentVisible(busy, true);
        document.body.appendChild(busy);

        expect(isD365Loading()).toBe(true);

        document.body.innerHTML = '';
        window.$dyn = { isProcessing: () => true };
        expect(isD365Loading()).toBe(true);
    });

    it('findGridCellElement prioritizes selected row cells', () => {
        const row = document.createElement('div');
        row.setAttribute('aria-selected', 'true');
        const cell = document.createElement('div');
        cell.setAttribute('data-dyn-controlname', 'AccountCell');
        setOffsetParentVisible(cell, true);
        row.appendChild(cell);
        document.body.appendChild(row);

        expect(findGridCellElement('AccountCell')).toBe(cell);
    });

    it('findLookupButton falls back to container-level query', () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'input_container';
        const input = document.createElement('input');
        const btn = document.createElement('button');
        btn.className = 'lookup-button';
        wrapper.appendChild(input);
        wrapper.appendChild(btn);
        document.body.appendChild(wrapper);

        expect(findLookupButton(input)).toBe(btn);
    });

    it('findLookupFilterInput prefers segmented-entry flyout input', () => {
        const dock = document.createElement('div');
        const genericInput = document.createElement('input');
        genericInput.setAttribute('type', 'text');
        const segment = document.createElement('div');
        segment.className = 'segmentedEntry-flyoutSegment';
        const segmentInput = document.createElement('input');
        segmentInput.setAttribute('type', 'text');

        dock.appendChild(genericInput);
        segment.appendChild(segmentInput);
        dock.appendChild(segment);

        expect(findLookupFilterInput(dock)).toBe(segmentInput);
    });

    it('pickNearestRows sorts rows by distance to target element', () => {
        const target = document.createElement('div');
        setRect(target, { left: 100, top: 100, width: 10, height: 10 });

        const far = document.createElement('div');
        setRect(far, { left: 300, top: 300, width: 10, height: 10 });
        const near = document.createElement('div');
        setRect(near, { left: 95, top: 112, width: 10, height: 10 });

        const sorted = pickNearestRows([far, near], target);
        expect(sorted[0]).toBe(near);
        expect(sorted[1]).toBe(far);
    });
});
