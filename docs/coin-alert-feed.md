# Coin alert feed (the /home left rail)

fomo-style multi-chain alerts: "20 traders **buy** $40.3K · PUPPY at $612K mc".
Trader clusters, whale fills, callouts, predictions, launches and migrations all
land in one rail on `/home`.

## Ship checklist

1. **Run the SQL** — `db/coin-feed.sql`, by hand (Supabase SQL editor or psql).
   Additive only: two new tables, no `ALTER` of anything existing, so it is safe
   against the live DB that dev also points at. It also adds the realtime
   publication and backfills existing callouts + open prediction markets.
2. **Nothing to schedule.** `/api/cron/coin-alerts` rides the cron worker's
   existing `* * * * *` trigger (`cron/src/index.ts`), so it deploys with the
   worker. It is guarded by `CRON_SECRET` like every other cron route.
3. **Verify** — `curl -H "Authorization: Bearer <CRON_SECRET>" \
   "https://<domain>/api/cron/coin-alerts?discover=1"`. `?discover=1` forces a
   discovery pass instead of waiting for the 5-minute slot. A healthy first
   response looks like `{"discovery":{"discovered":40,...},"scanned":16,...}`.

## How it works

```
GeckoTerminal trending/new pools ─┐
                                  ├─► tracked_tokens ─► trade scan ─► coin_feed_events ─► rail
watchparty live launches ─────────┘                                        ▲
                                            callouts / predictions ────────┘
```

**`tracked_tokens`** is the watch list — every coin we follow, across chains,
keyed `${network}:${tokenAddress}`. Deliberately separate from `tokens`, which
is watchparty-launched coins only (`creatorId` is a required FK to a user).
Watchparty launches are *mirrored* into it with `wpTokenId` set, so the scanner
has one loop and the rail can deep-link to the native coin page for coins we own.

**`coin_feed_events`** is the rail's item stream — append-only, one row per
alert. One table (rather than a read-time UNION of clusters/callouts/predictions)
because the rail paginates on a single total keyset cursor; see "Scroll" below.

### Cluster detection

`lib/coin-feed/clusters.ts`. Per coin: pull recent swaps from GeckoTerminal
(`tx_from_address`, `kind`, `volume_in_usd`, `block_timestamp`), drop everything
at or before the coin's watermark, then slide a window over each side
independently. A window clearing **both** thresholds becomes one event; emitted
windows are consumed, so a ten-minute surge is one alert rather than forty.

Thresholds live in one block at the top of that file:

| knob | default | note |
| --- | --- | --- |
| `MIN_TRADE_USD` | 250 | dust floor, also applied server-side by GT |
| `CLUSTER_WINDOW_MS` | 15 min | wider = more traders per cluster, staler alerts |
| `MIN_TRADERS` | 6 | fomo shows 20+, but against a mature tracked set — **raise this as coverage grows** |
| `MIN_CLUSTER_USD` | 7,500 | must clear alongside the trader count |
| `WHALE_USD` | 25,000 | single fill this big is its own event, and is excluded from clusters so one wallet can't carry the USD threshold alone |

Idempotency is a `dedupeKey` unique index (`cluster:<token>:<side>:<closing tx>`),
so a retried pass collides instead of double-posting.

### Chains

`lib/coin-feed/networks.ts`. `id` is the GeckoTerminal network slug — GT covers
~200 networks, so **adding a chain is a row, not plumbing**. Solana and Base ship
enabled; ethereum, bnb, arbitrum and hyperevm are present but `enabled: false`.

The constraint is the **call budget**, not the code. GT's free tier is 30
calls/min and the pass runs every minute, so `GT_CALL_BUDGET` is 24. Each
enabled network costs 2 calls per discovery pass (every 5 min), and every
tracked coin costs 1 call per trade scan.

