# Alarm sounds: source implementation / integration handoff

Scope: shared sound controls, native device choice/settings, original assets and stable reminder reconciliation. No build, emulator, commit, deployment, identity/signing/key or release change. APK40 upgrade remains blocked externally by the known signing mismatch. Source/unit evidence is not phone acceptance.

## Main integration

Update: main authorized the alarm worker to finish generator/index/preview-server/test-whitelist edits and then the remaining app.js alarm integration. All are now applied. PreferencesPanel and initial server delivery grace belong to main. The only dashboard edit by the alarm worker is the actual accepted-ID acknowledgement block.

Offline integration is complete: app.js mounts the shared sound controls and uses the shared scheduler. `notificationSchedule: {version:1, entries:[{id,at}]}` is saved before permission/scheduling and reused on retry/reload; only missing future entries are scheduled. Legacy records with IDs but no timestamp mapping retain their native pending entries and never reconstruct/replay missing ones. Invalid mappings fail closed. Enable-notifications neither cancels nor reassigns IDs and ignores concurrent clicks. Scheduling, mapping writes and cancellation share one queue; completion uses current stored IDs even if the native schedule reply was delayed. Explicit edit handlers reset only their notification metadata after cancelling that task; manual-save/poetry/repeat calculation logic is preserved. NATIVE uses the ordinary notification channel; ALARM uses the selected device sound. Test-alarm is explicitly clicked and guarded against concurrent clicks.

### Web

Import `AlarmSoundSetting` from `@/components/alarm-sound-setting`; render `<AlarmSoundSetting />` in PreferencesPanel. It has its own per-device save path, no form submission and no preferences API dependency. Do not attach sound choice to server preferences or trigger reminder rescheduling on sound changes.

### Generator

In `scripts/generate-android-assets.mjs`:

```js
import { generateAlarmSoundAssets } from "./generate-alarm-sounds.mjs";
// after projectRoot is defined; before indexHtml/appScript are read:
const alarmSoundScript = await generateAlarmSoundAssets(projectRoot);
```

Add `.replace('<script src="./alarm-sounds.js"></script>', "")` in the `bundledDocument` chain. Add `${alarmSoundScript}\n` to the script concatenation **before** `${appScript}` in `serializedScript`. Use the existing callback-based replace for inserting serialized values. This keeps recovery self-contained. Keep the existing personal-poem/overview/repeat changes.

### Offline UI

In `mobile-shell/index.html`, insert `<script src="./alarm-sounds.js"></script>` before app.js, and `<div id="alarm-sound-setting"></div>` in settings. In app.js after DOM availability:

```js
window.HamrahAlarmSounds.mount(document.querySelector("#alarm-sound-setting"));
```

The helper exposes `ALARM_SOUNDS`, `ALARM_SOUND_HELP`, `LEGACY_ALARM_SOUND_HELP`, `createController()`, `mount(root)`, `prepareAlarm(ensureLegacy, legacyChannelId)` and `createDeviceAlarmScheduler(port)`.

### Offline scheduler connection

For each NEW alarm use:

```js
const sound = await window.HamrahAlarmSounds.prepareAlarm(
  () => localNotifications.createChannel({
    id: channelId, name: "کارهای فوری عقب‌افتاده", importance: 5,
    sound: "urgent_alarm.wav", vibration: true,
  }),
  channelId,
);
// ALARM: channelId: sound.channelId, sound: sound.sound, allowWhileIdle: true
// NATIVE: keep approved-local-notifications with its notification usage/default sound.
// sound.legacySound: show HamrahAlarmSounds.LEGACY_ALARM_SOUND_HELP.
```

Prefer ONE scheduler instance for `hamrah-local`, outside scheduleNotification:

```js
const localAlarmScheduler = window.HamrahAlarmSounds.createDeviceAlarmScheduler({
  owner: "hamrah-local",
  getPending: () => localNotifications.getPending(),
  cancel: options => localNotifications.cancel(options),
  schedule: options => localNotifications.schedule(options),
  checkPermissions: () => localNotifications.checkPermissions(),
  prepareAlarm: () => window.HamrahAlarmSounds.prepareAlarm(ensureLegacyChannel, channelId),
  prepareNotification: async () => {
    await localNotifications.createChannel({id:"approved-local-notifications",name:"اعلان برنامه",importance:3,vibration:true});
    return "approved-local-notifications";
  },
});
// IDs must already be persisted and reused on retry. Pass each task's full mapping:
const result = await localAlarmScheduler.sync(async () => requests, {cancelObsolete:false});
// requests: {id:number, at:epochMs, alarm:boolean, title, body, extra:{kind,taskId}}[]
```

`cancelObsolete:false` is mandatory when syncing one task; default true is only for a complete authoritative owner-wide snapshot. Completion still cancels the task's stored IDs. `clear()` cancels all that owner's pending IDs and invalidates queued/in-flight loads; do not call it for one task.

The result contains `scheduled`, `retained`, `acceptedIds` (native numeric IDs), `permissionRequired`, `legacySound`. `syncNativeEscalationAlarms` translates `acceptedIds` to the original server attempt strings. Dashboard PATCH now acknowledges only those IDs, including retained pending IDs after a failed acknowledgement. It never acknowledges skipped overdue/denied/malformed alarms.

Keep IDs AND their absolute timestamps mapped before filtering overdue entries; reusing index positions after filtering can attach the wrong ID/time. Allocate only for new scheduled entries, persist before scheduling, keep them on partial failure, and use the same IDs on retry. Never cancel/reassign all IDs when enabling permissions or saving a sound. Explicit schedule edits may cancel/rebuild that task's reminders; sound choice is not a schedule edit. Past unscheduled entries are skipped, never moved to now+1500. Native pending entries retain their existing channel/time even when a different sound is selected. Duplicate/conflicting IDs fail closed.

