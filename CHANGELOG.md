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