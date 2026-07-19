import http from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { handleRequest } from "./lib/http-handler.mjs";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const uiHtml = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

export const server = http.createServer(async (request, response) => {
  try {
    const method = (request.method || "GET").toUpperCase();
    const init = { method, headers: request.headers };
    if (method !== "GET" && method !== "HEAD") {
      init.body = Readable.toWeb(request);
      init.duplex = "half";
    }
    const origin = `http://${request.headers.host || "localhost"}`;
    const webRequest = new Request(new URL(request.url || "/", origin), init);
    const webResponse = await handleRequest(webRequest, { uiHtml });
    const payload = Buffer.from(await webResponse.arrayBuffer());
    const headers = Object.fromEntries(webResponse.headers);
    headers["content-length"] = String(payload.byteLength);
    response.writeHead(webResponse.status, headers);
    response.end(payload);
  } catch {
    const payload = JSON.stringify({ error: "Internal server error" });
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    });
    response.end(payload);
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, host, () => {
    console.log(`BountyGuard listening on http://${host}:${port}`);
  });
}
