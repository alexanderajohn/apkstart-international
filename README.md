# ApkStart International

> **Unofficial, independent community fork** of [RoutineMiku/ApkStart](https://github.com/RoutineMiku/apkstart).
> Android apps in desktop-like Windows windows — with English, Vietnamese, and Simplified Chinese UI support.

**Development status:** Early technical preview. This fork does **not** yet claim complete localization, Windows compatibility, a safe updater, or a production installer. Please do not publish bundled Android/Google components before reviewing their redistribution terms.


## Windows developer preview (not a production release)

The international feature branch now includes a GitHub Actions job that builds a **Windows portable application shell** after its test matrix passes. The preview includes the Electron UI, not a preinstalled Android runtime, proprietary system image or Chinese Pinyin IME APK. On first setup, Android components are downloaded from the configured official SDK sources.

1. Open [Actions](https://github.com/alexanderajohn/apkstart-international/actions) and choose the latest successful CI run for Pull Request #1.
2. Download the artifact named `ApkStart-International-Windows-dev-preview`.
3. Extract the archive and run `ApkStart International.exe` on a Windows test machine.
4. Do not install it over the upstream project; use a separate folder and back up important data first.

**Not yet validated:** full Android app launch, crash recovery, release integrity/signatures, third-party license distribution, and Windows installer/uninstaller. No public binary release is authorized by this preview build.

See [preview build notes](docs/PREVIEW_BUILD.md) and [release gates](docs/RELEASE_BLOCKERS.md).

## Why this fork?

- English-first documentation, localized UI and language selector (English / Tiếng Việt / 简体中文).
- An independent project identity and release channel (configured from your own GitHub repository).
- A maintainable foundation for localization testing and releases.
- Open development with proper attribution to upstream.

## Developer quick start

Clone the international fork and use Node.js 20+ on Windows 10/11:

```powershell
git clone https://github.com/alexanderajohn/apkstart-international.git
cd apkstart-international
npm ci
npm run test:international
npm run audit:international
npm run dev
```

Development changes are proposed in feature branches until reviewed and merged. Installation and production Windows runtime compatibility remain unverified.

## Language workflow

- Edit `src/ui/i18n/en.json`, `vi.json`, or `zh-CN.json`.
- Run `npm run i18n:build` to regenerate `catalogs.js`.
- Run `npm run test:international`.
- The renderer uses local scripts only; no remote translation service or file:// fetch is needed.
- The default locale follows the operating system language, with English fallback. User choice is persisted locally.

**Known limitation:** The first milestone uses a non-invasive DOM adapter and an initial translation catalog. Unmatched Chinese UI text remains in its original language. For production, move toward stable i18n keys for renderer and backend strings, including errors/toasts/dialogs.

## Build notes

The original upstream has an Electron/Windows runtime build process. Do not assume `npm run build:exe` is safe or production-ready without resolving [release blockers](docs/RELEASE_BLOCKERS.md) and validating on Windows. CI here runs static checks, not QEMU integration tests.

## Credits and license

The original [ApkStart project](https://github.com/RoutineMiku/apkstart) is by **RoutineMiku** and upstream contributors, licensed under MIT. This fork retains the upstream `LICENSE` and provenance. This fork is not sponsored by or affiliated with the original author. See [CREDITS.md](CREDITS.md) and [docs/BASELINE.md](docs/BASELINE.md).

## Translations

- [Tiếng Việt](README.vi.md)
- [Original Chinese upstream README](docs/UPSTREAM_README.zh-CN.md)
## SmartCheck — inspect APKs before installation

SmartCheck performs a local read-only inspection when the user selects or drags an APK in the Electron UI. It displays Android API requirements, native ABIs, requested/sensitive permissions, APK signing **evidence only (not a cryptographic signature verification)** and SHA-256. No content is uploaded, Android does not start during analysis, and installation requires a deliberate confirmation click.

For Android 14 (API 34), APKs requiring a minimum API higher than 34 cannot proceed through the SmartCheck dialog. Older target SDKs and ARM-only binaries produce compatibility warnings, not safety verdicts. Split .apks/.xapk bundles get a limited filename/size/hash preview with a conspicuous warning.

Static inspection cannot establish that an APK is safe or will work. Direct command-line and Windows file-association installs are not yet covered by the renderer's confirmation UI. See [SmartCheck details](docs/SMARTCHECK.md).

## Auto-Repair 2.0 — safe troubleshooting preview

Open **Settings → Runtime & Environment → Auto-Repair 2.0**, then choose **Analyze problems**. The scan checks known failures (GPU, Hypervisor, ADB, Quick Boot snapshots, storage, missing runtime components), shows guidance in EN/VI/ZH, and never modifies the system during diagnosis. GPU software fallback or disabling Quick Boot **for the next launch** require explicit confirmation. Reconnecting ADB is limited to ApkStart's isolated port 5044, only on a running emulator. Other actions are manual recommendations, not automatic repairs. No Android app data or snapshots are deleted by this feature.

See [Auto-Repair safety and limits](docs/AUTO_REPAIR.md). **The existing one-click bulk repair in the environment panel was replaced by a per-issue review.**
