project(SQLite)

include(../WASM/Definitions.cmake)

# SQLite3 Multiple Ciphers Configuration
# https://github.com/utelle/SQLite3MultipleCiphers
# Provides open-source encryption supporting multiple cipher schemes
add_compile_definitions(
    SQLITE_TEMP_STORE=3
    # Enable encryption support
    SQLITE_HAS_CODEC=1
    # Use ChaCha20-Poly1305 as default cipher (fast, secure, no padding issues)
    CODEC_TYPE=CODEC_TYPE_CHACHA20
    HAVE_CIPHER_CHACHA20=1
    HAVE_CIPHER_AES_128_CBC=1
    HAVE_CIPHER_AES_256_CBC=1
    # SQLite3MC specific options
    SQLITE3MC_SECURE_MEMORY=0
    SQLITE_ENABLE_COLUMN_METADATA=1
    SQLITE_ENABLE_FTS5=1
    SQLITE_ENABLE_JSON1=1
    SQLITE_ENABLE_RTREE=1
    SQLITE_ENABLE_GEOPOLY=1
)

include_directories(${PROJECT_NAME} PUBLIC
    ${EXTERNAL_DIRECTORY}
)

add_library(${PROJECT_NAME} 
    "SQLiteHelpers.cpp"

    "${EXTERNAL_DIRECTORY}/SQLite/sqlite3.c"
)
