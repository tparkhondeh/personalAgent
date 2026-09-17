package ir.wealthos.personalagent;

/** Endpoint transitions may invalidate code, never the user's origin storage. */
final class EndpointCodeCache {
    private EndpointCodeCache() { }

    static void refresh(String previous, String current, Runnable clearCodeCache) {
        if (previous != null && current != null && !previous.equals(current)) {
            clearCodeCache.run();
        }
    }
}
