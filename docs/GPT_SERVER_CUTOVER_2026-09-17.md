# GPT server cutover and safe APK upgrade — 2026-09-17

## Authorization and actual state

The owner explicitly approved changes limited to tia needed for server GPT activation, with one total **$2/month** allowance including tests, existing private replacement key, explicit per-request text consent and separate proposal approval. Shared DNS/CDN, other projects, raw personal audio, purchasing credit, auto-recharge and silent signing/package changes remain outside this scope. The older blanket statement that *all* server activation awaits consent is superseded only for this narrow operation.

**No server activation, secret transfer, live ledger freeze, signing-key creation, APK installation or release has occurred in this stage.** The public connection, disk and upgrade gates below are real blockers, not a request for the same authorization again. Existing local GPT settings and its spend records remain unchanged. No paid API requests or personal context were sent by this stage.

## Fresh preflight and recovery evidence

- Baseline clean main/origin `b38fb0d9fd489c6c757781ec8270b5c05892ccc1`; source hardening `40a3e21` already has web and Android13/14/16 evidence. Latest GitHub Release is still `phone-preview-stable-40`.
- Private owner-only backup: `C:/Users/pc/Desktop/project-backups/tia-server-cutover-20260917-0542/`. Full Git bundle restored into a separate bare repository with fsck; source archive, environment and encrypted credential retained. Local SQLite snapshot restored separately: all18 tables unchanged, integrity/FKs/migrations passed. Source hash `f14d1ebf3cdbcbf5c9933f323f00431aaf5f7f5f89b40e346bce0bb42f7a934c`.
- Monetary ledger snapshot restored byte-for-byte in a separate file: **6 receipts,156237 microUSD ($0.156237), zero pending receipts**, cap$2. These are application-accounted amounts including prior conservative reservations, not provider invoices. The live ledger is still version1, not frozen or transferred.
- The server filesystem reported **Available0, Capacity100%** at05:40/05:44UTC (inodes27%). Origin services3010/3011 answered health, but a healthy process is not evidence that future data/budget writes can succeed. No files/backups were deleted to make space and no deployment was attempted.
- Because the server is full, a consistent read-transaction SQLite dump was streamed over verified SSH into the private local backup, **without writing on the server**. Local restored Staging database passed integrity/FKs with18 tables at05:51:47UTC; the active environment/current-release pointer were backed up privately as well.
- Exact approved local-account email matched exactly one Staging account in the fresh snapshot. Database IDs differ; the mapping is retained privately. No login was impersonated, no password changed, no owner context loaded for external processing. A final live identity recheck remains mandatory immediately before activation.
- Staging is still `2d4484c75aeb7a24a9fc14b5ecddb6a2b80b9f87`, Production `49cceed`. Both have paid GPT off and no GPT key configured. A credential-free server request to OpenAI returned401: network reachability only, **not** credential/model/country/account acceptance or a paid-response test.
- Windows verified-TLS probes:443 health200;8443 failed TLS handshake (HTTP000). Server-side8443 health200/BYPASS/microphone=self at05:40UTC. Public443 worker still HIT with old last-modified, microphone disabled, at05:55UTC. No TLS verification was disabled and no CDN policy was changed. A successful origin or one cached public response is not resolved phone connectivity.

## Independent preparation implemented

### One-authority monetary handoff

`scripts/ai-budget-handoff.mjs` is an operator-only tool, never invoked by HTTP/startup. It does not create credentials, transfer files over the network, enable funded services or reinitialize allowance.

