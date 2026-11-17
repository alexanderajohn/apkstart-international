# SmartCheck — offline pre-install APK review

Status: developer preview. Static analysis is NOT antivirus, signature verification, Google Play Protect or a guarantee of compatibility.

## What is inspected

- A new read-only Electron IPC method uses the existing streaming ZIP/AXML APK reader.
- The APK manifest yields minSdkVersion, targetSdkVersion, requested permissions and required hardware features.
- APK native library folders reveal bundled ABI architectures (including x86, x86_64 and ARM).
- A SHA-256 digest is calculated by streaming the selected local file, not uploading it.
- The checker detects META-INF certificate files or APK Signing Block presence but DOES NOT verify cryptographic signatures or attest developer identity.
- Android 14 is API 34. Requiring minSdkVersion > 34 prevents in-app installation; older target SDKs and ARM-only binaries show warnings.

## Explicit consent

Selecting or dragging an APK in the application opens SmartCheck before the installer starts. The user may cancel. The install button stays disabled until analysis succeeds, and a known minimum API mismatch blocks it by default. A static scan cannot prove that an APK is safe or will execute.

Split .apks/.xapk packages currently show only file size and hash; internal APKs are not yet inspected. They require a warning and direct user confirmation to proceed.

## Known gaps and safety notes

- Windows file-association / command-line installation still uses the legacy path and does not use the renderer SmartCheck confirmation dialog.
- Signing evidence is NOT cryptographic validation. Treat the signature as unverified.
- Large package hashing has no user-visible progress indicator or cancellation; do not use untrusted giant packages in a preview release.
- Files may change between scan and installation; hash pinning is not yet implemented.
- Corrupt APKs or compressed ZIP anomalies need additional fuzz testing.
- There is no malware detection, remote reputation lookup, automated network upload or Android runtime boot in SmartCheck.
- Only consent for picker and drag/drop flows has been tested. Full runtime APK install needs manual Windows validation.

## Automated tests

Run npm run test:international. Synthetic APK fixtures test SDK bounds, native ABI, permissions, sensitive permissions, signing markers, hash generation and the frontend IPC/consent wiring. Tests do not mean third-party APKs are guaranteed to install.
