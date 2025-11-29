/**
 * PFF (Program File Format) parser
 * @module components/csentry-mfc-view/utils/pff-parser
 */

/**
 * Parse PFF file content
 * @param {string} content - PFF file content
 * @returns {Object} Parsed PFF data
 */
export function parsePFF(content) {
    const pff = {};
    let currentSection = '';
    
    content.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith(';')) return;
        
        const sectionMatch = line.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].toLowerCase();
            pff[currentSection] = pff[currentSection] || {};
            return;
        }
        
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
            const key = line.substring(0, eqIndex).trim().toLowerCase();
            const value = line.substring(eqIndex + 1).trim();
            
            if (currentSection) {
                pff[currentSection][key] = value;
            } else {
                pff[key] = value;
            }
        }
    });
    
    return pff;
}

/**
 * Get entry application path from PFF
 * @param {Object} pff - Parsed PFF object
 * @returns {string|null} Application path
 */
export function getApplicationPath(pff) {
    if (pff.run?.application) {
        return pff.run.application;
    }
    if (pff.data?.inputdata) {
        return pff.data.inputdata;
    }
    return null;
}

/**
 * Get data file path from PFF
 * @param {Object} pff - Parsed PFF object
 * @returns {string|null} Data file path
 */
export function getDataFilePath(pff) {
    if (pff.data?.inputdata) {
        return pff.data.inputdata;
    }
    if (pff.datafile) {
        return pff.datafile;
    }
    return null;
}

/**
 * Get operator ID from PFF
 * @param {Object} pff - Parsed PFF object
 * @returns {string} Operator ID
 */
export function getOperatorId(pff) {
    if (pff.run?.operatorid) {
        return pff.run.operatorid;
    }
    return 'OPERATOR';
}

/**
 * Resolve relative paths in PFF based on PFF location
 * @param {Object} pff - Parsed PFF object
 * @param {string} pffPath - Path to PFF file
 * @returns {Object} PFF with resolved paths
 */
export function resolvePaths(pff, pffPath) {
    const basePath = pffPath.substring(0, pffPath.lastIndexOf('/') + 1);
    const resolved = JSON.parse(JSON.stringify(pff));
    
    // Resolve application path
    if (resolved.run?.application && !resolved.run.application.startsWith('/')) {
        resolved.run.application = basePath + resolved.run.application;
    }
    
    // Resolve data file paths
    if (resolved.data?.inputdata && !resolved.data.inputdata.startsWith('/')) {
        resolved.data.inputdata = basePath + resolved.data.inputdata;
    }
    
    return resolved;
}

export default { parsePFF, getApplicationPath, getDataFilePath, getOperatorId, resolvePaths };
