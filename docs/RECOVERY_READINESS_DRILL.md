# Recovery Readiness & Restore Drill — Feature #12 (developer preview)

Recovery Readiness & Restore Drill checks whether an **encrypted backup can be authenticated** and whether a basic restore procedure can be **rehearsed without changing the active Android Profile**. It is intentionally not an actual Android Emulator boot, full-volume disk restoration, or a guarantee of usable app data.

## Choose a source and inspect readiness

1. Stop Android in Settings and close active app windows, installation/download and update tasks.
2. Open **Backup Center → Recovery Readiness & Restore Drill**.
3. To inspect an archive from the active profile's encrypted Safety Vault, click **Find encrypted Safety Vault archives**, select one, enter its password and choose **Inspect selected encrypted Safety Vault archive**. To inspect an external encrypted backup, click **Choose external encrypted backup for readiness**, enter its password, and select the folder through the **native Windows folder picker**.
4. The app authenticates the encrypted manifest and **every encrypted payload** with AES-256-GCM, checking each decrypted file's SHA-256 and expected byte length **while streaming the decrypted bytes to a discard sink**. It does **not write any real backup plaintext to a staging folder**.
5. The app confirms the snapshot belongs to the **currently active Android Profile**, checks known components, computes the backup age and verifies free space on each destination drive using the existing Restore Center preflight.
6. The readiness preview shows components, file count, encrypted-backup byte count, available/required destination space, and explicit limitations. It issues a **random, single-use 10-minute approval token**. It never schedules automatic restoration.

The external picker is main-process-only; the renderer cannot submit a filesystem path. External source folders must be outside ApkStart application/profile data and cannot overlap a live target. Local sealed sources must be found through the active profile's fixed Safety Vault directory.

## Run an isolated synthetic restore drill

1. Re-enter the same password, type **DRILL**, confirm the renderer warning, and approve the separate **native Windows dialog** (Cancel by default).
2. The backend consumes the approval token, confirms Android remains stopped and the same profile is selected, reopens the exact source folder, reauthenticates every ciphertext and rechecks the archive fingerprint and destination-space preflight.
3. The app creates a randomized isolated OS temporary folder. For each recognized component type (app catalog, APKs, icons and AVD data), it writes only small, fixed **synthetic test strings** with generic synthetic file names.
4. It rehearses per-component **rename to a safety copy**, **stage to live**, verifies synthetic content, and **rolls the operation back** within that sandbox. No user paths, app package names, passwords or Android userdata are copied into this sandbox.
5. The sandbox is deleted in a `finally` block. If sandbox deletion fails, the drill refuses to claim success and reports the cleanup error. Synthetic staging results, number of actual encrypted files verified and tested components appear in the UI.

The drill does **not** call the production restore function, launch an emulator, create an Android Profile, touch live profile files, remove snapshots, delete existing recovery points or unseal private data onto disk. Real encrypted files are checked by streaming into a discard sink; **only synthetic files** are written during the staging rehearsal.

## What passing does and does not mean

Passing means: the password unlocks the encrypted archive; all ciphertexts, sizes and SHA-256 hashes match at that moment; the archived profile identity matches the current profile; the basic free-space preflight passes; and synthetic stage/rollback operations work in the OS **temporary volume**.

Passing **does not mean**: that Android userdata will boot, that downloaded Android system images match the snapshot, that apps/logins or hardware-backed keys survive migration, or that Windows NTFS permissions, antivirus locks, disk space, crash consistency and actual restore operations will behave identically on the **profile's destination drives**.

A readiness warning for missing Android AVD configuration or absent AVD component must not be treated as a healthy full-device restore. The tool is a **Developer Preview** and cannot replace a manual restore test on an isolated Windows machine and a disposable Android Profile.

## CI, privacy and release gates

`test/restore-drill.test.cjs` covers encrypted authenticity and wrong passwords, ciphertext tampering, fixed-profile selection, external folder restrictions, one-time/cancelled/expired tokens, Android running, profile changes, synthetic staging/rollback and preservation of live data. Windows Node.js 20 and 22 run the extended `test:international` suite.

Windows CI also builds the portable preview and, using **synthetic fixtures only**, displays both the readiness preview and the completed synthetic drill. CI requires both smoke screenshots. It never overwrites actual user data or performs a real Android restore.

**Before public beta:** conduct full multi-GB AVD restore tests on physical Windows 10/11 hosts, verify Android boot and real app data, test destination-disk ACLs, insufficient space, antivirus interference, sudden power loss and interrupted restores. No independent security audit has been completed.

Keep work on `feature/international-foundation`, PR #1 **Draft**, and `main` unchanged.
