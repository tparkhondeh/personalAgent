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

[CI 38044605122](https://github.com/tparkhondeh/personalAgent/actions/runs/38044605122) passed on source `82028bdb25a814cb59b6200d1fc0e8519de8cf89`, including frozen install, zero-advisory production audit, the whole unit suite, built-server HTTP/security/confirmation/completion/retry checks and append-only synthetic Staging backup/separate restore with cost receipts preserved. Verified Linux web package SHA-256: `b7cf43beeee73aac7882240078b39924ae2443b8d8c6d0df37b31989fceae015`. [Internal Android QA 38044604967](https://github.com/tparkhondeh/personalAgent/actions/runs/38044604967) also passed; its debug APK is not a phone deliverable.

Fresh real-browser synthetic session: login landed on Tasks; one editable proposal retained three reminders; clarification of ambiguous 10 o'clock to 10:00 and manual title correction worked. Counts before confirmation were zero meetings/reminders. Double-click confirmation yielded exactly one meeting and three reminders; reload retained it. Completion removed it from the active list, retained one DONE record and cancelled all three reminders; another reload and logout passed. The local parser did not strip the conversational phrase `و عنوانش ... شود` automatically; the title was corrected in the editable preview. This is not a claim of perfect local-language understanding or live GPT. Synthetic data remains isolated; its server/tab were stopped, the owner server/session/storage were not cleared.

The exact signed APK acceptance must be recorded before calling a new build deliverable. Older APK 1.0.44 cannot inherit these fixes or new acceptance results. No evidence of exploitation is asserted. The new matrix uses the exact public APK44/hash as the upgrade baseline, preserving the permanent signer/package and testing data retention.

Exact-candidate QA run `38045302070` failed on all three APIs **before upgrading the baseline**, because test-only host/runner guards still required 43→44. No candidate pass or app data-loss claim follows from that failure. The harness now requires exact 44→45, retains CI/emulator/non-debuggable safeguards and seeds v44 through its real native CAS store with a durable acknowledgement, not the legacy read mirror. Tests cover rejected acknowledgements and pre-existing native records. Only the isolated test APK needs rebuilding; the signed main APK bytes are preserved for the rerun.

The next exact-file run `38047110015` is also **failed**, not accepted: 44→45 upgrade hashes passed on all APIs, but API33's HOME parser rejected its actual `ActivityRecord{identity} tN}` format; API34 later rendered the service-worker's nonempty remote recovery instead of the private APK recovery; API36 crashed inside WebView/Trichrome native code during instrumentation after its HOME/immediate preservation checks passed. No data was cleared/reseeded. The private download capability was removed after the run.

API33 parsing now accepts only the two observed brace formats; wrong PID/task/state/visibility and malformed input remain failures. The saved actual API33 dump parses as the same stopped, invisible app and resumed visible HOME. The Android product is being fixed to recognize both the deployed legacy PWA recovery document and a new explicit recovery marker, and to fence delayed callbacks against activity closure/document replacement. This **does** require rebuilding the main APK: the initial 45 hash is withheld, not a delivery. Native integration tests cover old/marked recovery with the actual WebView.

The separate internal debug run `38046532741` attempt1 also crashed in Trichrome during a different instrumentation test; its unchanged-code attempt2 passed. That repeat does not establish the native crash's root cause or fix it. Full exact-file acceptance is still required; neither crash is erased or classified as a successful run.

## Independent remaining gates

Run `38050047626` passed the complete exact-file API33 branch, but API34 failed to observe the UI save acknowledgement within its existing bound and API36 crashed in Trichrome during the Alarm-sound test. The new recovery-document regression itself passed on API36. The candidate remains withheld; API33 success does not erase the other failures. Test-only diagnostics now record boolean save state and fixed Alarm-test phase labels, without exposing task content or weakening any acceptance condition. A repeat SSH probe at 12:03 UTC connected to the documented SSH service/banner but timed out before authenticated command execution, exit255; no remote mutation occurred.

The API36 log also shows a concrete separate defect at `12:04:07.298`: Capacitor `SystemBars.onDOMReady` evaluates JavaScript on a destroyed WebView. The pinned patch now checks Activity lifetime before enqueue, within the queued runnable and within its reply, plus queued CSS injection. A native regression retains the real plugin across Activity destruction and verifies that late readiness is rejected; installed-source tests preserve active insets behavior. This fixes the evidenced invalid lifecycle call; it does **not** by itself establish the cause or resolution of the later native SIGSEGV. New product bytes require a fresh three-API matrix; API33 acceptance of the earlier bytes cannot be reused for the new build. [Related upstream lifecycle report](https://github.com/ionic-team/capacitor/issues/8562) is contextual, not proof of our crash's root cause.

The full local suite after this patch is **1,474/1,474 tests in 108 files** with two workers. A preceding parallel run failed a 30-second login-fixture setup hook while TypeScript was running; that failed invocation is retained, not called successful. No test deadline or immediate-save acceptance bound was extended.

The new internal Android run `38048447047` completed 24 tests with one failure in the new service-worker-recovery regression: no private recovery transition was observed. It is **not** a passing run. Its fixture used a null history URL and competed with the initial navigation. The test now stops only the test navigation, uses an explicit same-origin history URL, proves the synthetic document actually loaded and collects URL/readiness diagnostics on failure. Product code and signed candidate bytes are unchanged by this test correction; the next observed result, not this hypothesis, determines acceptance.

Exact run `38049023709` reproduced the fixture failure on all three APIs; API36 additionally reproduced the same native Trichrome crash during the Alarm-sound test. All failure evidence is retained and its temporary asset capability was removed. Corrected-fixture internal run `38049440317` then passed all 24 native tests and its smoke checks; the main deliverable remains byte-identical (`31f5a0…43ba0`). Exact-file acceptance with the rebuilt, separately signed test APK is run `38050047626`, not the failed run.

The public Staging endpoint was reachable from the October 10 GitHub emulators: a normal TLS-validated navigation rendered the real Tasks page at `https://personalagent.wealthos.ir:8443/` on API33/34 before instrumentation. Thus the development VM's connection timeouts are **not** evidence of a universal server outage. Its current patched backend version, actual GPT budget and new deployment remain unverified from this VM. The administrator's connectivity task is specifically the existing development-host HTTPS/SSH path, not an instruction to change global CDN/DNS.

| Gate | Evidence / responsible party |
| --- | --- |
| Current secure public connection and deployment | Server/network administrator: restore reachable documented SSH and public 8443 from client networks without bypassing TLS or changing shared routing. Agent: deploy only a verified Staging package after fresh server/data/budget backup and separate restore. Production remains unchanged. |
| Off-server **data** backup | The encrypted October 4 data ZIP exists and separate restore was tested on this VM. Owner laptop transfer/restore and a recurring off-server copy remain unverified. Owner/admin provides reachable approved destination or transfers the data package; agent verifies where access permits. |
| Signing-key custody | Owner reports transfer of the signer ZIP/password to the laptop. This is not a test of laptop restoration and not a backup of task data. No new key is needed. |
| Phone acceptance | Owner: update without deleting the app, then check one save/restart, one notification/Alarm with the screen locked and one voice-to-editable-draft. Connected GPT requires working HTTPS and explicit text consent; no audio may be sent to OpenAI. |

No new paid GPT test is necessary for email-copy/dependency changes while the budget authority is unreachable. Never enable a second local budget or restore a stale ledger to make testing possible. Same-server backup and encrypted portable backup are distinct from verified off-server custody.

Repeated client-network diagnostics on October 10 also resolved both published A records and attempted each CDN address and the already documented origin on 8443, retaining the public hostname and normal TLS validation. All timed out while connecting (8-second bounded connect timeout; no HTTP status), as did the ordinary 443/8443 requests. This does not establish a TLS-certificate or cache defect, nor prove the service is down from every network. No DNS, routing, firewall, CDN or certificate setting was modified. The administrator should first verify reachability of this service and the existing SSH endpoint from the development host; only then can deployment, actual public version and GPT be rechecked.

Do not use an unaccepted app as the only copy of important information or the sole alarm for a critical deadline. Email deferral does not waive the gates above.
