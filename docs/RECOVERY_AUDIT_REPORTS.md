# Recovery Audit Trail & Verification Reports — Feature #13 (developer preview)

A local, per-profile **metadata-only audit journal** for backup verification, recovery-readiness checks, synthetic restore drills and user-approved recovery operations. The journal provides chronological diagnostic evidence, not an independent security attestation.

## Open and export a report

1. In Backup Center, open **Recovery Audit Trail & Verification Reports**.
2. Select **Verify event-chain integrity and view history**. The app reads the currently active Android Profile's local log and verifies the ordered SHA-256 hash chain before displaying any events.
3. Review timestamps, operation type, result (passed/failed/cancelled), bounded file/byte counts and abstract source type. At most 30 recent events are displayed; aggregate counters cover the whole locally available history.
4. Choose **Export sanitized JSON verification report**. The native Windows Save dialog selects the destination. The app **refuses to overwrite an existing file** and refuses destinations inside the app's data directory.
5. The exported JSON includes all currently verified events, a final-chain digest, summary counters and explicit limitations. No internet service, external signing or cloud upload is involved.

## Events captured

The main-process wrappers record only fixed categories: encrypted backup creation; encrypted or legacy restore preview verification; cross-machine migration preview verification; encrypted Safety Vault creation and verification; encrypted archive health checks; recovery-readiness verification; completed isolated synthetic drills; user-approved restore/migration, Recovery Vault recovery, manual plaintext cleanup and interrupted-cleanup RESCUE.

On success, count/size and a **SHA-256 evidence ID** may be recorded. Failed operations are recorded using an allowlisted reason code, rather than a raw exception message. Cancelled operations that reach an audited wrapper are recorded as cancelled. Some cancellations before an audited operation starts (such as dismissing an OS folder picker) are not recorded.

**The log schema rejects all other properties.** Passwords, encryption keys, approval tokens, raw filesystem paths, APK/app package names, Android userdata, decrypted blobs, stack traces, and freeform exception text are **not stored**. A generated evidence hash is a correlator for inspected encrypted metadata; it is not a secret, signature or proof the backup remains unmodified.

## Storage and integrity

- Profile-scoped local path: `DATA_DIR/recovery-audit/<profile-id>/events.jsonl`.
- Each bounded JSON event contains `version`, `index`, `previous`, timestamp, fixed result metadata and a deterministic SHA-256 chain hash. The index and predecessor hash are verified before rendering or exporting. Records are appended serially, and the file is synced to disk after each event.
- The folder and file are inspected for symlinks/junctions and unexpected file types; a changed record or incomplete final line **blocks subsequent append and export**. The application does not automatically delete, repair or rewrite a damaged log.
- Max 10,000 entries / 8 MiB: when the cap is reached, user operations still run but the audit write reports a warning. There is no automatic pruning or silent log rotation.
- Appending an event is **best-effort** and does **not reverse or conceal** a successfully completed backup, restore or cleanup. The API may return an `auditWarning` if an audit record could not be saved. UI should report that warning.

### Limitations that matter

This is an **unkeyed local SHA-256 hash chain**, NOT a digitally signed, remote, hardware-backed or independently notarized audit. An attacker who can modify the local log can recompute every hash, replace the complete chain or truncate a valid tail, which the local reader cannot detect. Deleting the entire file also removes the history, because there is no external checkpoint.

**A `passed` record means a particular operation reported success at the recorded time.** It does not prove a backup can still be restored today, that real Android userdata will boot, that a synthetic drill validated destination NTFS permissions, or that the disk will survive power loss. The feature does not make earlier backup or recovery features production-ready.

Local reports can still reveal approximate sizes, dates, source categories and pseudonymous evidence hashes. Treat exported reports as private diagnostic files and share deliberately.

## Windows CI and preview verification

`test/recovery-audit.test.cjs` covers schema/privacy boundaries, record chains, concurrent append serialization, corrupted/partial logs, active-profile isolation, invalid paths, symlinks, safe export, overwrite refusal, and the explicitly demonstrated inability to detect malicious tail truncation. Windows CI runs Node 20/22 international suites.

The Windows portable-preview smoke test uses only **synthetic** archive/drill evidence, displays a verified audit dashboard, exports a temporary sanitized JSON report, checks that synthetic passwords, active fixture paths and approval tokens do not appear, and deletes only its own temporary report file. No user backup, active Android Profile, real restore or remote reporting is involved.

Before public release: real Windows 10/11 disk failure and ACL tests, multi-GB encrypted AVD recovery validation, and independent security review of audit reliability and filesystem race boundaries. Work stays on `feature/international-foundation`, PR #1 stays **Draft**, and `main` remains unchanged.
