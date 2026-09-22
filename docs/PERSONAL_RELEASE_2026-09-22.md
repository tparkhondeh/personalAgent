# Personal delivery acceptance — 2026-09-22

## Result and authorization

The current **Staging web is testable, not a completed phone delivery**. The owner now permits loss of OLD data inside their existing tia phone installation if a clean install is necessary. This does not permit deletion of server accounts/data, spend receipts, keys, backups or data subsequently added to the delivered app. Old guest/signed-in migration investigations no longer block independent work. No device was uninstalled or cleared.

Original signing material for installed preview40 remains unavailable. A specific question is pending: create a safely custodied permanent signing key, retain `ir.wealthos.personalagent.stable40`, and require one clean installation because signatures differ. No affirmative response has been received; no new signing key/package or delivery APK was created. This is distinct from the now-waived preservation requirement.

## Actual versions

| Surface | Observed state |
|---|---|
| Local source at start | Clean main `bbe2ab1b5f97a18c1231065540195045d1e2105e`, also remote main; implementation `8dcfea6e3f9f42d871c0c864c0206e2d3de1575b` |
| Local app | http://localhost:3001/ restarted from the main project on loopback, actual Tasks UI verified. This is the remote Windows host, not automatically the owner's physical laptop/phone. Funded GPT remains disabled locally. |
| Staging | https://personalagent.wealthos.ir:8443/ ; public health/current release both identify `8dcfea6e3f9f42d871c0c864c0206e2d3de1575b`. Existing owner-only GPT remains funded by one server ledger. |
| Production | https://personalagent.wealthos.ir/ ; still older application/cache behavior. Not deployed or presented as this delivery. |
| Released Android | `tia آزمایشی 40`, `1.0.40` / code40, package `ir.wealthos.personalagent.stable40`; unchanged and not this new final release. |

Historical APK40 [fixed download](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk): source `34180286b90008498c839f3ec3b4fd72749c750a`; SHA256 `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`; 60056269bytes. Verified signer fingerprint `4ca0dbc79a8db200028c7ff21951a6bae40b225604e29bc42bb39632a510e95c`. These identify the published file, not a new inspection of installed phone bytes. Do not substitute the emulator-only base-package APK, an unsigned file or a per-run `stableNN` package.

## Recovery before modifications

Private owner/SYSTEM-only Windows directory: `C:/Users/pc/Desktop/project-backups/tia-personal-release-20260922/`.

- Git bundle verified, separately cloned and checked with `git fsck`; source ZIP separately extracted. ZIP SHA256 `4be632a72b3043e8bdf2e9af847bc31cd8daf80c1bd701e8d5963dc8b6fc6315`.
- Live Staging database read-transaction SQL snapshot restored separately at13:50:11UTC: integrity OK,18tables, zero foreign-key failures. Environment/current-release backup is private, never committed.
- Before paid acceptance, the budget was independently snapshotted/restored with integrity and FK verification. Restored copies were never activated. Existing backups retained.
- Never restore old spending as application rollback. Keep the authoritative CURRENT receipts/unknown reservations; local stays FROZEN.

## Fresh verification

