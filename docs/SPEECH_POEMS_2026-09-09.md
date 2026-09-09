# Speech and poem review — 9 September 2026

## Scope and starting point

Started from clean main `b54e11b74c6bc104ff2b507589813ebf79202fb6`. The last released APK was tia 38 / source `e0adc38fd50842877451e831de9bda1431de27e7`. Source, running staging, an APK, and owner-phone acceptance remain separate evidence. This report is not a claim that an unreleased APK changed.

Local all-ref Git bundle verified: `C:/Users/pc/Desktop/project-backups/personal-agent-speech-poems-20260909/source-history.bundle`, SHA-256 `b98d299c949feab5c46d3f936c7061fe3d3342cbb6b0b84ddcd789ac9a10764c`. Private env and pre-change voice controller preserved separately. Consistent SQLite backup: `backups/local/hamrah-2026-09-09T17-22-15-566Z.db`, integrity OK. Server backups under staging data/backups: `pre-speech-benchmark-20260909` and `pre-local-asr-20260909T180017Z`; neither is public or in Git.

## Research and measured choice

| Path | Evidence / practical fit | Privacy, size, licence and limitations |
| --- | --- | --- |
| Existing Vosk small-fa 0.42 / vosk-browser 0.0.8 | Real browser and same-server baseline below; remains offline/default | ~56 MB assets, current APK ~60 MB. Apache-2.0. Audio never leaves device. Worker CPU/RAM depend on phone; measured server RSS ~373 MiB is not a browser-RAM claim. [Official models](https://alphacephei.com/vosk/models) |
| Shenava Koochik ONNX / sherpa-onnx | Best aggregate of the three actually measured candidates on available CPU; optional own-server path | 458,819,249-byte weights, measured peak RSS ~1,087 MiB, two CPU threads, one inference at a time. Apache-2.0 model and sherpa. Not bundled into APK. [Model and licence](https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx), [project](https://github.com/Reza2kn/shenava-1) |
| faster-whisper small, CPU int8, beam 5 | Tested; substantially worse on this Persian set, not selected | MIT implementation, ~1,496 MiB peak RSS in this run. Results do not generalize to larger Whisper models. [Primary repository](https://github.com/SYSTRAN/faster-whisper) |
| whisper.cpp / native or WASM | Credible self-hosted/native alternative, not benchmarked here | MIT; larger models raise download/CPU/RAM. No assumed speed advantage. [Repository](https://github.com/ggml-org/whisper.cpp) |
| Android on-device SpeechRecognizer | Availability can be queried on API 31+, not guaranteed Persian on every phone | Platform/model dependent, cannot replace guaranteed bundled fallback. [Android reference](https://developer.android.com/reference/android/speech/SpeechRecognizer) |
| Browser SpeechRecognition | Not selected as a silent fallback | Limited compatibility; may use remote processing, not inherently private/offline. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) |
| OpenAI transcription | Not activated or benchmarked | Official page quoted $0.0045/min when checked; key, current price verification, cost approval and explicit external-audio consent required. [Official model page](https://developers.openai.com/api/docs/models/gpt-transcribe) |

The optional self-hosted service uses existing server resources, not a paid API; it still consumes server CPU/RAM. The device remains the default. A fresh, unchecked consent control allows sending **this recording** to tia's own server, only after its health is verified. No account/key creation, personal recording, external-ASR request, SMS, call or Production activation occurred in this work.

### Fixed public-data comparison

20 fixed Persian FLEURS mirror rows, 301.74 seconds and 489 reference words. Same files and normalized WER/CER calculation for every model; no selection by outputs. [Original Google FLEURS, CC-BY-4.0](https://huggingface.co/datasets/google/fleurs), [download mirror](https://huggingface.co/datasets/Reza2kn/fleurs-fa-benchmark). Original dataset licence takes precedence over mirror metadata. Fixture IDs, reference text, SHA-256 and result hashes: [machine-readable report](speech-benchmark-2026-09-09.json).

| Same server, 2 threads | Word errors | WER | Inference time, all 20 clips |
| --- | --- | --- | --- |
| Vosk baseline | 94 / 489 | 19.22% | 29.82 s |
| faster-whisper small | 292 / 489 | 59.71% | 137.60 s |
| Shenava Koochik | 58 / 489 | 11.86% | 11.03 s |

Timings exclude client upload and initial model loading; this is not a phone end-to-end latency guarantee. Thread settings: all runs had OMP_NUM_THREADS=2; sherpa/Whisper explicitly use two inference threads, while Vosk retains its default recognizer threading (not a proven identical CPU-thread count). Model loading was ~0.85 / 1.73 / 1.91 seconds respectively. Public read speech is not conversational task dictation; training overlap is unknown, so this is a small engineering comparison, not an independent model ranking.

Browser Chrome 152 / Windows, unchanged Vosk weights, same 20 files: before 337.92 s, after 236.41 s (~30% lower in this run). Loading portion 96.66 → 5.25 s. The implementation retains **model weights only** for 45 seconds after success, creates a new recognizer for each recording, and releases immediately on cancel/error. WER 19.02% → 18.81% is essentially unchanged; do not advertise an accuracy gain from caching. Cold/warm cache and host load affect these timings; more paired repetitions and real phones are needed for a robust latency estimate.

Additional deterministic test: first four clips (117 words), identical clean / 15 dB noise / inserted pauses for both models. WER Vosk vs Shenava: clean 17.09% / 17.09%; noise 29.06% / 20.51%; pauses **13.68% / 18.80%**. The new model is not universally better. These are simulated conditions, not recordings from a real noisy room. Names, numbers and pauses occur in the public set; colloquial dates, times and task commands still require representative owner/public domain audio. Existing Persian planner regressions test text-to-title/time/reminders separately; they are not speech-accuracy evidence.

## Service and security boundaries

- `scripts/tia-speech-service.py` binds only `127.0.0.1:3020`; no public port, TLS change or CORS. Fixed model SHA is checked at startup. Model revision `f063f38cb38fe02df39887ac65c441b755ab25a2`; SHA `6a564b5541920ce1c37bbc91d22e4b3a6838648b9b327eb88997e8db1f90950d`.
- Isolated Python 3.12 environment; sherpa-onnx/core 1.12.40, NumPy 2.5.3. Benchmark extras are not app dependencies. Do not run remote model code or unreviewed text postprocessors. Model metadata requires no per-feature normalization.
- Web proxy `/api/agent/local-transcribe` requires login, valid origin and per-recording `tia-server` consent; 5 requests/min/user, bounded WAV mono16k PCM16/60s, silence rejection, upload/inference timeouts, fixed loopback destination and no redirects. It returns **text only**, not a task or alarm.
- Private random service token is server-only; never return it, bundle it or log it. Internal service checks bearer using constant-time comparison, limits clients to four and concurrent inference to one, rejects busy requests rather than a growing queue. PM2 memory restart limit 1600M. No audio files/transcript logs, no paid/third-party fallback.
- Client cancellation/late-result guard is compatible with WebView 109. Retries after error ask for a fresh recording; raw audio is discarded. Consent is not remembered for the next recording. UI disappearance cancels capture/conversion. Cancellation cannot undo bytes already sent; the server finishes bounded in-memory inference and discards them.
- Bundled offline Android retains Vosk and the shared optimization; authenticated connected Android uses the same optional web consent path. No misleading claim that server ASR works without connectivity.
- Installer is staging-specific and backs up env + SQLite using the backup API. Rollback: stop only `tia-staging-speech`, restore backed-up staging env and restart only staging. Keep current DB; do not overwrite newer records with the snapshot. Main proxy, DNS and Production unchanged.

## All 360 poems

Every selection compared with pinned official Ganjoor data revision `1afaf46d311d6c6fa953aa7b87f5c6515dc807a6` (current upstream verified). Check includes source ID/URL, four complete hemistichs, verse/couplet order, exact words and NFC/whitespace policy. Full source hashes and changes: [audit](rumi-source-audit.json).

93 poems / 131 lines differed because the old display generator stripped diacritics and normalized letters. The known normalization was reversed from source, not reconstructed by an LLM. No independent lexical/OCR error was established beyond those differences. Examples:

- `ماننده شب` → `مانندهٔ شب` — [quatrain 352](https://ganjoor.net/moulavi/shams/robaeesh/sh352).
- `وز خاره او` → `وز خارهٔ او` — [quatrain 1613](https://ganjoor.net/moulavi/shams/robaeesh/sh1613).
- `ای زهره عیش` → `ای زهرهٔ عیش` — [quatrain 699](https://ganjoor.net/moulavi/shams/robaeesh/sh699).

Their public pages were also checked. Ganjoor classifies all selected items under Molavi/Shams quatrains and names WikiDorj as source. This verifies transcription against that edition, **not definitive manuscript authorship of all attributed quatrains**. Do not silently treat legitimate edition differences as errors. Source remains in data/docs, not below the poem.

Measured shared layout allocates RTL columns by actual text width, optimizes gap and applies one uniform Vazirmatn size in 0.875–1.125rem (14–18px at default). Font load/resize/text changes retrigger measurement. Very long poems may need natural balanced wrapping at minimum readable size; no clipping, ellipsis, word removal or horizontal scroll. Font zoom remains relative to the user's root size. At 390px: 107/360 poems fit all four hemistichs in one line; others need wrapping. At 320px none fit all four; hiding words or tiny type would be dishonest. Desktop/zoom and Android results recorded at release time.

## Web and staging acceptance

Source `389840d2474b69a44cb0874517541e25636e8f1c`: 275 tests / 41 files, typecheck, lint and optimized build passed locally and in [source CI](https://github.com/tparkhondeh/personalAgent/actions/runs/34387727403). Local HTTP checks: 27 approval + 7 interface/auth + 8 schedule preservation. Real browser: local mobile 390 and desktop 1280; next poem, typing, unauthenticated prevention. Full poem corpus QA: 320/16, 390/16, 1280/16, 1280/32 and 390/32 (width/root font), 360/360 words retained and no horizontal clipping in each. All 360 fit one line per hemistich at desktop 1280/16; 265 fit at 1280/32. Mobile long-poem wrapping is intentional and disclosed above.

Matching Linux server archive SHA `5391e5601325512d2cdae88d3c09a2646ec145e1ede7ba1be4bf7c8509d84bdc` deployed only to Staging. Consistent pre-release backup `pre-release-20260909T182231Z`; previous release `e0adc38fd50842877451e831de9bda1431de27e7` preserved. Initial cold-restart health connection was retried; final health verified new commit. Rollback script and scheduler precaution are unchanged. Main Production proxy/domain untouched.

Staging passed the same 42 HTTP checks plus 9 new voice checks, including actual fixed public FLEURS recording → exact expected Shenava transcript → draft request, with no task/meeting created. This single full HTTP transcription took 0.748 seconds for a 13.44-second clip; not a general latency guarantee. Live browser synthetic-account login showed the healthy service consent control unchecked; navigating away/back reset it, and logout restored guest state. No owner audio was recorded/sent. Loopback service also reproduced the expected public transcript (0.844 seconds in an earlier smoke).

The release APK's gzip asset cannot be compared byte-for-byte with a separate Windows build: tar metadata/compression differ. The first local same-build verifier correctly reported a mismatch when used across those builds. Independent `verify-released-speech-model.py` confirmed **all 18 decoded model files** equal the pinned upstream ZIP and the patched JS engine matches. Keep the stricter byte-for-byte gate inside the same CI build; do not replace it with a loose existence check. Raw APK SHA must still match downloaded/published bytes. Android matrix and image acceptance are recorded below when complete.

## Reproduction and remaining acceptance

### Exact Android 39 acceptance

[Run 34387758286](https://github.com/tparkhondeh/personalAgent/actions/runs/34387758286) passed on API 33/34/36 with the same APK: `tia آزمایشی 39`, `ir.wealthos.personalagent.stable39`, source `389840d2474b69a44cb0874517541e25636e8f1c`, 60,056,013 bytes, SHA-256 `526f43e92b94bcdbdcbc7e76470af2e7bc63e8c8cca67adfc0e508dc53ec81b3`. Debug-signed preview, not a Production release.

Each API: 11 native tests, real Persian recognition `خوش آمدید` from an attributed synthetic microphone/public fixture through MediaRecorder to assistant, cancellation/no effects before confirmation, all 360 exact poems at CSS width 412 (215 one-line, 145 naturally wrapped), 27 system-UI records and 11 Logcat gates, real keyboard, explicit light/dark persistence and offline/DNS/server/SSL/relaunch recovery. Twelve images (normal, dark settings, keyboard and SSL recovery on each API) were personally visually inspected; none of the accepted images is covered by a system-error dialog. They are attached to the [versioned release](https://github.com/tparkhondeh/personalAgent/releases/tag/phone-preview-stable-39).

The runner could not connect to Staging; Android online against the live server on an owner network remains unverified. Live connected web and its authenticated own-server audio path passed separately. Owner's physical microphone and conversational tasks remain acceptance work, not silently marked done. Earlier APK data remains in its own package; do not uninstall it or promise automatic offline-data migration.

Public Release published 2026-09-09 18:36:58 UTC. The stable unauthenticated download was fetched again as `artifacts/speech-poems/release-39-build/tia-stable-39-public.apk` and its full SHA exactly matches the tested APK above. Final staging `/api/health` returned this same source commit and connected DB. Post-release commits here contain reports/QA helpers, not a different runtime APK.

Public audio stays in ignored artifacts, never app assets. Prepare fixtures with `node scripts/prepare-speech-benchmark.mjs`. Run browser harness `scripts/preview-speech-benchmark.mjs`; supply `SPEECH_BASELINE_PATH` for frozen pre-change source. Server benchmarks have explicit model pins and two threads; `benchmark-noisy-speech.py` uses fixed seed 20260909. `summarize-speech-benchmark.mjs` records hashes and errors, not just successful transcription.

Safety tests: `python scripts/test-tia-speech-service.py`; authenticated proxy tests in `self-hosted-speech.test.ts`; existing voice/cancellation/planner tests retained. The APK workflow includes all-poem real WebView geometry/text tests and existing actual Persian sample, native dialogs, keyboard, cold-launch, DNS/offline/server/SSL recovery gates. Screenshot review and exact public APK hash are still required before release. Owner microphone/voice and network acceptance cannot be inferred from this benchmark or emulator.
