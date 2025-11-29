// WasmApplicationInterface.cpp - WASM/Browser implementation of BaseApplicationInterface
// Provides stub implementations or Web API equivalents for platform-specific functionality

#ifndef WIN_DESKTOP

// Include Emscripten headers FIRST to avoid NONE macro conflict from CSPro headers
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>
#endif

#include "WasmApplicationInterface.h"
#include <zToolsO/ObjectTransporter.h>
#include <zToolsO/CommonObjectTransporter.h>
#include <zToolsO/Utf8Convert.h>
#include <zUtilO/TemporaryFile.h>
#include <zEngineF/EngineUINodes.h>
#include <zHtml/NavigationAddress.h>
#include <zHtml/CSHtmlDlgRunner.h>
#include <zAction/ActionInvoker.h>
#include <zAction/Caller.h>
#include <zAction/Result.h>
#include <engine/Engdrv.h>
#include <engine/InterpreterAccessor.h>

#include <cstdio>
#include <random>
#include <chrono>
#include <sys/stat.h>
#include <unistd.h>
#include <dirent.h>

// ============================================================================
// WasmObjectTransporter - ObjectTransporter implementation for WASM
// Provides ActionInvoker::Runtime and other core services for WASM environment
// Includes InterpreterAccessor support for CSPro logic evaluation
// ============================================================================
class WasmObjectTransporter : public CommonObjectTransporter
{
public:
    WasmObjectTransporter()
        : m_engineDriver(nullptr)
    {
        printf("[WasmObjectTransporter] Created\n");
    }
    
    ~WasmObjectTransporter()
    {
        printf("[WasmObjectTransporter] Destroyed\n");
    }
    
    // Set the engine driver to enable InterpreterAccessor
    // This must be called after the engine is initialized
    void SetEngineDriver(CEngineDriver* engineDriver)
    {
        m_engineDriver = engineDriver;
        printf("[WasmObjectTransporter] Engine driver set: %p\n", (void*)engineDriver);
    }
    
    CEngineDriver* GetEngineDriver() const { return m_engineDriver; }

protected:
    // Override to disable access token checks in WASM (like CSView does)
    bool DisableAccessTokenCheckForExternalCallers() const override { return true; }
    
    // Override CommonStore - skip opening the store file which may not exist in WASM
    std::shared_ptr<CommonStore> OnGetCommonStore() override
    {
        // For WASM, we don't have a persistent CommonStore
        // Return nullptr to indicate it's not available
        // Most functionality doesn't require CommonStore
        return nullptr;
    }
    
    // CRITICAL: Provide InterpreterAccessor from engine driver
    // This enables Logic.eval and other ActionInvoker logic functions
    std::shared_ptr<InterpreterAccessor> OnGetInterpreterAccessor() override
    {
        if (m_engineDriver != nullptr)
        {
            auto accessor = m_engineDriver->CreateInterpreterAccessor();
            printf("[WasmObjectTransporter] Created InterpreterAccessor: %p\n", (void*)accessor.get());
            return accessor;
        }
        printf("[WasmObjectTransporter] WARNING: No engine driver, cannot create InterpreterAccessor\n");
        return nullptr;
    }
    
private:
    CEngineDriver* m_engineDriver;
};

// Global WASM ObjectTransporter instance
static std::unique_ptr<WasmObjectTransporter> g_wasmObjectTransporter;

// Function to set the engine driver for InterpreterAccessor support
// This must be called from WASMBindings.cpp after engine initialization
void WasmSetEngineDriverForObjectTransporter(CEngineDriver* engineDriver)
{
    if (g_wasmObjectTransporter)
    {
        g_wasmObjectTransporter->SetEngineDriver(engineDriver);
        printf("[WasmApplicationInterface] Engine driver set on ObjectTransporter\n");
    }
    else
    {
        printf("[WasmApplicationInterface] WARNING: ObjectTransporter not created yet!\n");
    }
}

void DebugListDir(const char* path) {
    printf("[Debug] Listing %s:\n", path);
    DIR *dir;
    struct dirent *ent;
    if ((dir = opendir(path)) != NULL) {
        while ((ent = readdir(dir)) != NULL) {
            printf("  %s\n", ent->d_name);
        }
        closedir(dir);
    } else {
        printf("  Could not open directory %s\n", path);
    }
}

