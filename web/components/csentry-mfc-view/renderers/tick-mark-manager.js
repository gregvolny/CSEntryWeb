/**
 * Tick Mark Manager Module
 * Ported from CSEntry MFC implementation (DEEdit.cpp OnPaint)
 * 
 * In the native MFC implementation:
 * - Tick marks are ONLY shown when a field has focus (is being edited)
 * - When not focused, fields display plain text without tick marks
 * - The CDEEdit control draws tick marks in its OnPaint() method
 * - Tick marks are small vertical lines drawn BETWEEN character positions
 * - Height is 1/4 of cell height, drawn from bottom upward
 * 
 * MFC Formula from DEEdit.cpp OnPaint():
 *   dc.MoveTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, rect.bottom);
 *   dc.LineTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, (rect.bottom*3)/4);
 * 
 * Where:
 *   - sizeChar.cx = character width (from GetTextExtent("0",1))
 *   - SEP_SIZE = 1 (from zFormO/FormFile.h)
 *   - iIndex goes from 0 to iLength-2 (length-1 tick marks total)
 * 
 * @module components/csentry-mfc-view/renderers/tick-mark-manager
 */

// Constants from MFC source (zFormO/FormFile.h)
const SEP_SIZE = 1;  // Tick separator size

// Font metrics (approximation for Courier New/monospace at 12px)
// In MFC this comes from dc.GetTextExtent("0", 1)
const DEFAULT_CHAR_WIDTH = 8;
const DEFAULT_CHAR_HEIGHT = 16;

/**
 * Configuration for tick mark rendering
 * @typedef {Object} TickMarkConfig
 * @property {number} charWidth - Width of a single character in pixels
 * @property {number} charHeight - Height of a single character in pixels
 * @property {string} tickColor - Color of tick marks
 * @property {string} decimalTickColor - Color of decimal position tick mark
 * @property {string} textColor - Color of text
 * @property {string} backgroundColor - Background color
 */

/** @type {TickMarkConfig} */
const defaultConfig = {
    charWidth: DEFAULT_CHAR_WIDTH,
    charHeight: DEFAULT_CHAR_HEIGHT,
    tickColor: '#808080',        // Gray tick marks (default pen color)
    decimalTickColor: '#000080', // Dark blue for decimal position
    textColor: '#000000',        // Black text
    backgroundColor: '#ffffff'   // White background
};

/**
 * Tick Mark Manager - Manages tick mark rendering for focused fields only
 * 
 * Usage:
 *   const manager = new TickMarkManager();
 *   manager.attachToInput(inputElement, fieldLength, decimalPlaces, isNumeric);
 *   // On focus: tick marks appear
 *   // On blur: tick marks disappear, plain text shown
 */
export class TickMarkManager {
    constructor(config = {}) {
        this.config = { ...defaultConfig, ...config };
        this._activeCanvas = null;
        this._activeInput = null;
    }

