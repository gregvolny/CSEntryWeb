/**
 * Field Mapper Module
 * 
 * Maps case tree labels to HTML field names.
 * This mirrors MFC's field lookup mechanism where the UI queries the
 * in-memory Case object to find field values by field name.
 * 
 * MFC Equivalent:
 * - After ReadCasetainer, fields are in memory by their internal names
 * - UI components query by field name (e.g., "HOUSEHOLD_ID", "FIRST_NAME")
 * - Case tree provides display labels (e.g., "Household ID", "First Name")
 * - We need to map display labels → field names
 */

/**
 * Build a map from case tree labels to field names
 * @param {Object} formData - Form metadata from engine
 * @returns {Map<string, string>} Map of label → field name
 */
export function buildLabelToFieldNameMap(formData) {
    const labelMap = new Map();
    
    if (!formData?.formFiles) {
        console.warn('[FieldMapper] No formData.formFiles available');
        return labelMap;
    }

    console.log('[FieldMapper] Building label to field name map...');

    for (const formFile of formData.formFiles) {
        for (const form of formFile.forms || []) {
            // Process regular (non-roster) fields
            for (const field of form.fields || []) {
                addFieldToMap(labelMap, field);
            }

            // Process roster fields
            for (const roster of form.rosters || []) {
                for (const column of roster.columns || []) {
                    for (const field of column.fields || []) {
                        addFieldToMap(labelMap, field);
                    }
                }
            }
        }
    }

    console.log('[FieldMapper] Built map with', labelMap.size, 'entries');
    if (labelMap.size > 0) {
        console.log('[FieldMapper] Sample entries:', Array.from(labelMap.entries()).slice(0, 5));
    }

    return labelMap;
}

/**
 * Add a field to the label map
 * @private
 * @param {Map} labelMap - The map to add to
 * @param {Object} field - Field metadata
 */
function addFieldToMap(labelMap, field) {
    if (!field.name) {
        console.warn('[FieldMapper] Field without name:', field);
        return;
    }

    // Try multiple label sources in priority order:
    // 1. field.text - usually the displayed label
    // 2. field.label - alternative label property
    // 3. field.name - fallback to field name itself
    const label = field.text || field.label || field.name;
    
    // Store the mapping
    labelMap.set(label, field.name);
    
    // Also store case-insensitive version for robustness
    labelMap.set(label.toLowerCase(), field.name);
}

/**
 * Map a case tree label to a field name
 * @param {string} label - Label from case tree
 * @param {Map<string, string>} labelMap - Label to field name map
 * @returns {string|null} Field name or null if not found
 */
export function mapLabelToFieldName(label, labelMap) {
    if (!label || !labelMap) {
        return null;
    }

    // Try exact match first
    let fieldName = labelMap.get(label);
    if (fieldName) {
        return fieldName;
    }

    // Try case-insensitive match
    fieldName = labelMap.get(label.toLowerCase());
    if (fieldName) {
        return fieldName;
    }

    // No match found
    console.warn('[FieldMapper] Could not map label to field name:', label);
    return null;
}
