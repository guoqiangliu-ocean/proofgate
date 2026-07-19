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

const MONEY_NUMBER = String.raw`(?<![\d,.])(?:\d{1,3}(?:,\d{3}){1,5}(?:\.\d{1,6})?|\d{1,18}(?:\.\d{1,6})?)(?!\d|[,.]\d)`;
const MONEY_WITH_CURRENCY = String.raw`(?:(?:USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP)\s*${MONEY_NUMBER}|${MONEY_NUMBER}\s*(?:USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP)|[$€£]\s*${MONEY_NUMBER})`;
const PAYMENT_ACTION = String.raw`\b(?:pay(?:s|ing)?|paid|send(?:s|ing)?|sent|transfer(?:s|red|ring)?|deposit(?:s|ed|ing)?|wire(?:s|d|ing)?|remit(?:s|ted|ting)?)\b`;
const ACCESS_ACTION = String.raw`\b(?:unlock(?:s|ed|ing)?|access(?:es|ed|ing)?|claim(?:s|ed|ing)?|release(?:d|s|ing)?|activate(?:d|s|ing)?|receive(?:d|s|ing)?\s+(?:(?:the|your)\s+)?(?:prize|award|reward|payout|funds?))\b`;
const ENTRY_ACTION = String.raw`\b(?:enter|participate|qualify|register|entry|participation|qualification|registration)\b`;
const BENEFIT_ACTION = String.raw`(?:${ACCESS_ACTION}|${ENTRY_ACTION})`;
const CLAUSE_GAP_40 = String.raw`[^.!?。；;\n]{0,40}`;
const CLAUSE_GAP_50 = String.raw`[^.!?。；;\n]{0,50}`;
const CLAUSE_GAP_60 = String.raw`[^.!?。；;\n]{0,60}`;
const CLAUSE_GAP_80 = String.raw`[^.!?。；;\n]{0,80}`;
const CLAUSE_GAP_120 = String.raw`[^.!?。；;\n]{0,120}`;
const NECESSITY_CUE = String.raw`(?:must|shall|should|need\s+to|will\s+need\s+to|have\s+to|has\s+to|(?:is|are|will\s+be)\s+required\s+to)`;
const NEGATED_TAIL_120 = String.raw`(?:(?!\b(?:but|however|except|unless|yet|although|though|while|nevertheless|nonetheless|whereas)\b|\bon\s+the\s+other\s+hand\b|\b(?:and|or)\s+(?:(?:you|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+)?${NECESSITY_CUE}\b|\b(?:you|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+${NECESSITY_CUE}\b|\b(?:a|an|the)\s+(?:payment|deposit|fee)\b${CLAUSE_GAP_40}\b(?:is|are)\s+required\b)[^.!?。；;,:—–\-\n]){0,120}`;
const NEGATED_DIRECT_TAIL_120 = String.raw`(?:(?!\b(?:and|but|however|except|unless|yet|although|though|while|nevertheless|nonetheless|whereas)\b|\bon\s+the\s+other\s+hand\b)[^.!?。；;,:—–\-\n]){0,120}`;
const NEGATED_RISK_ITEM = String.raw`(?:(?:entry|refundable|upfront|advance|minimum|security)\s+){0,3}(?:fees?|deposits?|payments?|transfers?|purchases?|trading(?:\s+(?:activity|volume))?|referrals?(?:\s+(?:volume|performance))?|memberships?|starting\s+equity|private\s*keys?|seed\s*phrases?|mnemonics?|passwords?|guaranteed\s+(?:returns?|profits?|income)|flash\s*usdt)`;
const NEGATED_RISK_LIST = String.raw`${NEGATED_RISK_ITEM}(?:\s*,\s*${NEGATED_RISK_ITEM}){0,8}(?:\s*,?\s*(?:or|and)\s+${NEGATED_RISK_ITEM})?`;
const NEGATED_RISK_PATTERNS = [
  new RegExp(String.raw`\bno\s+${NEGATED_RISK_LIST}(?:\s+of\s+${MONEY_WITH_CURRENCY})?(?:\s+requirements?)?(?:\s+(?:is|are)\s+(?:required|requested|needed|necessary|stated|promised))?\b`, "giu"),
  new RegExp(String.raw`\bthere\s+(?:is|are)\s+no\s+${NEGATED_RISK_LIST}(?:\s+of\s+${MONEY_WITH_CURRENCY})?\b`, "giu"),
  new RegExp(String.raw`\b${NEGATED_RISK_LIST}(?:\s+of\s+${MONEY_WITH_CURRENCY})?\s+(?:is|are)\s+not\s+(?:required|requested|needed|necessary|promised)\b`, "giu"),
  new RegExp(String.raw`\b${NEGATED_RISK_LIST}(?:\s+of\s+${MONEY_WITH_CURRENCY})?\s+(?:is|are)\s+(?:prohibited|forbidden|not\s+allowed|not\s+accepted)\b`, "giu"),
  /\beligibility\s+(?:is|are)\s+not\s+(?:based|dependent)\s+on\s+(?:trading|referral)\s+(?:volume|performance)\b/giu,
  /\b(?:trading|referral)\s+(?:volume|performance)\s+(?:does|do|will)\s+not\s+(?:affect|determine|influence)\s+(?:selection|eligibility|payout|ranking)\b/giu,
  /\b(?:trading|referral)\s+(?:volume|performance)\s+(?:is|are)\s+(?:irrelevant|not\s+relevant)\s+to\s+(?:selection|eligibility|payout|ranking)\b/giu,
  new RegExp(String.raw`\b(?:you|we|applicants?|candidates?|participants?|entrants?|users?|winners?|organizers?|sponsors?|the\s+service)\s+(?:do|does)\s+not\s+(?:need|have)\s+to\s+(?:buy|purchase|pay|send|deposit|trade|provide|share|disclose)\b${NEGATED_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b(?:(?:you|we|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+)?(?:must|should|need)\s+not\s+(?:pay|send|deposit|transfer|wire|remit|trade|buy|purchase)\b${NEGATED_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b(?:you|we|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+(?:(?:are|is)\s+not|will\s+(?:not|never)\s+be|won['’]t\s+be)\s+required\s+to\s+(?:pay|send|deposit|transfer|wire|remit|trade|buy|purchase)\b${NEGATED_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b(?:do\s+not|never)\s+(?:pay|send|deposit|transfer|wire|remit|trade|buy|purchase|share|provide|disclose|reveal|enter)\b${NEGATED_DIRECT_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b(?:don['’]t|avoid)\s+(?:pay|send|deposit|transfer|wire|remit|trade|buy|purchase|paying|sending|depositing|transferring|wiring|remitting|trading|buying|purchasing|sharing|providing|disclosing|revealing|entering|share|provide|disclose)\b${NEGATED_DIRECT_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b(?:we|organizers?|sponsors?|the\s+service)\s+(?:will\s+never|never|do(?:es)?\s+not)\s+(?:request|ask\s+for|require)\s+(?:a\s+|your\s+|any\s+)?${NEGATED_RISK_LIST}`, "giu"),
  new RegExp(String.raw`\b(?:we|organizers?|sponsors?|the\s+service)\s+don['’]t\s+(?:request|ask\s+for|require)\s+(?:a\s+|your\s+|any\s+)?${NEGATED_RISK_LIST}`, "giu"),
  new RegExp(String.raw`\b(?:you|we|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+(?:isn['’]t|aren['’]t)\s+required\s+to\s+(?:pay|send|deposit|transfer|wire|remit|trade|buy|purchase|provide|share|disclose)\b${NEGATED_TAIL_120}`, "giu"),
  new RegExp(String.raw`\b${NEGATED_RISK_LIST}\s+(?:is|are)\s+never\s+(?:requested|required|needed|collected)\b`, "giu"),
  /\bkeep\s+your\s+(?:private\s*key|seed\s*phrase|mnemonic|password)\s+(?:private|secret|safe)\b/giu,
  new RegExp(String.raw`\b(?:send|wire|transfer|pay)\s+${MONEY_WITH_CURRENCY}\s+to\s+(?:the\s+)?winner['’]s\s+(?:(?:verified|designated|registered|confirmed|nominated|same-name)\s+){0,2}(?:bank|account)\b`, "giu"),
  new RegExp(String.raw`\b(?:applicants?|candidates?|participants?|entrants?|users?|winners?)\s+(?:(?:are|were|will\s+be|can\s+be|may\s+be)\s+)?paid\s+${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}\bto\s+${ENTRY_ACTION}`, "giu"),
  new RegExp(String.raw`\bno\s+(?:applicants?|candidates?|participants?|entrants?|users?)\s+${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}\bto\s+${ENTRY_ACTION}`, "giu"),
  new RegExp(String.raw`\b(?:the\s+)?(?:organizer|sponsor|host|employer|client)\s+${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}\bto\s+${ENTRY_ACTION}`, "giu"),
  new RegExp(String.raw`\b(?:a|an|the)?\s*${MONEY_WITH_CURRENCY}\s+(?:application|participation|registration|entry|membership)?\s*fee\s+(?:is\s+)?payable\s+by\s+(?:the\s+)?(?:organizer|sponsor|host|employer|client)\b`, "giu"),
  new RegExp(String.raw`\b(?:application|participation|registration|entry|membership)\s+fee\s*(?::|is|of)?\s*${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}\b(?:is\s+)?(?:(?:fully|entirely)\s+)?(?:paid|covered|reimbursed)\s+by\s+(?:the\s+)?(?:organizer|sponsor|host|employer|client)\b`, "giu"),
  new RegExp(String.raw`\b(?:a|an|the)?\s*${MONEY_WITH_CURRENCY}\s+(?:application|participation|registration|entry|membership)?\s*fee${CLAUSE_GAP_40}\b(?:is\s+)?(?:payable|due)\s+(?:on|at|before|upon)\s+${ENTRY_ACTION}${CLAUSE_GAP_40}\bby\s+(?:the\s+)?(?:organizer|sponsor|host|employer|client)\b`, "giu"),
  /(?:请勿|不得)(?:提供|分享|发送)(?:任何)?(?:私钥|助记词|密码)/giu,
  /(?:无需|不需要|不要求)(?:任何)?(?:交易量|推荐量|充值|入金|押金|保证金|付款|支付)/giu,
  /交易量不影响(?:评选|选择|资格|排名|付款)/giu,
];

