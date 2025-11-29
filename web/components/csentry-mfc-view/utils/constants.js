/**
 * Capture type constants
 * @module components/csentry-mfc-view/utils/constants
 */

/**
 * CSPro capture type enumeration
 * Matches CaptureType enum from CSPro source
 */
export const CAPTURE_TYPES = {
    TextBox: 0,
    RadioButton: 1,
    CheckBox: 2,
    DropDown: 3,
    ComboBox: 4,
    Date: 5,           // Was incorrectly 7
    NumberPad: 6,      // Was incorrectly 5
    Barcode: 7,        // Was incorrectly BarcodeScan: 8
    Slider: 8,         // Was incorrectly 6
    ToggleButton: 9,   // Was Toggle
    Photo: 10,         // Was PhotoCapture
    Signature: 11,     // Was SignatureCapture
    Audio: 12          // Was AudioCapture
};

/**
 * Free movement modes for rosters
 * Matches FreeMovement enum from zFormO/Definitions.h
 */
export const FREE_MOVEMENT = {
    Disabled: 0,
    Horizontal: 1,
    Vertical: 2
};

/**
 * Roster orientation
 */
export const ROSTER_ORIENTATION = {
    Horizontal: 1,
    Vertical: 2
};

/**
 * MessageBox types (Windows API)
 */
export const MB_TYPES = {
    MB_OK: 0,
    MB_OKCANCEL: 1,
    MB_ABORTRETRYIGNORE: 2,
    MB_YESNOCANCEL: 3,
    MB_YESNO: 4,
    MB_RETRYCANCEL: 5
};

/**
 * MessageBox return values
 */
export const MB_RESULTS = {
    IDOK: 1,
    IDCANCEL: 2,
    IDABORT: 3,
    IDRETRY: 4,
    IDIGNORE: 5,
    IDYES: 6,
    IDNO: 7
};

/**
 * Field state colors (MFC CSEntry defaults)
 */
export const FIELD_COLORS = {
    unvisited: '#ffffff',    // White
    current: '#ffffff',      // White (same as unvisited)
    visited: '#00ff00',      // Green RGB(0,255,0)
    skipped: '#808080',      // Gray RGB(128,128,128)
    skippedPathOff: '#ffff00', // Yellow (when path is off)
    protected: '#c0c0c0'     // Button face gray
};

/**
 * Tick mark configuration
 * Ported from MFC source (zFormO/FormFile.h, zGrid2O/zGrid2O.h, DEEdit.cpp, GridWnd.cpp)
 * 
 * MFC Tick Mark Formula:
 *   x = rect.left + sizeChar.cx * (iIndex+1) + (iIndex+1)*2 + iIndex*SEP_SIZE
 * 
 * Where:
 *   - sizeChar.cx = character width from GetTextExtent("0", 1)
 *   - SEP_SIZE/GRIDSEP_SIZE = 1 (tick separator size)
 *   - iIndex = 0 to length-2 (length-1 tick marks between characters)
 * 
 * Character position (for text drawing):
 *   iX = rect.left + sizeChar.cx * (iIndex) + (2*iIndex + 1) + iIndex*SEP_SIZE
 */
export const TICK_MARK_CONFIG = {
    SEP_SIZE: 1,              // From FormFile.h: constexpr int SEP_SIZE = 1
    GRIDSEP_SIZE: 1,          // From zGrid2O.h: const int GRIDSEP_SIZE = 1
    BORDER_WIDTH: 2,          // From GridCell.cpp: iXB = 2 (border width)
    
    // Character dimensions - these should match the font used
    // MFC gets this from dc.GetTextExtent("0", 1) on Courier New
    // Web uses 'Consolas, "Courier New", monospace' at 12px
    DEFAULT_CHAR_WIDTH: 7,    // Measured in browser for 12px Consolas
    DEFAULT_CHAR_HEIGHT: 16,
    
    // Tick mark appearance
    TICK_COLOR: '#000000',        // Black (default pen in MFC)
    TICK_HEIGHT_RATIO: 0.25,      // MFC: iBottom to iBottom - iHeight/4 (1/4 of cell height)
    
    // Font for tick mark fields
    FONT_FAMILY: 'Consolas, "Courier New", monospace',
    FONT_SIZE: '12px'
};

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
 * @param {number} charWidth - Character width in pixels (from measureCharWidth)
 * @returns {number} Width in pixels
 */
export function calculateFieldWidth(fieldLength, charWidth = null) {
    const cw = charWidth || measureCharWidth();
    const { GRIDSEP_SIZE, BORDER_WIDTH } = TICK_MARK_CONFIG;
    return Math.ceil(cw * fieldLength + (fieldLength - 1) * GRIDSEP_SIZE + 2 * fieldLength + 2 * BORDER_WIDTH);
}

export default { 
    CAPTURE_TYPES, 
    FREE_MOVEMENT, 
    ROSTER_ORIENTATION, 
    MB_TYPES, 
    MB_RESULTS,
    FIELD_COLORS,
    TICK_MARK_CONFIG,
    measureCharWidth,
    calculateFieldWidth
};
