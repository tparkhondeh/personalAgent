import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const root = 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/';
describe('installed bridge destruction fences', () => {
  for (const path of ['Bridge.java', 'cordova/MockCordovaWebViewImpl.java']) {
    it(`rejects queued and new evaluations after close in ${path}`, () => {
      const source = readFileSync(root + path, 'utf8');
      const evalBody = source.slice(source.indexOf('public void eval('), source.indexOf('\n    }', source.indexOf('public void eval(')));
      expect(source).toContain('private volatile boolean destroyed;');
      expect(source).toContain('destroyed = true;');
      expect(evalBody.match(/if \(isDestroyed\(\)\) return;/g)).toHaveLength(2);
      expect(evalBody).toContain('if (!isDestroyed() && callback != null)');
    });
  }
  it('guards all WebViewClient callbacks before touching the closed bridge or view', () => {
    const source = readFileSync(root + 'BridgeWebViewClient.java', 'utf8');
    for (const name of ['onPageFinished', 'onPageStarted', 'onPageCommitVisible', 'onReceivedError', 'onReceivedHttpError', 'onRenderProcessGone', 'shouldInterceptRequest', 'shouldOverrideUrlLoading']) {
      const method = source.slice(source.indexOf(` ${name}(`));
      expect(method.slice(method.indexOf('{') + 1).trimStart()).toMatch(/^if \(bridge.isDestroyed\(\)\) return/);
    }
  });
  it('retains teardown and does not delete stored data', () => {
    const source = readFileSync(root + 'Bridge.java', 'utf8');
    const detach = source.slice(source.indexOf('public void onDetachedFromWindow()'), source.indexOf('public String getServerBasePath()'));
    expect(detach).toContain('if (webViewDestroyed) return;');
    expect(detach).toContain('webView.destroy();');
    expect(detach).not.toMatch(/clearCache|clearHistory|WebStorage|SharedPreferences/);
  });
  it('releases the active document before native teardown without clearing persistence', () => {
    const source = readFileSync('android/app/src/main/java/ir/wealthos/personalagent/MainActivity.java', 'utf8');
    const close = source.slice(source.lastIndexOf('public void onDestroy()'));
    expect(close.indexOf('closing = true')).toBeLessThan(close.indexOf('stopLoading()'));
    expect(close.indexOf('stopLoading()')).toBeLessThan(close.indexOf('loadUrl("about:blank")'));
    expect(close.indexOf('loadUrl("about:blank")')).toBeLessThan(close.indexOf('super.onDestroy()'));
    expect(close).not.toMatch(/clearCache|clearHistory|deleteAllData|removeAllCookies|sleep\(/);
  });
});
