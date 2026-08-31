package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ApplicationIdTest {
    @Test
    public void applicationIdIsStable() {
        assertEquals("ir.wealthos.personalagent", BuildConfig.APPLICATION_ID);
    }
}
