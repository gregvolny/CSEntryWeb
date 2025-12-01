/**
 * Tick Marks DOM Elements
 * 
 * Functions for creating and managing DOM elements for tick marks.
 * These create the container, canvas, and input elements needed for
 * tick mark rendering.
 * 
 * IMPORTANT: Tick marks are ALWAYS VISIBLE on applicable fields,
 * not just when the field has focus.
 * 
 * @module components/csentry-mfc-view/tickMarks/dom-elements
 */

import { TICK_MARK_CONFIG } from './config.js';
import { measureCharWidth, calculateCellGap, calculateContainerDimensions } from './utils.js';
import { createTickMarkCanvas, drawTickMarksTransparent, drawTickMarksWithLetterSpacing } from './canvas-renderer.js';
import { getTickMarkDataFromEngine } from './logic.js';

/**
 * Create a tick mark container with canvas and input
 * Tick marks are drawn IMMEDIATELY and stay visible permanently.
 * 
 * IMPORTANT: The field parameter MUST come from WASM engine (getCurrentPage result)
 * 
 * @param {Object} field - Field definition from WASM engine
 * @param {number} fieldIndex - Field index
 * @param {Object} [options] - Additional options
 * @returns {HTMLDivElement} Container with canvas and input
 */
export function createTickMarkContainer(field, fieldIndex, options = {}) {
    // Get tick mark data from engine
    const tickData = getTickMarkDataFromEngine(field);
    
    if (!tickData.shouldShowTickMarks || tickData.fieldLength <= 1) {
        // Return simple input without tick marks
        return createSimpleInput(field, fieldIndex, tickData);
    }
    
    const charWidth = measureCharWidth();
    const cellGap = calculateCellGap();
    const dimensions = calculateContainerDimensions(tickData.fieldLength, charWidth);
    const inputPadding = 3;
    
    // Create container
    const container = document.createElement('div');
    container.className = 'form-field-tickmark-container';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.dataset.hasTickMarks = 'true';
    container.style.position = 'relative';
    container.style.width = dimensions.width + 'px';
    container.style.height = dimensions.height + 'px';
    container.style.display = 'inline-block';
    
    // Create and draw tick mark canvas - ALWAYS VISIBLE
    const canvas = createTickMarkCanvas(dimensions.width, dimensions.height, 'form-field-tick-canvas');
    canvas.style.display = 'block';  // Always visible, not hidden
    drawTickMarksWithLetterSpacing(canvas, tickData.fieldLength, charWidth, cellGap, inputPadding);
    container.appendChild(canvas);
    
    // Create input overlay
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-field-tickmark-input' + (tickData.isNumeric ? ' numeric' : '');
    input.dataset.fieldName = field.name;
    input.dataset.fieldIndex = fieldIndex;
    input.dataset.occurrence = '1';
    input.dataset.isNumeric = tickData.isNumeric ? '1' : '0';
    input.dataset.fieldLength = tickData.fieldLength;
    input.dataset.hasTickMarks = 'true';
    input.maxLength = tickData.fieldLength + (tickData.decimalPlaces > 0 ? 1 : 0);
    
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
        font-family: ${TICK_MARK_CONFIG.FONT_FAMILY};
        font-size: ${TICK_MARK_CONFIG.FONT_SIZE};
        padding: 0 ${inputPadding}px;
        letter-spacing: ${cellGap}px;
    `;
    
    container.appendChild(input);
    return container;
}

/**
 * Create a simple input without tick marks
 * @private
 */
function createSimpleInput(field, fieldIndex, tickData) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-field-input' + 
        (tickData.isNumeric ? ' numeric' : '') +
        (field.isUpperCase ? ' uppercase' : '');
    input.dataset.fieldName = field.name;
    input.dataset.fieldIndex = fieldIndex;
    input.dataset.occurrence = '1';
    input.dataset.hasTickMarks = 'false';
    input.maxLength = tickData.fieldLength;
    return input;
}

/**
 * Create tick mark input for standalone fields (forms, not rosters)
 * 
 * @param {Object} field - Field definition from WASM engine
 * @param {number} fieldIndex - Field index
 * @param {boolean} isNumeric - Whether field is numeric
 * @param {number} fieldLength - Field length in characters
 * @returns {HTMLDivElement} Container with input and tick mark canvas
 */
export function createTickMarkInput(field, fieldIndex, isNumeric, fieldLength) {
    const charWidth = measureCharWidth();
    const cellGap = calculateCellGap();
    const dimensions = calculateContainerDimensions(fieldLength, charWidth);
    const inputPadding = 3;
    const decimalPlaces = field.fractionalPartLength || field.decimalPlaces || 0;
    
    const container = document.createElement('div');
    container.className = 'form-field-tickmark-container';
    container.dataset.fieldName = field.name;
    container.dataset.fieldIndex = fieldIndex;
    container.style.position = 'relative';
    container.style.width = dimensions.width + 'px';
    container.style.height = dimensions.height + 'px';
    container.style.display = 'inline-block';
    
    // Create tick mark canvas
    const canvas = createTickMarkCanvas(dimensions.width, dimensions.height, 'form-field-tick-canvas');
    drawTickMarksWithLetterSpacing(canvas, fieldLength, charWidth, cellGap, inputPadding);
    container.appendChild(canvas);
    
    // Create input overlay
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
        font-family: ${TICK_MARK_CONFIG.FONT_FAMILY};
        font-size: ${TICK_MARK_CONFIG.FONT_SIZE};
        padding: 0 ${inputPadding}px;
        letter-spacing: ${cellGap}px;
    `;
    
    container.appendChild(input);
    return container;
}

