# ProofGate

ProofGate turns messy job, grant, hackathon, and bounty listings into an
evidence-led decision memo. A deterministic safety engine first separates
individual payouts from headline pools, checks deadlines, identifies normal
human gates, and rejects capital or credential risks. GPT-5.6 then turns that
locked analysis into a concise memo. Evidence gaps, safe next actions, and stop
conditions remain deterministic. The model can explain the decision; it cannot
override it.

ProofGate is a Work & Productivity project for OpenAI Build Week. It extends
the original deterministic BountyGuard engine with a new single-workflow UI,
the `POST /v1/decision-memo` endpoint, server-side Responses API integration,
strict structured output, evidence pointers, and adversarial model-boundary
tests.

The service never asks for a wallet, private key, password, deposit, or payment.
It does not fetch arbitrary URLs, move funds, trade, or guarantee that an
opportunity is legitimate.

## Architecture

```text
structured opportunity
        |
        v
deterministic BountyGuard engine ----> locked GO / VERIFY / STOP decision
        |                                      |
        +---- facts, reasons, limitations -----+
                                               v
                                 GPT-5.6 Responses API
                                               |
                                               v
                               pointer-backed decision memo
```

Only the server reads `OPENAI_API_KEY`. The browser never receives it.

## Run

`npm test` uses mocked model responses and never needs a network connection or
API key.

```bash
npm test
```

To use the GPT-5.6 decision memo locally, set the key only in the server
environment and start the app:

```powershell
$env:OPENAI_API_KEY = "your_key_here"
npm start
```

The server listens on `127.0.0.1:8787` by default. Open that address in a
browser for the responsive demo UI. The interface is one self-contained HTML
file with inline CSS and JavaScript; it loads no third-party assets.

Without `OPENAI_API_KEY`, the deterministic endpoints still work. The decision
memo endpoint fails safely with HTTP 503 and returns the deterministic analysis
instead of fabricating a model result.

## API

Create an evidence-linked GPT-5.6 memo:

```bash
curl -i -X POST http://127.0.0.1:8787/v1/decision-memo \
  -H "content-type: application/json" \
  -d '{"title":"Verified research award","reward":{"amount":10000,"currency":"USD"},"deadline":"2026-12-31T23:59:59Z","payment_terms":"First prize paid after winner verification.","evidence":"Official rules state an individual first prize.","obligations":"Registration and KYC if selected.","risk_signals":"None stated."}'
```

The server runs deterministic analysis first, sends only the normalized
opportunity plus that analysis to `gpt-5.6`, and requires strict JSON output.
The returned `decision` always comes from the deterministic engine.
Model-supplied evidence pointers must resolve to submitted or deterministic
data, and the server—not the model—renders each reference claim. Missing server
configuration returns 503; upstream or invalid model output returns 502; a
model timeout returns 504.

The original deterministic API remains available:

```bash
curl -i -X POST http://127.0.0.1:8787/v1/analyze \
  -H "content-type: application/json" \
  -d '{"text":"First prize: 10,000 USDT. Registration and KYC required.","deadline":"2026-12-31T23:59:59Z"}'
```

An empty POST returns service metadata with HTTP 200, as required for a free
OKX.AI A2MCP endpoint.

Compare 2 to 10 opportunities with one consistent target and an ordered list
of preferred currencies:

```bash
curl -i -X POST http://127.0.0.1:8787/v1/compare \
  -H "content-type: application/json" \
  -d '{"opportunities":[{"title":"A","single_payout":10000,"currency":"USDT"},{"title":"B","single_payout":7000,"currency":"USDC"}],"targetUsd":5000,"preferredCurrencies":["USDT","USDC"]}'
```

`opportunities` is required and must contain 2 to 10 JSON objects. Each object
accepts the same fields as `/v1/analyze`. `targetUsd` must be a positive finite
number when supplied. `preferredCurrencies` accepts 1 to 8 supported codes:
USDT, USDC, USDG, DAI, PYUSD, or USD. Invalid input returns HTTP 400.

Comparison order is deterministic:

1. Decision: eligible, review, reject.
2. Verified individual payout, descending.
3. Requested currency preference order.
4. Evidence quality: strong, partial, weak, none.
5. Severe risk count, then capital risk count, ascending.
6. Original source order as the final tie breaker.

Create an input-only verification checklist for one opportunity:

```bash
curl -i -X POST http://127.0.0.1:8787/v1/checklist \
  -H "content-type: application/json" \
  -d '{"opportunity":{"title":"Award","text":"First prize 10,000 USDT. Registration and KYC required.","deadline":"2026-07-27T23:59:59Z"},"targetUsd":5000,"preferredCurrencies":["USDT","USDC"]}'
```

The checklist returns deterministic `evidence_gaps`, `priority_checks`,
`safe_next_actions`, `stop_conditions`, `human_gates`, and `limitations`.
Deposit or advance-payment requirements, private-key or credential requests,
flash-USDT claims, trading-volume requirements, referrals, and paid membership
gates produce explicit stop conditions. The service does not fetch or verify
external pages and never guarantees legitimacy, selection, payment, income,
profit, or returns.

Audit the settlement terms for one opportunity:

```bash
curl -i -X POST http://127.0.0.1:8787/v1/payout-audit \
  -H "content-type: application/json" \
  -d '{"opportunity":{"text":"First prize 10,000 USDT. Payment within 30 days after winner announcement. KYC required."},"targetUsd":5000,"preferredCurrencies":["USDT","USDC"]}'
```

