/**
 * CSPro Logic Handler - Pure Interface to CSPro WASM Runtime Engine
 * 
 * This module provides a direct interface to the CSPro WASM runtime engine.
 * ALL operations are performed by the engine - NO workarounds or mocks.
 * 
 * The CSPro WASM engine handles:
 * - Field value validation and advancement (postproc execution)
 * - CSPro logic execution (preproc, postproc, onfocus, killfocus)
 * - Error message (errmsg) dialog triggering and display
 * - Skip pattern enforcement
 * - Value set validation
 * - Roster and group operations
 * - Case management (save, partial save, stop)
 * 
 * @module components/csentry-mfc-view/handlers/cspro-logic-handler
 */

/**
 * Creates a CSPro Logic Handler for the CSEntry component
 * @param {CSEntryMFCView} component - The parent component
 * @returns {Object} Logic handler with engine interface methods
 */
export function createCSProLogicHandler(component) {
    
    // ============================================================
    // INTERNAL HELPERS - No logic, just async handling
    // ============================================================
    
    /**
     * Get engine reference
     */
    const getEngine = () => component.engine;
    
    /**
     * Await result if Promise (JSPI/Asyncify support)
     */
    const awaitResult = async (result) => {
        if (result && typeof result.then === 'function') {
            return await result;
        }
        return result;
    };
    
    // ============================================================
    // PUBLIC API - Direct calls to CSPro WASM Engine
    // ============================================================
    
    const handler = {
        
        /**
         * Check if engine is ready
         */
        isEngineReady() {
            return getEngine() !== null && getEngine() !== undefined;
        },
        
        /**
         * Get engine reference
         */
        getEngine() {
            return getEngine();
        },
        
        // ------------------------------------------------------------
        // FIELD VALUE AND NAVIGATION - All logic executed by engine
        // ------------------------------------------------------------
        
        /**
         * Set field value and advance to next field.
         * 
         * The CSPro WASM engine executes:
         * - killfocus proc
         * - postproc (validation, skip patterns, errmsg)
         * - preproc of next field
         * - onfocus of next field
         * 
         * @param {string|number} value - The field value
         * @returns {Promise<Object|null>} Page result from engine
         */
        async setFieldValueAndAdvance(value) {
            const engine = getEngine();
            if (!engine?.setFieldValueAndAdvance) {
                console.error('[CSProLogic] Engine.setFieldValueAndAdvance not available');
                return null;
            }
            
            const result = await awaitResult(engine.setFieldValueAndAdvance(String(value ?? '')));
            console.log('[CSProLogic] setFieldValueAndAdvance result:', result);
            return result;
        },
        
        /**
         * Move to previous field.
         * Engine handles all navigation logic.
         * 
         * @returns {Promise<Object|null>} Page result from engine
         */
        async previousField() {
            const engine = getEngine();
            if (!engine?.previousField) {
                console.error('[CSProLogic] Engine.previousField not available');
                return null;
            }
            
            const result = await awaitResult(engine.previousField());
            console.log('[CSProLogic] previousField result:', result);
            return result;
        },
        
        /**
         * Go to specific field.
         * Engine handles field lookup and navigation.
         * 
         * @param {string} fieldSymbol - Field symbol name
         * @param {number} occ1 - First occurrence (1-based)
         * @param {number} occ2 - Second occurrence
         * @param {number} occ3 - Third occurrence
         * @returns {Promise<Object|null>} Page result from engine
         */
        async goToField(fieldSymbol, occ1 = 1, occ2 = 0, occ3 = 0) {
            const engine = getEngine();
            if (!engine?.goToField) {
                console.error('[CSProLogic] Engine.goToField not available');
                return null;
            }
            
            const result = await awaitResult(engine.goToField(fieldSymbol, occ1, occ2, occ3));
            console.log('[CSProLogic] goToField result:', result);
            return result;
        },
        
        // ------------------------------------------------------------
        // PAGE STATE - Read-only queries to engine
        // ------------------------------------------------------------
        
        /**
         * Get current page state.
         * Returns all fields in current block with values, capture types, responses.
         * 
         * @returns {Promise<Object|null>} Current page state from engine
         */
        async getCurrentPage() {
            const engine = getEngine();
            if (!engine?.getCurrentPage) {
                console.error('[CSProLogic] Engine.getCurrentPage not available');
                return null;
            }
            
            const result = await awaitResult(engine.getCurrentPage());
            return result;
        },
        
        /**
         * Get form data (application structure).
         * Returns dictionary info, form hierarchy, field definitions.
         * 
         * @returns {Promise<Object|null>} Form data from engine
         */
        async getFormData() {
            const engine = getEngine();
            if (!engine?.getFormData) {
                console.error('[CSProLogic] Engine.getFormData not available');
                return null;
            }
            
            const result = await awaitResult(engine.getFormData());
            return result;
        },
        
        // ------------------------------------------------------------
        // ROSTER AND GROUP OPERATIONS - All logic by engine
        // ------------------------------------------------------------
        
        /**
         * End current roster.
         * Engine executes roster-level postproc.
         * 
         * @returns {Promise<Object|null>} Page result from engine
         */
        async endRoster() {
            const engine = getEngine();
            if (!engine?.endRoster) {
                console.error('[CSProLogic] Engine.endRoster not available');
                return null;
            }
            
            const result = await awaitResult(engine.endRoster());
            console.log('[CSProLogic] endRoster result:', result);
            return result;
        },
        
        /**
         * End current group/level.
         * Engine executes group-level postproc.
         * 
         * @returns {Promise<Object|null>} Page result from engine
         */
        async endGroup() {
            const engine = getEngine();
            if (!engine?.endGroup) {
                console.error('[CSProLogic] Engine.endGroup not available');
                return null;
            }
            
            const result = await awaitResult(engine.endGroup());
            console.log('[CSProLogic] endGroup result:', result);
            return result;
        },
        
        /**
         * End current level.
         * 
         * @returns {Promise<Object|null>} Page result from engine
         */
        async endLevel() {
            const engine = getEngine();
            if (engine?.endLevel) {
                const result = await awaitResult(engine.endLevel());
                console.log('[CSProLogic] endLevel result:', result);
                return result;
            }
            // Fall back to endGroup if endLevel not available
            return await handler.endGroup();
        },
        
        // ------------------------------------------------------------
        // CASE MANAGEMENT - All operations by engine
        // ------------------------------------------------------------
        
        /**
         * Start entry session.
         * Engine initializes case structure and executes startup logic.
         * 
         * @param {string} mode - Entry mode: 'add', 'modify', 'verify'
         * @returns {Promise<boolean>} Success
         */
        async start(mode = 'add') {
            const engine = getEngine();
            if (!engine?.start) {
                console.error('[CSProLogic] Engine.start not available');
                return false;
            }
            
            const result = await awaitResult(engine.start(mode));
            console.log('[CSProLogic] start result:', result);
            return result === true;
        },
        
        /**
         * Stop entry session.
         * Engine executes onStop logic.
         * 
         * @returns {Promise<boolean>} Success
         */
        async stop() {
            const engine = getEngine();
            if (!engine) {
                console.error('[CSProLogic] Engine not available');
                return false;
            }
            
            // Try onStop first
            if (engine.onStop) {
                const result = await awaitResult(engine.onStop());
                console.log('[CSProLogic] onStop result:', result);
                return true;
            }
            
            // Fall back to stop
            if (engine.stop) {
                const result = await awaitResult(engine.stop());
                console.log('[CSProLogic] stop result:', result);
                return true;
            }
            
            console.error('[CSProLogic] No stop method available');
            return false;
        },
        
        /**
         * Partial save current case.
         * Engine saves current state without ending case.
         * 
         * @returns {Promise<boolean>} Success
         */
        async partialSave() {
            const engine = getEngine();
            if (!engine?.partialSave) {
                console.error('[CSProLogic] Engine.partialSave not available');
                return false;
            }
            
            const result = await awaitResult(engine.partialSave());
            console.log('[CSProLogic] partialSave result:', result);
            return result === true;
        },
        
        // ------------------------------------------------------------
        // QUESTION TEXT - Read from engine
        // ------------------------------------------------------------
        
        /**
         * Get question text for field.
         * Engine returns HTML/URL for question text display.
         * 
         * @param {string} fieldName - Optional field name
         * @returns {Promise<Object|null>} Question text data from engine
         */
        async getQuestionText(fieldName = '') {
            const engine = getEngine();
            if (!engine?.getQuestionText) {
                // Not an error - optional feature
                return null;
            }
            
            try {
                const result = await awaitResult(engine.getQuestionText(fieldName));
                return result;
            } catch (e) {
                console.log('[CSProLogic] getQuestionText error:', e.message);
                return null;
            }
        },
        
        // ------------------------------------------------------------
        // APPLICATION INITIALIZATION - Engine setup
        // ------------------------------------------------------------
        
        /**
         * Initialize application from PFF path.
         * 
         * @param {string} pffPath - Path to PFF file
         * @returns {Promise<boolean>} Success
         */
        async initApplication(pffPath) {
            const engine = getEngine();
            if (!engine?.initApplication) {
                console.error('[CSProLogic] Engine.initApplication not available');
                return false;
            }
            
            const result = await awaitResult(engine.initApplication(pffPath));
            console.log('[CSProLogic] initApplication result:', result);
            return result === true;
        },
        
        /**
         * Load application with files.
         * 
         * @param {string} pffContent - PFF file content
         * @param {Object} files - Map of filename to content
         * @returns {Promise<boolean>} Success
         */
        async loadApplicationWithFiles(pffContent, files) {
            const engine = getEngine();
            if (!engine?.loadApplicationWithFiles) {
                console.error('[CSProLogic] Engine.loadApplicationWithFiles not available');
                return false;
            }
            
            const result = await awaitResult(engine.loadApplicationWithFiles(pffContent, files));
            console.log('[CSProLogic] loadApplicationWithFiles result:', result);
            return result === true;
        },
        
        // ------------------------------------------------------------
        // DIALOG DISPLAY - Show dialogs returned by engine
        // ------------------------------------------------------------
        
        /**
         * Display dialogs returned by the engine.
         * These are errmsg, select, etc. triggered by CSPro logic.
         * 
         * @param {Array} dialogs - Array of dialog objects from engine
         */
        async displayEngineDialogs(dialogs) {
            if (!dialogs || dialogs.length === 0) {
                return;
            }
            
            console.log('[CSProLogic] Displaying engine dialogs:', dialogs.length);
            
            for (const dialogInfo of dialogs) {
                const { dialogName, inputData } = dialogInfo;
                
                // Use component's native dialog system to render
                if (typeof component._showNativeDialog === 'function') {
                    try {
                        await component._showNativeDialog(dialogName, inputData);
                    } catch (e) {
                        console.error('[CSProLogic] Error displaying dialog:', dialogName, e);
                    }
                }
            }
        }
    };
    
    return handler;
}

export default { createCSProLogicHandler };
