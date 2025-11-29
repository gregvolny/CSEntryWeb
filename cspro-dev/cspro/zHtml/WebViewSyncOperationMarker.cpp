#include "stdafx.h"
#include "WebViewSyncOperationMarker.h"


unsigned WebViewSyncOperationMarker::m_operationsInProcess = 0;


void WebViewSyncOperationMarker::DisplayOperationInProcessError()
{
    ASSERT(IsOperationInProgress());

    ErrorMessage::Display(_T("A JavaScript call into CSPro is still in progress so some functionality ")
                          _T("in this web view will not work correctly. Consider changing ")
                          _T("the currently executing JavaScript call to be asynchronous."));
}



// temporarily here for the UseHtmlDialogs flag...
#include "UseHtmlDialogs.h"
#ifdef __EMSCRIPTEN__
// WASM builds always use HTML dialogs for proper validation error display
bool UHD::flag = true;
#else
bool UHD::flag = false;
#endif


// temporarily here for an access token for the old CSPro JavaScript interface
const std::wstring& OldCSProJavaScriptInterface::GetAccessToken()
{
    static const std::wstring access_token = CreateUuid();
    return access_token;
}
