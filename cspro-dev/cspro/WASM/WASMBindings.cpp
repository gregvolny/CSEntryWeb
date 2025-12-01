// WASMBindings.cpp - Emscripten Embind bindings for CSPro WASM
// This exposes the CoreEntryEngineInterface to JavaScript

// Include emscripten headers FIRST to avoid NONE macro conflict
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <engine/StandardSystemIncludes.h>
#include <zPlatformO/PlatformInterface.h>
#include <zEntryO/CoreEntryEngineInterface.h>
#include <zEntryO/CoreEntryPage.h>
#include <zEntryO/CoreEntryPageField.h>
#include <zEntryO/Runaple.h>
#include <engine/Entdrv.h>
#include <ZBRIDGEO/npff.h>
#include <zAppO/Application.h>
#include <zFormO/FormFile.h>
#include <zFormO/Form.h>
#include <zFormO/Field.h>
#include <zFormO/Roster.h>
#include <zFormO/RosterColumn.h>
#include <zFormO/Text.h>
#include <zFormO/Box.h>
#include <zFormO/FieldColors.h>
#include <zDictO/CaptureInfo.h>
#include <zDictO/ValueSetResponse.h>
#include <zDictO/DictValueSet.h>
#include <zDictO/DictValue.h>
#include <zDictO/DictValuePair.h>
#include <zCapiO/CapiQuestionManager.h>
#include <zToolsO/Utf8Convert.h>
#include <zToolsO/ObjectTransporter.h>
#include <zAction/ActionInvoker.h>
#include <zAction/Caller.h>
#include <zAction/Result.h>
#include "WasmApplicationInterface.h"

using namespace emscripten;

// External function to get virtual file content from PortableLocalhostWasm.cpp
extern "C" {
    const char* wasm_get_virtual_file_content(const wchar_t* url);
}

// Global WasmApplicationInterface instance
static WasmApplicationInterface* g_wasmApplicationInterface = nullptr;

// Helper to convert CString to std::string (UTF-8)
std::string CStringToStdString(const CString& cstr)
{
    // Convert wide string to UTF-8
    std::wstring wstr(cstr.GetString(), cstr.GetLength());
    std::string result;
    for (wchar_t wc : wstr)
    {
        if (wc < 0x80)
        {
            result += static_cast<char>(wc);
        }
        else if (wc < 0x800)
        {
            result += static_cast<char>(0xC0 | (wc >> 6));
            result += static_cast<char>(0x80 | (wc & 0x3F));
        }
        else
        {
            result += static_cast<char>(0xE0 | (wc >> 12));
            result += static_cast<char>(0x80 | ((wc >> 6) & 0x3F));
            result += static_cast<char>(0x80 | (wc & 0x3F));
        }
    }
    return result;
}

// Helper to convert std::string (UTF-8) to CString
CString StdStringToCString(const std::string& str)
{
    std::wstring wstr;
    size_t i = 0;
    while (i < str.size())
    {
        unsigned char c = str[i];
        wchar_t wc;
        if ((c & 0x80) == 0)
        {
            wc = c;
            i += 1;
        }
        else if ((c & 0xE0) == 0xC0)
        {
            wc = ((c & 0x1F) << 6) | (str[i + 1] & 0x3F);
            i += 2;
        }
        else if ((c & 0xF0) == 0xE0)
        {
            wc = ((c & 0x0F) << 12) | ((str[i + 1] & 0x3F) << 6) | (str[i + 2] & 0x3F);
            i += 3;
        }
        else
        {
            wc = L'?';
            i += 1;
        }
        wstr += wc;
    }
    return CString(wstr.c_str());
}

// Wrapper class to simplify JavaScript interface
class CSProEngine
{
public:
    CSProEngine()
        : m_engine(nullptr)
    {
        printf("[CSProEngine] Constructor - initializing platform\n");
        
        // Initialize WasmApplicationInterface if not already done
        if (!g_wasmApplicationInterface)
        {
            printf("[CSProEngine] Creating WasmApplicationInterface\n");
            g_wasmApplicationInterface = new WasmApplicationInterface();
            PlatformInterface::GetInstance()->SetApplicationInterface(g_wasmApplicationInterface);
        }
        
        // Initialize the ObjectTransporter (creates WasmObjectTransporter)
        // Note: The engine driver will be set later in initApplication() to enable InterpreterAccessor
        ObjectTransporter* objectTransporter = g_wasmApplicationInterface->GetObjectTransporter();
        if (objectTransporter) {
            printf("[CSProEngine] ObjectTransporter created (engine driver will be set in initApplication)\n");
        } else {
            printf("[CSProEngine] WARNING: ObjectTransporter not available!\n");
        }
        
        // Initialize platform directories - use absolute path for WASM virtual filesystem
        // Emscripten preloads to /Assets/ so we need the leading slash
        PlatformInterface::GetInstance()->SetAssetsDirectory(_T("/Assets"));
        printf("[CSProEngine] Platform initialized with assets at /Assets\n");
    }
    
    ~CSProEngine()
    {
        if (m_engine)
        {
            delete m_engine;
            m_engine = nullptr;
        }
    }
    
    bool initApplication(const std::string& pffPath)
    {
        printf("[WASM] initApplication called with path: %s\n", pffPath.c_str());
        
        if (m_engine)
        {
            delete m_engine;
        }
        
        m_engine = new CoreEntryEngineInterface();
        CString csPffPath = StdStringToCString(pffPath);
        
        printf("[WASM] Converted CString path, calling InitApplication...\n");
        
        try
        {
            bool result = m_engine->InitApplication(csPffPath);
            printf("[WASM] InitApplication returned: %s\n", result ? "true" : "false");
            
            if (result)
            {
                // CRITICAL: Connect the engine driver to the ObjectTransporter
                // This enables InterpreterAccessor for CSPro logic evaluation (Logic.eval, etc.)
                CRunAplEntry* runAplEntry = m_engine->GetRunAplEntry();
                if (runAplEntry)
                {
                    CEntryDriver* entryDriver = runAplEntry->GetEntryDriver();
                    if (entryDriver)
                    {
                        WasmSetEngineDriverForObjectTransporter(entryDriver);
                        printf("[WASM] Engine driver connected to ObjectTransporter\n");
                    }
                    else
                    {
                        printf("[WASM] WARNING: GetEntryDriver returned null\n");
                    }
                }
                else
                {
                    printf("[WASM] WARNING: GetRunAplEntry returned null\n");
                }
            }
            
            return result;
        }
        catch (const std::exception& e)
        {
            printf("[WASM] InitApplication threw exception: %s\n", e.what());
            return false;
        }
        catch (...)
        {
            printf("[WASM] InitApplication threw unknown exception\n");
            return false;
        }
    }
    
    bool start()
    {
        if (!m_engine) {
            printf("[WASM] start() called but m_engine is null\n");
            return false;
        }
        
        try {
            printf("[WASM] Calling m_engine->Start()...\n");
            bool result = m_engine->Start();
            printf("[WASM] m_engine->Start() returned: %s\n", result ? "true" : "false");
            return result;
        }
        catch (const std::exception& e) {
            printf("[WASM] start() threw exception: %s\n", e.what());
            return false;
        }
        catch (...) {
            printf("[WASM] start() threw unknown exception\n");
            return false;
        }
    }

    val getSequentialCaseIds()
    {
        if (!m_engine) return val::null();
        
        try {
            auto cases = m_engine->GetSequentialCaseIds();
            val result = val::array();
            
            for (const auto& c : cases) {
                val caseObj = val::object();
                caseObj.set("ids", CStringToStdString(c.case_summary.GetKey()));
                caseObj.set("label", CStringToStdString(c.case_summary.GetCaseLabel()));
                caseObj.set("position", c.case_summary.GetPositionInRepository());
                result.call<void>("push", caseObj);
            }
            return result;
        } catch (...) {
            return val::null();
        }
    }

