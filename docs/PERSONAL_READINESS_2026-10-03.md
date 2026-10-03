# Personal readiness — 2026-10-03

This is an evidence-based checkpoint, not full real-phone acceptance. Current user data is real; no cleanup, new signer, account reset or Production deployment is authorized by this review.

## Independently completed

- A private source bundle was verified and restored to a separate checkout at `21c79aded90d499bbeee934fbd4b45c03597686d`. The local SQLite snapshot restored separately with integrity, foreign-key and migration checks. Synthetic encrypted backup/restore, wrong-password rejection and overwrite protection passed. Evidence is outside Git under `C:/Users/pc/Desktop/project-backups/tia-final-20261003/`.
- Production dependency audit found 19 advisories (1 critical, 6 high, 9 moderate, 3 low). Updated Next and eslint-config-next to 16.3.6, nodemailer to 10.0.9, and narrowly overridden affected fast-uri 3.x to 3.1.8 and undici 7.x to 7.29.1. The new production audit reports zero advisories. The application does not import `next/og`/`ImageResponse`; an advisory is not evidence of exploitation.
- Added a CI gate against known high/critical production dependency advisories. No business logic, stored data, Android bundle or permanent signing identity changed.
- Patched local Type Check, Lint and production Build passed. Full serial test run passed **105 files / 1446 tests, zero skipped**. Two-worker runs hit the existing login-suite setup timeout on this Windows VM; the isolated login suite passed 20/20 and the complete one-worker run passed without changing tests or timeouts.

Official advisory references: [Next.js](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Nodemailer](https://github.com/advisories/GHSA-v53p-9fqp-m79j), [undici](https://github.com/advisories/GHSA-w293-vg96-wgc3), [fast-uri](https://github.com/advisories/GHSA-qw65-cvwx-89v3).

## Fresh environment checks

| Environment | Observed result before this deployment |
| --- | --- |
| Source | baseline `21c79ad`; targeted dependency/CI fixes above |
| Local 3001 | not running at initial check; do not advertise as available |
| Isolated local 3003 | synthetic database only; production-build browser acceptance in progress |
| Staging 8443 | deployed `3b2b24028346ce50a22959de72cac8c5c28b95cc`; Linux public requests return current pages/health/worker; guest tasks 401; private no-store policies |
| Windows client 8443 | Node resets before TLS, Schannel handshake fails (also TLS1.2), actual browser displays connection recovery after retry; exact edge/network cause not confirmed |
| Production 443 | reachable but old build, old worker, HTML `s-maxage=31536000`, recovery endpoint 404; unchanged and not the current APK destination |
| Physical phone | no authorized ADB device visible on this VM; actual phone GPT/notifications/Alarm/background acceptance not established |

Origin/server-side public success is **not** client TLS success. Do not disable certificate checks, clear user storage, silently change the APK origin to 443 or alter shared domain/network settings. Admin/CDN should investigate the failing client-to-8443 TLS path using the timestamp and compare with working Linux requests; no speculative server port/DNS change is prescribed.

## Backups and account recovery are separate gates

- Server space is now approximately **33.45 GiB free / 84% used**; the old 99% space blocker is no longer current.
- The existing, scoped daily application-and-budget backup schedule is active. Four most recent scheduled runs succeeded. The 2026-10-02 snapshot checksums and separately restored application/budget SQLite integrity and foreign keys passed on October 3. These are private **same-server** snapshots, not encrypted off-server disaster recovery.
- The owner confirms the encrypted **signing-key** backup file is on their personal laptop and its password has been saved separately. This is owner-reported transfer/custody, **not** verified restoration on that laptop. The September 29 separate-process/no-DPAPI restore and signer verification remain valid on the original host. No new key was created or secret requested.
- Signing-key backup does not protect user task databases. An approved secure destination/access for scheduled encrypted off-server user-data backups is still needed; no personal-data upload was performed.
- Staging `/api/account-recovery` returns `available:false`. Approved recovery-mail configuration and delivery acceptance remain necessary; do not claim tested password recovery from unit tests alone.

## GPT and budget

Before new real calls, the sole active server ledger contains 16 preserved receipts totaling **$0.171895 for September**, no pending reservation. Local funding remains false and its old ledger remains FROZEN; the local ledger's historical subset must not be counted again or activated. Monthly allowance remains one total **$2**, including tests. No personal audio is authorized.

The configured model is `gpt-5-mini`; the implementation's conservative $0.25/M input and $2/M output pricing matches [official pricing](https://developers.openai.com/api/docs/models/gpt-5-mini). Its listed snapshot retirement is **2026-12-11** ([official deprecations](https://developers.openai.com/api/docs/deprecations)); schedule a separate, tested model/pricing migration before then, not an unreviewed model substitution now. Online replies must be distinguished from local parsing and require separate text-send and execution consent.

## Exact APK retained

- Name/version: **tia 1.0.44**, code 44, personal prerelease.
- Package: `ir.wealthos.personalagent.stable40`.
- Source commit: `6cd6e5902b9e1d47cda7f6b108c39b20165a87ce`.
- [Permanent download](https://github.com/tparkhondeh/personalAgent/releases/download/personal-1.0.44/tia-1.0.44.apk).
- Size: 59,368,563 bytes.
- APK SHA-256: `fa62f5b0f9e55270fc78f01dc16441162a7ba0e13337a81d8c24d2fcbfbfa377`.
- Signer SHA-256: `abfd097ac3ab887977fb58505b5ae0e40c1fc5b56bf210597476105278f1e3cf`.

Fresh public download, hash, package/version and signature checks passed. Existing exact-file Android 13/14/16 and 43→44 persistence acceptance remains valid; see [44 handoff](PERSONAL_44_HANDOFF.md). Server dependency patches do not change bundled offline assets, so no new APK or identity is needed. Offline and account data are separate stores, not automatic synchronization. Never reinstall over an incompatible signer by deleting today's real data.

## Remaining owner/admin acceptance

1. Admin/CDN: make the existing verified-HTTPS 8443 destination reachable from affected clients, without weakening TLS. Then retest actual connected Android, not only server health.
2. Owner/admin: provide an approved secure off-server user-data backup destination; verify encrypted restore separately. Laptop signer custody is not a substitute.
3. Owner/admin: configure approved recovery-mail service and verify delivery/account recovery.
4. Owner on physical phone, once connectivity works: save a synthetic item, close/reopen; check a notification and Alarm with screen locked and acknowledge/cancel; test microphone transcript and consented synthetic GPT proposal without executing it. Emulator results are not these checks.

Until these essential gaps close, use 1.0.44 for supervised personal testing, not as the only copy of important information or sole critical alarm. Production is not promoted by this report.
