#pragma once

#include <external/SQLite/sqlite3.h>

// --------------------------------------------------------------------------
// SqliteEncryption
//
// Replaced proprietary SEE with open-source encryption (e.g., SQLite3 Multiple Ciphers).
// This build assumes SQLITE_HAS_CODEC is defined and the underlying sqlite3 library
// supports encryption.
// --------------------------------------------------------------------------

namespace SqliteEncryption
{
    constexpr bool IsEnabled()
    {
        return true;
    }

    inline int sqlite3_key(sqlite3* db, const void* pKey, int nKey)
    {
        return ::sqlite3_key(db, pKey, nKey);
    }

    inline int sqlite3_rekey(sqlite3* db, const void* pKey, int nKey)
    {
        return ::sqlite3_rekey(db, pKey, nKey);
    }
}
