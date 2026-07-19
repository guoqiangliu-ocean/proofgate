import demoHtml from "./public/index.html";
import { handleRequest } from "./lib/http-handler.mjs";
import { createSlidingWindowRateLimiter } from "./lib/rate-limit.mjs";
import { createCloudflareRateLimiter } from "./lib/cloudflare-rate-limit.mjs";

const decisionMemoLimiter = createSlidingWindowRateLimiter({
  limit: 8,
  windowMs: 60_000,
  maxKeys: 2_048,
});

export default {
  fetch(request, env) {
    const fallbackLimiter = (incoming) => decisionMemoLimiter(
      incoming.headers.get("cf-connecting-ip") || "unknown",
    );
    return handleRequest(request, {
      uiHtml: demoHtml,
      openAiApiKey: env?.OPENAI_API_KEY,
      rateLimiter: createCloudflareRateLimiter(env, fallbackLimiter),
    });
  },
};
