# Release blockers — source preview only

- [ ] Translate all renderer and backend strings. The current catalog is deliberately partial.
- [ ] Audit the updater: do not publish until it verifies releases from this fork.
- [ ] Test Windows 10/11 install, runtime, ADB, emulator, file association and uninstall.
- [ ] Verify user-data directories are separated from upstream.
- [ ] Audit automatic app data clearing and permission grants.
- [ ] Review third-party Android/Google component redistribution rights.
- [ ] Replace upstream logos and installer assets; verify legal notices.
- [ ] Add Windows CI and signed builds with artifact integrity checks.

**No public Windows installer is validated by this commit.**
