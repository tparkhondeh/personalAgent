import "server-only";

type VoiceCallMode = "live" | "mock";

export type VoiceCallReadiness = {
  mode: VoiceCallMode;
  provider: "kavenegar" | "mock";
  reason: "ready" | "delivery-disabled" | "missing-api-key" | "missing-verified-number" | "invalid-recipient" | "recipient-not-verified";
};

export type VoiceCallResult = VoiceCallReadiness & {
  transmitted: boolean;
  providerReference?: string;
};

const genericUrgentMessage = "یک کار فوری شما از زمان مقرر گذشته است. لطفاً برنامه همراه را بررسی کنید.";

function latinDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

export function normalizeIranianMobile(value: string | null | undefined) {
  if (!value) return null;
  let number = latinDigits(value).replace(/[^+\d]/g, "");
  if (number.startsWith("+98")) number = `0${number.slice(3)}`;
  else if (number.startsWith("0098")) number = `0${number.slice(4)}`;
  else if (number.startsWith("98") && number.length === 12) number = `0${number.slice(2)}`;
  else if (number.startsWith("9") && number.length === 10) number = `0${number}`;
  return /^09\d{9}$/.test(number) ? number : null;
}

function verifiedNumbers() {
  return new Set((process.env.OUTBOUND_CALL_VERIFIED_NUMBERS || "")
    .split(",")
    .map((value) => normalizeIranianMobile(value))
    .filter((value): value is string => Boolean(value)));
}

export function getVoiceCallReadiness(recipient?: string | null): VoiceCallReadiness {
  if (process.env.OUTBOUND_CALLS_MODE !== "live") return { mode: "mock", provider: "mock", reason: "delivery-disabled" };
  if (!process.env.KAVENEGAR_API_KEY?.trim()) return { mode: "mock", provider: "mock", reason: "missing-api-key" };
  const allowed = verifiedNumbers();
  if (!allowed.size) return { mode: "mock", provider: "mock", reason: "missing-verified-number" };
  if (recipient !== undefined) {
    const normalized = normalizeIranianMobile(recipient);
    if (!normalized) return { mode: "mock", provider: "mock", reason: "invalid-recipient" };
    if (!allowed.has(normalized)) return { mode: "mock", provider: "mock", reason: "recipient-not-verified" };
  }
  return { mode: "live", provider: "kavenegar", reason: "ready" };
}

export async function sendUrgentVoiceCall(recipient: string | null | undefined): Promise<VoiceCallResult> {
  const readiness = getVoiceCallReadiness(recipient);
  if (readiness.mode !== "live") return { ...readiness, transmitted: false };

  const receptor = normalizeIranianMobile(recipient)!;
  const apiKey = process.env.KAVENEGAR_API_KEY!.trim();
  const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/call/maketts.json`;
  const body = new URLSearchParams({ receptor, message: genericUrgentMessage });
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("سرویس تماس در دسترس نبود");
  }

  const payload = await response.json().catch(() => null) as { return?: { status?: number }; entries?: Array<Record<string, unknown>> | Record<string, unknown> } | null;
  if (!response.ok || payload?.return?.status !== 200) throw new Error("سرویس تماس درخواست را نپذیرفت");
  const entry = Array.isArray(payload.entries) ? payload.entries[0] : payload.entries;
  const rawReference = entry?.messageid ?? entry?.callid ?? entry?.id;
  const providerReference = typeof rawReference === "string" || typeof rawReference === "number" ? String(rawReference).slice(0, 100) : undefined;
  return { ...readiness, transmitted: true, providerReference };
}
