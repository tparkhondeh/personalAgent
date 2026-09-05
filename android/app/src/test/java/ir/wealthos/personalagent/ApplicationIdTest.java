package ir.wealthos.personalagent;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ApplicationIdTest {
    @Test
    public void applicationIdUsesHamrahNamespace() {
        assertTrue(BuildConfig.APPLICATION_ID.startsWith("ir.wealthos.personalagent"));
    }
}
