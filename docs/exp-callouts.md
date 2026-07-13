# XP, Quests & Callouts — gamification workstream

Source: Grok brainstorm (`~/Documents/projects/exp.txt`), pump.fun Callouts, fomo.family social layer.
Goal: XP/leveling + quests + a pump.fun-style token Callout mechanic with follower alerts and a 7-day caller leaderboard.

## What we already have (reuse, don't rebuild)

- **`tokens` cached market columns** (`priceUsd`, `marketCapUsd`, `volume24hUsd`, `priceChange24h`, `bondingProgress`, `phase`) written by the token-stream worker → callout snapshots and performance scoring are pure DB reads, **no RPC, no Redis**.
- **`follows`** table → callout fan-out audience.
- **`notifications` + `server/lib/notify.ts`** → the fire-and-forget helper pattern to copy for XP. The `type` enum on `notifications` is TS-level only (plain `text` column), so adding a `"callout"` type needs no SQL migration.
- **Cron worker** → callout performance tracking + quest period rollover.
- **Realtime worker** → live global callouts feed.
- **`postBoosts`** → SOL-paid promotion already exists; callout is its free/social sibling (cooldown-gated instead of paid).
- **`referrals.rewardLamports`** stub → referral quest can finally give something (XP instead of lamports).

## Phase 1 — XP core

- `db/schema/content/xp.ts`: **`xp_events`** append-only ledger — `id, userId, amount, kind, refId, createdAt`, with a **unique index on `(userId, kind, refId)`** so awards are idempotent (no double-XP on retries).
- `user.xp` + `user.level` denormalized columns (needs a migration), updated in the same transaction as the ledger insert.
- `lib/xp.ts`: pure curve functions — `levelForXp()`, `xpToNext()`, `progress()`. Pick one curve and freeze it (retro-fitting a curve after launch is painful).
- `server/lib/xp.ts`: `awardXP(userId, kind, refId)` mirroring `notify.ts` — never throws, called from existing mutation sites:
  - post created, comment created, like *received*, follow *received*, token launched, stream minutes watched (`video_progress`), referral converted, quest completed, callout success bonuses.
