/**
 * CSPro WASM Service - Server-side WASM execution with JSPI support
 * 
 * This module loads and manages the CSPro WASM module on the server,
 * allowing browsers without JSPI support to use CSPro functionality
 * via standard HTTP REST API calls.
 * 
 * The CSPro WASM module uses Embind, exposing a CSProEngine class with methods:
 *   - initApplication(pffPath): boolean
 *   - start(): boolean
 *   - getCurrentPage(): object
 *   - setFieldValueAndAdvance(value): object
 *   - previousField(): object
 *   - endGroup(): object
 *   - getFormData(): object
 *   - getQuestionText(): object
 *   - etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CSProWasmService {
    constructor() {
        this.Module = null;
        this.isInitialized = false;
        this.sessions = new Map(); // Track multiple entry sessions (each has its own CSProEngine)
        this.wasmPath = path.join(__dirname, 'web');
    }

    /**
     * Initialize the WASM module
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        console.log('[CSProWasmService] Initializing WASM module...');
        
        // Initialize pending dialogs queue for each session
        this.pendingDialogs = new Map();

        try {
            // Set up server-side dialog handler BEFORE loading WASM
            // This is needed because CSPro.js will call jspi_showDialog which looks for window.CSProDialogHandler
            // In Node.js there's no window, so we use globalThis
            const self = this;
            globalThis.CSProDialogHandler = {
                showDialogAsync: async (dialogName, inputDataJson) => {
                    console.log(`[CSProWasmService] Server-side dialog: ${dialogName}`);
                    console.log(`[CSProWasmService] Dialog input:`, inputDataJson);
                    
                    // Parse the input data
                    let inputData = {};
                    try {
                        inputData = typeof inputDataJson === 'string' ? JSON.parse(inputDataJson) : inputDataJson;
                    } catch (e) {
                        console.warn('[CSProWasmService] Could not parse dialog input:', e);
                    }
                    
                    // Store dialog info for client display (informational)
                    const dialogInfo = {
                        dialogName,
                        inputData,
                        timestamp: Date.now(),
                        autoAcknowledged: true
                    };
                    
                    // Add to pending dialogs for the current session
                    // Note: We don't have session context here, so store globally
                    // This will be retrieved by the next API response
                    if (!self._lastDialogs) self._lastDialogs = [];
                    self._lastDialogs.push(dialogInfo);
                    // Keep only last 10 dialogs
                    if (self._lastDialogs.length > 10) {
                        self._lastDialogs.shift();
                    }
                    
                    // Handle errmsg dialogs - just acknowledge them server-side
                    // The actual display will happen on the client
                    // WASM expects { index: N } directly (extracted from CS.UI.closeDialog({ result: { index: N } }))
                    if (dialogName === 'errmsg') {
                        console.log(`[CSProWasmService] Error message: ${inputData.message}`);
                        // Return index 1 (OK button) - matches errmsg.html format
                        return JSON.stringify({ index: 1 });
                    }
                    
                    // Handle select dialogs (value set selection)
                    if (dialogName === 'select') {
                        console.log(`[CSProWasmService] Select dialog - storing for client`);
                        // Return empty/cancel - the client will handle the actual selection
                        return JSON.stringify({ cancelled: true });
                    }
                    
                    // For other dialogs, return a default response
                    return JSON.stringify({ index: 1 });
                }
            };
            
            // Also set on global for compatibility
            global.CSProDialogHandler = globalThis.CSProDialogHandler;
            
            // Load the CSPro.js module
            const csproJsPath = path.join(this.wasmPath, 'CSPro.js');
            
            // Create a module configuration
            const moduleConfig = {
                locateFile: (filename) => {
                    return path.join(this.wasmPath, filename);
                },
                print: (text) => {
                    console.log('[WASM]', text);
                },
                printErr: (text) => {
                    console.error('[WASM Error]', text);
                },
                // Pre-loaded file system for applications
                preRun: [],
                postRun: []
            };

            // Dynamic import for ESM module (use file:// URL for Windows compatibility)
            const csproModuleUrl = 'file:///' + csproJsPath.replace(/\\/g, '/');
            const csproModule = await import(csproModuleUrl);
            const createModule = csproModule.default;
            
            // Initialize the module (this returns a promise with JSPI)
            this.Module = await createModule(moduleConfig);
            
            this.isInitialized = true;
            console.log('[CSProWasmService] WASM module initialized successfully');
            
            // Verify CSProEngine class is available
            if (this.Module.CSProEngine) {
                console.log('[CSProWasmService] CSProEngine class available via Embind');
            } else {
                console.warn('[CSProWasmService] CSProEngine class NOT found - check Embind bindings');
            }
            
            return true;
        } catch (error) {
            console.error('[CSProWasmService] Failed to initialize WASM:', error);
            throw error;
        }
    }

    /**
     * Create a new entry session with its own CSProEngine instance
     */
    createSession(sessionId) {
        if (!this.isInitialized) {
            throw new Error('WASM module not initialized');
        }

        console.log(`[CSProWasmService] Creating session: ${sessionId}`);

        // Create a new CSProEngine instance for this session
        let engine;
        try {
            console.log('[CSProWasmService] Creating CSProEngine instance...');
            engine = new this.Module.CSProEngine();
            console.log('[CSProWasmService] CSProEngine instance created:', typeof engine);
            console.log('[CSProWasmService] Engine methods:', Object.keys(engine.__proto__ || {}).slice(0, 10));
        } catch (err) {
            console.error('[CSProWasmService] Failed to create CSProEngine:', err);
            throw err;
        }
        
        // Note: With JSPI, Embind methods are already properly handled by the runtime
        // WebAssembly.promising is for raw exports, not Embind methods
        // So we don't need to wrap them - just use the engine directly
        
        const session = {
            id: sessionId,
            engine: engine,  // Use engine directly - Embind handles JSPI
            rawEngine: engine,
            applicationLoaded: false,
            entryStarted: false,
            createdAt: Date.now()
        };

        this.sessions.set(sessionId, session);
        console.log(`[CSProWasmService] Session created successfully: ${sessionId}`);
        
        return session;
    }
    
    /**
     * Wrap CSProEngine methods with WebAssembly.promising for JSPI
     * This enables proper async/await support for methods that may suspend
     */
    _wrapEngineForJSPI(engine) {
        const methodsToWrap = [
            'initApplication',
            'start',
            'getCurrentPage',
            'nextField',
            'previousField',
            'setFieldValue',
            'setFieldValueAndAdvance',
            'endGroup',
            'endLevel',
            'endLevelOcc',
            'getFormData',
            'getQuestionText',
            'getCaseTree',
            'onStop',
            'partialSave'
        ];
        
        const wrapped = {};
        
        for (const methodName of methodsToWrap) {
            const original = engine[methodName];
            if (typeof original === 'function') {
                // Bind the method to the engine instance
                const bound = original.bind(engine);
                
                // Wrap with WebAssembly.promising if available (for JSPI support)
                if (typeof WebAssembly.promising === 'function') {
                    wrapped[methodName] = WebAssembly.promising(bound);
                    console.log(`[CSProWasmService] Wrapped ${methodName} with WebAssembly.promising`);
                } else {
                    // Fallback - just use the bound method
                    wrapped[methodName] = bound;
                }
            }
        }
        
        // Return a proxy that uses wrapped methods where available
        return new Proxy(engine, {
            get(target, prop) {
                if (wrapped[prop]) {
                    return wrapped[prop];
                }
                const value = target[prop];
                if (typeof value === 'function') {
                    return value.bind(target);
                }
                return value;
            }
        });
    }

    /**
     * Get an existing session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Load an application for a session (files provided via request)
     */
    async loadApplication(sessionId, pffContent, applicationFiles) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        try {
            // Write files to WASM filesystem
            const FS = this.Module.FS;
            const appDir = `/sessions/${sessionId}`;
            
            // Create session directory
            this._ensureDirectory(FS, appDir);

            // Write all application files
            for (const [filename, content] of Object.entries(applicationFiles)) {
                const filePath = `${appDir}/${filename}`;
                this._ensureDirectory(FS, path.dirname(filePath).replace(/\\/g, '/'));
                
                if (typeof content === 'string') {
                    FS.writeFile(filePath, content);
                } else if (content && content.type === 'binary') {
                    // Decode base64 binary content
                    const binaryData = Buffer.from(content.data, 'base64');
                    FS.writeFile(filePath, new Uint8Array(binaryData));
                } else {
                    // Binary content (Uint8Array)
                    FS.writeFile(filePath, content);
                }
                console.log(`[CSProWasmService] Wrote file: ${filePath}`);
            }

            // Write PFF content
            const pffPath = `${appDir}/application.pff`;
            FS.writeFile(pffPath, pffContent);

            // Use Embind CSProEngine.initApplication()
            const result = session.engine.initApplication(pffPath);
            
            session.applicationLoaded = result;
            session.appDir = appDir;
            
            return {
                success: session.applicationLoaded,
                error: session.applicationLoaded ? null : 'Failed to load application'
            };
        } catch (error) {
            console.error(`[CSProWasmService] loadApplication error:`, error);
            throw error;
        }
    }

    /**
     * Load an embedded application (bundled in WASM assets)
     * The PFF path points to a file in the WASM virtual filesystem
     */
    async loadEmbeddedApplication(sessionId, pffPath) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        try {
            console.log(`[CSProWasmService] Loading embedded application: ${pffPath}`);
            
            // Use Embind CSProEngine.initApplication()
            // With JSPI, this may be an async function that returns a promise
            let result;
            const initResult = session.engine.initApplication(pffPath);
            
            // Check if it's a promise (JSPI-wrapped function)
            if (initResult && typeof initResult.then === 'function') {
                console.log(`[CSProWasmService] initApplication returned a promise, awaiting...`);
                result = await initResult;
            } else {
                result = initResult;
            }
            
            session.applicationLoaded = result;
            session.appDir = pffPath.substring(0, pffPath.lastIndexOf('/'));
            
            console.log(`[CSProWasmService] initApplication returned: ${result}`);
            
            return {
                success: session.applicationLoaded,
                error: session.applicationLoaded ? null : 'Failed to load embedded application'
            };
        } catch (error) {
            console.error(`[CSProWasmService] loadEmbeddedApplication error:`, error);
            throw error;
        }
    }

    /**
     * Start data entry for a session
     */
    async startEntry(sessionId, mode = 'add') {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        if (!session.applicationLoaded) {
            throw new Error('Application not loaded');
        }

        try {
            // Use Embind CSProEngine.start()
            // With JSPI, this is now marked async() and returns a Promise
            const startResult = session.engine.start();
            let result;
            if (startResult && typeof startResult.then === 'function') {
                console.log(`[CSProWasmService] start() returned a promise, awaiting...`);
                result = await startResult;
            } else {
                result = startResult;
            }
            
            session.entryStarted = result;
            
            return {
                success: session.entryStarted,
                error: session.entryStarted ? null : 'Failed to start entry'
            };
        } catch (error) {
            console.error(`[CSProWasmService] startEntry error:`, error);
            throw error;
        }
    }

    /**
     * Get current page state
     */
    async getCurrentPage(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.getCurrentPage() - returns JS object directly
            const page = session.engine.getCurrentPage();
            return page;
        } catch (error) {
            console.error(`[CSProWasmService] getCurrentPage error:`, error);
            throw error;
        }
    }

    /**
     * Get and clear pending dialogs (dialogs that were auto-acknowledged)
     * @returns {Array} Array of dialog info objects
     */
    getAndClearPendingDialogs() {
        const dialogs = this._lastDialogs || [];
        this._lastDialogs = [];
        return dialogs;
    }

    /**
     * Advance to next field with value
     */
    async advanceField(sessionId, value) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            const valueStr = value !== undefined && value !== null ? String(value) : '';
            
            // Clear pending dialogs before operation
            this._lastDialogs = [];
            
            // Use Embind CSProEngine.setFieldValueAndAdvance()
            const result = session.engine.setFieldValueAndAdvance(valueStr);
            
            // Get any dialogs that were shown during the operation
            const pendingDialogs = this.getAndClearPendingDialogs();
            
            return { 
                success: true, 
                page: result,
                dialogs: pendingDialogs
            };
        } catch (error) {
            console.error(`[CSProWasmService] advanceField error:`, error);
            throw error;
        }
    }

    /**
     * Move back to previous field
     */
    async previousField(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.previousField()
            const result = session.engine.previousField();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] previousField error:`, error);
            throw error;
        }
    }

    /**
     * Get form data (application structure)
     */
    async getFormData(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.applicationLoaded) {
            throw new Error('Application not loaded');
        }

        try {
            // Use Embind CSProEngine.getFormData()
            const formData = session.engine.getFormData();
            return formData;
        } catch (error) {
            console.error(`[CSProWasmService] getFormData error:`, error);
            throw error;
        }
    }

    /**
     * Get question text for current field
     */
    async getQuestionText(sessionId, fieldName) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.getQuestionText()
            const result = session.engine.getQuestionText();
            return result || { questionText: '' };
        } catch (error) {
            console.error(`[CSProWasmService] getQuestionText error:`, error);
            throw error;
        }
    }

    /**
     * Get responses/value set for current field (from getCurrentPage)
     */
    async getResponses(sessionId, fieldName) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Responses are included in getCurrentPage
            const page = session.engine.getCurrentPage();
            if (page && page.fields && page.fields.length > 0) {
                return page.fields[0].responses || [];
            }
            return [];
        } catch (error) {
            console.error(`[CSProWasmService] getResponses error:`, error);
            throw error;
        }
    }

    /**
     * Stop entry
     */
    async stopEntry(sessionId, save = true) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        try {
            // Use Embind CSProEngine.onStop()
            session.engine.onStop();
            session.entryStarted = false;
            
            return { success: true };
        } catch (error) {
            console.error(`[CSProWasmService] stopEntry error:`, error);
            throw error;
        }
    }

    /**
     * End group
     */
    async endGroup(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.endGroup()
            const result = session.engine.endGroup();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] endGroup error:`, error);
            throw error;
        }
    }

    /**
     * End level
     */
    async endLevel(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.endLevel()
            const result = session.engine.endLevel();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] endLevel error:`, error);
            throw error;
        }
    }

    /**
     * End level occurrence - finish the current occurrence of a repeating group/level
     * Maps to MFC C_EndLevelOcc() / Embind CSProEngine.endLevelOcc()
     */
    async endLevelOcc(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.endLevelOcc()
            const result = session.engine.endLevelOcc();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] endLevelOcc error:`, error);
            throw error;
        }
    }

    /**
     * End roster/repeating form - finish the current roster
     * Alias for endGroup for roster-specific operations
     * Maps to MFC C_EndGroup() for roster context
     */
    async endRoster(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.endGroup() - roster end uses same engine call
            const result = session.engine.endGroup();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] endRoster error:`, error);
            throw error;
        }
    }

    /**
     * Insert occurrence in a roster/repeating group
     * Maps to MFC C_InsertOcc() / Embind CSProEngine.insertOcc()
     */
    async insertOcc(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.insertOcc()
            const result = session.engine.insertOcc();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] insertOcc error:`, error);
            throw error;
        }
    }

    /**
     * Delete occurrence from a roster/repeating group
     * Maps to MFC C_DeleteOcc() / Embind CSProEngine.deleteOcc()
     */
    async deleteOcc(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.deleteOcc()
            const result = session.engine.deleteOcc();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] deleteOcc error:`, error);
            throw error;
        }
    }

    /**
     * Sort occurrences in a roster/repeating group
     * Maps to MFC C_SortOcc() / Embind CSProEngine.sortOcc()
     */
    async sortOcc(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.sortOcc()
            const result = session.engine.sortOcc();
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] sortOcc error:`, error);
            throw error;
        }
    }

    /**
     * Go to a specific field by name
     * Maps to MFC C_MoveToField() / Embind CSProEngine.goToField()
     * @param {string} fieldName - The name of the field to navigate to
     */
    async goToField(sessionId, fieldName) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.goToField()
            const result = session.engine.goToField(fieldName);
            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] goToField error:`, error);
            throw error;
        }
    }

    /**
     * Get case tree
     */
    async getCaseTree(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.getCaseTree()
            const caseTree = session.engine.getCaseTree();
            return caseTree;
        } catch (error) {
            console.error(`[CSProWasmService] getCaseTree error:`, error);
            throw error;
        }
    }

    /**
     * Partial save the current case
     * Saves the case in its current state without completing entry
     */
    async partialSave(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.partialSave()
            const result = session.engine.partialSave();
            console.log(`[CSProWasmService] partialSave result:`, result);
            return result;
        } catch (error) {
            console.error(`[CSProWasmService] partialSave error:`, error);
            throw error;
        }
    }
    // ==================== ACTION INVOKER / LOGIC EVALUATION ====================
    
    /**
     * Invoke a user-defined CSPro logic function by name
     * Maps to Embind CSProEngine.invokeLogicFunction()
     * This is required for CAPI HTML buttons that call functions like EndPersonRoster()
     * @param {string} sessionId - The session ID
     * @param {string} functionName - Name of the user-defined function (e.g., "EndPersonRoster")
     * @param {object} args - Arguments to pass to the function (optional)
     * @returns {object} Result from the logic function, including any dialogs that occurred
     */
    async invokeLogicFunction(sessionId, functionName, args = {}) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log(`[CSProWasmService] invokeLogicFunction: ${functionName}(${JSON.stringify(args)})`);
        
        // Clear any previous dialogs before execution
        this._lastDialogs = [];
        
        try {
            // Use Embind CSProEngine.invokeLogicFunction()
            const argsJson = typeof args === 'string' ? args : JSON.stringify(args);
            const resultJson = await session.engine.invokeLogicFunction(functionName, argsJson);
            
            console.log(`[CSProWasmService] invokeLogicFunction result:`, resultJson);
            
            // Parse result if it's a JSON string
            let result;
            try {
                result = JSON.parse(resultJson);
            } catch (e) {
                result = resultJson;
            }
            
            // Get updated page after logic execution (may have navigated or shown dialogs)
            const page = await session.engine.getCurrentPage();
            
            // Collect any dialogs that occurred during execution
            const dialogs = this._lastDialogs ? [...this._lastDialogs] : [];
            this._lastDialogs = []; // Clear after collecting
            
            return { success: true, result, page, dialogs };
        } catch (error) {
            console.error(`[CSProWasmService] invokeLogicFunction error:`, error);
            // Still return any dialogs that occurred before the error
            const dialogs = this._lastDialogs ? [...this._lastDialogs] : [];
            this._lastDialogs = [];
            throw { error: error.message || error, dialogs };
        }
    }
    
    /**
     * Evaluate CSPro logic code directly
     * Maps to Embind CSProEngine.evalLogic()
     * This handles Logic.eval actions from CAPI HTML
     * @param {string} sessionId - The session ID
     * @param {string} logicCode - CSPro logic code to evaluate
     * @returns {object} Result from the logic evaluation, including any dialogs that occurred
     */
    async evalLogic(sessionId, logicCode) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log(`[CSProWasmService] evalLogic: ${logicCode}`);
        
        // Clear any previous dialogs before execution
        this._lastDialogs = [];
        
        try {
            // Use Embind CSProEngine.evalLogic()
            const resultJson = await session.engine.evalLogic(logicCode);
            
            console.log(`[CSProWasmService] evalLogic result:`, resultJson);
            
            // Parse result if it's a JSON string
            let result;
            try {
                result = JSON.parse(resultJson);
            } catch (e) {
                result = resultJson;
            }
            
            // Get updated page after logic execution (may have navigated or shown dialogs)
            const page = await session.engine.getCurrentPage();
            
            // Collect any dialogs that occurred during execution
            const dialogs = this._lastDialogs ? [...this._lastDialogs] : [];
            this._lastDialogs = []; // Clear after collecting
            
            return { success: true, result, page, dialogs };
        } catch (error) {
            console.error(`[CSProWasmService] evalLogic error:`, error);
            // Still return any dialogs that occurred before the error
            const dialogs = this._lastDialogs ? [...this._lastDialogs] : [];
            this._lastDialogs = [];
            throw { error: error.message || error, dialogs };
        }
    }
    
    /**
     * Execute a generic Action Invoker action
     * Maps to Embind CSProEngine.processAction()
     * @param {string} sessionId - The session ID
     * @param {string} actionName - Full action name (e.g., "Logic.invoke", "UI.alert")
     * @param {object} args - Arguments for the action
     * @param {string} accessToken - Optional access token (not used in web mode)
     * @returns {object} Result from the action
     */
    async executeAction(sessionId, actionName, args = {}, accessToken = '') {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log(`[CSProWasmService] executeAction: ${actionName}(${JSON.stringify(args)})`);
        
        try {
            // Use Embind CSProEngine.processAction()
            const argsJson = typeof args === 'string' ? args : JSON.stringify(args);
            const resultJson = await session.engine.processAction(actionName, argsJson);
            
            console.log(`[CSProWasmService] executeAction result:`, resultJson);
            
            // Parse result if it's a JSON string
            let result;
            try {
                result = JSON.parse(resultJson);
            } catch (e) {
                result = resultJson;
            }
            
            // Get updated page after action execution (may have navigated or shown dialogs)
            const page = await session.engine.getCurrentPage();
            
            return { success: true, result, page };
        } catch (error) {
            console.error(`[CSProWasmService] executeAction error:`, error);
            throw error;
        }
    }

    /**
     * Cleanup a session
     */
    destroySession(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            // Clean up the CSProEngine instance (use rawEngine for delete)
            const engineToDelete = session.rawEngine || session.engine;
            if (engineToDelete) {
                try {
                    engineToDelete.delete(); // Embind cleanup
                } catch (e) {
                    console.warn(`[CSProWasmService] Failed to delete engine:`, e);
                }
            }
            
            // Clean up WASM filesystem
            if (session.appDir && this.Module && session.appDir.startsWith('/sessions/')) {
                try {
                    const FS = this.Module.FS;
                    this._removeDirectory(FS, session.appDir);
                } catch (e) {
                    console.warn(`[CSProWasmService] Failed to cleanup session directory:`, e);
                }
            }
            
            this.sessions.delete(sessionId);
            console.log(`[CSProWasmService] Destroyed session: ${sessionId}`);
        }
    }

    /**
     * List embedded applications in the WASM filesystem
     * Searches common paths for PFF files
     */
    listEmbeddedAssets() {
        if (!this.isInitialized) {
            throw new Error('WASM module not initialized');
        }

        const assets = [];
        const FS = this.Module.FS;
        const paths = ['/Assets/examples', '/Assets', '/applications', '/assets', '/data/applications'];

        for (const basePath of paths) {
            try {
                const entries = FS.readdir(basePath);
                console.log(`[CSProWasmService] Scanning ${basePath}: ${entries.length} entries`);
                
                // Check for PFF files directly in this directory
                const pffFiles = entries.filter(f => f.toLowerCase().endsWith('.pff'));
                for (const pffFile of pffFiles) {
                    const appName = pffFile.replace(/\.pff$/i, '');
                    if (!assets.find(a => a.name === appName)) {
                        assets.push({ name: appName, path: basePath, pffFile: pffFile });
                    }
                }
                
                // Also check subdirectories
                for (const entry of entries) {
                    if (entry !== '.' && entry !== '..') {
                        const fullPath = `${basePath}/${entry}`;
                        try {
                            const stat = FS.stat(fullPath);
                            if (FS.isDir(stat.mode)) {
                                // Check if subdirectory has a PFF file
                                const subEntries = FS.readdir(fullPath);
                                const subPff = subEntries.find(f => f.toLowerCase().endsWith('.pff'));
                                if (subPff) {
                                    assets.push({ name: entry, path: fullPath, pffFile: subPff });
                                }
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            } catch (e) {
                // Path doesn't exist, that's okay
            }
        }

        console.log(`[CSProWasmService] Found ${assets.length} embedded assets`);
        return assets;
    }

    /**
     * Helper: Ensure directory exists in WASM FS
     */
    _ensureDirectory(FS, dirPath) {
        const parts = dirPath.split('/').filter(p => p);
        let current = '';
        
        for (const part of parts) {
            current += '/' + part;
            try {
                FS.stat(current);
            } catch (e) {
                try {
                    FS.mkdir(current);
                } catch (mkdirError) {
                    // Directory might already exist
                }
            }
        }
    }

    /**
     * Helper: Remove directory recursively from WASM FS
     */
    _removeDirectory(FS, dirPath) {
        try {
            const contents = FS.readdir(dirPath);
            for (const item of contents) {
                if (item === '.' || item === '..') continue;
                
                const itemPath = `${dirPath}/${item}`;
                const stat = FS.stat(itemPath);
                
                if (FS.isDir(stat.mode)) {
                    this._removeDirectory(FS, itemPath);
                } else {
                    FS.unlink(itemPath);
                }
            }
            FS.rmdir(dirPath);
        } catch (e) {
            // Ignore errors
        }
    }
}

// Singleton instance
const wasmService = new CSProWasmService();

export { CSProWasmService, wasmService };
export default wasmService;
