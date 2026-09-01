package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.stream.Collectors;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ApplicationContextTest {
    @Test
    public void applicationContextUsesExpectedPackage() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("ir.wealthos.personalagent", appContext.getPackageName());
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
    public void configuredDevelopmentServerIsReachableFromAndroid() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject config;
        try (InputStream stream = appContext.getAssets().open("capacitor.config.json");
             BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            config = new JSONObject(reader.lines().collect(Collectors.joining("\n")));
        }

        JSONObject server = config.optJSONObject("server");
        if (server == null) return;

        HttpURLConnection connection = (HttpURLConnection) new URL(server.getString("url") + "/api/health").openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        try {
            assertEquals(200, connection.getResponseCode());
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String response = reader.lines().collect(Collectors.joining("\n"));
                assertTrue(response.contains("\"status\":\"ok\""));
                assertTrue(response.contains("\"database\":\"connected\""));
            }
        } finally {
            connection.disconnect();
        }
    }
}
