# Durable development rules

- Use the checked-out files and verified release metadata as authority, not chat summaries.
- Optimize token use through targeted reads, concise evidence logs and parallel independent checks. Never omit security, regression tests or root-cause investigation to save tokens.
- Keep web `src/app/globals.css` as the palette source. Generate bundled Android theme from it; test matching viewport/theme and inspect screenshots.
- Assistant output is an untrusted draft. Execution requires an owned, current server-side revision and explicit confirmation. Voice capture consent is not execution consent.
- Bound model context, response size, retries, audio duration and daily usage. External processing must be opt-in, server-side and budget-configured.
- Do not archive raw audio by default. Process bounded audio in memory; discard references after success/cancel/error. Never log keys, audio or user prompts.
- Preserve source/data/history; snapshot before changes. Never change Production or incur unspecified external cost without approval.
- An API integration, a deployed service, a released APK and a real-phone test are distinct states; report evidence separately.
