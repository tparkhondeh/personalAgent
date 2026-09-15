// Only these public categories leave the server; never relay provider text,
// request bodies, headers, account identifiers or credentials to the client.
export type ProviderFailure = "credentials" | "credit" | "rate-limit" | "timeout" | "connection" | "invalid-response" | "context-limit" | "test-budget";

export function providerFailure(error: unknown): ProviderFailure {
  if (!error || typeof error !== "object") return "connection";
  const value = error as { statusCode?: unknown; name?: unknown; cause?: { name?: unknown }; data?: { error?: { code?: unknown } } };
  if (value.name === "TiaTestBudgetError" || value.cause?.name === "TiaTestBudgetError") return "test-budget";
  if (value.name === "TiaContextLimitError" || value.cause?.name === "TiaContextLimitError") return "context-limit";
  if (value.statusCode === 401 || value.statusCode === 403) return "credentials";
  if (value.statusCode === 429) return value.data?.error?.code === "insufficient_quota" ? "credit" : "rate-limit";
  if (value.name === "TimeoutError" || value.name === "AbortError") return "timeout";
  if (value.name === "AI_NoObjectGeneratedError" || value.name === "AI_NoOutputGeneratedError" || value.name === "ZodError") return "invalid-response";
  return "connection";
}

export function providerFailureLabel(reason: unknown): string {
  const messages: Record<ProviderFailure, string> = {
    "test-budget": "مجوز یا ظرفیت آزمون GPT تمام شده؛ پیشنهاد با پردازش محلی آماده شد.",
    credentials: "اتصال GPT نیاز به بررسی کلید دارد؛ پیشنهاد با پردازش محلی آماده شد.",
    credit: "اعتبار سرویس GPT کافی نیست؛ پیشنهاد با پردازش محلی آماده شد.",
    "rate-limit": "سرویس GPT موقتاً محدود شده؛ پیشنهاد با پردازش محلی آماده شد.",
    timeout: "پاسخ GPT به‌موقع نرسید؛ پیشنهاد با پردازش محلی آماده شد.",
    connection: "ارتباط با GPT برقرار نشد؛ پیشنهاد با پردازش محلی آماده شد.",
    "invalid-response": "پاسخ GPT قابل استفاده نبود؛ پیشنهاد با پردازش محلی آماده شد.",
    "context-limit": "اطلاعات این درخواست طولانی است؛ پیشنهاد با پردازش محلی آماده شد.",
  };
  return typeof reason === "string" && Object.hasOwn(messages, reason) ? messages[reason as ProviderFailure] : messages.connection;
}
