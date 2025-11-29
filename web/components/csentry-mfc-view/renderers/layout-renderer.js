/**
 * Layout Renderer - Creates the MFC-style main layout structure
 * Matches Windows MFC CSEntry interface layout
 * @module components/csentry-mfc-view/renderers/layout-renderer
 */

/**
 * Create the main MFC-style layout HTML
 * This replicates the Windows MFC CSEntry interface structure
 * @returns {string} HTML string for the main layout
 */
export function createMFCLayout() {
    return `
        <div class="mfc-app">
            ${createMenuBar()}
            ${createToolbar()}
            ${createMainArea()}
            ${createStatusBar()}
            ${createOverlays()}
        </div>
    `;
}

/**
 * Create the menu bar - matches MFC CSEntry menu structure
 * Based on CSEntry/CSEntry.rc resource file menu definitions
 * @returns {string} Menu bar HTML
 */
export function createMenuBar() {
    return `
        <div class="mfc-menubar">
            <!-- File Menu -->
            <div class="menu-item" data-menu="file">
                <span class="menu-label"><u>F</u>ile</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="open">
                        <span class="menu-text">Open Application...</span>
                        <span class="menu-shortcut">Ctrl+O</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="openData">
                        <span class="menu-text">Open Data File...</span>
                        <span class="menu-shortcut">Ctrl+D</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="save">
                        <span class="menu-text">Save Partial Case</span>
                        <span class="menu-shortcut">Ctrl+R</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="sync">
                        <span class="menu-text">Synchronize</span>
                        <span class="menu-shortcut">Ctrl+Shift+S</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="exit">
                        <span class="menu-text">Exit</span>
                        <span class="menu-shortcut">Alt+F4</span>
                    </div>
                </div>
            </div>
            
            <!-- Mode Menu -->
            <div class="menu-item" data-menu="mode">
                <span class="menu-label"><u>M</u>ode</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="addCase">
                        <span class="menu-text">Add Case</span>
                        <span class="menu-shortcut">Ctrl+A</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="modifyCase">
                        <span class="menu-text">Modify Case</span>
                        <span class="menu-shortcut">Ctrl+M</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="verifyCase">
                        <span class="menu-text">Verify Case</span>
                        <span class="menu-shortcut">Ctrl+V</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="pause">
                        <span class="menu-text">Pause</span>
                        <span class="menu-shortcut">Ctrl+P</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="stop">
                        <span class="menu-text">Stop</span>
                        <span class="menu-shortcut">Ctrl+S</span>
                    </div>
                </div>
            </div>
            
            <!-- Edit Menu -->
            <div class="menu-item" data-menu="edit">
                <span class="menu-label"><u>E</u>dit</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="insertCase">
                        <span class="menu-text">Insert Case</span>
                        <span class="menu-shortcut">Ins</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="deleteCase">
                        <span class="menu-text">Delete Case</span>
                        <span class="menu-shortcut">Del</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="findCase">
                        <span class="menu-text">Find Case...</span>
                        <span class="menu-shortcut">Ctrl+F</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="insertGroupOcc">
                        <span class="menu-text">Insert Group Occ</span>
                        <span class="menu-shortcut">F3</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="deleteGroupOcc">
                        <span class="menu-text">Delete Group Occ</span>
                        <span class="menu-shortcut">F4</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="sortGroupOcc">
                        <span class="menu-text">Sort Group Occ</span>
                        <span class="menu-shortcut">F5</span>
                    </div>
                </div>
            </div>
            
            <!-- Navigation Menu -->
            <div class="menu-item" data-menu="navigation">
                <span class="menu-label"><u>N</u>avigation</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="prevScreen">
                        <span class="menu-text">Previous Screen</span>
                        <span class="menu-shortcut">PgUp</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="nextScreen">
                        <span class="menu-text">Next Screen</span>
                        <span class="menu-shortcut">PgDn</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="firstCase">
                        <span class="menu-text">First Case</span>
                        <span class="menu-shortcut">Ctrl+Home</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="prevCase">
                        <span class="menu-text">Previous Case</span>
                        <span class="menu-shortcut">Ctrl+PgUp</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="nextCase">
                        <span class="menu-text">Next Case</span>
                        <span class="menu-shortcut">Ctrl+PgDn</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="lastCase">
                        <span class="menu-text">Last Case</span>
                        <span class="menu-shortcut">Ctrl+End</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="endGroupOcc">
                        <span class="menu-text">End Group Occurrence</span>
                        <span class="menu-shortcut">/</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="endGroup">
                        <span class="menu-text">End Group</span>
                        <span class="menu-shortcut">Ctrl+/</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="goTo">
                        <span class="menu-text">Go To...</span>
                        <span class="menu-shortcut">F6</span>
                    </div>
                </div>
            </div>
            
            <!-- View Menu -->
            <div class="menu-item" data-menu="view">
                <span class="menu-label"><u>V</u>iew</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="fullScreen">
                        <span class="menu-text">Full Screen</span>
                        <span class="menu-shortcut">Ctrl+J</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item checkable" data-action="toggleCaseTree">
                        <span class="menu-check">✓</span>
                        <span class="menu-text">Case Tree</span>
                        <span class="menu-shortcut">Ctrl+Z</span>
                    </div>
                    <div class="menu-dropdown-item checkable" data-action="toggleNames">
                        <span class="menu-check"></span>
                        <span class="menu-text">Names in Case Tree</span>
                        <span class="menu-shortcut">Ctrl+T</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item checkable" data-action="showRefusals">
                        <span class="menu-check"></span>
                        <span class="menu-text">Show Refusal Options</span>
                    </div>
                </div>
            </div>
            
            <!-- Options Menu -->
            <div class="menu-item" data-menu="options">
                <span class="menu-label"><u>O</u>ptions</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="changeLanguage">
                        <span class="menu-text">Change Language...</span>
                        <span class="menu-shortcut">Ctrl+L</span>
                    </div>
                    <div class="menu-dropdown-item" data-action="showResponses">
                        <span class="menu-text">Show Responses</span>
                        <span class="menu-shortcut">Ctrl+C</span>
                    </div>
                </div>
            </div>
            
            <!-- Help Menu -->
            <div class="menu-item" data-menu="help">
                <span class="menu-label"><u>H</u>elp</span>
                <div class="menu-dropdown">
                    <div class="menu-dropdown-item" data-action="helpTopics">
                        <span class="menu-text">Help Topics</span>
                        <span class="menu-shortcut">F1</span>
                    </div>
                    <div class="menu-dropdown-sep"></div>
                    <div class="menu-dropdown-item" data-action="about">
                        <span class="menu-text">About Data Entry</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create the toolbar - matches MFC CSEntry toolbar
 * Icons represent actual CSEntry toolbar buttons
 * @returns {string} Toolbar HTML
 */
export function createToolbar() {
    return `
        <div class="mfc-toolbar">
            <button class="toolbar-btn" data-action="open" title="Open Application (Ctrl+O)">
                <span class="toolbar-icon">📂</span>
            </button>
            <span class="app-name" id="appName"></span>
            <div class="toolbar-sep"></div>
            <button class="toolbar-btn" data-action="addCase" title="Add Case (Ctrl+A)">
                <span class="toolbar-icon">➕</span>
            </button>
            <button class="toolbar-btn" data-action="modifyCase" title="Modify Case (Ctrl+M)">
                <span class="toolbar-icon">✏️</span>
            </button>
            <button class="toolbar-btn" data-action="verifyCase" title="Verify Case (Ctrl+V)">
                <span class="toolbar-icon">✓</span>
            </button>
            <div class="toolbar-sep"></div>
            <button class="toolbar-btn" data-action="pause" title="Pause (Ctrl+P)">
                <span class="toolbar-icon">⏸️</span>
            </button>
            <button class="toolbar-btn" data-action="stop" title="Stop (Ctrl+S)">
                <span class="toolbar-icon">⏹️</span>
            </button>
            <div class="toolbar-sep"></div>
            <button class="toolbar-btn" data-action="firstCase" title="First Case (Ctrl+Home)">
                <span class="toolbar-icon">⏮️</span>
            </button>
            <button class="toolbar-btn" data-action="prevCase" title="Previous Case (Ctrl+PgUp)">
                <span class="toolbar-icon">◀️</span>
            </button>
            <button class="toolbar-btn" data-action="nextCase" title="Next Case (Ctrl+PgDn)">
                <span class="toolbar-icon">▶️</span>
            </button>
            <button class="toolbar-btn" data-action="lastCase" title="Last Case (Ctrl+End)">
                <span class="toolbar-icon">⏭️</span>
            </button>
            <div class="toolbar-sep"></div>
            <button class="toolbar-btn" data-action="helpTopics" title="Help (F1)">
                <span class="toolbar-icon">❓</span>
            </button>
        </div>
    `;
}

/**
 * Create the main area with splitter - MFC splitter view style
 * @returns {string} Main area HTML
 */
export function createMainArea() {
    return `
        <div class="mfc-main">
            <!-- Left Panel - Case Tree (CTreeCtrl in MFC) -->
            <div class="mfc-tree-panel" id="treePanel">
                <div class="panel-header">Cases</div>
                <div class="tree-content" id="treeContent"></div>
            </div>
            
            <!-- Splitter (CSplitterWnd in MFC) -->
            <div class="mfc-splitter" id="splitter"></div>
            
            <!-- Right Panel - Form View (CFormView in MFC) -->
            <div class="mfc-form-panel">
                <!-- CAPI Question Panel (hidden by default) -->
                <div class="capi-panel" id="capiPanel">
                    <div class="capi-question-container">
                        <!-- Note: Using allow-scripts only. Removed allow-same-origin to prevent sandbox escape.
                             Content uses postMessage which works with just allow-scripts. -->
                        <iframe id="capiIframe" class="capi-question-iframe" sandbox="allow-scripts"></iframe>
                    </div>
                </div>
                
                <!-- Form Tabs (for multi-form applications) -->
                <div class="form-tabs" id="formTabs" style="display: none;"></div>
                
                <!-- Form Canvas - Main entry area -->
                <div class="form-canvas">
                    <div class="form-container" id="formContainer">
                        ${createWelcomeScreen()}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create the welcome/start screen - shown when no application is loaded
 * Matches Windows CSEntry initial state with multiple load options
 * @returns {string} Welcome screen HTML
 */
export function createWelcomeScreen() {
    return `
        <div class="welcome-screen">
            <div class="welcome-content">
                <div class="welcome-logo">
                    <span class="logo-icon">📋</span>
                </div>
                <h2 class="welcome-title">CSEntry Web</h2>
                <p class="welcome-subtitle">Load a CSPro application to begin data entry.</p>
                
                <button class="btn btn-primary welcome-load-btn" data-action="open">
                    Load Application
                </button>
                
                <div class="welcome-sources">
                    <p class="sources-label">Load From:</p>
                    <div class="source-options">
                        <div class="source-option" data-source="server">
                            <div class="source-icon">🌐</div>
                            <div class="source-name">Server</div>
                            <div class="source-desc">Applications on the server</div>
                        </div>
                        <div class="source-option" data-source="assets">
                            <div class="source-icon">📦</div>
                            <div class="source-name">Assets</div>
                            <div class="source-desc">Built-in applications</div>
                        </div>
                        <div class="source-option" data-source="csweb">
                            <div class="source-icon">☁️</div>
                            <div class="source-name">CSWeb</div>
                            <div class="source-desc">CSWeb server sync</div>
                        </div>
                        <div class="source-option" data-source="upload">
                            <div class="source-icon">📁</div>
                            <div class="source-name">Upload</div>
                            <div class="source-desc">Upload from your computer</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create the status bar - MFC style status bar
 * Based on CStatusBar in MFC CSEntry
 * @returns {string} Status bar HTML
 */
export function createStatusBar() {
    return `
        <div class="mfc-statusbar">
            <div class="status-section status-field" id="statusField">Ready</div>
            <div class="status-section status-occ" id="statusOcc"></div>
            <div class="status-section status-mode" id="statusMode">Add</div>
            <div class="status-section status-caps" id="statusCaps"></div>
            <div class="status-section status-num" id="statusNum"></div>
            <div class="status-section status-info" id="statusInfo"></div>
        </div>
    `;
}

/**
 * Create overlay containers for dialogs and loading
 * @returns {string} Overlays HTML
 */
export function createOverlays() {
    return `
        <!-- Loading Overlay -->
        <div class="loading-overlay" id="loadingOverlay" style="display: none;">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading...</div>
            </div>
        </div>
        
        <!-- Dialog Overlay -->
        <div class="dialog-overlay" id="dialogOverlay" style="display: none;">
            <div class="dialog-backdrop"></div>
            <div class="dialog-container" id="dialogContainer"></div>
        </div>
    `;
}

/**
 * Get all DOM element references from the layout
 * @param {ShadowRoot} shadowRoot - The shadow root containing the layout
 * @returns {Object} Object with DOM element references
 */
export function getLayoutElements(shadowRoot) {
    return {
        // Main container
        app: shadowRoot.querySelector('.mfc-app'),
        
        // Menu
        menubar: shadowRoot.querySelector('.mfc-menubar'),
        menuItems: shadowRoot.querySelectorAll('.menu-item'),
        
        // Toolbar
        toolbar: shadowRoot.querySelector('.mfc-toolbar'),
        toolbarBtns: shadowRoot.querySelectorAll('.toolbar-btn'),
        appName: shadowRoot.querySelector('#appName'),
        
        // Main area
        main: shadowRoot.querySelector('.mfc-main'),
        treePanel: shadowRoot.querySelector('#treePanel'),
        treeContent: shadowRoot.querySelector('#treeContent'),
        splitter: shadowRoot.querySelector('#splitter'),
        formPanel: shadowRoot.querySelector('.mfc-form-panel'),
        
        // CAPI
        capiPanel: shadowRoot.querySelector('#capiPanel'),
        capiIframe: shadowRoot.querySelector('#capiIframe'),
        
        // Form
        formTabs: shadowRoot.querySelector('#formTabs'),
        formContainer: shadowRoot.querySelector('#formContainer'),
        
        // Status bar
        statusbar: shadowRoot.querySelector('.mfc-statusbar'),
        statusField: shadowRoot.querySelector('#statusField'),
        statusOcc: shadowRoot.querySelector('#statusOcc'),
        statusMode: shadowRoot.querySelector('#statusMode'),
        statusCaps: shadowRoot.querySelector('#statusCaps'),
        statusNum: shadowRoot.querySelector('#statusNum'),
        statusInfo: shadowRoot.querySelector('#statusInfo'),
        
        // Overlays
        loadingOverlay: shadowRoot.querySelector('#loadingOverlay'),
        loadingText: shadowRoot.querySelector('.loading-text'),
        dialogOverlay: shadowRoot.querySelector('#dialogOverlay'),
        dialogContainer: shadowRoot.querySelector('#dialogContainer')
    };
}

/**
 * Initialize splitter drag functionality
 * @param {HTMLElement} splitter - The splitter element
 * @param {HTMLElement} treePanel - The tree panel element
 * @param {HTMLElement} formPanel - The form panel element
 */
export function initSplitter(splitter, treePanel, formPanel) {
    if (!splitter || !treePanel) return;
    
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    
    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = treePanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(100, Math.min(500, startWidth + diff));
        treePanel.style.width = `${newWidth}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

/**
 * Show/hide tree panel
 * @param {HTMLElement} treePanel - The tree panel element
 * @param {HTMLElement} splitter - The splitter element
 * @param {boolean} visible - Whether to show or hide
 */
export function toggleTreePanel(treePanel, splitter, visible) {
    if (treePanel) {
        treePanel.style.display = visible ? '' : 'none';
    }
    if (splitter) {
        splitter.style.display = visible ? '' : 'none';
    }
}

/**
 * Update status bar
 * @param {Object} elements - Layout elements
 * @param {Object} status - Status information
 */
export function updateStatusBar(elements, status) {
    if (status.field !== undefined && elements.statusField) {
        elements.statusField.textContent = status.field;
    }
    if (status.occ !== undefined && elements.statusOcc) {
        elements.statusOcc.textContent = status.occ;
    }
    if (status.mode !== undefined && elements.statusMode) {
        elements.statusMode.textContent = status.mode;
    }
    if (status.info !== undefined && elements.statusInfo) {
        elements.statusInfo.textContent = status.info;
    }
}

/**
 * Show loading overlay
 * @param {HTMLElement} overlay - Loading overlay element
 * @param {HTMLElement} textEl - Loading text element
 * @param {string} message - Loading message
 */
export function showLoading(overlay, textEl, message = 'Loading...') {
    if (overlay) {
        overlay.style.display = 'flex';
    }
    if (textEl) {
        textEl.textContent = message;
    }
}

/**
 * Hide loading overlay
 * @param {HTMLElement} overlay - Loading overlay element
 */
export function hideLoading(overlay) {
    if (overlay) {
        overlay.style.display = 'none';
    }
}

export default {
    createMFCLayout,
    createMenuBar,
    createToolbar,
    createMainArea,
    createWelcomeScreen,
    createStatusBar,
    createOverlays,
    getLayoutElements,
    initSplitter,
    toggleTreePanel,
    updateStatusBar,
    showLoading,
    hideLoading
};
