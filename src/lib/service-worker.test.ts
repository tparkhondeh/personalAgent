import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { recoverySource } from '../../scripts/generate-pwa-recovery.mjs';

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PWA service worker", () => {
  it("never serves a stale interactive-looking shell during local development", () => {
    const worker = readProjectFile("public/sw.js");

    expect(worker).toContain('CACHE_NAME = "hamrah-shell-v8-safe-recovery"');
    expect(worker).toContain('self.location.hostname === "localhost"');
    expect(worker).toContain('self.location.hostname === "127.0.0.1"');
    expect(worker).toContain("if (IS_LOCAL_DEVELOPMENT) return;");
    expect(worker).not.toContain('caches.delete');
  });

  it("checks for a fresh worker instead of reusing the browser HTTP cache", () => {
    const dashboard = readProjectFile("src/components/personal-agent-dashboard.tsx");
    const pushClient = readProjectFile("src/lib/push-client.ts");

    expect(dashboard).toContain('updateViaCache: "none"');
    expect(pushClient).toContain('updateViaCache: "none"');
  });
});

type WorkerEvent = { request: { url: string; method: string; mode: string; headers: Headers }; respondWith: (p: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void };
function worker(options: { failed?: boolean; cacheFailed?: boolean; status?: number; hostname?: string } = {}) {
  const handlers: Record<string, (event: WorkerEvent) => void> = {};
  const cache = { addAll: vi.fn(async () => undefined), put: vi.fn(async () => undefined), match: vi.fn(async () => new Response('OLD INTERACTIVE APP')) };
  const caches = { open: vi.fn(async () => { if (options.cacheFailed) throw Error('quota'); return cache; }), delete: vi.fn(), match: vi.fn() };
  const self = { location: new URL(`https://${options.hostname || 'staging.example'}`), addEventListener: (name: string, f: (e: WorkerEvent) => void) => { handlers[name] = f; }, skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => undefined) } };
  const fetch = vi.fn(async () => { if (options.failed) throw Error('network'); return new Response('CURRENT', { status: options.status || 200 }); });
  const timeout = vi.fn(() => new AbortController().signal);
  runInNewContext(readProjectFile('public/sw.js'), { self, caches, fetch, URL, Response, AbortSignal: { timeout }, importScripts: () => runInNewContext(readProjectFile('public/pwa-recovery.js'), { self }) });
  async function request(path = '/', mode = 'navigate', method = 'GET', headers = new Headers()) {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch({ request: { url: new URL(path, self.location).href, mode, method, headers }, respondWith: p => { response = p; }, waitUntil: p => { pending.push(p); } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { request, handlers, cache, caches, self, fetch, timeout };
}

describe('real PWA worker behavior without deleting stored data', () => {
  it('serves the current network document with no HTTP cache and bounded wait', async () => {
    const w = worker(); expect(await (await w.request())?.text()).toBe('CURRENT');
    expect(w.fetch.mock.calls).toHaveLength(1); expect(w.timeout).toHaveBeenCalledWith(12000);
    expect(w.fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cache: 'no-store' }));
    expect(w.cache.put).not.toHaveBeenCalled(); expect(w.caches.match).not.toHaveBeenCalled();
  });
  it.each([true, false])('never displays an old interactive app on failed network, cache unavailable=%s', async cacheFailed => {
    const w = worker({ failed: true, cacheFailed }); const response = await w.request('/login?private=not-displayed');
    expect(response?.status).toBe(503); const text = await response!.text();
    expect(text).toContain('اتصال برقرار نیست'); expect(text).toContain('تلاش دوباره');
    expect(text).not.toMatch(/OLD INTERACTIVE APP|private=|\/api\/|<form|_next\/static/);
    expect(w.caches.open).not.toHaveBeenCalled(); expect(w.caches.delete).not.toHaveBeenCalled();
    expect(response!.headers.get('cache-control')).toBe('no-store');
    expect(response!.headers.get('content-security-policy')).toContain("default-src 'none'");
  });
  it.each([500, 502, 503])('shows safe recovery for server error %s', async status => { expect((await worker({ status }).request())?.status).toBe(503); });
  it.each([401, 403, 404])('preserves authentication and routing response %s', async status => { expect((await worker({ status }).request())?.status).toBe(status); });
  it('does not turn healthy network into failure when caches are blocked', async () => { expect(await (await worker({ cacheFailed: true }).request())!.text()).toBe('CURRENT'); });
  it('never intercepts API, mutations, other origins or RSC', async () => {
    const w = worker();
    for (const path of ['/api', '/api/auth/get-session', '/?_rsc=123', 'https://other.example/']) expect(await w.request(path)).toBeUndefined();
    expect(await w.request('/', 'navigate', 'POST')).toBeUndefined();
    expect(await w.request('/', 'cors', 'GET', new Headers({ RSC: '1' }))).toBeUndefined();
    expect(await w.request('/account', 'cors')).toBeUndefined(); expect(w.fetch).not.toHaveBeenCalled();
  });
  it('preserves local development network errors instead of serving cached app', async () => { const w = worker({ hostname: 'localhost' }); expect(await w.request()).toBeUndefined(); });
  it('caches only successful static assets; failed cache writes are harmless', async () => {
    const w = worker(); await w.request('/_next/static/file.js', 'cors'); expect(w.cache.put).toHaveBeenCalledOnce();
    const broken = worker({ status: 404 }); await broken.request('/_next/static/file.js', 'cors'); expect(broken.cache.put).not.toHaveBeenCalled();
    expect((await worker({ cacheFailed: true }).request('/_next/static/file.js', 'cors'))?.status).toBe(200);
  });
  it('retains old caches on activate and installs even when caches are unavailable', async () => {
    const w = worker({ cacheFailed: true }); const promises: Promise<unknown>[] = [];
    const e: WorkerEvent = { request: { url: '/', method: 'GET', mode: 'navigate', headers: new Headers() }, respondWith: () => undefined, waitUntil: p => { promises.push(p); } };
    w.handlers.install(e); w.handlers.activate(e); await Promise.all(promises);
    expect(w.caches.delete).not.toHaveBeenCalled(); expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });
  it('recovery is reproducible, self-contained and uses canonical font/theme', async () => {
    expect(readProjectFile('public/pwa-recovery.js')).toBe(await recoverySource());
    const recovery = readProjectFile('public/pwa-recovery.js');
    expect(recovery).toContain('data:font/woff2;base64,'); expect(recovery).toContain('hamrah-appearance-v1');
    expect(recovery).not.toContain('prefers-color-scheme'); expect(recovery).not.toContain('localStorage.removeItem');
  });
});
