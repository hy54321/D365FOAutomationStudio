export function generateId(prefix = '') {
    let idValue = '';

    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        idValue = globalThis.crypto.randomUUID();
    } else {
        const randomPart = Math.random().toString(16).slice(2);
        idValue = `${Date.now().toString(36)}_${randomPart}`;
    }

    return prefix ? `${prefix}_${idValue}` : idValue;
}