The payout audit distinguishes a verified individual amount from a headline
pool, reports requested-currency matching, extracts stated-but-unverified
payment timing and conditions, identifies KYC and account-owner gates, and
lists settlement risks and evidence gaps. Amounts classified as `risk_linked`
are explicitly excluded from personal payout. The audit is input-only and does
not authenticate the listing, payer, payment account, or settlement guarantee.

Routes:

- `GET /` — interactive demo UI.
- `POST /v1/decision-memo` — deterministic decision plus GPT-5.6 memo.
- `POST /` — A2MCP-compatible JSON analysis.
- `POST /v1/analyze` — canonical JSON analysis endpoint.
- `POST /v1/compare` — deterministic 2–10 opportunity ranking.
- `POST /v1/checklist` — one-opportunity verification and stop checklist.
- `POST /v1/payout-audit` — individual payout and settlement-terms audit.
- `GET /schema` — service metadata and input schema.
- `GET /health` — health response.
- `OPTIONS *` — CORS preflight.

## Cloudflare Worker

`worker.mjs` uses the same `handleRequest` function and analysis logic as the
local Node server. `wrangler.toml` imports the self-contained HTML demo as a
text module. Both adapters call GPT-5.6 only from the server side through the
official Responses API.

Local Worker preview:

```bash
npx wrangler dev
```

Inspect the exact bundle without deploying:

```bash
npx wrangler deploy --dry-run --outdir dist
```

Configure the server-side secret, review the dry run, and deploy from the
intended Cloudflare account:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

Never place the key in `wrangler.toml`, browser code, request JSON, screenshots,
or version control.

The Worker includes a best-effort eight-requests-per-minute, per-IP limiter.
Because isolate-local memory is not a complete abuse-control boundary, a public
deployment must also use a Cloudflare Rate Limiting/WAF rule (or equivalent)
and a hard OpenAI project budget. Do not rely on the in-code limiter alone.

## Structure

- `lib/analyze.mjs` — deterministic opportunity analysis.
- `lib/compare.mjs` — validation and deterministic multi-opportunity ranking.
- `lib/checklist.mjs` — strict input validation and deterministic next-step checklist.
- `lib/payout-audit.mjs` — deterministic payout, timing, condition, and settlement audit.
- `lib/decision-memo.mjs` — GPT-5.6 request, structured-output validation, and evidence locking.
- `lib/rate-limit.mjs` — best-effort per-isolate request limiter.
- `lib/http-handler.mjs` — shared Fetch API request handler.
- `public/index.html` — single-file demo UI.
- `server.mjs` — local Node adapter.
- `worker.mjs` — Cloudflare Worker entrypoint.
- `wrangler.toml` — minimal Worker configuration.

## Build Week development

ProofGate was developed during the 13–21 July 2026 submission window. The
starting point was the deterministic-only BountyGuard screening engine; an
earlier variant of that engine was also submitted to the OKX.AI track.
The OpenAI Build Week extension adds the ProofGate product workflow, the
GPT-5.6 decision-memo route, strict structured output, model-boundary
validation, Worker secret injection, and new adversarial tests.

| Earlier BountyGuard base | Build Week ProofGate extension |
|---|---|
| Four deterministic JSON workflows | One guided decision-memo workspace |
| Rule-engine output only | GPT-5.6 pointer-backed memo |
| No OpenAI API call | Server-side Responses API integration |
| Deterministic endpoint tests | Model-boundary, injection, and secret-leak tests |
| Original BountyGuard presentation | New ProofGate product and demo flow |

Codex was the primary implementation workspace. It helped decompose the product
into shared modules, extend the Node and Worker adapters, generate edge cases,
and run the complete test suite after each integration. The human-directed
product decisions were to:

- keep the final decision deterministic and inspectable;
- separate headline prize pools from individual payouts;
- distinguish normal registration or KYC gates from stop conditions;
- make evidence gaps and limitations visible; and
- fail closed if the server key, upstream response, or evidence mapping is
  invalid.

GPT-5.6 is used at runtime for the part that benefits from language reasoning:
turning the locked analysis and submitted evidence into a concise decision memo
with evidence pointers. The server renders those references, and the local
checklist owns all gaps, actions, and stop conditions. GPT-5.6 is not used as an
unreviewable classifier and cannot override a rejection.

The automated suite currently contains 76 tests. It covers deterministic
analysis, comparison, checklists, payout audits, server behavior, request-size
limits, missing-key handling, upstream errors, malicious or invalid structured
output, unsafe model instructions, evidence-claim rendering, decision
consistency, timeouts, rate limiting, and API-key non-disclosure. All model
tests use mocked fetch responses; a separate live smoke test requires a real
server-side API key.

## Safety boundary

- No external page fetching or arbitrary URL access.
- The only runtime egress is the server-side OpenAI Responses API call for the
  decision memo.
- No trading, deposits, referrals, or wallet operations.
- No user credentials, private keys, analytics, cookies, or persistent storage.
- The OpenAI API key stays in the server environment and is never accepted from
  the request body or returned to the client.
- GPT-5.6 cannot change the deterministic decision; invalid, inconsistent, or
  secret-bearing model output fails closed.
- GPT-5.6 cannot supply the final actions or stop conditions; those are
  overwritten with deterministic checklist output.
- No guarantee that a listing is genuine or that a user will be selected.
- Official source, sponsor identity, payout, deadline, jurisdiction, and tax
  treatment still require human verification.
