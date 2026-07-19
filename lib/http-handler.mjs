import { analyzeOpportunity, serviceMetadata } from "./analyze.mjs";
import { compareOpportunities, compareServiceMetadata } from "./compare.mjs";
import { createChecklist, checklistServiceMetadata } from "./checklist.mjs";
import { auditPayout, payoutAuditServiceMetadata } from "./payout-audit.mjs";
import {
  createDecisionMemo,
  decisionMemoErrorResponse,
  decisionMemoServiceMetadata,
} from "./decision-memo.mjs";

export const MAX_BODY_BYTES = 64 * 1024;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const serviceSchema = {
  service: "BountyGuard",
  version: "1.0.0",
  description: "Deterministic, read-only opportunity screening with optional evidence-constrained server-side synthesis.",
  mode: "free",
  services: {
    analyze: serviceMetadata,
    compare: compareServiceMetadata,
    checklist: checklistServiceMetadata,
    payout_audit: payoutAuditServiceMetadata,
    decision_memo: decisionMemoServiceMetadata,
  },
  safety: {
    maximum_request_bytes: MAX_BODY_BYTES,
    external_url_fetching: false,
    wallet_operations: false,
    trading_or_deposits: false,
  },
};

function responseHeaders(contentType) {
  return {
    ...corsHeaders,
    ...securityHeaders,
    "content-type": contentType,
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...responseHeaders("application/json; charset=utf-8"),
      ...extraHeaders,
    },
  });
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: responseHeaders("text/html; charset=utf-8"),
  });
}

async function readRequestText(request) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel("Request body exceeds 64 KiB");
        const error = new Error("Request body exceeds 64 KiB");
        error.status = 413;
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function readJson(request) {
  const text = await readRequestText(request);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.status = 400;
    throw error;
  }
}

export async function handleRequest(request, options = {}) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const uiHtml = options.uiHtml || "<!doctype html><title>BountyGuard</title>";

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders("text/plain; charset=utf-8") });
  }

  if (method === "GET" && url.pathname === "/") {
    return htmlResponse(uiHtml);
  }

  if (method === "GET" && url.pathname === "/health") {
    return jsonResponse({ status: "ok", service: "BountyGuard", version: "1.0.0" });
  }

  if (method === "GET" && url.pathname === "/schema") {
    return jsonResponse(serviceSchema);
  }

  if (method === "POST" && (url.pathname === "/" || url.pathname === "/v1/analyze")) {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      if (!Object.keys(body).length) {
        return jsonResponse({ ...serviceMetadata, ready: true });
      }
      return jsonResponse(analyzeOpportunity(body));
    } catch (error) {
      return jsonResponse({
        error: error.status ? error.message : "Internal server error",
      }, error.status || 500);
    }
  }

  if (method === "POST" && url.pathname === "/v1/compare") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      return jsonResponse(compareOpportunities(body));
    } catch (error) {
      return jsonResponse({
        error: error.status ? error.message : "Internal server error",
      }, error.status || 500);
    }
  }

  if (method === "POST" && url.pathname === "/v1/checklist") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      return jsonResponse(createChecklist(body));
    } catch (error) {
      return jsonResponse({
        error: error.status ? error.message : "Internal server error",
      }, error.status || 500);
    }
  }

  if (method === "POST" && url.pathname === "/v1/payout-audit") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      return jsonResponse(auditPayout(body));
    } catch (error) {
      return jsonResponse({
        error: error.status ? error.message : "Internal server error",
      }, error.status || 500);
    }
  }

  if (method === "POST" && url.pathname === "/v1/decision-memo") {
    try {
      const rate = typeof options.rateLimiter === "function"
        ? options.rateLimiter(request)
        : null;
      if (rate && !rate.allowed) {
        return jsonResponse({
          error: "Decision memo request limit reached. Try again later.",
          code: "rate_limited",
          retry_after_seconds: rate.retryAfterSeconds,
          limit: rate.limit,
          scope: rate.scope,
        }, 429, {
          "retry-after": String(rate.retryAfterSeconds),
        });
      }
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      return jsonResponse(await createDecisionMemo(body, {
        apiKey: options.openAiApiKey,
        fetchImpl: options.fetchImpl,
        now: options.now,
        timeoutMs: options.openAiTimeoutMs,
      }));
    } catch (error) {
      const failure = decisionMemoErrorResponse(error);
      return jsonResponse(failure.body, failure.status);
    }
  }

  return jsonResponse({
    error: "Not found",
    endpoints: [
      "POST /v1/analyze",
      "POST /v1/compare",
      "POST /v1/checklist",
      "POST /v1/payout-audit",
      "POST /v1/decision-memo",
    ],
  }, 404);
}
