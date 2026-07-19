import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cloudflareRateLimitMetadata,
  createCloudflareRateLimiter,
} from "../lib/cloudflare-rate-limit.mjs";

function request(ip = "203.0.113.7") {
  return new Request("https://worker.example/v1/decision-memo", {
    headers: { "cf-connecting-ip": ip },
  });
}

test("Cloudflare limiter enforces client and aggregate bindings with a local fallback", async () => {
  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;
    return { allowed: true, limit: 8, retryAfterSeconds: 0, scope: "fallback" };
  };
  const withoutBindings = createCloudflareRateLimiter({}, fallback);
  assert.equal((await withoutBindings(request())).scope, "fallback");
  assert.equal(fallbackCalls, 1);

  const calls = [];
  const env = {
    DECISION_MEMO_CLIENT_LIMITER: {
      limit: async ({ key }) => {
        calls.push(["client", key]);
        return { success: true };
      },
    },
    DECISION_MEMO_AGGREGATE_LIMITER: {
      limit: async ({ key }) => {
        calls.push(["aggregate", key]);
        return { success: true };
      },
    },
  };
  const allowed = await createCloudflareRateLimiter(env, fallback)(request());
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.scope, "Cloudflare platform rate limits");
  assert.equal(fallbackCalls, 2);
  assert.deepEqual(calls, [
    ["client", "203.0.113.7"],
    ["aggregate", "proofgate-public-demo"],
  ]);

  env.DECISION_MEMO_CLIENT_LIMITER.limit = async () => ({ success: false });
  const clientBlocked = await createCloudflareRateLimiter(env, fallback)(request());
  assert.deepEqual(clientBlocked, {
    allowed: false,
    limit: cloudflareRateLimitMetadata.clientLimit,
    retryAfterSeconds: 60,
    scope: "Cloudflare per-client rate limit",
  });

  env.DECISION_MEMO_CLIENT_LIMITER.limit = async () => ({ success: true });
  env.DECISION_MEMO_AGGREGATE_LIMITER.limit = async () => ({ success: false });
  const aggregateBlocked = await createCloudflareRateLimiter(env, fallback)(request());
  assert.deepEqual(aggregateBlocked, {
    allowed: false,
    limit: cloudflareRateLimitMetadata.aggregateLimit,
    retryAfterSeconds: 60,
    scope: "Cloudflare aggregate demo rate limit",
  });

  let platformCalls = 0;
  const localBlock = createCloudflareRateLimiter({
    DECISION_MEMO_CLIENT_LIMITER: { limit: async () => { platformCalls += 1; return { success: true }; } },
    DECISION_MEMO_AGGREGATE_LIMITER: { limit: async () => { platformCalls += 1; return { success: true }; } },
  }, () => ({
    allowed: false,
    limit: 8,
    retryAfterSeconds: 11,
    scope: "local fallback",
  }));
  assert.equal((await localBlock(request())).allowed, false);
  assert.equal(platformCalls, 0);
});
