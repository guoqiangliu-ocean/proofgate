const MAX_TEXT_LENGTH = 50_000;

const STABLECOINS = new Set([
  "USDT",
  "USD₮",
  "USD₮0",
  "USDT0",
  "USDC",
  "USDG",
  "DAI",
  "PYUSD",
]);

const CURRENCY_ALIASES = [
  ["USD₮0", /USD[₮T]0/giu],
  ["USDT", /\bUSDT\b|\bTETHER\b|USD₮(?!0)/giu],
  ["USDC", /\bUSDC\b/giu],
  ["USDG", /\bUSDG\b/giu],
  ["DAI", /\bDAI\b/giu],
  ["PYUSD", /\bPYUSD\b/giu],
  ["USD", /\bUSD\b|US\s*DOLLARS?|\$/giu],
  ["EUR", /\bEUR\b|€/giu],
  ["GBP", /\bGBP\b|£/giu],
];

const MONEY_WITH_CURRENCY = String.raw`(?:(?:USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP)\s*\d[\d,.]*|\d[\d,.]*\s*(?:USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP)|[$€£]\s*\d[\d,.]*)`;
const PAYMENT_ACTION = String.raw`\b(?:pay|send|transfer|deposit|wire|remit)\b`;
const ACCESS_ACTION = String.raw`\b(?:unlock(?:ed|ing)?|access(?:ed|ing)?|claim(?:ed|ing)?|receive(?:d|s|ing)?|release(?:d|s|ing)?|activate(?:d|s|ing)?)\b`;

const CONDITIONAL_PAYMENT_PATTERN = new RegExp([
  String.raw`${PAYMENT_ACTION}.{0,120}\b(?:first|upfront|in\s+advance)\b`,
  String.raw`${PAYMENT_ACTION}.{0,120}${MONEY_WITH_CURRENCY}.{0,120}(?:\bto\s+${ACCESS_ACTION}|\bbefore\s+${ACCESS_ACTION})`,
  String.raw`${ACCESS_ACTION}.{0,120}${PAYMENT_ACTION}.{0,120}${MONEY_WITH_CURRENCY}`,
  String.raw`\brefundable\b.{0,80}${MONEY_WITH_CURRENCY}.{0,60}\b(?:deposit|fee|payment)\b`,
  String.raw`\brefundable\s+(?:security\s+)?(?:deposit|fee|payment)\b.{0,80}${MONEY_WITH_CURRENCY}`,
  String.raw`\b(?:deposit|fee|payment)\b.{0,50}\brefundable\b.{0,80}${MONEY_WITH_CURRENCY}`,
  String.raw`先.{0,40}(?:支付|发送|转账|存入|充值).{0,80}(?:USDT|USDC|USDG|DAI|美元|[$]).{0,80}(?:解锁|访问|领取|提现)`,
  String.raw`可退.{0,40}(?:押金|保证金|费用).{0,80}(?:USDT|USDC|USDG|DAI|美元|[$])`,
].join("|"), "iu");

const SEVERE_RISK_RULES = [
  ["private_key_request", /private\s*key|seed\s*phrase|mnemonic|助记词|私钥/iu],
  ["flash_usdt", /flash\s*usdt|闪兑\s*usdt|闪电\s*usdt/iu],
  ["upfront_transfer", new RegExp(String.raw`send\s+(?:funds?|money|crypto)\s+(?:first|upfront)|先(?:转账|付款|充值)|upfront\s+(?:transfer|payment)|${CONDITIONAL_PAYMENT_PATTERN.source}`, "iu")],
  ["guaranteed_return", /guaranteed\s+(?:profit|return)|稳赚|保本高收益|guaranteed\s+income/iu],
  ["credential_request", /password\s+required|send\s+your\s+password|验证码.*发给|提供.*密码/iu],
];

const FINANCIAL_RISK_RULES = [
  ["trading_required", /must\s+trade|trading\s+volume|交易量|必须交易|pnl\s+(?:contest|leaderboard)|roi\s+leaderboard/iu],
  ["deposit_required", new RegExp(String.raw`minimum\s+(?:deposit|equity)|deposit\s+at\s+least|至少(?:充值|入金)|starting\s+equity|${CONDITIONAL_PAYMENT_PATTERN.source}`, "iu")],
  ["referral_required", /referral\s+(?:volume|performance|required)|必须邀请|拉新|invite\s+users\s+to\s+trade/iu],
  ["membership_purchase", /buy\s+(?:a\s+)?membership|purchase\s+(?:a\s+)?plan|购买会员/iu],
];

const HUMAN_GATE_RULES = [
  ["registration", /register|registration|sign\s*up|注册/iu],
  ["identity_verification", /\bKYC\b|identity\s+verification|verify\s+(?:your\s+)?identity|身份证明|身份验证/iu],
  ["wallet_for_payment", /wallet\s+address|compatible\s+wallet|收款地址|钱包地址/iu],
  ["email", /\bemail\b|邮箱/iu],
  ["public_submission", /submit|submission|提交/iu],
];

