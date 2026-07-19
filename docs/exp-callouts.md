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
3. ✅ Phase 3 quests — SHIPPED 2026-07-13 (`quest_progress` table live; code-defined
   catalog in `lib/quests.ts` (3 daily / 4 weekly); recordQuestEvent rides every XP hook
   site + callout creation; auto-claims XP on completion; `/quests` page in the sidebar
   with daily/weekly tabs, tick-bar progress, reset countdown).

4. Phase 4a-1 (server-witnessed trade recording) — ✅ SHIPPED 2026-07-13: `trades` table
   live; pending row inserted in `wallet.getSwapTransaction`; client attaches the
   signature via `wallet.reportSwapSignature` right after send; `/api/cron/trade-verify`
   (on the */10 slot) settles pending → confirmed/failed from `getSignatureStatuses`,
   expires unreported rows after 1h. Reads are owner-only (RLS) until the opt-in public
   trader profile ships.

5. ✅ Phase 4b PnL — SHIPPED 2026-07-17: `pnl_snapshots` (24h/7d/30d) rebuilt every 10 min
   by `/api/cron/pnl-snapshots` from confirmed trades. **Realized-only by design** —
   cash-sided swaps (SOL/USDC/USDT ↔ token), window-scoped average cost basis in raw
   units so decimals cancel; unrealized needs a decimals/price layer (later).
6. ✅ Phase 4c — SHIPPED 2026-07-17: `user.shareTrades` opt-in; confirmed trades of
   sharing users fan out `"trade"` notifications + web push from trade-verify; profile
   PnL card (owner always sees it + toggle; others only when shared); "Top traders"
   7d-PnL tab on `/trade/callouts`. Also: callout fan-out now sends web push;
   level-ups emit a system notification; predictions placeBet awards `prediction_bet`
   XP + daily/weekly quests (server-verified USDC payment = unfarmable).

7. ✅ SHIPPED 2026-07-18 — the remaining stack:
   - **Unrealized PnL**: `mint_prices` cache (Jupiter lite prices + Helius DAS decimals,
     launchpad `tokens.priceUsd` fallback) refreshed inside the pnl-snapshots cron;
     `pnl_snapshots.unrealizedUsd` marks open positions; leaderboard ranks by total.
   - **4a-2 external trades**: Helius SWAP webhook on sharing users' wallets
     (`lib/wallet/user-trades-webhook.ts` → `/api/webhooks/helius-user-trades`).
     Records `source: "wallet"` confirmed trades (signature-deduped against the app
     path), USD from the cash leg (USDC direct / SOL × cached price). Synced on the
     sharing toggle + the daily webhook-sync cron.
   - **Perps XP**: `perps.reportFill` verifies the reported signature on the Flash ER
     (exists + succeeded + caller's wallet in account keys) before paying `perps_trade`
     XP + daily/weekly perps quests; wired into the order panel after `openPosition`.
   - **4d tiers 1–2**: alerts (4c) + one-tap copy — trade/callout notifications carry the
     token slug in `postId` and render a Copy/View chip → token page swap card.

## 4d — SHIPPED 2026-07-19 (prepared-order model, sub-gated)

Copy access is the **paid perk of a creator subscription** to the trader (owner
decision 07-19). `copy_subscriptions` (per-copy + daily USDC caps, pause) behind the
active-sub gate; on every leader BUY, configured subscribers get a sized "Copy ready"
push → one tap to the token page. UI: Copy-trades dialog on sharing traders' PnL cards
(subscribe prompt when unsubbed), "Copying" management list on the Live-trades tab.
Same batch: profile **Trades** tab + **Live trades** feed tab (`/trade/callouts`),
level-up/quest-complete toasts (XpToastListener over the notification stream),
recent-XP breakdown popover on your own LevelBadge, referral XP cap 10→3/day.

## 4d walk-away execution — ✅ BUILT 2026-07-19 (inert until the executor key is provisioned)

The on-chain scoped-delegation model, exactly as discussed:
- **Enable** = one FROST-signed transaction adding an executor role to the user's Swig
  with `Actions.set().tokenRecurringLimit({ mint: USDC, recurringAmount: dailyCap,
  window: ~24h in slots })` — the Swig program enforces and resets the daily cap;
  the executor key is powerless beyond it. Rides the existing 2-round FROST flow as
  new frostCommit purposes `copyEnable`/`copyDisable` (frostSign untouched).
- **Executor** (`server/lib/copy-executor.ts`, called from trade-fanout on leader buys):
  sizes each copy (per-copy cap ∧ leader size ∧ rolling-24h SQL budget from
  `copy_orders`), builds the Jupiter swap for the follower's Swig, wraps it in Swig
  sign instructions under the capped role, signs [treasury, executor], sends, and
  records the trade (trade-verify confirms on-chain). 3 consecutive failures →
  autopause + notification. Copy access still requires the active creator sub.
- **Defense in depth**: kill switch (no `COPY_EXECUTOR_SECRET` env → feature invisible
  and inert) → chain-enforced recurring cap → SQL caps → autopause.
- **UI**: "Hands-free copying" section in the copy dialog — enable (sign once,
  cap shown), disable (revokes the role on-chain).

**OPS TO GO LIVE**: generate a keypair, set `COPY_EXECUTOR_SECRET` (base64 64-byte
secret) on the app worker (DOTENV_PRODUCTION), and fund nothing — it never holds
assets; the treasury pays fees. Until then, subscribers get prepared-order pushes.

Known v1 limits: the on-chain cap is per-wallet (set at first enable) while SQL caps
are per-trader — the chain cap is the total safety net. Cap changes: ✅ one-signature
on-chain update shipped 07-19 (`copyUpdateCap` purpose → updateAuthority replace-all).

PROVISIONED 2026-07-19: `COPY_EXECUTOR_SECRET` set in `.env.local` + DOTENV_PRODUCTION
(executor pubkey `tCnD3nBMxcwzG3NhESA1Y47ijFjDv95TUxt6W1qs4nA`); deployed — hands-free
is ARMED in prod. ⚠️ Before promoting to real users: one supervised e2e test (enable
with a $2 cap, leader buys, watch `copy_orders`). "Recent copies" audit list ships on
the Live-trades tab.

Server-executed copying for **Swig custodial wallets only** (server can sign). Ship only
after tiers 1–2 have real usage. Proposed shape:
- `copy_subscriptions` table: follower → trader, `maxUsdcPerCopy` (hard cap),
  `dailyUsdcCap`, `minTraderPnl7d`, `paused` (kill switch), `consentTxSignature`
  (explicit on-chain-style consent record), timestamps.
- Execution: on a confirmed leader trade, a queue (not inline in the webhook) sizes the
  copy (min of caps), builds the same Jupiter route via the existing server rails, signs
  with the follower's Swig session, records it as a `source: "app"` trade.
- Safety: global kill switch env, per-user daily cap enforced in SQL, auto-pause on 3
  consecutive failed copies, copy only `source` trades ≥ N minutes old to damp MEV-bait.
This moves user funds server-side — do not build until the caps/consent UX above is
approved.
