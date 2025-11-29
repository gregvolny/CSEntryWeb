# ==============================================================================
# CMakeLists.txt - CSEntryWeb Build Configuration
# ==============================================================================
#
# CSEntry Web Application - WebAssembly Build
#
# This is a port of CSPro's CSEntry MFC application to WebAssembly,
# providing a complete data entry runtime for web browsers.
#
# Build Commands:
#
#   WASM Build (requires Emscripten):
#     C:\emsdk\emsdk_env.bat
#     mkdir build-wasm && cd build-wasm
#     emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -G Ninja
#     ninja
#
#   Native Build (for testing):
#     mkdir build && cd build
#     cmake .. -DCMAKE_BUILD_TYPE=Release
#     cmake --build .
#
# ==============================================================================

cmake_minimum_required(VERSION 3.16)
project(CSEntryWeb VERSION 1.0.0 LANGUAGES C CXX)

# ==============================================================================
# Build Options
# ==============================================================================

option(CSE_BUILD_EXAMPLES "Build example programs" OFF)
option(CSE_BUILD_TESTS "Build test suite" OFF)
option(CSE_ENABLE_SANITIZERS "Enable address/undefined sanitizers (native only)" OFF)

# ==============================================================================
# C++ Standard Configuration
# ==============================================================================

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ==============================================================================
# Detect Emscripten Toolchain
# ==============================================================================

if(EMSCRIPTEN)
    message(STATUS "==> Emscripten toolchain detected - Building WASM module")
    set(CSE_BUILD_WASM ON)
else()
    message(STATUS "==> Standard C++ toolchain - Building static library")
    set(CSE_BUILD_WASM OFF)
endif()

# ==============================================================================
# Source Files
# ==============================================================================

# Core engine sources
set(CSE_CORE_SOURCES
    src/CSEntryEngine.cpp
    src/CSEntryEngineImpl.cpp
    src/PenDeserializer.cpp
    src/SymbolTable.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../cspro-dev/cspro/zPlatformO/PlatformInterface.cpp
)

# Runtime engine sources - temporarily disabled due to namespace issues
# These need to be fixed to use csentry::runtime namespace consistently
# set(CSE_RUNTIME_SOURCES
#     src/runtime/CsDriver.cpp
#     src/runtime/EntryDriver.cpp
#     src/runtime/FlowAdmin.cpp
#     src/runtime/FlowCore.cpp
#     src/runtime/RunAplEntry.cpp
#     src/runtime/SymbolTable.cpp
# )
set(CSE_RUNTIME_SOURCES "")

# Core headers
set(CSE_CORE_HEADERS
    include/CSEntryEngine.h
    include/CSEntryEngineImpl.h
    include/StringConversion.h
    include/PenDeserializer.h
    include/RuntimeTypes.h
    include/SymbolTable.h
    include/FlowAdmin.h
    include/EntryDriver.h
    include/LogicInterpreter.h
    include/DictionaryParser.h
    include/FormFileParser.h
    include/PFFParser.h
    include/CaseManager.h
    include/CapiManager.h
    include/RuntimeEngine.h
)

# Runtime headers
set(CSE_RUNTIME_HEADERS
    include/runtime/CsDriver.h
    include/runtime/EntryDriver.h
    include/runtime/FlowAdmin.h
    include/runtime/FlowCore.h
    include/runtime/RunAplEntry.h
    include/runtime/RuntimeTypes.h
    include/runtime/SymbolTable.h
)

# BZip2 source from CSPro (for .pen file decompression)
set(BZIP2_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/../cspro-dev/cspro/zToolsO/bzlib.c
)

# Set C language for bzip2 source
set_source_files_properties(${BZIP2_SOURCES} PROPERTIES LANGUAGE C)

# WASM bindings
set(CSE_WASM_SOURCES
    wasm/bindings.cpp
)

# ==============================================================================
# Include Directories
# ==============================================================================

set(CSE_INCLUDE_DIRS
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/runtime
    ${CMAKE_CURRENT_SOURCE_DIR}/../cspro-dev/cspro/zToolsO
)

