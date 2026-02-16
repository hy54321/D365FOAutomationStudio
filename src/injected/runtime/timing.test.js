import { describe, expect, it } from 'vitest';
import { getWorkflowTimings } from './timing.js';

describe('timing config', () => {
    it('returns baseline timings for default settings', () => {
        const timings = getWorkflowTimings({});
        expect(timings.INPUT_SETTLE_DELAY).toBe(100);
        expect(timings.CLICK_ANIMATION_DELAY).toBe(800);
        expect(timings.VALIDATION_WAIT).toBe(1000);
        expect(timings.systemSpeed).toBe('normal');
    });

    it('scales timings down for faster systems', () => {
        const timings = getWorkflowTimings({
            delayAfterClick: 640,
            delayAfterInput: 320,
            delayAfterSave: 800
        });

        expect(timings.CLICK_ANIMATION_DELAY).toBe(640);
        expect(timings.INPUT_SETTLE_DELAY).toBe(80);
        expect(timings.VALIDATION_WAIT).toBe(800);
        expect(timings.systemSpeed).toBe('fast');
    });

    it('falls back to defaults for invalid values', () => {
        const timings = getWorkflowTimings({
            delayAfterClick: 0,
            delayAfterInput: -1,
            delayAfterSave: Number.NaN
        });

        expect(timings.CLICK_ANIMATION_DELAY).toBe(800);
        expect(timings.INPUT_SETTLE_DELAY).toBe(100);
        expect(timings.VALIDATION_WAIT).toBe(1000);
    });
});

