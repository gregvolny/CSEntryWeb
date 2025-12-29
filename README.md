# CSPro CAWI: CSEntry Windows Web
It is like a simple "Hello World" in the CSPro CAWI world...

https://csprousers.org/forum/viewtopic.php?p=19429#p19429



# CSPro Native (MFC) vs. Web Port Comparison

## 1. Executive Summary

The native CSPro CSEntry application is a mature, high-performance desktop application built on the Microsoft Foundation Classes (MFC) framework. It relies heavily on direct Win32 API access for UI rendering, file system operations, and hardware integration.

The Web Port is a modern adaptation that leverages WebAssembly (WASM) to run the core CSPro engine in a browser environment. It replaces the MFC UI with HTML/CSS and the Win32 system calls with Web APIs.

## 2. Architecture Comparison

| Feature | Native MFC (Windows) | Web Port (WASM) |
| :--- | :--- | :--- |
| **Language** | C++ | C++ (Engine via Emscripten) / JavaScript (UI) |
| **Framework** | Microsoft Foundation Classes (MFC) | Custom Web Component (`csentry-mfc-view`) |
| **Execution Model** | Native Binary (`.exe`) | WebAssembly Module (`.wasm`) |
| **Threading** | Multi-threaded (UI thread + Worker threads) | Single-threaded (Main JS thread) + Web Workers (planned) |
| **Async Handling** | Blocking UI calls (Modal Dialogs) | Async/Await (JSPI required for blocking simulation) |

### Key Differences
-   **Blocking vs. Async:** The native engine frequently uses blocking calls (e.g., `MessageBox`, `DoModal`). The Web Port must use JSPI (JavaScript Promise Integration) to suspend the WASM execution stack while waiting for the browser's asynchronous UI response.
-   **Rendering:** Native uses GDI/User32 to draw controls. The Web Port renders the DOM based on the logic engine's state, requiring a mapping layer between internal engine coordinates and CSS layouts.

## 3. User Interface (UI)

| Component | Native MFC | Web Port |
| :--- | :--- | :--- |
| **Main Window** | `CMainFrame` (SDI Interface) | Browser Window / PWA Container |
| **Forms** | `CScrollView` with custom painted controls | HTML Forms with CSS Grid/Flexbox |
| **Case Tree** | `CTreeCtrl` (SysTreeView32) | HTML `<ul>`/`<li>` Tree Component |
| **Grids/Rosters** | Custom `DEGrid` (Owner-drawn) | HTML `<table>` with dynamic inputs |
| **Dialogs** | `CDialog` (Win32 Modal) | HTML Overlays (`<dialog>` or `<div>`) |
| **Splitter** | `CSplitterWnd` | CSS Resizable Panels |

### Key Differences
-   **Fidelity:** The native app uses OS-native controls which guarantee standard Windows behavior. The Web Port mimics this look using CSS (`getMFCStyles`), which offers flexibility but requires careful tuning to match the "feel" (focus management, tab order).
-   **Responsiveness:** The native UI is tied to the message pump. The Web UI is reactive; changes in the engine trigger DOM updates.

## 4. Hardware & System Integration

| Feature | Native MFC | Web Port |
| :--- | :--- | :--- |
| **File System** | Direct NTFS/FAT32 access (`CFile`, `fstream`) | Virtual File System (`MEMFS`, `IDBFS`, `OPFS`) |
| **GPS** | Serial Port / Win32 Location API | HTML5 Geolocation API |
| **Camera** | DirectShow / Media Foundation | HTML5 MediaDevices / File Input Capture |
| **Bluetooth** | Windows Bluetooth Stack | Web Bluetooth API (Limited support/Secure Context only) |
| **Sync** | FTP, Dropbox API, Local Network | HTTP/HTTPS (CSWeb), Service Workers (Offline) |

### Key Differences
-   **Sandboxing:** Native app has full access to the user's machine. The Web Port is strictly sandboxed within the browser. File access requires user interaction (File Picker) or specific browser APIs (OPFS).
-   **Offline:** Native works offline by default. Web Port requires a Service Worker to cache assets and a persistent storage backend (IndexedDB) to save data without a network connection.

## 5. Logic Engine & Data Entry

| Feature | Native MFC | Web Port |
| :--- | :--- | :--- |
| **Logic Execution** | Compiled Machine Code | Interpreted WASM (Near-native speed) |
| **External Files** | Direct disk access | Must be pre-loaded into Virtual FS or fetched on-demand |
| **Keyboard** | Global Hooks / Accelerators (`HACCEL`) | JS Event Listeners (`keydown`) |
| **Navigation** | `GoToField`, `Skip` (Synchronous) | `setFieldValueAndAdvance` (Async via JSPI) |

### Key Differences
-   **Latency:** Native logic execution is instantaneous. Web logic execution is fast, but UI updates (DOM manipulation) can be slower than GDI repaints.
-   **Input Handling:** Native handles `WM_KEYDOWN` directly. Web Port must manage browser default behaviors (e.g., preventing Backspace from navigating back) and map function keys (F1-F12) appropriately.

## 6. Implementation Status (Based on Code Review)

-   **Core Engine:** Ported to WASM (`CSPro.wasm`) and seems functional.
-   **UI:** `csentry-mfc-view-modular.js` implements a robust recreation of the MFC view, including tree views, forms, and rosters.
-   **Dialogs:** `dialog-handler.js` manages async dialogs, mimicking the `CDialog` behavior.
-   **Synchronization:** Basic CSWeb support exists (`_handleSync`), but robust offline syncing (Service Workers) is a work in progress.
-   **Native Parity:** The "happy path" (entering data, navigating fields) is well-supported. Edge cases (complex external files, specific hardware calls, obscure logic functions) likely remain as gaps.

## 7. Conclusion

The Web Port is a technically impressive adaptation that bridges the gap between legacy desktop software and modern web distribution. It successfully decouples the CSPro logic engine from the Windows UI, replacing `MainFrm.cpp`, `RunView.cpp`, and `DEGrid.cpp` with modular JavaScript components.

To achieve full parity, the Web Port must overcome the browser sandbox (via PWA capabilities) and perfect the asynchronous bridge (JSPI) to support the synchronous mental model of the original C++ engine.

