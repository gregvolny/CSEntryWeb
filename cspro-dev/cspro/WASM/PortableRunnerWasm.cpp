// PortableRunnerWasm.cpp - WASM implementation of ActionInvoker::PortableRunner
// Provides WASM/browser-specific implementations for clipboard and file dialogs

#include "StdAfx.h"
#include <zAction/PortableRunner.h>
#include <zToolsO/Utf8Convert.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif


// ============================================================================
// Clipboard operations - use browser clipboard API via JavaScript
// ============================================================================

std::optional<std::wstring> ActionInvoker::PortableRunner::ClipboardGetText()
{
    // Browser clipboard API requires user interaction and is async
    // For now, return empty - full implementation would need JSPI
#ifdef __EMSCRIPTEN__
    // Could be implemented with async clipboard API:
    // navigator.clipboard.readText().then(...)
    printf("[PortableRunner] ClipboardGetText not fully implemented in WASM\n");
#endif
    return std::nullopt;
}


void ActionInvoker::PortableRunner::ClipboardPutText(const std::wstring& text)
{
#ifdef __EMSCRIPTEN__
    // Use browser clipboard API
    std::string text_utf8 = UTF8Convert::WideToUTF8(text);
    EM_ASM({
        var text = UTF8ToString($0);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function(err) {
                console.warn('Could not copy text to clipboard:', err);
            });
        } else {
            // Fallback for older browsers
            var textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.warn('Fallback clipboard copy failed:', err);
            }
            document.body.removeChild(textArea);
        }
    }, text_utf8.c_str());
#else
    (void)text;
#endif
}


// ============================================================================
// Path operations - file dialogs
// ============================================================================

ActionInvoker::Result ActionInvoker::PortableRunner::PathShowNativeFileDialog(
    const std::wstring& start_directory, 
    bool open_file_dialog, 
    bool confirm_overwrite,
    const TCHAR* name, 
    const TCHAR* filter, 
    const JsonNode<wchar_t>& json_node)
{
    // Browser file dialogs are handled differently
    // The <input type="file"> element is the standard way to open files
    // For saving, we typically use download links
    printf("[PortableRunner] PathShowNativeFileDialog not implemented in WASM\n");
    
    // Return undefined to indicate no file was selected
    return Result::Undefined();
}


// ============================================================================
// System operations - document picker
// ============================================================================

std::vector<std::tuple<std::wstring, std::wstring>> ActionInvoker::PortableRunner::SystemShowSelectDocumentDialog(
    const std::vector<std::wstring>& mime_types, 
    bool multiple)
{
    // This would require the File System Access API or an <input type="file"> element
    // For now, return empty list
    printf("[PortableRunner] SystemShowSelectDocumentDialog not implemented in WASM\n");
    return {};
}