    bool modifyCase(double position)
    {
        if (!m_engine) return false;
        return m_engine->ModifyCase(position);
    }
    
    val getCurrentPage()
    {
        printf("[WASM] getCurrentPage() called\n");
        fflush(stdout);
        
        if (!m_engine) {
            printf("[WASM] getCurrentPage(): m_engine is null\n");
            fflush(stdout);
            return val::null();
        }
        
        printf("[WASM] getCurrentPage(): calling GetCurrentEntryPage()\n");
        fflush(stdout);
        
        CoreEntryPage* page = m_engine->GetCurrentEntryPage();
        
        printf("[WASM] getCurrentPage(): GetCurrentEntryPage() returned %p\n", (void*)page);
        fflush(stdout);
        
        if (!page) {
            printf("[WASM] getCurrentPage(): page is null, returning null\n");
            fflush(stdout);
            return val::null();
        }
        
        printf("[WASM] getCurrentPage(): got valid page, building result\n");
        fflush(stdout);
        
        try {
        
        val result = val::object();
        
        printf("[WASM] getCurrentPage(): getting block info\n");
        fflush(stdout);
        
        // Page-level information
        result.set("blockName", CStringToStdString(page->GetBlockName()));
        result.set("blockLabel", CStringToStdString(page->GetBlockLabel()));
        result.set("occurrenceLabel", CStringToStdString(page->GetOccurrenceLabel()));
        
        printf("[WASM] getCurrentPage(): getting question text URLs\n");
        fflush(stdout);
        
        // Block question text URL (if available)
        std::optional<std::wstring> blockQuestionTextUrl = page->GetBlockQuestionTextUrl();
        if (blockQuestionTextUrl.has_value()) {
            result.set("blockQuestionTextUrl", UTF8Convert::WideToUTF8(*blockQuestionTextUrl));
        }
        
        std::optional<std::wstring> blockHelpTextUrl = page->GetBlockHelpTextUrl();
        if (blockHelpTextUrl.has_value()) {
            result.set("blockHelpTextUrl", UTF8Convert::WideToUTF8(*blockHelpTextUrl));
        }
        
        // Get page fields - comprehensive data like Android EntryPage_jni.cpp
        val fields = val::array();
        const auto& pageFields = page->GetPageFields();
        
        printf("[WASM] getCurrentPage(): got %zu page fields\n", pageFields.size());
        fflush(stdout);
        
        for (size_t i = 0; i < pageFields.size(); ++i)
        {
            printf("[WASM] getCurrentPage(): processing field %zu\n", i);
            fflush(stdout);
            
            const CoreEntryPageField& field = pageFields[i];
            val fieldObj = val::object();
            
            // Basic field properties - using full engine access
            fieldObj.set("name", CStringToStdString(field.GetName()));
            fieldObj.set("label", CStringToStdString(field.GetLabel()));
            fieldObj.set("isReadOnly", field.IsReadOnly());
            fieldObj.set("symbol", field.GetSymbol());
            fieldObj.set("isMirror", field.IsMirror());
            
            // Use the logic engine to get field type info
            bool isNumeric = field.IsNumeric();
            fieldObj.set("isNumeric", isNumeric);
            
            printf("[WASM] getCurrentPage(): field %s isNumeric=%d\n", 
                   CStringToStdString(field.GetName()).c_str(), isNumeric);
            fflush(stdout);
            
            // Question Text URL (QSF) - CRITICAL for CAPI
            std::optional<std::wstring> questionTextUrl = field.GetQuestionTextUrl();
            if (questionTextUrl.has_value()) {
                fieldObj.set("questionTextUrl", UTF8Convert::WideToUTF8(*questionTextUrl));
            }
            
            // Help Text URL
            std::optional<std::wstring> helpTextUrl = field.GetHelpTextUrl();
            if (helpTextUrl.has_value()) {
                fieldObj.set("helpTextUrl", UTF8Convert::WideToUTF8(*helpTextUrl));
            }
            
            // Field note
            printf("[WASM] getCurrentPage(): getting field note\n");
            fflush(stdout);
            fieldObj.set("note", CStringToStdString(field.GetNote()));
            
            // Capture type info from engine
            printf("[WASM] getCurrentPage(): getting capture info\n");
            fflush(stdout);
            const CaptureInfo& captureInfo = field.GetEvaluatedCaptureInfo();
            CaptureType captureType = captureInfo.GetCaptureType();
            fieldObj.set("captureType", static_cast<int>(captureType));
            printf("[WASM] getCurrentPage(): captureType=%d\n", static_cast<int>(captureType));
            fflush(stdout);
            
            // Get field properties based on type - full engine access
            if (isNumeric)
            {
                printf("[WASM] getCurrentPage(): getting numeric properties\n");
                fflush(stdout);
                fieldObj.set("integerPartLength", field.GetIntegerPartLength());
                fieldObj.set("fractionalPartLength", field.GetFractionalPartLength());
                printf("[WASM] getCurrentPage(): getting numeric value\n");
                fflush(stdout);
                double numValue = field.GetNumericValue();
                if (numValue != NOTAPPL) {
                    fieldObj.set("numericValue", numValue);
                }
                printf("[WASM] getCurrentPage(): numeric properties done\n");
                fflush(stdout);
            }
            else
            {
                // Alpha field properties
                fieldObj.set("alphaLength", field.GetAlphaLength());
                fieldObj.set("isUpperCase", field.IsUpperCase());
                fieldObj.set("isMultiline", field.IsMultiline());
                fieldObj.set("alphaValue", CStringToStdString(field.GetAlphaValue()));
            }
            
            // Tick mark properties from MFC CDEField
            // From GridWnd.cpp: UseUnicodeTextBox() || (Alpha && GetFont().IsArabic()) => NO tick marks
            CDEField* pDEField = field.GetField();
            if (pDEField) {
                bool useUnicodeTextBox = pDEField->UseUnicodeTextBox();
                bool isArabicFont = pDEField->GetFont().IsArabic();
                fieldObj.set("useUnicodeTextBox", useUnicodeTextBox);
                fieldObj.set("isArabic", isArabicFont);
                // Compute tickmarks = !UseUnicodeTextBox && !IsArabic (for alpha), always true for numeric
                bool showTickmarks = isNumeric || (!useUnicodeTextBox && !isArabicFont);
                fieldObj.set("tickmarks", showTickmarks);
                printf("[WASM] getCurrentPage(): field %s tickmarks: useUnicodeTextBox=%d isArabic=%d showTickmarks=%d\n",
                       CStringToStdString(field.GetName()).c_str(), useUnicodeTextBox, isArabicFont, showTickmarks);
                fflush(stdout);
            }
            
            // Slider properties (if applicable)
            printf("[WASM] getCurrentPage(): checking slider (captureType=%d)\n", static_cast<int>(captureType));
            fflush(stdout);
            if (captureType == CaptureType::Slider) {
                double sliderMin = 0, sliderMax = 0, sliderStep = 0;
                field.GetSliderProperties(sliderMin, sliderMax, sliderStep);
                fieldObj.set("sliderMinValue", sliderMin);
                fieldObj.set("sliderMaxValue", sliderMax);
                fieldObj.set("sliderStep", sliderStep);
            }
            
            // Max checkbox selections
            printf("[WASM] getCurrentPage(): checking checkbox\n");
            fflush(stdout);
            if (captureType == CaptureType::CheckBox) {
                int maxCheckboxSelections = field.GetMaxCheckboxSelections();
                if (maxCheckboxSelections > 0) {
                    fieldObj.set("maxCheckboxSelections", maxCheckboxSelections);
                }
            }
            
            // Value set responses from engine - always try to get responses
            // Fields with value sets should return responses regardless of capture type
            // This matches MFC behavior where TextBox fields in rosters can have value sets
            printf("[WASM] getCurrentPage(): getting responses for field %s (captureType=%d)\n", 
                   CStringToStdString(field.GetName()).c_str(), static_cast<int>(captureType));
            fflush(stdout);
            try {
                const auto& responses = field.GetResponses();
                size_t numResponses = responses.size();
                printf("[WASM] getCurrentPage(): got %zu responses\n", numResponses);
                fflush(stdout);
                
                if (numResponses > 0 && numResponses < 1000) {  // Sanity check
                    val responsesArray = val::array();
                    for (size_t ri = 0; ri < numResponses; ++ri) {
                        const auto& response = responses[ri];
                        if (response) {
                            val respObj = val::object();
                            respObj.set("code", CStringToStdString(response->GetCode()));
                            respObj.set("label", CStringToStdString(response->GetLabel()));
                            respObj.set("imageFilename", CStringToStdString(response->GetImageFilename()));
                            respObj.set("isDiscrete", response->IsDiscrete());
                            respObj.set("textColor", response->GetTextColor().ToColorInt());
                            responsesArray.call<void>("push", respObj);
                            printf("[WASM] getCurrentPage(): added response %zu: %s\n", ri, CStringToStdString(response->GetCode()).c_str());
                            fflush(stdout);
                        }
                    }
                    fieldObj.set("responses", responsesArray);
                }
            } catch (const std::exception& e) {
                printf("[WASM] getCurrentPage(): GetResponses exception: %s\n", e.what());
                fflush(stdout);
            } catch (...) {
                printf("[WASM] getCurrentPage(): GetResponses unknown exception\n");
                fflush(stdout);
            }
            
            // Selected responses (for checkboxes/radio buttons with value sets)
            {
                printf("[WASM] getCurrentPage(): getting selectedResponses\n");
                fflush(stdout);
                try {
                    const auto& selectedResponses = field.GetSelectedResponses();
                    if (!selectedResponses.empty() && selectedResponses.size() < 1000) {
                        val selectedArray = val::array();
                        for (size_t idx : selectedResponses) {
                            selectedArray.call<void>("push", static_cast<int>(idx));
                        }
                        fieldObj.set("selectedResponses", selectedArray);
                    }
                } catch (...) {
                    printf("[WASM] getCurrentPage(): GetSelectedResponses exception\n");
                    fflush(stdout);
                }
            }
            
            // Add indexes
            const C3DIndexes& indexes = field.GetIndexes();
            val indexArray = val::array();
            indexArray.call<void>("push", indexes.getIndexValue(0));
            indexArray.call<void>("push", indexes.getIndexValue(1));
            indexArray.call<void>("push", indexes.getIndexValue(2));
            fieldObj.set("indexes", indexArray);
            
            printf("[WASM] getCurrentPage(): field %zu done\n", i);
            fflush(stdout);
            
            fields.call<void>("push", fieldObj);
        }
        
        result.set("fields", fields);
        result.set("stopCode", m_engine->GetStopCode());
        result.set("isSystemControlled", m_engine->IsSystemControlled());
        
        // Add currentFieldIndex - find which field in the page is the current one
        // page->GetField() returns the current CDEField
        CDEField* currentField = page->GetField();
        int currentFieldIndex = 0;
        if (currentField) {
            CString currentFieldName = currentField->GetDictItem()->GetName();
            for (size_t i = 0; i < pageFields.size(); ++i) {
                if (pageFields[i].GetName() == currentFieldName) {
                    currentFieldIndex = static_cast<int>(i);
                    break;
                }
            }
            printf("[WASM] getCurrentPage(): currentFieldIndex=%d (field: %s)\n", 
                   currentFieldIndex, CStringToStdString(currentFieldName).c_str());
            fflush(stdout);
        }
        result.set("currentFieldIndex", currentFieldIndex);
        
        return result;
        }
        catch (const std::exception& e) {
            printf("[WASM] getCurrentPage() threw exception: %s\n", e.what());
            return val::null();
        }
        catch (...) {
            printf("[WASM] getCurrentPage() threw unknown exception\n");
            return val::null();
        }
    }
    
