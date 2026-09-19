# Server resume — 2026-09-19

## Result and authorization boundary

The owner reported the server issues resolved and renewed the limited tia activation/upgrade authorization. Fresh evidence confirms **disk capacity recovered**, but does not confirm public-client TLS/cache recovery. Only isolated Staging was updated. No shared DNS/CDN settings, Production deployment, key transfer, live budget handoff, new signing identity, phone installation, or Release publication occurred. No user data, backups, source history or temporary files were deleted; there was no demonstrated need for cleanup after capacity recovered.

## Verified preservation

- Private owner-only backup: `C:/Users/pc/Desktop/project-backups/tia-server-resume-20260919-1038/`. Git bundle restored into a separate bare repository and `fsck --full` passed; source archive, current environments and existing encrypted credential preserved. Working tree was clean at start, main/origin `dd4bf07358c727db7c13eff519076861dcc74442`.
- Local app snapshot restored/migrated separately with all18 existing tables unchanged, integrity/FKs OK. Snapshot SHA-256: `f14d1ebf3cdbcbf5c9933f323f00431aaf5f7f5f89b40e346bce0bb42f7a934c`. Evidence: `backups/local/restore-drill-7EckJH/verification.json`.
- Consistent read-transaction Staging dump over verified SSH was restored locally at10:37:20UTC:18 tables, integrity OK, zero FK errors. Environment/current-release pointer retained privately. Exact approved local email again matched one Staging account; IDs differ and the mapping is private. No personal session was impersonated or personal context sent.
- Monetary backup restored byte-for-byte:6 receipts,156237 microUSD, zero pending. Final read-only ledger digest still `1f24c2f8fa3b57e6a518f8cb36508e1756e950df7ac6b4eea444db5b5c33dd9d`, version1/LEGACY, not halted. No new paid calls or separate allowance were created. Existing local GPT and the single $2/month ledger remain in place; transfer is still **prepared, not executed**.

## Deployment actually completed

At10:32UTC the server reported18,499,132KiB available (92% used), instead of zero. A private0700 upload directory was successfully created. After deployment it still had18,276,304KiB available.

