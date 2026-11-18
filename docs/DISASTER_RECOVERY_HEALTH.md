# Disaster Recovery & Integrity Health Check — Feature #11 (developer preview)

This feature adds an **offline, read-only recovery-health dashboard** and an explicitly approved way to put *surviving* `.cleanup-pending` fragments back into their original plaintext `.before-restore` / `.before-recovery` safety-copy locations. It **never starts Android, deletes files, overwrites an existing destination, modifies live profile userdata or edits encrypted backups**.

## What Health Check detects

After stopping Android and closing operations that use profile data, open **Backup Center → Disaster Recovery & Integrity Health Check → Scan local recovery health**.

It inspects **only known folders of the active Android Profile** and displays:

- Number of discoverable local `.before-restore` / `.before-recovery` plaintext recovery points.
- Number of encrypted `ASI-Sealed-...` Safety Vault folders. **Listing does not authenticate them.** A file can be present and damaged or maliciously modified.
- Recognizable `.asi-<20hex>.stage` components left by interrupted staging for profile restore / recovery. These are **reported only**, not deleted or automatically installed.
- `.asi-<20hex>.before-restore|before-recovery.asi-<20hex>.cleanup-pending` items: quarantined plaintext data remaining after an interrupted manual cleanup.
- Unpublished `ASI-Sealed-YYYY-MM-DD-<hex>.partial` encrypted backup directories. These are **not** considered complete backups and are **never** automatically deleted or restored.
- Invalid safety-copy types, symlinks, mismatched component layouts and other recognized issues, where possible.

The health report is based on current local filesystem observations and may not be exhaustive if file damage or permission denial prevents traversal. A "zero issues" report cannot prove Android userdata correctness or successful AVD boot.

## Verify integrity of a sealed recovery archive

1. Run the health scan to discover the active profile's sealed archives.
2. Select the archive and enter its password.
3. Choose **Authenticate selected archive with password**.

The existing authenticated Encrypted Backup engine checks the protected manifest and **every AES-256-GCM authentication tag and plaintext SHA-256** without writing any decrypted data to disk. A wrong password, tampering, missing ciphertext or an archive belonging to another Android profile fails. Keys are cleared after verification. The check reports source recovery point, file count, bytes and included components; it does **not** prove Android emulator boot portability.

## Manual RESCUE of interrupted cleanup fragments

1. Stop Android. Run Health Check, select a reported **rescuable** interrupted-cleanup group and inspect the proposed RESCUE.
2. A one-time, 10-minute preview token binds the active profile, exact group identifier and SHA-256 inventory of the surviving fragments.
3. Type **RESCUE**, separately confirm the renderer warning, then approve the independent native Windows dialog (default is **Cancel**).
4. The backend scans again, ensures profile identity and file hashes have not changed and **refuses to overwrite** any existing original safety-copy destination.
5. Only surviving `.cleanup-pending` components are renamed back to their corresponding `.before-restore` / `.before-recovery` paths. No live profile data, encrypted archive, system image or unrelated recovery point is changed. No file is deleted.
6. If a rename fails, successfully moved components are renamed back on a best-effort basis. On failure, inspect remaining safety fragments manually. There is **no automatic repair on startup**.

**Important:** RESCUE is not a full rollback if the prior cleanup already deleted files. It can only return still-present fragments and cannot reconstruct deleted data. Even when a RESCUE succeeds, the resulting safety point may be incomplete. For full recovery use a separately authenticated encrypted archive and the existing explicit RESTORE workflow, not this partial rescue.

## Deliberate limits and release blockers

- No auto repair, auto cleanup, automatic archive deletion, forced retention or hidden filesystem mutation.
- Restore `.stage` and encrypted `.partial` entries are diagnostic **only**. They may be incomplete; the program does not guess whether it is safe to delete or apply them.
- A corrupt or compromised Windows filesystem, junctions, unknown path layouts, active ransomware or unusual ACL state can prevent diagnosis or safe rename.
- Crash consistency is limited: multi-component rename is not atomic. A process crash may leave a mixed set of safety filenames. The program avoids overwrite and reports errors but cannot guarantee full disaster recovery.
- The existing Safety Vault archive password cannot be recovered by the app. Local plaintext fragments remain sensitive and are not protected by sealing unless deliberately copied into an encrypted archive. A successful encrypted verification does not demonstrate secure backup storage redundancy.
- The scanner is active-profile-scoped, and is not a general-purpose disk repair or forensic erasure tool.
- **Before public beta:** test on multiple real Windows 10/11 PCs with real Android 14 AVDs, multi-GB userdata, unexpected exits during cleanup and restore, antivirus locks, disk full, NTFS reparse points and actual backup restore/boot. Independently review filesystem race conditions.

## CI verification

`test/disaster-health.test.cjs` exercises read-only discovery, encrypted authentication and ciphertext tampering, wrong passwords, safe rescue, partial-fragment warning, profile isolation, changed-content refusal, symlink refusal, cancellation/expiry and typed/native approval. Windows CI runs Node 20 and 22, then packages a Developer Preview and renders a **read-only** disaster health screenshot using **synthetic** cleanup/stage/partial artifacts. CI never executes a RESCUE, plaintext deletion, restore or real AVD migration.

All implementation commits stay on `feature/international-foundation`. Keep PR #1 **Draft**; do **not** merge `main`.
