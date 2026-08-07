# watchparty — running TODO (handoff)

Consolidated state across sessions so work can resume in a fresh chat. Last updated 2026-08-07.

## 🚨 Ops maturity (2026-08-07 — "run it like a consumer company")

Tracked live in-session too; update statuses here as they move.

1. **Uptime monitor + alerting — SHIPPED (this commit).** cron worker probes
   watchparty.xyz every minute (home + auth + a DB-touching tRPC query — the
   2026-08-06 lesson: pages/auth stay green while the DB path is wedged) and
   emails bryan@watchparty.xyz on down/recovered transitions, re-alerting every
   30 min while down. State in Upstash (`monitor:site-state`). Alert sender:
   login@watchparty.xyz via Resend. Code: `cron/src/monitor.ts`.
2. **Container cut-over — DONE 2026-08-07.** Domains on watchparty-app
   (per-request DB clients; DB-touching probes verified incl. after-idle).
   Rollback stays one command: `node scripts/cf/attach-domains.mjs` (no arg).
   The ~1% exceededMemory error class is gone from visitor traffic.
3. **Money-path tests + CI gate — DONE 2026-08-07.** 27 tests (base-unit
   BigInt conversion, memescope filters, chain maps, formatters); `test` job
   in deploy.yml gates deploy + deploy-container.
4. **Split dev DB from prod — DONE 2026-08-07.** Free project
   `hghxcuroanzhxgsklqmq` (aws-1-us-west-2 pooler — direct host is IPv6-only),
   113 tables via setup-dev-db.mjs; local .env.local now points DATABASE_URL +
   DIRECT_URL at it (prod stays in .env / DOTENV_PRODUCTION). Discipline:
   schema SQL under db/ gets applied to BOTH projects. NOTE the incident this
   uncovered + fixed: drizzle.config's .env.local override sent the first push
   to PROD (restored same night — db/restore-2026-08-07-*.sql); pushes now go
   through DRIZZLE_DB_URL + target verification. Storage/realtime keys still
   prod in local dev (full isolation = copy the dev project's SUPABASE_* keys
   into .env.local when wanted). Dev == prod DB is the biggest
   pre-launch risk. Options: Supabase branch (MCP `create_branch`) or second
   project; swap local DATABASE_URL; keep db/schema sync discipline.
5b. **Feed quality — DONE 2026-08-07.** Alerts: brand-squat gate (\$CLAUDE/
   \$ANTHROPIC/… need \$250K liquidity; word-boundary apple/aapl) + Mobula
   security adoption gate (honeypot/taxes/score/holder concentration,
   fail-open, 12 lookups/pass). 8 junk rows purged from tracked_tokens.
   Boards: copycat collapse (one row per symbol+name, best copy wins) +
   server-computed `risky` flag with hide-risky toggles (memescope dialog +
   discover pill). Thresholds live in lib/coin-feed/quality.ts; 37 tests.
5. **Security housekeeping — NOT STARTED.** Rotate CLOUDFLARE_API_TOKEN (two
   flagged pastes: 2026-06-20, 2026-08-06) per docs/cloudflare-token-rotation.md;
   rotate .env.production:54 secret; DMARC p=none → quarantine after reviewing
   rua reports. Mostly needs the user's dashboards.

## ✅ Perf pass (2026-07-31, local — pending deploy)
- **`/api/rpc` caching** (`app/api/rpc/route.ts`): allowlisted read-only Solana/Helius
  methods cached in Upstash with per-method TTLs (`RPC_*` in `lib/cache.ts`); stores only
  `result`, replays with the caller's id. send/simulate/blockhash/fees/batches NEVER cached
  (bypass); upstream errors + null results never cached (skip). `x-rpc-cache` header
  (hit|miss|bypass|skip) for observability. `HELIUS_RPC_URL` env override added (used by bench).
- **Feed anon caching** (`server/routers/feed.ts`): signed-out pages of getFeed / getVideoFeed /
  getShortsFeed cached via local `cacheRows` (superjson envelope inside `withCache` — plain JSON
  would string-ify Dates; a BARE superjson string gets auto-JSON.parsed by the Upstash client on
  GET, hence the `{s: ...}` envelope). Keys versioned (`feed:anon:v1:*`, `feed:video:anon:v1:*`,
  `feed:shorts:anon:v1:*`). TTL.CONTENT_FEED (120s) — was earmarked, now actually used.
