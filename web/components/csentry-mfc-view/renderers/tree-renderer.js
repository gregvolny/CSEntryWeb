/**
 * Tree Renderer - Renders case tree navigation
 * @module components/csentry-mfc-view/renderers/tree-renderer
 */

/**
 * Build MFC-style case tree with case list
 * Shows: File folder > existing cases > current case being added/modified
 * @param {HTMLElement} treeContainer - Container for tree elements
 * @param {Object} currentApp - Application with forms
 * @param {Array} cases - Array of existing case info objects
 * @param {Object} options - Options
 * @param {boolean} options.isAddingCase - True if currently adding a new case
 * @param {boolean} options.isModifyingCase - True if currently modifying a case
 * @param {number} options.currentCaseIndex - Index of case being modified (-1 for new)
 * @param {Function} options.onCaseClick - Callback when case is clicked
 * @param {Function} options.onFieldClick - Callback when field is clicked
 */
export function buildCaseListTree(treeContainer, currentApp, cases = [], options = {}) {
    const {
        isAddingCase = false,
        isModifyingCase = false,
        currentCaseIndex = -1,
        onCaseClick = null,
        onFieldClick = null
    } = options;
    
    treeContainer.innerHTML = '';
    
    // Create tree root
    const root = document.createElement('div');
    root.className = 'case-tree-root';
    
    // Create "File" folder node (MFC style)
    const fileNode = createTreeNode('File', 'folder', true);
    fileNode.dataset.expanded = 'true';
    root.appendChild(fileNode);
    
    // Container for case items
    const casesContainer = document.createElement('div');
    casesContainer.className = 'tree-children';
    
    // Add existing cases
    if (cases && cases.length > 0) {
        cases.forEach((caseInfo, index) => {
            const caseLabel = caseInfo.label || caseInfo.key || `Case ${index + 1}`;
            const isCurrentCase = isModifyingCase && index === currentCaseIndex;
            
            const caseNode = createTreeNode(caseLabel, 'case', false);
            caseNode.dataset.caseIndex = index;
            caseNode.dataset.casePosition = caseInfo.position;
            
            // Highlight current case being modified
            if (isCurrentCase) {
                caseNode.classList.add('current-case');
            }
            
            // Click handler
            if (onCaseClick) {
                caseNode.querySelector('.tree-label').addEventListener('click', (e) => {
                    e.stopPropagation();
                    onCaseClick(index, caseInfo.position);
                });
            }
            
            casesContainer.appendChild(caseNode);
        });
    }
    
    // Add "Adding Case" node if currently adding
    if (isAddingCase) {
        const addingNode = createTreeNode('<Adding Case>', 'adding-case', false);
        addingNode.classList.add('adding-case-node');
        
        // Add checkbox icon
        const checkbox = document.createElement('span');
        checkbox.className = 'tree-checkbox';
        checkbox.innerHTML = '☐';
        addingNode.querySelector('.tree-label').prepend(checkbox);
        
        casesContainer.appendChild(addingNode);
    }
    
    fileNode.appendChild(casesContainer);
    treeContainer.appendChild(root);
}

/**
 * Build case tree structure from forms
 * @param {HTMLElement} treeContainer - Container for tree elements
 * @param {Object} currentApp - Application with forms
 * @param {Array} navigationFields - Navigation field list for values
 * @param {Function} onNodeClick - Callback when tree node is clicked
 */
export function buildCaseTree(treeContainer, currentApp, navigationFields = [], onNodeClick) {
    treeContainer.innerHTML = '';
    
    if (!currentApp || !currentApp.forms) {
        return;
    }
    
    // Create tree root
    const root = document.createElement('div');
    root.className = 'case-tree-root';
    
    // Create application node
    const appNode = createTreeNode(currentApp.name || 'Case', 'folder', true);
    appNode.dataset.expanded = 'true';
    root.appendChild(appNode);
    
    // Add forms as children
    const formsContainer = document.createElement('div');
    formsContainer.className = 'tree-children';
    
    currentApp.forms.forEach((form, formIdx) => {
        const formNode = createTreeNode(form.label || form.name || `Form ${formIdx + 1}`, 'form');
        formNode.dataset.formIndex = formIdx;
        
        // Add fields under form
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'tree-children';
        fieldsContainer.style.display = 'none';
        
        // Standalone fields
        (form.fields || []).forEach(field => {
            const fieldNode = createFieldTreeNode(field, navigationFields, onNodeClick);
            fieldsContainer.appendChild(fieldNode);
        });
        
        // Roster fields
        (form.rosters || []).forEach(roster => {
            const rosterNode = createTreeNode(roster.label || roster.name, 'roster');
            rosterNode.dataset.rosterName = roster.name;
            
            const rosterFields = document.createElement('div');
            rosterFields.className = 'tree-children';
            rosterFields.style.display = 'none';
            
            // Add columns/fields
            (roster.columns || []).forEach(col => {
                (col.fields || []).forEach(field => {
                    const fieldNode = createFieldTreeNode(field, navigationFields, onNodeClick, roster.name);
                    rosterFields.appendChild(fieldNode);
                });
            });
            
            rosterNode.appendChild(rosterFields);
            fieldsContainer.appendChild(rosterNode);
            
            // Toggle roster expansion
            rosterNode.querySelector('.tree-label').addEventListener('click', () => {
                const expanded = rosterFields.style.display !== 'none';
                rosterFields.style.display = expanded ? 'none' : 'block';
                rosterNode.dataset.expanded = !expanded;
            });
        });
        
        formNode.appendChild(fieldsContainer);
        formsContainer.appendChild(formNode);
        
        // Toggle form expansion
        formNode.querySelector('.tree-label').addEventListener('click', () => {
            const expanded = fieldsContainer.style.display !== 'none';
            fieldsContainer.style.display = expanded ? 'none' : 'block';
            formNode.dataset.expanded = !expanded;
        });
    });
    
    appNode.appendChild(formsContainer);
    treeContainer.appendChild(root);
}

