/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/async.js', () => ({
    sleep: vi.fn().mockResolvedValue(undefined),
    setNativeValue: vi.fn((input, value) => { input.value = value; })
}));

vi.mock('../utils/dom.js', async () => {
    const actual = await vi.importActual('../utils/dom.js');
    return {
        ...actual,
        findElementInActiveContext: vi.fn((controlName) =>
            document.querySelector(`[data-dyn-controlname="${controlName}"]`)
        )
    };
});

vi.mock('../utils/combobox.js', async () => {
    const actual = await vi.importActual('../utils/combobox.js');
    return {
        ...actual,
        comboInputWithSelectedMethod: vi.fn(async (input, value) => {
            input.value = String(value ?? '');
        })
    };
});

import {
    applyGridFilter,
    clickElement,
    closeDialog,
    navigateToForm,
    setCheckbox,
    setCheckboxValue,
    setComboBoxValue,
    setGridCellValue,
    setInputValue,
    setLookupSelectValue,
    setRadioButtonValue,
    setSegmentedEntryValue,
    waitUntilCondition
} from './actions.js';

function makeVisible(el) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return document.body;
        }
    });
}

describe('actions integration', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.stubGlobal('PointerEvent', MouseEvent);
        if (!HTMLElement.prototype.scrollIntoView) {
            HTMLElement.prototype.scrollIntoView = vi.fn();
        }
    });

    it('waitUntilCondition resolves for existing element', async () => {
        const el = document.createElement('div');
        el.setAttribute('data-dyn-controlname', 'StatusControl');
        makeVisible(el);
        document.body.appendChild(el);

        await expect(waitUntilCondition('StatusControl', 'exists', null, 200)).resolves.toBeUndefined();
    });

    it('clickElement clicks element and throws when missing', async () => {
        const el = document.createElement('button');
        el.setAttribute('data-dyn-controlname', 'ClickMe');
        el.click = vi.fn();
        document.body.appendChild(el);

        await clickElement('ClickMe');
        expect(el.click).toHaveBeenCalled();

        await expect(clickElement('MissingClick')).rejects.toThrow('Element not found: MissingClick');
    });

    it('setInputValue sets plain input field value', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'CustomerAccount');
        const input = document.createElement('input');
        wrapper.appendChild(input);
        document.body.appendChild(wrapper);

        await setInputValue('CustomerAccount', 'C001', {});

        expect(input.value).toBe('C001');
    });

    it('waitUntilCondition resolves for hidden and enabled/has-value checks', async () => {
        const hiddenEl = document.createElement('div');
        hiddenEl.setAttribute('data-dyn-controlname', 'HiddenControl');
        hiddenEl.style.display = 'none';
        makeVisible(hiddenEl);
        document.body.appendChild(hiddenEl);

        await expect(waitUntilCondition('HiddenControl', 'hidden', null, 200)).resolves.toBeUndefined();

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'FieldA');
        const input = document.createElement('input');
        input.value = 'ABC';
        wrapper.appendChild(input);
        makeVisible(wrapper);
        makeVisible(input);
        document.body.appendChild(wrapper);

        await expect(waitUntilCondition('FieldA', 'enabled', null, 200)).resolves.toBeUndefined();
        await expect(waitUntilCondition('FieldA', 'has-value', 'ABC', 200)).resolves.toBeUndefined();
    });

    it('waitUntilCondition throws timeout for unmet condition', async () => {
        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 1000;
            return now;
        });

        await expect(waitUntilCondition('MissingControl', 'exists', null, 100))
            .rejects.toThrow('Timeout waiting for "MissingControl"');
    });

    it('setInputValue routes to combobox handling for enum fields', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'ComboField');
        wrapper.setAttribute('data-dyn-role', 'ComboBox');
        const input = document.createElement('input');
        input.setAttribute('aria-controls', 'combo-list');
        wrapper.appendChild(input);
        makeVisible(wrapper);
        makeVisible(input);

        const list = document.createElement('div');
        list.id = 'combo-list';
        list.setAttribute('role', 'listbox');
        makeVisible(list);

        const option = document.createElement('div');
        option.setAttribute('role', 'option');
        option.textContent = 'Alpha';
        makeVisible(option);
        list.appendChild(option);

        document.body.appendChild(wrapper);
        document.body.appendChild(list);

        await setInputValue('ComboField', 'Alpha', { inputType: 'enum' });
        expect(input.value).toBe('Alpha');
    });

    it('setInputValue routes to radio selection', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'RadioField');
        wrapper.setAttribute('data-dyn-role', 'RadioButton');

        const input0 = document.createElement('input');
        input0.type = 'radio';
        const input1 = document.createElement('input');
        input1.type = 'radio';

        wrapper.appendChild(input0);
        wrapper.appendChild(input1);
        document.body.appendChild(wrapper);

        await setInputValue('RadioField', '1', {});
        expect(input1.checked).toBe(true);
    });

    it('setRadioButtonValue supports label text matching and throws when no match', async () => {
        const container = document.createElement('div');
        const labelA = document.createElement('label');
        labelA.textContent = 'Alpha Option';
        const radioA = document.createElement('input');
        radioA.type = 'radio';
        labelA.appendChild(radioA);
        container.appendChild(labelA);

        await setRadioButtonValue(container, 'Alpha');
        expect(radioA.checked).toBe(true);

        await expect(setRadioButtonValue(container, 'Missing')).rejects.toThrow('Radio option not found for value: Missing');
    });

    it('setInputValue throws when no input is found', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'NoInput');
        document.body.appendChild(wrapper);

        await expect(setInputValue('NoInput', 'X', {})).rejects.toThrow('Input not found in: NoInput');
    });

    it('setGridCellValue throws when target grid cell cannot be found', async () => {
        await expect(setGridCellValue('MissingGridCell', 'v1', {}, false))
            .rejects.toThrow('Grid cell element not found: MissingGridCell');
    });

    it('setComboBoxValue supports native select and throws on missing option', async () => {
        const container = document.createElement('div');
        const select = document.createElement('select');
        const optA = document.createElement('option');
        optA.value = 'A';
        optA.textContent = 'Alpha';
        const optB = document.createElement('option');
        optB.value = 'B';
        optB.textContent = 'Beta';
        select.appendChild(optA);
        select.appendChild(optB);
        container.appendChild(select);
        document.body.appendChild(container);

        await setComboBoxValue(container, 'Beta');
        expect(select.value).toBe('B');

        await expect(setComboBoxValue(container, 'Gamma')).rejects.toThrow('Option not found: Gamma');
    });

    it('setComboBoxValue falls back when no listbox is available', async () => {
        const container = document.createElement('div');
        const input = document.createElement('input');
        container.appendChild(input);
        makeVisible(container);
        makeVisible(input);
        document.body.appendChild(container);

        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 500;
            return now;
        });

        await expect(setComboBoxValue(container, 'TypedValue')).resolves.toBeUndefined();
    });

    it('setLookupSelectValue throws when flyout is missing', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'LookupA');
        const input = document.createElement('input');
        const btn = document.createElement('button');
        btn.className = 'lookup-button';
        wrapper.appendChild(input);
        wrapper.appendChild(btn);
        makeVisible(wrapper);
        makeVisible(input);
        makeVisible(btn);
        document.body.appendChild(wrapper);

        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 1000;
            return now;
        });

        await expect(setLookupSelectValue('LookupA', 'X')).rejects.toThrow('Lookup flyout not found');
    });

    it('setLookupSelectValue throws when lookup rows are empty', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'LookupB');
        const input = document.createElement('input');
        const btn = document.createElement('button');
        btn.className = 'lookup-button';
        wrapper.appendChild(input);
        wrapper.appendChild(btn);
        makeVisible(wrapper);
        makeVisible(input);
        makeVisible(btn);
        document.body.appendChild(wrapper);

        const dock = document.createElement('div');
        dock.className = 'lookupDock-buttonContainer';
        makeVisible(dock);
        document.body.appendChild(dock);

        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 1000;
            return now;
        });

        await expect(setLookupSelectValue('LookupB', 'X')).rejects.toThrow('Lookup list is empty');
    });

    it('setLookupSelectValue throws when no row matches requested value', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-dyn-controlname', 'LookupC');
        const input = document.createElement('input');
        const btn = document.createElement('button');
        btn.className = 'lookup-button';
        wrapper.appendChild(input);
        wrapper.appendChild(btn);
        makeVisible(wrapper);
        makeVisible(input);
        makeVisible(btn);
        document.body.appendChild(wrapper);

        const dock = document.createElement('div');
        dock.className = 'lookupDock-buttonContainer';
        makeVisible(dock);
        const row = document.createElement('div');
        row.setAttribute('role', 'row');
        row.textContent = 'Different Value';
        makeVisible(row);
        dock.appendChild(row);
        document.body.appendChild(dock);

        await expect(setLookupSelectValue('LookupC', 'Wanted')).rejects.toThrow('Lookup value not found: Wanted');
    });

    it('setSegmentedEntryValue falls back to direct input when lookup popup is unavailable', async () => {
        const wrapper = document.createElement('div');
        const input = document.createElement('input');
        wrapper.appendChild(input);
        document.body.appendChild(wrapper);

        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 1000;
            return now;
        });

        await expect(setSegmentedEntryValue(wrapper, 'SEG-001')).resolves.toBeUndefined();
        expect(input.value).toBe('SEG-001');
    });

    it('setCheckboxValue toggles custom and native checkboxes and setCheckbox handles missing container', async () => {
        const nativeWrap = document.createElement('div');
        nativeWrap.setAttribute('data-dyn-controlname', 'NativeCheck');
        const native = document.createElement('input');
        native.type = 'checkbox';
        nativeWrap.appendChild(native);
        document.body.appendChild(nativeWrap);

        await setCheckboxValue('NativeCheck', true);
        expect(native.checked).toBe(true);

        const customWrap = document.createElement('div');
        customWrap.setAttribute('data-dyn-controlname', 'CustomCheck');
        customWrap.setAttribute('role', 'checkbox');
        customWrap.setAttribute('aria-checked', 'false');
        customWrap.click = vi.fn(() => customWrap.setAttribute('aria-checked', 'true'));
        document.body.appendChild(customWrap);

        await setCheckboxValue('CustomCheck', true);
        expect(customWrap.click).toHaveBeenCalled();

        await expect(setCheckboxValue('MissingCheck', true)).rejects.toThrow('Element not found: MissingCheck');
        await expect(setCheckbox('MissingCheck2', true)).resolves.toBeUndefined();
    });

    it('closeDialog handles form not found and clicks matching form action button', async () => {
        await expect(closeDialog('UnknownForm', 'ok')).resolves.toBeUndefined();

        const form = document.createElement('div');
        form.setAttribute('data-dyn-form-name', 'SysQueryForm');
        const cancel = document.createElement('button');
        cancel.setAttribute('data-dyn-controlname', 'CancelButton');
        cancel.click = vi.fn();
        form.appendChild(cancel);
        document.body.appendChild(form);

        await closeDialog('SysQueryForm', 'cancel');
        expect(cancel.click).toHaveBeenCalled();
    });

    it('navigateToForm opens new tab and validates missing navigation inputs', async () => {
        const openSpy = vi.fn();
        vi.stubGlobal('open', openSpy);

        await navigateToForm({
            navigateMethod: 'menuItem',
            menuItemName: 'CustTable',
            openInNewTab: true
        });
        expect(openSpy).toHaveBeenCalled();

        await expect(navigateToForm({
            navigateMethod: 'menuItem',
            menuItemName: '',
            navigateUrl: ''
        })).rejects.toThrow('Navigate step requires either menuItemName or navigateUrl');

        vi.unstubAllGlobals();
    });

    it('applyGridFilter writes filter input and applies via apply button', async () => {
        const filterContainer = document.createElement('div');
        filterContainer.setAttribute('data-dyn-controlname', 'FilterField_Grid_Col_Col_Input_0');
        const input = document.createElement('input');
        filterContainer.appendChild(input);
        document.body.appendChild(filterContainer);
        makeVisible(input);
        makeVisible(filterContainer);

        const applyBtn = document.createElement('button');
        applyBtn.setAttribute('data-dyn-controlname', 'Grid_Col_ApplyFilters');
        const applyClick = vi.fn();
        applyBtn.click = applyClick;
        document.body.appendChild(applyBtn);
        makeVisible(applyBtn);

        await applyGridFilter('Grid_Col', 'VALUE-1', 'is exactly');

        expect(input.value).toBe('VALUE-1');
        expect(applyClick).toHaveBeenCalled();
    });
});
