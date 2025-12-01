/**
 * Tick Marks CSS Styles Module
 * 
 * Centralized CSS styles for tick mark rendering in CSPro data entry fields.
 * All tick mark styling is consolidated here to maintain consistency.
 * 
 * MFC Tick Mark Rules (from DEEdit.cpp, GridWnd.cpp, Field.cpp):
 * 
 * Tick marks are shown when:
 *   - Numeric fields: ALWAYS show tick marks
 *   - Alpha fields: Show tick marks UNLESS:
 *     - UseUnicodeTextBox() is true (Alpha + TextBox capture type), OR
 *     - Font is Arabic (GetFont().IsArabic())
 * 
 * UseUnicodeTextBox = true when:
 *   - ContentType::Alpha AND CaptureType::TextBox
 * 
 * All tick mark data MUST come from the CSPro WASM engine:
 *   - field.isNumeric: boolean - Numeric fields always show tick marks
 *   - field.captureType: number - TextBox capture type (0) = no tick marks for alpha
 *   - field.isArabic/rtl: boolean - Arabic fonts = no tick marks
 *   - field.tickmarks: boolean - Server-computed (!UseUnicodeTextBox)
 * 
 * @module components/csentry-mfc-view/tickMarks/styles
 */

/**
 * Get tick mark CSS styles
 * 
 * Tick mark CSS styles for canvas-based rendering.
 * All tick marks use a canvas overlay with proper z-index layering.
 * 
 * @returns {string} CSS styles for tick marks
 */
export function getTickMarkStyles() {
    return `
        /* =================================================================
         * TICK MARK STYLES MODULE
         * 
         * All tick mark rendering is based on data from CSPro WASM engine.
         * The engine provides the following properties for tick mark decisions:
         * 
         * From WASMBindings.cpp getCurrentPage():
         *   - field.isNumeric: boolean
         *   - field.captureType: number (0 = TextBox)
         *   - field.integerPartLength: number (for numeric fields)
         *   - field.fractionalPartLength: number (decimal places)
         *   - field.alphaLength: number (for alpha fields)
         * 
         * MFC Logic (Field.cpp, DEEdit.cpp, GridWnd.cpp):
         *   Numeric fields: ALWAYS show tick marks
         *   Alpha fields: Show tick marks UNLESS:
         *     - UseUnicodeTextBox() = true (Alpha + TextBox capture), OR
         *     - GetFont().IsArabic() = true
         * ================================================================= */
        
        /* Canvas elements for tick mark rendering */
        .roster-tick-canvas,
        .checkbox-tick-canvas,
        .tick-mark-canvas,
        .form-field-tick-canvas {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        }
        
        /* Tick mark container for form fields */
        .form-field-tickmark-container {
            position: relative;
            display: inline-block;
        }
        
        /* Input overlay on tick mark canvas */
        .form-field-tickmark-input {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 3;
            background: transparent;
            border: 1px solid #000;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
            letter-spacing: 3px;
        }
        
        .form-field-tickmark-input:focus {
            border-color: #000080;
            outline: none;
        }
        
        /* HTML-based tick marks (alternative to canvas) */
        .form-field-tickmarks {
            position: absolute;
            bottom: 2px;
            left: 4px;
            right: 4px;
            height: 6px;
            display: flex;
            pointer-events: none;
        }
        
        .tickmark-char {
            flex: 1;
            border-right: 1px solid #808080;
            height: 100%;
        }
        
        .tickmark-char:last-child {
            border-right: none;
        }
        
        .tickmark-decimal {
            border-right: 1px solid #000080;
            border-right-width: 2px;
        }
        
        /* Roster cell input with tick marks */
        .roster-cell-input.with-tick-marks {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 3;
            background: transparent;
            border: 1px solid #000;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
            letter-spacing: 3px;
        }
        
        .roster-cell-input.with-tick-marks:focus {
            border-color: #000080;
            outline: none;
        }
        
        /* Checkbox dialog cell tick marks */
        .checkbox-input-wrapper {
            position: relative;
            display: inline-block;
        }
        
        .checkbox-dialog-input.with-tick-marks {
            background: transparent;
            letter-spacing: 3px;
        }
        
        .checkbox-dialog-input.with-tick-marks:focus {
            background: transparent;
        }
    `;
}

/**
 * Get active tick mark styles (when tick marks are enabled)
 * Call this function when tick mark rendering is fully working
 * 
 * @returns {string} CSS styles for active tick marks
 */
export function getActiveTickMarkStyles() {
    return `
        /* =================================================================
         * ACTIVE TICK MARK STYLES
         * Use these styles when tick mark rendering from WASM engine is working
         * ================================================================= */
        
        /* Canvas elements for tick mark rendering */
        .roster-tick-canvas,
        .checkbox-tick-canvas,
        .tick-mark-canvas,
        .form-field-tick-canvas {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        }
        
        /* Tick mark container for form fields */
        .form-field-tickmark-container {
            position: relative;
            display: inline-block;
        }
        
        /* Input overlay on tick mark canvas */
        .form-field-tickmark-input {
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
            font-size: 14px;
            padding: 0 3px;
        }
        
        .form-field-tickmark-input:focus {
            border-color: #000080;
        }
        
        /* HTML-based tick marks (alternative to canvas) */
        .form-field-tickmarks {
            position: absolute;
            bottom: 2px;
            left: 4px;
            right: 4px;
            height: 6px;
            display: flex;
            pointer-events: none;
        }
        
        .tickmark-char {
            flex: 1;
            border-right: 1px solid #808080;
            height: 100%;
        }
        
        .tickmark-char:last-child {
            border-right: none;
        }
        
        .tickmark-decimal {
            border-right: 1px solid #000080;
            border-right-width: 2px;
        }
        
        /* Roster cell input with tick marks */
        .roster-cell-input.with-tick-marks {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
            background: transparent;
            border: 1px solid #000;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            padding: 0 2px;
            letter-spacing: 3px;
        }
        
        .roster-cell-input.with-tick-marks:focus {
            border-color: var(--mfc-selection, #0078d7);
        }
        
        /* Checkbox dialog cell tick marks */
        .checkbox-input-wrapper {
            position: relative;
            display: inline-block;
        }
        
        .checkbox-dialog-input.with-tick-marks {
            background: transparent;
            letter-spacing: 3px;
        }
        
        .checkbox-dialog-input.with-tick-marks:focus {
            background: transparent;
        }
    `;
}

export default getTickMarkStyles;
