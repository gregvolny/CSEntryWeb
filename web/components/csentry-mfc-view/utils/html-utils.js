/**
 * HTML utility functions
 * @module components/csentry-mfc-view/utils/html-utils
 */

/**
 * Escape HTML for safe display
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') {
        text = String(text ?? '');
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Create an HTML element with attributes
 * @param {string} tag - Tag name
 * @param {Object} attrs - Attributes
 * @param {string|HTMLElement|Array} children - Child content
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = null) {
    const el = document.createElement(tag);
    
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('data')) {
            el.dataset[key.slice(4).charAt(0).toLowerCase() + key.slice(5)] = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            el.setAttribute(key, value);
        }
    }
    
    if (children) {
        if (typeof children === 'string') {
            el.textContent = children;
        } else if (children instanceof HTMLElement) {
            el.appendChild(children);
        } else if (Array.isArray(children)) {
            children.forEach(child => {
                if (typeof child === 'string') {
                    el.appendChild(document.createTextNode(child));
                } else if (child instanceof HTMLElement) {
                    el.appendChild(child);
                }
            });
        }
    }
    
    return el;
}

/**
 * Convert CSPro color (integer) to CSS color
 * @param {number} color - CSPro color as integer (RGB)
 * @returns {string} CSS color string
 */
export function csproColorToCss(color) {
    if (!color || color === 0) return '#000000';
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return `rgb(${r},${g},${b})`;
}

/**
 * Convert font data to CSS font string
 * @param {Object} font - CSPro font object
 * @returns {string} CSS font string
 */
export function csproFontToCss(font) {
    if (!font) return "13px 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif";
    
    const weight = font.weight || 400;
    const size = font.size || 13;
    const family = font.family || "'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif";
    
    return `${weight > 400 ? 'bold ' : ''}${size}px ${family}`;
}

/**
 * Modify dialog HTML for web display
 * Adjusts paths, adds base styles, and handles CSPro-specific markup
 * @param {string} html - Original HTML content
 * @param {Object} options - Modification options
 * @param {string} options.basePath - Base path for relative URLs
 * @returns {string} Modified HTML
 */
export function modifyDialogHtml(html, options = {}) {
    if (!html) return '';
    
    let modified = html;
    const basePath = options.basePath || '';
    
    // Fix relative paths for CSS
    modified = modified.replace(/href=["'](?!http|\/\/|data:)([^"']+\.css)["']/gi, (match, path) => {
        if (path.startsWith('/')) return match;
        return `href="${basePath}${path}"`;
    });
    
    // Fix relative paths for images
    modified = modified.replace(/src=["'](?!http|\/\/|data:)([^"']+)["']/gi, (match, path) => {
        if (path.startsWith('/')) return match;
        return `src="${basePath}${path}"`;
    });
    
    // Add viewport meta if not present
    if (!modified.includes('<meta name="viewport"')) {
        modified = modified.replace(/<head>/i, '<head><meta name="viewport" content="width=device-width, initial-scale=1">');
    }
    
    return modified;
}

export default { escapeHtml, createElement, csproColorToCss, csproFontToCss, modifyDialogHtml };
