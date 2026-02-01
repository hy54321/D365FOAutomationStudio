export function sendLog(level, message) {
    window.postMessage({
        type: 'D365_WORKFLOW_LOG',
        log: { level, message }
    }, '*');
}

export function logStep(message) {
    sendLog('info', message);
    console.log('[D365 Automation]', message);
}
