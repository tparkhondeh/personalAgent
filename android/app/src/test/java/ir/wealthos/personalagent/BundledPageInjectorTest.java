package ir.wealthos.personalagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class BundledPageInjectorTest {
    @Test
    public void preservesSerializedOfflineHeadAndJavascriptCharacters() {
        String body = "</head><body><script>const bundledDocument = \"<html><head>offline</head></html>\";</script></body>";
        String script = "const $ = 'one';\nconst $$ = '\\\\two';";
        String result = BundledPageInjector.inject("<html><head>" + body, script);
        assertEquals("<html><head><script>" + script + "</script>" + body, result);
        assertTrue(result.endsWith(body));
    }

    @Test
    public void escapesScriptTerminator() {
        assertTrue(BundledPageInjector.inject("<head></head>", "const value = '</script>'; ")
            .contains("const value = '<\\/script>'; "));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMissingHead() {
        BundledPageInjector.inject("<body>بدون سربرگ</body>", "alert(1)");
    }
}