const CONDITIONAL_PAYMENT_PATTERN = new RegExp([
  String.raw`${PAYMENT_ACTION}${CLAUSE_GAP_40}\b(?:first|upfront|in\s+advance)\b`,
  String.raw`${PAYMENT_ACTION}${CLAUSE_GAP_120}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_120}(?:\bto\s+${BENEFIT_ACTION}|\bbefore\s+${BENEFIT_ACTION})`,
  String.raw`\bto\s+${ACCESS_ACTION}${CLAUSE_GAP_40},\s*(?:(?:you|participants?|entrants?|users?)\s+)?(?:must\s+)?${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}`,
  String.raw`${ACCESS_ACTION}${CLAUSE_GAP_40}\b(?:only\s+)?(?:after|once|upon)\b${CLAUSE_GAP_40}(?:(?:you|participants?|entrants?|users?)\s+)?${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}`,
  String.raw`\brefundable\b${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_60}\b(?:deposit|fee|payment)\b`,
  String.raw`\brefundable\s+(?:security\s+)?(?:deposit|fee|payment)\b${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}`,
  String.raw`\b(?:deposit|fee|payment)\b${CLAUSE_GAP_50}\brefundable\b${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}`,
  String.raw`先${CLAUSE_GAP_40}(?:支付|发送|转账|存入|充值)${CLAUSE_GAP_80}(?:USDT|USDC|USDG|DAI|美元|[$])${CLAUSE_GAP_80}(?:解锁|访问|领取|提现)`,
  String.raw`可退${CLAUSE_GAP_40}(?:押金|保证金|费用)${CLAUSE_GAP_80}(?:USDT|USDC|USDG|DAI|美元|[$])`,
].join("|"), "iu");

