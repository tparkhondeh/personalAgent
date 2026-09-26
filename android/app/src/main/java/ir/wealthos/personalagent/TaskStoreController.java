package ir.wealthos.personalagent;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Private bundled-main-frame RPC, installed before the first load (including error/recovery).
 * No Capacitor plugin or JavascriptInterface: neither provides a trustworthy main-frame caller.
 * Bounds: 16 queued requests, 2Mi UTF-16 raw chars, 10,000 tasks, JSON depth 64; no truncation.
 */
final class TaskStoreController {
    static final String BRIDGE = "TiaTaskStoreNative";
    static final int MAX_MESSAGE_CHARS = DurableTaskStore.MAX_RAW_CHARS * 6 + 1024;
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(16), runnable -> new Thread(runnable, "tia-task-store"));
    private static DurableTaskStore processStore;
    private final WebView view;
    private final String origin;
    private final DurableTaskStore store;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean destroyed;
    private boolean installed;

    private static synchronized DurableTaskStore processStore(Context context) {
        if (processStore == null) processStore = new DurableTaskStore(
            new TaskStorePreferences(context.getApplicationContext(), TaskStorePreferences.NAME), TaskStoreJson::validateTasks);
        return processStore;
    }

    TaskStoreController(Context context, WebView view, String privateOrigin) {
        this(view, privateOrigin, processStore(context));
    }

    // Isolated native tests inject a synthetic store. Production always uses the process singleton.
    TaskStoreController(WebView view, String privateOrigin, DurableTaskStore store) {
        this.view = view;
        this.origin = privateOrigin;
        this.store = store;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(view, BRIDGE, Collections.singleton(origin),
            (webView, message, sourceOrigin, mainFrame, reply) -> {
                if (destroyed || !authorized(origin, sourceOrigin.toString(), mainFrame)) return;
                if (message.getType() != WebMessageCompat.TYPE_STRING) {
                    respond(reply, failure(null, DurableTaskStore.Error.INVALID));
                    return;
                }
                String request = message.getData();
                if (request == null || request.length() > MAX_MESSAGE_CHARS) {
                    respond(reply, failure(null, DurableTaskStore.Error.INVALID));
                    return;
                }
                try {
                    // Immutable request captured on receipt. Parsing, reads, validation and fsync
                    // all run off the UI thread, in this SAME global read/write queue.
                    WORKER.execute(() -> respond(reply, dispatch(store, request)));
                } catch (RejectedExecutionException busy) {
                    // Do not parse an unbounded payload on the UI thread merely to obtain its ID.
                    respond(reply, failure(null, DurableTaskStore.Error.BUSY));
                }
            });
        installed = true;
    }

    static boolean authorized(String allowed, String source, boolean mainFrame) {
        return mainFrame && allowed.equals(source);
    }

    static String dispatch(DurableTaskStore store, String rawRequest) {
        String id = null;
        try {
            JSONObject request = TaskStoreJson.object(TaskStoreJson.parse(rawRequest));
            String candidateId = TaskStoreJson.text(request.get("id"));
            TaskStoreJson.require(!candidateId.isEmpty() && candidateId.length() <= 128);
            id = candidateId;
            String op = TaskStoreJson.text(request.get("op"));
            DurableTaskStore.Snapshot result;
            if ("read".equals(op)) {
                TaskStoreJson.require(request.length() == 2);
                result = store.read();
            } else if ("cas".equals(op)) {
                TaskStoreJson.require(request.length() == 4);
                long expected = TaskStoreJson.integer(request.get("expectedRevision"), 0, DurableTaskStore.MAX_REVISION - 1);
                String next = TaskStoreJson.text(request.get("nextRaw"));
                result = store.compareAndSet(expected, next);
            } else throw new IllegalArgumentException();
            return new JSONObject().put("id", id).put("ok", true).put("revision", result.revision)
                .put("raw", result.raw == null ? JSONObject.NULL : result.raw).toString();
        } catch (DurableTaskStore.Failure error) { return failure(id, error.error); }
        catch (Exception error) { return failure(id, DurableTaskStore.Error.INVALID); }
    }

    private static String failure(String id, DurableTaskStore.Error error) {
        try { return new JSONObject().put("id", id == null ? JSONObject.NULL : id).put("ok", false).put("error", error.name()).toString(); }
        catch (Exception impossible) { throw new IllegalStateException(); }
    }

    private void respond(JavaScriptReplyProxy reply, String response) {
        main.post(() -> {
            if (destroyed) return;
            // The reply proxy is bound to the requesting JS object, never evaluateJavascript
            // in whatever document happens to be loaded when disk I/O finishes.
            try { reply.postMessage(response); } catch (RuntimeException detachedDocument) { /* lost ack: read + reconcile */ }
        });
    }

    void destroy() {
        destroyed = true;
        if (installed) WebViewCompat.removeWebMessageListener(view, BRIDGE);
        // Never discard the process store/poison or interrupt already accepted transactions.
    }
}
