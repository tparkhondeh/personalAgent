package ir.wealthos.personalagent;

import java.net.URI;

final class MicrophoneOrigin {
    private MicrophoneOrigin() { }
    static boolean allowed(String origin, String remote, String bundled) {
        return same(origin, remote) || same(origin, bundled);
    }
    private static boolean same(String origin, String target) {
        try {
            URI from = URI.create(origin), to = URI.create(target);
            return from.getUserInfo() == null && from.getQuery() == null && from.getFragment() == null
                && (from.getPath().isEmpty() || "/".equals(from.getPath()))
                && from.getScheme() != null && from.getScheme().equals(to.getScheme())
                && from.getRawAuthority() != null && from.getRawAuthority().equals(to.getRawAuthority());
        } catch (RuntimeException ignored) { return false; }
    }
}