const SENTENCE_BREAK = String.raw`(?:[.!?。；;\n]\s*)+`;
const PAYMENT_SENTENCE_START = String.raw`(?:^|[.!?。；;\n]\s*)(?:(?:first|upfront|in\s+advance)\s+|(?:(?:you|participants?|entrants?|users?)\s+)?(?:must|need\s+to|required\s+to)\s+)?(?:pay|send|deposit|wire|remit|transfer)\b`;
const ACCESS_FOLLOWUP = String.raw`(?:(?:(?:then|next|afterward|afterwards|this|that|which)\s+)${CLAUSE_GAP_40}${ACCESS_ACTION}|(?:(?:(?:the\s+)?(?:winner|participant|entrant|user)|you)\s+(?:can|may|will)\s+then\s+)?(?:claim|unlock|access|receive\s+(?:(?:the|your)\s+)?(?:prize|award|reward|payout|funds?))\b${CLAUSE_GAP_40})`;
const CHINESE_ACCESS_FOLLOWUP = String.raw`(?:(?:(?:然后|随后|再|这(?:将|会)?)\s*)${CLAUSE_GAP_40}(?:解锁|访问|领取|提现)|(?:解锁|访问|领取|提现)${CLAUSE_GAP_40})`;
const REQUIRED_CAPITAL_PATTERN = new RegExp([
  String.raw`(?:\b(?:a|an|the)\s+)?(?:(?:refundable|upfront|advance|minimum|security)\s+)*(?:deposit|payment|fee)\s+of\s+${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}\b(?:is|are)\s+(?:required|needed|mandatory)\b`,
  String.raw`${MONEY_WITH_CURRENCY}\s+(?:(?:refundable|upfront|advance|minimum|security)\s+)*(?:deposit|payment|fee)${CLAUSE_GAP_40}\b(?:is|are)\s+(?:required|needed|mandatory)\b`,
  String.raw`(?:\b(?:a|an|the)\s+)?(?:(?:refundable|upfront|advance|minimum|security)\s+)*(?:deposit|entry\s+fee)\s+(?:is\s+)?(?:required|needed|mandatory)\b`,
  String.raw`\b(?:entry|registration)\s+fee\s*(?:of|:|is)\s*${MONEY_WITH_CURRENCY}`,
  String.raw`\b(?:application|participation)\s+fee\s*(?:of|:|is)\s*${MONEY_WITH_CURRENCY}(?:${CLAUSE_GAP_40}\bapplies\b)?`,
  String.raw`(?:^|[.!?。；;]\s*)\b(?:application|participation|registration|entry|membership)\s+(?:costs?|fees?)\s*(?::|is|are)?\s*${MONEY_WITH_CURRENCY}`,
  String.raw`\b(?:an?\s+)?(?:application|participation|registration|entry)\s+fee\s+applies\s*:\s*${MONEY_WITH_CURRENCY}`,
  String.raw`(?:\b(?:a|an|the)\s+)?${MONEY_WITH_CURRENCY}\s+(?:application|participation|registration|entry)\s+fee${CLAUSE_GAP_40}\b(?:is\s+)?(?:required|needed|mandatory|applies)\b`,
  String.raw`(?:\b(?:a|an|the)\s+)?${MONEY_WITH_CURRENCY}\s+(?:application|participation|registration|entry|membership)?\s*fee${CLAUSE_GAP_40}\b(?:is\s+)?(?:payable|due)\s+(?:on|at|before|upon)\s+${ENTRY_ACTION}`,
  String.raw`\bparticipation\s+requires${CLAUSE_GAP_40}(?:a\s+)?(?:payment|deposit|fee)\s+of\s+${MONEY_WITH_CURRENCY}`,
  String.raw`(?:\b(?:a|an|the)\s+)?(?:advance|upfront)\s+transfer\s+of\s+${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}\b(?:is\s+)?(?:required|needed|mandatory)\b`,
  String.raw`\bmaintain${CLAUSE_GAP_40}${MONEY_WITH_CURRENCY}\s+(?:balance|equity)${CLAUSE_GAP_80}\b(?:to|before)\s+${ENTRY_ACTION}`,
  String.raw`\b(?:starting|minimum)\s+(?:balance|equity)\s*(?:(?:of|:)\s*)?${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}\b(?:is\s+)?(?:required|needed|mandatory)\b`,
].join("|"), "iu");
const CAPITAL_TO_ACCESS_PATTERN = new RegExp([
  String.raw`${PAYMENT_ACTION}${CLAUSE_GAP_40}(?:an?\s+)?entry\s+fee${CLAUSE_GAP_40}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}(?:\bto\s+${BENEFIT_ACTION}|\bbefore\s+${BENEFIT_ACTION})`,
  String.raw`\b(?:buy|purchase)${CLAUSE_GAP_40}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}(?:of\s+)?(?:tokens?|crypto|coins?)${CLAUSE_GAP_80}(?:\bto\s+${ACCESS_ACTION}|\bbefore\s+${ACCESS_ACTION})`,
  String.raw`(?:\b(?:a|an|the)\s+)?(?:payment|deposit|fee)\s+of\s+${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}\b(?:is\s+)?required${CLAUSE_GAP_40}\bto\s+${BENEFIT_ACTION}`,
].join("|"), "iu");
const MANDATORY_PAYMENT_PATTERN = new RegExp(
  String.raw`(?:\b(?:you|applicants?|participants?|entrants?|users?|winners?)\s+${NECESSITY_CUE}|(?:^|[.!?。；;]\s*)${NECESSITY_CUE})\s+(?:${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}|pay${CLAUSE_GAP_40}(?:an?\s+)?entry\s+fee\b)`,
  "iu",
);
const DIRECT_ENTRY_PAYMENT_PATTERN = new RegExp(
  String.raw`\b(?:applicants?|candidates?|participants?|entrants?|users?)\s+${PAYMENT_ACTION}${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}\bto\s+(?:apply|submit|${ENTRY_ACTION})`,
  "iu",
);
const MANDATORY_TRADING_PATTERN = new RegExp(
  String.raw`(?:\b(?:you|applicants?|candidates?|participants?|entrants?|users?|winners?)\s+${NECESSITY_CUE}|(?:^|[.!?。；;]\s*)${NECESSITY_CUE})\s+(?:complete|make|execute|place)\s+(?:an?\s+)?${MONEY_WITH_CURRENCY}\s+trade\b(?![- ](?:analysis|simulation|exercise|example|case[- ]study|record|test)\b|\s+(?:in|on)\s+(?:a\s+)?(?:testnet|sandbox)\b|\s+using\s+(?:test|sandbox|simulated|paper)\s+(?:funds?|assets?)\b)`,
  "iu",
);
const CROSS_SENTENCE_PAYMENT_PATTERN = new RegExp([
  String.raw`${PAYMENT_SENTENCE_START}${CLAUSE_GAP_120}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}${SENTENCE_BREAK}${ACCESS_FOLLOWUP}`,
  String.raw`(?:^|[.!?。；;\n]\s*)(?:${REQUIRED_CAPITAL_PATTERN.source})${CLAUSE_GAP_40}${SENTENCE_BREAK}${ACCESS_FOLLOWUP}`,
  String.raw`(?:^|[.!?。；;\n]\s*)(?:先|必须|请)?(?:支付|付款|发送|转账|存入|充值)${CLAUSE_GAP_80}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_40}${SENTENCE_BREAK}${CHINESE_ACCESS_FOLLOWUP}`,
].join("|"), "iu");

