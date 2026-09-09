# Completed records: count-only presentation

## Source and recovery

Base `aaccd2b153bc4372ea9ba578e078fe822b443013`; clean worktree before edits. Implementation `34180286b90008498c839f3ec3b4fd72749c750a`.

Verified all-ref bundle and HEAD archive plus private environment copies: `C:/Users/pc/Desktop/project-backups/tia-completed-20260910`. Bundle SHA-256 `1a1f36ef60378a954fb370d8f2ffb3f2a7f5483f1880ddc575c84bdc236a4598`. Consistent SQLite snapshot `backups/local/hamrah-2026-09-09T22-44-04-489Z.db` passed `PRAGMA integrity_check`. No uncommitted user changes were present. No database migration, record deletion or history rewriting is part of this change.

Rollback restores the previous code release only; keep current user data. A prior UI would show completed records again. Local source can be extracted into a separate folder from the verified archive/bundle; never overwrite newer records with the backup.

## Behavior

- `selectDashboardScope` selects date/category/deduplicated records for numeric statistics. `selectDashboardItems` additionally excludes completed records. The generator shares the exact implementation between React and Android, including recovery's embedded runtime.
- Today, Tasks, calendar entries/markers and remaining counters exclude completed tasks and meetings. Completed statistics retain the selected date/category scope; no new completed-list, archive or tab.
- Completed records remain stored with their existing status. Reload/server reads do not convert DONE to an active status.
- Offline completion cancels native notification IDs and serializes repeated clicks with an item-level lock; completing twice cannot reopen an item. Existing server completion cancels pending reminders/escalations and native reconciliation removes obsolete device alarms. Delivery already in progress on an unreachable device is not claimed to be remotely revoked instantly.
- AGENTS and DEVELOPMENT_RULES persist the owner's preference: short, simple Persian; technical detail in documentation.

## Verified locally

- Type Check, Lint, isolated production web Build: passed. 276 Vitest tests across 41 files, including shared generated-runtime scope and JSON reload invariants.
- Dedicated HTTP checks: 26 successful requests with synthetic UI fixtures; task and meeting with three approved alarms each, concurrent repeated DONE, durable status, counts, and cancellation/no replay of urgent escalation. Existing agent approval suite: 27 checks passed.
- Additional fresh-account smoke attempts hit the configured five-signups/hour limit after exploratory fixture failures. Security limits were not weakened or cleared. The full clean, schedule-preservation, approval and completion suites subsequently ran on CI's isolated fresh database before Android build.
- Actual browser: 1280×720 desktop and 390×844 mobile. Completed personal, business and meeting fixtures via visible controls. All active rows disappeared, final Tasks counters were 0 remaining / 6 completed (2 per category), retained after reload/new tab. Today retained its own date scope. Calendar had no completed entries; mobile had no horizontal overflow. Screenshots were visually reviewed. Synthetic login was signed out after testing.
- Bundled offline interface at port 3012: created a distinct dated fixture, completed through its button, reloaded, checked retained numerical count and absence from Tasks/calendar. Older fixtures were preserved. Native notification behavior is separately gated by the exact-APK emulator run.
- Browser viewport override only became effective on the visible/current page; dimensions were read from `innerWidth` before accepting mobile evidence. Initial stale screenshots were not used as final proof.

## Verified release 40

[Build and Android 13/14/16 run](https://github.com/tparkhondeh/personalAgent/actions/runs/34414607065) succeeded on all three APIs. Each: 11 native tests, five dashboard/retained-completion/rapid-click checks across cold launches, three scheduled native reminders cancelled on completion, 27 clear system-UI checks and 11 clear Logcat checks. Twelve actual screenshots (light, dark, keyboard, SSL recovery × three APIs) were visually reviewed without white pages or system-error overlays. Network-enabled runner access to Staging remained unavailable; bundled behavior and recovery were tested separately from connected HTTPS Staging. Diagnostic DNS/server/SSL variants are separate failure fixtures, not the published binary.

Build gates also passed Android Lint/unit tests, dependency audit and all four server suites on a clean database: 27 approval, 8 schedule preservation, 11 login/interface and 23 completed-items checks. Downloaded APK SHA-256 matches metadata: `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`, 60,056,269 bytes. APK `app.js` and `content.js` match the reviewed local source after CRLF/LF normalization. Name `tia آزمایشی 40`, package `ir.wealthos.personalagent.stable40`.

[Permanent APK download](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk) published 2026-09-09T23:17:20Z. All 17 draft assets (APK, server archive, metadata/checksums and 12 screenshots) matched GitHub's SHA-256 digests before publication. The public versioned link was downloaded again without authentication and matched the exact tested APK hash. The APK was not rebuilt after testing. Debug-signed preview; real-owner-phone acceptance remains untested. Preserve older app installations/local data: a new package ID does not automatically migrate their offline records.

## Staging

The matching Linux archive SHA-256 `0637da90c6423a16666aaf9ae992724bf4b68833db22397ae9cb2e5d7936bae1` was deployed with the existing staging-only deployment script. Verified backup: `/home/wealthos_dev/.staging/personal-agent/data/backups/pre-release-20260909T230636Z`. Prior release retained: `389840d2474b69a44cb0874517541e25636e8f1c`. Initial cold-start connection refusal recovered within the normal health wait. Final HTTPS `/api/health` reports `34180286b90008498c839f3ec3b4fd72749c750a` and connected database.

The same dedicated 23 HTTP checks passed against HTTPS Staging with a synthetic account. Scripts are preserved in private `completed-40-qa` under staging for traceability. No owner records or Production config were modified. Restore the prior staging release using the existing rollback procedure, retaining the current database and stopping the staging scheduler until the older code's alert compatibility is reviewed; never roll back newer data by copying the database snapshot over it.

Direct GitHub/Staging TLS connections from this workstation failed. A temporary loopback-only SSH SOCKS relay through the owner's existing server restored TLS-validated connectivity; no certificate check, authentication control, firewall, DNS or Production setting was changed. Staging's prior health was verified separately from user-phone reachability.

That relay is a temporary tool transport, not an application/tunnel dependency. The app still uses the stable HTTPS Staging address and its bundled offline fallback. The GitHub download-artifact action emitted a nonblocking deprecation warning about its declared Node runtime; all gates ran successfully under the runner's Node 24. Updating that pinned action can be handled separately without claiming it was changed here.
