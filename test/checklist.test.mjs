import assert from "node:assert/strict";
import { test } from "node:test";
import { createChecklist } from "../lib/checklist.mjs";

const now = new Date("2026-07-17T16:00:00Z");

test("creates an input-only checklist with one unified timestamp", () => {
  const result = createChecklist({
    opportunity: {
      title: "Verified-size award",
      text: "First prize 10,000 USDT. Registration and KYC required.",
      deadline: "2026-08-01T00:00:00Z",
    },
    targetUsd: 5_000,
    preferredCurrencies: ["USDT", "USDC"],
  }, { now });
  assert.equal(result.generated_at, now.toISOString());
  assert.equal(result.decision, "eligible");
  assert.ok(result.evidence_gaps.some((item) => item.code === "official_source_unverified"));
  assert.ok(result.priority_checks.some((item) => item.code === "verify_official_source"));
  assert.deepEqual(result.human_gates, ["registration", "identity_verification"]);
  assert.equal(result.stop_conditions.length, 0);
  assert.match(result.limitations[0], /does not fetch, authenticate, or verify external pages/);
  assert.match(result.limitations[1], /No result guarantees/);
});

test("turns refundable-deposit traps into explicit stop conditions", () => {
  const result = createChecklist({
    opportunity: {
      text: "Pay a refundable 500 USDT deposit first to unlock a 20,000 USDT bounty.",
    },
  }, { now });
  assert.equal(result.decision, "reject");
  assert.equal(result.analysis_snapshot.payout.verified_max_single, null);
  assert.ok(result.stop_conditions.some((item) => item.code === "upfront_transfer"));
  assert.ok(result.stop_conditions.some((item) => item.code === "deposit_required"));
  assert.equal(result.safe_next_actions[0].code, "pause_engagement");
});

test("maps credential and trading-volume risks to stop conditions", () => {
  const credential = createChecklist({
    opportunity: { text: "Send your password to claim the 10,000 USDT prize." },
  }, { now });
  assert.ok(credential.stop_conditions.some((item) => item.code === "credential_request"));

  const key = createChecklist({
    opportunity: { text: "Send your private key to claim the 10,000 USDT prize." },
  }, { now });
  assert.ok(key.stop_conditions.some((item) => item.code === "private_key_request"));

  const trading = createChecklist({
    opportunity: { text: "Win 10,000 USDT based on trading volume. Minimum deposit 500 USDT." },
  }, { now });
  assert.ok(trading.stop_conditions.some((item) => item.code === "trading_required"));
  assert.ok(trading.stop_conditions.some((item) => item.code === "deposit_required"));
});

test("lists missing payout, currency, deadline, and terms evidence", () => {
  const result = createChecklist({ opportunity: { title: "Sparse lead" } }, { now });
  const codes = new Set(result.evidence_gaps.map((item) => item.code));
  assert.ok(codes.has("official_source_unverified"));
  assert.ok(codes.has("individual_payout_unverified"));
  assert.ok(codes.has("payment_currency_unverified"));
  assert.ok(codes.has("deadline_missing"));
  assert.ok(codes.has("listing_terms_incomplete"));
});

test("applies requested target and normalized currency preference", () => {
  const result = createChecklist({
    opportunity: { single_payout: 7_500, currency: "USDC" },
    targetUsd: 8_000,
    preferredCurrencies: [" usdc ", "USDT"],
  }, { now });
  assert.equal(result.decision, "reject");
  assert.equal(result.analysis_snapshot.target.minimum_usd, 8_000);
  assert.equal(result.analysis_snapshot.target.preferred_currency, "USDC");
  assert.ok(result.stop_conditions.some((item) => item.code === "below_target"));
});

test("strictly rejects missing, empty, or malformed opportunity input", () => {
  assert.throws(() => createChecklist({}, { now }), /non-empty JSON object/);
  assert.throws(() => createChecklist({ opportunity: {} }, { now }), /non-empty JSON object/);
  assert.throws(() => createChecklist({ opportunity: [] }, { now }), /non-empty JSON object/);
  assert.throws(() => createChecklist({ opportunity: { text: "" } }, { now }), /non-empty string/);
  assert.throws(() => createChecklist({ opportunity: { deadline: "not-a-date" } }, { now }), /ISO-8601/);
});

test("strictly rejects unsupported fields and incorrect structured types", () => {
  assert.throws(() => createChecklist({ opportunity: { text: "lead" }, extra: true }, { now }), /Unsupported request field/);
  assert.throws(() => createChecklist({ opportunity: { url: "https://example.invalid" } }, { now }), /Unsupported opportunity field/);
  assert.throws(() => createChecklist({ opportunity: { single_payout: "10000" } }, { now }), /finite non-negative number/);
  assert.throws(() => createChecklist({ opportunity: { requires_deposit: "yes" } }, { now }), /must be a boolean/);
});

test("strictly rejects invalid checklist options", () => {
  const opportunity = { text: "First prize 10,000 USDT." };
  assert.throws(() => createChecklist({ opportunity, targetUsd: "5000" }, { now }), /targetUsd/);
  assert.throws(() => createChecklist({ opportunity, preferredCurrencies: [] }, { now }), /preferredCurrencies/);
  assert.throws(() => createChecklist({ opportunity, preferredCurrencies: ["BTC"] }, { now }), /Unsupported/);
});