/**
 * Create a tree node element
 * @param {string} label - Node label
 * @param {string} type - Node type (folder, form, roster, field)
 * @param {boolean} expanded - Whether node is expanded
 * @returns {HTMLDivElement} Tree node element
 */
export function createTreeNode(label, type = 'item', expanded = false) {
    const node = document.createElement('div');
    node.className = `tree-node tree-${type}${expanded ? ' expanded' : ''}`;
    node.dataset.type = type;
    node.dataset.expanded = expanded;
    
    const labelEl = document.createElement('div');
    labelEl.className = 'tree-label';
    
    // Icon based on type
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    switch (type) {
        case 'folder':
            icon.textContent = '📁';
            break;
        case 'form':
            icon.textContent = '📄';
            break;
        case 'roster':
            icon.textContent = '📋';
            break;
        case 'field':
            icon.textContent = '▪';
            break;
        case 'case':
            icon.textContent = '📝';
            break;
        case 'adding-case':
            icon.textContent = '';  // Will use checkbox instead
            break;
        default:
            icon.textContent = '•';
    }
    
    const text = document.createElement('span');
    text.className = 'tree-text';
    text.textContent = label;
    
    labelEl.appendChild(icon);
    labelEl.appendChild(text);
    node.appendChild(labelEl);
    
    return node;
}

/**
 * Create field tree node with value display
 * @param {Object} field - Field definition
 * @param {Array} navigationFields - Navigation fields for values
 * @param {Function} onNodeClick - Click callback
 * @param {string} rosterName - Parent roster name if applicable
 * @returns {HTMLDivElement} Field tree node
 */
function createFieldTreeNode(field, navigationFields, onNodeClick, rosterName = null) {
    const node = createTreeNode(field.label || field.name, 'field');
    node.dataset.fieldName = field.name;
    if (rosterName) {
        node.dataset.rosterName = rosterName;
    }
    
    // Add value display
    const valueEl = document.createElement('span');
    valueEl.className = 'tree-value';
    valueEl.dataset.fieldName = field.name;
    
    // Get current value from navigation fields
    const navField = navigationFields.find(nf => nf.name === field.name);
    if (navField && navField.value) {
        valueEl.textContent = ` = ${navField.value}`;
    }
    
    node.querySelector('.tree-label').appendChild(valueEl);
    
    // Click handler
    if (onNodeClick) {
        node.querySelector('.tree-label').addEventListener('click', (e) => {
            e.stopPropagation();
            onNodeClick(field.name, rosterName);
        });
    }
    
    return node;
}

/**
 * Update tree value display
 * @param {HTMLElement} treeContainer - Tree container element
 * @param {string} fieldName - Field name
 * @param {string} value - New value
 */
export function updateTreeValue(treeContainer, fieldName, value) {
    const valueEl = treeContainer.querySelector(`.tree-value[data-field-name="${fieldName}"]`);
    if (valueEl) {
        valueEl.textContent = value ? ` = ${value}` : '';
    }
}

/**
 * Highlight field in tree
 * @param {HTMLElement} treeContainer - Tree container element
 * @param {string} fieldName - Field name to highlight
 */
export function highlightTreeField(treeContainer, fieldName) {
    // Remove previous highlights
    treeContainer.querySelectorAll('.tree-node.current').forEach(el => {
        el.classList.remove('current');
    });
    
    // Highlight new field
    const node = treeContainer.querySelector(`.tree-node[data-field-name="${fieldName}"]`);
    if (node) {
        node.classList.add('current');
        
        // Expand parent containers
        let parent = node.parentElement;
        while (parent && parent !== treeContainer) {
            if (parent.classList.contains('tree-children')) {
                parent.style.display = 'block';
            }
            if (parent.classList.contains('tree-node')) {
                parent.dataset.expanded = 'true';
            }
            parent = parent.parentElement;
        }
        
        // Scroll into view
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Expand all tree nodes
 * @param {HTMLElement} treeContainer - Tree container element
 */
export function expandAll(treeContainer) {
    treeContainer.querySelectorAll('.tree-children').forEach(el => {
        el.style.display = 'block';
    });
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.dataset.expanded = 'true';
    });
}

/**
 * Collapse all tree nodes
 * @param {HTMLElement} treeContainer - Tree container element
 */
export function collapseAll(treeContainer) {
    treeContainer.querySelectorAll('.tree-children').forEach(el => {
        el.style.display = 'none';
    });
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.dataset.expanded = 'false';
    });
    
    // Keep root expanded
    const root = treeContainer.querySelector('.tree-node');
    if (root) {
        root.dataset.expanded = 'true';
        const children = root.querySelector('.tree-children');
        if (children) children.style.display = 'block';
    }
}
