import { analyzeOpportunity } from "./analyze.mjs";
import { CompareInputError, isPlainObject, normalizePreferences, normalizeTarget } from "./compare.mjs";

const TOP_LEVEL_FIELDS = new Set(["opportunity", "targetUsd", "preferredCurrencies"]);
const STRING_FIELDS = new Set([
  "title", "text", "description", "terms", "deadline", "currency", "token",
  "preferred_currency",
]);
const NUMBER_FIELDS = new Set([
  "single_payout", "reward", "max_reward", "total_pool", "target_min_usd",
]);
const BOOLEAN_FIELDS = new Set([
  "requires_upfront_payment", "requires_trading", "requires_deposit", "kyc",
]);
const OPPORTUNITY_FIELDS = new Set([...STRING_FIELDS, ...NUMBER_FIELDS, ...BOOLEAN_FIELDS]);

const STOP_MESSAGES = {
  private_key_request: "Stop immediately if anyone requests a private key, seed phrase, or mnemonic.",
  credential_request: "Stop immediately if anyone requests a password, one-time code, or account credential.",
  flash_usdt: "Stop: flash-USDT claims are treated as a scam signal.",
  upfront_transfer: "Stop before paying, sending, or depositing funds to unlock, access, or claim the opportunity.",
  guaranteed_return: "Stop if earnings, profit, or returns are guaranteed.",
  trading_required: "Stop if eligibility or payout depends on trading volume or trading performance.",
  deposit_required: "Stop if a deposit, refundable fee, starting balance, or advance payment is required.",
  referral_required: "Stop if compensation depends on referrals, recruited users, or their trading activity.",
  membership_purchase: "Stop if access requires buying a membership or paid plan.",
};

export function validateOpportunity(opportunity) {
  if (!isPlainObject(opportunity) || Object.keys(opportunity).length === 0) {
    throw new CompareInputError("opportunity must be a non-empty JSON object");
  }

  for (const [field, value] of Object.entries(opportunity)) {
    if (!OPPORTUNITY_FIELDS.has(field)) {
      throw new CompareInputError(`Unsupported opportunity field: ${field}`);
    }
    if (STRING_FIELDS.has(field)) {
      if (typeof value !== "string" || !value.trim()) {
        throw new CompareInputError(`opportunity.${field} must be a non-empty string`);
      }
    } else if (NUMBER_FIELDS.has(field)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new CompareInputError(`opportunity.${field} must be a finite non-negative number`);
      }
    } else if (BOOLEAN_FIELDS.has(field) && typeof value !== "boolean") {
      throw new CompareInputError(`opportunity.${field} must be a boolean`);
    }
  }

  if (opportunity.deadline && Number.isNaN(new Date(opportunity.deadline).getTime())) {
    throw new CompareInputError("opportunity.deadline must be a valid ISO-8601 date-time");
  }
}

export function parseSingleOpportunityRequest(payload) {
  if (!isPlainObject(payload)) throw new CompareInputError("Request body must be a JSON object");
  for (const field of Object.keys(payload)) {
    if (!TOP_LEVEL_FIELDS.has(field)) throw new CompareInputError(`Unsupported request field: ${field}`);
  }
  validateOpportunity(payload.opportunity);
  return {
    opportunity: payload.opportunity,
    targetUsd: normalizeTarget(payload.targetUsd),
    preferredCurrencies: normalizePreferences(payload.preferredCurrencies),
  };
}

function item(code, message, priority = "high") {
  return { code, priority, message };
}

function uniqueByCode(items) {
  const seen = new Set();
  return items.filter(({ code }) => !seen.has(code) && seen.add(code));
}

function buildEvidenceGaps(analysis) {
  const gaps = [
    item("official_source_unverified", "The service does not fetch or authenticate the official listing or sponsor."),
  ];
  if (!analysis.payout.verified_max_single) {
    gaps.push(item("individual_payout_unverified", "A personal payout meeting the target is not verified from the supplied evidence."));
  }
  if (!analysis.payout.currencies_detected.length) {
    gaps.push(item("payment_currency_unverified", "The payment currency is not established.", "medium"));
  }
  if (analysis.deadline.status === "unknown") {
    gaps.push(item("deadline_missing", "No verifiable deadline was supplied.", "medium"));
  }
  if (analysis.evidence_quality === "none" || analysis.evidence_quality === "weak") {
    gaps.push(item("listing_terms_incomplete", "The supplied terms are too limited for a strong evidence assessment."));
  }
  return gaps;
}

