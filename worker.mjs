import demoHtml from "./public/index.html";
import { handleRequest } from "./lib/http-handler.mjs";

export default {
  fetch(request, env) {
    return handleRequest(request, {
      uiHtml: demoHtml,
      openAiApiKey: env?.OPENAI_API_KEY,
    });
  },
};
