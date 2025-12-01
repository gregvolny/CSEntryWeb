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
import { renderForm, createFieldElement, getFieldElementValue, createTextInput, createNumericTickmarkInput, createRadioButtonGroup, createCheckboxGroup, createDropdown, createSlider, createDateInput, updateFormFieldValues } from './renderers/form-renderer.js';
import { createRosterTable, createRosterCellInput, updateTickmarkDisplay, updateRosterFromEngine, updateFieldDisplayValue, highlightCurrentRow } from './renderers/roster-renderer.js';
import { buildCaseTree, buildCaseListTree, updateTreeValue, highlightTreeField, expandAll, collapseAll } from './renderers/tree-renderer.js';
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
        this.isModifyMode = false;  // True when viewing/editing existing case
        this._modifyModeActive = false;  // True once user has clicked a field to start editing
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
            // Use engine proxy method which handles session recovery
            const success = await this.engine.loadEmbeddedAsset(pffPath);
            
            if (!success) {
                throw new Error('Failed to load embedded application on server');
            }
            
            const loadResult = { success: true };
            console.log('[MFC] Embedded asset load result:', loadResult);
            
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
                
                // Store formData for later use (e.g., modify mode)
                this.formData = formData;
                console.log('[MFC] Stored formData for modify mode:', {
                    success: this.formData?.success,
                    hasFormFiles: !!this.formData?.formFiles,
                    formFilesCount: this.formData?.formFiles?.length
                });
                
                if (formData?.success && formData?.formFiles?.length > 0) {
                    forms = formData.formFiles[0].forms || [];
                    this.isPathOn = formData.formFiles[0].pathOn !== false;
                    console.log(`[MFC] Loaded ${forms.length} forms, pathOn=${this.isPathOn}`);
                    
                    // Debug: log form structure including boxes
                    if (forms.length > 0) {
                        const firstForm = forms[0];
                        console.log('[MFC] First form structure:', {
                            name: firstForm.name,
                            label: firstForm.label,
                            width: firstForm.width,
                            height: firstForm.height,
                            backgroundColor: firstForm.backgroundColor,
                            fieldsCount: firstForm.fields?.length || 0,
                            textsCount: firstForm.texts?.length || 0,
                            rostersCount: firstForm.rosters?.length || 0,
                            boxesCount: firstForm.boxes?.length || 0,
                            boxes: firstForm.boxes // Log actual box data
                        });
                    }
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
            
            // Auto-start case entry (MFC behavior: automatically start in Add mode)
            // This focuses the first field and makes it editable
            console.log('[MFC] Auto-starting case entry after embedded asset load');
            await this.addCase();
            
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
            await this.loadApplicationFromFiles(files, pffFile, appName);
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
    async _handleMenuAction(action) {
        switch (action) {
            case 'open': this._showOpenDialog(); break;
            case 'openData': this._showOpenDialog(); break;
            case 'save': this.saveCase(); break;
            case 'sync': this._handleSync(); break;
            case 'exit': window.close(); break;
            case 'addCase': await this.addCase(); break;
            case 'modifyCase': await this.modifyCase(); break;
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
     * Handle synchronization
     * Replicates CMainFrame::OnSynchronize logic
     */
    async _handleSync() {
        console.log('[MFC] _handleSync called');
        
        // Check if application is loaded
        if (!this.currentApp) {
            await this._showMessage('No application loaded.', 'Synchronization');
            return;
        }
        
        // Check if engine supports sync
        if (!this.engine?.getSyncParameters) {
             await this._showMessage('Synchronization not supported by this engine.', 'Synchronization');
             return;
        }
        
        try {
            this._showLoading('Checking synchronization parameters...');
            const syncParams = await this.engine.getSyncParameters();
            this._hideLoading();
            
            if (!syncParams || !syncParams.server) {
                await this._showMessage('No synchronization parameters defined for this application.', 'Synchronization');
                return;
            }
            
            // Confirm sync
            const confirm = await this._showMessage(
                `Synchronize with ${syncParams.server}?`, 
                'Synchronization',
                [{ caption: 'Yes', index: 1 }, { caption: 'No', index: 2 }]
            );
            
            if (confirm !== 1) return;
            
            this._showLoading('Synchronizing...');
            const success = await this.engine.runSync(syncParams);
            this._hideLoading();
            
            if (success) {
                await this._showMessage('Synchronization complete', 'Synchronization');
                // Refresh case tree
                this._buildCaseTree();
            } else {
                await this._showMessage('Synchronization failed', 'Synchronization');
            }
            
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Sync error:', error);
            await this._showMessage('Error during synchronization: ' + error.message, 'Error');
        }
    }
    
    /**
     * Show open application dialog
     */
    _showOpenDialog() {
        const html = `
            <div class="load-source-dialog" style="background: white; padding: 20px; border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); min-width: 500px;">
                <div class="dialog-header" style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 18px;">Open Application</h2>
                    <button class="dialog-close" data-action="close" style="background:none; border:none; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                <div class="dialog-body">
                    <p class="sources-label" style="text-align: center; margin-bottom: 15px; color: #666;">Load From:</p>
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
        `;

        this._showCustomDialog(html, {
            onInit: (dialog) => {
                dialog.querySelectorAll('.source-option[data-source]').forEach(option => {
                    option.addEventListener('click', (e) => {
                        const source = option.dataset.source;
                        if (source) {
                            this._closeCustomDialog();
                            this._handleSourceSelect(source);
                        }
                    });
                });
            }
        });
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
        
        // Mount persistent storage (OPFS or IDBFS)
        if (this._wasmModule.FS) {
            const FS = this._wasmModule.FS;
            const mountPoint = '/data';
            try {
                try { FS.mkdir(mountPoint); } catch(e) { /* ignore if exists */ }
                
                if (FS.filesystems && FS.filesystems.OPFS) {
                    console.log('[MFC] Mounting OPFS at', mountPoint);
                    FS.mount(FS.filesystems.OPFS, {}, mountPoint);
                    this._storageType = 'OPFS';
                } else if (FS.filesystems && FS.filesystems.IDBFS) {
                    console.log('[MFC] Mounting IDBFS at', mountPoint);
                    FS.mount(FS.filesystems.IDBFS, {}, mountPoint);
                    // Populate from IndexedDB
                    await new Promise((resolve) => FS.syncfs(true, resolve));
                    this._storageType = 'IDBFS';
                } else {
                    console.warn('[MFC] No persistent storage backend available');
                }
            } catch (e) {
                console.error('[MFC] Failed to mount storage:', e);
            }
        }

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
     * Sync persistent storage (required for IDBFS)
     */
    async syncStorage() {
        if (this._storageType === 'IDBFS' && this._wasmModule?.FS) {
            console.log('[MFC] Syncing IDBFS...');
            return new Promise((resolve) => {
                this._wasmModule.FS.syncfs(false, (err) => {
                    if (err) console.error('[MFC] IDBFS sync error:', err);
                    resolve();
                });
            });
        }
    }

    /**
     * Load application from PFF content
     * @param {string} pffContent - PFF file content
     * @param {Object} files - Additional files keyed by filename
     * @param {string} appName - Application name (optional, for server-side saving)
     */
    async loadApplicationFromContent(pffContent, files = {}, appName = null) {
        this._showLoading('Loading application...');
        
        try {
            // Initialize engine if not already done (prefers server proxy)
            await this._initializeWasm();
            
            // Check if using server proxy or client-side WASM
            if (this._sessionId && this.engine?.loadApplicationWithFiles) {
                // Server proxy mode - upload files to server
                console.log('[MFC] Loading application via server proxy');
                
                const loadResult = await this.engine.loadApplicationWithFiles(pffContent, files, appName);
                if (!loadResult) throw new Error('Failed to load application on server');
                
                // Don't call start() here - we'll either show case list or call addCase/modifyCase
                console.log('[MFC] Application loaded on server, ready for case list or entry');
                
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
                
                console.log('[MFC] Raw formData from engine:', JSON.stringify(formData, null, 2).substring(0, 2000));
                
                if (formData?.success && formData?.formFiles?.length > 0) {
                    forms = formData.formFiles[0].forms || [];
                    this.isPathOn = formData.formFiles[0].pathOn !== false;
                    console.log(`[MFC] Loaded ${forms.length} forms, pathOn=${this.isPathOn}`);
                    
                    // Log first form structure
                    if (forms.length > 0) {
                        const firstForm = forms[0];
                        console.log('[MFC] First form structure:', {
                            name: firstForm.name,
                            label: firstForm.label,
                            width: firstForm.width,
                            height: firstForm.height,
                            backgroundColor: firstForm.backgroundColor,
                            texts: firstForm.texts?.length || 0,
                            fields: firstForm.fields?.length || 0,
                            rosters: firstForm.rosters?.length || 0
                        });
                        
                        // Log sample field with label
                        if (firstForm.fields?.length > 0) {
                            const sampleField = firstForm.fields[0];
                            console.log('[MFC] Sample field:', {
                                name: sampleField.name,
                                label: sampleField.label,
                                text: sampleField.text,
                                x: sampleField.x, y: sampleField.y,
                                textX: sampleField.textX, textY: sampleField.textY
                            });
                        }
                        
                        // Log sample text element
                        if (firstForm.texts?.length > 0) {
                            console.log('[MFC] Sample text element:', firstForm.texts[0]);
                        }
                    }
                }
                
                this.currentApp = {
                    name: formData?.applicationName || 'Application',
                    dictionaries: [],
                    forms: forms,
                    pathOn: this.isPathOn
                };
            }
            
            // Render the application (forms, etc)
            this._renderApplication();
            this._hideLoading();
            
            this.dispatchEvent(new CustomEvent('applicationLoaded', {
                detail: { name: this.currentApp?.name }
            }));
            
            // MFC CSEntry ProcessStartMode() behavior:
            // - If data file is EMPTY (no cases) → Auto-start in ADD mode
            // - If data file has cases → Show case list, then auto-start in ADD mode
            console.log('[MFC] Checking cases to determine start mode...');
            let cases = this.engine.getSequentialCaseIds?.();
            if (cases?.then) cases = await cases;
            
            if (!cases || cases.length === 0) {
                // Empty data file - automatically start in Add mode
                console.log('[MFC] No cases in data file - auto-starting Add mode');
                await this.addCase();
            } else {
                // Data file has cases - show case list briefly, then auto-start Add mode
                console.log('[MFC] Data file has', cases.length, 'cases - showing case list then starting Add mode');
                await this._showCaseList();
                // MFC behavior: After showing case list, automatically start Add mode
                await this.addCase();
            }
            
        } catch (error) {
            this._hideLoading();
            this._showError('Failed to load application: ' + error.message);
        }
    }
    
    /**
     * Load application from files object
     * @param {Object} files - Files keyed by filename
     * @param {string} pffFileName - Name of the PFF file
     * @param {string} appName - Application name (optional)
     */
    async loadApplicationFromFiles(files, pffFileName, appName = null) {
        let pffContent = files[pffFileName];
        if (typeof pffContent !== 'string') {
            if (pffContent?.type === 'binary' && pffContent?.data) {
                pffContent = atob(pffContent.data);
            } else {
                throw new Error('Invalid PFF file content');
            }
        }
        await this.loadApplicationFromContent(pffContent, files, appName);
    }
    
    /**
     * Add a new case
     */
    async addCase() {
        if (!this.engine) {
            console.warn('[MFC] addCase: No engine available');
            return;
        }
        
        // Reset modify mode flags - add mode is not modify mode
        this.isModifyMode = false;
        this._modifyModeActive = false;
        
        // Start the entry session
        // This is required because after showing case list or stopping entry,
        // the session.entryStarted flag is set to false
        console.log('[MFC] addCase: Starting entry session...');
        let startResult = this.engine.start?.();
        if (startResult?.then) startResult = await startResult;
        console.log('[MFC] addCase: start() result =', startResult);
        
        if (!startResult) {
            console.error('[MFC] addCase: Failed to start entry session');
            await this._showMessage('Failed to start entry session', 'Error');
            return;
        }
        
        // MFC Behavior: Now render and show the form (it was hidden in case list view)
        this._showFormContainer();
        
        // Render first form
        if (this.currentApp?.forms?.length > 0) {
            this._renderForm(this.currentApp.forms[0]);
        }
        
        // MFC Behavior: Show case list tree with "Adding Case" indicator
        await this._buildCaseListTree(true, false, -1);
        
        // Get current page from engine
        let pageResult = this.engine.getCurrentPage?.();
        if (pageResult?.then) pageResult = await pageResult;
        
        console.log('[MFC] addCase: pageResult =', pageResult);
        
        this._currentPageResult = pageResult;
        
        // Update control mode (System Controlled vs Operator Controlled) from engine
        this._updateControlModeFromPage(pageResult);
        
        if (pageResult?.fields?.length > 0) {
            const firstField = pageResult.fields[0];
            console.log('[MFC] addCase: firstField =', firstField?.name, 'indexes:', firstField?.indexes);
            
            // Update current field immediately so focus handlers know it's authorized
            this.currentField = firstField;

            // Find and focus the field element
            // Use a slightly longer timeout to ensure DOM is fully rendered
            let fieldElement = this._findFieldElement(firstField);
            console.log('[MFC] addCase: found fieldElement =', fieldElement);
            
            if (fieldElement) {
                const inputEl = fieldElement.querySelector('input, select') || fieldElement;
                console.log('[MFC] addCase: focusing inputEl =', inputEl, 'readOnly:', inputEl.readOnly, 'disabled:', inputEl.disabled);
                
                // Use requestAnimationFrame to ensure DOM is ready before focusing
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        inputEl.focus?.();
                        inputEl.select?.();
                        inputEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                        console.log('[MFC] addCase: focus complete, activeElement =', document.activeElement);
                    }, 50);
                });
            } else {
                console.warn('[MFC] addCase: Could not find field element for:', firstField?.name, 
                    'with indexes:', firstField?.indexes);
                // Try a broader search as fallback
                const anyInput = this.$.formContainer.querySelector('input:not([readonly]):not([disabled]), select:not([disabled])');
                if (anyInput) {
                    console.log('[MFC] addCase: Using fallback input:', anyInput.dataset.fieldName);
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            anyInput.focus?.();
                            anyInput.select?.();
                        }, 50);
                    });
                }
            }
            
            // Update status
            const occStr = (firstField.indexes?.[0] > 0) ? `[${firstField.indexes[0]}]` : '';
            const pathMode = this.isPathOn ? 'System Path' : 'Free Movement';
            this._updateStatus(firstField.name + occStr, '', `Add Mode | ${pathMode}`);
            
            await this._showCAPI(firstField, pageResult);
            
            // Update rosters
            if (this._rosters) {
                for (const rosterName in this._rosters) {
                    this._updateRosterFromEngine(rosterName);
                }
            }
        } else {
            console.warn('[MFC] addCase: No fields in pageResult');
        }
        
        // NOTE: Do NOT call _buildCaseTree() here - it overwrites the case list tree
        // The case list tree with <Adding Case> was already built by _buildCaseListTree(true, false, -1) above
        // MFC CSEntry shows case list tree (File > cases > <Adding Case>), not form structure tree
        
        this.dispatchEvent(new CustomEvent('caseStarted', { detail: { isNew: true } }));
    }

    /**
     * Modify an existing case
     */
    async modifyCase() {
        if (!this.engine) return;
        
        this._showLoading('Loading cases...');
        
        try {
            // Get list of cases
            let cases = this.engine.getSequentialCaseIds();
            if (cases?.then) cases = await cases;
            
            this._hideLoading();
            
            if (!cases || cases.length === 0) {
                await this._showMessage('No cases found.', 'Modify Case');
                return;
            }
            
            // Show case selection dialog
            const selectedIndex = await this._showCaseSelectionDialog(cases);
            
            if (selectedIndex >= 0) {
                this._showLoading('Opening case...');
                
                const selectedCase = cases[selectedIndex];
                // Use position from the case object
                const position = selectedCase.position;
                
                let result = this.engine.modifyCase(position);
                if (result?.then) result = await result;
                
                if (!result) {
                    throw new Error('Failed to open case');
                }
                
                // Get first page
                let pageResult = this.engine.getCurrentPage();
                if (pageResult?.then) pageResult = await pageResult;
                
                this._hideLoading();
                
                // Show CAPI view
                const firstField = pageResult?.fields?.[0]?.name;
                if (firstField) {
                    await this._showCAPI(firstField, pageResult);
                    
                    // Update rosters
                    if (this._rosters) {
                        for (const rosterName in this._rosters) {
                            this._updateRosterFromEngine(rosterName);
                        }
                    }
                }
                
                this._buildCaseTree();
                this.dispatchEvent(new CustomEvent('caseStarted', { detail: { isNew: false } }));
            }
            
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Modify case error:', error);
            await this._showMessage('Error modifying case: ' + error.message, 'Error');
        }
    }

    /**
     * Show case list in left panel (MFC DataViewer behavior)
     * Displays all cases from the data file with their keys/labels
     * MFC Behavior: Uses the tree panel to show case list
     */
    async _showCaseList() {
        if (!this.engine) return;
        
        try {
            // MFC Behavior: When showing case list, hide the form container
            // Forms are only visible when actively adding/modifying a case
            this._hideFormContainer();
            
            // Build case list tree (not adding, not modifying)
            await this._buildCaseListTree(false, false, -1);
            
            console.log('[MFC] Case list tree displayed');
            
        } catch (error) {
            console.error('[MFC] Error showing case list:', error);
        }
    }
    
    /**
     * Open a case from the case list
     * @param {number} position - Case position in repository
     */
    async _openCaseFromList(position) {
        if (!this.engine) return;
        
        this._showLoading('Opening case...');
        
        try {
            // Set modify mode flags
            // In modify mode, we show the form with pre-filled data but don't focus any field
            // until the user clicks on one. This prevents unwanted validation/changes.
            this.isModifyMode = true;
            this._modifyModeActive = false;  // Will be set true when user clicks a field
            this.currentField = null;  // Don't track a current field until user interaction
            
            // Open case in modify mode
            let result = this.engine.modifyCase(position);
            if (result?.then) result = await result;
            
            if (!result) {
                throw new Error('Failed to open case');
            }
            
            // Get first page
            let pageResult = this.engine.getCurrentPage();
            if (pageResult?.then) pageResult = await pageResult;
            
            // Store page result for roster updates
            this._currentPageResult = pageResult;
            
            console.log('[MFC] _openCaseFromList: pageResult fields:', pageResult?.fields?.length);
            if (pageResult?.fields) {
                pageResult.fields.forEach(f => {
                    console.log('[MFC] Field:', f.name, 'indexes:', f.indexes, 'alphaValue:', f.alphaValue, 'numericValue:', f.numericValue);
                });
            }
            
            this._hideLoading();
            
            // MFC Behavior: Show form container and render the form (was hidden in case list view)
            this._showFormContainer();
            if (this.currentApp?.forms?.length > 0) {
                this._renderForm(this.currentApp.forms[0]);
            }
            
            // Switch from case list to case tree view
            this._switchToCaseTreeView();
            
            // Show CAPI view - this renders all the HTML inputs but does NOT focus any field
            const firstField = pageResult?.fields?.[0];
            if (firstField) {
                const pathMode = this.isPathOn ? 'System Path' : 'Free Movement';
                this._updateStatus('Click a field to begin editing', '', `Modify Mode | ${pathMode}`);
                
                await this._showCAPI(firstField, pageResult);
                
                // NOW load all field values from the case tree and populate the rendered inputs
                console.log('[MFC] Loading all field values from case tree...');
                await this._loadAllFieldValuesFromCaseTree();
                
                // Update rosters to reflect the populated values
                if (this._rosters) {
                    for (const rosterName in this._rosters) {
                        await this._updateRosterFromEngine(rosterName);
                    }
                }
            }
            
            this._buildCaseTree();
            this.dispatchEvent(new CustomEvent('caseStarted', { detail: { isModify: true } }));
            
        } catch (error) {
            this._hideLoading();
            console.error('[MFC] Error opening case from list:', error);
            await this._showMessage('Error opening case: ' + error.message, 'Error');
        }
    }
    
    /**
     * Load all field values from the case tree into the form inputs
     * 
     * MFC Flow:
     * 1. ModifyStart() - Initialize modify session
     * 2. ReadCasetainer(data_case, position) - Load case data into memory
     * 3. ProcessModify() - Navigate to first field  
     * 4. Form displays with values from in-memory Case object
     * 
     * This method follows the same pattern:
     * 1. getCaseTree() loads case data (equivalent to ReadCasetainer)
     * 2. Extract all field values from tree structure
     * 3. Map labels to field names
     * 4. Populate HTML inputs
     */
    async _loadAllFieldValuesFromCaseTree() {
        try {
            // Ensure formData is available - fetch it if needed
            if (!this.formData && this.engine?.getFormData) {
                console.log('[MFC] formData not available, fetching from engine...');
                let formData = this.engine.getFormData();
                if (formData?.then) formData = await formData;
                this.formData = formData;
                console.log('[MFC] Fetched and stored formData:', {
                    success: this.formData?.success,
                    hasFormFiles: !!this.formData?.formFiles
                });
            }
            
            // Debug: Check if formData is available
            console.log('[MFC] _loadAllFieldValuesFromCaseTree - this.formData:', this.formData);
            console.log('[MFC] _loadAllFieldValuesFromCaseTree - formData available:', !!this.formData);
            console.log('[MFC] _loadAllFieldValuesFromCaseTree - formFiles available:', !!this.formData?.formFiles);
            
            // Use the modular coordinator to handle the entire workflow
            const { loadCaseForModify } = await import('./modifyMode/modifyModeCoordinator.js');
            
            const result = await loadCaseForModify(
                this.engine,
                this.formData,
                this.$.formContainer
            );
            
            if (!result.success) {
                console.error('[MFC] Failed to load case for modify:', result.error);
            } else {
                console.log('[MFC] Successfully populated', result.populatedCount, 'of', result.totalFields, 'fields');
            }
            
        } catch (error) {
            console.error('[MFC] Error in _loadAllFieldValuesFromCaseTree:', error);
        }
    }

    /**
     * LEGACY METHOD - Kept for reference but replaced by modular implementation
     * This inline implementation has been moved to modifyMode/ modules
     */
    async _loadAllFieldValuesFromCaseTree_LEGACY() {
        console.log('[MFC] _loadAllFieldValuesFromCaseTree: fetching case tree...');
        
        try {
            // Get the case tree which has all field values
            let caseTree = this.engine.getCaseTree?.();
            if (caseTree?.then) caseTree = await caseTree;
            
            if (!caseTree) {
                console.log('[MFC] No case tree available');
                return;
            }
            
            // Log the case tree structure to understand its format
            console.log('[MFC] Case tree structure:', JSON.stringify(caseTree, null, 2).substring(0, 1000));
            console.log('[MFC] Case tree type:', caseTree.type, 'name:', caseTree.name, 'has children:', !!caseTree.children);
            
            console.log('[MFC] Case tree loaded, extracting field values...');
            
            // Recursive function to extract all field values from tree
            // Node types: 0=case/questionnaire, 1=form, 2=roster/record, 4=field/item
            const extractFieldValues = (node, occurrence = 1, parentLabel = '') => {
                const values = [];
                
                // Type 4 = field/item with a value
                if (node.type === 4 && node.value !== '' && node.value !== null && node.value !== undefined) {
                    // Extract field name from label (e.g., "Household ID" or "First Name")
                    // We need to map this to the actual field name (HOUSEHOLD_ID, FIRST_NAME, etc.)
                    values.push({
                        label: node.label,
                        value: node.value,
                        occurrence: occurrence,
                        index: node.index
                    });
                }
                
                // Recursively process children
                if (node.children && Array.isArray(node.children)) {
                    // Type 2 = roster/record - each child is an occurrence
                    if (node.type === 2) {
                        // Children of roster are individual occurrences
                        for (let i = 0; i < node.children.length; i++) {
                            const child = node.children[i];
                            // Extract occurrence number from label like "Person Roster (1)"
                            const occMatch = child.label?.match(/\((\d+)\)/);
                            const occ = occMatch ? parseInt(occMatch[1]) : i + 1;
                            values.push(...extractFieldValues(child, occ, node.label));
                        }
                    } else {
                        // For other types, keep same occurrence
                        for (const child of node.children) {
                            values.push(...extractFieldValues(child, occurrence, node.label));
                        }
                    }
                }
                
                return values;
            };
            
            const fieldValues = extractFieldValues(caseTree);
            console.log('[MFC] Extracted', fieldValues.length, 'field values from case tree');
            
            // Create label-to-fieldname map from formData
            const labelToFieldName = new Map();
            if (this.formData?.formFiles) {
                for (const formFile of this.formData.formFiles) {
                    for (const form of formFile.forms || []) {
                        // Regular fields
                        for (const field of form.fields || []) {
                            const label = field.text || field.label || field.name;
                            labelToFieldName.set(label, field.name);
                        }
                        // Roster fields
                        for (const roster of form.rosters || []) {
                            for (const column of roster.columns || []) {
                                for (const field of column.fields || []) {
                                    const label = field.label || field.text || field.name;
                                    labelToFieldName.set(label, field.name);
                                }
                            }
                        }
                    }
                }
            }
            
            console.log('[MFC] Label to field name map entries:', Array.from(labelToFieldName.entries()).slice(0, 10));
            
            // Now populate the inputs with these values
            let populatedCount = 0;
            for (const { label, value: fieldValue, occurrence, index } of fieldValues) {
                console.log('[MFC] Processing label:', label, 'occ:', occurrence, 'value:', fieldValue);
                
                // Map label to field name
                const fieldName = labelToFieldName.get(label);
                if (!fieldName) {
                    console.warn('[MFC] Could not map label to field name:', label);
                    console.warn('[MFC] Available labels:', Array.from(labelToFieldName.keys()));
                    continue;
                }
                
                console.log('[MFC] Mapped to field:', fieldName);
                
                // Find and update the input element
                const selector = occurrence > 1
                    ? `input[data-field-name="${fieldName}"][data-row-index="${occurrence - 1}"]`
                    : `[data-field-name="${fieldName}"]`;
                
                console.log('[MFC] Using selector:', selector);
                let input = this.$.formContainer.querySelector(selector);
                
                // If field is in a tickmark container, get the actual input
                if (input && input.classList.contains('form-field-tickmark-container')) {
                    input = input.querySelector('input');
                }
                
                if (input && input.tagName === 'INPUT') {
                    input.value = String(fieldValue);
                    populatedCount++;
                    console.log('[MFC] ✓ Set input', fieldName, occurrence > 1 ? `[${occurrence}]` : '', 'to', fieldValue);
                } else if (input) {
                    console.warn('[MFC] Found element but not INPUT:', input.tagName, 'for', fieldName);
                } else {
                    console.warn('[MFC] Could not find input with selector:', selector);
                }
            }
            
            console.log('[MFC] _loadAllFieldValuesFromCaseTree: completed,', populatedCount, 'inputs populated');
            
        } catch (error) {
            console.error('[MFC] Error in _loadAllFieldValuesFromCaseTree:', error);
        }
    }
    
    /**
     * Show dialog to select a case
     * @param {Array} cases - List of cases
     * @returns {Promise<number>} Selected index or -1
     */
    async _showCaseSelectionDialog(cases) {
        return new Promise((resolve) => {
            // Create dialog HTML
            const dialog = document.createElement('div');
            dialog.className = 'cs-dialog-overlay';
            dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;';
            
            const content = document.createElement('div');
            content.className = 'cs-dialog-content';
            content.style.cssText = 'background:white;padding:20px;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.2);min-width:400px;max-height:80vh;display:flex;flex-direction:column;';
            
            const header = document.createElement('h3');
            header.textContent = 'Select Case';
            header.style.marginTop = '0';
            content.appendChild(header);
            
            const list = document.createElement('div');
            list.style.cssText = 'overflow-y:auto;flex:1;border:1px solid #ccc;margin:10px 0;';
            
            const ul = document.createElement('ul');
            ul.style.cssText = 'list-style:none;padding:0;margin:0;';
            
            cases.forEach((c, index) => {
                const li = document.createElement('li');
                li.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid #eee;';
                li.onmouseover = () => li.style.background = '#f0f0f0';
                li.onmouseout = () => li.style.background = 'white';
                
                const label = c.label || c.ids;
                li.textContent = label;
                
                li.onclick = () => {
                    document.body.removeChild(dialog);
                    resolve(index);
                };
                
                ul.appendChild(li);
            });
            
            list.appendChild(ul);
            content.appendChild(list);
            
            const footer = document.createElement('div');
            footer.style.textAlign = 'right';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding:6px 12px;cursor:pointer;';
            cancelBtn.onclick = () => {
                document.body.removeChild(dialog);
                resolve(-1);
            };
            
            footer.appendChild(cancelBtn);
            content.appendChild(footer);
            
            dialog.appendChild(content);
            document.body.appendChild(dialog);
        });
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
     * Stop/end current case entry
     * Maps to MFC CMainFrame::OnStop - ends case and returns to case list
     * 
     * MFC Logic:
     * 1. Check if in ADD_MODE, MODIFY_MODE, or VERIFY_MODE
     * 2. Execute OnStop special function if exists (can cancel stop)
     * 3. Show dialog: Save/Discard/Finish/Cancel
     * 4. For MODIFY_MODE: Call ModifyStop()
     * 5. Call pRunApl->Stop()
     * 6. Reset to NO_MODE and return to case listing
     */
    async stopEntry() {
        if (!this.engine) return;
        
        try {
            // TODO: Check for OnStop special function and execute it
            
            // Show save/discard/cancel dialog (matches MFC CDiscMDlg/CDiscDlg)
            const choice = await this._showMessage(
                'What would you like to do with the current case?',
                'Stop Data Entry',
                [
                    { caption: 'Save', index: 0 },
                    { caption: 'Discard', index: 1 },
                    { caption: 'Cancel', index: 2 }
                ]
            );
            
            if (choice === 2 || choice === null) {
                // Cancel - return to current field
                console.log('[MFC] Stop cancelled by user');
                return;
            }
            
            const shouldSave = choice === 0; // 0=Save, 1=Discard
            
            // End the current case
            let result = this.engine.endCase?.(shouldSave);
            if (result?.then) result = await result;
            
            if (result !== false) {
                console.log('[MFC] Case ended, returning to case list');
                this.dispatchEvent(new CustomEvent('caseEnded', { 
                    detail: { saved: shouldSave } 
                }));
                
                // MFC Behavior: Hide all forms when stopping
                // Clear form container and hide it
                this._hideFormContainer();
                this._clearForm();
                
                // Reset state
                this.currentField = null;
                this.isModifyMode = false;
                this._modifyModeActive = false;
                
                // Return to case list view
                await this._showCaseList();
            }
        } catch (error) {
            console.error('[MFC] Error stopping entry:', error);
            await this._showMessage('Error stopping entry: ' + error.message, 'Error');
        }
    }

    /**
     * Pause current case entry
     * Maps to MFC CMainFrame::OnPauseCase - temporarily pauses data entry
     */
    async pauseEntry() {
        if (!this.engine) return;
        
        try {
            // Save current state
            let result = this.engine.endCase?.(true);
            if (result?.then) result = await result;
            
            if (result !== false) {
                this.dispatchEvent(new CustomEvent('casePaused'));
                await this._showMessage('Case entry paused', 'Pause');
                
                // Return to case list
                await this._showCaseList();
            }
        } catch (error) {
            console.error('[MFC] Error pausing entry:', error);
            await this._showMessage('Error pausing entry: ' + error.message, 'Error');
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
                    
                    // Update control mode (System Controlled vs Operator Controlled) from engine
                    this._updateControlModeFromPage(result);
                    
                    const newField = result.fields[result.currentFieldIndex ?? 0] || result.fields[0];
                    
                    // Update current field immediately so focus handlers know it's authorized
                    this.currentField = newField;

                    const fieldElement = this._findFieldElement(newField);
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
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
                // Try to find field symbol from current page result or navigation fields
                let fieldSymbol = fieldName;
                
                if (this._currentPageResult?.fields) {
                    const field = this._currentPageResult.fields.find(f => 
                        f.name && f.name.toUpperCase() === fieldName.toUpperCase()
                    );
                    if (field && field.symbol !== undefined) {
                        fieldSymbol = field.symbol;
                        console.log('[MFC] Using field symbol', fieldSymbol, 'for field', fieldName);
                    }
                }
                
                let result = this.engine.goToField(fieldSymbol, occurrence, 0, 0);
                if (result?.then) result = await result;
                
                if (result?.fields?.length > 0) {
                    this._currentPageResult = result;
                    
                    // Update control mode (System Controlled vs Operator Controlled) from engine
                    this._updateControlModeFromPage(result);
                    
                    const newField = result.fields[result.currentFieldIndex ?? 0] || result.fields[0];
                    
                    // Update current field immediately so focus handlers know it's authorized
                    this.currentField = newField;

                    const fieldElement = this._findFieldElement(newField);
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
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
     * Hide the form container (MFC behavior: forms hidden when in case list view)
     */
    _hideFormContainer() {
        if (this.$.formContainer) {
            this.$.formContainer.style.display = 'none';
        }
        // Also hide CAPI panel when form is hidden
        if (this.$.capiPanel) {
            this.$.capiPanel.style.display = 'none';
        }
    }
    
    /**
     * Show the form container (MFC behavior: forms shown when adding/modifying a case)
     */
    _showFormContainer() {
        if (this.$.formContainer) {
            this.$.formContainer.style.display = 'block';
        }
        // Reset CAPI panel display so CSS classes can control visibility
        if (this.$.capiPanel) {
            this.$.capiPanel.style.display = '';
        }
    }
    
    /**
     * Clear the form container content
     */
    _clearForm() {
        if (this.$.formContainer) {
            this.$.formContainer.innerHTML = '';
        }
        this.currentForm = null;
        this._rosters = {};
        this.navigationFields = [];
        this.currentNavIndex = 0;
    }
    
    /**
     * Switch from case list view to case tree view
     * Called when entering add or modify mode
     */
    _switchToCaseTreeView() {
        const caseListView = this.shadowRoot.getElementById('caseListView');
        const treeContent = this.shadowRoot.getElementById('treeContent');
        const leftPanelHeader = this.shadowRoot.getElementById('leftPanelHeader');
        
        if (caseListView) caseListView.style.display = 'none';
        if (treeContent) treeContent.style.display = 'block';
        if (leftPanelHeader) leftPanelHeader.textContent = 'Case Tree';
    }

    /**
     * Update control mode from page result
     * CSPro has two modes:
     * - System Controlled (isSystemControlled=true, isPathOn=true): Engine controls navigation
     * - Operator Controlled (isSystemControlled=false, isPathOn=false): User has free movement
     * @param {Object} pageResult - Page result from engine
     */
    _updateControlModeFromPage(pageResult) {
        if (pageResult && typeof pageResult.isSystemControlled !== 'undefined') {
            this.isPathOn = pageResult.isSystemControlled;
            console.log('[MFC] Control mode updated from page: isSystemControlled =', 
                pageResult.isSystemControlled, '(isPathOn =', this.isPathOn, ')');
            
            // Update status bar with control mode
            const pathMode = this.isPathOn ? 'System Controlled' : 'Operator Controlled';
            if (this.$.statusMode) {
                this.$.statusMode.textContent = pathMode;
            }
        }
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
            onChange: (e, field, rowIdx, r, select) => this._onRosterComboBoxChange(e, field, rowIdx, r, select),
            onCheckboxChange: (field, container, rowIdx, roster) => this._onRosterCheckboxChange(field, container, rowIdx, roster),
            onCheckboxDialogRequest: (field, container, rowIdx, roster, input) => this._onRosterCheckboxDialogRequest(field, container, rowIdx, roster, input),
            onValueSetDialogRequest: (field, container, rowIdx, roster, input, responses) => this._onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses),
            onComboBoxDialogRequest: (field, container, rowIdx, roster, input, responses) => this._onRosterComboBoxDialogRequest(field, container, rowIdx, roster, input, responses)
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
            let questionText = '';
            try {
                if (this.engine?.getQuestionText) {
                    const result = await this.engine.getQuestionText();
                    questionText = result?.questionTextHtml || '';
                }
            } catch (err) {
                console.warn('[MFC] Failed to get question text:', err);
            }
            const selectedValues = await this.dialogHandler.showCheckboxSelectionDialog(
                field, 
                responses, 
                currentValue,
                questionText
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
                
                // CSEntry MFC behavior: After picking option from dialog, advance to next field
                if (this.isPathOn) {
                    await this._advanceWithValue(selectedValues);
                    return; // Don't focus the input, we've moved on
                }
            }
            
            // Return focus to input (only if not advancing)
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
     * Handle roster value set dialog request - opens value set selection dialog
     * Used for RadioButton and DropDown capture types
     * CSEntry MFC behavior: Display dialog on Enter, then advance to next field after selection
     */
    async _onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses) {
        console.log('[MFC] _onRosterValueSetDialogRequest:', field.name, 'row:', rowIdx, 'responses:', responses?.length);
        
        try {
            const occurrence = rowIdx + 1;
            
            // If no responses provided, try to get from engine or field definition
            let dialogResponses = responses;
            if (!dialogResponses || dialogResponses.length === 0) {
                if (this.engine?.getResponses) {
                    dialogResponses = await this.engine.getResponses(field.name);
                }
                if (!dialogResponses || dialogResponses.length === 0) {
                    dialogResponses = field.responses || field.valueSet || [];
                }
            }
            
            if (!dialogResponses || dialogResponses.length === 0) {
                console.warn('[MFC] No responses available for value set field:', field.name);
                // No dialog to show, just advance if path is on
                if (this.isPathOn) {
                    await this._advanceWithValue(input.value || '');
                }
                return;
            }
            
            // Show value set selection dialog
            const currentValue = input.value || '';
            let questionText = '';
            try {
                if (this.engine?.getQuestionText) {
                    const result = await this.engine.getQuestionText();
                    questionText = result?.questionTextHtml || '';
                }
            } catch (err) {
                console.warn('[MFC] Failed to get question text:', err);
            }
            const selectedValue = await this.dialogHandler.showValueSetDialog(field, dialogResponses, questionText);
            
            console.log('[MFC] Value set dialog result:', selectedValue);
            
            if (selectedValue !== null && selectedValue !== undefined) {
                // Update input value
                input.value = selectedValue;
                
                // Store the value
                this._storeFieldValue(field.name, selectedValue, occurrence);
                
                // Send to engine
                if (this.engine?.setFieldValue) {
                    await this.engine.setFieldValue(field.name, selectedValue, occurrence);
                }
                
                // CSEntry MFC behavior: After picking option from dialog, advance to next field
                if (this.isPathOn) {
                    await this._advanceWithValue(selectedValue);
                    return; // Don't focus the input, we've moved on
                }
            }
            
            // Return focus to input (only if not advancing or user cancelled)
            input.focus();
            
        } catch (error) {
            console.error('[MFC] Value set dialog error:', error);
            input.focus();
        }
    }
    
    /**
     * Handle roster ComboBox dialog request - opens single-selection dialog
     * Used for ComboBox capture type to show current value and allow selection
     * CSEntry MFC behavior: Display dialog on F4, then advance to next field after selection
     */
    async _onRosterComboBoxDialogRequest(field, container, rowIdx, roster, input, responses) {
        console.log('[MFC] _onRosterComboBoxDialogRequest:', field.name, 'row:', rowIdx, 'responses:', responses?.length);
        
        try {
            const occurrence = rowIdx + 1;
            
            // If no responses provided, try to get from engine or field definition
            let dialogResponses = responses;
            if (!dialogResponses || dialogResponses.length === 0) {
                if (this.engine?.getResponses) {
                    dialogResponses = await this.engine.getResponses(field.name);
                }
                if (!dialogResponses || dialogResponses.length === 0) {
                    dialogResponses = field.responses || field.valueSet || [];
                }
            }
            
            if (!dialogResponses || dialogResponses.length === 0) {
                console.warn('[MFC] No responses available for ComboBox field:', field.name);
                // No dialog to show, just return focus
                input.focus();
                return;
            }
            
            // Show single-selection dialog (multiple: false) with current value
            const currentValue = input.value || '';
            let questionText = '';
            try {
                if (this.engine?.getQuestionText) {
                    const result = await this.engine.getQuestionText();
                    questionText = result?.questionTextHtml || '';
                }
            } catch (err) {
                console.warn('[MFC] Failed to get question text:', err);
            }
            
            // Use the same dialog as value set but with single selection
            const selectedValue = await this.dialogHandler.showValueSetDialog(
                field, 
                dialogResponses, 
                questionText,
                currentValue  // Pass current value to highlight it
            );
            
            console.log('[MFC] ComboBox dialog result:', selectedValue);
            
            if (selectedValue !== null && selectedValue !== undefined) {
                // Update input value
                input.value = selectedValue;
                
                // Store the value
                this._storeFieldValue(field.name, selectedValue, occurrence);
                
                // Send to engine
                if (this.engine?.setFieldValue) {
                    await this.engine.setFieldValue(field.name, selectedValue, occurrence);
                }
                
                // CSEntry MFC behavior: After picking option from dialog, advance to next field
                if (this.isPathOn) {
                    await this._advanceWithValue(selectedValue);
                    return; // Don't focus the input, we've moved on
                }
            }
            
            // Return focus to input (only if not advancing or user cancelled)
            input.focus();
            
        } catch (error) {
            console.error('[MFC] ComboBox dialog error:', error);
            input.focus();
        }
    }
    
    /**
     * Handle roster ComboBox change - native select element
     * CSEntry MFC behavior: After selecting from dropdown, advance to next field
     */
    async _onRosterComboBoxChange(e, field, rowIdx, roster, select) {
        const occurrence = rowIdx + 1;
        const selectedValue = select.value;
        
        console.log('[MFC] _onRosterComboBoxChange:', field.name, 'row:', rowIdx, 'value:', selectedValue);
        
        // Store the value
        this._storeFieldValue(field.name, selectedValue, occurrence);
        
        // Send to engine
        if (this.engine?.setFieldValue) {
            await this.engine.setFieldValue(field.name, selectedValue, occurrence);
        }
        
        // CSEntry MFC behavior: After picking option from ComboBox, advance to next field
        if (this.isPathOn && selectedValue !== '') {
            await this._advanceWithValue(selectedValue);
        }
    }
    
    /**
     * Set up field event handlers
     */
    _setupFieldEvents(field, element) {
        const inputs = element.querySelectorAll('input, select');
        
        if (inputs.length > 0) {
            inputs.forEach(input => {
                input.addEventListener('focus', () => this._onFieldFocus(field, input));
                input.addEventListener('blur', () => this._onFieldBlur(field, input));
                input.addEventListener('keydown', (e) => this._onFieldKeyDown(e, field, input));
                input.addEventListener('input', () => this._onFieldInput(field, input));
                input.addEventListener('click', (e) => this._onFieldClick(e, field, input));
            });
        } else {
            const input = element;
            input.addEventListener('focus', () => this._onFieldFocus(field, input));
            input.addEventListener('blur', () => this._onFieldBlur(field, input));
            input.addEventListener('keydown', (e) => this._onFieldKeyDown(e, field, input));
            input.addEventListener('input', () => this._onFieldInput(field, input));
            input.addEventListener('click', (e) => this._onFieldClick(e, field, input));
        }
    }
    
    /**
     * Find field element in DOM
     */
    _findFieldElement(field) {
        let element = null;
        
        console.log('[MFC] _findFieldElement: searching for field:', field?.name, 'indexes:', field?.indexes);
        
        if (field.indexes?.[0] > 0) {
            // Roster field
            const rowIndex = field.indexes[0] - 1;
            const selector = `input[data-field-name="${field.name}"][data-row-index="${rowIndex}"], ` +
                `select[data-field-name="${field.name}"][data-row-index="${rowIndex}"], ` +
                `.roster-field-container[data-field-name="${field.name}"][data-row-index="${rowIndex}"]`;
            console.log('[MFC] _findFieldElement: roster selector:', selector);
            element = this.$.formContainer.querySelector(selector);
        }
        
        if (!element) {
            const selector = `[data-field-name="${field.name}"]`;
            console.log('[MFC] _findFieldElement: standalone selector:', selector);
            element = this.$.formContainer.querySelector(selector);
        }
        
        // Debug: list all data-field-name elements if not found
        if (!element) {
            const allFieldElements = this.$.formContainer.querySelectorAll('[data-field-name]');
            console.log('[MFC] _findFieldElement: all data-field-name elements:', 
                Array.from(allFieldElements).map(el => el.dataset.fieldName));
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
                
                // Handle any dialogs returned by the server
                if (result?.dialogs && result.dialogs.length > 0) {
                    for (const dialog of result.dialogs) {
                        console.log('[MFC] Processing server dialog:', dialog);
                        // Show the dialog (informational only since server already acknowledged)
                        // But for errmsg, we want to show it to the user so they know why navigation failed
                        if (dialog.dialogName === 'errmsg') {
                            await this._showMessage(dialog.inputData.message, dialog.inputData.title);
                        } else {
                            // Other dialogs
                            await this._showServerDialog(dialog);
                        }
                    }
                }
                
                if (result?.fields?.length > 0) {
                    this._currentPageResult = result;
                    
                    // Update control mode (System Controlled vs Operator Controlled) from engine
                    this._updateControlModeFromPage(result);
                    
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
                    
                    // Show dialog for:
                    // - RadioButton fields (roster or non-roster) 
                    // - Non-roster DropDown/ComboBox fields
                    // Roster fields with DropDown/ComboBox should use native <select> elements
                    const needsSelectDialog = hasValueSet && (isRadioButton || (isDropDownOrCombo && !isRosterField));
                    const needsCheckboxDialog = hasValueSet && isCheckBox;
                    
                    console.log('[MFC] Value set check: hasValueSet=', hasValueSet, 'isRosterField=', isRosterField, 
                                'isDropDownOrCombo=', isDropDownOrCombo, 'isRadioButton=', isRadioButton,
                                'isCheckBox=', isCheckBox, 'needsSelectDialog=', needsSelectDialog,
                                'needsCheckboxDialog=', needsCheckboxDialog);
                    
                    // Show multi-select checkbox dialog for checkbox capture type
                    if (needsCheckboxDialog) {
                        console.log('[MFC] Showing checkbox multi-select dialog for field:', newField.name);
                        // Fetch question text for the dialog
                        this.engine.getQuestionText().then(result => {
                            const questionText = result?.questionTextHtml || '';
                            return this.dialogHandler.showCheckboxSelectionDialog(newField, responses, '', questionText);
                        }).catch(() => {
                            return this.dialogHandler.showCheckboxSelectionDialog(newField, responses, '', '');
                        }).then(selectedValue => {
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
                    
                    // Update current field immediately so focus handlers know it's authorized
                    this.currentField = newField;

                    // Check if we need to switch forms
                    let fieldElement = this._findFieldElement(newField);
                    
                    if (!fieldElement) {
                        console.log('[MFC] Field element not found, checking for form switch...');
                        // Try to find the form containing this field
                        const forms = this.currentApp?.forms || [];
                        let targetForm = null;
                        
                        // First check if newField has formName
                        if (newField.formName) {
                            targetForm = forms.find(f => f.name === newField.formName);
                        }
                        
                        // If not found, search all forms for the field
                        if (!targetForm) {
                            for (const form of forms) {
                                // Check fields
                                if (form.fields?.some(f => f.name === newField.name)) {
                                    targetForm = form;
                                    break;
                                }
                                // Check rosters
                                if (form.rosters?.some(r => r.name === newField.name || r.fields?.some(f => f.name === newField.name))) {
                                    targetForm = form;
                                    break;
                                }
                            }
                        }
                        
                        if (targetForm && targetForm.name !== this.currentForm?.name) {
                            console.log('[MFC] Switching to form:', targetForm.name);
                            this._renderForm(targetForm);
                            // Try finding element again
                            fieldElement = this._findFieldElement(newField);
                        }
                    }

                    // Focus the new field
                    if (fieldElement) {
                        const inputEl = fieldElement.querySelector?.('input, select') || fieldElement;
                        setTimeout(() => {
                            inputEl.focus?.();
                            inputEl.select?.();
                        }, 10);
                    }
                    
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
        const focusedOcc = parseInt(input.dataset.occurrence) || 1;
        
        // Find navigation index of the focused field
        const navIdx = this.navigationFields.findIndex(nf => 
            nf.name === field.name && nf.occurrence === focusedOcc
        );

        // In modify mode, allow clicking any field until user starts editing
        // Once user clicks a field, we activate modify mode and start enforcing path
        if (this.isModifyMode && !this._modifyModeActive) {
            console.log('[MFC] _onFieldFocus: Modify mode - activating on user click:', field.name, focusedOcc);
            this._modifyModeActive = true;
            // Don't enforce path restrictions for the first click
        } else if (this.isPathOn !== false) {
            // Enforce System Controlled mode (Path On)
            // If path is on, user cannot arbitrarily move focus to another field
            // If we have a current field from the engine, and the focused field is different
            if (this.currentField) {
                const engineField = this.currentField;
                
                // Check if it's the same field
                // Note: field.name and input.dataset.occurrence need to match
                const engineOcc = engineField.indexes?.[0] || 1;
                
                if (field.name.toUpperCase() !== engineField.name.toUpperCase() || focusedOcc !== engineOcc) {
                    
                    // Check if we are trying to move to a previous field
                    // We need to know the index of the current engine field
                    const currentEngineNavIdx = this.navigationFields.findIndex(nf => 
                        nf.name.toUpperCase() === engineField.name.toUpperCase() && nf.occurrence === engineOcc
                    );
                    
                    // Allow moving back to previous fields
                    if (navIdx !== -1 && currentEngineNavIdx !== -1 && navIdx < currentEngineNavIdx) {
                        console.log('[MFC] _onFieldFocus: Moving back to previous field:', field.name);
                        // Trigger engine navigation
                        this.goToField(field.name, focusedOcc);
                        return;
                    }

                    console.log('[MFC] _onFieldFocus: Access denied in System Controlled mode. Expected:', 
                        engineField.name, engineOcc, 'Got:', field.name, focusedOcc);
                    
                    // Add visual feedback
                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                    
                    // Refocus the correct field
                    // We need to find the element for the engine's current field
                    const engineElement = this._findFieldElement(engineField);
                    if (engineElement) {
                        const engineInput = engineElement.querySelector?.('input, select') || engineElement;
                        // Use timeout to avoid fighting with the current focus event
                        setTimeout(() => {
                            engineInput.focus?.();
                        }, 10);
                    }
                    return; // Stop processing
                }
            }
        }

        this.currentField = field;
        
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
                
                let value = input.value;
                
                // Handle Checkboxes - get combined value
                if (field.captureType === CAPTURE_TYPES.CheckBox) {
                    const container = input.closest('.checkbox-group') || input.closest('.roster-field-container');
                    if (container) {
                        const checked = container.querySelectorAll('input:checked');
                        value = Array.from(checked).map(cb => cb.value).join('');
                    }
                }
                // Handle Radio Buttons - get selected value
                else if (field.captureType === CAPTURE_TYPES.RadioButton) {
                    const container = input.closest('.radio-group') || input.closest('.roster-field-container');
                    if (container) {
                        const checked = container.querySelector('input:checked');
                        value = checked ? checked.value : '';
                    }
                }

                if (e.shiftKey && e.key === 'Tab') {
                    await this.previousField();
                } else {
                    await this._advanceWithValue(value);
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

    async _onFieldClick(e, field, input) {
        // Handle click-to-activate dialog for standalone fields
        // This mirrors _onRosterCellClick logic
        
        // Always focus the field when clicked
        if (!input.matches(':focus')) {
            input.focus();
        }
        
        const CT = CAPTURE_TYPES;
        const captureType = field.captureType ?? CT.TextBox;
        const responses = field.responses || [];
        const hasValueSet = responses.length > 0;
        
        // Determine if we need to show a dialog
        const isCheckBox = captureType === CT.CheckBox;
        const isRadioButton = captureType === CT.RadioButton;
        const isDropDown = captureType === CT.DropDown;
        const isComboBox = captureType === CT.ComboBox;
        const isSlider = captureType === CT.Slider;
        const isDate = captureType === CT.Date;
        
        // CheckBox - show checkbox selection dialog
        if (isCheckBox && hasValueSet) {
            console.log('[MFC] _onFieldClick: Showing checkbox dialog for:', field.name);
            try {
                const currentValue = input.value || '';
                let questionText = '';
                try {
                    if (this.engine?.getQuestionText) {
                        const result = await this.engine.getQuestionText();
                        questionText = result?.questionTextHtml || '';
                    }
                } catch (err) {
                    console.warn('[MFC] Failed to get question text:', err);
                }
                const selectedValues = await this.dialogHandler.showCheckboxSelectionDialog(
                    field, 
                    responses, 
                    currentValue,
                    questionText
                );
                
                if (selectedValues !== null) {
                    input.value = selectedValues;
                    this._storeFieldValue(field.name, selectedValues, 1);
                    
                    if (this.engine?.setFieldValue) {
                        await this.engine.setFieldValue(field.name, selectedValues, 1);
                    }
                    
                    if (this.isPathOn) {
                        await this._advanceWithValue(selectedValues);
                    }
                }
            } catch (error) {
                console.error('[MFC] Checkbox dialog error:', error);
            }
            return;
        }
        
        // RadioButton, DropDown - show value set selection dialog
        // Note: RadioButton usually handled by createRadioButtonGroup, but if it's a single input (e.g. fallback), handle it here
        if ((isRadioButton || isDropDown) && hasValueSet) {
            console.log('[MFC] _onFieldClick: Showing value set dialog for:', field.name);
            try {
                let questionText = '';
                try {
                    if (this.engine?.getQuestionText) {
                        const result = await this.engine.getQuestionText();
                        questionText = result?.questionTextHtml || '';
                    }
                } catch (err) {
                    console.warn('[MFC] Failed to get question text:', err);
                }
                const selectedValue = await this.dialogHandler.showValueSetDialog(field, responses, questionText);
                
                if (selectedValue !== null) {
                    input.value = String(selectedValue);
                    this._storeFieldValue(field.name, String(selectedValue), 1);
                    
                    if (this.engine?.setFieldValue) {
                        await this.engine.setFieldValue(field.name, String(selectedValue), 1);
                    }
                    
                    if (this.isPathOn) {
                        await this._advanceWithValue(String(selectedValue));
                    }
                }
            } catch (error) {
                console.error('[MFC] Value set dialog error:', error);
            }
            return;
        }
        
        // ComboBox - show value set dialog (like DropDown but allows typing)
        if (isComboBox && hasValueSet) {
             // Usually rendered as <select>, but if rendered as input, show dialog
             // If it's a <select>, the click opens the native dropdown, so we don't need to do anything
             if (input.tagName.toLowerCase() === 'select') return;
             
             console.log('[MFC] _onFieldClick: Showing value set dialog for ComboBox:', field.name);
             try {
                const selectedValue = await this.dialogHandler.showValueSetDialog(field, responses);
                if (selectedValue !== null) {
                    input.value = String(selectedValue);
                    this._storeFieldValue(field.name, String(selectedValue), 1);
                    if (this.engine?.setFieldValue) await this.engine.setFieldValue(field.name, String(selectedValue), 1);
                    if (this.isPathOn) await this._advanceWithValue(String(selectedValue));
                }
             } catch (error) { console.error('[MFC] ComboBox dialog error:', error); }
             return;
        }
        
        // Slider
        if (isSlider) {
            // Usually rendered as range input, but if text input, show dialog
            if (input.type === 'range') return;
            // TODO: Show slider dialog
            return;
        }
        
        // Date
        if (isDate) {
            // Usually rendered as date input
            if (input.type === 'date') return;
            // TODO: Show date dialog
            return;
        }
        
        // Default: TextBox/Numeric with Value Set (but not explicit capture type)
        // CSEntry MFC behavior: When a field has a value set, clicking on it should
        // show the value set dialog to allow selection, regardless of whether
        // the field already has data or not.
        if (hasValueSet) {
            console.log('[MFC] _onFieldClick: Showing value set dialog for TextBox with ValueSet:', field.name);
            try {
                let questionText = '';
                try {
                    if (this.engine?.getQuestionText) {
                        const result = await this.engine.getQuestionText();
                        questionText = result?.questionTextHtml || '';
                    }
                } catch (err) {
                    console.warn('[MFC] Failed to get question text:', err);
                }
                const selectedValue = await this.dialogHandler.showValueSetDialog(field, responses, questionText);
                
                if (selectedValue !== null) {
                    input.value = String(selectedValue);
                    this._storeFieldValue(field.name, String(selectedValue), 1);
                    
                    if (this.engine?.setFieldValue) {
                        await this.engine.setFieldValue(field.name, String(selectedValue), 1);
                    }
                    
                    if (this.isPathOn) {
                        await this._advanceWithValue(String(selectedValue));
                    }
                }
            } catch (error) {
                console.error('[MFC] Value set dialog error:', error);
            }
            return;
        }
        
        // Default behavior for TextBox/Numeric without value set: focus and select for editing
        input.focus();
        input.select?.();
    }
    
    // ==================== ROSTER EVENTS ====================
    
    async _onRosterCellFocus(e, field, rowIdx, roster, input) {
        const focusedOcc = rowIdx + 1;
        
        // Find navigation index of the focused field
        const navIdx = this.navigationFields.findIndex(nf => 
            nf.name === field.name && nf.occurrence === focusedOcc
        );

        // In modify mode, allow clicking any field until user starts editing
        // Once user clicks a field, we activate modify mode and start enforcing path
        if (this.isModifyMode && !this._modifyModeActive) {
            console.log('[MFC] _onRosterCellFocus: Modify mode - activating on user click:', field.name, focusedOcc);
            this._modifyModeActive = true;
            // Don't enforce path restrictions for the first click
        } else if (this.isPathOn !== false && this._modifyModeActive) {
            // Enforce System Controlled mode (Path On) only after modify mode is active
            if (this.currentField) {
                const engineField = this.currentField;
                const engineOcc = engineField.indexes?.[0] || 1;
                
                if (field.name.toUpperCase() !== engineField.name.toUpperCase() || focusedOcc !== engineOcc) {
                    
                    // Check if we are trying to move to a previous field
                    const currentEngineNavIdx = this.navigationFields.findIndex(nf => 
                        nf.name.toUpperCase() === engineField.name.toUpperCase() && nf.occurrence === engineOcc
                    );
                    
                    // Allow moving back to previous fields
                    if (navIdx !== -1 && currentEngineNavIdx !== -1 && navIdx < currentEngineNavIdx) {
                        console.log('[MFC] _onRosterCellFocus: Moving back to previous field:', field.name);
                        this.goToField(field.name, focusedOcc);
                        return;
                    }

                    console.log('[MFC] _onRosterCellFocus: Access denied in System Controlled mode. Expected:', 
                        engineField.name, engineOcc, 'Got:', field.name, focusedOcc);
                    
                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                    
                    const engineElement = this._findFieldElement(engineField);
                    if (engineElement) {
                        const engineInput = engineElement.querySelector?.('input, select') || engineElement;
                        setTimeout(() => {
                            engineInput.focus?.();
                        }, 10);
                    }
                    return;
                }
            }
        } else if (this.isPathOn !== false && !this.isModifyMode) {
            // Non-modify mode: enforce path from the start
            if (this.currentField) {
                const engineField = this.currentField;
                const engineOcc = engineField.indexes?.[0] || 1;
                
                if (field.name.toUpperCase() !== engineField.name.toUpperCase() || focusedOcc !== engineOcc) {
                    
                    // Check if we are trying to move to a previous field
                    const currentEngineNavIdx = this.navigationFields.findIndex(nf => 
                        nf.name.toUpperCase() === engineField.name.toUpperCase() && nf.occurrence === engineOcc
                    );
                    
                    // Allow moving back to previous fields
                    if (navIdx !== -1 && currentEngineNavIdx !== -1 && navIdx < currentEngineNavIdx) {
                        console.log('[MFC] _onRosterCellFocus: Moving back to previous field:', field.name);
                        this.goToField(field.name, focusedOcc);
                        return;
                    }

                    console.log('[MFC] _onRosterCellFocus: Access denied in System Controlled mode. Expected:', 
                        engineField.name, engineOcc, 'Got:', field.name, focusedOcc);
                    
                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                    
                    const engineElement = this._findFieldElement(engineField);
                    if (engineElement) {
                        const engineInput = engineElement.querySelector?.('input, select') || engineElement;
                        setTimeout(() => {
                            engineInput.focus?.();
                        }, 10);
                    }
                    return;
                }
            }
        }

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
        
        // Show single-select dialog for RadioButton capture type only
        // DropDown and ComboBox are rendered as <select> elements and use native dropdown
        if (isRadioButton && hasValueSet) {
            console.log('[MFC] _onRosterCellFocus: Showing value set dialog for RadioButton:', field.name);
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
        
        // For DropDown and ComboBox, the <select> element handles interaction natively
        // No dialog needed on focus
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
                
                let value = input.value ?? '';
                
                // Handle Checkboxes - get combined value
                if (field.captureType === CAPTURE_TYPES.CheckBox) {
                    const container = input.closest('.roster-field-container');
                    if (container) {
                        const checked = container.querySelectorAll('input:checked');
                        value = Array.from(checked).map(cb => cb.value).join('');
                    }
                }
                // Handle Radio Buttons - get selected value
                else if (field.captureType === CAPTURE_TYPES.RadioButton) {
                    const container = input.closest('.roster-field-container');
                    if (container) {
                        const checked = container.querySelector('input:checked');
                        value = checked ? checked.value : '';
                    }
                }

                if (e.shiftKey && e.key === 'Tab') {
                    await this.previousField();
                } else {
                    await this._advanceWithValue(value);
                }
                break;
                
            case 'ArrowDown':
            case 'ArrowUp':
                // Allow navigation attempts - _onRosterCellFocus will enforce path logic
                if (freeMovementMode === 2 || freeMovementMode === 0) {
                    e.preventDefault();
                    const newRow = e.key === 'ArrowDown' ? rowIdx + 1 : rowIdx - 1;
                    moveToRosterCell(this._rosters, this.$.formContainer, roster.name, field.name, newRow);
                }
                break;
                
            case 'ArrowLeft':
            case 'ArrowRight':
                // Allow navigation attempts - _onRosterCellFocus will enforce path logic
                if (freeMovementMode === 1 || freeMovementMode === 0) {
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
        // Always focus the field when clicked
        if (!input.matches(':focus')) {
            input.focus();
        }
        
        const isSystemControlled = this.isPathOn !== false;
        const focusedOcc = rowIdx + 1;
        
        if (isSystemControlled) {
            const engineField = this.currentField;
            if (engineField) {
                const engineOcc = engineField.indexes?.[0] || 1;
                if (engineField.name.toUpperCase() !== field.name.toUpperCase() || engineOcc !== focusedOcc) {
                    
                    // Check if we are trying to move to a previous field
                    const navIdx = this.navigationFields.findIndex(nf => 
                        nf.name === field.name && nf.occurrence === focusedOcc
                    );
                    const currentEngineNavIdx = this.navigationFields.findIndex(nf => 
                        nf.name.toUpperCase() === engineField.name.toUpperCase() && nf.occurrence === engineOcc
                    );
                    
                    // Allow moving back to previous fields
                    if (navIdx !== -1 && currentEngineNavIdx !== -1 && navIdx < currentEngineNavIdx) {
                        console.log('[MFC] _onRosterCellClick: Moving back to previous field:', field.name);
                        this.goToField(field.name, focusedOcc);
                        return;
                    }

                    input.classList.add('click-denied');
                    setTimeout(() => input.classList.remove('click-denied'), 200);
                    
                    // Refocus engine's current field
                    const engineElement = this._findFieldElement(engineField);
                    if (engineElement) {
                        const engineInput = engineElement.querySelector?.('input, select') || engineElement;
                        engineInput?.focus();
                    }
                    return;
                }
            }
        }
        
        // CSEntry MFC behavior: Click inside a field should display appropriate dialog
        // based on capture type and advance after selection
        const container = input.closest('.roster-field-container');
        const captureType = container?.dataset.captureType || input.dataset.captureType || field.captureType;
        const hasValueSet = container?.dataset.hasValueSet === '1' || input.dataset.hasValueSet === '1';
        
        // Normalize capture type - handle both string and integer values
        const CT = CAPTURE_TYPES;
        let normalizedCaptureType = captureType;
        if (typeof captureType === 'string') {
            const captureTypeMap = {
                'TextBox': CT.TextBox, 'textbox': CT.TextBox,
                'RadioButton': CT.RadioButton, 'radiobutton': CT.RadioButton,
                'CheckBox': CT.CheckBox, 'checkbox': CT.CheckBox,
                'DropDown': CT.DropDown, 'dropdown': CT.DropDown,
                'ComboBox': CT.ComboBox, 'combobox': CT.ComboBox,
                'Date': CT.Date, 'date': CT.Date,
                'Slider': CT.Slider, 'slider': CT.Slider,
                'ToggleButton': CT.ToggleButton, 'togglebutton': CT.ToggleButton
            };
            normalizedCaptureType = captureTypeMap[captureType] ?? CT.TextBox;
        }
        
        // a) CheckBox - show checkbox selection dialog
        if (normalizedCaptureType === CT.CheckBox) {
            await this._onRosterCheckboxDialogRequest(field, container, rowIdx, roster, input);
            return;
        }
        
        // a) RadioButton - show value set selection dialog
        if (normalizedCaptureType === CT.RadioButton) {
            const responses = field.responses || [];
            await this._onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses);
            return;
        }
        
        // DropDown and ComboBox are rendered as <select> elements
        // They use native dropdown behavior, no dialog needed on click
        if (normalizedCaptureType === CT.DropDown || normalizedCaptureType === CT.ComboBox) {
            // If it's actually a <select> element, let native behavior handle it
            if (input.tagName && input.tagName.toLowerCase() === 'select') {
                input.focus();
                return;
            }
            // Fallback: if somehow rendered as input, show dialog
            const responses = field.responses || [];
            await this._onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses);
            return;
        }
        
        // a) Slider - show slider dialog
        if (normalizedCaptureType === CT.Slider) {
            await this._onRosterSliderDialogRequest(field, container, rowIdx, roster, input);
            return;
        }
        
        // a) Date - show date picker dialog
        if (normalizedCaptureType === CT.Date) {
            await this._onRosterDateDialogRequest(field, container, rowIdx, roster, input);
            return;
        }
        
        // a) ToggleButton - show toggle button dialog
        if (normalizedCaptureType === CT.ToggleButton) {
            const responses = field.responses || [];
            await this._onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses);
            return;
        }
        
        // For fields with value sets but no explicit capture type, show dialog
        if (hasValueSet) {
            const responses = field.responses || [];
            if (responses.length > 0) {
                await this._onRosterValueSetDialogRequest(field, container, rowIdx, roster, input, responses);
                return;
            }
        }
        
        // Default behavior for TextBox/Numeric: focus and select for editing
        input.focus();
        input.select?.();
    }
    
    /**
     * Handle roster slider dialog request
     */
    async _onRosterSliderDialogRequest(field, container, rowIdx, roster, input) {
        console.log('[MFC] _onRosterSliderDialogRequest:', field.name, 'row:', rowIdx);
        
        try {
            const occurrence = rowIdx + 1;
            const currentValue = input.value || '';
            
            // Get slider properties from field
            const minValue = field.sliderMin ?? 0;
            const maxValue = field.sliderMax ?? 100;
            
            // Show slider dialog
            const selectedValue = await this.dialogHandler.showSliderDialog(field, currentValue, minValue, maxValue);
            
            console.log('[MFC] Slider dialog result:', selectedValue);
            
            if (selectedValue !== null && selectedValue !== undefined) {
                input.value = selectedValue;
                this._storeFieldValue(field.name, selectedValue, occurrence);
                
                if (this.engine?.setFieldValue) {
                    await this.engine.setFieldValue(field.name, selectedValue, occurrence);
                }
                
                // Advance to next field after selection
                if (this.isPathOn) {
                    await this._advanceWithValue(selectedValue);
                    return;
                }
            }
            
            input.focus();
        } catch (error) {
            console.error('[MFC] Slider dialog error:', error);
            input.focus();
        }
    }
    
    /**
     * Handle roster date dialog request
     */
    async _onRosterDateDialogRequest(field, container, rowIdx, roster, input) {
        console.log('[MFC] _onRosterDateDialogRequest:', field.name, 'row:', rowIdx);
        
        try {
            const occurrence = rowIdx + 1;
            const currentValue = input.value || '';
            
            // Show date picker dialog
            const selectedValue = await this.dialogHandler.showDateDialog(field, currentValue);
            
            console.log('[MFC] Date dialog result:', selectedValue);
            
            if (selectedValue !== null && selectedValue !== undefined) {
                input.value = selectedValue;
                this._storeFieldValue(field.name, selectedValue, occurrence);
                
                if (this.engine?.setFieldValue) {
                    await this.engine.setFieldValue(field.name, selectedValue, occurrence);
                }
                
                // Advance to next field after selection
                if (this.isPathOn) {
                    await this._advanceWithValue(selectedValue);
                    return;
                }
            }
            
            input.focus();
        } catch (error) {
            console.error('[MFC] Date dialog error:', error);
            input.focus();
        }
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
        
        // Fetch question text for the dialog
        let questionText = '';
        try {
            if (this.engine?.getQuestionText) {
                const result = await this.engine.getQuestionText();
                questionText = result?.questionTextHtml || '';
                console.log('[MFC] Got question text for dialog, length:', questionText?.length || 0);
            }
        } catch (err) {
            console.warn('[MFC] Failed to get question text:', err);
        }
        
        console.log('[MFC] Calling dialogHandler.showValueSetDialog');
        try {
            const result = await this.dialogHandler.showValueSetDialog(field, responses, questionText);
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
            (fieldName, occurrence) => this.goToField(fieldName, occurrence || 1)
        );
    }
    
    /**
     * Build case list tree showing all cases with current operation indicator
     * MFC-style: Shows File folder with all cases, plus <Adding Case> when adding
     * @param {boolean} isAddingCase - True if adding a new case
     * @param {boolean} isModifyingCase - True if modifying an existing case
     * @param {number} currentCaseIndex - Index of case being modified (-1 for new)
     */
    async _buildCaseListTree(isAddingCase = false, isModifyingCase = false, currentCaseIndex = -1) {
        // Get all cases from engine
        let cases = [];
        if (this.engine?.getSequentialCaseIds) {
            cases = this.engine.getSequentialCaseIds();
            if (cases?.then) cases = await cases;
        }
        
        // Store cases for later reference
        this._caseList = cases || [];
        
        // Show tree content, hide case list view
        const caseListView = this.shadowRoot.getElementById('caseListView');
        const treeContent = this.shadowRoot.getElementById('treeContent');
        const leftPanelHeader = this.shadowRoot.getElementById('leftPanelHeader');
        
        if (caseListView) caseListView.style.display = 'none';
        if (treeContent) treeContent.style.display = 'block';
        if (leftPanelHeader) leftPanelHeader.textContent = 'Case Tree';
        
        // Build the MFC-style case list tree
        buildCaseListTree(
            this.$.treeContent,
            this.currentApp,
            this._caseList,
            {
                isAddingCase,
                isModifyingCase,
                currentCaseIndex,
                onCaseClick: async (index, position) => {
                    // When clicking a case, open it in modify mode
                    await this._openCaseFromList(position);
                },
                onFieldClick: (fieldName, occurrence) => {
                    this.goToField(fieldName, occurrence || 1);
                }
            }
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
