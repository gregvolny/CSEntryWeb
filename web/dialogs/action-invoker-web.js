/**
 * Web-based CSProActionInvoker for iframe dialogs
 * 
 * This is a complete web implementation of the native CSProActionInvoker API.
 * It communicates with the parent window via postMessage instead of native host objects.
 * 
 * Dialog Communication Flow:
 * 1. Dialog HTML loads this script
 * 2. Dialog creates: const CS = new CSProActionInvoker(token)
 * 3. Dialog signals ready: parent receives 'cspro-dialog-ready'
 * 4. Parent sends input data: 'cspro-dialog-init' message
 * 5. Dialog uses CS.UI.getInputData() to get the data
 * 6. Dialog closes with CS.UI.closeDialog(result)
 * 7. Parent receives 'cspro-dialog-close' message with result
 */

// Global state shared across all CSProActionInvoker instances in this frame
const CSProActionInvokerState = {
    inputData: null,
    displayOptions: {},
    accessToken: '',
    initialized: false,
    pendingCallbacks: new Map(),
    nextRequestId: 1,
    
    // Message system settings
    messageCache: {},  // Cache for Message.getText lookups
};

/**
 * CSProActionInvoker - Web implementation
 * API-compatible with the native action-invoker.js
 */
class CSProActionInvoker {
    constructor(accessToken) {
        this.accessToken = accessToken || '';
        CSProActionInvokerState.accessToken = this.accessToken;
        
        // Initialize namespaces with proper 'this' binding
        this._initNamespaces();
    }
    
