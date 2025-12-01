/**
 * Unified CSProActionInvoker - Combines native and web implementations
 * 
 * This is the main entry point for CSProActionInvoker used by all CSPro HTML content.
 * It automatically detects the runtime environment and routes to the appropriate implementation:
 * 
 * - Native mode: Uses AndroidActionInvoker (Android) or window.chrome.webview (Windows)
 * - Web mode: Uses postMessage communication with parent iframe (web browser)
 * 
 * Detection Priority:
 * 1. AndroidActionInvoker object exists -> Native Android
 * 2. window.chrome.webview.hostObjects exists -> Native Windows WebView2
 * 3. Running in iframe with parent -> Web mode
 * 4. None of above -> Web mode fallback
 */

// ============================================================================
// Environment Detection
// ============================================================================

const CSProEnvironment = {
    // Check for Android native host
    isAndroid: function() {
        return typeof AndroidActionInvoker !== 'undefined';
    },
    
    // Check for Windows WebView2 native host
    isWindowsWebView: function() {
        try {
            return !!(window.chrome && window.chrome.webview && 
                     window.chrome.webview.hostObjects && 
                     window.chrome.webview.hostObjects.sync &&
                     window.chrome.webview.hostObjects.sync.cspro);
        } catch (e) {
            return false;
        }
    },
    
    // Check if we're running in web mode (iframe or standalone browser)
    isWebMode: function() {
        return !this.isAndroid() && !this.isWindowsWebView();
    },
    
    // Check if running in an iframe
    isInIframe: function() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true; // Cross-origin iframe
        }
    },
    
    // Get detected environment name
    getEnvironmentName: function() {
        if (this.isAndroid()) return 'Android';
        if (this.isWindowsWebView()) return 'WindowsWebView2';
        if (this.isInIframe()) return 'WebIframe';
        return 'WebStandalone';
    }
};

// ============================================================================
// Web Mode State (shared across instances when in web mode)
// ============================================================================

const CSProActionInvokerWebState = {
    inputData: null,
    displayOptions: {},
    accessToken: '',
    initialized: false,
    pendingCallbacks: new Map(),
    nextRequestId: 1,
    messageCache: {}
};

// ============================================================================
// Native Implementation Details
// ============================================================================

const NativeActionInvokerImpl = {
    createMessage: function(action, accessToken, args) {
        return JSON.stringify({
            action: action,
            accessToken: accessToken,
            arguments: args
        });
    },

    processResponse: function(response) {
        if (response) {
            response = JSON.parse(response);
            if (response.result !== undefined) {
                return response.result;
            }
        }
        return undefined;
    },

    usingWindows: function() {
        return CSProEnvironment.isWindowsWebView();
    },

    run: function(message) {
        if (this.usingWindows()) {
            return window.chrome.webview.hostObjects.sync.cspro.run(message);
        } else if (CSProEnvironment.isAndroid()) {
            return AndroidActionInvoker.run(message);
        }
        return null;
    },

    runAsync: function(message) {
        if (this.usingWindows()) {
            return window.chrome.webview.hostObjects.cspro.run(message);
        } else if (CSProEnvironment.isAndroid()) {
            // Android async handling with callbacks
            return new Promise((resolve, reject) => {
                const requestId = NativeActionInvokerImpl.nextRequestId++;
                NativeActionInvokerImpl.callbacks[requestId] = { resolve, reject };
                AndroidActionInvoker.runAsync(requestId, message);
            });
        }
        return Promise.resolve(null);
    },

    nextRequestId: 1,
    callbacks: {},

    processAsyncResponse: function(requestId, response) {
        const callback = this.callbacks[requestId];
        if (callback) {
            delete this.callbacks[requestId];
            callback.resolve(response);
        }
    }
};

// Global callback handler for Android async responses
window.CSProActionInvoker_processAsyncResponse = function(requestId, response) {
    NativeActionInvokerImpl.processAsyncResponse(requestId, response);
};

// ============================================================================
// CSProActionInvoker Class - Unified Implementation
// ============================================================================

class CSProActionInvoker {
    constructor(accessToken) {
        this.accessToken = accessToken || '';
        this._isWebMode = CSProEnvironment.isWebMode();
        
        // Store access token in web state if in web mode
        if (this._isWebMode) {
            CSProActionInvokerWebState.accessToken = this.accessToken;
        }
        
        // Initialize all namespaces
        this._initNamespaces();
        
        console.log(`[CSProActionInvoker] Initialized in ${CSProEnvironment.getEnvironmentName()} mode`);
    }
    
