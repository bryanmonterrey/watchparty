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
- 🟢 **Categories**: `/category` index + `/category/[slug]` detail (also fixes the
  home page's previously-dead category links); shared `CategoryCard`.
- 🟢 Unified search-landing discovery (Live rail + categories preview) for mobile
  + desktop, replacing the old mobile-only home / bare desktop empty state.
- 🟢 Result tabs (All / People / Posts / Categories) with counts; categories
  matched client-side against the browse list.
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

## 5. Profile page ⬜
- ⬜ Complete the profile page (`app/(app)/[slug]`).

## 6. Token page ⬜
- ⬜ Complete the token page.

## 7. Trade page ⬜
- ⬜ Complete the trade page (`app/(app)/trade`).

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
