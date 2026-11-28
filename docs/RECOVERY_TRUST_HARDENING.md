# Pass 17 — Recovery Trust Hardening & Security Validation

Developer preview: **not an independently audited security system**.

## Signed public trust bundles

Pass 16 exported unsigned `asi-trust-bundle-v1` files. Pass 17 additionally exports `asi-signed-trust-bundle-v2`: a complete v1 public-only trust bundle signed with the active Ed25519 private key using the domain-separated UTF-8 payload `ASI-TRUST-BUNDLE-SIGNATURE-v2\n` plus JSON serialization. The verifier requires a **separately obtained exact active signing-key fingerprint**. A bundle with a valid signature from an unrecognized key is not trusted. Private keys and passwords never enter the exported JSON. Rotation changes the active signer; previous signatures can still be checked with an independently pinned historical fingerprint.

**Important:** An attacker who controls the active signing key can forge signed bundles. The signature does not provide trusted timestamps, certificate revocation, root-of-trust certification or a secure external append-only service.

## Rotation history integrity

New rotations write an additional `rotation-history-chain.jsonl` record after atomic activation. Records commit sequence, old/new public-key fingerprints, timestamp, previous hash and new SHA-256 hash. A local hash chain detects inconsistent edits, but a fully compromised computer can rewrite it entirely. Export a **signed rotation checkpoint** and preserve it off-device, together with an independent fingerprint. The verifier compares the external checkpoint against the exact historical prefix of the current local chain and rejects truncation or divergence.

Legacy `rotation-history.jsonl` remains informational. A crash between key activation and journal append may result in an absent rotation event. This mechanism is **not** crash-atomic with the key pointer. Users must compare separately held trust anchors and investigate gaps.

## Key quarantine (no deletion)

An optional security operation moves a **non-active, versioned signing-key slot** from `signing-key-slots/<fingerprint>` to a same-volume `quarantined-signing-keys` folder after:
1. Verifying the active key does not match the candidate, the public key hashes to the selected fingerprint, and the slot contains exactly an encrypted private PEM and a public PEM with safe file types.
2. Taking a read-only preview that binds the profile, active key, candidate content digest and a random one-time token for 120 seconds.
3. Typing `QUARANTINE KEY` and approving a native OS confirmation (Cancel default).
4. Rechecking all preconditions immediately before a directory rename.

This preserves all material for manual recovery. **It does not delete private keys, guarantee revocation or securely erase storage.** No automatic cleanup, no arbitrary paths submitted by the renderer, no cross-profile changes and no export to the network. Windows junction/reparse-point attacks and other-process concurrency need additional security assessment.

## Tests, known blockers

`test/trust-hardening.test.cjs` includes signed bundle tampering, wrong pins, chained rotation mutation/truncation, wrong passwords, changed candidate content, token reuse/expiration, profile switch, active-key refusal and synthetic rename failure. Integrated into `npm run test:international` for Windows Node 20/22.

Remaining blockers: physical Windows NTFS power-loss validation, Windows ACL/reparse-point audits, multithread/process locking and atomic journaling together with pointer changes, externally certified signer roots and revocation, real Android 14 backup/restore and manual hardware testing. Keep PR #1 Draft, main unchanged; do not market as a production release.
