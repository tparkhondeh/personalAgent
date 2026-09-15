# GPT synthetic-test checkpoint — 2026-09-15

## Actual state

This supersedes the earlier key-rotation checkpoint; that document remains historical evidence. The owner approved **$0.25 total for synthetic live tests**, and requested no arbitrary key expiration. No ongoing personal-data processing or Production activation is approved by this budget.

- Fresh browser observation: the exactly matched exposed `tia-personal` key is **Inactive**. The agent did not submit revocation in this run and does not claim who revoked it. The unrelated `codex` key remains Active and untouched.
- Correct account and selected project were checked. The replacement form is prepared as `tia-gpt-replacement`, **Never** expiration, Restricted, Responses Write only; other categories None. No final Create submission. The required action-time question for creation and encrypted local custody is pending.
- No replacement key exists in the private receiver's expected protected file. No leaked key was used or copied. No live paid request was sent; actual test spend in this run is **$0**.
- Existing local environment has no API key, cost activation is off, and the new test flags are absent. The current local UI truthfully uses local processing. GPT is **not operationally verified** anywhere in this checkpoint.
- Staging, Production, native/bundled Android assets and APK were not modified. These server-only safeguards do not require a new APK. Earlier unshipped web changes are still not proof of phone parity.

## Independent implementation

`src/lib/ai-test-policy.ts` is an optional server-only test guard, not ordinary-use consent and not a replacement for provider billing controls.

All three flags must be absent for unchanged ordinary behavior. Setting any flag enables fail-closed test mode; an incomplete/expired policy allows no external GPT. Before paid QA, configure all three only in the approved test runtime:

- `OPENAI_TEST_USER_ID`: the exact dedicated synthetic account ID. Existing personal accounts are excluded, including their integration-readiness display.
- `OPENAI_TEST_LEDGER_DIR`: an existing private directory outside the web workspace, never in public/static assets; retain it across retries and restarts.
- `OPENAI_TEST_EXPIRES_AT`: an explicit future test-session deadline. This expires test permission, **not the OpenAI key**. Normal request cancellation/25-second timeout remain.

The route still requires current explicit external-text/context consent, owned draft revisions, and final execution confirmation. Paid audio is unavailable in this test mode even if a voice setting is accidentally present. Capture, local recognition, sending text to GPT, and execution remain separate decisions.

Before network egress the transport checks the exact Responses endpoint, `gpt-5-mini`, default tier, no stored response, no tools, text-only input, no conversation/previous-response context, no streaming/background processing, at most 64,000 serialized UTF-8 bytes and 2,200 output tokens. Unsupported shapes fail without sending. Request retries remain zero.

### Monetary reservations and limits of the estimate

Official prices checked on this date: [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini): $0.25/M input tokens, $0.025/M cached input, $2/M output. A conservative UTF-8-byte input bound plus 4,096 framing allowance and full output cap yields at most $0.021424 under these fixed assumptions. Each attempt exclusively reserves **$0.025** in a durable file before sending; at most **$0.25** can be reserved across the same ledger. Failed, partial, cancelled or uncertain calls do not refund their reservation. File collisions are consumed slots; I/O failure blocks egress. Never rotate, reset, delete, overwrite or substitute the ledger to replenish the approved test allowance.

Returned numeric token usage is captured from a response clone without consuming the SDK response. Only status, counts and price-derived micro-dollar estimates are saved, never provider bodies/headers/errors/prompts/keys. Unknown usage retains the full reservation. Usage beyond the assumptions creates a HALT marker for subsequent calls. Concurrent requests already reserved remain bounded by their own reservations.

This is a **conservative application reservation tied to the stated model/prices/payload bounds**, not a universal provider-enforced dollar cap or a billing invoice. Verify current pricing and remaining approved budget before activation. Do not equate ten requests or provider billing alerts alone with a guaranteed currency ceiling. A later model, tool, tier or payload change requires new cost validation. Report provider-billed usage separately when available.

End QA by disabling cost activation/removing the key from the runtime while preserving encrypted custody and ledger evidence. Removing only the test flags would restore normal eligibility and is **not a safe deactivation procedure**. Ongoing use needs a separate explicit budget and personal-data consent decision after measuring synthetic usage.

