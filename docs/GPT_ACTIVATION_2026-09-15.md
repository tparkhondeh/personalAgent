# GPT activation checkpoint — 2026-09-15

## Status: NOT live-tested / NOT activated

Baseline local/remote main: `04a8120cf79dd351d70c6956f262363dee1a9069`.
This checkpoint is tested integration preparation, **not a successful GPT response**.
No paid API call, new live key, Production/CDN change, Staging deployment or APK release was made during this checkpoint.

The browser's intended account was verified using the actual account identity and selected project, not the generic Personal/Default labels. Another open tab belongs to a different account; its existing keys were left untouched. The intended account's key list had no tia-specific key. The prior attempt did not produce a saved key; do not blindly retry it in the other tab.

Action-time confirmation for one restricted, 30-day `tia-personal` Responses key and approval of a **total $0.25 synthetic-test ceiling** were requested separately and remain unanswered. Do not infer unlimited or ongoing usage approval from a funded account. Account identifiers, billing details and credentials are intentionally omitted from this public document.

## Changes and reasons

- `VoiceInput` produced recognized text, but its web callback called `sendMessage(text)` with the default external consent of false. It now passes the current, explicit GPT checkbox choice. **Raw audio remains on-device by default**; selecting GPT only authorizes the recognized text/related context disclosed by the checkbox. Declining it still stays local. Execution still requires the owned current draft and explicit confirmation.
- A synchronous in-flight lock blocks duplicate sends before React rerenders, and releases on failure. Pending draft ID/revision and conversation ID remain part of follow-up requests.
- Use the installed SDK's explicit Responses endpoint and strict structured output. No model change: `gpt-5-mini`. No execution tools, no provider-side response storage, `maxRetries: 0`, output limit 2,200 tokens, server timeout 25 seconds, default service tier, low reasoning for that model. These settings are not a measured speed improvement.
- Bound the **entire serialized provider body** to 64,000 UTF-8 bytes, including schema/history. Oversized/unknown bodies fail closed before network transmission; do not silently truncate user meaning.
- Provider failures become bounded public categories: key/access, insufficient credit, rate limit, timeout, invalid output, connection and oversized context. Raw upstream messages, headers, response bodies and credentials are never echoed. UI explicitly distinguishes an actual online response from local fallback.
- Paid audio transcription has a separate `OPENAI_VOICE_ENABLED=true` gate and requires an explicitly configured audio model in addition to cost/key readiness. A Responses-only key never advertises audio as enabled. The previously guessed audio model default was removed. This does not disable the existing on-device or consented own-server recognizer.
- The old local speech-flow harness omitted `storage.js` and `alarm-sounds.js`, causing `createTaskStore` to be unavailable. Its allowlist now includes both; a regression test checks every bundled entry script. This was a **test harness fault**, not a fixed APK or new speech model.

## Preservation

- Verified all-ref Git bundle and source archive outside the repository: `C:/Users/pc/Desktop/project-backups/tia-gpt-20260915/main.bundle` and `source.zip` in the same directory.
- Source archive SHA-256: `35ae8fd0bdcb71e4d8986cf34a98dc3d49ae249d991dc8bd80edd6b332db6024`.
- SQLite snapshot: `backups/local/hamrah-2026-09-15T12-48-22-772Z.db`; integrity checked and restored independently to `backups/local/restore-drill-qivEVC/restored.db`. All 18 tables and foreign keys verified; existing data were not overwritten.
- Owner-only local key receiver/DPAPI protection was previously round-trip tested with synthetic content. **No real tia key is stored there yet.** Private scripts/files are outside Git. Revalidate account/key list before the final create action; retain old keys and do not overwrite a saved secret.
- A proposed isolated-server launch was rejected by the execution policy and was not retried through a bypass. HTTP/UI QA instead used explicitly synthetic accounts in the already-running local app, retaining their audit/test records. No paid configuration was enabled there.

## Evidence (all external-provider errors simulated)

