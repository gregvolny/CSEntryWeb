/**
 * CSS styles for CSEntry MFC View component
 * @module components/csentry-mfc-view/styles
 */

/**
 * Get complete styles for the MFC view component
 * @returns {string} CSS styles
 */
export function getStyles() {
    return `
        ${getBaseStyles()}
        ${getMenuStyles()}
        ${getToolbarStyles()}
        ${getTreeStyles()}
        ${getFormStyles()}
        ${getFieldStyles()}
        ${getRosterStyles()}
        ${getCapiStyles()}
        ${getDialogStyles()}
        ${getStatusBarStyles()}
        ${getAppLoaderStyles()}
    `;
}

function getBaseStyles() {
    return `
        :host {
            display: block;
            width: 100%;
            height: 100%;
            /* CSEntry MFC exact colors from FieldColors.cpp */
            --mfc-window-bg: #f0f0f0;
            --mfc-form-bg: #c0c0c0;
            --mfc-field-bg: #ffffff;
            --mfc-field-current: #ffffff;
            --mfc-field-visited: #00ff00;
            --mfc-field-skipped: #808080;
            --mfc-field-skipped-pathoff: #ffff00;
            --mfc-field-protected: #c0c0c0;
            --mfc-border: #808080;
            --mfc-btn-face: #d4d0c8;
            --mfc-text: #000000;
            --mfc-selection: #0078d7;
            --mfc-selection-text: #ffffff;
        }

        * { box-sizing: border-box; }

        .mfc-app {
            display: flex;
            flex-direction: column;
            height: 100%;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            font-size: 13px;
            color: var(--mfc-text);
            background: var(--mfc-window-bg);
        }

        .btn {
            padding: 6px 16px;
            border: 1px solid var(--mfc-border);
            background: var(--mfc-btn-face);
            cursor: pointer;
            font-size: 12px;
        }
        
        .btn:hover {
            background: #e0e0e0;
        }
        
        .btn-primary {
            background: var(--mfc-selection);
            color: white;
            border-color: #005a9e;
        }
        
        .btn-primary:hover {
            background: #005a9e;
        }
    `;
}

function getMenuStyles() {
    return `
        .mfc-menubar {
            display: flex;
            height: 24px;
            background: var(--mfc-window-bg);
            border-bottom: 1px solid var(--mfc-border);
            padding: 0 4px;
        }

        .menu-item {
            padding: 2px 10px;
            cursor: pointer;
            user-select: none;
            position: relative;
        }

        .menu-item:hover {
            background: var(--mfc-selection);
            color: var(--mfc-selection-text);
        }
        
        .menu-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 200px;
            background: white;
            border: 1px solid var(--mfc-border);
            box-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            z-index: 1000;
            padding: 2px 0;
        }
        
        .menu-item:hover .menu-dropdown,
        .menu-item.open .menu-dropdown {
            display: block;
        }
        
        .menu-dropdown-item {
            display: flex;
            align-items: center;
            padding: 4px 24px 4px 8px;
            cursor: pointer;
            color: var(--mfc-text);
            white-space: nowrap;
        }
        
        .menu-dropdown-item .menu-text {
            flex: 1;
        }
        
        .menu-dropdown-item .menu-shortcut {
            margin-left: 24px;
            color: #666;
        }
        
        .menu-dropdown-item:hover {
            background: var(--mfc-selection);
            color: white;
        }
        
        .menu-dropdown-sep {
            height: 1px;
            background: var(--mfc-border);
            margin: 4px 0;
        }
        
        .menu-label {
            cursor: pointer;
        }
        
        .menu-label u {
            text-decoration: underline;
        }
        
        .menu-check {
            display: inline-block;
            width: 16px;
            margin-right: 4px;
            text-align: center;
        }
        
        .menu-dropdown-item.checkable .menu-check:empty::before {
            content: '';
        }
    `;
}

