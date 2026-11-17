# Windows portable developer preview

Status: **testing artifact**, not a production release. These directions apply to the `feature/international-foundation` branch.

## Automated pipeline

The PR CI runs upstream tests, internationalization and safety regression tests on Windows / Node.js 20 and 22. When both jobs succeed, a separate Windows job downloads Electron, runs `npm run pack`, verifies the generated EXE and stores it as a short-lived GitHub Actions artifact (3 days).

- Artifact: `ApkStart-International-Windows-dev-preview`
- Executable: `ApkStart International.exe`
- User-data folder: `%APPDATA%\\apkstart-international` (separate from upstream)
- Android runtime: **not bundled**; downloaded as needed from official Android SDK sources
- Updater: automatic executable replacement disabled until supply-chain verification is implemented
- Chinese IME APK: not bundled; check licensing and UX before supporting this option

The workflow also attempts an offline application-shell screenshot, using isolated test settings to disable auto-deployment. Smoke failures are reported separately because hosted Windows runners may not expose a usable interactive desktop.

## Manual smoke checklist on Windows 10/11

1. Back up data and extract the preview to an isolated directory.
2. Open `ApkStart International.exe` and verify the UI loads.
3. Switch between English, Vietnamese and Simplified Chinese.
4. Open Settings, change locale, close and reopen; ensure it persists.
5. Check Runtime setup without downloading until you are comfortable with bandwidth and disk usage.
6. Test with a non-sensitive APK, verify that Android asks before granting runtime permissions.
7. Check startup/shutdown and that the upstream ApkStart installation is untouched.
8. Send logs and screenshots privately if they contain personal information.

Do not consider an Electron UI screenshot proof that Android Emulator/QEMU has run successfully. Runtime download licensing, app compatibility and signed release delivery require separate validation.
