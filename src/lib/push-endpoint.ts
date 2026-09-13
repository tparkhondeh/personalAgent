/** Only browser push providers, never arbitrary URLs supplied by a client.
 * Validate again on delivery so old subscriptions cannot bypass this boundary.
 * Provider provenance and expansion policy: docs/INDEPENDENT_READINESS_2026-09-13.md.
 */
export function isSupportedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 4096) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    const host = url.hostname;
    return host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com$/.test(host)
      || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.notify\.windows\.com$/.test(host);
  } catch {
    return false;
  }
}
