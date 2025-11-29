#include "StdAfx.h"
#include "CoreEntryPage.h"
#include "CoreEntryEngineInterface.h"
#include "CoreEntryPageField.h"
#include "Runaple.h"
#include <engine/IntDrive.h>


CoreEntryPage::CoreEntryPage(CoreEntryEngineInterface* core_entry_engine_interface, CDEField* pField)
    :   m_pField(pField)
{
    ASSERT(!m_pField->IsProtected());
    ASSERT(!m_pField->IsMirror());

    CRunAplEntry* pRunAplEntry = core_entry_engine_interface->GetRunAplEntry();
    CEntryDriver* m_pEngineDriver = pRunAplEntry->GetEntryDriver();
    CEngineArea* m_pEngineArea = m_pEngineDriver->getEngineAreaPtr();
    CIntDriver* m_pIntDriver = m_pEngineDriver->m_pIntDriver.get();

    auto GetSymbolTable = [&]() -> const Logic::SymbolTable& { return m_pEngineArea->GetSymbolTable(); };

    int symbol_index = m_pField->GetSymbol();
    const VART* field_vart = VPT(symbol_index);

    // construct a combined occurrence label (the function will return record and item occurrence labels)
    std::vector<std::wstring> occurrence_labels = m_pEngineDriver->GetOccurrenceLabels(field_vart);
    occurrence_labels.erase(std::remove(occurrence_labels.begin(), occurrence_labels.end(), SO::EmptyString), occurrence_labels.end());
    m_occurrenceLabel = SO::CreateSingleString(occurrence_labels, _T(" - "));

    // get the block information (if applicable)
    const EngineBlock* engine_block = field_vart->GetEngineBlock();

    if( engine_block != nullptr )
    {
        // setup the block details
        const CDEBlock& form_block = engine_block->GetFormBlock();
        m_blockName = form_block.GetName();
        m_blockLabel = form_block.GetLabel();

        // evaluate the block's question/help text
        const CCapi* capi = pRunAplEntry->GetCapi();
        CapiContent block_capi_content;
        capi->GetCapiContent(&block_capi_content, engine_block->GetSymbolIndex(), CCapi::CapiContentType::All);

        m_blockCapiContentVirtualFileMapping.SetCapiContent(std::move(block_capi_content), *m_pEngineDriver);
    }

    // For Web/MFC: Always display one field at a time to ensure CSPro logic (procs) run for each field.
    // DisplayTogether blocks are only for Android - they show multiple fields on one screen.
    // For Web, each field must be shown individually so that postprocs and validation run properly.
    m_currentPageField = &m_pageFields.emplace_back(core_entry_engine_interface, m_pField);

    if( m_pageFields.size() == 1 )
        m_pageFields.front().SetCaptureTypeForSingleFieldDisplay();
}


CoreEntryPageField* CoreEntryPage::GetPageField(const std::wstring& field_name)
{
    auto lookup = std::find_if(m_pageFields.begin(), m_pageFields.end(),
                               [&](const CoreEntryPageField& page_field) { return SO::EqualsNoCase(field_name, page_field.GetName()); });

    return ( lookup != m_pageFields.end() ) ? &(*lookup) :
                                              nullptr;
}


bool CoreEntryPage::AreAnyFieldsFilled() const
{
    for( const CoreEntryPageField& page_field : m_pageFields )
    {
        if( page_field.IsFieldFilled() )
            return true;
    }

    return false;
}
