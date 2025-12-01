/**
 * Tick Marks Module - Entry Point
 * 
 * This module provides tick mark rendering for CSPro data entry fields.
 * Tick marks are the small vertical lines drawn between character positions
 * in numeric and certain alpha fields (matching MFC CSEntry behavior).
 * 
 * IMPORTANT: All tick mark rendering MUST get data from the WASM engine.
 * The engine provides the following tick mark related properties:
 * - field.tickmarks: boolean - Whether to show tick marks (server-computed)
 * - field.isNumeric: boolean - Numeric fields always show tick marks
 * - field.captureType: number - TextBox capture type = no tick marks for alpha
 * - field.isArabic/rtl: boolean - Arabic fonts = no tick marks
 * 
 * @module components/csentry-mfc-view/tickMarks
 */

// Export configuration
export { TICK_MARK_CONFIG, DEFAULT_CONFIG } from './config.js';

// Export utility functions
export { 
    measureCharWidth, 
    calculateFieldWidth,
    calculateTickPosition,
    getCharIndexFromX,
    getXFromCharIndex
} from './utils.js';

// Export logic for determining if tick marks should show
export { shouldShowTickMarks, getTickMarkDataFromEngine } from './logic.js';

// Export canvas rendering functions
export { 
    drawTickMarks,
    drawTickMarksTransparent,
    drawTickMarksWithLetterSpacing,
    createTickMarkCanvas,
    clearTickMarkCanvas
} from './canvas-renderer.js';

// Export DOM element creators
export {
    createTickMarkContainer,
    createTickMarkInput,
    attachTickMarksToInput,
    detachTickMarksFromInput
} from './dom-elements.js';

// Export TickMarkManager class
export { TickMarkManager, createTickMarkManager } from './manager.js';

// Export CSS styles
export { getTickMarkStyles, getActiveTickMarkStyles } from './styles.js';
