# Pass 19 — APK Installation & Profile Isolation Hardening

Status: **Developer Preview**, not proven on a physical Windows Android 14 runtime. This pass prioritizes safely installing and launching apps, protecting the selected Android Profile, and making persistence failures visible instead of masking them.

## One installation approval for every entry point

The renderer (GUI picker or drag-and-drop) already offers a SmartCheck review. **All entries now pass through a second, mandatory native Windows approval owned by the main process:** GUI/IPC, Windows Explorer's .apk association, drag/drop and command-line .apk/.apks/.xapk. The confirmation shows the app package when static inspection is possible, active Profile, file name, SHA-256 fingerprint, compatibility, and whether this may update an existing app. **Cancel is the default.**

Before approval, main inspects the APK without starting Android, refuses symlinked source files and unsupported extensions, and blocks known Android 14 minSdk incompatibility. It rechecks the profile, file metadata and SHA-256 immediately before beginning installation. For split bundles where the manifest is not inspected at preflight, the warning explicitly says package identity is unknown. Static signature evidence is **not** cryptographic verification of APK signing; unsigned or malicious APKs may still need to be rejected by Android or an independent security product.

After a canceled native prompt, the UI clears its progress message and does not report a successful installation.

**Remaining TOCTOU caveat:** a separate process with write permissions could mutate the source after the final hash check while the installer is reading it. This does not claim immutable file-descriptor binding or defeat arbitrary local administrators. Release hardening still needs safe source staging and junction/reparse-point race tests on NTFS.

## Profile-bound guest access

Before Android app installation or launch, the code reads the **current Profile ID**, requires authorized ADB device state from `adb devices` (not `adb get-state`), checks the emulator's live AVD name against `apkstart` (Default) or `apkstart_<id>` (secondary), and checks the selected Profile again. A mismatching, unauthorized, offline or unidentifiable AVD is refused. Legacy QEMU mode is accepted **only for Default** when explicitly identified as the builtin backend.

On installation, the installer repeats guest/Profile checks after any compatibility-image switch and requires `adb shell pm path <package>` to confirm the package is present **before adding it to the selected Profile's apps.json catalog**. During an installation, the profile switch IPC continues to block switching until the installation finishes. Launches also refuse package IDs that do not exist in the selected Profile's catalog, preventing bare `--launch` / stale shortcuts from targeting another Profile.

The secondary Profile still does not create unqualified Windows shortcuts. AVD/profile validation does not make the Android emulator a security boundary against privileged adversaries; an admin who controls the SDK, emulator binaries or guest can spoof responses.

## Persistence and live-device verification

Existing Android app data and current APKs are not cleared during these checks. The installer still uses Android's update flow, which may preserve guest application data, subject to Android package signing and version restrictions. A successful ADB package-manager query is **not** proof of persistence across an actual reboot or snapshot restore.

For a real Windows 10/11 test host, follow `docs/LIVE_ANDROID_VALIDATION.md`. Use a freshly created **disposable secondary Profile**, a signed harmless test APK, and:
- `npm run test:runtime:live -- --readiness` to validate a running Android 14 guest and the expected AVD name.
- `--install-launch` only with the exact `ASI_E2E_DISPOSABLE_ACK` environment variable and package/manifest identity, never on Default or over an installed package.
- Stop/restart the **same** Profile normally, then run `--verify-existing` and inspect whether the app's own saved state remains intact.
- Switch to a **different disposable** Profile with Android stopped and run `--assert-absent` for the test package, then return and verify the original still exists.

The runner never clears, uninstalls, migrates or switches Profiles itself. If a signed test app has no persistent-data canary, manual inspection is required. Synthetic APK ZIP fixtures in CI are **not** real Android-installable APKs.

## Automated checks and remaining release blockers

Windows Node 20 and 22 run:
- `test/apk-install-guard.test.cjs`: approval/identity/compatibility, SHA changes, symlink refusal.
- `test/profile-runtime-guard.test.cjs`: exact AVD, authorization, changed Profile, legacy default-only QEMU.
- `test/adb-authentication.test.cjs`: unauthorized/offline/foreign serial never looks online.
- `test/pass19-integration.test.cjs`: GUI, Explorer/CLI paths converge on main approval; catalog writes only after guest confirmation.

CI also builds **portable Windows Developer Preview without Android runtime** and runs synthetic UI smoke. Still required for production: install/launch signed APKs on real Windows 10/11 hardware and on multiple GPUs; Android package signature validation and split-bundle verification; real userdata and snapshot persistence after reboot; multi-GB recovery; locked files, corrupted AVD, Windows junction/reparse-point and concurrent source mutation tests; independent security review and signed release assets.

**Do not merge `main`. Keep PR #1 Draft until all release gates are proven.**
