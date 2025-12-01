/**
 * CSPro Dialog Handler - Manages native CSPro dialogs (errmsg, select, etc.)
 * @module components/csentry-mfc-view/handlers/dialog-handler
 */

import { escapeHtml } from '../utils/html-utils.js';
import { MB_TYPES, MB_RESULTS } from '../utils/constants.js';

/**
 * DialogHandler class - Manages CSPro dialogs for the component
 */
export class DialogHandler {
    /**
     * Creates a new DialogHandler
     * @param {HTMLElement} dialogOverlay - The overlay element
     * @param {HTMLElement} dialogContainer - The container element
     * @param {Object} options - Options object
     * @param {Function} options.onDialogClose - Callback when dialog closes
     */
    constructor(dialogOverlay, dialogContainer, options = {}) {
        this.dialogOverlay = dialogOverlay;
        this.dialogContainer = dialogContainer;
        this.options = options;
        this._component = null; // Will be set when component attaches
        this._inputData = null;
    }
    
    /**
     * Attach this handler to a component (for backward compat with internal functions)
     * @param {CSEntryMFCView} component - The parent component
     */
    attachComponent(component) {
        this._component = component;
    }
    
    /**
     * Show a named dialog (errmsg, choice, etc.)
     * @param {string} dialogName - Name of the dialog
     * @param {string|Object} inputDataJson - JSON input data string or parsed object
     * @returns {Promise<string|null>} JSON result string
     */
    async showDialogAsync(dialogName, inputDataJson) {
        console.log('[DialogHandler] showDialogAsync:', dialogName);
        try {
            const inputData = typeof inputDataJson === 'string' ? JSON.parse(inputDataJson) : inputDataJson;
            return await this._showNativeDialog(dialogName, inputData);
        } catch (e) {
            console.error('[DialogHandler] showDialogAsync error:', e);
            return null;
        }
    }
    
    /**
     * Show an HTML dialog from a file path
     * @param {string} dialogPath - Path to the HTML dialog file
     * @param {string} inputDataJson - JSON input data
     * @param {string} optionsJson - Display options JSON
     * @returns {Promise<string|null>} JSON result string
     */
    async showHtmlDialogAsync(dialogPath, inputDataJson, optionsJson) {
        console.log('[DialogHandler] showHtmlDialogAsync:', dialogPath);
        try {
            const inputData = typeof inputDataJson === 'string' ? JSON.parse(inputDataJson) : inputDataJson;
            const options = optionsJson ? (typeof optionsJson === 'string' ? JSON.parse(optionsJson) : optionsJson) : {};
            
            // Translate WASM asset paths to web paths
            // /Assets/html/dialogs/errmsg.html -> /dialogs/errmsg.html
            let webPath = dialogPath;
            if (dialogPath.startsWith('/Assets/html/')) {
                webPath = dialogPath.replace('/Assets/html/', '/');
            }
            
            return await this._showIframeDialog(webPath, inputData);
        } catch (e) {
            console.error('[DialogHandler] showHtmlDialogAsync error:', e);
            return null;
        }
    }
    
    /**
     * Show a modal dialog (like Windows MessageBox)
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {number} mbType - MessageBox type
     * @returns {Promise<number>} Button ID
     */
    async showModalDialogAsync(title, message, mbType) {
        console.log('[DialogHandler] showModalDialogAsync:', mbType);
        return await this._showModalDialog(title, message, mbType);
    }
    
    /**
     * Get input data for a dialog
     * @param {string} dialogId - Dialog identifier
     * @returns {Promise<string|null>} JSON input data
     */
    async getInputDataAsync(dialogId) {
        console.log('[DialogHandler] getInputDataAsync:', dialogId);
        if (this._inputData) {
            return JSON.stringify(this._inputData);
        }
        return null;
    }
    
