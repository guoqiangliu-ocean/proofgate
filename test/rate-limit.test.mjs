import assert from "node:assert/strict";
import { test } from "node:test";
import { createSlidingWindowRateLimiter } from "../lib/rate-limit.mjs";

test("sliding-window limiter isolates callers and reopens after the window", () => {
  let now = 1_000;
  const take = createSlidingWindowRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });

  assert.equal(take("alpha").allowed, true);
  assert.equal(take("alpha").allowed, true);
  const blocked = take("alpha");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(take("beta").allowed, true);

  now = 2_001;
  assert.equal(take("alpha").allowed, true);
});
