# Signed Verification Reports & External Checkpoints — Feature #14

Developer-preview functionality to sign recovery audit evidence with an **Ed25519** key protected by a user-supplied passphrase, export independently held checkpoints, and compare those checkpoints against the active Android Profile's current audit log.

This extends feature #13's locally hash-chained metadata journal. It **does not** change the backup encryption algorithm, store backup decryption passwords, write any Android userdata to disk or perform restores.

## 1. Explicitly initialize a local signing key

Open **Backup Center → Recovery Audit Trail & Verification Reports → Signed Verification Reports & External Checkpoints**.

1. Enter a strong signing passphrase (12–1024 UTF-8 bytes) in the password field and repeat it.
2. Select **Create encrypted Ed25519 signing key**, type `CREATE SIGNING KEY`, then approve the native Windows dialog (Cancel is the default).
3. ApkStart creates a new Ed25519 keypair. The PKCS#8 private key is encrypted at rest using the Node.js PEM encryption interface with `aes-256-cbc` and the supplied passphrase. The public key is a separate PEM. Neither raw private key nor passphrase is written to exported evidence.
4. Record the displayed **SHA-256 public-key fingerprint** in an independently trusted location, ideally another device. The application refuses to silently overwrite or rotate an existing key.

Private-key storage is `DATA_DIR/recovery-audit/<profile-id>/audit-ed25519-private.pem`; the public key is `audit-ed25519-public.pem` in the same directory. This is **local passphrase encryption**, not OS-backed hardware key protection; the passphrase may be exposed in process memory while signing. The system cannot recover a forgotten signing passphrase. OS file permissions and data backups require careful user management.

## 2. Export a signed verification report

1. Check audit history integrity and enter the signing passphrase.
2. Choose **Export signed verification report** and select an external JSON destination in the native Windows Save dialog.
3. The application verifies the entire audit chain before signing. It builds a privacy-minimized report containing operation categories, results, timestamps, counts and opaque hash IDs.
4. The file embeds the report, an Ed25519 signature, the public key, a SHA-256 hash of the exact report contents, the audit head, and the count of signed historical events.

Existing files are **never overwritten**, and output inside the application data folder is rejected. Signed reports can be checked for authenticity and content integrity; a signature on its own does not mean the signer is a trustworthy person or organization.

## 3. Export an independent checkpoint and verify later

1. Choose **Export independent checkpoint** after entering the signing passphrase.
2. Save the JSON checkpoint **off the machine** — for example, on a physically separate drive stored securely, another independently administered computer or a trusted external service. No automatic network upload or scheduled external signing is implemented.
3. Preserve a separately verified copy of the public-key fingerprint. Do **not** assume a public key embedded in an unfamiliar file is trusted.
4. Later choose **Verify external checkpoint or report** and open the externally held JSON via the native file picker.
5. ApkStart verifies the Ed25519 signature and expected public-key fingerprint against the active profile's local signing identity, checks the signed profile tag, and compares the checkpoint's historical count and head to that exact point in the currently valid local audit chain.

A checkpoint taken before subsequent append operations remains valid if the original prefix is intact. A truncated log whose length falls below the external checkpoint, or a rewritten log whose authenticated historical head differs, will fail verification.

The report is also subject to a content digest check. **Verification does not restore anything.**

## Threat model and important caveats

- **Independent trust is a user responsibility.** A file left in the same writable folder as the audit log is *not* an independent checkpoint. An attacker controlling both the local private signing key and the audit log may generate forged but mathematically valid reports or replace the local signing identity.
- The public key included in each file is not a certificate from a recognized certificate authority. To establish signer identity, compare its fingerprint with a separately recorded, trusted fingerprint.
- Signing only attests to what the local software saw at a particular time. It is not a warranty that an encrypted archive remains intact or that an Android AVD will boot on a target machine.
- This implementation does not provide trusted timestamps, automatic cloud anchoring, TPM/HSM binding, certificate revocation or key rotation. An external service's retention/security properties must be evaluated independently.
- As with feature #13, raw Android file names, paths, passwords, approval tokens and user data are excluded from report content. Approximate dates, sizes, counts and pseudonymous SHA-256 fingerprints **are** visible and may be sensitive operational metadata.
- Unexpected process failure can leave a partially created local signing identity, which is **not automatically replaced**.
- Reports and checkpoints intentionally live outside the application's data path, selected using the Windows native dialog. They may be copied manually to safer storage.

## Verification

`test/audit-signing.test.cjs` covers local key encryption, no automatic initialization, signed checkpoint creation, Ed25519 signature tampering, report-body tampering, audit truncation, rewritten valid local hash chains, mismatched profile identities, substituted signing keys, wrong passphrases, non-overwrite exports, directory boundaries, symlink refusals and safe renderer/main-process consent.

Windows CI executes the suite under Node 20 and 22. The portable-preview synthetic smoke scenario generates a disposable signing identity and signs synthetic audit evidence, verifies the report/checkpoint, checks exported JSON for synthetic secrets and renders the signing status. **No real Android data or production signing key participates.**

Do not merge the Draft PR or claim production security without reviewing key management, Windows ACL behavior, symlink/reparse-point races, actual cross-machine recovery, trusted external storage and independent code/cryptographic audit.
