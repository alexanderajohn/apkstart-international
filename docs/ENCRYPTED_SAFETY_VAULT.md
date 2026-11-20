# Encrypted Safety Vault — feature #9 (developer preview)

Encrypted Safety Vault lets a user copy an existing local Recovery Vault point into an **AES-256-GCM password-encrypted, authenticated directory** without opening the Android runtime or exporting a new plaintext snapshot. It reuses the Encrypted Backup & Recovery format and the same scrypt settings (N=32768, r=8, p=1, random 256-bit salt, fresh per-file 96-bit GCM nonce) and stores the file list, point provenance and SHA-256 records **inside the encrypted manifest**.

## User workflow

1. Stop Android. In Backup Center, use **Find local recovery points** and select a `.before-restore` or `.before-recovery` safety point.
2. Enter a strong password (12–1024 UTF-8 bytes), repeat it, click **Encrypt selected safety point**, and type `SEAL`. The native OS dialog defaults to Cancel and explains the original plaintext is not removed.
3. The app inventories only the selected profile's fixed component safety copies, hashes and checks their contents, rejects symlinks/junctions, checks free disk space, then encrypts the files directly as streams into an unpublished `.partial` directory.
4. Every ciphertext is authenticated and every plaintext SHA-256 must match the inspected point before the new archive is published by a final rename.
5. Find sealed points through **Find encrypted Safety Vault archives** (profile-isolated, no arbitrary renderer file paths), enter the password, and **Authenticate and preview sealed point**.
6. To recover from a sealed point, reenter the password, type `RESTORE`, confirm the renderer dialog, and approve the native restore dialog. The existing encrypted restore engine verifies the complete archive again, checks space and identity, stages the decrypted content in temporary per-target paths, retains the current live files in `.before-restore` safety copies and requires an application restart.

**Passwords and derived keys are not saved or logged by this feature.** There is no password recovery mechanism. Losing the password makes the sealed archive inaccessible.

## Storage and safety boundaries

- Only the current profile's safety copies may be sealed. A generated encrypted directory is placed under `DATA_DIR/safety-vault/<profile-id>/ASI-Sealed-YYYY-MM-DD-<random>`; its `header.json` is unencrypted, while `manifest.enc` and randomly named `payload/*.bin` files are encrypted. Profile ID in the folder path, directory names, ciphertext sizes and creation times may be observable.
- The target folder is strictly constrained to the application's own local Safety Vault path. The normal Backup Center **still refuses** to export plaintext or encrypted backups inside the application data folder. Symlinks/junctions and overlapping live profile destinations are rejected.
- The restore path accepts an encrypted local point only if it belongs to the currently active profile and is found under its verified vault folder. No arbitrary path or profile ID is accepted from the renderer.
- A sealed point may contain only a subset of components. Restoration replaces only components represented in the authenticated archive.
- **Privacy limitation:** The original `.before-restore`/`.before-recovery` directories are intentionally left untouched. This feature creates an encrypted *copy*, **not** an automatic conversion that erases existing plaintext. The originals remain unencrypted and can still expose private Android data to anyone with local disk access. The user must manage the original files separately after ensuring that the encrypted copy is usable. Secure deletion cannot be guaranteed on SSDs and Windows filesystems, and no deletion UI is implemented.
- Existing caches, credentials and guest userdata may have other plaintext copies outside Safety Vault, including the active AVD. The vault is not whole-disk encryption.
- Cryptography has not undergone independent audit. A compromised local OS or process with permission to alter files and/or read a password can bypass protections. Multi-component recovery is not crash-atomic; interruption or file locks may require expert manual repair.

## Verification

The Windows Node 20/22 CI suite checks encrypted-only archive creation, ciphertext tampering, wrong passwords, profile scoping, unsafe IDs, source preservation and restoring sealed archives with a secondary safety copy. A Windows portable preview smoke fixture seals a small synthetic recovery point, authenticates it and renders its read-only preview; **no actual restore or profile migration is executed in CI**.

The feature is a **developer preview**, not a production security guarantee. Real multi-GB Android 14 AVD backups/restores, unclean shutdowns and Windows 10/11 filesystem/antivirus interactions remain release blockers. Keep PR #1 Draft and `main` unchanged.
