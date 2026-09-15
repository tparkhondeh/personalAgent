# GPT key replacement checkpoint — 2026-09-15

## Current state: blocked at required browser security confirmation

Supersedes the pending-budget statement in the earlier activation checkpoint. The owner explicitly approved **$0.25 total for synthetic live tests**, not ongoing usage, account recharge, personal text/context/audio transmission or Production activation.

The intended account identity, selected project and exposed key's name/tracking metadata/masked suffix were matched in the browser. The other account and unrelated key were untouched. The exact key's final **Revoke key** dialog was opened, but not submitted. One action-time confirmation was requested for irreversible revocation and a dedicated, restricted, 30-day replacement. No answer has arrived at this checkpoint. Credentials/account details are deliberately omitted here.

- Exposed key: **not revoked; not used, copied to files or sent to the API**.
- Replacement key: **not created or stored**. The prior private DPAPI receiver has no real-key file and was not started this time.
- Paid requests/spend by this checkpoint: **0 / $0**.
- Local readiness: key absent, cost activation false, GPT/paid transcription inactive; local processing remains usable.
- Runtime code, environment configuration, Staging, Production, Android assets and APK: unchanged in this checkpoint. No new APK is warranted by these documentation-only changes.

## Preservation and fresh evidence

Baseline local and remote main: `042806ef363a700f99ef28929ec2e4f3e26c65ad`, clean worktree.

- Verified complete Git bundle and source archive: `C:/Users/pc/Desktop/project-backups/tia-gpt-rotation-20260915/`. Working/staged patches empty; no untracked source changes were present.
- Source archive SHA-256: `9eec8f15e6d5e1d120cb7f3499d8ccf1ee9196dafef25a508cbe6fe2c56bc810`.
- Consistent SQLite snapshot: `backups/local/hamrah-2026-09-15T15-33-26-088Z.db`.
- Restore into NEW `backups/local/restore-drill-95TMvH/restored.db`: integrity, foreign keys, migration and all 18 existing tables verified unchanged. Snapshot SHA-256: `f540a35faff21f0ab0238a5bed671661a893bdc86572ea29063555b86a15c078`.
- Fresh full suite: **682/682 tests in 70 files passed** with `--maxWorkers=2`. Initial concurrent full-suite run timed out during the real-auth fixture's 30-second setup (675 passed, 7 skipped). No code, assertion or timeout was loosened; the full bounded-worker rerun passed in 73.15 seconds.
- Fresh TypeScript, full ESLint, isolated `.next-build` production build passed. Local `/api/health`: HTTP200. Build did not replace the dev server's `.next` output.
- Existing source's remote [web CI](https://github.com/tparkhondeh/personalAgent/actions/runs/34973945842) and [Android emulator QA](https://github.com/tparkhondeh/personalAgent/actions/runs/34973945907) report success. This is not a new APK, Android13/14/16 release matrix or owner-phone test.
- Actual browser at1280×900 and390×844: synthetic account login, local-mode disclosure, `جلسه با تیم فروش`,26Shahrivar1405/17:00 and offsets1440/180/60 observed. Follow-up changed the same pending draft to revision2; Cancel reported no registration. No external model was used; this is not proof of GPT extraction accuracy.

## Next exact action after the security answer

1. Revalidate the targeted key before the final revoke; verify only that key becomes inactive/absent and the unrelated key remains.
2. Create only one replacement with Responses access, a finite lifetime and no administrative/audio access unless separately required and authorized. Use the private, origin-checked loopback receiver into owner-only Windows CurrentUser DPAPI storage; verify decrypt round-trip without outputting the key. Do not overwrite an existing protected file.
3. Activate only a bounded synthetic-test setup. Never use the exposed key or silently enable paid service for existing personal accounts. A previous isolated-server launch was denied; do not retry that denied operation through a bypass.
4. Keep the verified model `gpt-5-mini`, default tier, no tools, provider storage false, retries0, output2200, full serialized request limit64000UTF8bytes and25-second timeout. Price checked in [official model documentation](https://developers.openai.com/api/docs/models/gpt-5-mini): $0.25/M input and $2/M output tokens. Recheck if pricing/model changes.
5. Before each paid request reserve a conservative allowance that fits the remaining $0.25; track actual returned token usage and retain allowance for failed/uncertain calls. Stop before a possible overrun. A request-count limit or billing alert is **not a guaranteed dollar ceiling**. Do not repeatedly spend on an error or add paid audio without separate consent.
6. Prove actual structured GPT response, follow-up same draft, three reminders, cancellation and explicit/idempotent confirmation. Test public/synthetic local audio → recognized text → GPT proposal without sending personal audio. Existing simulated failure/consent tests are reusable, not evidence of live service success.

Ongoing usage requires a separate budget/data-consent decision; propose a small explicit cap only after measuring the synthetic tests. Connected Android, bundled offline mode and owner-phone acceptance remain distinct. No internet GPT exists in offline mode. No Production or public-store deployment is authorized by this checkpoint.

## Rollback

Only documentation changed. Restore no database over current writes. If this checkpoint's documentation needs reversal, use a reviewed revert while retaining subsequent history. Key revocation is irreversible and cannot be undone by code rollback; hence the required action-time confirmation. A future replacement can be disconnected from the test runtime without touching other keys or restoring the leaked credential.
