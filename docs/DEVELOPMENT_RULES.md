# Durable development rules

- Use the checked-out files and verified release metadata as authority, not chat summaries.
- Optimize token use through targeted reads, concise evidence logs and parallel independent checks. Never omit security, regression tests or root-cause investigation to save tokens.
- Keep web `src/app/globals.css` as the palette source. Generate bundled Android theme from it; test matching viewport/theme and inspect screenshots.
- Assistant output is an untrusted draft. Execution requires an owned, current server-side revision and explicit confirmation. Voice capture consent is not execution consent.
- Bound model context, response size, retries, audio duration and daily usage. External processing must be opt-in, server-side and budget-configured.
- Do not archive raw audio by default. Process bounded audio in memory; discard references after success/cancel/error. Never log keys, audio or user prompts.
- Preserve source/data/history; snapshot before changes. Never change Production or incur unspecified external cost without approval.
- An API integration, a deployed service, a released APK and a real-phone test are distinct states; report evidence separately.
- Voice capture is not transcription. Default tia voice recognition stays on-device, shares its controller between web/APK and feeds only an editable draft. Every voice change must test actual Persian audio, stop-to-draft, cancellation and zero effects before explicit confirmation; a non-empty recording alone is insufficient.
- Optional own-server ASR requires fresh recording-specific consent, authenticated origin-checked bounded proxy, fixed loopback target, private server-only token, no audio logs/storage, and no silent external fallback. Warm caching may retain weights, never previous audio/recognizer state. Report comparable WER/CER and latency, not just successful decoding; disclose noisy/paused failures and missing real-phone samples.
- Poetry display text is source-verbatim after NFC/whitespace only. Never reuse search normalization to strip diacritics from display. Audit all 360 source IDs/order/hashes after edits, retain source provenance internally, and distinguish edition transcription from definitive authorship. Measure actual shared-font columns; never force long poems to one line by clipping or unreadable type.
