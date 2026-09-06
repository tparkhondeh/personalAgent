<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project continuity

Read `PROJECT_STATUS.md` and `docs/DEVELOPMENT_RULES.md` before implementation. Use targeted reads and concise evidence to conserve tokens without skipping security or regression tests. Follow `docs/ANDROID_RELEASE_PLAYBOOK.md` for Android changes. Never equate source, deployed Staging, a released APK, and real-phone acceptance.