/**
 * Attach tick marks to an existing input element
 * Creates a canvas overlay that shows tick marks PERMANENTLY (always visible)
 * 
 * @param {HTMLInputElement} input - Input element to attach to
 * @param {Object} field - Field definition from WASM engine
 * @returns {HTMLCanvasElement|null} Canvas element or null if not applicable
 */
export function attachTickMarksToInput(input, field) {
    const tickData = getTickMarkDataFromEngine(field);
    
    if (!tickData.shouldShowTickMarks || tickData.fieldLength <= 1) {
        return null;
    }
    
    // Find or create container
    let container = input.closest('.roster-field-container') || input.parentElement;
    if (!container) {
        console.warn('[TickMarks] No container found for input:', field.name);
        return null;
    }
    
    // Check if canvas already exists
    let canvas = container.querySelector('.tick-mark-canvas');
    if (!canvas) {
        const rect = input.getBoundingClientRect();
        canvas = createTickMarkCanvas(rect.width, rect.height);
        canvas.style.display = 'block';  // Always visible, not hidden
        container.style.position = 'relative';
        container.insertBefore(canvas, input);
        
        // Draw tick marks immediately
        drawTickMarksTransparent(canvas, tickData.fieldLength, {
            decimalPlaces: tickData.decimalPlaces
        });
    }
    
    // Make input transparent so tick marks show through
    input.style.background = 'transparent';
    
    // Store tick mark data on input
    input.dataset.tickMarkEnabled = 'true';
    input.dataset.fieldLength = tickData.fieldLength.toString();
    input.dataset.decimalPlaces = tickData.decimalPlaces.toString();
    input.dataset.isNumeric = tickData.isNumeric ? '1' : '0';
    
    return canvas;
}

/**
 * Detach tick marks from an input element
 * Removes the canvas overlay and cleans up data attributes
 * 
 * @param {HTMLInputElement} input - Input element to detach from
 */
export function detachTickMarksFromInput(input) {
    if (!input) return;
    
    const container = input.closest('.roster-field-container') || input.parentElement;
    const canvas = container?.querySelector('.tick-mark-canvas');
    
    if (canvas) {
        canvas.remove();
    }
    
    delete input.dataset.tickMarkEnabled;
    delete input.dataset.fieldLength;
    delete input.dataset.decimalPlaces;
}

/**
 * Create roster cell container with tick marks
 * For use in roster tables
 * 
 * @param {Object} field - Field definition from WASM engine
 * @param {number} rowIdx - Row index
 * @param {Object} roster - Parent roster definition
 * @param {boolean} showTicks - Whether to show tick marks
 * @returns {HTMLDivElement} Cell container
 */
export function createRosterTickMarkCell(field, rowIdx, roster, showTicks) {
    const tickData = getTickMarkDataFromEngine(field);
    const occurrence = rowIdx + 1;
    
    const container = document.createElement('div');
    container.className = 'roster-field-container';
    container.dataset.fieldName = field.name;
    container.dataset.rosterName = roster.name;
    container.dataset.rowIndex = rowIdx;
    container.dataset.occurrence = occurrence;
    
    // Calculate width based on field length
    const charWidth = TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH;
    const containerWidth = charWidth * tickData.fieldLength + 
        (tickData.fieldLength - 1) * TICK_MARK_CONFIG.GRIDSEP_SIZE + 
        2 * tickData.fieldLength + 4;
    
    container.style.width = containerWidth + 'px';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.height = '20px';
    
    if (showTicks && tickData.fieldLength > 1) {
        // Create tick mark canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'roster-tick-canvas';
        canvas.width = containerWidth;
        canvas.height = 20;
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        `;
        
        // Draw tick marks
        drawTickMarksTransparent(canvas, tickData.fieldLength, {
            decimalPlaces: tickData.decimalPlaces
        });
        
        container.appendChild(canvas);
    }
    
    return container;
}

export default {
    createTickMarkContainer,
    createTickMarkInput,
    attachTickMarksToInput,
    detachTickMarksFromInput,
    createRosterTickMarkCell
};
