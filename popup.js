import { PopupController } from './popup/controller.js';

export function startPopup(options = {}) {
    return new PopupController(options);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    startPopup();
}
