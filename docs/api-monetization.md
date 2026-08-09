# API monetization: the 402 gate (hybrid x402 + credits-backed keys)

Requests to `/api/*` that don't come from the app itself get **HTTP 402** with
an x402 payment challenge. External callers pay one of two ways (the hybrid,
decided 2026-08-09):

- **API key** (`x-api-key`) funded with credits — for regular integrators.
  1 credit = $1 = 1 USDC; default price is `$0.001`/request (env-tunable).
- **x402** (`X-PAYMENT` header) — anonymous per-request USDC payment via a
  facilitator. Off until a facilitator is configured; the 402 body still
  advertises the API-key path.

Code: `lib/api-gate.ts` (the gate, edge-safe), `middleware.ts` (wiring),
`server/routers/apiKeys.ts` (key management), `app/api/cron/api-credits-flush`
(ledger reconciliation), `db/api-keys.sql` (schema — applied to prod + dev
2026-08-09).

## What counts as "from the app" (passes free)

Checked in order, in `apiGate()`:

1. **Exempt paths**: `/api/auth`, `/api/cron`, `/api/webhooks`,
   `/api/captions/webhook`, `/api/ad`, `/api/client-log`. Same inventory as
   the "leave Bot Fight Mode OFF" list in CLAUDE.md — login (web + Expo),
   self-authed crons, every webhook provider, VAST/ad delivery, log sink.
2. **`x-gate-bypass` header** matching `API_GATE_BYPASS_SECRET` (or, unset,
   `CRON_SECRET`) — used by the uptime monitor's anonymous DB probe
   (`cron/src/monitor.ts`).
3. **Session cookie present** (better-auth; covers web and the Expo app).
   Presence only — route handlers still do real auth.
4. **`sec-fetch-site: same-origin|same-site`** — keeps signed-out
   PUBLIC_BROWSING and the widget/embed iframes working. Spoofable
   server-side; this gate monetizes, it does not secure.

`OPTIONS` (CORS preflight) always passes — it can't carry credentials.

## Rollout: off → log → enforce

`API_402_MODE` (default **off** — the gate is inert until this is set):

1. **`log`** — nothing blocks, nothing is charged. Would-be-402s print as
   `[api-gate] would gate METHOD /path key=… payment=… ua="…"` in worker logs
   (`wrangler tail`, or the CF dash). Run at least a day; anything legitimate
   in there means a missing exemption — fix before step 2.
2. **`enforce`** — 402s go live. **Before flipping**: redeploy the cron
   worker (`cd cron && wrangler deploy`) so the monitor sends the bypass
   header, or the down-detector's DB probe will 402 and page you.

Env (add to `.env.production`, update the `DOTENV_PRODUCTION` GitHub secret):

```
API_402_MODE=log                # off | log | enforce
API_402_PRICE_USD=0.001         # per request
API_GATE_SECRET=<openssl rand -hex 32>   # REQUIRED for keys; signs key ids
API_GATE_BYPASS_SECRET=         # optional; falls back to CRON_SECRET
X402_PAY_TO=                    # Solana USDC address (treasury) — enables x402
X402_NETWORK=solana
X402_FACILITATOR_URL=           # x402 facilitator base URL — enables settle
```

`API_GATE_SECRET` invalidates every issued key if rotated — rotating it is
"revoke all keys".

## How keys work

Format `wp_live_<id>.<sig>`, `sig = HMAC-SHA256(API_GATE_SECRET, id)` — the
edge gate verifies with **no lookup**. Plaintext is returned once by
`apiKeys.create` and never stored (DB keeps `sha256(key)`). Balances:

- **Redis** `apigate:bal:<id>` — live balance, decremented per request.
  `apigate:spent:<id>` accumulates spend; `apigate:revoked:<id>` blocks.
- **Postgres** `api_keys` — durable ledger. The hourly
  `api-credits-flush` cron folds spend into it, reseeds Redis balances lost
  to eviction, and re-asserts revocations.
- Redis outage **fails open** for signature-valid keys (drop micro-billing,
  don't 402 paying integrators) and **fails closed** for x402.

Funding is admin-only for now: `apiKeys.grant({keyId, amountUsd})` (role
`admin`). Self-serve USDC purchase + the developer portal
(developer.watchparty.xyz) are the follow-on work; wire purchases through the
same primitive.

## Verifying

```bash
# free: own site / session — expect normal response even in enforce
curl -s https://watchparty.xyz/api/trpc/trade.getFeed?batch=1&input=%7B%7D \
  -H 'sec-fetch-site: same-origin' | head -c 120

# billed: naked external call — expect 402 JSON with an x402 accepts array
curl -si 'https://watchparty.xyz/api/trpc/trade.getFeed?batch=1&input=%7B%7D' | head -20

# keyed: expect 200 and a balance decrement (apiKeys.list shows it)
curl -s 'https://watchparty.xyz/api/trpc/trade.getFeed?batch=1&input=%7B%7D' \
  -H 'x-api-key: wp_live_…'
```

## The developer portal

Lives in this repo at `app/(developer)/` — landing `/developer`, console
`/developer/console` (session-gated key management over the `apiKeys` router),
docs `/developer/docs`. **`developer.watchparty.xyz` needs no separate repo or
deploy**: `middleware.ts` rewrites that host onto the `/developer` tree (`/api`
is left alone so keys work identically on either host), and the cross-subdomain
session cookie (2026-08-06) signs the console in automatically. To light up the
subdomain: add the DNS record and attach `developer.watchparty.xyz` as a custom
domain on whichever worker currently serves `watchparty.xyz`
(`scripts/cf/attach-domains.mjs` — verify tRPC on the target first, per the
pooler-wedge postmortem). Until then the portal is fully live at
`watchparty.xyz/developer`.

## Known limits (v1, deliberate)

- `sec-fetch-site` and cookie **presence** are spoofable server-side — a
  determined freeloader can pass. The gate prices honest automation (the
  Helius-credit-burning kind); abuse-hardening is a different project.
- Flat per-request price. Per-route pricing (e.g. `/api/rpc` costing more)
  slots into `priceMicro()` when wanted.
- x402 facilitator is unchosen. Candidates: CDP's facilitator (Base +
  Solana), PayAI, Corbits. `X402_FACILITATOR_URL` + `X402_PAY_TO` is all it
  takes once picked.