| Check | Observed result |
| --- | --- |
| Focused GPT/voice submission, error, budget and SDK tests | 77 passing tests; synthetic transport, zero paid requests |
| Whole suite | 680 tests / 70 files passed after fixing the outdated voice-callback assertion |
| Final harness/readiness additions | 20 tests across the two affected suites passed; two newly added tests, 682 distinct tests covered overall |
| Type check / full lint / isolated web build | Successful; final test/script changes also rechecked with targeted lint and type check |
| Real installed SDK wire contract | `/v1/responses`, strict required fields, no tools, no storage, default tier, bounded request and output; transport is mocked, not OpenAI acceptance |
| Real local HTTP flow | `qa-agent-flow.mjs`: 27 checks passed on localhost:3001, synthetic owner/other-owner accounts; consent, draft ownership/revisions, no effects before approval, duplicate confirmation, three reminders, cancellation and completion |
| Real browser, 1280×900 and 390×844 | Persian title, Jalali date, 17:00, three reminders and visible local-mode label inspected; readable preview/register controls, no white page |
| Follow-up and double click | “عنوانش رو بذار جلسه بررسی قرارداد” changed the same draft; two-click confirmation yielded one meeting. Targeted DB check: exactly one matching meeting and one EXECUTED draft at revision 2 |
| Cancel | The second proposal “تماس با علی درباره قرارداد” showed 26 Shahrivar/10:00; Cancel removed it and reported no registration. Only the prior confirmed meeting increased the count |
| Real local audio / bundled UI source | Public attributed fixture decoded to **خوش آمدید**; real AudioContext/MediaRecorder into local recognizer and assistant passed, no task created and no audio transmitted externally |
| Secret-pattern scan | No API-key pattern or `OPENAI_API_KEY` in built client JS/HTML, mobile shell or Android public assets; no actual new key exists to perform a live-key byte comparison |

The browser audio fixture uses a synthetic microphone stream from a public licensed sample, not the owner's microphone. It verifies local speech-to-proposal wiring, **not GPT processing of speech, noisy full-sentence accuracy, or real-phone acceptance**. The web callback's GPT-consent branch has executable handler tests, but awaits a live service test.

The initial full-suite failure was a static assertion requiring the old consent-dropping callback. It was replaced with the explicit-consent callback assertion plus executable tests for consent on/off; the original on-device/no-audio-egress checks remain. No security or regression gate was removed to make tests pass.

## Versions and remaining work

- **Local:** changes tested in the current web source/build; live GPT remains off (key/cost approval missing).
- **Staging:** not redeployed in this checkpoint. Prior documented source `289a76f`; this checkpoint does not prove public 8443 cache correctness. Previously documented CDN/worker mismatch remains separate.
- **Connected Android:** will receive web fixes only when the verified web candidate is deployed and the actual loaded source is checked; not updated merely by committing.
- **Bundled/offline Android:** no GPT networking is added; it remains local. Bundled application assets/native code were not changed; no new APK was needed or released for this server/web correction. Public APK40 and internal candidate42 remain separate; signing/data-preservation gate is unchanged.
- **Phone:** no new real-device test or acceptance.

After the two pending confirmations: create/save the one scoped key securely, activate only an approved synthetic-test environment, and verify actual GPT structured output, date/time/reminders, follow-up, cancellation and idempotent confirmation. Run only a small bounded set with fixed model/tier, minimal synthetic context, no tools/retries and record actual token usage. Do not treat a request-count limit or provider budget alert as a guaranteed dollar hard stop. Failures such as low credit/rate limits remain simulated instead of burning credit deliberately.

Ongoing personal use and sending personal context/audio require their own clear consent/budget; the proposed $0.25 covers testing only. Text activation does not authorize paid transcription. Server/Production activation boundaries and rollback must be reported separately. Rollback this checkpoint via a reviewed revert or separate checkout of the verified baseline, retaining the current database; never reset history or restore an old DB over new writes.

References: [official GPT-5 mini model capabilities/pricing](https://developers.openai.com/api/docs/models/gpt-5-mini), [official API authentication/security](https://developers.openai.com/api/reference/overview), [public speech fixture provenance](../tests/fixtures/README.md).
