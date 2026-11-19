# Development checkpoint

Release decision: **Release Blocked**. No physical Windows Android test host is attached. Baseline is Draft PR #1, branch `feature/international-foundation`. Each code commit is followed by Windows CI for that revision.

| Pass | Status | Commit | Windows CI | Preview | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 19 | Baseline | [c3220607](https://github.com/alexanderajohn/apkstart-international/commit/c322060712d429a6e539fb5fb06f4f3f375db6b4) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44279262187) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44279262187/artifacts/14415228906) | Hardware Validation Pending |
| 20 | Immutable staging | [854c448d](https://github.com/alexanderajohn/apkstart-international/commit/854c448d4e3aa7f81d1da5e8831e2d847bb9f6c0) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44284178466) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44284178466/artifacts/14418178553) | Real signed APK, NTFS races, interruption during Android commit |
| 21 | Profile ownership | [50489651](https://github.com/alexanderajohn/apkstart-international/commit/504896516a0a927dc607294b0c8d2e501f38cac3) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44349043693) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44349043693/artifacts/14447232741) | Physical two-Profile reboot, orphan shutdown and NTFS locking |
| 22 | Live harness; hardware pending | [2f7fffc8](https://github.com/alexanderajohn/apkstart-international/commit/2f7fffc804d01466de7bb5482d3cde182363bc44) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44350781335) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44350781335/artifacts/14448217764) | All physical Windows matrix cells, permission prompt and UI observations |
| 23 | Split compatibility | [ebff1706](https://github.com/alexanderajohn/apkstart-international/commit/ebff1706bc78c2679902d65acb8465eead84f11d) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44351959946) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44351959946/artifacts/14449520823) | Real signed APK/APKS/XAPK, store variants, device ABI combinations |
| 24 | Desktop launch | [58fe8d01](https://github.com/alexanderajohn/apkstart-international/commit/58fe8d01f24c81440e7176f9524883d336b3e641) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44427541510) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44427541510/artifacts/14483564278) | Physical Windows shortcut launch after restart and window lifecycle |
| 25 | Runtime and benchmark | [6464269d](https://github.com/alexanderajohn/apkstart-international/commit/6464269d2e78e8064ab7532a4afa9f839c4c22a7) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44428046220) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44428046220/artifacts/14484524290) | Physical performance, crash recovery and long-running soak |
| 26 | Three-language UI; review pending | [ed4493fe](https://github.com/alexanderajohn/apkstart-international/commit/ed4493fe03e8af27d98903929ae53c05f403d362) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44467790354) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44467790354/artifacts/14502673306) | Native dialogs, dynamic setup guidance, three-language manual workflow and layout review |
| 27 | Windows Setup | [c6fb2268](https://github.com/alexanderajohn/apkstart-international/commit/c6fb2268bb03681a349a6d8bb788431d002a190c) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468195349) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468195349/artifacts/14502639943) · [Setup](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468195349/artifacts/14502694813) | Signed delivery, MSIX identity, verified production update channel |
| 28 | Restore verification | [af494b7c](https://github.com/alexanderajohn/apkstart-international/commit/af494b7cfed07d3b9d36a1350ce5b272d7f3531c) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468683387) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468683387/artifacts/14502844254) · [Setup](https://github.com/alexanderajohn/apkstart-international/actions/runs/44468683387/artifacts/14503815779) | Physical power-loss and multi-GB AVD recovery |
| 29 | Security review | [56f90f4e](https://github.com/alexanderajohn/apkstart-international/commit/56f90f4ec19f2ba0a2da418243e5e430a65f649f) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44522403089) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44522403089/artifacts/14529730231) · [Setup](https://github.com/alexanderajohn/apkstart-international/actions/runs/44522403089/artifacts/14529530736) | Independent review, third-party notices, production signing |
| 30 | Candidate; Release Blocked | [1155f5dc](https://github.com/alexanderajohn/apkstart-international/commit/1155f5dc7ab481ff02e6b61831586b5add4e8fd3) | [3/3](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169) | [Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169/artifacts/14529571946) · [Setup](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169/artifacts/14529786071) | Physical Android 14, signed distribution and full international UX |

## Pass 20

All user install entry points use private temporary copies. Main compares the approved profile, package identity, version, size and SHA-256 before entering the installer. Each APK part is streamed through ADB stdin into one Android package-manager session. The digest of the bytes fed to ADB must match before commit. New installs use Android's no-replace flag. Lost transport after commit requires inspecting the Profile before retry. The launcher no longer reinstalls caches or switches runtime images during error recovery. A changed image identity or unreadable existing userdata stops startup. Existing caches are never overwritten by version alone.

Run `npm test`, `npm run test:international`, and `npm run test:runtime:live -- --help`. Windows CI creates a host-only portable preview. Use the real-host procedure in [LIVE_ANDROID_VALIDATION.md](LIVE_ANDROID_VALIDATION.md) for guest evidence. Remaining gates include split manifest/ABI selection, physical Windows locks and power-loss reconciliation. A crash may leave a staging directory or an uncommitted guest session. Do not delete an Android Profile to clean these up.

## Pass 21

Runtime reuse verifies the saved Profile, ADB serial, AVD name and guest kernel boot UUID. A process restart can adopt the same recorded guest. An unknown running guest or AVD lock blocks startup. Stop no longer kills PIDs selected by a listening port or from another emulator's lock. Profile switching reserves the transition across asynchronous checks and relaunch. Legacy sessions created before ownership records require closing the emulator once. Network repair ends after a non-destructive cold boot. Explicit reset requires a separate native confirmation. Ownership records assume trustworthy local storage and a trustworthy Android runtime.

## Pass 22

The harness tests install, launch, close and relaunch in a disposable Android Profile. Optional app-private digest checks distinguish persistence from package presence. Cold/Quick Boot and GPU/CPU/Hyper-V evidence instructions are in LIVE_ANDROID_VALIDATION.md. Run `npm run test:runtime:live -- --help`; the Linux builder has no AVD or physical Windows host.

## Pass 23

SmartCheck now requires one base manifest, consistent package/version and unique split IDs, and binds each payload digest to approval. File names are generated locally, extraction checks output size, and install compares native libraries with live guest ABIs. Android enforces signing, downgrade policy and package commit. OBB assets and multi-variant archives need a device-targeted export. Hardware Validation Pending.

## Pass 24

New shortcuts encode the Profile ID, have separate names per package/Profile and use the same Windows app identity as their window. Unqualified legacy links resolve to Default. Opening a shortcut in a different Profile reports the mismatch. Launches queue across concurrent requests, await their actual display attachment, and report a window failure if both attachment attempts fail.

## Pass 25

Snapshot writes share one in-flight save. A stale marker survives process restart and invalidation during a save. Incomplete snapshots remain on disk for recovery. The planner avoids redundant boot attempts and keeps the configured disk size on fallback. Window refit timers stop after close. The full local Node suite passed on Linux, including the small-host fallback test. Use the disposable-profile prerequisites in LIVE_ANDROID_VALIDATION.md, then run `npm run test:runtime:live -- --benchmark`. The run excludes a warm-up and records five force-stop/launch samples, Android TotalTime and host round-trip duration. Repeat under each host configuration with the same APK digest and boot mode. No physical measurements are available yet.

## Pass 26

Added EN/VI/ZH entries for 70 settings actions, options and fields. Profile, backup, repair and performance panels refresh their labels when the selected language changes. Windows Preview smoke changes the actual language selector and checks the Runtime Manager start action in all three languages. Destructive operations and real provisioning are outside this smoke. Feature Complete Beta has not been signed off.

## Pass 27

Setup packages the same runtime-free portable tree that passes UI smoke. The hosted Windows gate installs twice, verifies the installed source, uninstalls and checks a disposable Profile sentinel. The artifact includes its SHA-256 file. MSIX requires a fork-owned publisher identity. The production updater stays disabled pending an independently managed release key and verified update channel.

## Pass 28

Both restore formats inventory the installed destinations and re-read their SHA-256 before success. Migration retains the destination AVD config and verifies its staged digest. An exclusive, flushed per-Profile journal records target, stage and original safety-copy names before renames. A fresh process blocks Android start on an interrupted restore. On failure keep Android closed, copy the Profile, journal, AVD and all transaction siblings to a separate disk first. Use the recorded original components or a known verified external backup to reconstruct an offline copy. Verify all selected files before archiving the journal and reopening that Profile. Recovery after physical power loss still requires hardware validation. Runtime cleanup preserves every AVD, snapshot, lock and shared image.

## Pass 29

Security review, trust decisions and outstanding release gates are recorded in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). The locally verified Google Windows platform-tools archive passed size and checksum checks. Dependency audit, signed-update verifier tests, backup fault injection and Windows host CI have separate evidence. Third-party rights, physical path races, production signing and independent assessment remain open.

## Pass 30

The unsigned 1.0.0-rc.1 build has a complete portable file inventory, candidate identity and an upgrade/rollback exercise against the exact Pass 27 implementation. [Candidate evaluation and upstream comparison](CANDIDATE_VALIDATION.md) records the remaining Stable requirements. Windows CI links belong to the code revision that generated each artifact.

### Verified candidate artifacts

The 1.0.0-rc.1 code revision is `1155f5dc7ab481ff02e6b61831586b5add4e8fd3`. All eleven pass revisions completed their three Windows CI jobs. On the candidate, the international suite passed 215/215 on **each** of Node 20 and Node 22. The packaged UI smoke passed, the gate inventoried and rechecked 163 portable files, and the hosted Windows runner installed the earlier Setup, upgraded, rolled back, upgraded again and uninstalled. The catalog and userdata test files retained their contents throughout. The test did not boot their AVD.

| Output | GitHub artifact bytes | GitHub archive SHA-256 |
| --- | ---: | --- |
| [RC Portable](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169/artifacts/14529571946) | 148,779,653 | `d389bf349f133ccede75b5e10943852dcb59da7b91830bf6cec674f013fbd738` |
| [RC Setup, checksums, inventory and SBOM](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169/artifacts/14529786071) | 113,137,265 | `fe1b9f0ffed8dc2941e600457f608aa10180131f3f12071081f76d373e79d0dc` |
| [UI smoke screenshots](https://github.com/alexanderajohn/apkstart-international/actions/runs/44523365169/artifacts/14528837933) | 1,340,071 | `2b9bc67c8937d11e8bf40cb9537a161673e2887977f978117eca249d25405f6f` |

GitHub reports that these short-lived evaluation artifacts expire on 2026-11-22 at approximately 12:26 UTC. Setup's separate `SHA256SUMS` applies to the EXE inside its archive.

**Next validation milestone.** On physical Windows hosts, run the [Android test procedure](LIVE_ANDROID_VALIDATION.md) with a signed test application in disposable Profiles. Record cold/Quick Boot, ADB ownership and actual app-private persistence before and after an offline restore. Attach the resulting observations and benchmark samples to Draft PR #1. The [remaining release gates](CANDIDATE_VALIDATION.md) include power loss, full international UX, signing and redistribution review. Release Blocked.