# CSPro source directories for integration
set(CSPRO_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../cspro-dev/cspro)
set(CSPRO_INCLUDE_DIRS
    ${CSPRO_ROOT}
    ${CSPRO_ROOT}/engine
    ${CSPRO_ROOT}/Zentryo
    ${CSPRO_ROOT}/Cexentry
    ${CSPRO_ROOT}/zDictO
    ${CSPRO_ROOT}/zCaseO
    ${CSPRO_ROOT}/zFormO
    ${CSPRO_ROOT}/zToolsO
)

# ==============================================================================
# WASM Build Configuration
# ==============================================================================

if(CSE_BUILD_WASM)
    # WASM executable output
    add_executable(cse_wasm
        ${CSE_CORE_SOURCES}
        ${CSE_RUNTIME_SOURCES}
        ${CSE_WASM_SOURCES}
        ${BZIP2_SOURCES}
    )

    target_include_directories(cse_wasm PRIVATE
        ${CSE_INCLUDE_DIRS}
        ${CSPRO_INCLUDE_DIRS}
    )

    # Emscripten compiler flags
    target_compile_options(cse_wasm PRIVATE
        -Wall
        -Wextra
        -Wno-unused-parameter
        -fexceptions
        $<$<CONFIG:Release>:-O3>
        $<$<CONFIG:Release>:-flto>
        $<$<CONFIG:Debug>:-g3>
        $<$<CONFIG:Debug>:-O0>
    )

    # Add definition for Embind with RTTI and bzip2
    target_compile_definitions(cse_wasm PRIVATE
        EMSCRIPTEN_HAS_UNBOUND_TYPE_NAMES=1
        USE_BZIP2_LIB=1
        BZ_NO_STDIO=1
        UNICODE
        _UNICODE
    )

    # Emscripten linker flags for ESM module output
    # Use SHELL: prefix to prevent CMake from mangling the flags
    target_link_options(cse_wasm PRIVATE
        "SHELL:-sEXPORT_ES6=1"
        "SHELL:-sMODULARIZE=1"
        "SHELL:-sEXPORT_NAME=createCSEntryModule"
        "SHELL:-sENVIRONMENT=web"
        "SHELL:-sSINGLE_FILE=0"
        "SHELL:-sALLOW_MEMORY_GROWTH=1"
        "SHELL:-sINITIAL_MEMORY=33554432"
        "SHELL:-sMAXIMUM_MEMORY=536870912"
        "SHELL:-sSTACK_SIZE=1048576"
        "SHELL:-sNO_EXIT_RUNTIME=1"
        "SHELL:-sMALLOC=emmalloc"
        "SHELL:--preload-file \"${CMAKE_CURRENT_SOURCE_DIR}/../cspro-dev/cspro/WASM/Assets\"@/Assets"
        -fexceptions
        --bind
        --no-entry
        $<$<CONFIG:Release>:-O3>
        $<$<CONFIG:Release>:-flto>
        $<$<CONFIG:Release>:--closure=1>
        $<$<CONFIG:Debug>:-g3>
        "SHELL:$<$<CONFIG:Debug>:-sASSERTIONS=2>"
        "SHELL:$<$<CONFIG:Debug>:-sSAFE_HEAP=1>"
        "SHELL:$<$<CONFIG:Debug>:-sSTACK_OVERFLOW_CHECK=2>"
    )

    # Set output name
    set_target_properties(cse_wasm PROPERTIES
        OUTPUT_NAME "cse_wasm"
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/web"
    )

    # Copy web assets to build directory
    add_custom_command(TARGET cse_wasm POST_BUILD
        # Copy main HTML and JS files
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/app.html"
            "${CMAKE_BINARY_DIR}/web/app.html"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/main.js"
            "${CMAKE_BINARY_DIR}/web/main.js"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/styles.css"
            "${CMAKE_BINARY_DIR}/web/styles.css"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/index.html"
            "${CMAKE_BINARY_DIR}/web/index.html"
        # Copy test-load.html
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/test-load.html"
            "${CMAKE_BINARY_DIR}/web/test-load.html"
        # Copy cs-entry-viewer component
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/cs-entry-viewer.js"
            "${CMAKE_BINARY_DIR}/web/cs-entry-viewer.js"
        # Copy other JS files
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/csentry-app.js"
            "${CMAKE_BINARY_DIR}/web/csentry-app.js"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/file-manager.js"
            "${CMAKE_BINARY_DIR}/web/file-manager.js"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/form-renderer.js"
            "${CMAKE_BINARY_DIR}/web/form-renderer.js"
        # Copy runtime
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/web/runtime"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/web/runtime/csentry-runtime.js"
            "${CMAKE_BINARY_DIR}/web/runtime/csentry-runtime.js"
        # Copy components
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/web/components"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_SOURCE_DIR}/web/components"
            "${CMAKE_BINARY_DIR}/web/components"
        COMMENT "Copying web assets to build directory"
    )

    # Installation for WASM build
    install(FILES
        ${CMAKE_BINARY_DIR}/web/cse_wasm.js
        ${CMAKE_BINARY_DIR}/web/cse_wasm.wasm
        ${CMAKE_SOURCE_DIR}/web/app.html
        ${CMAKE_SOURCE_DIR}/web/main.js
        ${CMAKE_SOURCE_DIR}/web/styles.css
        ${CMAKE_SOURCE_DIR}/web/index.html
        DESTINATION web
    )
    
    install(DIRECTORY
        ${CMAKE_SOURCE_DIR}/web/components
        ${CMAKE_SOURCE_DIR}/web/runtime
        DESTINATION web
    )

