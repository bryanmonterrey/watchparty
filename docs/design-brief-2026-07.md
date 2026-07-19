# Design pass brief — July 2026 (owner-led, new chat starts here)

Read first: `docs/design-principles.md` (canonical), then
`docs/references/design-profile-badges-discord.md` (the profile reference).
This brief turns the reference into buildable specs + the open questions the
owner should answer in the design session. Order below = build order.

---

## 1. Profiles: earned-badge strip + mini-profile popout

### Badge catalog — almost everything is derivable TODAY, no new tables

Code-defined catalog (like quests). Computed per user from existing data:

| Badge | Source (already in DB) |
|---|---|
| Level tiers (LV 5/10/20/50) | `user.level` |
| Premium tier | active `premium_subscriptions` |
| Token launcher | `tokens` where creator + status live |
| Callout sniper (hit 10×) | `xp_events` kind `callout_10x` |
| Prophet (won a prediction) | `predictionBets` payout > stake |
| Sharing trader (positive 30d) | `shareTrades` + `pnl_snapshots` |
| Early member | `user.createdAt` < launch cutoff |
| Quest streak (7 days) | consecutive daily keys in `quest_progress` |

**The one schema addition needed**: weekly Top Caller / Top Trader *finishes*.
The leaderboards are rolling windows — once the week rolls, the finish is gone.
Tiny `weekly_finishes` table (userId, board, isoWeek, rank) written Monday
00:05 UTC by a cron rider on the existing */10 slot logic. Without it, the two
most flexible badges can't exist retroactively — add it BEFORE the badge UI so
week-1 finishes are never lost. Everything else ships schema-free.

- One `profile.badges` (or fold into `profile.card`) endpoint computing the set,
  cached ~5 min. Strip shows max ~6 + "+N" overflow → full list in a sheet.
- Iconography: **pixel-art glyphs** (matches `font-pixel` identity, differentiates
  from Discord's flat icons). Brand accents per family: lantern = trading,
  sunset = caller, pastel palette for social. Hover = tooltip with name + earned
  date. Earned-only; premium tier is the only "paid" badge.

### Mini-profile popout (the Discord move that matters most)

Avatar-anchored overlay everywhere an avatar appears (feeds, chat, leaderboards,
callouts rows) — banner, avatar, name + badge strip, exp bar, PnL chip (if
shared), Follow/Subscribe CTAs, top roles. One batched `profile.card` query;
open on hover-intent (~150 ms) on desktop, tap on mobile; cache per userId.
This makes every leaderboard/feed row a recruitment surface for the follow loop.

### Identity stack cleanups while in there

Dual member-since (watchparty date • community date when in community context),
server-tag-style chip for community/holder tags, connections with receipts
(X follower count via socials; wallet age).

## 2. Video + live pages

- **Video**: theater-first; under-player creator row = avatar + name + badge
  strip + h-11 Subscribe/Tip cluster; token chip when the video has one
  (bonding progress inline); decide comments right-rail vs below (owner call).
- **Live**: chat identity is the lever — LV badge + top-badge next to chat names
  (tiny, 1 glyph); creator's token pinned above chat with quick-buy; viewer
  count + duration chip anatomy per design-principles.

## 3. Predictions (finish the Kalshi-anatomy pass)

Market page hierarchy (question > outcomes > pools), bet-slip anatomy reusing
the wallet-drawer pill language, resolved/claim states with the payout math
visible (stake + share of losing pool − rake), category pills already done.

## 4. Callouts page

Podium treatment for top-3 callers (sunset #1), per-call gain badge → small
sparkline since call, filter chips (24h/7d, gainers only), empty states with
personality per the Discord reference note.

## 5. Token page

Header is crowded: unify the action row (Callout/Share/copy/star all h-10/11,
one visual family), stats grid to tabular-nums + consistent label case, curve
progress as the hero metric pre-migration.

## 6. Communities

Visual tinkering only (parity work is done): section rhythm, squircle
consistency, role-chip colors aligned with the badge palette from §1.

---

## Open questions — ANSWERED by owner (design chat, 2026-07-19)

1. Badge glyph direction: **illustrated/flat** (owner overrode the pixel-art
   recommendation; keep brand accent families — lantern = trading, sunset =
   caller, pastels = social — just in flat/illustrated form).
2. Popout v1 scope: **hover-cards everywhere** (leaderboards, feed, chat,
   callouts — the full distribution layer).
3. Video comments: **right rail** (Twitch-like, consistent with live chat).
4. Chat badges on live: **LV + one top earned badge** (single glyph).
5. Early-member badge: **first 1,000 users** (signup-order count, not a date
   cutoff — needs a rank-by-createdAt query rather than a createdAt comparison).

## Handoff note

Gamification arc is COMPLETE and live (see `docs/exp-callouts.md`); manual test
runbook pending in TODO. This design pass is pure UI/UX — the only schema work
is `weekly_finishes` above. Everything else reads existing tables.
