package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class EndpointCodeCacheTest {
    @Test
    public void endpointAndPortChangesInvalidateCachedCode() {
        Map<String, String> codeCache = new HashMap<>();
        codeCache.put("old-script.js", "old-code");
        AtomicInteger invalidations = new AtomicInteger();
        Runnable clearCodeCache = () -> { invalidations.incrementAndGet(); codeCache.clear(); };

        EndpointCodeCache.refresh("https://old.invalid", "https://new.invalid", clearCodeCache);
        assertTrue(codeCache.isEmpty());
        EndpointCodeCache.refresh("https://new.invalid:8443", "https://new.invalid", clearCodeCache);
        assertEquals(2, invalidations.get());
    }

    @Test
    public void firstLaunchMissingEndpointAndUnchangedEndpointDoNotInvalidate() {
        AtomicInteger invalidations = new AtomicInteger();
        Runnable clearCodeCache = invalidations::incrementAndGet;
        EndpointCodeCache.refresh(null, "https://localhost", clearCodeCache);
        EndpointCodeCache.refresh("https://localhost", null, clearCodeCache);
        EndpointCodeCache.refresh(null, null, clearCodeCache);
        EndpointCodeCache.refresh("https://localhost", "https://localhost", clearCodeCache);
        assertEquals(0, invalidations.get());
    }

    @Test
    public void returningToBundledModeAlsoPreservesTheStorageBoundary() {
        AtomicInteger invalidations = new AtomicInteger();
        EndpointCodeCache.refresh("https://old.invalid", "https://localhost", invalidations::incrementAndGet);
        assertEquals(1, invalidations.get());
    }
}
