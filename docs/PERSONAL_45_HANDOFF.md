# tia 1.0.45 — current acceptance, 11 October 2026

## Latest candidate — not yet released

Update after independent review: exact run38142565657 passed all three APIs, including30 native tests and connected release launches. Before publication a real read-only specialist identified renderer-death and plugin-reply lifetime gaps. Narrow follow-up guards plus two native regression methods are being verified; delivery remains withheld until the new exact main APK passes. The preceding file was never published.

Source `0c9b0e7247b13256d8316e72208a1e0c0c40faac`, main APK SHA256 `0fe8dcf96f513c3c54d76232d7b3f3edd16d1ebf9dd307aa3a3f4ca49159a1a2`, supersedes the historical candidates below. App `tia`, version1.0.45/code45, package `ir.wealthos.personalagent.stable40`, existing certificate and stable8443 endpoint remain unchanged. No data or key was cleared or replaced.

Capacitor8.5.2's official SystemBars lifecycle correction plus guarded/removed owned callbacks addresses concrete lifetime defects. Appearance messages are fenced after close; loading stops before teardown. A three-cycle Alarm recreation test now detects a failure hidden by isolated single-case tests. Both old public44 and the previous45 crashed in that online stress case on API36, while offline passed; this does not prove the exact native root cause. See [preserved diagnostic history](ANDROID16_DIAGNOSIS_2026-10-11.md).