    val nextField()
    {
        if (!m_engine) return val::null();
        
        m_engine->NextField();
        return getCurrentPage();
    }
    
    val previousField()
    {
        if (!m_engine) return val::null();
        
        m_engine->PreviousField();
        return getCurrentPage();
    }
    
    val goToField(int fieldSymbol, int occ1, int occ2, int occ3)
    {
        if (!m_engine) return val::null();
        
        int index[3] = { occ1, occ2, occ3 };
        m_engine->GoToField(fieldSymbol, index);
        return getCurrentPage();
    }
    
    // Set the current field's value (without advancing)
    bool setFieldValue(const std::string& value)
    {
        printf("[WASM] setFieldValue called with: %s\n", value.c_str());
        
        if (!m_engine) return false;
        
        CoreEntryPage* page = m_engine->GetCurrentEntryPage();
        if (!page) return false;
        
        auto& pageFields = page->GetPageFields();
        if (pageFields.empty()) return false;
        
        // Get the current (first) field via non-const accessor
        CoreEntryPageField& field = page->GetPageField(0);
        
        if (field.IsReadOnly())
        {
            printf("[WASM] Field is read-only, cannot set value\n");
            return false;
        }
        
        CString csValue = StdStringToCString(value);
        
        try
        {
            if (field.IsNumeric())
            {
                // Parse numeric value
                double numValue = 0.0;
                if (!value.empty())
                {
                    numValue = std::stod(value);
                }
                field.SetNumericValue(numValue);
            }
            else
            {
                field.SetAlphaValue(csValue);
            }
            printf("[WASM] Field value set successfully\n");
            return true;
        }
        catch (const std::exception& e)
        {
            printf("[WASM] Error setting field value: %s\n", e.what());
            return false;
        }
    }
    
    // Set field value and advance to next field (enforces validation/logic)
    // This properly mimics MFC OnEditEnter: saves value, runs postproc, then advances
    val setFieldValueAndAdvance(const std::string& value)
    {
        printf("[WASM] setFieldValueAndAdvance called with: %s\n", value.c_str());
        fflush(stdout);
        
        if (!m_engine) {
            printf("[WASM] setFieldValueAndAdvance: engine is null\n");
            fflush(stdout);
            return val::null();
        }
        
        // Convert string to CString
        CString csValue = StdStringToCString(value);
        
        // Use the new engine method that properly saves and advances
        // This mimics MFC's OnEditEnter behavior
        CoreEntryPage* page = m_engine->SetFieldValueAndAdvance(csValue);
        
        printf("[WASM] setFieldValueAndAdvance: engine returned page=%p\n", (void*)page);
        fflush(stdout);
        
        return getCurrentPage();
    }
    
    val endGroup()
    {
        if (!m_engine) return val::null();
        
        m_engine->EndGroup();
        return getCurrentPage();
    }
    
    val endLevel()
    {
        if (!m_engine) return val::null();
        
        m_engine->EndLevel();
        return getCurrentPage();
    }
    
    val endLevelOcc()
    {
        if (!m_engine) return val::null();
        
        m_engine->EndLevelOcc();
        return getCurrentPage();
    }
    
    bool insertOcc()
    {
        if (!m_engine) return false;
        return m_engine->InsertOcc();
    }
    
