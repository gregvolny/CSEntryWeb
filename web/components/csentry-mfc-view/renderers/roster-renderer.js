/**
 * Roster Renderer - Renders CSPro rosters (data grids)
 * Strictly based on MFC implementation (GridWnd.cpp, DEEdit.cpp, Field.cpp)
 * 
 * MFC Tick Mark Rules (from GridWnd.cpp lines 266-268 and Field.cpp lines 396-397):
 * 
 * NO tick marks when:
 *   - UseUnicodeTextBox() == true, OR
 *   - (ContentType::Alpha AND GetFont().IsArabic())
 * 
 * UseUnicodeTextBox = true when:
 *   - ContentType::Alpha AND CaptureType::TextBox
 * 
 * Therefore:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha + TextBox: NO tick marks (UseUnicodeTextBox = true)
 *   - Alpha + other capture types: Show tick marks
 *   - Alpha + Arabic font: NO tick marks
 * 
 * Tick mark formula (GridWnd.cpp lines 299-310):
 *   x = iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE
 *   Draws from iBottom to iBottom - iHeight/4 (1/4 of cell height)
 *   Number of tick marks = fieldLength - 1 (between characters)
 * 
 * @module components/csentry-mfc-view/renderers/roster-renderer
 */

import { CAPTURE_TYPES, ROSTER_ORIENTATION, FREE_MOVEMENT, TICK_MARK_CONFIG, measureCharWidth } from '../utils/constants.js';

// Use constants from shared config
const GRIDSEP_SIZE = TICK_MARK_CONFIG.GRIDSEP_SIZE;  // Grid separator size between tick marks
const DEFAULT_CHAR_WIDTH = TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH;  // szChar.cx - character width
const DEFAULT_CHAR_HEIGHT = TICK_MARK_CONFIG.DEFAULT_CHAR_HEIGHT;  // szChar.cy - character height

/**
 * Determine if a field should show tick marks based on MFC logic
 * 
 * From GridWnd.cpp lines 266-268:
 *   if( fld.GetDEField()->UseUnicodeTextBox() ||
 *       ( pDictItem->GetContentType() == ContentType::Alpha && fld.GetDEField()->GetFont().IsArabic() ) ) {
 *       // NO tick marks - use DrawText instead
 *   } else {
 *       // Draw tick marks
 *   }
 * 
 * From Field.cpp lines 396-397:
 *   m_bUseUnicodeTextBox = ( dictionary_item.GetContentType() == ContentType::Alpha &&
 *                            m_captureInfo.GetCaptureType() == CaptureType::TextBox );
 * 
 * The server provides a "tickmarks" property for alpha fields:
 *   tickmarks = !UseUnicodeTextBox()
 * 
 * @param {Object} field - Field definition
 * @returns {boolean} True if tick marks should be shown
 */
export function shouldShowTickMarks(field) {
    // Determine if field is numeric
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    // NUMERIC FIELDS: Always show tick marks (UseUnicodeTextBox is always false for numeric)
    if (isNumeric) {
        console.log('[shouldShowTickMarks]', field.name, '-> true (numeric field)');
        return true;
    }
    
    // ALPHA FIELDS: Check server-provided tickmarks property first
    // The server serializes tickmarks = !UseUnicodeTextBox() for alpha fields
    if (field.tickmarks === false) {
        console.log('[shouldShowTickMarks]', field.name, '-> false (field.tickmarks === false)');
        return false;
    }
    
    // Check for Arabic fonts (GetFont().IsArabic() in MFC)
    if (field.isArabic || field.rtl) {
        console.log('[shouldShowTickMarks]', field.name, '-> false (Arabic/RTL)');
        return false;
    }
    
    // Check capture type
    // UseUnicodeTextBox = Alpha + TextBox capture type
    // TextBox is the default capture type for alpha fields
    const captureType = field.captureType || field.capture?.type || 0;
    
    // Alpha + TextBox (capture type 0) = UseUnicodeTextBox = true => NO tick marks
    if (captureType === 0 || captureType === 'TextBox') {
        console.log('[shouldShowTickMarks]', field.name, '-> false (Alpha + TextBox, UseUnicodeTextBox=true)');
        return false;
    }
    
    // Alpha field with non-TextBox capture type (ComboBox, DropDown, etc.) => Show tick marks
    console.log('[shouldShowTickMarks]', field.name, '-> true (Alpha with non-TextBox capture type:', captureType, ')');
    return true;
}

