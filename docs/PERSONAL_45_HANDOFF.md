# tia 1.0.45 — tested personal release, 11 October 2026

## Current delivery

[Download the tested APK](https://github.com/tparkhondeh/personalAgent/releases/download/personal-1.0.45/tia-1.0.45.apk) · [Version-specific release and public evidence](https://github.com/tparkhondeh/personalAgent/releases/tag/personal-1.0.45)

The reproduced Android16 three-cycle online Activity/Alarm recreation crash no longer occurs in the unchanged acceptance scenario. Document release before live-WebView destruction, immediate closure fences, dead-renderer-safe cleanup and queued UI-thread plugin replies address observed lifetime defects. One real read-only specialist independently reviewed the final corrections. This establishes a passed regression scenario, not the precise native SIGSEGV root cause, every-device compatibility or a fault-free system. Earlier crashes and the first API33 connectivity failure remain in [diagnostic history](ANDROID16_DIAGNOSIS_2026-10-11.md).

| Field | Released value |
| --- | --- |
| App / version / code | tia / 1.0.45 / 45 |
| Package ID | `ir.wealthos.personalagent.stable40` |
| Product / APK source commit | `925a61eb5455c1e2b9d23a03f97639eb3def2fe8` |
| Main APK / size | `tia-1.0.45.apk` / 59,372,659 bytes |
| Main APK SHA-256 | `d7f7d00e6653455c60bdda91fa437a6fb3592ea1650f7f5c09888ee78c530612` |
| Existing permanent certificate SHA-256 | `abfd097ac3ab887977fb58505b5ae0e40c1fc5b56bf210597476105278f1e3cf` |
| Stable connected destination | `https://personalagent.wealthos.ir:8443` |
| Publication | `personal-1.0.45`, personal prerelease, 2026-10-11 14:45:36 UTC; not store publication |

All five public asset sizes/digests were matched before publication. A fresh **anonymous download** of the published APK matched the full size and SHA above. Public assets contain only the main APK, metadata, acceptance summary, checksum and whitelisted synthetic screenshots/cold-launch evidence. Instrumentation/diagnostic packages, signing material, private QA capabilities and user data are not public assets. No new identity/key or data clearing was performed. Subsequent documentation-only commits do not change the APK source commit.

## Acceptance of these exact bytes

| Android | Exact-file run | Native tests | Ordinary initial/final launch |
| --- | --- | --- | --- |
| 13 / API33 | [38146950983](https://github.com/tparkhondeh/personalAgent/actions/runs/38146950983) | 32 passed / 78.608s | Online / online |
| 14 / API34 | [38145849805](https://github.com/tparkhondeh/personalAgent/actions/runs/38145849805) | 32 passed / 71.650s | Online / online |
| 16 / API36 | [38145849805](https://github.com/tparkhondeh/personalAgent/actions/runs/38145849805) | 32 passed / 76.230s | Online / online |

Each API passed 30 system-UI overlay gates, same-signer44 upgrade/data preservation, acknowledged HOME and immediate-stop durability, keyboard, synthetic local speech fixture, theme/poem and DNS/server-down/SSL recovery checks. Ordinary release launches were non-debuggable and exposed no WebView debug socket. Eleven latest-file screenshots were opened and inspected:33/34 cold/upgrade/keyboard;36 cold/upgrade/keyboard/dark-settings/SSL. They show real app content without system-error overlays. The first run's33 branch correctly failed before native instrumentation when a later connected launch reached actionable recovery instead of Tasks; only33 was rechecked, with identical APK/test bytes and gates. The final33 success does not erase that failure.

[CI38145116230](https://github.com/tparkhondeh/personalAgent/actions/runs/38145116230) passed Type Check, Lint, **1,506 tests in115 files**, optimized Build, known production-dependency audit, isolated encrypted backup/restore, append-only backup checks and packaged-server synthetic authentication/data-isolation/cache/agent/idempotency/completion checks. Release build38145120007 and internal Android38145116245 passed separately. The local full-suite attempts had setup/worker failures and were not counted as passes; targeted24 local tests, actual native/test compilation and direct-node Lint/Type Check passed. Successful clean CI supplies the full-suite verdict.

## Environments and remaining work — current, not historical

| Environment or gate | Actual status / next responsible party |
| --- | --- |
| APK45 | Installable tested personal file; existing permanent44→45 update preserves synthetic data. No owner's phone installation or real-phone acceptance was observed. |
| [Staging / connected Android](https://personalagent.wealthos.ir:8443/) | Real page loaded through normal validated HTTPS on all three emulators. New web package is prepared, **not deployed**. Current funded GPT, server build/space/ledger and backup state could not be freshly verified from Windows. |
| [Production443](https://personalagent.wealthos.ir/) | Unchanged. TLS does not complete from this Windows; not a verified new-version recommendation. |
| [Local3001](http://localhost:3001/) | Previously verified October10 build, loopback on this development Windows VM only; not the phone or owner's laptop. GPT remains locally disabled. Not updated by APK publication. |
| Bundled offline | Tested local UI/data durability. Phone-only data is separate from server/account data, without automatic migration/sync or internet GPT. Server backups do not cover it. |
| Windows connection | Admin of this Windows/network plus server admin: diagnose the existing TLS/SSH path through `singbox_tun`, with no TLS bypass or guessed shared-domain changes. See [exact copyable report](SERVER_ACCESS_2026-10-11.md). |
| Patched server / GPT | After reachability returns, agent first reads actual version/space/shared ledger, creates and separately restores a fresh backup, then performs only authorized Staging deployment and synthetic consent-gated GPT QA. Keep one $2/month authority and all historical costs. No paid calls or budget changes occurred in this work. |
| Off-server user-data backup | Owner/admin: confirm the encrypted **data** backup reaches the approved laptop destination and can restore separately; arrange recurring copies. Signing-key ZIP custody is not user-data backup or laptop restore proof. |
| Real phone | Owner: one checklist below for actual notifications, Alarm, background behavior and microphone. Emulator speech fixtures are not a microphone/recognition-quality benchmark. |

Prepared Linux package:75,120,546 bytes, embedded source925a61e, SHA-256 `2427e0cdcb981f8cb5800349ffaa2d9f0eb516a7475108b1075acf7505e30643`. It is not evidence that the live server changed. Network/CDN/Production settings, real user data, credentials, permanent signer and shared costs stayed untouched.

Email recovery is deliberately deferred by the owner, **not a blocker**. Keep the account password in a trusted password manager; a remembered session is not recovery. Never post a password or signing key. Keep a backup's decryption password separately from that backup, not beside it in the same synced folder.

## One owner-phone checklist

1. Install `tia-1.0.45.apk` as an update over the permanent-signed app; do not uninstall or clear storage. If Android reports an incompatible signature, stop and report the exact message. The old preview40 signer is not assumed compatible. Create one non-sensitive task, close/reopen and confirm it remains and starts on Tasks.
2. With the screen locked, check one notification and Alarm; complete the task and confirm future alerts stop.
3. Try one non-sensitive local voice draft. After connectivity is verified, separately consent to sending synthetic **text** to GPT; check its status, edit/cancel/confirm and verify no action before confirmation. This does not authorize external personal-audio upload.

**Readiness:** installable personal APK testing is complete on the three specified emulator APIs. End-to-end daily-use acceptance on the owner's phone/server is not complete. Until the remaining gates above are checked, do not use this as the sole copy of important information or the only alarm for a critical deadline. Retain previous binaries/backups; rollback must not restore stale user/cost databases. Prefer a corrective same-signer higher-version update over forced downgrade or uninstall.

## Historical 10 October candidate and evidence (not the current file)

The personal-use scope excludes store publication and deliberately defers email password recovery. Existing recovery code and authentication protections remain; no email service, credential or charge was created. Keep the account password in a trusted password manager. A remembered session is not a password backup; do not send the password in chat.

## Historical candidate on 10 October (withheld, never delivered)

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

## Historical changes and checks on 10 October

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

## Historical environment observations on 10 October

Local `http://localhost:3001/` is loopback on the development Windows VM, not a phone or personal-laptop URL. Its patched build is usable for local testing; GPT there is unfunded/disabled. The verified Linux server package exists, but has **not** been deployed. The public Staging endpoint and Production were unreachable from this host in fresh tests; the active versions, budget ledger and actual GPT responses could not be reverified. Staging did render the normal Tasks interface through validated HTTPS from GitHub's Android emulators on October 10, so the VM timeout is not a universal-outage diagnosis. Historical October 3 GPT success is not a current GPT connection claim.

The connected Android screen uses the server account. Bundled offline tasks live only on that installation and are separate from online records; automatic migration/synchronization is not claimed. Server backups do not cover phone-only tasks. Internet GPT is not available offline; external personal-audio upload remains unauthorized.

## Historical remaining gates on 10 October (superseded above)

| Gate | Necessary action |
| --- | --- |
| Exact APK acceptance | Agent/Android engineering: resolve the failed release-byte checks and finish the same-file matrix and visual review. No failed/diagnostic build may be relabelled final. |
| Reachable, patched server | Server/network administrator restores reachability of the existing HTTPS/SSH paths **from the development host**, without bypassing TLS. Then deploy the verified Staging package only after fresh data/settings/cost backup and separate restore, and recheck public assets, consent and the single $2/month budget authority. No shared-domain or Production change was made. |
| Off-server **data** backup | Owner/admin confirms transfer of the encrypted **data** package to the approved laptop folder and establishes a recurring copy/retention routine. The already copied signing-key ZIP is different; laptop restore/custody of user data is not confirmed. |
| Real-phone acceptance | Owner performs the short checklist below. Emulators and permission screenshots do not prove delivery under the phone's real background restrictions. |

Email recovery is intentionally deferred, not a pending release blocker. Signer transfer to the owner's laptop is owner-confirmed; laptop restoration is not proven. No new key is needed. Do not store the decryption password beside its encrypted backup; keep it separately in a trusted password manager and do not post it here.

## Historical phone checklist on 10 October

1. Update the existing permanent-signed app, without uninstalling. Create one non-sensitive task, close/reopen, and confirm it remains and starts on Tasks. If Android reports signature incompatibility, stop; do not clear storage or force-install.
2. Test one notification and Alarm with the screen locked, then complete its task and verify future alerts stop.
3. Turn a non-sensitive voice example into an editable draft locally. After HTTPS works, separately consent to sending a synthetic **text** to GPT; check its status and edit/cancel/confirm. No action should happen before confirmation.

Rollback must not restore stale user/budget databases. Keep the previous binaries/backups; on the phone prefer a corrective same-signer higher-version update over forced downgrade/uninstallation. Do not rely on this unaccepted connected environment as the sole copy of important data or the sole alarm for critical deadlines.

[Detailed evidence and failed-attempt history](PERSONAL_HANDOFF_2026-10-10.md)
