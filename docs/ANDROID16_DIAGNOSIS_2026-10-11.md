# Android16 diagnosis — 11 October 2026

Baseline source `fc435282917a82b64b3bd31a14fe40d853904fae` was clean. Before edits, the private Git bundle in `project-backups/tia-android16-20261011` passed verification and a separate clone restored exactly that HEAD. No application/user/cost database is being modified by this diagnostic work. Existing data/signing backups remain intact.

## Preserved failure and falsifiable next check

Exact candidate45 (`67c010c02f194adc9b90ecec6195720bef2da3612d287c51e3ce87333bd859c3`) still has failed API36 evidence from38059537215, despite API33/34 success. Its full-suite and fresh online Alarm process crash at null0x18, top native offset0x621fba0 in Trichrome BuildID8adcf5dede4f0fdb7588d446d13e50840cf83aa8 (WebView133.0.6943.137). The offline isolated process passed. That does not establish a product, provider or network root cause.

Diagnostic run38132483333 compares the exact public APK44 and withheld APK45 in **separate fresh production-like API36 emulators**, using the unchanged same-signer test APK. Each runs the implicated Alarm recreation case once online and once offline with a90s bound, preserving all logs. No uninstall, data reset, retry-until-green, WebView replacement or GPT fixture is permitted. This comparison is not a release gate or a new product build; failures remain failures. The fixture is being checked against the previous binary before adding another speculative lifecycle patch.

Two new host safeguard tests passed. A local targeted ESLint invocation stalled and was stopped; it is not counted as success. The attempted Windows Bash path was unavailable, so that command is not counted as a syntax check. The following full CI must validate the actual final source. No real phone is accessed or changed.

The [WebView maintainer discussion](https://groups.google.com/a/chromium.org/g/android-webview-dev/c/n7lFv6Zt3vo) states that matching native symbols are not currently distributed externally. We cannot reliably name this native function from its offset alone or treat an unrelated upstream crash report as a confirmed match. The standard crash handling/logging remains intact.

[Fresh server/client-path report for the administrator](SERVER_ACCESS_2026-10-11.md). This access blocker is independent of the native diagnostic.
