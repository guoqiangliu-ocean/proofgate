import { analyzeOpportunity } from "./analyze.mjs";
import { parseSingleOpportunityRequest } from "./checklist.mjs";

const TIMING_RULES = [
  ["same_day", /\bsame[- ]day\b|\bwithin\s+24\s+hours?\b|当天|24\s*小时内/iu],
  ["within_period", /\bwithin\s+\d{1,3}\s+(?:business\s+)?(?:hours?|days?|weeks?|months?)\b|\d{1,3}\s*(?:小时|天|周|个月)内/iu],
  ["after_approval", /\bafter\s+(?:approval|review|verification)\b|审核后|验证后/iu],
  ["after_announcement", /\bafter\s+(?:the\s+)?(?:winner|award)\s+announcement\b|获奖公布后|结果公布后/iu],
  ["after_delivery", /\b(?:after|upon)\s+(?:delivery|completion|acceptance)\b|交付后|完成后|验收后/iu],
  ["milestone", /\bmilestone(?:s|[- ]based)?\b|里程碑/iu],
  ["recurring", /\b(?:weekly|monthly|quarterly|annual(?:ly)?)\b|按周|按月|按季度|按年/iu],
  ["immediate", /\bimmediate(?:ly)?\b|\binstant(?:ly)?\b|立即|即时/iu],
];

const CONDITION_RULES = [
  ["account_owner_match", /account\s+(?:holder|owner)|name\s+must\s+match|same[- ]name\s+account|本人账户|账户持有人|同名账户/iu],
  ["invoice_required", /\binvoice\b|发票/iu],
  ["contract_required", /sign(?:ed|ing)?\s+(?:a\s+)?contract|contract\s+signature|签署合同/iu],
  ["tax_form_required", /tax\s+form|\bW-?8BEN\b|\bW-?9\b|税务表|税务资料/iu],
  ["milestone_acceptance", /milestone|deliverable\s+acceptance|验收|里程碑/iu],
  ["winner_selection", /winner(?:s)?\s+(?:only|will)|selected\s+(?:winner|participant)|获奖者|入选者/iu],
];

const RISK_MESSAGES = {
  private_key_request: "Private-key, seed-phrase, or mnemonic request.",
  credential_request: "Password, one-time-code, or account-credential request.",
  flash_usdt: "Flash-USDT scam signal.",
  upfront_transfer: "Funds must be sent before access, release, or payout.",
  guaranteed_return: "Guaranteed income, profit, or return claim.",
  trading_required: "Payout or eligibility depends on trading volume or performance.",
  deposit_required: "Deposit, starting balance, refundable fee, or advance payment required.",
  referral_required: "Payout depends on referrals or recruited-user activity.",
  membership_purchase: "Paid membership or plan required before access.",
};

