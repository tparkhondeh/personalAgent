package ir.wealthos.personalagent;

import android.util.JsonReader;
import android.util.JsonToken;
import java.io.StringReader;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Validation only: never reserialize/normalize the task payload or discard unknown fields. */
final class TaskStoreJson {
    private TaskStoreJson() {}

    static Object parse(String raw) throws Exception {
        try (JsonReader reader = new JsonReader(new StringReader(raw))) {
            reader.setLenient(false);
            Object value = readJson(reader, 0);
            require(reader.peek() == JsonToken.END_DOCUMENT);
            return value;
        }
    }

    private static Object readJson(JsonReader reader, int depth) throws Exception {
        require(depth <= 64);
        switch (reader.peek()) {
            case BEGIN_ARRAY:
                reader.beginArray();
                JSONArray array = new JSONArray();
                while (reader.hasNext()) array.put(readJson(reader, depth + 1));
                reader.endArray();
                return array;
            case BEGIN_OBJECT:
                reader.beginObject();
                Set<String> keys = new HashSet<>();
                JSONObject object = new JSONObject();
                while (reader.hasNext()) {
                    String key = reader.nextName();
                    require(keys.add(key));
                    object.put(key, readJson(reader, depth + 1));
                }
                reader.endObject();
                return object;
            case STRING: return reader.nextString();
            case NUMBER: return new BigDecimal(reader.nextString());
            case BOOLEAN: return reader.nextBoolean();
            case NULL: reader.nextNull(); return JSONObject.NULL;
            default: throw new IllegalArgumentException();
        }
    }

    static long integer(Object value, long minimum, long maximum) {
        require(value instanceof Number);
        // Preserve the lexical precision: 1.0000000000000001 must not round to revision 1.
        long number = new BigDecimal(value.toString()).longValueExact();
        require(number >= minimum && number <= maximum);
        return number;
    }

    static void validateTasks(String raw) throws Exception {
        require(raw != null && raw.length() <= DurableTaskStore.MAX_RAW_CHARS);
        Object value = parse(raw);
        require(value instanceof JSONArray);
        JSONArray tasks = (JSONArray) value;
        require(tasks.length() <= DurableTaskStore.MAX_TASKS);
        Set<String> ids = new HashSet<>();
        for (int index = 0; index < tasks.length(); index++) {
            JSONObject task = object(tasks.get(index));
            String id = text(task.get("id"));
            require(!id.isEmpty() && ids.add(id) && !text(task.get("title")).trim().isEmpty());
            require(task.get("done") instanceof Boolean);
            require(oneOf(task.get("category"), "personal", "company", "meeting"));
            require(oneOf(task.get("priority"), "normal", "important", "urgent"));
            for (String key : new String[] { "deadline", "endsAt", "updatedAt" }) {
                // Date interpretation remains with the existing JS validator; old date spellings
                // must not be shifted or rewritten by a native locale/timezone parser.
                if (task.has(key) && !task.isNull(key)) require(!text(task.get(key)).isEmpty());
            }
            if (task.has("archived")) require(task.get("archived") instanceof Boolean);
            if (task.has("notificationId")) notificationId(task.get("notificationId"));
            if (task.has("notificationIds")) {
                JSONArray values = array(task.get("notificationIds"));
                for (int i = 0; i < values.length(); i++) notificationId(values.get(i));
            }
            if (task.has("alarmCancellations")) {
                JSONArray receipts = array(task.get("alarmCancellations"));
                for (int i = 0; i < receipts.length(); i++) {
                    JSONObject receipt = object(receipts.get(i));
                    notificationId(receipt.get("id"));
                    require(id.equals(receipt.get("taskId")));
                }
            }
            if (task.has("approvalReceipt")) {
                JSONObject receipt = object(task.get("approvalReceipt"));
                require(!text(receipt.get("id")).isEmpty());
                integer(receipt.get("revision"), 1, DurableTaskStore.MAX_REVISION);
            }
            if (task.has("reminderOffsets")) {
                JSONArray values = array(task.get("reminderOffsets"));
                for (int i = 0; i < values.length(); i++) integer(values.get(i), 0, DurableTaskStore.MAX_REVISION);
            }
            if (task.has("approvedPlan")) {
                JSONArray channels = array(object(task.get("approvedPlan")).get("channels"));
                for (int i = 0; i < channels.length(); i++) text(channels.get(i));
            }
        }
    }

    static JSONObject object(Object value) { require(value instanceof JSONObject); return (JSONObject) value; }
    private static JSONArray array(Object value) { require(value instanceof JSONArray); return (JSONArray) value; }
    static String text(Object value) { require(value instanceof String); return (String) value; }
    private static void notificationId(Object value) { integer(value, 1, Integer.MAX_VALUE); }
    private static boolean oneOf(Object value, String a, String b, String c) {
        return a.equals(value) || b.equals(value) || c.equals(value);
    }
    static void require(boolean value) { if (!value) throw new IllegalArgumentException(); }
}
