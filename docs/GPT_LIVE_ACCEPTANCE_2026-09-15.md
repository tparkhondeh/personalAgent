# GPT live synthetic acceptance — 2026-09-15

This supersedes the pending-key/zero-spend state in the earlier GPT reports. It is **local synthetic acceptance**, not Production activation, an Android release, or permission for daily personal-data processing.

## Credential custody

- The previously exposed tia key was observed Inactive. This agent did not perform its revocation. The unrelated codex key was left unchanged.
- Following the action-time approval, the owner created one `tia-gpt-replacement` in the verified owner account/project. Observed: Active, Restricted, Responses Write only, Never expiry. No new arbitrary credential expiration was imposed.
- The replacement was saved outside the workspace using Windows CurrentUser DPAPI and an owner-only file ACL. Encryption/decryption round-trip was verified. No plaintext secret was put in Git, `.env.local`, screenshots delivered to the owner, browser application code or APK.
- The private one-time receiver originally rejected a form whose Origin became opaque under `Referrer-Policy: no-referrer`. Changing that receiver to `same-origin` fixed the form while retaining exact Host/Origin validation, a random nonce, CSP and no-store. Do not accept `Origin: null` or weaken CSRF controls as a workaround. The receiver was stopped after successful storage and its temporary tab closed.
- `openai-credential.ts` loads this optional Windows-only protected file server-side, outside the workspace after realpath validation. Bounded hidden PowerShell decrypts ciphertext supplied on stdin; plaintext is captured only in server process memory, never passed in argv or inherited logs. Missing/invalid/decryption failures become a generic credential error. Existing server environment-key deployments remain supported; DPAPI ciphertext is not portable to Linux or another Windows identity.
- Local configuration records only the protected file path. The key was proven valid by the six real HTTP 200 responses below; configured-key readiness alone is not such proof.

## Live requests and approved cost

Only the explicitly allowlisted synthetic account was enabled. No owner's tasks, private audio or account content were sent to OpenAI. Model: `gpt-5-mini`, Responses API.

| Request | Input/output tokens | Estimated USD | Observed result |
| --- | --- | --- | --- |
| 1 | 1018 / 391 | 0.001037 | Sales-team meeting, 2026-09-17 at 17:00, offsets 1440/180/60 minutes |
| 2 | 1154 / 458 | 0.001205 | Same draft, revision 2; changed title and 16:00; offsets preserved |
| 3 | 914 / 587 | 0.001403 | Found a real bug: a greeting was incorrectly proposed as a task; cancelled |
| 4 | 1084 / 100 | 0.000471 | After prompt fix, same greeting received a social reply with no task/draft |
| 5 | 1224 / 506 | 0.001318 | Browser meeting proposal: Persian date, 17:00, important, three reminders; cancelled |
| 6 | 1049 / 397 | 0.001057 | Browser business report proposal: Persian date, 18:00, urgent, three reminders; cancelled |
| **Total** | **6443 / 2439** | **0.006491** | **6 successful real requests** |

