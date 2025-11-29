/**
 * Application Loader - Handles loading CSPro applications from various sources
 * @module components/csentry-mfc-view/loaders/application-loader
 */

/**
 * Application source types
 */
export const APP_SOURCES = {
    SERVER: 'server',
    ASSETS: 'assets',
    CSWEB: 'csweb',
    UPLOAD: 'upload'
};

/**
 * ApplicationLoader class - manages loading CSPro applications from multiple sources
 */
export class ApplicationLoader {
    /**
     * Create an ApplicationLoader instance
     * @param {Object} options - Configuration options
     * @param {string} options.apiBaseUrl - Base URL for API calls (default: '')
     * @param {string} options.cswebUrl - CSWeb server URL (default: '')
     */
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || '';
        this.cswebUrl = options.cswebUrl || '';
        this.storageBasePath = '/storage/applications';
    }

    /**
     * Get list of applications from server storage
     * @returns {Promise<Array>} List of applications
     */
    async getServerApplications() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/applications`);
            if (!response.ok) {
                throw new Error(`Failed to fetch applications: ${response.statusText}`);
            }
            const data = await response.json();
            return data.applications || [];
        } catch (error) {
            console.error('[AppLoader] Error fetching server applications:', error);
            throw error;
        }
    }

    /**
     * Get list of applications embedded in WASM assets
     * @returns {Promise<Array>} List of asset applications
     */
    async getAssetApplications() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/applications/assets`);
            if (!response.ok) {
                throw new Error(`Failed to fetch asset applications: ${response.statusText}`);
            }
            const data = await response.json();
            return data.applications || [];
        } catch (error) {
            console.error('[AppLoader] Error fetching asset applications:', error);
            throw error;
        }
    }

    /**
     * Get list of applications from CSWeb server
     * @param {string} cswebUrl - CSWeb server URL
     * @param {Object} credentials - Authentication credentials
     * @returns {Promise<Array>} List of CSWeb applications
     */
    async getCSWebApplications(cswebUrl, credentials = {}) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/csweb/applications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: cswebUrl || this.cswebUrl,
                    ...credentials
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch CSWeb applications: ${response.statusText}`);
            }
            const data = await response.json();
            return data.applications || [];
        } catch (error) {
            console.error('[AppLoader] Error fetching CSWeb applications:', error);
            throw error;
        }
    }

    /**
     * Load application from server storage
     * @param {string} appPath - Path to the application
     * @returns {Promise<Object>} Application data with PFF content
     */
    async loadFromServer(appPath) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/applications/load`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: appPath })
            });
            if (!response.ok) {
                throw new Error(`Failed to load application: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[AppLoader] Error loading server application:', error);
            throw error;
        }
    }

    /**
     * Load application from WASM assets
     * @param {string} assetPath - Path to the asset application
     * @returns {Promise<Object>} Application data with PFF content
     */
    async loadFromAssets(assetPath) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/applications/assets/load`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: assetPath })
            });
            if (!response.ok) {
                throw new Error(`Failed to load asset application: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[AppLoader] Error loading asset application:', error);
            throw error;
        }
    }

    /**
     * Load application from CSWeb server
     * @param {string} cswebUrl - CSWeb server URL
     * @param {string} appId - Application ID on CSWeb
     * @param {Object} credentials - Authentication credentials
     * @returns {Promise<Object>} Application data with PFF content
     */
    async loadFromCSWeb(cswebUrl, appId, credentials = {}) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/csweb/load`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: cswebUrl || this.cswebUrl,
                    appId,
                    ...credentials
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to load CSWeb application: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[AppLoader] Error loading CSWeb application:', error);
            throw error;
        }
    }

    /**
     * Upload application files from local file system
     * @param {FileList|Array<File>} files - Files to upload
     * @param {string} appName - Application name/folder
     * @returns {Promise<Object>} Upload result with application path
     */
    async uploadApplication(files, appName) {
        try {
            const formData = new FormData();
            formData.append('appName', appName);
            
            // Add all files to form data
            for (const file of files) {
                // Preserve directory structure using webkitRelativePath if available
                const path = file.webkitRelativePath || file.name;
                formData.append('files', file, path);
            }

            const response = await fetch(`${this.apiBaseUrl}/api/applications/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Failed to upload application: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[AppLoader] Error uploading application:', error);
            throw error;
        }
    }

    /**
     * Parse PFF content
     * @param {string} pffContent - PFF file content
     * @returns {Object} Parsed PFF data
     */
    parsePFF(pffContent) {
        const pff = {
            version: '',
            appType: '',
            application: '',
            inputData: '',
            options: {}
        };

        const lines = pffContent.split(/\r?\n/);
        let currentSection = '';

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Section header
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1).toLowerCase();
                continue;
            }

            // Key=Value
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
                const value = trimmed.slice(eqIdx + 1).trim();

                if (currentSection === 'run information') {
                    if (key === 'version') pff.version = value;
                    else if (key === 'apptype') pff.appType = value;
                }
                else if (currentSection === 'files') {
                    if (key === 'application') pff.application = value;
                    else if (key === 'inputdata') pff.inputData = value;
                }
                else if (currentSection === 'parameters') {
                    pff.options[key] = value;
                }
            }
        }

        return pff;
    }
}

/**
 * Create HTML for the application source selection dialog
 * @returns {string} HTML string
 */
export function createAppSourceDialog() {
    return `
        <div class="app-source-dialog">
            <div class="app-source-header">
                <h2>Load Application</h2>
                <button class="dialog-close" data-action="close">&times;</button>
            </div>
            <div class="app-source-body">
                <p class="app-source-instruction">Select where to load the application from:</p>
                <div class="app-source-options">
                    <div class="app-source-option" data-source="server">
                        <div class="source-icon">🌐</div>
                        <div class="source-name">Server</div>
                        <div class="source-desc">Applications on the server</div>
                    </div>
                    <div class="app-source-option" data-source="assets">
                        <div class="source-icon">📦</div>
                        <div class="source-name">Assets</div>
                        <div class="source-desc">Built-in applications</div>
                    </div>
                    <div class="app-source-option" data-source="csweb">
                        <div class="source-icon">☁️</div>
                        <div class="source-name">CSWeb</div>
                        <div class="source-desc">CSWeb server sync</div>
                    </div>
                    <div class="app-source-option" data-source="upload">
                        <div class="source-icon">📁</div>
                        <div class="source-name">Upload</div>
                        <div class="source-desc">Upload from your computer</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create HTML for the application list view
 * @param {Array} applications - List of applications
 * @param {string} sourceType - Source type (server, assets, csweb)
 * @returns {string} HTML string
 */
export function createAppListView(applications, sourceType) {
    const appItems = applications.map(app => `
        <div class="app-list-item" data-path="${app.path || app.id}">
            <div class="app-icon">📋</div>
            <div class="app-info">
                <div class="app-name">${app.name || app.label || 'Unnamed Application'}</div>
                <div class="app-path">${app.path || app.description || ''}</div>
            </div>
        </div>
    `).join('');

    return `
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
}

/**
 * Create HTML for CSWeb connection dialog
 * @returns {string} HTML string
 */
export function createCSWebDialog() {
    return `
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
}

/**
 * Create HTML for upload dialog
 * @returns {string} HTML string
 */
export function createUploadDialog() {
    return `
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
                    <p>Click to select folder or drag and drop</p>
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
}

export default ApplicationLoader;
