# Next session — start here

Written 2026-08-13 after a long session. Everything below is committed and
deployed unless marked otherwise. Ordered by what to do first.

---

## 1. Board liquidity is blank on every row  (task #24) — BUILT 2026-08-13

**Measured:** 0 of 308 fresh `trending_coins` rows carry a `liquidity_usd`.

**There were TWO causes, and the second one is why the number stayed at zero
rather than creeping up.** The write path below was already working — a coin
page view called `securityWithLiquidityBackfill` and wrote a real figure — but
`trending-mobula.ts`'s upsert set `liquidityUsd: excluded.liquidity_usd` on
conflict, and `excluded` is ALWAYS null on that path (the mapping writes null on
purpose, because the pairs field is not dollars). So every hourly board pass
erased every measurement taken in the previous hour. Fixed with a `coalesce`,
the same idiom its neighbours (`image_url`, the holder stats) already use for
the same reason.

With that in place, the screening pass below can actually accumulate:
`screenBoardLiquidity()` in `server/lib/backfill-liquidity.ts`, called from the
trending-sync cron on the same `dueThisPass` hourly gate. 20 coins/pass, highest
24h volume first, 1 credit each = **480/month**, taking the free tier from 7,200
to 7,680 of 10,000. Knob: `TRENDING_LIQUIDITY_SCREEN_PER_PASS` (0 = off);
`?screen=N` on the cron URL overrides it for a manual seed, bounded at 200, the
same way `?all=1` overrides the chain slice.

**Verify after deploy** — the cron response now carries a `liquidityScreen`
block, and it is written to be read:

```
curl -sH "Authorization: Bearer $CRON_SECRET" \
  "https://watchparty.xyz/api/cron/trending-sync?screen=5" | jq .liquidityScreen
# {"picked":5,"measured":5,"unmeasured":0,"failed":0,"deadlineHit":false}
```

`measured` 0 with `unmeasured` N on repeated passes is the one failure mode to
watch: it means the head of the volume ordering is a coin the provider has no
liquidity figure for, so it stays NULL, stays at the head, and is re-paid for
every hour. The fix if that shows up is a `liquidity_screened_at` column to key
retries off — deliberately NOT built ahead of evidence.

### RESOLVED 2026-08-13 — the source was wrong, not the budget

Everything in the section below is kept because the reasoning was sound and the
conclusion was wrong, which is worth being able to see.

The screen now reads **Dexscreener** (`lib/coins/dexscreener`, free, per-IP
limits in the hundreds/min), which was already vendored in this repo and already
fronting every coin page for untracked coins. Five live passes of 60:

    measured 54 / 48 / 47 / 45 / 43     failed 0 0 0 0 0     deadlineHit false

against Mobula's 1-measured-2-failed per 3. Default per-pass raised 20 -> 60.

**What it found, which is the actual point.** 105 of 243 measured rows — 43% of
the board — sat under the $1,000 floor and are now hidden. The top of the board
included:

    TikTok    $168,842,702 of 24h volume  ->  $0.02 liquidity   HIDDEN
    SNDK       $80,068,102                ->  $27.69            HIDDEN
    UNITREE    $60,386,088                ->   $3.67            HIDDEN

and, separately, a SECOND SNDK on a different mint with $256k of real liquidity
that stays. Name matching could never have told those two apart; liquidity does
it instantly. SOL, ETH and CBBTC all retained — which is why NULL must keep
meaning "unmeasured" rather than "none".

The Mobula $50 plan is no longer justified by this workstream. Its remaining
case is the alert tape's `/2/token/trades`, which Dexscreener does not replace.

### The original finding — kept, because the constraint it assumed was not real

Deploy `1c4929b9`, three probes. The mechanism works: `liquidity_usd` went from
**0 of 308 to 3 of 243 fresh rows**, values sane (max $13.5M), and they PERSIST
— so the deferred `after()` write does flush on the worker.

What the probes also showed, immediately, is that the budget is not what limits
this. Two consecutive passes returned the SAME numbers:

```
{"picked":3,"measured":1,"unmeasured":0,"failed":2,"deadlineHit":false}
```

`failed`, not `unmeasured` — those are throws. Reproduced against Mobula
directly with the prod key at 2s spacing:

```
SNDK    429  Rate limit exceeded (Max usage reached)
SOL     200  liquidityUSD = 14,090,833
UNITREE 429  Rate limit exceeded (Max usage reached)
ETH     429  Rate limit exceeded (Max usage reached)
```

