import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../lib/http-handler.mjs";

const uiHtml = "<!doctype html><html><title>BountyGuard Worker</title></html>";

test("shared Worker handler serves injected UI", async () => {
  const response = await handleRequest(new Request("https://worker.example/"), { uiHtml });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), uiHtml);
});

test("shared Worker handler analyzes JSON", async () => {
  const response = await handleRequest(new Request("https://worker.example/v1/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      single_payout: 10_000,
      currency: "USDT",
      deadline: "2099-01-01T00:00:00Z",
    }),
  }), { uiHtml });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.decision, "eligible");
  assert.equal(result.payout.verified_max_single.amount, 10_000);
});

test("shared Worker handler returns a bodyless CORS preflight", async () => {
  const response = await handleRequest(new Request("https://worker.example/v1/analyze", {
    method: "OPTIONS",
  }), { uiHtml });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("access-control-max-age"), "86400");
});

test("shared Worker handler returns a constrained 404", async () => {
  const response = await handleRequest(new Request("https://worker.example/not-found"), { uiHtml });
  assert.equal(response.status, 404);
  assert.deepEqual((await response.json()).endpoints, [
    "POST /v1/analyze",
    "POST /v1/compare",
    "POST /v1/checklist",
    "POST /v1/payout-audit",
    "POST /v1/decision-memo",
  ]);
});
