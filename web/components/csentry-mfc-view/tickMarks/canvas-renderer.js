/**
 * Tick Marks Canvas Renderer
 * 
 * Functions for drawing tick marks on HTML canvas elements.
 * Port of MFC DEEdit::OnPaint() and GridWnd::OnPaint() tick mark drawing.
 * 
 * MFC Formula from GridWnd.cpp lines 299-310:
 *   for (int iIndex=0; iIndex < iLength-1; iIndex++) {
 *       dc.MoveTo(iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE, iBottom);
 *       dc.LineTo(iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE, iBottom-iHeight/4);
 *   }
 * 
 * @module components/csentry-mfc-view/tickMarks/canvas-renderer
 */

import { TICK_MARK_CONFIG } from './config.js';
import { calculateTickPosition } from './utils.js';

/**
 * Draw tick marks on a canvas with white background
 * Used for standalone tick mark fields
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {number} fieldLength - Number of characters in field
 * @param {Object} [options] - Drawing options
 * @param {number} [options.decimalPlaces=0] - Decimal places for numeric fields
 * @param {number} [options.charWidth] - Character width override
 * @param {string} [options.tickColor] - Tick mark color override
 */
export function drawTickMarks(canvas, fieldLength, options = {}) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const {
        decimalPlaces = 0,
        charWidth = TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH,
        tickColor = TICK_MARK_CONFIG.TICK_COLOR,
        decimalTickColor = TICK_MARK_CONFIG.DECIMAL_TICK_COLOR
    } = options;
    
    // Clear and fill background (white like MFC)
    ctx.fillStyle = TICK_MARK_CONFIG.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);
    
    // Draw the tick marks
    drawTickMarksCore(ctx, width, height, fieldLength, {
        decimalPlaces,
        charWidth,
        tickColor,
        decimalTickColor
    });
}

/**
 * Draw tick marks on a canvas with TRANSPARENT background
 * Used when canvas is overlaid on input element
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {number} fieldLength - Number of characters in field
 * @param {Object} [options] - Drawing options
 */
export function drawTickMarksTransparent(canvas, fieldLength, options = {}) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const {
        decimalPlaces = 0,
        charWidth = TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH,
        tickColor = TICK_MARK_CONFIG.TICK_COLOR,
        decimalTickColor = TICK_MARK_CONFIG.DECIMAL_TICK_COLOR
    } = options;
    
    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, width, height);
    
    // Draw the tick marks
    drawTickMarksCore(ctx, width, height, fieldLength, {
        decimalPlaces,
        charWidth,
        tickColor,
        decimalTickColor
    });
}

/**
 * Core tick mark drawing logic
 * @private
 */
function drawTickMarksCore(ctx, width, height, fieldLength, options) {
    const {
        decimalPlaces = 0,
        charWidth = TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH,
        tickColor = TICK_MARK_CONFIG.TICK_COLOR,
        decimalTickColor = TICK_MARK_CONFIG.DECIMAL_TICK_COLOR
    } = options;
    
    // MFC variables
    const iLeft = 1;  // rcFld.left + 1 (account for left border)
    const iBottom = height - 1;  // rcFld.bottom - 1 (account for bottom border)
    const iHeight = height - 2;  // rcFld.Height() - 2 (account for border)
    
    // Tick marks are drawn from iBottom to iBottom - iHeight/4 (short lines at bottom)
    // Ensure tick height is reasonable (3-6px)
    let tickHeight = Math.floor(iHeight / 4);
    if (tickHeight < 3) tickHeight = 3;
    if (tickHeight > 6) tickHeight = 6;
    
    const tickTop = iBottom - tickHeight;
    
    // No tick marks needed for single character fields
    if (fieldLength <= 1) {
        return;
    }
    
    // Draw tick marks BETWEEN characters (iLength-1 tick marks)
    for (let iIndex = 0; iIndex < fieldLength - 1; iIndex++) {
        // Calculate x position using MFC formula
        const x = calculateTickPosition(iIndex, charWidth, iLeft);
        
        // Highlight decimal position with different color
        const isDecimalPosition = decimalPlaces > 0 && 
            iIndex === fieldLength - decimalPlaces - 1;
        
        if (isDecimalPosition) {
            ctx.strokeStyle = decimalTickColor;
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = 1;
        }
        
        // Draw vertical tick mark line from bottom to tickTop
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, iBottom);  // +0.5 for crisp 1px line
        ctx.lineTo(Math.floor(x) + 0.5, tickTop);
        ctx.stroke();
    }
}

/**
 * Create a canvas element for tick marks
 * 
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @param {string} [className='tick-mark-canvas'] - CSS class name
 * @returns {HTMLCanvasElement} Canvas element
 */
export function createTickMarkCanvas(width, height, className = 'tick-mark-canvas') {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 1;
    `;
    return canvas;
}

/**
 * Clear a tick mark canvas
 * 
 * @param {HTMLCanvasElement} canvas - Canvas to clear
 * @param {boolean} [transparent=true] - Whether to leave transparent or fill white
 */
export function clearTickMarkCanvas(canvas, transparent = true) {
    const ctx = canvas.getContext('2d');
    if (transparent) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = TICK_MARK_CONFIG.BACKGROUND_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Draw tick marks for browser-rendered text with letter-spacing
 * This variant accounts for CSS letter-spacing on the input
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} fieldLength - Number of characters
 * @param {number} charWidth - Character width
 * @param {number} letterSpacing - CSS letter-spacing value
 * @param {number} inputPadding - Input padding value
 */
export function drawTickMarksWithLetterSpacing(canvas, fieldLength, charWidth, letterSpacing, inputPadding) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas (transparent)
    ctx.clearRect(0, 0, width, height);
    
    // Calculate tick positions based on character width + letter-spacing
    const cellWidth = charWidth + letterSpacing;
    
    // Ensure tick height is reasonable (3-6px)
    let tickHeight = Math.floor(height / 4);
    if (tickHeight < 3) tickHeight = 3;
    if (tickHeight > 6) tickHeight = 6;
    
    const tickBottom = height - 1;
    const tickTop = tickBottom - tickHeight;
    
    ctx.strokeStyle = TICK_MARK_CONFIG.TICK_COLOR;
    ctx.lineWidth = 1;
    
    // Draw tick marks between character positions
    for (let i = 0; i < fieldLength - 1; i++) {
        // Position after each character (1 = left border/padding)
        const x = 1 + inputPadding + (i + 1) * cellWidth;
        
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, tickBottom);
        ctx.lineTo(Math.floor(x) + 0.5, tickTop);
        ctx.stroke();
    }
}

export default {
    drawTickMarks,
    drawTickMarksTransparent,
    createTickMarkCanvas,
    clearTickMarkCanvas,
    drawTickMarksWithLetterSpacing
};
