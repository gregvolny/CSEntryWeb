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
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Async context to track the current session during WASM execution
const sessionContext = new AsyncLocalStorage();

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

                    // Get current session from context
                    const sessionId = sessionContext.getStore();
                    if (!sessionId) {
                        console.warn('[CSProWasmService] Dialog requested outside of session context!');
                        // Fallback for non-session context (should not happen in normal flow)
                        return JSON.stringify({ index: 1 });
                    }

                    const session = self.getSession(sessionId);
                    if (!session) {
                        console.warn(`[CSProWasmService] Session ${sessionId} not found during dialog request`);
                        return JSON.stringify({ index: 1 });
                    }

                    // Create a promise that will be resolved when the client responds
                    // This suspends the WASM execution (via JSPI)
                    return new Promise((resolve, reject) => {
                        // Store the resolver so we can call it later
                        session.pendingDialogResolver = resolve;
                        
                        // Notify the controller that we are suspended on a dialog
                        if (session.dialogSignal) {
                            session.dialogSignal({
                                dialogName,
                                inputData,
                                timestamp: Date.now()
                            });
                        } else {
                            console.error('[CSProWasmService] No dialog signal handler found for session');
                            // If we can't signal, we must resolve immediately to avoid hanging
                            resolve(JSON.stringify({ index: 1 }));
                        }
                    });
                }
            };
            
            // Also set on global for compatibility
            global.CSProDialogHandler = globalThis.CSProDialogHandler;

            // Define alert for Node.js environment to prevent crashes in CSPro.js
            if (typeof globalThis.alert === 'undefined') {
                globalThis.alert = (msg) => console.log('[Alert]', msg);
                global.alert = globalThis.alert;
            }

            // Mock window for Node.js environment to satisfy Emscripten/CSPro.js dependencies
            if (typeof globalThis.window === 'undefined') {
                globalThis.window = globalThis;
                global.window = globalThis;
                
                // Mock location to prevent crash in loadPackage
                globalThis.location = {
                    pathname: '/server-side-wasm/',
                    href: 'file:///server-side-wasm/'
                };
                globalThis.window.location = globalThis.location;
            }

            // Set up CSProActionInvoker for server-side logic functions (getos, getdeviceid, etc.)
            globalThis.CSProActionInvoker = {
                System: {
                    getOS: () => "Windows", // Return "Windows" to see if it bypasses sync logic
                    getDeviceId: () => {
                        // Return a persistent server ID or session-based ID
                        // For server-side execution, we can use a fixed ID or generate one
                        return "ServerSideWASM";
                    },
                    getUUID: () => uuidv4()
                },
                // Add other namespaces as needed
                UI: {
                    alert: (args) => console.log('[CSProActionInvoker] UI.alert:', args),
                    showDialog: (args) => console.log('[CSProActionInvoker] UI.showDialog:', args)
                }
            };
            global.CSProActionInvoker = globalThis.CSProActionInvoker;
            
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
            console.log('[CSProWasmService] ALL Engine methods:', Object.keys(engine.__proto__ || {}));
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
            createdAt: Date.now(),
            pendingDialogResolver: null,
            dialogSignal: null,
            activeWasmPromise: null
        };

        this.sessions.set(sessionId, session);
        console.log(`[CSProWasmService] Session created successfully: ${sessionId}`);
        
        return session;
    }

    /**
     * Execute a WASM action with support for suspending on dialogs
     * @param {string} sessionId - The session ID
     * @param {Function} actionFn - Async function that executes the WASM operation
     * @returns {Promise<object>} Result object { status: 'success'|'dialog', result?, dialog? }
     */
    async executeWasmWithDialogHandling(sessionId, actionFn) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Run within the session context so CSProDialogHandler can find the session
        return sessionContext.run(sessionId, async () => {
            // Create a signal promise that resolves when a dialog is requested
            let dialogResolver;
            const dialogSignal = new Promise(resolve => { dialogResolver = resolve; });
            session.dialogSignal = dialogResolver;

            try {
                // Start the WASM operation
                // If we are resuming a suspended operation, actionFn should just await the existing promise
                const wasmPromise = actionFn();
                
                // Store the promise so we can await it later if we suspend
                session.activeWasmPromise = wasmPromise;

                // Race the WASM completion against the dialog signal
                const winner = await Promise.race([
                    wasmPromise.then(res => ({ type: 'complete', result: res })),
                    dialogSignal.then(data => ({ type: 'dialog', data: data }))
                ]);

                if (winner.type === 'dialog') {
                    console.log(`[CSProWasmService] Suspended on dialog: ${winner.data.dialogName}`);
                    return { 
                        status: 'dialog', 
                        dialog: winner.data 
                    };
                } else {
                    console.log(`[CSProWasmService] Operation completed successfully`);
                    // Clear session state
                    session.activeWasmPromise = null;
                    session.pendingDialogResolver = null;
                    session.dialogSignal = null;
                    
                    return { 
                        status: 'success', 
                        result: winner.result 
                    };
                }
            } catch (error) {
                console.error(`[CSProWasmService] Error in WASM execution:`, error);
                session.activeWasmPromise = null;
                session.pendingDialogResolver = null;
                session.dialogSignal = null;
                throw error;
            }
        });
    }

    /**
     * Submit a response to a pending dialog
     * @param {string} sessionId - The session ID
     * @param {object} response - The dialog response (e.g. { textInput: "..." })
     */
    async submitDialogResponse(sessionId, response) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        if (!session.pendingDialogResolver) {
            throw new Error('No pending dialog for this session');
        }

        console.log(`[CSProWasmService] Submitting dialog response for session ${sessionId}:`, response);

        // Resume the WASM execution by resolving the dialog promise
        // The response must be a JSON string as expected by WASM
        const responseJson = JSON.stringify(response);
        session.pendingDialogResolver(responseJson);
        
        // Clear the resolver (it's been used)
        session.pendingDialogResolver = null;

        // Now wait for the WASM engine to continue (until next dialog or completion)
        // We reuse the existing active promise
        if (!session.activeWasmPromise) {
            throw new Error('No active WASM execution to resume');
        }

        return this.executeWasmWithDialogHandling(sessionId, () => session.activeWasmPromise);
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
    async loadApplication(sessionId, pffContent, applicationFiles, appName = null) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        try {
            // Store appName for file synchronization
            session.appName = appName;
            
            // Write files to WASM filesystem
            const FS = this.Module.FS;
            const appDir = `/sessions/${sessionId}`;
            
            // Create session directory
            this._ensureDirectory(FS, appDir);

            // Find the .pen file to determine the application directory
            let penFilePath = null;
            
            // Write all application files and find the .pen file
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
                
                // Track the .pen file location (but not Login.pen or Menu.pen)
                if (filename.endsWith('.pen') && !filename.includes('Login') && !filename.includes('Menu')) {
                    penFilePath = filePath;
                }
            }
            
            // Restore existing data from server disk if available
            // This ensures we use the persisted data instead of empty files from the client
            if (appName) {
                session.appDir = appDir; // Ensure appDir is set for sync
                this._syncFilesFromDisk(session);
            }
            
            console.log(`[CSProWasmService] Found .pen file: ${penFilePath}`);

            // Process PFF content - convert ALL relative paths to absolute WASM filesystem paths
            let processedPff = pffContent;
            
            // Determine the working directory for the application
            // Heuristic: Try to match PFF Application path with actual .pen file location
            let workingDir = appDir;
            
            if (penFilePath) {
                const appMatch = pffContent.match(/^Application=(.*)$/m);
                if (appMatch) {
                    let pffAppPath = appMatch[1].trim().replace(/\\/g, '/');
                    // Strip leading ./
                    if (pffAppPath.startsWith('./')) pffAppPath = pffAppPath.substring(2);
                    
                    // Check if penFilePath ends with pffAppPath
                    // e.g. penFilePath = /sess/Source/App.pen, pffAppPath = Source/App.pen
                    if (penFilePath.endsWith(pffAppPath)) {
                        const suffixLen = pffAppPath.length;
                        const prefixLen = penFilePath.length - suffixLen;
                        // Check for slash separator or exact match
                        if (prefixLen > 0 && penFilePath[prefixLen-1] === '/') {
                             workingDir = penFilePath.substring(0, prefixLen - 1);
                        } else if (prefixLen === 0) {
                             // Exact match (unlikely as penFilePath is absolute)
                        }
                        console.log(`[CSProWasmService] Deduced workingDir from PFF path: ${workingDir}`);
                    } else {
                        // Fallback: If pffAppPath is just filename, put PFF in same dir as PEN
                        const pffAppName = pffAppPath.split('/').pop();
                        const penFileName = penFilePath.split('/').pop();
                        
                        if (pffAppName === penFileName) {
                            workingDir = path.dirname(penFilePath).replace(/\\/g, '/');
                            console.log(`[CSProWasmService] Deduced workingDir (colocated): ${workingDir}`);
                        }
                    }
                }
            }
            
            // Replace ALL path-like entries with absolute paths
            // This handles: Application, InputData, OutputData, ExternalFiles, Paradata, OnExit, etc.
            const pathKeys = ['Application', 'AppFile', 'InputData', 'OutputData', 'ExternalFiles', 'Paradata', 'OnExit', 'CommonStore', 'ParadataConcat'];
            
            for (const key of pathKeys) {
                // Pattern: Key=.\path or Key=..\path or Key=path (relative)
                const regex = new RegExp(`^(${key})=([^\\/\\r\\n][^\\r\\n]*)$`, 'gm');
                processedPff = processedPff.replace(regex, (match, keyName, pathValue) => {
                    // Skip if already absolute (starts with /)
                    if (pathValue.startsWith('/')) {
                        return match;
                    }

                    // Skip if starts with | (CSPro special flags like |type=None)
                    if (pathValue.startsWith('|')) {
                        return match;
                    }
                    
                    // Convert Windows backslashes to forward slashes
                    let normalizedPath = pathValue.replace(/\\/g, '/');
                    
                    // Handle relative paths
                    if (normalizedPath.startsWith('../')) {
                        // Parent directory reference - resolve from workingDir
                        const parts = normalizedPath.split('/');
                        let currentDir = workingDir;
                        while (parts[0] === '..') {
                            parts.shift();
                            currentDir = path.dirname(currentDir);
                        }
                        normalizedPath = currentDir + '/' + parts.join('/');
                    } else if (normalizedPath.startsWith('./')) {
                        // Current directory reference
                        normalizedPath = workingDir + '/' + normalizedPath.substring(2);
                    } else {
                        // No prefix - relative to working directory
                        normalizedPath = workingDir + '/' + normalizedPath;
                    }
                    
                    console.log(`[CSProWasmService] Rewriting ${keyName}: ${pathValue} -> ${normalizedPath}`);
                    return `${keyName}=${normalizedPath}`;
                });
            }
            
            console.log(`[CSProWasmService] Processed PFF content:\n${processedPff.substring(0, 800)}...`);

            // Write processed PFF content to the application subdirectory (same as .pen file)
            const pffPath = `${workingDir}/application.pff`;
            this._ensureDirectory(FS, workingDir);
            FS.writeFile(pffPath, processedPff);
            console.log(`[CSProWasmService] Wrote PFF to: ${pffPath}`);

            // Use Embind CSProEngine.initApplication() via the dialog handler wrapper
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result;
                const initResult = session.engine.initApplication(pffPath);
                
                // Check if it's a promise (JSPI-wrapped function)
                if (initResult && typeof initResult.then === 'function') {
                    console.log(`[CSProWasmService] initApplication returned a promise, awaiting...`);
                    result = await initResult;
                } else {
                    result = initResult;
                }

                // Update session state immediately upon completion (even if resumed later)
                console.log(`[CSProWasmService] initApplication returned: ${result}`);
                session.applicationLoaded = result;
                session.appDir = appDir;
                session.workingDir = workingDir;

                return result;
            });
            
            // If suspended on dialog, return the dialog info
            if (executionResult.status === 'dialog') {
                return executionResult;
            }
            
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
            
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
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
                
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }
            
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
            // Use Embind CSProEngine.start() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                const startResult = session.engine.start();
                let result;
                if (startResult && typeof startResult.then === 'function') {
                    console.log(`[CSProWasmService] start() returned a promise, awaiting...`);
                    result = await startResult;
                } else {
                    result = startResult;
                }
                
                session.entryStarted = result;
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }
            
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
            let page = session.engine.getCurrentPage();
            if (page && typeof page.then === 'function') {
                page = await page;
            }
            return page;
        } catch (error) {
            console.error(`[CSProWasmService] getCurrentPage error:`, error);
            throw error;
        }
    }

    /**
     * Get list of all cases in data file
     * Maps to: GetSequentialCaseIds (WASM)
     */
    async getSequentialCaseIds(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.engine) {
            throw new Error('No engine in session');
        }

        try {
            // Call WASM getSequentialCaseIds
            let cases = session.engine.getSequentialCaseIds();
            if (cases && typeof cases.then === 'function') {
                cases = await cases;
            }
            
            // Convert to array format
            let casesArray = [];
            if (cases) {
                const length = cases.length || 0;
                for (let i = 0; i < length; i++) {
                    const c = cases[i];
                    casesArray.push({
                        key: c.ids || '',  // WASM uses 'ids' field
                        label: c.label || '',
                        position: c.position || 0
                    });
                }
            }
            
            return casesArray;
        } catch (error) {
            console.error(`[CSProWasmService] getSequentialCaseIds error:`, error);
            throw error;
        }
    }

    /**
     * Modify (open) a case by position
     * Maps to: ModifyCase (WASM)
     */
    async modifyCase(sessionId, position) {
        const session = this.getSession(sessionId);
        if (!session || !session.engine) {
            throw new Error('No engine in session');
        }

        try {
            console.log(`[CSProWasmService] modifyCase: position=${position}`);
            
            // Call WASM modifyCase
            let result = session.engine.modifyCase(position);
            if (result && typeof result.then === 'function') {
                result = await result;
            }
            
            // Mark entry as started if successful
            if (result) {
                session.entryStarted = true;
            }
            
            return result;
        } catch (error) {
            console.error(`[CSProWasmService] modifyCase error:`, error);
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
            
            // Use Embind CSProEngine.setFieldValueAndAdvance() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.setFieldValueAndAdvance(valueStr);
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }
            
            const result = executionResult.result;
            
            // Auto-save after every field advance to ensure data persistence
            // This is critical for web clients where sessions might be disconnected
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during advanceField:', saveError);
            }

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
            // Use Embind CSProEngine.previousField() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.previousField();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during previousField:', saveError);
            }

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
            let formData = session.engine.getFormData();
            if (formData && typeof formData.then === 'function') {
                formData = await formData;
            }
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
            let result = session.engine.getQuestionText();
            if (result && typeof result.then === 'function') {
                result = await result;
            }
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
            let page = session.engine.getCurrentPage();
            if (page && typeof page.then === 'function') {
                page = await page;
            }
            
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
            const result = session.engine.onStop();
            if (result && typeof result.then === 'function') {
                await result;
            }
            
            session.entryStarted = false;
            
            // Sync files back to disk if appName is known
            if (save && session.appName) {
                this._syncFilesToDisk(session);
            }
            
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
            // Use Embind CSProEngine.endGroup() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.endGroup();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during endGroup:', saveError);
            }

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
            // Use Embind CSProEngine.endLevel() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.endLevel();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during endLevel:', saveError);
            }

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
            // Use Embind CSProEngine.endLevelOcc() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.endLevelOcc();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during endLevelOcc:', saveError);
            }

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
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.endGroup();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during endRoster:', saveError);
            }

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
            // Use Embind CSProEngine.insertOcc() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.insertOcc();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during insertOcc:', saveError);
            }

            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] insertOcc error:`, error);
            throw error;
        }
    }

    /**
     * Insert occurrence after current in a roster/repeating group
     * Maps to MFC C_InsertOccAfter() / Embind CSProEngine.insertOccAfter()
     */
    async insertOccAfter(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        try {
            // Use Embind CSProEngine.insertOccAfter() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.insertOccAfter();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during insertOccAfter:', saveError);
            }

            return { success: true, page: result };
        } catch (error) {
            console.error(`[CSProWasmService] insertOccAfter error:`, error);
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
            // Use Embind CSProEngine.deleteOcc() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.deleteOcc();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during deleteOcc:', saveError);
            }

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
            // Use Embind CSProEngine.sortOcc() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let result = session.engine.sortOcc();
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during sortOcc:', saveError);
            }

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
     * @param {number} occurrence1 - First occurrence index (default 1)
     * @param {number} occurrence2 - Second occurrence index (default 0)
     * @param {number} occurrence3 - Third occurrence index (default 0)
     */
    async goToField(sessionId, fieldNameOrSymbol, occurrence1 = 1, occurrence2 = 0, occurrence3 = 0) {
        const session = this.getSession(sessionId);
        if (!session || !session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log('[CSProWasmService] goToField called with:', { fieldNameOrSymbol, occurrence1, occurrence2, occurrence3 });

        try {
            // Convert field name to field symbol if needed
            let fieldSymbol = fieldNameOrSymbol;
            if (typeof fieldNameOrSymbol === 'string') {
                // Get form data to access all fields (not just current page)
                let formData = session.engine.getFormData();
                if (formData && typeof formData.then === 'function') {
                    formData = await formData;
                }
                
                if (formData && formData.fields) {
                    const field = formData.fields.find(f => 
                        f.name && f.name.toUpperCase() === fieldNameOrSymbol.toUpperCase()
                    );
                    if (field && field.symbol !== undefined) {
                        fieldSymbol = field.symbol;
                        console.log('[CSProWasmService] Resolved field name', fieldNameOrSymbol, 'to symbol', fieldSymbol, 'from form data');
                    } else {
                        console.warn('[CSProWasmService] Field not found in form data:', fieldNameOrSymbol);
                        
                        // Fallback: Try current page
                        let currentPage = session.engine.getCurrentPage();
                        if (currentPage && typeof currentPage.then === 'function') {
                            currentPage = await currentPage;
                        }
                        
                        if (currentPage && currentPage.fields) {
                            const pageField = currentPage.fields.find(f => 
                                f.name && f.name.toUpperCase() === fieldNameOrSymbol.toUpperCase()
                            );
                            if (pageField && pageField.symbol !== undefined) {
                                fieldSymbol = pageField.symbol;
                                console.log('[CSProWasmService] Resolved field name', fieldNameOrSymbol, 'to symbol', fieldSymbol, 'from current page');
                            }
                        }
                    }
                } else {
                    console.warn('[CSProWasmService] Form data not available or has no fields');
                }
            }

            // Use Embind CSProEngine.goToField() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                console.log('[CSProWasmService] Calling engine.goToField with symbol:', fieldSymbol, 'occurrences:', occurrence1, occurrence2, occurrence3);
                let result = session.engine.goToField(fieldSymbol, occurrence1, occurrence2, occurrence3);
                if (result && typeof result.then === 'function') {
                    result = await result;
                }
                return result;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const result = executionResult.result;

            // Auto-save
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during goToField:', saveError);
            }

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
            let caseTree = session.engine.getCaseTree();
            if (caseTree && typeof caseTree.then === 'function') {
                caseTree = await caseTree;
            }
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
            let result = session.engine.partialSave();
            if (result && typeof result.then === 'function') {
                result = await result;
            }
            
            console.log(`[CSProWasmService] partialSave result:`, result);
            
            // Sync files back to disk if appName is known
            if (result && session.appName) {
                this._syncFilesToDisk(session);
            }
            
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
        if (!session) {
            throw new Error('Session not found');
        }
        if (!session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log(`[CSProWasmService] invokeLogicFunction: ${functionName}(${JSON.stringify(args)})`);
        
        // Clear any previous dialogs before execution
        this._lastDialogs = [];
        
        try {
            // Use Embind CSProEngine.invokeLogicFunction() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                const argsJson = typeof args === 'string' ? args : JSON.stringify(args);
                let resultJson = session.engine.invokeLogicFunction(functionName, argsJson);
                if (resultJson && typeof resultJson.then === 'function') {
                    resultJson = await resultJson;
                }
                return resultJson;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const resultJson = executionResult.result;
            console.log(`[CSProWasmService] invokeLogicFunction result:`, resultJson);
            
            // Parse result if it's a JSON string
            let result;
            try {
                result = JSON.parse(resultJson);
            } catch (e) {
                result = resultJson;
            }
            
            // Auto-save after logic execution (as it might have modified data)
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during invokeLogicFunction:', saveError);
            }

            // Get updated page after logic execution (may have navigated or shown dialogs)
            let page = session.engine.getCurrentPage();
            if (page && typeof page.then === 'function') {
                page = await page;
            }
            
            // Collect any dialogs that occurred during execution (legacy check)
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
        if (!session) {
            throw new Error('Session not found');
        }
        if (!session.entryStarted) {
            throw new Error('Entry not started');
        }

        console.log(`[CSProWasmService] evalLogic: ${logicCode}`);
        
        // Clear any previous dialogs before execution
        this._lastDialogs = [];
        
        try {
            // Use Embind CSProEngine.evalLogic() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                let resultJson = session.engine.evalLogic(logicCode);
                if (resultJson && typeof resultJson.then === 'function') {
                    resultJson = await resultJson;
                }
                return resultJson;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const resultJson = executionResult.result;
            console.log(`[CSProWasmService] evalLogic result:`, resultJson);
            
            // Parse result if it's a JSON string
            let result;
            try {
                result = JSON.parse(resultJson);
            } catch (e) {
                result = resultJson;
            }
            
            // Auto-save after logic execution
            try {
                let saveResult = session.engine.partialSave();
                if (saveResult && typeof saveResult.then === 'function') {
                    await saveResult;
                }
                if (session.appName) {
                    this._syncFilesToDisk(session);
                }
            } catch (saveError) {
                console.warn('[CSProWasmService] Auto-save failed during evalLogic:', saveError);
            }

            // Get updated page after logic execution (may have navigated or shown dialogs)
            let page = session.engine.getCurrentPage();
            if (page && typeof page.then === 'function') {
                page = await page;
            }
            
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
            // Use Embind CSProEngine.processAction() via dialog handler
            const executionResult = await this.executeWasmWithDialogHandling(sessionId, async () => {
                const argsJson = typeof args === 'string' ? args : JSON.stringify(args);
                const resultJson = await session.engine.processAction(actionName, argsJson);
                return resultJson;
            });

            if (executionResult.status === 'dialog') {
                return executionResult;
            }

            const resultJson = executionResult.result;
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
        
        return assets;
    }

    /**
     * Sync files from server disk to WASM filesystem
     * Only syncs data files (.csdb, .log, .not, .dat, .txt)
     */
    _syncFilesFromDisk(session) {
        if (!session.appName || !session.appDir) return;
        
        const appName = session.appName;
        const wasmDir = session.appDir;
        const serverAppDir = path.join(__dirname, 'storage/applications', appName);
        
        console.log(`[CSProWasmService] Syncing files for ${appName} from ${serverAppDir} to ${wasmDir}`);
        
        if (!fs.existsSync(serverAppDir)) {
            console.warn(`[CSProWasmService] Server app directory not found: ${serverAppDir}`);
            return;
        }
        
        const FS = this.Module.FS;
        
        // Recursive function to walk server FS and copy files to WASM
        const syncDir = (currentServerDir, relativePath = '') => {
            try {
                const entries = fs.readdirSync(currentServerDir);
                
                for (const entry of entries) {
                    const fullServerPath = path.join(currentServerDir, entry);
                    const fullRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
                    const stat = fs.statSync(fullServerPath);
                    
                    if (stat.isDirectory()) {
                        syncDir(fullServerPath, fullRelativePath);
                    } else {
                        // Check extension
                        const ext = path.extname(entry).toLowerCase();
                        const isDataFile = ['.csdb', '.log', '.not', '.dat', '.txt', '.lst'].includes(ext) || 
                                           entry.endsWith('.csdb.log'); // Special case for CSDB log
                        
                        if (isDataFile) {
                            // Read from Server
                            const content = fs.readFileSync(fullServerPath);
                            
                            // Write to WASM
                            const targetPath = `${wasmDir}/${fullRelativePath}`;
                            const targetDir = path.dirname(targetPath);
                            
                            this._ensureDirectory(FS, targetDir);
                            
                            FS.writeFile(targetPath, content);
                            console.log(`[CSProWasmService] Synced file to WASM: ${fullRelativePath}`);
                        }
                    }
                }
            } catch (e) {
                console.error(`[CSProWasmService] Error syncing directory ${currentServerDir}:`, e);
            }
        };
        
        syncDir(serverAppDir);
    }

    /**
     * Sync files from WASM filesystem to server disk
     * Only syncs data files (.csdb, .log, .not, .dat, .txt)
     */
    _syncFilesToDisk(session) {
        if (!session.appName || !session.appDir) return;
        
        const appName = session.appName;
        const wasmDir = session.appDir;
        const serverAppDir = path.join(__dirname, 'storage/applications', appName);
        
        console.log(`[CSProWasmService] Syncing files for ${appName} from ${wasmDir} to ${serverAppDir}`);
        
        if (!fs.existsSync(serverAppDir)) {
            console.warn(`[CSProWasmService] Server app directory not found: ${serverAppDir}`);
            return;
        }
        
        const FS = this.Module.FS;
        
        // Recursive function to walk WASM FS and copy files
        const syncDir = (currentWasmDir, relativePath = '') => {
            try {
                const entries = FS.readdir(currentWasmDir);
                
                for (const entry of entries) {
                    if (entry === '.' || entry === '..') continue;
                    
                    const fullWasmPath = `${currentWasmDir}/${entry}`;
                    const fullRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
                    const stat = FS.stat(fullWasmPath);
                    
                    if (FS.isDir(stat.mode)) {
                        syncDir(fullWasmPath, fullRelativePath);
                    } else {
                        // Check extension
                        const ext = path.extname(entry).toLowerCase();
                        const isDataFile = ['.csdb', '.log', '.not', '.dat', '.txt', '.lst'].includes(ext) || 
                                           entry.endsWith('.csdb.log'); // Special case for CSDB log
                        
                        if (isDataFile) {
                            // Read from WASM
                            const content = FS.readFile(fullWasmPath);
                            
                            // Write to server disk
                            const targetPath = path.join(serverAppDir, fullRelativePath);
                            const targetDir = path.dirname(targetPath);
                            
                            if (!fs.existsSync(targetDir)) {
                                fs.mkdirSync(targetDir, { recursive: true });
                            }
                            
                            fs.writeFileSync(targetPath, content);
                            console.log(`[CSProWasmService] Synced file: ${fullRelativePath}`);
                        }
                    }
                }
            } catch (e) {
                console.error(`[CSProWasmService] Error syncing directory ${currentWasmDir}:`, e);
            }
        };
        
        syncDir(wasmDir);
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
