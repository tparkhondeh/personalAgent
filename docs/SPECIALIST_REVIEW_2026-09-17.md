# Final specialist review — 2026-09-17

## Scope and preserved state

Personal daily-use readiness, not feature expansion or store publication. Four actual subagents reviewed UX (McClintock), Android (Hooke), backend/data (Halley), and assistant/security (Newton). The coordinator integrated changes and performed QA/release checks. Specialists had disjoint write ownership; important fixes received independent review. Baseline was clean `main` at `372995d7857eddb1f38fcef0b4ba8a8fb5241e69`, matching origin/main.

No Production/Staging configuration, operational key, signing identity, real account data or monetary ledger was changed. No paid GPT request or personal audio/context egress was performed. The Sep16 clean start was not repeated.

Private recovery backup: `C:/Users/pc/Desktop/project-backups/tia-specialist-review-20260917/` (owner-only ACL). Git bundle/source and private configuration copies retained. Bundle was restored to a separate bare repository and verified with fsck/HEAD. A consistent SQLite backup was restored into a separate file; all 18 tables, integrity, foreign keys and migrations passed.

Verified database snapshot SHA-256: `f14d1ebf3cdbcbf5c9933f323f00431aaf5f7f5f89b40e346bce0bb42f7a934c`. Backup and restore evidence are private, outside Git. No legacy PROCESSING reminder/escalation rows were present in this local snapshot; this does not prove remote databases have none.

## Essential findings and changes

| Area | Confirmed issue / impact | Correction and independent review |
|---|---|---|
| UX/data | A stale guest tab could overwrite newer local items; sessionStorage denial could break compose | Cross-tab lock plus snapshot conflict check; retain unsaved editor. Guard storage access. Android specialist reviewed UX fixes. |
| UX/time | Manual task title edit could use start instead of due time; week depended on device timezone | Separate task/meeting moment; Tehran calendar-day week arithmetic; fixed-zone boundary regressions. |
| Assistant | Late reply could erase a new compose value or cross owner/unmount boundary | Abort/request/owner fencing and input equality check, including voice path. |
| Backend | Unrelated edits could replay reminders; PATCH/DELETE retry lost native cancellation details | Preserve pending slots and delivery history; return owner-scoped durable cancellation IDs on success/retry. UX reviewer independently checked backend receipts. |
| Native alerts | Completed/deleted items depended on another network fetch to cancel alarms; delayed scheduling/ID collisions could acknowledge the wrong alarm | Consume mutation receipt locally, scoped original-ID tombstones, hash-collision rejection, post-await acknowledgement checks. Android/security specialists independently verified. |
| Worker | Crash/retry could leave processing stuck or repeat a transmitted alert; false Push result could count as delivered; title change could restart escalation | Atomic deterministic in-app delivery with terminal/uncertain external marker; do not resend unknown Push/call; per-target results, ownership/completion recheck and meaningful schedule receipts. Independent security review found an additional seeding race; final evidence below records its resolution. |
| GPT budget | Settlement crossing a month did not advance the clock rollback guard | Advance watermark in same settlement transaction; fresh-process/rollback regressions. No existing spend receipts modified. |
| Proposal clarity | Broad filtering dropped legitimate questions containing «مدت» | Match only exact resolved boilerplate; preserve real ambiguity. |
| Android preservation | Endpoint change cleared WebStorage/cookies/history | Clear code cache only; Java and actual-WebView preservation tests added. Origin retention does not automatically migrate accounts between origins. |
| Android sound | API24/25 channel creation rejected supported legacy devices | Exact three tia sound IDs use alarm stream via a pinned Capacitor patch; normal notification volume/permissions remain untouched. No OS restrictions bypassed. |

## Verification

