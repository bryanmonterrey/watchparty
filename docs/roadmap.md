# watchparty — build roadmap

Working backlog toward launch. Ordered roughly by the sequence we agreed to tackle.
Status legend: ⬜ not started · 🟡 in progress · 🟢 done · 🔵 needs user/external action

---

## 1. Amazon IVS — complete implementation ⏸️ (deferred)
**Decided:** broadcast model is **OBS + stream key** (ingest URL + key reveal UI; no
browser WHIP for now). Deferred until later — picking up other work first.

Server code is already ported from `../sidebar` (`server/routers/stream.ts`,
`app/api/webhooks/ivs/route.ts`); `@aws-sdk/client-ivs` + `-ivschat` installed;
`.env` has `AWS_*` keys (currently the **old sidebar account's** — must be replaced).

- 🔵 Create a **new AWS account** + IAM user with least-priv IVS/S3 policy → new
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_ACCOUNT_ID` / `AWS_REGION`.
- 🔵 Create S3 bucket for VOD recordings → `AWS_IVS_RECORDINGS_BUCKET`.
- ⬜ Wire **EventBridge → webhook** (`/api/webhooks/ivs`) for live/offline state;
  verify `IVS_WEBHOOK_SECRET`.
- ⬜ Confirm recording configuration auto-creates (S3 perms) and VOD plays back.
- ⬜ **Broadcaster / "go-live" UI** — OBS + stream key (ingest URL + clean key
  reveal); `components/settings/stream-settings.tsx` already exposes a key.
- ⬜ Create the **`/live` route** (does not exist yet) — viewer page + live chat.
- ⬜ End-to-end smoke test: go live → viewer sees stream → chat works → VOD saved.

## 2. Search page 🟡
- 🟢 **Categories**: `/category` index (full 612-category catalog from
  `kick_categories.json` via `lib/data/all-categories.ts`) + `/category/[slug]`
  detail (resolves any catalog slug; also fixes the home page's previously-dead
  category links). `HOME_CATEGORIES` stays the curated home-row subset. Shared
  `CategoryCard`.
- 🟢 Unified search-landing discovery (Live rail + categories preview) for mobile
  + desktop, replacing the old mobile-only home / bare desktop empty state.
- 🟢 Result tabs (All / People / Videos / Media / Posts / Categories) with
  counts; results classified by content type (video / media / text) client-side,
  categories matched against the catalog. Tab bar scrolls on mobile.
- 🟢 Fixed `getVideoFeed` category filter: `"Live"` now means `isLive=true` (the
  Live rail was matching a literal category before); other categories match
  case-insensitively. NOTE: 0/54 posts are currently categorized, so category
  detail pages stay empty until creators tag content.

## 3. Premium page 🟢
- 🟢 `/premium` hub (sidebar "Premium" now routes here instead of opening the
  modal): marketing hero, "What you get" highlights, individual plan cards, and
  a business teaser — all opening the existing UpgradeOverlay for checkout.
- 🟢 Subscriber view: current plan, renew/end date, Change plan, Manage ads,
  Cancel auto-renew (reuses `premium.getStatus` / `premium.cancel`).
- The signup overlay + on-chain subscribe flow already existed; this adds the
  page destination around it.

## 4. Chat on profile/user pages 🟡
- ⬜ Implement chat on user pages that works **in unison with the `/live`
  livestream chat** (shared chat component / room model).

## 5. Profile page 🟡
- Audit (2026-06-28): `UserProfile` is fully assembled (banner, avatar, header,
  tabs, tab content, about, stats, edit + followers dialogs) and rendered via
  `app/(app)/[slug]`. No stubs found — needs a visual polish pass, not building.

## 6. Token page 🟡
- Audit (2026-06-28): `TokenProfile` is fully assembled (header, market overview,
  stats, description, swap card, charts, trades table) and rendered via
  `app/(app)/[slug]`. Trades use real tRPC.
- ⬜ **Holders breakdown** is the one real gap — `token-holders-table` is a
  "coming soon" stub needing an on-chain indexer (Helius DAS / Birdeye). Blocked
  until tokens are live on mainnet (most are drafts). See the `helius` skill.

## 6b. Video watch page — comments 🟢
- 🟢 Wired the real `CommentSection` (tRPC `comment.*`) into the video page,
  replacing the "Comments coming soon" stub. (Found during the token audit.)

## 7. Trade page 🟢
- Audit (2026-06-28): trade board built (`TradeView` → `TradeFeed`/`MobileTrade`)
  and reads live `trpc.trade.getFeed`. Removed the unused `mock-data.ts` (dead
  code, no importers). Looks complete; revisit only for polish.

## 8. Home carousel — ambient mode 🟢
- 🟢 Ambient glow behind the hero strip: the active video's frame, heavily
  blurred + saturated + bled out, keyed to the active thumbnail (one static
  layer, no per-frame work; clipped horizontally so it never widens the page).

## 9. Mobile web → app redirect ⬜
- ⬜ Mobile browser hitting the site shows a **redirect/landing page** pointing to
  the iOS app or Android app (App Store / Play Store smart banner).

## 10. Messages page 🟡
- ⬜ Complete the messages page (`app/(app)/messages`).

## 11. Communities 🟡
- ⬜ Complete community pages (`app/(app)/communities`).
- ⬜ **Bot integration** (Discord-style).
- ⬜ General polish — make community pages and the app overall better.

## 12. Marketing landing page 🟡
- ⬜ Complete the marketing landing page (`app/(marketing)`).

## 13. iOS app — full completion ⬜
- ⬜ Complete the Expo iOS app (`mobile/`) end-to-end.
