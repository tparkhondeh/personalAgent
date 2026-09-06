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
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Logger;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.JSExport;
import com.getcapacitor.PluginHandle;
import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.stream.Collectors;
import org.json.JSONObject;

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
    private AppearanceController appearance;
    private TextView loadingLabel;
    private ProgressBar loadingProgress;
    private final Runnable refreshAppearance = () -> { if (!isDestroyed()) applyAppearance(); };

    @Override
    public void onConfigurationChanged(android.content.res.Configuration configuration) {
        super.onConfigurationChanged(configuration);
        // Capacitor restores its cached SystemBars style during configuration
        // changes. The saved app choice owns our window, including native chrome.
        applyAppearance();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            mainHandler.removeCallbacks(refreshAppearance);
            mainHandler.post(refreshAppearance);
        }
    }

    @Override
    protected void load() {
        // Install the document-start script BEFORE Capacitor's first loadUrl.
        config = com.getcapacitor.CapConfig.loadDefault(this);
        WebView view = findViewById(com.getcapacitor.android.R.id.webview);
        java.util.Set<String> origins = new java.util.HashSet<>();
        origins.add(config.getAndroidScheme() + "://" + config.getHostname());
        if (config.getServerUrl() != null) {
            android.net.Uri remote = android.net.Uri.parse(config.getServerUrl());
            origins.add(remote.getScheme() + "://" + remote.getEncodedAuthority());
        }
        appearance = new AppearanceController(this, view, origins, this::applyAppearance);
        super.load();
    }

    private int appearanceColor(int light, int dark) {
        return getColor("dark".equals(AppearanceController.read(this)) ? dark : light);
    }

    private void applyAppearance() {
        int background = appearanceColor(R.color.appearance_light_bg, R.color.appearance_dark_bg);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(background);
        if (loadingOverlay != null) loadingOverlay.setBackgroundColor(background);
        if (loadingLabel != null) loadingLabel.setTextColor(appearanceColor(R.color.appearance_light_ink, R.color.appearance_dark_ink));
        if (loadingProgress != null) loadingProgress.getIndeterminateDrawable().setTint(appearanceColor(R.color.appearance_light_primary, R.color.appearance_dark_primary));
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        getWindow().getDecorView().setBackgroundColor(background);
        androidx.core.view.WindowInsetsControllerCompat bars = androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean light = !"dark".equals(AppearanceController.read(this));
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
    }

    @Override
    @SuppressLint("AddJavascriptInterface")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) return;

        WebView webView = getBridge().getWebView();
        if (android.os.Build.VERSION.SDK_INT >= 33) webView.getSettings().setAlgorithmicDarkeningAllowed(false);
        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest request) {
                android.net.Uri origin = request.getOrigin();
                String bundled = getBridge().getScheme() + "://" + getBridge().getHost();
                boolean sameOrigin = origin != null && MicrophoneOrigin.allowed(
                    origin.toString(), getBridge().getAppUrl(), bundled);
                boolean audioOnly = request.getResources().length == 1 &&
                    android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);
                if (sameOrigin && audioOnly) super.onPermissionRequest(request);
                else request.deny();
            }
        });
        clearDataWhenEndpointChanges(webView);
        webView.setBackgroundColor(Color.parseColor("#F7F7FF"));
        webView.addJavascriptInterface(new RecoveryActions(), RECOVERY_INTERFACE);
        installLoadingOverlay(webView);
        applyAppearance();
        mainHandler.post(refreshAppearance);

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
        overlay.setContentDescription("در حال آماده‌سازی tia");
        overlay.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);

        ProgressBar progress = new ProgressBar(this);
        loadingProgress = progress;
        progress.getIndeterminateDrawable().setTint(Color.parseColor("#5C70B4"));
        content.addView(progress, new LinearLayout.LayoutParams(56, 56));

        TextView label = new TextView(this);
        loadingLabel = label;
        label.setText("در حال آماده‌سازی tia");
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

    private String bundledOrigin() {
        // getLocalUrl() becomes the remote origin when server.url is configured.
        // The error asset always belongs to the configured private scheme/host.
        return getBridge().getScheme() + "://" + getBridge().getHost();
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
                if (getBridge() == null) return;
                getBridge().getWebView().evaluateJavascript(
                    "window.HamrahOpenBundledInterface && window.HamrahOpenBundledInterface()",
                    null
                );
            });
        }

        @JavascriptInterface
        public void offlineReady() {
            mainHandler.post(() -> {
                showingRecovery = false;
                cancelLoadTimeout();
                hideLoadingOverlay();
            });
        }
    }

    private final class RecoveryWebViewClient extends BridgeWebViewClient {
        RecoveryWebViewClient() {
            super(getBridge());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // Public, fixed APK assets only. Remote documents may read these weights,
            // never files, cookies or audio. TLS validation for remote pages is unchanged.
            String speechPath = request.getUrl().toString().replace(bundledOrigin() + "/speech/", "");
            if (request.getMethod().equals("GET") && request.getUrl().toString().startsWith(bundledOrigin() + "/speech/")
                && (speechPath.equals("vosk-0.0.8.js") || speechPath.equals("fa-0.42.tar.gz"))) {
                try {
                    java.util.Map<String, String> headers = new java.util.HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Cache-Control", "public, max-age=31536000, immutable");
                    return new WebResourceResponse(speechPath.endsWith(".js") ? "application/javascript" : "application/gzip",
                        speechPath.endsWith(".js") ? "UTF-8" : null, 200, "OK", headers, getAssets().open("public/speech/" + speechPath));
                } catch (Exception error) { Logger.warn("TiaSpeech", "Bundled speech asset unavailable."); }
            }
            String localFontUrl = bundledOrigin() + "/Vazirmatn.woff2";
            if (request.getMethod().equals("GET") && request.getUrl().toString().equals(localFontUrl)) {
                try {
                    return new WebResourceResponse("font/woff2", null, getAssets().open("public/Vazirmatn.woff2"));
                } catch (Exception error) {
                    Logger.warn("HamrahRecovery", "Bundled font could not be loaded.");
                }
            }
            // Capacitor intentionally omits plugin injection for errorPath. Our trusted,
            // APK-bundled recovery document needs LocalNotifications for offline reminders.
            // Inject only into this exact main-frame asset; never into remote/error content.
            if (request.isForMainFrame() && request.getUrl().toString().equals(getBridge().getErrorUrl())) {
                PluginHandle notifications = getBridge().getPlugin("LocalNotifications");
                if (notifications != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        getAssets().open("public/connection-error.html"), StandardCharsets.UTF_8
                    ))) {
                        String html = reader.lines().collect(Collectors.joining("\n"));
                        String script = JSExport.getGlobalJS(MainActivity.this, false, BuildConfig.DEBUG)
                            + "\nwindow.WEBVIEW_SERVER_URL = " + JSONObject.quote(bundledOrigin()) + ";\n"
                            + JSExport.getBridgeJS(MainActivity.this) + "\n"
                            + JSExport.getPluginJS(Collections.singletonList(notifications));
                        html = BundledPageInjector.inject(html, (appearance != null ? appearance.bootstrap() : "") + script);
                        return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    } catch (Exception error) {
                        Logger.warn("HamrahRecovery", "Offline notification bridge could not be prepared.");
                    }
                }
            }
            return super.shouldInterceptRequest(view, request);
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
        mainHandler.removeCallbacks(refreshAppearance);
        if (appearance != null) appearance.destroy();
        cancelLoadTimeout();
        if (contentCheck != null) mainHandler.removeCallbacks(contentCheck);
        if (getBridge() != null) {
            getBridge().getWebView().removeJavascriptInterface(RECOVERY_INTERFACE);
            if (recoveryListener != null) getBridge().removeWebViewListener(recoveryListener);
        }
        super.onDestroy();
    }
}
