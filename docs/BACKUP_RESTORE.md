# Backup & Restore Center — security, scope and recovery

**Status:** Developer Preview. The snapshot is a **directory** named `ASI-Backup-<id>-<date>-<random>`, not a compressed archive. No app telemetry or backup contents are uploaded.

## What is backed up

| Component | Source | Target inside snapshot |
|---|---|---|
| APK catalog | Active profile `apps.json` | `apps.json` |
| APK caches | Active profile `apks/` | `apks/` |
| Icons | Active profile `icons/` | `icons/` |
| Android user data | Active profile `<AVD_NAME>.avd/`, including userdata and snapshots | `avd/` |

Default profile keeps legacy paths and `apkstart.avd`. Secondary profiles have their own AVD folders. Shared Android Emulator SDK executables/system images and shared `settings.json` are **not included**. External legacy QEMU/ISO `android.qcow2` disks are **not** covered: use an independently verified full-disk backup for them.

Backups are tied to the exact **profile ID**, not the display name. The app deliberately refuses cross-profile restore. The standalone profile registry (`profiles.json`) is not replaced by restore; keep a trusted backup of it if transferring to another PC.

## Safe workflow

1. Close APK windows. In Settings choose **Stop Runtime**. Wait for installs/downloads to finish; ensure no detached emulator is active.
2. Expand **Backup & Restore Center**, select **Create verified backup** and choose a destination outside ApkStart's data directory. An `.partial` folder is used until the SHA-256 manifest and all files verify; an incomplete result is never advertised as finished.
3. Copy the finished snapshot folder to a private storage device, preferably an **encrypted volume**. Do not remove `manifest.json`.
4. To restore, activate the original matching profile, stop Android, select **Inspect a backup**, and verify every file. The UI displays size, components and available space.
5. Read the warning, type **RESTORE**, and confirm. The server consumes a short-lived one-time approval token, checks profile identity and space again, copies into same-volume staging paths, verifies SHA-256 and only then renames targets.
6. Existing files and AVD folders are preserved alongside their old locations as `.asi-*.before-restore` safety copies. Restart ApkStart before launching Android. Check app logins/data carefully. **No automatic removal of safety copies** occurs.

## Threat model and limitations

- Manifest SHA-256 catches corruption or accidental changes; it is **not a digital signature**. Someone able to edit both backup data and the manifest can forge it. Only use snapshots from trusted storage.
- Backups are **not encrypted** and may include private Android user data, sign-in tokens, messages and passwords. Use OS full-disk encryption or encrypted external storage.
- Directory traversal, symlinks/junctions, special files, unsafe Windows filenames, duplicates, extra/missing files and mismatched profile IDs are rejected. Snapshot paths are fixed by the app, not supplied by the renderer.
- Preflight checks free space for export and for restoring each target volume. Windows may still run out of space or have locked files mid-operation; staging protects the original from pre-commit failure.
- Only one profile/Android instance can be active. No live guest snapshots; offline VM required. No automatic cross-machine ID remapping or AVD image conversion.
- Restore is per-component rename, **not a multi-volume atomic filesystem transaction**. On failure it attempts rollback and retains safety copies for manual recovery if rollback cannot complete.
- Large AVDs can be several GB; backup creation, verification and restore can take time and need significant extra free space.
- Unencrypted snapshots must not be placed in public file-sync folders or committed to GitHub.

## Verification

Run `node --test test/backup-center.test.cjs`. CI includes Windows Node 20/22 regression tests, Electron packaging and a host-only UI smoke test that creates/verifies a synthetic profile backup without restoring any Android data. Verify real Windows AVD snapshots and same-profile recovery manually before removing Draft status from the PR.