1. `inspect <absolute-private-ledger.db>` reports a canonical state digest, receipt counts/amounts and clock watermark without changing records.
2. After draining/disabling paid runtimes and reviewing that digest, `freeze <source.db> <new-snapshot.db> <expected-digest> <exact-target-hostname> <exact-target-absolute-path>` obtains a write transaction, checks the reviewed state, preserves all settled/uncertain receipts, upgrades this ledger to version2 and freezes it **before** exporting. A concurrent reservation invalidates the reviewed digest instead of being lost.
3. Export failure leaves the source frozen; `export-frozen <source.db> <new-snapshot.db>` can resume to a new file without refund/reinitialization. Do not automatically unfreeze or overwrite a partial snapshot.
4. Transport the frozen verified snapshot through the approved private channel. `activate <snapshot.db> <new-destination.db> <snapshot-state-digest>` requires the exact bound hostname/path and a nonexistent destination. Exclusive creation prevents retries overwriting an already-active ledger. Verify the returned counts/digest and preserve the source and frozen packet.
5. Runtime version2 checks the exact canonical ledger path, machine hostname and ACTIVE authority inside each reservation/settlement/status transaction. A copied active ledger at another path/host fails closed; the frozen source cannot be revived by restoring old environment settings. Old version1 application code rejects version2 ledgers as well.

The operator must use private directories (0700 on Linux; owner-only ACL on Windows). Freeze/export/activation require at least512MiB available; allow additional deployment/backup headroom. This does not override OS quotas. No existing live ledger is converted just by deploying this code.

The unchanged version1 ledger still relies on the existing single-host operation. Arbitrarily restoring an **older version1 ledger backup** or modifying the database can defeat an application budget; that is prohibited, not something this tool can prevent against a privileged operator. Provider billing is not controlled by a request-count cap.

### Read-only APK identity gate

`scripts/verify-android-upgrade.mjs <baseline.apk> <candidate.apk>` verifies APK signatures with the installed official Android tools, hashes both binaries, compares the full signer set and Package ID, and requires a newer Version Code. Passing identity compatibility alone never claims data-preservation acceptance. No key is generated and no device is modified.

Actual comparison rejects internal43 against released40 for **both package and signing-certificate mismatch**:

| Binary | Identity / hash |
|---|---|
| Released40 | `ir.wealthos.personalagent.stable40`,1.0.40; SHA256`909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`; signer`4ca0dbc79a8db200028c7ff21951a6bae40b225604e29bc42bb39632a510e95c` |
| Internal43 | `ir.wealthos.personalagent.stable43`,1.0.43; SHA256`2f57ea869a12619c720b06c07498ec9ee813efbb9d251c5f4b90997c81fa65b6`; signer`2b4258fe57098a768f142b124120f20ac3b0845bc7824945196dc35f3b33f7e7` |

Scoped signing search covered this repo/Android build, the named older preview worktree, related project backups, local.android and Staging tree. Only the known incompatible local debug key was found; GitHub repository secret-name listing was empty. This is **not** proof the original key is absent everywhere. Installed phone version remains unverified; no device appeared in ADB. The owner was asked for the exact version, not asked to uninstall.

APK40's bundled local UI has no export/import facility. Adding one to new source cannot retrofit the installed old binary. Online account data, offline WebStorage, native alert mappings/permissions and auth cookies must be inventoried separately. Server login does not transfer phone-only records; another package cannot silently read the old package's private data. A replacement may coexist only after a tested/approved export route for the actual installed version. Do not promise automatic offline transfer or publish43 as its update.

## Tests and limits

Targeted synthetic tests cover transaction failure, freeze/export interruption and resume, concurrent freezes, stale review, insufficient disk, duplicate destination/packet, altered host/path/digest, pending spend across months, clock rollback, fresh process restart and forward-only rollback with new spend retained. Android identity tests cover package/signer/version mismatches and malformed certificate evidence. No real ledger is mutated by tests.

Final local evidence: **988 tests in84 files passed**, Type Check, full ESLint and isolated optimized web Build passed. The 27 added regressions comprise18 handoff and9 APK-identity tests; the existing monthly-budget regressions also passed. Actual local Today/assistant navigation was read in the browser; the390×844 assistant screenshot showed legible Persian controls and a390px scroll/client width, no horizontal overflow. The initial transient resize capture was not counted as a final image; the stable capture was inspected and viewport reset. No account mutation, microphone recording or external prompt submission was performed during this UI check.

