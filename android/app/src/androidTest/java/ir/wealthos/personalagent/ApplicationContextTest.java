package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ApplicationContextTest {
    @Test
    public void applicationContextUsesExpectedPackage() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(appContext.getPackageName().startsWith("ir.wealthos.personalagent"));
    }

    @Test
    public void startupDoesNotDependOnDownloadableEmojiFonts() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.pm.ProviderInfo provider = context.getPackageManager().getProviderInfo(
            new android.content.ComponentName(context, "androidx.startup.InitializationProvider"),
            PackageManager.GET_META_DATA
        );
        assertTrue(provider.metaData == null || !provider.metaData.containsKey("androidx.emoji2.text.EmojiCompatInitializer"));
    }

    @Test
    public void manifestKeepsAlarmInfrastructureAndPrivateBackupPolicy() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo packageInfo = appContext.getPackageManager().getPackageInfo(
            appContext.getPackageName(),
            PackageManager.GET_PERMISSIONS | PackageManager.GET_RECEIVERS
        );

        assertNotNull(packageInfo.requestedPermissions);
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.POST_NOTIFICATIONS));
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.RECORD_AUDIO));
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.MODIFY_AUDIO_SETTINGS));
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.SCHEDULE_EXACT_ALARM));
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.RECEIVE_BOOT_COMPLETED));
        assertNotNull(packageInfo.receivers);
        assertTrue(Arrays.stream(packageInfo.receivers).anyMatch(receiver ->
            receiver.name.equals("com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher")
        ));
        assertTrue(Arrays.stream(packageInfo.receivers).anyMatch(receiver ->
            receiver.name.equals("com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver") && !receiver.exported
        ));
        assertEquals(0, appContext.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertNotNull(appContext.getSystemService(AlarmManager.class));
        assertNotNull(appContext.getSystemService(NotificationManager.class));
    }

    @Test
    public void mainActivityCreatesCapacitorBridgeAndWebView() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertFalse(activity.isFinishing());
                assertNotNull(activity.getBridge());
                assertNotNull(activity.getBridge().getWebView());
            });
        }
    }

    @Test
    public void bundledRecoveryPageContainsRealPersianActions() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String recovery;
        try (InputStream stream = appContext.getAssets().open("public/connection-error.html");
             BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            recovery = reader.lines().collect(Collectors.joining("\n"));
        }

        assertTrue(recovery.contains("اتصال برقرار نشد"));
        assertTrue(recovery.contains("تلاش دوباره"));
        assertTrue(recovery.contains("ادامه در حالت محلی"));
        assertTrue(recovery.contains("const bundledDocument ="));
        assertTrue(recovery.contains("const bundledScript ="));
        assertTrue(recovery.contains("document.write(bundledDocument)"));
        assertTrue(recovery.contains("offlineRuntime.textContent = bundledScript"));
        assertTrue(recovery.contains("برنامه امروز"));
        assertFalse(recovery.contains("fetch(\"./index.html\""));
        try (InputStream model = appContext.getAssets().open("public/speech/fa-0.42.model")) {
            assertEquals("Bundled model must retain gzip bytes", 0x1f, model.read());
            assertEquals(0x8b, model.read());
        }
        // Only the APK's private asset origin is allowed. Speech model URLs are
        // bundled, not a network dependency. Keep rejecting every remote host.
        java.util.regex.Matcher urls = java.util.regex.Pattern
            .compile("https?://[^\\s\"'\\\\<>]+")
            .matcher(recovery);
        while (urls.find()) {
            String url = urls.group();
            assertTrue("Unexpected recovery dependency: " + url,
                url.equals("https://localhost") || url.startsWith("https://localhost/"));
        }
    }

    @Test
    public void mainActivityRendersRealPersianContent() throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> bodyText = new AtomicReference<>("");

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(3_000);
            scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                "document.body ? document.body.innerText : ''",
                value -> {
                    bodyText.set(value == null ? "" : value);
                    evaluated.countDown();
                }
            ));

            assertTrue("WebView text evaluation timed out", evaluated.await(10, TimeUnit.SECONDS));
            String content = bodyText.get();
            assertFalse("WebView rendered an empty document", content.equals("\"\"") || content.equals("null"));
            assertTrue(
                "WebView did not render the Persian interface",
                content.contains("tia") || content.contains("ورود") || content.contains("اتصال برقرار نشد")
            );
        }
    }

    @Test
    public void urgentNotificationChannelCanDisplayAndCancelNotification() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotificationManager manager = appContext.getSystemService(NotificationManager.class);
        String channelId = "urgent-overdue-instrumented-test";
        int notificationId = 930_001;
        Uri sound = Uri.parse(
            "android.resource://" + appContext.getPackageName() + "/" + R.raw.urgent_alarm
        );
        NotificationChannel channel = new NotificationChannel(
            channelId,
            "تست هشدار فوری همراه",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.enableVibration(true);
        channel.setSound(
            sound,
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
        );

        manager.createNotificationChannel(channel);
        try {
            NotificationChannel created = manager.getNotificationChannel(channelId);
            assertNotNull(created);
            assertEquals(NotificationManager.IMPORTANCE_HIGH, created.getImportance());
            assertTrue(created.shouldVibrate());
            assertNotNull(created.getSound());

            manager.notify(
                notificationId,
                new NotificationCompat.Builder(appContext, channelId)
                    .setSmallIcon(R.drawable.ic_stat_hamrah)
                    .setContentTitle("کار فوری عقب‌افتاده")
                    .setContentText("این یک هشدار آزمایشی محلی است.")
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setAutoCancel(true)
                    .build()
            );

            assertTrue(waitForNotificationState(manager, notificationId, true));
            manager.cancel(notificationId);
            assertTrue(waitForNotificationState(manager, notificationId, false));
        } finally {
            manager.cancel(notificationId);
            manager.deleteNotificationChannel(channelId);
        }
    }

    @Test
    public void alarmSoundBridgePersistsChoiceAndPreservesPendingChannels() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        android.media.AudioManager audio = context.getSystemService(android.media.AudioManager.class);
        assertNotNull(manager);
        assertNotNull(audio);
        int interruptionFilter = manager.getCurrentInterruptionFilter();
        int alarmVolume = audio.getStreamVolume(android.media.AudioManager.STREAM_ALARM);
        int notificationVolume = audio.getStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION);
        android.content.SharedPreferences prefs = context.getSharedPreferences("tia_alarm_sounds_v1", Context.MODE_PRIVATE);
        String originalChoice = prefs.getString("soundId", null);
        String notificationQaChannel = "tia-notification-sound-qa-v1";
        boolean notificationQaExisted = manager.getNotificationChannel(notificationQaChannel) != null;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertNotNull(activity.getBridge().getPlugin("TiaAlarmSounds")));
            waitForAlarmBridge(scenario);
            JSONObject pendingBefore = callAlarmBridge(scenario, "return await window.Capacitor.Plugins.LocalNotifications.getPending();");
            callAlarmBridge(scenario,
                "await window.Capacitor.Plugins.LocalNotifications.createChannel({id:'tia-notification-sound-qa-v1',name:'آزمون اعلان معمولی',importance:3,sound:'urgent_alarm.wav'});return {};"
            );
            assertEquals(AudioAttributes.USAGE_NOTIFICATION, manager.getNotificationChannel(notificationQaChannel).getAudioAttributes().getUsage());
            JSONObject dawn = callAlarmBridge(scenario,
                "const p=window.Capacitor.Plugins.TiaAlarmSounds;await p.setSelection({soundId:'dawn'});return await p.ensureChannel();");
            assertEquals("dawn", dawn.getString("soundId"));
            assertEquals("tia-alarm-v1-dawn", dawn.getString("channelId"));
            NotificationChannel original = manager.getNotificationChannel(dawn.getString("channelId"));
            assertNotNull(original);
            Uri oldSound = original.getSound();
            int oldImportance = original.getImportance();
            assertEquals(AudioAttributes.USAGE_ALARM, original.getAudioAttributes().getUsage());
            assertEquals(AudioAttributes.CONTENT_TYPE_SONIFICATION, original.getAudioAttributes().getContentType());
            assertEquals(Uri.parse("android.resource://" + context.getPackageName() + "/raw/tia_alarm_dawn_v1"), oldSound);
            assertFalse(original.canBypassDnd());

            JSONObject chime = callAlarmBridge(scenario,
                "const p=window.Capacitor.Plugins.TiaAlarmSounds;await p.setSelection({soundId:'chime'});return await p.ensureChannel();");
            assertEquals("tia-alarm-v1-chime", chime.getString("channelId"));
            NotificationChannel second = manager.getNotificationChannel(chime.getString("channelId"));
            assertEquals(AudioAttributes.USAGE_ALARM, second.getAudioAttributes().getUsage());
            assertEquals(Uri.parse("android.resource://" + context.getPackageName() + "/raw/tia_alarm_chime_v1"), second.getSound());
            NotificationChannel oldAfter = manager.getNotificationChannel(dawn.getString("channelId"));
            assertEquals(oldSound, oldAfter.getSound());
            assertEquals(oldImportance, oldAfter.getImportance());
            assertEquals(AudioAttributes.USAGE_ALARM, oldAfter.getAudioAttributes().getUsage());
            assertEquals(pendingBefore.toString(), callAlarmBridge(scenario,
                "return await window.Capacitor.Plugins.LocalNotifications.getPending();").toString());

            // Recreate the bridge/activity: native private preferences outlive WebView state.
            scenario.recreate();
            waitForAlarmBridge(scenario);
            assertEquals("chime", callAlarmBridge(scenario,
                "return await window.Capacitor.Plugins.TiaAlarmSounds.getSelection();").getString("soundId"));
            assertEquals("chime", prefs.getString("soundId", null));
            assertEquals(oldSound, manager.getNotificationChannel(dawn.getString("channelId")).getSound());

            // Verify actual bundled PCM exists without playing audio or opening settings.
            for (String id : new String[] { "dawn", "chime", "pulse" }) {
                int resource = context.getResources().getIdentifier("tia_alarm_" + id + "_v1", "raw", context.getPackageName());
                assertTrue("Missing bundled sound: " + id, resource != 0);
                try (InputStream stream = context.getResources().openRawResource(resource)) {
                    byte[] header = new byte[12];
                    assertEquals(12, stream.read(header));
                    assertEquals("RIFF", new String(header, 0, 4, StandardCharsets.US_ASCII));
                    assertEquals("WAVE", new String(header, 8, 4, StandardCharsets.US_ASCII));
                }
            }
            assertEquals(interruptionFilter, manager.getCurrentInterruptionFilter());
            assertEquals(alarmVolume, audio.getStreamVolume(android.media.AudioManager.STREAM_ALARM));
            assertEquals(notificationVolume, audio.getStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION));
        } finally {
            // Restore only this test's preference; preserve all preexisting channels/data.
            android.content.SharedPreferences.Editor editor = prefs.edit();
            if (originalChoice == null) editor.remove("soundId"); else editor.putString("soundId", originalChoice);
            assertTrue(editor.commit());
            if (!notificationQaExisted) manager.deleteNotificationChannel(notificationQaChannel);
        }
    }

    private String evaluateAlarmJs(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("null");
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, result -> {
            value.set(result); evaluated.countDown();
        }));
        assertTrue("Alarm bridge evaluation timed out", evaluated.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    private void waitForAlarmBridge(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + 15_000;
        do {
            if ("true".equals(evaluateAlarmJs(scenario,
                "Boolean(window.Capacitor?.isPluginAvailable?.('TiaAlarmSounds') && window.Capacitor?.Plugins?.TiaAlarmSounds && window.Capacitor?.Plugins?.LocalNotifications)"))) return;
            Thread.sleep(100);
        } while (android.os.SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("TiaAlarmSounds JS bridge unavailable");
    }

    private JSONObject callAlarmBridge(ActivityScenario<MainActivity> scenario, String asyncBody) throws Exception {
        evaluateAlarmJs(scenario, "window.__tiaAlarmQaDone=false;(async()=>{" + asyncBody +
            "})().then(value=>{window.__tiaAlarmQaResult=JSON.stringify({value});window.__tiaAlarmQaDone=true;},error=>{" +
            "window.__tiaAlarmQaResult=JSON.stringify({error:String(error)});window.__tiaAlarmQaDone=true;});true");
        long deadline = android.os.SystemClock.elapsedRealtime() + 10_000;
        do {
            if ("true".equals(evaluateAlarmJs(scenario, "window.__tiaAlarmQaDone===true"))) {
                String encoded = evaluateAlarmJs(scenario, "window.__tiaAlarmQaResult");
                JSONObject result = new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
                assertFalse("Native sound call failed: " + result.optString("error"), result.has("error"));
                return result.getJSONObject("value");
            }
            Thread.sleep(100);
        } while (android.os.SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Native sound call timed out");
    }

    @Test
    public void exactAlarmFiresAndCanceledAlarmDoesNotFire() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        AlarmManager alarmManager = appContext.getSystemService(AlarmManager.class);
        assertNotNull(alarmManager);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            assertTrue(alarmManager.canScheduleExactAlarms());
        }

        String action = appContext.getPackageName() + ".INSTRUMENTED_ALARM";
        CountDownLatch firstAlarm = new CountDownLatch(1);
        AtomicInteger deliveries = new AtomicInteger();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                deliveries.incrementAndGet();
                firstAlarm.countDown();
            }
        };
        ContextCompat.registerReceiver(
            appContext,
            receiver,
            new IntentFilter(action),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );

        PendingIntent firingAlarm = PendingIntent.getBroadcast(
            appContext,
            930_002,
            new Intent(action).setPackage(appContext.getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent canceledAlarm = PendingIntent.getBroadcast(
            appContext,
            930_003,
            new Intent(action).setPackage(appContext.getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 1_500,
                firingAlarm
            );
            assertTrue("Exact Android alarm did not fire", firstAlarm.await(10, TimeUnit.SECONDS));
            assertEquals(1, deliveries.get());

            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 1_500,
                canceledAlarm
            );
            alarmManager.cancel(canceledAlarm);
            Thread.sleep(2_500);
            assertEquals("Canceled Android alarm was delivered", 1, deliveries.get());
        } finally {
            alarmManager.cancel(firingAlarm);
            alarmManager.cancel(canceledAlarm);
            firingAlarm.cancel();
            canceledAlarm.cancel();
            appContext.unregisterReceiver(receiver);
        }
    }

    @Test
    public void configuredDevelopmentServerIsStableOrHasLocalRecovery() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject config;
        try (InputStream stream = appContext.getAssets().open("capacitor.config.json");
             BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            config = new JSONObject(reader.lines().collect(Collectors.joining("\n")));
        }

        JSONObject server = config.optJSONObject("server");
        if (server == null) return;

        URL configuredUrl = new URL(server.getString("url"));
        // Only the dedicated CI runner may opt into its exact host-loopback URL.
        // This test argument never changes the APK's network/security policy.
        boolean emulatorServer = "true".equals(InstrumentationRegistry.getArguments().getString("allowEmulatorServer"));
        if (emulatorServer) {
            assertTrue("Emulator exception requires a debug build", BuildConfig.DEBUG);
            assertEquals("ir.wealthos.personalagent", appContext.getPackageName());
            assertEquals("http://10.0.2.2:3001", configuredUrl.toExternalForm());
            assertTrue(server.getBoolean("cleartext"));
        } else {
            assertEquals("https", configuredUrl.getProtocol());
            assertEquals("personalagent.wealthos.ir", configuredUrl.getHost());
            assertEquals(8443, configuredUrl.getPort());
            assertFalse(server.optBoolean("cleartext", false));
        }
        assertEquals("connection-error.html", server.getString("errorPath"));
        JSONArray allowNavigation = server.getJSONArray("allowNavigation");
        assertEquals(1, allowNavigation.length());
        assertEquals("localhost", allowNavigation.getString(0));

        HttpURLConnection connection = (HttpURLConnection) new URL(configuredUrl + "/api/health").openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        try {
            assertEquals(200, connection.getResponseCode());
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String response = reader.lines().collect(Collectors.joining("\n"));
                assertTrue(response.contains("\"status\":\"ok\""));
                assertTrue(response.contains("\"database\":\"connected\""));
            }
        } catch (IOException unavailableFromRunnerNetwork) {
            if (emulatorServer) throw unavailableFromRunnerNetwork;
            try (InputStream stream = appContext.getAssets().open("public/index.html")) {
                assertTrue(stream.available() > 0);
            }
        } finally {
            connection.disconnect();
        }
    }

    @Test
    public void microphoneIsDeniedForUntrustedOrigins() throws Exception {
        CountDownLatch denied = new CountDownLatch(1);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().getWebView().getWebChromeClient().onPermissionRequest(new android.webkit.PermissionRequest() {
                @Override public Uri getOrigin() { return Uri.parse("https://untrusted.example.invalid"); }
                @Override public String[] getResources() { return new String[] { RESOURCE_AUDIO_CAPTURE }; }
                @Override public void grant(String[] resources) { throw new AssertionError("Untrusted origin got microphone access"); }
                @Override public void deny() { denied.countDown(); }
            }));
            assertTrue("Untrusted microphone request was not denied", denied.await(5, TimeUnit.SECONDS));
        }
    }

    @Test
    public void nativeEventsWaitForAnAvailableJavascriptBridge() throws Exception {
        CountDownLatch checked = new CountDownLatch(1);
        AtomicReference<String> outcome = new AtomicReference<>("");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(3_000);
            scenario.onActivity(activity -> {
                android.webkit.WebView view = activity.getBridge().getWebView();
                view.evaluateJavascript("window.__qaErrors=0;window.__qaSavedCap=window.Capacitor;window.__qaErrorListener=()=>window.__qaErrors++;window.addEventListener('error',window.__qaErrorListener);window.Capacitor=undefined;true", ignored -> {
                    activity.getBridge().triggerDocumentJSEvent("hamrah-qa-before-ready");
                    activity.getBridge().triggerWindowJSEvent("hamrah-qa-before-ready", "{}");
                    view.postDelayed(() -> view.evaluateJavascript("window.Capacitor=window.__qaSavedCap;window.__qaDelivered=0;document.addEventListener('hamrah-qa-ready',()=>window.__qaDelivered++,{once:true});true", restored -> {
                        activity.getBridge().triggerDocumentJSEvent("hamrah-qa-ready");
                        view.postDelayed(() -> view.evaluateJavascript("(()=>{window.removeEventListener('error',window.__qaErrorListener);return window.__qaErrors===0 && window.__qaDelivered===1})()", result -> {
                            outcome.set(result);
                            checked.countDown();
                        }), 300);
                    }), 300);
                });
            });
            assertTrue("Bridge readiness test timed out", checked.await(10, TimeUnit.SECONDS));
            assertEquals("Early events threw or ready events were lost", "true", outcome.get());
        }
    }

    private boolean waitForNotificationState(
        NotificationManager manager,
        int notificationId,
        boolean expectedActive
    ) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3_000;
        do {
            boolean active = Arrays.stream(manager.getActiveNotifications()).anyMatch(notification ->
                notification.getId() == notificationId
            );
            if (active == expectedActive) return true;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        return false;
    }
}
