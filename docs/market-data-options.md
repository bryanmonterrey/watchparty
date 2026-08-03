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

### C. Mobula — best coverage-per-dollar

50+ chains. Has exactly the primitives we need: `/token/ohlcv-history`,
`/token/trades`, and websocket **bar** streams (`onTokenBarsUpdated`).

- Free $0 / 10k credits / 1 RPS / no WSS
- **Start-up $50 / 125k credits / 30 RPS / no WSS**
- Growth $400 / 1.25M / 50 RPS / **WSS included**
- Enterprise $750+ / unlimited / 500 RPS / WSS

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

## Recommendation

**Mobula Start-up ($50/mo), on-demand rather than pre-synced.**

- Covers 50+ chains, which is the actual "every chain" requirement.
- 30 RPS is ~15× GT's measured keyless ceiling, and 125k credits/month is far
  more than on-demand chart opens will consume.
- Cheapest entry that isn't crippled: Codex's equivalent is $350, CoinGecko's
  free tier can't do on-chain at all.

**Skip the $400 websocket tier at first.** We already own the fan-out half —
Supabase Realtime is live on `coin_candles` (Phase 2). Polling *only the coins
currently on screen* at 30 RPS and pushing over our own Realtime gets live
charts without the provider's WSS. Concurrent viewers bound the cost, not the
size of the coin universe. Upgrade to Growth only when that stops holding.

**Then Helius for Solana ticks.** Solana is the bulk of volume and the webhook
infrastructure is already paid for and wired — moving Solana off the metered
provider protects the credit budget for the long tail of EVM chains.

### Sequencing

1. Mobula Start-up key → adapter behind the existing `gtBase()`/`gtHeaders()`
   seam, so callers don't change.
2. On-demand backfill on chart open, stored to `coin_candles`.
3. Poll-the-visible-coin → Supabase Realtime for live bars.
4. Helius swap ingest for Solana, dropping it off the metered path.
5. EVM log indexer only if provider credits become the binding constraint.

## Not the answer

- **PlanetScale.** 513 rows, millisecond queries. The bottleneck is upstream
  ingest. Migrating also costs Supabase Realtime and the auth tables ported
  verbatim from the old app — removing the thing that makes data live to fix
  something the database never caused.
- **TanStack DB.** A client-side sync/cache. Makes rendering snappy once data is
  *in* Postgres; does nothing about data not arriving. Reasonable later for
  feeds and messages.
