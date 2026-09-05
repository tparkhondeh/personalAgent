package ir.wealthos.personalagent;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import android.webkit.WebStorage;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final long LOAD_TIMEOUT_MS = 20_000L;
    private static final long CONTENT_CHECK_DELAY_MS = 3_000L;
    private static final String RECOVERY_INTERFACE = "HamrahRecovery";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable loadTimeout;
    private Runnable contentCheck;
    private View loadingOverlay;
    private WebViewListener recoveryListener;
    private boolean showingRecovery;

    @Override
    @SuppressLint("AddJavascriptInterface")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) return;

        WebView webView = getBridge().getWebView();
        clearDataWhenEndpointChanges(webView);
        webView.setBackgroundColor(Color.parseColor("#F7F7FF"));
        webView.addJavascriptInterface(new RecoveryActions(), RECOVERY_INTERFACE);
        installLoadingOverlay(webView);

        recoveryListener = new WebViewListener() {
            @Override
            public void onPageStarted(WebView view) {
                if (!isRecoveryPage(view.getUrl())) {
                    showingRecovery = false;
                    showLoadingOverlay();
                    scheduleLoadTimeout(view);
                }
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                cancelLoadTimeout();
                hideLoadingOverlay();
                scheduleContentCheck(view, url);
            }

            @Override
            public void onPageLoaded(WebView view) {
                cancelLoadTimeout();
                hideLoadingOverlay();
                scheduleContentCheck(view, view.getUrl());
            }
        };

        getBridge().addWebViewListener(recoveryListener);
        getBridge().setWebViewClient(new RecoveryWebViewClient());
        scheduleLoadTimeout(webView);
        scheduleContentCheck(webView, webView.getUrl());
    }

    private void clearDataWhenEndpointChanges(WebView webView) {
        String endpoint = getBridge().getAppUrl();
        String previousEndpoint = getPreferences(MODE_PRIVATE).getString("last_app_endpoint", null);
        if (previousEndpoint != null && endpoint != null && !previousEndpoint.equals(endpoint)) {
            Logger.info("HamrahRecovery", "App endpoint changed; clearing stale WebView data.");
            webView.clearCache(true);
            webView.clearHistory();
            WebStorage.getInstance().deleteAllData();
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
        }
        if (endpoint != null) {
            getPreferences(MODE_PRIVATE).edit().putString("last_app_endpoint", endpoint).apply();
        }
    }

    private void installLoadingOverlay(WebView webView) {
        if (!(webView.getParent() instanceof ViewGroup parent)) return;

        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.parseColor("#F7F7FF"));
        overlay.setContentDescription("در حال آماده‌سازی همراه");
        overlay.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);

        ProgressBar progress = new ProgressBar(this);
        progress.getIndeterminateDrawable().setTint(Color.parseColor("#5C70B4"));
        content.addView(progress, new LinearLayout.LayoutParams(56, 56));

        TextView label = new TextView(this);
        label.setText("در حال آماده‌سازی همراه");
        label.setTextColor(Color.parseColor("#303448"));
        label.setTextSize(16);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelParams.topMargin = 24;
        content.addView(label, labelParams);

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        overlay.addView(content, contentParams);
        parent.addView(
            overlay,
            new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        loadingOverlay = overlay;
    }

    private void showLoadingOverlay() {
        if (loadingOverlay != null) {
            loadingOverlay.setVisibility(View.VISIBLE);
            loadingOverlay.bringToFront();
        }
    }

    private void hideLoadingOverlay() {
        if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
    }

    private void scheduleLoadTimeout(WebView webView) {
        cancelLoadTimeout();
        loadTimeout = () -> {
            if (!isRecoveryPage(webView.getUrl())) showRecoveryPage();
        };
        mainHandler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }

    private void cancelLoadTimeout() {
        if (loadTimeout != null) mainHandler.removeCallbacks(loadTimeout);
        loadTimeout = null;
    }

    private void scheduleContentCheck(WebView webView, String url) {
        if (isRecoveryPage(url)) return;
        if (contentCheck != null) mainHandler.removeCallbacks(contentCheck);
        contentCheck = () -> webView.evaluateJavascript(
            "Boolean(document.body && document.body.innerText && document.body.innerText.trim().length > 1)",
            result -> {
                if (!"true".equals(result) && !isRecoveryPage(webView.getUrl())) showRecoveryPage();
            }
        );
        mainHandler.postDelayed(contentCheck, CONTENT_CHECK_DELAY_MS);
    }

    private boolean isRecoveryPage(String url) {
        String errorUrl = getBridge() == null ? null : getBridge().getErrorUrl();
        return url != null && errorUrl != null && url.startsWith(errorUrl);
    }

    private void showRecoveryPage() {
        if (showingRecovery || getBridge() == null) return;
        String errorUrl = getBridge().getErrorUrl();
        if (errorUrl == null || errorUrl.isBlank()) {
            hideLoadingOverlay();
            return;
        }
        showingRecovery = true;
        cancelLoadTimeout();
        Logger.warn("HamrahRecovery", "Remote interface unavailable; showing local recovery page.");
        getBridge().getWebView().loadUrl(errorUrl);
    }

    private String offlineUrl() {
        String errorUrl = getBridge() == null ? null : getBridge().getErrorUrl();
        if (errorUrl == null) return null;
        int separator = errorUrl.lastIndexOf('/');
        return separator >= 0 ? errorUrl.substring(0, separator + 1) + "index.html" : null;
    }

    private final class RecoveryActions {
        @JavascriptInterface
        public void retry() {
            mainHandler.post(() -> {
                if (getBridge() == null) return;
                showingRecovery = false;
                showLoadingOverlay();
                getBridge().getWebView().loadUrl(getBridge().getAppUrl());
                scheduleLoadTimeout(getBridge().getWebView());
            });
        }

        @JavascriptInterface
        public void openOffline() {
            mainHandler.post(() -> {
                String target = offlineUrl();
                if (target == null || getBridge() == null) return;
                showingRecovery = false;
                showLoadingOverlay();
                getBridge().getWebView().loadUrl(target);
            });
        }
    }

    private final class RecoveryWebViewClient extends BridgeWebViewClient {
        RecoveryWebViewClient() {
            super(getBridge());
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            Logger.warn("HamrahRecovery", "SSL validation failed; connection was blocked.");
            showRecoveryPage();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Logger.error("HamrahRecovery", "Android WebView renderer stopped; restarting the activity.", null);
            mainHandler.post(MainActivity.this::recreate);
            return true;
        }
    }

    @Override
    public void onDestroy() {
        cancelLoadTimeout();
        if (contentCheck != null) mainHandler.removeCallbacks(contentCheck);
        if (getBridge() != null) {
            getBridge().getWebView().removeJavascriptInterface(RECOVERY_INTERFACE);
            if (recoveryListener != null) getBridge().removeWebViewListener(recoveryListener);
        }
        super.onDestroy();
    }
}