    bool insertOccAfter()
    {
        if (!m_engine) return false;
        return m_engine->InsertOccAfter();
    }
    
    bool deleteOcc()
    {
        if (!m_engine) return false;
        return m_engine->DeleteOcc();
    }
    
    bool isSystemControlled() const
    {
        if (!m_engine) return false;
        return m_engine->IsSystemControlled();
    }
    
    int getStopCode() const
    {
        if (!m_engine) return -1;
        return m_engine->GetStopCode();
    }
    
    void onStop()
    {
        if (m_engine)
        {
            m_engine->OnStop();
        }
    }
    
    val getCaseTree()
    {
        if (!m_engine) return val::null();
        
        auto caseTree = m_engine->GetCaseTree();
        if (!caseTree) return val::null();
        
        // Convert case tree to JavaScript object
        return convertCaseTreeNode(caseTree.get());
    }
    
    bool partialSave()
    {
        if (!m_engine) return false;
        return m_engine->PartialSave();
    }
    
    // Get the complete form structure from the loaded application
    val getFormData()
    {
        printf("[WASM] getFormData() called\n");
        
        if (!m_engine)
        {
            printf("[WASM] getFormData: m_engine is null\n");
            return val::null();
        }
        
        CNPifFile* pPifFile = m_engine->GetPifFile();
        if (!pPifFile)
        {
            printf("[WASM] getFormData: pPifFile is null\n");
            return val::null();
        }
        
        Application* pApp = pPifFile->GetApplication();
        if (!pApp)
        {
            printf("[WASM] getFormData: pApp is null\n");
            return val::null();
        }
        
        printf("[WASM] getFormData: Application loaded: %s\n", CStringToStdString(pApp->GetLabel()).c_str());
        
        val result = val::object();
        result.set("success", true);
        result.set("applicationName", CStringToStdString(pApp->GetLabel()));
        result.set("useQuestionText", pApp->GetUseQuestionText());
        result.set("centerForms", pApp->GetCenterForms());
        
        // Get all runtime form files
        val formFiles = val::array();
        const auto& runtimeFormFiles = pApp->GetRuntimeFormFiles();
        
        printf("[WASM] getFormData: Found %zu runtime form files\n", runtimeFormFiles.size());
        
        for (size_t ffIdx = 0; ffIdx < runtimeFormFiles.size(); ++ffIdx)
        {
            CDEFormFile* pFormFile = runtimeFormFiles[ffIdx].get();
            if (!pFormFile) continue;
            
            val formFileObj = val::object();
            formFileObj.set("name", CStringToStdString(pFormFile->GetName()));
            formFileObj.set("dictionaryName", CStringToStdString(pFormFile->GetDictionaryName()));
            formFileObj.set("pathOn", pFormFile->IsPathOn());
            
            // Get field colors
            FieldColors fieldColors = pFormFile->GetEvaluatedFieldColors();
            val colorsObj = val::object();
            colorsObj.set("unvisited", static_cast<int>(fieldColors.GetColor(FieldStatus::Unvisited).ToCOLORREF()));
            colorsObj.set("visited", static_cast<int>(fieldColors.GetColor(FieldStatus::Visited).ToCOLORREF()));
            colorsObj.set("current", static_cast<int>(fieldColors.GetColor(FieldStatus::Current).ToCOLORREF()));
            colorsObj.set("skipped", static_cast<int>(fieldColors.GetColor(FieldStatus::Skipped).ToCOLORREF()));
            formFileObj.set("fieldColors", colorsObj);
            
            // Get all forms in this form file
            val formsArray = val::array();
            int numForms = pFormFile->GetNumForms();
            
            for (int formIdx = 0; formIdx < numForms; ++formIdx)
            {
                CDEForm* pForm = pFormFile->GetForm(formIdx);
                if (!pForm) continue;
                
                val formObj = val::object();
                formObj.set("name", CStringToStdString(pForm->GetName()));
                formObj.set("label", CStringToStdString(pForm->GetLabel()));
                
                // Form dimensions
                CRect dims = pForm->GetDims();
                formObj.set("width", dims.Width());
                formObj.set("height", dims.Height());
                formObj.set("backgroundColor", static_cast<int>(pForm->GetBackgroundColor().ToCOLORREF()));
                formObj.set("questionTextHeight", pForm->GetQuestionTextHeight());
                
                // Get all items in this form (fields, rosters, text)
                val fieldsArray = val::array();
                val rostersArray = val::array();
                val textsArray = val::array();
                
                int numItems = pForm->GetNumItems();
                for (int itemIdx = 0; itemIdx < numItems; ++itemIdx)
                {
                    CDEItemBase* pItem = pForm->GetItem(itemIdx);
                    if (!pItem) continue;
                    
                    CDEFormBase::eItemType itemType = pItem->GetItemType();
                    
                    if (itemType == CDEFormBase::Field)
                    {
                        CDEField* pField = static_cast<CDEField*>(pItem);
                        val fieldObj = convertField(pField);
                        fieldsArray.call<void>("push", fieldObj);
                    }
                    else if (itemType == CDEFormBase::Roster)
                    {
                        CDERoster* pRoster = static_cast<CDERoster*>(pItem);
                        val rosterObj = convertRoster(pRoster);
                        rostersArray.call<void>("push", rosterObj);
                    }
                    else if (itemType == CDEFormBase::Text)
                    {
                        CDEText* pText = static_cast<CDEText*>(pItem);
                        val textObj = convertText(pText);
                        textsArray.call<void>("push", textObj);
                    }
                }
                
                // Get boxes from the form's box set
                val boxesArray = val::array();
                const CDEBoxSet& boxSet = pForm->GetBoxSet();
                size_t numBoxes = boxSet.GetNumBoxes();
                printf("[WASM] Form '%s' has %zu boxes\n", UTF8Convert::WideToUTF8(pForm->GetLabel()).c_str(), numBoxes);
                for (size_t boxIdx = 0; boxIdx < numBoxes; ++boxIdx)
                {
                    const CDEBox& box = boxSet.GetBox(boxIdx);
                    const CRect& dims = box.GetDims();
                    printf("[WASM] Box %zu: type=%d, x=%d, y=%d, w=%d, h=%d\n", 
                           boxIdx, static_cast<int>(box.GetBoxType()), 
                           dims.left, dims.top, dims.Width(), dims.Height());
                    val boxObj = convertBox(box);
                    boxesArray.call<void>("push", boxObj);
                }
                
                formObj.set("fields", fieldsArray);
                formObj.set("rosters", rostersArray);
                formObj.set("texts", textsArray);
                formObj.set("boxes", boxesArray);
                
                formsArray.call<void>("push", formObj);
            }
            
            formFileObj.set("forms", formsArray);
            formFiles.call<void>("push", formFileObj);
        }
        
        result.set("formFiles", formFiles);
        return result;
    }
    
