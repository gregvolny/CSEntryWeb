/**
 * CAPI Renderer - Renders CAPI question text panel
 * @module components/csentry-mfc-view/renderers/capi-renderer
 */

/**
 * CSProActionInvoker shim for CAPI HTML
 * This allows CAPI HTML to call CSPro actions in the web environment
 * Posts messages to parent window which forwards to the WASM engine
 * @returns {string} JavaScript code for the shim
 */
export function getActionInvokerShim() {
    return `
<script>
// CSProActionInvoker shim for web/iframe environment
// Forwards all actions to parent window via postMessage
class CSProActionInvoker {
    static $Impl = {
        nextRequestId: 1,
        callbacks: {},
        
        createMessage: function(aiThis, action, args, requestId) {
            return JSON.stringify({
                accessToken: aiThis ? aiThis.accessToken : null,
                action: action,
                arguments: (args === undefined || typeof args === "string") ? args : JSON.stringify(args),
                requestId: requestId,
                url: window.location.href
            });
        },
        
        processResponse: function(responseJson) {
            try {
                const response = typeof responseJson === 'string' ? JSON.parse(responseJson) : responseJson;
                if (response.type === "exception") {
                    throw new Error(response.value);
                }
                return response.value !== undefined ? response.value : response.result;
            } catch (e) {
                return responseJson;
            }
        },
        
        usingWindows: function() {
            return false; // Always false in web environment
        },
        
        run: function(aiThis, action, args) {
            // Synchronous calls - post message and return null (async required for real response)
            console.log('[CAPI Shim] sync action:', action, args);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'csproAction',
                    action: action,
                    args: args,
                    sync: true
                }, '*');
            }
            return null;
        },
        
        runAsync: function(aiThis, action, args) {
            const requestId = this.nextRequestId++;
            console.log('[CAPI Shim] async action:', action, 'requestId:', requestId);
            
            return new Promise((resolve, reject) => {
                this.callbacks[requestId] = { resolve, reject };
                
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'csproAction',
                        action: action,
                        args: args,
                        requestId: requestId
                    }, '*');
                }
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    if (this.callbacks[requestId]) {
                        delete this.callbacks[requestId];
                        reject(new Error('Action timed out'));
                    }
                }, 30000);
            });
        },
        
        processAsyncResponse: function(requestId, responseJson) {
            const callback = this.callbacks[requestId];
            if (callback) {
                delete this.callbacks[requestId];
                try {
                    callback.resolve(this.processResponse(responseJson));
                } catch (e) {
                    callback.reject(e);
                }
            }
        }
    };
    
    constructor(accessToken) {
        this.accessToken = accessToken;
    }
    
    getWindowForEventListener() {
        return window;
    }
    
    execute(args) { return CSProActionInvoker.$Impl.run(this, 11276, args); }
    executeAsync(args) { return CSProActionInvoker.$Impl.runAsync(this, 11276, args); }
    registerAccessToken(args) { return CSProActionInvoker.$Impl.run(this, 13052, args); }
    registerAccessTokenAsync(args) { return CSProActionInvoker.$Impl.runAsync(this, 13052, args); }
    
    // UI Actions
    UI = {
        alert: (args) => CSProActionInvoker.$Impl.run(this, 31133, args),
        alertAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 31133, args),
        closeDialog: (args) => CSProActionInvoker.$Impl.run(this, 60265, args),
        closeDialogAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 60265, args),
        getInputData: () => CSProActionInvoker.$Impl.run(this, 57200, undefined),
        getInputDataAsync: () => CSProActionInvoker.$Impl.runAsync(this, 57200, undefined),
        showDialog: (args) => CSProActionInvoker.$Impl.run(this, 49835, args),
        showDialogAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 49835, args)
    };
    
    // Logic Actions  
    Logic = {
        eval: (args) => CSProActionInvoker.$Impl.run(this, 50799, args),
        evalAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 50799, args),
        getSymbol: (args) => CSProActionInvoker.$Impl.run(this, 44034, args),
        getSymbolAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 44034, args),
        getSymbolValue: (args) => CSProActionInvoker.$Impl.run(this, 22923, args),
        getSymbolValueAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 22923, args),
        invoke: (args) => CSProActionInvoker.$Impl.run(this, 64685, args),
        invokeAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 64685, args),
        setSymbolValue: (args) => CSProActionInvoker.$Impl.run(this, 41685, args),
        setSymbolValueAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 41685, args)
    };
    
    // Application Actions
    Application = {
        getFormFile: (args) => CSProActionInvoker.$Impl.run(this, 49910, args),
        getFormFileAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 49910, args),
        getQuestionnaireContent: (args) => CSProActionInvoker.$Impl.run(this, 50614, args),
        getQuestionnaireContentAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 50614, args),
        getQuestionText: (args) => CSProActionInvoker.$Impl.run(this, 60242, args),
        getQuestionTextAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 60242, args)
    };
    
    // Data Actions
    Data = {
        getCase: (args) => CSProActionInvoker.$Impl.run(this, 36632, args),
        getCaseAsync: (args) => CSProActionInvoker.$Impl.runAsync(this, 36632, args)
    };
}

// Create global instances
window.CS = window.CS || {};
window.CS.actionInvoker = new CSProActionInvoker();

// Handle responses from parent
window.addEventListener('message', function(event) {
    if (event.data) {
        if (event.data.type === 'csproActionResponse') {
            CSProActionInvoker.$Impl.processAsyncResponse(
                event.data.requestId, 
                event.data.result
            );
        }
    }
});

console.log('[CAPI Shim] CSProActionInvoker initialized');
</script>`;
}

