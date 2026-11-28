# Product research — lessons from related open-source projects

This note documents public feature comparisons, **not** code transplantation. Attribution and license compatibility must be checked before reusing third-party source.

| Reference | Platform / technical approach | Useful lessons | Constraint |
|---|---|---|---|
| [RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart) | Windows, Electron + emulator/ADB | Desktop integration, APK install shortcuts | Original MIT credit and fork identity must be retained |
| [Wolklaw/AndroidBox](https://github.com/Wolklaw/AndroidBox) | Windows, official Android Emulator | Transparent download sources, no app ads, clean diagnostics, manual device controls | Do not copy assets or make unverified feature claims |
| [waydroid/waydroid](https://github.com/waydroid/waydroid) | Linux, Android in namespaces/LXC | Seamless application integration and multi-window UX | GPL-3.0; does not imply Windows-compatible code reuse |

## Differentiate by a measurable user experience

1. **Trust:** opt-in app permission elevation, no silent app-data reset, clear network and diagnostic behavior.
2. **Independent distribution:** clean App ID, menu shortcuts, isolated data and self-owned release feeds.
3. **Accessibility:** first-class EN/VI/ZH translations including error messages, keyboard support and screen readers.
4. **Reliability:** reproducible Windows tests, crash logs with privacy controls, tested installer/uninstaller, integrity checks.
5. **Real-world usability:** publish a public compatibility matrix of APK versions, hardware specs and known constraints.

## Milestones

- Preview: Windows Electron portable shell builds in CI and launches without downloading runtime.
- Alpha: verified official SDK runtime installs; APK smoke tests and permission checks on Windows.
- Beta: independently branded installer, third-party license inventory, rollback-safe signed or hashed release assets.
- Stable: automated compatibility matrix, complete translations, privacy-aware diagnostics and accessible UX.

Numbers such as stars, speed, memory usage and crash rate must be measured. Do **not** promise a top-star ranking or claim native Android execution on Windows.
