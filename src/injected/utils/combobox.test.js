/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./async.js', () => ({
    sleep: vi.fn().mockResolvedValue(undefined),
    setNativeValue: vi.fn((input, value) => {
        input.value = String(value ?? '');
    })
}));

import {
    comboInputWithSelectedMethod,
    commitComboValue,
    dispatchClickSequence,
    getKeyCode,
    setValueWithVerify,
    waitForInputValue
} from './combobox.js';

describe('combobox utils', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.stubGlobal('PointerEvent', MouseEvent);
    });

    it('waitForInputValue returns true when input matches expected value', async () => {
        const input = document.createElement('input');
        input.value = 'Alpha';
        await expect(waitForInputValue(input, 'Alpha', 200)).resolves.toBe(true);
    });

    it('waitForInputValue returns false after timeout', async () => {
        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 500;
            return now;
        });

        const input = document.createElement('input');
        input.value = 'A';
        await expect(waitForInputValue(input, 'B', 100)).resolves.toBe(false);
    });

    it('setValueWithVerify sets input to expected value', async () => {
        const input = document.createElement('input');
        await setValueWithVerify(input, 'C001');
        expect(input.value).toBe('C001');
    });

    it('getKeyCode maps letters digits and special chars', () => {
        expect(getKeyCode('a')).toBe('KeyA');
        expect(getKeyCode('7')).toBe('Digit7');
        expect(getKeyCode(' ')).toBe('Space');
        expect(getKeyCode('!')).toBe('Unidentified');
    });

    it('comboInputWithSelectedMethod defaults unknown methods to method3', async () => {
        const input = document.createElement('input');
        const value = await comboInputWithSelectedMethod(input, 'Beta', 'unknown');
        expect(value).toBe('Beta');
        expect(input.value).toBe('Beta');
    });

    it('commitComboValue dispatches commit-related events and blurs input', () => {
        const input = document.createElement('input');
        const container = document.createElement('div');
        let changed = 0;
        let blurred = 0;

        input.addEventListener('change', () => {
            changed += 1;
        });
        container.addEventListener('change', () => {
            changed += 1;
        });
        container.addEventListener('blur', () => {
            blurred += 1;
        });

        commitComboValue(input, 'Z99', container);

        expect(input.value).toBe('Z99');
        expect(changed).toBeGreaterThan(0);
        expect(blurred).toBeGreaterThanOrEqual(1);
    });

    it('dispatchClickSequence emits click through target.click', () => {
        const button = document.createElement('button');
        const clickSpy = vi.fn();
        button.click = clickSpy;

        dispatchClickSequence(button);
        expect(clickSpy).toHaveBeenCalled();
    });
});
