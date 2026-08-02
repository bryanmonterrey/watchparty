# Live charts — owning the candles

Plan for making `/coin/<address>` charts fast, reliable, and eventually live,
by storing OHLCV ourselves instead of proxying GeckoTerminal per request.

Written 2026-08-02, after diagnosing why charts were blank in production.

---

## The problem, measured

Charts were blank on prod and instant locally, with identical code and inputs.

- `/api/udf/history` from a laptop → bars.
- The same call from the Cloudflare Worker → `no_data`.
- A local probe warmed Upstash; prod immediately served `s: "ok"` from the same
  Redis. **The code was never wrong — the Worker cannot reach GeckoTerminal.**

GT rate-limits by IP. The Worker's egress is a shared Cloudflare address, and
our own crons already draw on a ~30 calls/minute free tier. Earlier the failure
surfaced literally as `errmsg: "ohlcv 429"`.

Two structural facts follow:

1. **Read cost scales with `users × requests`** against someone else's limit.
   It degrades exactly when traffic arrives.
2. **Workers are request-scoped.** They cannot hold a subscription open, so
   there is nowhere for a live stream to live.

Mitigations already shipped (`1363869`): stale-while-revalidate on bars (6h
serveable), failures never cached, `errmsg` preserved. Those stop the bleeding.
They do not remove the dependency.

## What the competition actually does

fomo, Dexscreener, Photon and friends own the ingest. One process subscribes to
the chain, writes to their own store, and **pushes** to browsers over a socket.
One upstream subscription per pool fans out to thousands of clients — cost is
`O(pools)`, not `O(users × requests)`. Nothing polls a third party on the read
path.

**We already do this one table over.** `trending_coins` is cron-synced into our
own Postgres, which is why the trending board is fast and never rate-limits. The
alerts rail is genuinely live over Supabase Realtime
(`lib/supabase/realtime-client.ts`). Candles are the one thing we never wrote
down — the chart is the outlier, not the norm.

So this is not new architecture. It is applying the pattern already in the repo
to one more table.

---

## Phase 0 — own the read path

**Goal: no GeckoTerminal call on any chart read. Everything else is optional.**

New table, keyed to the pool rather than the token: a token can have several
pools, and the candle series belongs to the market, not the asset.

```sql
CREATE TABLE coin_candles (
    network      text        NOT NULL,
    pool_address text        NOT NULL,
    resolution   text        NOT NULL,   -- '1' | '60' | '1D' (see tiers)
    ts           bigint      NOT NULL,   -- bar open, unix seconds
    o double precision NOT NULL,
    h double precision NOT NULL,
    l double precision NOT NULL,
    c double precision NOT NULL,
    v double precision,
    PRIMARY KEY (network, pool_address, resolution, ts)
);
CREATE INDEX coin_candles_series_idx
    ON coin_candles (network, pool_address, resolution, ts DESC);
```

**Store three tiers, derive the rest.** `1`, `60`, `1D`. TradingView asks for
7 resolutions (`SUPPORTED_RESOLUTIONS`); storing all seven multiplies write cost
for no benefit, because 5m/15m/4h/12h are exact aggregates of a stored tier.
`getUdfBars` rolls them up in SQL (`date_trunc`-style bucketing on `ts`).

**Retention matters more than it looks.** 1m candles are 1,440 rows/pool/day. At
~200 tracked pools that is ~288k rows/day. Keep 1m for 7 days, 1h for 90, 1D
forever; a prune step in the same cron.

Read path becomes: `getUdfBars` → Postgres → done. GT stays only as the
**backfill** source, never on the request path.

**Ship gate:** `/api/udf/history` never calls GT, and the Worker's inability to
reach it becomes irrelevant to whether a chart renders.

## Phase 1 — fill it

Extend the existing sweep rather than adding a cron. `app/api/cron/trending-sync`
already runs per minute with a `CallBudget` and `NETWORKS_PER_PASS = 4`
slicing, and `runTrendingSync` already knows how to spend a budget without
tripping the limiter. Candles are one more thing it writes.

- **Priority order:** coins on the trending board, then `tracked_tokens`, then
  `coin_index` rows someone actually opened. A coin nobody has looked at does
  not need a candle history.
- **Incremental:** store the newest `ts` per series and ask GT only for bars
  after it. A backfill is one call; steady state is one call per pool per
  interval, and most return a single new bar.
- **Budget-aware:** reuse `CallBudget`. If GT rate-limits, the pass stops and
  the next one resumes — the chart still reads from Postgres either way, which
  is the whole point of doing Phase 0 first.

**Ship gate:** a coin opened twice an hour apart shows a moving chart with zero
GT calls on the read path.

## Phase 2 — make it live

Candles land in Postgres, and Supabase Realtime already broadcasts Postgres
changes — the alerts rail is proof. A client subscribes filtered to its pool and
receives new bars as they are written.

**No Durable Object needed for this.** I suggested one earlier; on inspection it
would be premature. A 1m candle per pool per minute across ~200 pools is ~200
writes/minute, which Realtime handles without noticing, and the subscription
plumbing already exists. Adding a DO here would be new infrastructure to
replicate something already running.

Client side: `TokenTradingViewChart` gets a `subscribeBars` implementation (the
UDF datafeed's real-time hook, currently unused) that feeds Realtime rows to the
widget instead of the library's 30s poll.

**Ship gate:** an open chart advances without a refetch.

## Phase 3 — tick-level, only if warranted

Phases 0–2 give minute granularity, bounded by how often the cron writes. True
tick-level means consuming swaps as they happen, which needs a **persistent
connection** — and that is the one thing Workers genuinely cannot do.

*This* is where a Durable Object earns its place: one DO per pool holding a
Helius subscription (already integrated — `lib/helius/webhook.ts`), folding
swaps into the in-flight candle and fanning out to connected clients.

Do not build this until Phase 2 is live and minute granularity is demonstrably
the complaint. It is the most expensive phase and the least certain to matter.

---

## Order, and why

Phase 0 alone fixes the reported bug — blank charts — because it deletes the
dependency that caused it. Phases 1–3 are progressively better products built on
the same table. If work stops after Phase 0, charts are still fixed.

That ordering is deliberate: the failure was never rendering, or theming, or the
widget. It was renting data on the read path.

## Out of scope, deliberately

- **Non-Solana tick data.** Phase 3's Helius path is Solana-only. Other chains
  stay on Phase 1 cron granularity; GT covers them for backfill.
- **The holders table.** Position/PnL/avg-entry needs per-wallet cost basis —
  every transfer of the mint indexed. Different project, same "own your data"
  lesson.
- **Paying for GT.** A CoinGecko/GT API key lifts the per-IP limit and would fix
  the blank charts in an afternoon. It is a legitimate shortcut and worth taking
  if this plan is deferred — but it is rent, and it does not make anything live.
