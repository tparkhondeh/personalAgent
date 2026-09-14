export const recoveryPasswordPolicy = { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, resetPasswordTokenExpiresIn: 900, revokeSessionsOnPasswordReset: true } as const;
type Environment = Record<string, string | undefined>;
export function recoveryConfiguration(env: Environment) {
  if (env.ACCOUNT_RECOVERY_EMAIL_APPROVED !== "true") return null;
  const host = env.RECOVERY_SMTP_HOST?.trim(), port = Number(env.RECOVERY_SMTP_PORT), from = env.RECOVERY_MAIL_FROM?.trim();
  const cap = Number(env.RECOVERY_DAILY_EMAIL_LIMIT);
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || ![465, 587].includes(port) || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)
    || !env.RECOVERY_SMTP_USER || !env.RECOVERY_SMTP_PASSWORD || !Number.isInteger(cap) || cap < 1 || cap > 50) return null;
  try {
    const url = new URL(env.BETTER_AUTH_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { host, port, from, cap, origin: url.origin, user: env.RECOVERY_SMTP_USER, password: env.RECOVERY_SMTP_PASSWORD };
  } catch { return null; }
}
export function validRecoveryDestination(origin: string, address: string, link: string) {
  if (address.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return false;
  try { const url = new URL(link); return url.origin === origin && !url.username && !url.password && url.pathname === "/reset-password" && !url.search && /^#token=[a-zA-Z0-9_-]{24,128}$/.test(url.hash); } catch { return false; }
}
