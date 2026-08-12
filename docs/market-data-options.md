# Market data: every coin, every chain

Decision doc for how watchparty gets candles, trades and live prices. Written
2026-08-02 after production charts were found blank for every coin.

## What's actually broken

Not the database. `coin_candles` holds 513 rows and answers in milliseconds;
swapping Postgres for PlanetScale would change nothing. The failure is
**ingest**, and it has one cause: every market read goes to GeckoTerminal *in
the request path*, from Cloudflare's shared egress IP, which GT limits per IP.

Measured, not assumed:

| test | result |
| --- | --- |
| GT from a laptop IP | HTTP 200 in **0.4s** |
| GT from the Worker | fails — this is why charts are blank |
| GT keyless, burst | throttles at call **#6** |
| GT keyless, paced 1 call/5s after a 3-min cooldown | first 429 at call **#7**, **~6 calls/min** sustained |

That last row is the important one. GT keyless is **~6 calls/min per IP**, not
the ~30 the code comments assume. It was re-measured after a long cooldown to
rule out a lingering penalty; the number held.

## The reframe that changes the budget

**You do not need candles for every coin. You need them for every coin someone
opens.** Dexscreener doesn't precompute charts for millions of tokens either —
it serves from its own indexed trades on request. Pre-syncing the long tail is
both impossible and pointless.

So the shape is:

1. **Hot set** — trending/tracked coins visible in the rails. Small, scheduled.
2. **On demand** — any coin someone actually opens: fetch once, store in
   `coin_candles`, then keep warm while it's being watched.
3. **Live** — only the coin currently on screen needs sub-minute updates.

At ~1,000 chart opens/day that's ~30k calls/month, which fits the *cheapest paid
tier of every provider below*. The ambition ("every coin, every chain") is a
statement about **coverage**, not about call volume.

## Options

### A. GeckoTerminal keyless, dedicated IP (Cloud Run)

Move the sync off Cloudflare into a Cloud Run job next to `services/phoenix/`
(Dockerfile + cloudbuild.yaml already exist, `gcloud` is authed to
`watchparty-ads`). Gets its own egress IP instead of a poisoned shared one.

- **Cost** $0 · **Chains** ~200 · **Live** no websockets
- **Ceiling ~6 calls/min = ~8,600/day.** A full refresh of today's 454 coins × 2
  tiers takes ~2.5 hours.
- **Verdict:** real improvement over today, but the ceiling is too low to call it
  "every coin, every chain". Viable only as a backfill trickle.

### B. CoinGecko on-chain (paid)

Code already supports this — `lib/coins/gecko-endpoint.ts` switches base URL and
header on `COINGECKO_API_KEY` / `COINGECKO_PLAN`. One env var to adopt.

- **Free Demo tier excludes on-chain endpoints** (confirmed on their pricing
  page), so the free key is useless for us.
- Basic $35 / 100k calls · Analyst $129 / 500k · Lite $499 / 2M
- **Unconfirmed:** which paid tier on-chain actually starts at. Their public
  pages list "Onchain Tokens/Pools" feature rows without resolving the boundary.
  **Verify on their dashboard before paying.**
- REST only — no bar websocket.

### C. Mobula — best coverage-per-dollar · **WIRED, behind a flag**

50+ chains. Has exactly the primitives we need: `/token/ohlcv-history`,
`/token/trades`, and websocket **bar** streams (`onTokenBarsUpdated`).

- Free $0 / 10k credits / 1 RPS / no WSS
- **Start-up $50 / 125k credits / 30 RPS / no WSS**
- Growth $400 / 1.25M / 50 RPS / **WSS included**
- Enterprise $750+ / unlimited / 500 RPS / WSS

**A GET to ohlcv-history costs 5 credits, not 1** (their docs, under Rate
Limit). So Start-up's 125k is **25,000 chart fetches/month, ~830/day** — not the
4,100 an earlier draft of this doc assumed. Fetch-on-open fits; polling never
did at any tier.

The decisive advantage over GT: Mobula keys OHLCV by **token address**, not by
pool. The GT path had to discover a pool first, and that lookup was itself what
failed in production. No pool means it works for a coin we've never seen on a
chain we've never indexed.

Implemented in `lib/coins/mobula.ts`, called from `lib/tokens/udf-datafeed`
after our own database and before GT. Controlled entirely by `MOBULA_API_KEY`:

- unset → inert, previous behaviour exactly
- `demo` → `demo-api.mobula.io`, no key, no billing (real data; testing only)
- `<key>` → `api.mobula.io`

Verified against the demo API on Solana, Base and Ethereum at 1m/1h/1d: bar
counts sane, OHLC invariants hold, timestamps sorted and in-range.

### D. Codex (ex-Defined.fi)

80–90 chains, charts, websockets, webhooks.

