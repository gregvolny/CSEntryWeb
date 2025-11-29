/**
 * Form Renderer - Renders CSPro forms with positioned fields
 * 
 * MFC Tick Mark Rules (from DEEdit.cpp, GridWnd.cpp, Field.cpp):
 * 
 * Tick marks are shown when:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha fields: Show tick marks UNLESS:
 *     - UseUnicodeTextBox() is true (Alpha + TextBox capture type)
 *     - OR Font is Arabic (GetFont().IsArabic())
 * 
 * The server serializes this as the "tickmarks" property:
 *   tickmarks = !UseUnicodeTextBox() for alpha fields
 * 
 * @module components/csentry-mfc-view/renderers/form-renderer
 */

import { CAPTURE_TYPES, TICK_MARK_CONFIG, measureCharWidth, calculateFieldWidth } from '../utils/constants.js';

/**
 * Render form with all elements (texts, fields, boxes, rosters)
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} form - Form definition object
 * @param {Function} createFieldElement - Function to create field input elements
 * @param {Function} createRosterTable - Function to create roster tables
 * @param {Function} setupFieldEvents - Function to set up field event handlers
 * @returns {Object} Rendered form metadata
 */
export function renderForm(container, form, { createFieldElement, createRosterTable, setupFieldEvents }) {
    if (!container) {
        console.error('[form-renderer] renderForm called with null container');
        return { canvas: null, fields: [], rosters: {} };
    }
    
    container.innerHTML = '';
    
    // Create form canvas with positioning
    const formCanvas = document.createElement('div');
    formCanvas.className = 'form-canvas';
    formCanvas.style.position = 'relative';
    formCanvas.style.minWidth = (form.width || 800) + 'px';
    formCanvas.style.minHeight = (form.height || 600) + 'px';
    
    // Render static texts
    (form.texts || []).forEach(text => {
        const textEl = document.createElement('div');
        textEl.className = 'form-text';
        if (text.isBold) textEl.classList.add('bold');
        if (text.isUnderline) textEl.classList.add('underline');
        textEl.style.left = text.x + 'px';
        textEl.style.top = text.y + 'px';
        textEl.textContent = text.text;
        formCanvas.appendChild(textEl);
    });
    
    // Render boxes/frames
    (form.boxes || []).forEach(box => {
        const boxEl = document.createElement('div');
        boxEl.className = 'form-box';
        boxEl.style.left = box.x + 'px';
        boxEl.style.top = box.y + 'px';
        boxEl.style.width = box.width + 'px';
        boxEl.style.height = box.height + 'px';
        formCanvas.appendChild(boxEl);
    });
    
    // Render standalone fields
    const renderedFields = [];
    (form.fields || []).forEach((field, fieldIndex) => {
        const fieldEl = createFieldElement(field, fieldIndex);
        if (fieldEl) {
            fieldEl.style.position = 'absolute';
            fieldEl.style.left = field.x + 'px';
            fieldEl.style.top = field.y + 'px';
            
            // Set dimensions based on field type
            if (!fieldEl.classList.contains('form-field-radio-group') && 
                !fieldEl.classList.contains('form-field-checkbox-group')) {
                fieldEl.style.width = (field.width || 100) + 'px';
            }
            
            formCanvas.appendChild(fieldEl);
            setupFieldEvents(field, fieldEl);
            renderedFields.push({ field, element: fieldEl });
        }
    });
    
    // Render rosters
    const renderedRosters = {};
    (form.rosters || []).forEach(roster => {
        const rosterEl = createRosterTable(roster);
        if (rosterEl) {
            rosterEl.style.position = 'absolute';
            rosterEl.style.left = roster.x + 'px';
            rosterEl.style.top = roster.y + 'px';
            rosterEl.style.width = (roster.width || 400) + 'px';
            rosterEl.style.height = (roster.height || 200) + 'px';
            formCanvas.appendChild(rosterEl);
            renderedRosters[roster.name] = { element: rosterEl, data: roster };
        }
    });
    
    container.appendChild(formCanvas);
    
    return {
        canvas: formCanvas,
        fields: renderedFields,
        rosters: renderedRosters
    };
}

