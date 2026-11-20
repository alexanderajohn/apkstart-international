# Pass 16 — Independent Trust & Key Lifecycle Center (developer preview)

This feature adds **public-key-only** trust bundles, offline verification of already signed Pass 14 evidence, a local rotation timeline, and a **read-only** inventory of inactive encrypted signing keys. No cloud upload, Android data modification, automated key removal, or merge is performed.

## Trust boundaries

1. Set up a signing identity, then export the public trust bundle from Backup Center. Bundle schema `asi-trust-bundle-v1` contains an opaque profile tag, the currently active Ed25519 public key, and known retired public keys. **It is not signed, certified, or automatically trusted.**
2. Preserve the exact signing fingerprint independently, preferably another separately controlled device. Transfer the bundle and signed report/checkpoint to another computer. Enter the **independently verified** 64-digit fingerprint in the offline verifier; choose bundle and evidence using native file pickers.
3. Offline verification checks embedded Ed25519 signature, report digest (for report evidence), profile tag, key type, bundle schema and **exact signer-fingerprint equality with the external pin**. An untrusted bundle can never authorize an arbitrary new key merely by containing a previously pinned key.
4. To verify a historical pre-rotation signature, explicitly pin that **historical** fingerprint. Pinning the current key does not automatically delegate trust to all prior keys. A valid signature proves only authenticity under that key; it does not establish trusted time, revocation state or live Android restoration.

## Rotation timeline and sensitive-key inventory

Pass 15 rotation appends a local `rotation-history.jsonl` record with only timestamp and old/new public-key fingerprints after committing the active pointer. The history is **informational**, not cryptographically anchored, and may be incomplete after a crash. Compare it against separately stored fingerprints.

The inventory inspects `signing-key-slots` and checks for a remaining legacy private PEM after rotation. It refuses unexpected or symlinked files where inspected. It **does not delete, decrypt, migrate or export** candidates. Users should verify external backups and the active identity before manually removing any orphaned encrypted keys. No automatic deletion is exposed.

## Validation and limitations

Synthetic tests cover independent fingerprint pinning, historical keys, modified reports, swapped keys, profile mismatch, offline verification without private key material, and preservation of orphan files. Windows CI runs this suite in `npm run test:international`.

**Not provided:** cross-machine identity certification, revocation authority, timestamp attestation, trusted hardware key storage, authenticated rotation chronology, automatic cleanup, signed trust-policy updates, or multi-process filesystem transaction safety. Windows NTFS power-loss behavior and real Android runtime remain release blockers. The developer preview is not production-certified.

Keep PR #1 **Draft**, preserve `main`, and do not claim the backup signing system has been independently audited.
