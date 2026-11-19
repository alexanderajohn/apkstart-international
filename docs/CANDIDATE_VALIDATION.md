# Windows 1.0 candidate evaluation

**Release Blocked.** The candidate identifies itself as `1.0.0-rc.1`. This is an unsigned evaluation of the fork. The latest verified build links and revision IDs are in [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md).

## Install the evaluation build

1. Use the linked CI run for the exact revision. Download either the Windows Portable artifact or the Windows Setup artifact. Extract the ZIP to a new folder. Keep an offline backup of any existing ApkStart Profile and its AVD.
2. For Portable, keep all files together and open `ApkStart International.exe`. For Setup, compare the EXE's SHA-256 from `Get-FileHash -Algorithm SHA256 .\ApkStart-International-1.0.0-rc.1-Setup.exe` with `SHA256SUMS` before starting the installer. The GitHub run records the archive digest. The EXE is unsigned.
3. For an Android trial, use a Windows x64 test machine with hardware virtualization and a disposable Profile. Obtain the SDK and system image under their applicable terms. Record the runtime build, GPU driver, CPU, Hyper-V/WHPX configuration and signed fixture APK digest. Follow [LIVE_ANDROID_VALIDATION.md](LIVE_ANDROID_VALIDATION.md).
4. Quit the guest and ApkStart before changing versions. Keep the previous verified Setup and an offline Profile backup. The CI rollback exercise switches application binaries while checking disposable catalog and userdata files. Real AVD rollback compatibility requires separate validation.

## Candidate quality gates

| Gate | Evidence collected by the project | Evidence required for Stable |
| --- | --- | --- |
| Windows tests and binaries | Exact revision, two Windows Node versions, packaged UI smoke, Windows Portable and Setup artifacts in CI. The candidate workflow inventories every portable file and verifies the listing again. | Successful candidate run, signed binaries, reproducible distribution procedure and manual Windows 10/11 desktop tests. |
| Install and profile ownership | Parsed and staged 1,668,276 bytes from the imported PinyinIME APK. Google Build Tools 35.0.0 apksigner verified its v1 and v2 signatures. Package identity, version, digest and cleanup passed on the host. Package-manager sessions, guest identity checks and injected failures have separate tests. | Actual signed APK, APKS and XAPK on Android 14, storage exhaustion, interruption at commit, two Profiles across restart and unrelated emulators. |
| Startup and performance | Benchmark records individual launch timings after one warm-up. | Repeat cold boot, Quick Boot, crash/restart and multi-hour soak on Intel/AMD and different GPU paths. No comparative speed measurement is available. |
| Backup and migration | Plain/encrypted fixture restore, target-specific config, read-back digests, journal and rollback. | Off-host migration and restore of a bootable multi-GB AVD. Verify an app-private canary after Android restart and physical power interruption. |
| International UX | EN/VI/ZH catalog checks and selected packaged controls. | Complete wizard, error, scaling and keyboard workflows in all three languages. |
| Security and distribution | Scoped IPC, SDK checksum verification, dependency inventory and offline signature verification. | Release key custody, actual signed rollback, third-party notices and redistribution review. Independent audit has not occurred. |

## Comparison with the imported upstream release

Comparison point is RoutineMiku/apkstart v0.5.7, commit `c5ee14be9ce75e05761a537c4286688fcdb7a7de`. It describes changes visible in the two source trees.

| Area | Imported upstream | International candidate |
| --- | --- | --- |
| Windows launcher | Electron desktop, emulator provisioning, per-app windows and shortcuts | Retains launcher architecture, adds Profile-qualified links and serializes window attachment |
| Install | APK and split installation through ADB and local cache | Explicit approval, immutable staged payloads and per-part digests, guest/package checks before commit |
| User data | Shared application data and default AVD | Named Profiles, encrypted backup, staged restore, migration and retained originals |
| Internationalization | Chinese-first launcher and documentation | EN/VI/ZH catalogs and language selection, with remaining untranslated flows tracked |
| Distribution | Upstream Windows packaging and update identity | Separate product identity, unsigned CI evaluation packages, disabled automatic replacement and offline verification |

No comparative hardware test has established a speed or compatibility advantage over upstream.
