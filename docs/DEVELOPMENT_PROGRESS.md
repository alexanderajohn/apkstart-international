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
