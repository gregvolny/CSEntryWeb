# CSPro Web Application Improvement Report

## Executive Summary
This report outlines the necessary steps to bring the CSPro Web (CAWI) application to full parity with the native Windows CSEntry application. While the current implementation successfully replicates the core data entry experience using WebAssembly (WASM), significant gaps remain in user interface fidelity, hardware integration, and offline capabilities. The goal is to ensure the web version runs "exactly" as the native application.

## 1. Architecture & Core Engine

### 1.1. JSPI (JavaScript Promise Integration)
**Status:** Experimental support detected in `server-api.js` and `cspro-wasm-service.js`.
**Gap:** The native engine relies heavily on blocking calls (e.g., `showDialog`, `errmsg`). In a browser, these must be asynchronous to avoid freezing the UI.
**Recommendation:**
-   Prioritize and stabilize the JSPI implementation. This is the most critical architectural component to allow the WASM engine to "pause" execution while waiting for user input (dialogs) or async operations (network/disk), mimicking the synchronous behavior of the native Windows engine.
-   Ensure `server-api.js` cleanly falls back to a robust async/await pattern for browsers that do not support JSPI yet, although this may require refactoring `CSPro.js` bindings.

### 1.2. Session State Management
**Status:** `cspro-wasm-service.js` handles sessions using `AsyncLocalStorage`.
**Gap:** Native CSEntry is a single-user desktop application. The web version is multi-user.
**Recommendation:**
-   Implement robust session persistence. If the server restarts or the browser refreshes, the user's session state (current case data, cursor position) should be recoverable.
-   Ensure `sessionContext` in `cspro-wasm-service.js` correctly isolates all global state, preventing data leakage between concurrent users.

## 2. User Interface (UI) & Experience (UX)

### 2.1. Keyboard Navigation & Shortcuts
**Status:** Basic navigation (Tab, Enter) is supported, but full native shortcut parity is missing.
**Gap:** Native CSEntry power users rely heavily on function keys.
**Recommendation:**
-   Implement the full suite of global keyboard shortcuts in `csentry-mfc-view-modular.js`:
    -   `F1`: Context-sensitive Help.
    -   `F2`: Edit Note for current field.
    -   `F3`: Search/Find Case.
    -   `F6`: End Group (if applicable).
    -   `F7`: Show Statistics/Reports.
    -   `F8`: Move to Previous Field (implemented but check binding).
    -   `F9`: Move to Next Field (implemented but check binding).
    -   `F10`: Menu access.
    -   `F12` / `Esc`: Cancel/Exit.
    -   `Ctrl+S`: Partial Save.
    -   `Ctrl+M`: Modify Mode toggle.
-   Ensure these shortcuts work consistently across the Tree View, Form View, and within Dialogs.

### 2.2. Splitter & Layout
**Status:** Splitter exists but state persistence is unclear.
**Recommendation:**
-   Persist the Splitter position (width of Tree View vs Form View) to `localStorage` so the user's layout preference is saved between sessions, matching the native app's registry-saved preferences.

### 2.3. Status Bar Fidelity
**Status:** Status bar exists.
**Recommendation:**
-   Ensure the status bar exactly mimics the native information:
    -   Case ID / Key.
    -   Current Operator ID.
    -   System Controlled vs. Operator Controlled mode indicator.
    -   Auto-save status.
    -   Language indicator.

## 3. Feature Parity Gaps

### 3.1. Multimedia & Hardware Integration
**Status:** `action-invoker.js` has stubs or basic fallbacks for system calls.
**Gap:** Native CSEntry can access the camera, microphone, and GPS directly.
**Recommendation:**
-   **GPS (`gps` function):** Implement using the HTML5 Geolocation API (`navigator.geolocation`).
-   **Camera (`execsystem` / `takephoto`):** Implement using `<input type="file" capture="camera">` or the `MediaDevices` API to capture images directly into the application data path.
-   **Audio (`record`):** Implement using the `MediaStream Recording API`.
-   **File Selection:** Fully implement `System.selectDocument` using an HTML file input dialog that uploads the selected file to the session's sandbox.

### 3.2. External Files & Lookups
**Status:** File syncing exists for main data files.
**Gap:** Complex applications use multiple external lookup files (`.dat`, `.idx`) and resources.
**Recommendation:**
-   Ensure the PFF loader in `cspro-wasm-service.js` recursively identifies and loads *all* external files defined in the `.pff` and `.dcf` files.
-   Implement "lazy loading" for large lookup files if possible, or ensure they are fully pre-loaded into the WASM virtual file system (`MEMFS` or `IDBFS`) before entry begins.

### 3.3. Action Invoker & Logic Execution
**Status:** `action-invoker.js` proxies calls.
**Gap:** Round-trips to the server for simple logic (like checking a value) can be slow.
**Recommendation:**
-   Optimize `Logic.eval` calls. Where possible, cache static logic or execute simple checks client-side if the WASM engine allows.
-   Ensure `invokeLogicFunction` correctly handles arguments and return values for all native CAPI functions.

## 4. Synchronization

### 4.1. Sync Capabilities
**Status:** Basic support via `_handleSync` / `CSWeb`.
**Gap:** Native CSEntry supports Bluetooth, Dropbox, FTP, and Local File sync.
**Recommendation:**
-   **CSWeb:** Strengthen the CSWeb implementation to handle large files, resume interrupted transfers, and manage conflict resolution (client-wins vs server-wins) exactly as the native app does.
-   **Local/Offline:** Since "Bluetooth" is restricted in web, focus on **Offline Capability**. Use Service Workers and `IDBFS` (IndexedDB File System) to allow the application to run entirely offline once loaded, syncing back to the server when connection is restored. This is the "native" behavior users expect in field conditions.

## 5. Performance & Reliability

### 5.1. Session Pooling
**Status:** New engine instance per session.
**Recommendation:**
-   WASM module instantiation is expensive. Implement a "warm pool" of initialized `CSProEngine` instances on the server to reduce startup time for new sessions.

### 5.2. Error Handling
**Recommendation:**
-   Implement a global error handler that catches WASM crashes (e.g., memory access out of bounds) and provides a "user-friendly" crash report dialog, similar to the native exception handler, rather than just logging to the console.

## 6. Conclusion
To achieve exact parity, the focus must shift from "functional equivalence" to "fidelity." The user experience—keyboard shortcuts, instant UI response, and offline robustness—is what defines the "native" feel. Prioritizing **Offline Support (Service Workers)** and **Hardware Integration (GPS/Camera)** will close the biggest functional gaps, while **JSPI** integration is the key technical enabler for a seamless logic flow.
