package ir.wealthos.personalagent;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.runner.AndroidJUnitRunner;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.HashMap;
import java.util.Map;

/**
 * TEST APK ONLY. Android requires this instrumentation to match the target's signer.
 * The delivered APK remains non-debuggable and contains neither this runner nor a
 * persistent debug switch. Only an explicit adb instrumentation session enables
 * inspection of that session's process; force-stop/cold launch removes it.
 */
public final class ReleaseQaRunner extends AndroidJUnitRunner {
    private boolean inspection;
    private String appearanceQa;
    private boolean upgradeAppearanceVerified;

    @Override public void onCreate(Bundle arguments) {
        inspection = arguments != null && "true".equals(arguments.getString("tiaInspection"));
        appearanceQa = arguments == null ? null : arguments.getString("tiaAppearanceQa");
        upgradeAppearanceVerified = arguments != null && "43-to-44".equals(arguments.getString("tiaUpgradeAppearanceVerified"));
        super.onCreate(arguments);
    }

    @Override public void onStart() {
        if (!inspection) {
            super.onStart();
            return;
        }
        try {
            if (!"ir.wealthos.personalagent.stable40".equals(getTargetContext().getPackageName())
                    || (getTargetContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                throw new IllegalStateException("Expected the non-debuggable personal release target");
            }
            SharedPreferences appearance = getTargetContext().getSharedPreferences("hamrah_appearance", Context.MODE_PRIVATE);
            if (appearanceQa != null) {
                if (Build.VERSION.SDK_INT < 33 || !("ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE))) {
                    throw new IllegalStateException("Appearance QA requires an emulator");
                }
                if ("restore-upgrade".equals(appearanceQa)) {
                    if (!upgradeAppearanceVerified || getTargetContext().getPackageManager()
                            .getPackageInfo(getTargetContext().getPackageName(), 0).getLongVersionCode() != 44) {
                        throw new IllegalStateException("Missing verified upgrade evidence");
                    }
                    restoreFixtureAppearance(appearance);
                } else if (!"assert-absent".equals(appearanceQa)) {
                    throw new IllegalStateException("Unknown appearance QA action");
                }
                if (appearance.contains("theme")) throw new IllegalStateException("Native appearance is not absent");
            }
            Intent launch = new Intent(getTargetContext(), MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(launch);
            if (!(activity instanceof MainActivity)) throw new IllegalStateException("Unexpected activity");
            runOnMainSync(() -> WebView.setWebContentsDebuggingEnabled(true));
            Bundle status = new Bundle();
            if (appearanceQa != null && appearance.contains("theme")) throw new IllegalStateException("Launch persisted a native appearance choice");
            status.putString("stream", (appearanceQa == null ? "" : "TIA_QA_NATIVE_APPEARANCE_ABSENT\n") + "TIA_RELEASE_INSPECTION_READY\n");
            sendStatus(1, status);
            new CountDownLatch(1).await(15, TimeUnit.MINUTES);
            finish(Activity.RESULT_CANCELED, new Bundle());
        } catch (Exception error) {
            Bundle status = new Bundle();
            status.putString("stream", "TIA_RELEASE_INSPECTION_FAILED\n");
            finish(Activity.RESULT_CANCELED, status);
        }
    }

    // TEST APK ONLY: the caller verified initial absence and saved upgrade evidence.
    static void restoreFixtureAppearance(SharedPreferences appearance) {
        Map<String, ?> untouched = new HashMap<>(appearance.getAll());
        if (!"light".equals(untouched.get("theme"))) throw new IllegalStateException("Native appearance is not the fixture value");
        untouched.remove("theme");
        if (!appearance.edit().remove("theme").commit() || appearance.contains("theme") || !untouched.equals(appearance.getAll())) {
            throw new IllegalStateException("Native appearance restoration changed unexpected data");
        }
    }
}
