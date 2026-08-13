# Next session — start here

Written 2026-08-13 after a long session. Everything below is committed and
deployed unless marked otherwise. Ordered by what to do first.

---

## 1. Board liquidity is blank on every row  (task #24)

**Measured:** 0 of 308 fresh `trending_coins` rows carry a `liquidity_usd`.

**Why.** Mobula's pairs endpoint — the one that fills the board — does not report
dollars. Its `liquidity` field read `0.00000038` next to `volume_24h` of
`$80,068,102` on the same row. So the sync now writes NULL (correct: "unknown"
and "none" lead to opposite decisions), and the real figure comes from
`/2/token/details.liquidityUSD`, which is a PER-COIN call.

Three things call it today, and none of them run without traffic:
`trade.coinSecurity` (someone opens a coin page), and discovery's
`screenSecurity` / `rescreenTracked`.

**The fix.** Give `app/api/cron/trending-sync` a bounded screening pass: take the
top N board coins with `liquidity_usd IS NULL`, call
`securityWithLiquidityBackfill` for each, 1 credit apiece. N is a budget
decision — the free plan is 10k credits/month total and the coin pages and
alert tape already draw on it; ~20/pass on the existing cadence is a sane start.

**Why it wasn't done in-session:** it edits a cron path, and the board was taken
down twice on 2026-08-12 by changes to the trending read path. Worth doing with
a clear head and a production verification after.

**Do NOT** revert to writing the pairs `liquidity` value. It is not dollars, and
`clearsBrandBar`'s escape hatch reads it — that is how CLAUDE and OPENAI got onto
the alert rail.

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

- **fomo's URL** — `.biz` and `.fun` both refuse connections. Wanted to inspect
  how their chart marker layer is positioned.
- **`ALERT_WEBHOOK_URL`** — last item on `docs/cloudflare-launch.md` step 7.
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
