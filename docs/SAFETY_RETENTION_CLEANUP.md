# Safety Vault Retention & Cleanup — Feature #10 (developer preview)

This feature adds a **read-only, profile-scoped storage inventory** and a manually approved way to remove an *old local plaintext safety point* **only after matching and authenticating a complete AES-256-GCM encrypted Safety Vault archive**. It does not change the behavior of backups, restores, Windows migrations, Android provisioning or automatic startup.

## 1. Inspect storage usage — no deletion

1. Stop Android and close app windows, installs and downloads.
2. Open **Backup Center → Retention & Cleanup tools**.
3. Set the advisory age threshold between 1 and 3650 days (default: 30) and choose **Inspect storage usage**.
4. The application lists the current Android Profile's recognized `.before-restore` and `.before-recovery` points with file counts, approximate byte totals, age and whether they exceed the threshold. It separately inventories encrypted `ASI-Sealed-...` archives.

This inspection uses file metadata and counts only. **It does not authenticate encrypted archives**, does not delete anything, does not set a background job, and never changes any retention policy automatically. An archive is eligible to support cleanup **only after a separate password-protected, full verification**.

## 2. Verify a proposed plaintext cleanup

1. Click **Find local recovery points** and select the exact plaintext safety point.
2. Click **Find encrypted Safety Vault archives** and choose its matching encrypted copy. You can create a sealed copy first with **Encrypt selected safety point**.
3. Open **Retention & Cleanup tools**, enter the encrypted copy's password and select **Authenticate selected plaintext point against selected encrypted archive**.
4. The main process strictly validates both local, profile-scoped identifiers. It authenticates the encrypted manifest and **every ciphertext** with AES-256-GCM, then rehashes and inventories all plaintext files.
5. Preview is available only when the encrypted manifest includes the **same originating safety point ID** and an exact match for profile ID, AVD name, file names, component list, directories, SHA-256s, file sizes and total bytes.
6. A cryptographically random, single-use cleanup token (valid up to 10 minutes) is issued. **The preview does not delete or move files.** The password and encryption key are not retained in the preview token.

A wrong password, tampered ciphertext, incomplete sealed archive, partial plaintext point, mismatched AVD/profile, unsafe path, symlink/junction, or modified contents blocks cleanup.

## 3. Approve actual cleanup

1. Re-enter the password after the preview.
2. Type **DELETE PLAINTEXT** exactly in the confirmation prompt, and separately approve the second renderer warning.
3. The Electron **main process** also checks the typed acknowledgement and token, then displays a separate native Windows warning dialog with **Cancel as the default**.
4. Only after native approval, the backend consumes the one-time token, rechecks idle Android runtime, active profile, decrypted archive authenticity and the full plaintext-file SHA-256 inventory.
5. The application moves *only* the selected safety-point component paths into new, sibling `.cleanup-pending` staging paths. It **rehashes those isolated components again before any unlink**.
6. The application then deletes the selected quarantined plaintext component paths. Its response reports **estimated** bytes removed. On a pre-deletion failure, renames are rolled back. On an interruption after deleting begins, remaining `.cleanup-pending` folders may require manual examination.

**Always verify the encrypted archive password and that you can restore it before electing to remove plaintext copies.** Cleanup never deletes the encrypted archive, unrelated recovery points, active Android Profile files, runtime binaries, AVD images, user settings or data from another profile. There is no action to remove sealed archives in this feature.

## Threat model, limits and privacy

- **Deleting plaintext is irreversible** without restoring from a usable encrypted copy and password. It does **not** securely erase data from an SSD, Windows filesystem, shadow copy, recycle bin, synchronization provider or disk backup. Do not advertise it as forensic sanitization.
- Other copies of sensitive information can remain, including active AVD userdata, caches, snapshots, old backups or storage-level snapshots. This only removes the explicitly selected safety-copy paths.
- Authentication protects against accidental corruption and offline ciphertext tampering. It cannot protect against a compromised running OS, theft of the password, or a malicious process with access to writable backups and memory.
- A cleanup spanning multiple component paths is not transactionally atomic. A power cut, process crash or antivirus lock after deletion begins may leave parts of the plaintext point in `.cleanup-pending` paths. The encrypted archive must remain preserved. There is intentionally **no automatic cleanup of interrupted fragments**.
- The age threshold is a read-only **recommendation**. There is no automatically scheduled cleanup, default deletion, forced archive expiry or silently enforced storage quota.
- File counting checks for Windows-incompatible names, unsupported file types and links, but as with most filesystem operations, externally writable paths can have race conditions. Testing on actual Windows 10/11 disks, antivirus software and multi-GB Android 14 AVD states remains a release blocker.

## CI and manual release checklist

Windows Node 20/22 runs `test/safety-retention.test.cjs` alongside the previous backup, encrypted archive, migration and Recovery Vault suites. The Electron Windows Developer Preview smoke fixture creates only synthetic local records, verifies a sealed archive, draws the retention report and authenticated cleanup **preview**, and asserts the plaintext source and archive still exist. **CI never invokes actual deletion**.

For release testing, validate a full encrypted restore of a real Android Profile, interruption/reboot while cleaning multiple components, recovery of `.cleanup-pending` data, filesystem ACL failures, missing passwords and disk-space pressure. Keep pull request #1 **Draft** and `main` unchanged until those checks pass.
