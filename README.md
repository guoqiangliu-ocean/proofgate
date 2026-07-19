# BountyGuard ASP

BountyGuard is a deterministic, read-only API for screening and comparing jobs,
grants, hackathons, and bounties. It separates an individual payout from a
headline pool, checks deadlines, identifies unavoidable human gates, and
rejects common capital-risk or credential-risk patterns.

It is designed as a free OKX.AI A2MCP endpoint. It never asks for a wallet,
private key, password, or payment, and it does not fetch arbitrary URLs.

## Run

```bash
npm test
npm start
```

The server listens on `127.0.0.1:8787` by default. Open that address in a
browser for the responsive demo UI. The interface is one self-contained HTML
file with inline CSS and JavaScript; it loads no third-party assets.

## API

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
- `POST /` — A2MCP-compatible JSON analysis.
- `POST /v1/analyze` — canonical JSON analysis endpoint.
- `POST /v1/compare` — deterministic 2–10 opportunity ranking.
- `POST /v1/checklist` — one-opportunity verification and stop checklist.
- `POST /v1/payout-audit` — individual payout and settlement-terms audit.
- `GET /schema` — service metadata and input schema.
- `GET /health` — health response.
- `OPTIONS *` — CORS preflight.

## Cloudflare Worker

`worker.mjs` uses the same `handleRequest` function and deterministic analysis
logic as the local Node server. `wrangler.toml` imports the self-contained HTML
demo as a text module. There are no bindings, secrets, wallet operations, or
external network calls.

Local Worker preview:

```bash
npx wrangler dev
```

Inspect the exact bundle without deploying:

```bash
npx wrangler deploy --dry-run --outdir dist
```

Deploy only after reviewing the dry run and authenticating the intended
Cloudflare account:

```bash
npx wrangler deploy
```

No Cloudflare login or deployment is performed by this project setup.

## Structure

- `lib/analyze.mjs` — deterministic opportunity analysis.
- `lib/compare.mjs` — validation and deterministic multi-opportunity ranking.
- `lib/checklist.mjs` — strict input validation and deterministic next-step checklist.
- `lib/payout-audit.mjs` — deterministic payout, timing, condition, and settlement audit.
- `lib/http-handler.mjs` — shared Fetch API request handler.
- `public/index.html` — single-file demo UI.
- `server.mjs` — local Node adapter.
- `worker.mjs` — Cloudflare Worker entrypoint.
- `wrangler.toml` — minimal Worker configuration.

## Safety boundary

- No external page fetching or arbitrary URL access.
- No trading, deposits, referrals, or wallet operations.
- No credentials, private keys, analytics, cookies, or persistent storage.
- No guarantee that a listing is genuine or that a user will be selected.
- Official source, sponsor identity, payout, deadline, jurisdiction, and tax
  treatment still require human verification.
