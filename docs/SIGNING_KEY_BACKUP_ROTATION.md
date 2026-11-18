# Pass 15 — Secure Signing Key Backup & Rotation (developer preview)

This feature extends Pass 14's per-profile Ed25519 signing identity. It does **not** affect Android application backups, passwords or userdata.

## Operations

In Backup Center, under signed verification reports:

- **Export encrypted signing-key backup:** enter the EXISTING signing passphrase in the first password field and a NEW, distinct backup passphrase in the second. Confirm in the native OS dialog and pick a JSON path outside application data. The complete *already encrypted* PKCS#8 key and public key are wrapped again with scrypt (N=16384,r=8,p=1; 32-byte random salt) and AES-256-GCM (12-byte random nonce, 16-byte authentication tag). The backup must be stored off-device. No cloud transmission occurs.
- **Import backup into an EMPTY signing identity:** enter the original private-key passphrase first, backup passphrase second, type `IMPORT SIGNING KEY`, choose the JSON using the native picker, and confirm again. The profile tag, AES-GCM authentication, keypair relationship and public-key fingerprint are checked. Existing keys are never replaced by import.
- **Rotate signing key:** enter current private-key passphrase first and new passphrase second; type `ROTATE SIGNING KEY`, confirm natively. The new Ed25519 identity is encrypted with the new passphrase. The previous PUBLIC key is retained in `retired-signing-keys/<fingerprint>.pem` to validate already issued evidence. A complete new encrypted keypair is fsynced into an immutable `signing-key-slots/<fingerprint>/` directory before a single atomic `active-key.json` rename selects it. The old encrypted private PEM is unlinked after commit; **export a protected copy before rotating**.

Important: a key backup containing the previous private key remains usable for historical impersonation even after rotation. Rotation does not revoke existing signatures. Record and independently trust historical and newly generated public-key fingerprints, and protect both key and backup passwords.

## Limitations and release blockers

- File creation refuses overwrites; key imports refuse existing identities and cross-profile identity tags. These are defense-in-depth checks, **not** a complete defense against symlink or reparse-point races on Windows.
- The active identity switches via a **single pointer-file rename**, avoiding a mixed active PEM pair if the process stops before commit. Interrupted pre-commit stages can leave orphan slot folders containing encrypted private keys; a crash immediately after commit can leave the previous encrypted private key on disk until it is manually cleaned. Do not automatically delete orphan slots without a verified backup. Full directory durability and power-loss behavior on NTFS remain to be validated on physical Windows hardware.
- A compromised or concurrent process can interfere with pointer or key files; this is not a transactional database and is not a hardware security boundary.
- No TPM/HSM-backed keys, trusted timestamping, automatic revocation/CRLs, external cloud escrow, hardware-bound identity or password reset.
- This is not an independently audited cryptosystem or enterprise key lifecycle. Windows ACL behavior, crash-injection tests, large storage policies and real-machine recovery remain required.
- No claim of successful Windows CI or production readiness should be made until actual workflow results and runtime behavior are examined.

## Verification

`node --test test/signing-key-management.test.cjs` tests encrypted backup, reimport, wrong passwords, overwrite rejection, profile isolation, pre-commit failure injection, restart after pointer commit and repeated rotation. `npm run test:international` includes the suite. Tests use synthetic signing identities; real user keys must never be supplied to CI.