    /**
     * Show a value set selection dialog using native CSPro select.html
     * @param {Object} field - Field data
     * @param {Array} responses - Array of responses
     * @param {string} questionText - Optional question text HTML to display
     * @returns {Promise<string|null>} Selected value code or null if cancelled
     */
    async showValueSetDialog(field, responses, questionText = '', currentValue = '') {
        console.log('[DialogHandler] Showing value set dialog:', field.name, responses.length, 'responses', 'current:', currentValue);
        
        if (!responses || responses.length === 0) {
            return null;
        }
        
        // Use question text if provided, otherwise fall back to label/name
        // If questionText contains a full HTML document (<!doctype or <html>), use field label instead
        let title = questionText || field.label || field.name || 'Select Value';
        if (title && (title.includes('<!doctype') || title.includes('<html>'))) {
            console.log('[DialogHandler] Question text contains full HTML document, using field label instead');
            title = field.label || field.name || 'Select Value';
        }
        console.log('[DialogHandler] Dialog title:', title);
        
        // Find the index of the current value in responses
        let defaultIndex = -1;
        if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
            const currentValueStr = String(currentValue).trim();
            defaultIndex = responses.findIndex(resp => String(resp.code).trim() === currentValueStr);
            console.log('[DialogHandler] Current value:', currentValueStr, 'found at index:', defaultIndex);
        }
        
        // Build input data in the format expected by CSPro choice.html dialog (single selection)
        // Allow direct input only for numeric ComboBox fields (captureType 4)
        const isComboBox = field.captureType === 4;
        const allowDirectInput = isComboBox && field.isNumeric;
        
        const inputData = {
            title: title,
            defaultIndex: defaultIndex >= 0 ? defaultIndex : -1,
            allowDirectInput: allowDirectInput,
            choices: responses.map((resp, idx) => {
                // Build caption with code and label
                const code = String(resp.code);
                const label = resp.label || '';
                const caption = label ? `${code} - ${label}` : code;
                
                return {
                    index: idx,
                    caption: caption
                };
            })
        };
        
        // Add field properties for numeric ComboBox direct input
        if (allowDirectInput) {
            inputData.fieldLength = field.length || field.len || 3;
            inputData.decimalPlaces = field.decimalPlaces ?? field.decimal ?? 0;
            inputData.showTickMarks = true; // Always show tick marks for numeric fields
            inputData.currentValue = currentValue;
        }
        
        console.log('[DialogHandler] showValueSetDialog inputData:', JSON.stringify(inputData, null, 2));
        console.log('[DialogHandler] field.captureType:', field.captureType, 'field.isNumeric:', field.isNumeric);
        
