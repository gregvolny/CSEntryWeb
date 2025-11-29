#include <engine/StandardSystemIncludes.h>
#include <zHtml/PortableLocalhost.h>
#include <zHtml/VirtualFileMapping.h>
#include <zToolsO/Encoders.h>
#include <map>
#include <mutex>

// --------------------------------------------------------------------------
// WASM Virtual File System
// In WASM, we don't have a real localhost server. Instead, we store virtual
// file content in memory and provide URLs that JavaScript can intercept.
// --------------------------------------------------------------------------

namespace {
    struct VirtualFile {
        std::function<std::string()> contentCallback;
        std::string contentType;
    };
    
    std::map<std::wstring, VirtualFile> g_virtualFiles;
    std::mutex g_virtualFilesMutex;
    int g_virtualFileCounter = 0;
    
    // Base URL for virtual files - JavaScript should intercept this
    const std::wstring VIRTUAL_BASE_URL = L"cspro-virtual://";
}

// Helper to get content for a virtual file URL (called from JavaScript via EM_JS)
extern "C" {
    const char* wasm_get_virtual_file_content(const wchar_t* url) {
        std::lock_guard<std::mutex> lock(g_virtualFilesMutex);
        
        printf("[WASM-VFS] wasm_get_virtual_file_content called\n");
        std::wstring urlStr(url);
        std::string urlUtf8(urlStr.begin(), urlStr.end());
        printf("[WASM-VFS] Looking for URL: %s\n", urlUtf8.c_str());
        printf("[WASM-VFS] Total virtual files: %zu\n", g_virtualFiles.size());
        fflush(stdout);
        
        // List all registered URLs for debugging
        for (const auto& pair : g_virtualFiles) {
            std::string registeredUrl(pair.first.begin(), pair.first.end());
            printf("[WASM-VFS] Registered: %s\n", registeredUrl.c_str());
        }
        fflush(stdout);
        
        auto it = g_virtualFiles.find(url);
        if (it != g_virtualFiles.end() && it->second.contentCallback) {
            printf("[WASM-VFS] Found URL, calling callback\n");
            fflush(stdout);
            static std::string lastContent;
            lastContent = it->second.contentCallback();
            printf("[WASM-VFS] Callback returned %zu bytes\n", lastContent.size());
            fflush(stdout);
            return lastContent.c_str();
        }
        
        printf("[WASM-VFS] URL not found\n");
        fflush(stdout);
        return nullptr;
    }
}


// --------------------------------------------------------------------------
// PortableLocalhost
// --------------------------------------------------------------------------

void PortableLocalhost::CreateVirtualFile(VirtualFileMappingHandler& virtual_file_mapping_handler, NullTerminatedString filename/* = _T("")*/)
{
    // For WASM, we create a virtual URL and store the handler
    std::lock_guard<std::mutex> lock(g_virtualFilesMutex);
    
    std::wstring url = VIRTUAL_BASE_URL + L"file/" + std::to_wstring(++g_virtualFileCounter);
    if (!filename.empty()) {
        url += L"/" + std::wstring(filename);
    }
    
    // Create a mapping that stores the content callback
    auto mappingActive = std::make_shared<bool>(true);
    
    // Store a callback that will call ServeContent
    g_virtualFiles[url] = VirtualFile{
        [&virtual_file_mapping_handler]() -> std::string {
            // This is a placeholder - actual content serving would need to be handled differently
            return "";
        },
        "application/octet-stream"
    };
    
    // Note: This is simplified - real implementation would need to properly initialize the handler's URL
}


VirtualFileMapping PortableLocalhost::CreateVirtualHtmlFile(wstring_view directory, std::function<std::string()> callback)
{
    std::lock_guard<std::mutex> lock(g_virtualFilesMutex);
    
    // Generate a unique URL for this virtual HTML file
    std::wstring url = VIRTUAL_BASE_URL + L"html/" + std::to_wstring(++g_virtualFileCounter) + L".html";
    
    std::string urlUtf8(url.begin(), url.end());
    printf("[WASM-VFS] CreateVirtualHtmlFile: registering URL = %s\n", urlUtf8.c_str());
    fflush(stdout);
    
    // Store the content callback
    g_virtualFiles[url] = VirtualFile{
        std::move(callback),
        "text/html; charset=utf-8"
    };
    
    printf("[WASM-VFS] CreateVirtualHtmlFile: total files now = %zu\n", g_virtualFiles.size());
    fflush(stdout);
    
    // Create a shared flag to track if the mapping is still active
    auto mappingActive = std::make_shared<bool>(true);
    
    // When VirtualFileMapping is destroyed, it will set mappingActive to false
    // We could use this to clean up g_virtualFiles, but for now we keep them
    
    // Return a VirtualFileMapping - but we need to use a workaround since the constructor is private
    // The VirtualFileMapping expects the url and a shared_ptr<bool> for lifecycle management
    
    // Use placement to construct - this is a bit of a hack but needed since constructor is private/friend
    return VirtualFileMapping(url, mappingActive);
}


void PortableLocalhost::CreateVirtualDirectory(KeyBasedVirtualFileMappingHandler& key_based_virtual_file_mapping_handler)
{
    // For WASM, we create a virtual directory URL
    std::lock_guard<std::mutex> lock(g_virtualFilesMutex);
    
    std::wstring url = VIRTUAL_BASE_URL + L"dir/" + std::to_wstring(++g_virtualFileCounter) + L"/";
    
    auto mappingActive = std::make_shared<bool>(true);
    
    // Note: This is simplified - real implementation would need to properly initialize the handler
}


std::wstring PortableLocalhost::CreateFilenameUrl(NullTerminatedStringView filename)
{
    // For WASM, convert the filename to a file:// URL or keep it as-is if it's already a URL
    std::wstring filenameStr(filename);
    
    // If it's already a URL, return it
    if (filenameStr.find(L"://") != std::wstring::npos) {
        return filenameStr;
    }
    
    // Convert to a file URL format that JavaScript can handle
    // In WASM, files are typically accessed through the virtual filesystem
    return L"file://" + Encoders::ToUri(filenameStr, false);
}



// --------------------------------------------------------------------------
// LocalFileServerSetResponse
// --------------------------------------------------------------------------

void LocalFileServerSetResponse(void* response_object_ptr, const void* content_data, size_t content_size, const char* content_type)
{
    // In WASM, this would be called when serving virtual file content
    // For now, we don't need this since we're using callbacks directly
    // This could be implemented to store the response for JavaScript to retrieve
}
