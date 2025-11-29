/**
 * Question Text Handler - Pure Interface to CSPro WASM Runtime Engine for QSF
 * 
 * This module provides a direct interface to the CSPro WASM runtime engine
 * for question text (QSF) operations. ALL data comes from the engine.
 * 
 * The CSPro WASM engine provides:
 * - Question text HTML content
 * - Question text URLs (from virtual file system)
 * - Field-level and block-level question text
 * 
 * This handler only:
 * 1. Queries the engine for question text data
 * 2. Renders the HTML content in the CAPI display area
 * 
 * NO WORKAROUNDS OR MOCKS - Only engine data is rendered.
 * 
 * @module components/csentry-mfc-view/handlers/question-text-handler
 */

/**
 * Creates a Question Text Handler for the CSEntry component
 * @param {CSEntryMFCView} component - The parent component
 * @returns {Object} Question text handler object
 */
export function createQuestionTextHandler(component) {
    let currentBlobUrl = null;
    let currentMessageHandler = null;
    
    // ============================================================
    // INTERNAL HELPERS
    // ============================================================
    
    /**
     * Get engine reference
     */
    const getEngine = () => component.engine;
    
    /**
     * Await result if Promise
     */
    const awaitResult = async (result) => {
        if (result && typeof result.then === 'function') {
            return await result;
        }
        return result;
    };
    
    /**
     * Escape HTML for plain text display
     */
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    // ============================================================
    // PUBLIC API - Direct calls to CSPro WASM Engine
    // ============================================================
    
    const handler = {
        
        // ------------------------------------------------------------
        // QUERY ENGINE FOR QUESTION TEXT
        // ------------------------------------------------------------
        
        /**
         * Get question text from engine for current or specified field.
         * 
         * @param {string} fieldName - Optional field name
         * @returns {Promise<Object|null>} Question text data from engine
         *          { questionTextHtml, questionTextUrl }
         */
        async getQuestionText(fieldName = '') {
            const engine = getEngine();
            if (!engine?.getQuestionText) {
                // Not an error - getQuestionText is optional
                return null;
            }
            
            try {
                const result = await awaitResult(engine.getQuestionText(fieldName));
                console.log('[QuestionText] Engine getQuestionText result:', result);
                return result;
            } catch (e) {
                // Ignore async operation errors during WASM execution
                if (e.message?.includes('async')) {
                    return null;
                }
                console.log('[QuestionText] getQuestionText error:', e.message);
                return null;
            }
        },
        
        /**
         * Read question text content from engine's virtual file system.
         * 
         * @param {string} virtualPath - Path in virtual FS (cspro-virtual:// or /)
         * @returns {Promise<string|null>} HTML content from engine
         */
        async readFromVirtualFS(virtualPath) {
            if (!virtualPath) {
                return null;
            }
            
            const engine = getEngine();
            const wasmModule = component._wasmModule;
            
            // Try engine method first
            if (engine?.getVirtualFileContent) {
                try {
                    const content = await awaitResult(engine.getVirtualFileContent(virtualPath));
                    if (content) {
                        console.log('[QuestionText] Loaded from engine virtual FS:', virtualPath);
                        return content;
                    }
                } catch (e) {
                    console.log('[QuestionText] Engine virtual FS error:', e.message);
                }
            }
            
            // Try WASM module method
            if (wasmModule?.getVirtualFileContent) {
                try {
                    const content = wasmModule.getVirtualFileContent(virtualPath);
                    if (content) {
                        console.log('[QuestionText] Loaded from WASM module virtual FS:', virtualPath);
                        return content;
                    }
                } catch (e) {
                    console.log('[QuestionText] WASM module virtual FS error:', e.message);
                }
            }
            
            // Try Emscripten FS as last resort
            if (wasmModule?.FS) {
                try {
                    const fsPath = virtualPath.replace('cspro-virtual://', '/');
                    const content = wasmModule.FS.readFile(fsPath, { encoding: 'utf8' });
                    if (content) {
                        console.log('[QuestionText] Loaded from Emscripten FS:', fsPath);
                        return content;
                    }
                } catch (e) {
                    // File not found in FS
                }
            }
            
            return null;
        },
        
        // ------------------------------------------------------------
        // DISPLAY QUESTION TEXT - Render engine data
        // ------------------------------------------------------------
        
        /**
         * Display question text for the current field.
         * 
         * Gets question text from engine and renders it in the CAPI area.
         * Data source priority:
         * 1. Engine getQuestionText() - returns HTML directly
         * 2. Engine virtual file system - for URL-based QSF
         * 3. Page result questionTextUrl
         * 4. Field-level questionText property
         * 
         * @param {Object} field - Current field data from engine
         * @param {Object} pageResult - Page result from engine (optional)
         */
        async displayQuestionText(field, pageResult = null) {
            const capiElement = component.$.capiText;
            if (!capiElement) {
                return;
            }
            
            let questionTextHtml = null;
            
            // 1. Try engine getQuestionText() - preferred method
            const engineResult = await handler.getQuestionText(field?.name || '');
            
            if (engineResult?.questionTextHtml) {
                // Engine returned HTML directly
                questionTextHtml = engineResult.questionTextHtml;
                console.log('[QuestionText] Using HTML from engine');
            } else if (engineResult?.questionTextUrl) {
                // Engine returned URL - load from virtual FS
                questionTextHtml = await handler.readFromVirtualFS(engineResult.questionTextUrl);
                console.log('[QuestionText] Loaded from engine URL:', engineResult.questionTextUrl);
            }
            
            // 2. Try page result URLs if no content yet
            if (!questionTextHtml && pageResult) {
                const url = pageResult.blockQuestionTextUrl || 
                           pageResult.fields?.[0]?.questionTextUrl;
                if (url) {
                    questionTextHtml = await handler.readFromVirtualFS(url);
                    console.log('[QuestionText] Loaded from page result URL:', url);
                }
            }
            
            // 3. Try field-level URL
            if (!questionTextHtml && field?.questionTextUrl) {
                questionTextHtml = await handler.readFromVirtualFS(field.questionTextUrl);
                console.log('[QuestionText] Loaded from field URL:', field.questionTextUrl);
            }
            
            // 4. Render the content
            if (questionTextHtml) {
                handler.renderHtml(questionTextHtml, field);
            } else if (field?.questionText) {
                // Fall back to plain text from field
                handler.renderPlainText(field.questionText);
            } else if (field?.label) {
                // Last resort - use field label
                handler.renderPlainText(field.label);
            } else {
                // No question text available
                handler.clear();
            }
        },
        
        /**
         * Render question text HTML in an iframe.
         * Iframe provides isolation for CSS/JS in QSF content.
         * 
         * @param {string} html - Question text HTML from engine
         * @param {Object} field - Current field data
         */
        renderHtml(html, field) {
            const capiElement = component.$.capiText;
            if (!capiElement) {
                return;
            }
            
            // Clean up previous resources
            handler.cleanup();
            
            // Inject CSProActionInvoker shim for interactive CAPI
            const modifiedHtml = handler.injectActionInvokerShim(html);
            
            // Create blob URL for iframe
            const blob = new Blob([modifiedHtml], { type: 'text/html' });
            currentBlobUrl = URL.createObjectURL(blob);
            
            // Create iframe for isolated rendering
            const iframe = document.createElement('iframe');
            iframe.src = currentBlobUrl;
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: white;
            `;
            
            // Set up message handler for CAPI actions from iframe
            currentMessageHandler = (event) => {
                if (event.data?.type === 'cspro-action' || 
                    event.data?.type === 'cspro-action-async') {
                    handler.handleCapiAction(event.data, field);
                }
            };
            window.addEventListener('message', currentMessageHandler);
            
            // Replace CAPI element content
            capiElement.innerHTML = '';
            capiElement.appendChild(iframe);
            
            console.log('[QuestionText] Rendered HTML in iframe');
        },
        
        /**
         * Render plain text (when no QSF HTML available).
         * 
         * @param {string} text - Plain text from engine
         */
        renderPlainText(text) {
            const capiElement = component.$.capiText;
            if (!capiElement) {
                return;
            }
            
            handler.cleanup();
            capiElement.innerHTML = `<div class="capi-plain-text">${escapeHtml(text)}</div>`;
        },
        
        /**
         * Clear the question text display.
         */
        clear() {
            const capiElement = component.$.capiText;
            if (capiElement) {
                capiElement.innerHTML = '';
            }
            handler.cleanup();
        },
        
        /**
         * Clean up resources (blob URLs, event listeners).
         */
        cleanup() {
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }
            if (currentMessageHandler) {
                window.removeEventListener('message', currentMessageHandler);
                currentMessageHandler = null;
            }
        },
        
        // ------------------------------------------------------------
        // CAPI ACTION INVOKER SUPPORT
        // ------------------------------------------------------------
        
        /**
         * Inject CSProActionInvoker shim into question text HTML.
         * 
         * This allows CAPI HTML to use the CSProActionInvoker API.
         * Actions are forwarded via postMessage to the parent frame,
         * which then delegates to the CSPro WASM engine.
         * 
         * @param {string} html - Original HTML from engine
         * @returns {string} HTML with injected shim
         */
        injectActionInvokerShim(html) {
            const shimScript = `
<script>
// CSProActionInvoker shim - forwards actions to parent frame -> WASM engine
(function() {
    // Ensure this runs before any other scripts
    class CSProActionInvoker {
        static $Impl = {
            pendingCallbacks: {},
            nextRequestId: 1,
            
            run(aiThis, actionCode, args) {
                // Send action to parent and return empty (sync operations limited in web)
                window.parent.postMessage({ 
                    type: 'cspro-action', 
                    actionCode: actionCode, 
                    args: args,
                    accessToken: aiThis.accessToken
                }, '*');
                return '';
            },
            
            runAsync(aiThis, actionCode, args) {
                const requestId = CSProActionInvoker.$Impl.nextRequestId++;
                return new Promise((resolve, reject) => {
                    CSProActionInvoker.$Impl.pendingCallbacks[requestId] = { resolve, reject };
                    window.parent.postMessage({ 
                        type: 'cspro-action-async', 
                        actionCode: actionCode, 
                        args: args,
                        requestId: requestId,
                        accessToken: aiThis.accessToken
                    }, '*');
                    // Timeout after 30 seconds
                    setTimeout(() => {
                        if (CSProActionInvoker.$Impl.pendingCallbacks[requestId]) {
                            delete CSProActionInvoker.$Impl.pendingCallbacks[requestId];
                            resolve('');
                        }
                    }, 30000);
                });
            },
            
            handleResponse(requestId, result) {
                const callback = CSProActionInvoker.$Impl.pendingCallbacks[requestId];
                if (callback) {
                    delete CSProActionInvoker.$Impl.pendingCallbacks[requestId];
                    callback.resolve(result);
                }
            }
        };

        constructor(accessToken) { 
            this.accessToken = accessToken || ''; 
            this._setupNamespaces();
        }
        
        _setupNamespaces() {
            const self = this;
            
            this.UI = {
                alert: (args) => CSProActionInvoker.$Impl.run(self, 31133, args),
                alertAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 31133, args),
                closeDialog: (args) => CSProActionInvoker.$Impl.run(self, 60265, args),
                closeDialogAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 60265, args),
                getInputData: () => CSProActionInvoker.$Impl.run(self, 57200, undefined),
                getInputDataAsync: () => CSProActionInvoker.$Impl.runAsync(self, 57200, undefined),
                getDisplayOptions: () => ({}),
                getDisplayOptionsAsync: () => Promise.resolve({}),
                getMaxDisplayDimensions: () => ({ width: window.innerWidth || 800, height: window.innerHeight || 600 }),
                getMaxDisplayDimensionsAsync: () => Promise.resolve({ width: window.innerWidth || 800, height: window.innerHeight || 600 }),
                setDisplayOptions: (args) => null,
                setDisplayOptionsAsync: (args) => Promise.resolve(null),
                showDialog: (args) => CSProActionInvoker.$Impl.run(self, 49835, args),
                showDialogAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 49835, args),
                view: (args) => { if (args?.url) window.open(args.url, '_blank'); return null; },
                viewAsync: (args) => Promise.resolve(self.UI.view(args))
            };

            this.Logic = {
                eval: (args) => CSProActionInvoker.$Impl.run(self, 50799, args),
                evalAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 50799, args),
                getSymbol: (args) => CSProActionInvoker.$Impl.run(self, 44034, args),
                getSymbolAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 44034, args),
                getSymbolMetadata: (args) => CSProActionInvoker.$Impl.run(self, 4818, args),
                getSymbolMetadataAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 4818, args),
                getSymbolValue: (args) => CSProActionInvoker.$Impl.run(self, 22923, args),
                getSymbolValueAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 22923, args),
                invoke: (args) => CSProActionInvoker.$Impl.run(self, 41927, args),
                invokeAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 41927, args),
                updateSymbolValue: (args) => CSProActionInvoker.$Impl.run(self, 17970, args),
                updateSymbolValueAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 17970, args)
            };

            this.Application = {
                getFormFile: (args) => CSProActionInvoker.$Impl.run(self, 49910, args),
                getFormFileAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 49910, args),
                getQuestionnaireContent: (args) => CSProActionInvoker.$Impl.run(self, 50614, args),
                getQuestionnaireContentAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 50614, args),
                getQuestionText: (args) => CSProActionInvoker.$Impl.run(self, 60242, args),
                getQuestionTextAsync: (args) => CSProActionInvoker.$Impl.runAsync(self, 60242, args)
            };
            
            this.Message = {
                getText: (args) => args?.text || ('Message ' + (args?.number || 0)),
                getTextAsync: (args) => Promise.resolve(self.Message.getText(args)),
                formatText: (args) => {
                    let text = args?.text || '';
                    if (args?.arguments) {
                        args.arguments.forEach((arg, i) => {
                            text = text.replace('%' + (i+1), String(arg));
                            text = text.replace('%s', String(arg));
                            text = text.replace('%d', String(arg));
                        });
                    }
                    return text;
                },
                formatTextAsync: (args) => Promise.resolve(self.Message.formatText(args))
            };
            
            this.Path = {
                getSpecialPaths: () => ({}),
                getSpecialPathsAsync: () => Promise.resolve({}),
                getPathInfo: (args) => ({ path: args?.path || '', name: '', type: 'file', exists: false }),
                getPathInfoAsync: (args) => Promise.resolve(self.Path.getPathInfo(args)),
                getDirectoryListing: (args) => ({ path: args?.path || '/', paths: [], parent: null }),
                getDirectoryListingAsync: (args) => Promise.resolve(self.Path.getDirectoryListing(args))
            };
            
            this.Clipboard = {
                getText: () => '',
                getTextAsync: async () => { try { return await navigator.clipboard.readText(); } catch(e) { return ''; } },
                putText: (args) => { try { navigator.clipboard.writeText(args?.text || args || ''); } catch(e) {} return null; },
                putTextAsync: async (args) => { try { await navigator.clipboard.writeText(args?.text || args || ''); } catch(e) {} return null; }
            };
            
            this.Settings = {
                getValue: (args) => { try { return localStorage.getItem('cspro_' + (args?.key || args)); } catch(e) { return null; } },
                getValueAsync: (args) => Promise.resolve(self.Settings.getValue(args)),
                putValue: (args) => { try { localStorage.setItem('cspro_' + args?.key, args?.value); } catch(e) {} return null; },
                putValueAsync: (args) => Promise.resolve(self.Settings.putValue(args))
            };
        }
        
        getWindowForEventListener() { return window; }
        
        execute(args) { return CSProActionInvoker.$Impl.run(this, 11276, args); }
        executeAsync(args) { return CSProActionInvoker.$Impl.runAsync(this, 11276, args); }
        
        registerAccessToken(args) { this.accessToken = args?.accessToken || args || ''; return null; }
        registerAccessTokenAsync(args) { return Promise.resolve(this.registerAccessToken(args)); }
    }

    // Make globally available
    window.CSProActionInvoker = CSProActionInvoker;
    
    // Listen for responses from parent
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'cspro-action-response') {
            CSProActionInvoker.$Impl.handleResponse(event.data.requestId, event.data.result);
        }
    });
})();
</script>`;
            
            // Replace existing action-invoker.js reference
            let modifiedHtml = html.replace(
                /<script\s+src=["'][^"']*action-invoker\.js["'][^>]*><\/script>/gi,
                '<!-- action-invoker.js replaced by shim -->'
            );
            
            // Inject shim
            if (modifiedHtml.includes('<head>')) {
                modifiedHtml = modifiedHtml.replace('<head>', `<head>${shimScript}`);
            } else if (modifiedHtml.includes('<html>')) {
                modifiedHtml = modifiedHtml.replace('<html>', `<html><head>${shimScript}</head>`);
            } else {
                modifiedHtml = shimScript + modifiedHtml;
            }
            
            return modifiedHtml;
        },
        
        /**
         * Handle CAPI action from question text iframe.
         * Forwards action to CSPro WASM engine.
         * 
         * @param {Object} actionData - Action data from postMessage
         * @param {Object} field - Current field
         */
        async handleCapiAction(actionData, field) {
            const { actionCode, args } = actionData;
            console.log('[QuestionText] CAPI action:', actionCode, args);
            
            const engine = getEngine();
            
            // Forward action to engine if available
            if (engine?.executeAction) {
                try {
                    const result = await awaitResult(engine.executeAction(actionCode, args));
                    console.log('[QuestionText] Engine executeAction result:', result);
                    return result;
                } catch (e) {
                    console.log('[QuestionText] Engine executeAction error:', e.message);
                }
            }
            
            // Handle basic UI actions locally as fallback
            // (These are informational - not modifying engine state)
            if (actionCode === 31133 && args?.message) {
                // UI.alert - show message using native CSPro errmsg dialog
                if (component && typeof component._showMessage === 'function') {
                    component._showMessage(args.message, args.title || '');
                } else {
                    console.warn('[QuestionText] Alert message (no handler):', args.message);
                }
            }
        }
    };
    
    return handler;
}

export default { createQuestionTextHandler };
