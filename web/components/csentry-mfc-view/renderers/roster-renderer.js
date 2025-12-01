/**
 * Roster Renderer - Renders CSPro rosters (data grids)
 * Strictly based on MFC implementation (GridWnd.cpp, DEEdit.cpp, Field.cpp)
 * 
 * Uses tickMarks modules for tick mark rendering to avoid code duplication.
 * All tick mark data comes from the WASM engine.
 * 
 * @module components/csentry-mfc-view/renderers/roster-renderer
 */

import { CAPTURE_TYPES, ROSTER_ORIENTATION, FREE_MOVEMENT } from '../utils/constants.js';

// Import tick marks functionality from tickMarks modules
import { 
    shouldShowTickMarks,
    getTickMarkDataFromEngine,
    drawTickMarksTransparent,
    createTickMarkCanvas,
    TICK_MARK_CONFIG
} from '../tickMarks/index.js';

// Re-export calculateFieldWidth from tickMarks for backward compatibility
import { calculateFieldWidth } from '../tickMarks/utils.js';
export { calculateFieldWidth };

/**
 * Create roster table with columns and rows
 * @param {Object} roster - Roster definition
 * @param {Object} callbacks - Event callbacks for cell interactions
 * @returns {HTMLDivElement} Roster container element
 */
export function createRosterTable(roster, callbacks = {}) {
    const container = document.createElement('div');
    container.className = 'form-roster';
    container.dataset.rosterName = roster.name;
    container.dataset.orientation = roster.orientation || 'Horizontal';
    container.dataset.freeMovementMode = roster.freeMovementMode ?? 0;
    
    const table = document.createElement('table');
    table.className = 'roster-table';
    
    // Create header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.className = 'roster-header';
    
    // Row number column (#)
    const rowNumHeader = document.createElement('th');
    rowNumHeader.textContent = '#';
    rowNumHeader.className = 'roster-row-number';
    headerRow.appendChild(rowNumHeader);
    
    // Column headers - only for columns with fields (per MFC behavior)
    (roster.columns || []).forEach(col => {
        // Skip columns without data fields
        if (!col.fields || col.fields.length === 0) {
            return;
        }
        const th = document.createElement('th');
        th.textContent = col.heading || col.label || '';
        th.style.width = col.width ? col.width + 'px' : 'auto';
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create data rows
    const tbody = document.createElement('tbody');
    tbody.className = 'roster-body';
    
    const maxOcc = Math.min(roster.maxOccurrences || 20, 50);
    
    for (let rowIdx = 0; rowIdx < maxOcc; rowIdx++) {
        const row = document.createElement('tr');
        row.dataset.rowIndex = rowIdx;
        
        // Row number cell
        const rowNumCell = document.createElement('td');
        rowNumCell.className = 'roster-row-number';
        rowNumCell.textContent = (rowIdx + 1).toString();
        row.appendChild(rowNumCell);
        
        // Data cells - only for columns with fields
        (roster.columns || []).forEach(col => {
            // Skip columns without data fields
            if (!col.fields || col.fields.length === 0) {
                return;
            }
            
            const cell = document.createElement('td');
            cell.className = 'roster-cell';
            
            // Each column can have multiple fields
            (col.fields || []).forEach(field => {
                const cellInput = createRosterCellInput(field, rowIdx, roster, callbacks);
                cell.appendChild(cellInput);
            });
            
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    container.appendChild(table);
    
    return container;
}

/**
 * Create input element for roster cell based on capture type
 * Handles text inputs with tick marks and checkbox capture type
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Cell container with appropriate input element
 */
export function createRosterCellInput(field, rowIdx, roster, callbacks = {}) {
    const occurrence = rowIdx + 1;
    const CT = CAPTURE_TYPES;
    
    // Try to get captureType from multiple sources
    // 1. field.captureType (from engine)
    // 2. field.capture_type (alternative naming)
    // 3. Infer from responses: if responses exist and field has checkbox-like properties
    let rawCaptureType = field.captureType ?? field.capture_type;
    const responses = field.responses || [];
    
    // If captureType is not set but field has responses, try to infer it
    // CheckBox fields typically have maxSelections property
    if (!rawCaptureType && responses.length > 0) {
        if (field.maxSelections !== undefined && field.maxSelections > 1) {
            rawCaptureType = CT.CheckBox;
            if (rowIdx === 0) {
                console.log('[RosterRenderer] Inferred CheckBox captureType from maxSelections for:', field.name);
            }
        }
    }
    
    // Default to TextBox if still not determined
    if (rawCaptureType === undefined) {
        rawCaptureType = CT.TextBox;
    }
    
    // Debug: Log the raw captureType for troubleshooting
    if (rowIdx === 0) {
        console.log('[RosterRenderer] createRosterCellInput:', field.name, 
            'rawCaptureType:', rawCaptureType, 'type:', typeof rawCaptureType,
            'CT.CheckBox:', CT.CheckBox, 'CT.TextBox:', CT.TextBox,
            'responses:', responses.length, 'maxSelections:', field.maxSelections,
            'field:', field);
    }
    
    // Normalize captureType - handle both string and integer formats
    // WASMBindings.cpp sends strings from convertField() but integers from getCurrentPage()
    let captureType = rawCaptureType;
    if (typeof rawCaptureType === 'string') {
        const captureTypeMap = {
            'textbox': CT.TextBox,
            'radiobutton': CT.RadioButton,
            'checkbox': CT.CheckBox,
            'dropdown': CT.DropDown,
            'combobox': CT.ComboBox,
            'date': CT.Date,
            'numberpad': CT.NumberPad,
            'barcode': CT.Barcode,
            'slider': CT.Slider,
            'togglebutton': CT.ToggleButton
        };
        captureType = captureTypeMap[rawCaptureType.toLowerCase()] ?? CT.TextBox;
        if (rowIdx === 0) {
            console.log('[RosterRenderer] Normalized captureType:', captureType, 'for field:', field.name);
        }
    }
    
    // Handle Checkbox capture type - use dialog-based approach
    // Checkbox fields are clickable cells that open a native dialog
    if (captureType === CT.CheckBox) {
        if (rowIdx === 0) console.log('[RosterRenderer] ROUTING TO CheckBox handler for:', field.name);
        return createRosterCheckboxDialogCell(field, rowIdx, roster, callbacks);
    }
    
    // Handle RadioButton capture type (rendered as clickable for value selection)
    if (captureType === CT.RadioButton && responses.length > 0) {
        return createRosterValueSetCell(field, rowIdx, roster, responses, callbacks);
    }
    
    // Handle DropDown capture type - render as actual <select> dropdown (selection only)
    if (captureType === CT.DropDown && responses.length > 0) {
        return createRosterDropdownSelect(field, rowIdx, roster, responses, callbacks);
    }
    
    // Handle ComboBox capture type - text input with HTML5 datalist for autocomplete
    // Unlike DropDown, ComboBox allows BOTH direct text entry AND value selection via autocomplete
    // Per MFC behavior: ComboBox is an editable field with dropdown suggestions
    if (captureType === CT.ComboBox && responses.length > 0) {
        return createRosterComboBoxInput(field, rowIdx, roster, responses, callbacks);
    }
    
    // Default: text input with tick marks per MFC rules
    return createRosterTextInput(field, rowIdx, roster, callbacks);
}

/**
 * Create checkbox dialog cell for roster - plain text input with tick marks
 * Per user requirement: Alpha + CheckBox fields display as plain text inputs with tick marks,
 * NO embedded buttons. F4/Enter opens the checkbox selection dialog.
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Object} callbacks - Event callbacks including onCheckboxDialogRequest
 * @returns {HTMLDivElement} Plain text input container with tick marks
 */
function createRosterCheckboxDialogCell(field, rowIdx, roster, callbacks) {
    const occurrence = rowIdx + 1;
    
    // Determine field properties for sizing
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container roster-checkbox-dialog-cell';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.captureType = 'checkbox';
    
    // Calculate container width based on field length - NO extra space for button
    const containerWidth = calculateFieldWidth(fieldLength);
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.height = '20px';
    
    // Always show tick marks for checkbox fields (Alpha + CheckBox requirement)
    if (fieldLength > 1) {
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas checkbox-tick-canvas';
        
        const canvasHeight = 20;
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        `;
        
        drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
        container.appendChild(canvas);
    }
    
    // Create plain text input - NO buttons, NO dropdown arrows
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric with-tick-marks' : 'roster-cell-input with-tick-marks';
    
    input.dataset.fieldName = field.name;
    input.dataset.rosterName = roster.name;
    input.dataset.rowIndex = rowIdx;
    input.dataset.occurrence = occurrence;
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.dataset.decimalPlaces = decimalPlaces;
    input.dataset.captureType = 'checkbox';
    input.maxLength = fieldLength;
    
    // Style input to overlay tick marks
    input.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
        background: transparent;
        border: 1px solid #808080;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
    `;
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    container.appendChild(input);
    
    // Standard event handlers
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => {
            // Open dialog on F4 or Enter
            if (e.key === 'F4' || e.key === 'Enter') {
                e.preventDefault();
                if (callbacks.onCheckboxDialogRequest) {
                    callbacks.onCheckboxDialogRequest(field, container, rowIdx, roster, input);
                }
            } else {
                callbacks.onKeyDown(e, field, rowIdx, roster, input);
            }
        });
    }
    if (callbacks.onInput) {
        input.addEventListener('input', (e) => callbacks.onInput(e, field, rowIdx, roster, input));
    }
    if (callbacks.onClick) {
        input.addEventListener('click', (e) => callbacks.onClick(e, field, rowIdx, roster, input));
    }
    
    return container;
}

/**
 * Create checkbox cell for roster
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Array} responses - Value set responses
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Checkbox container
 */
function createRosterCheckboxCell(field, rowIdx, roster, responses, callbacks) {
    const occurrence = rowIdx + 1;
    const maxSelections = field.maxCheckboxSelections || responses.length;
    
    // Determine field properties for sizing
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container roster-checkbox-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.captureType = 'checkbox';
    container.dataset.maxSelections = maxSelections;
    
    // MFC Checkbox fields in rosters display as text input with tick marks
    // The value shown is the concatenated codes (e.g., "02030607")
    // Calculate container width based on field length
    const containerWidth = calculateFieldWidth(fieldLength);
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.height = '20px';
    
    // Always show tick marks for checkbox fields
    if (fieldLength > 1) {
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas';
        
        const canvasHeight = 20;
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        `;
        
        drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
        container.appendChild(canvas);
    }
    
    // Create plain text input - NO buttons, NO dropdown
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric with-tick-marks' : 'roster-cell-input with-tick-marks';
    
    input.dataset.fieldName = field.name;
    input.dataset.rosterName = roster.name;
    input.dataset.rowIndex = rowIdx;
    input.dataset.occurrence = occurrence;
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.dataset.decimalPlaces = decimalPlaces;
    input.dataset.captureType = 'checkbox';
    input.maxLength = fieldLength;
    
    // Style input to overlay tick marks
    input.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
        background: transparent;
        border: 1px solid #808080;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
    `;
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    container.appendChild(input);
    
    // Store responses for dialog access
    input._responses = responses;
    input._maxSelections = maxSelections;
    
    // Attach event handlers
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => {
            // Open checkbox dialog on F4 or Enter
            if (e.key === 'F4' || e.key === 'Enter') {
                e.preventDefault();
                if (callbacks.onCheckboxDialogRequest) {
                    callbacks.onCheckboxDialogRequest(field, container, rowIdx, roster, input, responses);
                }
            } else {
                callbacks.onKeyDown(e, field, rowIdx, roster, input);
            }
        });
    }
    if (callbacks.onInput) {
        input.addEventListener('input', (e) => callbacks.onInput(e, field, rowIdx, roster, input));
    }
    if (callbacks.onClick) {
        input.addEventListener('click', (e) => callbacks.onClick(e, field, rowIdx, roster, input));
    }
    
    console.log('[RosterRenderer] Created Checkbox cell (plain text with tick marks) for:', field.name);
    
    return container;
}

/**
 * Create value set cell for roster (for radio/dropdown that shows a clickable cell)
 * In MFC, roster cells with value sets typically open a select dialog on click
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Array} responses - Value set responses
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Container with value display
 */
function createRosterValueSetCell(field, rowIdx, roster, responses, callbacks) {
    const occurrence = rowIdx + 1;
    
    // Determine field properties for sizing
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.hasValueSet = '1';
    
    // Determine if this field should show tick marks per MFC rules
    // User requirement: Numeric must ALWAYS show tick marks
    const showTicks = isNumeric || shouldShowTickMarks(field);
    
    // Calculate container width based on field length
    const containerWidth = calculateFieldWidth(fieldLength);
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    
    if (showTicks && fieldLength > 1) {
        // Create tick mark canvas - overlay on input with transparent background
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas';
        
        const canvasHeight = 20;
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        `;
        
        drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
        container.appendChild(canvas);
    }
    
    // Create text input that opens value set dialog on click
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric' : 'roster-cell-input';
    if (showTicks) {
        input.classList.add('with-tick-marks');
    }
    
    input.dataset.fieldName = field.name;
    input.dataset.rosterName = roster.name;
    input.dataset.rowIndex = rowIdx;
    input.dataset.occurrence = occurrence;
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.dataset.decimalPlaces = decimalPlaces;
    input.dataset.hasValueSet = '1';
    input.maxLength = fieldLength + (decimalPlaces > 0 ? 1 : 0);
    
    // Style based on whether tick marks are shown
    if (showTicks) {
        input.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            z-index: 2;
            background: transparent;
            border: 1px solid #000;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
        `;
    } else {
        input.style.cssText = `
            position: relative;
            z-index: 1;
            background: #ffffff;
            border: 1px solid #808080;
            box-sizing: border-box;
            width: 100%;
            height: 20px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
        `;
    }
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    container.appendChild(input);
    
    // Attach event handlers for value set cell (RadioButton/DropDown)
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => {
            // CSEntry MFC behavior: Enter/Space/F4 opens value set dialog for RadioButton/DropDown
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4') {
                e.preventDefault();
                if (callbacks.onValueSetDialogRequest) {
                    callbacks.onValueSetDialogRequest(field, container, rowIdx, roster, input, responses);
                }
            } else {
                callbacks.onKeyDown(e, field, rowIdx, roster, input);
            }
        });
    }
    if (callbacks.onInput) {
        input.addEventListener('input', (e) => callbacks.onInput(e, field, rowIdx, roster, input));
    }
    if (callbacks.onClick) {
        input.addEventListener('click', (e) => callbacks.onClick(e, field, rowIdx, roster, input));
    }
    
    return container;
}

