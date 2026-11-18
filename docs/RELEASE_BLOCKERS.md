# Release blockers — source preview only

- [ ] Translate all renderer and backend strings. The current catalog is deliberately partial.
- [x] Disable executable self-update and interrupted-job resume until integrity checks exist.
- [ ] Implement verified, independent update assets and release channels.
- [ ] Test Windows 10/11 install, runtime, ADB, emulator, file association and uninstall.
- [ ] Verify user-data directories are separated from upstream.
- [x] Remove automatic `pm clear` fallback after repeated app crashes.
- [x] Make Android permission grants opt-in; remove blanket special-permission appops and automatic dialog dismissal.
- [ ] Verify permission prompts work properly in the bundled emulator on Windows.
- [ ] Review third-party Android/Google component redistribution rights.
- [ ] Replace upstream logos and installer assets; verify legal notices.
- [ ] Add Windows CI and signed builds with artifact integrity checks.

**No public Windows installer is validated by this commit.**

- [x] Pin runtime-pack metadata to fork; default to direct official SDK components until independently released.
- [x] Rename portable EXE / Start Menu entries to avoid upstream collisions and stop global process kills on uninstall.
- [ ] Verify runtime archive content hashes and licenses before any public binary release.

- [ ] Confirm Windows portable preview builds on CI, inspect UI smoke result and manually launch on Windows with the official runtime.

- [x] Redact common personal paths, email addresses and credentials from default diagnostic exports; document best-effort limitations.
- [ ] Review privacy-redaction results with real Windows/Android logs before public release.

- [x] Add local SmartCheck API/ABI/permission/signature-evidence/SHA-256 analysis for GUI picker and drag-drop installation.
- [ ] Verify SmartCheck against real APKs and complete split bundle inspection.
- [ ] Extend SmartCheck confirmation to Windows file association / direct command line installs.
- [ ] Perform actual cryptographic APK signature verification before claiming signatures are valid.

- [x] Add Auto-Repair 2.0 read-only classification with explicit non-destructive repair actions.
- [x] Replace legacy unattended multi-fix UI with per-issue safety review.
- [ ] Verify GPU/ADB/Snapshot/Hypervisor recovery on real Windows 10/11 machines with genuine boot failures.
- [ ] Observe and verify that software GPU/Quick Boot preferences persist across a full Android boot.

- [x] Implement opt-in Smart Performance Engine dashboard and per-app process priority profiles.
- [ ] Calibrate CPU/RAM readings on real Windows 10/11 hardware with a running Google Android Emulator.
- [ ] Validate Android gfxinfo FPS estimator against a separately measured benchmark; FPS unavailable on unsupported apps is expected.
- [ ] Confirm multi-app priority behavior and hardware GPU telemetry before promoting performance claims.

- [x] Preserve default AVD/userdata/catalog paths while isolating additional Android profiles.
- [x] Require runtime to be stopped before switching; reject foreign emulator adoption and unqualified shortcut routing.
- [ ] Test installing the same APK in two profiles on real Windows Android Emulator, including restart/persistence.
- [ ] Verify shutdown, snapshot restoration, profile switching, and Windows shortcut behavior with real APK data.
- [ ] Implement profile-qualified shortcuts and robust per-profile backup/restore before enabling deletion or cloning.
