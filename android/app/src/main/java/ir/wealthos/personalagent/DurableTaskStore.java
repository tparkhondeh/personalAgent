package ir.wealthos.personalagent;

/** One process-wide instance. A failed/uncertain write must never be read from a memory cache. */
final class DurableTaskStore {
    static final long MAX_REVISION = 9_007_199_254_740_991L;
    static final int MAX_RAW_CHARS = 2 * 1024 * 1024;
    static final int MAX_TASKS = 10_000;

    enum Error { INVALID, CORRUPT, CONFLICT, STORAGE, BUSY }

    static final class Failure extends Exception {
        final Error error;
        Failure(Error error) { super(error.name()); this.error = error; }
    }

    static final class Snapshot {
        final long revision;
        final String raw;
        Snapshot(long revision, String raw) { this.revision = revision; this.raw = raw; }
    }

    interface Backend {
        Snapshot read() throws Failure;
        boolean commit(Snapshot value) throws Exception;
    }

    interface Validator { void validate(String raw) throws Exception; }

    private final Backend backend;
    private final Validator validator;
    private Error poison;

    DurableTaskStore(Backend backend, Validator validator) {
        this.backend = backend;
        this.validator = validator;
    }

    synchronized Snapshot read() throws Failure {
        if (poison != null) throw new Failure(poison);
        poison = Error.STORAGE;
        try {
            Snapshot value = backend.read();
            if (value == null || value.revision < 0 || value.revision > MAX_REVISION
                || (value.revision == 0) != (value.raw == null)) throw new Failure(Error.CORRUPT);
            if (value.raw != null) validate(value.raw, Error.CORRUPT);
            poison = null;
            return value;
        } catch (Failure failure) {
            poison = failure.error;
            throw failure;
        } catch (RuntimeException failure) {
            poison = Error.STORAGE;
            throw new Failure(poison);
        }
    }

    synchronized Snapshot compareAndSet(long expectedRevision, String nextRaw) throws Failure {
        if (poison != null) throw new Failure(poison);
        if (expectedRevision < 0 || expectedRevision >= MAX_REVISION) throw new Failure(Error.INVALID);
        validate(nextRaw, Error.INVALID);
        Snapshot previous = read();
        if (previous.revision != expectedRevision) throw new Failure(Error.CONFLICT);
        Snapshot next = new Snapshot(expectedRevision + 1, nextRaw);
        // Set before entering the backend, so even an Error/aborted worker cannot expose a
        // possibly updated memory cache. ONLY a positively completed commit clears poison.
        poison = Error.STORAGE;
        try {
            // commit() may change SharedPreferences' cache even when it fails. No read/replay
            // is permitted after that, including from a new Activity/controller in this process.
            if (!backend.commit(next)) throw new Failure(Error.STORAGE);
        } catch (Exception failure) {
            poison = Error.STORAGE;
            throw new Failure(poison);
        }
        poison = null;
        return next;
    }

    private void validate(String raw, Error error) throws Failure {
        if (raw == null || raw.length() > MAX_RAW_CHARS) throw new Failure(error);
        try { validator.validate(raw); }
        catch (Exception failure) { throw new Failure(error); }
    }
}