void DebugCheckFile(const char* path) {
    struct stat buffer;
    if (stat(path, &buffer) == 0) {
        printf("[Debug] File exists: %s\n", path);
    } else {
        printf("[Debug] File NOT found: %s\n", path);
    }
}

#ifdef __EMSCRIPTEN__
// ============================================================================
// Async JavaScript Interop using JSPI (JavaScript Promise Integration)
// ============================================================================
// 
// These functions use Emscripten's EM_ASYNC_JS macro with JSPI enabled.
// JSPI allows C++ to call async JavaScript functions (returning Promises)
// and automatically suspend/resume WASM execution.
//
// Browser Support:
// - JSPI: Chrome 109+, Edge 109+, other Chromium-based browsers
// - For browsers without JSPI, the JavaScript fallbacks use sync dialogs
//
// The JavaScript side should provide window.CSProDialogHandler with methods:
// - showDialogAsync(dialogName, inputDataJson) -> Promise<string|null>
// - showHtmlDialogAsync(dialogPath, inputDataJson, optionsJson) -> Promise<string|null>
// - showModalDialogAsync(title, message, mbType) -> Promise<number>
// - getInputDataAsync(dialogId) -> Promise<string|null>
//
// If CSProDialogHandler is not available, built-in fallbacks using 
// browser alert/confirm dialogs will be used.
// ============================================================================

EM_ASYNC_JS(char*, jspi_showDialog, (const char* dialogName, const char* inputDataJson), {
    console.log("[JSPI] showDialog called:", UTF8ToString(dialogName));
    
    try {
        const name = UTF8ToString(dialogName);
        const inputData = UTF8ToString(inputDataJson);
        
        // Check if dialog handler exists
        if (typeof window.CSProDialogHandler !== 'undefined' && 
            typeof window.CSProDialogHandler.showDialogAsync === 'function') {
            const result = await window.CSProDialogHandler.showDialogAsync(name, inputData);
            if (result) {
                const len = lengthBytesUTF8(result) + 1;
                const buf = _malloc(len);
                stringToUTF8(result, buf, len);
                return buf;
            }
        }
        
        // Fallback for errmsg dialog - use browser confirm
        if (name === 'errmsg') {
            let parsedInput = {};
            try {
                parsedInput = JSON.parse(inputData);
            } catch(e) {}
            
            const message = parsedInput.message || 'Message';
            const title = parsedInput.title || '';
            const buttons = parsedInput.buttons || [{caption: 'OK', index: 1}];
            
            // For simple dialogs, use browser confirm/alert
            let selectedIndex = 1;
            if (buttons.length > 1) {
                const confirmed = confirm(title ? (title + '\n\n' + message) : message);
                selectedIndex = confirmed ? 1 : 2;
            } else {
                alert(title ? (title + '\n\n' + message) : message);
                selectedIndex = 1;
            }
            
            const result = JSON.stringify({index: selectedIndex});
            const len = lengthBytesUTF8(result) + 1;
            const buf = _malloc(len);
            stringToUTF8(result, buf, len);
            return buf;
        }
        
        return 0;
    } catch (e) {
        console.error("[JSPI] showDialog error:", e);
        return 0;
    }
});

EM_ASYNC_JS(char*, jspi_showHtmlDialog, (const char* dialogPath, const char* inputDataJson, const char* displayOptionsJson), {
    console.log("[JSPI] showHtmlDialog called:", UTF8ToString(dialogPath));
    
    try {
        const path = UTF8ToString(dialogPath);
        const inputData = UTF8ToString(inputDataJson);
        const displayOptions = UTF8ToString(displayOptionsJson);
        
        // Check if dialog handler exists
        if (typeof window.CSProDialogHandler !== 'undefined' && 
            typeof window.CSProDialogHandler.showHtmlDialogAsync === 'function') {
            const result = await window.CSProDialogHandler.showHtmlDialogAsync(path, inputData, displayOptions);
            if (result) {
                const len = lengthBytesUTF8(result) + 1;
                const buf = _malloc(len);
                stringToUTF8(result, buf, len);
                return buf;
            }
        }
        
        console.warn("[JSPI] CSProDialogHandler.showHtmlDialogAsync not available");
        return 0;
    } catch (e) {
        console.error("[JSPI] showHtmlDialog error:", e);
        return 0;
    }
});

