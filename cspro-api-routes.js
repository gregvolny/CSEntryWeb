/**
 * CSPro REST API Routes
 * 
 * Express router providing REST API endpoints for CSPro WASM operations.
 * Enables browsers without JSPI support to use CSPro via standard HTTP calls.
 * 
 * Maps Windows MFC CEntryIFaz interface methods to REST endpoints:
 * - C_GoToField -> POST /advance, /previous, /next, /goto
 * - C_EndGroup -> POST /end-group
 * - C_EndLevel -> POST /end-level
 * - C_InsertOcc/C_DeleteOcc -> POST /insert-occ, /delete-occ
 * - C_GetCapi -> GET /question
 * - GetCaseTree -> GET /case-tree
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { wasmService } from './cspro-wasm-service.js';

const router = express.Router();

// ==================== HEALTH & INITIALIZATION ====================

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        wasmInitialized: wasmService.isInitialized,
        timestamp: Date.now()
    });
});

/**
 * List embedded applications in WASM filesystem
 */
router.get('/assets', async (req, res) => {
    try {
        if (!wasmService.isInitialized) {
            await wasmService.initialize();
        }
        
        const assets = wasmService.listEmbeddedAssets();
        res.json({
            success: true,
            applications: assets
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            applications: []
        });
    }
});

/**
 * Initialize the WASM service
 */
