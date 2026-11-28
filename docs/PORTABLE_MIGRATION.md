# Portable Profile Migration (developer preview)

ApkStart International can transfer an Android profile between Windows machines using a **directory** exported by Encrypted Backup & Recovery (AES-256-GCM, scrypt). This is not a ZIP, cloud sync or a portable emulator image.

## Safe transfer workflow

1. On the source Windows PC, **stop Android** and export an encrypted profile using Backup Center. Keep the password separately and transfer the entire `ASI-Encrypted-...` folder over trusted removable storage.
2. On the destination Windows PC, install/provision a matching Android runtime and system image. Create a **new separate** Android profile, switch to it, and provision an AVD `config.ini` with matching `image.sysdir.1`, `abi.type`, `hw.cpu.arch`, `tag.id`, and `target`. The default profile is deliberately not a migration target.
3. Stop Android, open Backup Center, choose **Import encrypted profile from another Windows PC**, enter the password and choose the transferred folder.
4. The program authenticates the encrypted manifest and every file, checks the AVD metadata, available disk space and live profile isolation; a one-time preview token is issued.
5. Type **MIGRATE**, confirm the renderer warning, and approve the **native OS** dialog. Re-enter the password. The program reauthenticates the data, rechecks target compatibility and stages decrypted payloads on the destination drive.
6. Only after successful staging is the target replaced. Existing target components are renamed into individual `.before-restore` safety copies and are **never automatically deleted**. Restart ApkStart before booting Android.

The import binds catalog APK and icon paths to package-owned files in the authenticated archive and the destination Profile. The import clears source desktop and Start Menu shortcut paths. AVD compatibility uses the Android target from the AVD descriptor when a generated `config.ini` omits it. Conflicting targets block import.

The destination's machine-specific AVD `config.ini` is kept rather than importing path values from the source computer. Files are written only inside the selected profile's known data components; system binaries, system images, general settings and unrelated profiles are not imported. The source backup remains encrypted and unchanged.

## Fail-closed behavior and limitations

- Incorrect password, missing/incompatible AVD metadata, missing file, altered ciphertext, insufficient disk space, running Android, and a changed target since preview block import.
- Profiles must use an **identical identified system image configuration**. Matching these config values is a necessary check, **not proof** of full emulator disk portability or ABI correctness.
- Older encrypted backups without the authenticated AVD metadata cannot migrate; create a fresh export using the updated app. Legacy plaintext backups remain available for **same-profile restore only**.
- The source backup may contain machine-specific Android app files, snapshots and caches beyond `config.ini`. App logins, Android encryption keys, hardware-backed credentials and Quick Boot state may not be portable across hosts. Do not guarantee that an imported emulator will boot until tested on real Windows 10/11 hardware.
- The migration operation currently targets the **active, already-created secondary profile**. It does not silently create profiles or delete existing profiles. Back up destination data separately before import.
- A local process with filesystem access can modify files between some checks. Rollback is best-effort if a machine loses power, Windows denies renames or security software interferes. Independent cryptography/security review and real multi-GB AVD validation are still release blockers.
- Never put passwords, decrypted backups or personal data into CI test fixtures or support tickets.

The [Windows Server 2025/WHPX integration test](https://github.com/alexanderajohn/apkstart-international/actions/runs/46040498800/artifacts/15221415913) exported an encrypted 5,331,958,047-byte backup, imported it into a separate Profile on the same runner, cold-booted the destination and verified the signed app and its private data. Windows Node 20/22 tests also exercise wrong passwords, conflicting AVD metadata, invalid catalogs, destination-relative paths and retained originals. Transfer between independent Windows 10/11 hosts remains a release gate.
