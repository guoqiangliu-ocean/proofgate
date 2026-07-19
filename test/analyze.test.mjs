import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeOpportunity } from "../lib/analyze.mjs";

const now = new Date("2026-07-17T16:00:00Z");

test("accepts an explicit 10,000 USDT first prize", () => {
  const result = analyzeOpportunity({
    text: "Prize pool 100,000 USDT. First prize: 10,000 USDT. Registration required.",
    deadline: "2026-07-18T23:59:59Z",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.equal(result.payout.verified_max_single.amount, 10_000);
  assert.equal(result.payout.verified_max_single.currency, "USDT");
});

test("does not mistake a total pool for a single payout", () => {
  const result = analyzeOpportunity({ text: "Total prize pool: 50,000 USDT." }, { now });
  assert.equal(result.decision, "review");
  assert.ok(result.reason_codes.includes("only_total_pool_verified"));
});

test("rejects when individual first prize is below target", () => {
  const result = analyzeOpportunity({
    text: "Total: 5,000 USDG. 1st prize 1,800 USDG. 2nd prize 1,200 USDG.",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.equal(result.payout.verified_max_single.amount, 1_800);
});

test("accepts structured annual contract value paid in USDC", () => {
  const result = analyzeOpportunity({
    title: "Production MVP engagement",
    single_payout: 24_000,
    currency: "USDC",
    deadline: "2026-07-22T20:59:59Z",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.ok(result.reason_codes.includes("stable_value_payment_match"));
});

test("rejects a trading-volume contest", () => {
  const result = analyzeOpportunity({
    text: "Win USDT based on trading volume. Starting equity must be at least 100 USDT.",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.capital_risks.includes("trading_required"));
  assert.ok(result.safety.capital_risks.includes("deposit_required"));
});

test("rejects flash USDT scams", () => {
  const result = analyzeOpportunity({ text: "Buy flash USDT and receive guaranteed profit." }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.severe_risks.includes("flash_usdt"));
});

test("rejects private key requests", () => {
  const result = analyzeOpportunity({ text: "First prize 10,000 USDT. Send your private key to claim." }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.severe_risks.includes("private_key_request"));
});

test("rejects a refundable deposit required before unlocking a bounty", () => {
  const result = analyzeOpportunity({
    text: "Pay a refundable 500 USDT deposit first to unlock a 20,000 USDT bounty.",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.severe_risks.includes("upfront_transfer"));
  assert.ok(result.safety.capital_risks.includes("deposit_required"));
  assert.equal(result.payout.verified_max_single, null);
  assert.ok(result.payout.candidates.length >= 2);
  assert.ok(result.payout.candidates.every((item) => item.classification === "risk_linked"));
});

test("rejects send-first and access-gated currency traps", () => {
  for (const text of [
    "Send 250 USDC first to claim a 12,000 USDC reward.",
    "Deposit 300 USDT to access a 9,000 USDT grant.",
    "A refundable deposit of 400 USDC is required before claiming a 15,000 USDC prize.",
  ]) {
    const result = analyzeOpportunity({ text }, { now });
    assert.equal(result.decision, "reject", text);
    assert.equal(result.payout.verified_max_single, null, text);
    assert.ok(result.safety.capital_risks.includes("deposit_required"), text);
  }
});

test("does not flag an explicit no-deposit opportunity", () => {
  const result = analyzeOpportunity({
    text: "First prize 10,000 USDT. No deposit or payment is required.",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.equal(result.payout.verified_max_single.amount, 10_000);
  assert.deepEqual(result.safety.capital_risks, []);
});

test("rejects an expired listing", () => {
  const result = analyzeOpportunity({
    single_payout: 10_000,
    currency: "USDT",
    deadline: "2026-07-16T23:59:59Z",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("deadline_expired"));
});

test("reports human gates without treating them as scams", () => {
  const result = analyzeOpportunity({
    text: "First prize 6,000 USDT. Register by email. Winners complete KYC and provide a wallet address.",
    deadline: "2026-08-01T00:00:00Z",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.deepEqual(
    new Set(result.human_gates),
    new Set(["registration", "identity_verification", "wallet_for_payment", "email"]),
  );
});

test("recognizes authorization safeguards", () => {
  const result = analyzeOpportunity({
    text: "Official scope. PoC required. Use a local test environment; production testing prohibited. Critical reward 10,000 USDT.",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.ok(result.safety.authorization_signals.length >= 3);
});

test("defaults to review when evidence is absent", () => {
  const result = analyzeOpportunity({}, { now });
  assert.equal(result.decision, "review");
  assert.equal(result.evidence_quality, "none");
});
