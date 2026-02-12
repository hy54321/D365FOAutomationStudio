/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import D365Inspector from './D365Inspector.js';

function makeVisible(el) {
    Object.defineProperty(el, 'offsetParent', {
        configurable: true,
        get() {
            return document.body;
        }
    });
}

function setRect(el, { left = 10, top = 20, width = 120, height = 30 } = {}) {
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

describe('D365Inspector', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        if (typeof document.elementFromPoint !== 'function') {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                writable: true,
                value: () => null
            });
        }
    });

    it('initializes with default state', () => {
        const inspector = new D365Inspector();
        expect(inspector.isInspecting).toBe(false);
        expect(inspector.highlightElement).toBeNull();
        expect(inspector.overlay).toBeNull();
    });

    it('getElementFormName resolves from closest form container', () => {
        const form = document.createElement('div');
        form.setAttribute('data-dyn-form-name', 'CustTableForm');
        const button = document.createElement('button');
        form.appendChild(button);
        document.body.appendChild(form);

        const inspector = new D365Inspector();
        expect(inspector.getElementFormName(button)).toBe('CustTableForm');
    });

    it('getActiveFormName prioritizes visible dialog forms', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('data-dyn-role', 'Dialog');
        makeVisible(dialog);
        const form = document.createElement('div');
        form.setAttribute('data-dyn-form-name', 'DialogForm');
        dialog.appendChild(form);
        document.body.appendChild(dialog);

        const inspector = new D365Inspector();
        expect(inspector.getActiveFormName()).toBe('DialogForm');
    });

    it('getElementText and getElementLabel return readable values', () => {
        const inspector = new D365Inspector();

        const textEl = document.createElement('div');
        textEl.setAttribute('aria-label', 'Save Record');
        expect(inspector.getElementText(textEl)).toBe('Save Record');

        const field = document.createElement('div');
        field.setAttribute('data-dyn-controlname', 'CustomerAccount');
        const wrapper = document.createElement('div');
        wrapper.className = 'input_container';
        const label = document.createElement('label');
        label.textContent = 'Customer account';
        wrapper.appendChild(label);
        wrapper.appendChild(field);
        document.body.appendChild(wrapper);

        expect(inspector.getElementLabel(field)).toBe('Customer account');
    });

    it('detectFieldType classifies segmented entry, combo/select, lookup and numeric/date', () => {
        const inspector = new D365Inspector();

        const segmented = document.createElement('div');
        segmented.setAttribute('data-dyn-role', 'SegmentedEntry');
        expect(inspector.detectFieldType(segmented)).toEqual({ type: 'segmented-lookup', role: 'SegmentedEntry' });

        const combo = document.createElement('div');
        combo.setAttribute('data-dyn-role', 'ComboBox');
        const select = document.createElement('select');
        select.innerHTML = '<option value="">--</option><option value="A">Alpha</option>';
        combo.appendChild(select);
        const comboType = inspector.detectFieldType(combo);
        expect(comboType.inputType).toBe('enum');
        expect(comboType.isEnum).toBe(true);
        expect(comboType.values).toEqual([{ value: 'A', text: 'Alpha' }]);

        const lookup = document.createElement('div');
        lookup.className = 'field-hasLookupButton';
        const lookupType = inspector.detectFieldType(lookup);
        expect(lookupType.inputType).toBe('lookup');

        const numeric = document.createElement('div');
        numeric.innerHTML = '<input type="number">';
        expect(inspector.detectFieldType(numeric).inputType).toBe('number');

        const date = document.createElement('div');
        date.className = 'date-field';
        expect(inspector.detectFieldType(date).inputType).toBe('date');
    });

    it('discoverElements returns discovered control metadata', () => {
        const inspector = new D365Inspector();
        vi.spyOn(inspector, 'isElementVisible').mockReturnValue(true);

        const form = document.createElement('div');
        form.setAttribute('data-dyn-form-name', 'MainForm');

        const button = document.createElement('button');
        button.setAttribute('data-dyn-role', 'Button');
        button.setAttribute('data-dyn-controlname', 'SaveButton');
        button.textContent = 'Save';
        form.appendChild(button);

        const inputWrap = document.createElement('div');
        inputWrap.setAttribute('data-dyn-role', 'Input');
        inputWrap.setAttribute('data-dyn-controlname', 'AccountNum');
        inputWrap.innerHTML = '<input type="text">';
        form.appendChild(inputWrap);

        document.body.appendChild(form);

        const elements = inspector.discoverElements();
        expect(elements.some(e => e.type === 'button' && e.controlName === 'SaveButton')).toBe(true);
        expect(elements.some(e => e.type === 'input' && e.controlName === 'AccountNum')).toBe(true);
    });

    it('discoverElements can filter to active form only', () => {
        const inspector = new D365Inspector();
        vi.spyOn(inspector, 'isElementVisible').mockReturnValue(true);
        vi.spyOn(inspector, 'getActiveFormName').mockReturnValue('FormB');

        const formA = document.createElement('div');
        formA.setAttribute('data-dyn-form-name', 'FormA');
        const btnA = document.createElement('button');
        btnA.setAttribute('data-dyn-role', 'Button');
        btnA.setAttribute('data-dyn-controlname', 'BtnA');
        formA.appendChild(btnA);

        const formB = document.createElement('div');
        formB.setAttribute('data-dyn-form-name', 'FormB');
        const btnB = document.createElement('button');
        btnB.setAttribute('data-dyn-role', 'Button');
        btnB.setAttribute('data-dyn-controlname', 'BtnB');
        formB.appendChild(btnB);

        document.body.appendChild(formA);
        document.body.appendChild(formB);

        const elements = inspector.discoverElements(true);
        expect(elements.some(e => e.controlName === 'BtnA')).toBe(false);
        expect(elements.some(e => e.controlName === 'BtnB')).toBe(true);
    });

    it('startElementPicker and stopElementPicker manage overlay and listeners', () => {
        const inspector = new D365Inspector();
        const addSpy = vi.spyOn(document, 'addEventListener');
        const removeSpy = vi.spyOn(document, 'removeEventListener');

        inspector.startElementPicker(() => {});
        expect(inspector.isInspecting).toBe(true);
        expect(inspector.overlay).toBeTruthy();
        expect(inspector.highlightElement).toBeTruthy();
        expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), true);

        inspector.stopElementPicker();
        expect(inspector.isInspecting).toBe(false);
        expect(inspector.overlay).toBeNull();
        expect(inspector.highlightElement).toBeNull();
        expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
    });

    it('handleMouseMove updates highlight box for detected controls', () => {
        const inspector = new D365Inspector();
        inspector.highlightElement = document.createElement('div');
        document.body.appendChild(inspector.highlightElement);

        const control = document.createElement('div');
        control.setAttribute('data-dyn-controlname', 'ControlA');
        control.setAttribute('data-dyn-role', 'Input');
        setRect(control, { left: 5, top: 7, width: 90, height: 15 });
        document.body.appendChild(control);

        vi.spyOn(document, 'elementFromPoint').mockReturnValue(control);
        inspector.handleMouseMove({ clientX: 10, clientY: 10 });

        expect(inspector.highlightElement.style.display).toBe('block');
        expect(inspector.highlightElement.style.width).toBe('90px');
        expect(inspector.highlightElement.getAttribute('title')).toBe('Input: ControlA');
    });

    it('handleClick sends picked element info and stops picker', () => {
        const inspector = new D365Inspector();
        const callback = vi.fn();
        inspector.pickerCallback = callback;
        inspector.stopElementPicker = vi.fn();

        const control = document.createElement('div');
        control.setAttribute('data-dyn-controlname', 'CustomerName');
        control.setAttribute('data-dyn-role', 'Input');
        document.body.appendChild(control);
        vi.spyOn(document, 'elementFromPoint').mockReturnValue(control);

        const event = {
            clientX: 1,
            clientY: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        };
        inspector.handleClick(event);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            controlName: 'CustomerName',
            role: 'Input',
            selector: '[data-dyn-controlname="CustomerName"]'
        }));
        expect(inspector.stopElementPicker).toHaveBeenCalled();
    });

    it('findElementByText filters discovered elements by text and type', () => {
        const inspector = new D365Inspector();
        vi.spyOn(inspector, 'discoverElements').mockReturnValue([
            { type: 'button', controlName: 'SaveBtn', displayText: 'Save', ariaLabel: 'Save record' },
            { type: 'input', controlName: 'Account', displayText: 'Customer Account', ariaLabel: '' }
        ]);

        const byText = inspector.findElementByText('save');
        expect(byText).toHaveLength(1);
        expect(byText[0].controlName).toBe('SaveBtn');

        const byType = inspector.findElementByText('account', 'input');
        expect(byType).toHaveLength(1);
        expect(byType[0].type).toBe('input');
    });
});
