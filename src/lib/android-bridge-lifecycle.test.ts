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
  it('never reloads or removes provider listeners from a dead renderer', () => {
    const source = readFileSync('android/app/src/main/java/ir/wealthos/personalagent/MainActivity.java', 'utf8');
    const close = source.slice(source.lastIndexOf('public void onDestroy()'));
    expect(close).toContain('if (!rendererGone && getBridge() != null');
    expect(close).toContain('appearance.destroy(!rendererGone)');
    expect(close).toContain('taskStorage.destroy(!rendererGone)');
    expect(close).toContain('if (!rendererGone) getBridge().getWebView().removeJavascriptInterface');
    const gone = source.slice(source.indexOf('public boolean onRenderProcessGone'), source.indexOf('public void onDetachedFromWindow'));
    expect(gone.indexOf('rendererGone = true')).toBeLessThan(gone.indexOf('recreate()'));
    expect(gone.indexOf('getBridge().beginDestroy()')).toBeLessThan(gone.indexOf('recreate()'));
    expect(gone).toContain('cancelLoadTimeout();');
    const timer = source.slice(source.indexOf('private void scheduleLoadTimeout'), source.indexOf('private void cancelLoadTimeout'));
    expect(timer.indexOf('if (closing ||')).toBeLessThan(timer.indexOf('webView.getUrl()'));
    const bridge = readFileSync(root + 'Bridge.java', 'utf8');
    expect(bridge).toContain('adapter.beginDestroy()');
    const cordova = readFileSync(root + 'cordova/MockCordovaWebViewImpl.java', 'utf8');
    expect(cordova).toContain('this.cordova, this::isDestroyed');
    expect(cordova).toContain('if (closed.getAsBoolean() ||');
    for (const name of ['AppearanceController', 'TaskStoreController']) {
      const controller = readFileSync(`android/app/src/main/java/ir/wealthos/personalagent/${name}.java`, 'utf8');
      const destroy = controller.slice(controller.indexOf('void destroy(boolean webViewUsable)'));
      expect(destroy).toContain('if (destroyed) return;');
      expect(destroy).toContain('if (webViewUsable &&');
    }
  });
  it('dispatches plugin replies on UI thread with pre/post queue fences', () => {
    const source = readFileSync(root + 'MessageHandler.java', 'utf8');
    const response = source.slice(source.indexOf('public void sendResponseMessage'), source.indexOf('private void callPluginMethod'));
    expect(response).toContain('bridge.executeOnMainThread(() -> {\n                    if (bridge.isDestroyed()) return;');
    expect(response).toContain('call.release(bridge);\n            return;');
    expect(response).toContain('bridge.eval(runScript, null)');
    expect(response).not.toContain('evaluateJavascript');
    expect(response).toContain('final JavaScriptReplyProxy responseProxy = javaScriptReplyProxy;');
    expect(response).toContain('responseProxy.postMessage(data.toString())');
    expect(response).not.toContain('javaScriptReplyProxy.postMessage');
    expect(source).toContain('public void postMessage(String jsonStr) {\n        if (bridge.isDestroyed()) return;');
  });
});