EM_ASYNC_JS(int, jspi_showModalDialog, (const char* title, const char* message, int mbType), {
    console.log("[JSPI] showModalDialog called, type:", mbType);
    
    try {
        const titleStr = UTF8ToString(title);
        const messageStr = UTF8ToString(message);
        const fullMessage = titleStr ? (titleStr + '\n\n' + messageStr) : messageStr;
        
        // Check for custom async dialog handler
        if (typeof window.CSProDialogHandler !== 'undefined' && 
            typeof window.CSProDialogHandler.showModalDialogAsync === 'function') {
            return await window.CSProDialogHandler.showModalDialogAsync(titleStr, messageStr, mbType);
        }
        
        // Fallback to browser dialogs (these are synchronous in browsers)
        // MB_OK = 0, MB_OKCANCEL = 1, MB_YESNO = 4, MB_YESNOCANCEL = 3
        if (mbType === 1 || mbType === 4) { // OKCANCEL or YESNO
            return confirm(fullMessage) ? 1 : 2; // IDOK=1, IDCANCEL=2
        } else if (mbType === 3) { // YESNOCANCEL
            return confirm(fullMessage) ? 6 : 7; // IDYES or IDNO
        } else {
            alert(fullMessage);
            return 1; // IDOK
        }
    } catch (e) {
        console.error("[JSPI] showModalDialog error:", e);
        return 1; // IDOK as default
    }
});

EM_ASYNC_JS(char*, jspi_getInputData, (const char* dialogId), {
    console.log("[JSPI] getInputData called for:", UTF8ToString(dialogId));
    
    try {
        // Check if we have a registered input data provider
        if (typeof window.CSProDialogHandler !== 'undefined' && 
            typeof window.CSProDialogHandler.getInputDataAsync === 'function') {
            const result = await window.CSProDialogHandler.getInputDataAsync(UTF8ToString(dialogId));
            if (result) {
                const len = lengthBytesUTF8(result) + 1;
                const buf = _malloc(len);
                stringToUTF8(result, buf, len);
                return buf;
            }
        }
        return 0;
    } catch (e) {
        console.error("[JSPI] getInputData error:", e);
        return 0;
    }
});

#endif // __EMSCRIPTEN__

WasmApplicationInterface::WasmApplicationInterface()
    :   m_engineUIProcessor(*this)
{
    printf("[WasmApplicationInterface] Constructor\n");
    
    // Generate a random device ID for this browser session
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    const char* hex = "0123456789abcdef";
    
    std::wstring uuid;
    for (int i = 0; i < 32; ++i) {
        if (i == 8 || i == 12 || i == 16 || i == 20) uuid += L'-';
        uuid += hex[dis(gen)];
    }
    m_deviceId = CString(uuid.c_str());
    
    printf("[WasmApplicationInterface] Device ID: %ls\n", m_deviceId.GetString());
}

WasmApplicationInterface::~WasmApplicationInterface()
{
    printf("[WasmApplicationInterface] Destructor\n");
}

ObjectTransporter* WasmApplicationInterface::GetObjectTransporter()
{
    // Create the WASM ObjectTransporter on first access (lazy initialization)
    if (!g_wasmObjectTransporter) {
        printf("[WasmApplicationInterface] Creating WasmObjectTransporter for ActionInvoker support\n");
        g_wasmObjectTransporter = std::make_unique<WasmObjectTransporter>();
    }
    return g_wasmObjectTransporter.get();
}

void WasmApplicationInterface::RefreshPage(RefreshPageContents contents)
{
    printf("[WasmApplicationInterface] RefreshPage called\n");
    // Could emit JavaScript event to notify UI of refresh needed
#ifdef __EMSCRIPTEN__
    // EM_ASM({ if(window.onCSProRefresh) window.onCSProRefresh(); });
#endif
}

