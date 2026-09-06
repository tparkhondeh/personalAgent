package ir.wealthos.personalagent;

import android.app.UiModeManager;
import android.content.Context;
import android.os.Build;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Set;

/** Only the top-level trusted app origins may persist a light/dark enum. */
final class AppearanceController {
    private final Context context;
    private final WebView webView;
    private final Set<String> origins;
    private final Runnable onChange;
    private ScriptHandler seed;
    private static final String BRIDGE = "HamrahAppearanceNative";

    static String read(Context context) {
        return "dark".equals(context.getSharedPreferences("hamrah_appearance", Context.MODE_PRIVATE)
            .getString("theme", "light")) ? "dark" : "light";
    }

    static void applyMode(Context context) {
        boolean dark = "dark".equals(read(context));
        AppCompatDelegate.setDefaultNightMode(dark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
        if (Build.VERSION.SDK_INT >= 31) {
            context.getSystemService(UiModeManager.class).setApplicationNightMode(dark ? UiModeManager.MODE_NIGHT_YES : UiModeManager.MODE_NIGHT_NO);
        }
    }

    AppearanceController(Context context, WebView webView, Set<String> origins, Runnable onChange) {
        this.context = context; this.webView = webView; this.origins = origins; this.onChange = onChange;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, BRIDGE, origins, (view, message, origin, mainFrame, reply) -> {
                String value = message.getData();
                if (!mainFrame || !origins.contains(origin.toString()) || !("light".equals(value) || "dark".equals(value))) return;
                context.getSharedPreferences("hamrah_appearance", Context.MODE_PRIVATE).edit().putString("theme", value).apply();
                refreshSeed();
                applyMode(context);
                onChange.run();
            });
        }
        refreshSeed();
    }

    String bootstrap() {
        return "window.__hamrahNativeTheme='" + read(context) + "';window.HamrahAppearance?.acceptNative(window.__hamrahNativeTheme);";
    }

    private void refreshSeed() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            if (seed != null) seed.remove();
            seed = WebViewCompat.addDocumentStartJavaScript(webView, bootstrap(), origins);
        }
    }

    void destroy() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) && seed != null) seed.remove();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
            WebViewCompat.removeWebMessageListener(webView, BRIDGE);
    }
}
