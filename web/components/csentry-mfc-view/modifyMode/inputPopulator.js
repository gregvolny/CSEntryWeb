/**
 * Input Populator Module
 * 
 * Populates HTML input fields with values from the loaded case.
 * This mirrors MFC's form rendering where the UI reads from the
 * in-memory Case object and displays values in input controls.
 * 
 * MFC Equivalent:
 * - After ReadCasetainer, the form is rendered
 * - Each input control queries the Case object for its value
 * - Controls display the pre-loaded values
 * - User can then modify and save
 */

/**
 * Populate HTML inputs with field values
 * @param {Array} fieldValues - Extracted field values with labels
 * @param {Map<string, string>} labelMap - Label to field name mapping
 * @param {HTMLElement} formContainer - Container element with inputs
 * @returns {number} Number of inputs populated
 */
export function populateInputs(fieldValues, labelMap, formContainer) {
    if (!fieldValues || !labelMap || !formContainer) {
        console.error('[InputPopulator] Invalid parameters:', { 
            fieldValuesCount: fieldValues?.length, 
            labelMapSize: labelMap?.size, 
            hasContainer: !!formContainer 
        });
        return 0;
    }

    console.log('[InputPopulator] Populating', fieldValues.length, 'field values...');
    
    let populatedCount = 0;

    for (const { label, value: fieldValue, occurrence } of fieldValues) {
        // Map label to field name
        const fieldName = labelMap.get(label) || labelMap.get(label.toLowerCase());
        
        if (!fieldName) {
            console.warn('[InputPopulator] No field name for label:', label);
            continue;
        }

        // Find the HTML input element
        const input = findInputElement(formContainer, fieldName, occurrence);
        
        if (!input) {
            console.warn('[InputPopulator] No input found for:', fieldName, 'occ:', occurrence);
            continue;
        }

        // Populate the input
        if (setInputValue(input, fieldValue, fieldName)) {
            populatedCount++;
            console.log('[InputPopulator] ✓ Set', fieldName, occurrence > 1 ? `[${occurrence}]` : '', '=', fieldValue);
        }
    }

    console.log('[InputPopulator] Populated', populatedCount, 'of', fieldValues.length, 'inputs');
    return populatedCount;
}

/**
 * Find an input element in the form container
 * @private
 * @param {HTMLElement} formContainer - Container element
 * @param {string} fieldName - Field name
 * @param {number} occurrence - Occurrence number for roster fields
 * @returns {HTMLInputElement|null}
 */
function findInputElement(formContainer, fieldName, occurrence) {
    let element = null;
    
    // For roster fields (any occurrence), try the row-indexed selector first
    // Roster row index is 0-based, occurrence is 1-based
    const rowIndex = (occurrence || 1) - 1;
    const rosterSelector = `input[data-field-name="${fieldName}"][data-row-index="${rowIndex}"]`;
    
    console.log('[InputPopulator] Trying roster selector:', rosterSelector);
    element = formContainer.querySelector(rosterSelector);
    
    // If not found in roster, try standalone field selector
    if (!element) {
        const standaloneSelector = `[data-field-name="${fieldName}"]`;
        console.log('[InputPopulator] Trying standalone selector:', standaloneSelector);
        element = formContainer.querySelector(standaloneSelector);
    }

    // If we found a tickmark container, get the actual input inside
    if (element && element.classList?.contains('form-field-tickmark-container')) {
        const innerInput = element.querySelector('input');
        if (innerInput) {
            element = innerInput;
        }
    }

    // If we found a roster-field-container (ComboBox, RadioButton, etc.), get the input inside
    if (element && element.classList?.contains('roster-field-container')) {
        const innerInput = element.querySelector('input');
        if (innerInput) {
            console.log('[InputPopulator] Found input inside roster-field-container for:', fieldName);
            element = innerInput;
        }
    }

    // Verify it's an input element
    if (element && element.tagName !== 'INPUT') {
        console.warn('[InputPopulator] Found element is not INPUT:', element.tagName, 'for', fieldName);
        return null;
    }

    return element;
}

/**
 * Set the value of an input element
 * @private
 * @param {HTMLInputElement} input - Input element
 * @param {*} value - Value to set
 * @param {string} fieldName - Field name (for logging)
 * @returns {boolean} True if successful
 */
function setInputValue(input, value, fieldName) {
    try {
        // Check if this is a checkbox capture type field
        // The case tree returns LABELS (e.g., "BENGALI (বাংলা), ENGLISH") instead of codes
        // We MUST NOT use labels to fill checkbox fields - skip them entirely
        const captureType = input.dataset?.captureType;
        if (captureType === 'checkbox') {
            console.log('[InputPopulator] ⚠️ Skipping checkbox field:', fieldName, '- case tree returns labels, not codes');
            return false; // Don't populate checkbox fields with label values
        }
        
        // Convert value to string for input
        const stringValue = String(value);
        
        // Handle different input types
        const inputType = input.type?.toLowerCase();
        
        if (inputType === 'checkbox') {
            // HTML checkbox input - set checked state
            input.checked = (value === '1' || value === 'true' || value === true);
        } else if (inputType === 'radio') {
            // Radio button - check if this is the matching value
            if (input.value === stringValue) {
                input.checked = true;
            }
        } else {
            // Text, number, etc. - set value
            input.value = stringValue;
        }

        // Trigger change event so any listeners are notified
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));

        return true;
    } catch (error) {
        console.error('[InputPopulator] Error setting value for', fieldName, ':', error);
        return false;
    }
}
