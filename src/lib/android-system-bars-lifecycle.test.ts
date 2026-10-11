import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java', 'utf8');
describe('installed SystemBars teardown fencing', () => {
  it('refuses missing, finishing and destroyed activities', () => {
    expect(source).toContain('getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()');
    expect(source).toContain('bridge == null || bridge.isDestroyed()');
  });
  it('fences the single page listener before evaluation and inside its reply', () => {
    const ready = source.slice(source.indexOf('public void onPageCommitVisible'), source.indexOf('protected void handleOnDestroy'));
    expect(ready.match(/if \(isActivityUnavailable\(\)\) return;/g)).toHaveLength(2);
    expect(ready).toMatch(/if \(isActivityUnavailable\(\)\) return;\s*bridge.getWebView\(\).evaluateJavascript/);
    expect(ready).toMatch(/\(res\) -> \{\s*if \(isActivityUnavailable\(\)\) return;/);
    expect(source).not.toContain('CapacitorSystemBarsAndroidInterface');
    expect(source).toContain('if (webViewListener == null)');
  });
  it('unregisters its owned callbacks on destruction without touching stored data', () => {
    const close = source.slice(source.indexOf('protected void handleOnDestroy'), source.indexOf('protected void handleOnConfigurationChanged'));
    expect(close).toContain('destroyed = true;');
    expect(close).toContain('removeWebViewListener(webViewListener)');
    expect(close).toContain('webViewListener = null;');
    expect(close).toContain('ViewCompat.setOnApplyWindowInsetsListener(getActivity().getWindow().getDecorView(), null)');
    expect(close).not.toMatch(/clearCache|clearHistory|WebStorage|SharedPreferences/);
  });
  it('also fences queued CSS injection without disabling insets or changing persistence', () => {
    const inject = source.slice(source.indexOf('private void injectSafeAreaCSS'), source.indexOf('private void setStyle'));
    expect(inject).toContain('if (!isActivityUnavailable() && bridge != null && bridge.getWebView() != null)');
    expect(inject).toContain('bridge.getWebView().evaluateJavascript(script, null)');
    expect(inject).not.toMatch(/clearCache|clearHistory|removeAllViews|destroy\(/);
  });
});