    // Get question text URL for current field (checks both field-level and block-level)
    val getQuestionText()
    {
        if (!m_engine) return val::null();
        
        CoreEntryPage* page = m_engine->GetCurrentEntryPage();
        if (!page) return val::null();
        
        const auto& pageFields = page->GetPageFields();
        if (pageFields.empty()) return val::null();
        
        // Get question text for the first (current) field
        const CoreEntryPageField& field = pageFields[0];
        
        val result = val::object();
        result.set("fieldName", CStringToStdString(field.GetName()));
        
        printf("[WASM] getQuestionText: checking field %s\n", CStringToStdString(field.GetName()).c_str());
        fflush(stdout);
        
        // Try field-level question text URL first
        auto questionTextUrl = field.GetQuestionTextUrl();
        
        // If no field-level URL, try block-level URL from the page
        if (!questionTextUrl.has_value())
        {
            questionTextUrl = page->GetBlockQuestionTextUrl();
            if (questionTextUrl.has_value())
            {
                printf("[WASM] getQuestionText: using block-level URL\n");
                fflush(stdout);
            }
        }
        
        if (questionTextUrl.has_value())
        {
            std::wstring url = questionTextUrl.value();
            std::string urlUtf8 = UTF8Convert::WideToUTF8(url);
            result.set("questionTextUrl", urlUtf8);
            
            printf("[WASM] getQuestionText: URL = %s\n", urlUtf8.c_str());
            fflush(stdout);
            
            // Get the actual HTML content from the virtual file system
            const char* content = wasm_get_virtual_file_content(url.c_str());
            if (content)
            {
                printf("[WASM] getQuestionText: got content, length = %zu\n", strlen(content));
                fflush(stdout);
                result.set("questionTextHtml", std::string(content));
            }
            else
            {
                printf("[WASM] getQuestionText: no content found for URL\n");
                fflush(stdout);
            }
        }
        else
        {
            printf("[WASM] getQuestionText: no URL available (field or block level)\n");
            fflush(stdout);
        }
        
        return result;
    }
    
    // Debug method to check CAPI configuration
    val getCapiDebugInfo()
    {
        val result = val::object();
        
        if (!m_engine) {
            result.set("error", "Engine not initialized");
            return result;
        }
        
        CNPifFile* pPifFile = m_engine->GetPifFile();
        if (!pPifFile) {
            result.set("error", "PifFile not available");
            return result;
        }
        
        Application* pApp = pPifFile->GetApplication();
        if (!pApp) {
            result.set("error", "Application not available");
            return result;
        }
        
        // Check if CAPI is enabled
        bool useQuestionText = pApp->GetUseQuestionText();
        result.set("useQuestionText", useQuestionText);
        printf("[WASM] getCapiDebugInfo: useQuestionText = %d\n", useQuestionText);
        
        // Get question text filename
        CString qsfFilename = pApp->GetQuestionTextFilename();
        result.set("questionTextFilename", CStringToStdString(qsfFilename));
        printf("[WASM] getCapiDebugInfo: questionTextFilename = %s\n", CStringToStdString(qsfFilename).c_str());
        
        // Check QuestMgr
        CRunAplEntry* pRunAplEntry = m_engine->GetRunAplEntry();
        if (pRunAplEntry) {
            CEntryDriver* pEntryDriver = pRunAplEntry->GetEntryDriver();
            if (pEntryDriver) {
                CapiQuestionManager* pQuestMgr = pEntryDriver->GetQuestMgr();
                if (pQuestMgr) {
                    result.set("questMgrExists", true);
                    
                    // Get languages
                    const auto& languages = pQuestMgr->GetLanguages();
                    result.set("numLanguages", static_cast<int>(languages.size()));
                    printf("[WASM] getCapiDebugInfo: numLanguages = %zu\n", languages.size());
                    
                    if (!languages.empty()) {
                        result.set("currentLanguage", UTF8Convert::WideToUTF8(pQuestMgr->GetCurrentLanguage().GetName()));
                    }
                    
                    // Get questions count
                    const auto& questions = pQuestMgr->GetQuestions();
                    result.set("numQuestions", static_cast<int>(questions.size()));
                    printf("[WASM] getCapiDebugInfo: numQuestions = %zu\n", questions.size());
                    
                    // List first few question names for debugging
                    val questionNames = val::array();
                    int count = 0;
                    for (const auto& q : questions) {
                        if (count++ < 10) {
                            questionNames.call<void>("push", CStringToStdString(q.GetItemName()));
                            printf("[WASM] getCapiDebugInfo: question[%d] = %s\n", count-1, CStringToStdString(q.GetItemName()).c_str());
                        }
                    }
                    result.set("questionNames", questionNames);
                } else {
                    result.set("questMgrExists", false);
                    printf("[WASM] getCapiDebugInfo: QuestMgr is NULL\n");
                }
            }
        }
        
        fflush(stdout);
        return result;
    }
    
private:
    CoreEntryEngineInterface* m_engine;
    
    // Helper to convert a CDEField to JavaScript object
    val convertField(CDEField* pField)
    {
        val fieldObj = val::object();
        
        fieldObj.set("name", CStringToStdString(pField->GetName()));
        fieldObj.set("label", CStringToStdString(pField->GetLabel()));
        
        // Position and dimensions
        CRect dims = pField->GetDims();
        fieldObj.set("x", dims.left);
        fieldObj.set("y", dims.top);
        fieldObj.set("width", dims.Width());
        fieldObj.set("height", dims.Height());
        
        // Field text (label) position
        const CDEText& fieldText = pField->GetCDEText();
        CRect textDims = fieldText.GetDims();
        fieldObj.set("textX", textDims.left);
        fieldObj.set("textY", textDims.top);
        fieldObj.set("textWidth", textDims.Width());
        fieldObj.set("textHeight", textDims.Height());
        fieldObj.set("text", CStringToStdString(fieldText.GetText()));
        
        // Field properties
        fieldObj.set("isProtected", pField->IsProtected());
        fieldObj.set("isSequential", pField->IsSequential());
        fieldObj.set("isMirror", pField->IsMirror());
        fieldObj.set("isPersistent", pField->IsPersistent());
        fieldObj.set("isHidden", pField->IsHidden());
        fieldObj.set("requireEnter", pField->IsEnterKeyRequired());
        fieldObj.set("isUpperCase", pField->IsUpperCase());
        
        // Get dictionary item info
        const CDictItem* pDictItem = pField->GetDictItem();
        if (pDictItem)
        {
            fieldObj.set("itemName", CStringToStdString(pDictItem->GetName()));
            fieldObj.set("length", pDictItem->GetLen());
            fieldObj.set("decimals", pDictItem->GetDecimal());
            fieldObj.set("isNumeric", pDictItem->GetContentType() != ContentType::Alpha);
            fieldObj.set("zeroFill", pDictItem->GetZeroFill());
            fieldObj.set("decimalChar", pDictItem->GetDecChar());
            
            // Get evaluated capture type from FORM field (matches MFC behavior)
            // CDEField::GetEvaluatedCaptureInfo() checks form-level capture type first (m_captureInfo),
            // then falls back to dictionary capture type if form doesn't specify.
            // This is how CSEntry MFC works - form capture types are primary (from .ent file).
            // Send as integer (matching getCurrentPage behavior) for consistency
            CaptureInfo captureInfo = pField->GetEvaluatedCaptureInfo();
            int captureTypeInt = 0; // Default to TextBox
            std::string fieldName = CStringToStdString(pDictItem->GetName());
            bool isSpecified = captureInfo.IsSpecified();
            
            printf("[WASM] convertField: %s captureInfo.IsSpecified=%d\n", fieldName.c_str(), isSpecified);
            
            if (isSpecified)
            {
                captureTypeInt = static_cast<int>(captureInfo.GetCaptureType());
                printf("[WASM] convertField: %s rawCaptureType=%d\n", fieldName.c_str(), captureTypeInt);
            }
            else
            {
                printf("[WASM] convertField: %s captureInfo NOT specified, defaulting to TextBox (0)\n", fieldName.c_str());
            }
            
            printf("[WASM] convertField: %s final captureType=%d\n", fieldName.c_str(), captureTypeInt);
            fieldObj.set("captureType", captureTypeInt);
            
            // Get responses from the first value set in the dictionary item
            // This provides static responses for roster fields that need them for UI rendering
            const auto& valueSets = pDictItem->GetValueSets();
            if (!valueSets.empty())
            {
                const DictValueSet& firstValueSet = valueSets[0];
                const auto& values = firstValueSet.GetValues();
                
                if (!values.empty())
                {
                    val responsesArray = val::array();
                    
                    for (const auto& dictValue : values)
                    {
                        // Each DictValue can have multiple value pairs (ranges), 
                        // but for discrete values typically just one
                        const auto& valuePairs = dictValue.GetValuePairs();
                        if (!valuePairs.empty())
                        {
                            val respObj = val::object();
                            // Use the "from" value as the code
                            respObj.set("code", CStringToStdString(valuePairs[0].GetFrom()));
                            respObj.set("label", CStringToStdString(dictValue.GetLabel()));
                            respObj.set("imageFilename", CStringToStdString(dictValue.GetImageFilename()));
                            respObj.set("isDiscrete", valuePairs.size() == 1 && valuePairs[0].GetTo().IsEmpty());
                            respObj.set("textColor", dictValue.GetTextColor().ToColorInt());
                            responsesArray.call<void>("push", respObj);
                        }
                    }
                    
                    fieldObj.set("responses", responsesArray);
                }
            }
        }
        
        return fieldObj;
    }
    
