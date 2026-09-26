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

/** Uses a unique TEST APK preference file, never the delivered app's data. */
@RunWith(AndroidJUnit4.class)
public class ReleaseQaAppearanceTest {
    private SharedPreferences preferences;

    @Before public void createFixture() {
        preferences = InstrumentationRegistry.getInstrumentation().getContext()
            .getSharedPreferences("tia_qa_appearance_" + UUID.randomUUID(), Context.MODE_PRIVATE);
        assertTrue(preferences.edit().putString("unrelated", "preserve").commit());
    }

    @After public void removeFixture() {
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
