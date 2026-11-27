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
| Install and Profile ownership | The [Android 14 Linux/KVM run](https://github.com/alexanderajohn/apkstart-international/actions/runs/45868894879/job/140078832329) passed all 21 phases with two signed standalone APKs and targeted five-part APKS/XAPK archives in isolated Profiles. Android denied the notification permission after the harness selected the system denial control. A [Windows Server 2025/WHPX run](https://github.com/alexanderajohn/apkstart-international/actions/runs/45662257650/job/139374911637) installed and launched signed splits. | Reproduce the full sequence on Windows 10/11, including low disk space, interrupted commit and unrelated emulators. |
| Packaged Windows desktop | On Windows Server 2025, the [packaged API Demos run](https://github.com/alexanderajohn/apkstart-international/actions/runs/45934725508/job/140295184572) verified native approval, installation, package path and the generated Profile-qualified shortcut. Opening that shortcut displayed a visible launcher-owned window with the installed app title. Android reported `io.appium.android.apis/.ApiDemos` as its top resumed Activity. Removing the APK association restored the prior handler. [Desktop evidence JSON](https://github.com/alexanderajohn/apkstart-international/actions/runs/45934725508/artifacts/15169689761). | Repeat across physical Windows 10/11 desktops and drivers, including actual content, minimize/maximize, fullscreen and relaunch. |
| Startup and performance | A [hosted Android 14 guest](https://github.com/alexanderajohn/apkstart-international/actions/runs/45868894879/artifacts/15143110576) resumed a saved Quick Boot snapshot. Its kernel boot ID and app-private canary matched, and the apps relaunched. | Windows cold and Quick Boot, crash/restart and multi-hour soak across Intel/AMD and different GPU paths. |
| Backup and migration | The same Linux run encrypted and restored 1,207,689,111 bytes across 33 files and retained four displaced components. A [Windows guest](https://github.com/alexanderajohn/apkstart-international/actions/runs/45868894879/job/140078832355) produced a 4,057,523,541-byte encrypted backup of 38 files. That run stopped short of verified Windows recovery. | Verify a bootable multi-GB Windows restore, off-host migration with snapshots and recovery from physical power interruption. |
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
