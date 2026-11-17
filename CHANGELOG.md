## Unreleased — privacy-aware diagnostic report

- Export local-only diagnostic reports with best-effort redaction of common credentials, email addresses and user paths.
- Keep error codes and runtime configuration useful for troubleshooting.
- Add EN/VI/ZH export labels, explicit review warning and regression tests.

## Unreleased — international foundation

- Default Android app permissions to user consent; optional runtime-grant setting.
- Preserve installed app data on repeated startup failures.
- Temporarily disable unverified automatic executable updates.
- Expand English and Vietnamese UI catalogs, including dynamic app status messages.
- Make the app-data deletion confirmation localizable.
- Add automated regression coverage for localization and safety.

# Changelog

All notable changes to the **independent ApkStart International fork** are documented here.

## [0.1.0-beta.1] — Unreleased (source foundation)

### Added
- Internationalization adapter for dynamic renderer text with persistent English, Vietnamese, and Simplified Chinese selection.
- Initial translation catalogs, build script and localization unit tests.
- Fork product metadata, independent GitHub URL substitutions, and app ID.
- Static audit, automated GitHub Actions checks, attribution and contributor documentation.

### Changed
- Disabled inherited Microsoft Store packaging commands and archived upstream release workflows.
- Preserved original README and license for provenance.

### Not yet done
- Verified Windows/QEMU build, complete translations, fully independent branding and binary release.