        try {
            // Use native CSPro choice.html dialog (single selection with defaultIndex support)
            const resultJson = await this._showIframeDialog('/dialogs/choice.html', inputData);
            console.log('[DialogHandler] Choice dialog result:', resultJson);
            
            if (resultJson) {
                let result = JSON.parse(resultJson);
                // Handle nested result structure: { result: { index: N } } or { result: { value: "123" } }
                if (result.result) {
                    result = result.result;
                }
                
                // Check if user entered a direct value (for numeric ComboBox)
                if (result.value !== undefined && result.value !== '') {
                    console.log('[DialogHandler] Direct input value:', result.value);
                    return result.value;
                }
                
                // choice.html returns { index: N } or nothing if cancelled
                if (result.index !== undefined && result.index >= 0) {
                    const selectedResp = responses[result.index];
                    console.log('[DialogHandler] Selected index:', result.index, 'response:', selectedResp);
                    if (selectedResp) {
                        return selectedResp.code;
                    }
                }
            }
            return null;
        } catch (e) {
            console.error('[DialogHandler] Choice dialog error:', e);
            return null;
        }
    }
    
    /**
     * Show a checkbox selection dialog using native CSPro select.html with multiple: true
     * This uses the same select.html dialog from CSPro's html/dialogs folder
     * @param {Object} field - Field data with label/name
     * @param {Array} responses - Array of responses with code, label, textColor
     * @param {string} currentValue - Current combined value (e.g., "010203")
     * @param {string} questionText - Optional question text HTML to display
     * @returns {Promise<string|null>} Combined selected codes or null if cancelled
     */
    async showCheckboxSelectionDialog(field, responses, currentValue = '', questionText = '') {
        console.log('[DialogHandler] Showing checkbox selection dialog using native select.html:', field.name, responses.length, 'responses');
        
        if (!responses || responses.length === 0) {
            return null;
        }
        
        // Use question text if provided, otherwise fall back to label/name
        // If questionText contains a full HTML document (<!doctype or <html>), use field label instead
        let title = questionText || field.label || field.name || 'Select Values';
        if (title && (title.includes('<!doctype') || title.includes('<html>'))) {
            console.log('[DialogHandler] Question text contains full HTML document, using field label instead');
            title = field.label || field.name || 'Select Values';
        }
        console.log('[DialogHandler] Checkbox dialog title:', title);
        
        // Build input data in the format expected by CSPro select.html dialog
        // with multiple: true for checkbox/multi-select behavior
        const inputData = {
            title: title,
            header: [
                { caption: '' },  // Code column
                { caption: '' }   // Label column
            ],
            rows: responses.map((resp, idx) => {
                // Convert textColor from int to CSS color
                let textColor = 'inherit';
                if (resp.textColor && resp.textColor !== 0) {
                    const r = (resp.textColor >> 16) & 0xFF;
                    const g = (resp.textColor >> 8) & 0xFF;
                    const b = resp.textColor & 0xFF;
                    textColor = `rgb(${r},${g},${b})`;
                }
                return {
                    index: idx,
                    textColor: textColor,
                    columns: [
                        { text: String(resp.code) },
                        { text: resp.label || '' }
                    ]
                };
            }),
            multiple: true  // Enable multi-select mode (checkbox mode)
        };
        
        try {
            // Use native CSPro select.html dialog with multiple: true
            const resultJson = await this._showIframeDialog('/dialogs/select.html', inputData);
            console.log('[DialogHandler] Checkbox select dialog result:', resultJson);
            
            if (resultJson) {
                let result = JSON.parse(resultJson);
                // Handle nested result structure: { result: { rowIndices: [...] } }
                if (result.result) {
                    result = result.result;
                }
                // select.html with multiple: true returns { rowIndices: [idx1, idx2, ...] }
                if (result.rowIndices && result.rowIndices.length > 0) {
                    // Map row indices back to response codes and concatenate them
                    const selectedCodes = result.rowIndices
                        .map(idx => responses[idx]?.code)
                        .filter(code => code !== undefined)
                        .map(code => String(code));
                    
                    console.log('[DialogHandler] Selected codes:', selectedCodes);
                    
                    // Return concatenated codes (e.g., "010203" for codes 01, 02, 03)
                    return selectedCodes.join('');
                }
            }
            return null;
        } catch (e) {
            console.error('[DialogHandler] Checkbox select dialog error:', e);
            return null;
        }
    }
    
    /**
     * Show a slider dialog for numeric input with min/max range
     * @param {Object} field - Field data with label/name
     * @param {string|number} currentValue - Current value
     * @param {number} minValue - Minimum slider value
     * @param {number} maxValue - Maximum slider value
     * @returns {Promise<string|null>} Selected value or null if cancelled
     */
    async showSliderDialog(field, currentValue = '', minValue = 0, maxValue = 100) {
        console.log('[DialogHandler] Showing slider dialog:', field.name, 'min:', minValue, 'max:', maxValue);
        
        const title = field.label || field.name || 'Select Value';
        const initialValue = currentValue !== '' ? Number(currentValue) : minValue;
        
        return new Promise((resolve) => {
            const dialogHtml = `
                <div class="dialog-slider">
                    <div class="dialog-slider-title">${escapeHtml(title)}</div>
                    <div class="dialog-slider-container">
                        <input type="range" id="dialog-slider-input" 
                               min="${minValue}" max="${maxValue}" value="${initialValue}"
                               style="width: 100%; margin: 20px 0;">
                        <div class="dialog-slider-labels" style="display: flex; justify-content: space-between;">
                            <span>${minValue}</span>
                            <span id="dialog-slider-value" style="font-weight: bold; font-size: 18px;">${initialValue}</span>
                            <span>${maxValue}</span>
                        </div>
                    </div>
                    <div class="dialog-slider-buttons" style="margin-top: 20px; text-align: right;">
                        <button type="button" data-action="cancel" style="margin-right: 10px;">Cancel</button>
                        <button type="button" data-action="ok" class="default-button">OK</button>
                    </div>
                </div>
            `;
            
            this.dialogContainer.innerHTML = dialogHtml;
            this.dialogOverlay.style.display = 'block';
            
            const slider = this.dialogContainer.querySelector('#dialog-slider-input');
            const valueDisplay = this.dialogContainer.querySelector('#dialog-slider-value');
            
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
            
            const closeWithResult = (value) => {
                this.dialogOverlay.style.display = 'none';
                this.dialogContainer.innerHTML = '';
                if (this.options.onDialogClose) {
                    this.options.onDialogClose();
                }
                resolve(value);
            };
            
            this.dialogContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn) {
                    if (btn.dataset.action === 'ok') {
                        closeWithResult(slider.value);
                    } else {
                        closeWithResult(null);
                    }
                }
            });
            
            slider.focus();
        });
    }
    
    /**
     * Show a date picker dialog
     * @param {Object} field - Field data with label/name
     * @param {string} currentValue - Current date value (YYYYMMDD format)
     * @returns {Promise<string|null>} Selected date in YYYYMMDD format or null if cancelled
     */
    async showDateDialog(field, currentValue = '') {
        console.log('[DialogHandler] Showing date dialog:', field.name);
        
        const title = field.label || field.name || 'Select Date';
        
        // Parse current value (YYYYMMDD) to HTML date format (YYYY-MM-DD)
        let htmlDateValue = '';
        if (currentValue && currentValue.length === 8) {
            htmlDateValue = `${currentValue.substr(0, 4)}-${currentValue.substr(4, 2)}-${currentValue.substr(6, 2)}`;
        } else if (currentValue && currentValue.includes('-')) {
            htmlDateValue = currentValue;
        }
        
        return new Promise((resolve) => {
            const dialogHtml = `
                <div class="dialog-date">
                    <div class="dialog-date-title">${escapeHtml(title)}</div>
                    <div class="dialog-date-container" style="margin: 20px 0;">
                        <input type="date" id="dialog-date-input" value="${htmlDateValue}"
                               style="font-size: 16px; padding: 8px; width: 100%; box-sizing: border-box;">
                    </div>
                    <div class="dialog-date-buttons" style="margin-top: 20px; text-align: right;">
                        <button type="button" data-action="cancel" style="margin-right: 10px;">Cancel</button>
                        <button type="button" data-action="ok" class="default-button">OK</button>
                    </div>
                </div>
            `;
            
            this.dialogContainer.innerHTML = dialogHtml;
            this.dialogOverlay.style.display = 'block';
            
            const dateInput = this.dialogContainer.querySelector('#dialog-date-input');
            
            const closeWithResult = (value) => {
                this.dialogOverlay.style.display = 'none';
                this.dialogContainer.innerHTML = '';
                if (this.options.onDialogClose) {
                    this.options.onDialogClose();
                }
                resolve(value);
            };
            
            this.dialogContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn) {
                    if (btn.dataset.action === 'ok' && dateInput.value) {
                        // Convert HTML date (YYYY-MM-DD) back to CSPro format (YYYYMMDD)
                        const csproDate = dateInput.value.replace(/-/g, '');
                        closeWithResult(csproDate);
                    } else if (btn.dataset.action === 'cancel') {
                        closeWithResult(null);
                    }
                }
            });
            
            dateInput.focus();
        });
    }
    
    /**
     * Show a simple message dialog
     * @param {Object} inputData - Dialog input data
     * @returns {Promise<string>} JSON result string
     */
    showSimpleMessageDialog(inputData) {
        return new Promise((resolve) => {
            let { message, title, buttons, defaultButtonIndex } = inputData;
            
            // Extract message number from message if it's in "0020: Message text" format
            let messageNumber = null;
            if (message && typeof message === 'string') {
                const match = message.match(/^(\d{4}):\s*/);
                if (match) {
                    messageNumber = match[1];
                    message = message.substring(match[0].length);
                }
            }
            
            let buttonsHtml = '';
            if (buttons && buttons.length > 0) {
                buttonsHtml = buttons.map((btn, i) => 
                    `<button type="button" class="${(i + 1) === defaultButtonIndex ? 'default-button' : ''}" 
                             data-index="${btn.index}">${escapeHtml(btn.caption)}</button>`
                ).join('');
            } else {
                buttonsHtml = '<button type="button" class="default-button" data-index="1">OK</button>';
            }
            
            const dialogHtml = `
                <div class="dialog-message">
                    ${title ? `<div class="dialog-message-title">${escapeHtml(title)}</div>` : ''}
                    <div class="dialog-message-text">${messageNumber ? `<strong>${escapeHtml(messageNumber)}:</strong> ` : ''}${escapeHtml(message || '')}</div>
                    <div class="dialog-message-buttons">${buttonsHtml}</div>
                </div>
            `;
            
            this.dialogContainer.innerHTML = dialogHtml;
            this.dialogOverlay.style.display = 'block';
            
            const closeWithResult = (index) => {
                this.dialogOverlay.style.display = 'none';
                this.dialogContainer.innerHTML = '';
                if (this.options.onDialogClose) {
                    this.options.onDialogClose();
                }
                resolve(JSON.stringify({ index }));
            };
            
            this.dialogContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn) {
                    closeWithResult(parseInt(btn.dataset.index, 10));
                }
            });
            
            // Focus default button
            const defaultBtn = this.dialogContainer.querySelector('.default-button');
            if (defaultBtn) defaultBtn.focus();
        });
    }
    
    /**
     * Show a native CSPro dialog by name
     * @private
     * @param {string} dialogName - Dialog name
     * @param {Object} inputData - Input data
     * @returns {Promise<string|null>} JSON result
     */
    async _showNativeDialog(dialogName, inputData) {
        console.log('[DialogHandler] _showNativeDialog:', dialogName, inputData);
        
        // Map special dialog names to generic templates
        let templateName = dialogName;
        if (dialogName === 'OperatorID') {
            templateName = 'text-input';
            // Ensure input data has correct structure for text-input
            if (!inputData.title) inputData.title = 'Operator ID';
        }
        
        // Use absolute path from web root
        const dialogPath = `/dialogs/${templateName}.html`;
        return await this._showIframeDialog(dialogPath, inputData);
    }
    
    /**
     * Show a dialog by loading its HTML in an iframe
     * Uses real iframe src with postMessage for data passing to avoid COEP issues
     * @private
     * @param {string} dialogPath - Path to dialog HTML
     * @param {Object} inputData - Input data
     * @returns {Promise<string|null>} JSON result
     */
    async _showIframeDialog(dialogPath, inputData) {
        return new Promise((resolve) => {
            console.log('[DialogHandler] Loading iframe dialog:', dialogPath, 'with data:', inputData);
            
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'cspro-dialog-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;
            
            // Create iframe with real src (not srcdoc) to avoid COEP issues
            const iframe = document.createElement('iframe');
            iframe.className = 'cspro-dialog-iframe';
            iframe.style.cssText = `
                border: none;
                background: white;
                border-radius: 4px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                max-width: 90vw;
                max-height: 90vh;
                min-width: 300px;
                min-height: 150px;
                width: 400px;
                height: 200px;
            `;
            
            // Cleanup function
            const cleanup = () => {
                window.removeEventListener('message', messageHandler);
                document.removeEventListener('keydown', keyHandler);
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                if (this.options.onDialogClose) {
                    this.options.onDialogClose();
                }
            };
            
            // Listen for messages from iframe
            const messageHandler = (event) => {
                // Log all messages for debugging
                console.log('[DialogHandler] Message received:', event.data, 
                    'from source:', event.source === iframe.contentWindow ? 'our iframe' : 'other');
                
                // Check for our dialog messages - be more lenient with source check
                // Some browsers may have issues with strict source comparison
                if (!event.data || !event.data.type) {
                    return; // Not our message
                }
                
                // Accept message if source matches OR if it's from an iframe we created
                const isOurMessage = (event.source === iframe.contentWindow) || 
                                     (event.origin === window.location.origin);
                
                if (!isOurMessage && event.data.type.startsWith('cspro-')) {
                    console.log('[DialogHandler] Message from unknown source but has cspro type - accepting');
                }
                
                if (event.data.type === 'cspro-dialog-ready') {
                    // Dialog loaded and ready, send input data
                    console.log('[DialogHandler] Dialog ready, sending input data');
                    iframe.contentWindow.postMessage({
                        type: 'cspro-dialog-init',
                        inputData: inputData,
                        accessToken: ''
                    }, '*');
                } else if (event.data.type === 'cspro-dialog-close') {
                    console.log('[DialogHandler] Dialog closed with result:', event.data.result);
                    cleanup();
                    // Extract the actual result - WASM expects { index: N } directly
                    // Dialog HTML sends { result: { index: N } }, so we need to unwrap it
                    let result = event.data.result || { index: 1 };
                    
                    // Unwrap nested result object if present
                    // The action invoker typically wraps the return value in a 'result' property
                    if (result && typeof result === 'object' && result.result) {
                        result = result.result;
                    }
                    
                    resolve(JSON.stringify(result));
                } else if (event.data.type === 'cspro-dialog-resize') {
                    const { width, height } = event.data;
                    if (width) iframe.style.width = `${Math.min(width + 20, window.innerWidth * 0.9)}px`;
                    if (height) iframe.style.height = `${Math.min(height + 20, window.innerHeight * 0.9)}px`;
                }
            };
            window.addEventListener('message', messageHandler);
            
            // Handle ESC key
            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(JSON.stringify({ cancelled: true }));
                }
            };
            document.addEventListener('keydown', keyHandler);
            
            // Load dialog with real URL (use web version of action-invoker)
            // Convert dialog path to use web action invoker
            // The dialog HTML uses /action-invoker.js which we'll intercept
            const webDialogPath = dialogPath.includes('?') 
                ? `${dialogPath}&web=1` 
                : `${dialogPath}?web=1`;
            
            iframe.src = webDialogPath;
            overlay.appendChild(iframe);
            document.body.appendChild(overlay);
            
            // Fallback timeout - if dialog doesn't respond in 30 seconds
            setTimeout(() => {
                if (overlay.parentNode) {
                    console.warn('[DialogHandler] Dialog timeout, auto-closing');
                    cleanup();
                    resolve(JSON.stringify({ index: 1 }));
                }
            }, 30000);
        });
    }
    
    /**
     * Modify dialog HTML to inject web-based action invoker
     * @private
     * @param {string} html - Original HTML
     * @param {Object} inputData - Input data
     * @returns {string} Modified HTML
     */
    _modifyDialogHtml(html, inputData) {
        const webActionInvokerScript = `
<script>
(function() {
    const __inputData = ${JSON.stringify(inputData)};
    const __displayOptions = {};
    
    class CSProActionInvoker {
        constructor(accessToken) {
            this.accessToken = accessToken;
            this.UI = {
                alert: function(args) {
                    if (typeof args === 'string') alert(args);
                    else if (args && args.message) alert(args.message);
                    return null;
                },
                closeDialog: function(args) {
                    window.parent.postMessage({
                        type: 'cspro-dialog-close',
                        result: args
                    }, '*');
                    return null;
                },
                closeDialogAsync: function(args) {
                    this.closeDialog(args);
                    return Promise.resolve(null);
                },
                getDisplayOptions: function() { return __displayOptions; },
                getDisplayOptionsAsync: function() { return Promise.resolve(__displayOptions); },
                getInputData: function() { return __inputData; },
                getInputDataAsync: function() { return Promise.resolve(__inputData); },
                getMaxDisplayDimensions: function() {
                    return { 
                        width: Math.min(window.innerWidth || 800, 800), 
                        height: Math.min(window.innerHeight || 600, 600)
                    };
                },
                setDisplayOptions: function(args) {
                    Object.assign(__displayOptions, args);
                    if (args.width || args.height) {
                        window.parent.postMessage({
                            type: 'cspro-dialog-resize',
                            width: args.width,
                            height: args.height
                        }, '*');
                    }
                    return null;
                }
            };
        }
        getWindowForEventListener() { return window; }
    }
    
    window.CSProActionInvoker = CSProActionInvoker;
})();
</script>
`;
        
        // Remove original action-invoker.js
        let modifiedHtml = html.replace(
            /<script\s+src=["'][^"']*action-invoker\.js["'][^>]*><\/script>/gi,
            '<!-- action-invoker.js replaced -->'
        );
        
        // Get full origin URL for absolute paths in srcdoc iframe
        const origin = window.location.origin;
        const dialogsBaseUrl = `${origin}/dialogs/`;
        
        // Fix resource paths - convert root-relative to absolute URLs
        modifiedHtml = modifiedHtml.replace(/href=(["'])\/external\//g, `href=$1${dialogsBaseUrl}external/`);
        modifiedHtml = modifiedHtml.replace(/src=(["'])\/external\//g, `src=$1${dialogsBaseUrl}external/`);
        modifiedHtml = modifiedHtml.replace(/href=(["'])\/css\//g, `href=$1${dialogsBaseUrl}css/`);
        modifiedHtml = modifiedHtml.replace(/src=(["'])\/css\//g, `src=$1${dialogsBaseUrl}css/`);
        modifiedHtml = modifiedHtml.replace(/src=(["'])\/action-invoker\.js["']/g, '<!-- action-invoker.js removed -->');
        
        // Inject script and base href
        if (modifiedHtml.includes('<head>')) {
            modifiedHtml = modifiedHtml.replace(
                '<head>',
                `<head><base href="${dialogsBaseUrl}">${webActionInvokerScript}`
            );
        } else {
            modifiedHtml = webActionInvokerScript + modifiedHtml;
        }
        
        return modifiedHtml;
    }
    
    /**
     * Show a modal dialog (MessageBox style)
     * @private
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {number} mbType - MessageBox type
     * @returns {Promise<number>} Button ID
     */
    async _showModalDialog(title, message, mbType) {
        let buttons;
        
        switch (mbType & 0x0F) {
            case MB_TYPES.MB_OK:
                buttons = [{ caption: 'OK', index: MB_RESULTS.IDOK }];
                break;
            case MB_TYPES.MB_OKCANCEL:
                buttons = [
                    { caption: 'OK', index: MB_RESULTS.IDOK }, 
                    { caption: 'Cancel', index: MB_RESULTS.IDCANCEL }
                ];
                break;
            case MB_TYPES.MB_YESNO:
                buttons = [
                    { caption: 'Yes', index: MB_RESULTS.IDYES }, 
                    { caption: 'No', index: MB_RESULTS.IDNO }
                ];
                break;
            case MB_TYPES.MB_YESNOCANCEL:
                buttons = [
                    { caption: 'Yes', index: MB_RESULTS.IDYES }, 
                    { caption: 'No', index: MB_RESULTS.IDNO },
                    { caption: 'Cancel', index: MB_RESULTS.IDCANCEL }
                ];
                break;
            default:
                buttons = [{ caption: 'OK', index: MB_RESULTS.IDOK }];
        }
        
        const resultJson = await this.showSimpleMessageDialog({ title, message, buttons });
        
        try {
            const result = JSON.parse(resultJson);
            return result.index ?? MB_RESULTS.IDOK;
        } catch (e) {
            return MB_RESULTS.IDOK;
        }
    }
}

/**
 * Creates a dialog handler for the CSEntry component (factory function for backward compatibility)
 * @param {CSEntryMFCView} component - The parent component
 * @returns {DialogHandler} Dialog handler instance
 */
export function createDialogHandler(component) {
    const handler = new DialogHandler(
        component.$.dialogOverlay,
        component.$.dialogContainer,
        { onDialogClose: () => {} }
    );
    handler.attachComponent(component);
    return handler;
}

export default { DialogHandler, createDialogHandler };
