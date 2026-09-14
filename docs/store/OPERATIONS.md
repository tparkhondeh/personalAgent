# Clean start, recovery and publication controls

Status: preparation only, 2026-09-14. No public release approval. See [readiness](READINESS_2026-09-14.md).

## Separate empty environment

Run `node scripts/prepare-clean-environment.mjs` from the repository. Every run allocates a new ignored `backups/clean-start/tia-*` directory, runs existing migrations against its explicit database, verifies integrity/foreign keys and zero business rows, and writes a hash manifest. It never empties an existing database, creates an account/key, starts a service or enables a provider. No live `.env` is copied. On Windows, Unix permission bits are not an ACL guarantee: the operator must validate inherited ACLs before personal data is added.

The prepared database is **not an operating account/app**. Activation requires an approved isolated HTTPS hostname, a separately authorized authentication secret, private storage and tested backups. Do not reuse an existing account/session secret or import QA users. Set the approved origin consistently in auth, proxy and client configuration; do not make the current hostname's origin-port change as an isolated experiment. Keep LLM, paid transcription, calls and SMS disabled. The owner creates the real account privately after the environment is ready; do not ask for the password/key in chat.

## Data boundaries

| Mode | Storage | What is not guaranteed yet |
|---|---|---|
| Signed-in web/connected Android | Per-user SQLite on the selected server; session cookie on the client | Account recovery/deletion and a verified final-origin migration are missing |
| Bundled offline Android | This package/WebView origin's `hamrah-local-v2` local storage, including local task/preferences state | No tested export/import or automatic merge into the online account |
| Web/PWA network recovery | Self-contained recovery UI; not a second online account database | Do not advertise full offline account synchronization |

Completion retains statistics and cancels future alerts; it is not physical erasure. Logout does not mean deleting the server account. Moving from `.stable40` to a public package or changing WebView origin is **not** an automatic migration. `MainActivity.clearDataWhenEndpointChanges` clears origin-related Web Storage/cookies: do not change this endpoint on an owner's installed app before a separately reviewed, consented preservation path exists. Parse failure in old local storage must not be mistaken for confirmed absence of data.

## Work required before real-data go-live

1. Implement and test a local export/import + online reconciliation path before package/origin change. Validate schema/version/size, ownership and duplicate IDs; preview conflicts, require import confirmation and preserve the original. Test logout/relaunch/offline/reconnect/upgrade against the same records. This is remaining engineering, **not** completed by these documents.
2. Choose the account lifecycle: verified ownership, authenticated deletion with reauthentication, cancellation of reminders/push/sessions and a working deletion-request website. Implement reset with a selected authorized delivery method, expiry, one-time tokens, generic responses and rate limiting. Do not email raw passwords or allow an operator to reset based only on an unverified email claim. No recovery workaround is currently available to promise publicly.
3. Finalize operator/support identity and deletion/backup retention. Avoid promises of instantaneous deletion from immutable backups. Ensure restoration does not resurrect erased accounts; implement a deletion journal/reconciliation outside the restored snapshot with an approved retention policy.
4. Configure encrypted off-host backups **after** destination, access and encryption-key custody are approved. Existing nightly production backups are same-host plaintext (02:17 server time, +03:30; script retains approximately 30 days). This is not off-host disaster recovery.
5. Restore into a separate database/process with notifications, schedulers, email and providers disabled. Check integrity/FKs/counts and representative owned records. Never test restore over the live database. Agree RPO/RTO only after measuring backup intervals and restore duration; no SLA is claimed.
6. Final HTTPS/browser test: correct release identity, login, task/calendar, origin/cookie isolation, `sw.js` and recovery script revalidation, no cached account/API responses, and normal TLS validation on the owner's network.

## Signing and upgrades — do not execute without approval

Proposed public name: `tia`; proposed ID: `ir.wealthos.personalagent` (not reserved/approved). Installed preview: `ir.wealthos.personalagent.stable40`. Keep preview installed until its records have a verified preservation path.

- Choose and securely custody the permanent **app signing key**, with an encrypted offline backup. Use a separate upload key for Play. Neither is an API key. Never place private keys/passwords in Git, APK, logs, chat, artifacts or screenshots.
- If cross-store updates are required, use a consistent app-signing identity across stores. Google's upload key is not the identity signing installed Play APKs. [Official signing guide](https://developer.android.com/studio/publish/app-signing).
- After approval and final endpoint selection, sync from a clean checkout, verify bundled offline assets, then run `gradlew :app:bundleRelease :app:assembleRelease :app:lintRelease :app:testReleaseUnitTest`. These are intended build steps, not a claim that a public bundle has been built or signed here. Existing release Gradle configuration has no production signing setup. No new key was created.
- Play candidate: signed AAB + Play App Signing; Bazaar accepts APK/App Bundle, verify current panel/signing process. Keep version codes increasing and package permanent. Store review is separate from technical tests.
- Inspect merged permissions, debug flag, endpoint, cert fingerprint, ZIP/ELF alignment and secret leakage in the **final files**. Test exact delivered builds on 13/14/16 and on the owner's phone, including background/permission denial/reboot/upgrade. AAB-generated APKs need their own device test; preview40 evidence does not certify them.
- Deployment rollback: preserve immutable previous server release and a consistent DB snapshot; stop writes/schedulers for coordinated switching, run schema-compatible rollback or forward fix, validate health/auth before resume. Do not overwrite newer writes with an old backup casually. Android normally rejects version downgrades: prefer corrected higher version with the same identity and preserved data, not uninstall/reinstall.

## One owner-phone acceptance checklist, after final endpoint/candidate

- Existing records survive the approved upgrade and relaunch; create/complete a synthetic test task, reopen and verify counts/no duplicates.
- Grant Notification and exact Alarm explicitly; verify one short confirmed reminder while backgrounded and locked, then completion cancels future repeats. Denial/retry/reboot do not silently duplicate.
- Try local Persian voice and, only with recording-specific consent, own-server voice; edit the draft and confirm once. No task before confirmation.
- Airplane mode/reconnect gives a labelled usable local/recovery state, never an unlabelled old page or lost records. Do not clear device storage as a test fix.

`node scripts/check-store-readiness.mjs` summarizes recorded evidence; `--require-ready` returns a nonzero status while blockers remain. It is a manual-evidence checklist, not an automated security certification or release permission.
