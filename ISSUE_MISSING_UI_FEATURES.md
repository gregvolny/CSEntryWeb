# Missing UI Features in CSPro Web Version

## Summary
The CSPro Web version successfully implements the core data entry UI, including the main form view, case tree, and basic navigation. However, a comparison with the native Windows MFC application (`CSEntry.rc` resources) reveals several missing menu items, dialogs, and specific UI behaviors.

## Missing Menus & Actions

### Edit Menu
- [ ] **Find Case (`Ctrl+F`)**: The dialog `IDD_QSRCHDLG` exists in native but is unimplemented in web (`_showFindDialog` is a stub).
- [ ] **Interactive Edit (`F11`)**: `ID_INTEDIT` and its options dialog `IDD_INTEDTDLG` are missing.
- [ ] **Edit/Review Notes (`Ctrl+N`)**: `ID_EDIT_FIELD_NOTE`, `ID_EDIT_CASE_NOTE`, `ID_EDIT_REVIEW_NOTES` are missing.
- [ ] **Insert/Add Level Occurrence (`Alt+Ins`, `Alt+A`)**: Missing from the Edit menu.

### Navigation Menu
- [ ] **Advance to End (`F10`)**: `ID_ADVTOEND` is missing.
- [ ] **Previous Persistent (`F7`)**: `ID_PREVIOUS_PERSISTENT` is missing.
- [ ] **Go To Dialog (`F6`)**: The dialog `IDD_GOTO` is unimplemented (`_showGoToDialog` is a stub).

### View Menu
- [ ] **Cases in Sort Order (`Ctrl+Q`)**: `ID_SORTORDER` is missing.
- [ ] **View Options**: "View All Cases", "View Not Deleted", "View Duplicate", "View Partials Only" filters are missing.
- [ ] **Operator Statistics (`Ctrl+W`)**: `ID_STATS` and `IDD_STATDLG` are missing.
- [ ] **Show Values (Verify) (`Ctrl+F2`)**: `ID_VIEW_CHEAT` is missing.

### Options Menu
- [ ] **Change Language (`Ctrl+L`)**: `ID_LANGUAGE` is in the menu but `_showLanguageDialog` is a stub.

## Missing Dialogs
- [ ] **Find Case Dialog**: Search by Case IDs.
- [ ] **Go To Field Dialog**: Jump to specific field name/occurrence.
- [ ] **Notes Dialog**: View/Edit text notes attached to fields/cases.
- [ ] **Operator Statistics**: Grid showing keystrokes, errors, timing.
- [ ] **Interactive Edit Options**: Configuration for stop-on-error behavior.
- [ ] **GPS Reading Dialog**: `IDD_DLG_GPS` showing satellite status (native uses a specific dialog, web likely needs an HTML equivalent).

## Missing UI Behaviors
- [ ] **Splitter Persistence**: The splitter position is not saved between sessions.
- [ ] **Status Bar Fidelity**: Missing indicators for `CAP` (Caps Lock), `NUM` (Num Lock), `OVR` (Insert/Overwrite), `REC` (Recording), and detailed partial save status.
- [ ] **Keyboard Accelerators**: While some are documented in the menu HTML, global listeners for keys like `F11` (Interactive Edit), `F10` (Advance to End), and `Ctrl+F` (Find) need verification of implementation in `csentry-mfc-view-modular.js`.

## Recommendation
Prioritize implementing "Find Case" and "Go To" as they are critical for navigation in large cases. "Notes" are essential for data quality review. "Operator Statistics" and "Interactive Edit" are advanced features that can be scheduled for later phases.
