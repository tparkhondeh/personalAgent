package ir.wealthos.personalagent;

import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class DurableTaskStoreTest {
    private static class Memory implements DurableTaskStore.Backend {
        DurableTaskStore.Snapshot memory = new DurableTaskStore.Snapshot(0, null);
        DurableTaskStore.Snapshot disk = memory;
        boolean fail, throwAfterWrite;
        int writes, reads;
        @Override public DurableTaskStore.Snapshot read() { reads++; return memory; }
        @Override public boolean commit(DurableTaskStore.Snapshot next) {
            writes++;
            memory = next; // Faithful SharedPreferences failure: memory can change before disk.
            if (throwAfterWrite) throw new IllegalStateException("synthetic");
            if (fail) return false;
            disk = next;
            return true;
        }
    }

    private DurableTaskStore store(Memory backend) {
        return new DurableTaskStore(backend, raw -> {
            if (!("[]".equals(raw) || "[1]".equals(raw) || "[2]".equals(raw))) throw new IllegalArgumentException();
        });
    }

    private interface Action { void run() throws Exception; }
    private void failure(DurableTaskStore.Error expected, Action action) throws Exception {
        try { action.run(); fail("Expected " + expected); }
        catch (DurableTaskStore.Failure value) { assertEquals(expected, value.error); }
    }

    @Test public void absentMigrationIsOnceOnlyAndEnvelopeIsAtomic() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        assertNull(store.read().raw);
        assertEquals(0, store.read().revision);
        DurableTaskStore.Snapshot acknowledged = store.compareAndSet(0, "[1]");
        assertSame(backend.disk, acknowledged);
        assertEquals(1, acknowledged.revision);
        assertEquals("[1]", acknowledged.raw);
        failure(DurableTaskStore.Error.CONFLICT, () -> store.compareAndSet(0, "[]"));
        assertEquals(1, backend.writes);
    }

    @Test public void sameRawAfterABAStillRejectsCapturedOldRevision() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        store.compareAndSet(0, "[]");
        long captured = store.read().revision;
        store.compareAndSet(1, "[1]");
        store.compareAndSet(2, "[]");
        failure(DurableTaskStore.Error.CONFLICT, () -> store.compareAndSet(captured, "[2]"));
        assertEquals(3, store.read().revision);
        assertEquals("[]", store.read().raw);
    }

    @Test public void lostAcknowledgmentReadbackReconcilesButReplayCannotIncrementRevision() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        store.compareAndSet(0, "[1]"); // Simulate discarding the successful bridge response.
        DurableTaskStore.Snapshot recovered = store.read();
        assertEquals(1, recovered.revision);
        assertEquals("[1]", recovered.raw);
        failure(DurableTaskStore.Error.CONFLICT, () -> store.compareAndSet(0, "[1]"));
        assertEquals(1, backend.writes);
    }

    @Test public void falseCommitPoisonsReadsAndIdenticalRetriesWithoutReadingChangedCache() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        store.compareAndSet(0, "[]");
        backend.fail = true;
        failure(DurableTaskStore.Error.STORAGE, () -> store.compareAndSet(1, "[1]"));
        assertEquals("[1]", backend.memory.raw);
        assertEquals("[]", backend.disk.raw);
        int reads = backend.reads;
        failure(DurableTaskStore.Error.STORAGE, store::read);
        failure(DurableTaskStore.Error.STORAGE, () -> store.compareAndSet(1, "[1]"));
        failure(DurableTaskStore.Error.STORAGE, () -> store.compareAndSet(2, "[2]"));
        assertEquals(reads, backend.reads);
        assertEquals(2, backend.writes);
        backend.memory = backend.disk; // Only a NEW process reloads actual disk, not the cache.
        assertEquals("[]", store(backend).read().raw);
    }

    @Test public void thrownCommitAlsoPoisonsUntilProcessRestart() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        backend.throwAfterWrite = true;
        failure(DurableTaskStore.Error.STORAGE, () -> store.compareAndSet(0, "[1]"));
        backend.throwAfterWrite = false;
        failure(DurableTaskStore.Error.STORAGE, store::read);
        assertNull(backend.disk.raw);
    }

    @Test public void abortedWorkerCannotExposeUnacknowledgedMemory() throws Exception {
        Memory backend = new Memory() {
            @Override public boolean commit(DurableTaskStore.Snapshot next) {
                memory = next;
                throw new AssertionError("synthetic aborted commit");
            }
        };
        DurableTaskStore store = store(backend);
        try { store.compareAndSet(0, "[1]"); fail("Aborted commit must not acknowledge"); }
        catch (AssertionError expected) { assertEquals("synthetic aborted commit", expected.getMessage()); }
        failure(DurableTaskStore.Error.STORAGE, store::read);
        assertNull(backend.disk.raw);
    }

    @Test public void corruptReadCannotBecomeEmptyOrMigration() throws Exception {
        Memory backend = new Memory();
        backend.memory = new DurableTaskStore.Snapshot(1, "broken");
        DurableTaskStore store = store(backend);
        failure(DurableTaskStore.Error.CORRUPT, store::read);
        backend.memory = new DurableTaskStore.Snapshot(0, null);
        failure(DurableTaskStore.Error.CORRUPT, () -> store.compareAndSet(0, "[]"));
        assertEquals(0, backend.writes);
    }

    @Test public void inconsistentEnvelopeIsNotAbsent() throws Exception {
        for (DurableTaskStore.Snapshot corrupt : new DurableTaskStore.Snapshot[] {
            new DurableTaskStore.Snapshot(0, "[]"), new DurableTaskStore.Snapshot(1, null),
            new DurableTaskStore.Snapshot(-1, null), new DurableTaskStore.Snapshot(DurableTaskStore.MAX_REVISION + 1, "[]")
        }) {
            Memory backend = new Memory(); backend.memory = corrupt;
            failure(DurableTaskStore.Error.CORRUPT, store(backend)::read);
            assertEquals(0, backend.writes);
        }
    }

    @Test public void invalidWritesDoNotPoisonOrMutateValidHistory() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        store.compareAndSet(0, "[]");
        failure(DurableTaskStore.Error.INVALID, () -> store.compareAndSet(1, null));
        failure(DurableTaskStore.Error.INVALID, () -> store.compareAndSet(1, "broken"));
        failure(DurableTaskStore.Error.INVALID, () -> store.compareAndSet(-1, "[]"));
        failure(DurableTaskStore.Error.INVALID, () -> store.compareAndSet(DurableTaskStore.MAX_REVISION, "[]"));
        assertEquals(1, backend.writes);
        assertEquals("[]", store.read().raw);
    }

    @Test public void concurrentSameRevisionHasExactlyOneWinner() throws Exception {
        Memory backend = new Memory();
        DurableTaskStore store = store(backend);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger won = new AtomicInteger(), conflicts = new AtomicInteger();
        try {
            Future<?>[] futures = new Future<?>[2];
            for (int i = 0; i < 2; i++) futures[i] = workers.submit(() -> {
                try { start.await(); store.compareAndSet(0, "[1]"); won.incrementAndGet(); }
                catch (DurableTaskStore.Failure failure) {
                    assertEquals(DurableTaskStore.Error.CONFLICT, failure.error); conflicts.incrementAndGet();
                } catch (InterruptedException error) { throw new AssertionError(error); }
            });
            start.countDown();
            for (Future<?> future : futures) future.get(5, TimeUnit.SECONDS);
            assertEquals(1, won.get()); assertEquals(1, conflicts.get());
            assertEquals(1, backend.writes);
        } finally { workers.shutdownNow(); }
    }

    @Test public void successCannotReturnBeforeDurableCommitFinishes() throws Exception {
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        Memory backend = new Memory() {
            @Override public boolean commit(DurableTaskStore.Snapshot next) {
                entered.countDown();
                try { assertTrue(release.await(5, TimeUnit.SECONDS)); }
                catch (InterruptedException error) { throw new AssertionError(error); }
                return super.commit(next);
            }
        };
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<DurableTaskStore.Snapshot> result = worker.submit(() -> store(backend).compareAndSet(0, "[1]"));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertFalse(result.isDone());
            assertNull(backend.disk.raw);
            release.countDown();
            DurableTaskStore.Snapshot acknowledged = result.get(5, TimeUnit.SECONDS);
            assertSame(backend.disk, acknowledged);
        } finally { release.countDown(); worker.shutdownNow(); }
    }
}
