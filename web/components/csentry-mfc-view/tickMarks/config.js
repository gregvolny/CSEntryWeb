/**
 * Tick Marks Configuration
 * 
 * Constants and configuration for tick mark rendering.
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
 * @module components/csentry-mfc-view/tickMarks/config
 */

/**
 * Tick mark configuration constants
 * These values match the MFC CSEntry implementation
 */
export const TICK_MARK_CONFIG = {
    // Separator sizes from MFC source
    SEP_SIZE: 1,              // From FormFile.h: constexpr int SEP_SIZE = 1
    GRIDSEP_SIZE: 1,          // From zGrid2O.h: const int GRIDSEP_SIZE = 1
    BORDER_WIDTH: 2,          // From GridCell.cpp: iXB = 2 (border width)
    
    // Character dimensions
    // MFC gets this from dc.GetTextExtent("0", 1) on Courier New
    // Web uses 'Consolas, "Courier New", monospace' at 12px
    DEFAULT_CHAR_WIDTH: 7,    // Measured in browser for 12px Consolas
    DEFAULT_CHAR_HEIGHT: 16,
    
    // Tick mark appearance
    TICK_COLOR: '#000000',           // Black (default pen in MFC)
    DECIMAL_TICK_COLOR: '#000080',   // Dark blue for decimal separator
    TICK_HEIGHT_RATIO: 0.25,         // MFC: iBottom to iBottom - iHeight/4 (1/4 of cell height)
    TICK_LINE_WIDTH: 1,              // 1px line width
    
    // Font for tick mark fields
    FONT_FAMILY: 'Consolas, "Courier New", monospace',
    FONT_SIZE: '12px',
    
    // Colors
    BACKGROUND_COLOR: '#ffffff',     // White background
    TEXT_COLOR: '#000000'            // Black text
};

/**
 * Default configuration for TickMarkManager
 */
export const DEFAULT_CONFIG = {
    charWidth: TICK_MARK_CONFIG.DEFAULT_CHAR_WIDTH,
    charHeight: TICK_MARK_CONFIG.DEFAULT_CHAR_HEIGHT,
    tickColor: TICK_MARK_CONFIG.TICK_COLOR,
    decimalTickColor: TICK_MARK_CONFIG.DECIMAL_TICK_COLOR,
    textColor: TICK_MARK_CONFIG.TEXT_COLOR,
    backgroundColor: TICK_MARK_CONFIG.BACKGROUND_COLOR,
    tickHeightRatio: TICK_MARK_CONFIG.TICK_HEIGHT_RATIO,
    lineWidth: TICK_MARK_CONFIG.TICK_LINE_WIDTH,
    fontFamily: TICK_MARK_CONFIG.FONT_FAMILY,
    fontSize: TICK_MARK_CONFIG.FONT_SIZE
};

export default TICK_MARK_CONFIG;
