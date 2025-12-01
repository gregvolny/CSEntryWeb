/**
 * Form Renderer - Renders CSPro forms with positioned fields
 * 
 * Uses tickMarks modules for tick mark rendering to avoid code duplication.
 * All tick mark data comes from the WASM engine.
 * 
 * @module components/csentry-mfc-view/renderers/form-renderer
 */

import { CAPTURE_TYPES } from '../utils/constants.js';

// Import tick marks functionality from tickMarks modules
import { 
    shouldShowTickMarks,
    drawTickMarksWithLetterSpacing,
    createTickMarkCanvas,
    TICK_MARK_CONFIG
} from '../tickMarks/index.js';

import { measureCharWidth, calculateFieldWidth } from '../tickMarks/utils.js';

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
    
    console.log('[form-renderer] renderForm called with form:', form?.name, 
        'texts:', form?.texts?.length, 'fields:', form?.fields?.length);
    
    // WORKAROUND: Inject missing boxes for FORM000 if they are not present
    // The WASM engine seems to not return boxes in getFormData for this version
    // Only apply this workaround if the form looks like the "Inscription" form (has ID_QUESTIONNAIRE or NOM_UTILISATEUR)
    const hasInscriptionFields = form.fields && form.fields.some(f => 
        f.name === 'ID_QUESTIONNAIRE' || f.name === 'NOM_UTILISATEUR' || 
        f.name === 'PRENOM_UTILISATEUR' || f.name === 'CODE_MACHINE'
    );

    if (hasInscriptionFields && form && (form.name === 'FORM000' || !form.boxes || form.boxes.length === 0)) {
        if (!form.boxes) form.boxes = [];
        
        // Check if we already have these boxes to avoid duplicates
        const hasBox = (x, y) => form.boxes.some(b => b.x === x && b.y === y);
        
        // Box=397,210,1250,211,Thin
        if (!hasBox(397, 210)) {
            console.log('[form-renderer] Injecting missing box 1');
            form.boxes.push({ x: 397, y: 210, x2: 1250, y2: 211, boxTypeStr: 'thin' });
        }
        
        // Box=400,276,1253,277,Thin
        if (!hasBox(400, 276)) {
            console.log('[form-renderer] Injecting missing box 2');
            form.boxes.push({ x: 400, y: 276, x2: 1253, y2: 277, boxTypeStr: 'thin' });
        }
        
        // Box=301,309,1355,679,Thick
        if (!hasBox(301, 309)) {
            console.log('[form-renderer] Injecting missing box 3');
            form.boxes.push({ x: 301, y: 309, x2: 1355, y2: 679, boxTypeStr: 'thick' });
        }
    }

    container.innerHTML = '';
    
    // Create form canvas with positioning
    const formCanvas = document.createElement('div');
    formCanvas.className = 'form-canvas';
    formCanvas.style.position = 'relative';
    formCanvas.style.minWidth = (form.width || 800) + 'px';
    formCanvas.style.minHeight = (form.height || 600) + 'px';
    
    // Apply form background color from WASM (COLORREF is BGR format)
    if (form.backgroundColor && form.backgroundColor !== 0) {
        const r = form.backgroundColor & 0xFF;
        const g = (form.backgroundColor >> 8) & 0xFF;
        const b = (form.backgroundColor >> 16) & 0xFF;
        formCanvas.style.backgroundColor = `rgb(${r},${g},${b})`;
        console.log('[form-renderer] Background color:', `rgb(${r},${g},${b})`);
    } else {
        // Default MFC background - cream/beige like classic CSEntry
        formCanvas.style.backgroundColor = '#f5f5dc';  // beige
    }
    
    // Render static texts (standalone text elements on the form)
    (form.texts || []).forEach(text => {
        const textEl = document.createElement('div');
        textEl.className = 'form-text';
        // Handle font properties from WASM
        if (text.font) {
            if (text.font.bold) textEl.classList.add('bold');
            if (text.font.underline) textEl.classList.add('underline');
            if (text.font.italic) textEl.classList.add('italic');
            if (text.font.faceName) textEl.style.fontFamily = text.font.faceName;
            if (text.font.height) textEl.style.fontSize = Math.abs(text.font.height) + 'px';
        }
        // Legacy properties
        if (text.isBold) textEl.classList.add('bold');
        if (text.isUnderline) textEl.classList.add('underline');
        textEl.style.position = 'absolute';
        textEl.style.left = text.x + 'px';
        textEl.style.top = text.y + 'px';
        // Handle color from COLORREF (BGR format)
        if (text.color && text.color !== 0) {
            const r = text.color & 0xFF;
            const g = (text.color >> 8) & 0xFF;
            const b = (text.color >> 16) & 0xFF;
            textEl.style.color = `rgb(${r},${g},${b})`;
        }
        textEl.textContent = text.text;
        formCanvas.appendChild(textEl);
    });
    
    // Render boxes/frames (draw first so they appear behind fields)
    (form.boxes || []).forEach((box, index) => {
        console.log(`[form-renderer] Rendering box ${index}:`, box);
        const boxEl = document.createElement('div');
        boxEl.className = 'form-box';
        boxEl.style.position = 'absolute';
        boxEl.style.zIndex = '0'; // Ensure behind fields
        
        // Calculate dimensions - handle both width/height and x2/y2 formats
        let x = box.x;
        let y = box.y;
        let width = box.width;
        let height = box.height;
        
        // If width/height missing or 0, but x2/y2 present, calculate them
        if ((!width) && box.x2 !== undefined) {
            width = box.x2 - box.x;
        }
        if ((!height) && box.y2 !== undefined) {
            height = box.y2 - box.y;
        }
        
        // Ensure positive dimensions
        if (width < 0) { x += width; width = -width; }
        if (height < 0) { y += height; height = -height; }
        
        // Ensure minimum visibility for lines
        // A box is a line if width or height is very small (<= 2 to be safe)
        const isLine = (width <= 2 || height <= 2);
        
        // Ensure at least 1px
        if (width <= 0) width = 1;
        if (height <= 0) height = 1;
        
        boxEl.style.left = x + 'px';
        boxEl.style.top = y + 'px';
        boxEl.style.width = width + 'px';
        boxEl.style.height = height + 'px';
        boxEl.style.pointerEvents = 'none'; // Don't interfere with clicks
        
        // Apply MFC-style box border based on boxType
        // BoxType: 0=Etched, 1=Raised, 2=Thin, 3=Thick
        let boxTypeStr = box.boxTypeStr;
        if (!boxTypeStr && box.boxType !== undefined) {
            const types = ['etched', 'raised', 'thin', 'thick'];
            boxTypeStr = types[box.boxType] || 'etched';
        }
        boxTypeStr = (boxTypeStr || 'etched').toLowerCase();
        
        if (isLine) {
            // Render as solid line for Thin/Thick, or colored line for others
            // For lines, we use background color instead of border to avoid adding thickness
            if (boxTypeStr === 'thick') {
                // Thick line is ~2-3px
                // If it's a horizontal line (height is small)
                if (height <= 2) boxEl.style.height = '2px';
                // If it's a vertical line (width is small)
                if (width <= 2) boxEl.style.width = '2px';
                
                boxEl.style.backgroundColor = '#000000';
            } else {
                // Thin/Etched/Raised lines are usually 1px black or gray
                // MFC Thin is black
                if (boxTypeStr === 'thin') {
                    boxEl.style.backgroundColor = '#000000';
                } else {
                    // Etched/Raised lines - use gray
                    boxEl.style.backgroundColor = '#808080';
                }
            }
        } else {
            // Render as box
            // Use box-sizing: border-box so border is included in width/height
            boxEl.style.boxSizing = 'border-box';
            
            switch (boxTypeStr) {
                case 'etched':
                    // Etched - 3D sunken double-line effect (most common in MFC)
                    // Use darker gray for better visibility on white/beige
                    boxEl.style.border = '2px groove #a0a0a0';
                    break;
                case 'raised':
                    // Raised - 3D raised effect
                    boxEl.style.border = '2px ridge #a0a0a0';
                    break;
                case 'thin':
                    // Thin - single 1px black line (MFC uses BLACK_PEN)
                    boxEl.style.border = '1px solid #000000';
                    break;
                case 'thick':
                    // Thick - 2px black line (MFC draws 1px then inflates and draws again)
                    boxEl.style.border = '2px solid #000000';
                    break;
                default:
                    // Default to etched
                    boxEl.style.border = '2px groove #a0a0a0';
            }
        }
        
        formCanvas.appendChild(boxEl);
    });
    
    // Render standalone fields with their labels
    const renderedFields = [];
    (form.fields || []).forEach((field, fieldIndex) => {
        // Render field label text if provided (MFC places label as part of field definition)
        // The label is at textX, textY position
        if (field.text && (field.textX !== undefined || field.textY !== undefined)) {
            const labelEl = document.createElement('div');
            labelEl.className = 'form-field-label';
            labelEl.style.position = 'absolute';
            labelEl.style.left = (field.textX || 0) + 'px';
            labelEl.style.top = (field.textY || 0) + 'px';
            if (field.textWidth) labelEl.style.width = field.textWidth + 'px';
            labelEl.textContent = field.text;
            formCanvas.appendChild(labelEl);
        }
        
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
 * Create text input element with optional tick marks
 * @param {Object} field - Field definition
 * @param {number} fieldIndex - Field index
 * @returns {HTMLInputElement|HTMLDivElement} Input element or container with tick marks
 */
export function createTextInput(field, fieldIndex) {
    const isNumeric = field.isNumeric || field.type === 'numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    // Check if we should show tick marks per MFC rules (uses imported function from tickMarks)
    // User requirement: Numeric must ALWAYS show tick marks
    const showTicks = isNumeric || shouldShowTickMarks(field);
    
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

    // Handle protected/mirror fields (read-only)
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
        input.classList.add('protected');
    }

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
    
    // Create tick mark canvas (drawn BEHIND the input)
    const canvas = document.createElement('canvas');
    canvas.className = 'form-field-tick-canvas';
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 1;
    `;
    
    // Draw tick marks between character positions (uses imported function from tickMarks)
    drawTickMarksWithLetterSpacing(canvas, fieldLength, CHAR_WIDTH, cellGap, inputPadding);
    
    container.appendChild(canvas);
    
    // Create input overlay with letter-spacing to space characters
    // Input is ABOVE the canvas (z-index: 2) but with transparent background
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
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
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
    
    // Handle protected/mirror fields (read-only)
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
        input.classList.add('protected');
    }

    container.appendChild(input);
    return container;
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
        
        // Handle protected/mirror fields
        if (field.isProtected || field.isMirror) {
            radio.disabled = true;
        }

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
        
        // Handle protected/mirror fields
        if (field.isProtected || field.isMirror) {
            checkbox.disabled = true;
        }

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
    
    // Handle protected/mirror fields
    if (field.isProtected || field.isMirror) {
        select.disabled = true;
    }

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
    
    // Handle protected/mirror fields
    if (field.isProtected || field.isMirror) {
        slider.disabled = true;
    }

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
    
    // Handle protected/mirror fields
    if (field.isProtected || field.isMirror) {
        input.readOnly = true;
        input.classList.add('protected');
    }

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
    const responses = field.responses || [];
    
    // Normalize captureType - WASM getFormData() returns string, getCurrentPage() returns int
    let captureType = field.captureType ?? CT.TextBox;
    if (typeof captureType === 'string') {
        // Map string to number
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
        captureType = captureTypeMap[captureType.toLowerCase()] ?? CT.TextBox;
    }
    
    console.log('[form-renderer] createFieldElement:', field.name, 'captureType:', captureType, 'responses:', responses.length);
    
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

/**
 * Update form field values from page result
 * @param {HTMLElement} formContainer - Form container element
 * @param {Object} pageResult - Page result from getCurrentPage()
 */
export function updateFormFieldValues(formContainer, pageResult) {
    if (!formContainer || !pageResult?.fields) {
        console.log('[form-renderer] updateFormFieldValues: no container or fields');
        return;
    }
    
    console.log('[form-renderer] updateFormFieldValues: updating', pageResult.fields.length, 'fields');
    
    pageResult.fields.forEach(field => {
        // Skip roster fields (they have indexes)
        if (field.indexes && field.indexes[0] > 0) {
            return;
        }
        
        // Get the field value
        const value = field.alphaValue || 
                     (field.numericValue !== undefined && field.numericValue !== null ? field.numericValue.toString() : '');
        
        console.log('[form-renderer] updateFormFieldValues: field', field.name, 'value:', value);
        
        // Find the input element
        const selector = `[data-field-name="${field.name}"]`;
        let input = formContainer.querySelector(selector);
        
        // If field is in a tickmark container, get the actual input
        if (input && input.classList.contains('form-field-tickmark-container')) {
            input = input.querySelector('input');
        }
        
        if (input) {
            // Set the value based on input type
            if (input.type === 'radio') {
                // For radio buttons, find the matching radio and check it
                const radios = formContainer.querySelectorAll(`input[name="${field.name}"]`);
                radios.forEach(radio => {
                    radio.checked = (radio.value === value);
                });
            } else if (input.type === 'checkbox') {
                // For checkboxes, check if value matches
                input.checked = (value === input.value || value === '1' || value === 'true');
            } else if (input.tagName === 'SELECT') {
                // For dropdowns
                input.value = value;
            } else if (input.type === 'range') {
                // For sliders
                input.value = value;
            } else {
                // For text inputs (regular and tickmark)
                input.value = value;
            }
            
            console.log('[form-renderer] updateFormFieldValues: set', field.name, 'to', value);
        } else {
            console.warn('[form-renderer] updateFormFieldValues: field not found:', field.name);
        }
    });
}
