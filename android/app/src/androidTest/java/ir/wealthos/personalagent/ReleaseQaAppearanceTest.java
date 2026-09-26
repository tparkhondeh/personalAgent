package ir.wealthos.personalagent;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Uses an isolated QA file under the instrumentation process UID, never real preferences. */
@RunWith(AndroidJUnit4.class)
public class ReleaseQaAppearanceTest {
    private SharedPreferences preferences;
    private boolean fixtureCreated;

    @Before public void createFixture() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(android.os.Process.myUid(), context.getApplicationInfo().uid);
        preferences = context.getSharedPreferences("tia_qa_appearance_" + UUID.randomUUID(), Context.MODE_PRIVATE);
        assertTrue(preferences.getAll().isEmpty());
        assertTrue(preferences.edit().putString("unrelated", "preserve").commit());
        fixtureCreated = true;
    }

    @After public void removeFixture() {
        // Preserve an earlier setup failure instead of masking it with a second failed write.
        if (!fixtureCreated) return;
        assertTrue(preferences.edit().remove("theme").remove("unrelated").commit());
    }

    @Test public void removesOnlyExactFixtureTheme() {
        assertTrue(preferences.edit().putString("theme", "light").commit());
        ReleaseQaRunner.restoreFixtureAppearance(preferences);
        assertFalse(preferences.contains("theme"));
        assertEquals("preserve", preferences.getString("unrelated", null));
        assertEquals(1, preferences.getAll().size());
    }

    @Test public void refusesNewerDarkChoice() {
        assertTrue(preferences.edit().putString("theme", "dark").commit());
        assertThrows(IllegalStateException.class, () -> ReleaseQaRunner.restoreFixtureAppearance(preferences));
        assertEquals("dark", preferences.getString("theme", null));
        assertEquals("preserve", preferences.getString("unrelated", null));
    }

    @Test public void refusesMissingFixtureRatherThanClaimingRestoration() {
        assertThrows(IllegalStateException.class, () -> ReleaseQaRunner.restoreFixtureAppearance(preferences));
        assertFalse(preferences.contains("theme"));
        assertEquals("preserve", preferences.getString("unrelated", null));
    }
}