function getToolbarStyles() {
    return `
        .mfc-toolbar {
            display: flex;
            height: 32px;
            background: linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%);
            border-bottom: 1px solid var(--mfc-border);
            padding: 2px 4px;
            gap: 2px;
            align-items: center;
        }

        .toolbar-btn {
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid transparent;
            background: transparent;
            cursor: pointer;
            border-radius: 2px;
            font-size: 14px;
        }

        .toolbar-btn:hover {
            border-color: var(--mfc-border);
            background: white;
        }

        .toolbar-btn:active {
            background: var(--mfc-btn-face);
        }
        
        .toolbar-btn:disabled {
            opacity: 0.5;
            cursor: default;
        }
        
        .toolbar-icon {
            font-size: 14px;
            line-height: 1;
        }

        .toolbar-sep {
            width: 1px;
            height: 22px;
            background: var(--mfc-border);
            margin: 0 4px;
        }
        
        .app-name {
            font-size: 12px;
            font-weight: 600;
            color: #333;
            padding: 0 8px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;
}

function getTreeStyles() {
    return `
        .mfc-main {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        .mfc-tree-panel {
            width: 250px;
            min-width: 150px;
            max-width: 400px;
            background: white;
            border-right: 1px solid var(--mfc-border);
            display: flex;
            flex-direction: column;
        }

        .panel-header {
            padding: 6px 8px;
            background: linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%);
            border-bottom: 1px solid var(--mfc-border);
            font-weight: 600;
            font-size: 11px;
        }

        .tree-content {
            flex: 1;
            overflow: auto;
            padding: 4px 0;
        }

        .tree-node {
            user-select: none;
        }

        .tree-node-header {
            display: flex;
            align-items: center;
            padding: 2px 4px;
            cursor: pointer;
            min-height: 22px;
        }

        .tree-node-header:hover {
            background: #e5f3ff;
        }

        .tree-node-header.selected {
            background: var(--mfc-selection);
            color: var(--mfc-selection-text);
        }

        .tree-toggle {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
        }

        .tree-toggle::before { content: '▶'; }
        .tree-node.expanded > .tree-node-header .tree-toggle::before {
            transform: rotate(90deg);
        }
        .tree-toggle.empty::before { content: ''; }

        .tree-icon {
            width: 16px;
            height: 16px;
            margin-right: 4px;
            font-size: 12px;
        }

        .tree-label {
            flex: 1;
            font-size: 11px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .tree-value {
            margin-left: 8px;
            font-family: 'Consolas', monospace;
            font-size: 11px;
            color: #666;
        }

        .tree-children {
            padding-left: 16px;
            display: none;
        }

        .tree-node.expanded > .tree-children {
            display: block;
        }

        .mfc-splitter {
            width: 5px;
            background: var(--mfc-btn-face);
            cursor: col-resize;
        }

        .mfc-splitter:hover {
            background: var(--mfc-selection);
        }
    `;
}

function getFormStyles() {
    return `
        .mfc-form-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--mfc-form-bg);
        }

        .form-header {
            padding: 4px 8px;
            background: linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%);
            border-bottom: 1px solid var(--mfc-border);
            font-weight: 600;
            font-size: 11px;
            display: flex;
            justify-content: space-between;
        }

        .form-tabs {
            display: flex;
            gap: 2px;
            padding: 0 4px;
            background: var(--mfc-btn-face);
            border-bottom: 1px solid var(--mfc-border);
        }

        .form-tab {
            padding: 4px 12px;
            background: var(--mfc-btn-face);
            border: 1px solid var(--mfc-border);
            border-bottom: none;
            margin-bottom: -1px;
            cursor: pointer;
            font-size: 11px;
        }

        .form-tab.active {
            background: var(--mfc-form-bg);
            border-bottom: 1px solid var(--mfc-form-bg);
        }

        .form-canvas {
            flex: 1;
            overflow: auto;
            position: relative;
        }

        .form-container {
            position: relative;
            min-width: 800px;
            min-height: 600px;
            background: var(--mfc-form-bg);
        }

        /* Welcome Screen - MFC style initial state */
        .welcome-screen {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--mfc-form-bg);
        }
        
        .welcome-content {
            text-align: center;
            padding: 40px;
        }
        
        .welcome-logo {
            margin-bottom: 20px;
        }
        
        .welcome-logo .logo-icon {
            font-size: 64px;
        }
        
        .welcome-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px;
            color: var(--mfc-text);
        }
        
        .welcome-subtitle {
            font-size: 14px;
            color: #666;
            margin: 0 0 24px;
        }
        
        .welcome-instruction {
            font-size: 13px;
            color: #888;
            margin: 0 0 24px;
        }
        
        .welcome-actions {
            margin-bottom: 20px;
        }
        
        .welcome-actions .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 24px;
            font-size: 14px;
        }
        
        .welcome-actions .btn-icon {
            font-size: 18px;
        }
        
        .welcome-hint {
            font-size: 11px;
            color: #999;
        }
        
        .welcome-hint p {
            margin: 0;
        }

        .welcome-message {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #666;
        }

        .welcome-message h2 {
            margin: 0 0 12px;
        }

        .welcome-message p {
            margin: 0 0 20px;
        }
        
        .app-sources {
            margin-top: 30px;
        }
        
        .app-sources h3 {
            font-size: 14px;
            margin-bottom: 16px;
        }
        
        .welcome-sources {
            margin-top: 32px;
        }
        
        .sources-label {
            font-size: 13px;
            color: #666;
            margin-bottom: 16px;
        }
        
        .source-options {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            max-width: 400px;
            margin: 0 auto;
        }
        
        .source-option {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px 16px;
            border: 1px solid var(--mfc-border);
            background: white;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.15s ease;
        }
        
        .source-option:hover {
            background: #f0f7ff;
            border-color: var(--mfc-selection);
            transform: translateY(-2px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .source-option .source-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }
        
        .source-option .source-name {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 4px;
            color: var(--mfc-text);
        }
        
        .source-option .source-desc {
            font-size: 11px;
            color: #666;
            text-align: center;
        }
        
        .welcome-load-btn {
            padding: 12px 32px;
            font-size: 14px;
            margin-bottom: 8px;
        }
        
        .source-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            max-width: 400px;
            margin: 0 auto;
        }
        
        .source-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 16px;
            border: 1px solid var(--mfc-border);
            background: white;
            cursor: pointer;
            border-radius: 4px;
        }
        
        .source-btn:hover {
            background: #f0f7ff;
            border-color: var(--mfc-selection);
        }
        
        .source-icon {
            font-size: 24px;
            margin-bottom: 8px;
        }
        
        .source-label {
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .source-desc {
            font-size: 11px;
            color: #666;
        }
        
        /* Application List Dialog */
        .app-list-dialog {
            background: white;
            border-radius: 4px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            width: 500px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }
        
        .app-list-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--mfc-border);
        }
        
        .app-list-header h2 {
            flex: 1;
            margin: 0;
            font-size: 16px;
            text-align: center;
        }
        
        .dialog-back, .dialog-close {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            padding: 4px 8px;
            color: #666;
        }
        
        .dialog-back:hover, .dialog-close:hover {
            color: var(--mfc-text);
        }
        
        .dialog-close {
            font-size: 20px;
        }
        
        .app-list-body {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        
        .app-list-item {
            display: flex;
            align-items: center;
            padding: 12px;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 4px;
        }
        
        .app-list-item:hover {
            background: #f0f7ff;
            border-color: var(--mfc-selection);
        }
        
        .app-list-item .app-icon {
            font-size: 24px;
            margin-right: 12px;
        }
        
        .app-list-item .app-info {
            flex: 1;
        }
        
        .app-list-item .app-name {
            font-weight: 600;
            margin-bottom: 2px;
        }
        
        .app-list-item .app-path {
            font-size: 11px;
            color: #666;
        }
        
        .app-list-empty {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        /* CSWeb Dialog */
        .csweb-dialog, .upload-dialog {
            background: white;
            border-radius: 4px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            width: 400px;
        }
        
        .csweb-header, .upload-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--mfc-border);
        }
        
        .csweb-header h2, .upload-header h2 {
            flex: 1;
            margin: 0;
            font-size: 16px;
            text-align: center;
        }
        
        .csweb-body, .upload-body {
            padding: 20px;
        }
        
        .form-group {
            margin-bottom: 16px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 13px;
        }
        
        .form-group input[type="text"],
        .form-group input[type="url"],
        .form-group input[type="password"] {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--mfc-border);
            border-radius: 4px;
            font-size: 13px;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: var(--mfc-selection);
            box-shadow: 0 0 0 2px rgba(0,120,215,0.2);
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 20px;
        }
        
        /* Upload Area */
        .upload-area {
            border: 2px dashed var(--mfc-border);
            border-radius: 8px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .upload-area:hover {
            border-color: var(--mfc-selection);
            background: #f0f7ff;
        }
        
        .upload-area .upload-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
        
        .upload-area p {
            margin: 0 0 8px;
            color: var(--mfc-text);
        }
        
        .upload-area .upload-hint {
            font-size: 11px;
            color: #666;
        }
        
        .upload-files {
            margin-top: 16px;
            border: 1px solid var(--mfc-border);
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .files-header {
            padding: 8px 12px;
            background: var(--mfc-window-bg);
            font-weight: 500;
            font-size: 12px;
            border-bottom: 1px solid var(--mfc-border);
        }
        
        .files-list {
            padding: 8px 12px;
            font-size: 11px;
            font-family: monospace;
        }
    `;
}

function getFieldStyles() {
    return `
        .form-text {
            position: absolute;
            font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif;
            font-size: 13px;
            white-space: nowrap;
            color: #000000;
        }

        .form-text.bold { font-weight: bold; }
        .form-text.underline { text-decoration: underline; }

        .form-box {
            position: absolute;
            border: 1px solid var(--mfc-border);
            background: transparent;
            pointer-events: none;
        }

        .form-field-label {
            position: absolute;
            font-size: 11px;
        }

        .form-field-input {
            position: absolute;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 14px;
            border: 2px inset #808080;
            padding: 2px 4px;
            outline: none;
            background: var(--mfc-field-bg);
            letter-spacing: 2px;
        }

        .form-field-input:focus {
            background: var(--mfc-field-current);
            border-color: #000080;
            box-shadow: inset 0 0 0 1px #000080;
        }

        .form-field-input.visited { background: var(--mfc-field-visited); }
        .form-field-input.skipped { background: var(--mfc-field-skipped); }
        .form-field-input.protected { 
            background: var(--mfc-field-protected); 
            cursor: not-allowed;
            color: #404040;
        }
        .form-field-input.numeric { text-align: right; }
        .form-field-input.uppercase { text-transform: uppercase; }
        
        .form-field-input.click-denied {
            animation: flash-denied 0.2s;
        }
        
        @keyframes flash-denied {
            0%, 100% { background: var(--mfc-field-bg); }
            50% { background: #ffcccc; }
        }

        /* Tickmark container */
        .form-field-tickmark-container {
            position: absolute;
            display: flex;
            align-items: flex-end;
            pointer-events: none;
        }
        
        .form-field-tickmark-input {
            position: relative;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 14px;
            border: 2px inset #808080;
            padding: 2px 4px;
            outline: none;
            background: var(--mfc-field-bg);
            letter-spacing: 0;
            z-index: 1;
        }
        
        .form-field-tickmark-input:focus {
            background: var(--mfc-field-current);
            border-color: #000080;
            box-shadow: inset 0 0 0 1px #000080;
        }
        
        .form-field-tickmarks {
            position: absolute;
            bottom: 2px;
            left: 4px;
            right: 4px;
            height: 6px;
            display: flex;
            pointer-events: none;
        }
        
        .tickmark-char {
            flex: 1;
            border-right: 1px solid #808080;
            height: 100%;
        }
        
        .tickmark-char:last-child {
            border-right: none;
        }
        
        .tickmark-decimal {
            border-right: 1px solid #000080;
            border-right-width: 2px;
        }

        /* Radio Button Group */
        .form-field-radio-group {
            position: absolute;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px;
            background: var(--mfc-window-bg);
            border: 1px solid var(--mfc-border);
        }
        
        .form-field-radio-option {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            padding: 2px 4px;
        }
        
        .form-field-radio-option:hover {
            background: var(--mfc-field-current);
        }
        
        .form-field-radio-option input[type="radio"] {
            margin: 0;
            cursor: pointer;
        }
        
        .form-field-radio-option .option-code {
            font-family: 'Consolas', monospace;
            font-size: 12px;
            color: #666;
            min-width: 30px;
        }
        
        .form-field-radio-option .option-label {
            font-size: 12px;
        }

        /* Checkbox Group */
        .form-field-checkbox-group {
            position: absolute;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px;
            background: var(--mfc-window-bg);
            border: 1px solid var(--mfc-border);
        }
        
        .form-field-checkbox-option {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            padding: 2px 4px;
        }
        
        .form-field-checkbox-option:hover {
            background: var(--mfc-field-current);
        }

        /* DropDown */
        .form-field-dropdown {
            position: absolute;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            font-size: 12px;
            border: 2px inset #808080;
            padding: 2px;
            background: var(--mfc-field-bg);
            cursor: pointer;
        }
        
        .form-field-dropdown:focus {
            border-color: #000080;
        }
    `;
}

function getRosterStyles() {
    return `
        .form-roster {
            position: absolute;
            border: 1px solid var(--mfc-border);
            background: white;
            overflow: auto;
        }
        
        .roster-table {
            border-collapse: collapse;
            width: 100%;
        }
        
        .roster-header {
            background: linear-gradient(180deg, #f0f0f0 0%, #d0d0d0 100%);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        .roster-header th {
            padding: 4px 8px;
            border: 1px solid var(--mfc-border);
            font-weight: 600;
            font-size: 11px;
            text-align: center;
            white-space: nowrap;
        }
        
        .roster-body tr {
            background: white;
        }
        
        .roster-body tr:nth-child(even) {
            background: #f9f9f9;
        }
        
        .roster-body tr.current-row {
            background: #e0f0ff;
        }
        
        .roster-body td {
            padding: 2px;
            border: 1px solid #ddd;
            vertical-align: middle;
        }
        
        .roster-row-num {
            background: var(--mfc-btn-face);
            font-weight: 600;
            text-align: center;
            min-width: 30px;
        }
        
        .roster-row-number {
            background: var(--mfc-btn-face);
            font-weight: 600;
            text-align: center;
            min-width: 30px;
        }
        
        .roster-field-container {
            position: relative;
            min-height: 20px;
        }
        
        .roster-field-container.current {
            background: #ffffcc;
        }
        
        /* Roster tick mark canvas - OVERLAY on input (MFC GridWnd.cpp behavior)
         * z-index: 2 to appear ABOVE the input (z-index: 1)
         * Transparent background so input text shows through */
        .roster-tick-canvas {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        }
        
        /* Checkbox tick canvas - same behavior */
        .checkbox-tick-canvas {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 2;
        }
        
        /* Roster cell input - transparent background to show tick marks */
        .roster-cell-input {
            position: relative;
            width: 100%;
            border: 1px solid transparent;
            background: transparent;
            font-family: 'Consolas', monospace;
            font-size: 12px;
            padding: 2px 4px;
            outline: none;
            z-index: 1;
            color: black;
        }
        
        /* Input with tick marks needs transparent background */
        .roster-cell-input.with-tick-marks {
            background: transparent;
            letter-spacing: 3px;  /* Space characters to align with tick marks */
        }
        
        .roster-cell-input:focus {
            border-color: var(--mfc-selection);
            /* Keep transparent background so tick marks remain visible */
            background: transparent;
        }
        
        .roster-cell-input.numeric {
            text-align: right;
        }
        
        /* Legacy tick mark canvas styles (kept for backward compatibility) */
        .tick-mark-canvas {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 0;
        }
        
        /* Roster checkbox cell container */
        .roster-checkbox-container {
            display: flex;
            flex-wrap: wrap;
            gap: 2px;
            padding: 2px;
            min-width: auto;
            width: auto;
        }
        
        /* Roster checkbox option */
        .roster-checkbox-option {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 1px 3px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .roster-checkbox-option:hover {
            background: var(--mfc-field-current);
        }
        
        .roster-checkbox-option input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
        }
        
        .roster-checkbox-option .checkbox-code {
            font-family: 'Consolas', monospace;
            font-size: 11px;
        }
        
        /* Roster checkbox dialog cell - clickable cell that opens native dialog */
        .roster-checkbox-dialog-cell {
            display: inline-flex;
            align-items: stretch;
            position: relative;
        }
        
        /* Wrapper for checkbox input with tick marks */
        .roster-checkbox-dialog-cell .checkbox-input-wrapper {
            position: relative;
            display: inline-block;
        }
        
        .roster-checkbox-dialog-cell .checkbox-dialog-input {
            flex: 1;
            border: 1px solid var(--mfc-border);
            padding: 1px 2px;
            font-size: 12px;
            min-width: 40px;
            font-family: Consolas, "Courier New", monospace;
        }
        
        /* Checkbox input with tick marks needs transparent background */
        .roster-checkbox-dialog-cell .checkbox-dialog-input.with-tick-marks {
            background: transparent;
            letter-spacing: 3px;
        }
        
        .roster-checkbox-dialog-cell .checkbox-dialog-input:focus {
            outline: none;
            /* Keep transparent background so tick marks remain visible */
            background: transparent;
        }
        
        .roster-checkbox-dialog-cell .checkbox-dialog-button {
            padding: 0 4px;
            border: 1px solid var(--mfc-border);
            background: linear-gradient(to bottom, #f5f5f5, #e0e0e0);
            cursor: pointer;
            font-size: 8px;
            line-height: 1;
            min-width: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .roster-checkbox-dialog-cell .checkbox-dialog-button:hover {
            background: linear-gradient(to bottom, #e8e8e8, #d0d0d0);
        }
        
        .roster-checkbox-dialog-cell .checkbox-dialog-button:active {
            background: linear-gradient(to bottom, #d0d0d0, #e0e0e0);
        }
    `;
}

function getCapiStyles() {
    return `
        .capi-panel {
            display: none;
            background: #ffffc0;
            border-bottom: 1px solid var(--mfc-border);
            min-height: 80px;
            max-height: 200px;
            overflow: auto;
        }
        
        .capi-panel.visible {
            display: block;
        }
        
        .capi-question-container {
            width: 100%;
            height: 100%;
            min-height: 80px;
        }
        
        .capi-question-iframe {
            width: 100%;
            min-height: 80px;
            border: none;
        }
        
        .capi-question-header {
            padding: 8px;
        }
        
        .capi-question {
            font-size: 14px;
            font-weight: 600;
        }
    `;
}

function getDialogStyles() {
    return `
        .dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
        }
        
        .dialog-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
        }
        
        .dialog-container {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid var(--mfc-border);
            box-shadow: 4px 4px 10px rgba(0,0,0,0.3);
            min-width: 300px;
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
        }
        
        .dialog-message {
            padding: 20px;
        }
        
        .dialog-message-title {
            font-weight: bold;
            margin-bottom: 12px;
        }
        
        .dialog-message-text {
            margin-bottom: 20px;
            white-space: pre-wrap;
        }
        
        .dialog-message-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        
        .dialog-message-buttons button {
            padding: 6px 20px;
            border: 1px solid var(--mfc-border);
            background: var(--mfc-btn-face);
            cursor: pointer;
        }
        
        .dialog-message-buttons button:hover {
            background: #e0e0e0;
        }
        
        .dialog-message-buttons button.default-button {
            background: var(--mfc-selection);
            color: white;
            border-color: #005a9e;
        }
        
        /* Value Set Dialog */
        .valueset-dialog {
            width: 400px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }
        
        .valueset-dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--mfc-selection);
            color: white;
        }
        
        .valueset-dialog-title {
            font-weight: 600;
        }
        
        .valueset-dialog-close {
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
        }
        
        .valueset-dialog-body {
            flex: 1;
            overflow: auto;
            max-height: 400px;
        }
        
        .valueset-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .valueset-table th {
            background: var(--mfc-btn-face);
            padding: 6px 8px;
            border: 1px solid var(--mfc-border);
            font-size: 11px;
            position: sticky;
            top: 0;
        }
        
        .valueset-row {
            cursor: pointer;
        }
        
        .valueset-row:hover {
            background: #e5f3ff;
        }
        
        .valueset-row.selected {
            background: var(--mfc-selection);
            color: white;
        }
        
        .valueset-row td {
            padding: 4px 8px;
            border: 1px solid #ddd;
        }
        
        .valueset-code {
            font-family: 'Consolas', monospace;
            width: 60px;
        }
        
        .valueset-dialog-footer {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            padding: 12px;
            border-top: 1px solid var(--mfc-border);
        }
        
        .valueset-btn {
            padding: 6px 20px;
            border: 1px solid var(--mfc-border);
            background: var(--mfc-btn-face);
            cursor: pointer;
        }
        
        .valueset-btn:hover {
            background: #e0e0e0;
        }
        
        .valueset-btn-ok {
            background: var(--mfc-selection);
            color: white;
        }
    `;
}

function getStatusBarStyles() {
    return `
        .mfc-statusbar {
            display: flex;
            height: 22px;
            background: var(--mfc-btn-face);
            border-top: 1px solid var(--mfc-border);
            padding: 2px 4px;
            font-size: 11px;
        }

        .status-section {
            padding: 0 8px;
            border-right: 1px solid var(--mfc-border);
        }

        .status-section:last-child {
            border-right: none;
        }
        
        .status-progress {
            margin-left: auto;
        }
    `;
}

function getAppLoaderStyles() {
    return `
        .app-loader-dialog {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 600px;
            max-width: 90vw;
            max-height: 80vh;
            background: white;
            border: 1px solid var(--mfc-border);
            box-shadow: 4px 4px 10px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
        }
        
        .app-loader-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--mfc-selection);
            color: white;
        }
        
        .dialog-close-btn {
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
        }
        
        .app-loader-tabs {
            display: flex;
            background: var(--mfc-btn-face);
            border-bottom: 1px solid var(--mfc-border);
        }
        
        .app-loader-tab {
            padding: 8px 16px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        
        .app-loader-tab.active {
            background: white;
            border-bottom-color: var(--mfc-selection);
        }
        
        .app-loader-content {
            flex: 1;
            overflow: hidden;
        }
        
        .app-loader-panel {
            display: none;
            height: 100%;
            padding: 12px;
            overflow: auto;
        }
        
        .app-loader-panel.active {
            display: block;
        }
        
        .app-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .app-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            border: 1px solid var(--mfc-border);
            border-radius: 4px;
            cursor: pointer;
        }
        
        .app-item:hover {
            background: #f0f7ff;
            border-color: var(--mfc-selection);
        }
        
        .app-item-name {
            font-weight: 600;
        }
        
        .app-item-pff {
            font-size: 11px;
            color: #666;
        }
        
        .loading-indicator, .empty-state {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        
        .upload-zone {
            border: 2px dashed var(--mfc-border);
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
        }
        
        .upload-zone:hover {
            border-color: var(--mfc-selection);
            background: #f0f7ff;
        }
        
        .upload-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
        
        .upload-text {
            font-size: 16px;
            margin-bottom: 8px;
        }
        
        .upload-hint {
            font-size: 12px;
            color: #666;
            margin-bottom: 16px;
        }
        
        .upload-buttons {
            display: flex;
            gap: 8px;
            justify-content: center;
        }
        
        .upload-preview {
            border: 1px solid var(--mfc-border);
            border-radius: 4px;
        }
        
        .upload-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--mfc-btn-face);
            border-bottom: 1px solid var(--mfc-border);
        }
        
        .upload-file-list {
            max-height: 200px;
            overflow: auto;
            padding: 8px;
        }
        
        .upload-file-item {
            padding: 4px 8px;
            font-size: 12px;
            font-family: monospace;
        }
    `;
}

export default getStyles;

// Alias for backward compatibility
export { getStyles as getMFCStyles };
