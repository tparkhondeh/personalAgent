package ir.wealthos.personalagent;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.util.Map;
import org.json.JSONObject;

/** A fixed private file containing ONE atomic {revision,raw} string; legacy Web Storage is untouched. */
final class TaskStorePreferences implements DurableTaskStore.Backend {
    static final String NAME = "tia_offline_tasks_v1";
    private static final String KEY = "envelope";
    private final Context context;
    private final String name;
    private final File xml;
    private final File backup;
    private SharedPreferences preferences;
    private boolean fileWasPresent;

    TaskStorePreferences(Context context, String name) {
        this.context = context;
        this.name = name;
        this.xml = new File(new File(context.getApplicationInfo().dataDir, "shared_prefs"), name + ".xml");
        this.backup = new File(xml.getPath() + ".bak");
    }

    @Override public DurableTaskStore.Snapshot read() throws DurableTaskStore.Failure {
        try {
            // Check BEFORE Android parses XML: its parser can silently replace corruption with
            // an empty map, and may consume/restore .bak. Such a file is never a first install.
            fileWasPresent |= xml.exists() || backup.exists();
            if (preferences == null) preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE);
            Map<String, ?> values = preferences.getAll();
            boolean exists = xml.exists() || backup.exists();
            fileWasPresent |= exists;
            if (values.isEmpty() && !fileWasPresent) return new DurableTaskStore.Snapshot(0, null);
            if (!exists || values.size() != 1 || !(values.get(KEY) instanceof String)) throw new IllegalArgumentException();
            String encoded = (String) values.get(KEY);
            // A raw string may expand sixfold when escaped inside the envelope.
            if (encoded.length() > DurableTaskStore.MAX_RAW_CHARS * 6 + 128) throw new IllegalArgumentException();
            JSONObject envelope = TaskStoreJson.object(TaskStoreJson.parse(encoded));
            TaskStoreJson.require(envelope.length() == 2);
            long revision = TaskStoreJson.integer(envelope.get("revision"), 1, DurableTaskStore.MAX_REVISION);
            return new DurableTaskStore.Snapshot(revision, TaskStoreJson.text(envelope.get("raw")));
        } catch (Exception failure) {
            throw new DurableTaskStore.Failure(DurableTaskStore.Error.CORRUPT);
        }
    }

    @Override public boolean commit(DurableTaskStore.Snapshot value) throws Exception {
        if (preferences == null) throw new IllegalStateException(); // read/CAS gate must run first
        String envelope = new JSONObject().put("revision", value.revision).put("raw", value.raw).toString();
        boolean saved = preferences.edit().putString(KEY, envelope).commit();
        if (saved) fileWasPresent = true;
        return saved;
    }
}