/**
 * Draw tick marks on a canvas - exact port of MFC GridWnd::OnPaint()
 * 
 * From GridWnd.cpp lines 299-310:
 *   for (int iIndex=0; iIndex < iLength-1; iIndex++) {
 *       dc.MoveTo(iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE, iBottom);
 *       dc.LineTo(iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE, iBottom-iHeight/4);
 *   }
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {number} fieldLength - Number of characters in field (iLength)
 * @param {number} decimalPlaces - Number of decimal places (0 if none)
 */
function drawTickMarksOnCanvas(canvas, fieldLength, decimalPlaces = 0) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear and fill background (white like MFC)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // MFC variables
    const szCharCx = DEFAULT_CHAR_WIDTH;  // szChar.cx
    const iLeft = 1;  // rcFld.left + 1 (account for left border)
    const iBottom = height - 1;  // rcFld.bottom - 1 (account for bottom border)
    const iHeight = height - 2;  // rcFld.Height() - 2 (account for border)
    
    // Tick marks are drawn from iBottom to iBottom - iHeight/4
    const tickTop = iBottom - Math.floor(iHeight / 4);
    
    // Draw tick marks BETWEEN characters (iLength-1 tick marks)
    ctx.strokeStyle = '#000000';  // Black tick marks (default pen)
    ctx.lineWidth = 1;
    
    for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
        // MFC formula: x = iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE
        const x = iLeft + szCharCx * (iIndex + 1) + (iIndex + 1) * 2 + iIndex * GRIDSEP_SIZE;
        
        // Draw vertical tick mark line from bottom to tickTop
        ctx.beginPath();
        ctx.moveTo(x + 0.5, iBottom);  // +0.5 for crisp 1px line
        ctx.lineTo(x + 0.5, tickTop);
        ctx.stroke();
    }
}

/**
 * Draw tick marks on canvas with TRANSPARENT background
 * Used when canvas is overlaid on input element
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {number} fieldLength - Number of characters in field (iLength)
 * @param {number} decimalPlaces - Number of decimal places (0 if none)
 */
function drawTickMarksOnCanvasTransparent(canvas, fieldLength, decimalPlaces = 0) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, width, height);
    
    // MFC variables
    const szCharCx = DEFAULT_CHAR_WIDTH;  // szChar.cx
    const iLeft = 1;  // rcFld.left + 1 (account for left border)
    const iBottom = height - 1;  // rcFld.bottom - 1 (account for bottom border)
    const iHeight = height - 2;  // rcFld.Height() - 2 (account for border)
    
    // Tick marks are drawn from iBottom to iBottom - iHeight/4 (short lines at bottom)
    const tickTop = iBottom - Math.floor(iHeight / 4);
    
    // Draw tick marks BETWEEN characters (iLength-1 tick marks)
    ctx.strokeStyle = '#000000';  // Black tick marks
    ctx.lineWidth = 1;
    
    for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
        // MFC formula: x = iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE
        const x = iLeft + szCharCx * (iIndex + 1) + (iIndex + 1) * 2 + iIndex * GRIDSEP_SIZE;
        
        // Draw vertical tick mark line from bottom to tickTop
        ctx.beginPath();
        ctx.moveTo(x + 0.5, iBottom);  // +0.5 for crisp 1px line
        ctx.lineTo(x + 0.5, tickTop);
        ctx.stroke();
    }
}

/**
 * Calculate field width based on MFC formula
 * Width needs to accommodate: characters + spacing + tick marks
 * 
 * @param {number} fieldLength - Field length in characters
 * @returns {number} Width in pixels
 */
function calculateFieldWidth(fieldLength) {
    // Based on MFC tick mark x position formula for last character
    // x = iLeft + szChar.cx * fieldLength + fieldLength*2 + (fieldLength-1)*GRIDSEP_SIZE
    const szCharCx = DEFAULT_CHAR_WIDTH;
    const iLeft = 1;
    return iLeft + szCharCx * fieldLength + fieldLength * 2 + (fieldLength - 1) * GRIDSEP_SIZE + 4;
}

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
    const captureType = field.captureType ?? CT.TextBox;
    const responses = field.responses || [];
    
    // Handle Checkbox capture type - use dialog-based approach
    // Checkbox fields are clickable cells that open a native dialog
    if (captureType === CT.CheckBox) {
        return createRosterCheckboxDialogCell(field, rowIdx, roster, callbacks);
    }
    
    // Handle RadioButton capture type (rendered as clickable for value selection)
    if (captureType === CT.RadioButton && responses.length > 0) {
        return createRosterValueSetCell(field, rowIdx, roster, responses, callbacks);
    }
    
    // Handle DropDown/ComboBox capture type
    if ((captureType === CT.DropDown || captureType === CT.ComboBox) && responses.length > 0) {
        return createRosterValueSetCell(field, rowIdx, roster, responses, callbacks);
    }
    
    // Default: text input with tick marks per MFC rules
    return createRosterTextInput(field, rowIdx, roster, callbacks);
}

