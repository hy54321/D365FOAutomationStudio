import D365Inspector from './inspector/D365Inspector.js';
import { logStep, sendLog } from './utils/logging.js';
import { sleep } from './utils/async.js';
import { coerceBoolean, normalizeText } from './utils/text.js';
import { NavigationInterruptError } from './runtime/errors.js';
import { getStepErrorConfig, findLoopPairs, findIfPairs } from './runtime/engine-utils.js';
import { evaluateCondition } from './runtime/conditions.js';
import { clickElement, applyGridFilter, waitUntilCondition, setInputValue, setGridCellValue, setLookupSelectValue, setCheckboxValue, navigateToForm, activateTab, activateActionPaneTab, expandOrCollapseSection, configureQueryFilter, configureBatchProcessing, closeDialog, configureRecurrence } from './steps/actions.js';
import { findElementInActiveContext, isElementVisible, isD365Loading } from './utils/dom.js';


export function startInjected({ windowObj = globalThis.window, documentObj = globalThis.document, inspectorFactory = () => new D365Inspector() } = {}) {
    if (!windowObj || !documentObj) {
        return { started: false, reason: 'missing-window-or-document' };
    }
    const window = windowObj;
    const document = documentObj;
    const navigator = windowObj.navigator || globalThis.navigator;

    window.D365Inspector = D365Inspector;

    // ====== Initialize and Listen for Messages ======

    // Prevent duplicate initialization
    if (window.d365InjectedScriptLoaded) {
        console.log('D365 injected script already loaded, skipping...');
        return { started: false, reason: 'already-loaded' };
    }

    window.d365InjectedScriptLoaded = true;

    // Create inspector instance
    const inspector = inspectorFactory();

    // ====== Workflow Execution Engine ======
    let currentWorkflowSettings = {};
    window.d365CurrentWorkflowSettings = currentWorkflowSettings;
    let currentWorkflow = null;
    let executionControl = {
        isPaused: false,
        isStopped: false,
        currentStepIndex: 0,
        currentRowIndex: 0,
        totalRows: 0,
        currentDataRow: null,
        pendingFlowSignal: 'none',
        pendingInterruptionDecision: null,
        runOptions: {
            skipRows: 0,
            limitRows: 0,
            dryRun: false,
            learningMode: false,
            runUntilInterception: false
        }
    };

    // Single unified message listener
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        // Discovery requests
        if (event.data.type === 'D365_DISCOVER_ELEMENTS') {
            const activeFormOnly = event.data.activeFormOnly || false;
            const elements = inspector.discoverElements(activeFormOnly);
            const activeForm = inspector.getActiveFormName();
            window.postMessage({
                type: 'D365_ELEMENTS_DISCOVERED',
                elements: elements.map(el => ({
                    ...el,
                    element: undefined // Remove DOM reference for serialization
                })),
                activeForm: activeForm
            }, '*');
        }

        if (event.data.type === 'D365_START_PICKER') {
            inspector.startElementPicker((element) => {
                // Add form name to picked element
                const formName = inspector.getElementFormName(document.querySelector(`[data-dyn-controlname="${element.controlName}"]`));
                window.postMessage({
                    type: 'D365_ELEMENT_PICKED',
                    element: { ...element, formName }
                }, '*');
            });
        }

        if (event.data.type === 'D365_STOP_PICKER') {
            inspector.stopElementPicker();
        }

        if (event.data.type === 'D365_EXECUTE_WORKFLOW') {
            executeWorkflow(event.data.workflow, event.data.data);
        }

        if (event.data.type === 'D365_NAV_BUTTONS_UPDATE') {
            updateNavButtons(event.data.payload);
        }
        
        // Execution controls
        if (event.data.type === 'D365_PAUSE_WORKFLOW') {
            executionControl.isPaused = true;
        }
        if (event.data.type === 'D365_RESUME_WORKFLOW') {
            executionControl.isPaused = false;
        }
        if (event.data.type === 'D365_STOP_WORKFLOW') {
            executionControl.isStopped = true;
            executionControl.isPaused = false;
        }
        if (event.data.type === 'D365_APPLY_INTERRUPTION_DECISION') {
            executionControl.pendingInterruptionDecision = event.data.payload || null;
            executionControl.isPaused = false;
        }
    });

    let pendingNavButtonsPayload = null;
    let navButtonsRetryTimer = null;
    let navButtonsOutsideClickHandler = null;

    function updateNavButtons(payload) {
        pendingNavButtonsPayload = payload || null;
        renderNavButtons();
    }

    function renderNavButtons() {
        const payload = pendingNavButtonsPayload;
        if (!payload) return;

        const navGroup = document.getElementById('navigationMainActionGroup');
        if (!navGroup) {
            if (!navButtonsRetryTimer) {
                navButtonsRetryTimer = setTimeout(() => {
                    navButtonsRetryTimer = null;
                    renderNavButtons();
                }, 1000);
            }
            return;
        }

        const existingContainer = document.getElementById('d365-nav-buttons-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
        if (!buttons.length) return;

        const currentMenuItem = (payload.menuItem || '').toLowerCase();

        const visibleButtons = buttons.filter((button) => {
            const menuItems = Array.isArray(button.menuItems) ? button.menuItems : [];
            if (!menuItems.length) return true;
            if (!currentMenuItem) return false;
            return menuItems.some((item) => (item || '').toLowerCase() === currentMenuItem);
        });

        if (!visibleButtons.length) return;

        const container = document.createElement('div');
        container.id = 'd365-nav-buttons-container';
        container.style.display = 'flex';
        container.style.gap = '6px';
        container.style.alignItems = 'center';
        container.style.marginRight = '6px';

        const runButtonWorkflow = async (buttonConfig) => {
            const workflow = buttonConfig.workflow;
            if (!workflow) {
                sendLog('error', `Workflow not found for nav button: ${buttonConfig.name || buttonConfig.id}`);
                return;
            }
            const data = workflow.dataSources?.primary?.data || workflow.dataSource?.data || [];
            executeWorkflow(workflow, data);
        };

        const createStyledButton = (label, title = '') => {
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = 'navigationBar-search';
            buttonEl.textContent = label;
            buttonEl.title = title;
            buttonEl.style.height = '24px';
            buttonEl.style.padding = '0 8px';
            buttonEl.style.borderRadius = '4px';
            buttonEl.style.border = '1px solid rgba(255,255,255,0.35)';
            buttonEl.style.background = 'rgba(255,255,255,0.12)';
            buttonEl.style.color = '#ffffff';
            buttonEl.style.fontSize = '12px';
            buttonEl.style.fontWeight = '600';
            buttonEl.style.lineHeight = '22px';
            buttonEl.style.cursor = 'pointer';
            buttonEl.style.whiteSpace = 'nowrap';
            buttonEl.style.display = 'inline-flex';
            buttonEl.style.alignItems = 'center';
            buttonEl.style.justifyContent = 'center';
            buttonEl.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.08)';
            return buttonEl;
        };

        const closeAllGroupMenus = () => {
            container.querySelectorAll('[data-d365-nav-group-menu]').forEach((menu) => {
                menu.style.display = 'none';
            });
        };

        const standaloneButtons = [];
        const groupedButtons = new Map();

        visibleButtons.forEach((buttonConfig) => {
            const groupName = (buttonConfig.group || '').trim();
            if (!groupName) {
                standaloneButtons.push(buttonConfig);
                return;
            }
            if (!groupedButtons.has(groupName)) {
                groupedButtons.set(groupName, []);
            }
            groupedButtons.get(groupName).push(buttonConfig);
        });

        standaloneButtons.forEach((buttonConfig) => {
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'navigationBar-company navigationBar-pinnedElement';

            const buttonEl = createStyledButton(buttonConfig.name || buttonConfig.workflowName || 'Workflow', buttonConfig.name || '');
            buttonEl.setAttribute('data-d365-nav-button-id', buttonConfig.id || '');
            buttonEl.addEventListener('click', () => runButtonWorkflow(buttonConfig));

            buttonWrapper.appendChild(buttonEl);
            container.appendChild(buttonWrapper);
        });

        Array.from(groupedButtons.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([groupName, groupItems]) => {
                const groupWrapper = document.createElement('div');
                groupWrapper.className = 'navigationBar-company navigationBar-pinnedElement';
                groupWrapper.style.position = 'relative';

                const groupButton = createStyledButton(`${groupName} \u25BE`, groupName);
                groupButton.setAttribute('data-d365-nav-group', groupName);
                groupButton.style.borderColor = 'rgba(255,255,255,0.55)';
                groupButton.style.background = 'rgba(255,255,255,0.2)';

                const groupMenu = document.createElement('div');
                groupMenu.setAttribute('data-d365-nav-group-menu', groupName);
                groupMenu.style.position = 'absolute';
                groupMenu.style.top = '28px';
                groupMenu.style.left = '0';
                groupMenu.style.minWidth = '230px';
                groupMenu.style.maxWidth = '320px';
                groupMenu.style.maxHeight = '320px';
                groupMenu.style.overflowY = 'auto';
                groupMenu.style.background = '#fcfdff';
                groupMenu.style.border = '1px solid rgba(30,41,59,0.16)';
                groupMenu.style.borderRadius = '10px';
                groupMenu.style.boxShadow = '0 14px 28px rgba(0,0,0,0.28)';
                groupMenu.style.padding = '8px';
                groupMenu.style.display = 'none';
                groupMenu.style.zIndex = '2147483000';

                const groupHeader = document.createElement('div');
                groupHeader.textContent = groupName;
                groupHeader.style.fontSize = '11px';
                groupHeader.style.fontWeight = '700';
                groupHeader.style.color = '#475569';
                groupHeader.style.margin = '0 2px 6px 2px';
                groupHeader.style.paddingBottom = '6px';
                groupHeader.style.borderBottom = '1px solid #e2e8f0';
                groupMenu.appendChild(groupHeader);

                groupItems
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .forEach((buttonConfig) => {
                        const itemButton = document.createElement('button');
                        itemButton.type = 'button';
                        itemButton.textContent = buttonConfig.name || buttonConfig.workflowName || 'Workflow';
                        itemButton.title = buttonConfig.name || '';
                        itemButton.style.display = 'block';
                        itemButton.style.width = '100%';
                        itemButton.style.textAlign = 'left';
                        itemButton.style.border = 'none';
                        itemButton.style.background = 'transparent';
                        itemButton.style.color = '#1f2937';
                        itemButton.style.borderRadius = '4px';
                        itemButton.style.padding = '8px 9px';
                        itemButton.style.fontSize = '12px';
                        itemButton.style.fontWeight = '600';
                        itemButton.style.lineHeight = '1.3';
                        itemButton.style.marginBottom = '3px';
                        itemButton.style.cursor = 'pointer';
                        itemButton.style.transition = 'background .15s ease, color .15s ease';

                        itemButton.addEventListener('mouseenter', () => {
                            itemButton.style.background = '#e8edff';
                            itemButton.style.color = '#1e3a8a';
                        });
                        itemButton.addEventListener('mouseleave', () => {
                            itemButton.style.background = 'transparent';
                            itemButton.style.color = '#1f2937';
                        });

                        itemButton.addEventListener('click', (event) => {
                            event.stopPropagation();
                            closeAllGroupMenus();
                            runButtonWorkflow(buttonConfig);
                        });

                        groupMenu.appendChild(itemButton);
                    });

                groupButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const isOpen = groupMenu.style.display === 'block';
                    closeAllGroupMenus();
                    groupMenu.style.display = isOpen ? 'none' : 'block';
                    groupButton.style.background = isOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.32)';
                });

                groupWrapper.appendChild(groupButton);
                groupWrapper.appendChild(groupMenu);
                container.appendChild(groupWrapper);
            });

        navGroup.insertBefore(container, navGroup.firstChild);

        if (navButtonsOutsideClickHandler) {
            document.removeEventListener('click', navButtonsOutsideClickHandler, true);
        }
        navButtonsOutsideClickHandler = (event) => {
            const active = document.getElementById('d365-nav-buttons-container');
            if (!active || active.contains(event.target)) return;
            active.querySelectorAll('[data-d365-nav-group-menu]').forEach((menu) => {
                menu.style.display = 'none';
            });
        };
        document.addEventListener('click', navButtonsOutsideClickHandler, true);
    }

    const unhandledUnexpectedEventKeys = new Set();
    // Track message bar messages already acknowledged during this execution run
    // so the same non-blocking warning doesn't trigger repeated pauses.
    const acknowledgedMessageBarKeys = new Set();

    // Helper to check and wait for pause/stop
    async function checkExecutionControl() {
        if (executionControl.isStopped) {
            throw createUserStopError();
        }

        while (executionControl.isPaused) {
            await sleep(200);
            if (executionControl.isStopped) {
                throw createUserStopError();
            }
        }
    }

    function getTemplateText(text) {
        return normalizeText(text || '').replace(/\b[\d,.]+\b/g, '#').trim();
    }

    function createUserStopError(message = 'Workflow stopped by user') {
        const err = new Error(message);
        err.isUserStop = true;
        err.noRetry = true;
        return err;
    }

    function isMessageBarCloseVisible() {
        const closeBtn = document.querySelector('[data-dyn-controlname="MessageBarClose"]');
        return closeBtn && isElementVisible(closeBtn);
    }

    function shortenForLog(text, max = 220) {
        const normalized = normalizeText(text || '');
        if (normalized.length <= max) return normalized;
        return `${normalized.slice(0, max)}...`;
    }

    function consumePendingFlowSignal() {
        const signal = executionControl.pendingFlowSignal || 'none';
        executionControl.pendingFlowSignal = 'none';
        return signal;
    }

    function startInterruptionActionRecorder() {
        const captured = [];
        const clickHandler = (evt) => {
            const target = evt.target instanceof Element ? evt.target : null;
            if (!target) return;
            const button = target.closest('button, [role="button"], [data-dyn-role="CommandButton"]');
            if (!button || !isElementVisible(button)) return;
            const controlName = button.getAttribute('data-dyn-controlname') || '';
            const text = normalizeText(button.textContent || button.getAttribute('aria-label') || '');
            if (!controlName && !text) return;
            captured.push({
                type: 'clickButton',
                controlName,
                text
            });
        };
        document.addEventListener('click', clickHandler, true);
        return {
            stop() {
                document.removeEventListener('click', clickHandler, true);
                return captured.slice();
            }
        };
    }

    function collectDialogButtons(dialogEl) {
        const selectors = 'button, [role="button"], [data-dyn-role="CommandButton"]';
        const buttons = [];
        const seen = new Set();
        dialogEl.querySelectorAll(selectors).forEach((buttonEl) => {
            if (!isElementVisible(buttonEl)) return;
            const controlName = buttonEl.getAttribute('data-dyn-controlname') || '';
            const text = normalizeText(buttonEl.textContent || buttonEl.getAttribute('aria-label') || '');
            const key = `${controlName.toLowerCase()}|${text}`;
            if (!controlName && !text) return;
            if (seen.has(key)) return;
            seen.add(key);
            buttons.push({ controlName, text, element: buttonEl });
        });
        return buttons;
    }

    function isLikelyModalDialog(dialogEl, text, buttons) {
        const textLength = normalizeText(text || '').length;
        if (!buttons.length) return false;
        if (textLength > 450) return false;

        const formInputs = dialogEl.querySelectorAll('input, select, textarea');
        if (formInputs.length > 8) return false;

        const hasStaticText = !!dialogEl.querySelector('[data-dyn-controlname="FormStaticTextControl1"]');
        const hasLightboxClass = dialogEl.classList?.contains('rootContent-lightBox');
        const hasButtonGroup = !!dialogEl.querySelector('[data-dyn-controlname="ButtonGroup"]');

        return hasStaticText || hasLightboxClass || hasButtonGroup;
    }

    function detectUnexpectedEvents() {
        const events = [];
        const seenEventKeys = new Set();

        // --- Dialogs ---
        const dialogSelectors = '[role="dialog"], [data-dyn-role="Dialog"], .dialog-container';
        document.querySelectorAll(dialogSelectors).forEach((dialogEl) => {
            if (!isElementVisible(dialogEl)) return;
            // Prefer the dedicated static-text control, then heading tags.
            // Avoid the overly-broad [class*="content"] which can match wrapper
            // elements whose textContent includes button labels.
            const textEl =
                dialogEl.querySelector('[data-dyn-controlname="FormStaticTextControl1"]') ||
                dialogEl.querySelector('h1, h2, h3') ||
                dialogEl.querySelector('[class*="message"]');
            const text = normalizeText(textEl?.textContent || dialogEl.textContent || '');
            const buttons = collectDialogButtons(dialogEl);
            if (!isLikelyModalDialog(dialogEl, text, buttons)) return;
            const templateText = getTemplateText(text);
            const key = `dialog|${templateText}`;
            if (!templateText || seenEventKeys.has(key)) return;
            seenEventKeys.add(key);
            events.push({
                kind: 'dialog',
                text,
                templateText,
                buttons,
                element: dialogEl
            });
        });

        // --- Message bar entries ---
        document.querySelectorAll('.messageBar-messageEntry').forEach((entryEl) => {
            if (!isElementVisible(entryEl)) return;
            const messageEl = entryEl.querySelector('.messageBar-message') || entryEl;
            const text = normalizeText(messageEl.textContent || '');
            const templateText = getTemplateText(text);
            const key = `messageBar|${templateText}`;
            if (!templateText || seenEventKeys.has(key)) return;
            seenEventKeys.add(key);

            // Skip message-bar entries that were already acknowledged in this run
            // so the same non-blocking warning doesn't cause repeated pauses.
            if (acknowledgedMessageBarKeys.has(key)) return;

            // Collect close / toggle controls plus contextual visible buttons
            // (e.g. OK/Cancel on the active form) so the user can choose them.
            const controls = [];
            const controlKeys = new Set();
            const pushControl = (control) => {
                const key = `${normalizeText(control?.controlName || '')}|${normalizeText(control?.text || '')}`;
                if (!key || controlKeys.has(key)) return;
                controlKeys.add(key);
                controls.push(control);
            };

            const closeButton =
                entryEl.querySelector('[data-dyn-controlname="MessageBarClose"]') ||
                Array.from(document.querySelectorAll('[data-dyn-controlname="MessageBarClose"]')).find(isElementVisible) ||
                null;
            const toggleButton =
                entryEl.querySelector('[data-dyn-controlname="MessageBarToggle"]') ||
                Array.from(document.querySelectorAll('[data-dyn-controlname="MessageBarToggle"]')).find(isElementVisible) ||
                null;
            if (closeButton && isElementVisible(closeButton)) {
                pushControl({ controlName: 'MessageBarClose', text: normalizeText(closeButton.textContent || ''), element: closeButton, visible: true });
            }
            if (toggleButton && isElementVisible(toggleButton)) {
                pushControl({ controlName: 'MessageBarToggle', text: normalizeText(toggleButton.textContent || ''), element: toggleButton, visible: true });
            }

            const contextRoot =
                entryEl.closest('[data-dyn-form-name], [role="dialog"], .rootContent, .rootContent-lightBox') ||
                document;
            const buttonSelectors = '[data-dyn-role="CommandButton"], button, [role="button"]';
            contextRoot.querySelectorAll(buttonSelectors).forEach((btn) => {
                const controlName = btn.getAttribute('data-dyn-controlname') || '';
                const textValue = normalizeText(btn.textContent || btn.getAttribute('aria-label') || '');
                const token = normalizeText(controlName || textValue);
                const isPrimaryAction =
                    ['ok', 'cancel', 'yes', 'no', 'close', 'remove', 'delete', 'save', 'new'].includes(token) ||
                    token.includes('remove') ||
                    token.includes('delete') ||
                    token.includes('cancel') ||
                    token.includes('close') ||
                    token.includes('linestrip') ||
                    textValue === 'remove' ||
                    textValue === 'delete';
                if (!isElementVisible(btn) || (!controlName && !textValue) || !isPrimaryAction) return;
                pushControl({ controlName, text: textValue, element: btn, visible: true });
            });

            // Fallback: scan globally for visible remediation actions that may be
            // outside the message-bar/form wrapper (e.g. LineStripDelete in toolbar).
            document.querySelectorAll(buttonSelectors).forEach((btn) => {
                const controlName = btn.getAttribute('data-dyn-controlname') || '';
                const textValue = normalizeText(btn.textContent || btn.getAttribute('aria-label') || '');
                const token = normalizeText(controlName || textValue);
                const isLikelyFixAction =
                    token.includes('remove') ||
                    token.includes('delete') ||
                    token.includes('cancel') ||
                    token.includes('close') ||
                    token.includes('linestripdelete') ||
                    textValue === 'remove' ||
                    textValue === 'delete';
                if (!isElementVisible(btn) || !isLikelyFixAction) return;
                pushControl({ controlName, text: textValue, element: btn, visible: true });
            });

            events.push({
                kind: 'messageBar',
                text,
                templateText,
                controls,
                element: entryEl
            });
        });

        return events;
    }

    function matchHandlerToEvent(handler, event) {
        const trigger = handler?.trigger || {};
        if (trigger.kind !== event.kind) return false;
        const triggerTemplate = generalizeInterruptionText(trigger.textTemplate || '');
        const eventTemplate = generalizeInterruptionText(event.templateText || event.text || '');
        const triggerMatchMode = normalizeText(trigger.matchMode || '');
        const matchMode = triggerMatchMode === 'exact' ? 'exact' : 'contains';

        if (triggerTemplate) {
            if (matchMode === 'exact') {
                if (triggerTemplate !== eventTemplate) return false;
            } else if (!(eventTemplate.includes(triggerTemplate) || triggerTemplate.includes(eventTemplate))) {
                return false;
            }
        }

        if (triggerMatchMode === 'regex') {
            try {
                const pattern = trigger.regex || trigger.textTemplate || '';
                if (!pattern || !(new RegExp(pattern, 'i')).test(event.templateText || event.text || '')) {
                    return false;
                }
            } catch (error) {
                return false;
            }
        }

        const requiredControls = Array.isArray(trigger.requiredControls) ? trigger.requiredControls : [];
        if (requiredControls.length && event.kind === 'messageBar') {
            const available = new Set((event.controls || []).map(ctrl => normalizeText(ctrl.controlName || ctrl.text || '')));
            if (!requiredControls.every(name => available.has(normalizeText(name)))) {
                return false;
            }
        }

        const requiredButtons = Array.isArray(trigger.requiredButtons) ? trigger.requiredButtons : [];
        if (requiredButtons.length && event.kind === 'dialog') {
            const available = new Set((event.buttons || []).map(btn => normalizeText(btn.controlName || btn.text || '')));
            return requiredButtons.every(name => available.has(normalizeText(name)));
        }
        return true;
    }

    function generalizeInterruptionText(rawText) {
        let value = normalizeText(rawText || '');
        if (!value) return '';

        value = value
            .replace(/\bcustomer\s+\d+\b/gi, 'customer {number}')
            .replace(/\bitem number\s+[a-z0-9_-]+\b/gi, 'item number {value}')
            .replace(/\b\d[\d,./-]*\b/g, '{number}');

        // Normalize duplicate-record style messages so varying key values
        // (e.g. "1, 1" vs "FR-EU-NR, FR-EU-NR") map to one handler.
        value = value.replace(
            /(\b[a-z][a-z0-9 _()/-]*\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
            '$1{value}$3'
        );

        return normalizeText(value);
    }

    function findMatchingHandler(event) {
        const handlers = Array.isArray(currentWorkflow?.unexpectedEventHandlers)
            ? currentWorkflow.unexpectedEventHandlers
            : [];
        const sorted = handlers
            .filter(Boolean)
            .slice()
            .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));

        for (const handler of sorted) {
            if (handler?.enabled === false) continue;
            if (matchHandlerToEvent(handler, event)) {
                return handler;
            }
        }
        return null;
    }

    function findDialogButton(event, targetName) {
        const expected = normalizeText(targetName || '');
        if (!expected) return null;
        const buttons = Array.isArray(event?.buttons) ? event.buttons : [];
        return buttons.find(btn => {
            const byControl = normalizeText(btn.controlName || '');
            const byText = normalizeText(btn.text || '');
            return byControl === expected || byText === expected;
        }) || null;
    }

    function findMessageBarControl(event, targetName) {
        const expected = normalizeText(targetName || '');
        if (!expected) return null;
        const controls = Array.isArray(event?.controls) ? event.controls : [];
        return controls.find(ctrl => {
            const byControl = normalizeText(ctrl.controlName || '');
            const byText = normalizeText(ctrl.text || '');
            return byControl === expected || byText === expected;
        }) || null;
    }

    function collectGlobalRemediationControls() {
        const controls = [];
        const seen = new Set();
        const buttonSelectors = '[data-dyn-role="CommandButton"], button, [role="button"]';
        document.querySelectorAll(buttonSelectors).forEach((btn) => {
            if (!isElementVisible(btn)) return;
            const controlName = btn.getAttribute('data-dyn-controlname') || '';
            const text = normalizeText(btn.textContent || btn.getAttribute('aria-label') || '');
            const token = normalizeText(controlName || text);
            const isRemediationAction =
                token.includes('remove') ||
                token.includes('delete') ||
                token.includes('cancel') ||
                token.includes('close') ||
                token === 'ok' ||
                token === 'yes' ||
                token === 'no';
            if (!isRemediationAction) return;
            const key = `${normalizeText(controlName)}|${text}`;
            if (seen.has(key)) return;
            seen.add(key);
            controls.push({ controlName, text, element: btn, visible: true });
        });
        return controls;
    }

    function findGlobalClickable(targetName) {
        const expected = normalizeText(targetName || '');
        if (!expected) return null;
        const controls = collectGlobalRemediationControls();
        return controls.find((ctrl) => {
            const byControl = normalizeText(ctrl.controlName || '');
            const byText = normalizeText(ctrl.text || '');
            return byControl === expected || byText === expected;
        }) || null;
    }

    function normalizeHandlerActions(handler) {
        if (Array.isArray(handler?.actions) && handler.actions.length) {
            return handler.actions.filter(Boolean);
        }
        if (handler?.action) {
            return [handler.action];
        }
        return [];
    }

    function recordLearnedRule(rule) {
        if (!currentWorkflow || !rule) return;
        currentWorkflow.unexpectedEventHandlers = Array.isArray(currentWorkflow.unexpectedEventHandlers)
            ? currentWorkflow.unexpectedEventHandlers
            : [];

        const key = JSON.stringify({
            trigger: rule.trigger,
            actions: Array.isArray(rule?.actions) ? rule.actions : [rule?.action].filter(Boolean),
            outcome: rule?.outcome || 'next-step'
        });
        const exists = currentWorkflow.unexpectedEventHandlers.some(existing =>
            JSON.stringify({
                trigger: existing?.trigger,
                actions: Array.isArray(existing?.actions) ? existing.actions : [existing?.action].filter(Boolean),
                outcome: existing?.outcome || 'next-step'
            }) === key
        );
        if (exists) return;

        currentWorkflow.unexpectedEventHandlers.push(rule);
        window.postMessage({
            type: 'D365_WORKFLOW_LEARNING_RULE',
            payload: {
                workflowId: currentWorkflow?.id || '',
                rule
            }
        }, '*');
    }

    function createRuleFromEvent(event, actions, outcome = 'next-step', matchMode = 'contains') {
        const requiredButtons = event.kind === 'dialog'
            ? (event.buttons || []).map(btn => btn.controlName || btn.text).filter(Boolean)
            : [];
        const requiredControls = event.kind === 'messageBar'
            ? (event.controls || []).map(ctrl => ctrl.controlName || ctrl.text).filter(Boolean)
            : [];
        const actionList = Array.isArray(actions) ? actions.filter(Boolean) : [];
        return {
            id: `rule_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            createdAt: Date.now(),
            priority: 100,
            mode: 'auto',
            trigger: {
                kind: event.kind,
                textTemplate: generalizeInterruptionText(event.templateText || event.text || ''),
                matchMode: normalizeText(matchMode || '') === 'exact' ? 'exact' : 'contains',
                requiredButtons,
                requiredControls
            },
            actions: actionList,
            action: actionList[0] || null,
            outcome: normalizeFlowOutcome(outcome)
        };
    }

    function normalizeFlowOutcome(rawOutcome) {
        const value = normalizeText(rawOutcome || '');
        if (value === 'continue-loop' || value === 'continue') return 'continue-loop';
        if (value === 'repeat-loop' || value === 'repeat' || value === 'retry-loop') return 'repeat-loop';
        if (value === 'break-loop' || value === 'break') return 'break-loop';
        if (value === 'stop' || value === 'fail') return 'stop';
        return 'next-step';
    }

    function isBenignMessageBarEvent(event) {
        if (!event || event.kind !== 'messageBar') return false;
        const text = normalizeText(event.text || '');
        return text.includes('newrecordaction button should not re-trigger the new task');
    }

    async function waitForFlowTransitionStability() {
        const maxChecks = 16;
        for (let i = 0; i < maxChecks; i++) {
            const loading = isD365Loading();
            const visibleDialog = document.querySelector('[role="dialog"]:not([style*="display: none"]), [data-dyn-role="Dialog"]:not([style*="display: none"])');
            if (!loading && !visibleDialog) {
                break;
            }
            await sleep(120);
        }
    }

    function buildRuleActionFromOption(event, option) {
        const normalizedControl = normalizeText(option?.controlName || '');
        if (event.kind === 'messageBar' && normalizedControl === 'messagebarclose') {
            return {
                type: 'closeMessageBar',
                buttonControlName: option.controlName || '',
                buttonText: option.text || ''
            };
        }
        return {
            type: 'clickButton',
            buttonControlName: option?.controlName || '',
            buttonText: option?.text || ''
        };
    }

    async function applySingleAction(event, action) {
        if (action?.type === 'clickButton' && event.kind === 'dialog') {
            const button = findDialogButton(event, action.buttonControlName || action.buttonText);
            if (button?.element) {
                button.element.click();
                await sleep(350);
                return true;
            }
        }

        if (action?.type === 'clickButton' && event.kind === 'messageBar') {
            const control = findMessageBarControl(event, action.buttonControlName || action.buttonText);
            if (control?.element) {
                control.element.click();
                await sleep(350);
                return true;
            }
        }

        if (action?.type === 'clickButton') {
            const globalControl = findGlobalClickable(action.buttonControlName || action.buttonText);
            if (!globalControl?.element) return false;
            globalControl.element.click();
            await sleep(350);
            return true;
        }

        if (action?.type === 'closeMessageBar' && event.kind === 'messageBar') {
            const fromOption = findMessageBarControl(event, action.buttonControlName || action.buttonText);
            const fromControls = (event.controls || []).find(ctrl => normalizeText(ctrl.controlName || '') === 'messagebarclose');
            const fromEntry =
                event.element?.querySelector?.('[data-dyn-controlname="MessageBarClose"]') || null;
            const fromPage = Array.from(document.querySelectorAll('[data-dyn-controlname="MessageBarClose"]')).find(isElementVisible) || null;
            const closeElement = fromOption?.element || fromControls?.element || fromEntry || fromPage;
            if (!closeElement || !isElementVisible(closeElement)) return false;
            closeElement.click();
            await sleep(250);
            return true;
        }

        if (action?.type === 'stop') {
            throw createUserStopError();
        }

        return action?.type === 'none';
    }

    async function applyHandler(event, handler) {
        const actions = normalizeHandlerActions(handler);
        if (!actions.length) return true;
        let handled = false;
        for (const action of actions) {
            const currentEvents = detectUnexpectedEvents();
            const activeEvent = currentEvents[0] || event;
            const applied = await applySingleAction(activeEvent, action);
            handled = handled || applied;
        }
        return handled;
    }

    // askUserAndHandleEvent removed — learning mode uses the recorder-based
    // approach in handleUnexpectedEvents which captures user clicks on the
    // actual D365 page and automatically creates rules from them.

    function inferFlowOutcomeFromAction(action, event) {
        const token = normalizeText(action?.controlName || action?.text || '');
        if (!token) return 'next-step';
        if (token.includes('stop')) return 'stop';
        if (token.includes('cancel') || token.includes('close') || token === 'no') {
            if (event?.kind === 'messageBar') {
                return 'continue-loop';
            }
            return 'next-step';
        }
        return 'next-step';
    }

    function buildInterruptionOptions(event) {
        const dedupe = new Set();
        const all = [];
        const pushUnique = (item) => {
            const option = {
                controlName: item?.controlName || '',
                text: item?.text || ''
            };
            const key = `${normalizeText(option.controlName)}|${normalizeText(option.text)}`;
            if (dedupe.has(key)) return;
            dedupe.add(key);
            all.push(option);
        };

        if (event.kind === 'dialog') {
            (event.buttons || []).forEach(pushUnique);
            collectGlobalRemediationControls().forEach(pushUnique);
        } else {
            (event.controls || []).forEach(pushUnique);
            collectGlobalRemediationControls().forEach(pushUnique);
        }

        const score = (opt) => {
            const token = normalizeText(opt.controlName || opt.text || '');
            if (token === 'remove' || token.includes('remove') || token === 'delete' || token.includes('delete')) return -1;
            if (token === 'cancel' || token.includes('cancel')) return 0;
            if (token === 'close' || token.includes('close')) return 1;
            if (token === 'no') return 2;
            if (token.startsWith('messagebar')) return 10;
            return 5;
        };
        return all.sort((a, b) => score(a) - score(b));
    }

    function findEventOptionElement(event, option) {
        const expectedControl = normalizeText(option?.controlName || '');
        const expectedText = normalizeText(option?.text || '');
        const dialogButton = (event.buttons || []).find(btn => {
            const byControl = normalizeText(btn.controlName || '');
            const byText = normalizeText(btn.text || '');
            return (expectedControl && byControl === expectedControl) || (expectedText && byText === expectedText);
        })?.element || null;
        if (dialogButton) return dialogButton;

        const messageControl = (event.controls || []).find(ctrl => {
            const byControl = normalizeText(ctrl.controlName || '');
            const byText = normalizeText(ctrl.text || '');
            return (expectedControl && byControl === expectedControl) || (expectedText && byText === expectedText);
        })?.element || null;
        if (messageControl) return messageControl;

        return findGlobalClickable(option?.controlName || option?.text || '')?.element || null;
    }

    async function requestInterruptionDecision(event) {
        const requestId = `intr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        executionControl.pendingInterruptionDecision = null;
        executionControl.isPaused = true;
        window.postMessage({
            type: 'D365_WORKFLOW_PROGRESS',
            progress: {
                phase: 'pausedForInterruption',
                kind: event.kind,
                message: shortenForLog(event.text, 180),
                stepIndex: executionControl.currentStepIndex
            }
        }, '*');
        window.postMessage({
            type: 'D365_WORKFLOW_INTERRUPTION',
            payload: {
                requestId,
                workflowId: currentWorkflow?.id || '',
                stepIndex: executionControl.currentStepIndex,
                kind: event.kind,
                text: shortenForLog(event.text, 600),
                options: buildInterruptionOptions(event)
            }
        }, '*');

        while (!executionControl.isStopped) {
            const decision = executionControl.pendingInterruptionDecision;
            if (decision && decision.requestId === requestId) {
                executionControl.pendingInterruptionDecision = null;
                executionControl.isPaused = false;
                return decision;
            }
            await sleep(150);
        }
        throw createUserStopError();
    }

    async function applyInterruptionDecision(event, decision) {
        const actionType = decision?.actionType || 'none';
        if (actionType === 'stop') {
            throw createUserStopError();
        }

        let clickedOption = null;
        let clickedFollowupOption = null;
        if (actionType === 'clickOption') {
            const option = decision?.selectedOption || {};
            const element = findEventOptionElement(event, option);
            if (element && typeof element.click === 'function') {
                element.click();
                clickedOption = option;
                await sleep(350);
                const followup = decision?.selectedFollowupOption || null;
                if (followup && normalizeText(followup.controlName || followup.text || '') !== normalizeText(option.controlName || option.text || '')) {
                    const refreshEvents = detectUnexpectedEvents();
                    const followupEvent = refreshEvents[0] || event;
                    const followupElement = findEventOptionElement(followupEvent, followup);
                    if (followupElement && typeof followupElement.click === 'function') {
                        followupElement.click();
                        clickedFollowupOption = followup;
                        await sleep(350);
                    } else {
                        sendLog('warning', `Selected follow-up option not found: ${followup.controlName || followup.text || 'unknown'}`);
                    }
                }
            } else {
                sendLog('warning', `Selected interruption option not found: ${option.controlName || option.text || 'unknown'}`);
            }
        }

        if (decision?.saveRule && clickedOption) {
            const actions = [buildRuleActionFromOption(event, clickedOption)];
            if (clickedFollowupOption) {
                actions.push(buildRuleActionFromOption(event, clickedFollowupOption));
            }
            recordLearnedRule(createRuleFromEvent(event, actions, decision?.outcome || 'next-step', decision?.matchMode || 'contains'));
            sendLog('success', `Learned ${event.kind} handler: ${clickedOption.controlName || clickedOption.text || 'action'}${clickedFollowupOption ? ' -> follow-up' : ''}`);
        }

        const outcome = normalizeFlowOutcome(decision?.outcome || 'next-step');
        if (outcome === 'stop') {
            throw createUserStopError();
        }
        if (outcome === 'continue-loop' || outcome === 'break-loop' || outcome === 'repeat-loop') {
            await waitForFlowTransitionStability();
            return { signal: outcome };
        }
        return { signal: 'none' };
    }

    async function handleUnexpectedEvents(learningMode) {
        const maxDepth = 6;
        for (let depth = 0; depth < maxDepth; depth++) {
            const events = detectUnexpectedEvents();
            if (!events.length) return { signal: 'none' };

            const event = events[0];

            if (isBenignMessageBarEvent(event)) {
                const key = `messageBar|${event.templateText}`;
                if (!acknowledgedMessageBarKeys.has(key)) {
                    sendLog('info', `Ignoring benign message bar: ${shortenForLog(event.text, 120)}`);
                }
                acknowledgedMessageBarKeys.add(key);
                continue;
            }

            // --- Try saved handlers first (works in BOTH modes) ---
            const handler = findMatchingHandler(event);
            if (handler && handler.mode !== 'alwaysAsk') {
                const handled = await applyHandler(event, handler);
                if (handled) {
                    sendLog('info', `Applied learned handler for ${event.kind}: ${shortenForLog(event.text)}`);
                    const handlerOutcome = normalizeFlowOutcome(handler?.outcome || 'next-step');
                    if (handlerOutcome === 'stop') {
                        throw createUserStopError();
                    }
                    if (handlerOutcome === 'continue-loop' || handlerOutcome === 'break-loop' || handlerOutcome === 'repeat-loop') {
                        await waitForFlowTransitionStability();
                        return { signal: handlerOutcome };
                    }
                    // Mark message bar as acknowledged so it doesn't re-trigger if
                    // the bar persists after the handler ran (e.g. close button hidden).
                    if (event.kind === 'messageBar') {
                        acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
                    }
                    continue;
                }
            }

            // --- Non-blocking message bar handling ---
            // Message bars don't block the UI. In learning mode we pause ONCE to
            // let the user decide, then acknowledge the key so it doesn't repeat.
            if (event.kind === 'messageBar') {
                if (learningMode) {
                    sendLog('warning', `Learning mode: message bar detected, decision required: ${shortenForLog(event.text)}`);
                    const decision = await requestInterruptionDecision(event);
                    const result = await applyInterruptionDecision(event, decision);
                    if (result?.signal && result.signal !== 'none') {
                        acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
                        return result;
                    }
                } else {
                    // Non-learning mode: just log once
                    const key = `messageBar|${event.templateText}`;
                    if (!unhandledUnexpectedEventKeys.has(key)) {
                        unhandledUnexpectedEventKeys.add(key);
                        sendLog('warning', `Message bar detected with no handler: ${shortenForLog(event.text)}`);
                    }
                }
                // Mark as acknowledged so it doesn't re-trigger on subsequent steps
                acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
                continue;
            }

            // --- Blocking dialog handling ---
            if (learningMode) {
                sendLog('warning', `Learning mode: dialog requires decision: ${shortenForLog(event.text)}`);
                const decision = await requestInterruptionDecision(event);
                const result = await applyInterruptionDecision(event, decision);
                if (result?.signal && result.signal !== 'none') {
                    return result;
                }
                continue;
            }

            // Non-learning mode with no handler: log once and return
            const key = `${event.kind}|${event.templateText}`;
            if (!unhandledUnexpectedEventKeys.has(key)) {
                unhandledUnexpectedEventKeys.add(key);
                sendLog('warning', `Unexpected ${event.kind} detected with no handler: ${shortenForLog(event.text)}`);
            }
            return { signal: 'none' };
        }
        return { signal: 'none' };
    }

async function executeWorkflow(workflow, data) {
    try {
        // Clear any stale pending navigation state before starting a new run
        try {
            sessionStorage.removeItem('d365_pending_workflow');
            if (workflow?.id) {
                sessionStorage.setItem('d365_active_workflow_id', workflow.id);
            }
        } catch (e) {
            // Ignore sessionStorage errors (e.g., in restricted contexts)
        }

        sendLog('info', `Starting workflow: ${workflow?.name || workflow?.id || 'unnamed'}`);
        window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: { phase: 'workflowStart', workflow: workflow?.name || workflow?.id } }, '*');
        // Reset execution control
        executionControl.isPaused = false;
        executionControl.isStopped = false;
        executionControl.pendingInterruptionDecision = null;
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false, learningMode: false, runUntilInterception: false };
        executionControl.stepIndexOffset = workflow?._originalStartIndex || 0;
        executionControl.currentStepIndex = executionControl.stepIndexOffset;
        unhandledUnexpectedEventKeys.clear();
        acknowledgedMessageBarKeys.clear();
        currentWorkflow = workflow;
        
        // Always refresh original-workflow pointer to avoid stale resume state
        // from a previously executed workflow in the same page context.
        window.d365OriginalWorkflow = workflow?._originalWorkflow || workflow;
        
        currentWorkflowSettings = workflow?.settings || {};
        window.d365CurrentWorkflowSettings = currentWorkflowSettings;
        // Expose current workflow and execution control to injected action modules
        window.d365CurrentWorkflow = currentWorkflow;
        window.d365ExecutionControl = executionControl;
        const steps = workflow.steps;
        
        // Get data from new dataSources structure or legacy dataSource
        let primaryData = [];
        let detailSources = {};
        let relationships = [];
        
        if (workflow.dataSources) {
            primaryData = workflow.dataSources.primary?.data || [];
            relationships = workflow.dataSources.relationships || [];
            
            // Index detail data sources by ID
            (workflow.dataSources.details || []).forEach(detail => {
                if (detail.data) {
                    detailSources[detail.id] = {
                        data: detail.data,
                        name: detail.name,
                        fields: detail.fields
                    };
                }
            });
        } else if (data) {
            // Legacy format
            primaryData = Array.isArray(data) ? data : [data];
        }
        
        // If no data, use a single empty row to run steps once
        if (primaryData.length === 0) {
            primaryData = [{}];
        }

        // Execute workflow with loop support
        await executeStepsWithLoops(steps, primaryData, detailSources, relationships, workflow.settings);

        sendLog('info', `Workflow complete: processed ${primaryData.length} rows`);
        window.postMessage({
            type: 'D365_WORKFLOW_COMPLETE',
            result: { processed: primaryData.length }
        }, '*');
    } catch (error) {
        // Navigation interrupts are not errors - the workflow will resume after page load
        if (error && error.isNavigationInterrupt) {
            sendLog('info', 'Workflow paused for navigation - will resume after page loads');
            return; // Don't report as error or complete
        }
        
        if (!error || !error._reported) {
            sendLog('error', `Workflow error: ${error?.message || String(error)}`);
            window.postMessage({
                type: 'D365_WORKFLOW_ERROR',
                error: error?.message || String(error),
                stack: error?.stack
            }, '*');
        }
    }
}

