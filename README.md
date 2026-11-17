# ApkStart International

> **Unofficial, independent community fork** of [RoutineMiku/ApkStart](https://github.com/RoutineMiku/apkstart).
> Android apps in desktop-like Windows windows — with English, Vietnamese, and Simplified Chinese UI support.

**Development status:** Early technical preview. This fork does **not** yet claim complete localization, Windows compatibility, a safe updater, or a production installer. Please do not publish bundled Android/Google components before reviewing their redistribution terms.

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