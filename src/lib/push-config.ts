// Read at server runtime, not through Next's build-time NEXT_PUBLIC substitution.
export function readWebPushConfig(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function publicWebPushConfig(env: Record<string, string | undefined> = process.env) {
  return { publicKey: readWebPushConfig(env)?.publicKey ?? null };
}
