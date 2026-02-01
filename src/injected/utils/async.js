export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function setNativeValue(input, value) {
    const isTextArea = input.tagName === 'TEXTAREA';
    const descriptor = isTextArea
        ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
        : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

    if (descriptor && descriptor.set) {
        descriptor.set.call(input, value);
    } else {
        input.value = value;
    }
}
