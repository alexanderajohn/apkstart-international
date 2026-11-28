# ApkStart International

> **Unofficial, independent community fork** of [RoutineMiku/ApkStart](https://github.com/RoutineMiku/apkstart).
> Android apps in desktop-like Windows windows — with English, Vietnamese, and Simplified Chinese UI support.

**Stable 1.0 status — Release Blocked.** Version `1.0.0-rc.1` is an unsigned Windows evaluation build. Physical Android 14 results, the full international UX review and production signing are outstanding.

## Try the Windows candidate

The [tester guide](docs/preview/TESTING.en.md) covers the unsigned evaluation package and its known limits.

Download the Portable or Setup artifact for a **verified revision** in the [build and verification table](docs/DEVELOPMENT_PROGRESS.md). Extract the Portable ZIP into its own directory and open `ApkStart International.exe`. For Setup, verify the executable against its included SHA-256 file first. Back up existing Profiles and AVDs before testing upgrades.

See the [installation, rollback and comparison guide](docs/CANDIDATE_VALIDATION.md), [Android hardware procedure](docs/LIVE_ANDROID_VALIDATION.md) and [release blockers](docs/RELEASE_BLOCKERS.md). The Windows packages contain the launcher. Android SDK components are downloaded separately from Google's indexes.

## Why this fork?

- English-first documentation, localized UI and language selector (English / Tiếng Việt / 简体中文).
- An independent project identity and release channel (configured from your own GitHub repository).
- A maintainable foundation for localization testing and releases.
- Open development with proper attribution to upstream.

## Developer quick start

Clone the international fork and use Node.js 22.12 or newer to develop and package on Windows x64. The Windows unit matrix also exercises Node.js 20.

```powershell
git clone https://github.com/alexanderajohn/apkstart-international.git
cd apkstart-international
git switch feature/international-foundation
npm ci
npm run test:international
npm run audit:international
npm run dev
```

Windows CI builds and smoke-tests the launcher. The hosted Android workflow exercises signed APKs on Linux/KVM and Windows Server/WHPX. Physical Windows 10/11 testing remains open.

## Language workflow

- Edit `src/ui/i18n/en.json`, `vi.json`, or `zh-CN.json`.
- Run `npm run i18n:build` to regenerate `catalogs.js`.
- Run `npm run test:international`.
- The renderer uses local scripts only; no remote translation service or file:// fetch is needed.
- The default locale follows the operating system language, with English fallback. User choice is persisted locally.

**Known limitation:** The first milestone uses a non-invasive DOM adapter and an initial translation catalog. Unmatched Chinese UI text remains in its original language. For production, move toward stable i18n keys for renderer and backend strings, including errors/toasts/dialogs.

## Build notes

Use the feature branch’s Windows CI for the unsigned evaluation builds. The separate Android workflow boots Google Play API 34 guests, installs fixtures, checks the foreground Activity and tests persistent Profile data. See the [release gates](docs/CANDIDATE_VALIDATION.md).

## Credits and license

The original [ApkStart project](https://github.com/RoutineMiku/apkstart) is by **RoutineMiku** and upstream contributors, licensed under MIT. This fork retains the upstream `LICENSE` and provenance. This fork is not sponsored by or affiliated with the original author. See [CREDITS.md](CREDITS.md) and [docs/BASELINE.md](docs/BASELINE.md).

## Translations

- [Tiếng Việt](README.vi.md)
- [Original Chinese upstream README](docs/UPSTREAM_README.zh-CN.md)
## SmartCheck — inspect APKs before installation

SmartCheck performs a local read-only inspection when the user selects or drags an APK in the Electron UI. It displays Android API requirements, native ABIs, requested/sensitive permissions, APK signing **evidence only (not a cryptographic signature verification)** and SHA-256. No content is uploaded, Android does not start during analysis, and installation requires a deliberate confirmation click.

SmartCheck inspects the base and split manifests in supported APKS/XAPK sets, aggregates permissions and ABIs, and records a digest for each APK. It blocks packages requiring a newer Android API than 34. Older target SDKs and ARM-only packages can produce warnings.

Opening an APK from Explorer or the command line shows a native approval dialog. Approval binds the selected Profile, package and file digest. Android’s package manager checks the installation. See [SmartCheck details](docs/SMARTCHECK.md).

## Auto-Repair 2.0 — safe troubleshooting preview

Open **Settings → Runtime & Environment → Auto-Repair 2.0**, then choose **Analyze problems**. The scan checks known failures (GPU, Hypervisor, ADB, Quick Boot snapshots, storage, missing runtime components), shows guidance in EN/VI/ZH, and never modifies the system during diagnosis. GPU software fallback or disabling Quick Boot **for the next launch** require explicit confirmation. Reconnecting ADB is limited to ApkStart's isolated port 5044, only on a running emulator. Other actions are manual recommendations, not automatic repairs. No Android app data or snapshots are deleted by this feature.

See [Auto-Repair safety and limits](docs/AUTO_REPAIR.md). **The existing one-click bulk repair in the environment panel was replaced by a per-issue review.**

## Smart Performance Engine (developer preview)

Open **Settings → Performance & Resource Usage → Smart Performance Engine** and press **Start measuring**. No telemetry is uploaded. The dashboard displays Windows CPU and memory usage, optional Android emulator process CPU and working-set RAM, the configured GPU rendering backend, and recent Android app **gfxinfo frame-completion rate** when available. FPS is not a universal frame-rate sensor; GPU **utilization % is not supported**. Unsupported/absent data is shown as N/A, never fabricated.

The Android emulator is a **shared VM**. VM CPU/RAM are never attributed to a single APK. Choose a per-app scheduling preset (`inherit`, `save`, `balanced`, `smooth`) with explicit approval; changes take effect **on the next app launch**. RAM, vCPU, and render resolution remain global VM settings. `smooth` raises process priority and can reduce host responsiveness. The rules suggest a preset using measured pressure, but **never apply it automatically**. No data resets, installer changes, network telemetry, or third-party services.

See [Performance technical notes](docs/SMART_PERFORMANCE.md).

## Android Profiles (developer preview)

Create **Work / Games / Testing** environments from the new Android Profiles bar above the app library. Profiles are named and can be switched deliberately. **Existing Default profile data is never migrated, copied or deleted**: it continues using its original `apps.json`, APK/icon folders and Android AVD path. Each additional profile has a separate app catalog, APK/icon cache, AVD name and Android userdata/snapshot directory. Emulator binaries and official system images remain shared to avoid redundant multi-gigabyte downloads.

**Only one profile may run at a time.** Stop Android using Settings → Runtime → Stop Runtime, close app windows and finish installs before switching. If any emulator port is still live, switching fails closed; the app never kills unrelated QEMU/Android Studio processes to force it. A successful switch restarts ApkStart rather than hot-swapping disk paths while Android is running.

New shortcuts identify the Android package and its Profile. Legacy shortcuts without a Profile refer to Default. Each Profile has its own shared-folder settings. [Android Profiles](docs/ANDROID_PROFILES.md)

## Backup & Restore Center

Stop Android and close app windows before backing up or restoring a Profile. The encrypted backup directory includes the app catalog, cached APKs and icons, and persistent AVD data when present. Restore checks integrity and space, requires explicit consent, and retains previous components in safety copies. For a transfer to a different Windows PC, use a compatible secondary Profile and the dedicated [migration procedure](docs/PORTABLE_MIGRATION.md). Cross-machine validation remains open.

## Encrypted Backup & Recovery (developer preview)

New backups are encrypted **by default** and protected with a user-supplied password. ApkStart uses a memory-hard **scrypt** derivation (N=32768, r=8, p=1, random 256-bit salt) and **AES-256-GCM** authenticated encryption. Each file gets its own random nonce; the manifest containing file paths, app names, digests, Android profile identity and dates is itself encrypted. The result is a directory with `header.json`, `manifest.enc`, and `payload/*.bin` encrypted blobs, **not** a ZIP. No backup is uploaded to a server.

The password is **not stored** and cannot be recovered if lost. To create a backup, enter the password twice. To inspect an encrypted snapshot or restore it, enter the password again; authentication and SHA-256 verification must succeed before any original file can be touched. Every restore requires a fresh preview, typing `RESTORE`, and native operating-system confirmation. The existing data is moved to named safety copies, not silently deleted. Backup v5 plaintext directories can still be restored, with a clear warning.

**Security caveats:** Password strength matters, no automatic recovery keys exist, and file sizes/backup creation timestamps can still be inferred. Decrypted data is necessarily present in the active Android guest and temporary restore staging. Keep exported files and passwords safe. This is a developer preview; restore real Android emulator data only after verifying a separate backup. See [Encrypted Backup & Recovery security guide](docs/ENCRYPTED_BACKUP.md).