/**
 * Create ComboBox input for roster cell - plain text input with tick marks
 * MFC ComboBox in roster cells appears as a regular text input with tick marks.
 * The value set dialog opens on F4/Enter, there is NO dropdown arrow visible.
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Array} responses - Value set responses (stored for dialog)
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Container with plain text input
 */
function createRosterComboBoxInput(field, rowIdx, roster, responses, callbacks) {
    const occurrence = rowIdx + 1;
    
    // Determine field properties for sizing
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container roster-combobox-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.captureType = 'combobox';
    
    // ComboBox and numeric fields always show tick marks
    const showTicks = true;
    
    // Calculate container width based on field length
    const containerWidth = calculateFieldWidth(fieldLength);
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.height = '20px';
    
    if (showTicks && fieldLength > 1) {
        // Create tick mark canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas';
        
        const canvasHeight = 20;
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        `;
        
        drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
        container.appendChild(canvas);
    }
    
    // Create plain text input - NO datalist, NO dropdown arrow
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric with-tick-marks' : 'roster-cell-input with-tick-marks';
    
    // NO list attribute - this removes the browser datalist dropdown arrow
    
    input.dataset.fieldName = field.name;
    input.dataset.rosterName = roster.name;
    input.dataset.rowIndex = rowIdx;
    input.dataset.occurrence = occurrence;
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.dataset.decimalPlaces = decimalPlaces;
    input.dataset.captureType = 'combobox';
    input.maxLength = fieldLength + (decimalPlaces > 0 ? 1 : 0);
    
    // Style input to overlay tick marks
    input.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
        background: transparent;
        border: 1px solid #808080;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
    `;
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    container.appendChild(input);
    
    // Store responses for dialog access
    container.dataset.responseCount = responses.length;
    input._responses = responses;
    
    // Attach event handlers
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => {
            // Open dialog on F4 for ComboBox
            if (e.key === 'F4') {
                e.preventDefault();
                if (callbacks.onComboBoxDialogRequest) {
                    callbacks.onComboBoxDialogRequest(field, container, rowIdx, roster, input, responses);
                }
            } else {
                callbacks.onKeyDown(e, field, rowIdx, roster, input);
            }
        });
    }
    if (callbacks.onInput) {
        input.addEventListener('input', (e) => callbacks.onInput(e, field, rowIdx, roster, input));
    }
    if (callbacks.onClick) {
        input.addEventListener('click', (e) => callbacks.onClick(e, field, rowIdx, roster, input));
    }
    
    console.log('[RosterRenderer] Created ComboBox input (plain text, no dropdown) for:', field.name);
    
    return container;
}