    // Helper to convert a CDERoster to JavaScript object
    val convertRoster(CDERoster* pRoster)
    {
        val rosterObj = val::object();
        
        rosterObj.set("name", CStringToStdString(pRoster->GetName()));
        rosterObj.set("label", CStringToStdString(pRoster->GetLabel()));
        
        // Position and dimensions
        CRect dims = pRoster->GetDims();
        rosterObj.set("x", dims.left);
        rosterObj.set("y", dims.top);
        rosterObj.set("width", dims.Width());
        rosterObj.set("height", dims.Height());
        
        // Roster properties
        rosterObj.set("maxOccurrences", pRoster->GetMaxLoopOccs());
        rosterObj.set("orientation", pRoster->GetOrientation() == RosterOrientation::Horizontal ? "Horizontal" : "Vertical");
        rosterObj.set("freeMovement", pRoster->UsingFreeMovement());
        // FreeMovement mode: 0=Disabled, 1=Horizontal, 2=Vertical
        rosterObj.set("freeMovementMode", static_cast<int>(pRoster->GetFreeMovement()));
        rosterObj.set("fieldRowHeight", pRoster->GetFieldRowHeight());
        rosterObj.set("headingRowHeight", pRoster->GetHeadingRowHeight());
        rosterObj.set("stubColWidth", pRoster->GetStubColWidth());
        rosterObj.set("colWidth", pRoster->GetColWidth()); // default column width
        
        // Get roster columns
        val columnsArray = val::array();
        int numCols = pRoster->GetNumCols();
        for (int colIdx = 0; colIdx < numCols; ++colIdx)
        {
            CDECol* pCol = pRoster->GetCol(colIdx);
            if (!pCol) continue;
            
            val colObj = val::object();
            colObj.set("width", pCol->GetWidth());
            colObj.set("heading", CStringToStdString(pCol->GetHeaderText().GetText()));
            
            // Get offset
            const CPoint& offset = pCol->GetOffset();
            colObj.set("offsetX", offset.x);
            colObj.set("offsetY", offset.y);
            
            // Get fields in this column
            val colFieldsArray = val::array();
            int numColFields = pCol->GetNumFields();
            for (int fIdx = 0; fIdx < numColFields; ++fIdx)
            {
                CDEField* pColField = pCol->GetField(fIdx);
                if (pColField)
                {
                    val colFieldObj = convertField(pColField);
                    colFieldsArray.call<void>("push", colFieldObj);
                }
            }
            colObj.set("fields", colFieldsArray);
            
            columnsArray.call<void>("push", colObj);
        }
        rosterObj.set("columns", columnsArray);
        
        // Get roster fields (items within roster)
        val rosterFieldsArray = val::array();
        int numItems = pRoster->GetNumItems();
        for (int itemIdx = 0; itemIdx < numItems; ++itemIdx)
        {
            CDEItemBase* pItem = pRoster->GetItem(itemIdx);
            if (pItem && pItem->GetItemType() == CDEFormBase::Field)
            {
                CDEField* pField = static_cast<CDEField*>(pItem);
                val fieldObj = convertField(pField);
                rosterFieldsArray.call<void>("push", fieldObj);
            }
        }
        rosterObj.set("fields", rosterFieldsArray);
        
        // Get stub texts (row labels)
        val stubsArray = val::array();
        const CDETextSet& stubTextSet = pRoster->GetStubTextSet();
        size_t numStubs = stubTextSet.GetNumTexts();
        for (size_t sIdx = 0; sIdx < numStubs; ++sIdx)
        {
            const CDEText& stubText = stubTextSet.GetText(sIdx);
            stubsArray.call<void>("push", CStringToStdString(stubText.GetText()));
        }
        rosterObj.set("stubTexts", stubsArray);
        
        return rosterObj;
    }
    
    // Helper to convert a CDEText to JavaScript object
    val convertText(CDEText* pText)
    {
        val textObj = val::object();
        
        textObj.set("text", CStringToStdString(pText->GetText()));
        
        // Position and dimensions
        CRect dims = pText->GetDims();
        textObj.set("x", dims.left);
        textObj.set("y", dims.top);
        textObj.set("width", dims.Width());
        textObj.set("height", dims.Height());
        
        // Font properties - get from LOGFONT
        const PortableFont& font = pText->GetFont();
        const LOGFONT& lf = font.GetLOGFONT();
        val fontObj = val::object();
        fontObj.set("height", lf.lfHeight);
        fontObj.set("bold", lf.lfWeight >= FW_BOLD);
        fontObj.set("italic", lf.lfItalic != 0);
        fontObj.set("underline", lf.lfUnderline != 0);
        // Convert wchar_t array to std::string via CString
        std::wstring faceName(reinterpret_cast<const wchar_t*>(lf.lfFaceName));
        std::string faceNameUtf8;
        for (wchar_t wc : faceName)
        {
            if (wc < 0x80) faceNameUtf8 += static_cast<char>(wc);
            else if (wc < 0x800) { faceNameUtf8 += static_cast<char>(0xC0 | (wc >> 6)); faceNameUtf8 += static_cast<char>(0x80 | (wc & 0x3F)); }
            else { faceNameUtf8 += static_cast<char>(0xE0 | (wc >> 12)); faceNameUtf8 += static_cast<char>(0x80 | ((wc >> 6) & 0x3F)); faceNameUtf8 += static_cast<char>(0x80 | (wc & 0x3F)); }
        }
        fontObj.set("faceName", faceNameUtf8);
        textObj.set("font", fontObj);
        
        // Color
        textObj.set("color", static_cast<int>(pText->GetColor().ToCOLORREF()));
        
        return textObj;
    }
    
    // Helper to convert a CDEBox to JavaScript object
    val convertBox(const CDEBox& box)
    {
        val boxObj = val::object();
        
        // Position and dimensions
        const CRect& dims = box.GetDims();
        boxObj.set("x", dims.left);
        boxObj.set("y", dims.top);
        boxObj.set("width", dims.Width());
        boxObj.set("height", dims.Height());
        
        // Box type: Etched=1, Raised=2, Thin=3, Thick=4
        boxObj.set("boxType", static_cast<int>(box.GetBoxType()));
        
        // Also provide type as string for frontend convenience
        const char* typeStr = "etched";
        switch (box.GetBoxType())
        {
            case BoxType::Etched: typeStr = "etched"; break;
            case BoxType::Raised: typeStr = "raised"; break;
            case BoxType::Thin: typeStr = "thin"; break;
            case BoxType::Thick: typeStr = "thick"; break;
        }
        boxObj.set("boxTypeStr", typeStr);
        
        return boxObj;
    }
    
