import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPayout } from "../lib/payout-audit.mjs";

const now = new Date("2026-07-17T16:00:00Z");

test("audits an individual payout, timing, KYC, wallet, and account owner gates", () => {
  const result = auditPayout({
    opportunity: {
      text: "First prize 10,000 USDT. Winners complete KYC and provide a wallet address. Payment within 30 days after winner announcement. Account holder name must match.",
      deadline: "2026-08-01T00:00:00Z",
    },
    targetUsd: 5_000,
    preferredCurrencies: ["USDT", "USDC"],
  }, { now });
  assert.equal(result.generated_at, now.toISOString());
  assert.equal(result.decision, "eligible");
  assert.equal(result.payout_summary.verified_individual_payout.amount, 10_000);
  assert.equal(result.payout_summary.currency_match, true);
  assert.equal(result.payout_summary.payment_timing.status, "stated_unverified");
  assert.ok(result.payout_summary.payment_timing.signals.some((item) => item.code === "within_period"));
  assert.ok(result.human_gates.includes("identity_verification"));
  assert.ok(result.human_gates.includes("wallet_for_payment"));
  assert.ok(result.human_gates.includes("account_owner_match"));
});

test("does not count a total prize pool as individual compensation", () => {
  const result = auditPayout({
    opportunity: { title: "Pool", total_pool: 100_000, currency: "USDT" },
  }, { now });
  assert.equal(result.decision, "review");
  assert.equal(result.payout_summary.verified_individual_payout, null);
  assert.equal(result.payout_summary.pool_only, true);
  assert.ok(result.settlement_risks.some((item) => item.code === "pool_not_individual"));
  assert.ok(result.verdict_reasons.some((item) => item.code === "total_pool_is_not_individual_payout"));
});

test("excludes refundable-deposit bait amounts from payout", () => {
  const result = auditPayout({
    opportunity: { text: "Pay a refundable 500 USDT deposit first to unlock a 20,000 USDT bounty." },
  }, { now });
  assert.equal(result.decision, "reject");
  assert.equal(result.payout_summary.verified_individual_payout, null);
  assert.equal(result.payout_summary.excluded_risk_linked_amounts.length, 2);
  assert.ok(result.settlement_risks.some((item) => item.code === "risk_linked_amounts_excluded"));
  assert.ok(result.settlement_risks.some((item) => item.code === "deposit_required"));
  assert.ok(result.verdict_reasons.some((item) => item.code === "risk_linked_amounts_not_counted"));
});

test("downgrades an otherwise eligible payout when currency preferences do not match", () => {
  const result = auditPayout({
    opportunity: { single_payout: 10_000, currency: "USD" },
    preferredCurrencies: ["USDT", "USDC"],
  }, { now });
  assert.equal(result.analysis_snapshot.analyzer_decision, "eligible");
  assert.equal(result.decision, "review");
  assert.equal(result.payout_summary.currency_match, false);
  assert.ok(result.evidence_gaps.some((item) => item.code === "preferred_currency_not_confirmed"));
});

test("reports unspecified settlement timing and conditions as evidence gaps", () => {
  const result = auditPayout({
    opportunity: { single_payout: 8_000, currency: "USDT" },
  }, { now });
  assert.equal(result.payout_summary.payment_timing.status, "unspecified");
  assert.deepEqual(result.payout_summary.payment_conditions, []);
  assert.ok(result.evidence_gaps.some((item) => item.code === "payment_timing_missing"));
  assert.ok(result.evidence_gaps.some((item) => item.code === "payment_conditions_missing"));
});

test("detects invoice, contract, tax, and milestone payment conditions", () => {
  const result = auditPayout({
    opportunity: {
      text: "Fixed payment 12,000 USDT after milestone acceptance. Signed contract, invoice, and W-8BEN required.",
    },
  }, { now });
  const codes = new Set(result.payout_summary.payment_conditions.map((item) => item.code));
  assert.ok(codes.has("milestone_acceptance"));
  assert.ok(codes.has("contract_required"));
  assert.ok(codes.has("invoice_required"));
  assert.ok(codes.has("tax_form_required"));
  assert.ok(result.human_gates.includes("invoice_required"));
  assert.ok(result.human_gates.includes("contract_required"));
  assert.ok(result.human_gates.includes("tax_form_required"));
});

test("payout audit reuses strict single-opportunity validation", () => {
  assert.throws(() => auditPayout({}, { now }), /non-empty JSON object/);
  assert.throws(() => auditPayout({ opportunity: { url: "https://example.invalid" } }, { now }), /Unsupported opportunity field/);
  assert.throws(() => auditPayout({ opportunity: { text: "lead" }, targetUsd: "5000" }, { now }), /targetUsd/);
  assert.throws(() => auditPayout({ opportunity: { text: "lead" }, preferredCurrencies: ["BTC"] }, { now }), /Unsupported/);
});
