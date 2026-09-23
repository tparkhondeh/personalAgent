# Personal signed Android candidate — 2026-09-23

## Scope and preservation

The owner's explicit confirmation authorizes a permanent tia signing key with the existing `ir.wealthos.personalagent.stable40` package. Preview40 uses a different unavailable signer; this is a clean installation, NOT a compatible update over preview40. Its old phone-only data may be discarded if required, but no server/account/budget/backup data or future data is covered. No phone uninstall/install has been performed.

Before edits, all-ref Git bundle and tracked source ZIP were separately restored and checked under `C:/Users/pc/Desktop/project-backups/tia-signed-personal-20260923/`. Source ZIP SHA-256: `cb3bec571c164828296ad80ed164ed9cc3c3fe59c1a74f708cfeaecdac0d9eb3`. No restore was made over the working tree. Starting commit: `eaf5a9f9e810fe040d1eebefbdf0625ed16ffa6a`.

## Permanent key

- RSA3072/SHA256withRSA PKCS12, alias `tia-personal-2026`, long validity for future updates. Creation was confirmed, not inferred from permission to delete phone data.
- Certificate SHA-256: `abfd097ac3ab887977fb58505b5ae0e40c1fc5b56bf210597476105278f1e3cf`.
- Key and DPAPI-protected password remain owner/SYSTEM-only outside the repository. A separate private backup was hash-compared, decrypted under the same Windows identity and opened successfully by keytool.
- No private key/password is committed, uploaded to CI, printed, or packaged. Cross-host loss recovery is NOT yet verified; preserve this Windows profile and the separate backup.

## Candidate pipeline — acceptance pending

Candidate43 is intended to be named `tia`, version1.0.43, stable40 package, with the fixed HTTPS endpoint `https://personalagent.wealthos.ir:8443`. Build source/provenance is embedded as nonsecret `tia-build.json`.

`personal-android-build.yml` builds unsigned release bytes and isolated diagnostic/test APKs. Signing occurs only on the protected Windows host. `personal-android-qa.yml` downloads a SHA-pinned private draft bundle and verifies all signatures, identities and the main APK configuration before installing.

The delivered APK is non-debuggable, has WebView inspection disabled, and contains no QA runner. Separately installed same-signer test instrumentation can inspect one explicitly started emulator test process. Ordinary cold launches before and after QA must expose no debugging socket. The test APK and diagnostic binaries are not public deliverables. The QA workflow preserves all existing Android13/14/16 offline/recovery/native checks.

At this checkpoint, local Type Check/Lint and all1031 tests passed with zero skips (88 files,105.34s, two workers). The initial fully parallel run hit the existing auth setup's30s timeout; no timeout or assertion was weakened, and the entire suite was rerun with bounded concurrency. The unsigned build, signed-binary matrix, public download and real phone acceptance have NOT yet passed. No APK is being called ready at this point.

## Unchanged operational boundaries

No Production/server/GPT setting or budget was changed by this signing work. Public Staging retains the previously verified shared GPT authority; local funded execution remains off. Account recovery email, approved encrypted off-host backup and real-phone Notification/Alarm/microphone/background acceptance remain separate limits. Signing preparation does not prove them.

Read-only server check found the scheduled snapshot `snapshot-20260922T231701Z-pmuLI5` (Sep23,02:47 server local time); its verification records integrity OK, zero foreign-key errors and a separately restored copy. It did not restore live data, activate budget or delete older snapshots. Only3.6GiB free remains on the server; no new deployment or deletion was attempted.

