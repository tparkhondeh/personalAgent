import "server-only";

export function selfHostedSpeechConfig() {
  const token = process.env.ASR_INTERNAL_TOKEN ?? "";
  // Fixed loopback endpoint prevents SSRF and accidental third-party audio delivery.
  return { enabled: process.env.ASR_SELF_HOSTED_ENABLED === "true" && token.length >= 32, token, url: "http://127.0.0.1:3020" };
}