async function resolveStepValue(step, currentRow) {
    const source = step?.valueSource || (step?.fieldMapping ? 'data' : 'static');

    if (source === 'clipboard') {
        try {
            if (!navigator.clipboard?.readText) {
                throw new Error('Clipboard API not available');
            }
            const text = await navigator.clipboard.readText();
            return text ?? '';
        } catch (error) {
            sendLog('error', `Clipboard read failed: ${error?.message || String(error)}`);
            throw new Error('Clipboard read failed');
        }
    }

    if (source === 'data') {
        const row = currentRow || window.d365ExecutionControl?.currentDataRow || {};
        const field = step?.fieldMapping || '';
        if (!field) return '';
        const value = row[field];
        return value === undefined || value === null ? '' : String(value);
    }

    return step?.value ?? '';
}

// Execute a single step (maps step.type to action functions)
async function executeSingleStep(step, stepIndex, currentRow, detailSources, settings, dryRun, learningMode) {
    executionControl.currentStepIndex = typeof step._absoluteIndex === 'number'
        ? step._absoluteIndex
        : (executionControl.stepIndexOffset || 0) + stepIndex;
    const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
    // Compute absolute step index (already stored on executionControl)
    const absoluteStepIndex = executionControl.currentStepIndex;
    window.postMessage({
        type: 'D365_WORKFLOW_PROGRESS',
        progress: { phase: 'stepStart', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
    }, '*');
    let waitTarget = '';
    let shouldWaitBefore = false;
    let shouldWaitAfter = false;
    try {
        // Normalize step type (allow both camelCase and dash-separated types)
        const stepType = (step.type || '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${absoluteStepIndex + 1}: ${stepType} -> ${stepLabel}`);

        // In learning mode:
        // 1. Check for unexpected events (dialogs/messages) from the previous step.
        //    If one is found the user is paused to handle it, so we skip the
        //    separate confirmation pause to avoid a double-pause.
        // 2. If no interruption was found, pause for step confirmation.
        const runUntilInterception = !!executionControl.runOptions?.runUntilInterception;
        if (learningMode) {
            const interruption = await handleUnexpectedEvents(true);
            if (interruption?.signal && interruption.signal !== 'none') {
                return interruption;
            }

            // Only pause for confirmation if handleUnexpectedEvents didn't
            // already pause (i.e. there were no events to handle).
            if (!runUntilInterception) {
                sendLog('info', `Learning mode: confirm step ${absoluteStepIndex + 1} (${stepLabel}). Resume to continue.`);
                executionControl.isPaused = true;
                window.postMessage({
                    type: 'D365_WORKFLOW_PROGRESS',
                    progress: {
                        phase: 'pausedForConfirmation',
                        stepName: stepLabel,
                        stepIndex: absoluteStepIndex
                    }
                }, '*');
                await checkExecutionControl();
            }
        }

        // Respect dry run mode
        if (dryRun) {
            sendLog('info', `Dry run - skipping action: ${step.type} ${step.controlName || ''}`);
            window.postMessage({
                type: 'D365_WORKFLOW_PROGRESS',
                progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
            }, '*');
            return { signal: 'none' };
        }

        let resolvedValue = null;
        if (['input', 'select', 'lookupSelect', 'gridInput', 'filter', 'queryFilter'].includes(stepType)) {
            resolvedValue = await resolveStepValue(step, currentRow);
        }

        waitTarget = step.waitTargetControlName || step.controlName || '';
        shouldWaitBefore = !!step.waitUntilVisible;
        shouldWaitAfter = !!step.waitUntilHidden;

        if ((shouldWaitBefore || shouldWaitAfter) && !waitTarget) {
            sendLog('warning', `Wait option set but no control name on step ${absoluteStepIndex + 1}`);
        }

        if (shouldWaitBefore && waitTarget) {
            await waitUntilCondition(waitTarget, 'visible', null, 5000);
        }

        switch (stepType) {
            case 'click':
                await clickElement(step.controlName);
                break;

            case 'input':
            case 'select':
                await setInputValue(step.controlName, resolvedValue, step.fieldType);
                break;

            case 'lookupSelect':
                await setLookupSelectValue(step.controlName, resolvedValue);
                break;

            case 'checkbox':
                await setCheckboxValue(step.controlName, coerceBoolean(step.value));
                break;

            case 'gridInput':
                await setGridCellValue(step.controlName, resolvedValue, step.fieldType, !!step.waitForValidation);
                break;

            case 'filter':
                await applyGridFilter(step.controlName, resolvedValue, step.filterMethod || 'is exactly');
                break;
            case 'queryFilter':
                await configureQueryFilter(step.tableName, step.fieldName, resolvedValue, {
                    savedQuery: step.savedQuery,
                    closeDialogAfter: step.closeDialogAfter
                });
                break;

            case 'wait':
                await sleep(Number(step.duration) || 500);
                break;

            case 'waitUntil':
                await waitUntilCondition(
                    step.controlName,
                    step.waitCondition || 'visible',
                    step.waitValue,
                    step.timeout || 10000
                );
                break;

            case 'navigate':
                await navigateToForm(step);
                break;

            case 'activateTab':
                await activateTab(step.controlName);
                break;
            case 'tabNavigate':
                await activateTab(step.controlName);
                break;
            case 'actionPaneTab':
                await activateActionPaneTab(step.controlName);
                break;

            case 'expandSection':
                await expandOrCollapseSection(step.controlName, 'expand');
                break;

            case 'collapseSection':
                await expandOrCollapseSection(step.controlName, 'collapse');
                break;

            case 'closeDialog':
                await closeDialog();
                break;

            default:
                throw new Error(`Unsupported step type: ${step.type}`);
        }

        if (shouldWaitAfter && waitTarget) {
            await waitUntilCondition(waitTarget, 'hidden', null, 5000);
        }

        const postInterruption = await handleUnexpectedEvents(learningMode);
        if (postInterruption?.signal && postInterruption.signal !== 'none') {
            return postInterruption;
        }

        window.postMessage({
            type: 'D365_WORKFLOW_PROGRESS',
            progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
        }, '*');
        const pendingSignal = consumePendingFlowSignal();
        return { signal: pendingSignal };
    } catch (err) {
        // Re-throw navigation interrupts for upstream handling
        if (err && err.isNavigationInterrupt) throw err;

        // Learning-mode recovery path: if a dialog/message appeared during the step,
        // handle it first, then re-check post-action wait condition once.
        if (learningMode && !err?.isUserStop) {
            const pending = detectUnexpectedEvents();
            if (pending.length) {
                sendLog('warning', `Learning mode: interruption detected during step ${absoluteStepIndex + 1}. Asking for handling...`);
                await handleUnexpectedEvents(true);
                if (shouldWaitAfter && waitTarget) {
                    try {
                        await waitUntilCondition(waitTarget, 'hidden', null, 2500);
                        window.postMessage({
                            type: 'D365_WORKFLOW_PROGRESS',
                            progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
                        }, '*');
                        const pendingSignal = consumePendingFlowSignal();
                        return { signal: pendingSignal };
                    } catch (_) {
                        sendLog('warning', `Learning mode override: continuing even though "${waitTarget}" is still visible after interruption handling.`);
                        window.postMessage({
                            type: 'D365_WORKFLOW_PROGRESS',
                            progress: { phase: 'stepDone', stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
                        }, '*');
                        const pendingSignal = consumePendingFlowSignal();
                        return { signal: pendingSignal };
                    }
                }
            }
        }

        sendLog('error', `Error executing step ${absoluteStepIndex + 1}: ${err?.message || String(err)}`);
        throw err;
    }
}
async function executeStepsWithLoops(steps, primaryData, detailSources, relationships, settings) {
    // Apply skip/limit rows from run options
    const { skipRows = 0, limitRows = 0, dryRun = false, learningMode = false } = executionControl.runOptions;
    
    const originalTotalRows = primaryData.length;
    let startRowNumber = 0; // The starting row number for display
    
    if (skipRows > 0) {
        primaryData = primaryData.slice(skipRows);
        startRowNumber = skipRows;
        sendLog('info', `Skipped first ${skipRows} rows`);
    }
    
    if (limitRows > 0 && primaryData.length > limitRows) {
        primaryData = primaryData.slice(0, limitRows);
        sendLog('info', `Limited to ${limitRows} rows`);
    }
    
    const totalRowsToProcess = primaryData.length;
    executionControl.totalRows = originalTotalRows;
    
    // Find loop structures
    const loopPairs = findLoopPairs(steps, (message) => sendLog('error', message));
    const ifPairs = findIfPairs(steps, (message) => sendLog('error', message));
    const labelMap = new Map();
    steps.forEach((step, index) => {
        if (step?.type === 'label' && step.labelName) {
            labelMap.set(step.labelName, index);
        }
    });

    // If no loops, execute all steps for each primary data row (legacy behavior)
    if (loopPairs.length === 0) {
        for (let rowIndex = 0; rowIndex < primaryData.length; rowIndex++) {
            await checkExecutionControl(); // Check for pause/stop

            const row = primaryData[rowIndex];
            const displayRowNumber = startRowNumber + rowIndex; // Actual row number in original data
            executionControl.currentRowIndex = displayRowNumber;
            executionControl.currentDataRow = row;

            const rowProgress = {
                phase: 'rowStart',
                row: displayRowNumber,
                totalRows: originalTotalRows,
                processedRows: rowIndex + 1,
                totalToProcess: totalRowsToProcess,
                step: 'Processing row'
            };
            sendLog('info', `Processing row ${displayRowNumber + 1}/${originalTotalRows}`);
            window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: rowProgress }, '*');

            const result = await executeRange(0, steps.length, row);
            if (result?.signal === 'break-loop' || result?.signal === 'continue-loop' || result?.signal === 'repeat-loop') {
                throw new Error('Loop control signal used outside of a loop');
            }
        }
        return;
    }

    const loopPairMap = new Map(loopPairs.map(pair => [pair.startIndex, pair.endIndex]));
    const initialDataRow = primaryData[0] || {};

    const resolveLoopData = (loopDataSource, currentDataRow) => {
        let loopData = primaryData;

        if (loopDataSource !== 'primary' && detailSources[loopDataSource]) {
            const detailSource = detailSources[loopDataSource];
            const relationsForDetail = (relationships || []).filter(r => r.detailId === loopDataSource);
            if (!relationsForDetail.length) {
                loopData = detailSource.data;
                return loopData;
            }

            const loopStack = Array.isArray(currentDataRow?.__d365_loop_stack)
                ? currentDataRow.__d365_loop_stack
                : [];
            const parentLoopSourceId = loopStack.length ? loopStack[loopStack.length - 1] : '';
            if (!parentLoopSourceId) {
                // Top-level loop: do not apply relationship filtering.
                loopData = detailSource.data;
                return loopData;
            }

            const parentScopedRelations = relationsForDetail.filter(rel => (rel.parentSourceId || '') === parentLoopSourceId);
            const candidateRelations = parentScopedRelations.length ? parentScopedRelations : relationsForDetail;

            const resolveParentValue = (rel, pair) => {
                const explicitKey = rel?.parentSourceId ? `${rel.parentSourceId}:${pair.primaryField}` : '';
                if (explicitKey) {
                    const explicitValue = currentDataRow?.[explicitKey];
                    if (explicitValue !== undefined && explicitValue !== null && String(explicitValue) !== '') {
                        return explicitValue;
                    }
                }
                const fallbackValue = currentDataRow?.[pair.primaryField];
                if (fallbackValue !== undefined && fallbackValue !== null && String(fallbackValue) !== '') {
                    return fallbackValue;
                }
                return undefined;
            };

            const selectedRelation = candidateRelations.find((rel) => {
                const fieldMappings = Array.isArray(rel?.fieldMappings) && rel.fieldMappings.length
                    ? rel.fieldMappings
                    : (rel?.primaryField && rel?.detailField
                        ? [{ primaryField: rel.primaryField, detailField: rel.detailField }]
                    : []);
                if (!fieldMappings.length) return false;
                return fieldMappings.every((pair) => resolveParentValue(rel, pair) !== undefined);
            }) || null;

            if (!selectedRelation) {
                sendLog('warning', `Relationship filter for ${loopDataSource} could not resolve parent values. Loop will process 0 rows.`);
                loopData = [];
                return loopData;
            }

            const selectedMappings = Array.isArray(selectedRelation.fieldMappings) && selectedRelation.fieldMappings.length
                ? selectedRelation.fieldMappings
                : [{ primaryField: selectedRelation.primaryField, detailField: selectedRelation.detailField }];

            loopData = detailSource.data.filter((detailRow) => selectedMappings.every((pair) => {
                const parentValue = resolveParentValue(selectedRelation, pair);
                const childValue = detailRow?.[pair.detailField];
                if (parentValue === undefined) return false;
                if (childValue === undefined || childValue === null) return false;
                return String(childValue) === String(parentValue);
            }));
        }

        return loopData;
    };

    async function executeStepWithHandling(step, stepIndex, currentDataRow) {
        const { mode, retryCount, retryDelay, gotoLabel } = getStepErrorConfig(step, settings);
        let attempt = 0;

        while (true) {
            try {
                const stepResult = await executeSingleStep(step, stepIndex, currentDataRow, detailSources, settings, dryRun, learningMode);
                if (stepResult?.signal && stepResult.signal !== 'none') {
                    consumePendingFlowSignal();
                    return { signal: stepResult.signal };
                }
                const pendingSignal = consumePendingFlowSignal();
                if (pendingSignal !== 'none') {
                    return { signal: pendingSignal };
                }
                return { signal: 'none' };
            } catch (err) {
                if (err && err.isNavigationInterrupt) throw err;
                if (err && (err.isUserStop || err.noRetry)) throw err;

                if (retryCount > 0 && attempt < retryCount) {
                    attempt += 1;
                    sendLog('warning', `Retrying step ${stepIndex + 1} (${attempt}/${retryCount}) after error: ${err?.message || String(err)}`);
                    if (retryDelay > 0) {
                        await sleep(retryDelay);
                    }
                    continue;
                }

                switch (mode) {
                    case 'skip':
                        return { signal: 'skip' };
                    case 'goto':
                        return { signal: 'goto', label: gotoLabel };
                    case 'break-loop':
                        return { signal: 'break-loop' };
                    case 'continue-loop':
                        return { signal: 'continue-loop' };
                    case 'repeat-loop':
                        return { signal: 'repeat-loop' };
                    case 'fail':
                    default:
                        throw err;
                }
            }
        }
    }

    async function executeRange(startIdx, endIdx, currentDataRow) {
        if (currentDataRow) {
            executionControl.currentDataRow = currentDataRow;
        }
        let idx = startIdx;

        while (idx < endIdx) {
            await checkExecutionControl(); // Check for pause/stop

            const step = steps[idx];

            if (step.type === 'label') {
                idx++;
                continue;
            }

            if (step.type === 'goto') {
                const targetIndex = labelMap.get(step.gotoLabel);
                if (targetIndex === undefined) {
                    throw new Error(`Goto label not found: ${step.gotoLabel || ''}`);
                }
                if (targetIndex < startIdx || targetIndex >= endIdx) {
                    return { signal: 'goto', targetIndex };
                }
                idx = targetIndex;
                continue;
            }

            if (step.type === 'if-start') {
                const conditionMet = evaluateCondition(step, currentDataRow, {
                    findElementInActiveContext,
                    isElementVisible
                });
                const endIndex = ifPairs.ifToEnd.get(idx);
                const elseIndex = ifPairs.ifToElse.get(idx);
                if (endIndex === undefined) {
                    throw new Error(`If-start at index ${idx} has no matching if-end`);
                }

                if (conditionMet) {
                    idx++;
                    continue;
                }

                if (elseIndex !== undefined) {
                    idx = elseIndex + 1;
                } else {
                    idx = endIndex + 1;
                }
                continue;
            }

            if (step.type === 'else') {
                const endIndex = ifPairs.elseToEnd.get(idx);
                if (endIndex !== undefined) {
                    idx = endIndex + 1;
                } else {
                    idx++;
                }
                continue;
            }

            if (step.type === 'if-end') {
                idx++;
                continue;
            }

            if (step.type === 'continue-loop') {
                return { signal: 'continue-loop' };
            }

            if (step.type === 'repeat-loop') {
                return { signal: 'repeat-loop' };
            }

            if (step.type === 'break-loop') {
                return { signal: 'break-loop' };
            }

            if (step.type === 'loop-start') {
                const loopEndIdx = loopPairMap.get(idx);
                if (loopEndIdx === undefined || loopEndIdx <= idx) {
                    throw new Error(`Loop start at index ${idx} has no matching end`);
                }

                const loopMode = step.loopMode || 'data';

                if (loopMode === 'count') {
                    const loopCount = Number(step.loopCount) || 0;
                    sendLog('info', `Entering loop: ${step.loopName || 'Loop'} (count=${loopCount})`);
                    for (let iterIndex = 0; iterIndex < loopCount; iterIndex++) {
                        await checkExecutionControl();
                        window.postMessage({
                            type: 'D365_WORKFLOW_PROGRESS',
                            progress: { phase: 'loopIteration', iteration: iterIndex + 1, total: loopCount, step: `Loop "${step.loopName || 'Loop'}": iteration ${iterIndex + 1}/${loopCount}` }
                        }, '*');

                        const result = await executeRange(idx + 1, loopEndIdx, currentDataRow);
                        if (result?.signal === 'break-loop') break;
                        if (result?.signal === 'continue-loop') continue;
                        if (result?.signal === 'repeat-loop') {
                            iterIndex = Math.max(-1, iterIndex - 1);
                            continue;
                        }
                        if (result?.signal === 'goto') return result;
                    }

                    idx = loopEndIdx + 1;
                    continue;
                }

                if (loopMode === 'while') {
                    const maxIterations = Number(step.loopMaxIterations) || 100;
                    let iterIndex = 0;
                    while (iterIndex < maxIterations) {
                        await checkExecutionControl();
                        if (!evaluateCondition(step, currentDataRow, {
                            findElementInActiveContext,
                            isElementVisible
                        })) break;

                        window.postMessage({
                            type: 'D365_WORKFLOW_PROGRESS',
                            progress: { phase: 'loopIteration', iteration: iterIndex + 1, total: maxIterations, step: `Loop "${step.loopName || 'Loop'}": iteration ${iterIndex + 1}/${maxIterations}` }
                        }, '*');

                        const result = await executeRange(idx + 1, loopEndIdx, currentDataRow);
                        if (result?.signal === 'break-loop') break;
                        if (result?.signal === 'continue-loop') {
                            iterIndex++;
                            continue;
                        }
                        if (result?.signal === 'repeat-loop') {
                            continue;
                        }
                        if (result?.signal === 'goto') return result;

                        iterIndex++;
                    }

                    if (iterIndex >= maxIterations) {
                        sendLog('warning', `Loop "${step.loopName || 'Loop'}" hit max iterations (${maxIterations})`);
                    }

                    idx = loopEndIdx + 1;
                    continue;
                }

                const loopDataSource = step.loopDataSource || 'primary';
                let loopData = resolveLoopData(loopDataSource, currentDataRow);

                // Apply iteration limit
                const iterationLimit = step.iterationLimit || 0;
                if (iterationLimit > 0 && loopData.length > iterationLimit) {
                    loopData = loopData.slice(0, iterationLimit);
                }

                sendLog('info', `Entering loop: ${step.loopName || 'Loop'} (source=${loopDataSource}) - ${loopData.length} iterations`);
                for (let iterIndex = 0; iterIndex < loopData.length; iterIndex++) {
                    await checkExecutionControl(); // Check for pause/stop

                    const iterSourceRow = loopData[iterIndex] || {};
                    const iterRow = { ...currentDataRow, ...iterSourceRow };
                    const parentStack = Array.isArray(currentDataRow?.__d365_loop_stack)
                        ? currentDataRow.__d365_loop_stack
                        : [];
                    iterRow.__d365_loop_stack = [...parentStack, loopDataSource];
                    if (loopDataSource !== 'primary') {
                        Object.entries(iterSourceRow).forEach(([field, value]) => {
                            iterRow[`${loopDataSource}:${field}`] = value;
                        });
                    }
                    const isPrimaryLoop = loopDataSource === 'primary';
                    const totalRowsForLoop = isPrimaryLoop ? originalTotalRows : loopData.length;
                    const totalToProcessForLoop = loopData.length;
                    const displayRowNumber = isPrimaryLoop ? startRowNumber + iterIndex : iterIndex;

                    const loopRowProgress = {
                        phase: 'rowStart',
                        row: displayRowNumber,
                        totalRows: totalRowsForLoop,
                        processedRows: iterIndex + 1,
                        totalToProcess: totalToProcessForLoop,
                        step: 'Processing row'
                    };
                    sendLog('info', `Loop iteration ${iterIndex + 1}/${loopData.length} for loop ${step.loopName || 'Loop'}`);
                    window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: loopRowProgress }, '*');

                    window.postMessage({ type: 'D365_WORKFLOW_PROGRESS', progress: { phase: 'loopIteration', iteration: iterIndex + 1, total: loopData.length, step: `Loop "${step.loopName || 'Loop'}": iteration ${iterIndex + 1}/${loopData.length}` } }, '*');

                    // Execute steps inside the loop (supports nested loops)
                    const result = await executeRange(idx + 1, loopEndIdx, iterRow);
                    if (result?.signal === 'break-loop') break;
                    if (result?.signal === 'continue-loop') continue;
                    if (result?.signal === 'repeat-loop') {
                        iterIndex = Math.max(-1, iterIndex - 1);
                        continue;
                    }
                    if (result?.signal === 'goto') return result;
                }

                idx = loopEndIdx + 1;
                continue;
            }

            if (step.type === 'loop-end') {
                idx++;
                continue;
            }

            const result = await executeStepWithHandling(step, idx, currentDataRow);
            if (result?.signal === 'skip' || result?.signal === 'none') {
                idx++;
                continue;
            }
            if (result?.signal === 'goto') {
                const targetIndex = labelMap.get(result.label);
                if (targetIndex === undefined) {
                    throw new Error(`Goto label not found: ${result.label || ''}`);
                }
                if (targetIndex < startIdx || targetIndex >= endIdx) {
                    return { signal: 'goto', targetIndex };
                }
                idx = targetIndex;
                continue;
            }
            if (result?.signal === 'break-loop' || result?.signal === 'continue-loop' || result?.signal === 'repeat-loop') {
                return result;
            }
            idx++;
        }
        return { signal: 'none' };
    }

    const finalResult = await executeRange(0, steps.length, initialDataRow);
    if (finalResult?.signal === 'break-loop' || finalResult?.signal === 'continue-loop' || finalResult?.signal === 'repeat-loop') {
        throw new Error('Loop control signal used outside of a loop');
    }
}

    return { started: true };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    startInjected({ windowObj: window, documentObj: document });
}