- Baseline: 752 tests / 75 files; production dependency audit: 0 vulnerabilities (411 dependencies).
- Final full behavioral suite: **961 tests / 82 files passed**. Final Type Check, full ESLint and isolated optimized Next build passed after atomic seeding. An interim test-fixture TypeScript error was corrected, not waived; its 50 worker tests passed again after the type-only correction.
- Atomic seeding correction: candidate selection is advisory only. Task ownership/due/status, current policy, unconsumed schedule receipt and insertion are all re-read in one per-task transaction. Five checked-in regressions and eight independent synthetic reviewer scenarios passed; no stale chain was inserted after a concurrent due edit.
- 202 real HTTP assertions passed on a disposable SQLite database: cache30, assistant36, schedule8, clean account11, create/retry52, completion23, independent security28, history/cancellation14. Exact-origin rejection, owner isolation, explicit approval, three reminders, cancellation and retained statistics covered. No external providers invoked.
- Isolated build and QA host: `http://127.0.0.1:3002`, deliberately different cookie host from owner `localhost:3001`. Only `@example.invalid` users; original data not copied into this runtime. Synthetic data retained for diagnosis.
- Actual browser, desktop and 390×844 mobile: login, compact readable approval card, Persian date/17:00, three reminders, follow-up title correction, explicit registration, completion disappearing with statistics retained, manual title editing, and success return to Today inspected. Reload retained the changed title/time and completion; calendar showed the correct 21–27 Shahrivar week. DOM width390/client390, no horizontal overflow, and no captured browser error logs. Screenshot showed real Persian UI, not merely a live process. Real phone keyboard/background behavior remains a separate gate.
- Android local `lintDebug`, `testDebugUnitTest`, `assembleDebugAndroidTest` succeeded (11 Java unit tests). Instrumentation compilation is not execution; 13/14/16 run results must be recorded separately. No API24/25 emulator/audio delivery claim.
- GPT price basis checked against the [official GPT-5 mini model page](https://developers.openai.com/api/docs/models/gpt-5-mini): $0.25 input / $0.025 cached input / $2 output per million tokens. Existing monetary guard is application-enforced, not a provider-enforced bill ceiling; verified live GPT evidence remains Sep15 local synthetic testing, not this review or phone activation.

## Runtime/version boundaries (read-only checks)

Checked Sep17 03:41 UTC: Staging loopback3010 healthy at `2d4484c75aeb7a24a9fc14b5ecddb6a2b80b9f87`; Production loopback3011 healthy at `49cceed`. Both public 443/8443 `/sw.js` responses showed CDN HIT, max-age14400 and `microphone=()`; cross-port policy conflict remains. Healthy origin is not verified mobile HTTPS/end-to-end delivery. No server change made.

Latest released phone binary remains **tia آزمایشی 40**, 1.0.40, package `ir.wealthos.personalagent.stable40`, source `34180286b90008498c839f3ec3b4fd72749c750a`, SHA-256 `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9` (60,056,269 bytes). [Version-specific download](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk). It does not contain this review's source/native fixes and is not relabeled final.

APK40 original certificate `4ca0dbc79a8db200028c7ff21951a6bae40b225604e29bc42bb39632a510e95c` differs from local debug certificate `4719b4f61ca80d09e9f94859f9a954c0a8570bb8fee233dec23a30260b77cc47`. No incompatible APK is offered as an in-place upgrade. Internal emulator builds/new package IDs are diagnostic only, never a data-preserving phone update.

## Remaining release gates and rollback

1. Server owner/authorized deployment: fix per-subdomain HTTPS/routing/cache/microphone policy and verify both network paths. Shared CDN changes and Production require explicit approval. Back up configuration first; revert exact previous vhost/Page Rule and restart only the affected service if validation fails.
2. Coordinator + owner: recover the original signer or agree to a tested export/import migration. Never uninstall/clear the current phone as a default. Signing/package/origin changes are not implicitly authorized.
3. Authorized GPT cutover: map the real server account, preserve existing spend and stop the old funded instance before using one authoritative $2 ledger on the destination. No copied independent budgets. Raw audio remains unapproved/off; text requires explicit in-app consent.
4. Owner one-time phone acceptance, after safe candidate: upgrade without data loss, create/complete a synthetic item, verify Notification and Alarm while screen locked, verify offline/reopen, and verify visible real GPT/local labels. Emulator success does not replace this.
5. Operational recovery: approve/setup off-host encrypted backup custody and account-recovery delivery if required for unattended daily use. Same-host verified restore is not disaster recovery or an operational recovery inbox.

Code rollback must use a normal revert/new commit, not reset or deletion. No schema migration is introduced here. Do not restore an old data snapshot over newer real work or rewind the monetary ledger. Keep uncertain external delivery receipts; blind resend risks duplicate alerts/cost.

Conclusion: source hardening and isolated QA can complete independently. Phone release and full daily-use acceptance remain gated; no 100% or safe sole-copy real-data claim.
