# Encrypted Backup & Recovery — cryptography, format, limits

**Developer Preview** — not an audited backup standard. No data or passwords are uploaded. Treat backups as sensitive and perform an independently verified real-world restore before trusting them.

## Supported workflow

1. Stop Android Emulator, close app windows and finish background installs/downloads.
2. Open Backup & Restore Center, type a **strong password** (minimum 12 UTF-8 bytes) and repeat it, then choose an external destination folder.
3. The program creates a new uniquely named encrypted directory, verifies its contents and only then renames it out of `.partial`.
4. To inspect, type the password and select an encrypted backup folder. The program authenticates the manifest and **every** encrypted file, checks its SHA-256 and profile identity, then reports target disk requirements. This makes no change to Android data.
5. To restore, type the password again, type `RESTORE`, and accept the native operating system confirmation. The program re-authenticates all files before staging.
6. Files are decrypted **only into same-volume restore staging**. Once authenticated and SHA-256 verified, targets are renamed to `.before-restore` copies and verified staging is promoted. Restart ApkStart.
7. Existing legacy v5 unencrypted directories may be imported as a backward-compatibility path. New exports always use encryption.

## Format

Each encrypted directory contains `header.json`, `manifest.enc`, and `payload/<random 32-hex>.bin` ciphertext files. `header.json` stores the format version, algorithm identifiers, a **random 32-byte KDF salt** and manifest nonce/tag; it does not contain file names or profile identity. The encrypted manifest contains the original profile-bound v5 file list, SHA-256 digests, directory layout, random blob IDs, individual GCM nonces/tags and metadata.

**Key derivation:** Node.js scrypt, `N=32768`, `r=8`, `p=1`, output 32 bytes, random 256-bit salt. Fixed parameters are checked before derivation; untrusted headers cannot request arbitrary work factors. Passwords are never logged or persisted; buffers holding input and derived keys are cleared where possible.

**Authenticated encryption:** AES-256-GCM; a fresh random 96-bit nonce per file and for `manifest.enc`. Authenticated additional data (AAD) separates `manifest` from each random blob ID. The GCM authentication tag is stored in the **encrypted manifest** for each file and the public header for the manifest. The hash of each plaintext file is checked after successful authentication.

**Important distinctions:** The password is the security boundary; the SHA-256 values are extra corruption checks, not signatures or malware scanning. A password cannot be recovered or reset. As with most encrypted archives, total size, number/size of payload files, archive format and folder creation time can leak. The password in a renderer or Node string cannot be guaranteed to be overwritten at the language-runtime level. The program never stores the password in settings or logs.

## Recovery and durability

Preflight tests available free disk space on both backup and restore volumes. Restores use same-volume temporary paths and keep original data in `.before-restore` directories until the user manually decides how to retain it. A failed partial commit attempts rollback. Windows file locking, power loss, unusual filesystems and multi-volume rename failures are **not** guaranteed atomic; retain a second independent backup.

Path traversal, symlinks, special files, unexpected/missing files, modified encrypted metadata, wrong passwords, conflicting Android profile IDs and active VMs fail closed. Legacy unencrypted backups remain unauthenticated (SHA-256 only) and should come from trusted storage. Neither shared emulator SDK/system images nor global settings/legacy QEMU disks are included, as with v5.

Large AVDs can be many gigabytes and may require at least one full extra copy of free disk space for backup and restore. The new format is a directory, **not ZIP**, and no compression is promised. New encrypted backups have not undergone independent review, fuzzing or a full real-Windows guest restore.

## Tests

Run `npm run test:international`. `test/encrypted-backup.test.cjs` covers authenticated round trip, wrong-password rejection, metadata/file tampering, path safety, profile isolation and idle-runtime restrictions. Windows CI smoke uses only a randomly generated synthetic password and test files; it never restores over a real user's Android profile.