Official references: [Android app signing](https://developer.android.com/studio/publish/app-signing), [apksigner](https://developer.android.com/tools/apksigner).

## Exact candidate built and signed — matrix pending

- Unsigned build [35908842448](https://github.com/tparkhondeh/personalAgent/actions/runs/35908842448) passed Android release Lint, unit tests, main/test build and same-build speech bytes. The earlier build35908596800 lacked only the isolated Prisma build URL; it failed before APK construction and is retained as evidence.
- APK source: `72f721f04a8ddc020879272203e7e972d51f9383`. Name `tia`, version1.0.43/code43, package `ir.wealthos.personalagent.stable40`, HTTPS8443 endpoint. Later commits change QA tools/docs, not these APK bytes.
- Signed APK SHA-256: `9d0353738ce22965c33e58fe495efd894a37419f2f03042b4917bef003db9406`; size59,352,179bytes. Full signer matches the permanent certificate above.
- `verify-personal-android.mjs` passed all5 exact signed candidates: target package/version/cert/hash, fixed TLS endpoint, no debugging/logging, no QA runner in main DEX, no key/config-secret files and16KiB ZIP alignment. Instrumentation APKs omit a version field by design; their separate identity gate checks signer/package/runner without relaxing the main APK gate.
- All18 decoded speech-model files match the pinned upstream ZIP; packaged patched engine is identical. Gzip bytes may differ by build platform, so both same-build and unpacked-source checks were retained.
- The unsigned GitHub artifact SHA is `45ed46baa811024e1241ba64e61b3f082179ec5aab09a7ae0d44ddb1c8b35dcd`. Windows could not reach its Azure download host; a TLS-validated stream through the existing server was written only to the private local backup, with matching hash and no server artifact file.
- Signed QA bundle SHA: `d9ced1dbb07db16219377b398b28b5949c83d95312e4953da452ae468f116e7f`. Private draft `tia-personal-qa-43-72f721f` is NOT a public phone release. Never publish its test/diagnostic APKs.
- First matrix35911002988 failed to read the private draft with its read-only workflow token; no APK execution or GPT call occurred. Owner-only funding was restored, temporary fixture secret removed and shared budget remained14receipts/$0.167986. Rather than granting repository write access, the next run uses a short-lived exact-asset read URL stored as a temporary secret plus pinned ZIP hash. This internal capability is not a delivery link.
- Matrix [35911349442](https://github.com/tparkhondeh/personalAgent/actions/runs/35911349442) is pending at this checkpoint. Its API36 branch exercises two synthetic public GPT requests through the real Android WebView UI with explicit text consent and cancellation; the other two branches cannot access that fixture secret. Ordinary launch before/after instrumentation remains an independent non-debugging gate.

Fresh browser inspection of public8443 at490px and1280×900 showed Tasks selected, all four boxes, shared pastel appearance and no horizontal overflow. Temporary desktop viewport was reset. This is web evidence, not owner-phone acceptance. Latest successful web CI at this checkpoint: [35910648751](https://github.com/tparkhondeh/personalAgent/actions/runs/35910648751), including Build and isolated packaged-server checks.

Before temporary synthetic funding, the app/budget snapshot `snapshot-20260923T194112Z-L2pOWa` passed separate restore. Every funded attempt retains a private settings backup and accounting report; no receipt is removed, copied into a second authority or reset. The same owner-only setting is restored in cleanup. Production remains untouched.

### Cold-launch environment mismatch, not a bypass

Matrix35911349442 installed the exact signed main APK and rendered Persian UI on all3 APIs, then correctly failed the cold-launch debug-socket gate BEFORE the test APK was installed or any GPT request. API36 evidence shows system build `sdk_gphone64_x86_64-userdebug`, WebView133.0.6943.137, and main package flags without DEBUGGABLE. The [matching Chromium source](https://raw.githubusercontent.com/chromium/chromium/133.0.6943.137/android_webview/glue/java/src/com/android/webview/chromium/SharedStatics.java) explicitly ignores disabling inspection on debug Android/app builds. Thus this image cannot establish the required production-like cold-launch property; it is not evidence of a delivered app setting ignoring false.

Use Google's `google_apis_playstore` **user** image and additionally require `ro.build.type=user` and `ro.debuggable=0`. Keep the no-socket assertion, exact bytes, all existing tests and error gates. No OS property spoofing, security disabling or TLS bypass. Preserve the failed run and downloaded evidence (API36 ZIP SHA `4472f3189ff1de51240323ca399abe60a1845835adea21d1367832a04feafb76`). Cleanup restored owner-only funding, deleted both temporary CI secrets and retained the unchanged14receipts/$0.167986, zero pending.
