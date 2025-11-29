#pragma once

#ifndef WIN_DESKTOP

#include <zPlatformO/PlatformInterface.h>
#include <zPlatformO/PortableMFC.h>
#include <zEngineF/EngineUI.h>

struct ActionInvokerData;
struct IBluetoothAdapter;
struct IHttpConnection;
struct IFtpConnection;
class CEngineDriver;

// Function to set the engine driver for InterpreterAccessor support
// This must be called from WASMBindings.cpp after engine initialization
void WasmSetEngineDriverForObjectTransporter(CEngineDriver* engineDriver);


/**
 * @brief WASM/Browser implementation of BaseApplicationInterface
 * 
 * This class provides stub implementations or Web API equivalents for
 * platform-specific functionality that isn't natively available in browsers.
 * 
 * Web API Equivalents:
 * - GPS/Geolocation: Can use Web Geolocation API via JavaScript
 * - Camera/Image Capture: Can use MediaDevices API via JavaScript
 * - Bluetooth: Web Bluetooth API (limited support, requires HTTPS)
 * - Audio: Web Audio API
 * - File System: File API / IndexedDB
 * 
 * Many features return safe defaults or "not available" status since
 * browser capabilities vary and require user permission.
 */
class WasmApplicationInterface : public BaseApplicationInterface
{
public:
    WasmApplicationInterface();
    virtual ~WasmApplicationInterface();

    // Core interface methods
    ObjectTransporter* GetObjectTransporter() override;
    void RefreshPage(RefreshPageContents contents) override;
    void DisplayErrorMessage(const TCHAR* error_message) override;
    std::optional<std::wstring> DisplayCSHtmlDlg(const NavigationAddress& navigation_address, const std::wstring* action_invoker_access_token_override) override;
    std::optional<std::wstring> DisplayHtmlDialogFunctionDlg(const NavigationAddress& navigation_address, const std::wstring* action_invoker_access_token_override, const std::optional<std::wstring>& display_options_json) override;
    
    // Dialog methods
    int ShowModalDialog(NullTerminatedString title, NullTerminatedString message, int mbType) override;
    int ShowMessage(const CString& title, const CString& message, const std::vector<CString>& aButtons) override;
    int ShowChoiceDialog(const CString& title, const std::vector<std::vector<CString>*>& data) override;
    int ShowShowDialog(const std::vector<CString>* column_titles, const std::vector<PortableColor>* row_text_colors,
        const std::vector<std::vector<CString>*>& data, const CString& heading) override;
    int ShowSelcaseDialog(const std::vector<CString>* column_titles, const std::vector<std::vector<CString>*>& data, const CString& heading, std::vector<bool>* selections) override;
    
    // GPS/Geolocation - Could use Web Geolocation API via JS interop
    bool GpsOpen() override;
    bool GpsClose() override;
    CString GpsRead(int waitTime, int accuracy, const CString& dialog_text) override;
    CString GpsReadLast() override;
    CString GpsReadInteractive(bool read_interactive_mode, const BaseMapSelection& base_map_selection, const CString& message, double read_duration) override;
    
    // Authentication/Login
    std::optional<LoginCredentials> ShowLoginDialog(const CString& server, bool show_invalid_error) override;
    CString AuthorizeDropbox(const CString& clientId) override;
    
    // Bluetooth - Web Bluetooth API has limited support
    std::optional<BluetoothDeviceInfo> ChooseBluetoothDevice(const GUID& service_uuid) override;
    IBluetoothAdapter* CreateAndroidBluetoothAdapter() override;
    
    // Network connections
    IHttpConnection* CreateAndroidHttpConnection() override;
    IFtpConnection* CreateAndroidFtpConnection() override;
    bool IsNetworkConnected(int connectionType) override;
    
    // System/Device info
    void EngineAbort() override;
    bool ExecSystem(const std::wstring& command, bool wait) override;
    bool ExecPff(const std::wstring& pff_filename) override;
    CString GetProperty(const CString& parameter) override;
    void SetProperty(const CString& parameter, const CString& value) override;
    std::tuple<int, int> GetMaxDisplaySize() const override;
    std::vector<std::wstring> GetMediaFilenames(MediaStore::MediaType media_type) const override;
    CString GetUsername() const override;
    CString GetDeviceId() const override;
    CString GetLocaleLanguage() const override;
    double GetUpTime() override;
    
    // Credentials/Security
    void StoreCredential(const std::wstring& attribute, const std::wstring& secret_value) override;
    std::wstring RetrieveCredential(const std::wstring& attribute) override;
    std::optional<std::wstring> GetPassword(const std::wstring& title, const std::wstring& description, bool file_exists) override;
    
    // Progress dialog
    void ShowProgressDialog(const CString& message) override;
    void HideProgressDialog() override;
    bool UpdateProgressDialog(int progressPercent, const CString* message) override;
    bool PartialSave(bool bPartialSaveClearSkipped, bool bFromLogic) override;
    
    // Paradata
    void ParadataDriverManager(Paradata::PortableMessage msg, const Application* application) override;
    void ParadataDeviceInfoQuery(Paradata::ApplicationEvent::DeviceInfo& device_info) override;
    void ParadataDeviceStateQuery(Paradata::DeviceStateEvent::DeviceState& device_state) override;
    
    // Barcode/QR scanning - Could use BarcodeDetector API or JS library
    std::wstring BarcodeRead(const std::wstring& message_text) override;
    
    // Audio - Could use Web Audio API
    bool AudioPlay(const std::wstring& filename, const std::wstring& message_text) override;
    bool AudioStartRecording(const std::wstring& filename, std::optional<double> seconds, std::optional<int> sampling_rate) override;
    bool AudioStopRecording() override;
    std::unique_ptr<TemporaryFile> AudioRecordInteractive(const std::wstring& message_text, std::optional<int> sampling_rate) override;
    
    // Geometry capture
    void CapturePolygonTrace(std::unique_ptr<Geometry::Polygon>& captured_polygon, const Geometry::Polygon* polygon, IMapUI* map) override;
    void CapturePolygonWalk(std::unique_ptr<Geometry::Polygon>& captured_polygon, const Geometry::Polygon* polygon, IMapUI* map) override;
    
    // Engine UI
    long RunEngineUIProcessor(WPARAM wParam, LPARAM lParam) override;
    bool CaptureImage(EngineUI::CaptureImageNode& capture_image_node) override;
    void CreateMapUI(std::unique_ptr<IMapUI>& map_ui) override;
    void CreateUserbar(std::unique_ptr<Userbar>& userbar) override;
    CString EditNote(const CString& note, const CString& title, bool case_note) override;
    bool ExecSystemApp(EngineUI::ExecSystemAppNode& exec_system_app_node) override;
    std::wstring GetHtmlDialogsDirectory() override;
    void Prompt(EngineUI::PromptNode& options) override;
    bool RunPffExecutor(EngineUI::RunPffExecutorNode& run_pff_executor_node) override;
    long View(const Viewer& viewer) override;

private:
    // Engine UI processor for handling engine messages
    EngineUIProcessor m_engineUIProcessor;
    
    // Cached values
    CString m_deviceId;
    std::map<std::wstring, std::wstring> m_credentials;
    std::map<CString, CString> m_properties;
};

#endif // WIN_DESKTOP