Fresh zero-repeat ALARM uses a one-time server-persisted `now + 10_000` startup grace **only inside fresh attempt creation**. Immediate IN_APP delivery is unchanged. `upsert.update` stays empty; list/get/retry never renews the grace. A request delayed beyond the persisted grace is skipped; the server does not acknowledge it as scheduled. Guest overdue chains anchor to the stored deadline instead of each render's current time. The merged service/guest tests pass.

## Native behavior and references

`TiaAlarmSoundsPlugin` is registered before BridgeActivity initialization and exported only into the already trusted exact recovery main-frame document alongside LocalNotifications. No origin or SSL policy changes. Native private preferences give connected and offline WebViews the same device choice. Three fixed versioned channels use named resource URIs and `USAGE_ALARM`/sonification. Existing/user-modified channels are never deleted/recreated or forced louder. The stock LocalNotifications 8.3.1 `createChannel` uses `USAGE_NOTIFICATION`; keep it for NATIVE/legacy channels only.

Preview requires a button click, is non-looping/2.4 seconds with a four-second native stop guard, stops on another preview, backgrounding, settings launch and view disposal. No volume setter, DND permission, bypass flag or interruption-policy mutation. System sound settings opens through `Settings.ACTION_SOUND_SETTINGS`, with explicit failure if the device has no handler. Browser previews use media volume and are labelled browser-only. A missing native plugin uses legacy scheduling and visibly disables unavailable controls. A present plugin failure propagates, never silently claiming a selected sound works.

Official references read 2026-09-15: [AudioAttributes USAGE_ALARM / USAGE_NOTIFICATION](https://developer.android.com/reference/android/media/AudioAttributes), [Settings ACTION_SOUND_SETTINGS](https://developer.android.com/reference/android/provider/Settings#ACTION_SOUND_SETTINGS), [NotificationChannel sound immutability](https://developer.android.com/reference/android/app/NotificationChannel#setSound(android.net.Uri,%20android.media.AudioAttributes)).

## Verification

49 unit tests / 8 files passed (2026-09-15): `alarm-sounds.test.ts`, `device-alarm-scheduler.test.ts`, `native-alarm-integration.test.ts`, `alarm-sound-assets.test.ts`, `mobile-shell.test.ts`, `escalations.test.ts`, `reminders.test.ts`, `push-client.test.ts`. Test command: `pnpm exec vitest run src/lib/alarm-sounds.test.ts src/lib/device-alarm-scheduler.test.ts src/lib/native-alarm-integration.test.ts src/lib/alarm-sound-assets.test.ts src/lib/mobile-shell.test.ts src/lib/escalations.test.ts src/lib/reminders.test.ts src/lib/push-client.test.ts --maxWorkers=2`.

Coverage: saved choice with explicit preview only; browser/legacy/failure messages; separate ALARM/NATIVE channels; pending times/sounds unchanged; concurrent retry, lost native reply and partial scheduling; expired/delivered/no-burst behavior; one-time future initial grace; accepted-ID acknowledgement; completion/clear during fetch and native scheduling; malformed/colliding IDs fail closed; actual generated helper executes and matches source; all three bounded distinct PCM assets match byte-for-byte across web/offline/native. One initial PCM comparison exceeded the 5s test timeout under concurrent work; using Buffer.equals retains exact-byte comparison while eliminating slow per-byte assertion traversal. Final suite passes without raising timeouts. Trusted recovery main-frame and explicit two-plugin whitelist checks remain intact.

Latest offline integration verification: **87 tests / 6 files passed**, including the actual app.js scheduling/activation handlers, legacy pending preservation/no replay, stable new ID/timestamp snapshots, partial failure/reload/elapsed entries, completion during native scheduling, explicit edit isolation, corrupt/quota storage, denied permission, ordinary notification separation, preview mounting and guarded test-alarm clicks. `repeat-zero.test.ts` executes the new queue/shared scheduler; it keeps the zero-repeat semantics and now expects main's 10-second server grace while offline remains at the original deadline. `manual-save.test.ts` also passes. Command: `pnpm exec vitest run src/lib/offline-alarm-sounds.test.ts src/lib/repeat-zero.test.ts src/lib/manual-save.test.ts src/lib/device-alarm-scheduler.test.ts src/lib/alarm-sounds.test.ts src/lib/alarm-sound-assets.test.ts --maxWorkers=2`.

App.js integration and source checks are complete; main performs the final all-assets/recovery regeneration and combined validation. The generated alarm helper already matches its current shared source in focused tests. No full suite, build, typecheck/lint, emulator, commit or deployment run by this worker.

Merged review refinement: `clear()` must start native cancellation independently of a stalled server fetch. Generation invalidation discards late loads; a late/partially failed native schedule cancels its own IDs in `finally`. New syncs wait for both the previous queue and the immediate cancellation barrier. Dashboard account cleanup includes both owners and checks cancellation again after JSON parsing. Combined main verification: 644 tests pass, including five added logout/race guards; see the refinement report for final build and emulator evidence.

Added `ApplicationContextTest.alarmSoundBridgePersistsChoiceAndPreservesPendingChannels`: calls the real JS/native bridge, checks actual channel USAGE_ALARM/sonification/stable resource URI, preserves prior channel and pending-notification snapshot, recreates the Activity/bridge to check selection persistence, inspects PCM headers in APK raw resources, and verifies no DND/alarm-volume/notification-volume mutation. It restores its own preference, does not play audio, and is not executed by this worker. Main runs merged typecheck/lint and all build/emulator checks separately. Audible sound routing, user-modified channels and real system settings still require exact APK testing on Android 13/14/16 and the owner's phone.
