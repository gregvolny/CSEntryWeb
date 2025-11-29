/**
 * Server-side Engine Proxy - REST API wrapper for WASM engine
 * 
 * Maps Windows MFC CEntryIFaz interface to server-side REST API.
 * 
 * Windows MFC uses CEntryIFaz methods like:
 * - C_GoToField(ENGINE_NEXTFIELD/ENGINE_BACKFIELD) -> nextField()/previousField()
 * - C_MoveToField(pTargetFld, bPostProc) -> goToField(symbol, indexes)
 * - C_FldPutVal/C_FldGetVal -> setFieldValue/getCurrentPage
 * - C_EndGroup(bPostProc) -> endGroup()
 * - C_EndLevel(...) -> endLevel()
 * - C_InsertOcc/C_DeleteOcc -> insertOcc()/deleteOcc()
 * 
 * @module components/csentry-mfc-view/engine/engine-proxy
 */

/**
 * Create a proxy engine that forwards calls to the server-side REST API
 * This allows non-JSPI browsers to use CSPro via HTTP
 * @param {CSEntryMFCView|Object} componentOrBaseUrl - The parent component or base URL (ignored, uses relative paths)
 * @param {string} existingSessionId - Optional existing session ID to use
 * @returns {Object} Engine proxy object
 */
