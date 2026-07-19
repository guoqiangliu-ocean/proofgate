import demoHtml from "./public/index.html";
import { handleRequest } from "./lib/http-handler.mjs";

export default {
  fetch(request) {
    return handleRequest(request, { uiHtml: demoHtml });
  },
};