/**
 * Show CAPI panel with question text
 * @param {HTMLElement} capiPanel - CAPI panel element
 * @param {HTMLIFrameElement} capiIframe - CAPI iframe element
 * @param {Object} field - Current field object
 * @param {Object} pageResult - Page result from engine (may contain blockQuestionTextUrl)
 * @param {Object} engine - Engine instance for getting question text
 * @param {Object} wasmModule - WASM module for virtual file access
 * @param {boolean} isWasmBusy - Whether WASM is busy
 * @returns {Promise<void>}
 */
export async function showCAPI(capiPanel, capiIframe, field, pageResult, engine, wasmModule, isWasmBusy) {
    let questionText = field.questionText || '';
    let questionTextHtml = null;
    let questionTextUrl = field.questionTextUrl || null;
    
    // Check for block-level question text from page result
    if (!questionTextUrl && pageResult?.blockQuestionTextUrl) {
        questionTextUrl = pageResult.blockQuestionTextUrl;
    }
    
    // Also check field-level URL
    if (!questionTextUrl && pageResult?.fields?.[0]?.questionTextUrl) {
        questionTextUrl = pageResult.fields[0].questionTextUrl;
    }
    
    // Try to get question text from engine
    if (engine && typeof engine.getQuestionText === 'function' && !isWasmBusy) {
        try {
            let qtData = engine.getQuestionText();
            if (qtData && typeof qtData.then === 'function') {
                qtData = await qtData;
            }
            if (qtData) {
                if (qtData.questionTextHtml) {
                    questionTextHtml = qtData.questionTextHtml;
                } else if (qtData.questionTextUrl && !questionTextUrl) {
                    questionTextUrl = qtData.questionTextUrl;
                }
            }
        } catch (e) {
            if (!e.message?.includes('multiple async')) {
                console.warn('[CAPI] Could not get question text:', e);
            }
        }
    }
    
    // Try to read from WASM virtual file system
    if (!questionTextHtml && questionTextUrl && wasmModule) {
        try {
            if (typeof wasmModule.getVirtualFileContent === 'function') {
                const content = wasmModule.getVirtualFileContent(questionTextUrl);
                if (content && content.length > 0) {
                    questionTextHtml = content;
                }
            } else if (wasmModule.FS) {
                const virtualPath = questionTextUrl.replace('cspro-virtual://', '/');
                const content = wasmModule.FS.readFile(virtualPath, { encoding: 'utf8' });
                if (content) {
                    questionTextHtml = content;
                }
            }
        } catch (e) {
            console.log('[CAPI] Could not read question text file:', e.message);
        }
    }
    
    // Display content
    if (questionTextHtml) {
        displayCapiHtml(capiPanel, capiIframe, questionTextHtml);
    } else if (questionText) {
        displayCapiText(capiPanel, capiIframe, questionText);
    } else {
        hideCapiPanel(capiPanel);
    }
}