/**
 * Create actual <select> dropdown for roster cell (DropDown capture type ONLY)
 * DropDown is a pure selection control - no direct text entry allowed
 * ComboBox is different - it uses createRosterComboBoxInput with datalist autocomplete
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Array} responses - Value set responses
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Container with select dropdown
 */
function createRosterDropdownSelect(field, rowIdx, roster, responses, callbacks) {
    const occurrence = rowIdx + 1;
    
    // Determine field properties for sizing
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container roster-dropdown-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.captureType = 'combobox';
    
    // Calculate container width based on field length (add extra space for dropdown arrow)
    const containerWidth = calculateFieldWidth(fieldLength) + 20;
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    
    // Create native <select> element
    const select = document.createElement('select');
    select.className = isNumeric ? 'roster-cell-select numeric' : 'roster-cell-select';
    select.dataset.fieldName = field.name;
    select.dataset.rosterName = roster.name;
    select.dataset.rowIndex = rowIdx;
    select.dataset.occurrence = occurrence;
    select.dataset.isNumeric = isNumeric ? '1' : '0';
    select.dataset.fieldLength = fieldLength;
    select.dataset.captureType = 'combobox';
    
    // Style the select element to match roster cell appearance
    select.style.cssText = `
        width: 100%;
        height: 20px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
        border: 1px solid #808080;
        background: #ffffff;
        box-sizing: border-box;
    `;
    
    // Add empty option as first choice
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '';
    select.appendChild(emptyOpt);
    
    // Add response options
    responses.forEach((resp, idx) => {
        const opt = document.createElement('option');
        opt.value = resp.code !== undefined ? resp.code : resp.value;
        opt.textContent = `${opt.value} - ${resp.label || resp.text || ''}`;
        opt.dataset.responseIndex = idx;
        select.appendChild(opt);
    });
    
    // Disable if field is protected or mirror
    if (field.isProtected || field.isMirror) {
        select.disabled = true;
    }
    
    container.appendChild(select);
    
    // Attach event handlers
    if (callbacks.onFocus) {
        select.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, select));
    }
    if (callbacks.onBlur) {
        select.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, select));
    }
    if (callbacks.onChange) {
        select.addEventListener('change', (e) => callbacks.onChange(e, field, rowIdx, roster, select));
    }
    if (callbacks.onKeyDown) {
        select.addEventListener('keydown', (e) => callbacks.onKeyDown(e, field, rowIdx, roster, select));
    }
    
    console.log('[RosterRenderer] Created dropdown select for:', field.name, 'responses:', responses.length);
    
    return container;
}