## Backup and verification

Baseline local/remote main `e8dae9b182499cea4496558fd2edf92a1c6d76d9`, clean.

- Source archive and verified continuation bundle: `C:/Users/pc/Desktop/project-backups/tia-gpt-activation-followup-20260915/`. Keep the continuation with the complete `tia-gpt-rotation-20260915/main.bundle`; its prerequisite is `042806e`. Existing backup files were preserved. Source archive SHA-256 `90ed7b829bce6769f898fa68112fad3b74627065abbd8593ae08efd6d4e8204f`.
- Consistent SQLite snapshot `backups/local/hamrah-2026-09-15T18-00-35-846Z.db`, SHA-256 `72b9ba5a4b41df6db0fc4d482e83203aeb57e9718eeffbef9fd5e58e472449a6`.
- Restore into new `backups/local/restore-drill-jjkYKN/restored.db`: integrity, foreign keys, migrations and all 18 table counts preserved. No restore over a live database.
- Full suite **703 tests / 71 files** passed with two workers. Two additional SDK-boundary tests were then added; all **21 tests in the changed policy suite** passed. This is **705 distinct tests covered**, not a claim that a 705-test full rerun happened. Tests cover concurrent reservations, private/partial/expired policy, synthetic owner isolation, paid voice denial, unknown usage, HALT, failed calls, safe error labels, real installed SDK wire acceptance and no-network rejection. SDK transport remains mocked; it is not a paid GPT response.
- Fresh Type Check, full ESLint and isolated `.next-build` production build passed. After the final test-only additions, Type Check and affected-file ESLint passed again; application build inputs did not change.
- Fresh `qa-agent-flow.mjs`: **27 real HTTP checks passed** for confirmation ownership, no pre-confirm effects, follow-up revision, three reminders, create-without-edit, cancellation, duplicate prevention and future-alarm cancellation. Synthetic account records were retained, not personal data deleted.
- Actual browser **1280×900 and 390×844**: local-mode label, `جلسه با تیم فروش`,26Shahrivar1405/17:00, offsets1440/180/60 and accessible Register/Cancel controls observed. Mobile scroll width equalled390, with no horizontal overflow. Follow-up changed the visible title to `جلسه هماهنگی فروش`; Cancel reported no scheduling, active count stayed5. Real screenshots were visually reviewed. Synthetic account was signed out and responsive override reset. No cache/cookies/storage were cleared.
- Pattern scan of source, public assets, native bundled assets and built browser chunks found no long OpenAI-key-shaped value; this is a scoped scan, not proof about every possible secret format. No new secret exists to bundle.
- No new audio recognition benchmark, live GPT acceptance, phone test or Android13/14/16 release matrix was claimed. Prior unchanged local-audio fixture evidence remains in the activation checkpoint; audio-to-real-GPT acceptance awaits a protected replacement and test activation.

## Next exact steps / rollback

1. Obtain the pending action-time creation answer; inspect the current form/result before acting to avoid a duplicate if the owner created it. Never revoke or edit unrelated keys.
2. Create at most one scoped replacement with Never expiration as requested. Transfer without printing through the existing origin-checked, single-use loopback receiver into owner-only CurrentUser DPAPI storage outside Git; verify encrypted round-trip and ACLs without displaying it. Do not overwrite any existing key file.
3. Configure the bounded synthetic-only runtime and retain one fresh ledger for the approved $0.25 total. A previous isolated-server launch was denied; do not retry that denied operation via a bypass. If activation requires new authority, stop at that exact boundary.
4. Run actual GPT structured responses, follow-up, reminders, cancellation/idempotent confirmation, then approved public/synthetic local audio → text → GPT proposal. Simulate credential/quota/network/timeouts rather than spending repeatedly on errors. Record actual usage and estimate before a next request.
5. Deactivate paid test eligibility after verification. Report local web, deployed Staging, connected Android and offline APK separately. No Production change or daily personal-data consent is implied.

Code rollback is a reviewed revert of the optional guard commit, preserving later history. Do not restore a database over subsequent writes. Remove test activation and injected runtime secret before a rollback that removes guards; retain encrypted custody and spent-reservation evidence. Never restore or reuse the exposed credential.
