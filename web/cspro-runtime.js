/**
 * CSPro Runtime - Unified WASM Runtime for Browser and Node.js
 * 
 * This module provides a unified interface to the CSPro WASM engine that works
 * in both browser and Node.js environments. The WASM module uses JSPI for async
 * operations and Embind for the CSProEngine class.
 * 
 * Architecture:
 * - CSProRuntime: Manages WASM initialization and provides environment abstraction
 * - CSProSession: Represents a data entry session with its own CSProEngine instance
 * - CSProDialogBridge: Handles dialog callbacks from the engine to the UI
 * 
 * Usage:
 *   const runtime = new CSProRuntime();
 *   await runtime.initialize();
 *   const session = runtime.createSession('session-id');
 *   await session.loadApplication('/path/to/app.pff');
 *   await session.start();
 *   const page = await session.getCurrentPage();
 */

// Detect environment
const IS_NODE = typeof process !== 'undefined' && process.versions?.node;
const IS_BROWSER = typeof window !== 'undefined';

/**
 * CSProDialogBridge - Handles dialog callbacks from the WASM engine
 * 
 * The CSPro WASM engine calls dialog functions (errmsg, select, etc.) through
 * JSPI async functions that look for a global CSProDialogHandler. This bridge
 * provides the handler and allows the UI layer to register callbacks.
 */
class CSProDialogBridge {
    constructor() {
        this._dialogCallbacks = {
            showDialog: null,
            showHtmlDialog: null,
            showModalDialog: null,
            getInputData: null
        };
        this._pendingDialogs = new Map();
        this._dialogIdCounter = 0;
    }

    /**
     * Register a callback for dialog display
     * @param {string} type - Dialog type: 'showDialog', 'showHtmlDialog', 'showModalDialog'
     * @param {function} callback - Async function to handle the dialog
     */
    registerCallback(type, callback) {
        if (this._dialogCallbacks.hasOwnProperty(type)) {
            this._dialogCallbacks[type] = callback;
        }
    }

    /**
     * Create the CSProDialogHandler object that the WASM engine expects
     * This should be set on globalThis before WASM initialization
     */
    createHandler() {
        const self = this;
        
        return {
            /**
             * Show a named dialog (errmsg, select, choice, etc.)
             * Called by jspi_showDialog in CSPro.js
             */
            async showDialogAsync(dialogName, inputDataJson) {
                console.log(`[DialogBridge] showDialogAsync: ${dialogName}`);
                
                try {
                    const inputData = typeof inputDataJson === 'string' 
                        ? JSON.parse(inputDataJson) 
                        : inputDataJson;
                    
                    // If UI callback registered, use it
                    if (self._dialogCallbacks.showDialog) {
                        const result = await self._dialogCallbacks.showDialog(dialogName, inputData);
                        return typeof result === 'string' ? result : JSON.stringify(result);
                    }
                    
                    // Default handling for errmsg (just acknowledge)
                    if (dialogName === 'errmsg') {
                        console.log(`[DialogBridge] Default errmsg: ${inputData.message}`);
                        return JSON.stringify({ index: 1 });
                    }
                    
                    // Default handling for select (cancel)
                    if (dialogName === 'select') {
                        console.log(`[DialogBridge] Default select - returning cancel`);
                        return JSON.stringify({ result: { cancelled: true } });
                    }
                    
                    // Default: OK
                    return JSON.stringify({ index: 1, button: 1 });
                } catch (e) {
                    console.error('[DialogBridge] showDialogAsync error:', e);
                    return JSON.stringify({ index: 1 });
                }
            },

            /**
             * Show an HTML dialog from a file path
             * Called by jspi_showHtmlDialog in CSPro.js
             */
            async showHtmlDialogAsync(dialogPath, inputDataJson, displayOptionsJson) {
                console.log(`[DialogBridge] showHtmlDialogAsync: ${dialogPath}`);
                
                try {
                    const inputData = typeof inputDataJson === 'string' 
                        ? JSON.parse(inputDataJson) 
                        : inputDataJson;
                    const options = displayOptionsJson 
                        ? (typeof displayOptionsJson === 'string' ? JSON.parse(displayOptionsJson) : displayOptionsJson)
                        : {};
                    
                    if (self._dialogCallbacks.showHtmlDialog) {
                        const result = await self._dialogCallbacks.showHtmlDialog(dialogPath, inputData, options);
                        return typeof result === 'string' ? result : JSON.stringify(result);
                    }
                    
                    // Default: return null (no result)
                    return null;
                } catch (e) {
                    console.error('[DialogBridge] showHtmlDialogAsync error:', e);
                    return null;
                }
            },

            /**
             * Show a modal dialog (MessageBox style)
             * Called by jspi_showModalDialog in CSPro.js
             */
            async showModalDialogAsync(title, message, mbType) {
                console.log(`[DialogBridge] showModalDialogAsync: type=${mbType}`);
                
                try {
                    if (self._dialogCallbacks.showModalDialog) {
                        return await self._dialogCallbacks.showModalDialog(title, message, mbType);
                    }
                    
                    // Default handling based on type
                    // MB_OK=0, MB_OKCANCEL=1, MB_ABORTRETRYIGNORE=2, MB_YESNOCANCEL=3, MB_YESNO=4
                    if (IS_BROWSER) {
                        const fullMessage = title ? `${title}\n\n${message}` : message;
                        if (mbType === 1 || mbType === 4) {
                            return confirm(fullMessage) ? 1 : 2;
                        } else if (mbType === 3) {
                            return confirm(fullMessage) ? 6 : 7;
                        } else {
                            alert(fullMessage);
                            return 1;
                        }
                    }
                    
                    // Node.js - just return OK
                    return 1;
                } catch (e) {
                    console.error('[DialogBridge] showModalDialogAsync error:', e);
                    return 1;
                }
            },

            /**
             * Get input data for a dialog
             * Called by jspi_getInputData in CSPro.js
             */
            async getInputDataAsync(dialogId) {
                console.log(`[DialogBridge] getInputDataAsync: ${dialogId}`);
                
                if (self._dialogCallbacks.getInputData) {
                    const result = await self._dialogCallbacks.getInputData(dialogId);
                    return typeof result === 'string' ? result : JSON.stringify(result);
                }
                
                return null;
            }
        };
    }