/**
 * Create text input for roster cell with tick marks per MFC logic
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLDivElement} Cell container with input and tick marks
 */
function createRosterTextInput(field, rowIdx, roster, callbacks = {}) {
    const occurrence = rowIdx + 1;
    
    // Determine field properties
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    
    // Determine if this field should show tick marks per MFC rules
    // User requirement: Numeric must ALWAYS show tick marks
    const showTicks = isNumeric || shouldShowTickMarks(field);
    
    // Debug logging for tick marks
    console.log('[RosterRenderer] createRosterTextInput:', field.name, 
        'isNumeric:', isNumeric, 
        'fieldLength:', fieldLength,
        'showTicks:', showTicks,
        'captureType:', field.captureType,
        'field:', field);
    
    // Calculate container width based on field length
    const containerWidth = calculateFieldWidth(fieldLength);
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.height = '20px';  // Standard cell height
    
    if (showTicks && fieldLength > 1) {
        // Create tick mark canvas - overlay on input with transparent background
        console.log('[RosterRenderer] Creating tick mark canvas for:', field.name, 'width:', containerWidth, 'fieldLength:', fieldLength);
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas';
        
        const canvasHeight = 20;  // Standard cell height
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        `;
        
        // Draw tick marks on transparent background (overlay style)
        drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
        
        container.appendChild(canvas);
    } else {
        console.log('[RosterRenderer] NOT creating tick marks for:', field.name, 'showTicks:', showTicks, 'fieldLength:', fieldLength);
    }
    
    // Create input element (overlays on top of tick marks)
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric' : 'roster-cell-input';
    
    if (showTicks) {
        input.classList.add('with-tick-marks');
    }
    
    input.dataset.fieldName = field.name;
    input.dataset.rosterName = roster.name;
    input.dataset.rowIndex = rowIdx;
    input.dataset.occurrence = occurrence;
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.dataset.decimalPlaces = decimalPlaces;
    input.maxLength = fieldLength + (decimalPlaces > 0 ? 1 : 0);
    
    // Style input based on whether tick marks are shown
    // MFC behavior:
    // - Fields WITH tick marks: transparent background so tick marks show through canvas
    // - Fields WITHOUT tick marks (Alpha+TextBox): white background, simple border
    // NOTE: Changed border from #000 to #808080 to avoid looking like "Box Thin"
    if (showTicks) {
        input.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            z-index: 2;
            background: transparent;
            border: 1px solid #808080;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
            color: #000000;
        `;
    } else {
        // Alpha + TextBox: no tick marks, white background, standard input appearance
        input.style.cssText = `
            position: relative;
            z-index: 1;
            background: #ffffff;
            border: 1px solid #808080;
            box-sizing: border-box;
            width: 100%;
            height: 20px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
            color: #000000;
        `;
    }
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    container.appendChild(input);
    
    // Attach event handlers
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => callbacks.onKeyDown(e, field, rowIdx, roster, input));
    }
    if (callbacks.onInput) {
        input.addEventListener('input', (e) => callbacks.onInput(e, field, rowIdx, roster, input));
    }
    if (callbacks.onClick) {
        input.addEventListener('click', (e) => callbacks.onClick(e, field, rowIdx, roster, input));
    }
    
    return container;
}

