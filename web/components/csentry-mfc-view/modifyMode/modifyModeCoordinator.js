/**
 * Modify Mode Coordinator Module
 * 
 * Orchestrates the modify mode workflow following MFC's approach:
 * 1. ModifyStart() - Initialize modify session
 * 2. ReadCasetainer() - Load case data into memory
 * 3. ProcessModify() - Navigate to first field
 * 4. Display form with pre-populated values
 * 
 * This is the main entry point that combines all other modules.
 */

import { extractFieldValuesFromCaseTree } from './caseTreeExtractor.js';
import { buildLabelToFieldNameMap, mapLabelToFieldName } from './fieldMapper.js';
import { populateInputs } from './inputPopulator.js';

/**
 * Load and populate form data for modify mode
 * 
 * MFC Flow:
 * - CMainFrame::OnModifyCase() → ModifyStarterHelper()
 * - PostCaseLoadingStartActions(MODIFY_MODE, pNodeInfo)
 * - pRunApl->ModifyStart()
 * - pRunApl->ProcessModify(position) 
 *   └─> ReadCasetainer(data_case, position) - loads all data
 * - pRunApl->NextField() - navigates to first field
 * - Form displays with pre-populated values from data_case
 * 
 * @param {Object} csproProxy - CSPro API proxy
 * @param {Object} formData - Form metadata
 * @param {HTMLElement} formContainer - Container with form inputs
 * @returns {Promise<{success: boolean, populatedCount: number, error?: string}>}
 */
export async function loadCaseForModify(csproProxy, formData, formContainer) {
    try {
        console.log('[ModifyModeCoordinator] Starting modify mode case load...');

        // Step 1: Get case tree (equivalent to ReadCasetainer)
        // This loads the case data from the repository into memory
        console.log('[ModifyModeCoordinator] Fetching case tree from engine...');
        console.log('[ModifyModeCoordinator] Engine proxy has getCaseTree:', typeof csproProxy.getCaseTree);
        
        // Check if getCaseTree method exists
        if (!csproProxy.getCaseTree) {
            console.warn('[ModifyModeCoordinator] ❌ getCaseTree method not available on engine proxy');
            console.warn('[ModifyModeCoordinator] This WASM build does not include the getCaseTree API');
            console.warn('[ModifyModeCoordinator] The CSPro WASM module needs to be rebuilt with the latest bindings');
            return { 
                success: false, 
                populatedCount: 0,
                totalFields: 0,
                error: 'getCaseTree method not available - WASM binary needs rebuild'
            };
        }
        
        // Call getCaseTree - it returns the tree directly or null
        let caseTree = csproProxy.getCaseTree();
        
        // Handle if it's a Promise
        if (caseTree?.then) {
            console.log('[ModifyModeCoordinator] getCaseTree returned a Promise, awaiting...');
            caseTree = await caseTree;
        }
        
        // Check if we got valid data
        if (!caseTree) {
            console.warn('[ModifyModeCoordinator] ❌ getCaseTree returned null/undefined');
            console.warn('[ModifyModeCoordinator] Possible causes:');
            console.warn('[ModifyModeCoordinator]   1. No case is currently loaded');
            console.warn('[ModifyModeCoordinator]   2. modifyCase was not called before getCaseTree');
            console.warn('[ModifyModeCoordinator]   3. WASM getCaseTree implementation returned null');
            return { 
                success: false, 
                populatedCount: 0,
                totalFields: 0,
                error: 'Case tree not available - no case loaded or WASM method failed'
            };
        }

        console.log('[ModifyModeCoordinator] Case tree loaded:', caseTree.label || caseTree.id);
        console.log('[ModifyModeCoordinator] Case tree structure:', JSON.stringify(caseTree, null, 2).substring(0, 500));

        // Step 2: Extract all field values from case tree
        // This is equivalent to reading values from the in-memory Case object
        const fieldValues = extractFieldValuesFromCaseTree(caseTree);
        
        if (fieldValues.length === 0) {
            console.warn('[ModifyModeCoordinator] No field values extracted from case tree');
            return { success: true, populatedCount: 0 };
        }

        // Step 3: Build label mapping
        // Map case tree labels to HTML field names
        const labelMap = buildLabelToFieldNameMap(formData);
        
        if (labelMap.size === 0) {
            throw new Error('Failed to build label to field name map');
        }

        // Step 4: Populate HTML inputs
        // This is equivalent to MFC's form rendering with pre-loaded values
        const populatedCount = populateInputs(fieldValues, labelMap, formContainer);

        console.log('[ModifyModeCoordinator] Modify mode case load complete');
        console.log('[ModifyModeCoordinator] Populated', populatedCount, 'inputs');

        return { 
            success: true, 
            populatedCount,
            totalFields: fieldValues.length
        };

    } catch (error) {
        console.error('[ModifyModeCoordinator] Error loading case for modify:', error);
        return { 
            success: false, 
            populatedCount: 0, 
            error: error.message 
        };
    }
}

/**
 * Check if modify mode prerequisites are met
 * @param {Object} csproProxy - CSPro API proxy
 * @param {Object} formData - Form metadata
 * @param {HTMLElement} formContainer - Container with form inputs
 * @returns {boolean}
 */
export function canStartModifyMode(csproProxy, formData, formContainer) {
    if (!csproProxy) {
        console.error('[ModifyModeCoordinator] No CSPro proxy available');
        return false;
    }

    if (!formData || !formData.formFiles) {
        console.error('[ModifyModeCoordinator] No form data available');
        return false;
    }

    if (!formContainer) {
        console.error('[ModifyModeCoordinator] No form container available');
        return false;
    }

    return true;
}