/**
 * Determine if a field should show tick marks based on MFC logic
 * 
 * From DEEdit.cpp OnPaint() and GridWnd.cpp:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha + TextBox: NO tick marks (UseUnicodeTextBox = true)
 *   - Alpha + Arabic font: NO tick marks
 *   - Alpha + other capture types: Show tick marks
 * 
 * The server provides a "tickmarks" property for alpha fields:
 *   tickmarks = !UseUnicodeTextBox()
 * 
 * @param {Object} field - Field definition
 * @returns {boolean} True if tick marks should be shown
 */
function shouldShowTickMarks(field) {
    // Numeric fields: ALWAYS show tick marks
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    if (isNumeric) {
        return true;
    }
    
    // Alpha fields: Check server-provided tickmarks property (= !UseUnicodeTextBox)
    // If tickmarks is explicitly false, don't show tick marks
    if (field.tickmarks === false) {
        return false;
    }
    
    // Check for Arabic font
    if (field.isArabic || field.rtl) {
        return false;
    }
    
    // Check capture type - TextBox capture type = UseUnicodeTextBox = no tick marks
    const CT = CAPTURE_TYPES;
    const captureType = field.captureType ?? CT.TextBox;
    
    // Alpha + TextBox = UseUnicodeTextBox = true => NO tick marks
    if (captureType === CT.TextBox || captureType === 0) {
        return false;
    }
    
    // Alpha field with non-TextBox capture type => Show tick marks
    return true;
}

/**
 * Create text input element with optional tick marks
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @returns {HTMLInputElement|HTMLDivElement} Input element or container with tick marks
 */
export function createTextInput(field, fieldIndex) {
    const isNumeric = field.isNumeric || field.type === 'numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    // Check if we should show tick marks per MFC rules
    const showTicks = shouldShowTickMarks(field);
    
    // Get field length
    let fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 20;
    
    console.log('[createTextInput]', field.name, 
        'isNumeric:', isNumeric, 
        'showTicks:', showTicks, 
        'fieldLength:', fieldLength,
        'integerPartLength:', field.integerPartLength,
        'alphaLength:', field.alphaLength);
    
    // If tick marks should be shown, create a container with canvas
    if (showTicks && fieldLength > 1) {
        return createTickmarkInput(field, fieldIndex, isNumeric, fieldLength);
    }
    
    // Simple input without tick marks
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-field-input' + 
        (isNumeric ? ' numeric' : '') +
        (field.isUpperCase ? ' uppercase' : '');
    input.dataset.fieldName = field.name;
    input.dataset.fieldIndex = fieldIndex;
    input.dataset.occurrence = '1';
    input.maxLength = fieldLength;
    return input;
}

/**
 * Create input with MFC-style tick marks (canvas-based)
 * 
 * The tick marks should appear BETWEEN character positions to match MFC's appearance.
 * We use browser text metrics with letter-spacing to position characters, then draw
 * tick marks at the boundaries.
 * 
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {boolean} isNumeric - Whether field is numeric
 * @param {number} fieldLength - Field length in characters
 * @returns {HTMLDivElement} Container with input and tick mark canvas
 */
