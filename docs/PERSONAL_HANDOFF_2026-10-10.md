# Personal-use handoff — 2026-10-10

## Owner decision and scope

Email password recovery is deliberately deferred to the next version. It is **not a personal-release gate**. Existing recovery/authentication code remains; no mail provider, account, credential, billing, auth bypass or shared password is introduced. The unavailable screen explains the limitation, disables submission and does not promise an email. Keep a unique account password in a trusted password manager; remembered sessions are not password recovery. Never send the password in chat or keep it beside an encrypted backup.

All current data is real. Existing signing identity, local/server accounts, databases, cost receipts and the sole shared $2/month GPT authority must be preserved. Store publication and new features remain out of scope.

## Fresh evidence and preservation

- Baseline source/main/origin: `57461f9eb170013f379fea323d2e7c5c393436bd`. Private Git bundle verified and restored separately to the same HEAD before edits.
- Local application SQLite was snapshotted consistently with `VACUUM INTO`; a separate restored copy passed integrity/foreign-key/hash checks. Snapshot SHA-256: `f14d1ebf3cdbcbf5c9933f323f00431aaf5f7f5f89b40e346bce0bb42f7a934c`. No data contents enter this report or Git.
- Private evidence: `C:/Users/pc/Desktop/project-backups/tia-personal-20261010/`, restricted to the owner and SYSTEM.
- Before dependency changes: Type Check, Lint and all 1,451 tests in 106 files passed; the 18 targeted recovery checks passed. These are not results for the security-updated build.
- Fresh Windows HTTPS requests to both 443 and 8443 timed out (15-second bounds). Strict, noninteractive SSH to the documented host/2490 also timed out. The real browser's retry remained on the connection-recovery screen. This proves failure from this host, **not** the exact cause or a universal outage. DNS/TLS validation, cache, cookies and server settings were not bypassed or cleared.
- Consequently current server build, free space, daily-backup freshness and live GPT/budget state cannot yet be reconfirmed. The October 3 server/GPT results in `PERSONAL_READINESS_2026-10-03.md` are historical evidence, not fresh connectivity or phone acceptance.
- ADB currently lists no devices. No real-phone notification, Alarm, microphone, upgrade or GPT success is claimed.

## Security update required before new handoff

The new dependency audit found nine advisories (1 critical, 3 high, 4 moderate, 1 low). A previous clean audit is not current proof of security. Limited patch updates:

- Capacitor Android/core/CLI 8.5.0 → 8.5.1; retain the existing lifecycle guard patch and exact installation identity. [Maintainer advisory](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv) requires rebuilding and redistributing the app; merely updating server code is insufficient. Disabling the HTTP plugin alone is not a fix.
- Next/eslint-config-next 16.3.6 → 16.3.8. [Official security release](https://github.com/vercel/next.js/releases/tag/v16.3.8).
- sharp 0.35.4 → 0.35.5, including transitive copies. [Advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- source-map-js vulnerable 1.x copies → 1.2.2. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Post-update local results: production dependency audit has **zero known advisories**; Type Check, Lint, all **1,452 tests / 106 files**, isolated optimized Build and synthetic encrypted-backup round trip passed. Actual browser recovery UI passed at desktop 1280×800 and mobile 390×844: disabled input/button, clear limitation, no horizontal overflow. Built HTTP cache policy passed 30 checks; isolated synthetic authentication/session/logout fixture passed 11 checks. Local 3001 is restarted on loopback only, GPT unfunded; test database on 127.0.0.1:3003 is separate from real owner data and cookies. No server deployment is claimed.

The exact signed APK acceptance must be recorded before calling a new build deliverable. Older APK 1.0.44 cannot inherit these fixes or new acceptance results. No evidence of exploitation is asserted. The new matrix uses the exact public APK44/hash as the upgrade baseline, preserving the permanent signer/package and testing data retention.

## Independent remaining gates

| Gate | Evidence / responsible party |
| --- | --- |
| Current secure public connection and deployment | Server/network administrator: restore reachable documented SSH and public 8443 from client networks without bypassing TLS or changing shared routing. Agent: deploy only a verified Staging package after fresh server/data/budget backup and separate restore. Production remains unchanged. |
| Off-server **data** backup | The encrypted October 4 data ZIP exists and separate restore was tested on this VM. Owner laptop transfer/restore and a recurring off-server copy remain unverified. Owner/admin provides reachable approved destination or transfers the data package; agent verifies where access permits. |
| Signing-key custody | Owner reports transfer of the signer ZIP/password to the laptop. This is not a test of laptop restoration and not a backup of task data. No new key is needed. |
| Phone acceptance | Owner: update without deleting the app, then check one save/restart, one notification/Alarm with the screen locked and one voice-to-editable-draft. Connected GPT requires working HTTPS and explicit text consent; no audio may be sent to OpenAI. |

No new paid GPT test is necessary for email-copy/dependency changes while the budget authority is unreachable. Never enable a second local budget or restore a stale ledger to make testing possible. Same-server backup and encrypted portable backup are distinct from verified off-server custody.

Do not use an unaccepted app as the only copy of important information or the sole alarm for a critical deadline. Email deferral does not waive the gates above.
