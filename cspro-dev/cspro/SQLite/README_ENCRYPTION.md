# SQLite Encryption Setup

This build uses **SQLite3 Multiple Ciphers** (https://github.com/utelle/SQLite3MultipleCiphers) 
to provide open-source encryption for CSDBE files, replacing the proprietary SEE extension.

## Current Configuration

- **Version**: SQLite3 Multiple Ciphers 2.2.5 (based on SQLite 3.51.0)
- **Default Cipher**: ChaCha20-Poly1305 (fast, secure, AEAD)
- **Available Ciphers**: ChaCha20, AES-128-CBC, AES-256-CBC

## Files Changed

1. `external/SQLite/sqlite3.c` - Replaced with `sqlite3mc_amalgamation.c`
2. `external/SQLite/sqlite3.h` - Replaced with `sqlite3mc_amalgamation.h`
3. `SQLite/Encryption.h` - Simplified to directly call encryption functions
4. `SQLite/CMakeLists.txt` - Updated compile definitions

## Backup Files

Original SQLite files are preserved as:
- `external/SQLite/sqlite3_original.c`
- `external/SQLite/sqlite3_original.h`

## Rebuilding

After these changes, rebuild the CSPro project. The `SqliteEncryption` namespace 
in `Encryption.h` now directly calls the encryption functions provided by SQLite3 
Multiple Ciphers.

## Usage

CSDBE files can now be created and opened with encryption:
- `sqlite3_key(db, password, length)` - Set key when opening database
- `sqlite3_rekey(db, password, length)` - Change key on existing database
- `sqlite3_rekey(db, nullptr, 0)` - Remove encryption (decrypt)

## Cipher Options

To change the default cipher, modify `CMakeLists.txt`:
```cmake
CODEC_TYPE=CODEC_TYPE_CHACHA20    # ChaCha20-Poly1305 (default, recommended)
CODEC_TYPE=CODEC_TYPE_AES128      # AES-128-CBC
CODEC_TYPE=CODEC_TYPE_AES256      # AES-256-CBC
```

## Notes

- The encryption is transparent to the application code
- Encrypted databases are not compatible with standard SQLite
- If reverting to standard SQLite, restore the original files and update CMakeLists.txt