const SEVERE_RISK_RULES = [
  ["private_key_request", /private\s*key|seed\s*phrase|mnemonic|助记词|私钥/iu],
  ["flash_usdt", /flash\s*usdt|闪兑\s*usdt|闪电\s*usdt/iu],
  ["upfront_transfer", new RegExp(String.raw`send\s+(?:funds?|money|crypto)\s+(?:first|upfront)|先(?:支付|转账|付款|充值)|upfront\s+(?:transfer|payment)|${MANDATORY_PAYMENT_PATTERN.source}|${DIRECT_ENTRY_PAYMENT_PATTERN.source}|${CAPITAL_TO_ACCESS_PATTERN.source}|${CONDITIONAL_PAYMENT_PATTERN.source}|${CROSS_SENTENCE_PAYMENT_PATTERN.source}`, "iu")],
  ["guaranteed_return", /guaranteed\s+(?:profit|return)|稳赚|保本高收益|guaranteed\s+income/iu],
  ["credential_request", /password\s+required|send\s+your\s+password|验证码[^.!?。；;]{0,80}发给|提供[^.!?。；;]{0,80}密码/iu],
];

const FINANCIAL_RISK_RULES = [
  ["trading_required", new RegExp(String.raw`must\s+trade|trading\s+(?:is\s+)?required|trading\s+volume|${MANDATORY_TRADING_PATTERN.source}|${NECESSITY_CUE}\s+trade${CLAUSE_GAP_40}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}(?:to|before)\s+${ENTRY_ACTION}|trade${CLAUSE_GAP_40}${MONEY_WITH_CURRENCY}${CLAUSE_GAP_80}(?:to|before)\s+${ENTRY_ACTION}|交易量|必须交易|pnl\s+(?:contest|leaderboard)|roi\s+leaderboard`, "iu")],
  ["deposit_required", new RegExp(String.raw`minimum\s+(?:deposit|equity)|deposit\s+at\s+least|至少(?:充值|入金)|starting\s+equity|${MANDATORY_PAYMENT_PATTERN.source}|${DIRECT_ENTRY_PAYMENT_PATTERN.source}|${REQUIRED_CAPITAL_PATTERN.source}|${CAPITAL_TO_ACCESS_PATTERN.source}|${CONDITIONAL_PAYMENT_PATTERN.source}|${CROSS_SENTENCE_PAYMENT_PATTERN.source}`, "iu")],
  ["referral_required", /referral\s+(?:volume|performance|required)|必须邀请|拉新|invite\s+users\s+to\s+trade/iu],
  ["membership_purchase", new RegExp(String.raw`(?:buy|purchase)\s+(?:a\s+)?membership|purchase\s+(?:a\s+)?plan|paid\s+membership\s+(?:is\s+)?required|membership\s+(?:costs?|fees?)\s*(?::|is|are)?\s*${MONEY_WITH_CURRENCY}|购买会员`, "iu")],
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
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n(?=\s*(?:reward|payment\s+terms|evidence(?:\s+submitted)?|obligations|risk\s+signals)\s*:)/giu, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function maskNegatedRiskLanguage(text) {
  return NEGATED_RISK_PATTERNS.reduce(
    (masked, pattern) => masked.replace(pattern, (match) => " ".repeat(match.length)),
    text,
  );
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
  const candidateKeys = new Set();
  const value = "(?<![\\d,.])(\\d{1,3}(?:,\\d{3}){1,5}(?:\\.\\d{1,6})?|\\d{1,18}(?:\\.\\d{1,6})?)(?!\\d|[,.]\\d)(?:\\s*)([kKmMbB])?";
  const currency = "(USDT0|USD[₮T]0|USDT|USDC|USDG|DAI|PYUSD|USD|EUR|GBP|[$€£])";
  const patterns = [
    new RegExp(`${currency}\\s*${value}`, "giu"),
    new RegExp(`${value}\\s*${currency}`, "giu"),
  ];

  for (const chunk of chunks) {
    const maskedChunk = maskNegatedRiskLanguage(chunk);
    const riskLinkedContext = CONDITIONAL_PAYMENT_PATTERN.test(maskedChunk)
      || CAPITAL_TO_ACCESS_PATTERN.test(maskedChunk)
      || REQUIRED_CAPITAL_PATTERN.test(maskedChunk);
    const poolContext = /total\s+(?:prize|reward)|prize\s+pool|reward\s+pool|总奖金|奖金池|总奖池/iu.test(chunk);
    const individualContext = /1st|first\s+prize|winner|payment|fixed|salary|monthly|annual|per\s+(?:month|year|project)|第一名|冠军|单项|固定(?:报酬|付款)/iu.test(chunk);
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
        const candidate = {
          amount,
          currency: mappedCurrency,
          context: chunk.slice(0, 240),
          classification: riskLinkedContext ? "risk_linked" : poolContext && !individualContext ? "pool" : individualContext ? "individual" : "unclear",
        };
        const candidateKey = `${candidate.amount}\u0000${candidate.currency}\u0000${candidate.context}`;
        if (!candidateKeys.has(candidateKey)) {
          candidateKeys.add(candidateKey);
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
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
  const riskText = maskNegatedRiskLanguage(text);
  const severeRisks = matchRules(riskText, SEVERE_RISK_RULES);
  const financialRisks = matchRules(riskText, FINANCIAL_RISK_RULES);
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
