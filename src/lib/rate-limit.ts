type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export function createRateLimiter(maxBuckets = 10_000) {
  if (!Number.isInteger(maxBuckets) || maxBuckets < 1) throw new Error("Invalid rate-limit bucket capacity");
  const buckets = new Map<string, RateLimitBucket>();

  function prune(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    while (buckets.size >= maxBuckets) {
      const oldest = buckets.keys().next().value;
      if (!oldest) break;
      buckets.delete(oldest);
    }
  }

  return {
    consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
      if (!key || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
        throw new Error("Invalid rate-limit configuration");
      }

      if (!buckets.has(key) && buckets.size >= maxBuckets) prune(now);
      const current = buckets.get(key);
      const bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;

      if (bucket.count >= limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
          resetAt: bucket.resetAt,
        };
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: 0,
        resetAt: bucket.resetAt,
      };
    },
    clear() {
      buckets.clear();
    },
  };
}

const globalForRateLimit = globalThis as unknown as { hamrahRateLimiter?: ReturnType<typeof createRateLimiter> };
const sharedRateLimiter = globalForRateLimit.hamrahRateLimiter ?? createRateLimiter();
if (process.env.NODE_ENV !== "production") globalForRateLimit.hamrahRateLimiter = sharedRateLimiter;

export function guardUserRateLimit(userId: string, scope: string, options: { limit: number; windowMs: number }) {
  const result = sharedRateLimiter.consume(`${scope}:${userId}`, options.limit, options.windowMs);
  if (result.allowed) return null;

  return Response.json(
    { error: "تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
