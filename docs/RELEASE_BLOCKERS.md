# Stable 1.0 release blockers

**Release Blocked.** The engineering candidate is `1.0.0-rc.1`. See [current gates](CANDIDATE_VALIDATION.md), [security review](SECURITY_REVIEW.md) and [revision-specific Windows build evidence](DEVELOPMENT_PROGRESS.md). On `2df10a0a`, both packaged desktop apps passed, Linux completed 26/26 Android phases and encrypted migration between two Profiles on one Windows runner passed 11/11. The default Windows guest completed 22/26. The 720p guest passed 19 phases and stopped during Quick Boot. Windows split foreground reliability, physical Windows 10/11, independent host migration, power interruption, complete international workflows, signed upgrades and redistribution review remain open. [Latest Android evidence](https://github.com/alexanderajohn/apkstart-international/actions/runs/46043742272)

## Historical gate checklist

Entries below record the requirements of earlier passes. Use the candidate gate table above for the consolidated release decision.

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

- [x] Implement per-profile offline directory backup with allowlisted components, SHA-256 manifest and disk-space preflight.
- [x] Implement consent-token restore, verified staging, safety copies and rollback regression tests.
- [x] Add EN/VI/ZH Backup Center UI, typed RESTORE confirmation and Windows host-only smoke test.
- [ ] Exercise multi-GB Android 14 emulator userdata/snapshots backup + restore on actual Windows hardware (Default and secondary profile).
- [ ] Validate restores across disks, disk-full and interrupted copy scenarios with real-world AVD files.
- [ ] Add backup encryption, optional ZIP packaging and reliable cross-machine profile-ID migration before stable release.

- [x] Use AES-256-GCM with scrypt and authenticated encrypted manifest for new Backup & Restore Center snapshots.
- [x] Require a password and repeat confirmation to create; re-enter to inspect and recover; no password persistence.
- [x] Keep legacy v5 snapshot import while marking it unencrypted.
- [ ] Independent cryptographic/security review of encrypted backup format, nonce handling and failure cleanup.
- [ ] Real Windows Android Emulator restore, interruption/rollback and multi-gigabyte AVD performance testing.
- [ ] Offer password rotation/export recovery strategy and encrypted cloud backup only after separately reviewed authorization and threat model.

## Pass 18 — Live Android validation evidence

- [x] Add a non-destructive live runtime readiness button for the currently owned emulator, with exact active-Profile AVD check, authorized ADB device state, boot completion, API 34 and responsive package manager.
- [x] Add synthetic Windows Node 20/22 readiness regression tests and an opt-in Windows live test harness for signed APK install/launch and two-profile persistence/isolation checks.
- [ ] Run the live harness on real Windows 10/11 hardware with a signed, harmless APK in an explicitly disposable secondary Android Profile; verify actual window behavior and Android permissions.
- [ ] Confirm two-profile APK/data isolation across actual emulator shutdown/restart, cold and snapshot boots, and profile switching.
- [ ] Complete multi-GB encrypted backup/restore on real Android 14 AVD userdata, plus independent security review and signed production release artifacts.

**CI is synthetic and read-only unless a tester explicitly invokes the live Windows harness on an appropriate host. A packaged EXE is not proof that Android installed or launched an APK.**

## Pass 19 — APK Installation & Profile Isolation Hardening

- [x] Require main-process native confirmation for GUI, Explorer, file-association and CLI APK installs; default Cancel, profile and SHA-256 revalidation before install.
- [x] Reject wrong-profile AVD, unauthorized/offline ADB and unknown app catalog entries before an install/launch; require package-manager confirmation before writing installed-app catalog.
- [x] Cover modified APK input, AVD mismatch, ADB authorization, changed Profile and approval cancellation with Windows regression tests.
- [ ] Real Windows 10/11 validation: signed APK install/launch, update without data wipe, reboot/snapshot persistence and two secondary Android Profiles with different userdata.
- [ ] Close source-file TOCTOU and NTFS junction/reparse-point race windows; ensure recovery after power loss during installs.
- [ ] Validate real APK signature certificates, full split package compatibility and independent security review.

**Synthetic Windows CI is NOT real Android installation validation. Pass 19 remains a Developer Preview.** See [Pass 19 hardening notes](APK_PROFILE_INSTALL_HARDENING.md).
