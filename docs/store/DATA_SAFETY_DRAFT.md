# Data inventory — evidence for forms, not submitted answers

Checked source at 58b1b43, 2026-09-14. Reconcile this against the final merged APK, deployment, SDK behavior and owner policy before completing any console form. Do not equate on-device processing with server collection, or optional with absent. No advertising SDK was added by this preparation.

| Data / purpose | Current boundary | Required review |
|---|---|---|
| Name/email, user ID and auth material; account management | Server `User`, `Account`, `Session`, `Verification`; session IP/user-agent fields exist | Ownership verification/reset/delete not implemented; auth secret and password hashes must never be in artifacts |
| Tasks, meetings, participants entered in text, reminders, conversation/drafts, preferences | User-owned server tables; independent bundled local storage | User-generated content can itself contain personal data; no automatic offline merge/export today |
| Push endpoint/keys, notification and escalation history | Server, approved Push providers if subscribed; native schedules on device | Identify actual providers and background behavior; native local notification is not remote FCM delivery |
| Audio | Default local model; consent-gated bounded own-server ASR; disabled optional third-party route | Audio processing may count as collection even if transient; retention/exceptions require current form guidance, not a blanket “no collection” |
| Transcript, AI request count, action/security audit | Draft/conversation/usage/audit storage | Minimize logs and access; decide retention and deletion propagation |
| Diagnostic HTTP metadata | Hosting/CDN may see IP and request metadata | Operator must verify actual logging/retention and processing agreements |

Actual APK40 permissions: INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK and a package-local signature receiver permission. No SMS/call-log/contact/location/camera, USE_EXACT_ALARM or USE_FULL_SCREEN_INTENT entry appeared in `aapt dump permissions`. Recheck the final merged package; source manifest alone is insufficient. Microphone is requested at use; alarm/notification permission and delivery must be separately accepted on phone. Do not add restricted permissions to make a marketing claim true.

No personal voice was sent during this assessment. The own-server ASR health check was authenticated and ready, not a new recognition accuracy test. Staging OpenAI key/cost approval were absent/false; optional calls/SMS stay disabled/mock. Prior synthetic voice/agent tests do not certify the owner's microphone/network.

Official form guidance: [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en); [restricted permissions](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en); [Bazaar privacy](https://developers.cafebazaar.ir/fa/app-publish-guidelines/rules/privacy). An operator/privacy review is required; this is not legal certification.
