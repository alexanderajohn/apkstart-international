# Try ApkStart International on Windows

**Developer Preview 1.0.0-rc.1 · Windows x64 · unsigned**

This kit contains the original Portable and Setup archives from commit `2df10a0ab7141b7e214c5c15b40f826963ef7ab1`. The tester workflow downloads both archives, checks their pinned hashes, verifies the Portable inventory and exercises both downloaded packages on Windows Server 2025.

1. Sign in to GitHub, download **ApkStart-International-Windows-Tester-Preview** and extract it into a new folder. Run `Get-FileHash .\portable.zip, .\setup.zip -Algorithm SHA256` in PowerShell and compare the results with `SHA256SUMS.txt`.
2. Choose one package. Extract all of `portable.zip` to a separate directory and open `ApkStart International.exe`, or extract `setup.zip` and run the `*-Setup.exe` file under `dist/release`. If your system requires a publisher signature, stop here.
3. Start with a new test Profile. Back up existing Profiles offline before trying an upgrade. The Android SDK and system image are obtained separately from Google.
4. Open a signed APK from a trusted source. Check the package name, Profile and SHA-256 in the approval dialog. Open the generated shortcut, minimize and restore the window, then try reopening it after restarting ApkStart.

On hosted Windows, API Demos and Fossify Calculator passed the Explorer installation, Profile-qualified shortcut and window checks. An encrypted 5.41 GB migration between two Profiles on the same host preserved app-private data. Physical Windows 10/11, cross-machine migration and long-term use remain under evaluation.

Android sometimes displays a nonresponding system dialog during App Manager split launches. The 720p guest has also failed to wake after Quick Boot. A useful test report records the Windows version, CPU/GPU, app and version, APK/APKS/XAPK format, boot mode and last successful step. Review any diagnostics before sharing.

[Android results by host](https://github.com/alexanderajohn/apkstart-international/actions/runs/46043742272) · [Original Windows builds](https://github.com/alexanderajohn/apkstart-international/actions/runs/46043750085)