[CI38141897117](https://github.com/tparkhondeh/personalAgent/actions/runs/38141897117) passed Type Check, Lint,1504 tests/115files and Build. Release build38141901096, internal debug Android38141897139 and local verification of all five signed files passed. [Exact-file acceptance38142565657](https://github.com/tparkhondeh/personalAgent/actions/runs/38142565657) is pending. New closure fences alone did not resolve the prior native failure; the current candidate additionally releases the document before later native/window destruction, without clearing storage. The previous71620e2 candidate passed34/30native cases but failed33's later connected launch and36's repeated native case; those failures remain evidence, not current-file acceptance. No owner-phone acceptance, public APK45 or current GPT acceptance is claimed.

The [administrator connection report](SERVER_ACCESS_2026-10-11.md) separates a working TCP path from incomplete TLS and pre-auth SSH key exchange, through this Windows host's `singbox_tun`. No server/CDN/security setting was changed and no paid GPT call was made. Previous server/GPT success is not current connectivity proof. Email recovery remains intentionally deferred; user-data off-server backup and real-phone acceptance remain independent of signing-key custody.

## Historical 10 October candidate and evidence (not the current file)

The personal-use scope excludes store publication and deliberately defers email password recovery. Existing recovery code and authentication protections remain; no email service, credential or charge was created. Keep the account password in a trusted password manager. A remembered session is not a password backup; do not send the password in chat.

## Current candidate (withheld pending acceptance)

| Field | Value |
| --- | --- |
| App | tia / 1.0.45 / code45 |
| Package | `ir.wealthos.personalagent.stable40` |
| Product source | `953fe3071d73143968a66eaa00b171ee2ee92f37` |
| Latest native-test source (separate test APK) | `def3725337dfb12a6b86da1b855b3487825b09ce` |
| APK bytes | 59,372,659 |
| APK SHA-256 | `67c010c02f194adc9b90ecec6195720bef2da3612d287c51e3ce87333bd859c3` |
| Permanent signing certificate SHA-256 | `abfd097ac3ab887977fb58505b5ae0e40c1fc5b56bf210597476105278f1e3cf` |
| Embedded HTTPS endpoint | `https://personalagent.wealthos.ir:8443` |

The current signed bytes also bound unresolved account loading. Exact-file run `38057534839` passed API33 but failed API34's UI-acknowledgement bound and API36's teardown/native sequence; that failed result is retained. Test-only source `def3725337dfb12a6b86da1b855b3487825b09ce` waits for actual window detachment instead of assuming Activity destruction proves it. The API34/36 recheck [38059537215](https://github.com/tparkhondeh/personalAgent/actions/runs/38059537215) **passed API34, including all26 native tests, but failed API36 with a native crash**. The hierarchy-removal test now passed there; it did not resolve the separate crash. Thus these exact main bytes have passing API33 and API34 branches, but not API36 acceptance. All five main/test/diagnostic hashes and signatures were verified; the **main APK bytes are unchanged**. The temporary download capability was removed and no funded GPT fixture was enabled. No public APK45 was released or recommended. Preceding run `38054978526` also failed. Successes from other main APK hashes cannot be transferred to this candidate. Instrumentation/diagnostic APKs must not be installed on the owner's phone or published as the app. Version number alone does not identify the file.

## What changed and what passed

- Capacitor 8.5.1, Next 16.3.8, sharp 0.35.5 and source-map-js 1.2.2 close the newly reported dependency advisories; the production audit reports zero **known** advisories. This is not a guarantee against every security defect. Older APK44 does not contain the native patch.
- The disabled email-recovery UI no longer promises email delivery and explains the limitation. Login/security and future recovery code remain intact.
- Android now recognizes nonempty service-worker recovery documents (including the deployed legacy form) and enters the private recovery instead of trapping the user on the web-only retry page. Delayed checks are fenced after activity closure or document replacement. No account/cache/storage clearing was added.
- SystemBars now rejects queued document-readiness/CSS callbacks after its Activity closes. This addresses an observed invalid destroyed-WebView call; it is not by itself proof of the root cause or resolution of the separate native Trichrome crash.
- WebView is removed from its parent before Capacitor destroys it, following Android's lifecycle contract. No cache, cookie, history or database clearing is added. All 26 internal Android tests passed in [38054324682](https://github.com/tparkhondeh/personalAgent/actions/runs/38054324682); the exact-release matrix remains separate.
- Unresolved account loading now keeps a bounded 20-second deadline. Web/PWA then offers a same-URL retry without switching to guest, clearing data or bypassing authentication. Android recognizes both legacy and explicitly marked loaders, retains the original navigation deadline and can enter private recovery. Ordinary task text mentioning loading does not trigger it.
- Type Check, Lint, optimized Build and 1,486 tests in 110 files passed in [product CI](https://github.com/tparkhondeh/personalAgent/actions/runs/38056778703). The diagnostic-only follow-up passed 1,488 tests in 111 files in [CI](https://github.com/tparkhondeh/personalAgent/actions/runs/38057285372). Linux server packages are prepared, not deployed. Earlier verified package/hash in the detailed report is historical, not the current product.
- Test-only follow-up CI38058835668 passed1,489 tests/111 files; matching internal debug Android38058835740 passed all26 native tests and smoke. These do not override the failed exact-release API36 branch. Isolated Alarm tests passed online and offline in attempt8; in attempt9 the online isolated process also crashed, while offline passed. The native root cause is not conclusively established; this is not evidence that Alarm, networking or the WebView vendor alone is responsible.
- API34 current cold-start, bundled fallback and upgrade-preserved screenshots were opened and inspected: real app content, no system-error overlay. API33 cold-start, dark settings and TLS recovery were also inspected. This representative review is not full visual/phone acceptance; API36 remains failed.
- Current verified Linux package: 75,122,572bytes, SHA-256 `5fa6a5544096c73b7427c07da032584302c5cea861f157ad74329aa66bce933e`, embedded source `a5e0d140061b7fd9cc301dd28c43bb2f50dad830`. The optimized local build is running on loopback3001 and both desktop/mobile stalled-session browser cases passed on it, including visual inspection. This is not an update of public Staging or the installed phone.
- Real-browser desktop/mobile: login to Tasks, unavailable recovery, an editable proposal with three reminders, no effects before confirmation, double-click without duplicate, reload, completion with all three future reminders cancelled and logout passed with isolated synthetic data. Manual title correction was needed for one conversational phrase; local understanding is not advertised as perfect.
- Local source/data backup and separate restore, synthetic encrypted backup/restore, and built-server HTTP/auth/cache/data-isolation checks passed. Real owner records were not cleared. No new OpenAI expenditure occurred; no second local budget was enabled.

## Environments are separate

Local `http://localhost:3001/` is loopback on the development Windows VM, not a phone or personal-laptop URL. Its patched build is usable for local testing; GPT there is unfunded/disabled. The verified Linux server package exists, but has **not** been deployed. The public Staging endpoint and Production were unreachable from this host in fresh tests; the active versions, budget ledger and actual GPT responses could not be reverified. Staging did render the normal Tasks interface through validated HTTPS from GitHub's Android emulators on October 10, so the VM timeout is not a universal-outage diagnosis. Historical October 3 GPT success is not a current GPT connection claim.

The connected Android screen uses the server account. Bundled offline tasks live only on that installation and are separate from online records; automatic migration/synchronization is not claimed. Server backups do not cover phone-only tasks. Internet GPT is not available offline; external personal-audio upload remains unauthorized.

## Remaining gates and responsibility

| Gate | Necessary action |
| --- | --- |
| Exact APK acceptance | Agent/Android engineering: resolve the failed release-byte checks and finish the same-file matrix and visual review. No failed/diagnostic build may be relabelled final. |
| Reachable, patched server | Server/network administrator restores reachability of the existing HTTPS/SSH paths **from the development host**, without bypassing TLS. Then deploy the verified Staging package only after fresh data/settings/cost backup and separate restore, and recheck public assets, consent and the single $2/month budget authority. No shared-domain or Production change was made. |
| Off-server **data** backup | Owner/admin confirms transfer of the encrypted **data** package to the approved laptop folder and establishes a recurring copy/retention routine. The already copied signing-key ZIP is different; laptop restore/custody of user data is not confirmed. |
| Real-phone acceptance | Owner performs the short checklist below. Emulators and permission screenshots do not prove delivery under the phone's real background restrictions. |

Email recovery is intentionally deferred, not a pending release blocker. Signer transfer to the owner's laptop is owner-confirmed; laptop restoration is not proven. No new key is needed. Do not store the decryption password beside its encrypted backup; keep it separately in a trusted password manager and do not post it here.

## One phone checklist, after exact-file acceptance

1. Update the existing permanent-signed app, without uninstalling. Create one non-sensitive task, close/reopen, and confirm it remains and starts on Tasks. If Android reports signature incompatibility, stop; do not clear storage or force-install.
2. Test one notification and Alarm with the screen locked, then complete its task and verify future alerts stop.
3. Turn a non-sensitive voice example into an editable draft locally. After HTTPS works, separately consent to sending a synthetic **text** to GPT; check its status and edit/cancel/confirm. No action should happen before confirmation.

Rollback must not restore stale user/budget databases. Keep the previous binaries/backups; on the phone prefer a corrective same-signer higher-version update over forced downgrade/uninstallation. Do not rely on this unaccepted connected environment as the sole copy of important data or the sole alarm for critical deadlines.

[Detailed evidence and failed-attempt history](PERSONAL_HANDOFF_2026-10-10.md)