    _initNamespaces() {
        const self = this;
        
        // ========================================
        // UI Namespace - Critical for dialogs
        // ========================================
        this.UI = {
            alert: (args) => {
                const message = typeof args === 'string' ? args : (args?.message || '');
                const title = args?.title || '';
                if (title) {
                    alert(`${title}\n\n${message}`);
                } else {
                    alert(message);
                }
                return null;
            },
            alertAsync: (args) => Promise.resolve(self.UI.alert(args)),
            
            closeDialog: (args) => {
                console.log('[ActionInvoker.Web] UI.closeDialog:', args);
                window.parent.postMessage({
                    type: 'cspro-dialog-close',
                    result: args
                }, '*');
                return null;
            },
            closeDialogAsync: (args) => Promise.resolve(self.UI.closeDialog(args)),
            
            enumerateWebViews: () => [],
            enumerateWebViewsAsync: () => Promise.resolve([]),
            
            getDisplayOptions: () => ({ ...CSProActionInvokerState.displayOptions }),
            getDisplayOptionsAsync: () => Promise.resolve(self.UI.getDisplayOptions()),
            
            getInputData: () => {
                console.log('[ActionInvoker.Web] UI.getInputData:', CSProActionInvokerState.inputData);
                return CSProActionInvokerState.inputData || {};
            },
            getInputDataAsync: () => Promise.resolve(self.UI.getInputData()),
            
            getMaxDisplayDimensions: () => ({
                width: window.innerWidth || 800,
                height: window.innerHeight || 600
            }),
            getMaxDisplayDimensionsAsync: () => Promise.resolve(self.UI.getMaxDisplayDimensions()),
            
            postWebMessage: (args) => {
                window.parent.postMessage({
                    type: 'cspro-web-message',
                    data: args
                }, '*');
                return null;
            },
            postWebMessageAsync: (args) => Promise.resolve(self.UI.postWebMessage(args)),
            
            setDisplayOptions: (args) => {
                Object.assign(CSProActionInvokerState.displayOptions, args);
                // Notify parent of size changes
                if (args.width || args.height) {
                    window.parent.postMessage({
                        type: 'cspro-dialog-resize',
                        width: args.width,
                        height: args.height
                    }, '*');
                }
                return null;
            },
            setDisplayOptionsAsync: (args) => Promise.resolve(self.UI.setDisplayOptions(args)),
            
            showDialog: (args) => self._notSupportedSync('UI.showDialog'),
            showDialogAsync: (args) => self._notSupportedAsync('UI.showDialogAsync'),
            
            view: (args) => {
                // Open URL in new window/tab
                if (args?.url) {
                    window.open(args.url, '_blank');
                }
                return null;
            },
            viewAsync: (args) => Promise.resolve(self.UI.view(args))
        };
        
        // ========================================
        // Message Namespace - Used by dialogs for localization
        // ========================================
        this.Message = {
            formatText: (args) => {
                // Simple format text implementation
                let text = args?.text || '';
                if (args?.arguments) {
                    args.arguments.forEach((arg, i) => {
                        text = text.replace(`%${i+1}`, String(arg));
                        text = text.replace('%s', String(arg));
                        text = text.replace('%d', String(arg));
                    });
                }
                return text;
            },
            formatTextAsync: (args) => Promise.resolve(self.Message.formatText(args)),
            
            getText: (args) => {
                // Return default text or cached message
                const key = `${args?.type || 'system'}_${args?.number || 0}`;
                if (CSProActionInvokerState.messageCache[key]) {
                    return CSProActionInvokerState.messageCache[key];
                }
                // Return default text if provided, otherwise generic message
                return args?.text || `Message ${args?.number || 0}`;
            },
            getTextAsync: (args) => Promise.resolve(self.Message.getText(args))
        };
        
        // ========================================
        // Path Namespace - File system operations (stubbed for web)
        // ========================================
        this.Path = {
            createDirectory: (args) => {
                console.warn('[ActionInvoker.Web] Path.createDirectory not supported in web mode');
                return false;
            },
            createDirectoryAsync: (args) => Promise.resolve(false),
            
            getDirectoryListing: (args) => {
                console.warn('[ActionInvoker.Web] Path.getDirectoryListing returning empty list');
                return {
                    path: args?.path || '/',
                    paths: [],
                    parent: null
                };
            },
            getDirectoryListingAsync: (args) => Promise.resolve(self.Path.getDirectoryListing(args)),
            
            getPathInfo: (args) => {
                const path = args?.path || '';
                const parts = path.split(/[/\\]/);
                const name = parts.pop() || '';
                const ext = name.includes('.') ? name.split('.').pop() : '';
                return {
                    path: path,
                    name: name,
                    extension: ext,
                    type: 'file',
                    exists: false
                };
            },
            getPathInfoAsync: (args) => Promise.resolve(self.Path.getPathInfo(args)),
            
            getSpecialPaths: () => {
                // Return empty special paths for web
                return {};
            },
            getSpecialPathsAsync: () => Promise.resolve({}),
            
            selectFile: (args) => self._notSupportedSync('Path.selectFile'),
            selectFileAsync: (args) => self._notSupportedAsync('Path.selectFileAsync'),
            
            showFileDialog: (args) => self._notSupportedSync('Path.showFileDialog'),
            showFileDialogAsync: (args) => self._notSupportedAsync('Path.showFileDialogAsync')
        };
        
        // ========================================
        // Application Namespace
        // ========================================
        this.Application = {
            getFormFile: () => self._notSupportedSync('Application.getFormFile'),
            getFormFileAsync: () => self._notSupportedAsync('Application.getFormFileAsync'),
            getQuestionnaireContent: () => self._notSupportedSync('Application.getQuestionnaireContent'),
            getQuestionnaireContentAsync: () => self._notSupportedAsync('Application.getQuestionnaireContentAsync'),
            getQuestionText: () => self._notSupportedSync('Application.getQuestionText'),
            getQuestionTextAsync: () => self._notSupportedAsync('Application.getQuestionTextAsync')
        };
        
        // ========================================
        // Clipboard Namespace
        // ========================================
        this.Clipboard = {
            getText: () => {
                // Clipboard API requires async - return empty for sync
                console.warn('[ActionInvoker.Web] Clipboard.getText sync not supported, use async');
                return '';
            },
            getTextAsync: async () => {
                try {
                    return await navigator.clipboard.readText();
                } catch (e) {
                    console.warn('[ActionInvoker.Web] Clipboard read failed:', e);
                    return '';
                }
            },
            putText: (args) => {
                const text = typeof args === 'string' ? args : (args?.text || '');
                navigator.clipboard.writeText(text).catch(e => 
                    console.warn('[ActionInvoker.Web] Clipboard write failed:', e)
                );
                return null;
            },
            putTextAsync: async (args) => {
                const text = typeof args === 'string' ? args : (args?.text || '');
                await navigator.clipboard.writeText(text);
                return null;
            }
        };
        
        // ========================================
        // Data Namespace
        // ========================================
        this.Data = {
            getCase: () => self._notSupportedSync('Data.getCase'),
            getCaseAsync: () => self._notSupportedAsync('Data.getCaseAsync')
        };
        
        // ========================================
        // Dictionary Namespace
        // ========================================
        this.Dictionary = {
            getDictionary: () => self._notSupportedSync('Dictionary.getDictionary'),
            getDictionaryAsync: () => self._notSupportedAsync('Dictionary.getDictionaryAsync')
        };
        
        // ========================================
        // File Namespace
        // ========================================
        this.File = {
            copy: () => self._notSupportedSync('File.copy'),
            copyAsync: () => self._notSupportedAsync('File.copyAsync'),
            readBytes: () => self._notSupportedSync('File.readBytes'),
            readBytesAsync: () => self._notSupportedAsync('File.readBytesAsync'),
            readLines: () => self._notSupportedSync('File.readLines'),
            readLinesAsync: () => self._notSupportedAsync('File.readLinesAsync'),
            readText: () => self._notSupportedSync('File.readText'),
            readTextAsync: () => self._notSupportedAsync('File.readTextAsync'),
            writeBytes: () => self._notSupportedSync('File.writeBytes'),
            writeBytesAsync: () => self._notSupportedAsync('File.writeBytesAsync'),
            writeLines: () => self._notSupportedSync('File.writeLines'),
            writeLinesAsync: () => self._notSupportedAsync('File.writeLinesAsync'),
            writeText: () => self._notSupportedSync('File.writeText'),
            writeTextAsync: () => self._notSupportedAsync('File.writeTextAsync')
        };
        
        // ========================================
        // Hash Namespace
        // ========================================
        this.Hash = {
            createHash: () => self._notSupportedSync('Hash.createHash'),
            createHashAsync: () => self._notSupportedAsync('Hash.createHashAsync'),
            createMd5: () => self._notSupportedSync('Hash.createMd5'),
            createMd5Async: () => self._notSupportedAsync('Hash.createMd5Async')
        };
        
        // ========================================
        // Localhost Namespace
        // ========================================
        this.Localhost = {
            mapActionResult: () => self._notSupportedSync('Localhost.mapActionResult'),
            mapActionResultAsync: () => self._notSupportedAsync('Localhost.mapActionResultAsync'),
            mapFile: () => self._notSupportedSync('Localhost.mapFile'),
            mapFileAsync: () => self._notSupportedAsync('Localhost.mapFileAsync'),
            mapSymbol: () => self._notSupportedSync('Localhost.mapSymbol'),
            mapSymbolAsync: () => self._notSupportedAsync('Localhost.mapSymbolAsync'),
            mapText: () => self._notSupportedSync('Localhost.mapText'),
            mapTextAsync: () => self._notSupportedAsync('Localhost.mapTextAsync')
        };
        
        // ========================================
        // Logic Namespace
        // ========================================
        this.Logic = {
            eval: () => self._notSupportedSync('Logic.eval'),
            evalAsync: () => self._notSupportedAsync('Logic.evalAsync'),
            getSymbol: () => self._notSupportedSync('Logic.getSymbol'),
            getSymbolAsync: () => self._notSupportedAsync('Logic.getSymbolAsync'),
            getSymbolMetadata: () => self._notSupportedSync('Logic.getSymbolMetadata'),
            getSymbolMetadataAsync: () => self._notSupportedAsync('Logic.getSymbolMetadataAsync'),
            getSymbolValue: () => self._notSupportedSync('Logic.getSymbolValue'),
            getSymbolValueAsync: () => self._notSupportedAsync('Logic.getSymbolValueAsync'),
            invoke: () => self._notSupportedSync('Logic.invoke'),
            invokeAsync: () => self._notSupportedAsync('Logic.invokeAsync'),
            updateSymbolValue: () => self._notSupportedSync('Logic.updateSymbolValue'),
            updateSymbolValueAsync: () => self._notSupportedAsync('Logic.updateSymbolValueAsync')
        };
        
        // ========================================
        // Settings Namespace
        // ========================================
        this.Settings = {
            getValue: (args) => {
                // Use localStorage as a fallback for settings
                const key = args?.key || args;
                if (typeof key === 'string') {
                    try {
                        return localStorage.getItem(`cspro_setting_${key}`);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            getValueAsync: (args) => Promise.resolve(self.Settings.getValue(args)),
            
            putValue: (args) => {
                const key = args?.key;
                const value = args?.value;
                if (typeof key === 'string') {
                    try {
                        if (value === null || value === undefined) {
                            localStorage.removeItem(`cspro_setting_${key}`);
                        } else {
                            localStorage.setItem(`cspro_setting_${key}`, String(value));
                        }
                    } catch (e) {
                        console.warn('[ActionInvoker.Web] Settings.putValue failed:', e);
                    }
                }
                return null;
            },
            putValueAsync: (args) => Promise.resolve(self.Settings.putValue(args))
        };
        
        // ========================================
        // Sqlite Namespace
        // ========================================
        this.Sqlite = {
            close: () => self._notSupportedSync('Sqlite.close'),
            closeAsync: () => self._notSupportedAsync('Sqlite.closeAsync'),
            exec: () => self._notSupportedSync('Sqlite.exec'),
            execAsync: () => self._notSupportedAsync('Sqlite.execAsync'),
            open: () => self._notSupportedSync('Sqlite.open'),
            openAsync: () => self._notSupportedAsync('Sqlite.openAsync'),
            rekey: () => self._notSupportedSync('Sqlite.rekey'),
            rekeyAsync: () => self._notSupportedAsync('Sqlite.rekeyAsync')
        };
        
        // ========================================
        // System Namespace
        // ========================================
        this.System = {
            getSharableUri: () => self._notSupportedSync('System.getSharableUri'),
            getSharableUriAsync: () => self._notSupportedAsync('System.getSharableUriAsync'),
            selectDocument: () => self._notSupportedSync('System.selectDocument'),
            selectDocumentAsync: () => self._notSupportedAsync('System.selectDocumentAsync')
        };
    }
    
    // ========================================
    // Top-level methods
    // ========================================
    
    execute(args) {
        return this._notSupportedSync('execute');
    }
    
    executeAsync(args) {
        return this._notSupportedAsync('executeAsync');
    }
    
    registerAccessToken(args) {
        CSProActionInvokerState.accessToken = args?.accessToken || args || '';
        return null;
    }
    
    registerAccessTokenAsync(args) {
        return Promise.resolve(this.registerAccessToken(args));
    }
    
    getWindowForEventListener() {
        return window;
    }
    
    // ========================================
    // Internal methods
    // ========================================
    
    /**
     * Set input data from parent frame
     * @internal
     */
    _setInputData(data) {
        CSProActionInvokerState.inputData = data;
        CSProActionInvokerState.initialized = true;
        console.log('[ActionInvoker.Web] Input data set:', data);
    }
    
    /**
     * Set display options from parent frame
     * @internal
     */
    _setDisplayOptions(options) {
        Object.assign(CSProActionInvokerState.displayOptions, options);
    }
    
    /**
     * Handle unsupported sync operations
     * @private
     */
    _notSupportedSync(methodName) {
        console.warn(`[ActionInvoker.Web] ${methodName} not supported in web mode`);
        return null;
    }
    
    /**
     * Handle unsupported async operations
     * @private
     */
    _notSupportedAsync(methodName) {
        console.warn(`[ActionInvoker.Web] ${methodName} not supported in web mode`);
        return Promise.resolve(null);
    }
}

// ========================================
// Message listener for parent communication
// ========================================
window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;
    
    console.log('[ActionInvoker.Web] Message received:', event.data.type, event.data);
    
    switch (event.data.type) {
        case 'cspro-dialog-init':
            // Received input data from parent
            console.log('[ActionInvoker.Web] cspro-dialog-init - inputData:', event.data.inputData);
            console.log('[ActionInvoker.Web] cspro-dialog-init - inputData.multiple:', event.data.inputData?.multiple);
            CSProActionInvokerState.inputData = event.data.inputData;
            CSProActionInvokerState.initialized = true;
            
            if (event.data.accessToken) {
                CSProActionInvokerState.accessToken = event.data.accessToken;
            }
            if (event.data.displayOptions) {
                Object.assign(CSProActionInvokerState.displayOptions, event.data.displayOptions);
            }
            if (event.data.messageCache) {
                Object.assign(CSProActionInvokerState.messageCache, event.data.messageCache);
            }
            
            console.log('[ActionInvoker.Web] Initialized with input:', CSProActionInvokerState.inputData);
            console.log('[ActionInvoker.Web] Dispatching cspro-input-ready event');
            
            // Dispatch event for dialogs that listen for it
            window.dispatchEvent(new CustomEvent('cspro-input-ready', {
                detail: { inputData: event.data.inputData }
            }));
            console.log('[ActionInvoker.Web] cspro-input-ready event dispatched');
            break;
            
        case 'cspro-action-response':
            // Response from parent for async action
            const { requestId, result, error } = event.data;
            const callback = CSProActionInvokerState.pendingCallbacks.get(requestId);
            if (callback) {
                CSProActionInvokerState.pendingCallbacks.delete(requestId);
                if (error) {
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(result);
                }
            }
            break;
    }
});

// Make available globally
window.CSProActionInvoker = CSProActionInvoker;

// Alias for backward compatibility with web state checks
window.CSProActionInvokerWebState = CSProActionInvokerState;

// CSProEnvironment for web mode - used by select.html and other dialogs
window.CSProEnvironment = {
    isWebMode: function() {
        // In action-invoker-web.js context, we ARE in web mode
        return true;
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSProActionInvoker, CSProActionInvokerState };
}
