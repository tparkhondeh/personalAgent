package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class EndpointCodeCacheInstrumentedTest {
    @Test
    public void endpointChangePreservesLocalRecordsAccountStateAndCookiesAcrossReload() throws Exception {
        // Self-contained documents on unique synthetic origins: no server or owner data.
        String run = UUID.randomUUID().toString();
        String[] origins = { "https://local-" + run + ".invalid", "https://account-" + run + ".invalid" };
        String[] values = { "[{\"id\":\"synthetic\",\"done\":true,\"notificationIds\":[101,102]}]", "synthetic-account-state" };
        AtomicReference<WebView> holder = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            WebView view = new WebView(InstrumentationRegistry.getInstrumentation().getTargetContext());
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setDomStorageEnabled(true);
            holder.set(view);
        });
        WebView view = holder.get();
        try {
            for (int i = 0; i < origins.length; i++) {
                load(view, origins[i]);
                evaluate(view, "localStorage.setItem('qa-record'," + JSONObject.quote(values[i]) + ");document.cookie='qa_session=synthetic;path=/;SameSite=Strict';true");
                assertEquals(JSONObject.quote(values[i]), evaluate(view, "localStorage.getItem('qa-record')"));
                assertEquals("true", evaluate(view, "document.cookie.includes('qa_session=synthetic')"));
            }
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                MainActivity.refreshEndpointCodeCache(view, origins[1] + ":8443", origins[1]);
                MainActivity.refreshEndpointCodeCache(view, origins[1], origins[0]);
            });
            for (int i = 0; i < origins.length; i++) {
                load(view, origins[i]);
                assertEquals(JSONObject.quote(values[i]), evaluate(view, "localStorage.getItem('qa-record')"));
                assertEquals("true", evaluate(view, "document.cookie.includes('qa_session=synthetic')"));
            }
        } finally {
            try {
                for (String origin : origins) {
                    load(view, origin);
                    evaluate(view, "localStorage.removeItem('qa-record');document.cookie='qa_session=;path=/;Max-Age=0';true");
                }
            } finally {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(view::destroy);
            }
        }
    }

    private void load(WebView view, String origin) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            view.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView webView, String url) { loaded.countDown(); }
            });
            view.loadDataWithBaseURL(origin + "/fixture", "<!doctype html><html><body>synthetic</body></html>", "text/html", "UTF-8", null);
        });
        assertTrue("Synthetic WebView document did not load", loaded.await(10, TimeUnit.SECONDS));
    }

    private String evaluate(WebView view, String script) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view.evaluateJavascript(script, value -> {
            result.set(value); finished.countDown();
        }));
        assertTrue("Synthetic WebView evaluation timed out", finished.await(10, TimeUnit.SECONDS));
        return result.get();
    }
}