void WasmApplicationInterface::DisplayErrorMessage(const TCHAR* error_message)
{
    printf("[WasmApplicationInterface] Error: %ls\n", error_message);
#ifdef __EMSCRIPTEN__
    // Use browser alert for critical error messages
    // This is a fallback when HTML dialogs are not available
    std::string msg_utf8 = UTF8Convert::WideToUTF8(error_message);
    EM_ASM({ 
        console.error("[CSPro Error]", UTF8ToString($0));
        alert(UTF8ToString($0)); 
    }, msg_utf8.c_str());
#endif
}

std::optional<std::wstring> WasmApplicationInterface::DisplayCSHtmlDlg(const NavigationAddress& navigation_address, const std::wstring* action_invoker_access_token_override)
{
    printf("[WasmApplicationInterface] DisplayCSHtmlDlg: %ls\n", navigation_address.GetHtmlFilename().c_str());
    
#ifdef __EMSCRIPTEN__
    // Get the dialog name from the filename (e.g., "errmsg" from "Assets/html/dialogs/errmsg.html")
    std::wstring dialog_name = navigation_address.GetName();
    std::string dialog_name_utf8 = UTF8Convert::WideToUTF8(dialog_name);
    
    // Get input data via ActionInvoker - this is MANDATORY, no fallback
    // The ActionInvoker listener must be set up by the caller (CSHtmlDlgRunner)
    std::string input_data_json = "{}";
    
    // Get input data via ActionInvoker (the proper and ONLY way in CSPro runtime)
    std::shared_ptr<ActionInvoker::Runtime> action_invoker_runtime = ObjectTransporter::GetActionInvokerRuntime();
    if (!action_invoker_runtime) {
        printf("[WasmApplicationInterface] FATAL: ActionInvoker runtime not available!\n");
        printf("[WasmApplicationInterface] ActionInvoker is MANDATORY for CSPro dialogs.\n");
        // Return nullopt to indicate dialog failure
        return std::nullopt;
    }
    
    // Create a caller for ActionInvoker
    class WasmDialogCaller : public ActionInvoker::Caller {
    public:
        bool& GetCancelFlag() override { return m_cancelFlag; }
        std::wstring GetRootDirectory() override { return L"."; }
    private:
        bool m_cancelFlag = false;
    };
    
    WasmDialogCaller caller;
    ActionInvoker::Result result = action_invoker_runtime->ProcessAction(
        ActionInvoker::Action::UI_getInputData, 
        std::nullopt,
        caller
    );
    
    if (result.GetType() != ActionInvoker::Result::Type::Undefined) {
        std::wstring result_json;
        if (result.GetType() == ActionInvoker::Result::Type::JsonText || 
            result.GetType() == ActionInvoker::Result::Type::String) {
            result_json = result.GetStringResult();
        } else {
            result_json = result.GetResultAsJsonText<false>();
        }
        if (!result_json.empty()) {
            input_data_json = UTF8Convert::WideToUTF8(result_json);
            printf("[WasmApplicationInterface] Got input data from ActionInvoker: %s\n", input_data_json.c_str());
        }
    } else {
        printf("[WasmApplicationInterface] Warning: ActionInvoker returned undefined for UI_getInputData\n");
    }
    
    printf("[WasmApplicationInterface] Calling jspi_showDialog with name=%s, data=%s\n", 
           dialog_name_utf8.c_str(), input_data_json.c_str());
    
    // Call JSPI-enabled async JavaScript function
    char* result_str = jspi_showDialog(dialog_name_utf8.c_str(), input_data_json.c_str());
    
    if (result_str) {
        std::wstring wresult = UTF8Convert::UTF8ToWide(result_str);
        free(result_str);
        printf("[WasmApplicationInterface] Dialog result: %ls\n", wresult.c_str());
        return wresult;
    }
#endif
    
    return std::nullopt;
}

