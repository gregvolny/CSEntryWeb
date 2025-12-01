/**
 * Tick Mark Manager
 * 
 * Manages tick mark rendering for fields. Tick marks are ALWAYS visible on
 * applicable fields, not just when focused. This matches actual MFC CSEntry behavior
 * where tick marks are drawn in the grid cells regardless of focus state.
 * 
 * IMPORTANT: All field data MUST come from the WASM engine.
 * 
 * @module components/csentry-mfc-view/tickMarks/manager
 */

import { DEFAULT_CONFIG, TICK_MARK_CONFIG } from './config.js';
import { getTickMarkDataFromEngine } from './logic.js';
import { drawTickMarksTransparent, createTickMarkCanvas, clearTickMarkCanvas } from './canvas-renderer.js';
import { calculateTickPosition, getXFromCharIndex } from './utils.js';

/**
 * Tick Mark Manager - Manages tick mark rendering for fields
 * 
 * Tick marks are displayed PERMANENTLY on all applicable fields,
 * not just when the field has focus.
 * 
 * Usage:
 *   const manager = new TickMarkManager();
 *   manager.attachToInput(inputElement, fieldFromEngine);
 *   // Tick marks are immediately visible and stay visible
 */
export class TickMarkManager {
    /**
     * Create a new TickMarkManager
     * @param {Object} [config] - Configuration options
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this._attachedInputs = new WeakMap();
    }

    /**
     * Attach tick mark handling to an input element
     * Tick marks are shown IMMEDIATELY and PERMANENTLY (not just on focus)
     * 
     * IMPORTANT: The field parameter MUST come from WASM engine
     * 
     * @param {HTMLInputElement} input - Input element to manage
     * @param {Object} field - Field definition from WASM engine
     * @param {Object} [options] - Additional options
     */
    attachToInput(input, field, options = {}) {
        // Get tick mark data from engine
        const tickData = getTickMarkDataFromEngine(field);
        
        // Skip if tick marks shouldn't be shown
        if (!tickData.shouldShowTickMarks || tickData.fieldLength <= 1) {
            console.log('[TickMarkManager] Skipping tick marks for:', field.name, 
                '(shouldShow:', tickData.shouldShowTickMarks, 'length:', tickData.fieldLength, ')');
            return;
        }

        // Check for special cases from options
        if (options.useUnicodeTextBox || options.isMultiline || options.isArabic) {
            console.log('[TickMarkManager] Skipping tick marks due to options:', field.name);
            return;
        }

        // Store tick mark data on input
        input.dataset.tickMarkEnabled = 'true';
        input.dataset.fieldLength = tickData.fieldLength.toString();
        input.dataset.decimalPlaces = tickData.decimalPlaces.toString();
        input.dataset.isNumeric = tickData.isNumeric ? '1' : '0';

        // Create canvas overlay - ALWAYS VISIBLE (not hidden by default)
        const container = input.closest('.roster-field-container') || input.parentElement;
        if (!container) {
            console.warn('[TickMarkManager] No container found for input:', field.name);
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
                z-index: 1;
            `;
            container.style.position = 'relative';
            container.insertBefore(canvas, input);
        }

        // Size canvas to match container/input
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Draw tick marks IMMEDIATELY (always visible)
        this._drawTickMarks(canvas, tickData, input.value);

        // Setup input styling for tick mark overlay
        input.style.background = 'transparent';
        input.style.position = 'absolute';
        input.style.top = '0';
        input.style.left = '0';
        input.style.zIndex = '2';

        // Create event handlers for value updates only
        const handlers = {
            onInput: () => {
                this._drawTickMarks(canvas, tickData, input.value);
            }
        };

        // Attach event listener
        input.addEventListener('input', handlers.onInput);

        // Store handlers for cleanup
        this._attachedInputs.set(input, {
            canvas,
            tickData,
            handlers
        });

        console.log('[TickMarkManager] Attached PERMANENT tick marks to:', field.name, tickData);
    }

    /**
     * Detach tick mark handling from an input
     * @param {HTMLInputElement} input - Input to detach from
     */
    detachFromInput(input) {
        if (!input) return;

        const attachment = this._attachedInputs.get(input);
        if (attachment) {
            const { canvas, handlers } = attachment;
            
            // Remove event listeners
            input.removeEventListener('input', handlers.onInput);
            
            // Remove canvas
            if (canvas && canvas.parentNode) {
                canvas.remove();
            }
            
            this._attachedInputs.delete(input);
        }

        // Clean up data attributes
        delete input.dataset.tickMarkEnabled;
        delete input.dataset.fieldLength;
        delete input.dataset.decimalPlaces;
        delete input.dataset.isNumeric;
    }

    /**
     * Update tick marks for an input (e.g., when value changes from engine)
     * @param {HTMLInputElement} input - Input to update
     * @param {string} value - New value
     */
    updateTickMarks(input, value) {
        const attachment = this._attachedInputs.get(input);
        if (attachment) {
            const { canvas, tickData } = attachment;
            this._drawTickMarks(canvas, tickData, value);
        }
    }

    /**
     * Draw tick marks on canvas
     * @private
     */
    _drawTickMarks(canvas, tickData, value = '') {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas (transparent background so input text shows through)
        ctx.clearRect(0, 0, width, height);
        
        const { fieldLength, decimalPlaces } = tickData;
        const charWidth = this.config.charWidth;
        const left = 1;  // Account for border
        const bottom = height - 1;
        const cellHeight = height - 2;
        
        // Tick height = 1/4 of cell height (MFC: iBottom to iBottom - iHeight/4)
        const tickTop = bottom - Math.floor(cellHeight / 4);
        
        // Draw tick marks between characters (fieldLength - 1 tick marks)
        for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
            const x = calculateTickPosition(iIndex, charWidth, left);
            
            // Highlight decimal position with different color
            if (decimalPlaces > 0 && iIndex === fieldLength - decimalPlaces - 1) {
                ctx.strokeStyle = this.config.decimalTickColor || '#0000ff';
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = this.config.tickColor;
                ctx.lineWidth = 1;
            }
            
            ctx.beginPath();
            ctx.moveTo(x + 0.5, bottom);
            ctx.lineTo(x + 0.5, tickTop);
            ctx.stroke();
        }
    }

    /**
     * Calculate field width for tick marks
     * @static
     */
    static calculateFieldWidth(fieldLength) {
        const charWidth = DEFAULT_CONFIG.charWidth;
        const borderWidth = TICK_MARK_CONFIG.BORDER_WIDTH;
        const sepSize = TICK_MARK_CONFIG.SEP_SIZE;
        return charWidth * fieldLength + (fieldLength - 1) * sepSize + 2 * fieldLength + 2 * borderWidth;
    }
}

/**
 * Create a default tick mark manager instance
 * @param {Object} [config] - Configuration options
 * @returns {TickMarkManager} Manager instance
 */
export function createTickMarkManager(config = {}) {
    return new TickMarkManager(config);
}

export default TickMarkManager;