const AUTHORIZATION_RULES = [
  ["official_scope_mentioned", /in[- ]scope|scope\s+of\s+work|official\s+scope|授权范围|项目范围/iu],
  ["local_or_test_environment", /local\s+(?:environment|fork|test)|testnet|sandbox|本地环境|测试网/iu],
  ["production_testing_prohibited", /do\s+not\s+test\s+(?:on\s+)?production|production\s+testing\s+prohibited|禁止.*生产/iu],
  ["proof_required", /proof[- ]of[- ]concept|\bPoC\b|reproducible|可复现/iu],
];

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCurrency(value) {
  const upper = String(value || "").trim().toUpperCase();
  if (!upper) return null;
  if (/^USD[₮T]0$/.test(upper)) return "USD₮0";
  if (upper === "TETHER" || upper === "USD₮") return "USDT";
  return upper;
}

function parseNumber(raw) {
  const compact = String(raw).replace(/,/g, "").trim();
  const match = compact.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[
    (match[2] || "").toUpperCase()
  ] || 1;
  return Number.isFinite(base) ? base * multiplier : null;
}

function detectCurrencies(text, structuredCurrency) {
  const found = new Set();
  const normalized = normalizeCurrency(structuredCurrency);
  if (normalized) found.add(normalized);
  for (const [name, pattern] of CURRENCY_ALIASES) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) found.add(name);
  }
  if ([...found].some((item) => item !== "USD")) found.delete("USD");
  return [...found];
}

function sentenceChunks(text) {
  return text
    .split(/(?:\r?\n|[.!?。；;]|\s{2,})+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function amountCandidates(text) {
  const chunks = sentenceChunks(text);
  const candidates = [];
  const value = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(?:\\s*)([kKmMbB])?";
  const currency = "(USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP|[$€£])";
  const patterns = [
    new RegExp(`${currency}\\s*${value}`, "giu"),
    new RegExp(`${value}\\s*${currency}`, "giu"),
  ];

  for (const chunk of chunks) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of chunk.matchAll(pattern)) {
        const currencyFirst = /^(?:USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP|[$€£])/iu.test(match[0]);
        const currencyRaw = currencyFirst ? match[1] : match[3];
        const amountRaw = currencyFirst ? match[2] : match[1];
        const suffix = currencyFirst ? match[3] : match[2];
        const amount = parseNumber(`${amountRaw}${suffix || ""}`);
        const mappedCurrency =
          currencyRaw === "$" ? "USD" : currencyRaw === "€" ? "EUR" : currencyRaw === "£" ? "GBP" : normalizeCurrency(currencyRaw);
        if (amount === null) continue;
        const riskLinkedContext = CONDITIONAL_PAYMENT_PATTERN.test(chunk);
        const poolContext = /total\s+(?:prize|reward)|prize\s+pool|reward\s+pool|总奖金|奖金池|总奖池/iu.test(chunk);
        const individualContext = /1st|first\s+prize|winner|payment|fixed|salary|monthly|annual|per\s+(?:month|year|project)|第一名|冠军|单项|固定(?:报酬|付款)/iu.test(chunk);
        candidates.push({
          amount,
          currency: mappedCurrency,
          context: chunk.slice(0, 240),
          classification: riskLinkedContext ? "risk_linked" : poolContext && !individualContext ? "pool" : individualContext ? "individual" : "unclear",
        });
      }
    }
  }

  return candidates.filter((candidate, index, all) =>
    all.findIndex((other) =>
      other.amount === candidate.amount &&
      other.currency === candidate.currency &&
      other.context === candidate.context
    ) === index
  );
}

function structuredAmounts(opportunity) {
  const items = [];
  const currency = normalizeCurrency(opportunity.currency || opportunity.token || "USD");
  for (const [field, classification] of [
    ["single_payout", "individual"],
    ["reward", "individual"],
    ["max_reward", "individual"],
    ["total_pool", "pool"],
  ]) {
    const amount = Number(opportunity[field]);
    if (Number.isFinite(amount) && amount >= 0) {
      items.push({ amount, currency, context: `structured:${field}`, classification });
    }
  }
  return items;
}

function matchRules(text, rules) {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
}

function deadlineStatus(deadline, now) {
  if (!deadline) return { status: "unknown", iso: null };
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return { status: "invalid", iso: null };
  return {
    status: parsed.getTime() >= now.getTime() ? "open" : "expired",
    iso: parsed.toISOString(),
  };
}

function acceptedPayment(currency, preferredCurrency) {
  if (!currency) return false;
  if (currency === preferredCurrency) return true;
  return STABLECOINS.has(currency) || currency === "USD";
}

