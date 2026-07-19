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

test("does not connect a negated deposit clause to a later first-prize sentence", () => {
  const result = analyzeOpportunity({
    text: "First prize 8,000 USD. No entry fee, deposit, purchase, or trading requirement is stated. Official rules name the individual first prize of 8,000 USD.",
    deadline: "2026-07-24T17:00:00+09:00",
  }, { now });
  assert.equal(result.decision, "eligible");
  assert.deepEqual(result.safety.severe_risks, []);
  assert.deepEqual(result.safety.capital_risks, []);
});

test("still catches an explicit pay-first trap after a no-deposit sentence", () => {
  const result = analyzeOpportunity({
    text: "No deposit is required. Pay 500 USDT first to unlock the 10,000 USDT prize.",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.severe_risks.includes("upfront_transfer"));
  assert.ok(result.safety.capital_risks.includes("deposit_required"));
});

test("does not treat a normal award bank transfer as an upfront payment", () => {
  for (const text of [
    "Winner receives the individual first prize by bank transfer of USD 10,000.",
    "Send USD 10,000 to the winner. The winner receives it by bank transfer.",
    "Wire USD 10,000 to the winner. Then receive a confirmation receipt from the bank.",
    "Send USD 10,000 to winner's bank. Then winner can access funds.",
    "Send USD 10,000 to the winner's verified bank. Then the winner can access the funds.",
  ]) {
    const result = analyzeOpportunity({ text }, { now });
    assert.equal(result.decision, "eligible", text);
    assert.deepEqual(result.safety.severe_risks, [], text);
    assert.deepEqual(result.safety.capital_risks, [], text);
    assert.ok(result.payout.candidates.every((item) => item.classification !== "risk_linked"), text);
  }
});

test("masks common explicit risk negations without weakening the decision", () => {
  for (const statement of [
    "No refundable deposit of 500 USDT is required.",
    "No upfront payment is required.",
    "There is no minimum deposit.",
    "No trading volume is required.",
    "You do not need to buy a membership.",
    "We never request a private key or password.",
    "No guaranteed return is promised.",
    "Upfront payment is prohibited.",
    "No starting equity is required.",
    "Eligibility is not based on trading volume.",
    "Trading volume does not affect selection.",
    "Trading volume will not affect eligibility.",
    "Trading volume is irrelevant to selection.",
    "Trading volume is not relevant to payout.",
    "Referral volume is not required.",
    "Do not send your private key.",
    "Never share your private key.",
    "Don't share your private key.",
    "We will never ask for your private key.",
    "Private keys are never requested.",
    "Keep your private key secret.",
    "We don't request private keys.",
    "Participants aren't required to pay 500 USDT.",
    "Participants aren't required to provide a private key.",
    "Applicants are not required to pay 500 USDT to apply.",
    "Applicants will not be required to pay 500 USDT to apply.",
    "Candidates won't be required to pay 500 USDT to apply.",
    "Applicants don't pay 500 USDT to enter.",
    "No applicant pays 500 USDT to enter.",
    "Flash USDT is prohibited.",
    "Avoid paying 500 USDT first; report such requests.",
    "You must not deposit 500 USDT first.",
    "You should not pay 500 USDT first.",
    "You are not required to pay 500 USDT.",
    "请勿提供私钥。",
    "无需交易量。",
    "交易量不影响评选。",
  ]) {
    const result = analyzeOpportunity({
      text: `Individual first prize 10,000 USDT. ${statement}`,
    }, { now });
    assert.equal(result.decision, "eligible", statement);
    assert.deepEqual(result.safety.severe_risks, [], statement);
    assert.deepEqual(result.safety.capital_risks, [], statement);
  }
});

test("keeps line and field boundaries when nearby first-prize text lacks punctuation", () => {
  for (const text of [
    "Payment terms: No deposit\nEvidence submitted: individual first prize USD 8,000",
    "Payment terms: Bank transfer\nEvidence submitted: individual first prize USD 8,000",
    "Payment terms: Wire transfer\nEvidence submitted: individual first prize USD 8,000",
    "Payment terms: ACH transfer\nEvidence submitted: individual first prize USD 8,000",
  ]) {
    const result = analyzeOpportunity({ text }, { now });
    assert.equal(result.decision, "eligible", text);
    assert.deepEqual(result.safety.severe_risks, [], text);
    assert.deepEqual(result.safety.capital_risks, [], text);
  }
});

test("does not confuse ordinary delivery, attention, source-code, or ownership duties with payment", () => {
  for (const text of [
    "The sponsor must pay the winner 10,000 USDT.",
    "Participants must send their entries by email.",
    "You should pay attention to the deadline.",
    "Winners must deposit source code in the repository.",
    "You need to transfer ownership of the submitted code.",
    "The organizer pays the 500 USDT application fee.",
    "The application costs are reimbursed up to 500 USDT.",
    "Applicants receive 500 USDT to apply.",
    "Applicants are paid 500 USDT to apply.",
    "Applicants will be paid 500 USDT to apply.",
    "Applicants are paid 500 USDT to enter.",
    "Participants will be paid 500 USDT to participate.",
    "The sponsor pays applicants 500 USDT to apply.",
    "The organizer pays USD 500 to register the winning team.",
    "A 500 USDT fee is payable to the winner on registration.",
    "A 500 USDT fee is payable on registration by the sponsor.",
    "A 500 USDT fee is payable by the organizer on registration.",
    "Membership fee: 500 USDT, fully paid by the sponsor.",
    "Applicants must complete a trade simulation worth 500 USDT using test funds.",
    "Applicants must complete a 500 USDT trade simulation.",
    "Applicants must complete a 500 USDT trade on a testnet.",
    "Applicants must complete a 500 USDT trade in a sandbox.",
    "Applicants must complete a 500 USDT trade-analysis exercise.",
    "Applicants must explain how to complete a 500 USDT trade.",
    "Applicants must describe how to execute a 500 USDT trade.",
    "Applicants must not complete a 500 USDT trade.",
    "Applicants must complete a 500 USDT transaction record.",
    "The software application costs 500 USDT to host.",
    "The mobile application costs 500 USDT.",
  ]) {
    const result = analyzeOpportunity({
      text: `Individual first prize 10,000 USDT. ${text}`,
    }, { now });
    assert.equal(result.decision, "eligible", text);
    assert.deepEqual(result.safety.severe_risks, [], text);
    assert.deepEqual(result.safety.capital_risks, [], text);
  }
});

test("rejects explicit cross-sentence payment-to-access traps", () => {
  for (const text of [
    "Send 500 USDT. Then claim the 10,000 USDT prize.",
    "Deposit 500 USDT. This unlocks access to the 10,000 USDT prize.",
    "Deposit 500 USDT. This unlocks the 10,000 USDT prize.",
    "Claim only after paying 500 USDT.",
    "You can claim once you have sent 500 USDT.",
    "A deposit of 500 USDT is required. This unlocks the 10,000 USDT prize.",
    "A payment of 500 USDT is required. Then claim the 10,000 USDT prize.",
    "An advance transfer of 500 USDT is required. This unlocks the 10,000 USDT prize.",
    "先支付500 USDT。然后领取10,000 USDT奖金。",
    "Pay\n500 USDT to unlock the 10,000 USDT prize.",
    "Send\n500 USDT.\nThen claim the 10,000 USDT prize.",
    "Pay 500 USDT. Winner can then access the award.",
    "Make a bank transfer of 500 USDT to claim the 10,000 USDT prize.",
    "A bank transfer of 500 USDT is required to claim the 10,000 USDT prize.",
    "Deposit 500 USDT to enter.",
    "Send 500 USDT to qualify.",
    "Pay 500 USDT to register.",
  ]) {
    const result = analyzeOpportunity({ text }, { now });
    assert.equal(result.decision, "reject", text);
    assert.ok(result.safety.severe_risks.includes("upfront_transfer"), text);
    assert.ok(result.safety.capital_risks.includes("deposit_required"), text);
  }
});

test("rejects direct capital, purchase, trading, membership, and balance requirements", () => {
  for (const text of [
    "A deposit is required.",
    "Deposit required before participation.",
    "Entry fee: 500 USDT.",
    "Pay an entry fee of 500 USDT to enter.",
    "Purchase 500 USDT of tokens to claim.",
    "Buy 500 USDT of tokens to claim.",
    "Trading is required.",
    "A paid membership is required.",
    "Starting balance 500 USDT required.",
    "Minimum balance 500 USDT required.",
    "Entry fee is 500 USDT.",
    "Registration fee: 500 USDT.",
    "You must pay 500 USDT to participate.",
    "Purchase a membership.",
    "Trade 500 USDT to qualify.",
    "Application fee of 500 USDT applies.",
    "Participation requires a payment of 500 USDT.",
    "A 500 USDT registration fee is required.",
    "Maintain a 500 USDT balance to qualify.",
    "Membership costs 500 USDT.",
    "You need to trade 500 USDT before entry.",
    "You must pay USD 500.",
    "Entry fee is USD 500.",
    "Registration fee: USD 500.",
    "You must pay USD 500, then claim the prize.",
    "Application costs 500 USDT.",
    "Applicants pay 500 USDT to apply.",
    "An entry fee applies: 500 USDT.",
    "Participants will be required to pay 500 USDT.",
    "A 500 USDT fee is payable on registration.",
    "Membership fee: 500 USDT.",
    "Applicants must complete a 500 USDT trade.",
  ]) {
    const result = analyzeOpportunity({
      text: `Individual first prize 10,000 USDT. ${text}`,
    }, { now });
    assert.equal(result.decision, "reject", text);
    assert.ok(result.safety.capital_risks.length > 0, text);
  }
});

test("keeps positive risk facts after a negated clause and structured risk flags", () => {
  const mixed = analyzeOpportunity({
    text: "Individual first prize 10,000 USDT. No deposit to enter, but pay 500 USDT first to claim.",
  }, { now });
  assert.equal(mixed.decision, "reject");
  assert.ok(mixed.safety.severe_risks.includes("upfront_transfer"));

  for (const text of [
    "Individual first prize 10,000 USDT. You do not need to pay to register yet winners must deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay to register although winners must deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay to register nevertheless winners must deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and must send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee: send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee — send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. Do not pay an entry fee and send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay to register while winners must deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay to register; on the other hand winners must deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and you will need to send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and winners are required to send 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and you have to deposit 500 USDT first to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and a payment of 500 USDT is required to claim.",
    "Individual first prize 10,000 USDT. You do not need to pay an entry fee and winners shall send 500 USDT first to claim.",
  ]) {
    const result = analyzeOpportunity({ text }, { now });
    assert.equal(result.decision, "reject", text);
    assert.ok(result.safety.severe_risks.includes("upfront_transfer"), text);
  }

  const structured = analyzeOpportunity({
    text: "Individual first prize 10,000 USDT. No deposit is required.",
    requires_deposit: true,
  }, { now });
  assert.equal(structured.decision, "reject");
  assert.ok(structured.safety.capital_risks.includes("deposit_required"));
});

test("detects credential requests split across a line break", () => {
  const result = analyzeOpportunity({
    text: "Individual first prize 10,000 USDT. 提供验证码\n和密码给我们。",
  }, { now });
  assert.equal(result.decision, "reject");
  assert.ok(result.safety.severe_risks.includes("credential_request"));
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

test("ignores implausibly long numeric tokens instead of parsing partial amounts", () => {
  const result = analyzeOpportunity({ text: `USD ${"9".repeat(5_000)}` }, { now });
  assert.equal(result.decision, "review");
  assert.deepEqual(result.payout.candidates, []);
});
