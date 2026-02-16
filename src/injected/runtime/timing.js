const DEFAULT_SETTINGS = Object.freeze({
    delayAfterClick: 800,
    delayAfterInput: 400,
    delayAfterSave: 1000
});

const BASE_TIMINGS = Object.freeze({
    QUICK_RETRY_DELAY: 50,
    INPUT_SETTLE_DELAY: 100,
    FLOW_STABILITY_POLL_DELAY: 120,
    MEDIUM_SETTLE_DELAY: 150,
    INTERRUPTION_POLL_DELAY: 150,
    ANIMATION_DELAY: 200,
    MESSAGE_CLOSE_DELAY: 250,
    UI_UPDATE_DELAY: 300,
    DIALOG_ACTION_DELAY: 350,
    POST_INPUT_DELAY: 400,
    DEFAULT_WAIT_STEP_DELAY: 500,
    SAVE_SETTLE_DELAY: 600,
    CLICK_ANIMATION_DELAY: 800,
    VALIDATION_WAIT: 1000
});

const TIMING_CHANNEL = Object.freeze({
    QUICK_RETRY_DELAY: 'input',
    INPUT_SETTLE_DELAY: 'input',
    FLOW_STABILITY_POLL_DELAY: 'general',
    MEDIUM_SETTLE_DELAY: 'input',
    INTERRUPTION_POLL_DELAY: 'input',
    ANIMATION_DELAY: 'input',
    MESSAGE_CLOSE_DELAY: 'click',
    UI_UPDATE_DELAY: 'click',
    DIALOG_ACTION_DELAY: 'click',
    POST_INPUT_DELAY: 'input',
    DEFAULT_WAIT_STEP_DELAY: 'click',
    SAVE_SETTLE_DELAY: 'save',
    CLICK_ANIMATION_DELAY: 'click',
    VALIDATION_WAIT: 'save'
});

function normalizeDelay(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function roundDelay(value) {
    return Math.max(10, Math.round(value));
}

function getSpeedProfile(scales) {
    const averageScale = (scales.click + scales.input + scales.save) / 3;
    if (averageScale <= 0.9) return 'fast';
    if (averageScale >= 1.1) return 'slow';
    return 'normal';
}

export function getWorkflowTimings(settings = {}) {
    const merged = {
        delayAfterClick: normalizeDelay(settings.delayAfterClick, DEFAULT_SETTINGS.delayAfterClick),
        delayAfterInput: normalizeDelay(settings.delayAfterInput, DEFAULT_SETTINGS.delayAfterInput),
        delayAfterSave: normalizeDelay(settings.delayAfterSave, DEFAULT_SETTINGS.delayAfterSave)
    };

    const scales = {
        click: merged.delayAfterClick / DEFAULT_SETTINGS.delayAfterClick,
        input: merged.delayAfterInput / DEFAULT_SETTINGS.delayAfterInput,
        save: merged.delayAfterSave / DEFAULT_SETTINGS.delayAfterSave
    };
    scales.general = (scales.click + scales.input + scales.save) / 3;

    const timings = {};
    Object.entries(BASE_TIMINGS).forEach(([key, baseValue]) => {
        const channel = TIMING_CHANNEL[key] || 'general';
        const scale = scales[channel] || scales.general;
        timings[key] = roundDelay(baseValue * scale);
    });

    timings.systemSpeed = getSpeedProfile(scales);
    timings.settings = merged;
    return timings;
}