export function analyzeOpportunity(payload = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const opportunity = payload.opportunity && typeof payload.opportunity === "object"
    ? payload.opportunity
    : payload;
  const text = normalizeText(
    [opportunity.title, opportunity.text, opportunity.description, opportunity.terms]
      .filter(Boolean)
      .join("\n"),
  ).slice(0, MAX_TEXT_LENGTH);

  const targetMinUsd = Number(payload.target_min_usd ?? opportunity.target_min_usd ?? 5_000);
  const target = Number.isFinite(targetMinUsd) && targetMinUsd > 0 ? targetMinUsd : 5_000;
  const preferredCurrency = normalizeCurrency(
    payload.preferred_currency ?? opportunity.preferred_currency ?? "USDT",
  ) || "USDT";

  const amounts = [...structuredAmounts(opportunity), ...amountCandidates(text)];
  const individualAmounts = amounts.filter((item) => item.classification === "individual");
  const unclearAmounts = amounts.filter((item) => item.classification === "unclear");
  const usableAmounts = individualAmounts.length ? individualAmounts : unclearAmounts;
  const maxSingle = usableAmounts.reduce((best, item) => {
    if (!acceptedPayment(item.currency, preferredCurrency)) return best;
    return !best || item.amount > best.amount ? item : best;
  }, null);

  const currencies = detectCurrencies(text, opportunity.currency || opportunity.token);
  const severeRisks = matchRules(text, SEVERE_RISK_RULES);
  const financialRisks = matchRules(text, FINANCIAL_RISK_RULES);
  if (opportunity.requires_upfront_payment === true) severeRisks.push("upfront_transfer");
  if (opportunity.requires_trading === true) financialRisks.push("trading_required");
  if (opportunity.requires_deposit === true) financialRisks.push("deposit_required");

  const humanGates = matchRules(text, HUMAN_GATE_RULES);
  if (opportunity.kyc === true) humanGates.push("identity_verification");
  const authorizationSignals = matchRules(text, AUTHORIZATION_RULES);
  const deadline = deadlineStatus(opportunity.deadline, now);

  const reasonCodes = [];
  let decision = "review";
  if (severeRisks.length) {
    decision = "reject";
    reasonCodes.push("severe_scam_or_credential_risk");
  } else if (financialRisks.length) {
    decision = "reject";
    reasonCodes.push("capital_or_trading_required");
  } else if (deadline.status === "expired") {
    decision = "reject";
    reasonCodes.push("deadline_expired");
  } else if (!maxSingle) {
    reasonCodes.push(amounts.some((item) => item.classification === "pool") ? "only_total_pool_verified" : "single_payout_not_verified");
  } else if (maxSingle.amount < target) {
    decision = "reject";
    reasonCodes.push("single_payout_below_target");
  } else if (!acceptedPayment(maxSingle.currency, preferredCurrency)) {
    reasonCodes.push("payment_currency_not_supported");
  } else {
    decision = "eligible";
    reasonCodes.push(maxSingle.currency === preferredCurrency ? "preferred_currency_match" : "stable_value_payment_match");
    if (deadline.status === "unknown") reasonCodes.push("deadline_needs_verification");
  }

  const unique = (items) => [...new Set(items)];
  const evidenceQuality =
    text.length === 0 && amounts.length === 0
      ? "none"
      : individualAmounts.length && deadline.status !== "invalid"
        ? "strong"
        : amounts.length
          ? "partial"
          : "weak";

  return {
    service: "BountyGuard",
    version: "1.0.0",
    generated_at: now.toISOString(),
    decision,
    target: { minimum_usd: target, preferred_currency: preferredCurrency },
    payout: {
      verified_max_single: maxSingle,
      currencies_detected: currencies,
      candidates: amounts.slice(0, 20),
    },
    deadline,
    safety: {
      severe_risks: unique(severeRisks),
      capital_risks: unique(financialRisks),
      authorization_signals: unique(authorizationSignals),
    },
    human_gates: unique(humanGates),
    reason_codes: unique(reasonCodes),
    evidence_quality: evidenceQuality,
    limitations: [
      "Deterministic screening only; it does not fetch or authenticate external pages.",
      "A result marked eligible is a lead, not a guarantee of legitimacy, selection, or payment.",
      "Verify the official source, sponsor identity, exact individual payout, deadline, and jurisdiction before acting.",
    ],
  };
}

export const serviceMetadata = {
  service: "BountyGuard",
  version: "1.0.0",
  description: "Deterministic, read-only screening of jobs, grants, hackathons, and bounties for payout clarity, deadline, human gates, and avoidable capital risk.",
  mode: "free",
  endpoint: "POST /v1/analyze",
  input: {
    text: "Listing text or terms",
    title: "Optional title",
    deadline: "Optional ISO-8601 deadline",
    currency: "Optional structured currency",
    single_payout: "Optional structured individual payout",
    target_min_usd: "Optional threshold; defaults to 5000",
    preferred_currency: "Optional preferred currency; defaults to USDT",
  },
  example: {
    title: "Example bounty",
    text: "First prize: 10,000 USDT. Registration and identity verification may be required.",
    deadline: "2026-12-31T23:59:59Z",
  },
};
