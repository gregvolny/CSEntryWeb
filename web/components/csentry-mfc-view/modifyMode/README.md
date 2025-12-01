# Modify Mode Implementation - Following MFC Architecture

## Overview

This implementation follows the **exact MFC (Microsoft Foundation Classes) CSEntry workflow** for loading and displaying cases in modify mode. The code is organized into ESM (ECMAScript Modules) for clarity and maintainability.

## MFC Reference Flow

Based on analysis of `cspro-dev/cspro/CSEntry/MainFrm.cpp` and `cspro-dev/cspro/Zentryo/Runaple.cpp`:

### MFC Workflow (C++)

1. **User Action**: `CMainFrame::OnModifyCase()` - User clicks modify button
2. **Pre-Check**: `ModifyStarterHelper(pNodeInfo, ProcessModifyAction::GotoNode)`
3. **Start Session**: `CRunAplEntry::ModifyStart()` - Initialize modify session
4. **Load Case**: `CRunAplEntry::ProcessModify(position, &bMoved, &partial_save_mode, &pItem, iNode)`
   - Calls `GetInputRepository()->ReadCasetainer(data_case, dPositionInRepository)`
   - **This loads ALL case data into the `Case` object in memory**
5. **Navigate**: `NextField(FALSE)` - Move to first field
6. **Display Form**: UI queries the in-memory `Case` object to populate input fields
7. **Result**: Form displays with all fields pre-filled from the loaded case

### Key MFC Insight

After `ReadCasetainer()`, **all field values are available in memory** in the `Case` object. The UI doesn't navigate field-by-field to get values - it simply reads from the loaded case structure.

## Web Implementation

Our implementation mirrors this exact flow:

### Module Structure

```
modifyMode/
├── caseTreeExtractor.js      - Extracts field values (ReadCasetainer equivalent)
├── fieldMapper.js             - Maps labels to field names
├── inputPopulator.js          - Populates HTML inputs (UI display)
└── modifyModeCoordinator.js   - Orchestrates the entire workflow
```

### Web Workflow (JavaScript)

1. **User Action**: User clicks case in case list
2. **Start Session**: `engine.modifyCase(position)` - WASM engine's modify start
3. **Load Case Tree**: `engine.getCaseTree()` - Returns hierarchical case data
   - **Equivalent to MFC's `ReadCasetainer`**
   - Case tree contains ALL field values in a JSON structure
4. **Extract Values**: `caseTreeExtractor.extractFieldValuesFromCaseTree(caseTree)`
   - Recursively walks the tree
   - Extracts field labels, values, and occurrences
5. **Map Labels**: `fieldMapper.buildLabelToFieldNameMap(formData)`
   - Maps display labels ("Household ID") to internal names ("HOUSEHOLD_ID")
6. **Populate Inputs**: `inputPopulator.populateInputs(fieldValues, labelMap, formContainer)`
   - Finds HTML input elements
   - Sets their values
   - Triggers change events
7. **Display**: Form shows with all fields pre-populated

## Module Responsibilities

### 1. caseTreeExtractor.js

**Purpose**: Extract all field values from the case tree structure

**MFC Equivalent**: Reading values from the `Case` object after `ReadCasetainer()`

**Key Function**: `extractFieldValuesFromCaseTree(caseTree)`

```javascript
// Case tree node types (from WASM engine):
// 0 = case/questionnaire
// 1 = form  
// 2 = roster/record
// 4 = field/item (has value)

// Returns array of:
// {
//   fieldId: number,
//   label: string,       // "Household ID", "First Name", etc.
//   value: string|number,
//   occurrence: number,  // Roster occurrence (1-based)
//   index: [number]      // Engine index
// }
```

**Features**:
- Recursive tree traversal
- Handles rosters with multiple occurrences
- Extracts occurrence numbers from labels like "Person Roster (1)"

### 2. fieldMapper.js

**Purpose**: Map case tree display labels to HTML field names

**MFC Equivalent**: Field name lookup in the dictionary/form structures

**Key Functions**:
- `buildLabelToFieldNameMap(formData)` - Creates Map<label, fieldName>
- `mapLabelToFieldName(label, labelMap)` - Looks up field name

```javascript
// Maps:
// "Household ID" → "HOUSEHOLD_ID"
// "First Name" → "FIRST_NAME"  
// "Sex" → "SEX"
// etc.
```

**Features**:
- Handles regular fields and roster fields
- Case-insensitive matching for robustness
- Tries multiple label sources (field.text, field.label, field.name)

### 3. inputPopulator.js

**Purpose**: Populate HTML input elements with field values

**MFC Equivalent**: Form rendering with values from the `Case` object

**Key Function**: `populateInputs(fieldValues, labelMap, formContainer)`

```javascript
// For each field value:
// 1. Map label to field name
// 2. Find HTML input (handle rosters with occurrence)
// 3. Set input value (handle checkboxes, radios, text)
// 4. Trigger change events
```