- Free $0 / 10k requests / 5 RPS
- Growth **$350** / 1M–10M requests / 300 RPS / websockets
- Overage $350 per additional 1M

Comparable to Mobula but the paid entry point is 7× higher ($350 vs $50).

### E. Birdeye

Solana-strong, multi-chain, OHLCV + websockets. **Could not verify pricing** —
their pricing page returns 403 to automated fetches. Check manually if the
others disappoint.

### F. Own the indexer

What Dexscreener actually does. No per-coin quota ever; cost scales with
*chains* you support, not coins.

- **Solana:** Helius webhooks — already wired (`lib/helius/webhook.ts`,
  `lib/wallet/user-trades-webhook.ts`) and already paid for. Parse swap events →
  build candles ourselves.
- **EVM:** subscribe to `Swap` logs per chain via an RPC provider.
- **Verdict:** the endgame, not the starting point. Solana-only until the EVM
  indexer exists, and that's real work.

## The credit math — RPS is not the constraint

Rate limits are a **burst** ceiling. The **monthly credit cap** is what actually
governs, and it rules out polling as a liveness strategy on any metered plan.

Mobula's ohlcv-history GET is **5 credits**, so Start-up's 125k/month is 25,000
chart fetches — ~830/day, ~0.6/minute:

| usage | credits/day | fits 125k/mo? |
| --- | --- | --- |
| ~800 chart opens/day, 1 fetch each | ~4,000 | yes, roughly the budget |
| polling ONE coin every 30s | 14,400 | blows the month in ~9 days |
| polling a visible coin every 2s | 216,000 | gone in under a day |

Caching matters more than it looks: the adapter buckets its cache key by TTL, so
N simultaneous viewers of one coin cost **one** fetch per window, not N.

Even Growth's 1.25M/month is only ~28 calls/minute averaged out. That's the
tell: **you cannot poll your way to live on a metered plan at any tier.** The
websockets bundled at Growth are the mechanism for liveness; credits are for
history. Any plan that reads "poll the visible coin every 2s over our own
Realtime" is wrong, and an earlier draft of this doc said exactly that.

## Recommendation

Split the two jobs, because they have different cost shapes.

**Coverage + history → Mobula Start-up ($50/mo).**
50+ chains, one call per chart open, stored into `coin_candles` and never
fetched twice. This is what fixes "charts never load," on every chain. Cheapest
entry that isn't crippled: Codex is $350, CoinGecko's free tier can't do
on-chain at all.

**~~Liveness → Helius~~. SUPERSEDED 2026-08-12 — liveness comes from the trades
the coin page already fetches.**

The plan below was to build bars from Helius swap events. It was implemented,
and then removed, because **Helius does not power the coin page** — that is the
provider split ([[mobula-vs-helius-billing]]): Helius is operations (RPC,
wallets, the user's own trade history), Mobula is market data.

Removing it cost nothing, because the replacement is free in the same way the
Helius one was:

- the coin page fetches Mobula trades every 30s for the table under the chart;
- those rows carry `marketAddress` and `baseTokenPriceUSD`;
- so `lib/coins/record-mobula-trades` writes them to `coin_trades` and projects
  `coin_candles`, which Supabase Realtime fans out to the open chart.

No extra request, every chain rather than Solana only, and it covers whatever
someone is looking at instead of the two or three coins a per-delivery budget
could afford. Solana AND EVM are live on this path; Mobula Growth ($400, WSS)
buys push for coins nobody currently has open — which is what alerts need, not
what the chart needs.

⚠️ It only worked once the READ path was fixed. `getUdfBars` served stored
candles whenever any existed, with no freshness check, so every chart in the app
was frozen at the minute it was first opened — invisible because the Helius tape
kept 33 pools genuinely fresh and those were the ones anyone looked at.

### Sequencing

1. ✅ Mobula key → adapter behind the existing `gtBase()`/`gtHeaders()` seam, so
   callers don't change.
2. ✅ On-demand backfill on chart open, stored to `coin_candles`.
3. ✅ Live bars projected from the coin page's own trades fetch
   (`lib/coins/record-mobula-trades`) → Supabase Realtime. Every chain, no
   extra request, and NOT Helius.
4. Alerts are the thing still waiting on push: the cluster/whale scanner reads
   `coin_trades`, which today only fills for coins someone has open plus the
   Helius tape. Mobula Growth's WSS (the `Tape` DO, built and dormant) is what
   closes that, not the chart.

## Not the answer

- **PlanetScale.** 513 rows, millisecond queries. The bottleneck is upstream
  ingest. Migrating also costs Supabase Realtime and the auth tables ported
  verbatim from the old app — removing the thing that makes data live to fix
  something the database never caused.
- **TanStack DB.** A client-side sync/cache. Makes rendering snappy once data is
  *in* Postgres; does nothing about data not arriving. Reasonable later for
  feeds and messages.
