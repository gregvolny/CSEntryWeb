/**
 * CSPro Web Server with REST API
 * 
 * This server provides:
 * 1. Static file serving for the CSEntry web application
 * 2. REST API for server-side WASM execution (for browsers without JSPI)
 * 
 * Usage:
 *   node server-api.js                           # Standard mode
 *   node --experimental-wasm-jspi server-api.js  # With JSPI support
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Check if JSPI is available (requires --experimental-wasm-jspi flag)
let jspiAvailable = false;
try {
    // WebAssembly.Suspending is available when JSPI is enabled
    jspiAvailable = typeof WebAssembly.Suspending !== 'undefined';
} catch (e) {
    jspiAvailable = false;
}

console.log(`[Server] JSPI available: ${jspiAvailable}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));  // Large limit for application files

// CORS headers for WASM
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Static file serving with proper MIME types
app.use(express.static(path.join(__dirname, 'web'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        } else if (filePath.endsWith('.data')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        server: 'CSPro Web API Server',
        version: '1.0.0',
        jspiAvailable,
        mode: jspiAvailable ? 'server-jspi' : 'server-nojspi',
        timestamp: Date.now()
    });
});

// JSPI capability endpoint - browsers check this to decide execution mode
app.get('/api/capabilities', (req, res) => {
    res.json({
        jspi: jspiAvailable,
        serverExecution: true,
        features: [
            'session-management',
            'application-loading',
            'field-navigation',
            'action-invoker'
        ]
    });
});

// Load and mount API routes only if JSPI is available on server
if (jspiAvailable) {
    console.log('[Server] Loading CSPro WASM service with JSPI...');
    
    // Dynamic import for ESM
    const csproRoutes = await import('./cspro-api-routes.js');
    const { wasmService } = await import('./cspro-wasm-service.js');
    
    // Initialize WASM service on startup
    console.log('[Server] Initializing WASM module...');
    try {
        await wasmService.initialize();
        console.log('[Server] WASM module initialized successfully');
    } catch (error) {
        console.error('[Server] Failed to initialize WASM:', error.message);
    }
    
    app.use('/api/cspro', csproRoutes.default);
    
    console.log('[Server] CSPro API routes mounted at /api/cspro');
} else {
    console.log('[Server] JSPI not available - API routes disabled');
    console.log('[Server] To enable server-side WASM, start with:');
    console.log('         node --experimental-wasm-jspi server-api.js');
    
    // Provide fallback message for API endpoints
    app.use('/api/cspro', (req, res) => {
        res.status(503).json({
            error: 'Server-side WASM not available',
            message: 'Server was started without JSPI support. Client-side WASM will be used.',
            hint: 'Start server with: node --experimental-wasm-jspi server-api.js'
        });
    });
}

// Application files endpoint - serve CSPro applications
app.use('/applications', express.static(path.join(__dirname, 'storage/applications'), {
    setHeaders: (res, filePath) => {
        // Set appropriate content types for CSPro files
        if (filePath.endsWith('.dcf')) {
            res.setHeader('Content-Type', 'text/plain');
        } else if (filePath.endsWith('.fmf')) {
            res.setHeader('Content-Type', 'text/plain');
        } else if (filePath.endsWith('.pff')) {
            res.setHeader('Content-Type', 'text/plain');
        } else if (filePath.endsWith('.ent.qsf')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (filePath.endsWith('.pen')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// List available applications
app.get('/api/applications', (req, res) => {
    const appsDir = path.join(__dirname, 'storage/applications');
    
    try {
        if (!fs.existsSync(appsDir)) {
            return res.json({ applications: [] });
        }
        
        const apps = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const appPath = path.join(appsDir, dirent.name);
                const pffFiles = fs.readdirSync(appPath)
                    .filter(f => f.endsWith('.pff'));
                
                return {
                    name: dirent.name,
                    pffFiles
                };
            });
        
        res.json({ applications: apps });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to list applications',
            message: error.message
        });
    }
});

// Get all files for a specific application
app.get('/api/applications/:name/files', (req, res) => {
    const appName = req.params.name;
    const appDir = path.join(__dirname, 'storage/applications', appName);
    
    try {
        if (!fs.existsSync(appDir)) {
            return res.status(404).json({
                error: 'Application not found',
                name: appName
            });
        }
        
        const files = {};
        const readFilesRecursively = (dir, basePath = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
                
                if (entry.isDirectory()) {
                    readFilesRecursively(fullPath, relativePath);
                } else {
                    // Read file content
                    const content = fs.readFileSync(fullPath);
                    // Check if it's likely binary (pen files, etc.)
                    const isBinary = entry.name.endsWith('.pen') || 
                                     entry.name.endsWith('.csdb') ||
                                     entry.name.endsWith('.dat');
                    
                    if (isBinary) {
                        files[relativePath] = {
                            type: 'binary',
                            data: content.toString('base64')
                        };
                    } else {
                        files[relativePath] = content.toString('utf-8');
                    }
                }
            }
        };
        
        readFilesRecursively(appDir);
        
        // Find the first PFF file as the main entry point
        const pffFile = Object.keys(files).find(f => f.toLowerCase().endsWith('.pff'));
        
        res.json({
            success: true,
            name: appName,
            pffFile: pffFile || null,
            files: files
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to load application files',
            message: error.message
        });
    }
});

// List applications from WASM assets
app.get('/api/applications/assets', (req, res) => {
    // These are embedded in the WASM data file
    // For now, return an empty list or scan the WASM data file structure
    // In production, this would query the WASM module for embedded assets
    try {
        const assetsDir = path.join(__dirname, 'web', 'assets', 'applications');
        
        if (!fs.existsSync(assetsDir)) {
            // Check alternative location in WASM Assets
            const wasmAssetsDir = path.join(__dirname, '..', 'cspro-dev', 'cspro', 'WASM', 'Assets', 'html');
            if (fs.existsSync(wasmAssetsDir)) {
                // Look for any sample applications in WASM assets
                const apps = [];
                // This is a placeholder - in production, parse WASM data file
                return res.json({ applications: apps });
            }
            return res.json({ applications: [] });
        }
        
        const apps = fs.readdirSync(assetsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => ({
                name: dirent.name,
                path: dirent.name,
                source: 'assets'
            }));
        
        res.json({ applications: apps });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to list asset applications',
            message: error.message
        });
    }
});

// Load application from WASM assets
app.get('/api/applications/assets/:name/files', (req, res) => {
    const appName = req.params.name;
    const assetsDir = path.join(__dirname, 'web', 'assets', 'applications', appName);
    
    try {
        if (!fs.existsSync(assetsDir)) {
            return res.status(404).json({
                error: 'Asset application not found',
                name: appName
            });
        }
        
        const files = {};
        const readFilesRecursively = (dir, basePath = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
                
                if (entry.isDirectory()) {
                    readFilesRecursively(fullPath, relativePath);
                } else {
                    const content = fs.readFileSync(fullPath);
                    const isBinary = entry.name.endsWith('.pen') || 
                                     entry.name.endsWith('.csdb') ||
                                     entry.name.endsWith('.dat');
                    
                    if (isBinary) {
                        files[relativePath] = {
                            type: 'binary',
                            data: content.toString('base64')
                        };
                    } else {
                        files[relativePath] = content.toString('utf-8');
                    }
                }
            }
        };
        
        readFilesRecursively(assetsDir);
        
        const pffFile = Object.keys(files).find(f => f.toLowerCase().endsWith('.pff'));
        
        res.json({
            success: true,
            name: appName,
            pffFile: pffFile || null,
            files: files
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to load asset application files',
            message: error.message
        });
    }
});

// Upload application - requires multer for file uploads
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.post('/api/applications/upload', upload.array('files'), (req, res) => {
    try {
        const appName = req.body.appName;
        
        if (!appName) {
            return res.status(400).json({
                error: 'Application name is required'
            });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded'
            });
        }
        
        // Sanitize app name for filesystem
        const sanitizedName = appName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const appDir = path.join(__dirname, 'storage/applications', sanitizedName);
        
        // Create directory structure
        if (!fs.existsSync(appDir)) {
            fs.mkdirSync(appDir, { recursive: true });
        }
        
        // Save files
        for (const file of req.files) {
            // Get relative path from original filename
            const relativePath = file.originalname;
            
            // Remove the first folder (which is the original folder name)
            const pathParts = relativePath.split('/');
            const filePath = pathParts.length > 1 
                ? pathParts.slice(1).join('/')
                : relativePath;
            
            const fullPath = path.join(appDir, filePath);
            const dirPath = path.dirname(fullPath);
            
            // Ensure directory exists
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            // Write file
            fs.writeFileSync(fullPath, file.buffer);
        }
        
        console.log(`[Upload] Application '${sanitizedName}' uploaded with ${req.files.length} files`);
        
        res.json({
            success: true,
            name: sanitizedName,
            filesUploaded: req.files.length
        });
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({
            error: 'Failed to upload application',
            message: error.message
        });
    }
});

// CSWeb proxy endpoints
app.post('/api/csweb/applications', async (req, res) => {
    try {
        const { url, username, password } = req.body;
        
        if (!url) {
            return res.status(400).json({
                error: 'CSWeb URL is required'
            });
        }
        
        // Build CSWeb API URL
        const apiUrl = new URL('/api/dictionaries', url);
        
        const headers = {
            'Accept': 'application/json'
        };
        
        if (username && password) {
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
        }
        
        // Fetch dictionaries/applications from CSWeb
        const response = await fetch(apiUrl.toString(), { headers });
        
        if (!response.ok) {
            throw new Error(`CSWeb returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Transform CSWeb response to our format
        const applications = (data.Dictionaries || data.dictionaries || []).map(dict => ({
            id: dict.Name || dict.name,
            name: dict.Label || dict.label || dict.Name || dict.name,
            path: dict.Name || dict.name,
            description: dict.Description || dict.description || ''
        }));
        
        res.json({ applications });
    } catch (error) {
        console.error('[CSWeb Error]', error);
        res.status(500).json({
            error: 'Failed to connect to CSWeb',
            message: error.message
        });
    }
});

// Load application from CSWeb
app.post('/api/csweb/load', async (req, res) => {
    try {
        const { url, appId, username, password } = req.body;
        
        if (!url || !appId) {
            return res.status(400).json({
                error: 'CSWeb URL and application ID are required'
            });
        }
        
        // Build authorization headers
        const headers = {
            'Accept': 'application/json'
        };
        
        if (username && password) {
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
        }
        
        // Fetch application specification from CSWeb
        const specUrl = new URL(`/api/dictionaries/${appId}/specification`, url);
        const specResponse = await fetch(specUrl.toString(), { headers });
        
        if (!specResponse.ok) {
            throw new Error(`CSWeb returned ${specResponse.status} for specification`);
        }
        
        const specData = await specResponse.json();
        
        // Build files object from CSWeb response
        const files = {};
        
        // Add the specification files
        if (specData.dictionary) {
            files['dictionary.dcf'] = specData.dictionary;
        }
        if (specData.forms) {
            files['forms.fmf'] = specData.forms;
        }
        if (specData.questionText) {
            files['questiontext.json'] = JSON.stringify(specData.questionText);
        }
        
        // Create a basic PFF file
        const pffContent = `[Run Information]
Version=CSPro 8.0
AppType=Entry

[Files]
Application=dictionary.dcf

[Parameters]
StartMode=Add
`;
        files['application.pff'] = pffContent;
        
        res.json({
            success: true,
            name: appId,
            pffFile: 'application.pff',
            files: files
        });
    } catch (error) {
        console.error('[CSWeb Load Error]', error);
        res.status(500).json({
            error: 'Failed to load application from CSWeb',
            message: error.message
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path
    });
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           CSPro Web Server with REST API                   ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Server running at: http://localhost:${PORT}                  ║`);
    console.log(`║  JSPI Support:      ${jspiAvailable ? 'ENABLED ' : 'DISABLED'}                            ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Endpoints:                                                ║');
    console.log('║    GET  /                   - Web application              ║');
    console.log('║    GET  /api/status         - Server status                ║');
    console.log('║    GET  /api/capabilities   - Feature capabilities         ║');
    console.log('║    GET  /api/applications   - List applications            ║');
    if (jspiAvailable) {
    console.log('║    POST /api/cspro/session  - Create session               ║');
    console.log('║    *    /api/cspro/*        - CSPro WASM API               ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
});

export default app;