- **`getUserHistory` cached 60s** (`lib/feed-ranker/history.ts`) — was fetched twice per ranked
  first page (retrieval + rank).
- **getFeed ranked reads parallelized** — mutes/blocks + candidate pool + OON retrieval now fire
  in one Promise.all (was 3 serial round trips).
- **`coinFeed.coverage` cached 5 min** (`server/routers/coinFeed.ts`) — was a Postgres hit per
  cold rail mount.
- **Audited, deliberately unchanged:** discover (already cached), trending (batched + indexed;
  its `chains`/`stats` procedures have ZERO callers — wrap in withCache 60s if ever wired to UI).
- **Elysia prototype** at `services/rpc-proxy/` (Bun; CACHE_DRIVER=memory|upstash|off, mock
  upstream, `bun run bench.ts`). Localhost bench (200 req @ 20 conc, cache-hit path): Next dev +
  Upstash p50 504ms (dev-mode inflated, not prod-representative), Elysia + Upstash p50 43ms,
  Elysia + in-process Map p50 6.4ms; uncached passthrough ~53ms on both (Helius RTT ≈ 50ms).
  Takeaway: caching (shipped above) is the real win; Elysia's extra edge is the in-process cache
  a long-lived Bun process allows (~35ms/hit saved vs Upstash REST) — only worth a new platform
  if the endpoints prove hot. See "Elysia Bun microservice" in Bigger workstreams.

