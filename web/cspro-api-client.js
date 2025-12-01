/**
 * CSPro REST API Client
 * 
 * Browser-side client for communicating with the CSPro WASM REST API.
 * This allows browsers without JSPI support (like Safari) to use CSPro
 * functionality via standard HTTP requests to the Node.js server.
 * 
 * The server runs the WASM with JSPI enabled and exposes it via REST API.
 */

class CSProApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.sessionId = null;
        this.serverSideAvailable = null;
    }

    /**
     * Check if server-side WASM is available
     */
    async checkServerAvailability() {
        try {
            const response = await fetch(`${this.baseUrl}/api/cspro/health`);
            const data = await response.json();
            this.serverSideAvailable = data.wasmInitialized === true;
            return {
                available: this.serverSideAvailable,
                message: data.message || 'Server-side WASM available'
            };
        } catch (error) {
            this.serverSideAvailable = false;
            return {
                available: false,
                message: 'Server not reachable'
            };
        }
    }

    /**
     * Create a new CSPro session
     */
    async createSession() {
        const response = await fetch(`${this.baseUrl}/api/cspro/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        if (data.success) {
            this.sessionId = data.sessionId;
        }
        return data;
    }

    /**
     * Destroy the current session
     */
    async destroySession() {
        if (!this.sessionId) return { success: true };
        
        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            this.sessionId = null;
        }
        return data;
    }

    /**
     * Load an application
     * @param {string} pffContent - PFF file content
     * @param {Object} files - Object mapping filename to content
     * @param {string} appName - Application name (optional)
     */
    async loadApplication(pffContent, files, appName = null) {
        if (!this.sessionId) {
            await this.createSession();
        }

        // Convert binary files to base64
        const processedFiles = {};
        for (const [filename, content] of Object.entries(files)) {
            if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
                const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
                processedFiles[filename] = {
                    base64: btoa(String.fromCharCode(...bytes))
                };
            } else {
                processedFiles[filename] = content;
            }
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pffContent: pffContent,
                files: processedFiles,
                appName: appName
            })
        });
        
        return await response.json();
    }

    /**
     * Start data entry
     * @param {string} mode - 'add', 'modify', or 'verify'
     */
    async startEntry(mode = 'add') {
        if (!this.sessionId) {
            throw new Error('No session. Call loadApplication first.');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        
        return await response.json();
    }

    /**
     * Stop data entry
     * @param {boolean} save - Whether to save the case
     */
    async stopEntry(save = true) {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ save })
        });
        
        return await response.json();
    }

    /**
     * Get current page state
     */
    async getCurrentPage() {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/page`);
        const data = await response.json();
        
        return data.success ? data.page : null;
    }

    /**
     * Advance to next field with value
     * @param {string|number} value - Field value
     */
    async advanceField(value) {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/advance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        
        return await response.json();
    }

    /**
     * Move back to previous field
     */
    async previousField() {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/previous`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        return await response.json();
    }

    /**
     * Get question text for a field
     * @param {string} fieldName - Field name (optional, defaults to current field)
     */
    async getQuestionText(fieldName = '') {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const url = new URL(`${this.baseUrl}/api/cspro/session/${this.sessionId}/question-text`);
        if (fieldName) {
            url.searchParams.set('field', fieldName);
        }

        const response = await fetch(url);
        const data = await response.json();
        
        return data.success ? data.questionText : '';
    }

    /**
     * Get responses/value set for a field
     * @param {string} fieldName - Field name (optional, defaults to current field)
     */
    async getResponses(fieldName = '') {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const url = new URL(`${this.baseUrl}/api/cspro/session/${this.sessionId}/responses`);
        if (fieldName) {
            url.searchParams.set('field', fieldName);
        }

        const response = await fetch(url);
        const data = await response.json();
        
        return data.success ? data.responses : [];
    }

    /**
     * End the current roster
     */
    async endRoster() {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/end-roster`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        return await response.json();
    }

    /**
     * End the current group
     */
    async endGroup() {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/end-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        return await response.json();
    }

    /**
     * Execute an Action Invoker action
     * @param {number} actionCode - Action code
     * @param {any} args - Action arguments
     * @param {string} accessToken - Access token
     */
    async executeAction(actionCode, args, accessToken) {
        if (!this.sessionId) {
            throw new Error('No session');
        }

        const response = await fetch(`${this.baseUrl}/api/cspro/session/${this.sessionId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionCode, args, accessToken })
        });
        
        const data = await response.json();
        return data.success ? data.result : null;
    }
}

/**
 * CSPro Hybrid Client
 * 
 * Automatically chooses between:
 * 1. Server-side WASM execution (REST API) - works in Safari
 * 2. Client-side WASM execution (direct) - requires JSPI support
 */
class CSProHybridClient {
    constructor(options = {}) {
        this.options = options;
        this.apiClient = new CSProApiClient(options.baseUrl || '');
        this.directModule = null;
        this.useServerSide = null;
    }

    /**
     * Initialize the client, detecting the best execution method
     */
    async initialize() {
        // Check server-side availability first
        const serverCheck = await this.apiClient.checkServerAvailability();
        
        if (serverCheck.available) {
            console.log('[CSProHybrid] Using server-side WASM execution');
            this.useServerSide = true;
            return { mode: 'server', message: 'Server-side WASM execution' };
        }

        // Check if browser supports JSPI for client-side execution
        const jspiSupported = await this._checkJSPISupport();
        
        if (jspiSupported) {
            console.log('[CSProHybrid] Using client-side WASM execution');
            this.useServerSide = false;
            return { mode: 'client', message: 'Client-side WASM execution (JSPI)' };
        }

        // Neither available
        throw new Error('CSPro WASM not available. Server-side WASM not running and browser lacks JSPI support.');
    }

    /**
     * Check if browser supports JSPI
     */
    async _checkJSPISupport() {
        try {
            // Try to detect JSPI support
            // This is a simplified check - real detection would need to test actual JSPI features
            const isChrome = /Chrome/.test(navigator.userAgent);
            const isEdge = /Edg/.test(navigator.userAgent);
            const isFirefox = /Firefox/.test(navigator.userAgent);
            
            // Chrome/Edge 119+ and Firefox 120+ have JSPI support (with flags)
            if (isChrome || isEdge) {
                const match = navigator.userAgent.match(/(?:Chrome|Edg)\/(\d+)/);
                if (match && parseInt(match[1]) >= 119) {
                    return true;
                }
            }
            
            if (isFirefox) {
                const match = navigator.userAgent.match(/Firefox\/(\d+)/);
                if (match && parseInt(match[1]) >= 120) {
                    return true;
                }
            }

            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Load application - delegates to appropriate client
     */
    async loadApplication(pffContent, files) {
        if (this.useServerSide === null) {
            await this.initialize();
        }

        if (this.useServerSide) {
            return await this.apiClient.loadApplication(pffContent, files);
        } else {
            // Client-side: caller should use direct WASM module
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Start entry - delegates to appropriate client
     */
    async startEntry(mode = 'add') {
        if (this.useServerSide) {
            return await this.apiClient.startEntry(mode);
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Get current page - delegates to appropriate client
     */
    async getCurrentPage() {
        if (this.useServerSide) {
            return await this.apiClient.getCurrentPage();
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Advance field - delegates to appropriate client
     */
    async advanceField(value) {
        if (this.useServerSide) {
            return await this.apiClient.advanceField(value);
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Previous field - delegates to appropriate client
     */
    async previousField() {
        if (this.useServerSide) {
            return await this.apiClient.previousField();
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Get question text - delegates to appropriate client
     */
    async getQuestionText(fieldName) {
        if (this.useServerSide) {
            return await this.apiClient.getQuestionText(fieldName);
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Get responses - delegates to appropriate client
     */
    async getResponses(fieldName) {
        if (this.useServerSide) {
            return await this.apiClient.getResponses(fieldName);
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * End roster - delegates to appropriate client
     */
    async endRoster() {
        if (this.useServerSide) {
            return await this.apiClient.endRoster();
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * End group - delegates to appropriate client
     */
    async endGroup() {
        if (this.useServerSide) {
            return await this.apiClient.endGroup();
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Stop entry - delegates to appropriate client
     */
    async stopEntry(save = true) {
        if (this.useServerSide) {
            return await this.apiClient.stopEntry(save);
        } else {
            throw new Error('Client-side execution: use direct WASM module');
        }
    }

    /**
     * Destroy session/cleanup
     */
    async destroy() {
        if (this.useServerSide) {
            return await this.apiClient.destroySession();
        }
    }
}

// ESM exports only
export { CSProApiClient, CSProHybridClient };
export default CSProHybridClient;
