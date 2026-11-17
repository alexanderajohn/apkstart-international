# Release blockers — source preview only

- [ ] Translate all renderer and backend strings. The current catalog is deliberately partial.
- [x] Disable executable self-update and interrupted-job resume until integrity checks exist.
- [ ] Implement verified, independent update assets and release channels.
- [ ] Test Windows 10/11 install, runtime, ADB, emulator, file association and uninstall.
- [ ] Verify user-data directories are separated from upstream.
- [x] Remove automatic `pm clear` fallback after repeated app crashes.
- [ ] Audit automatic Android permission grants (`adb install -g` and runtime grants).
- [ ] Review third-party Android/Google component redistribution rights.
- [ ] Replace upstream logos and installer assets; verify legal notices.
- [ ] Add Windows CI and signed builds with artifact integrity checks.

**No public Windows installer is validated by this commit.**
