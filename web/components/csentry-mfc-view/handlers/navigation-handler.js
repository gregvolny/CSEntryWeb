/**
 * Navigation Handler - Manages field navigation and path control
 * @module components/csentry-mfc-view/handlers/navigation-handler
 */

/**
 * Build the navigation field list from form structure
 * @param {Object} form - Form definition
 * @returns {Array} Array of navigation fields
 */
export function buildNavigationFields(form) {
    const navigationFields = [];
    
    // First, add standalone fields (sorted by Y then X position)
    const standaloneFields = (form.fields || []).map(f => ({
        name: f.name,
        field: f,
        occurrence: 1,
        rosterName: null,
        y: f.y || 0,
        x: f.x || 0,
        value: ''
    }));
    
    // Sort by Y position (top to bottom), then X (left to right)
    standaloneFields.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
        return a.x - b.x;
    });
    
    navigationFields.push(...standaloneFields);
    
    // Then, add roster fields
    (form.rosters || []).forEach(roster => {
        const maxOcc = Math.min(roster.maxOccurrences || 20, 10);
        
        for (let rowIdx = 0; rowIdx < maxOcc; rowIdx++) {
            (roster.columns || []).forEach(col => {
                (col.fields || []).forEach(field => {
                    navigationFields.push({
                        name: field.name,
                        field: field,
                        occurrence: rowIdx + 1,
                        rosterName: roster.name,
                        y: roster.y + rowIdx * 20,
                        x: roster.x,
                        value: ''
                    });
                });
            });
        }
    });
    
    console.log(`Built navigation with ${navigationFields.length} fields`);
    return navigationFields;
}

/**
 * Find navigation index for a field
 * @param {Array} navigationFields - Navigation field list
 * @param {string} fieldName - Field name
 * @param {number} occurrence - Occurrence number (1-based)
 * @param {string} rosterName - Roster name (optional)
 * @returns {number} Index or -1 if not found
 */
export function findNavigationIndex(navigationFields, fieldName, occurrence = 1, rosterName = null) {
    return navigationFields.findIndex(nf => 
        nf.name === fieldName && 
        nf.occurrence === occurrence && 
        nf.rosterName === rosterName
    );
}

/**
 * Store field value in navigation data
 * @param {Array} navigationFields - Navigation field list
 * @param {string} fieldName - Field name
 * @param {string} value - Value to store
 * @param {number} occurrence - Occurrence number
 */
export function storeFieldValue(navigationFields, fieldName, value, occurrence = 1) {
    const navField = navigationFields.find(nf => 
        nf.name === fieldName && nf.occurrence === occurrence
    );
    if (navField) {
        navField.value = value;
    }
}

/**
 * Get value from navigation field
 * @param {Array} navigationFields - Navigation field list
 * @param {string} fieldName - Field name
 * @param {number} occurrence - Occurrence number
 * @returns {string} Stored value
 */
export function getStoredValue(navigationFields, fieldName, occurrence = 1) {
    const navField = navigationFields.find(nf => 
        nf.name === fieldName && nf.occurrence === occurrence
    );
    return navField?.value || '';
}

/**
 * Focus on a navigation field in the form
 * @param {HTMLElement} formContainer - Form container element
 * @param {Object} navField - Navigation field object
 * @returns {HTMLElement|null} The focused input element or null
 */
export function focusNavigationField(formContainer, navField) {
    if (!formContainer || !navField) return null;
    
    let input = null;
    
    if (navField.rosterName) {
        // Roster field
        const selector = `[data-roster-name="${navField.rosterName}"] input[data-field-name="${navField.name}"][data-row-index="${navField.occurrence - 1}"]`;
        input = formContainer.querySelector(selector);
    } else {
        // Standalone field
        const selector = `input[data-field-name="${navField.name}"], select[data-field-name="${navField.name}"], textarea[data-field-name="${navField.name}"]`;
        input = formContainer.querySelector(selector);
    }
    
    if (input) {
        input.focus();
        if (input.select) input.select();
    }
    
    return input;
}

/**
 * Get the current field input element
 * @param {HTMLElement} formContainer - Form container element
 * @param {string} fieldName - Field name
 * @param {number} occurrence - Occurrence number (1-based)
 * @param {string} rosterName - Roster name (optional)
 * @returns {HTMLElement|null} The input element or null
 */
export function getCurrentFieldInput(formContainer, fieldName, occurrence = 1, rosterName = null) {
    if (!formContainer || !fieldName) return null;
    
    let input = null;
    
    if (rosterName) {
        // Roster field
        const rowIdx = occurrence - 1;
        const selector = `[data-roster-name="${rosterName}"] input[data-field-name="${fieldName}"][data-row-index="${rowIdx}"]`;
        input = formContainer.querySelector(selector);
    } else {
        // Standalone field
        const selector = `input[data-field-name="${fieldName}"], select[data-field-name="${fieldName}"], textarea[data-field-name="${fieldName}"]`;
        input = formContainer.querySelector(selector);
    }
    
    return input;
}

/**
 * Move to a specific roster cell
 * @param {HTMLElement} formContainer - Form container element
 * @param {Object} rosters - Roster info map
 * @param {string} rosterName - Roster name
 * @param {string} fieldName - Field name
 * @param {number} rowIdx - Target row index
 */
export function moveToRosterCell(formContainer, rosters, rosterName, fieldName, rowIdx) {
    const rosterInfo = rosters?.[rosterName];
    if (!rosterInfo) return;
    
    const maxOcc = rosterInfo.data.maxOccurrences || 20;
    rowIdx = Math.max(0, Math.min(maxOcc - 1, rowIdx));
    
    const selector = `[data-roster-name="${rosterName}"] input[data-field-name="${fieldName}"][data-row-index="${rowIdx}"]`;
    const input = formContainer.querySelector(selector);
    if (input) {
        input.focus();
        if (input.select) input.select();
    }
}

/**
 * Move to a different column in the same roster row
 * @param {HTMLElement} formContainer - Form container element
 * @param {Object} rosters - Roster info map
 * @param {string} rosterName - Roster name
 * @param {string} currentFieldName - Current field name
 * @param {number} rowIdx - Current row index
 * @param {number} direction - -1 for previous, +1 for next
 */
export function moveToRosterColumn(formContainer, rosters, rosterName, currentFieldName, rowIdx, direction) {
    const rosterInfo = rosters?.[rosterName];
    if (!rosterInfo) return;
    
    const roster = rosterInfo.data;
    const columns = roster.columns || [];
    
    // Find current column index
    let currentColIdx = -1;
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const col = columns[cIdx];
        if (col.fields?.some(f => f.name === currentFieldName || f.itemName === currentFieldName)) {
            currentColIdx = cIdx;
            break;
        }
    }
    
    if (currentColIdx < 0) return;
    
    // Calculate target column
    const targetColIdx = currentColIdx + direction;
    if (targetColIdx < 0 || targetColIdx >= columns.length) return;
    
    // Get first field in target column
    const targetCol = columns[targetColIdx];
    const targetField = targetCol.fields?.[0];
    if (!targetField) return;
    
    const targetFieldName = targetField.name || targetField.itemName;
    const selector = `[data-roster-name="${rosterName}"] input[data-field-name="${targetFieldName}"][data-row-index="${rowIdx}"]`;
    const input = formContainer.querySelector(selector);
    if (input) {
        input.focus();
        if (input.select) input.select();
    }
}

export default { 
    buildNavigationFields, 
    findNavigationIndex, 
    storeFieldValue,
    getStoredValue,
    focusNavigationField,
    getCurrentFieldInput,
    moveToRosterCell, 
    moveToRosterColumn 
};
