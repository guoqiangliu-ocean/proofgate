export function createSlidingWindowRateLimiter(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 8;
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0
    ? options.windowMs
    : 60_000;
  const maxKeys = Number.isInteger(options.maxKeys) && options.maxKeys > 0
    ? options.maxKeys
    : 2_048;
  const clock = typeof options.now === "function" ? options.now : Date.now;
  const buckets = new Map();

  return function take(key) {
    const now = Number(clock());
    const normalizedKey = typeof key === "string" && key.trim() ? key.trim() : "unknown";
    const cutoff = now - windowMs;
    const recent = (buckets.get(normalizedKey) || []).filter((timestamp) => timestamp > cutoff);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    buckets.set(normalizedKey, recent);

    if (buckets.size > maxKeys) {
      for (const [candidate, timestamps] of buckets) {
        if (!timestamps.length || timestamps[timestamps.length - 1] <= cutoff) {
          buckets.delete(candidate);
        }
        if (buckets.size <= maxKeys) break;
      }
      while (buckets.size > maxKeys) {
        buckets.delete(buckets.keys().next().value);
      }
    }

    const oldest = recent[0] ?? now;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - recent.length),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((oldest + windowMs - now) / 1_000)),
      scope: "best-effort per Worker isolate",
    };
  };
}
