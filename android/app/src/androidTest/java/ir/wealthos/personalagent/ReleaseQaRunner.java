package ir.wealthos.personalagent;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.runner.AndroidJUnitRunner;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * TEST APK ONLY. Android requires this instrumentation to match the target's signer.
 * The delivered APK remains non-debuggable and contains neither this runner nor a
 * persistent debug switch. Only an explicit adb instrumentation session enables
 * inspection of that session's process; force-stop/cold launch removes it.
 */
public final class ReleaseQaRunner extends AndroidJUnitRunner {
    private boolean inspection;

    @Override public void onCreate(Bundle arguments) {
        inspection = arguments != null && "true".equals(arguments.getString("tiaInspection"));
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
            Intent launch = new Intent(getTargetContext(), MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(launch);
            if (!(activity instanceof MainActivity)) throw new IllegalStateException("Unexpected activity");
            runOnMainSync(() -> WebView.setWebContentsDebuggingEnabled(true));
            Bundle status = new Bundle();
            status.putString("stream", "TIA_RELEASE_INSPECTION_READY\n");
            sendStatus(1, status);
            new CountDownLatch(1).await(15, TimeUnit.MINUTES);
            finish(Activity.RESULT_CANCELED, new Bundle());
        } catch (Exception error) {
            Bundle status = new Bundle();
            status.putString("stream", "TIA_RELEASE_INSPECTION_FAILED\n");
            finish(Activity.RESULT_CANCELED, status);
        }
    }
}