That makes `MAX_TRACKED` (300, in `discovery.ts`) the **alert-latency dial**:
worst-case cycle time is `MAX_TRACKED / 24` minutes ≈ 12 min. The scan doesn't
round-robin, though — it orders by *staleness × ln(volume)*, so a high-volume
coin comes round far more often than that while a quiet one drifts toward the
worst case and never starves. Enabling another chain doesn't add budget; it
spends the same 24 calls across more coins. Check `tracked` per network via the
`coverage` query before turning chains on, and treat a paid GT key as the real
unlock for breadth *and* freshness together.

Known gap at the top end: GT's trades endpoint returns the last 300 trades of
the past 24h, so a coin doing 300+ qualifying (>$250) trades between two scans
will have the overflow silently dropped. Only bites the very hottest coins;
shortening their effective interval (or a paid key) is the fix.

**When rate-limited**, `gt()` trips a flag on the `CallBudget`, `fetchPoolTrades`
returns `null` (distinct from `[]` = "genuinely no trades"), `scanToken` leaves
both cursors untouched, and the scan aborts the rest of the pass. That
distinction matters: without it a 429 looked identical to a quiet pool, so the
coin got its `last_scan_at` stamped and was demoted in the priority ordering
despite never having been read. The cron response reports `skipped` and
`rateLimited` so this is visible rather than silent.

Note the prod cron already spends ~24 of the 30 calls/min. **Running the
pipeline locally against the same DB will 429** — that's contention with prod,
not a bug.

### What never enters the feed

`isExcludedCoin` in `networks.ts` drops stablecoins, wrapped/staked majors, and
anything over `MAX_MARKET_CAP_USD` (2B). Learned from the first live pass, which
produced *"85 traders sell $380K · CBBTC at $6.2B mc"* — true, useless, and it
would fire on every single scan, because a blue chip always has that many
traders in a 15-minute window. Left alone, majors crowd out the memecoin
activity the rail exists for.

The filter is applied at discovery **and** as an eviction pass (`evictExcluded`),
so a coin that grows past the ceiling, or a symbol added to the list later, is
removed rather than grandfathered in.

## Scroll behaviour

Ported from `components/browse/browse-feed.tsx` (the discover feed), same
reasoning throughout — see the comments in `components/coin-feed/alerts-rail.tsx`:

- `BidirectionalList` is a sliding window over a full ordered dataset held in a
  ref, so items evicted off an edge are **restored** on scroll-back rather than
  refetched.
- The window's top is **pinned**. Anything newer waits behind the "n new" pill
  instead of being injected above the row you're reading — the single most
  important behaviour here, since an alert feed writes constantly.
- Newer alerts only fold in automatically while you're already at the top.

One structural difference from discover: `useWindow={false}`. Discover scrolls
the page; this rail is a fixed-height sticky column that scrolls inside itself,
so `BidirectionalList` owns the scroller.

The cursor is `occurredAt|id`, and **both halves matter** — a cursor on
`occurredAt` alone would drop or repeat rows, because a cluster window closes on
one block and ties are constant. The client sorts by the same pair for the same
reason.

## Sound

`components/coin-feed/use-alert-sound.ts` — a WebAudio blip, not an asset (two
sine notes would otherwise be a network request for ~200 bytes). Buys chirp up,
sells drop down. Off by default, persisted to `localStorage`, rate-limited to one
tone per 1.2s so a burst can't machine-gun. The toggle click doubles as the user
gesture that lets the `AudioContext` start.

## Things deliberately not done

- **Wallet addresses are never rendered** (project rule). They're stored on the
  event for dedupe/attribution and used only as the seed for an anonymous
  trader's avatar colour. Wallets that map to a watchparty account via
  `linked_wallets` / `wallet_addresses` show the real avatar instead.
- **Tracked (non-watchparty) coins have no page here**, so their rows open the
  chain explorer in a new tab — `/[slug]` resolves against `tokens` and would
  404 on a merely-tracked mint.
- **No "smart money" scoring yet.** Every wallet counts the same toward a
  cluster. Ranking wallets by historical PnL is the obvious next step and is
  what makes fomo's version feel curated; `pnl_snapshots` already exists for our
  own users, but external wallets would need their own history.