std::optional<std::wstring> WasmApplicationInterface::DisplayHtmlDialogFunctionDlg(const NavigationAddress& navigation_address, const std::wstring* action_invoker_access_token_override, const std::optional<std::wstring>& display_options_json)
{
    printf("[WasmApplicationInterface] DisplayHtmlDialogFunctionDlg: %ls\n", navigation_address.GetHtmlFilename().c_str());
    
#ifdef __EMSCRIPTEN__
    // Get the dialog path/name
    std::wstring dialog_path = navigation_address.IsHtmlFilename() ? navigation_address.GetHtmlFilename() : navigation_address.GetUri();
    std::string dialog_path_utf8 = UTF8Convert::WideToUTF8(dialog_path);
    std::string display_options_utf8 = display_options_json.has_value() ? UTF8Convert::WideToUTF8(*display_options_json) : "{}";
    
    // Call JSPI-enabled async JavaScript function
    char* result = jspi_showHtmlDialog(dialog_path_utf8.c_str(), "{}", display_options_utf8.c_str());
    
    if (result) {
        std::wstring wresult = UTF8Convert::UTF8ToWide(result);
        free(result);
        printf("[WasmApplicationInterface] Dialog result: %ls\n", wresult.c_str());
        return wresult;
    }
#endif
    
    return std::nullopt;
}

int WasmApplicationInterface::ShowModalDialog(NullTerminatedString title, NullTerminatedString message, int mbType)
{
    printf("[WasmApplicationInterface] ShowModalDialog: %ls - %ls (type=%d)\n", title.c_str(), message.c_str(), mbType);
    
#ifdef __EMSCRIPTEN__
    std::string title_utf8 = UTF8Convert::WideToUTF8(title.c_str());
    std::string message_utf8 = UTF8Convert::WideToUTF8(message.c_str());
    
    // Call JSPI-enabled async JavaScript function
    int result = jspi_showModalDialog(title_utf8.c_str(), message_utf8.c_str(), mbType);
    return result;
#endif
    
    // Return IDOK (1) by default
    return 1;
}

int WasmApplicationInterface::ShowMessage(const CString& title, const CString& message, const std::vector<CString>& aButtons)
{
    printf("[WasmApplicationInterface] ShowMessage: %ls - %ls\n", title.GetString(), message.GetString());
    // Return first button (0) by default
    return 0;
}

int WasmApplicationInterface::ShowChoiceDialog(const CString& title, const std::vector<std::vector<CString>*>& data)
{
    printf("[WasmApplicationInterface] ShowChoiceDialog: %ls\n", title.GetString());
    // Return -1 (cancelled) or 0 (first choice)
    return 0;
}

int WasmApplicationInterface::ShowShowDialog(const std::vector<CString>* column_titles, const std::vector<PortableColor>* row_text_colors,
    const std::vector<std::vector<CString>*>& data, const CString& heading)
{
    printf("[WasmApplicationInterface] ShowShowDialog: %ls\n", heading.GetString());
    return 0;
}

int WasmApplicationInterface::ShowSelcaseDialog(const std::vector<CString>* column_titles, const std::vector<std::vector<CString>*>& data, const CString& heading, std::vector<bool>* selections)
{
    printf("[WasmApplicationInterface] ShowSelcaseDialog: %ls\n", heading.GetString());
    return 0;
}

// GPS/Geolocation - Could integrate with Web Geolocation API
bool WasmApplicationInterface::GpsOpen()
{
    printf("[WasmApplicationInterface] GpsOpen - GPS not available in browser without JS integration\n");
    // Could request geolocation permission via JavaScript
    // navigator.geolocation is available in browsers
    return false;
}

bool WasmApplicationInterface::GpsClose()
{
    printf("[WasmApplicationInterface] GpsClose\n");
    return true;
}

CString WasmApplicationInterface::GpsRead(int waitTime, int accuracy, const CString& dialog_text)
{
    printf("[WasmApplicationInterface] GpsRead - not implemented\n");
    // Would need JavaScript interop to use navigator.geolocation.getCurrentPosition()
    // Return empty string to indicate no GPS data
    return CString();
}

CString WasmApplicationInterface::GpsReadLast()
{
    printf("[WasmApplicationInterface] GpsReadLast - not implemented\n");
    return CString();
}

CString WasmApplicationInterface::GpsReadInteractive(bool read_interactive_mode, const BaseMapSelection& base_map_selection, const CString& message, double read_duration)
{
    printf("[WasmApplicationInterface] GpsReadInteractive - not implemented\n");
    return CString();
}