/**
 * Update roster display from engine data
 * @param {Object} rosterInfo - Roster tracking info with element and data
 * @param {Object} pageResult - Current page result from engine
 * @param {HTMLElement} formContainer - Form container element
 */
export function updateRosterFromEngine(rosterInfo, pageResult, formContainer) {
    if (!rosterInfo || !pageResult?.fields) return;
    
    const rosterName = rosterInfo.data.name;
    let needsTickmarkUpdate = false;
    let updatedFieldName = null;
    
    // Update field properties from page result (runtime evaluated)
    // This ensures roster fields have correct captureType, isNumeric, etc.
    if (pageResult.fields.length > 0) {
        const pageField = pageResult.fields[0]; // Current field
        updatedFieldName = pageField.name;
        
        // Find and update matching field in roster structure
        if (rosterInfo.data.columns) {
            rosterInfo.data.columns.forEach(col => {
                if (col.fields) {
                    col.fields.forEach(field => {
                        if (field.name === pageField.name) {
                            // Check if properties changed
                            const captureTypeChanged = field.captureType !== pageField.captureType;
                            const isNumericChanged = field.isNumeric !== pageField.isNumeric;
                            const tickmarksChanged = field.tickmarks !== pageField.tickmarks;
                            
                            if (captureTypeChanged || isNumericChanged || tickmarksChanged) {
                                needsTickmarkUpdate = true;
                            }
                            
                            // Merge runtime properties from page field
                            field.captureType = pageField.captureType;
                            field.isNumeric = pageField.isNumeric;
                            field.tickmarks = pageField.tickmarks;
                            field.useUnicodeTextBox = pageField.useUnicodeTextBox;
                            field.isArabic = pageField.isArabic;
                            field.isMultiline = pageField.isMultiline;
                            field.responses = pageField.responses;
                            field.maxCheckboxSelections = pageField.maxCheckboxSelections;
                            field.alphaLength = pageField.alphaLength;
                            field.length = pageField.alphaLength || field.length;
                            field.integerPartLength = pageField.integerPartLength;
                            field.fractionalPartLength = pageField.fractionalPartLength;
                            
                            console.log('[RosterRenderer] Updated field properties from page data:', field.name, 
                                'captureType:', field.captureType, 'isNumeric:', field.isNumeric, 
                                'tickmarks:', field.tickmarks, 'needsUpdate:', needsTickmarkUpdate);
                        }
                    });
                }
            });
        }
    }
    
    // If field properties changed, recreate tick marks for all rows of that field
    if (needsTickmarkUpdate && updatedFieldName) {
        const containers = formContainer.querySelectorAll(
            `[data-roster-name="${rosterName}"] [data-field-name="${updatedFieldName}"].roster-field-container`
        );
        
        console.log('[RosterRenderer] Recreating tick marks for', containers.length, 'cells of field:', updatedFieldName);
        
        containers.forEach(container => {
            // Remove old canvas if exists
            const oldCanvas = container.querySelector('.roster-tick-canvas');
            if (oldCanvas) {
                oldCanvas.remove();
            }
            
            // Get updated field definition
            let updatedField = null;
            if (rosterInfo.data.columns) {
                for (const col of rosterInfo.data.columns) {
                    if (col.fields) {
                        updatedField = col.fields.find(f => f.name === updatedFieldName);
                        if (updatedField) break;
                    }
                }
            }
            
            if (updatedField) {
                const isNumeric = updatedField.isNumeric;
                const showTicks = isNumeric || shouldShowTickMarks(updatedField);
                const fieldLength = updatedField.length || updatedField.alphaLength || 
                    ((updatedField.integerPartLength || 0) + (updatedField.fractionalPartLength || 0)) || 1;
                
                console.log('[RosterRenderer] Field', updatedFieldName, 'showTicks:', showTicks, 
                    'isNumeric:', isNumeric, 'fieldLength:', fieldLength);
                
                if (showTicks && fieldLength > 1) {
                    const containerWidth = calculateFieldWidth(fieldLength);
                    const canvas = document.createElement('canvas');
                    canvas.className = 'roster-tick-canvas';
                    
                    const canvasHeight = 20;
                    canvas.width = containerWidth;
                    canvas.height = canvasHeight;
                    canvas.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: 0;
                        pointer-events: none;
                        z-index: 1;
                    `;
                    
                    container.insertBefore(canvas, container.firstChild);
                    
                    const decimalPlaces = updatedField.fractionalPartLength || updatedField.decimalPlaces || 0;
                    drawTickMarksTransparent(canvas, fieldLength, { decimalPlaces });
                    console.log('[RosterRenderer] Created tick marks for:', updatedFieldName, 'at row', container.dataset.rowIndex);
                }
            }
        });
    }
    
    console.log('[RosterRenderer] updateRosterFromEngine: processing', pageResult.fields.length, 'fields for roster', rosterName);
    
    pageResult.fields.forEach(field => {
        if (field.indexes && field.indexes[0] > 0) {
            const rowIdx = field.indexes[0] - 1;
            const selector = `[data-roster-name="${rosterName}"] input[data-field-name="${field.name}"][data-row-index="${rowIdx}"]`;
            let input = formContainer.querySelector(selector);
            
            // If not found directly, try looking inside a roster-field-container
            if (!input) {
                const containerSelector = `[data-roster-name="${rosterName}"] .roster-field-container[data-field-name="${field.name}"][data-row-index="${rowIdx}"] input`;
                input = formContainer.querySelector(containerSelector);
            }
            
            console.log('[RosterRenderer] Roster field:', field.name, 'index:', field.indexes[0], 'alphaValue:', field.alphaValue, 'numericValue:', field.numericValue, 'input found:', !!input);
            
            if (input) {
                const value = field.alphaValue || (field.numericValue !== undefined ? field.numericValue.toString() : '');
                
                console.log('[RosterRenderer] Setting', field.name, '[' + rowIdx + '] to:', value);
                
                if (input.value !== value) {
                    input.value = value;
                }
            }
        }
    });
}

/**
 * Move to a specific roster cell
 * @param {Object} rosters - Map of roster info objects
 * @param {HTMLElement} formContainer - Form container element
 * @param {string} rosterName - Roster name
 * @param {string} fieldName - Field name
 * @param {number} rowIdx - Target row index
 */
export function moveToRosterCell(rosters, formContainer, rosterName, fieldName, rowIdx) {
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
 * @param {Object} rosters - Map of roster info objects
 * @param {HTMLElement} formContainer - Form container element
 * @param {string} rosterName - Roster name
 * @param {string} currentFieldName - Current field name
 * @param {number} rowIdx - Current row index
 * @param {number} direction - -1 for previous, +1 for next column
 */
export function moveToRosterColumn(rosters, formContainer, rosterName, currentFieldName, rowIdx, direction) {
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

/**
 * Update a field's display value in roster
 * @param {HTMLElement} formContainer - Form container element
 * @param {Object} field - Field object with name and indexes
 * @param {string} value - Value to display
 */
export function updateFieldDisplayValue(formContainer, field, value) {
    let input = null;
    const isRosterField = field.indexes && field.indexes.length > 0 && field.indexes[0] > 0;
    
    if (isRosterField) {
        const rowIndex = field.indexes[0] - 1;
        input = formContainer.querySelector(
            `input[data-field-name="${field.name}"][data-row-index="${rowIndex}"]`
        );
        if (!input) {
            const container = formContainer.querySelector(
                `.roster-field-container[data-field-name="${field.name}"][data-row-index="${rowIndex}"]`
            );
            if (container) {
                input = container.querySelector('input');
            }
        }
    } else {
        input = formContainer.querySelector(`input[data-field-name="${field.name}"]`);
    }
    
    if (input) {
        input.value = value;
    }
}

/**
 * Highlight current row in roster
 * @param {HTMLElement} formContainer - Form container element
 * @param {HTMLElement} input - Current input element
 */
export function highlightCurrentRow(formContainer, input) {
    formContainer.querySelectorAll('.roster-body tr').forEach(tr => {
        tr.classList.remove('current-row');
    });
    input?.closest('tr')?.classList.add('current-row');
}

/**
 * Legacy function - Update tick mark display (no-op, tick marks are always visible per MFC)
 * Kept for backward compatibility with existing code
 */
export function updateTickmarkDisplay(input, tickmarks, fieldLength, decimalPlaces, isNumeric) {
    // No-op - tick marks are always visible in MFC GridWnd::OnPaint()
    // This function is kept for backward compatibility
}

/**
 * Legacy function - Draw tick marks (no-op)
 * Kept for backward compatibility
 */
export function drawTickMarks() {
    // No-op - handled by drawTickMarksOnCanvas internally
}

/**
 * Legacy function - Update tick mark canvas (no-op)
 * Kept for backward compatibility
 */
export function updateTickMarkCanvas() {
    // No-op - handled internally
}

// Export for tick-mark-manager compatibility
export { shouldShowTickMarks as checkTickMarks };
