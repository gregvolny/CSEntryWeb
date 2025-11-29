/**
 * CSEntry MFC-Style Web Component
 * 
 * A Web Component that renders CSPro data entry forms with an MFC-style interface.
 * Supports both client-side WASM engine and server-side proxy modes.
 * 
 * @module components/csentry-mfc-view
 */

// Import utilities
import { CAPTURE_TYPES, FREE_MOVEMENT, ROSTER_ORIENTATION, parsePFF, escapeHtml, modifyDialogHtml } from './utils/index.js';

// Import styles
import { getMFCStyles } from './styles.js';

// Import handlers
import { DialogHandler } from './handlers/dialog-handler.js';
import { buildNavigationFields, focusNavigationField, getCurrentFieldInput, moveToRosterCell, moveToRosterColumn } from './handlers/navigation-handler.js';

// Import renderers
import { createMFCLayout, getLayoutElements, initSplitter, toggleTreePanel, updateStatusBar, showLoading, hideLoading } from './renderers/layout-renderer.js';
import { renderForm, createFieldElement, getFieldElementValue, createTextInput, createNumericTickmarkInput, createRadioButtonGroup, createCheckboxGroup, createDropdown, createSlider, createDateInput } from './renderers/form-renderer.js';
import { createRosterTable, createRosterCellInput, updateTickmarkDisplay, updateRosterFromEngine, updateFieldDisplayValue, highlightCurrentRow } from './renderers/roster-renderer.js';
import { buildCaseTree, updateTreeValue, highlightTreeField, expandAll, collapseAll } from './renderers/tree-renderer.js';
import { showCAPI, hideCapiPanel, displayCapiHtml, setupCapiMessageListener } from './renderers/capi-renderer.js';

// Import engine proxy
import { createServerSideEngineProxy } from './engine/engine-proxy.js';

/**
 * CSEntry MFC-Style View Web Component
 * Renders CSPro forms with Windows MFC-style appearance
 */
class CSEntryMFCView extends HTMLElement {
    // Static constants
    static CAPTURE_TYPES = CAPTURE_TYPES;
    static FREE_MOVEMENT = FREE_MOVEMENT;
    static ROSTER_ORIENTATION = ROSTER_ORIENTATION;
    
    /**
     * Creates a new CSEntryMFCView instance
     */
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // State
        this.engine = null;
        this._wasmModule = null;
        this._wasmBusy = false;
        this.currentApp = null;
        this.currentForm = null;
        this.currentField = null;
        this.navigationFields = [];
        this.currentNavIndex = 0;
        this.isPathOn = true;
        this._rosters = {};
        this._currentPageResult = null;
        this._capiBlobUrl = null;
        
        // Dialog handler
        this.dialogHandler = null;
        
        // DOM references
        this.$ = {};
        
