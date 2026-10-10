import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java', 'utf8');
describe('installed SystemBars teardown fencing', () => {
  it('refuses missing, finishing and destroyed activities', () => {
    expect(source).toContain('getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()');
  });
  it('checks before enqueueing, inside the UI runnable and inside the JS reply', () => {
    const ready = source.slice(source.indexOf('public void onDOMReady()'), source.indexOf('private Insets calcSafeAreaInsets'));
    expect(ready.match(/if \(isActivityUnavailable\(\)\) return;/g)).toHaveLength(3);
    expect(ready).toMatch(/runOnUiThread\(\(\) -> \{[\s\S]*?if \(isActivityUnavailable\(\)\) return;\s*this.bridge.getWebView\(\).evaluateJavascript/);
    expect(ready).toMatch(/\(res\) -> \{\s*if \(isActivityUnavailable\(\)\) return;/);
  });
  it('also fences queued CSS injection without disabling insets or changing persistence', () => {
    const inject = source.slice(source.indexOf('private void injectSafeAreaCSS'), source.indexOf('private void setStyle'));
    expect(inject).toContain('if (!isActivityUnavailable() && bridge != null && bridge.getWebView() != null)');
    expect(inject).toContain('bridge.getWebView().evaluateJavascript(script, null)');
    expect(inject).not.toMatch(/clearCache|clearHistory|removeAllViews|destroy\(/);
  });
});
