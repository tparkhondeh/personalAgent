# GPT activation preflight — 2026-09-21

## Decision and existing authorization

The owner gave final confirmation to activate GPT. The existing limited tia server authorization, one total $2/month allowance including tests, existing protected replacement credential, explicit in-app text consent and separate proposal approval remain valid. No repeated approval for those operations is needed. Shared domain/CDN configuration, unrelated services, personal audio and a new signing identity are not added to this authorization.

**Activation was not executed:** the remaining public cache-policy gate is reproducible. No credential was decrypted/transferred, no monetary ledger was frozen/copied into another active runtime, no paid request was sent and no server process/configuration was changed. This is not an activated server/phone GPT delivery.

## Fresh evidence (08:17–08:23 UTC)

- Starting local main and remote main both `55a28d81f5a7f41bebf83e6ed87641c42ba6d558`; worktree clean.
- Verified SSH reports 11,811,860KiB available (95% used), Staging current release `4838bd4bf1cb36ecdcbf31260d0157bc895c2c9c`, healthy origin3010/database.
- **The former Windows TLS failure did not reproduce:** verified HTTPS443 and8443 both returned200; Node8443 also succeeded without certificate bypass. This supersedes the earlier failure for this client at this time, not a real-phone acceptance claim.
- Public8443 health reports the exact Staging commit. The actual browser now loads current chunks `11quviisz0dr8.js` and `0nik0m-vvnzws.js`, shows all four dashboard counters and opens tia's message field. No owner login, prompt submission, storage clearing or microphone recording occurred. The earlier stale-root-interface observation no longer describes this fresh browser result.
- **Origin3010 passes all30 existing cache-policy checks. Public delivery does not preserve that policy:** `/`, `/login` and `/api/health` returned `Mc-Cache-Status: BYPASS` but no `Cache-Control` header to the Windows client. BYPASS is not a browser `no-store` guarantee.
- Public `/sw.js` and `/pwa-recovery.js` still have `Cache-Control: max-age=14400`. Observed `/sw.js` content differs by request path/network: Linux's public443 and8443 responses matched the old Production worker; Windows's later8443 response matched current Staging. Do not describe this as universally stale or fully repaired. The exact CDN configuration/root cause was not inspected; shared cache/routing inconsistency remains unresolved.
- The active PM2 Staging process reports `keyConfigured=false`, `costApproved=false`, `personalMode=false`. Local funded configuration was not changed.

| Worker | SHA-256 |
|---|---|
| Current source / origin3010 / later Windows-public8443 | `e00e53b1890e57bfee548a40f17eb65f61b929db51e7b7dd11148a4a09c47c0c` |
| Origin3011 / Linux-public443 / Linux-public8443 | `4440f79593219fb07ce1785e1f2bb1b08aa54a157c034c99950d9e02b258ddbc` |

## Preservation and independent checks

- Private owner-only backup: `C:/Users/pc/Desktop/project-backups/tia-gpt-activation-20260921/`. Full Git bundle was restored into `restored.git`; `git fsck --full` passed. Pre-edit status/development-rule documents are retained. Only documentation is changed in this stage; no application data/configuration change requiring a new live-data restore was attempted. Earlier verified database backups remain intact.
- Read-only live budget inspection: version1/LEGACY, not halted, six receipts,156237 microUSD accounted, zero pending; digest `1f24c2f8fa3b57e6a518f8cb36508e1756e950df7ac6b4eea444db5b5c33dd9d`. Prior spending and the single authority remain unchanged. This accounting includes conservative reservations and is not a provider invoice. New paid spend: zero.
- Fresh **84 tests in five files passed**: monthly monetary guard, operator handoff, AI readiness/request guard, synthetic-test policy and provider wire restrictions. They use synthetic/mocked data, not paid GPT or personal context. No application/native code changed; previous full build/type/lint/Android evidence is not misrepresented as freshly rerun.
- An initial read-only cache-check invocation used an absent Node path and stopped before running; retry with the discovered `/usr/local/bin/node` passed30 checks on origin3010. Public header observations are separately recorded above, not counted as a passed public cache suite.

## Exact remaining administrator action

Scope: **only `personalagent.wealthos.ir`**, coordinated because443 and8443 share the hostname. Do not change other projects or redirect Production to Staging.

1. Verify public8443 consistently receives Staging3010 resources and443 receives its intended Production origin. Inspect CDN cache-key/origin behavior; do not infer a port-specific Page Rule is supported.
2. Preserve `Cache-Control: no-store` from origin for mutable app/auth/API responses and `/sw.js` / `/pwa-recovery.js`; those files must not receive the CDN's four-hour cache policy. Keep immutable hashed JS/CSS caching.
3. If old CDN objects remain, invalidate only the affected tia objects under the appropriate shared-domain approval. Do not clear browser cookies, site storage, phone data or user databases.
4. Verify fresh GET responses from an external client and the server: correct build/chunks, consistent worker content and no-store headers. A200 health response alone is insufficient. HTTPS currently works in the tested path and must not be weakened.

Any CDN policy change needs the administrator's scoped implementation or explicit authorization for that shared configuration. If undertaken, export the existing hostname rules/origin mapping first, record the exact change, and restore that configuration on regression; this is never a reason to restore old application data or spend receipts.

After this gate passes, execute the already-authorized [one-authority cutover](GPT_SERVER_CUTOVER_2026-09-17.md#execution-after-prerequisites-are-satisfied): fresh app/settings/spend snapshots and separate restore verification, current-account match, drain/freeze the local authority, protected credential transfer, unique server-ledger activation, synthetic live acceptance, and forward-only cost-preserving rollback if required. No new broad prompt or repeat spending consent is needed.

The official [OpenAI production guide](https://developers.openai.com/api/docs/guides/production-best-practices) was consulted for server-only credential handling; existing model/pricing policy was not changed. No new APK was built or published, and no phone acceptance is claimed.