        this._initializeComponent();
    }
    
    /**
     * Initialize the component structure
     * Uses modular layout renderer for MFC-style UI
     */
    _initializeComponent() {
        // Create shadow DOM structure using modular layout renderer
        this.shadowRoot.innerHTML = `
            <style>${getMFCStyles()}</style>
            ${createMFCLayout()}
        `;
        
        // Cache DOM references using layout renderer helper
        this.$ = getLayoutElements(this.shadowRoot);
        
        // Add backward-compatible aliases for existing code
        this.$.container = this.$.app;
        this.$.formPanel = this.shadowRoot.querySelector('.mfc-form-panel');
        
        // Initialize dialog handler
        this.dialogHandler = new DialogHandler(
            this.$.dialogOverlay,
            this.$.dialogContainer,
            {
                onDialogClose: () => this._onDialogClosed()
            }
        );
        // Attach this component to the dialog handler for callbacks
        this.dialogHandler.attachComponent(this);
        
        // Register global CSProDialogHandler for WASM engine callbacks
        // The CSPro WASM engine looks for window.CSProDialogHandler to show dialogs
        window.CSProDialogHandler = {
            showDialogAsync: async (dialogName, inputDataJson) => {
                console.log('[CSProDialogHandler] showDialogAsync:', dialogName);
                return await this.dialogHandler.showDialogAsync(dialogName, inputDataJson);
            },
            showHtmlDialogAsync: async (dialogPath, inputDataJson, displayOptionsJson) => {
                console.log('[CSProDialogHandler] showHtmlDialogAsync:', dialogPath);
                return await this.dialogHandler.showHtmlDialogAsync(dialogPath, inputDataJson, displayOptionsJson);
            },
            showModalDialogAsync: async (title, message, mbType) => {
                console.log('[CSProDialogHandler] showModalDialogAsync:', mbType);
                return await this.dialogHandler.showModalDialogAsync(title, message, mbType);
            },
            getInputDataAsync: async (dialogId) => {
                console.log('[CSProDialogHandler] getInputDataAsync:', dialogId);
                return await this.dialogHandler.getInputDataAsync(dialogId);
            }
        };
        
        // Bind event handlers
        this._bindEvents();
        
        // Set up CAPI message listener - pass component (this) for full action handling
        setupCapiMessageListener(window, this, this.$.capiIframe);
        
        // Initialize splitter drag using modular helper
        initSplitter(this.$.splitter, this.$.treePanel, this.$.formPanel);
    }
    
    /**
     * Bind event handlers
     */
    _bindEvents() {
        // Toolbar buttons - use data-action attributes
        this.shadowRoot.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                if (action) this._handleMenuAction(action);
            });
        });
        
        // Menu dropdown items
        this.shadowRoot.querySelectorAll('.menu-dropdown-item[data-action]').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                if (action) this._handleMenuAction(action);
                // Close menu
                this._closeAllMenus();
            });
        });
        
        // Menu labels - toggle dropdown on click
        this.shadowRoot.querySelectorAll('.menu-item').forEach(menuItem => {
            const label = menuItem.querySelector('.menu-label');
            if (label) {
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleMenu(menuItem);
                });
            }
        });
        
        // Close menus when clicking outside
        this.shadowRoot.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-item')) {
                this._closeAllMenus();
            }
        });
        
        // Welcome screen source options
        this.shadowRoot.querySelectorAll('.source-option[data-source]').forEach(option => {
            option.addEventListener('click', (e) => {
                const source = option.dataset.source;
                if (source) this._handleSourceSelect(source);
            });
        });
        
        // Welcome screen Load Application button
        const loadBtn = this.shadowRoot.querySelector('.welcome-load-btn[data-action="open"]');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this._showOpenDialog());
        }
        
        // Debug: F9 to test dialog
        document.addEventListener('keydown', async (e) => {
            if (e.key === 'F9') {
                console.log('[Debug] Testing dialog with F9');
                await this._showMessage('This is a test message from F9 key press.', 'Test Dialog');
            }
        });
    }
    
    /**
     * Handle source selection from welcome screen
     * @param {string} source - Source type (server, assets, csweb, upload)
     */
    async _handleSourceSelect(source) {
        console.log('[MFC] Source selected:', source);
        
        switch (source) {
            case 'server':
                await this._loadFromServer();
                break;
            case 'assets':
                await this._loadFromAssets();
                break;
            case 'csweb':
                this._showCSWebDialog();
                break;
            case 'upload':
                this._showUploadDialog();
                break;
            default:
                console.warn('[MFC] Unknown source:', source);
        }
    }
    
    /**
     * Load applications from server storage
     */
    async _loadFromServer() {
        try {
            this._showLoading('Loading applications from server...');
            
            const response = await fetch('/api/applications');
            if (!response.ok) {
                throw new Error(`Failed to fetch applications: ${response.statusText}`);
            }
            
            const data = await response.json();
            this._hideLoading();
            
            if (data.applications && data.applications.length > 0) {
                this._showAppListDialog(data.applications, 'server');
            } else {
                await this._showMessage('No applications found on the server.\n\nUse the Upload option to add applications.', 'Server');
            }
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error loading from server:', error);
            await this._showMessage('Error loading applications: ' + error.message, 'Error');
        }
    }
    
    /**
     * Load applications from WASM assets (embedded in CSPro.data)
     */
    async _loadFromAssets() {
        try {
            this._showLoading('Loading built-in applications...');
            
            let applications = [];
            
            // Try server-side API first (preferred - works with server proxy)
            const serverAvailable = await this._checkServerAvailability();
            
            if (serverAvailable) {
                console.log('[MFC] Using server API to list assets');
                try {
                    const response = await fetch('/api/cspro/assets');
                    const data = await response.json();
                    
                    if (data.success && data.applications) {
                        applications = data.applications.map(app => ({
                            ...app,
                            // Construct full PFF path for embedded assets
                            path: app.pffFile ? `${app.path}/${app.pffFile}` : app.path,
                            source: 'assets'
                        }));
                        console.log('[MFC] Found asset applications via API:', applications);
                    }
                } catch (apiError) {
                    console.warn('[MFC] Server API failed, falling back to client WASM:', apiError);
                }
            }
            
            // Fall back to client-side WASM if server API didn't return results
            if (applications.length === 0) {
                // Initialize WASM to access the virtual filesystem
                await this._initializeWasm();
                
                if (this._wasmModule?.FS) {
                    const FS = this._wasmModule.FS;
                    const assetsPath = '/Assets/examples';
                    
                    try {
                        const entries = FS.readdir(assetsPath);
                        console.log('[MFC] Assets directory contents:', entries);
                        
                        // Find .pff files (each represents an application)
                        const pffFiles = entries.filter(f => f.toLowerCase().endsWith('.pff'));
                        
                        applications = pffFiles.map(pff => {
                            const name = pff.replace(/\.pff$/i, '');
                            return {
                                name: name,
                                path: `${assetsPath}/${pff}`,
                                pffFile: pff,
                                source: 'assets'
                            };
                        });
                        
                        console.log('[MFC] Found asset applications:', applications);
                    } catch (e) {
                        console.warn('[MFC] Could not read assets directory:', e);
                    }
                } else {
                    console.warn('[MFC] No WASM filesystem available for assets');
                }
            }
            
            this._hideLoading();
            
            if (applications.length > 0) {
                this._showAppListDialog(applications, 'assets');
            } else {
                await this._showMessage('No built-in applications available.', 'Assets');
            }
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error loading from assets:', error);
            await this._showMessage('Error loading applications: ' + error.message, 'Error');
        }
    }
    
    /**
     * Show CSWeb connection dialog
     */
    _showCSWebDialog() {
        const html = `
            <div class="csweb-dialog">
                <div class="csweb-header">
                    <button class="dialog-back" data-action="back">← Back</button>
                    <h2>Connect to CSWeb</h2>
                    <button class="dialog-close" data-action="close">&times;</button>
                </div>
                <div class="csweb-body">
                    <div class="form-group">
                        <label for="cswebUrl">CSWeb Server URL:</label>
                        <input type="url" id="cswebUrl" placeholder="https://your-csweb-server.com" />
                    </div>
                    <div class="form-group">
                        <label for="cswebUser">Username (optional):</label>
                        <input type="text" id="cswebUser" placeholder="Username" />
                    </div>
                    <div class="form-group">
                        <label for="cswebPass">Password (optional):</label>
                        <input type="password" id="cswebPass" placeholder="Password" />
                    </div>
                    <div class="form-actions">
                        <button class="btn" data-action="cancel">Cancel</button>
                        <button class="btn btn-primary" data-action="connect">Connect</button>
                    </div>
                </div>
            </div>
        `;
        
        this._showCustomDialog(html, {
            onAction: async (action, dialog) => {
                if (action === 'connect') {
                    const url = dialog.querySelector('#cswebUrl').value;
                    const username = dialog.querySelector('#cswebUser').value;
                    const password = dialog.querySelector('#cswebPass').value;
                    
                    if (!url) {
                        await this._showMessage('Please enter a CSWeb server URL', 'CSWeb');
                        return false;
                    }
                    
                    await this._connectToCSWeb(url, username, password);
                }
                return true; // Close dialog
            }
        });
    }
    
    /**
     * Connect to CSWeb server
     */
    async _connectToCSWeb(url, username, password) {
        try {
            this._showLoading('Connecting to CSWeb server...');
            
            const response = await fetch('/api/csweb/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, username, password })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to connect: ${response.statusText}`);
            }
            
            const data = await response.json();
            this._hideLoading();
            
            if (data.applications && data.applications.length > 0) {
                this._cswebConfig = { url, username, password };
                this._showAppListDialog(data.applications, 'csweb');
            } else {
                await this._showMessage('No applications found on the CSWeb server.', 'CSWeb');
            }
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error connecting to CSWeb:', error);
            await this._showMessage('Error connecting to CSWeb: ' + error.message, 'Error');
        }
    }
    
    /**
     * Show upload dialog for local files
     */
    _showUploadDialog() {
        const html = `
            <div class="upload-dialog">
                <div class="upload-header">
                    <button class="dialog-back" data-action="back">← Back</button>
                    <h2>Upload Application</h2>
                    <button class="dialog-close" data-action="close">&times;</button>
                </div>
                <div class="upload-body">
                    <div class="form-group">
                        <label for="appName">Application Name:</label>
                        <input type="text" id="appName" placeholder="My Application" />
                    </div>
                    <div class="upload-area" id="uploadArea">
                        <div class="upload-icon">📁</div>
                        <p>Click to select folder</p>
                        <p class="upload-hint">Select the CSPro application folder containing .ent or .pen file</p>
                        <input type="file" id="folderInput" webkitdirectory directory multiple style="display: none;" />
                    </div>
                    <div class="upload-files" id="uploadFiles" style="display: none;">
                        <div class="files-header">Selected files:</div>
                        <div class="files-list" id="filesList"></div>
                    </div>
                    <div class="form-actions">
                        <button class="btn" data-action="cancel">Cancel</button>
                        <button class="btn btn-primary" data-action="upload" disabled id="uploadBtn">Upload</button>
                    </div>
                </div>
            </div>
        `;
        
        let selectedFiles = [];
        
        this._showCustomDialog(html, {
            onInit: (dialog) => {
                const uploadArea = dialog.querySelector('#uploadArea');
                const folderInput = dialog.querySelector('#folderInput');
                const uploadFiles = dialog.querySelector('#uploadFiles');
                const filesList = dialog.querySelector('#filesList');
                const uploadBtn = dialog.querySelector('#uploadBtn');
                const appNameInput = dialog.querySelector('#appName');
                
                uploadArea.addEventListener('click', () => folderInput.click());
                
                folderInput.addEventListener('change', (e) => {
                    selectedFiles = Array.from(e.target.files);
                    
                    if (selectedFiles.length > 0) {
                        // Auto-fill app name from folder
                        const firstPath = selectedFiles[0].webkitRelativePath;
                        const folderName = firstPath.split('/')[0];
                        if (!appNameInput.value) {
                            appNameInput.value = folderName;
                        }
                        
                        // Show file list
                        uploadFiles.style.display = 'block';
                        filesList.innerHTML = selectedFiles.map(f => 
                            `<div>${f.webkitRelativePath}</div>`
                        ).join('');
                        
                        uploadBtn.disabled = false;
                    }
                });
            },
            onAction: async (action, dialog) => {
                if (action === 'upload') {
                    const appName = dialog.querySelector('#appName').value;
                    
                    if (!appName) {
                        await this._showMessage('Please enter an application name', 'Upload');
                        return false;
                    }
                    
                    if (selectedFiles.length === 0) {
                        await this._showMessage('Please select files to upload', 'Upload');
                        return false;
                    }
                    
                    await this._uploadApplication(appName, selectedFiles);
                }
                return true;
            }
        });
    }
    
    /**
     * Upload application files to server
     */
    async _uploadApplication(appName, files) {
        try {
            this._showLoading('Uploading application...');
            
            const formData = new FormData();
            formData.append('appName', appName);
            
            for (const file of files) {
                const path = file.webkitRelativePath || file.name;
                formData.append('files', file, path);
            }
            
            const response = await fetch('/api/applications/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            this._hideLoading();
            
            if (data.success) {
                await this._showMessage('Application uploaded successfully!', 'Upload');
                // Reload from server to show the new app
                await this._loadFromServer();
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error uploading application:', error);
            await this._showMessage('Error uploading application: ' + error.message, 'Error');
        }
    }
    
    /**
     * Show application list dialog
     */
    _showAppListDialog(applications, sourceType) {
        const appItems = applications.map(app => `
            <div class="app-list-item" data-path="${app.path || app.name || app.id}" data-name="${app.name || app.label}">
                <div class="app-icon">📋</div>
                <div class="app-info">
                    <div class="app-name">${app.name || app.label || 'Unnamed'}</div>
                    <div class="app-path">${app.pffFiles ? app.pffFiles.join(', ') : (app.path || app.description || '')}</div>
                </div>
            </div>
        `).join('');
        
        const html = `
            <div class="app-list-dialog">
                <div class="app-list-header">
                    <button class="dialog-back" data-action="back">← Back</button>
                    <h2>Select Application</h2>
                    <button class="dialog-close" data-action="close">&times;</button>
                </div>
                <div class="app-list-body">
                    ${applications.length > 0 
                        ? `<div class="app-list">${appItems}</div>`
                        : `<div class="app-list-empty">No applications found</div>`
                    }
                </div>
            </div>
        `;
        
        this._showCustomDialog(html, {
            onInit: (dialog) => {
                dialog.querySelectorAll('.app-list-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const appPath = item.dataset.path;
                        const appName = item.dataset.name;
                        this._closeCustomDialog();
                        await this._loadSelectedApplication(appPath, appName, sourceType);
                    });
                });
            }
        });
    }
    
    /**
     * Load the selected application
     */
    async _loadSelectedApplication(appPath, appName, sourceType) {
        try {
            this._showLoading(`Loading ${appName}...`);
            console.log('[MFC] Loading application:', { appPath, appName, sourceType });
            
            let response;
            
            switch (sourceType) {
                case 'server':
                    console.log('[MFC] Fetching from server:', `/api/applications/${encodeURIComponent(appPath)}/files`);
                    response = await fetch(`/api/applications/${encodeURIComponent(appPath)}/files`);
                    break;
                case 'assets':
                    // Load embedded assets via server API (WASM runs on server)
                    console.log('[MFC] Loading embedded asset via server:', appPath);
                    await this._loadEmbeddedAsset(appPath, appName);
                    return;
                case 'csweb':
                    response = await fetch('/api/csweb/load', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...this._cswebConfig,
                            appId: appPath
                        })
                    });
                    break;
                default:
                    throw new Error('Unknown source type');
            }
            
            if (!response.ok) {
                throw new Error(`Failed to load application: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('[MFC] Received application data:', { 
                success: data.success, 
                name: data.name, 
                pffFile: data.pffFile, 
                fileCount: Object.keys(data.files || {}).length,
                fileNames: Object.keys(data.files || {})
            });
            
            if (data.success && data.files) {
                // Load the application files into the engine
                await this._initializeApplicationFromFiles(data.name || appName, data.pffFile, data.files);
            } else {
                throw new Error(data.error || 'Failed to load application files');
            }
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error loading application:', error);
            await this._showMessage('Error loading application: ' + error.message, 'Error');
        }
    }
    
    /**
     * Load embedded application from WASM assets via server API
     * The WASM module runs on the server, so we use the server API to load embedded assets
     */
    async _loadEmbeddedAsset(pffPath, appName) {
        console.log('[MFC] Loading embedded asset via server:', pffPath, appName);
        
        this._showLoading('Loading embedded application...');
        
        try {
            // First, ensure we have a session with the server
            if (!this._sessionId) {
                await this._initializeServerProxy();
            }
            
            if (!this._sessionId) {
                throw new Error('No server session available');
            }
            
            // Load the embedded application via the server
            const loadResponse = await fetch(`/api/cspro/session/${this._sessionId}/load-embedded`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pffPath })
            });
            
            if (!loadResponse.ok) {
                const error = await loadResponse.json();
                throw new Error(error.error || 'Failed to load embedded application');
            }
            
            const loadResult = await loadResponse.json();
            console.log('[MFC] Embedded asset load result:', loadResult);
            
            if (!loadResult.success) {
                throw new Error(loadResult.error || 'Failed to load embedded application');
            }
            
            // Start the entry session
            const startResult = await this.engine.start();
            if (!startResult) {
                throw new Error('Failed to start session on server');
            }
            
            // Store app name
            this._appName = appName;
            
            // Get form data from engine
            let forms = [];
            if (this.engine?.getFormData) {
                let formData = this.engine.getFormData();
                if (formData?.then) formData = await formData;
                
                if (formData?.success && formData?.formFiles?.length > 0) {
                    forms = formData.formFiles[0].forms || [];
                    this.isPathOn = formData.formFiles[0].pathOn !== false;
                    console.log(`[MFC] Loaded ${forms.length} forms, pathOn=${this.isPathOn}`);
                }
                
                this.currentApp = {
                    name: formData?.applicationName || appName || 'Application',
                    dictionaries: [],
                    forms: forms,
                    pathOn: this.isPathOn
                };
            }
            
            this._renderApplication();
            this._hideLoading();
            
            this.dispatchEvent(new CustomEvent('applicationLoaded', {
                detail: { name: this.currentApp?.name }
            }));
            
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error loading embedded asset:', error);
            await this._showMessage('Error loading application: ' + error.message, 'Error');
        }
    }
    
    /**
     * Load application from WASM assets filesystem (legacy - now uses server API)
     * @deprecated Use _loadEmbeddedAsset instead
     */
    async _loadFromWasmAssets(pffPath, appName) {
        // Redirect to server-based loading
        return this._loadEmbeddedAsset(pffPath, appName);
    }
    
    /**
     * Initialize application from loaded files
     */
    async _initializeApplicationFromFiles(appName, pffFile, files) {
        console.log('[MFC] Initializing application:', appName, 'PFF:', pffFile);
        
        // Store files for engine access
        this._appFiles = files;
        this._appName = appName;
        
        if (pffFile && files[pffFile]) {
            // Use the existing loadApplicationFromFiles method
            await this.loadApplicationFromFiles(files, pffFile);
        } else {
            // Try to find an .ent or .pen file
            const entFile = Object.keys(files).find(f => f.toLowerCase().endsWith('.ent'));
            const penFile = Object.keys(files).find(f => f.toLowerCase().endsWith('.pen'));
            
            if (entFile || penFile) {
                console.log('[MFC] No PFF file, using:', entFile || penFile);
                // Create a minimal PFF content and add it to files
                const appFile = entFile || penFile;
                const pffContent = `[Run Information]\nVersion=CSPro 8.0\nAppType=Entry\n\n[Files]\nApplication=${appFile}\n`;
                files['generated.pff'] = pffContent;
                await this.loadApplicationFromFiles(files, 'generated.pff');
            } else {
                throw new Error('No application file (.pff, .ent, or .pen) found');
            }
        }
    }
    
    /**
     * Show custom dialog
     */
    _showCustomDialog(html, options = {}) {
        const overlay = this.$.dialogOverlay;
        const container = this.$.dialogContainer;
        
        container.innerHTML = html;
        overlay.style.display = 'flex';
        
        // Init callback
        if (options.onInit) {
            options.onInit(container);
        }
        
        // Bind actions
        container.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', async (e) => {
                const action = el.dataset.action;
                
                if (action === 'close' || action === 'cancel' || action === 'back') {
                    this._closeCustomDialog();
                } else if (options.onAction) {
                    const shouldClose = await options.onAction(action, container);
                    if (shouldClose) {
                        this._closeCustomDialog();
                    }
                }
            });
        });
        
        // Click backdrop to close
        overlay.querySelector('.dialog-backdrop')?.addEventListener('click', () => {
            this._closeCustomDialog();
        });
    }
    
    /**
     * Close custom dialog
     */
    _closeCustomDialog() {
        this.$.dialogOverlay.style.display = 'none';
        this.$.dialogContainer.innerHTML = '';
    }
    
    /**
     * Show loading overlay
     */
    _showLoading(message = 'Loading...') {
        const overlay = this.$.loadingOverlay;
        const textEl = overlay?.querySelector('.loading-text');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        if (textEl) {
            textEl.textContent = message;
        }
    }
    
    /**
     * Hide loading overlay
     */
    _hideLoading() {
        if (this.$.loadingOverlay) {
            this.$.loadingOverlay.style.display = 'none';
        }
    }
    
    /**
     * Toggle a menu dropdown
     * @param {HTMLElement} menuItem - The menu item to toggle
     */
    _toggleMenu(menuItem) {
        const wasOpen = menuItem.classList.contains('open');
        this._closeAllMenus();
        if (!wasOpen) {
            menuItem.classList.add('open');
        }
    }
    
    /**
     * Close all open menus
     */
    _closeAllMenus() {
        this.shadowRoot.querySelectorAll('.menu-item.open').forEach(item => {
            item.classList.remove('open');
        });
    }
    
    /**
     * Web component lifecycle - connected to DOM
     */
    connectedCallback() {
        console.log('[MFC] CSEntryMFCView connected');
    }
    
    /**
     * Web component lifecycle - disconnected from DOM
     */
    disconnectedCallback() {
        // Clean up blob URLs
        if (this._capiBlobUrl) {
            URL.revokeObjectURL(this._capiBlobUrl);
        }
        if (this.$.capiIframe._blobUrl) {
            URL.revokeObjectURL(this.$.capiIframe._blobUrl);
        }
    }
    
    // ==================== MENU/UI HANDLERS ====================
    
    /**
     * Handle menu action
     * @param {string} action - Action name
     */
    _handleMenuAction(action) {
        switch (action) {
            case 'open': this._showOpenDialog(); break;
            case 'openData': this._showOpenDialog(); break;
            case 'save': this.saveCase(); break;
            case 'exit': window.close(); break;
            case 'addCase': this.addCase(); break;
            case 'modifyCase': this.modifyCase(); break;
            case 'verifyCase': this.verifyCase(); break;
            case 'pause': this.pauseEntry(); break;
            case 'stop': this.stopEntry(); break;
            case 'insertCase': this.insertCase(); break;
            case 'deleteCase': this.deleteCase(); break;
            case 'findCase': this._showFindDialog(); break;
            case 'insertGroupOcc': this.insertOcc(); break;
            case 'deleteGroupOcc': this.deleteOcc(); break;
            case 'sortGroupOcc': this.sortOcc(); break;
            case 'prevScreen': this.previousScreen(); break;
            case 'nextScreen': this.nextScreen(); break;
            case 'firstCase': this.firstCase(); break;
            case 'prevCase': this.previousCase(); break;
            case 'nextCase': this.nextCase(); break;
            case 'lastCase': this.lastCase(); break;
            case 'endGroupOcc': this.endGroupOcc(); break;
            case 'endGroup': this.endGroup(); break;
            case 'goTo': this._showGoToDialog(); break;
            case 'fullScreen': this._toggleFullScreen(); break;
            case 'toggleCaseTree': this._toggleCaseTree(); break;
            case 'toggleNames': this._toggleNames(); break;
            case 'changeLanguage': this._showLanguageDialog(); break;
            case 'showResponses': this._toggleResponses(); break;
            case 'helpTopics': this._showHelp(); break;
            case 'about': this._showAbout(); break;
            default: console.log('[MFC] Unknown action:', action);
        }
    }
    
    /**
     * Show open application dialog
     */
    _showOpenDialog() {
        // Create file input for selecting PFF file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pff,.ent,.pen';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const content = await file.text();
                    // Create a files object and use loadApplicationFromFiles
                    const files = { [file.name]: content };
                    await this.loadApplicationFromFiles(files, file.name);
                } catch (err) {
                    console.error('[MFC] Error loading file:', err);
                    await this._showMessage('Error loading application: ' + err.message, 'Error');
                }
            }
        };
        input.click();
    }
    
    /**
     * Show find case dialog
     */
    _showFindDialog() {
        console.log('[MFC] Find dialog - not implemented yet');
    }
    
    /**
     * Show go to dialog
     */
    _showGoToDialog() {
        console.log('[MFC] Go To dialog - not implemented yet');
    }
    
    /**
     * Toggle full screen mode
     */
    _toggleFullScreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this.requestFullscreen();
        }
    }
    
    /**
     * Toggle case tree panel visibility
     */
    _toggleCaseTree() {
        const panel = this.$.treePanel;
        const splitter = this.$.splitter;
        if (panel.style.display === 'none') {
            panel.style.display = '';
            splitter.style.display = '';
        } else {
            panel.style.display = 'none';
            splitter.style.display = 'none';
        }
    }
    
    /**
     * Toggle names in case tree
     */
    _toggleNames() {
        console.log('[MFC] Toggle names - not implemented yet');
    }
    
    /**
     * Show language dialog
     */
    _showLanguageDialog() {
        console.log('[MFC] Language dialog - not implemented yet');
    }
    
    /**
     * Toggle responses panel
     */
    _toggleResponses() {
        const panel = this.$.capiPanel;
        if (panel.classList.contains('visible')) {
            panel.classList.remove('visible');
        } else {
            panel.classList.add('visible');
        }
    }
    
    /**
     * Show help
     */
    _showHelp() {
        window.open('https://www.census.gov/data/software/cspro/resources.html', '_blank');
    }
    
    /**
     * Show about dialog
     */
    async _showAbout() {
        await this._showMessage(
            'A web-based implementation of CSPro Data Entry\n\nBased on CSPro by the U.S. Census Bureau',
            'CSEntry Web'
        );
    }
    
    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    _showLoading(message = 'Loading...') {
        const overlay = this.$.loadingOverlay;
        const text = overlay.querySelector('.loading-text');
        if (text) text.textContent = message;
        overlay.style.display = 'flex';
    }
    
    /**
     * Hide loading overlay
     */
    _hideLoading() {
        this.$.loadingOverlay.style.display = 'none';
    }
    
    // ==================== PUBLIC API ====================
    
    /**
     * Set the CSPro engine instance
     * @param {Object} engine - CSPro WASM engine or proxy
     */
    setEngine(engine) {
        this.engine = engine;
        console.log('[MFC] Engine set:', !!engine);
    }
    
    /**
     * Set the WASM module reference (for virtual file access)
     * @param {Object} wasmModule - Emscripten module
     */
    setWasmModule(wasmModule) {
        this._wasmModule = wasmModule;
    }
    
    /**
     * Use server-side engine proxy
     * @param {string} baseUrl - Server base URL
     * @param {string} sessionId - Session identifier
     */
    useServerProxy(baseUrl, sessionId) {
        this.engine = createServerSideEngineProxy(baseUrl, sessionId);
        this._sessionId = sessionId; // Store session ID for CAPI renderer
        console.log('[MFC] Using server-side proxy, sessionId:', sessionId);
    }
    
    /**
     * Initialize WASM module and engine if not already done
     * This is called automatically when loading an application
     * 
     * IMPORTANT: Prefers server-side proxy when available for full logic interpreter support
     */
    async _initializeWasm() {
        if (this.engine && (this._wasmModule || this._sessionId)) {
            return; // Already initialized
        }
        
        console.log('[MFC] Initializing CSPro engine...');
        this._showLoading('Initializing CSPro engine...');
        
        try {
            // First, try to use server-side proxy (preferred for full Action Invoker support)
            const serverAvailable = await this._checkServerAvailability();
            
            if (serverAvailable) {
                console.log('[MFC] Server available, using server-side proxy for full logic interpreter support');
                await this._initializeServerProxy();
                return;
            }
            
            // Fall back to client-side WASM (limited - no evalLogic/invokeLogicFunction)
            console.log('[MFC] Server not available, falling back to client-side WASM');
            await this._initializeClientWasm();
            
        } catch (error) {
            console.error('[MFC] Failed to initialize CSPro engine:', error);
            throw new Error('Failed to initialize CSPro engine: ' + error.message);
        }
    }
    
    /**
     * Check if server-side WASM API is available
     */
    async _checkServerAvailability() {
        try {
            const response = await fetch('/api/cspro/health', { 
                method: 'GET',
                signal: AbortSignal.timeout(2000) // 2 second timeout
            });
            const data = await response.json();
            return data.wasmInitialized === true;
        } catch (e) {
            console.log('[MFC] Server check failed:', e.message);
            return false;
        }
    }
    
    /**
     * Initialize server-side engine proxy
     */
    async _initializeServerProxy() {
        // Create a session on the server
        const response = await fetch('/api/cspro/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        
        if (!data.success || !data.sessionId) {
            throw new Error('Failed to create server session');
        }
        
        this._sessionId = data.sessionId;
        this.engine = createServerSideEngineProxy(this, this._sessionId);
        console.log('[MFC] Server-side proxy initialized, sessionId:', this._sessionId);
    }
    
    /**
     * Initialize client-side WASM module directly
     * Note: This mode has limited functionality (no evalLogic/invokeLogicFunction)
     */
    async _initializeClientWasm() {
        // Dynamically import the CSPro WASM module
        const { default: createCSProModule } = await import('/CSPro.js');
        
        // Create the module instance
        this._wasmModule = await createCSProModule({
            print: (text) => console.log('[CSPro]', text),
            printErr: (text) => console.error('[CSPro]', text),
            // Locate WASM and data files in the root
            locateFile: (path) => {
                console.log('[MFC] Locating file:', path);
                return '/' + path;
            },
            // Status callback for loading progress
            setStatus: (text) => {
                if (text) {
                    console.log('[CSPro Status]', text);
                    this._showLoading(text);
                }
            }
        });
        
        console.log('[MFC] WASM module loaded successfully');
        console.log('[MFC] Available exports:', Object.keys(this._wasmModule).slice(0, 20));
        
        // Create CSProEngine instance
        if (this._wasmModule.CSProEngine) {
            this.engine = new this._wasmModule.CSProEngine();
            console.log('[MFC] CSProEngine created successfully (client-side, limited features)');
        } else {
            console.error('[MFC] Available module exports:', Object.keys(this._wasmModule));
            throw new Error('CSProEngine class not found in WASM module');
        }
    }
    
    /**
     * Load application from PFF content
     * @param {string} pffContent - PFF file content
     * @param {Object} files - Additional files keyed by filename
     */
    async loadApplicationFromContent(pffContent, files = {}) {
        this._showLoading('Loading application...');
        
        try {
            // Initialize engine if not already done (prefers server proxy)
            await this._initializeWasm();
            
            // Check if using server proxy or client-side WASM
            if (this._sessionId && this.engine?.loadApplicationWithFiles) {
                // Server proxy mode - upload files to server
                console.log('[MFC] Loading application via server proxy');
                
                const loadResult = await this.engine.loadApplicationWithFiles(pffContent, files);
                if (!loadResult) throw new Error('Failed to load application on server');
                
                const startResult = await this.engine.start();
                if (!startResult) throw new Error('Failed to start session on server');
                
            } else if (this._wasmModule?.FS) {
                // Client-side WASM mode - write files to virtual filesystem
                console.log('[MFC] Loading application via client-side WASM');
                
                const FS = this._wasmModule.FS;
                const tempDir = '/tmp/cspro_' + Date.now();
                
                try {
                    FS.mkdirTree(tempDir);
                } catch (e) { /* may exist */ }
                
                let pffPath = null;
                
                // Write all files
                for (const [filename, content] of Object.entries(files)) {
                    const filePath = tempDir + '/' + filename;
                    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                    
                    try {
                        FS.mkdirTree(dir);
                    } catch (e) { /* may exist */ }
                    
                    try {
                        if (typeof content === 'string') {
                            FS.writeFile(filePath, content);
                        } else if (content?.type === 'binary' && content?.data) {
                            const binary = atob(content.data);
                            const bytes = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) {
                                bytes[i] = binary.charCodeAt(i);
                            }
                            FS.writeFile(filePath, bytes);
                        }
                        
                        if (filename.toLowerCase().endsWith('.pff')) {
                            pffPath = filePath;
                        }
                    } catch (e) {
                        console.warn('Failed to write file:', filename, e);
                    }
                }
                
                const initPath = pffPath || pffContent;
                console.log('[MFC] Initializing from:', initPath);
                
                let initResult = this.engine.initApplication(initPath);
                if (initResult?.then) initResult = await initResult;
                if (!initResult) throw new Error('Failed to initialize application');
                
                let startResult = this.engine.start();
                if (startResult?.then) startResult = await startResult;
                if (!startResult) throw new Error('Failed to start session');
            } else {
                throw new Error('No engine available');
            }
            
            // Get form data from engine
            let forms = [];
            if (this.engine?.getFormData) {
                let formData = this.engine.getFormData();
                if (formData?.then) formData = await formData;
                
                if (formData?.success && formData?.formFiles?.length > 0) {
                    forms = formData.formFiles[0].forms || [];
                    this.isPathOn = formData.formFiles[0].pathOn !== false;
                    console.log(`[MFC] Loaded ${forms.length} forms, pathOn=${this.isPathOn}`);
                }
                
                this.currentApp = {
                    name: formData?.applicationName || 'Application',
                    dictionaries: [],
                    forms: forms,
                    pathOn: this.isPathOn
                };
            }
            
            this._renderApplication();
            this._hideLoading();
            
            this.dispatchEvent(new CustomEvent('applicationLoaded', {
                detail: { name: this.currentApp?.name }
            }));
            
        } catch (error) {
            this._hideLoading();
            this._showError('Failed to load application: ' + error.message);
        }
    }
    
    /**
     * Load application from files object
     * @param {Object} files - Files keyed by filename
     * @param {string} pffFileName - Name of the PFF file
     */
    async loadApplicationFromFiles(files, pffFileName) {
        let pffContent = files[pffFileName];
        if (typeof pffContent !== 'string') {
            if (pffContent?.type === 'binary' && pffContent?.data) {
                pffContent = atob(pffContent.data);
            } else {
                throw new Error('Invalid PFF file content');
            }
        }
        await this.loadApplicationFromContent(pffContent, files);
    }
    
    /**
     * Add a new case
     */
    async addCase() {
        if (!this.engine) {
            console.warn('[MFC] No engine available');
            return;
        }
        
        // Render first form
        if (this.currentApp?.forms?.length > 0) {
            this._renderForm(this.currentApp.forms[0]);
        }
        
        // Get current page from engine
        let pageResult = this.engine.getCurrentPage?.();
        if (pageResult?.then) pageResult = await pageResult;
        
        this._currentPageResult = pageResult;
        
        if (pageResult?.fields?.length > 0) {
            const firstField = pageResult.fields[0];
            
            // Find and focus the field element
            let fieldElement = this._findFieldElement(firstField);
            if (fieldElement) {
                const inputEl = fieldElement.querySelector('input, select') || fieldElement;
                setTimeout(() => {
                    inputEl.focus?.();
                    inputEl.select?.();
                    inputEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                }, 10);
            }
            
            // Update status
            const occStr = (firstField.indexes?.[0] > 0) ? `[${firstField.indexes[0]}]` : '';
            const pathMode = this.isPathOn ? 'System Path' : 'Free Movement';
            this._updateStatus(firstField.name + occStr, '', `Add Mode | ${pathMode}`);
            
            this.currentField = firstField;
            await this._showCAPI(firstField, pageResult);
            
            // Update rosters
            if (this._rosters) {
                for (const rosterName in this._rosters) {
                    this._updateRosterFromEngine(rosterName);
                }
            }
        }
        
        this._buildCaseTree();
        this.dispatchEvent(new CustomEvent('caseStarted', { detail: { isNew: true } }));
    }
    
    /**
     * Save current case
     */
    saveCase() {
        if (!this.engine?.isSessionActive?.()) return;
        
        const saved = this.engine.endCase?.(true);
        if (saved) {
            this.dispatchEvent(new CustomEvent('caseSaved'));
            this._showMessage('Case saved successfully');
        } else {
            this._showError('Failed to save case');
        }
    }
    
    /**
     * Navigate to next field - uses engine for CSPro logic execution
     */
    async nextField() {
        const currentInput = this._getCurrentFieldInput();
        const value = currentInput?.value ?? '';
        await this._advanceWithValue(value);
    }
    
    /**
     * Navigate to previous field
     */
    async previousField() {
        if (this.engine?.previousField) {
            try {
                let result = this.engine.previousField();
                if (result?.then) result = await result;
                if (result?.fields?.length > 0) {
                    this._currentPageResult = result;
                    const newField = result.fields[result.currentFieldIndex ?? 0] || result.fields[0];
                    
                    const fieldElement = this._findFieldElement(newField);
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
                    this.currentField = newField;
                    await this._showCAPI(newField, result);
                    
                    const occStr = newField.indexes?.[0] > 0 ? `[${newField.indexes[0]}]` : '';
                    this._updateStatus(newField.name + occStr);
                }
            } catch (e) {
                console.error('[MFC] Error in previousField:', e);
            }
        } else {
            console.error('[MFC] Engine previousField not available');
        }
    }
    
    /**
     * Go to specific field - uses engine for CSPro navigation
     * @param {string} fieldName - Field name
     * @param {number} occurrence - Occurrence number
     */
    async goToField(fieldName, occurrence = 1) {
        if (this.engine?.goToField) {
            try {
                let result = this.engine.goToField(fieldName, occurrence, 0, 0);
                if (result?.then) result = await result;
                
                if (result?.fields?.length > 0) {
                    this._currentPageResult = result;
                    const newField = result.fields[result.currentFieldIndex ?? 0] || result.fields[0];
                    
                    const fieldElement = this._findFieldElement(newField);
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
                    this.currentField = newField;
                    await this._showCAPI(newField, result);
                    
                    const occStr = newField.indexes?.[0] > 0 ? `[${newField.indexes[0]}]` : '';
                    this._updateStatus(newField.name + occStr);
                    
                    // Update navigation index
                    const navIdx = this.navigationFields.findIndex(nf => 
                        nf.name === fieldName && nf.occurrence === occurrence
                    );
                    if (navIdx >= 0) this.currentNavIndex = navIdx;
                }
            } catch (e) {
                console.error('[MFC] Error in goToField:', e);
            }
        } else {
            console.error('[MFC] Engine goToField not available');
        }
    }
    
    // ==================== PRIVATE METHODS ====================
    
    /**
     * Render the loaded application
     */
    _renderApplication() {
        if (!this.currentApp) return;
        
        this.$.appName.textContent = this.currentApp.name;
        
        // Render first form if available
        if (this.currentApp.forms?.length > 0) {
            this._renderForm(this.currentApp.forms[0]);
        }
        
        this._buildCaseTree();
    }
    
    /**
     * Render a form
     * @param {Object} form - Form definition
     */
    _renderForm(form) {
        console.log('[MFC] _renderForm called, form:', form?.name);
        console.log('[MFC] this.$.formContainer:', this.$.formContainer);
        
        this.currentForm = form;
        
        const result = renderForm(this.$.formContainer, form, {
            createFieldElement: (field, idx) => this._createFieldElement(field, idx),
            createRosterTable: (roster) => this._createRosterTable(roster),
            setupFieldEvents: (field, el) => this._setupFieldEvents(field, el)
        });
        
        this._rosters = result.rosters;
        
        // Build navigation
        this.navigationFields = buildNavigationFields(form);
        this.currentNavIndex = 0;
        
        this._updateStatus('Ready');
    }
    
    /**
     * Create field element with event handling
     */
    _createFieldElement(field, fieldIndex) {
        return createFieldElement(field, fieldIndex, {
            onValueChange: (f, value) => this._onCaptureTypeValueChange(f, value),
            onCheckboxChange: (f, container) => this._onCheckboxChange(f, container)
        });
    }
    
    /**
     * Create roster table with event handling
     */
    _createRosterTable(roster) {
        return createRosterTable(roster, {
            onFocus: (e, field, rowIdx, r, input) => this._onRosterCellFocus(e, field, rowIdx, r, input),
            onBlur: (e, field, rowIdx, r, input) => this._onRosterCellBlur(e, field, rowIdx, r, input),
            onKeyDown: (e, field, rowIdx, r, input) => this._onRosterCellKeyDown(e, field, rowIdx, r, input),
            onInput: (e, field, rowIdx, r, input) => this._onRosterCellInput(e, field, rowIdx, r, input),
            onClick: (e, field, rowIdx, r, input) => this._onRosterCellClick(e, field, rowIdx, r, input),
            onCheckboxChange: (field, container, rowIdx, roster) => this._onRosterCheckboxChange(field, container, rowIdx, roster),
            onCheckboxDialogRequest: (field, container, rowIdx, roster, input) => this._onRosterCheckboxDialogRequest(field, container, rowIdx, roster, input)
        });
    }
    
    /**
     * Handle roster checkbox dialog request - opens native checkbox selection dialog
     */
    async _onRosterCheckboxDialogRequest(field, container, rowIdx, roster, input) {
        console.log('[MFC] _onRosterCheckboxDialogRequest:', field.name, 'row:', rowIdx);
        
        if (!this.engine) {
            console.warn('[MFC] No engine available for checkbox dialog');
            return;
        }
        
        try {
            const occurrence = rowIdx + 1;
            
            // Get responses for this field from engine
            // First, we need to get responses for the field (move to it briefly if needed)
            let responses = [];
            
            // Try to get responses from the engine
            if (this.engine.getResponses) {
                responses = await this.engine.getResponses(field.name);
            } else if (this.engine.getCurrentPage) {
                // Try to get from current page - may need to move to field first
                const page = await this.engine.getCurrentPage();
                if (page?.fields?.[0]?.responses) {
                    responses = page.fields[0].responses;
                }
            }
            
            // If no responses from engine, try to get value set from form definition
            if (!responses || responses.length === 0) {
                responses = field.responses || field.valueSet || [];
            }
            
            if (responses.length === 0) {
                console.warn('[MFC] No responses available for checkbox field:', field.name);
                // Show a message to user
                if (this.dialogHandler) {
                    await this.dialogHandler.showSimpleMessageDialog({
                        title: 'No Value Set',
                        message: `No value set defined for field ${field.label || field.name}`,
                        buttons: [{ index: 1, caption: 'OK' }],
                        defaultButtonIndex: 1
                    });
                }
                return;
            }
            
            // Show checkbox selection dialog
            const currentValue = input.value || '';
            const selectedValues = await this.dialogHandler.showCheckboxSelectionDialog(
                field, 
                responses, 
                currentValue
            );
            
            console.log('[MFC] Checkbox dialog result:', selectedValues);
            
            if (selectedValues !== null) {
                // Update input value
                input.value = selectedValues;
                
                // Store the value
                this._storeFieldValue(field.name, selectedValues, occurrence);
                
                // Send to engine
                if (this.engine.setFieldValue) {
                    await this.engine.setFieldValue(field.name, selectedValues, occurrence);
                }
            }
            
            // Return focus to input
            input.focus();
            
        } catch (error) {
            console.error('[MFC] Checkbox dialog error:', error);
        }
    }
    
    /**
     * Handle roster checkbox field change
     */
    _onRosterCheckboxChange(field, container, rowIdx, roster) {
        const maxSelections = parseInt(container.dataset.maxSelections) || 999;
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
        
        // Enable/disable checkboxes based on max selections
        if (checkedBoxes.length >= maxSelections) {
            checkboxes.forEach(cb => { if (!cb.checked) cb.disabled = true; });
        } else {
            checkboxes.forEach(cb => cb.disabled = false);
        }
        
        // Get selected values
        const values = Array.from(checkedBoxes).map(cb => cb.value);
        const occurrence = rowIdx + 1;
        
        // Store the checkbox value
        this._storeFieldValue(field.name, values.join(''), occurrence);
    }
    
    /**
     * Set up field event handlers
     */
    _setupFieldEvents(field, element) {
        const input = element.querySelector?.('input, select') || element;
        
        input.addEventListener('focus', () => this._onFieldFocus(field, input));
        input.addEventListener('blur', () => this._onFieldBlur(field, input));
        input.addEventListener('keydown', (e) => this._onFieldKeyDown(e, field, input));
        input.addEventListener('input', () => this._onFieldInput(field, input));
    }
    
    /**
     * Find field element in DOM
     */
    _findFieldElement(field) {
        let element = null;
        
        if (field.indexes?.[0] > 0) {
            // Roster field
            const rowIndex = field.indexes[0] - 1;
            element = this.$.formContainer.querySelector(
                `input[data-field-name="${field.name}"][data-row-index="${rowIndex}"], ` +
                `select[data-field-name="${field.name}"][data-row-index="${rowIndex}"], ` +
                `.roster-field-container[data-field-name="${field.name}"][data-row-index="${rowIndex}"]`
            );
        }
        
        if (!element) {
            element = this.$.formContainer.querySelector(`[data-field-name="${field.name}"]`);
        }
        
        return element;
    }
    
    // ==================== NAVIGATION ====================
    // Note: All navigation MUST go through the CSPro WASM engine.
    // The _advanceToNextField and _advanceToPreviousField methods are
    // ONLY used for UI updates like tree display, not for actual navigation.
    
    /**
     * Internal: Update UI state for field navigation (tree, visited markers)
     * This does NOT replace engine-based navigation.
     * @private
     */
    _advanceToNextField() {
        // WARNING: This is only for UI bookkeeping. Use nextField() for actual navigation.
        if (this.navigationFields.length === 0) return;
        
        const currentInput = this._getCurrentFieldInput();
        if (currentInput) {
            const currentNav = this.navigationFields[this.currentNavIndex];
            if (currentNav) {
                currentNav.value = currentInput.value;
                currentInput.classList.add('visited');
                updateTreeValue(this.$.treeContent, currentNav.name, currentInput.value);
            }
        }
        
        const nextIndex = this.currentNavIndex + 1;
        if (nextIndex >= this.navigationFields.length) {
            this._handleEndOfCase();
            return;
        }
        
        this.currentNavIndex = nextIndex;
        this._focusNavigationField(nextIndex);
    }
    
    async _advanceWithValue(value) {
        console.log('[MFC] _advanceWithValue called with value:', value);
        if (this.engine?.setFieldValueAndAdvance) {
            try {
                this._wasmBusy = true;
                console.log('[MFC] Calling engine.setFieldValueAndAdvance...');
                let result = this.engine.setFieldValueAndAdvance(value);
                if (result?.then) result = await result;
                this._wasmBusy = false;
                
                console.log('[MFC] setFieldValueAndAdvance result:', result);
                console.log('[MFC] Result fields count:', result?.fields?.length);
                console.log('[MFC] Result dialogs:', result?.dialogs);
                
                if (result?.fields?.length > 0) {
                    this._currentPageResult = result;
                    const currentFieldIndex = result.currentFieldIndex ?? 0;
                    const newField = result.fields[currentFieldIndex] || result.fields[0];
                    
                    console.log('[MFC] New field:', newField.name, 'captureType:', newField.captureType, 'indexes:', newField.indexes);
                    console.log('[MFC] Field responses count:', newField.responses?.length || 0);
                    
                    // Check if needs select dialog
                    const CT = CAPTURE_TYPES;
                    const captureType = newField.captureType ?? CT.TextBox;
                    const responses = newField.responses || [];
                    const hasValueSet = responses.length > 0;
                    const isRosterField = newField.indexes?.[0] > 0;
                    const isDropDownOrCombo = captureType === CT.DropDown || captureType === CT.ComboBox;
                    const isRadioButton = captureType === CT.RadioButton;
                    const isCheckBox = captureType === CT.CheckBox;
                    
                    // Show dialog for: roster fields with value set, dropdown/combo, radio buttons, checkboxes
                    const needsSelectDialog = hasValueSet && (isRosterField || isDropDownOrCombo || isRadioButton);
                    const needsCheckboxDialog = hasValueSet && isCheckBox;
                    
                    console.log('[MFC] Value set check: hasValueSet=', hasValueSet, 'isRosterField=', isRosterField, 
                                'isDropDownOrCombo=', isDropDownOrCombo, 'isRadioButton=', isRadioButton,
                                'isCheckBox=', isCheckBox, 'needsSelectDialog=', needsSelectDialog,
                                'needsCheckboxDialog=', needsCheckboxDialog);
                    
                    // Show multi-select checkbox dialog for checkbox capture type
                    if (needsCheckboxDialog) {
                        console.log('[MFC] Showing checkbox multi-select dialog for field:', newField.name);
                        this.dialogHandler.showCheckboxSelectionDialog(newField, responses, '').then(selectedValue => {
                            console.log('[MFC] Checkbox dialog returned value:', selectedValue);
                            if (selectedValue != null && selectedValue !== '') {
                                updateFieldDisplayValue(this.$.formContainer, newField, String(selectedValue));
                                this._advanceWithValue(String(selectedValue));
                            } else {
                                console.log('[MFC] Checkbox dialog cancelled or no value');
                            }
                        }).catch(err => {
                            console.error('[MFC] Checkbox dialog error:', err);
                        });
                        return;
                    }
                    
                    if (needsSelectDialog) {
                        console.log('[MFC] Showing select dialog for field:', newField.name);
                        this._showFieldSelectDialog(newField).then(selectedValue => {
                            console.log('[MFC] Select dialog returned value:', selectedValue);
                            if (selectedValue != null) {
                                updateFieldDisplayValue(this.$.formContainer, newField, String(selectedValue));
                                this._advanceWithValue(String(selectedValue));
                            } else {
                                console.log('[MFC] Select dialog cancelled or no value');
                            }
                        }).catch(err => {
                            console.error('[MFC] Select dialog error:', err);
                        });
                        return;
                    }
                    
                    // Focus the new field
                    const fieldElement = this._findFieldElement(newField);
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
                    this.currentField = newField;
                    await this._showCAPI(newField, result);
                    
                    // Update rosters
                    if (newField.indexes?.[0] > 0 && this._rosters) {
                        for (const rosterName in this._rosters) {
                            this._updateRosterFromEngine(rosterName);
                        }
                    }
                    
                    const occStr = newField.indexes?.[0] > 0 ? `[${newField.indexes[0]}]` : '';
                    this._updateStatus(newField.name + occStr);
                    return;
                }
            } catch (e) {
                this._wasmBusy = false;
                console.error('[MFC] Error in setFieldValueAndAdvance:', e);
                throw e; // Re-throw - no fallback, engine is required
            }
        } else {
            console.error('[MFC] Engine setFieldValueAndAdvance not available - engine is required');
            throw new Error('CSPro engine is required for field advancement');
        }
    }
    
    /**
     * Select a value from CAPI/value set response and advance
     * Called by DialogHandler when user selects a value from value set dialog
     * @param {string} fieldName - Name of the field
     * @param {string|number} value - Selected value code
     */
    async _selectCAPIResponse(fieldName, value) {
        console.log('[MFC] _selectCAPIResponse:', fieldName, value);
        
        // Update the field display
        if (this.currentField) {
            updateFieldDisplayValue(this.$.formContainer, this.currentField, String(value));
        }
        
        // Advance to next field with the selected value
        await this._advanceWithValue(String(value));
    }
    
    /**
     * Internal: Update UI state for backward navigation (tree, nav index)
     * This does NOT replace engine-based navigation. Use previousField() instead.
     * @private
     */
    _advanceToPreviousField() {
        // WARNING: This is only for UI bookkeeping. Use previousField() for actual navigation.
        if (this.navigationFields.length === 0 || this.currentNavIndex <= 0) return;
        
        const currentInput = this._getCurrentFieldInput();
        if (currentInput) {
            const currentNav = this.navigationFields[this.currentNavIndex];
            if (currentNav) currentNav.value = currentInput.value;
        }
        
        this.currentNavIndex--;
        this._focusNavigationField(this.currentNavIndex);
    }
    
    _focusNavigationField(navIndex) {
        focusNavigationField(this.$.formContainer, this.navigationFields, navIndex, {
            updateCurrentField: (field) => { this.currentField = field; },
            updateStatus: (name) => this._updateStatus(name),
            showCAPI: (field) => this._showCAPI(field),
            highlightTreeField: (name) => highlightTreeField(this.$.treeContent, name)
        });
    }
    
    _getCurrentFieldInput() {
        return getCurrentFieldInput(this.$.formContainer, this.navigationFields, this.currentNavIndex);
    }
    
    _handleEndOfCase() {
        this._showMessage('End of case reached');
        // Could prompt to save here
    }
    
    // ==================== FIELD EVENTS ====================
    
    _onFieldFocus(field, input) {
        this.currentField = field;
        
        const navIdx = this.navigationFields.findIndex(nf => 
            nf.name === field.name && nf.occurrence === (parseInt(input.dataset.occurrence) || 1)
        );
        if (navIdx >= 0) this.currentNavIndex = navIdx;
        
        this._showCAPI(field);
        highlightTreeField(this.$.treeContent, field.name);
        
        const occ = input.dataset.occurrence ? `[${input.dataset.occurrence}]` : '';
        this._updateStatus(field.name + occ);
    }
    
    _onFieldBlur(field, input) {
        input.classList.add('visited');
        updateTreeValue(this.$.treeContent, field.name, input.value);
        this._storeFieldValue(field.name, input.value, parseInt(input.dataset.occurrence) || 1);
    }
    
    async _onFieldKeyDown(e, field, input) {
        switch (e.key) {
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey && e.key === 'Tab') {
                    await this.previousField();
                } else {
                    await this._advanceWithValue(input.value);
                }
                break;
            case 'Escape':
                const navField = this.navigationFields[this.currentNavIndex];
                if (navField) input.value = navField.value || '';
                break;
        }
    }
    
    async _onFieldInput(field, input) {
        // Validation
        if (field.type === 'numeric' || field.captureType === CAPTURE_TYPES.NumberPad) {
            input.value = input.value.replace(/[^0-9.-]/g, '');
        }
        if (field.isUpperCase) {
            input.value = input.value.toUpperCase();
        }
        
        // Auto-advance when full
        const maxLen = field.length || field.width || 20;
        if (input.value.length >= maxLen && this.isPathOn) {
            await this._advanceWithValue(input.value);
        }
    }
    
    // ==================== ROSTER EVENTS ====================
    
    async _onRosterCellFocus(e, field, rowIdx, roster, input) {
        highlightCurrentRow(this.$.formContainer, input);
        input.closest('.roster-field-container')?.classList.add('current');
        
        this.currentField = {
            ...field,
            roster: roster.name,
            occurrence: rowIdx + 1,
            indexes: [rowIdx + 1, 0, 0]
        };
        
        this._updateStatus(`${field.name}[${rowIdx + 1}]`);
        await this._showCAPI(this.currentField, this._currentPageResult);
        
        // Check if this field should display an HTML dialog based on capture type
        // Per MFC behavior: When entering a field, display HTML dialogs if capture type is appropriate
        const CT = CAPTURE_TYPES;
        const captureType = field.captureType ?? CT.TextBox;
        const responses = field.responses || [];
        const hasValueSet = responses.length > 0;
        
        // Determine if we need to show a dialog
        const isCheckBox = captureType === CT.CheckBox;
        const isRadioButton = captureType === CT.RadioButton;
        const isDropDown = captureType === CT.DropDown;
        const isComboBox = captureType === CT.ComboBox;
        
        // Show checkbox multi-select dialog for CheckBox capture type
        if (isCheckBox && hasValueSet) {
            console.log('[MFC] _onRosterCellFocus: Showing checkbox dialog for:', field.name);
            try {
                const currentValue = input.value || '';
                const selectedValues = await this.dialogHandler.showCheckboxSelectionDialog(
                    field, 
                    responses, 
                    currentValue
                );
                
                console.log('[MFC] Checkbox dialog result:', selectedValues);
                
                if (selectedValues !== null) {
                    input.value = selectedValues;
                    const occurrence = rowIdx + 1;
                    this._storeFieldValue(field.name, selectedValues, occurrence);
                    
                    if (this.engine?.setFieldValue) {
                        await this.engine.setFieldValue(field.name, selectedValues, occurrence);
                    }
                    
                    // Auto-advance if path is on
                    if (this.isPathOn) {
                        await this._advanceWithValue(selectedValues);
                    }
                }
            } catch (error) {
                console.error('[MFC] Checkbox dialog error:', error);
            }
            return;
        }
        
        // Show single-select dialog for RadioButton, DropDown, ComboBox capture types
        if ((isRadioButton || isDropDown || isComboBox) && hasValueSet) {
            console.log('[MFC] _onRosterCellFocus: Showing value set dialog for:', field.name, 'captureType:', captureType);
            try {
                const selectedValue = await this.dialogHandler.showValueSetDialog(field, responses);
                
                console.log('[MFC] Value set dialog result:', selectedValue);
                
                if (selectedValue !== null) {
                    input.value = String(selectedValue);
                    const occurrence = rowIdx + 1;
                    this._storeFieldValue(field.name, String(selectedValue), occurrence);
                    
                    if (this.engine?.setFieldValue) {
                        await this.engine.setFieldValue(field.name, String(selectedValue), occurrence);
                    }
                    
                    // Auto-advance if path is on
                    if (this.isPathOn) {
                        await this._advanceWithValue(String(selectedValue));
                    }
                }
            } catch (error) {
                console.error('[MFC] Value set dialog error:', error);
            }
            return;
        }
    }
    
    _onRosterCellBlur(e, field, rowIdx, roster, input) {
        input.closest('.roster-field-container')?.classList.remove('current');
    }
    
    async _onRosterCellKeyDown(e, field, rowIdx, roster, input) {
        const freeMovementMode = parseInt(input.closest('.form-roster')?.dataset.freeMovementMode || 0);
        
        switch (e.key) {
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                const value = input.value ?? '';
                if (e.shiftKey && e.key === 'Tab') {
                    await this.previousField();
                } else {
                    await this._advanceWithValue(value);
                }
                break;
                
            case 'ArrowDown':
            case 'ArrowUp':
                if (this.isPathOn !== false) {
                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                } else if (freeMovementMode === 2 || freeMovementMode === 0) {
                    e.preventDefault();
                    const newRow = e.key === 'ArrowDown' ? rowIdx + 1 : rowIdx - 1;
                    moveToRosterCell(this._rosters, this.$.formContainer, roster.name, field.name, newRow);
                }
                break;
                
            case 'ArrowLeft':
            case 'ArrowRight':
                if (this.isPathOn === false && (freeMovementMode === 1 || freeMovementMode === 0)) {
                    e.preventDefault();
                    const dir = e.key === 'ArrowRight' ? 1 : -1;
                    moveToRosterColumn(this._rosters, this.$.formContainer, roster.name, field.name, rowIdx, dir);
                }
                break;
        }
    }
    
    async _onRosterCellInput(e, field, rowIdx, roster, input) {
        const isNumeric = input.dataset.isNumeric === '1';
        
        if (isNumeric) {
            input.value = input.value.replace(/[^0-9.\-]/g, '');
        }
        if (field.isUpperCase) {
            input.value = input.value.toUpperCase();
        }
        
        // Update tickmarks
        const tickmarks = input.closest('.roster-field-container')?.querySelector('.roster-tickmarks');
        if (tickmarks) {
            const fieldLength = parseInt(input.maxLength) || 10;
            const decimalPlaces = field.decimalPlaces || field.fractionalPartLength || 0;
            updateTickmarkDisplay(input, tickmarks, fieldLength, decimalPlaces, isNumeric);
        }
        
        // Auto-advance
        const maxLen = parseInt(input.maxLength) || 20;
        if (input.value.length >= maxLen && this.isPathOn) {
            await this._advanceWithValue(input.value);
        }
    }
    
    async _onRosterCellClick(e, field, rowIdx, roster, input) {
        if (document.activeElement === input) return;
        
        const isSystemControlled = this.isPathOn !== false;
        
        if (isSystemControlled) {
            const engineField = this.currentField;
            if (engineField) {
                const engineOcc = engineField.indexes?.[0] || 1;
                if (engineField.name !== field.name || engineOcc !== rowIdx + 1) {
                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                    
                    // Refocus engine's current field
                    const engineRowIndex = engineOcc - 1;
                    const engineInput = this.$.formContainer.querySelector(
                        `input[data-field-name="${engineField.name}"][data-row-index="${engineRowIndex}"]`
                    );
                    engineInput?.focus();
                    return;
                }
            }
        }
        
        input.focus();
        input.select?.();
    }
    
    // ==================== CAPTURE TYPE HANDLERS ====================
    
    async _onCaptureTypeValueChange(field, value) {
        this._storeFieldValue(field.name, value, 1);
        if (this.isPathOn) {
            await this._advanceWithValue(value);
        }
    }
    
    _onCheckboxChange(field, container) {
        const maxSelections = parseInt(container.dataset.maxSelections) || 999;
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
        
        if (checkedBoxes.length >= maxSelections) {
            checkboxes.forEach(cb => { if (!cb.checked) cb.disabled = true; });
        } else {
            checkboxes.forEach(cb => cb.disabled = false);
        }
        
        const values = Array.from(checkedBoxes).map(cb => cb.value);
        this._storeFieldValue(field.name, values.join(','), 1);
    }
    
    // ==================== DIALOGS ====================
    
    async _showFieldSelectDialog(field) {
        console.log('[MFC] _showFieldSelectDialog called for field:', field.name);
        const responses = field.responses || [];
        console.log('[MFC] Field responses:', responses.length, responses);
        if (responses.length === 0) {
            console.log('[MFC] No responses, returning null');
            return null;
        }
        
        console.log('[MFC] Calling dialogHandler.showValueSetDialog');
        try {
            const result = await this.dialogHandler.showValueSetDialog(field, responses);
            console.log('[MFC] showValueSetDialog returned:', result);
            return result;
        } catch (err) {
            console.error('[MFC] showValueSetDialog error:', err);
            throw err;
        }
    }
    
    // ==================== CAPI ====================
    
    async _showCAPI(field, pageResult = null) {
        await showCAPI(
            this.$.capiPanel,
            this.$.capiIframe,
            field,
            pageResult || this._currentPageResult,
            this.engine,
            this._wasmModule,
            this._wasmBusy
        );
    }
    
    // ==================== TREE ====================
    
    _buildCaseTree() {
        buildCaseTree(
            this.$.treeContent,
            this.currentApp,
            this.navigationFields,
            (fieldName, rosterName) => this.goToField(fieldName)
        );
    }
    
    // ==================== ROSTER UPDATES ====================
    
    async _updateRosterFromEngine(rosterName) {
        const rosterInfo = this._rosters?.[rosterName];
        if (!rosterInfo) return;
        
        let pageResult = this._currentPageResult;
        if (!pageResult && this.engine?.getCurrentPage) {
            pageResult = this.engine.getCurrentPage();
            if (pageResult?.then) pageResult = await pageResult;
            this._currentPageResult = pageResult;
        }
        
        updateRosterFromEngine(rosterInfo, pageResult, this.$.formContainer);
    }
    
    // ==================== STATE ====================
    
    _storeFieldValue(fieldName, value, occurrence = 1) {
        const navField = this.navigationFields.find(nf => 
            nf.name === fieldName && nf.occurrence === occurrence
        );
        if (navField) navField.value = value;
    }
    
    // ==================== UI HELPERS ====================
    
    _updateStatus(field, info = '', mode = '') {
        this.$.statusField.textContent = field || 'Ready';
        if (info !== undefined) this.$.statusInfo.textContent = info;
        if (mode) this.$.statusMode.textContent = mode;
    }
    
    _showLoading(text = 'Loading...') {
        this.$.loadingOverlay.querySelector('.loading-text').textContent = text;
        this.$.loadingOverlay.classList.add('visible');
    }
    
    _hideLoading() {
        this.$.loadingOverlay.classList.remove('visible');
    }
    
    /**
     * Show a message using native CSPro errmsg dialog
     * @param {string} message - Message to display
     * @param {string} [title] - Optional title
     * @param {Array} [buttons] - Optional button array
     * @returns {Promise<number>} Button index clicked
     */
    async _showMessage(message, title = '', buttons = null) {
        console.log('[MFC] _showMessage called:', { message, title, buttons });
        
        if (!this.dialogHandler) {
            // Fallback to console log if no dialog handler
            console.warn('[MFC] No dialog handler, message:', message);
            return 1;
        }
        
        const inputData = {
            message: message,
            title: title || '',
            buttons: buttons || [{ caption: 'OK', index: 1 }],
            defaultButtonIndex: 1
        };
        
        console.log('[MFC] Calling dialogHandler.showDialogAsync with:', inputData);
        
        try {
            const resultJson = await this.dialogHandler.showDialogAsync('errmsg', JSON.stringify(inputData));
            console.log('[MFC] Dialog returned:', resultJson);
            if (resultJson) {
                const result = JSON.parse(resultJson);
                return result?.result?.index || result?.index || 1;
            }
            return 1;
        } catch (e) {
            console.error('[MFC] Error showing message:', e);
            return 1;
        }
    }
    
    _showError(message) {
        console.error('[MFC] Error:', message);
        this._updateStatus('Error', message, 'Error');
    }
    
    /**
     * Show a server-triggered dialog (errmsg, select, etc.)
     * Called by engine-proxy when the server responds with dialogs
     * @param {Object} dialog - Dialog data from server
     * @param {string} dialog.dialogName - Name of the dialog
     * @param {Object} dialog.inputData - Input data for the dialog
     * @returns {Promise<string|null>} Dialog result
     */
    async _showServerDialog(dialog) {
        console.log('[MFC] Showing server dialog:', dialog.dialogName, dialog);
        if (!this.dialogHandler) {
            console.error('[MFC] No dialog handler available');
            return null;
        }
        
        const inputDataJson = JSON.stringify(dialog.inputData || {});
        return await this.dialogHandler.showDialogAsync(dialog.dialogName, inputDataJson);
    }
    
    _onDialogClosed() {
        // Dialog closed callback
    }
}

// Register the custom element
customElements.define('csentry-mfc-view', CSEntryMFCView);

// Export for module usage
export { CSEntryMFCView };
export default CSEntryMFCView;

// Also export utilities for external use
export { CAPTURE_TYPES, FREE_MOVEMENT, ROSTER_ORIENTATION };
export { parsePFF } from './utils/index.js';
export { createServerSideEngineProxy } from './engine/index.js';
