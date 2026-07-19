const CLIENT_LIMIT = 8;
const AGGREGATE_LIMIT = 30;
const PERIOD_SECONDS = 60;

function result(allowed, limit, scope) {
  return {
    allowed,
    limit,
    retryAfterSeconds: allowed ? 0 : PERIOD_SECONDS,
    scope,
  };
}

export function createCloudflareRateLimiter(env, fallback) {
  const clientBinding = env?.DECISION_MEMO_CLIENT_LIMITER;
  const aggregateBinding = env?.DECISION_MEMO_AGGREGATE_LIMITER;
  const hasPlatformBindings = typeof clientBinding?.limit === "function"
    && typeof aggregateBinding?.limit === "function";

  if (!hasPlatformBindings) {
    return typeof fallback === "function" ? fallback : () => null;
  }

  return async function take(request) {
    const clientKey = request.headers.get("cf-connecting-ip") || "unknown-client";
    const client = await clientBinding.limit({ key: clientKey });
    if (!client?.success) {
      return result(false, CLIENT_LIMIT, "Cloudflare per-client rate limit");
    }

    const aggregate = await aggregateBinding.limit({ key: "proofgate-public-demo" });
    if (!aggregate?.success) {
      return result(false, AGGREGATE_LIMIT, "Cloudflare aggregate demo rate limit");
    }

    return result(true, CLIENT_LIMIT, "Cloudflare platform rate limits");
  };
}

export const cloudflareRateLimitMetadata = {
  clientLimit: CLIENT_LIMIT,
  aggregateLimit: AGGREGATE_LIMIT,
  periodSeconds: PERIOD_SECONDS,
};
