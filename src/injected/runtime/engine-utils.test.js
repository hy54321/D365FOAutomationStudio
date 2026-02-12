import { describe, expect, it } from 'vitest';
import { findIfPairs, findLoopPairs, getStepErrorConfig } from './engine-utils.js';

describe('engine-utils', () => {
    it('resolves step error config with workflow defaults', () => {
        const settings = {
            errorDefaultMode: 'skip',
            errorDefaultRetryCount: 2,
            errorDefaultRetryDelay: 1500,
            errorDefaultGotoLabel: 'recover'
        };
        const step = {
            onErrorMode: 'default'
        };

        expect(getStepErrorConfig(step, settings)).toEqual({
            mode: 'skip',
            retryCount: 2,
            retryDelay: 1500,
            gotoLabel: 'recover'
        });
    });

    it('prefers step-specific error config over defaults', () => {
        const settings = {
            errorDefaultMode: 'fail',
            errorDefaultRetryCount: 1,
            errorDefaultRetryDelay: 400,
            errorDefaultGotoLabel: 'fallback'
        };
        const step = {
            onErrorMode: 'goto',
            onErrorRetryCount: 5,
            onErrorRetryDelay: 900,
            onErrorGotoLabel: 'step-label'
        };

        expect(getStepErrorConfig(step, settings)).toEqual({
            mode: 'goto',
            retryCount: 5,
            retryDelay: 900,
            gotoLabel: 'step-label'
        });
    });

    it('matches loop start/end pairs and reports unclosed loop starts', () => {
        const issues = [];
        const steps = [
            { type: 'click' },
            { type: 'loop-start', id: 'outer' },
            { type: 'loop-start', id: 'inner' },
            { type: 'loop-end', loopRef: 'inner' },
            { type: 'loop-end' },
            { type: 'loop-start', id: 'dangling' }
        ];

        const pairs = findLoopPairs(steps, (message) => issues.push(message));

        expect(pairs).toEqual([
            { startIndex: 1, endIndex: 4 },
            { startIndex: 2, endIndex: 3 }
        ]);
        expect(issues).toEqual(['Unclosed loop-start at index 5']);
    });

    it('builds if/else/end maps and reports malformed blocks', () => {
        const issues = [];
        const steps = [
            { type: 'if-start' },
            { type: 'click' },
            { type: 'else' },
            { type: 'if-end' },
            { type: 'else' }
        ];

        const pairs = findIfPairs(steps, (message) => issues.push(message));

        expect(pairs.ifToElse.get(0)).toBe(2);
        expect(pairs.ifToEnd.get(0)).toBe(3);
        expect(pairs.elseToEnd.get(2)).toBe(3);
        expect(issues).toEqual(['Else without matching if-start at index 4']);
    });
});
