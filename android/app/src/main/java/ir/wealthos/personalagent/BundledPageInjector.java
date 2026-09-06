package ir.wealthos.personalagent;

final class BundledPageInjector {
    private BundledPageInjector() {}

    static String inject(String html, String script) {
        int head = html.indexOf("<head>");
        if (head < 0) throw new IllegalArgumentException("Bundled page has no head element");
        int insertion = head + "<head>".length();
        // Only the real document head, never the <head> inside serialized offline
        // HTML. Literal slicing also preserves JavaScript $, backslashes and quotes.
        return html.substring(0, insertion) + "<script>"
            + script.replace("</script", "<\\/script") + "</script>"
            + html.substring(insertion);
    }
}