/**
 * Display HTML content in CAPI panel
 * @param {HTMLElement} capiPanel - CAPI panel element
 * @param {HTMLIFrameElement} capiIframe - CAPI iframe element
 * @param {string} html - HTML content
 */
export function displayCapiHtml(capiPanel, capiIframe, html) {
    // Revoke previous blob URL if exists
    if (capiIframe._blobUrl) {
        URL.revokeObjectURL(capiIframe._blobUrl);
    }
    
    // Modify HTML for web environment:
    // 1. Remove the native action-invoker.js script tag (it won't load in blob URL context)
    // 2. Inject our web-compatible shim
    let modifiedHtml = html;
    
    // Remove native action-invoker.js script tags (various patterns)
    modifiedHtml = modifiedHtml.replace(/<script[^>]*src=["'][^"']*action-invoker\.js["'][^>]*><\/script>/gi, '');
    modifiedHtml = modifiedHtml.replace(/<script[^>]*src=["']\/action-invoker\.js["'][^>]*><\/script>/gi, '');
    
    // Always inject the shim (since we removed the native script)
    const shim = getActionInvokerShim();
    if (modifiedHtml.includes('</head>')) {
        modifiedHtml = modifiedHtml.replace('</head>', shim + '</head>');
    } else if (modifiedHtml.includes('<body')) {
        modifiedHtml = modifiedHtml.replace('<body', shim + '<body');
    } else if (modifiedHtml.includes('<html')) {
        modifiedHtml = modifiedHtml.replace(/<html[^>]*>/, '$&<head>' + shim + '</head>');
    } else {
        modifiedHtml = shim + modifiedHtml;
    }
    
    // Create blob and load in iframe
    const blob = new Blob([modifiedHtml], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    capiIframe._blobUrl = blobUrl;
    capiIframe.src = blobUrl;
    
    capiPanel.classList.add('visible');
}

/**
 * Display plain text in CAPI panel
 * @param {HTMLElement} capiPanel - CAPI panel element
 * @param {HTMLIFrameElement} capiIframe - CAPI iframe element
 * @param {string} text - Plain text question
 */
export function displayCapiText(capiPanel, capiIframe, text) {
    const simpleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, sans-serif;
                    padding: 12px;
                    margin: 0;
                    background: linear-gradient(180deg, #ffffdd 0%, #ffffaa 100%);
                }
                .question {
                    font-size: 14px;
                    font-weight: 600;
                    color: #000080;
                }
            </style>
        </head>
        <body>
            <div class="question">${escapeHtml(text)}</div>
        </body>
        </html>
    `;
    displayCapiHtml(capiPanel, capiIframe, simpleHtml);
}

/**
 * Hide CAPI panel
 * @param {HTMLElement} capiPanel - CAPI panel element
 */
export function hideCapiPanel(capiPanel) {
    capiPanel.classList.remove('visible');
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Handle CAPI action message from iframe
 * @param {MessageEvent} event - Message event
 * @param {Object} component - CSEntryMFCView component instance (optional)
 * @param {Function} sendResponse - Function to send response back to iframe
 */
export async function handleCapiAction(event, component, sendResponse) {
    if (!event.data || event.data.type !== 'csproAction') return;
    
    const { action, args, requestId } = event.data;
    console.log('[CAPI] Action:', action, 'args:', args);
    
    // Get engine from component if available
    const engine = component?.engine;
    
    // Map numeric action codes to string names
    // These codes come from the native action-invoker.js
    const ACTION_CODES = {
        50799: 'Logic.eval',      // Logic.eval / Logic.evalAsync
        44034: 'Logic.getSymbol',
        22923: 'Logic.getSymbolValue',
        41927: 'Logic.invoke',
        65339: 'Logic.updateSymbolValue',
        60265: 'UI.closeDialog',
        57200: 'UI.getInputData',
        62732: 'UI.setDisplayOptions',
        48073: 'UI.alert',
        41655: 'UI.showDialog',
        // File
        37688: 'File.copy',
        23568: 'File.readBytes',
        43700: 'File.readLines',
        29118: 'File.readText',
        63893: 'File.writeBytes',
        55855: 'File.writeLines',
        60631: 'File.writeText',
        // Path
        20380: 'Path.createDirectory',
        36724: 'Path.getDirectoryListing',
        59076: 'Path.getPathInfo',
        62012: 'Path.selectFile',
        35645: 'Path.showFileDialog',
        // Sqlite
        36421: 'Sqlite.close',
        31287: 'Sqlite.exec',
        55316: 'Sqlite.open',
        40839: 'Sqlite.rekey'
    };
    
    // Convert numeric action code to string name
    const actionName = typeof action === 'number' ? (ACTION_CODES[action] || `action_${action}`) : action;
    
    // Handle common actions
    let result = null;
    let handled = true;
    
    // Helper function to call evalLogic via REST API when engine method not available
    const callEvalLogicViaApi = async (logicCode) => {
        // Try to get session ID from component or engine
        const sessionId = component?.engine?.getSessionId?.() || component?._sessionId;
        if (!sessionId) {
            console.warn('[CAPI] No session ID available for API call');
            return null;
        }
        
        console.log('[CAPI] Calling evalLogic via REST API, sessionId:', sessionId);
        try {
            const response = await fetch(`/api/cspro/session/${sessionId}/eval-logic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logic: logicCode })
            });
            const data = await response.json();
            console.log('[CAPI] API evalLogic result:', data);
            return data;
        } catch (err) {
            console.error('[CAPI] API evalLogic error:', err);
            return null;
        }
    };
    
    // Helper function to call invokeLogicFunction via REST API
    const callInvokeFunctionViaApi = async (functionName, args = {}) => {
        const sessionId = component?.engine?.getSessionId?.() || component?._sessionId;
        if (!sessionId) {
            console.warn('[CAPI] No session ID available for API call');
            return null;
        }
        
        console.log('[CAPI] Calling invokeFunction via REST API, sessionId:', sessionId);
        try {
            const response = await fetch(`/api/cspro/session/${sessionId}/invoke-function`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ functionName, arguments: args })
            });
            const data = await response.json();
            console.log('[CAPI] API invokeFunction result:', data);
            return data;
        } catch (err) {
            console.error('[CAPI] API invokeFunction error:', err);
            return null;
        }
    };

    // Helper to access WASM FS
    const getFS = () => component?._wasmModule?.FS;
    
    switch (actionName) {
        case 'Logic.eval':
            // Execute CSPro logic expression using full logic interpreter
            console.log('[CAPI] Logic.eval:', args);
            if (engine || component) {
                const logic = args?.logic || args;
                if (typeof logic === 'string') {
                    // Use evalLogic method if available, otherwise fall back to REST API
                    const doEvalLogic = async (logicCode) => {
                        let evalResult;
                        
                        if (typeof engine?.evalLogic === 'function') {
                            // Engine has evalLogic method (server proxy)
                            console.log('[CAPI] Using engine.evalLogic()');
                            evalResult = await engine.evalLogic(logicCode);
                        } else {
                            // Fall back to REST API
                            console.log('[CAPI] engine.evalLogic not available, using REST API');
                            evalResult = await callEvalLogicViaApi(logicCode);
                        }
                        
                        // Handle any dialogs that occurred during evaluation
                        // These were auto-acknowledged on the server but need to be shown to user
                        if (evalResult?.dialogs && Array.isArray(evalResult.dialogs) && evalResult.dialogs.length > 0) {
                            console.log('[CAPI] Dialogs occurred during evalLogic:', evalResult.dialogs);
                            for (const dialog of evalResult.dialogs) {
                                if (component && typeof component._showServerDialog === 'function') {
                                    // Show each dialog to the user (they were already auto-acknowledged)
                                    await component._showServerDialog(dialog);
                                } else if (dialog.dialogName === 'errmsg' && dialog.inputData?.message) {
                                    // Fallback: show errmsg in console if no handler
                                    console.warn('[CAPI] Server dialog (no handler):', dialog.inputData.message);
                                }
                            }
                        }
                        
                        // Handle the result - may contain page update
                        if (evalResult && evalResult.page && component && 
                            typeof component._handlePageResult === 'function') {
                            component._handlePageResult(evalResult.page);
                        } else if (evalResult && evalResult.success === false && evalResult.error) {
                            console.error('[CAPI] evalLogic error:', evalResult.error);
                        }
                        
                        return evalResult;
                    };
                    
                    // Execute the logic (handles both function calls and general expressions)
                    // Await the result to return it
                    try {
                        result = await doEvalLogic(logic);
                    } catch (err) {
                        console.error('[CAPI] evalLogic error:', err);
                        result = null;
                    }
                }
            } else {
                console.warn('[CAPI] No engine or component available for Logic.eval');
                result = true; // Don't block CAPI
            }
            break;
            
        case 'Logic.invoke':
            // Invoke a user-defined function directly
            console.log('[CAPI] Logic.invoke:', args);
            {
                const funcName = args?.function || args?.name;
                const funcArgs = args?.arguments || {};
                if (funcName) {
                    const doInvokeFunction = async () => {
                        let invokeResult;
                        
                        if (typeof engine?.invokeLogicFunction === 'function') {
                            console.log('[CAPI] Using engine.invokeLogicFunction()');
                            invokeResult = await engine.invokeLogicFunction(funcName, funcArgs);
                        } else {
                            console.log('[CAPI] engine.invokeLogicFunction not available, using REST API');
                            invokeResult = await callInvokeFunctionViaApi(funcName, funcArgs);
                        }
                        
                        // Handle any dialogs that occurred during invocation
                        if (invokeResult?.dialogs && Array.isArray(invokeResult.dialogs) && invokeResult.dialogs.length > 0) {
                            console.log('[CAPI] Dialogs occurred during invokeFunction:', invokeResult.dialogs);
                            for (const dialog of invokeResult.dialogs) {
                                if (component && typeof component._showServerDialog === 'function') {
                                    await component._showServerDialog(dialog);
                                } else if (dialog.dialogName === 'errmsg' && dialog.inputData?.message) {
                                    console.warn('[CAPI] Server dialog (no handler):', dialog.inputData.message);
                                }
                            }
                        }
                        
                        if (invokeResult && invokeResult.page && component && 
                            typeof component._handlePageResult === 'function') {
                            component._handlePageResult(invokeResult.page);
                        }
                        
                        return invokeResult;
                    };
                    
                    try {
                        result = await doInvokeFunction();
                    } catch (err) {
                        console.error('[CAPI] invokeLogicFunction error:', err);
                        result = null;
                    }
                }
            }
            break;

        // File Namespace Implementation
        case 'File.readText':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path || args;
                        result = FS.readFile(path, { encoding: 'utf8' });
                    } catch (e) { console.warn('File.readText failed:', e); result = null; }
                }
            }
            break;
        case 'File.writeText':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path;
                        const content = args?.text || args?.content;
                        FS.writeFile(path, content);
                        if (component && component.syncStorage) component.syncStorage();
                        result = true;
                    } catch (e) { console.warn('File.writeText failed:', e); result = false; }
                }
            }
            break;
        case 'File.readLines':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path || args;
                        const content = FS.readFile(path, { encoding: 'utf8' });
                        result = content.split(/\r?\n/);
                    } catch (e) { console.warn('File.readLines failed:', e); result = []; }
                }
            }
            break;
        case 'File.writeLines':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path;
                        const lines = args?.lines || [];
                        FS.writeFile(path, lines.join('\n'));
                        if (component && component.syncStorage) component.syncStorage();
                        result = true;
                    } catch (e) { console.warn('File.writeLines failed:', e); result = false; }
                }
            }
            break;

        // Path Namespace Implementation
        case 'Path.createDirectory':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path || args;
                        FS.mkdir(path);
                        if (component && component.syncStorage) component.syncStorage();
                        result = true;
                    } catch (e) { 
                        if (e.code === 'EEXIST') result = true;
                        else { console.warn('Path.createDirectory failed:', e); result = false; }
                    }
                }
            }
            break;
        case 'Path.getDirectoryListing':
            {
                const FS = getFS();
                if (FS) {
                    try {
                        const path = args?.path || '/';
                        const entries = FS.readdir(path).filter(x => x !== '.' && x !== '..');
                        result = { path, paths: entries, parent: path === '/' ? null : '..' };
                    } catch (e) { console.warn('Path.getDirectoryListing failed:', e); result = { path: args?.path, paths: [] }; }
                }
            }
            break;
        case 'Path.selectFile':
            // Ask user to select between local file system and OPFS file system
            // For now, we'll implement a simple file picker that uploads to WASM FS
            if (component) {
                // TODO: Implement UI to choose between Local/OPFS
                // For now, trigger browser file picker
                result = await new Promise((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.onchange = async (e) => {
                        if (e.target.files.length > 0) {
                            const file = e.target.files[0];
                            // Upload to WASM FS
                            const FS = getFS();
                            if (FS) {
                                const buffer = await file.arrayBuffer();
                                const targetPath = '/data/' + file.name;
                                try {
                                    FS.writeFile(targetPath, new Uint8Array(buffer));
                                    if (component && component.syncStorage) component.syncStorage();
                                    resolve(targetPath);
                                } catch (err) {
                                    console.error('Failed to write file:', err);
                                    resolve(null);
                                }
                            } else {
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    };
                    input.click();
                });
            }
            break;

        // System Namespace
        case 'System.exec':
            console.log('[CAPI] System.exec:', args);
            // Call server API to execute command
            if (component) {
                 const sessionId = component._sessionId;
                 if (sessionId) {
                     try {
                         const response = await fetch(`/api/cspro/session/${sessionId}/exec`, {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ command: args })
                         });
                         const data = await response.json();
                         result = data.success ? 1 : 0;
                     } catch (e) {
                         console.error('[CAPI] System.exec failed:', e);
                         result = 0;
                     }
                 } else {
                     console.warn('[CAPI] System.exec: No session ID (client-side mode)');
                     result = 0;
                 }
            }
            break;

        // Sqlite Namespace (Stub/Pass-through)
        case 'Sqlite.open':
        case 'Sqlite.exec':
        case 'Sqlite.close':
            // If engine supports it, call engine
            // Otherwise, we can't easily do it from JS without direct access to SQLite symbols
            if (engine && engine.sqliteExec) {
                 // Assuming engine exposes a generic sqliteExec
                 result = await engine.sqliteExec(actionName.split('.')[1], args);
            } else {
                console.warn('Sqlite actions not fully implemented in Web CAPI yet');
                result = false;
            }
            break;

            
        case 'Logic.getSymbolValue':
            if (engine && typeof engine.getFieldValue === 'function') {
                result = engine.getFieldValue(args?.name || args);
            }
            break;
            
        case 'Logic.setSymbolValue':
        case 'Logic.updateSymbolValue':
            if (engine && typeof engine.setFieldValue === 'function') {
                engine.setFieldValue(args?.name || args?.symbol, args?.value);
                result = true;
            }
            break;
            
        case 'UI.endRoster':
        case 'endRoster':
            // End current roster and move to next field - MUST use engine
            console.log('[CAPI] endRoster - calling engine.endRoster()');
            if (engine && typeof engine.endRoster === 'function') {
                engine.endRoster().then(endResult => {
                    console.log('[CAPI] endRoster result:', endResult);
                    if (engine.getCurrentPage) {
                        engine.getCurrentPage().then(pageResult => {
                            if (component && typeof component._handlePageResult === 'function') {
                                component._handlePageResult(pageResult);
                            }
                        }).catch(err => {
                            console.error('[CAPI] getCurrentPage after endRoster error:', err);
                        });
                    }
                }).catch(err => {
                    console.error('[CAPI] endRoster error:', err);
                });
                result = true;
            } else if (engine && typeof engine.endGroup === 'function') {
                // endGroup takes no arguments in WASM bindings
                engine.endGroup().then(endResult => {
                    console.log('[CAPI] endGroup result:', endResult);
                    if (component && endResult && typeof component._handlePageResult === 'function') {
                        component._handlePageResult(endResult);
                    }
                }).catch(err => {
                    console.error('[CAPI] endGroup error:', err);
                });
                result = true;
            } else {
                console.warn('[CAPI] No engine.endRoster or endGroup available');
                result = true;
            }
            break;
            
        case 'UI.endGroup':
        case 'endGroup':
            // End current group - MUST use engine (no arguments in WASM bindings)
            console.log('[CAPI] endGroup - calling engine.endGroup()');
            if (engine && typeof engine.endGroup === 'function') {
                engine.endGroup().then(endResult => {
                    console.log('[CAPI] endGroup result:', endResult);
                    if (component && endResult && typeof component._handlePageResult === 'function') {
                        component._handlePageResult(endResult);
                    } else if (engine && engine.getCurrentPage) {
                        engine.getCurrentPage().then(pageResult => {
                            if (component && typeof component._handlePageResult === 'function') {
                                component._handlePageResult(pageResult);
                            }
                        }).catch(err => {
                            console.error('[CAPI] getCurrentPage after endGroup error:', err);
                        });
                    }
                }).catch(err => {
                    console.error('[CAPI] endGroup error:', err);
                });
                result = true;
            } else {
                console.warn('[CAPI] No engine.endGroup available');
                result = true;
            }
            break;
            
        case 'UI.advanceTo':
        case 'advanceTo':
            // Advance to specific field
            console.log('[CAPI] advanceTo:', args);
            if (component && typeof component.goToField === 'function') {
                component.goToField(args?.field || args);
                result = true;
            }
            break;
            
        case 'UI.setValue':
        case 'setValue':
            // Set field value
            console.log('[CAPI] setValue:', args);
            if (engine && typeof engine.setFieldValue === 'function') {
                engine.setFieldValue(args?.field || args?.name, args?.value);
                result = true;
            }
            break;
            
        case 'UI.showMessage':
        case 'showMessage':
            // Show a message dialog using native CSPro errmsg
            console.log('[CAPI] showMessage:', args);
            if (component && typeof component._showMessage === 'function') {
                // _showMessage now uses native CSPro errmsg dialog
                component._showMessage(args?.message || args, args?.title || '');
                result = true;
            } else {
                // Fallback to console log instead of browser alert
                console.warn('[CAPI] Message (no handler):', args?.message || args);
                result = true;
            }
            break;
            
        case 'UI.closeDialog':
            // Close dialog - this shouldn't typically come from CAPI but handle it
            console.log('[CAPI] closeDialog:', args);
            result = true;
            break;
            
        default:
            console.log('[CAPI] Unhandled action:', actionName, '(original:', action, ')', args);
            handled = false;
            // For unhandled actions, just return true to not block CAPI
            result = true;
    }
    
    // Send response back
    if (requestId && sendResponse) {
        sendResponse({
            type: 'csproActionResponse',
            requestId: requestId,
            result: result,
            handled: handled
        });
    }
}

/**
 * Set up CAPI iframe message listener
 * @param {Window} window - Window object
 * @param {Object} component - CSEntryMFCView component instance
 * @param {HTMLIFrameElement} capiIframe - CAPI iframe element
 */
export function setupCapiMessageListener(window, component, capiIframe) {
    window.addEventListener('message', (event) => {
        // Only accept messages from our iframe
        if (capiIframe && event.source === capiIframe.contentWindow) {
            handleCapiAction(event, component, (response) => {
                capiIframe.contentWindow?.postMessage(response, '*');
            });
        }
    });
}