router.post('/init', async (req, res) => {
    try {
        await wasmService.initialize();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== SESSION MANAGEMENT ====================
// Maps to: C_ExentryInit, C_ExentryStart, C_ExentryStop

/**
 * Create a new entry session
 */
router.post('/session', async (req, res) => {
    try {
        if (!wasmService.isInitialized) {
            await wasmService.initialize();
        }

        const sessionId = uuidv4();
        const session = wasmService.createSession(sessionId);

        res.json({
            success: true,
            sessionId: session.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get session status
 */
router.get('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = wasmService.getSession(sessionId);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }

    res.json({
        success: true,
        session: {
            id: session.id,
            applicationLoaded: session.applicationLoaded,
            entryStarted: session.entryStarted,
            createdAt: session.createdAt
        }
    });
});

/**
 * Get session status info (isSystemControlled, pathOn, stopCode)
 * Maps to: IsSystemControlled, C_IsPathOn, GetStopCode
 */
router.get('/session/:sessionId/status', async (req, res) => {
    const { sessionId } = req.params;
    const session = wasmService.getSession(sessionId);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }

    try {
        let isSystemControlled = false;
        let stopCode = 0;
        let pathOn = true;
        
        if (session.engine) {
            // Get from engine if available
            if (typeof session.engine.isSystemControlled === 'function') {
                isSystemControlled = session.engine.isSystemControlled();
            }
            if (typeof session.engine.getStopCode === 'function') {
                stopCode = session.engine.getStopCode();
            }
        }

        res.json({
            success: true,
            isSystemControlled,
            pathOn,
            stopCode
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Load application for a session
 */
router.post('/session/:sessionId/load', async (req, res) => {
    const { sessionId } = req.params;
    const { pffContent, applicationFiles, appName } = req.body;

    if (!pffContent) {
        return res.status(400).json({
            success: false,
            error: 'PFF content is required'
        });
    }

    try {
        const result = await wasmService.loadApplication(
            sessionId,
            pffContent,
            applicationFiles || {},
            appName
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Load embedded asset for a session (assets bundled in WASM)
 */
router.post('/session/:sessionId/load-embedded', async (req, res) => {
    const { sessionId } = req.params;
    const { pffPath } = req.body;

    if (!pffPath) {
        return res.status(400).json({
            success: false,
            error: 'PFF path is required'
        });
    }

    try {
        const result = await wasmService.loadEmbeddedApplication(sessionId, pffPath);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Start data entry (C_ExentryStart)
 */
router.post('/session/:sessionId/start', async (req, res) => {
    const { sessionId } = req.params;
    const { mode } = req.body;

    try {
        const result = await wasmService.startEntry(sessionId, mode);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Stop entry and save case (C_ExentryStop)
 */
router.post('/session/:sessionId/stop', async (req, res) => {
    const { sessionId } = req.params;
    const { save } = req.body;

    try {
        const result = await wasmService.stopEntry(sessionId, save !== false);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Destroy a session
 */
router.delete('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    try {
        wasmService.destroySession(sessionId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get list of all cases in data file
 * Maps to: GetSequentialCaseIds (WASM)
 */
router.get('/session/:sessionId/cases', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const cases = await wasmService.getSequentialCaseIds(sessionId);
        res.json({
            success: true,
            cases: cases || []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Modify (open) a case by position
 * Maps to: ModifyCase (WASM)
 */
router.post('/session/:sessionId/modify-case', async (req, res) => {
    const { sessionId } = req.params;
    const { position } = req.body;

    try {
        const result = await wasmService.modifyCase(sessionId, position);
        res.json({
            success: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== FORM/PAGE STATE ====================
// Maps to: GetFormFileInProcess, C_FldGetCurrent

/**
 * Get current page state
 */
router.get('/session/:sessionId/page', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const page = await wasmService.getCurrentPage(sessionId);
        res.json({
            success: true,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get form structure (application form definitions)
 */
router.get('/session/:sessionId/form-data', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const formData = await wasmService.getFormData(sessionId);
        
        // Debug logging for form boxes - REMOVED

        
        res.json(formData);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== FIELD NAVIGATION ====================
// Maps to: C_GoToField(ENGINE_NEXTFIELD/ENGINE_BACKFIELD), C_MoveToField

/**
 * Advance to next field with value (C_FldPutVal + C_GoToField(ENGINE_NEXTFIELD))
 */
router.post('/session/:sessionId/advance', async (req, res) => {
    const { sessionId } = req.params;
    const { value } = req.body;

    try {
        const result = await wasmService.advanceField(sessionId, value);
        
        // Also return current page state after advancing
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Move to next field without value (C_GoToField(ENGINE_NEXTFIELD))
 */
router.post('/session/:sessionId/next', async (req, res) => {
    const { sessionId } = req.params;
    const session = wasmService.getSession(sessionId);

    if (!session || !session.entryStarted) {
        return res.status(400).json({
            success: false,
            error: 'Entry not started'
        });
    }

    try {
        // Use engine nextField() if available
        let page = null;
        if (session.engine?.nextField) {
            let result = session.engine.nextField();
            if (result?.then) result = await result;
            page = result;
        }
        
        if (!page) {
            page = await wasmService.getCurrentPage(sessionId);
        }
        
        res.json({
            success: true,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Move back to previous field (C_GoToField(ENGINE_BACKFIELD))
 */
router.post('/session/:sessionId/previous', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.previousField(sessionId);
        
        // Also return current page state after moving back
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Go to a specific field (C_MoveToField)
 */
router.post('/session/:sessionId/goto', async (req, res) => {
    const { sessionId } = req.params;
    const { fieldSymbol, fieldName, occurrence1 = 1, occurrence2 = 0, occurrence3 = 0 } = req.body;
    const field = fieldSymbol || fieldName;

    console.log('[API /goto] Request body:', req.body);
    console.log('[API /goto] Extracted values:', { field, occurrence1, occurrence2, occurrence3 });

    if (!field) {
        return res.status(400).json({
            success: false,
            error: 'fieldSymbol or fieldName is required'
        });
    }

    try {
        const result = await wasmService.goToField(sessionId, field, occurrence1, occurrence2, occurrence3);
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== GROUP/LEVEL OPERATIONS ====================
// Maps to: C_EndGroup, C_EndLevel, C_EndGroupOcc

/**
 * End roster (alias for end-group)
 */
router.post('/session/:sessionId/end-roster', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.endRoster(sessionId);
        
        // Return current page state after ending roster
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * End group (C_EndGroup)
 */
router.post('/session/:sessionId/end-group', async (req, res) => {
    const { sessionId } = req.params;
    const { postProc } = req.body;

    try {
        const result = await wasmService.endGroup(sessionId);
        
        // Return current page state after ending group
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * End level (C_EndLevel)
 */
router.post('/session/:sessionId/end-level', async (req, res) => {
    const { sessionId } = req.params;
    const { nextLevel, writeNode } = req.body;

    try {
        const result = await wasmService.endLevel(sessionId);
        
        // Return current page state after ending level
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * End group occurrence (C_EndGroupOcc)
 */
router.post('/session/:sessionId/end-group-occ', async (req, res) => {
    const { sessionId } = req.params;
    const { postProc } = req.body;
    const session = wasmService.getSession(sessionId);

    if (!session || !session.entryStarted) {
        return res.status(400).json({
            success: false,
            error: 'Entry not started'
        });
    }

    try {
        let page = null;
        if (session.engine?.endLevelOcc) {
            let result = session.engine.endLevelOcc();
            if (result?.then) result = await result;
            page = result;
        }
        
        if (!page) {
            page = await wasmService.getCurrentPage(sessionId);
        }
        
        res.json({
            success: true,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ROSTER OCCURRENCE OPERATIONS ====================
// Maps to: C_InsertOcc, C_DeleteOcc, C_InsertOccAfter, C_SortOcc

/**
 * Insert occurrence (C_InsertOcc)
 */
router.post('/session/:sessionId/insert-occ', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.insertOcc(sessionId);
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Insert occurrence after current (C_InsertOccAfter)
 */
router.post('/session/:sessionId/insert-occ-after', async (req, res) => {
    const { sessionId } = req.params;
    const session = wasmService.getSession(sessionId);

    if (!session || !session.entryStarted) {
        return res.status(400).json({
            success: false,
            error: 'Entry not started'
        });
    }

    try {
        let success = false;
        if (session.engine?.insertOccAfter) {
            let result = session.engine.insertOccAfter();
            if (result?.then) result = await result;
            success = result;
        }
        
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Delete occurrence (C_DeleteOcc)
 */
router.post('/session/:sessionId/delete-occ', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.deleteOcc(sessionId);
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Sort occurrences (C_SortOcc)
 */
router.post('/session/:sessionId/sort-occ', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.sortOcc(sessionId);
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: true,
            ...result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== CAPI/QUESTION TEXT ====================
// Maps to: C_GetCapi, GetQuestionTextUrl

/**
 * Get question text for a field
 */
router.get('/session/:sessionId/question', async (req, res) => {
    const { sessionId } = req.params;
    const { field } = req.query;

    try {
        const result = await wasmService.getQuestionText(sessionId, field);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get responses/value set for a field
 */
router.get('/session/:sessionId/responses', async (req, res) => {
    const { sessionId } = req.params;
    const { field } = req.query;

    try {
        const responses = await wasmService.getResponses(sessionId, field);
        res.json({
            success: true,
            responses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== CASE TREE ====================
// Maps to: GetCaseTree (portable interface)

/**
 * Get case tree
 */
router.get('/session/:sessionId/case-tree', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const caseTree = await wasmService.getCaseTree(sessionId);
        res.json({
            success: true,
            caseTree
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== CASE OPERATIONS ====================
// Maps to: C_IsNewCase, PartialSave

/**
 * Partial save the current case
 * This saves the case in its current state without completing entry
 */
router.post('/session/:sessionId/partial-save', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await wasmService.partialSave(sessionId);
        
        // Return current page state after partial save
        const page = await wasmService.getCurrentPage(sessionId);
        
        res.json({
            success: result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check if current case is new (C_IsNewCase)
 */
router.get('/session/:sessionId/is-new-case', async (req, res) => {
    const { sessionId } = req.params;
    const session = wasmService.getSession(sessionId);

    if (!session || !session.entryStarted) {
        return res.status(400).json({
            success: false,
            error: 'Entry not started'
        });
    }

    try {
        // Note: isNewCase might need to be added to WASM bindings
        res.json({
            success: true,
            isNewCase: true // Default for now
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== ACTION INVOKER / LOGIC EVALUATION ====================

/**
 * Invoke a user-defined CSPro logic function
 * Used by CAPI HTML buttons that call functions like EndPersonRoster()
 */
router.post('/session/:sessionId/invoke-function', async (req, res) => {
    const { sessionId } = req.params;
    const { functionName, arguments: args } = req.body;

    if (!functionName) {
        return res.status(400).json({
            success: false,
            error: 'Function name is required'
        });
    }

    try {
        const result = await wasmService.invokeLogicFunction(
            sessionId,
            functionName,
            args || {}
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Evaluate CSPro logic code directly
 * Handles Logic.eval actions from CAPI HTML
 */
router.post('/session/:sessionId/eval-logic', async (req, res) => {
    const { sessionId } = req.params;
    const { logic } = req.body;

    if (!logic) {
        return res.status(400).json({
            success: false,
            error: 'Logic code is required'
        });
    }

    try {
        const result = await wasmService.evalLogic(sessionId, logic);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Execute Action Invoker action
 */
router.post('/session/:sessionId/action', async (req, res) => {
    const { sessionId } = req.params;
    const { action, arguments: args, accessToken } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'Action is required'
        });
    }

    try {
        const result = await wasmService.executeAction(
            sessionId,
            action,
            args || {},
            accessToken || ''
        );
        res.json({
            success: true,
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Submit a response to a pending dialog
 */
router.post('/session/:sessionId/dialog', async (req, res) => {
    const { sessionId } = req.params;
    const { response } = req.body;

    if (!response) {
        return res.status(400).json({
            success: false,
            error: 'Response data is required'
        });
    }

    try {
        const result = await wasmService.submitDialogResponse(sessionId, response);
        
        // If the result is still a dialog (chained dialogs), return it
        if (result.status === 'dialog') {
            return res.json(result);
        }
        
        // Otherwise, return the result of the resumed operation
        // We might need to fetch the current page if the operation was a navigation
        // But the result from executeWasmWithDialogHandling is just the raw result of the function
        // We need to know what the original operation was to construct the correct response
        // However, for simplicity, we can just return the generic result and let the client refresh the page
        
        // Better: Always return the current page state after a dialog interaction
        let page = null;
        try {
            page = await wasmService.getCurrentPage(sessionId);
        } catch (e) {
            // Ignore if page fetch fails (e.g. if entry ended)
        }
        
        res.json({
            success: true,
            result: result.result,
            page
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