/**
 * Create checkbox dialog cell for roster - clickable cell that opens native HTML dialog
 * This is used for checkbox capture type fields where responses are fetched dynamically
 * 
 * According to MFC Field.cpp lines 396-397:
 *   UseUnicodeTextBox = (ContentType::Alpha && CaptureType::TextBox)
 * 
 * Checkbox capture type is NOT TextBox, so UseUnicodeTextBox is FALSE for checkbox fields
 * Therefore, checkbox fields SHOULD show tick marks per MFC logic.
 * 
 * @param {Object} field - Field definition
 * @param {number} rowIdx - Row index (0-based)
 * @param {Object} roster - Parent roster definition
 * @param {Object} callbacks - Event callbacks including onCheckboxDialogRequest
 * @returns {HTMLDivElement} Clickable cell container
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
    
    // Checkbox capture type is NOT TextBox, so UseUnicodeTextBox is FALSE
    // Therefore checkbox fields SHOULD show tick marks per MFC Field.cpp logic
    const showTicks = true;  // Checkbox fields always show tick marks (NOT TextBox capture type)
    console.log('[RosterRenderer] createRosterCheckboxDialogCell:', field.name, 'showTicks:', showTicks, 'fieldLength:', fieldLength);
    
    // Calculate container width based on field length (same as createRosterTextInput)
    const containerWidth = calculateFieldWidth(fieldLength);
    console.log('[RosterRenderer] Checkbox cell containerWidth:', containerWidth);
    container.style.width = (containerWidth + 20) + 'px';  // Extra space for dialog button
    container.style.position = 'relative';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    
    // Create inner container for input with tick marks (same width as regular text inputs)
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'checkbox-input-wrapper';
    inputWrapper.style.width = containerWidth + 'px';
    inputWrapper.style.position = 'relative';
    inputWrapper.style.display = 'inline-block';
    
    // Draw tick marks canvas for checkbox fields (per MFC logic)
    // Tick marks are drawn at the BOTTOM of the cell (MFC GridWnd.cpp: iBottom to iBottom - iHeight/4)
    if (showTicks && fieldLength > 1) {
        console.log('[RosterRenderer] Creating tick marks canvas for checkbox field:', field.name, 'fieldLength:', fieldLength);
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas checkbox-tick-canvas';
        
        const canvasHeight = 20;  // Standard cell height
        canvas.width = containerWidth;
        canvas.height = canvasHeight;
        // Position canvas OVER the input with higher z-index so tick marks are visible
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        `;
        
        // Draw tick marks (transparent background so input text shows through)
        drawTickMarksOnCanvasTransparent(canvas, fieldLength, decimalPlaces);
        console.log('[RosterRenderer] Tick marks drawn on canvas for checkbox field:', field.name);
        
        inputWrapper.appendChild(canvas);
    } else {
        console.log('[RosterRenderer] NOT creating tick marks canvas - showTicks:', showTicks, 'fieldLength:', fieldLength);
    }
    
    // Create text input that displays checkbox value and supports tick mark spacing
    const input = document.createElement('input');
    input.type = 'text';
    input.className = isNumeric ? 'roster-cell-input numeric checkbox-dialog-input' : 'roster-cell-input checkbox-dialog-input';
    
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
    input.dataset.captureType = 'checkbox';
    input.maxLength = fieldLength;
    
    // Style input to match text inputs with tick marks
    input.style.cssText = `
        position: relative;
        z-index: 1;
        background: transparent;
        border: 1px solid #000;
        box-sizing: border-box;
        width: 100%;
        height: 20px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
        cursor: pointer;
    `;
    
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
    }
    
    inputWrapper.appendChild(input);
    container.appendChild(inputWrapper);
    
    // Create button to open checkbox dialog
    const dialogButton = document.createElement('button');
    dialogButton.type = 'button';
    dialogButton.className = 'checkbox-dialog-button';
    dialogButton.innerHTML = '&#9660;'; // Down arrow
    dialogButton.title = 'Open checkbox selection';
    dialogButton.tabIndex = -1; // Don't include in tab order
    dialogButton.style.cssText = `
        margin-left: 2px;
        padding: 2px 4px;
        font-size: 10px;
        cursor: pointer;
        border: 1px solid #ccc;
        background: #f0f0f0;
    `;
    
    // Handle dialog button click
    dialogButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (callbacks.onCheckboxDialogRequest) {
            callbacks.onCheckboxDialogRequest(field, container, rowIdx, roster, input);
        }
    });
    
    // Handle input double-click to open dialog
    input.addEventListener('dblclick', (e) => {
        if (callbacks.onCheckboxDialogRequest) {
            callbacks.onCheckboxDialogRequest(field, container, rowIdx, roster, input);
        }
    });
    
    // Standard event handlers
    if (callbacks.onFocus) {
        input.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, input));
    }
    if (callbacks.onBlur) {
        input.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, input));
    }
    if (callbacks.onKeyDown) {
        input.addEventListener('keydown', (e) => {
            // Open dialog on Enter or Space or F4
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4') {
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
    
    container.appendChild(dialogButton);
    
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
    
    const container = document.createElement('div');
    container.className = 'roster-field-container roster-checkbox-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    container.dataset.captureType = 'checkbox';
    container.dataset.maxSelections = maxSelections;
    
    // Create checkboxes for each response
    responses.forEach((resp, idx) => {
        const label = document.createElement('label');
        label.className = 'roster-checkbox-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = resp.code;
        checkbox.dataset.responseIndex = idx;
        checkbox.dataset.fieldName = field.name;
        checkbox.dataset.rosterName = roster.name;
        checkbox.dataset.rowIndex = rowIdx;
        
        const codeSpan = document.createElement('span');
        codeSpan.className = 'checkbox-code';
        codeSpan.textContent = resp.code;
        
        label.appendChild(checkbox);
        label.appendChild(codeSpan);
        
        // Add text color if specified
        if (resp.textColor && resp.textColor !== 0) {
            const r = (resp.textColor >> 16) & 0xFF;
            const g = (resp.textColor >> 8) & 0xFF;
            const b = resp.textColor & 0xFF;
            codeSpan.style.color = `rgb(${r},${g},${b})`;
        }
        
        // Handle checkbox change with max selections logic
        checkbox.addEventListener('change', () => {
            const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
            if (checkedBoxes.length > maxSelections) {
                checkbox.checked = false;
                return;
            }
            
            if (callbacks.onCheckboxChange) {
                callbacks.onCheckboxChange(field, container, rowIdx, roster);
            }
        });
        
        // Other event handlers
        if (callbacks.onFocus) {
            checkbox.addEventListener('focus', (e) => callbacks.onFocus(e, field, rowIdx, roster, checkbox));
        }
        if (callbacks.onBlur) {
            checkbox.addEventListener('blur', (e) => callbacks.onBlur(e, field, rowIdx, roster, checkbox));
        }
        if (callbacks.onKeyDown) {
            checkbox.addEventListener('keydown', (e) => callbacks.onKeyDown(e, field, rowIdx, roster, checkbox));
        }
        
        container.appendChild(label);
    });
    
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
    const showTicks = shouldShowTickMarks(field);
    
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
            z-index: 2;
        `;
        
        drawTickMarksOnCanvasTransparent(canvas, fieldLength, decimalPlaces);
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
    
    input.style.cssText = `
        position: relative;
        z-index: 1;
        background: transparent;
        border: 1px solid #000;
        box-sizing: border-box;
        width: 100%;
        height: 20px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
    `;
    
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
    const showTicks = shouldShowTickMarks(field);
    
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
            z-index: 2;
        `;
        
        // Draw tick marks on transparent background (overlay style)
        drawTickMarksOnCanvasTransparent(canvas, fieldLength, decimalPlaces);
        
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
    
    // Style input to match MFC appearance
    input.style.cssText = `
        position: relative;
        z-index: 1;
        background: transparent;
        border: 1px solid #000;
        box-sizing: border-box;
        width: 100%;
        height: 20px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        padding: 0 2px;
    `;
    
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
    
    pageResult.fields.forEach(field => {
        if (field.indexes && field.indexes[0] > 0) {
            const rowIdx = field.indexes[0] - 1;
            const selector = `[data-roster-name="${rosterName}"] input[data-field-name="${field.name}"][data-row-index="${rowIdx}"]`;
            const input = formContainer.querySelector(selector);
            
            if (input) {
                const value = field.alphaValue || (field.numericValue !== undefined ? field.numericValue.toString() : '');
                
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
