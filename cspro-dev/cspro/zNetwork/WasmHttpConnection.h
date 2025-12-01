#pragma once

#ifdef WASM

#include <zNetwork/IHttpConnection.h>

/**
 * Stub HTTP connection for WASM builds.
 * 
 * Since WASM runs in a sandboxed environment, direct HTTP connections
 * are not possible from the WASM module itself. This stub returns
 * appropriate error responses to allow the application to handle
 * the situation gracefully rather than crashing.
 * 
 * For actual HTTP functionality in WASM, the JavaScript host should
 * intercept sync operations and perform them via fetch() API.
 */
class WasmHttpConnection : public IHttpConnection
{
public:
    WasmHttpConnection() = default;
    virtual ~WasmHttpConnection() = default;

    /**
     * Returns a 503 Service Unavailable response for all requests.
     * This indicates that the sync service is not available in this context.
     */
    HttpResponse Request(const HttpRequest& request) override
    {
        // Return 503 Service Unavailable - sync not available in WASM standalone mode
        // The application logic should handle this gracefully
        return HttpResponse(503);
    }

    void setListener(ISyncListener* listener) override
    {
        // No-op for stub implementation
        m_pListener = listener;
    }

private:
    ISyncListener* m_pListener = nullptr;
};

#endif // WASM
