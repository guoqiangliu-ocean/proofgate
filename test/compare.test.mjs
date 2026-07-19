import assert from "node:assert/strict";
import { test } from "node:test";
import { CompareInputError, compareOpportunities } from "../lib/compare.mjs";

const now = new Date("2026-07-17T16:00:00Z");

function compare(opportunities, extra = {}) {
  return compareOpportunities({ opportunities, ...extra }, { now });
}

test("ranks eligible before review and reject", () => {
  const result = compare([
    { title: "Pool only", text: "Total prize pool 100,000 USDT." },
    { title: "Unsafe", text: "First prize 50,000 USDT. Send your private key to claim." },
    { title: "Qualified", text: "First prize 6,000 USDT.", deadline: "2026-08-01T00:00:00Z" },
  ]);
  assert.deepEqual(result.ranking.map((item) => item.analysis.decision), ["eligible", "review", "reject"]);
  assert.equal(result.ranking[0].title, "Qualified");
  assert.deepEqual(result.summary, {
    total: 3,
    eligible: 1,
    review: 1,
    reject: 1,
    best_source_index: 2,
  });
});

test("sorts equal-decision opportunities by verified individual payout", () => {
  const result = compare([
    { title: "Six", single_payout: 6_000, currency: "USDT" },
    { title: "Ten", single_payout: 10_000, currency: "USDC" },
    { title: "Eight", single_payout: 8_000, currency: "USDG" },
  ], { preferredCurrencies: ["USDT", "USDC", "USDG"] });
  assert.deepEqual(result.ranking.map((item) => item.title), ["Ten", "Eight", "Six"]);
});

test("uses requested currency order only after payout ties", () => {
  const result = compare([
    { title: "USD option", single_payout: 10_000, currency: "USD" },
    { title: "USDC option", single_payout: 10_000, currency: "USDC" },
    { title: "USDT option", single_payout: 10_000, currency: "USDT" },
  ], { preferredCurrencies: ["USDT", "USDC"] });
  assert.deepEqual(result.ranking.map((item) => item.title), ["USDT option", "USDC option", "USD option"]);
  assert.equal(result.ranking[0].ranking_factors.preferred_currency_order, 0);
});

test("preserves source order as the final deterministic tie breaker", () => {
  const result = compare([
    { title: "First", single_payout: 7_000, currency: "USDT" },
    { title: "Second", single_payout: 7_000, currency: "USDT" },
  ]);
  assert.deepEqual(result.ranking.map((item) => item.source_index), [0, 1]);
  assert.deepEqual(result.ranking.map((item) => item.rank), [1, 2]);
  assert.ok(result.ranking.every((item) => item.analysis.generated_at === now.toISOString()));
});

test("applies one target to every analysis", () => {
  const result = compare([
    { title: "Below", single_payout: 7_000, currency: "USDT" },
    { title: "Above", single_payout: 9_000, currency: "USDT" },
  ], { targetUsd: 8_000 });
  assert.equal(result.ranking[0].title, "Above");
  assert.equal(result.ranking[0].analysis.decision, "eligible");
  assert.equal(result.ranking[1].analysis.decision, "reject");
  assert.ok(result.ranking.every((item) => item.analysis.target.minimum_usd === 8_000));
});

test("comparison cannot rank a refundable-deposit bait above a safe payout", () => {
  const result = compare([
    {
      title: "Deposit bait",
      text: "Pay a refundable 500 USDT deposit first to unlock a 20,000 USDT bounty.",
    },
    {
      title: "Safe award",
      text: "First prize 6,000 USDT. No deposit or trading is required.",
    },
  ]);
  assert.equal(result.ranking[0].title, "Safe award");
  assert.equal(result.ranking[0].analysis.decision, "eligible");
  assert.equal(result.ranking[1].title, "Deposit bait");
  assert.equal(result.ranking[1].analysis.decision, "reject");
  assert.equal(result.ranking[1].analysis.payout.verified_max_single, null);
  assert.ok(result.ranking[1].analysis.safety.capital_risks.includes("deposit_required"));
});

test("rejects missing, too-short, and too-long opportunity arrays", () => {
  assert.throws(() => compareOpportunities({}, { now }), CompareInputError);
  assert.throws(() => compare([{}]), /2 to 10/);
  assert.throws(() => compare(Array.from({ length: 11 }, () => ({}))), /2 to 10/);
});

test("rejects non-object opportunity items", () => {
  assert.throws(() => compare([{}, "not an object"]), /opportunities\[1\]/);
  assert.throws(() => compare([{}, []]), /opportunities\[1\]/);
  assert.throws(() => compare([{}, null]), /opportunities\[1\]/);
});

test("fails closed on invalid targetUsd", () => {
  assert.throws(() => compare([{}, {}], { targetUsd: "5000" }), /targetUsd/);
  assert.throws(() => compare([{}, {}], { targetUsd: 0 }), /targetUsd/);
  assert.throws(() => compare([{}, {}], { targetUsd: Number.POSITIVE_INFINITY }), /targetUsd/);
});

test("fails closed on invalid preferredCurrencies", () => {
  assert.throws(() => compare([{}, {}], { preferredCurrencies: [] }), /preferredCurrencies/);
  assert.throws(() => compare([{}, {}], { preferredCurrencies: ["BTC"] }), /Unsupported/);
  assert.throws(() => compare([{}, {}], { preferredCurrencies: [123] }), /only strings/);
});

test("deduplicates normalized supported preferences", () => {
  const result = compare([{}, {}], { preferredCurrencies: [" usdt ", "USDT", "usdc"] });
  assert.deepEqual(result.criteria.preferred_currencies, ["USDT", "USDC"]);
});