- UI: level badge + progress ring on profile; level-up toast.
- Anti-abuse: daily XP cap per kind; XP for *received* engagement only (can't farm your own likes).

## Phase 2 — Callouts (pump.fun style)

- **`callouts`** table: `id, userId, tokenId, priceAtCall, marketCapAtCall, peakGainPct, notifiedCount, createdAt`.
- **Cooldown: 1 per user per 6h** — just query the user's latest callout timestamp; no KV/Redis needed.
- `callout.create` (protected tRPC): check cooldown → snapshot price/mcap from cached token columns → insert → fan out `"callout"` notifications to followers → publish to realtime global feed.
- **Performance tracking (cron)**: for callouts < 7d old, `peakGainPct = max(peakGainPct, currentPrice/priceAtCall − 1)`; award bonus XP at 2×/5×/10× thresholds (idempotent kinds `callout_2x` etc.).
- **Caller leaderboard (7d rolling)**: rank by sum of capped peak gains (cap per-call so one 100× lottery ticket doesn't own the board). Follow button directly on leaderboard rows — this is the fomo/pump.fun growth loop: good calls → leaderboard → followers → bigger fan-out.
- UI: Callout button on token page with cooldown countdown; `/callouts` live feed page ("@user called $TICKER at $12k mcap → +340%"); leaderboard tab.
- Anti-abuse: min account age or level to call out; badge calls on your own token as "dev call" (or exclude from scoring).

## Phase 3 — Quests

- Code-defined catalog in `lib/quests.ts`: `{ id, title, kind, target, xpReward, period: daily | weekly | once }`.
- **`quest_progress`** table: `userId, questId, periodKey, progress, completedAt` — `periodKey` is a date/week string, so "daily reset" is free (new key = fresh row, no cron reset job).
- Progress increments ride the same hook sites as `awardXP` (map event kind → quests).
- UI: quests panel (daily/weekly tabs), completion toast, auto-claim.

## Phase 4 — fomo.family social-trading layer (later, own workstream)

PnL leaderboard, copy-trade alerts, per-trade activity feed. Blocked on tracking actual
user swaps — but the unblock path is concrete. Today's swap flow: server builds the
Jupiter tx (`wallet.getQuote` → `wallet.getSwapTransaction`), client signs (adapter or
custodial Swig) and sends, and **confirmation happens client-side only — the server never
learns the trade happened**. Everything below stacks on fixing that one gap.

### 4a. Record trades (the keystone)

Two complementary sources, one `trades` table
(`id, userId, walletAddress, txSignature UNIQUE, inputMint, outputMint, inAmountRaw,
outAmountRaw, priceUsdAtFill, source: 'app' | 'wallet', status: 'pending' | 'confirmed' | 'failed', createdAt`):

1. **App swaps (server-witnessed, not client-reported).** `getSwapTransaction` already
   knows the user, mints, and quoted amounts — insert a `pending` trade row right there.
   Client reports the signature after send (best-effort mutation), and a **cron job
   verifies on-chain** (fetch tx by signature, parse actual fill amounts) before flipping
   to `confirmed`. Never trust the client's version of amounts — the chain is the source
   of truth; `txSignature` unique index dedupes.
2. **Wallet-level tracking (what fomo actually does).** `lib/helius/webhook.ts` already
   manages an enhanced webhook with address-append (built for treasury watching). Append
   opted-in traders' wallet addresses; Helius enhanced webhooks deliver parsed `SWAP`
   events → insert `confirmed` trades with `source: 'wallet'`. This catches trades made
   *outside* the app (Photon, Axiom, etc.), which is what makes a PnL leaderboard honest.
   Gate on an opt-in "public trader profile" toggle — both for privacy and because
   webhook address count is a cost lever.

### 4b. PnL computation

Store `priceUsdAtFill` on every trade so PnL is pure aggregation, no historical price
lookups. Per user × mint: weighted-average cost basis from buys, realized PnL on sells,
unrealized PnL from current price (launchpad tokens: cached `tokens.priceUsd`; arbitrary
mints: Jupiter price API, cached). A cron materializes `pnl_snapshots`
(`userId, window: 24h | 7d | 30d, realizedUsd, unrealizedUsd, winRate`) — leaderboard reads
are then a single indexed query, same shape as the callout leaderboard.

### 4c. Social surfaces (reuse Phases 1–3 infra)

- **Trade activity feed**: confirmed trades of followed users → realtime worker publish +
  `"trade"` notification type (TS-only enum, no migration). "@user bought $TICKER — $420"
  rows, same visual system as the callouts feed.
- **Profile PnL card**: win rate, best trade, 7d PnL — behind the same opt-in toggle.
- **PnL leaderboard**: tab next to the caller leaderboard; follow button on rows. XP tie-in:
  quest "make 3 trades", XP bonuses at PnL milestones.

### 4d. Copy-trade (three tiers, ship in order)

1. **Alert-only**: follow a trader → get the trade notification. Free with 4c.
2. **One-tap copy**: notification/feed row deep-links into the swap view with mints
   prefilled — user still signs. Cheap, no custody questions.
3. **Auto-copy**: server executes the same route for the follower within user-set filters
   (max SOL per copy, min trader 7d PnL, slippage cap). Technically possible **only for
   custodial Swig wallets** (server can sign); needs explicit consent UX, per-copy caps,
   and a kill switch. This is the deep end — don't attempt before 1–2 have usage.

**Build order within Phase 4:** 4a-1 (app-swap recording) → 4b → 4c → 4a-2 (webhooks) → 4d.

## Deliberately deferred

- Web push for callout alerts (in-app notifications first; push is its own project — VAPID/web-push or Novu).
- Direct financial rewards for callers — pump.fun doesn't pay either; leaderboard prestige + XP is the incentive loop.

## Build order

1. ✅ Phase 1 XP core — SHIPPED 2026-07-12 (`xp_events` + user.xp/level live in DB, hooks
   in content/comment/user/friends routers, LevelBadge in the profile header).
2. ✅ Phase 2 callouts — SHIPPED 2026-07-12 (`callouts` table live; `callout` router:
   create/cooldown/feed/leaderboard; CalloutButton on tradeable token pages;
   `/trade/callouts` feed + 7d leaderboard in the Trade nav; "callout" notification
   type; `/api/cron/callout-performance` every 10 min advancing peak gains + paying
   2×/5×/10× XP bonuses).
3. Phase 3 quests — pure retention layer on top of 1. NEXT UP.
