# Android notification-center routing — 2026-09-13

Owner reported “مرورگر از اعلان پشتیبانی نمی‌کند” **inside the installed app**, not a browser. Starting clean main: `7290357947ea119cb80a0408a7c054c18d2dda5f`.

## Confirmed cause and scoped correction

- Connected `PersonalAgentDashboard` called `enablePushNotifications()` unconditionally. That browser-only function checks Service Worker/PushManager and cannot activate native Android notifications. Bundled offline settings already use the native LocalNotifications plugin and are a different path.
- New `notification-access.ts` selects the Capacitor native Android path before touching any browser Push API. It checks plugin availability, requests display permission only on the user's click and distinguishes grant, denial, bridge failure and uncertain/exact Alarm permission. Native failures never fall back to Web Push.
- This button does **not** open the separate exact-Alarm settings automatically, schedule a test alert, create work or change reminder times. Existing account synchronization still handles only confirmed future reminders. The existing settings button grants exact Alarm access separately.
- Browser/PWA keeps Web Push; missing Notification API is now detected as well. Permission/subscription success is no longer labelled “full notifications”: actual delivery remains unverified. Status appears separately from the fixed action label; an in-flight ref and disabled button prevent repeated activation clicks while permission is pending.
- Native notifications are not remote Push. No FCM project, new provider, paid request, personal-data transfer, call or SMS was enabled.

Primary references: [Capacitor v8 local notifications](https://capacitorjs.com/docs/apis/local-notifications) and [platform/plugin detection](https://capacitorjs.com/docs/basics/utilities). Installed Next client/server boundary and memory guidance were read before implementation. No Android permission, manifest, endpoint, package identity or signing change.

## Preservation and local verification

- Backup: `C:/Users/pc/Desktop/project-backups/tia-native-notification-20260913/`; working-copy documents/source copied with identical hashes; full source archive SHA-256 `b7d92cb0bbb5748b4f2bceb5075c17f4efdf2ef6e8927c185ae76a8140db4f6c`. History remains unchanged; prior verified all-ref backups retained.
- Consistent DB snapshot `backups/local/hamrah-2026-09-13T15-47-17-514Z.db`; SHA `4bb78ce7ce2dcbe50097dc516284b6aebfdf4d51a39750d9c4a6efd6ba0dba24`. Restore drill `backups/local/restore-drill-G9ZZFb/restored.db` at `15:50:05.605Z`: integrity/FK OK, all 18 tables unchanged, no scheduler/live writes.
- 12 new device-routing tests cover Android without Web Push globals, permission grant/denial, exact/unknown Alarm, missing bridge, sanitized failures and browser delegation. Three browser capability guards and one isolated-build regression test also pass. Final suite: **437 tests / 49 files**.
- Type Check, complete Lint and isolated production Build passed. First Build failed while spawning 23 page workers (native/JS out-of-memory); it is preserved as failed evidence, not a pass. Existing `HAMRAH_ISOLATED_BUILD=true` now selects only two build workers, verified against installed Next's supported `experimental.cpus` implementation. Normal CI/runtime config is unchanged; the subsequent complete Build passed with two workers. No other user's processes or memory settings were changed.
- Real browser: existing synthetic account login, notification center opens, fixed activation button and separate status. Browser permission returned denied; UI showed denial, not success. Mobile-width screenshot inspected. This is not a native Android permission prompt or actual phone delivery test; native branch tests above use mocked Capacitor APIs.

## Release boundary and remaining evidence

APK remains **tia آزمایشی 40**, package `ir.wealthos.personalagent.stable40`, source `34180286b90008498c839f3ec3b4fd72749c750a`, SHA `909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`. No diff in native/bundled code or Capacitor config. Existing exact-file Android 13/14/16 evidence covers the unchanged binary/offline path, **not** the new connected JavaScript or owner phone acceptance. No rebuild or uninstall is needed for this connected-web correction.

CI/package, Staging deployment and final verification will be appended after their actual results. Until then local source is not a delivered fix. CDN caching/8443 network issue in ticket 52407 is separate and remains unresolved; a cached old page can still show the old message. Never clear phone data or weaken TLS to work around it.