    val convertCaseTreeNode(const CaseTreeNode* node)
    {
        if (!node) return val::null();
        
        val result = val::object();
        result.set("id", node->getId());
        result.set("label", CStringToStdString(node->getLabel()));
        result.set("value", CStringToStdString(node->getValue()));
        result.set("type", static_cast<int>(node->getType()));
        result.set("color", static_cast<int>(node->getColor()));
        result.set("visible", node->getVisible());
        
        // Add index
        const auto& index = node->getIndex();
        val indexArray = val::array();
        indexArray.call<void>("push", index[0]);
        indexArray.call<void>("push", index[1]);
        indexArray.call<void>("push", index[2]);
        result.set("index", indexArray);
        
        // Recursively convert children
        val children = val::array();
        for (const auto& child : node->getChildren())
        {
            children.call<void>("push", convertCaseTreeNode(child.get()));
        }
        result.set("children", children);
        
        return result;
    }
    
public:
    // ==================== ACTION INVOKER / LOGIC EVALUATION ====================
    
    /**
     * Invoke a user-defined CSPro logic function by name
     * This is required for CAPI HTML buttons that call functions like EndPersonRoster()
     * @param functionName - Name of the user-defined function (e.g., "EndPersonRoster")
     * @param argumentsJson - JSON string of arguments (optional)
     * @returns JSON result string or empty on error
     */
    std::string invokeLogicFunction(const std::string& functionName, const std::string& argumentsJson)
    {
        printf("[WASM] invokeLogicFunction: %s(%s)\n", functionName.c_str(), argumentsJson.c_str());
        fflush(stdout);
        
        // Get ActionInvoker runtime via ObjectTransporter
        std::shared_ptr<ActionInvoker::Runtime> action_invoker_runtime = ObjectTransporter::GetActionInvokerRuntime();
        if (!action_invoker_runtime) {
            printf("[WASM] invokeLogicFunction: ActionInvoker runtime not available!\n");
            fflush(stdout);
            return "{\"error\": \"ActionInvoker runtime not available\"}";
        }
        
        // Create a caller for ActionInvoker
        class WasmLogicCaller : public ActionInvoker::Caller {
        public:
            bool& GetCancelFlag() override { return m_cancelFlag; }
            std::wstring GetRootDirectory() override { return L"."; }
        private:
            bool m_cancelFlag = false;
        };
        
        WasmLogicCaller caller;
        
        // Build the Logic.invoke arguments JSON
        std::wstring json_args = L"{\"function\": \"";
        json_args += UTF8Convert::UTF8ToWide(functionName);
        json_args += L"\"";
        if (!argumentsJson.empty() && argumentsJson != "{}") {
            json_args += L", \"arguments\": ";
            json_args += UTF8Convert::UTF8ToWide(argumentsJson);
        }
        json_args += L"}";
        
        printf("[WASM] invokeLogicFunction: calling Logic_invoke with: %s\n", 
               UTF8Convert::WideToUTF8(json_args).c_str());
        fflush(stdout);
        
        try {
            // Call Logic.invoke action
            ActionInvoker::Result result = action_invoker_runtime->ProcessAction(
                ActionInvoker::Action::Logic_invoke,
                json_args,
                caller
            );
            
            // Convert result to JSON string
            std::wstring result_json;
            switch (result.GetType()) {
                case ActionInvoker::Result::Type::Undefined:
                    result_json = L"{}";
                    break;
                case ActionInvoker::Result::Type::String:
                case ActionInvoker::Result::Type::JsonText:
                    result_json = result.GetStringResult();
                    break;
                case ActionInvoker::Result::Type::Number:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
                default:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
            }
            
            printf("[WASM] invokeLogicFunction: result = %s\n", 
                   UTF8Convert::WideToUTF8(result_json).c_str());
            fflush(stdout);
            
            return UTF8Convert::WideToUTF8(result_json);
        }
        catch (const std::exception& e) {
            printf("[WASM] invokeLogicFunction exception: %s\n", e.what());
            fflush(stdout);
            return std::string("{\"error\": \"") + e.what() + "\"}";
        }
        catch (...) {
            printf("[WASM] invokeLogicFunction unknown exception\n");
            fflush(stdout);
            return "{\"error\": \"Unknown exception\"}";
        }
    }
    
    /**
     * Evaluate CSPro logic code directly
     * This handles Logic.eval actions from CAPI HTML
     * @param logicCode - CSPro logic code to evaluate
     * @returns JSON result string or empty on error
     */
    std::string evalLogic(const std::string& logicCode)
    {
        printf("[WASM] evalLogic: %s\n", logicCode.c_str());
        fflush(stdout);
        
        // Get ActionInvoker runtime via ObjectTransporter
        std::shared_ptr<ActionInvoker::Runtime> action_invoker_runtime = ObjectTransporter::GetActionInvokerRuntime();
        if (!action_invoker_runtime) {
            printf("[WASM] evalLogic: ActionInvoker runtime not available!\n");
            fflush(stdout);
            return "{\"error\": \"ActionInvoker runtime not available\"}";
        }
        
        // Create a caller for ActionInvoker
        class WasmLogicCaller : public ActionInvoker::Caller {
        public:
            bool& GetCancelFlag() override { return m_cancelFlag; }
            std::wstring GetRootDirectory() override { return L"."; }
        private:
            bool m_cancelFlag = false;
        };
        
        WasmLogicCaller caller;
        
        // Build the Logic.eval arguments JSON
        std::wstring json_args = L"{\"logic\": \"";
        // Escape the logic code for JSON
        std::string escaped_logic;
        for (char c : logicCode) {
            switch (c) {
                case '\"': escaped_logic += "\\\""; break;
                case '\\': escaped_logic += "\\\\"; break;
                case '\n': escaped_logic += "\\n"; break;
                case '\r': escaped_logic += "\\r"; break;
                case '\t': escaped_logic += "\\t"; break;
                default: escaped_logic += c; break;
            }
        }
        json_args += UTF8Convert::UTF8ToWide(escaped_logic);
        json_args += L"\"}";
        
        printf("[WASM] evalLogic: calling Logic_eval with: %s\n", 
               UTF8Convert::WideToUTF8(json_args).c_str());
        fflush(stdout);
        
        try {
            // Call Logic.eval action
            ActionInvoker::Result result = action_invoker_runtime->ProcessAction(
                ActionInvoker::Action::Logic_eval,
                json_args,
                caller
            );
            
            // Convert result to JSON string
            std::wstring result_json;
            switch (result.GetType()) {
                case ActionInvoker::Result::Type::Undefined:
                    result_json = L"{}";
                    break;
                case ActionInvoker::Result::Type::String:
                case ActionInvoker::Result::Type::JsonText:
                    result_json = result.GetStringResult();
                    break;
                case ActionInvoker::Result::Type::Number:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
                default:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
            }
            
            printf("[WASM] evalLogic: result = %s\n", 
                   UTF8Convert::WideToUTF8(result_json).c_str());
            fflush(stdout);
            
            return UTF8Convert::WideToUTF8(result_json);
        }
        catch (const std::exception& e) {
            printf("[WASM] evalLogic exception: %s\n", e.what());
            fflush(stdout);
            return std::string("{\"error\": \"") + e.what() + "\"}";
        }
        catch (...) {
            printf("[WASM] evalLogic unknown exception\n");
            fflush(stdout);
            return "{\"error\": \"Unknown exception\"}";
        }
    }
    
