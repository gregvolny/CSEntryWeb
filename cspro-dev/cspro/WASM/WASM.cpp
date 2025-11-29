#include <iostream>
#include <engine/StandardSystemIncludes.h>
#include <zPlatformO/PlatformInterface.h>


int main()
{
    try
    {
        // Use absolute path for WASM virtual filesystem
        // Emscripten preloads to /Assets/ so we need the leading slash
        PlatformInterface::GetInstance()->SetAssetsDirectory(_T("/Assets"));
    }

    catch( const std::exception& e )
    {
        std::cout << "Exception: " << e.what() << std::endl;
    }

    return 0;
}
