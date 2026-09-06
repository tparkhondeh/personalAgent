# tia: voice-to-draft, September 2026

## Root cause and behaviour

APK 34 captured audio but had no enabled transcriber. Its bundled UI explicitly did not offer transcription; the web path depended on paid OpenAI readiness. Capturing a non-empty Blob was never proof of understanding speech.

The default path now decodes Persian on the device with Vosk WASM. Stopping a recording starts transcription, then prepares an editable draft using the existing planner. Nothing is created or scheduled before the normal explicit confirmation. Account-required web actions still require login. The bundled planner works without an account; it remains local, not secretly synchronized.

Recorded audio exists only in memory. Cancellation, leaving the assistant or hiding the page abort processing and release microphone tracks. Late results are ignored. There is no audio POST or external recognition service in this default path. The optional paid server endpoint is preserved, not activated or silently selected.

Web's first use downloads about 56 MB of public engine/model assets from the app's own server. The model is cached on-device; audio is not cached. Android packages these assets inside the APK, so the first offline use does not depend on DNS, a tunnel or a model download. Processing can take time and transcription can make mistakes; the result must be reviewed. Low-signal/empty recordings and failures display a Persian error and retry/cancel controls, not success.

## Reproducible preparation and licenses

Run `pnpm speech:prepare` before packaging web/Android. The optional `TIA_MODEL_ZIP` is a build-only path to a previously downloaded ZIP. The source ZIP must match SHA-256 `977cb5faa538f3a835ccfd35f5f6d8284b5c450b89c700b9bd4736b66536ad46`; unsafe paths or wrong bytes stop the build. Generated engine/model files stay out of Git, but are included in the server and APK artifacts.

- [Vosk small Persian 0.42](https://alphacephei.com/vosk/models): Apache-2.0; Alpha Cephei. [Source ZIP](https://alphacephei.com/vosk/models/vosk-model-small-fa-0.42.zip).
- [vosk-browser 0.0.8](https://github.com/ccoreilly/vosk-browser): Apache-2.0; Ciaran O'Reilly. Exact dependency pinned in lockfile. Its queued termination is changed at asset preparation to immediate Worker.terminate; a strict source match fails closed if upstream changes. This releases audio memory during cancellation/timeouts rather than waiting for inference.
- Vosk/Kaldi third-party notices, UUID MIT and Apache license accompany distributed engine/model assets. Full upstream notices are in docs/licenses/VOSK-THIRD-PARTY-NOTICE.txt and are copied alongside the model in the APK/server, plus Release attachments. Copyright notices in the prebuilt engine remain intact.
- The dependency edge `vosk-browser > uuid` is constrained to 11.1.1 to fix GHSA-w5hq-g745-h8pq. The browser distribution only uses UUID v4; affected v3/v5/v6 buffer APIs are not exposed by tia.
- Public MIT Persian test audio and expected transcript are documented in tests/fixtures/README.md.

## Brand and preservation

The display name is `tia`. The pastel vector mark is authored in scripts/tia-logo.mjs and generated into all launcher/PWA icon sizes. Internal package/storage/database keys keep their existing names to preserve data. Historical reports are not renamed. APK previews retain unique version identities. No Production change is authorized by this rebrand.

## Required evidence

Unit/regression tests, typecheck, lint, web build, real browser decoding of the public Persian sample; same APK on Android 13/14/16, actual Persian ASR result, cancellation/no side effects, real screenshots/logcat and the standing recovery checks. Report unpublished code and tested APK separately. Physical microphone and the user's Persian requests require phone acceptance; emulator audio tests do not substitute for it.

Candidate 35 was not published: instrumentation's old blanket ban on any HTTPS text incorrectly rejected the private APK asset origin. The replacement enumerates URL literals and allows only the exact https://localhost origin, never remote hosts or lookalikes. Keep the other recovery assertions. A genuine ADB user tap precedes sample playback so WebView autoplay policy is respected, not disabled. The recorded input is the attributed public fixture, not a claim of a physical microphone test.
