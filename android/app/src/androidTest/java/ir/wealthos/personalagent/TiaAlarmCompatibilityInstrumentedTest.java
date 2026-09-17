package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.capacitorjs.plugins.localnotifications.TiaAlarmChannels;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run on isolated API24/25 and API26+ emulators. Never posts an alarm or opens a WebView. */
@RunWith(AndroidJUnit4.class)
public class TiaAlarmCompatibilityInstrumentedTest {
    private static final class CapturedCall extends PluginCall {
        JSObject result;
        String error;

        CapturedCall(String method, JSObject data) {
            super(null, "TiaAlarmSounds", "isolated-qa", method, data);
        }

        @Override public void resolve(JSObject value) { result = value; }
        @Override public void reject(String message, String code, Exception cause, JSObject data) { error = message; }
    }

    @Test
    public void selectedSoundsKeepAlarmSemanticsWithoutChangingVolumesOrReportingPermission() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // The real plugin operates on a synthetic preferences file, never the saved user choice.
        String preferenceName = "tia_alarm_compat_qa_" + UUID.randomUUID();
        SharedPreferences isolated = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE);
        Context isolatedContext = new ContextWrapper(context) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) { return isolated; }
        };
        TiaAlarmSoundsPlugin plugin = new TiaAlarmSoundsPlugin() {
            @Override public Context getContext() { return isolatedContext; }
        };
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        AudioManager audio = context.getSystemService(AudioManager.class);
        assertNotNull(manager);
        assertNotNull(audio);
        int alarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
        int notificationVolume = audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
        int interruptionFilter = manager.getCurrentInterruptionFilter();
        try {
            for (String sound : new String[] { "dawn", "chime", "pulse" }) {
                CapturedCall selection = new CapturedCall("setSelection", new JSObject().put("soundId", sound));
                plugin.setSelection(selection);
                assertNull(selection.error);
                assertNotNull(selection.result);
                CapturedCall read = new CapturedCall("getSelection", new JSObject());
                plugin.getSelection(read);
                assertNull(read.error);
                assertEquals(sound, read.result.getString("soundId"));
                CapturedCall ensure = new CapturedCall("ensureChannel", new JSObject());
                plugin.ensureChannel(ensure);
                assertNull(ensure.error);
                assertNotNull(ensure.result);
                assertEquals(2, ensure.result.length());
                assertEquals(sound, ensure.result.getString("soundId"));
                String channelId = ensure.result.getString("channelId");
                assertEquals("tia-alarm-v1-" + sound, channelId);
                Uri uri = Uri.parse("android.resource://" + context.getPackageName() + "/raw/tia_alarm_" + sound + "_v1");
                if (Build.VERSION.SDK_INT < 26) {
                    assertTrue(TiaAlarmChannels.usesLegacyAlarmStream(Build.VERSION.SDK_INT, channelId));
                    // Verify AndroidX's real stream overload, used by the source-checked dependency patch.
                    Notification notification = new NotificationCompat.Builder(context, channelId)
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setSound(uri, AudioManager.STREAM_ALARM).build();
                    assertEquals(uri, notification.sound);
                    assertEquals(AudioAttributes.USAGE_ALARM, notification.audioAttributes.getUsage());
                    Notification ordinary = new NotificationCompat.Builder(context, "ordinary-qa")
                        .setSmallIcon(android.R.drawable.ic_dialog_info).setSound(uri).build();
                    assertEquals(AudioAttributes.USAGE_NOTIFICATION, ordinary.audioAttributes.getUsage());
                } else {
                    assertFalse(TiaAlarmChannels.usesLegacyAlarmStream(Build.VERSION.SDK_INT, channelId));
                    NotificationChannel channel = manager.getNotificationChannel(channelId);
                    assertNotNull(channel);
                    assertEquals(uri, channel.getSound());
                    assertEquals(AudioAttributes.USAGE_ALARM, channel.getAudioAttributes().getUsage());
                    assertFalse(channel.canBypassDnd());
                }
            }
            assertTrue(isolated.edit().putString("soundId", "invalid-qa").commit());
            CapturedCall invalid = new CapturedCall("ensureChannel", new JSObject());
            plugin.ensureChannel(invalid);
            assertNotNull(invalid.error);
            assertNull(invalid.result);
            assertEquals(alarmVolume, audio.getStreamVolume(AudioManager.STREAM_ALARM));
            assertEquals(notificationVolume, audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION));
            assertEquals(interruptionFilter, manager.getCurrentInterruptionFilter());
        } finally {
            // Only synthetic preferences are removed; app-owned channels/user channel settings stay intact.
            context.deleteSharedPreferences(preferenceName);
        }
    }
}
