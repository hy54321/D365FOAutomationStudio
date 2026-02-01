export function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function coerceBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);

    const text = normalizeText(value);
    if (text === '') return false;

    if (['true', '1', 'yes', 'y', 'on', 'checked'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'off', 'unchecked'].includes(text)) return false;

    return false;
}
