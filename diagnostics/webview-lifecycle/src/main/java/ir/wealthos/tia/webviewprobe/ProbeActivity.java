package ir.wealthos.tia.webviewprobe;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** CI-only minimal reproduction. No Capacitor, plugins, app keys or user data. */
public class ProbeActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView view;
    private int cycle;
    private boolean blank;
    private boolean closed;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        cycle = saved == null ? 0 : saved.getInt("cycle");
        blank = getIntent().getBooleanExtra("blank", false);
        view = new WebView(this);
        setContentView(view);
        view.getSettings().setJavaScriptEnabled(true);
        view.setWebViewClient(new WebViewClient()); // Default SSL validation stays enabled.
        Log.i("TiaWebViewProbe", "START cycle=" + cycle + " blank=" + blank
            + " provider=" + WebView.getCurrentWebViewPackage().versionName);
        view.loadUrl("https://personalagent.wealthos.ir:8443/");
        main.postDelayed(() -> {
            if (closed) return;
            Log.i("TiaWebViewProbe", "CLOSE cycle=" + cycle + " progress=" + view.getProgress());
            if (cycle < 7) recreate();
            else {
                finish();
                // A final grace window catches delayed native failures, not only Java callbacks.
                main.postDelayed(() -> Log.i("TiaWebViewProbe", "COMPLETE eight cycles"), 5_000);
            }
        }, 2_000);
    }

    @Override public void onSaveInstanceState(Bundle state) {
        state.putInt("cycle", cycle + 1);
        super.onSaveInstanceState(state);
    }

    @Override public void onDestroy() {
        closed = true;
        view.stopLoading();
        if (blank) view.loadUrl("about:blank");
        if (view.getParent() instanceof ViewGroup parent) parent.removeView(view);
        view.destroy();
        super.onDestroy();
    }
}