    // ========================================================================
    // Top-level methods
    // ========================================================================
    
    execute(args) {
        if (this._isWebMode) return this._webNotSupported('execute');
        return NativeActionInvokerImpl.processResponse(
            NativeActionInvokerImpl.run(
                NativeActionInvokerImpl.createMessage(11276, this.accessToken, args)));
    }
    
    executeAsync(args) {
        if (this._isWebMode) return this._webNotSupportedAsync('executeAsync');
        return NativeActionInvokerImpl.runAsync(
            NativeActionInvokerImpl.createMessage(11276, this.accessToken, args))
            .then(NativeActionInvokerImpl.processResponse);
    }
    
    registerAccessToken(args) {
        const token = args?.accessToken || args || '';
        this.accessToken = token;
        if (this._isWebMode) {
            CSProActionInvokerWebState.accessToken = token;
            return null;
        }
        return NativeActionInvokerImpl.processResponse(
            NativeActionInvokerImpl.run(
                NativeActionInvokerImpl.createMessage(13052, this.accessToken, args)));
    }
    
    registerAccessTokenAsync(args) {
        return Promise.resolve(this.registerAccessToken(args));
    }
    
    getWindowForEventListener() {
        return NativeActionInvokerImpl.usingWindows() ? window.chrome.webview : window;
    }
    
    // ========================================================================
    // Namespace Initialization
    // ========================================================================
    