So ~75% of `/2/token/details` calls are refused on the free key — the same
behaviour already measured for `/2/token/trades` (see the `mobula-free-tier-
throttle` memory), which was NOT known to affect this endpoint too.

Consequences, in order of importance:

1. **The fill rate is throttle-bound, not budget-bound.** ~20 picks/hour at ~25%
   success predicts ~5 rows/hour. **Observed is worse:** 3 → 4 measured rows
   over roughly an hour of live crons (243 fresh rows). At that rate the board
   takes weeks, not days. Raising `TRENDING_LIQUIDITY_SCREEN_PER_PASS` does not
   fix it and just burns more wall-clock on 429s.
2. **A refused coin stays at the head of the ordering** and is re-picked next
   pass. It self-clears (the 429s are probabilistic, not per-coin — SOL answered
   fine), so this is slow rather than stuck, but it does mean the top of the
   board is retried far more often than the tail.
3. This is the strongest evidence yet for the **$50 Start-up plan**, which is
   already an open decision below. It is the same one env var.

**If staying on the free key**, the fix is the `liquidity_screened_at` column
after all — stamp every ATTEMPT, retry no sooner than ~6h — so a 429-heavy head
cannot monopolise the budget. Additive + nullable, so it ships as SQL under
`db/` and applies to both projects. Not built yet: it is the wrong fix if the
plan changes, since a paid key removes the pressure entirely.

**Expect the board to SHRINK a little as this fills.** `MIN_BOARD_LIQUIDITY_USD`
($1,000, env-tunable) only filters rows whose liquidity is KNOWN — 35% of rows
measured under $1k on 2026-08-12. Those become filterable for the first time.
That is the intended behaviour, not a regression.

**Why.** Mobula's pairs endpoint — the one that fills the board — does not report
dollars. Its `liquidity` field read `0.00000038` next to `volume_24h` of
`$80,068,102` on the same row. So the sync now writes NULL (correct: "unknown"
and "none" lead to opposite decisions), and the real figure comes from
`/2/token/details.liquidityUSD`, which is a PER-COIN call.

Three things call it today, and none of them run without traffic:
`trade.coinSecurity` (someone opens a coin page), and discovery's
`screenSecurity` / `rescreenTracked`.

**Do NOT** revert to writing the pairs `liquidity` value. It is not dollars, and
`clearsBrandBar`'s escape hatch reads it — that is how CLAUDE and OPENAI got onto
the alert rail.

---

## 1b. SEARCH IS DOWN ON PROD — Typesense cluster is gone (found 2026-08-13)

Not related to anything above; found while smoke-testing the router split.

```
curl -s -G https://watchparty.xyz/api/trpc/content.search \
  -H "Origin: https://watchparty.xyz" --data-urlencode 'input={"json":{"query":"a","limit":1}}'
# 500  getaddrinfo ENOTFOUND pnybcdrsuh24awk7p-1.a2.typesense.net
```

`TYPESENSE_HOST` in `.env.production` is `pnybcdrsuh24awk7p-1.a2.typesense.net`,
and that name is **NXDOMAIN** — verified independently with `nslookup` from a
laptop, so it is not a Workers DNS quirk. The cluster was deleted or expired;
the host is not merely unreachable, it does not exist.

Blast radius is wider than the search box: `upsertPost` / `upsertToken` /
`upsertUser` in `lib/typesense/sync` are called from the post, video and token
write paths. They are wrapped so they don't fail those writes, but every one of
them is currently a guaranteed failed DNS lookup on the request path — a real
latency cost on every publish, for an index nothing can read.

Decide which: stand up a new Typesense cluster and re-point + reindex, or gate
the whole integration behind a flag so the write paths stop calling a host that
does not resolve. Do NOT leave it as-is.

---

## 2. Going live must create a post  (task #21)

**Decided, not built.** A stream and its playback are ONE post, the way a video
already is.

`insert(posts)` exists in exactly TWO places in this codebase —
`server/routers/content.ts` and `server/routers/comment.ts` — and no stream path
reaches either. The IVS webhook only flips `streams.isLive`.

**Where:** `server/routers/stream.ts:269` `startBroadcast`. It already loads the
stream row. Insert a post (title from `streams.title`, creator as author, stream
category), then `writePostTags(postId, tags)` exactly as `createVideo` does at
`content.ts:146`.

**Visibility:** the "visible or not during creation" option is that post's
existing `visibility` column (`public | private | unlisted`). Streams reach the
feed by default.

