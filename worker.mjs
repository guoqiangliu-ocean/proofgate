import demoHtml from "./public/index.html";
import { handleRequest } from "./lib/http-handler.mjs";
import { createSlidingWindowRateLimiter } from "./lib/rate-limit.mjs";

const decisionMemoLimiter = createSlidingWindowRateLimiter({
  limit: 8,
  windowMs: 60_000,
  maxKeys: 2_048,
});

export default {
  fetch(request, env) {
    return handleRequest(request, {
      uiHtml: demoHtml,
      openAiApiKey: env?.OPENAI_API_KEY,
      rateLimiter: (incoming) => decisionMemoLimiter(
        incoming.headers.get("cf-connecting-ip") || "unknown",
      ),
    });
  },
};