No Android UI/native source changed in this stage; prior exact-artifact Android evidence remains historical. A new APK cannot solve missing signing identity, phone-only export or remote disk/TLS gates, so no speculative rebuild/publication is claimed. Final read-only monetary check matched the initial state digest, all6 receipts and$0.156237; no live freeze/activation was executed. Tests for handoff use separate disposable files, not this real ledger.

## Activation sequence and rollback (prepared, NOT executed)

### Verified release candidate, not deployed

Source commit `4838bd4bf1cb36ecdcbf31260d0157bc895c2c9c` passed [web CI35188159724](https://github.com/tparkhondeh/personalAgent/actions/runs/35188159724). Artifact `verified-web-35188159724` (ID10483120354) was downloaded into the private cutover-backup directory and its published SHA-256 was independently matched: `52448ec36e967d4afa9a480e77354e7feba358bb8d1f5e83f1cc090de5b6cfde` for `hamrah-staging-server.tar.gz`. Preserve this tested package; the separate operator handoff tool must be transferred from this reviewed commit, not silently inserted by repackaging. No deployment or paid cutover occurred. Automatic [Android16 run35188159692](https://github.com/tparkhondeh/personalAgent/actions/runs/35188159692) was still running at this evidence checkpoint; this is not a pass claim or an owner-phone APK.

The APK identity gate intentionally applies a conservative project rule: identical signer set and strictly increased version code. Android itself can also accept a valid signing-key rotation and allows certain equal-version-code updates; neither is evidence that these incompatible APKs can safely update each other. No valid signing lineage was found for them. See [Android update requirements](https://developer.android.com/google/play/app-updates) and [app signing](https://developer.android.com/studio/publish/app-signing).

### Execution after prerequisites are satisfied

1. Server administrator frees/increases disk safely; target at least2GiB deployment headroom and verify the tia account can write. Keep all user databases, spend ledgers and backups. Repeat consistent snapshot and account/health checks after this external change.
2. Publish the tested server release to tia's approved isolated service, with paid use still off. Check actual public8443 HTTPS, worker/cache/auth origin and connected-app response. Shared-domain/CDN fixes require their separate specific approval.
3. Quiesce/drain local funded requests; preserve the current ledger, freeze/export using its fresh digest and exact server destination. Transfer the existing replacement secret securely into a protected server-only store, never argv/logs/client/APK. Do not copy DPAPI ciphertext as if Linux could decrypt it, and do not create another API key.
4. Activate one bound server ledger; map the verified Staging owner, cap$2, text-only consent, raw voice off, bounded wire/timeouts. The local funded source stays disabled/frozen. Add any synthetic test identity only for the bounded acceptance and remove it afterward without deleting receipts.
5. Run real synthetic Responses/API/UI and connected Android tests against the same public endpoint; settle actual usage through this ledger. Until these succeed, do not label server/phone GPT operational.
6. On failure, disable funded server calls first. Preserve all new writes/receipts. For code rollback, retain the frozen ledger and local fallback; old code cannot authorize version2 spend. To move funded execution back, perform a **new forward handoff of the current destination ledger to a fresh private file**, never restore the pre-cutover budget/database over new spend/data. Resume only after verification.

Expected risks: brief tia restart, temporary local-only processing during budget transfer, conservative reservation retention after unknown provider outcomes, and phone sign-in/upgrade requirements. No shared-domain edit, destructive migration, account deletion or data reset is part of this approved procedure.

## Outstanding owner/admin actions

- Administrator: disk headroom, then stable public TLS/cache route if it still fails; no permission granted to delete unrelated data.
- Owner: exact installed app name/version and whether there are phone-only records, then access to original signer or a separately explained safe transfer route. Keep the old app installed.
- Coordinator after those gates: controlled activation using the existing authorization, real synthetic acceptance and safe APK delivery. No fresh broad prompt/approval is required for already authorized work.

Official API assumptions rechecked: [GPT-5 mini pricing](https://developers.openai.com/api/docs/models/gpt-5-mini) and [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create). Input$0.25/M, cached$0.025/M, output$2/M; existing text-only default-tier limits remain unchanged.
