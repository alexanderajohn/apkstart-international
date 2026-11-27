## 1.0.0-rc.1 · Unreleased

- Verify approved APK and split payloads in private staging and stream verified bytes into an Android package-manager session.
- Bind desktop launches, ADB connections and emulator reuse to the selected Profile. Preserve previous installations, userdata and snapshots during recovery and runtime cleanup.
- Add hosted Android 14 tests on Windows Server/WHPX and Linux/KVM for signed APKs, split packages, app-private persistence, encrypted restore and Quick Boot. Physical Windows 10/11 validation is pending.
- Scope shared folders to the selected Profile, verify transfers against the running guest and retain conflicting files. Localize the app window controls and preserve the running guest while waiting for Android to authorize ADB.
- Share concurrent Android Emulator version checks, retry a timed-out version probe once and report missing SDK components separately.
- Bind imported APK cache and icon paths to the destination Profile and clear source-machine shortcut paths. Support AVDs whose platform target is recorded in the SDK descriptor.
- Verify plain and encrypted restores after the final renames. Persist an interruption journal, preserve original data and roll back failed verification.
- Add Windows Setup lifecycle tests, a portable inventory, dependency SBOM and offline release-manifest verification. Keep production distribution gated.
- Extend three-language settings coverage and pin Electron 45.3.4. See the [quality gates](docs/CANDIDATE_VALIDATION.md) for the current release decision.

## Unreleased — Encrypted Backup & Recovery

- Export authenticated, encrypted-by-default Android profile snapshots with scrypt-derived AES-256-GCM keys and per-file random 96-bit nonces.
- Encrypt the sensitive backup manifest, including relative paths, file hashes and Android profile identity; only minimal KDF/cipher header metadata is public.
- Restore only after successful password authentication, file hash verification, profile identity checks, capacity preflight and explicit user + native OS approval.
- Keep legacy unencrypted v5 backup import; never generate new plaintext backup directories from the UI.
- Preserve active userdata as .before-restore copies and recover from failed staging/renames where possible.
- Test encryption round trips, wrong passwords, tampering, cross-profile refusal, runtime safety and Windows UI smoke.

## Unreleased — Backup & Restore Center

- Offline per-profile directory snapshots with SHA-256 manifest and source-path allowlisting.
- Restore preflight verifies files and destination free space; a one-time preview token and typed consent are required.
- Stage and verify data before atomic per-component rename; preserve replaced originals as safety copies, with rollback on errors.
- Block Android runtime launches, app installs and profile switching during backup/restore.
- Add tri-lingual Backup Center UI, progress and restart action; Windows CI smoke verifies the preview without restoring guest data.
- Backup format is an unencrypted directory (not ZIP); cross-profile migration and full Android guest runtime hardware validation remain release blockers.

## Unreleased — Android Profiles (isolated guests)

- Preserve Default's existing AVD and app library without migration or deletion.
- Add unique per-profile Android AVD names/guest userdata directories and APK/icon/catalog files; keep Android SDK binaries shared.
- Add EN/VI/ZH create/list/switch interface and restart-only, explicit-switch IPC with runtime-busy checks.
- Prevent cross-profile adoption of already-running emulators and disable unqualified desktop shortcuts for secondary profiles.
- Add data-isolation regression tests and Windows UI smoke coverage; real Android runtime switching remains a manual release gate.

## Unreleased — Smart Performance Engine

- Add opt-in local host CPU/RAM sampling and private-runtime emulator CPU/working-set metrics (when available).
- Estimate recent app frame-completion rate with Android gfxinfo; never fabricate unavailable FPS or GPU utilization.
- Add explainable, conservative performance recommendations based on measured resource pressure.
- Save allowlisted per-APK scheduling presets; apply on the next app launch without resetting Android or changing shared VM memory/cores.
- Add EN/VI/ZH Performance Center, privacy copy, synthetic tests and Windows UI smoke coverage.

## Unreleased — Android Auto-Repair 2.0

- Add read-only troubleshooting for GPU, Hypervisor, ADB, Quick Boot snapshots, missing runtime components and common boot errors.
- Add user-approved, allowlisted safe recovery: software GPU and Quick Boot preferences for next launch; ADB reconnect on isolated port 5044 only.
- Add EN/VI/ZH guidance and prevent the old bulk Fix All button from chaining administrator prompts/downloads/cleanup operations.
- Add regression tests for approvals, server allowlisting, ADB isolation and no automatic Android app-data deletion.

## Unreleased — SmartCheck pre-install APK analysis

- Read Android API requirements, native ABIs, requested permissions, signer-file presence and streaming SHA-256 locally before installation.
- Show EN/VI/ZH review and require consent for GUI picker and drag/drop imports.
- Block minSdk newer than Android 14 by default. Warn about old target SDKs, sensitive permissions and ARM translation requirements.
- Add offline regression coverage and clearly document split-format, signing and runtime-compatibility limits.

## Unreleased — privacy-aware diagnostic report

- Export local-only diagnostic reports with best-effort redaction of common credentials, email addresses and user paths.
- Keep error codes and runtime configuration useful for troubleshooting.
- Add EN/VI/ZH export labels, explicit review warning and regression tests.

## Unreleased — international foundation

- Default Android app permissions to user consent; optional runtime-grant setting.
- Preserve installed app data on repeated startup failures.
- Temporarily disable unverified automatic executable updates.
- Expand English and Vietnamese UI catalogs, including dynamic app status messages.
- Make the app-data deletion confirmation localizable.
- Add automated regression coverage for localization and safety.

# Changelog

All notable changes to the **independent ApkStart International fork** are documented here.

## [0.1.0-beta.1] — Unreleased (source foundation)

### Added
- Internationalization adapter for dynamic renderer text with persistent English, Vietnamese, and Simplified Chinese selection.
- Initial translation catalogs, build script and localization unit tests.
- Fork product metadata, independent GitHub URL substitutions, and app ID.
- Static audit, automated GitHub Actions checks, attribution and contributor documentation.

### Changed
- Disabled inherited Microsoft Store packaging commands and archived upstream release workflows.
- Preserved original README and license for provenance.

### Not yet done
- Verified Windows/QEMU build, complete translations, fully independent branding and binary release.