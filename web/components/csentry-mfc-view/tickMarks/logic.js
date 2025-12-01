/**
 * Tick Marks Logic
 * 
 * Business logic for determining when tick marks should be displayed.
 * This module MUST get data from the WASM engine before making decisions.
 * 
 * MFC Rules (from Field.cpp and GridWnd.cpp):
 * - UseUnicodeTextBox = Alpha + TextBox capture type => NO tick marks
 * - Arabic font => NO tick marks  
 * - Numeric fields => ALWAYS show tick marks
 * - Alpha + non-TextBox capture => Show tick marks
 * 
 * @module components/csentry-mfc-view/tickMarks/logic
 */

/**
 * Capture type constants (should match CAPTURE_TYPES from constants.js)
 */
const CAPTURE_TYPES = {
    TextBox: 0,
    RadioButton: 1,
    CheckBox: 2,
    DropDown: 3,
    ComboBox: 4,
    Date: 5,
    NumberPad: 6,
    Barcode: 7,
    Slider: 8,
    ToggleButton: 9,
    Photo: 10,
    Signature: 11,
    Audio: 12
};

/**
 * Get tick mark data from the WASM engine for a field
 * This function extracts and normalizes tick mark related properties
 * from the field data provided by the engine.
 * 
 * WASM Engine Properties (from WASMBindings.cpp):
 * - field.isNumeric: boolean - Numeric fields always show tick marks
 * - field.captureType: number (0 = TextBox)
 * - field.useUnicodeTextBox: boolean - true for Alpha + TextBox = no tick marks
 * - field.isArabic: boolean - true if font is Arabic = no tick marks
 * - field.isMultiline: boolean - multiline text box = no tick marks
 * - field.tickmarks: boolean - Server-computed (!UseUnicodeTextBox && !IsArabic for alpha, true for numeric)
 * 
 * @param {Object} field - Field definition from WASM engine (getCurrentPage result)
 * @returns {Object} Normalized tick mark data
 */
export function getTickMarkDataFromEngine(field) {
    if (!field) {
        console.warn('[TickMarks] getTickMarkDataFromEngine called with null/undefined field');
        return {
            shouldShowTickMarks: false,
            fieldLength: 1,
            decimalPlaces: 0,
            isNumeric: false,
            captureType: CAPTURE_TYPES.TextBox,
            isArabic: false,
            isMultiline: false,
            useUnicodeTextBox: false,
            tickmarksProperty: null
        };
    }
    
    // Extract field properties from engine data
    const isNumeric = field.isNumeric || 
        field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
    
    // Capture type - use nullish coalescing since 0 is valid (TextBox)
    const captureType = field.captureType ?? field.capture?.type ?? CAPTURE_TYPES.TextBox;
    
    // Arabic/RTL detection - directly from engine
    const isArabic = field.isArabic || field.rtl || false;
    
    // Multiline detection - directly from engine
    const isMultiline = field.isMultiline || field.multiline || false;
    
    // UseUnicodeTextBox - directly from engine (Alpha + TextBox capture type)
    const useUnicodeTextBox = field.useUnicodeTextBox || false;
    
    // Server-provided tickmarks property - This is the source of truth from the engine
    // It is computed as (!UseUnicodeTextBox && !IsArabic) for alpha, and true for numeric.
    const tickmarksProperty = field.tickmarks;
    
    // Compute whether to show tick marks using OUR rules (not server's)
    const shouldShow = computeShouldShowTickMarks({
        isNumeric,
        captureType,
        isArabic,
        isMultiline,
        useUnicodeTextBox,
        tickmarksProperty,
        fieldLength
    });
    
    console.log('[TickMarks] getTickMarkDataFromEngine:', field.name, {
        isNumeric,
        fieldLength,
        decimalPlaces,
        captureType,
        isArabic,
        isMultiline,
        useUnicodeTextBox,
        tickmarksProperty,
        shouldShowTickMarks: shouldShow
    });
    
    return {
        shouldShowTickMarks: shouldShow,
        fieldLength,
        decimalPlaces,
        isNumeric,
        captureType,
        isArabic,
        isMultiline,
        useUnicodeTextBox,
        tickmarksProperty
    };
}

/**
 * Compute whether tick marks should be shown based on extracted engine data
 * 
 * ENFORCED RULES:
 * 
 * Tick marks ARE shown when:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha + CheckBox capture: SHOW tick marks (regardless of useUnicodeTextBox)
 *   - Alpha + RadioButton capture: SHOW tick marks (regardless of useUnicodeTextBox)
 *   - Alpha + DropDown capture: SHOW tick marks (regardless of useUnicodeTextBox)
 * 
 * Tick marks are NOT shown when:
 *   - Alpha + TextBox capture (single line): NO tick marks
 *   - Alpha + TextBox capture (multiline): NO tick marks
 *   - Alpha + Arabic font: NO tick marks
 * 
 * NOTE: captureType can be either:
 *   - Integer (from getCurrentPage fields): 0=TextBox, 1=RadioButton, 2=CheckBox, etc.
 *   - String (from convertField for roster columns): "TextBox", "RadioButton", "CheckBox", etc.
 * 
 * @private
 */
