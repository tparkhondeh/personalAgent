# Personal-use handoff — 2026-09-16

## Outcome

Not ready to treat the installed phone app as the sole store for real information. Store publication is deferred and is not the blocker. Local, Staging, Production and APK remain different deliverables. No Production/CDN rule, phone storage, signing identity or GPT credential was changed.

## Fresh checks and independent repair

- Starting local/remote main: `68ae36890993e678d661a2d3ceb9071f48f72f57`; application source previously `b841d89c7de4fef86e7cb04b3841f128ed1ceed6`. Local3001 was stopped; restarted from the correct checkout and verified in the browser at1280×900 and390×844. Mobile document width390, scrollWidth390, scale1. Guest data was retained, not reset.
- Browser QA exposed a real mismatch: a meeting reviewed as NORMAL appeared IMPORTANT. Meeting lacked a stored priority; the dashboard and manual form forced IMPORTANT. The additive migration preserves that old display default for legacy rows, while new manual/assistant writes now store the reviewed priority, including recurrences and updates. Partial updates do not reset omitted priority. Bundled offline already stored selected priority; regression tests now explicitly verify all three priorities through storage reload. Meeting escalation remains restricted as before; this repair does not authorize any additional alert.
- Fresh local checks: Type Check, Lint, isolated production Build and **751 tests in75 files** passed. HTTP safety/planning28 checks passed before repair; after repair,46 retry/CRUD checks and36 confirmed-assistant HTTP checks passed. These include exact priority persistence, draft update, recurrent meetings, no effects before confirmation, ownership, cancellations and duplicate prevention. All external processing was disabled for synthetic accounts.
- Existing Android evidence remains separate: released40 passed13/14/16 historically; internal42 also has prior exact-binary evidence but is not a compatible update. No fresh Android binary is claimed in this handoff. The priority repair changes server/web behavior, not bundled native code.

## Verified preservation

Private owner-only directory `C:/Users/pc/Desktop/project-backups/tia-personal-handoff-20260916/` contains source ZIP, environment backups and a complete Git bundle. A separate bare restore passed `git fsck --full` and resolves the original HEAD.

SQLite snapshot06:52:45UTC restored separately, integrity/FKs and all18 table contents matched. Before the priority migration, a new07:11:35UTC snapshot was taken. Migration was tested twice on a private copy: all17 business tables retained their previous columns/rows; existing meetings gained only default IMPORTANT; integrity/FKs passed. Source snapshot SHA `5e80ee3772ebcb3ae0b4af28f8591e160610f25f80cf8bf94ede66bad5e78fe5` stayed unchanged. Only then was local migration applied. No historical priority was inferred from old drafts.

On the server, a new consistent Staging snapshot and a copy of the existing production nightly backup were independently restored and verified on the same host at07:02:42UTC. Private directory: `/home/wealthos_dev/.staging/personal-agent/handoff-backup-20260916-LTSd2e`. The live Production DB was not changed. Nightly02:17 same-host backups exist; latest observed source `hamrah-20260915T224701Z.db`. This is not approved encrypted off-host disaster recovery.

Clean-schema preparation is separate from running an owner account: do not replace an existing database with it or call it a delivered clean service. No sample data or new owner credentials are seeded.

## Fresh external evidence

- Staging3010 initially served `b841d89...`, DB healthy. Public8443 still failed normal TLS negotiation from Windows. Server-side8443 fetched200; this does not prove phone accessibility. No certificate verification was bypassed.
- Production443 now returns200 for health over normal TLS, but current release is still `49cceed`, with no buildCommit in health. Response policy still has `microphone=()`. Production service is3011, not3000 (another application).
- At06:59–07:01UTC, origin3010 `/sw.js` hash was `e00e53b1890e57bfee548a40f17eb65f61b929db51e7b7dd11148a4a09c47c0c`, origin3011 hash `4440f79593219fb07ce1785e1f2bb1b08aa54a157c034c99950d9e02b258ddbc`. Public8443 returned the Staging hash with EXPIRED and `max-age=14400`; public443 returned that SAME Staging hash with HIT despite its older Production origin. Previous evidence showed the reverse. Cross-port shared caching persists; do not equate a matching response once with a fixed cache policy.
- Ticket52407 was reopened read-only. Last visible reply remains1405/6/22 15:12:16: page rules do not support port conditions; provider reports an external8443 network issue. That reported cause is not independently proven. No message or rule was submitted.
- Exact owner-email lookup: one matching Staging account, different database ID from local; no matching Production account. No email, account IDs, password hash or user records were published. Local confirmation is not a license to allowlist an unrelated server ID or silently move existing records.
- Local GPT configuration and authoritative monthly ledger were checked without a new paid call: owner eligible, other accounts denied, raw audio disabled, $2 monthly limit, $0.156237 accounted including prior reservations. This is not the provider invoice. Staging/Production have no configured GPT key/cost approval. Prior real-response evidence remains in [GPT handoff](GPT_MONTHLY_USE_2026-09-15.md). Do not copy a funded ledger into two independently active runtimes.

## Release identification (not a new final version)

Latest release metadata and local delivered APK bytes still match:

- Name: `tia آزمایشی 40`; version1.0.40; package `ir.wealthos.personalagent.stable40`.
- Source: `34180286b90008498c839f3ec3b4fd72749c750a`;60056269bytes.
- SHA-256: `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`.
- [Existing APK40 only](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk), prerelease published2026-09-09T23:17:20Z.

The known local signer differs from APK40. Never offer42/new package as a data-preserving in-place upgrade. Original compatible signing material or a separately approved/tested preservation path is required. Asked owner for installed version and whether phone-only records exist; no answer at this checkpoint. Do not uninstall, clear storage or switch endpoints to diagnose.

## Remaining gates, owner and rollback

| Gate | Required action / responsible party |
|---|---|
| Stable correct phone endpoint | Owner approval for precisely scoped final443 deployment/cache changes; manager/CDN access where required. Changes must affect only `personalagent.wealthos.ir`, not other projects. |
| Owner data and GPT on that endpoint | Decide the actual final account/database after read-only comparison. Preserve all existing DBs; separately review migration if necessary. One-host credential/ledger cutover with local paid egress stopped first, validated receipt transfer and no budget reset. Engineering after endpoint/account approval. |
| Upgrade and offline records | Owner confirms installed version/data. Recover matching signing material or approve/test a separate preservation route before building a replacement. Existing APK remains installed. |
| Recovery and ongoing backup | Approved private SMTP/sender or another documented secure owner recovery procedure; approved encrypted off-host destination/key custody and scheduled verification. Same-host snapshots alone do not cover host loss. |
| Phone acceptance | One check after final endpoint/compatible build: prior records persist across reopen; one confirmed Notification/Alarm while locked; completion cancels it; local voice leads to editable draft; offline/reconnect is labelled and does not lose records. |

Proposed Production approval boundary (not executed): back up the exact hostname rules/current release/consistent DB; bypass shared cache for its HTML, account/API and worker routes and invalidate ONLY those paths; deploy the tested release to the selected final endpoint/account with preserved data. Risks: brief interruption, re-login, cold-cache load and migration incompatibility. Roll back application/rules using preserved versions, pause affected schedulers, retain newer DB writes and all spend receipts; never overwrite them with an old snapshot. Shared-domain rule or broad purge requires a narrower plan, not assumed authorization. Do not combine this approval with store publication, new charges or raw-audio sending.

[Local test](http://localhost:3001/) is available. [Staging](https://personalagent.wealthos.ir:8443/) is not reliable from this client. [Production](https://personalagent.wealthos.ir/) is old, not the delivered candidate.