    /**
     * Execute a generic Action Invoker action
     * @param actionName - Full action name (e.g., "Logic.invoke", "UI.alert")
     * @param argumentsJson - JSON string of arguments
     * @returns JSON result string
     */
    std::string processAction(const std::string& actionName, const std::string& argumentsJson)
    {
        printf("[WASM] processAction: %s(%s)\n", actionName.c_str(), argumentsJson.c_str());
        fflush(stdout);
        
        // Get ActionInvoker runtime via ObjectTransporter
        std::shared_ptr<ActionInvoker::Runtime> action_invoker_runtime = ObjectTransporter::GetActionInvokerRuntime();
        if (!action_invoker_runtime) {
            printf("[WASM] processAction: ActionInvoker runtime not available!\n");
            fflush(stdout);
            return "{\"error\": \"ActionInvoker runtime not available\"}";
        }
        
        // Create a caller for ActionInvoker
        class WasmActionCaller : public ActionInvoker::Caller {
        public:
            bool& GetCancelFlag() override { return m_cancelFlag; }
            std::wstring GetRootDirectory() override { return L"."; }
        private:
            bool m_cancelFlag = false;
        };
        
        WasmActionCaller caller;
        
        // Parse action name to get Action enum
        // Format: "Namespace.method" -> Action::Namespace_method
        ActionInvoker::Action action = ActionInvoker::Action::execute; // Default
        
        // Map common action names
        if (actionName == "Logic.invoke" || actionName == "Logic_invoke") {
            action = ActionInvoker::Action::Logic_invoke;
        } else if (actionName == "Logic.eval" || actionName == "Logic_eval") {
            action = ActionInvoker::Action::Logic_eval;
        } else if (actionName == "Logic.getSymbolValue" || actionName == "Logic_getSymbolValue") {
            action = ActionInvoker::Action::Logic_getSymbolValue;
        } else if (actionName == "Logic.updateSymbolValue" || actionName == "Logic_updateSymbolValue") {
            action = ActionInvoker::Action::Logic_updateSymbolValue;
        } else if (actionName == "UI.alert" || actionName == "UI_alert") {
            action = ActionInvoker::Action::UI_alert;
        } else if (actionName == "UI.showDialog" || actionName == "UI_showDialog") {
            action = ActionInvoker::Action::UI_showDialog;
        } else if (actionName == "UI.closeDialog" || actionName == "UI_closeDialog") {
            action = ActionInvoker::Action::UI_closeDialog;
        } else if (actionName == "UI.getInputData" || actionName == "UI_getInputData") {
            action = ActionInvoker::Action::UI_getInputData;
        } else if (actionName == "UI.setDisplayOptions" || actionName == "UI_setDisplayOptions") {
            action = ActionInvoker::Action::UI_setDisplayOptions;
        } else if (actionName == "Application.getFormFile" || actionName == "Application_getFormFile") {
            action = ActionInvoker::Action::Application_getFormFile;
        } else {
            // For unknown actions, use execute action
            printf("[WASM] processAction: unknown action '%s', using execute\n", actionName.c_str());
        }
        
        std::wstring json_args = UTF8Convert::UTF8ToWide(argumentsJson);
        
        try {
            ActionInvoker::Result result = action_invoker_runtime->ProcessAction(
                action,
                json_args.empty() ? std::nullopt : std::optional<std::wstring>(json_args),
                caller
            );
            
            // Convert result to JSON string
            std::wstring result_json;
            switch (result.GetType()) {
                case ActionInvoker::Result::Type::Undefined:
                    result_json = L"{}";
                    break;
                case ActionInvoker::Result::Type::String:
                case ActionInvoker::Result::Type::JsonText:
                    result_json = result.GetStringResult();
                    break;
                case ActionInvoker::Result::Type::Number:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
                default:
                    result_json = result.GetResultAsJsonText<false>();
                    break;
            }
            
            printf("[WASM] processAction: result = %s\n", 
                   UTF8Convert::WideToUTF8(result_json).c_str());
            fflush(stdout);
            
            return UTF8Convert::WideToUTF8(result_json);
        }
        catch (const std::exception& e) {
            printf("[WASM] processAction exception: %s\n", e.what());
            fflush(stdout);
            return std::string("{\"error\": \"") + e.what() + "\"}";
        }
        catch (...) {
            printf("[WASM] processAction unknown exception\n");
            fflush(stdout);
            return "{\"error\": \"Unknown exception\"}";
        }
    }
};

// Standalone function to get virtual file content by URL
std::string getVirtualFileContent(const std::string& urlUtf8)
{
    // Convert UTF-8 URL to wstring for lookup
    std::wstring url = UTF8Convert::UTF8ToWide(urlUtf8);
    
    printf("[WASM] getVirtualFileContent: looking up URL = %s\n", urlUtf8.c_str());
    fflush(stdout);
    
    const char* content = wasm_get_virtual_file_content(url.c_str());
    if (content)
    {
        printf("[WASM] getVirtualFileContent: found content, length = %zu\n", strlen(content));
        fflush(stdout);
        return std::string(content);
    }
    
    printf("[WASM] getVirtualFileContent: content not found\n");
    fflush(stdout);
    return "";
}

// Embind bindings
// For JSPI support, methods that may suspend (do file I/O) must be marked with async()
// This ensures they return a Promise that properly handles WASM suspension
EMSCRIPTEN_BINDINGS(cspro_engine)
{
    // Standalone function for getting virtual file content
    function("getVirtualFileContent", &getVirtualFileContent);
    
    class_<CSProEngine>("CSProEngine")
        .constructor<>()
        // Methods that may suspend (file I/O operations) - marked with async() for JSPI
        .function("initApplication", &CSProEngine::initApplication, async())
        .function("start", &CSProEngine::start, async())
        .function("getSequentialCaseIds", &CSProEngine::getSequentialCaseIds)
        .function("modifyCase", &CSProEngine::modifyCase, async())
        .function("nextField", &CSProEngine::nextField, async())
        .function("previousField", &CSProEngine::previousField, async())
        .function("goToField", &CSProEngine::goToField, async())
        .function("endGroup", &CSProEngine::endGroup, async())
        .function("endLevel", &CSProEngine::endLevel, async())
        .function("endLevelOcc", &CSProEngine::endLevelOcc, async())
        .function("insertOcc", &CSProEngine::insertOcc, async())
        .function("insertOccAfter", &CSProEngine::insertOccAfter, async())
        .function("deleteOcc", &CSProEngine::deleteOcc, async())
        .function("onStop", &CSProEngine::onStop, async())
        .function("partialSave", &CSProEngine::partialSave, async())
        .function("setFieldValueAndAdvance", &CSProEngine::setFieldValueAndAdvance, async())
        // Methods that don't suspend - no file I/O
        .function("getCurrentPage", &CSProEngine::getCurrentPage)
        .function("isSystemControlled", &CSProEngine::isSystemControlled)
        .function("getStopCode", &CSProEngine::getStopCode)
        .function("getCaseTree", &CSProEngine::getCaseTree)
        .function("getFormData", &CSProEngine::getFormData)
        .function("getQuestionText", &CSProEngine::getQuestionText)
        .function("getCapiDebugInfo", &CSProEngine::getCapiDebugInfo)
        .function("setFieldValue", &CSProEngine::setFieldValue)
        // Action Invoker / Logic evaluation methods - may suspend for dialogs
        .function("invokeLogicFunction", &CSProEngine::invokeLogicFunction, async())
        .function("evalLogic", &CSProEngine::evalLogic, async())
        .function("processAction", &CSProEngine::processAction, async())
        ;
}