// Authentication
std::optional<BaseApplicationInterface::LoginCredentials> WasmApplicationInterface::ShowLoginDialog(const CString& server, bool show_invalid_error)
{
    printf("[WasmApplicationInterface] ShowLoginDialog for: %ls\n", server.GetString());
    // Would need JavaScript UI for login dialog
    return std::nullopt;
}

CString WasmApplicationInterface::AuthorizeDropbox(const CString& clientId)
{
    printf("[WasmApplicationInterface] AuthorizeDropbox - not implemented\n");
    // Dropbox OAuth would need to be handled via JavaScript/redirect
    return CString();
}

// Bluetooth - Web Bluetooth API has limited browser support
std::optional<BluetoothDeviceInfo> WasmApplicationInterface::ChooseBluetoothDevice(const GUID& service_uuid)
{
    printf("[WasmApplicationInterface] ChooseBluetoothDevice - Bluetooth not available in browser\n");
    // Web Bluetooth API exists but has limited support and requires HTTPS
    return std::nullopt;
}

IBluetoothAdapter* WasmApplicationInterface::CreateAndroidBluetoothAdapter()
{
    printf("[WasmApplicationInterface] CreateAndroidBluetoothAdapter - returning nullptr\n");
    // Bluetooth not available in browser
    return nullptr;
}

// Network - Browsers handle this via fetch/XMLHttpRequest
IHttpConnection* WasmApplicationInterface::CreateAndroidHttpConnection()
{
    printf("[WasmApplicationInterface] CreateAndroidHttpConnection - not implemented\n");
    // HTTP would be handled via JavaScript fetch API
    return nullptr;
}

IFtpConnection* WasmApplicationInterface::CreateAndroidFtpConnection()
{
    printf("[WasmApplicationInterface] CreateAndroidFtpConnection - FTP not available in browser\n");
    return nullptr;
}

bool WasmApplicationInterface::IsNetworkConnected(int connectionType)
{
    printf("[WasmApplicationInterface] IsNetworkConnected\n");
    // Browser is assumed to have network if it loaded the page
    // Could check navigator.onLine via JavaScript
#ifdef __EMSCRIPTEN__
    // return EM_ASM_INT({ return navigator.onLine ? 1 : 0; }) != 0;
#endif
    return true;
}

// System
void WasmApplicationInterface::EngineAbort()
{
    printf("[WasmApplicationInterface] EngineAbort\n");
    // Could throw exception or notify JavaScript
}

bool WasmApplicationInterface::ExecSystem(const std::wstring& command, bool wait)
{
    printf("[WasmApplicationInterface] ExecSystem - system commands not available in browser\n");
    return false;
}

bool WasmApplicationInterface::ExecPff(const std::wstring& pff_filename)
{
    printf("[WasmApplicationInterface] ExecPff - not available in browser\n");
    return false;
}

CString WasmApplicationInterface::GetProperty(const CString& parameter)
{
    printf("[WasmApplicationInterface] GetProperty: %ls\n", parameter.GetString());
    auto it = m_properties.find(parameter);
    if (it != m_properties.end()) {
        return it->second;
    }
    return CString();
}

void WasmApplicationInterface::SetProperty(const CString& parameter, const CString& value)
{
    printf("[WasmApplicationInterface] SetProperty: %ls = %ls\n", parameter.GetString(), value.GetString());
    m_properties[parameter] = value;
}

std::tuple<int, int> WasmApplicationInterface::GetMaxDisplaySize() const
{
    printf("[WasmApplicationInterface] GetMaxDisplaySize\n");
    // Could get actual viewport size via JavaScript
    // window.innerWidth, window.innerHeight
    return std::make_tuple(1920, 1080);
}

std::vector<std::wstring> WasmApplicationInterface::GetMediaFilenames(MediaStore::MediaType media_type) const
{
    printf("[WasmApplicationInterface] GetMediaFilenames - not implemented\n");
    // Browser doesn't have direct access to device media
    return std::vector<std::wstring>();
}

CString WasmApplicationInterface::GetUsername() const
{
    printf("[WasmApplicationInterface] GetUsername\n");
    return _T("WebUser");
}

