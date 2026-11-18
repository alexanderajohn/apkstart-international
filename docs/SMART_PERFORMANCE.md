# Smart Performance Engine — metrics and limits

**Status:** developer preview. Metrics are opt-in, local only and not transmitted or stored. No timers run while the Settings panel is closed.

## What is actually measured

| Indicator | Method | Limit |
|---|---|---|
| Host CPU (%) | Delta of system CPU time counters across all logical cores | First sample requires a second reading |
| Host RAM (%) | Windows/Node OS reported total and available memory | Includes OS cache effects; not app-only |
| Emulator CPU (%) | Delta of CPU seconds of processes whose executable is under this fork's runtime root and command line matches its AVD | Windows only; process matching may be unavailable or incomplete |
| Emulator RAM | Sum of matched emulator/QEMU process working sets | Entire Android VM, **not** per-APK memory |
| GPU render mode | Active emulator runtime profile (`host`, `software`, etc.) | **Not GPU utilization (%)** |
| Android frames/s | Recent completed graphics frames from `dumpsys gfxinfo <installed-active-package> framestats`, relative to guest uptime | FPS estimate only; unavailable when idle, stale, or unsupported |

Unsupported values are **N/A**, never zero or invented benchmark values. Linux and hosted Windows runners without Android runtime can validate UI and host metrics but cannot prove Android guest performance.

## Per-app profiles

`inherit`: use the global process scheduling policy. `save`: use BelowNormal for the Android VM while launching the app. `balanced`: Normal. `smooth`: High process priority for the Android VM. These are *process scheduling* preferences, not per-APK CPU or RAM limits, because every APK runs inside the same Android emulator. The most recently opened app sets the shared runtime process priority. Per-app choices are persisted locally in `settings.json` and require confirmation. No setting is silently applied by the recommendation engine.

Changing memory, core count, GPU backend or render resolution requires VM-wide changes and can require a restart; Smart Performance Engine intentionally does not perform those operations while Android is running. High priority can reduce Windows desktop responsiveness.

## Recommendation rules

High host memory pressure (>=88%) or high host CPU (>=90%) suggests `save`. Recent FPS under 30 with host headroom suggests `smooth` (only if memory <80% and CPU <75%). Otherwise `balanced`. Missing CPU sample produces a limited-confidence `balanced` suggestion. This is simple transparent heuristic advice, **not an AI model nor a proven optimization**. No auto-tuning or remote analytics.

## Privacy, performance, and safety

- Sampling only begins when the user presses Start. It pauses automatically when Settings closes.
- Windows process interrogation uses a read-only PowerShell script restricted to executable paths under this fork's runtime root. No changes to other emulators or applications.
- Android graphics records are read by ADB using validated installed-app package names. Data is not exported or sent over the network.
- No runtime provisioning, data deletion, automatic service restart, third-party downloads or app permission elevation.
- CPU sampling and Powershell/GFXINFO queries can cause modest overhead; stop measuring when not needed.

## Verification

`npm run test:international` includes `test/performance.test.cjs`. Windows CI validates packaging and a host-only UI smoke preview. Full emulator measurements must still be checked manually on Windows hardware before public release.
