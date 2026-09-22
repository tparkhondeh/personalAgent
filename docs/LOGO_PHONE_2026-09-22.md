# tia: logo refresh and phone-preservation gate — 2026-09-22

## Scope and verified starting point

- Started from clean `main` at `ba14e27029d9abf2c4f44add920a66d28d60edde`.
- Owner's screenshots establish the label **tia آزمایشی 40**, version **1.0.40**. Do not ask again. They do not establish the installed package, signing certificate or APK hash.
- Owner now says records may exist both signed-in and offline/guest. Preserve BOTH. Login is not migration of WebView-only data.
- No phone installation, uninstall, storage clearing, new signing key, package change, account mutation, paid request or Production change in this work.

## Connection topology — observed, not assumed

The command tools and ADB run on a Windows VMware guest (`VMware7,1`) with an active `rdp-tcp` session. Its active network is virtual Ethernet, with a separate Tailscale adapter; it is not the physical laptop's hotspot Wi-Fi adapter. This matches the owner's remote-desktop description. ADB lists **zero authorized devices**. This is not proof that phone data is absent.

The physical laptop and phone network cannot be inspected from this workspace. No network scan, public debugging port, port forwarding, tunnel, firewall change or pairing was attempted. The Linux application host is another machine; internet access to it does not put the phone on its local network.

[Android's supported wireless workflow](https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi) requires a supported Android version (phone Android11+) and a shared wireless network with the computer performing pairing. Use current official Platform Tools **on the physical laptop**, not this RDP desktop. Providing a hotspot does not by itself prove that the phone's Wireless debugging can run.

### One safe next step for the owner

Determine whether another trusted Wi-Fi is available for BOTH the phone and physical laptop. If available:

1. Leave tia installed and do not clear its memory. Return to the physical laptop desktop, outside Remote Desktop.
2. Connect phone and laptop to that trusted Wi-Fi. Do not expose debugging on the internet.
3. On the phone, Settings → About phone → Software information → tap Build number seven times if Developer options is hidden. Enter any requested device PIN **only on the phone**, never in chat.
4. Developer options → Wireless debugging. If unavailable/disabled, stop and report only that fact. Do not weaken protections to enable it.
5. Use Pair with pairing code and official laptop-side Platform Tools. `adb pair <phone-private-IP>:<pairing-port>` prompts locally for the temporary code; do not post it in chat. Then verify the device connection locally (pairing and connection ports may differ).
6. First collect only installed tia package/version/signing evidence and determine whether a supported private-data backup route exists. ADB connection alone is NOT a successful backup or migration.
7. When finished, disable Wireless debugging and forget only the newly paired laptop if no further access is needed.

If only this phone's hotspot is available and Wireless debugging will not enable, retain the old app. The safe alternatives are temporary trusted shared Wi-Fi or a future data cable; no public-port workaround. Owner has not yet supplied a reply to the shared-Wi-Fi question. No request to re-identify app name/version is necessary.

Original signing material remains unavailable in the previously scoped search; this turn did not broaden that search into unrelated projects/accounts. APK40 has no in-app offline export. Its recorded backup policy does not establish an accessible backup. A new identity is NOT authorized here. Do not deliver an incompatible internal build as an update.

## Logo and editable sources

The existing project uses code-native SVG, so it was refined as vector geometry rather than a generated bitmap. The rounded `t` has a rising, open tail and a single dot, using the existing lavender/mint palette and dark ink. No tiny lettering, third-party logo or decorative emoji is used.

- Editable geometry/palette: `src/data/tia-brand.json`.
- Editable standalone exports: `public/icon.svg`, `public/icon-maskable.svg`.
- Renderers: `scripts/tia-logo.mjs`, React `TiaMark`, `scripts/generate-brand-assets.mjs`.
- Web/favicon/Apple/PWA exports and all five Android raster densities are generated from the same data.
- Separate opaque maskable icon; original PWA `id`, `scope` and Tasks startup are preserved.
- Native adaptive foreground, full-bleed background and monochrome layer now match. The old monochrome asset was an unrelated H-shaped mark.
- Both native and web recovery embed the actual vector: no external image dependency. Authentication, endpoint, native package/signing and storage logic are unchanged.
- [Android adaptive-icon guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive): clean independent layers and safe foreground geometry. Pixel tests prove the complete visible mark fits the central66/108 circle; round/squircle proofs and24/32/48/64px readability were visually reviewed.
- `docs/assets/tia-logo-preview.png` is an honest design proof, NOT a screenshot of the owner's installed app.

## Backup and rollback

Private recovery snapshot: `C:/Users/pc/Desktop/project-backups/tia-logo-phone-20260922/`.
Git bundle verified, cloned separately and `git fsck` passed. Source ZIP extracted separately; initial raw hash comparison differed only because Git archive normalizes CRLF to LF. Normalized content equality passed. ZIP SHA256: `1482e8863adef7b279cae015dc59aa5c0df4e51231c85604c5acf769d0fcb17f`.

Working tree was clean before the snapshot. No database/environment/signing files are being edited, so live databases were not copied inconsistently. Rollback of this asset-only change uses a new reverting commit or the verified prior assets; do not reset history or restore old user data/spend.

## Verification

- Type Check and Lint passed.
- Web production build passed with isolated `.next-build` (development server was not overwritten).
- 1023/1023 tests, zero skipped; full result privately in `artifacts/brand-20260922-tests.json`.
- Five new tests cover shared vector geometry, safe circle, opaque maskable/Apple pixels, all20 Android raster outputs, adaptive resources and both self-contained recovery marks.
- First raster test used expensive deep Buffer equality and timed out; replaced with exact native Buffer equality, preserving byte accuracy. First full suite also hit the existing login setup timeout under concurrent build load. Final bounded-worker full run passed without weakening/skipping login tests.
- First recovery check correctly rejected the literal SVG namespace URL introduced into its strictly URL-free inline document. The standalone SVG keeps its namespace; the HTML inline renderer omits the redundant namespace. The original offline test remains unchanged and passes.
- Android `:app:lintDebug :app:testDebugUnitTest` passed, including resource compilation and11 Java tests/zero failures. Lint has six warnings and no errors; existing flatDir/SDK-tool-version warnings remain. No new APK was offered or installed.
- Actual browser: desktop1280×720 and mobile390×844 login render the new geometry,44px mark and no horizontal overflow in light/dark. Native-recovery source served separately at390×844 also has a48px mark and no horizontal overflow; visually reviewed. Original light preference and viewport were restored. This browser test is NOT a native-device test.
- Re-running both generators yielded identical SVG, monochrome, native recovery and PWA recovery hashes.

## Delivery boundary

Local source and local preview contain the new logo. Published APK40 and the owner's installed icon are unchanged. Staging/Production versions must be reported separately; a Git push is not deployment. No new13/14/16 exact-binary acceptance or phone acceptance is claimed. Safe phone-data preservation and installed-signature verification remain the essential APK delivery gate.
