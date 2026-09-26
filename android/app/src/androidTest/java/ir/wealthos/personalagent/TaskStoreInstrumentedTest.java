package ir.wealthos.personalagent;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Xml;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.xmlpull.v1.XmlPullParser;

/** Isolated synthetic preferences/WebViews only; never clear or seed production/legacy data. */
@RunWith(AndroidJUnit4.class)
public class TaskStoreInstrumentedTest {
    private static final String RECORD = "[{\"id\":\"reserved-qa-id\",\"title\":\"کار آزمایشی\","
        + "\"done\":true,\"category\":\"personal\",\"priority\":\"normal\","
        + "\"notificationIds\":[101,102],\"alarmCancellations\":[{\"id\":101,\"taskId\":\"reserved-qa-id\"}],"
        + "\"approvalReceipt\":{\"id\":\"approval-qa\",\"revision\":3},"
        + "\"notificationSchedule\":[{\"id\":102,\"at\":\"2030-01-01T09:00:00.000Z\"}],"
        + "\"unknownFutureField\":{\"keep\":true}}]";

    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private String name() { return "tia_task_store_qa_" + UUID.randomUUID(); }
    private File xml(String name) { return new File(context().getApplicationInfo().dataDir, "shared_prefs/" + name + ".xml"); }
    private DurableTaskStore store(String name) {
        return new DurableTaskStore(new TaskStorePreferences(context(), name), TaskStoreJson::validateTasks);
    }
    private JSONObject request(DurableTaskStore store, String request) throws Exception {
        return new JSONObject(TaskStoreController.dispatch(store, request));
    }
    private String cas(String id, long revision, String raw) throws Exception {
        return new JSONObject().put("id", id).put("op", "cas").put("expectedRevision", revision).put("nextRaw", raw).toString();
    }

    @Test public void commitAcknowledgmentContainsExactWholeRecordAlreadyPresentOnDisk() throws Exception {
        String name = name();
        try {
            DurableTaskStore store = store(name);
            assertNull(store.read().raw);
            assertFalse(xml(name).exists()); // A read-only absent probe does not create a store.
            JSONObject result = request(store, cas("migrate", 0, RECORD));
            assertTrue(result.getBoolean("ok"));
            assertEquals(1, result.getLong("revision"));
            assertEquals(RECORD, result.getString("raw"));
            // Parse actual disk XML, NOT the SharedPreferences memory cache, after the ack.
            try (FileInputStream stream = new FileInputStream(xml(name))) {
                XmlPullParser parser = Xml.newPullParser(); parser.setInput(stream, "UTF-8");
                String persisted = null;
                while (parser.next() != XmlPullParser.END_DOCUMENT) {
                    if (parser.getEventType() == XmlPullParser.START_TAG && "string".equals(parser.getName())
                        && "envelope".equals(parser.getAttributeValue(null, "name"))) persisted = parser.nextText();
                }
                assertNotNull(persisted);
                JSONObject envelope = new JSONObject(persisted);
                assertEquals(2, envelope.length());
                assertEquals(1, envelope.getLong("revision"));
                assertEquals(RECORD, envelope.getString("raw"));
            }
            assertEquals(RECORD, store(name).read().raw);
            assertEquals("CONFLICT", request(store, cas("migration-retry", 0, "[]")).getString("error"));
            assertEquals(RECORD, store.read().raw);
        } finally { assertTrue(context().deleteSharedPreferences(name)); }
    }