function computeShouldShowTickMarks({ isNumeric, captureType, isArabic, isMultiline, useUnicodeTextBox, tickmarksProperty, fieldLength }) {
    // No tick marks for very short fields
    if (fieldLength <= 1) {
        console.log('[TickMarks] Field length <= 1, NO tick marks');
        return false;
    }
    
    // NUMERIC FIELDS: Always show tick marks
    if (isNumeric) {
        console.log('[TickMarks] Numeric field, SHOW tick marks');
        return true;
    }

    // If the engine provides the 'tickmarks' property, use it.
    // This property is computed on the server side using the exact MFC logic.
    if (tickmarksProperty !== null && tickmarksProperty !== undefined) {
        console.log('[TickMarks] Using engine provided tickmarks property:', tickmarksProperty);
        return tickmarksProperty;
    }
    
    // ALPHA FIELDS below this point
    
    // Check for Arabic fonts - no tick marks for Arabic
    if (isArabic) {
        console.log('[TickMarks] Arabic font detected, NO tick marks');
        return false;
    }

    // MFC Rule: UseUnicodeTextBox = Alpha + TextBox capture type => NO tick marks
    // If the engine explicitly tells us to use Unicode Text Box, then NO tick marks
    if (useUnicodeTextBox) {
        console.log('[TickMarks] useUnicodeTextBox=true, NO tick marks');
        return false;
    }
    
    // Normalize captureType to handle both integer and string values
    // From WASMBindings.cpp:
    //   - getCurrentPage fields: captureType is integer (0, 1, 2, 3, 4, ...)
    //   - convertField (roster columns): captureType is string ("TextBox", "CheckBox", ...)
    const ct = captureType;
    
    // Check for TextBox capture type (integer 0 or string "TextBox" or undefined/null)
    const isTextBoxCapture = ct === CAPTURE_TYPES.TextBox || 
                             ct === 0 || 
                             ct === 'TextBox' ||
                             ct === undefined ||
                             ct === null;
    
    // Check for CheckBox capture type (integer 2 or string "CheckBox")
    const isCheckBox = ct === CAPTURE_TYPES.CheckBox || ct === 2 || ct === 'CheckBox';
    
    // Check for RadioButton capture type (integer 1 or string "RadioButton")
    const isRadioButton = ct === CAPTURE_TYPES.RadioButton || ct === 1 || ct === 'RadioButton';
    
    // Check for DropDown capture type (integer 3 or string "DropDown")
    const isDropDown = ct === CAPTURE_TYPES.DropDown || ct === 3 || ct === 'DropDown';
    
    // Check for ComboBox capture type (integer 4 or string "ComboBox")
    const isComboBox = ct === CAPTURE_TYPES.ComboBox || ct === 4 || ct === 'ComboBox';
    
    console.log('[TickMarks] captureType:', ct, 'isTextBox:', isTextBoxCapture, 'isCheckBox:', isCheckBox, 'isRadioButton:', isRadioButton);
    
    // Alpha + CheckBox = SHOW tick marks (regardless of useUnicodeTextBox)
    if (isCheckBox) {
        console.log('[TickMarks] Alpha + CheckBox capture, SHOW tick marks');
        return true;
    }
    
    // Alpha + RadioButton = SHOW tick marks (regardless of useUnicodeTextBox)
    if (isRadioButton) {
        console.log('[TickMarks] Alpha + RadioButton capture, SHOW tick marks');
        return true;
    }
    
    // Alpha + DropDown = SHOW tick marks (regardless of useUnicodeTextBox)
    if (isDropDown) {
        console.log('[TickMarks] Alpha + DropDown capture, SHOW tick marks');
        return true;
    }
    
    // Alpha + ComboBox = SHOW tick marks (regardless of useUnicodeTextBox)
    if (isComboBox) {
        console.log('[TickMarks] Alpha + ComboBox capture, SHOW tick marks');
        return true;
    }
    
    // Alpha + TextBox (single or multiline) = NO tick marks
    if (isTextBoxCapture) {
        console.log('[TickMarks] Alpha + TextBox capture (multiline=' + isMultiline + '), NO tick marks');
        return false;
    }
    
    // For any other capture type, default to no tick marks
    console.log('[TickMarks] Alpha field with unknown capture type ' + ct + ', NO tick marks');
    return false;
}

/**
 * Determine if a field should show tick marks based on MFC logic
 * 
 * IMPORTANT: This function should be called with field data from the WASM engine.
 * The field object should come from engine.getCurrentPage() or similar engine methods.
 * 
 * From DEEdit.cpp OnPaint() and GridWnd.cpp:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha + TextBox: NO tick marks (UseUnicodeTextBox = true)
 *   - Alpha + Arabic font: NO tick marks
 *   - Alpha + other capture types: Show tick marks
 * 
 * @param {Object} field - Field definition from WASM engine
 * @returns {boolean} True if tick marks should be shown
 */
export function shouldShowTickMarks(field) {
    const data = getTickMarkDataFromEngine(field);
    return data.shouldShowTickMarks;
}

/**
 * Validate that field data has required tick mark properties from engine
 * Use this to ensure data is coming from the WASM engine
 * 
 * @param {Object} field - Field data to validate
 * @returns {boolean} True if field has minimum required properties
 */
export function hasTickMarkEngineData(field) {
    if (!field) return false;
    
    // Check for at least one of the identifying properties that come from engine
    const hasTypeInfo = field.isNumeric !== undefined || 
                        field.type !== undefined || 
                        field.contentType !== undefined ||
                        field.integerPartLength !== undefined;
    
    const hasLengthInfo = field.length !== undefined || 
                          field.alphaLength !== undefined ||
                          field.integerPartLength !== undefined;
    
    return hasTypeInfo || hasLengthInfo;
}

export default {
    shouldShowTickMarks,
    getTickMarkDataFromEngine,
    hasTickMarkEngineData,
    CAPTURE_TYPES
};