**Features**:
- Handles tick mark containers (unwraps to find actual input)
- Supports different input types (text, checkbox, radio)
- Roster occurrence support using `data-row-index`
- Event triggering for UI updates

### 4. modifyModeCoordinator.js

**Purpose**: Orchestrate the entire modify mode workflow

**MFC Equivalent**: `PostCaseLoadingStartActions()` and `ProcessModify()`

**Key Function**: `loadCaseForModify(csproProxy, formData, formContainer)`

```javascript
// Complete workflow:
// 1. Get case tree (ReadCasetainer)
// 2. Extract field values
// 3. Build label mapping
// 4. Populate HTML inputs
// 5. Return success/failure status
```

**Features**:
- Comprehensive error handling
- Validation of prerequisites
- Detailed logging
- Status reporting

## Integration with Main Component

In `index.js`, the `_loadAllFieldValuesFromCaseTree()` method now uses the modular coordinator:

```javascript
async _loadAllFieldValuesFromCaseTree() {
    const { loadCaseForModify } = await import('./modifyMode/modifyModeCoordinator.js');
    
    const result = await loadCaseForModify(
        this.engine,      // CSPro proxy
        this.formData,    // Form metadata
        this.$.formContainer  // HTML container
    );
    
    if (result.success) {
        console.log('Populated', result.populatedCount, 'fields');
    }
}
```

## Data Flow Comparison

### MFC (C++)
```
User → OnModifyCase() 
  → ModifyStart() 
  → ReadCasetainer(data_case, position)  // ALL data loaded
  → data_case now contains all field values
  → NextField() navigates to first field
  → UI queries data_case to display values
```

### Web (JavaScript)
```
User → _openCaseFromList()
  → engine.modifyCase(position)
  → engine.getCaseTree()  // ALL data loaded
  → caseTree contains all field values  
  → extractFieldValuesFromCaseTree()
  → buildLabelToFieldNameMap()
  → populateInputs()  // Display values
```

## Case Tree Structure

The case tree from `getCaseTree()` API mirrors MFC's case structure:

```json
{
  "id": 2,
  "label": "SimpleCAPI questionnaire",
  "type": 0,  // Questionnaire
  "children": [
    {
      "id": 3,
      "label": "Simple CAPI Form",
      "type": 1,  // Form
      "children": [
        {
          "id": 4,
          "label": "Household ID",
          "value": "1",  // ← FIELD VALUE
          "type": 4  // Field
        },
        {
          "id": 5,
          "label": "Person Roster",
          "type": 2,  // Roster
          "children": [
            {
              "label": "Person Roster (1)",  // Occurrence 1
              "children": [
                {
                  "label": "First Name",
                  "value": "jean",  // ← FIELD VALUE
                  "type": 4
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Advantages of This Architecture

1. **Modular**: Each module has a single, clear responsibility
2. **Testable**: Modules can be tested independently
3. **Maintainable**: Easy to understand and modify
4. **Follows MFC**: Mirrors the proven MFC implementation
5. **ESM Standard**: Uses modern JavaScript module system
6. **Documented**: Each module has clear documentation and references to MFC

## Testing

To test the implementation:

1. Start the server: `node --experimental-wasm-jspi server-api.js`
2. Open browser: `http://localhost:3002`
3. Select an application (e.g., SimpleCAPI)
4. View case list
5. Click on a case to open in modify mode
6. **Expected**: All fields should be pre-populated with case data
7. Check browser console for detailed logging from each module

## Console Output

When working correctly, you should see:

```
[CaseTreeExtractor] Extracting field values from case tree...
[CaseTreeExtractor] Field: Household ID = 1 occ: 1
[CaseTreeExtractor] Field: First Name = jean occ: 1
[CaseTreeExtractor] Extracted 10 field values

[FieldMapper] Building label to field name map...
[FieldMapper] Built map with 20 entries

[InputPopulator] Populating 10 field values...
[InputPopulator] ✓ Set HOUSEHOLD_ID = 1
[InputPopulator] ✓ Set FIRST_NAME = jean
[InputPopulator] Populated 10 of 10 inputs

[ModifyModeCoordinator] Successfully populated 10 of 10 fields
```

## Future Enhancements

Possible improvements while maintaining the MFC-based architecture:

1. **Caching**: Cache label maps for performance
2. **Validation**: Add field value validation before populating
3. **Error Recovery**: Gracefully handle partial failures
4. **Performance**: Optimize tree traversal for large cases
5. **TypeScript**: Convert to TypeScript for type safety

## References

- **MFC Source**: `cspro-dev/cspro/CSEntry/MainFrm.cpp` (lines 740-830, 881-920)
- **ReadCasetainer**: `cspro-dev/cspro/Zentryo/Runaple.cpp` (lines 1294-1405)
- **Case Structure**: `cspro-dev/cspro/zDataO/DataRepository.cpp`

---

**Last Updated**: 2025-11-30
**Implementation Status**: ✅ Complete and ready for testing