    /**
     * Attach tick mark handling to an input element
     * Tick marks only appear when input is focused (matches MFC behavior)
     * 
     * @param {HTMLInputElement} input - Input element to manage
     * @param {number} fieldLength - Total field length
     * @param {number} decimalPlaces - Number of decimal places (0 for non-decimal)
     * @param {boolean} isNumeric - Whether field is numeric
     * @param {Object} options - Additional options
     */
    attachToInput(input, fieldLength, decimalPlaces = 0, isNumeric = false, options = {}) {
        // Skip tick marks for very short fields or special cases
        if (fieldLength <= 1) {
            return;
        }

        // Check for Arabic/RTL or multiline fields (no tick marks per MFC)
        if (options.useUnicodeTextBox || options.isMultiline || options.isArabic) {
            return;
        }

        // Store field info on the input for later use
        input.dataset.tickMarkEnabled = 'true';
        input.dataset.fieldLength = fieldLength.toString();
        input.dataset.decimalPlaces = decimalPlaces.toString();
        input.dataset.isNumeric = isNumeric ? '1' : '0';

        // Create canvas overlay (initially hidden)
        const container = input.closest('.roster-field-container') || input.parentElement;
        if (!container) {
            console.warn('[TickMarkManager] No container found for input:', input.dataset.fieldName);
            return;
        }
        let canvas = container.querySelector('.tick-mark-canvas');
        
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'tick-mark-canvas';
            canvas.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 0;
                display: none;
            `;
            container.style.position = 'relative';
            container.insertBefore(canvas, input);
        }

        // Focus handler - show tick marks (MFC: OnSetFocus -> SetCaret -> show edit)
        const onFocus = () => {
            this._showTickMarks(input, canvas, fieldLength, decimalPlaces, isNumeric);
        };

        // Blur handler - hide tick marks (MFC: OnKillFocus -> hide edit)
        const onBlur = () => {
            this._hideTickMarks(input, canvas);
        };

        // Input handler - update tick marks as user types
        const onInput = () => {
            if (canvas.style.display !== 'none') {
                this._updateTickMarks(input, canvas, fieldLength, decimalPlaces, isNumeric);
            }
        };

        // Attach event listeners
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);
        input.addEventListener('input', onInput);

        // Store cleanup function
        input._tickMarkCleanup = () => {
            input.removeEventListener('focus', onFocus);
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('input', onInput);
        };
    }

    /**
     * Detach tick mark handling from an input
     * @param {HTMLInputElement} input - Input to detach from
     */
    detachFromInput(input) {
        if (!input) return;
        
        if (input._tickMarkCleanup) {
            input._tickMarkCleanup();
            delete input._tickMarkCleanup;
        }
        
        const container = input.closest('.roster-field-container') || input.parentElement;
        const canvas = container?.querySelector('.tick-mark-canvas');
        if (canvas) {
            canvas.remove();
        }
        
        delete input.dataset.tickMarkEnabled;
    }

    /**
     * Show tick marks (called on focus)
     * @private
     */
    _showTickMarks(input, canvas, fieldLength, decimalPlaces, isNumeric) {
        // Size canvas to match input
        const rect = input.getBoundingClientRect();
        const containerRect = input.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvas.style.left = (rect.left - containerRect.left) + 'px';
        canvas.style.top = (rect.top - containerRect.top) + 'px';
        canvas.style.display = 'block';

        // Apply focused style to input (make text render through canvas)
        input.classList.add('tick-mark-active');

        // Draw tick marks
        this._drawTickMarks(canvas, fieldLength, decimalPlaces, isNumeric, input.value);

        this._activeCanvas = canvas;
        this._activeInput = input;
    }

    /**
     * Hide tick marks (called on blur)
     * @private
     */
    _hideTickMarks(input, canvas) {
        canvas.style.display = 'none';
        input.classList.remove('tick-mark-active');

        if (this._activeCanvas === canvas) {
            this._activeCanvas = null;
            this._activeInput = null;
        }
    }

    /**
     * Update tick marks when value changes
     * @private
     */
    _updateTickMarks(input, canvas, fieldLength, decimalPlaces, isNumeric) {
        this._drawTickMarks(canvas, fieldLength, decimalPlaces, isNumeric, input.value);
    }

    /**
     * Draw tick marks on canvas - exact port of MFC DEEdit::OnPaint()
     * 
     * From DEEdit.cpp:
     *   for (int iIndex = 0; iIndex < iLength-1; iIndex++) {
     *       dc.MoveTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, rect.bottom);
     *       dc.LineTo(rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE, (rect.bottom*3)/4);
     *   }
     * 
     * @param {HTMLCanvasElement} canvas - Canvas to draw on
     * @param {number} fieldLength - Total field length
     * @param {number} decimalPlaces - Number of decimal places
     * @param {boolean} isNumeric - Whether field is numeric
     * @param {string} value - Current value to display
     * @private
     */
    _drawTickMarks(canvas, fieldLength, decimalPlaces, isNumeric, value = '') {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Fill background
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(0, 0, width, height);
        
        const charWidth = this.config.charWidth;
        const left = 0;  // Left edge of drawing area
        const bottom = height;  // Bottom of canvas (MFC: rect.bottom)
        
        // Tick height = 1/4 of cell height (MFC: rect.bottom - (rect.bottom*3)/4 = height/4)
        const tickTop = Math.floor((bottom * 3) / 4);
        
        // Set up tick mark style (MFC default pen = 1px black/gray)
        ctx.strokeStyle = this.config.tickColor;
        ctx.lineWidth = 1;
        
        // Draw tick marks BETWEEN characters (iLength-1 tick marks)
        // MFC formula: x = left + charWidth*(iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE
        for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
            const x = left + charWidth * (iIndex + 1) + (iIndex + 1) * 2 + iIndex * SEP_SIZE;
            
            // Highlight decimal position with different color
            if (decimalPlaces > 0 && iIndex === fieldLength - decimalPlaces - 1) {
                ctx.strokeStyle = this.config.decimalTickColor;
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = this.config.tickColor;
                ctx.lineWidth = 1;
            }
            
            // Draw vertical line from bottom to tickTop
            ctx.beginPath();
            ctx.moveTo(x + 0.5, bottom);  // +0.5 for crisp 1px line
            ctx.lineTo(x + 0.5, tickTop);
            ctx.stroke();
        }
        
        // Draw value characters (MFC draws each character individually)
        if (value) {
            this._drawValue(ctx, value, fieldLength, decimalPlaces, isNumeric, left, bottom, charWidth);
        }
    }

    /**
     * Draw value characters on canvas - port of MFC DEEdit::OnPaint() text drawing
     * 
     * From DEEdit.cpp:
     *   for(int iIndex = 0; iIndex < sString.GetLength(); iIndex++) {
     *       int iX = rect.left + sizeChar.cx * (iIndex) + (2*iIndex + 1) + iIndex*SEP_SIZE;
     *       int iY = rect.bottom - sizeChar.cy;
     *       dc.TextOut(iX, iY, sString.GetAt(iIndex));
     *   }
     * 
     * @private
     */
    _drawValue(ctx, value, fieldLength, decimalPlaces, isNumeric, left, bottom, charWidth) {
        ctx.font = '12px Consolas, "Courier New", monospace';
        ctx.fillStyle = this.config.textColor;
        ctx.textBaseline = 'bottom';
        
        // For numeric: remove decimal for positioning, handle right alignment
        // For alpha: left alignment
        let cleanValue = value;
        let hasDecimalInValue = false;
        
        if (isNumeric) {
            hasDecimalInValue = value.includes('.') || value.includes(',');
            cleanValue = value.replace(/[.,]/g, '');
        }
        
        // Calculate starting position
        let startIdx;
        if (isNumeric) {
            // Right-align numeric values within their portion
            if (decimalPlaces > 0) {
                // For decimal numbers, separate integer and decimal parts
                const parts = value.split(/[.,]/);
                const intPart = parts[0] || '';
                const decPart = parts[1] || '';
                
                const intLength = fieldLength - decimalPlaces - 1; // -1 for decimal point
                
                // Draw integer part (right-aligned in integer portion)
                const intStart = intLength - intPart.length;
                for (let i = 0; i < intPart.length; i++) {
                    const charIdx = intStart + i;
                    if (charIdx >= 0 && charIdx < intLength) {
                        const x = left + charWidth * charIdx + (2 * charIdx + 1) + charIdx * SEP_SIZE;
                        const y = bottom - 2;
                        ctx.fillText(intPart[i], x, y);
                    }
                }
                
                // Draw decimal point
                const decPointIdx = intLength;
                const decPointX = left + charWidth * decPointIdx + (2 * decPointIdx + 1) + decPointIdx * SEP_SIZE;
                ctx.fillText('.', decPointX, bottom - 2);
                
                // Draw decimal part (left-aligned in decimal portion)
                for (let i = 0; i < decPart.length && i < decimalPlaces; i++) {
                    const charIdx = intLength + 1 + i;
                    const x = left + charWidth * charIdx + (2 * charIdx + 1) + charIdx * SEP_SIZE;
                    ctx.fillText(decPart[i], x, bottom - 2);
                }
            } else {
                // Non-decimal numeric: right-align
                startIdx = fieldLength - cleanValue.length;
                for (let i = 0; i < cleanValue.length; i++) {
                    const charIdx = startIdx + i;
                    if (charIdx >= 0 && charIdx < fieldLength) {
                        const x = left + charWidth * charIdx + (2 * charIdx + 1) + charIdx * SEP_SIZE;
                        ctx.fillText(cleanValue[i], x, bottom - 2);
                    }
                }
            }
        } else {
            // Alpha: left-align
            for (let i = 0; i < cleanValue.length && i < fieldLength; i++) {
                const x = left + charWidth * i + (2 * i + 1) + i * SEP_SIZE;
                ctx.fillText(cleanValue[i], x, bottom - 2);
            }
        }
    }

    /**
     * Calculate the width needed for a field with tick marks
     * From MFC DEEdit::ComputeRect():
     *   iRight = iX + size.cx*iLength + 2*iXB + (iLength-1)*SEP_SIZE + 2*iLength
     * 
     * @param {number} fieldLength - Field length in characters
     * @returns {number} Width in pixels
     */
    static calculateFieldWidth(fieldLength) {
        const charWidth = DEFAULT_CHAR_WIDTH;
        const borderWidth = 2;  // SM_CXBORDER * 2
        return charWidth * fieldLength + (fieldLength - 1) * SEP_SIZE + 2 * fieldLength + 2 * borderWidth;
    }

    /**
     * Get character position from X coordinate (for caret positioning)
     * From MFC DEEdit::GetCharFromCaretPos()
     * 
     * @param {number} x - X coordinate relative to field left edge
     * @param {number} fieldLength - Field length
     * @returns {number} Character index (0-based)
     */
    static getCharIndexFromX(x, fieldLength) {
        const charWidth = DEFAULT_CHAR_WIDTH;
        // Inverse of the position formula
        return Math.floor(x / (charWidth + SEP_SIZE + 2));
    }

    /**
     * Get X coordinate for a character position
     * From MFC: iX = rect.left + sizeChar.cx * idx + (2*idx + 1) + idx*SEP_SIZE
     * 
     * @param {number} charIndex - Character index (0-based)
     * @returns {number} X coordinate in pixels
     */
    static getXFromCharIndex(charIndex) {
        const charWidth = DEFAULT_CHAR_WIDTH;
        return charWidth * charIndex + (2 * charIndex + 1) + charIndex * SEP_SIZE;
    }
}

/**
 * Create a default tick mark manager instance
 * @returns {TickMarkManager} Manager instance
 */
export function createTickMarkManager(config) {
    return new TickMarkManager(config);
}

/**
 * Determine if a field should show tick marks based on MFC logic
 * 
 * From zFormO/Field.cpp line 396-397:
 *   m_bUseUnicodeTextBox = ( dictionary_item.GetContentType() == ContentType::Alpha &&
 *                            m_captureInfo.GetCaptureType() == CaptureType::TextBox );
 * 
 * From GridWnd.cpp OnPaint() lines 266-268:
 *   if( fld.GetDEField()->UseUnicodeTextBox() ||
 *       ( pDictItem->GetContentType() == ContentType::Alpha && fld.GetDEField()->GetFont().IsArabic() ) ) {
 *       // NO tick marks for UseUnicodeTextBox OR Alpha+Arabic
 *   }
 * 
 * MFC Rules:
 * - UseUnicodeTextBox = Alpha + TextBox capture type
 * - NO tick marks when: UseUnicodeTextBox is true OR (Alpha AND Arabic font)
 * - In practice: Alpha fields with TextBox capture type => NO tick marks
 *                All numeric fields => HAVE tick marks  
 *                Alpha fields with non-TextBox capture => HAVE tick marks
 * 
 * @param {Object} field - Field definition
 * @returns {boolean} True if tick marks should be shown
 */
export function shouldShowTickMarks(field) {
    // Get field length
    const fieldLength = field.length || field.alphaLength || 
        ((field.integerPartLength || 0) + (field.fractionalPartLength || 0)) || 1;
    
    // Determine if field is numeric
    const isNumeric = field.isNumeric || field.type === 'numeric' || 
        field.contentType === 'Numeric' || 
        (field.integerPartLength !== undefined && field.integerPartLength > 0);
    
    // NUMERIC FIELDS: Always show tick marks (UseUnicodeTextBox is always false)
    if (isNumeric) {
        return true;
    }
    
    // ALPHA FIELDS: Check server-provided tickmarks property first
    // The server serializes tickmarks = !UseUnicodeTextBox() for alpha fields
    if (field.tickmarks === false) {
        return false;
    }
    
    // Check for Arabic fonts (GetFont().IsArabic() in MFC) - check BEFORE capture type
    if (field.isArabic || field.rtl) {
        return false;
    }
    
    // Check capture type - TextBox capture type = UseUnicodeTextBox = no tick marks
    // NOTE: Use ?? (nullish coalescing) not || because 0 (TextBox) is a valid value
    const captureType = field.captureType ?? field.capture?.type ?? 0;
    
    // Alpha + TextBox (capture type 0) = UseUnicodeTextBox = true => NO tick marks
    if (captureType === 0 || captureType === 'TextBox') {
        return false;
    }
    
    // Alpha field with non-TextBox capture type (ComboBox, DropDown, etc.) - show tick marks
    return true;
}

export default TickMarkManager;