CString WasmApplicationInterface::GetDeviceId() const
{
    printf("[WasmApplicationInterface] GetDeviceId: %ls\n", m_deviceId.GetString());
    return m_deviceId;
}

CString WasmApplicationInterface::GetLocaleLanguage() const
{
    printf("[WasmApplicationInterface] GetLocaleLanguage\n");
    // Could get navigator.language via JavaScript
    return _T("en");
}

double WasmApplicationInterface::GetUpTime()
{
    printf("[WasmApplicationInterface] GetUpTime\n");
    // Could use performance.now() via JavaScript for page uptime
    return 0.0;
}

// Credentials - Could use localStorage/sessionStorage via JavaScript
void WasmApplicationInterface::StoreCredential(const std::wstring& attribute, const std::wstring& secret_value)
{
    printf("[WasmApplicationInterface] StoreCredential: %ls\n", attribute.c_str());
    m_credentials[attribute] = secret_value;
    // Could store in localStorage (not secure for sensitive data!)
}

std::wstring WasmApplicationInterface::RetrieveCredential(const std::wstring& attribute)
{
    printf("[WasmApplicationInterface] RetrieveCredential: %ls\n", attribute.c_str());
    auto it = m_credentials.find(attribute);
    if (it != m_credentials.end()) {
        return it->second;
    }
    return std::wstring();
}

std::optional<std::wstring> WasmApplicationInterface::GetPassword(const std::wstring& title, const std::wstring& description, bool file_exists)
{
    printf("[WasmApplicationInterface] GetPassword - not implemented\n");
    // Would need JavaScript password input dialog
    return std::nullopt;
}

// Progress dialog
void WasmApplicationInterface::ShowProgressDialog(const CString& message)
{
    printf("[WasmApplicationInterface] ShowProgressDialog: %ls\n", message.GetString());
    // Could emit JavaScript event to show progress UI
}

void WasmApplicationInterface::HideProgressDialog()
{
    printf("[WasmApplicationInterface] HideProgressDialog\n");
}

bool WasmApplicationInterface::UpdateProgressDialog(int progressPercent, const CString* message)
{
    printf("[WasmApplicationInterface] UpdateProgressDialog: %d%%\n", progressPercent);
    return false; // Not cancelled
}

bool WasmApplicationInterface::PartialSave(bool bPartialSaveClearSkipped, bool bFromLogic)
{
    printf("[WasmApplicationInterface] PartialSave\n");
    return true;
}

// Paradata
void WasmApplicationInterface::ParadataDriverManager(Paradata::PortableMessage msg, const Application* application)
{
    printf("[WasmApplicationInterface] ParadataDriverManager\n");
}

void WasmApplicationInterface::ParadataDeviceInfoQuery(Paradata::ApplicationEvent::DeviceInfo& device_info)
{
    printf("[WasmApplicationInterface] ParadataDeviceInfoQuery\n");
    // Fill in the DeviceInfo structure with browser-appropriate values
    device_info.screen_width = _T("1920");
    device_info.screen_height = _T("1080");
    device_info.screen_inches = _T("0");
    device_info.memory_ram = _T("0");
    device_info.battery_capacity = _T("0");
    device_info.device_brand = _T("Browser");
    device_info.device_device = _T("WebAssembly");
    device_info.device_hardware = _T("WASM");
    device_info.device_manufacturer = _T("Web");
    device_info.device_model = _T("Browser");
    device_info.device_processor = _T("Unknown");
    device_info.device_product = _T("CSPro Web");
}

void WasmApplicationInterface::ParadataDeviceStateQuery(Paradata::DeviceStateEvent::DeviceState& device_state)
{
    printf("[WasmApplicationInterface] ParadataDeviceStateQuery\n");
}

// Barcode - Could use BarcodeDetector API or JS library like QuaggaJS/ZXing
std::wstring WasmApplicationInterface::BarcodeRead(const std::wstring& message_text)
{
    printf("[WasmApplicationInterface] BarcodeRead - not implemented\n");
    // BarcodeDetector API is available in some browsers
    // Alternatively, could use camera + JavaScript barcode library
    return std::wstring();
}

