import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const activity = readFileSync('android/app/src/main/java/ir/wealthos/personalagent/MainActivity.java', 'utf8');
const constant = activity.match(/CONTENT_READY_SCRIPT = ([\s\S]+?);/)?.[1];
if (!constant) throw Error('Recovery expression missing');
const script = [...constant.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]) as string).join('');

function ready(options: { text?: string; title?: string; heading?: string; retry?: string; marker?: string } = {}) {
  const document = {
    body: { innerText: options.text ?? 'فهرست برنامه‌ها' }, title: options.title ?? 'tia',
    documentElement: { getAttribute: () => options.marker ?? null },
    querySelector: (selector: string) => {
      const textContent = selector === 'main > h1' ? options.heading : options.retry;
      return textContent === undefined ? null : { textContent };
    },
  };
  return runInNewContext(script, { document });
}

describe('the actual Android content check expression', () => {
  it('recognizes marked service-worker recovery without a network error callback', () => {
    expect(ready({ marker: 'network-v1' })).toBe(false);
  });
  it('recognizes the old deployed recovery with no marker', () => {
    expect(ready({ title: 'tia | اتصال برقرار نیست', heading: 'اتصال برقرار نیست', retry: 'تلاش دوباره' })).toBe(false);
  });
  it.each([
    {}, { text: 'اتصال برقرار نیست' }, { title: 'tia | اتصال برقرار نیست' },
    { title: 'tia | اتصال برقرار نیست', heading: 'اتصال برقرار نیست' }, { marker: 'unrecognized' },
  ])('does not confuse ordinary app content with recovery: %j', options => expect(ready(options)).toBe(true));
  it('still rejects an empty document', () => expect(ready({ text: ' ' })).toBe(false));
  it('does not read or clear credentials, storage or caches', () => expect(script).not.toMatch(/localStorage|sessionStorage|cookie|caches|fetch/));
  it('fences delayed checks after destruction or a newer document', () => {
    const callback = activity.slice(activity.indexOf('webView.evaluateJavascript(CONTENT_PENDING_SCRIPT'), activity.indexOf('private boolean isRecoveryPage'));
    expect(callback.indexOf('closing || isFinishing() || isDestroyed()')).toBeLessThan(callback.indexOf('showRecoveryPage()'));
    expect(callback).toContain('generation != documentGeneration');
    expect(callback).toContain('!java.util.Objects.equals(url, webView.getUrl())');
    const destroy = activity.slice(activity.indexOf('public void onDestroy()'));
    expect(destroy.indexOf('closing = true')).toBeLessThan(destroy.indexOf('super.onDestroy()'));
  });
  it('keeps one bounded navigation deadline while session loading is pending', () => {
    const listener = activity.slice(activity.indexOf('public void onPageCommitVisible'), activity.indexOf('getBridge().addWebViewListener'));
    expect(listener).not.toContain('cancelLoadTimeout()');
    const callback = activity.slice(activity.indexOf('webView.evaluateJavascript(CONTENT_PENDING_SCRIPT'), activity.indexOf('private boolean isRecoveryPage'));
    expect(callback).toContain('scheduleContentCheck(webView, url)');
    expect(callback).not.toContain('scheduleLoadTimeout(');
    expect(callback).toContain('cancelLoadTimeout()');
  });
  it.each([
    [true, false, '', true], [false, true, 'در حال آماده‌سازی tia…', true],
    [false, false, 'در حال آماده‌سازی tia…', false],
    [false, true, 'فهرست کارها\nدر حال آماده‌سازی tia…', false],
  ])('recognizes only the exact legacy or marked session loader (%s/%s)', (marker, legacy, text, expected) => {
    const expression = activity.match(/CONTENT_PENDING_SCRIPT = ([\s\S]+?);/)?.[1];
    if (!expression) throw Error('Pending expression missing');
    const pending = [...expression.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]) as string).join('');
    const document = { body: { innerText: text }, querySelector: (selector: string) => selector.includes('data-tia-loading') ? marker : legacy };
    expect(runInNewContext(pending, { document })).toBe(expected);
  });
  it('removes the WebView itself before Capacitor destroys it on window detachment', () => {
    const detach = activity.slice(activity.indexOf('public void onDetachedFromWindow()'), activity.indexOf('public void onDestroy()'));
    expect(detach).toContain('webView.getParent() instanceof ViewGroup parent');
    expect(detach.indexOf('parent.removeView(webView);')).toBeLessThan(detach.indexOf('super.onDetachedFromWindow();'));
    expect(detach).not.toMatch(/clearCache|clearHistory|removeAllViews|loadUrl|removeAllCookies/);
  });
});