    _initNamespaces() {
        const self = this;
        
        // ====================================================================
        // Application Namespace
        // ====================================================================
        this.Application = {
            getFormFile: (args) => {
                if (self._isWebMode) return self._webNotSupported('Application.getFormFile');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(49910, self.accessToken, args)));
            },
            getFormFileAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Application.getFormFileAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(49910, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getQuestionnaireContent: (args) => {
                if (self._isWebMode) return self._webNotSupported('Application.getQuestionnaireContent');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(50614, self.accessToken, args)));
            },
            getQuestionnaireContentAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Application.getQuestionnaireContentAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(50614, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getQuestionText: (args) => {
                if (self._isWebMode) return self._webNotSupported('Application.getQuestionText');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(60242, self.accessToken, args)));
            },
            getQuestionTextAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Application.getQuestionTextAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(60242, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Clipboard Namespace
        // ====================================================================
        this.Clipboard = {
            getText: (args) => {
                if (self._isWebMode) {
                    console.warn('[CSProActionInvoker.Web] Clipboard.getText sync not supported, use async');
                    return '';
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(35261, self.accessToken, args)));
            },
            getTextAsync: async (args) => {
                if (self._isWebMode) {
                    try {
                        return await navigator.clipboard.readText();
                    } catch (e) {
                        console.warn('[CSProActionInvoker.Web] Clipboard read failed:', e);
                        return '';
                    }
                }
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(35261, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            putText: (args) => {
                if (self._isWebMode) {
                    const text = typeof args === 'string' ? args : (args?.text || '');
                    navigator.clipboard.writeText(text).catch(e =>
                        console.warn('[CSProActionInvoker.Web] Clipboard write failed:', e));
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(11951, self.accessToken, args)));
            },
            putTextAsync: async (args) => {
                if (self._isWebMode) {
                    const text = typeof args === 'string' ? args : (args?.text || '');
                    await navigator.clipboard.writeText(text);
                    return null;
                }
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(11951, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Data Namespace
        // ====================================================================
        this.Data = {
            getCase: (args) => {
                if (self._isWebMode) return self._webNotSupported('Data.getCase');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(41948, self.accessToken, args)));
            },
            getCaseAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Data.getCaseAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(41948, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Dictionary Namespace
        // ====================================================================
        this.Dictionary = {
            getDictionary: (args) => {
                if (self._isWebMode) return self._webNotSupported('Dictionary.getDictionary');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(41903, self.accessToken, args)));
            },
            getDictionaryAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Dictionary.getDictionaryAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(41903, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // File Namespace
        // ====================================================================
        this.File = {
            copy: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.copy');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(37688, self.accessToken, args)));
            },
            copyAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.copyAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(37688, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            readBytes: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.readBytes');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(23568, self.accessToken, args)));
            },
            readBytesAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.readBytesAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(23568, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            readLines: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.readLines');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(43700, self.accessToken, args)));
            },
            readLinesAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.readLinesAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(43700, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            readText: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.readText');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(29118, self.accessToken, args)));
            },
            readTextAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.readTextAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(29118, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            writeBytes: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.writeBytes');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(63893, self.accessToken, args)));
            },
            writeBytesAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.writeBytesAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(63893, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            writeLines: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.writeLines');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(55855, self.accessToken, args)));
            },
            writeLinesAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.writeLinesAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(55855, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            writeText: (args) => {
                if (self._isWebMode) return self._webNotSupported('File.writeText');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(60631, self.accessToken, args)));
            },
            writeTextAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('File.writeTextAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(60631, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Hash Namespace
        // ====================================================================
        this.Hash = {
            createHash: (args) => {
                if (self._isWebMode) return self._webNotSupported('Hash.createHash');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(48574, self.accessToken, args)));
            },
            createHashAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Hash.createHashAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(48574, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            createMd5: (args) => {
                if (self._isWebMode) return self._webNotSupported('Hash.createMd5');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(36972, self.accessToken, args)));
            },
            createMd5Async: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Hash.createMd5Async');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(36972, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Localhost Namespace
        // ====================================================================
        this.Localhost = {
            mapActionResult: (args) => {
                if (self._isWebMode) return self._webNotSupported('Localhost.mapActionResult');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(28814, self.accessToken, args)));
            },
            mapActionResultAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Localhost.mapActionResultAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(28814, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            mapFile: (args) => {
                if (self._isWebMode) return self._webNotSupported('Localhost.mapFile');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(14118, self.accessToken, args)));
            },
            mapFileAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Localhost.mapFileAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(14118, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            mapSymbol: (args) => {
                if (self._isWebMode) return self._webNotSupported('Localhost.mapSymbol');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(46155, self.accessToken, args)));
            },
            mapSymbolAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Localhost.mapSymbolAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(46155, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            mapText: (args) => {
                if (self._isWebMode) return self._webNotSupported('Localhost.mapText');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(56765, self.accessToken, args)));
            },
            mapTextAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('Localhost.mapTextAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(56765, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Logic Namespace - Critical for CAPI
        // ====================================================================
        this.Logic = {
            eval: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.eval');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(50799, self.accessToken, args)));
            },
            evalAsync: (args) => {
                if (self._isWebMode) {
                    // In web mode, we need to send this to the parent to route to WASM
                    return self._webProxyAction('Logic.evalAsync', args);
                }
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(50799, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getSymbol: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.getSymbol');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(44034, self.accessToken, args)));
            },
            getSymbolAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Logic.getSymbolAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(44034, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getSymbolMetadata: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.getSymbolMetadata');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(20174, self.accessToken, args)));
            },
            getSymbolMetadataAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Logic.getSymbolMetadataAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(20174, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getSymbolValue: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.getSymbolValue');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(22923, self.accessToken, args)));
            },
            getSymbolValueAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Logic.getSymbolValueAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(22923, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            invoke: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.invoke');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(41927, self.accessToken, args)));
            },
            invokeAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Logic.invokeAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(41927, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            updateSymbolValue: (args) => {
                if (self._isWebMode) return self._webNotSupported('Logic.updateSymbolValue');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(65339, self.accessToken, args)));
            },
            updateSymbolValueAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Logic.updateSymbolValueAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(65339, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Message Namespace - Used for localization
        // ====================================================================
        this.Message = {
            formatText: (args) => {
                if (self._isWebMode) {
                    // Web implementation - simple format
                    let text = args?.text || '';
                    if (args?.arguments) {
                        args.arguments.forEach((arg, i) => {
                            text = text.replace(`%${i+1}`, String(arg));
                            text = text.replace('%s', String(arg));
                            text = text.replace('%d', String(arg));
                        });
                    }
                    return text;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(31960, self.accessToken, args)));
            },
            formatTextAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.Message.formatText(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(31960, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getText: (args) => {
                if (self._isWebMode) {
                    // Return cached or default message
                    const key = `${args?.type || 'system'}_${args?.number || 0}`;
                    if (CSProActionInvokerWebState.messageCache[key]) {
                        return CSProActionInvokerWebState.messageCache[key];
                    }
                    return args?.text || `Message ${args?.number || 0}`;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(449, self.accessToken, args)));
            },
            getTextAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.Message.getText(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(449, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Path Namespace
        // ====================================================================
        this.Path = {
            createDirectory: (args) => {
                if (self._isWebMode) {
                    console.warn('[CSProActionInvoker.Web] Path.createDirectory not supported');
                    return false;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(20380, self.accessToken, args)));
            },
            createDirectoryAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.createDirectoryAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(20380, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getDirectoryListing: (args) => {
                if (self._isWebMode) {
                    console.warn('[CSProActionInvoker.Web] Path.getDirectoryListing returning empty');
                    return { path: args?.path || '/', paths: [], parent: null };
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(36724, self.accessToken, args)));
            },
            getDirectoryListingAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.getDirectoryListingAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(36724, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getPathInfo: (args) => {
                if (self._isWebMode) {
                    const path = args?.path || '';
                    const parts = path.split(/[/\\]/);
                    const name = parts.pop() || '';
                    const ext = name.includes('.') ? name.split('.').pop() : '';
                    return { path, name, extension: ext, type: 'file', exists: false };
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(59076, self.accessToken, args)));
            },
            getPathInfoAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.getPathInfoAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(59076, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getSpecialPaths: (args) => {
                if (self._isWebMode) return {};
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(41709, self.accessToken, args)));
            },
            getSpecialPathsAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.getSpecialPathsAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(41709, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            selectFile: (args) => {
                if (self._isWebMode) return self._webNotSupported('Path.selectFile');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(62012, self.accessToken, args)));
            },
            selectFileAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.selectFileAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(62012, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            showFileDialog: (args) => {
                if (self._isWebMode) return self._webNotSupported('Path.showFileDialog');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(35645, self.accessToken, args)));
            },
            showFileDialogAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Path.showFileDialogAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(35645, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Settings Namespace
        // ====================================================================
        this.Settings = {
            getValue: (args) => {
                if (self._isWebMode) {
                    const key = args?.key || args;
                    if (typeof key === 'string') {
                        try {
                            return localStorage.getItem(`cspro_setting_${key}`);
                        } catch (e) { return null; }
                    }
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(64779, self.accessToken, args)));
            },
            getValueAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.Settings.getValue(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(64779, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            putValue: (args) => {
                if (self._isWebMode) {
                    const key = args?.key;
                    const value = args?.value;
                    if (typeof key === 'string') {
                        try {
                            if (value === null || value === undefined) {
                                localStorage.removeItem(`cspro_setting_${key}`);
                            } else {
                                localStorage.setItem(`cspro_setting_${key}`, String(value));
                            }
                        } catch (e) {}
                    }
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(17067, self.accessToken, args)));
            },
            putValueAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.Settings.putValue(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(17067, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // Sqlite Namespace
        // ====================================================================
        this.Sqlite = {
            close: (args) => {
                if (self._isWebMode) return self._webNotSupported('Sqlite.close');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(36421, self.accessToken, args)));
            },
            closeAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Sqlite.closeAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(36421, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            exec: (args) => {
                if (self._isWebMode) return self._webNotSupported('Sqlite.exec');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(31287, self.accessToken, args)));
            },
            execAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Sqlite.execAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(31287, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            open: (args) => {
                if (self._isWebMode) return self._webNotSupported('Sqlite.open');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(55316, self.accessToken, args)));
            },
            openAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Sqlite.openAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(55316, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            rekey: (args) => {
                if (self._isWebMode) return self._webNotSupported('Sqlite.rekey');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(40839, self.accessToken, args)));
            },
            rekeyAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('Sqlite.rekeyAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(40839, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
        
        // ====================================================================
        // System Namespace
        // ====================================================================
        this.System = {
            getSharableUri: (args) => {
                if (self._isWebMode) return self._webNotSupported('System.getSharableUri');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(49116, self.accessToken, args)));
            },
            getSharableUriAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('System.getSharableUriAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(49116, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            selectDocument: (args) => {
                if (self._isWebMode) return self._webNotSupported('System.selectDocument');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(14855, self.accessToken, args)));
            },
            selectDocumentAsync: (args) => {
                if (self._isWebMode) return self._webProxyAction('System.selectDocumentAsync', args);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(14855, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            // Extended System Info for Web
            getOS: () => {
                if (self._isWebMode) {
                    const ua = navigator.userAgent;
                    if (ua.indexOf("Win") !== -1) return "Windows";
                    if (ua.indexOf("Mac") !== -1) return "MacOS";
                    if (ua.indexOf("Linux") !== -1) return "Linux";
                    if (ua.indexOf("Android") !== -1) return "Android";
                    if (ua.indexOf("like Mac") !== -1) return "iOS";
                    return "Web";
                }
                return "Native";
            },
            getDeviceId: () => {
                if (self._isWebMode) {
                    let id = localStorage.getItem('cspro_device_id');
                    if (!id) {
                        id = crypto.randomUUID();
                        localStorage.setItem('cspro_device_id', id);
                    }
                    return id;
                }
                return "NativeDevice";
            },
            exec: (args) => {
                if (self._isWebMode) return self._webProxyAction('System.exec', args);
                // Native implementation would go here if supported
                return self._webNotSupported('System.exec');
            }
        };
        
        // ====================================================================
        // UI Namespace - Critical for dialogs
        // ====================================================================
        this.UI = {
            alert: (args) => {
                if (self._isWebMode) {
                    const message = typeof args === 'string' ? args : (args?.message || '');
                    const title = args?.title || '';
                    if (title) {
                        alert(`${title}\n\n${message}`);
                    } else {
                        alert(message);
                    }
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(48073, self.accessToken, args)));
            },
            alertAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.alert(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(48073, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            closeDialog: (args) => {
                if (self._isWebMode) {
                    console.log('[CSProActionInvoker.Web] UI.closeDialog:', args);
                    window.parent.postMessage({
                        type: 'cspro-dialog-close',
                        result: args
                    }, '*');
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(60265, self.accessToken, args)));
            },
            closeDialogAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.closeDialog(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(60265, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            enumerateWebViews: (args) => {
                if (self._isWebMode) return [];
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(50927, self.accessToken, args)));
            },
            enumerateWebViewsAsync: (args) => {
                if (self._isWebMode) return Promise.resolve([]);
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(50927, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getDisplayOptions: (args) => {
                if (self._isWebMode) return { ...CSProActionInvokerWebState.displayOptions };
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(63831, self.accessToken, args)));
            },
            getDisplayOptionsAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.getDisplayOptions(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(63831, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getInputData: (args) => {
                if (self._isWebMode) {
                    console.log('[CSProActionInvoker.Web] UI.getInputData:', CSProActionInvokerWebState.inputData);
                    return CSProActionInvokerWebState.inputData || {};
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(57200, self.accessToken, args)));
            },
            getInputDataAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.getInputData(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(57200, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            getMaxDisplayDimensions: (args) => {
                if (self._isWebMode) {
                    return { width: window.innerWidth || 800, height: window.innerHeight || 600 };
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(22001, self.accessToken, args)));
            },
            getMaxDisplayDimensionsAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.getMaxDisplayDimensions(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(22001, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            postWebMessage: (args) => {
                if (self._isWebMode) {
                    window.parent.postMessage({
                        type: 'cspro-web-message',
                        data: args
                    }, '*');
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(39555, self.accessToken, args)));
            },
            postWebMessageAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.postWebMessage(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(39555, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            setDisplayOptions: (args) => {
                if (self._isWebMode) {
                    Object.assign(CSProActionInvokerWebState.displayOptions, args);
                    if (args.width || args.height) {
                        window.parent.postMessage({
                            type: 'cspro-dialog-resize',
                            width: args.width,
                            height: args.height
                        }, '*');
                    }
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(62732, self.accessToken, args)));
            },
            setDisplayOptionsAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.setDisplayOptions(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(62732, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            showDialog: (args) => {
                if (self._isWebMode) return self._webNotSupported('UI.showDialog');
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(41655, self.accessToken, args)));
            },
            showDialogAsync: (args) => {
                if (self._isWebMode) return self._webNotSupportedAsync('UI.showDialogAsync');
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(41655, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            },
            view: (args) => {
                if (self._isWebMode) {
                    if (args?.url) {
                        window.open(args.url, '_blank');
                    }
                    return null;
                }
                return NativeActionInvokerImpl.processResponse(
                    NativeActionInvokerImpl.run(
                        NativeActionInvokerImpl.createMessage(27633, self.accessToken, args)));
            },
            viewAsync: (args) => {
                if (self._isWebMode) return Promise.resolve(self.UI.view(args));
                return NativeActionInvokerImpl.runAsync(
                    NativeActionInvokerImpl.createMessage(27633, self.accessToken, args))
                    .then(NativeActionInvokerImpl.processResponse);
            }
        };
    }
    
    // ========================================================================
    // Web Mode Internal Methods
    // ========================================================================
    
    /**
     * Handle unsupported sync operations in web mode
     * @private
     */
    _webNotSupported(methodName) {
        console.warn(`[CSProActionInvoker.Web] ${methodName} not supported in web mode`);
        return null;
    }
    
    /**
     * Handle unsupported async operations in web mode
     * @private
     */
    _webNotSupportedAsync(methodName) {
        console.warn(`[CSProActionInvoker.Web] ${methodName} not supported in web mode`);
        return Promise.resolve(null);
    }
    
    /**
     * Proxy action to parent frame for handling via WASM engine
     * @private
     */
    _webProxyAction(methodName, args) {
        return new Promise((resolve, reject) => {
            const requestId = CSProActionInvokerWebState.nextRequestId++;
            CSProActionInvokerWebState.pendingCallbacks.set(requestId, { resolve, reject });
            
            window.parent.postMessage({
                type: 'cspro-action-request',
                requestId: requestId,
                method: methodName,
                args: args,
                accessToken: this.accessToken
            }, '*');
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (CSProActionInvokerWebState.pendingCallbacks.has(requestId)) {
                    CSProActionInvokerWebState.pendingCallbacks.delete(requestId);
                    reject(new Error(`Action ${methodName} timed out`));
                }
            }, 30000);
        });
    }
    
    /**
     * Set input data from parent frame (web mode only)
     * @internal
     */
    _setInputData(data) {
        CSProActionInvokerWebState.inputData = data;
        CSProActionInvokerWebState.initialized = true;
        console.log('[CSProActionInvoker.Web] Input data set:', data);
    }
    
    /**
     * Set display options from parent frame (web mode only)
     * @internal
     */
    _setDisplayOptions(options) {
        Object.assign(CSProActionInvokerWebState.displayOptions, options);
    }
}

// ============================================================================
// Message Listener for Web Mode Parent Communication
// ============================================================================

window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;
    
    // Only process in web mode
    if (!CSProEnvironment.isWebMode()) return;
    
    console.log('[CSProActionInvoker.Web] Message received:', event.data.type);
    
    switch (event.data.type) {
        case 'cspro-dialog-init':
            // Received input data from parent
            CSProActionInvokerWebState.inputData = event.data.inputData;
            CSProActionInvokerWebState.initialized = true;
            
            if (event.data.accessToken) {
                CSProActionInvokerWebState.accessToken = event.data.accessToken;
            }
            if (event.data.displayOptions) {
                Object.assign(CSProActionInvokerWebState.displayOptions, event.data.displayOptions);
            }
            if (event.data.messageCache) {
                Object.assign(CSProActionInvokerWebState.messageCache, event.data.messageCache);
            }
            
            console.log('[CSProActionInvoker.Web] Initialized with input:', CSProActionInvokerWebState.inputData);
            
            // Dispatch event for dialogs that listen for it
            window.dispatchEvent(new CustomEvent('cspro-input-ready', {
                detail: { inputData: event.data.inputData }
            }));
            break;
            
        case 'cspro-action-response':
            // Response from parent for async action
            const { requestId, result, error } = event.data;
            const callback = CSProActionInvokerWebState.pendingCallbacks.get(requestId);
            if (callback) {
                CSProActionInvokerWebState.pendingCallbacks.delete(requestId);
                if (error) {
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(result);
                }
            }
            break;
    }
});

// ============================================================================
// Exports
// ============================================================================

// Make available globally
window.CSProActionInvoker = CSProActionInvoker;
window.CSProEnvironment = CSProEnvironment;
window.CSProActionInvokerWebState = CSProActionInvokerWebState;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        CSProActionInvoker, 
        CSProEnvironment, 
        CSProActionInvokerWebState,
        NativeActionInvokerImpl 
    };
}