- Type Check, Lint, isolated production Build and production dependency audit passed. No known dependency vulnerabilities were reported; this is not an exhaustive security certification.
- Full serial suite: **1023/1023,87files,0skips**. Initial two-worker run did not complete seven authentication cases and is not counted as successful. All20login tests passed independently, then the full serial suite passed without weakening/skipping tests.
- Final JSON `artifacts/personal-release-20260922-tests-final.json` SHA256 `09fbb22805167da4bcb461593128aec891995142a24d036b612bed7fd9915a1b`.
- Real browser: public Staging Tasks startup at1280×720 and390×844; actual mobile screenshot clear/light/RTL, four dashboard boxes and navigation. Manual-create dialog exposes Persian date, actual00–23 hour choices and all three reminders. Dialog cancelled. tia textbox accepts synthetic typing; recording control/local-processing explanation visible. No personal microphone recording or guest record was created.
- Local initially had no listener. A hidden dev process was started from the actual main folder on127.0.0.1:3001; health succeeded. A fresh ordinary browser tab then displayed the real local Tasks UI, confirmed visually. Old error tabs/cache/cookies/storage were not cleared. Temporary viewport override reset.
- Public8443 app/login/API/worker/recovery have current no-store behavior; unauthenticated tasks401. Worker SHA `8be4e0bbf17a420fdd7e96e4493b8af4c457af67dd0f264d895821893935b68b`, recovery SHA `6418297394556299956bc98dab0c086157224883dfc5f5605eca9cf4d6bcb41d`. Public443 still advertises old page `s-maxage=31536000`, older worker and recovery404. No DNS/CDN/Production edit.
- Prior unchanged-source Android16 [CI35699728052](https://github.com/tparkhondeh/personalAgent/actions/runs/35699728052) and web/package [CI35699727856](https://github.com/tparkhondeh/personalAgent/actions/runs/35699727856) remain relevant; they are NOT fresh exact-delivery13/14/16, public GPT on Android or owner-phone acceptance. See [logo evidence](LOGO_PHONE_2026-09-22.md).

## Real GPT acceptance and shared spend

At13:55:57UTC, two paid synthetic text requests through public HTTPS8443 passed: meeting title,17:00, offsets1440/180/60, follow-up18:00 and revised title on the **same draft**; no task/meeting before confirmation; cancellation left business counts unchanged. No text-send consent used the local path. Existing September21 confirmed registration/idempotence evidence remains unchanged; this fresh paid test exercised draft/follow-up/cancel, not another real registration.

Temporary funding for the existing synthetic fixture was removed in a `finally` restoration; the exact prior staging environment and owner-only allowance were restored and service health verified. The owner's account was not impersonated. Existing replacement API key only; no personal data/audio or new provider credentials.

One active host/path-bound version2 server ledger:12receipts/$0.164434 → **14receipts/$0.167986**, zero pending; fresh increment **$0.003552** within the shared $2/month. Local cost activation is false and its old ledger remains FROZEN. These are project usage-accounting values, not a claim of a settled provider invoice. No consumption reset, independent local allowance, recharge or personal-audio activation.

Reference: [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits) distinguishes alerts from enforcement and notes enforcement delay; project-side reserve-before-send controls remain necessary. No provider billing setting was changed.

## Necessary independent repair: daily Staging backups

A read-only operator check found one existing02:17backup job, pointing to the old Production backup script; it does not cover Staging or its budget. Recovery-email approval and SMTP fields are absent. Staging data is writable; approximately7.98GB free, disk still97% used.

Added `scripts/backup-tia-staging.sh` and `scripts/qa-tia-staging-backup.sh`. Operator-only, no HTTP route: readonly SQLite backup, private owner directory, exclusive lock, free-space reserve, append-only unique generations, integrity/FK checks, separate restored copies and matching hashes. No user data, receipts or prior backups are deleted. Plaintext stays in a private same-host directory; no encryption/off-host claim.

Real Linux synthetic QA at14:13:17UTC passed source preservation, two independent retained generations, restored budget receipts, refusal of unsafe permissions/symlinks/missing or swapped databases, same-source input and concurrent execution. `bash -n` passed both scripts. The same synthetic acceptance is included in web CI; its report is uploaded without snapshot files. Shell scripts are outside ESLint's language configuration; ignored-file warnings are NOT shell-lint success. Dependencies were also found with cron's minimal `/usr/bin:/bin` PATH.

Installed identical tested script SHA `2a1e1cc96b914553fef82b20ad2d552a7d3617e840557cb7f16ce8b1913a2d76` under Staging private `backup-ops-v1`. Saved the prior user crontab both locally and on the server, checked it had not changed, appended **only** the `tia-staging-backup-v1` job at02:47server time and read it back exactly. Other cron entries untouched.

First actual generation `data/backups/daily-v1/snapshot-20260922T141439Z-xf7WSO` passed separate restore verification at14:14:39UTC; no app/scheduler/budget instance was started from restored data. Scheduled future execution has not happened yet; failures go to the private `backup-ops-v1/backup.log`. The guard preserves at least2GiB plus estimated copy space, fails rather than deleting old backups, and is not a disk quota/reservation against other server writers. Monitor storage growth; do not remove other projects or valid backups.

Rollback: remove only the crontab line marked `tia-staging-backup-v1`; keep scripts, snapshots, all other jobs and CURRENT budget. If the active ledger is relocated, explicitly update this job's budget target. No app deployment/restart was needed for the backup repair. Public health and the live budget were rechecked after activation: unchanged app commit,14receipts/$0.167986, zero pending and the same budget digest.

## Remaining gates / next actions

| Gate | Owner / exact next action |
|---|---|
| Permanent signing | Owner answers the pending specific key-creation question; then agent builds a non-debuggable clean-install candidate with retained package, secure key custody/backup and a future upgrade path. Old phone-data preservation is no longer a blocker. |
| Exact deliverable | Agent tests that same signed APK on13/14/16 and public-server Android flow, verifies private-key absence/endpoint/signature/SHA, then releases the verified bytes. No new APK is currently offered. |
| Real phone | After delivery: install as instructed; sign in; add/reopen/complete a synthetic task; test one Notification and Alarm while locked, cancellation, microphone-to-draft, offline/reconnect. Permission screenshots alone do not prove delivery. |
| Account recovery | SMTP delivery remains unconfigured/unapproved; owner/server operator must provide an authorized private mail/sender configuration and cap, then agent tests actual recovery. No password/key in chat. |
| Disaster recovery | Approve encrypted off-host destination/key custody; current verified private snapshots cover recoverable database damage, not loss of the host. No unsupported daily-use guarantee. |

The new offline/connected Android code is not yet in published40. Offline records and signed-in server records remain different stores; automatic online/offline reconciliation is not promised. GPT needs network plus explicit text consent; microphone/Notification/Alarm on the owner's phone remain unverified. Do not call the entire project or existing APK final.