function normalizedText(opportunity) {
  return [opportunity.title, opportunity.text, opportunity.description, opportunity.terms]
    .filter((value) => typeof value === "string")
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function coded(code, message) {
  return { code, message };
}

function unique(items) {
  const seen = new Set();
  return items.filter(({ code }) => !seen.has(code) && seen.add(code));
}

function paymentTiming(text) {
  const signals = [];
  for (const [code, pattern] of TIMING_RULES) {
    const match = text.match(pattern);
    if (match) signals.push({ code, evidence: match[0].slice(0, 120) });
  }
  return {
    status: signals.length ? "stated_unverified" : "unspecified",
    signals,
  };
}

function paymentConditions(text, analysis) {
  const conditions = [];
  const humanGateMessages = {
    registration: "Registration is required.",
    identity_verification: "KYC or identity verification is required.",
    wallet_for_payment: "A payment-wallet address is required.",
    email: "An email address is required.",
    public_submission: "A public submission is required.",
  };
  for (const gate of analysis.human_gates) {
    conditions.push(coded(gate, humanGateMessages[gate] || gate));
  }
  for (const [code, pattern] of CONDITION_RULES) {
    if (pattern.test(text)) conditions.push(coded(code, code.replaceAll("_", " ")));
  }
  for (const code of [...analysis.safety.severe_risks, ...analysis.safety.capital_risks]) {
    if (RISK_MESSAGES[code]) conditions.push(coded(code, RISK_MESSAGES[code]));
  }
  return unique(conditions);
}

function settlementRisks(analysis, summary) {
  const risks = [];
  for (const code of [...analysis.safety.severe_risks, ...analysis.safety.capital_risks]) {
    if (RISK_MESSAGES[code]) risks.push(coded(code, RISK_MESSAGES[code]));
  }
  if (summary.excluded_risk_linked_amounts.length) {
    risks.push(coded("risk_linked_amounts_excluded", "Amounts tied to an advance-payment or access trap were excluded from individual payout."));
  }
  if (summary.pool_only) risks.push(coded("pool_not_individual", "Only a total pool is stated; it is not an individual payout."));
  if (!summary.verified_individual_payout) risks.push(coded("individual_payout_unverified", "No usable individual payout is verified."));
  if (summary.currency_match === false) risks.push(coded("currency_mismatch", "The verified payout currency is outside the requested preference list."));
  if (summary.payment_timing.status === "unspecified") risks.push(coded("payment_timing_unspecified", "Payment timing is not stated in the supplied terms."));
  return unique(risks);
}

function evidenceGaps(summary) {
  const gaps = [
    coded("official_source_unverified", "The service does not fetch or authenticate the official source, sponsor, or payer."),
    coded("payer_identity_unverified", "The legal payer and authority to make payment are not verified."),
  ];
  if (!summary.verified_individual_payout) gaps.push(coded("individual_payout_unverified", "The amount one participant can receive is not verified."));
  if (summary.pool_only) gaps.push(coded("pool_allocation_unverified", "The pool allocation and individual award schedule are missing."));
  if (summary.currency_match === false) gaps.push(coded("preferred_currency_not_confirmed", "Payment in a requested currency is not confirmed."));
  if (summary.payment_timing.status === "unspecified") gaps.push(coded("payment_timing_missing", "No settlement date or payment window is supplied."));
  if (!summary.payment_conditions.length) gaps.push(coded("payment_conditions_missing", "Conditions precedent to payment are not stated."));
  return gaps;
}

function verdictReasons(analysis, summary, decision) {
  const reasons = analysis.reason_codes.map((code) => coded(code, code.replaceAll("_", " ")));
  if (summary.pool_only) reasons.push(coded("total_pool_is_not_individual_payout", "A headline pool was not counted as personal compensation."));
  if (summary.excluded_risk_linked_amounts.length) reasons.push(coded("risk_linked_amounts_not_counted", "Risk-linked bait amounts were not counted as personal compensation."));
  if (summary.currency_match === true) reasons.push(coded("requested_currency_match", "The verified payout uses a requested currency."));
  if (summary.currency_match === false) reasons.push(coded("requested_currency_mismatch", "The payout currency does not match the requested list."));
  if (decision === "review" && analysis.decision === "eligible") reasons.push(coded("audit_requires_currency_review", "Analyzer eligibility was downgraded for payout-currency review."));
  return unique(reasons);
}

export function auditPayout(payload, options = {}) {
  const { opportunity, targetUsd, preferredCurrencies } = parseSingleOpportunityRequest(payload);
  const now = options.now instanceof Date ? options.now : new Date();
  const analysis = analyzeOpportunity({
    ...opportunity,
    target_min_usd: targetUsd,
    preferred_currency: preferredCurrencies[0],
  }, { now });
  const text = normalizedText(opportunity);
  const verified = analysis.payout.verified_max_single;
  const riskLinked = analysis.payout.candidates
    .filter((candidate) => candidate.classification === "risk_linked")
    .map(({ amount, currency, context }) => ({ amount, currency, context }));
  const poolOnly = !verified && analysis.payout.candidates.some((candidate) => candidate.classification === "pool");
  const currencyMatch = verified ? preferredCurrencies.includes(verified.currency) : null;
  const timing = paymentTiming(text);
  const conditions = paymentConditions(text, analysis);
  const payoutSummary = {
    verified_individual_payout: verified,
    currency_match: currencyMatch,
    pool_only: poolOnly,
    excluded_risk_linked_amounts: riskLinked,
    payment_timing: timing,
    payment_conditions: conditions,
  };
  const decision = analysis.decision === "eligible" && currencyMatch === false ? "review" : analysis.decision;
  const addedGates = conditions
    .map(({ code }) => code)
    .filter((code) => ["account_owner_match", "invoice_required", "contract_required", "tax_form_required"].includes(code));

  return {
    service: "BountyGuard Payout Audit",
    version: "1.0.0",
    generated_at: analysis.generated_at,
    decision,
    target: {
      minimum_usd: targetUsd,
      preferred_currencies: preferredCurrencies,
    },
    payout_summary: payoutSummary,
    settlement_risks: settlementRisks(analysis, payoutSummary),
    human_gates: [...new Set([...analysis.human_gates, ...addedGates])],
    evidence_gaps: evidenceGaps(payoutSummary),
    verdict_reasons: verdictReasons(analysis, payoutSummary, decision),
    limitations: [
      "Input-only deterministic audit; the service does not fetch, authenticate, or verify external pages, sponsors, payers, accounts, or claims.",
      "A verified-looking amount is not a guarantee of selection, settlement, payment, income, profit, or return.",
      "Confirm the official award schedule, payer identity, payment asset and network, settlement window, KYC, account-ownership, tax, and contract terms with human review.",
    ],
    analysis_snapshot: {
      analyzer_decision: analysis.decision,
      payout: analysis.payout,
      deadline: analysis.deadline,
      evidence_quality: analysis.evidence_quality,
      reason_codes: analysis.reason_codes,
      safety: analysis.safety,
    },
  };
}

export const payoutAuditServiceMetadata = {
  service: "BountyGuard Payout Audit",
  version: "1.0.0",
  description: "Audit one opportunity's individual payout, pool interpretation, settlement conditions, timing, gates, and risks.",
  mode: "free",
  endpoint: "POST /v1/payout-audit",
  input: {
    opportunity: "Required non-empty BountyGuard opportunity object",
    targetUsd: "Optional positive number; defaults to 5000",
    preferredCurrencies: "Optional array of 1 to 8 supported codes; defaults to [USDT]",
  },
  maximum_request_bytes: 65_536,
  external_url_fetching: false,
};
