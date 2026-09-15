package ir.wealthos.personalagent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Device-scoped sound choice; LocalNotifications remains the only alarm scheduler. */
@CapacitorPlugin(name = "TiaAlarmSounds")
public class TiaAlarmSoundsPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer previewPlayer;
    private volatile boolean foreground = true;
    private final Runnable stopPreviewTimeout = this::releasePreview;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("tia_alarm_sounds_v1", Context.MODE_PRIVATE);
    }

    private static boolean valid(String id) {
        return "dawn".equals(id) || "chime".equals(id) || "pulse".equals(id);
    }

    private synchronized String selection() {
        String id = preferences().getString("soundId", "dawn");
        if (!valid(id)) throw new IllegalStateException("Invalid saved alarm sound");
        return id;
    }

    private static String resourceName(String id) { return "tia_alarm_" + id + "_v1"; }
    private static String channelId(String id) { return "tia-alarm-v1-" + id; }
    private Uri soundUri(String id) {
        // Stable resource NAME, never a numeric resource ID that could change on upgrade.
        return Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/" + resourceName(id));
    }
    private static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    }
    private static String label(String id) {
        return "chime".equals(id) ? "آوای آرام" : "pulse".equals(id) ? "ضرب‌آهنگ" : "سپیده";
    }
    private void requireAsset(String id) {
        if (getContext().getResources().getIdentifier(resourceName(id), "raw", getContext().getPackageName()) == 0) {
            throw new IllegalStateException("Bundled alarm sound missing");
        }
    }

    @PluginMethod
    public void getSelection(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.unavailable("Alarm sound channels require Android 8 or later"); return; }
        try { String id = selection(); requireAsset(id); call.resolve(new JSObject().put("soundId", id)); }
        catch (Exception error) { call.reject("Saved alarm sound is unavailable"); }
    }

    @PluginMethod
    public synchronized void setSelection(PluginCall call) {
        String id = call.getString("soundId");
        if (!valid(id)) { call.reject("Unknown alarm sound"); return; }
        try {
            requireAsset(id);
            if (!preferences().edit().putString("soundId", id).commit()) { call.reject("Alarm sound was not saved"); return; }
            call.resolve(new JSObject().put("soundId", id));
        } catch (Exception error) { call.reject("Alarm sound was not saved"); }
        // Saving never touches pending intents, channels, alarm times, volume or DND.
    }

    @PluginMethod
    public synchronized void ensureChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.unavailable("Alarm sound channels require Android 8 or later"); return; }
        try {
            String id = selection(); requireAsset(id);
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            if (manager == null) { call.reject("Notification settings unavailable"); return; }
            String channelId = channelId(id);
            if (manager.getNotificationChannel(channelId) == null) {
                NotificationChannel channel = new NotificationChannel(channelId, "زنگ tia — " + label(id), NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("زنگ‌های جدید با صدای " + label(id));
                channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
                channel.enableVibration(true);
                channel.setSound(soundUri(id), alarmAttributes());
                manager.createNotificationChannel(channel);
            }
            // Never delete/recreate channels or override the user's channel settings.
            call.resolve(new JSObject().put("soundId", id).put("channelId", channelId));
        } catch (Exception error) { call.reject("Alarm sound channel could not be prepared"); }
    }

    @PluginMethod
    public void preview(PluginCall call) {
        String id = call.getString("soundId");
        if (!valid(id)) { call.reject("Unknown alarm sound"); return; }
        main.post(() -> {
            releasePreview();
            if (!foreground) { call.reject("Alarm preview requires a visible app"); return; }
            try {
                requireAsset(id);
                MediaPlayer player = new MediaPlayer();
                previewPlayer = player;
                player.setAudioAttributes(alarmAttributes());
                player.setDataSource(getContext(), soundUri(id));
                player.setLooping(false);
                player.setOnCompletionListener(completed -> { if (previewPlayer == completed) releasePreview(); });
                player.setOnErrorListener((failed, what, extra) -> { if (previewPlayer == failed) releasePreview(); return true; });
                player.prepare();
                player.start();
                main.postDelayed(stopPreviewTimeout, 4000);
                call.resolve();
            } catch (Exception error) { releasePreview(); call.reject("Alarm preview could not play"); }
        });
    }

    @PluginMethod
    public void stopPreview(PluginCall call) { main.post(() -> { releasePreview(); call.resolve(); }); }

    private void releasePreview() {
        main.removeCallbacks(stopPreviewTimeout);
        if (previewPlayer != null) { previewPlayer.release(); previewPlayer = null; }
    }

    @PluginMethod
    public void openSoundSettings(PluginCall call) {
        main.post(() -> {
            releasePreview();
            if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) {
                call.reject("Sound settings require an active app"); return;
            }
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_SOUND_SETTINGS));
                call.resolve(); // Opened only: this does not claim the user changed volume.
            } catch (ActivityNotFoundException | SecurityException error) {
                call.reject("System sound settings unavailable; open phone Settings manually");
            }
        });
    }

    @Override protected void handleOnResume() { foreground = true; }
    @Override protected void handleOnPause() { foreground = false; main.post(this::releasePreview); }
    @Override protected void handleOnDestroy() { foreground = false; main.post(this::releasePreview); }
}
