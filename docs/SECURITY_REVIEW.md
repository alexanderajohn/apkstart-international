# Candidate engineering review

The review covers Electron IPC entry points, Profile-bound Android package changes, restore and cleanup paths, ZIP destinations, runtime provisioning, the build dependency graph and the update mechanism. Independent audit and physical NTFS race testing remain open.

| Area | Evidence | Remaining release gate |
| --- | --- | --- |
| Desktop IPC | Main checks top-level frame, owning window and exact bundled page. App and splash windows have narrower action lists. Renderer preloads use sandboxing. Web links accept HTTP(S). | Exercise real shell windows and all privileged workflows in a physical session. |
| Android data | Uninstall and clear-data require a native confirmation, catalog membership, current Profile and recorded guest. Android must confirm success. Restored catalog paths cannot direct host file deletion on uninstall. | Test signing mismatch, lost ADB transport, legacy shortcuts and recovery on-device. Uninstall retains host caches and existing shortcuts. |
| Host paths | ZIP extraction rejects existing linked components. Restore verifies installed inventory and hashes before completion. Cleanup retains all AVDs and disk images. | Same-user concurrent reparse swaps, power-loss recovery and multi-GB datasets on NTFS. |
| SDK provenance | Windows platform-tools, emulator, API 34 Play x86_64 and AEHD resolve against Google's HTTPS indexes. Downloads go directly to dl.google.com with exact byte count and index digest. Locally verified the Windows platform-tools archive (8,044,989 bytes). Google supplied SHA-1 for these four entries. | Physical installation, terms acceptance and redistribution review. Automatic third-party runtime packs, QEMU installers and ISO downloads lack an independent trust anchor and are disabled. Existing local SDK files have separate provenance. |
| Dependencies | Electron 45.3.4 is pinned, including its npm-packaged distribution checksums. Full npm audit of the candidate lock returned zero reported findings on 2026-11-19. Builder dependencies using minimatch 7–10 resolve to 11.0.1. Windows packaging generates a CycloneDX lockfile inventory that includes Electron. | Review native Chromium and OS components independently. npm's advisory database and package declarations have limited coverage. |
| Notices | The portable recipe includes upstream MIT, project credits, Electron LICENSE and Chromium third-party notices. It copies only the tracked README from the developer’s engine directory. Windows CI introduces an extra engine file before packaging and checks the Portable and installed Setup documents against the checkout. The native LZMA package declares MIT. The publisher's tagged npm tree lacks a standalone license file. | Confirm complete third-party copyright and native/Rust notices and fork branding before public distribution. Android, IME and Google images are separate from the Preview. |
| Updates | Local verifier checks detached Ed25519 signature over exact manifest bytes, fork ID, expected version, filename, artifact length and SHA-256 against a separately obtained key. | Establish a fork-owned production key and rollover/revocation process, verify Authenticode, exercise an actual signed upgrade and rollback. Automatic updates remain disabled. |

The runtime waits for Android debugging consent on the selected emulator. An authorization timeout leaves the running guest and its snapshots in place. The startup regression test exercises denial followed by consent on the same boot. The hosted install fixtures normally start with authorized ADB. A physical Android debugging prompt still needs separate validation.

For an offline update or rollback check, supply the expected version and a trusted release public key obtained separately from the download.

```
node scripts/asi/verify-update.cjs manifest.json manifest.sig trusted-release.pem setup.exe EXPECTED_VERSION
```

The manifest fields are `product`, `version`, `file`, `size` and `sha256`. The signature is a raw 64-byte Ed25519 signature. Verification reads the artifact and does not install it. Test keys are generated in memory and discarded.
