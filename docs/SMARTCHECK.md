# SmartCheck before Android installation

SmartCheck reads a selected file locally and shows the package identity, Android API requirements, permissions, native ABIs and SHA-256 digest. The presence of a certificate file or APK signing block is a structural observation. Android’s package manager enforces signing and update rules during installation.

## APK and split package review

For a supported APKS or XAPK archive, SmartCheck inspects the base and split APKs. A device-specific set must contain one base APK, consistent package and version identifiers, unique split names and the required split dependencies. The preview combines permissions, features and native ABIs and records a digest for each APK. Bundles containing external OBB assets require a different distribution. Packages requiring an API newer than Android 14 are blocked. ARM-only native code and older target SDKs can produce compatibility warnings.

## Approval and installation

The picker and drag-and-drop flows show the renderer preview. Opening an APK from Explorer or the command line also goes through main-process approval, with the active Profile, package and digest shown in a native dialog. Cancellation ends the operation.

After approval, the installer copies the selected file to a private staging directory and compares its digest, size, package, version, format and split digests with the approval. It checks the guest identity and streams each APK into an Android package-manager session while verifying its length and digest. If the result of the Android commit is unknown, inspect the package in that Profile before retrying.

## Verification and limits

Run `npm run test:international` for the SmartCheck, approval, staging, session and Profile regression tests. Hosted Android 14 runs exercise signed APKs and device-specific split sets. The packaged Windows jobs open APKs through Explorer and confirm the resulting package from its original shortcut. [Revision-specific results](DEVELOPMENT_PROGRESS.md)

SmartCheck cannot determine whether an application is trustworthy. The preview has no progress or cancellation control during large-file hashing. Physical Windows 10/11 coverage and further testing with malformed archives remain open.
