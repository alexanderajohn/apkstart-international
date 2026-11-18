# Android Profiles — data isolation and safety (developer preview)

## Architecture

Default remains **byte-for-byte in place** and retains the prior AVD layout, including custom paths. The registry `profiles.json` is created only when the first extra profile is created or activation is saved. Existing Default `apps.json`, APK/icon folders and Android userdata are **not moved or cloned**.

Extra profiles have IDs like `p_<16 hex digits>` and a separate `apps.json`, `apks/`, `icons/` and `avd/` root under `DATA_DIR/profiles/<id>/`. If the user has configured an explicit Android AVD directory, additional profile AVDs reside inside its own `profiles/<id>/` subdirectory. Unique AVD IDs `apkstart_<id>` ensure Android Emulator cannot confuse them with the legacy `apkstart` AVD.

The runtime executable, official system images, Windows configuration and global UI settings are shared. A profile is an independent Android **guest instance with its own persistent userdata** — not a simultaneous VM, and not a per-app resource quota or a cloned Windows user account.

## Switching

1. Close every Android application window and wait for pending installations/downloads/updates to finish.
2. In Settings → Runtime, press **Stop Runtime**. Make sure no detached/foreign Android emulator is running.
3. Choose another profile in the main bar, press **Switch profile**, then confirm the restart.
4. The backend re-checks for running VM, active tasks, live ADB devices and local emulator ports. Any ambiguity aborts the switch with a readable message; no process is killed automatically.
5. The app writes the new active profile ID and restarts. On the next launch it reads the selected profile before creating the Android Runtime.

Because earlier ApkStart versions can leave detached emulators running, a new profile-aware session **refuses to adopt an unverified emulator** rather than connecting one profile's APK catalog to a different guest. This intentionally blocks automatic reuse of preexisting emulator sessions when multiple profiles exist. Close them manually first.

## Safety limits

- No automatic userdata reset, APK migration, AVD deletion, guest clone, Windows account change or cloud upload.
- No profile delete/clone operations in this preview.
- Secondary profile Windows shortcuts are disabled until launch arguments carry the exact profile ID. Legacy unqualified shortcuts are restricted to Default when other profiles are active.
- Direct Windows `.apk` association may still install into the currently selected profile without the SmartCheck consent UI; this existing limitation must be resolved before public release.
- Runtime launch fallback to shared legacy QEMU/ISO disks is blocked for non-default profiles.
- An explicit custom Android data directory can move secondary profile AVD locations, but it never changes the original Default AVD path.
- Installations inside each profile require official Android Emulator and a supported system image. The same APK can be independently installed in multiple profiles; this has not yet been verified on actual Windows runtime hardware.

## Verification

The `test/profiles.test.cjs` regression suite verifies the default path, isolated metadata storage, invalid-name handling, corruption refusal, unique AVD identities and UI safety gates. GitHub Actions builds a Windows Electron preview and smoke-tests profile creation without switching a live Android VM. A full two-profile install/login/restart test on Windows is still required.
