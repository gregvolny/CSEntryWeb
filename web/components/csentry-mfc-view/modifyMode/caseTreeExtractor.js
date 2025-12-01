/**
 * Case Tree Extractor Module
 * 
 * Mirrors MFC's ReadCasetainer functionality by extracting all field values
 * from the case tree structure returned by the WASM engine.
 * 
 * MFC Flow:
 * 1. ModifyStart() - Initialize modify mode
 * 2. ReadCasetainer(data_case, position) - Load case data into memory
 * 3. All field values become immediately available in the Case object
 * 4. UI reads from this in-memory structure to populate inputs
 */

/**
 * Extract all field values from case tree structure
 * @param {Object} caseTree - The case tree from getCaseTree API
 * @returns {Array<{fieldId: string, label: string, value: string|number, occurrence: number, index: number}>}
 */
export function extractFieldValuesFromCaseTree(caseTree) {
    if (!caseTree || typeof caseTree !== 'object') {
        console.error('[CaseTreeExtractor] Invalid case tree:', caseTree);
        return [];
    }

    console.log('[CaseTreeExtractor] Extracting field values from case tree...');
    
    const fieldValues = [];
    extractFieldValuesRecursive(caseTree, fieldValues, 1);
    
    console.log('[CaseTreeExtractor] Extracted', fieldValues.length, 'field values');
    return fieldValues;
}

/**
 * Recursively extract field values from tree nodes
 * @private
 * @param {Object} node - Current tree node
 * @param {Array} fieldValues - Accumulator for field values
 * @param {number} occurrence - Current occurrence number for roster items
 */
function extractFieldValuesRecursive(node, fieldValues, occurrence = 1) {
    if (!node) return;

    // Node types (from MFC case tree structure):
    // 0 = case/questionnaire
    // 1 = form
    // 2 = roster/record
    // 4 = field/item (has value)
    
    // If this is a field node with a value, extract it
    if (node.type === 4 && hasValidValue(node.value)) {
        fieldValues.push({
            fieldId: node.id,
            label: node.label,
            value: node.value,
            occurrence: occurrence,
            index: node.index || [0, 0, 0]
        });
        
        console.log('[CaseTreeExtractor] Field:', node.label, '=', node.value, 'occ:', occurrence);
    }
    
    // Process children
    if (node.children && Array.isArray(node.children)) {
        if (node.type === 2) {
            // Roster node - each child represents an occurrence
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                
                // Extract occurrence number from label like "Person Roster (1)"
                const occMatch = child.label?.match(/\((\d+)\)/);
                const occ = occMatch ? parseInt(occMatch[1]) : i + 1;
                
                extractFieldValuesRecursive(child, fieldValues, occ);
            }
        } else {
            // Non-roster node - preserve occurrence number
            for (const child of node.children) {
                extractFieldValuesRecursive(child, fieldValues, occurrence);
            }
        }
    }
}

/**
 * Check if a value is valid (not empty, null, or undefined)
 * @private
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function hasValidValue(value) {
    return value !== '' && value !== null && value !== undefined;
}