function buildPriorityChecks(analysis, gaps) {
  const checks = [];
  if (gaps.some(({ code }) => code === "official_source_unverified")) {
    checks.push(item("verify_official_source", "Independently open the organizer's official domain and confirm the listing and sponsor."));
  }
  if (!analysis.payout.verified_max_single) {
    checks.push(item("confirm_individual_payout", "Confirm the exact amount one selected participant can receive, not only the total pool."));
  }
  if (analysis.deadline.status !== "open") {
    checks.push(item("confirm_deadline", "Confirm the deadline, time zone, and whether submissions are still accepted."));
  }
  checks.push(item("confirm_eligibility", "Confirm jurisdiction, residency, team-size, KYC, tax, and intellectual-property terms.", "medium"));
  checks.push(item("confirm_payment_terms", "Confirm the payment asset, network, payer, settlement timing, and whether any fee is deducted.", "medium"));
  return uniqueByCode(checks);
}

function buildStopConditions(analysis) {
  const stops = [];
  for (const code of analysis.safety.severe_risks) {
    if (STOP_MESSAGES[code]) stops.push(item(code, STOP_MESSAGES[code], "critical"));
  }
  for (const code of analysis.safety.capital_risks) {
    if (STOP_MESSAGES[code]) stops.push(item(code, STOP_MESSAGES[code], "critical"));
  }
  if (analysis.deadline.status === "expired") {
    stops.push(item("deadline_expired", "Stop work unless the organizer officially confirms an extension.", "high"));
  }
  if (analysis.reason_codes.includes("single_payout_below_target")) {
    stops.push(item("below_target", "Stop for this target if the verified individual payout remains below the requested minimum.", "medium"));
  }
  return uniqueByCode(stops);
}

function buildSafeNextActions(analysis, stops) {
  if (stops.length) {
    return [
      item("pause_engagement", "Do not pay, trade, connect a wallet, or provide credentials; pause the opportunity."),
      item("preserve_evidence", "Keep a local copy of the supplied terms and the stop-condition evidence.", "medium"),
      item("use_official_reporting", "If appropriate, report the listing only through the platform's official abuse channel.", "medium"),
    ];
  }

  const actions = [
    item("verify_before_applying", "Complete the priority checks using official sources before investing substantial work."),
    item("keep_secrets_private", "Never provide passwords, one-time codes, private keys, seed phrases, or advance payments."),
  ];
  if (analysis.human_gates.length) {
    actions.push(item("prepare_human_gates", "Let the account owner complete registration, KYC, submission, and payout details only when required.", "medium"));
  }
  actions.push(item("document_terms", "Save the confirmed rules, payout terms, deadline, and submission receipt.", "medium"));
  return actions;
}

export function createChecklist(payload, options = {}) {
  const { opportunity, targetUsd, preferredCurrencies } = parseSingleOpportunityRequest(payload);
  const now = options.now instanceof Date ? options.now : new Date();
  const analysis = analyzeOpportunity({
    ...opportunity,
    target_min_usd: targetUsd,
    preferred_currency: preferredCurrencies[0],
  }, { now });

  const evidenceGaps = buildEvidenceGaps(analysis);
  const stopConditions = buildStopConditions(analysis);

  return {
    service: "BountyGuard Checklist",
    version: "1.0.0",
    generated_at: analysis.generated_at,
    decision: analysis.decision,
    evidence_gaps: evidenceGaps,
    priority_checks: buildPriorityChecks(analysis, evidenceGaps),
    safe_next_actions: buildSafeNextActions(analysis, stopConditions),
    stop_conditions: stopConditions,
    human_gates: analysis.human_gates,
    analysis_snapshot: {
      target: analysis.target,
      payout: analysis.payout,
      deadline: analysis.deadline,
      evidence_quality: analysis.evidence_quality,
      reason_codes: analysis.reason_codes,
      safety: analysis.safety,
    },
    limitations: [
      "Input-only deterministic guidance; the service does not fetch, authenticate, or verify external pages, sponsors, identities, or claims.",
      "No result guarantees legitimacy, eligibility, selection, payment, profit, income, or return.",
      "Human review of official rules, jurisdiction, KYC, tax, intellectual-property, and payment terms remains required.",
    ],
  };
}

export const checklistServiceMetadata = {
  service: "BountyGuard Checklist",
  version: "1.0.0",
  description: "Create a deterministic verification and stop-condition checklist for one opportunity.",
  mode: "free",
  endpoint: "POST /v1/checklist",
  input: {
    opportunity: "Required non-empty BountyGuard opportunity object",
    targetUsd: "Optional positive number; defaults to 5000",
    preferredCurrencies: "Optional array of 1 to 8 supported codes; defaults to [USDT]",
  },
  maximum_request_bytes: 65_536,
  external_url_fetching: false,
};