export function createServerSideEngineProxy(componentOrBaseUrl, existingSessionId = null) {
    let sessionId = existingSessionId;
    
    // Get component reference if passed
    const component = (componentOrBaseUrl && typeof componentOrBaseUrl === 'object' && 
                       typeof componentOrBaseUrl.tagName === 'string') ? componentOrBaseUrl : null;
    
    const ensureSession = async () => {
        if (!sessionId) {
            const response = await fetch('/api/cspro/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success) {
                sessionId = data.sessionId;
                // Update component's session ID if available
                if (component) {
                    component._sessionId = sessionId;
                }
            } else {
                throw new Error('Failed to create server session');
            }
        }
        return sessionId;
    };
    
    return {
        // ==================== SESSION MANAGEMENT ====================
        // Maps to: C_ExentryStart, C_ExentryInit, C_ExentryStop
        
        _ensureSession: ensureSession,
        
        getSessionId() {
            return sessionId;
        },
        
        // Initialize application (C_ExentryInit)
        async initApplication(pffPath) {
            await ensureSession();
            return true;
        },
        
        // Load embedded asset from server's WASM FS
        async loadEmbeddedAsset(pffPath) {
            await ensureSession();
            
            const response = await fetch(`/api/cspro/session/${sessionId}/load-embedded`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pffPath: pffPath })
            });
            
            const data = await response.json();
            return data.success;
        },
        
        // Load application with files
        async loadApplicationWithFiles(pffContent, files) {
            await ensureSession();
            
            // Prepare files for transmission
            const processedFiles = {};
            for (const [filename, content] of Object.entries(files || {})) {
                if (content instanceof Uint8Array) {
                    processedFiles[filename] = {
                        type: 'binary',
                        data: btoa(String.fromCharCode(...content))
                    };
                } else if (content && content.type === 'binary') {
                    processedFiles[filename] = content;
                } else {
                    processedFiles[filename] = content;
                }
            }
            
            const response = await fetch(`/api/cspro/session/${sessionId}/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pffContent: pffContent,
                    applicationFiles: processedFiles
                })
            });
            
            const data = await response.json();
            return data.success;
        },
        
        // Start entry session (C_ExentryStart with mode)
        async start(mode) {
            const response = await fetch(`/api/cspro/session/${sessionId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: mode || 'add' })
            });
            const data = await response.json();
            return data.success;
        },
        
        // Stop entry session (C_ExentryStop)
        async stop() {
            const response = await fetch(`/api/cspro/session/${sessionId}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            return data.success;
        },
        
        // ==================== FORM DATA ====================
        // Maps to: GetFormFileInProcess, GetPrimaryFormFile
        
        async getFormData() {
            const response = await fetch(`/api/cspro/session/${sessionId}/form-data`);
            const data = await response.json();
            return data;
        },
        
        // ==================== PAGE/FIELD STATE ====================
        // Maps to: C_FldGetCurrent, C_FldInfo, C_FldGetVal
        
        async getCurrentPage() {
            const response = await fetch(`/api/cspro/session/${sessionId}/page`);
            const data = await response.json();
            return data.success ? data.page : null;
        },
        
        // ==================== FIELD NAVIGATION ====================
        // Maps to: C_GoToField(ENGINE_NEXTFIELD/ENGINE_BACKFIELD)
        // In Windows MFC, this calls CsDriver::NextField/PrevField
        
        // Advance field with value (maps to MFC OnEditEnter behavior)
        async advanceField(value) {
            const response = await fetch(`/api/cspro/session/${sessionId}/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: value })
            });
            const data = await response.json();
            return data.success;
        },
        
        // Set field value and advance (C_FldPutVal + C_GoToField(ENGINE_NEXTFIELD))
        // Returns page data with the next field info
        async setFieldValueAndAdvance(value) {
            const response = await fetch(`/api/cspro/session/${sessionId}/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: value !== undefined ? String(value) : '' })
            });
            const data = await response.json();
            console.log('[ServerProxy] setFieldValueAndAdvance response:', data);
            
            // Handle server-side dialogs (errmsg, etc.)
            // These dialogs were auto-acknowledged by the server but need to be shown to the user
            if (data.dialogs && data.dialogs.length > 0) {
                console.log('[ServerProxy] Server triggered dialogs:', data.dialogs.length);
                for (const dialog of data.dialogs) {
                    console.log('[ServerProxy] Showing server dialog:', dialog.dialogName);
                    await component._showServerDialog(dialog);
                }
            }
            
            if (data.success && data.page) {
                // Include dialogs in return so component can also process if needed
                return { ...data.page, dialogs: data.dialogs || [] };
            }
            return null;
        },
        
        // Next field (C_GoToField(ENGINE_NEXTFIELD))
        // Moves forward without setting a value (for skip scenarios)
        async nextField() {
            const response = await fetch(`/api/cspro/session/${sessionId}/next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return null;
        },
        
        // Previous field (C_GoToField(ENGINE_BACKFIELD))
        async previousField() {
            const response = await fetch(`/api/cspro/session/${sessionId}/previous`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // Go to specific field (C_MoveToField)
        // Maps to MFC's C_MoveToField(pTargetFld, bPostProc)
        async goToField(fieldSymbol, occurrence1 = 1, occurrence2 = 0, occurrence3 = 0) {
            const response = await fetch(`/api/cspro/session/${sessionId}/goto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fieldSymbol, 
                    occurrence1, 
                    occurrence2, 
                    occurrence3 
                })
            });
            const data = await response.json();
            return data.success ? data.page : null;
        },
        
        // ==================== GROUP/LEVEL OPERATIONS ====================
        // Maps to: C_EndGroup, C_EndLevel, C_EndGroupOcc, C_EndLevelOcc
        
        // End roster/group (C_EndGroup)
        async endRoster() {
            const response = await fetch(`/api/cspro/session/${sessionId}/end-roster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            return data.success;
        },
        
        // End group with postproc flag (C_EndGroup) - Note: WASM binding takes no arguments
        async endGroup() {
            const response = await fetch(`/api/cspro/session/${sessionId}/end-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // End level (C_EndLevel)
        async endLevel(nextLevel = -1, writeNode = true) {
            const response = await fetch(`/api/cspro/session/${sessionId}/end-level`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nextLevel, writeNode })
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // End group occurrence (C_EndGroupOcc)
        async endGroupOcc(postProc = true) {
            const response = await fetch(`/api/cspro/session/${sessionId}/end-group-occ`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postProc })
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // ==================== ROSTER OCCURRENCE OPERATIONS ====================
        // Maps to: C_InsertOcc, C_DeleteOcc, C_InsertOccAfter, C_SortOcc
        
        // Insert occurrence (C_InsertOcc)
        async insertOcc() {
            const response = await fetch(`/api/cspro/session/${sessionId}/insert-occ`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // Insert occurrence after current (C_InsertOccAfter)
        async insertOccAfter() {
            const response = await fetch(`/api/cspro/session/${sessionId}/insert-occ-after`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // Delete occurrence (C_DeleteOcc)
        async deleteOcc() {
            const response = await fetch(`/api/cspro/session/${sessionId}/delete-occ`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // Sort occurrences (C_SortOcc)
        async sortOcc(ascending = true) {
            const response = await fetch(`/api/cspro/session/${sessionId}/sort-occ`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ascending })
            });
            const data = await response.json();
            if (data.success && data.page) {
                return data.page;
            }
            return data.success;
        },
        
        // ==================== CAPI/QUESTION TEXT ====================
        // Maps to: C_GetCapi, GetQuestionTextUrl
        
        async getQuestionText(fieldName) {
            const url = new URL(`/api/cspro/session/${sessionId}/question`, window.location.origin);
            if (fieldName) url.searchParams.set('field', fieldName);
            const response = await fetch(url);
            const data = await response.json();
            return data.success ? { 
                questionTextHtml: data.questionTextHtml, 
                questionTextUrl: data.questionTextUrl,
                fieldName: data.fieldName
            } : null;
        },
        
        // Get responses/value set for field
        async getResponses(fieldName) {
            const url = new URL(`/api/cspro/session/${sessionId}/responses`, window.location.origin);
            if (fieldName) url.searchParams.set('field', fieldName);
            const response = await fetch(url);
            const data = await response.json();
            return data.success ? data.responses : [];
        },
        
        // ==================== CASE TREE ====================
        // Maps to: GetCaseTree (portable interface)
        
        async getCaseTree() {
            const response = await fetch(`/api/cspro/session/${sessionId}/case-tree`);
            const data = await response.json();
            return data.success ? data.caseTree : null;
        },
        
        // ==================== CASE OPERATIONS ====================
        // Maps to: C_IsNewCase, PartialSave
        
        async partialSave() {
            const response = await fetch(`/api/cspro/session/${sessionId}/partial-save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            console.log('[ServerProxy] partialSave response:', data);
            return data.success;
        },
        
        // Get new case status (C_IsNewCase)
        async isNewCase() {
            const response = await fetch(`/api/cspro/session/${sessionId}/is-new-case`);
            const data = await response.json();
            return data.success ? data.isNewCase : false;
        },
        
        // ==================== STATUS METHODS ====================
        // Maps to: IsSystemControlled, C_IsPathOn, GetStopCode
        
        async isSystemControlled() {
            const response = await fetch(`/api/cspro/session/${sessionId}/status`);
            const data = await response.json();
            return data.success ? data.isSystemControlled : false;
        },
        
        async isPathOn() {
            const response = await fetch(`/api/cspro/session/${sessionId}/status`);
            const data = await response.json();
            return data.success ? data.pathOn : true;
        },
        
        async getStopCode() {
            const response = await fetch(`/api/cspro/session/${sessionId}/status`);
            const data = await response.json();
            return data.success ? data.stopCode : 0;
        },
        
        // ==================== ACTION INVOKER / LOGIC EVALUATION ====================
        // Maps to: ActionInvoker::Runtime::ProcessAction, Logic.invoke, Logic.eval
        
        /**
         * Invoke a user-defined CSPro logic function by name
         * Used by CAPI HTML buttons that call functions like EndPersonRoster()
         * @param {string} functionName - Name of the function (e.g., "EndPersonRoster")
         * @param {object} args - Arguments to pass to the function
         * @returns {object} Result with success, result, and page
         */
        async invokeLogicFunction(functionName, args = {}) {
            console.log(`[ServerProxy] invokeLogicFunction: ${functionName}(${JSON.stringify(args)})`);
            const response = await fetch(`/api/cspro/session/${sessionId}/invoke-function`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ functionName, arguments: args })
            });
            const data = await response.json();
            console.log('[ServerProxy] invokeLogicFunction response:', data);
            return data;
        },
        
        /**
         * Evaluate CSPro logic code directly
         * Handles Logic.eval actions from CAPI HTML
         * @param {string} logicCode - CSPro logic code to evaluate
         * @returns {object} Result with success, result, and page
         */
        async evalLogic(logicCode) {
            console.log(`[ServerProxy] evalLogic: ${logicCode}`);
            const response = await fetch(`/api/cspro/session/${sessionId}/eval-logic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logic: logicCode })
            });
            const data = await response.json();
            console.log('[ServerProxy] evalLogic response:', data);
            return data;
        },
        
        /**
         * Execute a generic Action Invoker action
         * @param {string} actionName - Full action name (e.g., "Logic.invoke", "UI.alert")
         * @param {object} args - Arguments for the action
         * @param {string} accessToken - Optional access token
         * @returns {object} Result from the action
         */
        async executeAction(actionName, args = {}, accessToken = '') {
            console.log(`[ServerProxy] executeAction: ${actionName}(${JSON.stringify(args)})`);
            const response = await fetch(`/api/cspro/session/${sessionId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: actionName, arguments: args, accessToken })
            });
            const data = await response.json();
            console.log('[ServerProxy] executeAction response:', data);
            return data;
        },
        
        // ==================== SESSION UTILITIES ====================
        
        isSessionActive() {
            return sessionId !== null;
        },
        
        async closeSession() {
            if (sessionId) {
                try {
                    await fetch(`/api/cspro/session/${sessionId}`, {
                        method: 'DELETE'
                    });
                } catch (e) {
                    console.warn('[ServerProxy] Error closing session:', e);
                }
                sessionId = null;
            }
        }
    };
}

/**
 * Check if server-side WASM execution is available
 * @returns {Promise<boolean>}
 */
export async function checkServerAvailability() {
    try {
        const response = await fetch('/api/cspro/health');
        const data = await response.json();
        return data.wasmInitialized === true;
    } catch (e) {
        return false;
    }
}

/**
 * Check if browser supports JSPI
 * @returns {boolean}
 */
export function checkBrowserJSPISupport() {
    try {
        return typeof WebAssembly.Suspending === 'function' && 
               typeof WebAssembly.promising === 'function';
    } catch (e) {
        return false;
    }
}

export default { createServerSideEngineProxy, checkServerAvailability, checkBrowserJSPISupport };