function createTickmarkInput(field, fieldIndex, isNumeric, fieldLength) {
    // Measure actual character width to match MFC GetTextExtent("0")
    const CHAR_WIDTH = measureCharWidth();
    const { SEP_SIZE, BORDER_WIDTH, FONT_FAMILY, FONT_SIZE, GRIDSEP_SIZE } = TICK_MARK_CONFIG;
    const decimalPlaces = field.fractionalPartLength || field.decimalPlaces || 0;
    
    // In MFC:
    // - Each character cell = charWidth + gap
    // - Gap = 2 (spacing) + SEP_SIZE (tick mark width)
    // - Tick marks drawn between character cells
    const cellGap = 2 + SEP_SIZE;  // 3 pixels between characters
    const cellWidth = CHAR_WIDTH + cellGap;  // Total width per character cell
    
    // Calculate container width: border + (chars * cellWidth) + padding
    const inputPadding = 3;  // Left padding in input
    const containerWidth = Math.ceil(2 + inputPadding + fieldLength * cellWidth + inputPadding);
    const containerHeight = 20;
    
    const container = document.createElement('div');
    container.className = 'form-field-tickmark-container';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.style.position = 'relative';
    container.style.width = containerWidth + 'px';
    container.style.height = containerHeight + 'px';
    container.style.display = 'inline-block';
    
    // Create tick mark canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'form-field-tick-canvas';
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 2;
    `;
    
    // Draw tick marks between character positions
    drawTickMarksForBrowser(canvas, fieldLength, CHAR_WIDTH, cellGap, inputPadding);
    
    container.appendChild(canvas);
    
    // Create input overlay with letter-spacing to space characters
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-field-tickmark-input' + (isNumeric ? ' numeric' : '');
    input.dataset.fieldName = field.name;
    input.dataset.fieldIndex = fieldIndex;
    input.dataset.occurrence = '1';
    input.dataset.isNumeric = isNumeric ? '1' : '0';
    input.dataset.fieldLength = fieldLength;
    input.maxLength = fieldLength + (decimalPlaces > 0 ? 1 : 0);
    input.style.cssText = `
        position: relative;
        z-index: 1;
        background: transparent;
        border: 1px solid #000;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        font-family: ${FONT_FAMILY};
        font-size: ${FONT_SIZE};
        padding: 0 ${inputPadding}px;
        letter-spacing: ${cellGap}px;
    `;
    
    container.appendChild(input);
    return container;
}

/**
 * Draw tick marks for browser-rendered text
 * 
 * This draws tick marks between character positions, accounting for:
 * - Border (1px)
 * - Input padding
 * - Character width
 * - Letter spacing
 * 
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 * @param {number} fieldLength - Number of characters
 * @param {number} charWidth - Width of a single character
 * @param {number} letterSpacing - Space between characters (letter-spacing CSS)
 * @param {number} inputPadding - Left padding of input
 */
function drawTickMarksForBrowser(canvas, fieldLength, charWidth, letterSpacing, inputPadding) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear and fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    const { TICK_COLOR, TICK_HEIGHT_RATIO } = TICK_MARK_CONFIG;
    
    // Account for border (1px) + input padding
    const startX = 1 + inputPadding;
    const iBottom = height - 1;
    const tickTop = Math.floor(height * (1 - TICK_HEIGHT_RATIO));
    
    ctx.strokeStyle = TICK_COLOR;
    ctx.lineWidth = 1;
    
    // Draw tick marks BETWEEN each character
    // After char N, the tick is at: startX + (N+1)*charWidth + N*letterSpacing + letterSpacing/2
    // Simplified: tick after char N is at startX + (N+1)*(charWidth + letterSpacing) - letterSpacing/2
    for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
        // Position of tick mark: after character iIndex, before character iIndex+1
        // Character iIndex ends at: startX + (iIndex+1)*charWidth + iIndex*letterSpacing
        // Tick should be in the middle of the gap, but MFC puts it right after the character
        const x = startX + (iIndex + 1) * charWidth + (iIndex + 1) * letterSpacing - Math.floor(letterSpacing / 2);
        
        ctx.beginPath();
        ctx.moveTo(x + 0.5, iBottom);
        ctx.lineTo(x + 0.5, tickTop);
        ctx.stroke();
    }
}

/**
 * Draw tick marks on canvas - port of MFC DEEdit::OnPaint()
 * 
 * From DEEdit.cpp lines 121-136:
 *   for (int iIndex=0; iIndex < iLength-1; iIndex++) {
 *       dc.MoveTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, rect.bottom);
 *       dc.LineTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, (rect.bottom*3)/4);
 *   }
 * 
 * MFC uses GetTextExtent("0") to get character width dynamically from the font.
 * For consistent rendering, we measure the actual "0" character width.
 * 
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 * @param {number} fieldLength - Number of characters
 * @param {number} decimalPlaces - Number of decimal places
 * @param {number} charWidth - Character width in pixels (from measureCharWidth)
 */
function drawTickMarksOnCanvas(canvas, fieldLength, decimalPlaces = 0, charWidth = null) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear and fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Use measured char width from shared constants
    const { SEP_SIZE, TICK_COLOR, TICK_HEIGHT_RATIO, DEFAULT_CHAR_WIDTH } = TICK_MARK_CONFIG;
    const CHAR_WIDTH = charWidth || DEFAULT_CHAR_WIDTH;
    const iLeft = 2; // Account for border + padding
    const iBottom = height - 1;
    
    // Tick marks are drawn from bottom to 3/4 of bottom (MFC: iBottom - iHeight/4)
    // This is 1/4 of the height from the bottom
    const tickTop = Math.floor(height * (1 - TICK_HEIGHT_RATIO));
    
    ctx.strokeStyle = TICK_COLOR;
    ctx.lineWidth = 1;
    
    for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
        // MFC formula: x = rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE
        const x = iLeft + CHAR_WIDTH * (iIndex + 1) + (iIndex + 1) * 2 + iIndex * SEP_SIZE;
        
        ctx.beginPath();
        ctx.moveTo(x + 0.5, iBottom);
        ctx.lineTo(x + 0.5, tickTop);
        ctx.stroke();
    }
}

/**
 * Create numeric field with MFC-style tickmarks
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @returns {HTMLDivElement} Container with input and tickmarks
 */
export function createNumericTickmarkInput(field, fieldIndex) {
    const totalLength = (field.integerPartLength || 0) + (field.fractionalPartLength || 0);
    return createTickmarkInput(field, fieldIndex, true, totalLength);
}

/**
 * Create radio button group
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {Array} responses - Response options
 * @param {Function} onValueChange - Callback for value changes
 * @returns {HTMLDivElement} Radio group container
 */
export function createRadioButtonGroup(field, fieldIndex, responses, onValueChange) {
    const container = document.createElement('div');
    container.className = 'form-field-radio-group';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.dataset.captureType = 'radio';
    
    const groupName = `radio_${field.name}_${fieldIndex}`;
    
    responses.forEach((resp, idx) => {
        const option = document.createElement('label');
        option.className = 'form-field-radio-option';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = groupName;
        radio.value = resp.code;
        radio.dataset.responseIndex = idx;
        
        const code = document.createElement('span');
        code.className = 'option-code';
        code.textContent = resp.code;
        
        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = resp.label;
        
        if (resp.textColor && resp.textColor !== 0) {
            const r = (resp.textColor >> 16) & 0xFF;
            const g = (resp.textColor >> 8) & 0xFF;
            const b = resp.textColor & 0xFF;
            label.style.color = `rgb(${r},${g},${b})`;
        }
        
        option.appendChild(radio);
        option.appendChild(code);
        option.appendChild(label);
        container.appendChild(option);
        
        radio.addEventListener('change', () => {
            if (onValueChange) onValueChange(field, resp.code);
        });
    });
    
    return container;
}

/**
 * Create checkbox group
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {Array} responses - Response options
 * @param {Function} onCheckboxChange - Callback for checkbox changes
 * @returns {HTMLDivElement} Checkbox group container
 */
export function createCheckboxGroup(field, fieldIndex, responses, onCheckboxChange) {
    const container = document.createElement('div');
    container.className = 'form-field-checkbox-group';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.dataset.captureType = 'checkbox';
    container.dataset.maxSelections = field.maxCheckboxSelections || responses.length;
    
    responses.forEach((resp, idx) => {
        const option = document.createElement('label');
        option.className = 'form-field-checkbox-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = resp.code;
        checkbox.dataset.responseIndex = idx;
        
        const code = document.createElement('span');
        code.className = 'option-code';
        code.textContent = resp.code;
        
        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = resp.label;
        
        if (resp.textColor && resp.textColor !== 0) {
            const r = (resp.textColor >> 16) & 0xFF;
            const g = (resp.textColor >> 8) & 0xFF;
            const b = resp.textColor & 0xFF;
            label.style.color = `rgb(${r},${g},${b})`;
        }
        
        option.appendChild(checkbox);
        option.appendChild(code);
        option.appendChild(label);
        container.appendChild(option);
        
        checkbox.addEventListener('change', () => {
            if (onCheckboxChange) onCheckboxChange(field, container);
        });
    });
    
    return container;
}

/**
 * Create dropdown select
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {Array} responses - Response options
 * @param {Function} onValueChange - Callback for value changes
 * @returns {HTMLSelectElement} Select element
 */
export function createDropdown(field, fieldIndex, responses, onValueChange) {
    const select = document.createElement('select');
    select.className = 'form-field-dropdown';
    select.dataset.fieldName = field.name;
    select.dataset.fieldIndex = fieldIndex;
    select.dataset.captureType = 'dropdown';
    select.dataset.occurrence = '1';
    
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- Select --';
    select.appendChild(emptyOpt);
    
    responses.forEach((resp, idx) => {
        const opt = document.createElement('option');
        opt.value = resp.code;
        opt.textContent = `${resp.code} - ${resp.label}`;
        opt.dataset.responseIndex = idx;
        select.appendChild(opt);
    });
    
    select.addEventListener('change', () => {
        if (onValueChange) onValueChange(field, select.value);
    });
    
    return select;
}

/**
 * Create slider control
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {Function} onValueChange - Callback for value changes
 * @returns {HTMLDivElement} Slider container
 */
export function createSlider(field, fieldIndex, onValueChange) {
    const container = document.createElement('div');
    container.className = 'form-field-slider-container';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.dataset.captureType = 'slider';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'form-field-slider';
    slider.min = field.sliderMinValue || 0;
    slider.max = field.sliderMaxValue || 100;
    slider.step = field.sliderStep || 1;
    slider.value = field.sliderMinValue || 0;
    slider.dataset.fieldName = field.name;
    slider.dataset.occurrence = '1';
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'form-field-slider-value';
    valueDisplay.textContent = slider.value;
    
    slider.addEventListener('input', () => {
        valueDisplay.textContent = slider.value;
    });
    
    slider.addEventListener('change', () => {
        if (onValueChange) onValueChange(field, slider.value);
    });
    
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    return container;
}

/**
 * Create date input
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @returns {HTMLInputElement} Date input element
 */
export function createDateInput(field, fieldIndex) {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'form-field-date';
    input.dataset.fieldName = field.name;
    input.dataset.fieldIndex = fieldIndex;
    input.dataset.captureType = 'date';
    input.dataset.occurrence = '1';
    return input;
}

/**
 * Create field element based on capture type with MFC tick mark rules
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @param {Object} callbacks - Event callbacks
 * @returns {HTMLElement} Field element
 */
export function createFieldElement(field, fieldIndex, callbacks = {}) {
    const CT = CAPTURE_TYPES;
    const captureType = field.captureType ?? CT.TextBox;
    const responses = field.responses || [];
    
    // Radio button capture type
    if (captureType === CT.RadioButton && responses.length > 0) {
        return createRadioButtonGroup(field, fieldIndex, responses, callbacks.onValueChange);
    }
    
    // Checkbox capture type
    if (captureType === CT.CheckBox && responses.length > 0) {
        return createCheckboxGroup(field, fieldIndex, responses, callbacks.onCheckboxChange);
    }
    
    // Dropdown/ComboBox
    if ((captureType === CT.DropDown || captureType === CT.ComboBox) && responses.length > 0) {
        return createDropdown(field, fieldIndex, responses, callbacks.onValueChange);
    }
    
    // Slider
    if (captureType === CT.Slider) {
        return createSlider(field, fieldIndex, callbacks.onValueChange);
    }
    
    // Date picker
    if (captureType === CT.Date) {
        return createDateInput(field, fieldIndex);
    }
    
    // For all other text/numeric fields, createTextInput handles tick mark logic
    // It uses shouldShowTickMarks() which implements MFC rules:
    // - Numeric: ALWAYS show tick marks
    // - Alpha + TextBox (UseUnicodeTextBox): NO tick marks
    // - Alpha + Arabic font: NO tick marks
    // - Alpha + other capture types: Show tick marks
    return createTextInput(field, fieldIndex);
}

/**
 * Get field value from element based on capture type
 * @param {HTMLElement} element - Field element
 * @returns {string} Field value
 */
export function getFieldElementValue(element) {
    if (!element) return '';
    
    const captureType = element.dataset.captureType;
    
    if (captureType === 'radio') {
        const checked = element.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : '';
    }
    
    if (captureType === 'checkbox') {
        const checked = element.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checked).map(cb => cb.value).join(',');
    }
    
    if (captureType === 'dropdown') {
        return element.value || '';
    }
    
    if (captureType === 'slider') {
        const slider = element.querySelector('input[type="range"]');
        return slider ? slider.value : '';
    }
    
    if (captureType === 'date') {
        return element.value || '';
    }
    
    if (element.classList.contains('form-field-tickmark-container')) {
        const input = element.querySelector('input');
        return input ? input.value : '';
    }
    
    return element.value || '';
}
