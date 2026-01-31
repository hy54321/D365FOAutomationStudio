import { coreMethods } from './modules/core.js';
import { executionMethods } from './modules/execution.js';
import { logsMethods } from './modules/logs.js';
import { runOptionsMethods } from './modules/run-options.js';
import { workflowMethods } from './modules/workflows.js';
import { stepMethods } from './modules/steps.js';
import { dataSourceMethods } from './modules/data-sources.js';
import { inspectorMethods } from './modules/inspector.js';
import { settingsMethods } from './modules/settings.js';
import { xmlImportMethods } from './modules/xml-import.js';

class PopupController {
    constructor() {
        this.currentWorkflow = null;
        this.currentStep = null;
        this.workflows = [];
        this.discoveredElements = [];
        this.settings = this.loadSettings();
        this.linkedTabId = null;
        this.originalWorkflowState = null; // For cancel functionality
        this.autoSaveTimeout = null;

        // Data sources management
        this.dataSources = {
            primary: { type: 'none', data: null, fields: [] },
            details: [], // Array of { id, name, type, data, fields, linkedTo, linkFields }
            relationships: [] // Array of { detailId, primaryField, detailField }
        };

        // Execution state
        this.executionState = {
            isRunning: false,
            isPaused: false,
            currentWorkflowId: null,
            currentStepIndex: 0,
            totalSteps: 0,
            currentRow: 0,
            totalRows: 0,
            runOptions: {
                skipRows: 0,
                limitRows: 0,
                dryRun: false,
                showLogs: false
            }
        };

        // Logs
        this.logs = [];
        this.resumeSkipByWorkflow = {};
        this.lastRunOptionsByWorkflow = {};
        this.lastFailureInfo = null;

        this.init();
    }
}

Object.assign(
    PopupController.prototype,
    coreMethods,
    executionMethods,
    logsMethods,
    runOptionsMethods,
    workflowMethods,
    stepMethods,
    dataSourceMethods,
    inspectorMethods,
    settingsMethods,
    xmlImportMethods
);

export { PopupController };
