# Recovery Vault & Safe Rollback (developer preview)

Feature #8 adds an **offline, local safety-copy browser** and a carefully confirmed recovery workflow after encrypted restore or cross-machine migration. It complements Backup & Restore Center rather than replacing the encrypted archive format.

## Which recovery points are visible?

The vault searches only the **currently active Android profile's four fixed component destinations** (`apps.json`, APK cache, icons, AVD userdata) for app-created safety names:

- `<target>.asi-<20 hex chars>.before-restore` — the prior data retained by encrypted / legacy restore or portable migration.
- `<target>.asi-<20 hex chars>.before-recovery` — the data retained when a Recovery Vault rollback itself ran.

Components with the same transaction ID and safety-copy type are grouped into one point. A point can contain fewer than four components; only components actually saved are restored. The Default profile and secondary profiles are isolated by the existing profile registry. The UI and IPC **do not allow arbitrary paths**, profile IDs or component names as recovery destinations.

## Recovery workflow

1. Stop Android; close app windows and active installation, download, update and guest tasks.
2. Open Backup Center → **Find local recovery points** → choose a point → **Verify selected recovery point**.
3. The program checks local file types, rejects symlinks/junctions and unsafe paths, inventories component files, hashes them with SHA-256 and checks free space on each destination drive. It shows a short-lived, single-use preview token valid for 10 minutes, plus the affected components, file count and size.
4. Type **RECOVER** and approve the renderer confirmation. The Electron main process also checks the `RECOVER` acknowledgement and shows a separate native warning dialog (default **Cancel**).
5. At commit time, the program confirms the Android runtime remains stopped, the active profile is unchanged and the recovery point hashes still match the preview.
6. Every recovered component is first copied to a new temporary stage on the same volume. Each staged file is rehashed; live data is not changed until **all** stages have passed.
7. Existing live components are renamed to fresh `.before-recovery` copies, then the verified staged data is switched into place. The selected source recovery point is **never removed**; current data gets its own independent safety copies.
8. Restart ApkStart after successful recovery. The new `.before-recovery` point can be inspected to undo the recovery later.

The operation does not invoke emulator deletion, `pm clear`, reinstall, auto-start or cloud networking. It does not delete recovery points or force-clean old data.

## Security properties and explicit limits

- `.before-restore` and `.before-recovery` safety copies are **local plaintext files, NOT encrypted backup archives**. They can contain APKs, tokens, login state and Android userdata. Protect disk access; move or back up private information using the encrypted backup center if needed.
- SHA-256 here detects data changes between verification and application; it does **not establish origin or defend against an attacker able to modify the local safety copy before inspection**. Do not treat locally named files as signed/authentic backups.
- If a safety point is incomplete or corrupted, recovery blocks when its consistency check fails. Existing current data is never deliberately destroyed.
- Recovery uses per-component rename and best-effort reverse rollback. **Windows filesystem failure, power loss or reboot during the multi-component swap is not atomic**. On incomplete rollback the program retains staging and safety paths instead of trying to delete them. Expert manual repair may still be necessary.
- Recovery creates additional on-disk copies, potentially many gigabytes. Free-space preflight is necessary; running out of storage mid-copy still causes an abort before the swap.
- File paths and point IDs are local, not transferable backups. This does not independently prove a rescued AVD can boot on another machine; Android account data, hardware-bound keys and snapshots still need real Windows/Android testing.
- There is no automatic retention cleanup or hidden overwrite/delete action, by design.

## Verification

`test/recovery-vault.test.cjs` exercises profile isolation, discovery, integrity/size preflight, source-preserving rollback, undo via `.before-recovery`, expiry/single-use tokens, symlink refusal, mutations between preview/commit, running-Android refusal and UI/native acknowledgement. Windows CI runs Node.js 20/22, then packages an Electron portable preview and shows a **synthetic, read-only Recovery Vault preview** in a smoke screenshot. It does not recover real AVD data inside CI.

**Release blocker:** Manual Windows 10/11 testing using large, real encrypted-backup restorations and migrations, AVD snapshots, interrupted copies and realistic disk pressure. Keep PR #1 **Draft**; do not merge `main` on the strength of synthetic CI alone.
