# tia 1.0.45 — candidate acceptance in progress, 10 October 2026

The personal-use scope excludes store publication and deliberately defers email password recovery. Existing recovery code and authentication protections remain; no email service, credential or charge was created. Keep the account password in a trusted password manager. A remembered session is not a password backup; do not send the password in chat.

## Superseded candidate (withheld)

| Field | Value |
| --- | --- |
| App | tia / 1.0.45 / code45 |
| Package | `ir.wealthos.personalagent.stable40` |
| Product source | `9129da8d78c13a777d31b6b7707eb3735410fdba` |
| QA source | `e6b9fd96165c0a5270795ac46eb6da7f3fff0c34` (separate instrumentation; main APK unchanged) |
| APK bytes | 59,372,659 |
| APK SHA-256 | `31f5a0432008e0db08fddd2046ae7651f572eb60814f3c8a6b428fee1d543ba0` |
| Permanent signing certificate SHA-256 | `abfd097ac3ab887977fb58505b5ae0e40c1fc5b56bf210597476105278f1e3cf` |
| Embedded HTTPS endpoint | `https://personalagent.wealthos.ir:8443` |

These bytes passed only Android 13, not the complete matrix, and are withheld. A subsequent evidenced SystemBars lifecycle fix requires new product bytes and a fresh complete Android 13/14/16 matrix; identity below is historical, not a download recommendation. Instrumentation/diagnostic APKs must not be installed on the owner's phone or published as the app. The initial 45 candidate (`094697…895d2`) also failed acceptance; version number alone does not identify the file.

## What changed and what passed

- Capacitor 8.5.1, Next 16.3.8, sharp 0.35.5 and source-map-js 1.2.2 close the newly reported dependency advisories; the production audit reports zero **known** advisories. This is not a guarantee against every security defect. Older APK44 does not contain the native patch.
- The disabled email-recovery UI no longer promises email delivery and explains the limitation. Login/security and future recovery code remain intact.
- Android now recognizes nonempty service-worker recovery documents (including the deployed legacy form) and enters the private recovery instead of trapping the user on the web-only retry page. Delayed checks are fenced after activity closure or document replacement. No account/cache/storage clearing was added.
- Type Check, Lint, optimized Build and 1,471 tests in 107 files passed. [Product CI](https://github.com/tparkhondeh/personalAgent/actions/runs/38048447061); verified Linux server package SHA-256 `ee641189fab076db5d2f4dc406716dd9405d677a89e2f23e768e45996b39a882`, embedded commit matches product source above. The package is not deployed.
- Real-browser desktop/mobile: login to Tasks, unavailable recovery, an editable proposal with three reminders, no effects before confirmation, double-click without duplicate, reload, completion with all three future reminders cancelled and logout passed with isolated synthetic data. Manual title correction was needed for one conversational phrase; local understanding is not advertised as perfect.
- Local source/data backup and separate restore, synthetic encrypted backup/restore, and built-server HTTP/auth/cache/data-isolation checks passed. Real owner records were not cleared. No new OpenAI expenditure occurred; no second local budget was enabled.

## Environments are separate

Local `http://localhost:3001/` is loopback on the development Windows VM, not a phone or personal-laptop URL. Its patched build is usable for local testing; GPT there is unfunded/disabled. The verified Linux server package exists, but has **not** been deployed. The public Staging endpoint and Production were unreachable from this host in fresh tests; the active versions, budget ledger and actual GPT responses could not be reverified. Staging did render the normal Tasks interface through validated HTTPS from GitHub's Android emulators on October 10, so the VM timeout is not a universal-outage diagnosis. Historical October 3 GPT success is not a current GPT connection claim.

The connected Android screen uses the server account. Bundled offline tasks live only on that installation and are separate from online records; automatic migration/synchronization is not claimed. Server backups do not cover phone-only tasks. Internet GPT is not available offline; external personal-audio upload remains unauthorized.

## Remaining gates and responsibility

| Gate | Necessary action |
| --- | --- |
| Reachable, patched server | Server/network administrator restores reachability of the existing HTTPS/SSH paths **from the development host**, without bypassing TLS. Then deploy the verified Staging package only after fresh data/settings/cost backup and separate restore, and recheck public assets, consent and the single $2/month budget authority. No shared-domain or Production change was made. |
| Off-server **data** backup | Owner/admin confirms transfer of the encrypted **data** package to the approved laptop folder and establishes a recurring copy/retention routine. The already copied signing-key ZIP is different; laptop restore/custody of user data is not confirmed. |
| Real-phone acceptance | Owner performs the short checklist below. Emulators and permission screenshots do not prove delivery under the phone's real background restrictions. |

Email recovery is intentionally deferred, not a pending release blocker. Signer transfer to the owner's laptop is owner-confirmed; laptop restoration is not proven. No new key is needed. Do not store the decryption password beside its encrypted backup; keep it separately in a trusted password manager and do not post it here.

## One phone checklist, after exact-file acceptance

1. Update the existing permanent-signed app, without uninstalling. Create one non-sensitive task, close/reopen, and confirm it remains and starts on Tasks. If Android reports signature incompatibility, stop; do not clear storage or force-install.
2. Test one notification and Alarm with the screen locked, then complete its task and verify future alerts stop.
3. Turn a non-sensitive voice example into an editable draft locally. After HTTPS works, separately consent to sending a synthetic **text** to GPT; check its status and edit/cancel/confirm. No action should happen before confirmation.

Rollback must not restore stale user/budget databases. Keep the previous binaries/backups; on the phone prefer a corrective same-signer higher-version update over forced downgrade/uninstallation. Do not rely on this unaccepted connected environment as the sole copy of important data or the sole alarm for critical deadlines.

[Detailed evidence and failed-attempt history](PERSONAL_HANDOFF_2026-10-10.md)