    @Test public void corruptXmlBackupAndExistingEmptyMapNeverBecomeAbsentOrOverwriteable() throws Exception {
        for (String fixture : new String[] { "<map>", "<?xml version='1.0' encoding='utf-8' ?><map />", "backup" }) {
            String name = name();
            try {
                File file = "backup".equals(fixture) ? new File(xml(name) + ".bak") : xml(name);
                assertTrue(file.getParentFile().isDirectory() || file.getParentFile().mkdirs());
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(("backup".equals(fixture) ? "<map><broken" : fixture).getBytes(StandardCharsets.UTF_8));
                }
                DurableTaskStore store = store(name);
                assertEquals("CORRUPT", request(store, "{\"id\":\"read\",\"op\":\"read\"}").getString("error"));
                assertEquals("CORRUPT", request(store, cas("must-not-migrate", 0, "[]")).getString("error"));
                assertFalse(context().getSharedPreferences(name, Context.MODE_PRIVATE).contains("envelope"));
            } finally { assertTrue(context().deleteSharedPreferences(name)); }
        }
    }

    @Test public void invalidEnvelopeSchemaAndMissingRawDoNotFallBackToLegacy() throws Exception {
        for (String envelope : new String[] { "{}", "{\"revision\":0,\"raw\":\"[]\"}",
            "{\"revision\":1}", "{\"revision\":1,\"raw\":null}", "{\"revision\":1,\"raw\":\"broken\"}" }) {
            String name = name();
            try {
                assertTrue(context().getSharedPreferences(name, Context.MODE_PRIVATE).edit().putString("envelope", envelope).commit());
                DurableTaskStore store = store(name);
                assertEquals("CORRUPT", request(store, "{\"id\":\"r\",\"op\":\"read\"}").getString("error"));
                assertEquals("CORRUPT", request(store, cas("c", 0, "[]")).getString("error"));
                assertEquals(envelope, context().getSharedPreferences(name, Context.MODE_PRIVATE).getString("envelope", null));
            } finally { assertTrue(context().deleteSharedPreferences(name)); }
        }
    }

    @Test public void boundedValidationRejectsWrongReceiptsDuplicatesAndInvalidRevisionsWithoutWrites() throws Exception {
        String name = name();
        try {
            DurableTaskStore store = store(name);
            for (String raw : new String[] { "{}", "[{}]", "[", RECORD.replace("\"taskId\":\"reserved-qa-id\"", "\"taskId\":\"other\""),
                RECORD.replace("\"revision\":3", "\"revision\":1.5"), RECORD.replace("true,\"category", "\"true\",\"category"),
                RECORD.substring(0, RECORD.length() - 1) + "," + RECORD.substring(1), "[] trailing", "[/*comment*/]", "[]".repeat(DurableTaskStore.MAX_RAW_CHARS) }) {
                assertEquals("INVALID", request(store, cas("invalid", 0, raw)).getString("error"));
            }
            for (String revision : new String[] { "-1", "0.5", "1.0000000000000001", "9007199254740990.5", "\"0\"", "null", "9007199254740991", "9007199254740992" }) {
                assertEquals("INVALID", request(store, "{\"id\":\"r\",\"op\":\"cas\",\"expectedRevision\":" + revision + ",\"nextRaw\":\"[]\"}").getString("error"));
            }
            assertEquals(0, store.read().revision);
            assertFalse(xml(name).exists());
            assertTrue(request(store, cas("valid", 0, RECORD)).getBoolean("ok"));
        } finally { assertTrue(context().deleteSharedPreferences(name)); }
    }

    @Test public void exactPrivateMainFrameOnlyAndRepliesArriveAfterWorkerCommit() throws Exception {
        assertTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));
        String origin = "https://private-" + UUID.randomUUID() + ".invalid";
        String remote = "https://account-" + UUID.randomUUID() + ".invalid";
        assertFalse(TaskStoreController.authorized(origin, remote, true));
        assertFalse(TaskStoreController.authorized(origin, origin + ":8443", true));
        assertFalse(TaskStoreController.authorized(origin, origin, false));
        AtomicReference<DurableTaskStore.Snapshot> disk = new AtomicReference<>(new DurableTaskStore.Snapshot(0, null));
        AtomicInteger writes = new AtomicInteger();
        DurableTaskStore store = new DurableTaskStore(new DurableTaskStore.Backend() {
            @Override public DurableTaskStore.Snapshot read() { assertNotEquals(Looper.getMainLooper(), Looper.myLooper()); return disk.get(); }
            @Override public boolean commit(DurableTaskStore.Snapshot value) {
                assertNotEquals(Looper.getMainLooper(), Looper.myLooper()); writes.incrementAndGet(); disk.set(value); return true;
            }
        }, TaskStoreJson::validateTasks);
        WebView view = view();
        AtomicReference<TaskStoreController> bridge = new AtomicReference<>();
        ui(() -> bridge.set(new TaskStoreController(view, origin, store)));
        try {
            load(view, origin);
            evaluate(view, "window.results=[];TiaTaskStoreNative.onmessage=e=>results.push(JSON.parse(e.data));true");
            String frame = "<script>if(typeof TiaTaskStoreNative!=='undefined'){TiaTaskStoreNative.onmessage=()=>parent.frameReply=true;TiaTaskStoreNative.postMessage(" + JSONObject.quote(cas("iframe", 0, RECORD))
                + ");}parent.frameSent=true;</script>";
            evaluate(view, "window.frameSent=false;window.frameReply=false;var frame=document.createElement('iframe');frame.srcdoc=" + JSONObject.quote(frame) + ";document.body.append(frame);true");
            until(view, "window.frameSent===true");
            evaluate(view, "TiaTaskStoreNative.postMessage('{\"id\":\"trusted-read\",\"op\":\"read\"}');true");
            until(view, "results.length===1");
            assertEquals("true", evaluate(view, "results[0].ok&&results[0].revision===0&&results[0].raw===null&&!window.frameReply"));
            assertEquals(0, writes.get());
            evaluate(view, "TiaTaskStoreNative.postMessage(" + JSONObject.quote(cas("trusted-cas", 0, RECORD)) + ");true");
            until(view, "results.length===2");
            assertEquals("true", evaluate(view, "results[1].ok&&results[1].revision===1"));
            assertEquals(RECORD, disk.get().raw);
            assertEquals(1, writes.get());
            load(view, remote);
            assertEquals("\"undefined\"", evaluate(view, "typeof TiaTaskStoreNative"));
            assertEquals(1, writes.get());
        } finally { ui(() -> { bridge.get().destroy(); view.destroy(); }); }
    }

    @Test public void commitFailureRemainsPoisonedAcrossControllerRecreation() throws Exception {
        String origin = "https://private-" + UUID.randomUUID() + ".invalid";
        AtomicInteger reads = new AtomicInteger(), writes = new AtomicInteger();
        AtomicReference<DurableTaskStore.Snapshot> cache = new AtomicReference<>(new DurableTaskStore.Snapshot(0, null));
        DurableTaskStore store = new DurableTaskStore(new DurableTaskStore.Backend() {
            @Override public DurableTaskStore.Snapshot read() { reads.incrementAndGet(); return cache.get(); }
            @Override public boolean commit(DurableTaskStore.Snapshot value) { writes.incrementAndGet(); cache.set(value); return false; }
        }, TaskStoreJson::validateTasks);
        WebView view = view();
        AtomicReference<TaskStoreController> bridge = new AtomicReference<>();
        ui(() -> bridge.set(new TaskStoreController(view, origin, store)));
        try {
            load(view, origin);
            evaluate(view, "window.result=null;TiaTaskStoreNative.onmessage=e=>window.result=JSON.parse(e.data);TiaTaskStoreNative.postMessage(" + JSONObject.quote(cas("uncertain", 0, RECORD)) + ");true");
            until(view, "window.result!==null");
            assertEquals("\"STORAGE\"", evaluate(view, "result.error"));
            assertEquals(RECORD, cache.get().raw); // Cache is ahead of failed durable write.
            ui(() -> { bridge.get().destroy(); bridge.set(new TaskStoreController(view, origin, store)); });
            load(view, origin);
            evaluate(view, "window.result=null;TiaTaskStoreNative.onmessage=e=>window.result=JSON.parse(e.data);TiaTaskStoreNative.postMessage('{\"id\":\"after-recreate\",\"op\":\"read\"}');true");
            until(view, "window.result!==null");
            assertEquals("\"STORAGE\"", evaluate(view, "result.error"));
            assertEquals(1, reads.get()); assertEquals(1, writes.get());
        } finally { ui(() -> { bridge.get().destroy(); view.destroy(); }); }
    }

    private void ui(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private WebView view() {
        AtomicReference<WebView> result = new AtomicReference<>();
        ui(() -> { WebView view = new WebView(context()); view.getSettings().setJavaScriptEnabled(true); result.set(view); });
        return result.get();
    }
    private void load(WebView view, String origin) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        ui(() -> {
            view.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) { loaded.countDown(); }
            });
            view.loadDataWithBaseURL(origin + "/fixture", "<!doctype html><html><body>synthetic</body></html>", "text/html", "UTF-8", null);
        });
        assertTrue(loaded.await(10, TimeUnit.SECONDS));
    }
    private String evaluate(WebView view, String script) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        ui(() -> view.evaluateJavascript(script, value -> { result.set(value); finished.countDown(); }));
        assertTrue(finished.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void until(WebView view, String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(view, expression))) return;
            SystemClock.sleep(20);
        }
        fail("Synthetic bridge condition timed out");
    }
}