Prices checked against [official GPT-5-mini documentation](https://developers.openai.com/api/docs/models/gpt-5-mini): input $0.25/M, cached input $0.025/M, output $2/M. No cached tokens were reported. The total is a token-based estimate rounded conservatively per call, **not a billing invoice**.

The durable ledger retains six $0.025 reservations: $0.15 reserved of the authorized $0.25 lifetime synthetic allowance. No unknown usage or HALT marker was found. Reservations were not reset/refunded after success; the remaining conservative allowance is $0.10, not a renewed $0.25. No paid transcription, purchase, auto-recharge or daily-use spending was enabled.

First-response timing was approximately 14.8 seconds and follow-up 11.3 seconds on this host; these two measurements are not an SLA or evidence of improved voice latency.

## Functional evidence and actual failures

- Request 1's exact-title assertion initially rejected `جلسه تیم فروش` because it expected `جلسه با تیم فروش`. Rechecking the same saved response, without an extra paid request, verified the equivalent subject and every date/time/reminder field. This was an overly strict test expectation, not a missed date or lost task.
- The greeting failure in request 3 was an actual behavior defect. The system prompt now explicitly treats the local parser candidate as fallible advice and returns `plan: null` for non-action social messages. A route regression test preserves null rather than inventing/saving a draft. The same real greeting was retested successfully in request 4.
- Synthetic database counts did not change before confirmation. Confirming without the explicit confirmation flag returned 422. Two concurrent final confirmations returned the same entity: exactly one meeting and three reminders. The synthetic fixture/receipt remains stored; no pre-existing records were deleted.
- A second synthetic account stayed in local mode even with external consent. Its request did not change the paid ledger. Personal accounts were never allowlisted.
- Actual browser UI was visually checked at 1280×900 and 390×844. Persian proposals, 24-hour time, editable title, three reminders and the final register control were visible; there was no horizontal overflow. Mobile vertical scrolling remained available. A legitimately past reminder was identified as unschedulable instead of being silently sent.
- Proposals used for UI review were cancelled without registration. The test account was logged out, temporary tabs/viewport overrides were cleared through normal UI, and the original local page was left open. User cookies/cache/history were not deleted.

## Voice boundary

The shared bundled voice harness used the public MIT Persian fixture `tests/fixtures/fa-welcome.wav` (SHA-256 `d5e6b0d281c052a0035df5dec6cff54506266657db5d4925271c8945bb0a7e17`). A synthetic microphone stream passed through real MediaRecorder and local recognition to `خوش آمدید`, without external audio or unconfirmed effects. That recognized text was then entered through the normal web textarea for real GPT requests 3/4.

This verifies the constituent recording/recognition and text-to-GPT paths, **not one uninterrupted live microphone-to-GPT browser interaction**, a private voice sample, noisy speech accuracy, or real-phone acceptance. Current consent handoff, stop/cancel and provider-error paths additionally have automated regression coverage. External raw-audio transcription remains disabled.

## Backup and checks

Starting main: `f5556c0c34592ec795104cf69daf303d72ac2ec7`, clean. Before edits, a source archive and incremental Git bundle were retained in `C:/Users/pc/Desktop/project-backups/tia-gpt-live-20260915-2218/`; the bundle was verified against its preserved prerequisite chain. Source archive SHA-256: `ae07b88b97d20c141cf6ce9776009be415aa5d21594a14b0118f81e5dec1868d`.

A consistent SQLite snapshot was restored into a separate fresh file; integrity, foreign keys, migrations and all 18 tables matched. Snapshot SHA-256: `1d5d54fb2c1282754d9797378903fcce553c699f756ebc187265d6d24401431d`. Existing backups and data remain intact. `.env.local` did not exist before this turn; the existing `.env` was not altered.

Type Check, ESLint, isolated web Build and 27 real local HTTP checks passed. The final full suite passed **715 tests in 72 files** on this Windows host (73.16 seconds, two workers). Credential loading has nine synthetic regression cases; provider status/errors, structured proposal, cancellation and confirmation/idempotence remain covered. Remote CI evidence will be appended when observed, not assumed.

An exact raw/base64 replacement-secret scan over 332 eligible source, public, bundled Android, built browser and documentation files found no matches. This is a scoped leak check, not an assertion about every possible encoding or every file on the machine. No real key was passed to CI. Previous unchanged Android16 CI `35007195109` was observed successful; that does not test the current server-only change or the owner's phone.

## End state, delivery and rollback

- Real GPT worked only in the existing **local `http://localhost:3001` server** during approved synthetic QA. No replacement server was launched. At end, `OPENAI_COST_APPROVED=false` was restored and readiness was rechecked as local; voice paid activation remains false. Test isolation and durable receipts remain intact. Do not remove isolation flags as a way to enable daily use.
- [Local test UI](http://localhost:3001/?view=assistant) remains usable in local mode. The encrypted replacement is ready, but daily personal GPT use is not enabled. A separate optional $2/month daily-use approval was requested; it is not assumed granted and the synthetic ledger is not a monthly budget implementation.
- Staging, Production, CDN, APK package/signature/origin and phone data were not changed. The Android offline shell cannot call internet GPT offline. No fresh APK is needed for this server-only change; the existing APK was not updated or re-certified on the owner's phone.
- To resume a synthetic test, validate the same approved identity, ledger, deadline and remaining allowance before briefly enabling paid mode; do not reset spend receipts or create another key. To enable daily use later, obtain explicit spend/data scope, implement a durable monetary guard, identify the actual tia account, and separately approve the target deployment.
- Immediate safe rollback is paid activation off (already done). If reverting code becomes necessary, use a reviewed revert of the application commit; preserve the protected file and all receipts/backups. Never reset history, delete user data or silently deploy an old archive. The key is bound to the current Windows account; off-host operational custody is a separate step, not provided by copying this ciphertext.

**Conclusion:** real GPT connectivity and scoped synthetic acceptance succeeded. Daily use, uninterrupted real-phone voice, deployment and the wider project's final acceptance remain separate outstanding items.
