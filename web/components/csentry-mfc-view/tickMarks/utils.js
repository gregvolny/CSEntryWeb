/**
 * Tick Marks Utility Functions
 * 
 * Helper functions for tick mark calculations and measurements.
 * These match the MFC CSEntry implementation formulas.
 * 
 * @module components/csentry-mfc-view/tickMarks/utils
 */

import { TICK_MARK_CONFIG } from './config.js';

/**
 * Measure the width of character "0" using the same font as tick mark fields
 * This matches MFC's dc.GetTextExtent("0", 1) behavior
 * 
 * @returns {number} Character width in pixels
 */
export function measureCharWidth() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${TICK_MARK_CONFIG.FONT_SIZE} ${TICK_MARK_CONFIG.FONT_FAMILY}`;
    return ctx.measureText('0').width;
}

/**
 * Calculate field width based on MFC formula
 * From GridCell.cpp: iFldWidth = szChar.cx * iLength + (iLength-1)*GRIDSEP_SIZE + 2*iLength + 2*iXB
 * 
 * @param {number} fieldLength - Field length in characters
 * @param {number} [charWidth] - Optional character width in pixels (from measureCharWidth)
 * @returns {number} Width in pixels
 */
export function calculateFieldWidth(fieldLength, charWidth = null) {
    const cw = charWidth || measureCharWidth();
    const { GRIDSEP_SIZE, BORDER_WIDTH } = TICK_MARK_CONFIG;
    return Math.ceil(cw * fieldLength + (fieldLength - 1) * GRIDSEP_SIZE + 2 * fieldLength + 2 * BORDER_WIDTH);
}

/**
 * Calculate X position for a tick mark at a given index
 * MFC formula: x = iLeft + szChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*GRIDSEP_SIZE
 * 
 * @param {number} index - Tick mark index (0-based)
 * @param {number} [charWidth] - Optional character width
 * @param {number} [left] - Optional left offset
 * @returns {number} X position in pixels
 */
export function calculateTickPosition(index, charWidth = null, left = 1) {
    const cw = charWidth || TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH;
    const { GRIDSEP_SIZE } = TICK_MARK_CONFIG;
    return left + cw * (index + 1) + (index + 1) * 2 + index * GRIDSEP_SIZE;
}

/**
 * Get character position from X coordinate (for caret positioning)
 * Inverse of calculateTickPosition formula
 * 
 * @param {number} x - X coordinate relative to field left edge
 * @param {number} fieldLength - Field length
 * @param {number} [charWidth] - Optional character width
 * @returns {number} Character index (0-based)
 */
export function getCharIndexFromX(x, fieldLength, charWidth = null) {
    const cw = charWidth || TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH;
    const { GRIDSEP_SIZE } = TICK_MARK_CONFIG;
    // Approximate inverse of the position formula
    const cellWidth = cw + GRIDSEP_SIZE + 2;
    const index = Math.floor(x / cellWidth);
    return Math.max(0, Math.min(index, fieldLength - 1));
}

/**
 * Get X coordinate for a character position (for text drawing)
 * MFC: iX = rect.left + sizeChar.cx * idx + (2*idx + 1) + idx*SEP_SIZE
 * 
 * @param {number} charIndex - Character index (0-based)
 * @param {number} [charWidth] - Optional character width
 * @param {number} [left] - Optional left offset
 * @returns {number} X coordinate in pixels
 */
export function getXFromCharIndex(charIndex, charWidth = null, left = 1) {
    const cw = charWidth || TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH;
    const { GRIDSEP_SIZE } = TICK_MARK_CONFIG;
    return left + cw * charIndex + (2 * charIndex + 1) + charIndex * GRIDSEP_SIZE;
}

/**
 * Calculate the cell width (character + spacing) for letter-spacing CSS
 * @param {number} [charWidth] - Optional character width
 * @returns {number} Cell gap in pixels
 */
export function calculateCellGap(charWidth = null) {
    const { SEP_SIZE } = TICK_MARK_CONFIG;
    return 2 + SEP_SIZE;  // 3 pixels between characters
}

/**
 * Calculate container dimensions for a tick mark field
 * @param {number} fieldLength - Field length in characters
 * @param {number} [charWidth] - Optional character width
 * @returns {{ width: number, height: number }} Container dimensions
 */
export function calculateContainerDimensions(fieldLength, charWidth = null) {
    const cw = charWidth || measureCharWidth();
    const cellGap = calculateCellGap();
    const cellWidth = cw + cellGap;
    const inputPadding = 3;
    
    return {
        width: Math.ceil(2 + inputPadding + fieldLength * cellWidth + inputPadding),
        height: 20  // Standard height
    };
}

export default {
    measureCharWidth,
    calculateFieldWidth,
    calculateTickPosition,
    getCharIndexFromX,
    getXFromCharIndex,
    calculateCellGap,
    calculateContainerDimensions
};