    /**
     * Install the dialog handler globally
     * Must be called BEFORE WASM module initialization
     */
    install() {
        const handler = this.createHandler();
        globalThis.CSProDialogHandler = handler;
        
        // Also set on window for browser compatibility
        if (IS_BROWSER) {
            window.CSProDialogHandler = handler;
        }
        
        console.log('[DialogBridge] Handler installed on globalThis');
    }
}


/**
 * CSProSession - Represents a data entry session
 */
class CSProSession {
    constructor(id, engine, runtime) {
        this.id = id;
        this.engine = engine;
        this.runtime = runtime;
        this.applicationLoaded = false;
        this.entryStarted = false;
        this.createdAt = Date.now();
        this._appPath = null;
    }

    /**
     * Load an application from a PFF path (embedded in WASM filesystem)
     */
    async loadApplication(pffPath) {
        console.log(`[Session:${this.id}] Loading application: ${pffPath}`);
        
        try {
            const result = await this._callEngine('initApplication', pffPath);
            this.applicationLoaded = !!result;
            this._appPath = pffPath;
            
            console.log(`[Session:${this.id}] Application loaded: ${this.applicationLoaded}`);
            return this.applicationLoaded;
        } catch (error) {
            console.error(`[Session:${this.id}] Failed to load application:`, error);
            throw error;
        }
    }

    /**
     * Load application from content (files uploaded by user)
     */
    async loadApplicationFromContent(pffContent, files) {
        console.log(`[Session:${this.id}] Loading application from content`);
        
        const FS = this.runtime.getFS();
        if (!FS) {
            throw new Error('Filesystem not available');
        }
        
        try {
            // Create session directory
            const appDir = `/sessions/${this.id}`;
            this._ensureDirectory(FS, appDir);
            
            // Write all files
            for (const [filename, content] of Object.entries(files || {})) {
                const filePath = `${appDir}/${filename}`;
                this._ensureDirectory(FS, this._dirname(filePath));
                
                if (typeof content === 'string') {
                    FS.writeFile(filePath, content);
                } else if (content instanceof Uint8Array) {
                    FS.writeFile(filePath, content);
                } else if (content && content.type === 'binary') {
                    // Base64 encoded binary
                    const binaryStr = atob(content.data);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    FS.writeFile(filePath, bytes);
                }
                console.log(`[Session:${this.id}] Wrote file: ${filePath}`);
            }
            
            // Write PFF
            const pffPath = `${appDir}/application.pff`;
            FS.writeFile(pffPath, pffContent);
            
            // Load the application
            return await this.loadApplication(pffPath);
        } catch (error) {
            console.error(`[Session:${this.id}] Failed to load from content:`, error);
            throw error;
        }
    }

