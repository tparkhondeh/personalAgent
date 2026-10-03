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

## Final results of this review

- **Deployed Staging code:** `e541cfa10c464a25057bde1994522af87b5add39`, after successful [CI 37123269076](https://github.com/tparkhondeh/personalAgent/actions/runs/37123269076). Verified Linux bundle SHA-256: `c4db978412430e008927ef49430252a30e35b985c39edf85e5e56b16255e26f8`. Packaged-server HTTP tests cover consent/confirmation, draft ownership/revision, retries, completion, cancelled reminders, account isolation and cache policies; synthetic backup/restore also passed.
- Before deployment a fresh application/budget snapshot and separate restore were verified. The first attempt stopped before any remote change; a verified retry deployed successfully. Budget inspection was byte-for-byte unchanged across deployment. Previous releases remain available; rollback means prior code, **never restoring old user data or spending records**. Production, domain settings and Android identity were not changed.
- Real desktop browser and 390×844 mobile viewport: remembered synthetic login redirects to Tasks; Persian/RTL layout; Jalali month picker; genuine 00–23 hour and 00–59 minute controls; explicit-date Persian request with 17:00 and three reminders; title correction on the same draft; double-click confirmation creates one meeting; reload preserves it; completion removes the row while keeping the completed count. SQLite readback: exactly one DONE meeting and three CANCELLED reminders. Manual creation shows `done — ذخیره شد.` and returns to Today as designed; ordinary cold entry is Tasks. Mobile submit remained visible with a 46px touch height and no horizontal overflow. This viewport test is not a physical Android keyboard test.
- After synthetic browser acceptance the isolated 3003 process was stopped and its data retained. The reviewed production build is now running **loopback-only** on [localhost3001](http://localhost:3001/) on this Windows development VM, with the existing local database/settings and no separate GPT funding. Health and HTML passed; this link is not a phone or personal-laptop public address. The synthetic test used a separate database and port, but localhost cookies are host-scoped: a fresh owner sign-in may be needed locally. No cookie/cache clearing was performed. Future login QA must use a separate browser profile or distinct hostname, not rely on port isolation alone.
- Local-language boundary observed, not concealed: `سه روز دیگر ... یک روز و سه ساعت و یک ساعت قبل` leaves the date unresolved and extracts only the final explicit reminder. The inline required-date error blocks confirmation, and cancellation creates no record. An explicit Jalali date and a separate `قبل` for each reminder work; users must review/edit a local proposal. GPT correctly handled the relative-date request in the real test below. This is a parser limitation, not a promise to understand arbitrary Persian or a reason to silently infer missing dates.
- **Two real synthetic GPT responses succeeded through public HTTPS8443 from Linux** at 12:42 UTC: correct title/time/three reminders, same-draft correction, no write before approval, idempotent confirmation, completion and cancellation. Synthetic funding was removed and the exact owner-only configuration restored. Before/after restart and receipt preservation checks passed. No personal text/audio was transmitted.
- Read-only stored synthetic draft verification also confirms the relative date `2026-10-06` (three days after October3), revised time `18:00`, and offsets `[1440,180,60]`; no extra paid request was made for this check.
- New test spend was **$0.002891** (conservative local ledger, not a provider invoice). October has 2 receipts/$0.002891; all September 16 receipts/$0.171895 remain unchanged. Historical total is $0.174786/18 receipts, zero pending reservations. The single $2/month authority remains active only on Staging, local remains frozen/unfunded.
- Postflight 12:44 UTC verifies the new build publicly and at origin, matching worker SHA `906330f60c11638c4c4bdbedeae1ecc22029d46d69c49226d49bfda38a572e22`, owner-only funding and no external audio. Recovery remains `available:false`; approval, SMTP host/user/password/from are not configured. Windows still gets `ECONNRESET` before TLS on8443 while443 responds. The actual public browser still shows connection recovery after deployment. Server GPT success does **not** establish connected Android success.
- Fresh [internal Android16 CI 37123269028](https://github.com/tparkhondeh/personalAgent/actions/runs/37123269028) also passed; cold/main screenshots were inspected and show Tasks, correct RTL and no system-error overlay, with clean app/system log checks. Its target is the isolated emulator server `10.0.2.2:3001` and debug package, **not** the released APK, public8443 GPT or a phone install. No internal APK is offered for installation. Unchanged released44 exact-binary 13/14/16 evidence is reused separately.

### متن کوتاه برای مدیر سرور/CDN

در ۳ اکتبر۲۰۲۶ حدود۱۲:۴۴UTC، آدرس `https://personalagent.wealthos.ir:8443/` از Windows توسعه با Node و Schannel پیش از تکمیل TLS قطع می‌شود؛ مرورگر واقعی نیز صفحه «اتصال برقرار نیست» نشان می‌دهد. همان آدرس از Linux با اعتبارسنجی عادی گواهی، نسخه `e541cfa` و پاسخ۲۰۰ می‌دهد؛ مسیر۴۴۳ از Windows پاسخ می‌دهد ولی کد قدیمی دارد. لطفاً مسیر TLS همین زیردامنه/پورت را از شبکهٔ متاثر با مسیر موفق مقایسه و لاگ edge/firewall را بررسی کنید. علت هنوز به‌طور قطعی به CDN یا سرور نسبت داده نشده؛ بازبودن پورت یا پیشنهاد خاموش‌کردن کش اثبات رفع آن نیست. DNS، پورت مقصد، گواهی و کش/ورود کاربران بدون بررسی تغییر نکنند. پس از اصلاح، صفحه واقعی و GPT از گوشی دوباره آزمایش شوند.

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

چک‌لیست یک‌باره گوشی، پس از رفع اتصال: یک مورد ساختگی ثبت و برنامه را ببندید/بازکنید؛ یک Notification و Alarm را با صفحه قفل بررسی و سپس لغو کنید؛ صوت کوتاه را به متن تبدیل و یک درخواست ساختگی GPT را با اجازه ارسال متن تا پیشنهاد پیش ببرید، بدون تأیید اجرا. نتیجه را بفرستید؛ اطلاعات واقعی یا رمز لازم نیست.