The previously verified Linux package from [web CI35188159724](https://github.com/tparkhondeh/personalAgent/actions/runs/35188159724) was rehashed before upload: `52448ec36e967d4afa9a480e77354e7feba358bb8d1f5e83f1cc090de5b6cfde`. Source and deployed Staging commit: `4838bd4bf1cb36ecdcbf31260d0157bc895c2c9c`.

Deployment used the reviewed `scripts/deploy-staging-release.sh` only. Fresh remote backup and a separate migration-check copy passed before the switch. Remote backup: `/home/wealthos_dev/.staging/personal-agent/data/backups/pre-release-20260919T104103Z`. Previous release retained: `2d4484c75aeb7a24a9fc14b5ecddb6a2b80b9f87`. Initial connection refusal during restart was followed by healthy exact-commit response; it was not treated as final failure/success by itself. Public8443 `/api/health`, as fetched from the Linux server, confirmed the exact new commit at10:42:04UTC.

Rollback: switch tia Staging code to the retained previous release and pause the scheduler if policy compatibility is uncertain. Do not restore an older database over new user writes. Since no budget transfer occurred, no budget rollback is needed; if a future cutover has occurred, use the forward-only monetary procedure in [the cutover guide](GPT_SERVER_CUTOVER_2026-09-17.md), never a pre-spend snapshot.

## Fresh verification and remaining connection evidence

- Fresh local Type Check, full ESLint, **988 tests in84 files**, and isolated optimized Build all passed. Tests completed at10:52UTC. No application/native source changed in this stage; the deployed package remains the exact previously verified CI artifact, not a locally rebuilt substitute. The local isolated build did not replace the running development server or the deployed package.
- Built origin:30 read-only cache-policy checks passed, including no-store for mutable pages/APIs/worker and immutable hashed assets.
- **Public Staging8443 from the Linux server**:36 synthetic assistant checks passed (no effects before approval, owner isolation, revision/edit, confirmation, retry idempotence,3 reminders, alarm cancellation, recurring meetings/tasks and cancellation).7 synthetic login/session/logout checks passed. Test accounts are separate from the owner; local-only processing explicitly requested. One SSH banner-exchange timeout occurred before a test could start; one later connection succeeded. No security limit was weakened.
- Windows443 health returned200. Windows8443 failed normal TLS negotiation with Schannel error35 and Node `ECONNRESET`; explicit IPv4/TLS1.2 also failed. No `-k`, certificate bypass, alternate tunnel or network-security change was used. Linux8443 succeeded with certificate validation. **This network-dependent difference is unresolved**, not proof of a universal certificate failure or a resolved phone connection.
- Origin3010 HTML and Linux-public8443 HTML referenced the same current chunk set, including `11quviisz0dr8.js` and `0nik0m-vvnzws.js`.
- The actual in-app browser8443 rendered old UI after loading; a fresh verification-query navigation also loaded old chunks (`13roj4eaybtyd.js`, `38_nf5rbloyzu.js`, `turbopack-0ycjdv-1sp6wl.js`) and lacked the4 current dashboard counters. Rendering this cached screen is **not** acceptance of current server UI. Browser cache/cookies/WebStorage were not cleared.
- Local browser1280×900 and390×844 showed the current4 counters and Persian pastel interface; scroll width matched viewport width. Screenshots were visually inspected after dimensions settled; viewport override reset. No personal login, voice recording or GPT request was sent through the browser.

### Worker response comparison (SHA-256)

| Response | SHA-256 |
|---|---|
| Current source and Staging origin3010 `/sw.js` | `e00e53b1890e57bfee548a40f17eb65f61b929db51e7b7dd11148a4a09c47c0c` |
| Production origin3011 `/sw.js` | `4440f79593219fb07ce1785e1f2bb1b08aa54a157c034c99950d9e02b258ddbc` |
| Public443 **and8443** `/sw.js` | `4440f79593219fb07ce1785e1f2bb1b08aa54a157c034c99950d9e02b258ddbc` |

Public8443 worker headers: `Mc-Cache-Status: HIT`, `Cache-Control: max-age=14400`, last-modified2026-09-01, `microphone=()`. Current origin policies pass no-store and microphone=self. The matching old Production worker on8443 is direct evidence of wrong/stale public delivery; a cache-key collision across ports is consistent with it, but the CDN configuration was not inspected or changed in this run.

## Administrator handoff — limited, no speculative changes

1. Diagnose the8443 TLS handshake reset **from the affected external client network**, not solely from inside the server. Preserve TLS validation. Test the real app and current hashed assets, not just an open TCP port or `/health`.
2. Inspect hostname-scoped CDN routing and cache keys: ensure public8443 receives the intended3010 origin resources, not3011's worker. Coordinate any shared443/8443 rule change before applying it; do not simply redirect443 to Staging or change user data origins.
3. Ensure mutable HTML/auth/API, `/sw.js` and `/pwa-recovery.js` follow no-store and are not served from a stale shared cache. Immutable content-hashed assets may remain cached. Any narrowly scoped CDN purge is an administrator action under the appropriate approval, **not permission to delete user browser/account storage**.
4. Return a fresh external HTTPS/root/asset/worker result with build commit and headers. Recheck worker hash against the table and actual browser-loaded chunk IDs. Then resume the already-authorized one-authority GPT cutover; do not ask the owner for another broad prompt.

## APK and phone boundary

Latest release is still [tia آزمایشی40](https://github.com/tparkhondeh/personalAgent/releases/tag/phone-preview-stable-40), version1.0.40, package `ir.wealthos.personalagent.stable40`, source `34180286b90008498c839f3ec3b4fd72749c750a`. [Stable download](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk),60,056,269bytes, GitHub digest `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9` freshly matched the locally verified binary. This is the old prerelease, **not a new/final update recommendation**.

The official APK signature check again rejects internal43 as an upgrade of40: both package and signing certificate differ. The first verification attempt lacked explicit installed SDK/Java environment paths and failed before inspection; rerunning with verified installed paths produced the identity result. No certificate/key was generated, no installation attempted, ADB lists no phone. The owner was asked once this turn for installed name/version and phone-only data. No reply yet; the released baseline is not proof of what is installed. Keep the old app and its private data intact.

The earlier automatic [Android16 run35188159692](https://github.com/tparkhondeh/personalAgent/actions/runs/35188159692) is now confirmed completed/success, superseding the previous pending note. This is historical CI evidence, not a new phone acceptance, a new three-version matrix or a published upgrade. Native/bundled source did not change this stage; no speculative APK rebuild was performed.

## Remaining gates

Server GPT remains off until current public delivery is trustworthy; local GPT remains the sole funded runtime and the prior spend is retained. Phone upgrade remains gated by the actual installed identity/signing and a proven phone-only data route. Personal-phone Notification/Alarm/background acceptance remains separate. No claim of100% completion or readiness to rely on this phone build for important new data is made.

Pricing assumptions were freshly checked in the [official GPT-5 mini documentation](https://developers.openai.com/api/docs/models/gpt-5-mini) and [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create). The OpenAI Docs skill guided this verification; no model/pricing policy was changed and no paid request was made.
