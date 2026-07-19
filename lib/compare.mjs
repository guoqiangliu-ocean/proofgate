import { analyzeOpportunity } from "./analyze.mjs";

const MIN_OPPORTUNITIES = 2;
const MAX_OPPORTUNITIES = 10;
const MAX_TARGET_USD = 1_000_000_000_000;
const MAX_PREFERENCES = 8;
const SUPPORTED_PREFERENCES = new Set([
  "USDT",
  "USDC",
  "USDG",
  "DAI",
  "PYUSD",
  "USD",
]);

const DECISION_WEIGHT = { eligible: 2, review: 1, reject: 0 };
const EVIDENCE_WEIGHT = { strong: 3, partial: 2, weak: 1, none: 0 };

export class CompareInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "CompareInputError";
    this.status = 400;
  }
}

export function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizePreferences(value) {
  if (value === undefined) return ["USDT"];
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PREFERENCES) {
    throw new CompareInputError("preferredCurrencies must contain 1 to 8 supported currency codes");
  }

  const normalized = value.map((item) => {
    if (typeof item !== "string") {
      throw new CompareInputError("preferredCurrencies must contain only strings");
    }
    const currency = item.trim().toUpperCase();
    if (!SUPPORTED_PREFERENCES.has(currency)) {
      throw new CompareInputError(`Unsupported preferred currency: ${currency || "(empty)"}`);
    }
    return currency;
  });
  return [...new Set(normalized)];
}

export function normalizeTarget(value) {
  if (value === undefined) return 5_000;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_TARGET_USD) {
    throw new CompareInputError("targetUsd must be a finite number greater than 0 and at most 1000000000000");
  }
  return value;
}

function opportunityTitle(item, index) {
  const source = isPlainObject(item.opportunity) ? item.opportunity : item;
  if (typeof source.title !== "string" || !source.title.trim()) return `Opportunity ${index + 1}`;
  return source.title.replace(/\s+/gu, " ").trim().slice(0, 160);
}

function rankingFactors(analysis, preferences) {
  const verified = analysis.payout && analysis.payout.verified_max_single;
  const currency = verified && verified.currency;
  const preferenceIndex = currency ? preferences.indexOf(currency) : -1;
  const severeRiskCount = analysis.safety && analysis.safety.severe_risks
    ? analysis.safety.severe_risks.length
    : 0;
  const capitalRiskCount = analysis.safety && analysis.safety.capital_risks
    ? analysis.safety.capital_risks.length
    : 0;

  return {
    decision_weight: DECISION_WEIGHT[analysis.decision] ?? -1,
    verified_single_payout: verified && Number.isFinite(verified.amount) ? verified.amount : 0,
    payout_currency: currency || null,
    preferred_currency_match: preferenceIndex >= 0,
    preferred_currency_order: preferenceIndex >= 0 ? preferenceIndex : preferences.length,
    evidence_weight: EVIDENCE_WEIGHT[analysis.evidence_quality] ?? -1,
    severe_risk_count: severeRiskCount,
    capital_risk_count: capitalRiskCount,
  };
}

function compareRanked(left, right) {
  const a = left.ranking_factors;
  const b = right.ranking_factors;
  return (
    b.decision_weight - a.decision_weight ||
    b.verified_single_payout - a.verified_single_payout ||
    Number(b.preferred_currency_match) - Number(a.preferred_currency_match) ||
    a.preferred_currency_order - b.preferred_currency_order ||
    b.evidence_weight - a.evidence_weight ||
    a.severe_risk_count - b.severe_risk_count ||
    a.capital_risk_count - b.capital_risk_count ||
    left.source_index - right.source_index
  );
}

export function compareOpportunities(payload, options = {}) {
  if (!isPlainObject(payload)) {
    throw new CompareInputError("Request body must be a JSON object");
  }
  if (!Array.isArray(payload.opportunities)) {
    throw new CompareInputError("opportunities must be an array containing 2 to 10 objects");
  }
  if (payload.opportunities.length < MIN_OPPORTUNITIES || payload.opportunities.length > MAX_OPPORTUNITIES) {
    throw new CompareInputError("opportunities must contain 2 to 10 objects");
  }
  payload.opportunities.forEach((item, index) => {
    if (!isPlainObject(item)) {
      throw new CompareInputError(`opportunities[${index}] must be a JSON object`);
    }
  });

  const targetUsd = normalizeTarget(payload.targetUsd);
  const preferredCurrencies = normalizePreferences(payload.preferredCurrencies);
  const now = options.now instanceof Date ? options.now : new Date();

  const ranked = payload.opportunities.map((item, sourceIndex) => {
    const analysis = analyzeOpportunity({
      ...item,
      target_min_usd: targetUsd,
      preferred_currency: preferredCurrencies[0],
    }, { now });
    return {
      source_index: sourceIndex,
      title: opportunityTitle(item, sourceIndex),
      analysis,
      ranking_factors: rankingFactors(analysis, preferredCurrencies),
    };
  }).sort(compareRanked);

  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });

  const decisions = { eligible: 0, review: 0, reject: 0 };
  for (const item of ranked) decisions[item.analysis.decision] += 1;

  return {
    service: "BountyGuard Compare",
    version: "1.0.0",
    generated_at: now.toISOString(),
    criteria: {
      target_usd: targetUsd,
      preferred_currencies: preferredCurrencies,
      sort_order: [
        "decision: eligible, review, reject",
        "verified individual payout: descending",
        "preferred currency: requested order",
        "evidence quality: strong, partial, weak, none",
        "severe risk count: ascending",
        "capital risk count: ascending",
        "source order: ascending",
      ],
    },
    summary: {
      total: ranked.length,
      ...decisions,
      best_source_index: ranked[0].source_index,
    },
    ranking: ranked,
  };
}

export const compareServiceMetadata = {
  service: "BountyGuard Compare",
  version: "1.0.0",
  description: "Deterministically analyze and rank 2 to 10 opportunities without fetching external URLs.",
  mode: "free",
  endpoint: "POST /v1/compare",
  input: {
    opportunities: "Required array of 2 to 10 BountyGuard analyze-input objects",
    targetUsd: "Optional positive number; defaults to 5000",
    preferredCurrencies: "Optional array of 1 to 8 supported codes; defaults to [USDT]",
  },
  supported_preferred_currencies: [...SUPPORTED_PREFERENCES],
  maximum_request_bytes: 65_536,
};