// Audio - Could use Web Audio API
bool WasmApplicationInterface::AudioPlay(const std::wstring& filename, const std::wstring& message_text)
{
    printf("[WasmApplicationInterface] AudioPlay: %ls\n", filename.c_str());
    // Could use HTML5 Audio element or Web Audio API via JavaScript
    return false;
}

bool WasmApplicationInterface::AudioStartRecording(const std::wstring& filename, std::optional<double> seconds, std::optional<int> sampling_rate)
{
    printf("[WasmApplicationInterface] AudioStartRecording - not implemented\n");
    // Could use MediaRecorder API via JavaScript
    return false;
}

bool WasmApplicationInterface::AudioStopRecording()
{
    printf("[WasmApplicationInterface] AudioStopRecording\n");
    return false;
}

std::unique_ptr<TemporaryFile> WasmApplicationInterface::AudioRecordInteractive(const std::wstring& message_text, std::optional<int> sampling_rate)
{
    printf("[WasmApplicationInterface] AudioRecordInteractive - not implemented\n");
    return nullptr;
}

// Geometry capture
void WasmApplicationInterface::CapturePolygonTrace(std::unique_ptr<Geometry::Polygon>& captured_polygon, const Geometry::Polygon* polygon, IMapUI* map)
{
    printf("[WasmApplicationInterface] CapturePolygonTrace - not implemented\n");
}

void WasmApplicationInterface::CapturePolygonWalk(std::unique_ptr<Geometry::Polygon>& captured_polygon, const Geometry::Polygon* polygon, IMapUI* map)
{
    printf("[WasmApplicationInterface] CapturePolygonWalk - not implemented\n");
}

// Engine UI
long WasmApplicationInterface::RunEngineUIProcessor(WPARAM wParam, LPARAM lParam)
{
    printf("[WasmApplicationInterface] RunEngineUIProcessor type=%lu\n", static_cast<unsigned long>(wParam));
    return m_engineUIProcessor.ProcessMessage(wParam, lParam);
}

bool WasmApplicationInterface::CaptureImage(EngineUI::CaptureImageNode& capture_image_node)
{
    printf("[WasmApplicationInterface] CaptureImage - not implemented\n");
    // Could use MediaDevices.getUserMedia() via JavaScript
    return false;
}

void WasmApplicationInterface::CreateMapUI(std::unique_ptr<IMapUI>& map_ui)
{
    printf("[WasmApplicationInterface] CreateMapUI - not implemented\n");
    // Don't assign nullptr to unique_ptr of incomplete type - just leave it as-is
    // The caller should handle the case where map_ui is not modified
}

void WasmApplicationInterface::CreateUserbar(std::unique_ptr<Userbar>& userbar)
{
    printf("[WasmApplicationInterface] CreateUserbar - not implemented\n");
    // Don't assign nullptr to unique_ptr of incomplete type - just leave it as-is
    // The caller should handle the case where userbar is not modified
}

CString WasmApplicationInterface::EditNote(const CString& note, const CString& title, bool case_note)
{
    printf("[WasmApplicationInterface] EditNote: %ls\n", title.GetString());
    // Would need JavaScript text input
    return note;
}

bool WasmApplicationInterface::ExecSystemApp(EngineUI::ExecSystemAppNode& exec_system_app_node)
{
    printf("[WasmApplicationInterface] ExecSystemApp - not available in browser\n");
    return false;
}

std::wstring WasmApplicationInterface::GetHtmlDialogsDirectory()
{
    // Return absolute path in the virtual file system with trailing slash
    return L"/Assets/html/dialogs/";
}

void WasmApplicationInterface::Prompt(EngineUI::PromptNode& options)
{
    printf("[WasmApplicationInterface] Prompt - not implemented\n");
}

bool WasmApplicationInterface::RunPffExecutor(EngineUI::RunPffExecutorNode& run_pff_executor_node)
{
    printf("[WasmApplicationInterface] RunPffExecutor - not available in browser\n");
    return false;
}

long WasmApplicationInterface::View(const Viewer& viewer)
{
    printf("[WasmApplicationInterface] View\n");
    return 0;
}

#endif // WIN_DESKTOP
