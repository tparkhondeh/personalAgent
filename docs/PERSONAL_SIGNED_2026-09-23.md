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