# ==============================================================================
# Native Build Configuration
# ==============================================================================

else()
    # Static library for native builds
    add_library(cse_engine STATIC
        ${CSE_CORE_SOURCES}
    )

    target_include_directories(cse_engine PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
    )

    # Compiler warnings
    if(MSVC)
        target_compile_options(cse_engine PRIVATE
            /W4
            /WX-
            /permissive-
            /Zc:__cplusplus
        )
    else()
        target_compile_options(cse_engine PRIVATE
            -Wall
            -Wextra
            -Wpedantic
            -Wno-unused-parameter
        )
    endif()

    # Sanitizers (debug builds)
    if(CSE_ENABLE_SANITIZERS AND NOT MSVC)
        target_compile_options(cse_engine PRIVATE
            $<$<CONFIG:Debug>:-fsanitize=address,undefined>
        )
        target_link_options(cse_engine PRIVATE
            $<$<CONFIG:Debug>:-fsanitize=address,undefined>
        )
    endif()

    # Alias target for modern CMake usage
    add_library(CSEntryWeb::Engine ALIAS cse_engine)

    # ==============================================================================
    # Example Programs (Native Only)
    # ==============================================================================

    if(CSE_BUILD_EXAMPLES)
        add_executable(basic_usage
            examples/basic_usage.cpp
        )

        target_link_libraries(basic_usage PRIVATE
            cse_engine
        )

        set_target_properties(basic_usage PROPERTIES
            RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
        )
    endif()

    # ==============================================================================
    # Installation (Native)
    # ==============================================================================

    include(GNUInstallDirs)

    install(TARGETS cse_engine
        EXPORT CSEntryWebTargets
        LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
        ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    )

    install(FILES
        ${CSE_CORE_HEADERS}
        DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/csentryweb
    )

    install(EXPORT CSEntryWebTargets
        FILE CSEntryWebTargets.cmake
        NAMESPACE CSEntryWeb::
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/CSEntryWeb
    )

    # Package configuration
    include(CMakePackageConfigHelpers)

    write_basic_package_version_file(
        ${CMAKE_CURRENT_BINARY_DIR}/CSEntryWebConfigVersion.cmake
        VERSION ${PROJECT_VERSION}
        COMPATIBILITY SameMajorVersion
    )

endif()

# ==============================================================================
# Summary
# ==============================================================================

message(STATUS "")
message(STATUS "CSEntryWeb Configuration Summary:")
message(STATUS "  Version:        ${PROJECT_VERSION}")
message(STATUS "  Build Type:     ${CMAKE_BUILD_TYPE}")
message(STATUS "  WASM Build:     ${CSE_BUILD_WASM}")
message(STATUS "  Build Examples: ${CSE_BUILD_EXAMPLES}")
message(STATUS "  Build Tests:    ${CSE_BUILD_TESTS}")
if(NOT CSE_BUILD_WASM)
    message(STATUS "  Sanitizers:     ${CSE_ENABLE_SANITIZERS}")
endif()
message(STATUS "")
