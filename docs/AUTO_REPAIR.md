# Android Auto-Repair 2.0 — design and safety

**Status:** developer preview. Implemented on `feature/international-foundation`; Android emulator integration with real hardware remains unverified.

## Detection (read-only)

The user starts the scan from Settings → Runtime & Environment. The backend inspects known, local runtime/component status and recent failed boot evidence. The result includes only standardized issue codes (not raw logs, paths, serials or credentials) and recommended actions.

The rules recognize GPU and Vulkan/OpenGL failures, 0xC0000005 crashes, missing hypervisor acceleration, unavailable or unauthorized ADB, Quick Boot/snapshot load failures, low disk, memory allocation, busy ports, AVD locks, broken images and missing Windows runtime DLLs. Routine successful snapshot log lines are not treated as evidence of snapshot failure.

## Recovery and consent

Diagnosis does not change system configuration. Every active repair button displays a confirmation first. The backend recomputes a fresh plan before executing an allowed action; the renderer cannot send shell commands or arbitrary settings.

| Action | What it does | Impact |
|---|---|---|
| `gpu-software` | Choose version-compatible software GPU mode for the next emulator boot | May be slower; no data deletion |
| `snapshot-disable` | Set `engine.keepSnapshot=false` (do not load/save Quick Boot on next boot) | Cold start may take longer; old snapshots remain |
| `adb-reconnect` | Restart only ApkStart's private ADB server **port 5044**, only with a running emulator | May briefly interrupt Android debugging connections; never touches global port 5037 |

**Never automatic:** changing Windows virtualization settings, elevating privileges, installing drivers, downloading runtime components, deleting lock files, deleting Android userdata, resetting networking, deleting snapshots or force-stopping unrelated processes. The old environment `Fix All` button was replaced by a review action to avoid chaining such steps without separate consent.

Unauthorized ADB requires that the user manually accept the Android debugging prompt. Hypervisor issues are guidance only: an explicit button opens Windows Features; it does not enable the feature or bypass UAC.

## Known limitations

- The rules classify known symptom patterns; they are not a deterministic diagnosis. A failure can have multiple causes.
- Read-only scanning is initiated on demand. Nothing is automatically repaired on launch.
- No successful real-world GPU/Hypervisor recovery has been established; Windows and Android runtime testing is mandatory before release.
- Settings take effect on the **next** Android start and do not force a restart or wipe user data.
- ADB reconnect is unavailable if the app is configured with an ADB server port other than 5044.
- Privacy masking remains best-effort. Inspect exported reports before sharing.

## Validation

`npm run test:international` includes `test/auto-repair.test.cjs` for log classification, safe settings choices, explicit allowlists, source wiring and ADB port isolation. CI will smoke-test opening the Auto-Repair panel on Windows without installing Android or running any repair action.
