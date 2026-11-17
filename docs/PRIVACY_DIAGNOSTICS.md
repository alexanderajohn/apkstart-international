# Privacy-safe diagnostic reports

ApkStart International writes diagnostic reports **locally only** to its own data directory when a user requests export or when the runtime records a boot failure. The application does not upload reports to any server.

## Default safeguards

- Username sections of common Windows (`C:\\Users\\<username>`) and Unix (`/home/<username>`) paths are masked.
- Email addresses and common credential labels/headers (API keys, access tokens, Bearer credentials, cookies, passwords, sessions) are masked on a **best-effort** basis.
- Structured host information, runtime profile and extra diagnostic metadata pass through the same privacy filter.
- Error codes, GPU/CPU and memory configuration, Android emulator port numbers and the last 300 log lines remain available for troubleshooting.

## Important limitations

Redaction is not a guarantee of anonymity. Proprietary app logs may contain unexpected identifiers, IP addresses, device IDs, arbitrary secrets, or values using unfamiliar formats. **Open and review the report before sharing it**, especially when posting a public GitHub issue. The report file itself remains local until the user chooses to send it. No background submission occurs.

The export does not reset, uninstall or clear Android app data. It does not change the runtime or network configuration.

## Verification

The international CI suite creates a sample diagnostic report with credentials, paths and email addresses, and verifies those sample secrets are absent while the error code remains intact. Test fixtures are synthetic. Real Windows and Android runtime logs still require human review.