    /**
     * Start data entry
     */
    async start(mode = 'add') {
        if (!this.applicationLoaded) {
            throw new Error('Application not loaded');
        }
        
        console.log(`[Session:${this.id}] Starting entry, mode: ${mode}`);
        
        try {
            const result = await this._callEngine('start');
            this.entryStarted = !!result;
            console.log(`[Session:${this.id}] Entry started: ${this.entryStarted}`);
            return this.entryStarted;
        } catch (error) {
            console.error(`[Session:${this.id}] Failed to start entry:`, error);
            throw error;
        }
    }

    /**
     * Get current page state (field info, responses, etc.)
     */
    async getCurrentPage() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('getCurrentPage');
    }

    /**
     * Set field value and advance to next field
     * Returns the new page state
     */
    async setFieldValueAndAdvance(value) {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        const valueStr = value !== undefined && value !== null ? String(value) : '';
        return await this._callEngine('setFieldValueAndAdvance', valueStr);
    }

    /**
     * Go to previous field
     */
    async previousField() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('previousField');
    }

    /**
     * End current group (e.g., roster)
     */
    async endGroup() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('endGroup');
    }

    /**
     * End current level
     */
    async endLevel() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('endLevel');
    }

    /**
     * Get form/application structure
     */
    async getFormData() {
        if (!this.applicationLoaded) {
            throw new Error('Application not loaded');
        }
        
        return await this._callEngine('getFormData');
    }

    /**
     * Get question text for current field
     */
    async getQuestionText() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('getQuestionText');
    }

    /**
     * Get case tree structure
     */
    async getCaseTree() {
        if (!this.entryStarted) {
            throw new Error('Entry not started');
        }
        
        return await this._callEngine('getCaseTree');
    }

    /**
     * Stop entry
     */
    async stop() {
        try {
            await this._callEngine('onStop');
            this.entryStarted = false;
        } catch (e) {
            console.warn(`[Session:${this.id}] Stop error:`, e);
        }
    }

    /**
     * Cleanup the session
     */
    destroy() {
        try {
            if (this.engine && typeof this.engine.delete === 'function') {
                this.engine.delete();
            }
        } catch (e) {
            console.warn(`[Session:${this.id}] Engine delete error:`, e);
        }
        
        // Cleanup filesystem
        if (this._appPath && this._appPath.startsWith('/sessions/')) {
            try {
                const FS = this.runtime.getFS();
                if (FS) {
                    this._removeDirectory(FS, `/sessions/${this.id}`);
                }
            } catch (e) {
                console.warn(`[Session:${this.id}] FS cleanup error:`, e);
            }
        }
    }

    /**
     * Call an engine method, handling both sync and Promise returns
     */
    async _callEngine(method, ...args) {
        if (!this.engine || typeof this.engine[method] !== 'function') {
            throw new Error(`Engine method not available: ${method}`);
        }
        
        const result = this.engine[method](...args);
        
        // Handle Promise (JSPI async methods)
        if (result && typeof result.then === 'function') {
            return await result;
        }
        
        return result;
    }

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
                } catch (err) {
                    // May already exist
                }
            }
        }
    }

    _dirname(path) {
        const parts = path.split('/');
        parts.pop();
        return parts.join('/') || '/';
    }

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
            // Ignore
        }
    }
}


/**
 * CSProRuntime - Main runtime class that manages WASM initialization
 */
class CSProRuntime {
    constructor(options = {}) {
        this.options = options;
        this.Module = null;
        this.isInitialized = false;
        this.sessions = new Map();
        this.dialogBridge = new CSProDialogBridge();
        
        // Path to WASM files
        this.wasmPath = options.wasmPath || (IS_NODE ? './web' : '.');
    }