**Trap:** when the VOD lands it must find the post the stream already created, or
the recording becomes a second feed entry. Key it on the stream id.

This unblocks the ticker picker already mounted on the stream title — it works,
it just has no `post_tags.post_id` to reference.

---

## 3. Spaces creation step  (task #22)

Does not exist. `components/app-ui/create-dialog/` has coin, stream, video and
playlist steps. Build it from the community page's create-space surface. A space
creates a post too, so it inherits whatever shape (2) lands on, and its
visible/hidden option is the same `visibility` column.

Mount the picker with `useCashtagField` — three lines; see
`components/app-ui/create-dialog/stream-setup.tsx:362` for a working example
including the Enter trap below.

---

## 4. Split `server/routers/content.ts`  (task #23)

1580 lines. Its size-guard allowlist was bumped 1578 → 1580 deliberately in
`01ec0d4e` to land a real feature, rather than deleting blank lines to game a
guard whose whole purpose is noticing growth. `createPost`, `createVideo` and the
token-launch blocks are separable.

---

## Traps already paid for — do not re-pay them

- **Never interpolate a JS `Date` into a `sql` template.** It works under Node
  and throws on workerd. It took the trending board down on 2026-08-12. Use
  `.toISOString()` with an explicit `::timestamptz`.
- **No backticks inside a `sql` template**, including in SQL comments — a
  backtick ends the template literal. That shipped as a syntax error the same
  day, in the commit fixing the first bug.
- **A container deploy rolls gradually.** Two separate changes were declared
  broken on 2026-08-12 after one probe immediately post-deploy; both were fine.
  Poll until two consecutive reads agree.
- **`tsc` is the only gate that catches these.** `bun test` doesn't import most
  routers and the LSP reported clean on a file that didn't parse. Do not skip it
  under time pressure — that is exactly when it earns its keep.
- **Search `components/` before building UI.** A whole ticker-picker was written
  that duplicated `components/browse/cashtag-autocomplete`, because the search
  covered `lib`, `server` and `db` — where a feature's DATA lives, not where a
  UI-only feature lives.
- **Enter belongs to the cashtag menu while it's open**; blurring collapses the
  caret the replacement needs. The menu commits on `mousedown`, not `click`.
- **Step-local state dies before a wizard's submit.** The video picker lived in
  `details-step`, which unmounts as the wizard advances, so every tag was lost.

---

## Waiting on the user

- ~~**fomo's URL**~~ — RESOLVED 2026-08-15, and it was never blocked on the
  user. The domain is **`fomo.family`** (200), not `.biz` or `.fun` (both
  NXDOMAIN). It is named in three of this repo's own docs —
  `docs/exp-callouts.md` §"Phase 4 — fomo.family social-trading layer",
  `docs/TODO.md`, and `docs/coin-alert-feed.md`, which models the alert copy on
  it. Guessing TLDs and escalating beat reading the docs that already had it.
  Still open as WORK, not as a question: inspect how their chart marker layer is
  positioned, for the coin page.
- **`ALERT_WEBHOOK_URL`** — last item on `docs/cloudflare-launch.md` step 7.
  ⚠️ Looks like this is ALREADY SET: `.env.production` carries a real Discord
  webhook for it. What's unconfirmed is whether the deployed `DOTENV_PRODUCTION`
  secret was re-synced since it was added — check before treating it as open.
  Separately, `lib/alerts/discord.ts` reads a DIFFERENT variable
  (`DISCORD_ALERT_WEBHOOK_URL`) from the one `app/api/webhooks/helius-treasury`
  reads (`ALERT_WEBHOOK_URL`), so setting one does not light up the other.
- **Mobula $50 Start-up plan** — one env var (`MOBULA_PLAN=startup`) tightens
  every cadence, and `MOBULA_TAPE_COINS_PER_PASS=12` gives the alert tape the
  full watch list hourly. On the free key Mobula refuses ~half of all
  `/2/token/trades` requests regardless of spacing, which is why the coin page
  serves stale-not-blank via SWR.
- **A stream/space's "visible or not" default** — assumed visible; say if not.

## Longer backlog

Tape DO (#14) needs Mobula Growth ($400) for a socket. Sparkline column (#17)
follows it. e2e wallet fixture (#2), community-chat windowing (#10), Tokens API
signal (#16). Task #11 (dev Supabase keys) is stale — resolved by making
`.env.local` consistent; delete it.