## 🧵 mugen virtualized lists — evaluation, pilot REVERTED (2026-07-31)
Owner wants `@wingleeio/mugen` (v0.8.0, still installed) for lists. **Scope reality (mugen's own
docs):** vertical, text-dominant, structurally-regular rows ONLY — no horizontal/grids, no
media-of-unknown-height rows, and adopted rows must be REBUILT from its primitives
(Text/VStack/HStack/Escape; layout via props, NOT Tailwind spacing classes; one Text = one
font+color, so multi-color inline text isn't expressible). That rules out most signature
surfaces (video cards, carousels, PostCards, token tables, grids) — "every list" is not the
right frame. Full text- vs media-dominated surface inventory was audited 2026-07-31 (only
browse-feed + alerts-rail virtualize today, via broad-infinite-list; community chat =
highest-pain unvirtualized surface).
- **Stream-chat pilot built then REVERTED same-day (owner decision: keep the Twitch-style
  inline colored name+text).** mugen cannot express inline two-color rows (one Text = one
  font/color); the stacked fallback changed the look and inline made names wrap mid-word.
  `stream-chat.tsx` restored to HEAD (plain map + force-scroll), `stream-chat-list.tsx`
  deleted. Learnings (if mugen is revisited for other surfaces): next/font family names must
  come from the `--font-geist-*` CSS vars for canvas-measurable font strings; ChatIdentity
  pattern = useMugenState + useMugenEffect with tRPC `profile.card.fetch`; verified
  stickToBottom/initialScroll/wrap measurement all worked in a headless smoke (200 rows,
  live appends).
- **Any future mugen surface must not need inline colored/styled text.** That kills the whole
  Twitch-style chat family (stream chat, community chat mentions/links/emoji). Remaining
  candidates: DMs (`message-list.tsx` — bubbles are a mugen recipe; also fix its
  setInfiniteData-on-non-infinite-query mismatch noted in the audit), notifications rail,
  comments. NOT for: PostCards/feeds/grids/tables/carousels (media height is out of regime).



## ✅ Done (live in prod)
- **Vercel → Cloudflare** migration: `watchparty.xyz` + `www` live; CI auto-deploy via GitHub Actions (3 workers: app, realtime, cron); Hyperdrive→Supabase; Cloudflare Web Analytics. (deploy is CI-only — local `wrangler deploy` EPIPEs; see `docs/`/memory.)
- **Premium + creator subscriptions** live on mainnet: 8 platform plans, creator tiers/claim/payout, cron collect+sweep, Helius treasury watch → Discord alerts.
- **Premium overlay** Subscribe button fixed (default tier preselected).
- **Messages wallet bug** fixed (rehydrates Swig FROST share instead of false "generate wallet").
- **Legacy custodial wallets** migrated to Swig-only model (6 empty accounts reset; `db/legacy-wallet-migration.sql`, backup in `.treasury-keys/`).
- **RealtimeKit (Cloudflare Realtime) for Spaces audio** provisioned (app `f6c3e642-3c5b-40b3-9afc-664cea0f4b1b`, both presets); server token flow proven against live API; DB col `community_spaces.media_meeting_id` applied; env in place.

## ▶️ Spaces audio — DEPLOYED 2026-06-21 ✅ (server side); needs live mic test
Deployed (run 27908554134, all 3 workers green). Verified on the live `watchparty`
worker: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_REALTIME_APP_ID + CLOUDFLARE_REALTIME_API_TOKEN
all present → `isMediaEnabled()` returns true in prod → `getMediaToken` mints real tokens.
**Remaining (manual, can't automate): two-browser/mic test** — open a LIVE Space in two
browsers, join audio, confirm SFU connect + mic publish + speaking rings. Ping to debug.

(Note for future deploys: `DOTENV_PRODUCTION` secret is the source of truth, built from
the merge of .env + .env.local + .env.production.local. Do NOT `gh secret set
DOTENV_PRODUCTION < .env.production` — that file lacks ALERT_WEBHOOK_URL.)

## 🐞 Spaces — known issues (investigate)
- **`__name is not defined` on the spaces route (prod only).** Console throws
  `Uncaught ReferenceError: __name is not defined at spaces:10`. NOT in the local
  Turbopack build (`.next` has zero `__name`) → injected by the OpenNext/esbuild
  worker bundle into a server-rendered inline script. Appears non-fatal (page
  hydrates, audio SDK runs), but should be root-caused. Likely an esbuild
  keep-names helper getting separated from its usage in the OpenNext build.
- **Realtime roster-change WS not reaching browsers.** Server publish verified
  working (POST → 200, wrong secret → 403, host baked into client, token route
  exists), but the live event didn't refresh either client. Worked around with a
  5s poll + actor-side refetch (commit 58a4540). Still verify the client WS
  actually connects (check `/api/realtime/token` + DO onConnect token verify in a
  browser) so cross-user updates are instant, not 5s-polled. Affects all realtime
  surfaces (channels/DMs), not just spaces.

## ⚡ Instant-nav session follow-ups (2026-07-21, all shipped 018142e..96b0a4b — deployed green)
Shipped: sliding tab underlines (profile + discover), tab-content fade-in, sidebar
pending dim (useLinkStatus), offline toast, hover-intent prefetch (sidebar nav data,
post detail + comments, profile route + Home-tab data via MiniProfile, token rows),
pointerdown navigation (post cards + token rows), and a bug fix: search user results
linked to nonexistent `/user/<name>` — every profile click from search 404'd.

Manual prod verify (minutes, in one browsing session):
- [ ] Profile + discover tab underline slides between tabs; content fades in.
- [ ] Hover a post ~1s then click → detail + comments paint with no skeleton.
- [ ] Hover a username until the mini-card opens, click through → profile lands
      with Home-tab hero/videos already populated.
- [ ] Click a user result on /search → profile loads (was a 404 before).
- [ ] Post cards/token rows navigate on mouse DOWN; like/media/quoted-post/avatar
      clicks inside a card still do their own thing (the guard heuristic).
- [ ] DevTools offline toggle → sticky "You're offline" toast, gone on reconnect.

Follow-ups (small, whenever):
- Extend `useHoverPrefetch` to remaining surfaces: notifications rows, home video
  cards, communities list, search result data (post results).
- Pointerdown-nav trade-off to watch: drag-to-select on plain post text navigates
  instead of selecting (guards documented in `hooks/use-instant-nav.ts`; removing
  it from post cards is a 2-line revert if it annoys).
- `.next/dev/types` is corrupted locally (tsc noise, `.next`-only errors) —
  `rm -rf .next/dev` regenerates; filter with `grep -v '^\.next/'` meanwhile.

## 🔜 Loose ends (small)
- **Buy crypto with fiat (Stripe) — button HIDDEN until it exists** (2026-08-03). The
  receive view's "Buy \<SOL\> with Fiat" button is removed from
  `components/wallet/wallet-drawer2/views/receive/receive-view.tsx`. Nothing was ever
  wired behind it, and receive is the one screen people reach *because* they hold no
  balance, so a dead button lands worst there. Plan is **Stripe** as the on-ramp.
  - `onBuy` is still on `ReceiveViewProps` and still passed down from the drawer, so
    restoring the button is re-adding the markup, not re-threading a callback.
  - The equivalent Buy action in the TOKEN view (`views/token-view/TokenActions.tsx`,
    both drawers) was left alone — only the receive screen was asked for. Decide whether
    that one should go too, or whether it's the natural first place to wire Stripe up.
  - Note there are two drawers: `wallet-drawer2/` is the live one (`wallet-button.tsx`
    lazy-imports it); `wallet-drawer/` is the older copy and still has its button.
- **AI assistant panel behind home's dock button** (2026-08-01). Home now has a 4th column
  (`components/home/home-action-dock.tsx`) mirroring X's Grok/Chat dock. The messages button
  is live (routes to `/messages`, real unread badge off `conversation.getUnreadCount`); the
  **star button is deliberately inert** and its tooltip says "coming soon". Owner's call: it
  gets a real assistant panel — a new tRPC endpoint streaming from Workers AI
  (`@cf/zai-org/glm-5.2`, same account API the predictions factory uses in
  `lib/predictions/factory.ts`), opening as a docked panel anchored above the button rather
  than a route. When that lands, swap the no-op `<button>` for the panel trigger and drop
  the "· coming soon" from the tooltip label.
- **Test a real USDC subscribe** end-to-end on mainnet once funds available (only unproven money path).
- **Rotate chat-exposed Cloudflare tokens** — `docs/cloudflare-token-rotation.md` (two `cfat_…` tokens + realtime token).
- **Wallet-connect state in premium overlay** — if no wallet connected, Subscribe just toasts with no connect entry point; add a "Connect Wallet" state.
- **`verifiedTier` in better-auth `additionalFields` — confirm sign-UP still works (2026-07-30).**
  Added so every session payload (including multiSession's device list) carries the
  tier and the account switcher can badge each row without a per-account lookup.
  Verified already: better-auth boots with it (`/api/auth/ok` → `{"ok":true}`), and
  its own adapter returns it on a real user (`auth.$context` →
  `internalAdapter.findUserByEmail` → `verifiedTier: null` present in the keys).
  Unproven: the INSERT path on a brand-new sign-up. It should be fine —
  `last_signed_in` is already `{ input: false }` with no default and sign-ups work —
  but if a new account fails to register, **the fix is one line**: drop `verifiedTier`
  back out of `lib/auth/server.ts` additionalFields and have the switcher fetch tiers
  through tRPC instead (`components/wallet/wallet-drawer2/components/wallet-header.tsx`
  reads `a.user.verifiedTier`; `lib/auth/client.ts` declares it on `DeviceSessionRow`).

## 🧪 Gamification test runbook (all shipped code, zero live usage — run in order)

Automated (green as of 07-19): `bun run test` — 14 unit tests pinning the frozen XP
curve, award-catalog caps, and quest periodKey/reset ISO-week edges. Run before any
change to `lib/xp.ts` or `lib/quests.ts`.

Manual, cheap (one account, minutes each):
- [ ] **XP basics** — make a post → `xp_events` row (+10), LV pill progresses; comment on
  someone else's post (+5); click your own exp bar → breakdown popover lists both.
- [ ] **Quests** — after the post above, `/quests` shows "Make a post" complete, quest
  toast fired top-center, +25 XP auto-claimed (check breakdown).
- [ ] **Toasts** — earn ~100 XP total → "Level up! You reached Level 2 🎉" toast +
  notification within ~45s of the award.
- [ ] **Prediction XP** — place a $1 bet → +20 XP + "Back a prediction" quest completes.
- [ ] **Perps XP** — open a tiny position → +25 XP within seconds (reportFill verified
  against the ER; a rejected/failed open must NOT award).

Manual, two accounts (A = trader, B = follower):
- [ ] **Follow/like XP** — B follows A (+15 to A, once ever per pair); B likes A's post
  (+2 to A; unlike→relike must not double-award — check xp_events count).
- [ ] **Callout loop** — A calls out a live token: button cooldown starts (6h countdown),
  B gets in-app notif + **web push** (B needs push enabled in settings first),
  `/trade/callouts` feed shows the row, View chip opens the token.
- [ ] **Trade pipeline** — A enables "Share trades", buys ~$2 of a token in-app →
  within 10 min: trade confirmed (trade-verify), PnL card shows volume/trades,
  Trades tab row appears, B gets "bought $TICK" notif + push with Copy chip.
- [ ] **External trade (4a-2)** — with sharing ON, A swaps directly on Jupiter from the
  linked wallet → trade appears (source `wallet`) within seconds, same fan-out.
- [ ] **Prepared copy** — B subscribes to A (creator sub), sets copy config ($2/copy,
  $5/day) → A buys → B gets sized "Copy ready" push.
- [ ] **🔴 HANDS-FREE E2E (supervised, $2 cap — the gate before real users)** —
  B enables hands-free (one FROST signature; verify the executor role appears
  on-chain), A buys ~$3 in-app → B should get "Copied…" push, `copy_orders` row
  `executed`, trade in B's history, Recent copies shows it. Then: cap-update button
  (sign, verify on-chain), disable (role revoked on-chain). Ping the other chat's
  Claude or this one to watch copy_orders + worker logs live.
- [ ] **Autopause path** — drain B's Swig USDC to ~$0, A buys 3 times → 3 failed
  copy_orders → config auto-pauses + B gets the pause notification.
- [ ] **Sub-gate** — cancel B's creator sub → copy dialog reverts to subscribe prompt;
  no pushes/executions fire on A's next buy.

Cron/infra spot-checks (read-only):
- [ ] `callout-performance`, `trade-verify`, `pnl-snapshots` return 200 in cron worker
  logs every 10 min; `sync-assets-webhook` daily run lists `userTrades` webhook.

## ⏳ When Next 16.3 is stable (Instant Navigations — from aurorascharff/next16-social-media review, 2026-07-21)
Gate: 16.3 out of preview AND `@opennextjs/cloudflare` supports it (cacheComponents
support there is the likely laggard — verify before starting). Watch these OpenNext
issues as the signal: [#1300](https://github.com/opennextjs/opennextjs-cloudflare/issues/1300)
(16.3 compat question), [#1225](https://github.com/opennextjs/opennextjs-cloudflare/issues/1225)
+ [#1130](https://github.com/opennextjs/opennextjs-cloudflare/issues/1130) (cacheComponents
broken in prod on Workers). When upgrading, bump Next AND the adapter in the same
commit — adapter lag has 500'd every dynamic route before (their closed #1258).
Reference clone was reviewed 2026-07-21; patterns worth adopting then:
- **Partial prefetching** (`partialPrefetching: true`) — prefetch the shared app
  shell as links enter the viewport. Directly serves the speed rule; users browse
  prod, so perceived nav speed is the win.
- **Runtime prefetching** (`export const prefetch = 'allow-runtime'` per page) +
  **hover-gated prefetch** for low-intent link lists (trending/tag-style rails) so
  render doesn't wake the server per link.
- **`useOffline` from `next/offline`** (`experimental.useOffline`) — replace the
  hand-rolled `navigator.onLine` listener in `components/app-ui/offline-indicator.tsx`.
- **`@next/playwright` `instant()` assertions** — perceived-speed regression tests
  (assert navigations stay instant + loading states appear). Could seed the first
  real test suite.
- **`'use cache'`/`cacheTag`/`updateTag`** — only if/when any read path moves out of
  tRPC into RSC; not a goal by itself (data layer stays tRPC per CLAUDE.md).
- **Who-to-follow row morph** — when discover's right rail gets real follow
  suggestions (still mock data today), animate the followed row out
  (motion layoutId or ViewTransition share="morph").

## 🔭 Bigger workstreams (own focus / own chat)
- **Multi-wallet: up to 25 wallets linked/created per user** (owner, 2026-07-21).
  Today the model is one `user.wallet_address` (+ Swig). Needs: a `user_wallets`
  table (address, chain, label, kind: linked|created, primary flag), link/create
  flows in settings, and every "the user's wallet" read (tips, subs, trades,
  premium) resolving through a primary/selected wallet instead of the single
  column. Related owner rule: wallet addresses are never DISPLAYED in UI
  (about-card display removed 2026-07-21; only settings account-linking still
  shows the owner their own truncated address).
- **Kill lucide-react, standardize on hugeicons** — owner wants lucide gone entirely
  (2026-07-20: "almost uninstall lucide... dislike that library a lot"). Currently
  three icon systems coexist: `components/icons.tsx` (custom, by far the largest
  footprint — profile/moderation/badges/wallet-actions), `lucide-react` (still
  broad — most non-profile UI), and `@hugeicons/react` (barely started: just
  `predictions/market-detail.tsx` + `messages/new-conversation-dialog.tsx`). Needs
  a real pass: audit every `from "lucide-react"` import, replace with the hugeicons
  equivalent (or a custom `icons.tsx` entry where none exists), then `bun remove
  lucide-react`. Not started — this session only matched local file conventions
  (custom icons.tsx) when touching profile/moderation/wallet-drawer files, which
  moved a few files further from hugeicons, not toward it.

- **Design pass across surfaces (NEXT — own chat)** — owner-led, reference-driven.
  Order: (1) profile pages: Discord-style earned-badge strip + roles/identity stacking
  + avatar-anchored mini-profile popout — reference distilled in
  `docs/references/design-profile-badges-discord.md`, badge sources already live
  (levels, callout hits, top-caller/trader finishes, premium tier, quests);
  (2) video + live pages; (3) predictions redesign; (4) callouts page; (5) token page;
  (6) community pages tinkering. Read `docs/design-principles.md` first, as always.
- **XP / quests / callouts (gamification)** — full design in `docs/exp-callouts.md`. Phases 1–3 SHIPPED (XP ledger/levels/profile badge 07-12; callouts + `/trade/callouts` + performance cron 07-12; quests + `/quests` sidebar page 07-13). Phase 4a-1 trade recording SHIPPED 07-13; Phase 4b realized-PnL snapshots + Phase 4c social layer (shareTrades opt-in, trade notifications + push, profile PnL card, Top Traders tab) SHIPPED 07-17, plus callout web push, level-up notifications, predictions XP/quests. 07-18: unrealized PnL (mint_prices cache), 4a-2 external-trade webhook, perps XP (ER-verified fills), copy-trade tiers 1–2 all SHIPPED. 07-19: copy-trade SHIPPED (sub-gated caps + sized "Copy ready" pushes + dialog/management UI), profile Trades tab, Live trades feed, XP toasts + breakdown popover, referral XP cap tightened. Walk-away auto-copy BUILT 07-19 (chain-capped Swig executor role via FROST; inert until `COPY_EXECUTOR_SECRET` is provisioned — see doc §4d OPS). Gamification arc COMPLETE. fomo.family PnL/copy-trade layer deferred until per-user trades are tracked (design in doc §4).
- **Lists + Community Notes (post-menu features, deliberately not faked 2026-07-22)** —
  the two remaining X-style post-menu rows. **Lists** needs its own system: tables
  (lists, list_members), CRUD router, "Add/remove from Lists" submenu in the post/user
  menus, and a surface to view them (e.g. `/lists` + per-list feed) — solid one-session
  feature. **Community Notes** needs contributor/rating infrastructure (submit note,
  rate helpful, publish threshold) — bigger, design first. Everything else from the X
  own-post menu screenshot is SHIPPED (delete, pin, highlights, disclosure, reply
  privacy, analytics, embed — 58d4c0b + 1af903a).
- **Realtime/PartyKit migration** — `realtime/` worker + `deploy-realtime` job exist; remaining surfaces: DMs, presence/typing, feeds, live stream chat, Spaces coordination; then delete `lib/supabase/realtime-client.ts`. (See `realtime-video-architecture-direction` memory.)
- **Elysia Bun microservice for hot stateless endpoints (explored 2026-07-31; skill installed at `.agents/skills/elysiajs`)** —
  only worth doing if these endpoints prove demonstrably hot (need real traffic numbers first): carve out
  (1) the `/api/rpc` proxy + Helius webhook ingest (burst traffic, dumb passthrough — ideal candidates) and
  (2) the `udf`/`pyth-udf` TradingView datafeeds (polled constantly by chart clients)
  into a standalone Elysia-on-Bun service (Fly.io/Railway/VPS) co-located with the DB or RPC provider.
  Buys real per-request overhead reduction (Elysia's perf edge is Bun-runtime-only; on CF Workers the
  framework is NOT the bottleneck — DB + third-party API latency is), but costs an extra platform, deploy
  pipeline, and a network hop off the edge. Net win only if the endpoints are demonstrably hot.
- **IVS + Cloudflare video hybrid** with admin toggle — StreamProvider abstraction (ivs + cloudflare-stream), per-stream + global toggle, mirroring `lib/chains/` ChainAdapter pattern.

## ⚠️ Env-file note (avoid confusion)
Two prod env files coexist: `.env.production` (RealtimeKit work) and `.env.production.local` (Cloudflare migration work). The single source of truth for the deploy is the **`DOTENV_PRODUCTION` GitHub secret**, which must be built from the merge of `.env` + `.env.local` + `.env.production.local`. Consider consolidating the two files later.