    /**
     * Initialize the WASM module
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        console.log('[CSProRuntime] Initializing...');
        console.log(`[CSProRuntime] Environment: ${IS_NODE ? 'Node.js' : 'Browser'}`);
        
        // Install dialog handler BEFORE WASM initialization
        this.dialogBridge.install();
        
        try {
            let createModule;
            
            if (IS_NODE) {
                // Node.js: Dynamic import with file URL
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const wasmJsPath = path.join(__dirname, this.wasmPath, 'CSPro.js');
                const moduleUrl = 'file:///' + wasmJsPath.replace(/\\/g, '/');
                
                console.log(`[CSProRuntime] Loading WASM from: ${moduleUrl}`);
                const csproModule = await import(moduleUrl);
                createModule = csproModule.default;
            } else {
                // Browser: Import relative to current location
                const { default: importedCreateModule } = await import('./CSPro.js');
                createModule = importedCreateModule;
            }
            
            // Create module configuration
            const moduleConfig = {
                locateFile: (filename) => {
                    if (IS_NODE) {
                        const path = require('path');
                        return path.join(this.wasmPath, filename);
                    }
                    return `./${filename}`;
                },
                print: (text) => console.log('[WASM]', text),
                printErr: (text) => console.error('[WASM Error]', text),
                ...this.options.moduleConfig
            };
            
            // Initialize the module (with JSPI, this returns a Promise)
            this.Module = await createModule(moduleConfig);
            
            this.isInitialized = true;
            console.log('[CSProRuntime] WASM module initialized');
            
            // Verify CSProEngine is available
            if (this.Module.CSProEngine) {
                console.log('[CSProRuntime] CSProEngine class available');
            } else {
                console.warn('[CSProRuntime] CSProEngine class NOT found!');
            }
            
            return true;
        } catch (error) {
            console.error('[CSProRuntime] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create a new entry session
     */
    createSession(sessionId) {
        if (!this.isInitialized) {
            throw new Error('Runtime not initialized');
        }
        
        console.log(`[CSProRuntime] Creating session: ${sessionId}`);
        
        // Create CSProEngine instance
        const engine = new this.Module.CSProEngine();
        
        const session = new CSProSession(sessionId, engine, this);
        this.sessions.set(sessionId, session);
        
        return session;
    }

    /**
     * Get an existing session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Destroy a session
     */
    destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.destroy();
            this.sessions.delete(sessionId);
            console.log(`[CSProRuntime] Session destroyed: ${sessionId}`);
        }
    }

    /**
     * Get the Emscripten FS object
     */
    getFS() {
        return this.Module?.FS || null;
    }

    /**
     * List embedded assets (applications in WASM filesystem)
     */
    listEmbeddedAssets() {
        if (!this.isInitialized) {
            throw new Error('Runtime not initialized');
        }
        
        const assets = [];
        const FS = this.getFS();
        const searchPaths = ['/Assets/examples', '/Assets', '/applications', '/assets'];
        
        for (const basePath of searchPaths) {
            try {
                const entries = FS.readdir(basePath);
                
                // PFF files in this directory
                for (const entry of entries) {
                    if (entry.toLowerCase().endsWith('.pff')) {
                        const name = entry.replace(/\.pff$/i, '');
                        if (!assets.find(a => a.name === name)) {
                            assets.push({ name, path: basePath, pffFile: entry });
                        }
                    }
                }
                
                // Subdirectories with PFF files
                for (const entry of entries) {
                    if (entry === '.' || entry === '..') continue;
                    
                    const fullPath = `${basePath}/${entry}`;
                    try {
                        const stat = FS.stat(fullPath);
                        if (FS.isDir(stat.mode)) {
                            const subEntries = FS.readdir(fullPath);
                            const pffFile = subEntries.find(f => f.toLowerCase().endsWith('.pff'));
                            if (pffFile) {
                                assets.push({ name: entry, path: fullPath, pffFile });
                            }
                        }
                    } catch (e) { /* ignore */ }
                }
            } catch (e) { /* path doesn't exist */ }
        }
        
        console.log(`[CSProRuntime] Found ${assets.length} embedded assets`);
        return assets;
    }

    /**
     * Read a file from the virtual filesystem
     */
    readVirtualFile(path) {
        const FS = this.getFS();
        if (!FS) return null;
        
        try {
            // Handle cspro-virtual:// URLs
            if (path.startsWith('cspro-virtual://')) {
                path = path.replace('cspro-virtual://', '/');
            }
            return FS.readFile(path, { encoding: 'utf8' });
        } catch (e) {
            console.warn(`[CSProRuntime] Could not read file: ${path}`, e.message);
            return null;
        }
    }

    /**
     * Register a dialog callback
     */
    onDialog(type, callback) {
        this.dialogBridge.registerCallback(type, callback);
    }
}


// Export for both ESM and CommonJS
export { CSProRuntime, CSProSession, CSProDialogBridge, IS_NODE, IS_BROWSER };
export default CSProRuntime;
