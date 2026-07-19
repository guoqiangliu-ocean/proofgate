import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
const { server } = await import("../server.mjs");
let origin;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("empty POST is OKX free-endpoint compatible", async () => {
  const response = await fetch(`${origin}/v1/analyze`, { method: "POST" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ready, true);
  assert.equal(body.mode, "free");
});

test("GET root serves the responsive demo UI", async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /<title>BountyGuard/);
  assert.match(html, /id="screen-form"/);
  assert.match(html, /id="compare-mode"/);
  assert.match(html, /id="checklist-mode"/);
  assert.match(html, /id="audit-mode"/);
  assert.match(html, /"\/v1\/analyze"/);
  assert.match(html, /"\/v1\/compare"/);
  assert.match(html, /"\/v1\/checklist"/);
  assert.match(html, /"\/v1\/payout-audit"/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("schema remains available as JSON", async () => {
  const response = await fetch(`${origin}/schema`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.services.analyze.endpoint, "POST /v1/analyze");
  assert.equal(body.services.compare.endpoint, "POST /v1/compare");
  assert.equal(body.services.checklist.endpoint, "POST /v1/checklist");
  assert.equal(body.services.payout_audit.endpoint, "POST /v1/payout-audit");
  assert.equal(body.safety.maximum_request_bytes, 65_536);
});

test("analysis endpoint returns deterministic JSON", async () => {
  const response = await fetch(`${origin}/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "First prize 10,000 USDT." }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.decision, "eligible");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
});

test("POST root remains A2MCP JSON compatible", async () => {
  const response = await fetch(`${origin}/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "First prize 6,000 USDT." }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.equal(body.decision, "eligible");
});

test("CORS preflight allows GET, POST, and content-type", async () => {
  const response = await fetch(`${origin}/v1/analyze`, {
    method: "OPTIONS",
    headers: {
      origin: "https://example.invalid",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
});

test("comparison endpoint ranks opportunities deterministically", async () => {
  const response = await fetch(`${origin}/v1/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      opportunities: [
        { title: "Pool", text: "Total prize pool 100,000 USDT." },
        { title: "Winner", single_payout: 10_000, currency: "USDT" },
        { title: "Smaller", single_payout: 6_000, currency: "USDC" },
      ],
      targetUsd: 5_000,
      preferredCurrencies: ["USDT", "USDC"],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = await response.json();
  assert.equal(body.service, "BountyGuard Compare");
  assert.deepEqual(body.ranking.map((item) => item.title), ["Winner", "Smaller", "Pool"]);
});

test("comparison endpoint fails closed on invalid input", async () => {
  const response = await fetch(`${origin}/v1/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunities: [{}] }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /2 to 10/);
});

test("comparison endpoint shares the 64 KiB request limit", async () => {
  const response = await fetch(`${origin}/v1/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunities: [{ text: "x".repeat(65 * 1024) }, {}] }),
  });
  assert.equal(response.status, 413);
});

test("checklist endpoint returns deterministic next steps and CORS", async () => {
  const response = await fetch(`${origin}/v1/checklist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      opportunity: {
        text: "First prize 10,000 USDT. Registration and KYC required.",
        deadline: "2099-01-01T00:00:00Z",
      },
      targetUsd: 5_000,
      preferredCurrencies: ["USDT"],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = await response.json();
  assert.equal(body.service, "BountyGuard Checklist");
  assert.equal(body.decision, "eligible");
  assert.ok(body.priority_checks.length > 0);
  assert.ok(body.safe_next_actions.length > 0);
});

test("checklist endpoint fails closed and shares the 64 KiB limit", async () => {
  const invalid = await fetch(`${origin}/v1/checklist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunity: { url: "https://example.invalid" } }),
  });
  assert.equal(invalid.status, 400);

  const oversized = await fetch(`${origin}/v1/checklist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunity: { text: "x".repeat(65 * 1024) } }),
  });
  assert.equal(oversized.status, 413);
});

test("payout audit endpoint reports pool interpretation and CORS", async () => {
  const response = await fetch(`${origin}/v1/payout-audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      opportunity: { total_pool: 100_000, currency: "USDT", title: "Pool only" },
      targetUsd: 5_000,
      preferredCurrencies: ["USDT"],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = await response.json();
  assert.equal(body.service, "BountyGuard Payout Audit");
  assert.equal(body.payout_summary.verified_individual_payout, null);
  assert.equal(body.payout_summary.pool_only, true);
});

test("payout audit endpoint fails closed and shares the 64 KiB limit", async () => {
  const invalid = await fetch(`${origin}/v1/payout-audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunity: { single_payout: "10000" } }),
  });
  assert.equal(invalid.status, 400);

  const oversized = await fetch(`${origin}/v1/payout-audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunity: { text: "x".repeat(65 * 1024) } }),
  });
  assert.equal(oversized.status, 413);
});

test("malformed JSON fails closed", async () => {
  const response = await fetch(`${origin}/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json",
  });
  assert.equal(response.status, 400);
});

test("non-object JSON fails closed", async () => {
  const response = await fetch(`${origin}/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "[]",
  });
  assert.equal(response.status, 400);
});

test("request bodies over 64 KiB are rejected", async () => {
  const response = await fetch(`${origin}/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(65 * 1024) }),
  });
  assert.equal(response.status, 413);
});
