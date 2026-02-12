import { describe, expect, it } from 'vitest';
import { coerceBoolean, normalizeText } from './text.js';

describe('text utils', () => {
    it('normalizes text by trimming, collapsing whitespace, and lowercasing', () => {
        expect(normalizeText('  Foo   BAR  ')).toBe('foo bar');
    });

    it('coerces truthy and falsy string values', () => {
        expect(coerceBoolean('YES')).toBe(true);
        expect(coerceBoolean('off')).toBe(false);
        expect(coerceBoolean('')).toBe(false);
    });

    it('coerces numbers and booleans', () => {
        expect(coerceBoolean(true)).toBe(true);
        expect(coerceBoolean(false)).toBe(false);
        expect(coerceBoolean(1)).toBe(true);
        expect(coerceBoolean(0)).toBe(false);
    });
});
