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
    public void manifestKeepsAlarmInfrastructureAndPrivateBackupPolicy() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo packageInfo = appContext.getPackageManager().getPackageInfo(
            appContext.getPackageName(),
            PackageManager.GET_PERMISSIONS | PackageManager.GET_RECEIVERS
        );

        assertNotNull(packageInfo.requestedPermissions);
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.POST_NOTIFICATIONS));
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
        assertTrue(recovery.contains("برنامه‌های من"));
        assertFalse(recovery.contains("fetch(\"./index.html\""));
        assertFalse(recovery.contains("http://"));
        assertFalse(recovery.contains("https://"));
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
                content.contains("همراه") || content.contains("ورود") || content.contains("اتصال برقرار نشد")
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
        assertEquals("https", configuredUrl.getProtocol());
        assertEquals("personalagent.wealthos.ir", configuredUrl.getHost());
        assertEquals(8443, configuredUrl.getPort());
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
            try (InputStream stream = appContext.getAssets().open("public/index.html")) {
                assertTrue(stream.available() > 0);
            }
        } finally {
            connection.disconnect();
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
