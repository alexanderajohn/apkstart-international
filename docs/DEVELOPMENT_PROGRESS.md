# Development checkpoint

Release decision: **Release Blocked**. No physical Windows Android test host is attached. Baseline is Draft PR #1, branch `feature/international-foundation`. Each code commit is followed by Windows CI for that revision.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 19 | Developer Preview | c322060 | [3 jobs passed](https://github.com/alexanderajohn/apkstart-international/actions/runs/44279262187) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44279262187/artifacts/14415228906) | Hardware Validation Pending |
| 20 | Implementation submitted | This revision | Pending | Pending | Real signed APK, NTFS races, interruption during Android commit |

## Pass 20

All user install entry points use private temporary copies. Main compares the approved profile, package identity, version, size and SHA-256 before entering the installer. Each APK part is streamed through ADB stdin into one Android package-manager session. The digest of the bytes fed to ADB must match before commit. New installs use Android's no-replace flag. Lost transport after commit requires inspecting the Profile before retry. The launcher no longer reinstalls caches or switches runtime images during error recovery. A changed image identity or unreadable existing userdata stops startup. Existing caches are never overwritten by version alone.

Run `npm test`, `npm run test:international`, and `npm run test:runtime:live -- --help`. Windows CI creates a host-only portable preview. Use the real-host procedure in [LIVE_ANDROID_VALIDATION.md](LIVE_ANDROID_VALIDATION.md) for guest evidence. Remaining gates include split manifest/ABI selection, physical Windows locks and power-loss reconciliation. A crash may leave a staging directory or an uncommitted guest session. Do not delete an Android Profile to clean these up.

## Pass 21

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 21 | Implementation | This revision | Pending | Pending | Physical two-Profile reboot, orphan shutdown and NTFS locking |

Runtime reuse verifies the saved Profile, ADB serial, AVD name and guest kernel boot UUID. A process restart can adopt the same recorded guest. An unknown running guest or AVD lock blocks startup. Stop no longer kills PIDs selected by a listening port or from another emulator's lock. Profile switching reserves the transition across asynchronous checks and relaunch. Legacy sessions created before ownership records require closing the emulator once. Network repair ends after a non-destructive cold boot. Explicit reset requires a separate native confirmation. Ownership records assume trustworthy local storage and a trustworthy Android runtime.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 22 | Runnable live harness; Hardware Validation Pending | This revision | Pending | Pending | All physical Windows matrix cells, permission prompt and UI observations |

The harness tests install, launch, close and relaunch in a disposable Android Profile. Optional app-private digest checks distinguish persistence from package presence. Cold/Quick Boot and GPU/CPU/Hyper-V evidence instructions are in LIVE_ANDROID_VALIDATION.md. Run `npm run test:runtime:live -- --help`; the Linux builder has no AVD or physical Windows host.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 23 | Device-specific APK set support | This revision | Pending | Pending | Real signed APK/APKS/XAPK, store variants, device ABI combinations |

SmartCheck now requires one base manifest, consistent package/version and unique split IDs, and binds each payload digest to approval. File names are generated locally, extraction checks output size, and install compares native libraries with live guest ABIs. Android enforces signing, downgrade policy and package commit. OBB assets and multi-variant archives need a device-targeted export. Hardware Validation Pending.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 24 | Profile-qualified desktop launch | This revision | Pending | Pending | Physical Windows shortcut launch after restart and window lifecycle |

New shortcuts encode the Profile ID, have separate names per package/Profile and use the same Windows app identity as their window. Unqualified legacy links resolve to Default. Opening a shortcut in a different Profile reports the mismatch. Launches queue across concurrent requests, await their actual display attachment, and report a window failure if both attachment attempts fail.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 25 | Runtime changes and benchmark harness | This revision | Pending | Pending | Physical performance, crash recovery and long-running soak |

Snapshot writes share one in-flight save. A stale marker survives process restart and invalidation during a save. Incomplete snapshots remain on disk for recovery. The planner avoids redundant boot attempts and keeps the configured disk size on fallback. Window refit timers stop after close. The full local Node suite passed on Linux, including the small-host fallback test. Use the disposable-profile prerequisites in LIVE_ANDROID_VALIDATION.md, then run `npm run test:runtime:live -- --benchmark`. The run excludes a warm-up and records five force-stop/launch samples, Android TotalTime and host round-trip duration. Repeat under each host configuration with the same APK digest and boot mode. No physical measurements are available yet.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 26 | International UX improvements; Beta sign-off pending | This revision | Pending | Pending | Native dialogs, dynamic setup guidance, three-language manual workflow and layout review |

Added EN/VI/ZH entries for 70 settings actions, options and fields. Profile, backup, repair and performance panels refresh their labels when the selected language changes. Windows Preview smoke changes the actual language selector and checks the Runtime Manager start action in all three languages. Destructive operations and real provisioning are outside this smoke. Feature Complete Beta has not been signed off.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 27 | Unsigned installer build and host lifecycle gate | This revision | Pending | Pending | Signed delivery, MSIX identity, verified production update channel |

Setup packages the same runtime-free portable tree that passes UI smoke. The hosted Windows gate installs twice, verifies the installed source, uninstalls and checks a disposable Profile sentinel. The artifact includes its SHA-256 file. MSIX requires a fork-owned publisher identity. The production updater stays disabled pending an independently managed release key and verified update channel.
