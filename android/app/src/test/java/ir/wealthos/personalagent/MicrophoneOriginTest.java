package ir.wealthos.personalagent;

import static org.junit.Assert.*;
import org.junit.Test;

public class MicrophoneOriginTest {
    @Test public void acceptsOnlyExactAppAndBundledOrigins() {
        String remote = "https://personalagent.wealthos.ir:8443/", local = "https://localhost";
        assertTrue(MicrophoneOrigin.allowed(remote, remote, local));
        assertTrue(MicrophoneOrigin.allowed("https://localhost/", remote, local));
        for (String bad : new String[]{"http://localhost", "https://localhost.evil.test", "https://personalagent.wealthos.ir", "https://other.test", "https://user@localhost", "https://localhost?x=1", "https://localhost/private", "garbage"}) {
            assertFalse(bad, MicrophoneOrigin.allowed(bad, remote, local));
        }
    }
}
