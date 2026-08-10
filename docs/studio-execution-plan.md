# Creator studio — execution plan

The phased build of **studio.watchparty.xyz**, the creator counterpart to the
developer console. Grounded in two references (transcribed from owner
screenshots + docs research on 2026-08-10):

- **`docs/studio-kick-reference.md`** — Kick's Stream Manager (our closer
  structural model: flat IA, one-page live cockpit, and — critically — Kick
  runs on **AWS IVS, the same backbone watchparty already uses**, so ingest /
  health / preview map almost 1:1).
- **`docs/studio-twitch-reference.md`** — Twitch's Stream Manager (the maximal
  model: an editable widget grid + Quick Actions strip we borrow selectively).

**The guiding insight (both research passes, verified against our code):** the
**backend is far ahead of the studio UI.** `stream.ts` (chat token, chat modes,
pin, roles, gifters, viewers), `moderation.ts` (ban/mute/banned-users),
`creator.ts` (mods/VIPs/welcome/mass-message/emotes), and `content.ts` (VODs,
clips, playlists, drafts) already exist. The studio roadmap is mostly
**surfacing existing procedures into a cockpit**, not new infrastructure.

**North star:** Kick's model, not Twitch's. Flat grouped sidebar, a one-page
live manager that doubles as the dashboard, single-tier subscriptions, lighter
moderation. Borrow Twitch's Quick-Actions strip and widget richness only where
Kick is thin. Express in watchparty's identity (pastels, our accent, aggressive
rounding, upgrade-overlay aesthetic) — never Kick's green or Twitch's purple.

**Where the studio lives** (see [[surface-taxonomy]]): a route group
`app/(studio)/` in the main app, host-rewritten from studio.watchparty.xyz —
NOT a separate app. It reuses the main app's tRPC routers and stream/chat
components directly. Lean provider stack (ReactQueryProvider only, no wallet
SDKs); on-chain/monetization actions link out to `/premium`.

---

## Shipped — S1 (foundation)

`042c69da` + `3eebb93d`. Host rewrite + `studio` reserved slug; `(studio)`
route group self-gating on the session cookie; lean shell (sidebar: Home /
Streams / Content / Analytics + Monetization link-out). A basic **stream
manager** (go-live/end toggle, generate ingest + reveal/copy server URL / key /
playback, title + category edit, live + viewer badge) on `stream.getMine /
generateConnection / updateInfo / setLiveStatus`. Home with a live-status hero;
honest Content (real post count + profile link) and Analytics (link to premium
charts) entry points.

## S2 — The live Stream Manager cockpit (the studio's identity)

Turn the Streams page from a **setup form** into a **live cockpit** — the
single most valuable phase, and mostly surfacing backend that already exists.
Kick's one-page manager is the layout; ship a fixed responsive grid first
(saved layouts / pop-out widgets are S6 polish). Panels, priority-ordered:

1. **Session Health badge** — Kick's exact five states (Healthy / Unstable /
   Misconfigured / Error / Offline) as a pill. IVS exposes stream-state +
   ingest signals; needs **one small new procedure** (`stream.health` reading
   IVS/CloudWatch). Highest-value add over today's live+viewer badge.
2. **Stat tiles** — Viewers · Followers · Sub Counts · **Time Live**. Viewers
   exists; followers/subs are countable; Time-Live needs a broadcast-start
   timestamp (add `startedAt` to the streams row, set in `setLiveStatus`/
   `startBroadcast`).
3. **Stream Preview** — embed the IVS `playbackUrl` (already from `getMine`);
   reuse `components/streaming` player.
4. **Chat panel** — `stream.getChatToken` + `pinChatMessage` + `setChatMode`;
   the biggest gap (a streamer can't see chat from the studio today). Broadcaster
   mods from the same chat viewers use.
5. **Channel Actions** — one-click chat toggles mapping onto existing
   `setChatMode` (`everyone|followers|subscribers`) + `chatFollowerMinutes`;
   extend with emotes-only / slow-mode / account-age. Plus a **Host/Raid**
   action.
6. **Activity Feed** — follows/subs AND watchparty-native **on-chain events**
   (coin buys, first-buyer launches, USDC tips). A crypto Activity Feed is our
   differentiator; backed by `notification` + `topGifters` + coin-feed emitters.
7. **Mod Actions feed** — moderation audit (backed by `moderation.ts`).
8. **Quick Actions strip** (Twitch borrow) — chunky one-click buttons: Edit
   Stream Info, chat-mode toggles, pin, copy share link, Go-live/End; Clip/Raid/
   Goals as they land.

## S3 — Content management (Video Producer analog)

`content-view.tsx` today is a count + link. Build the real surface — the other
half of the user's directive ("most of their content will be there"):

- **VODs / past broadcasts** — IVS auto-records (Kick, same IVS, retains
  30d/30 for verified). List, set private, delete (note Kick's "deleting a VOD
  reduces your stats" as a deliberate data decision).
- **Clips** — `content.ts` clip procedures; viewer- and creator-created.
- **Drafts & scheduled** — `content.getDrafts` / `getScheduledPosts`
  (protected, own content), with `deletePost` / `updatePostSettings` /
  `pinPost`.
- **Collections/playlists** — `getMyPlaylists` / `createPlaylist`.
- watchparty twist: content is **coin-linked** (every post creates a token
  draft — the token-first-buy model), so surface draft/launch state here.

## S4 — Community & moderation (homeless backend, near-free)

Kick's lighter model, not Twitch's AutoMod sliders. A **Community** nav group:

- **Roles** — Moderators / VIPs (and an OG-badge analog): `creator.getModerators`
  / `getVIPs` / `add*`.
- **Chat settings** — modes, welcome message (`getWelcomeMessage`), banned words,
  link-blocking (Kick's "AutoMod equivalent" = blocked-terms + link-block, not a
  branded product).
- **Banned / timed-out users** — `moderation.getBannedUsers`: searchable list
  with who/when/reason/expiry + unban.
- **Followers** list.

## S5 — Analytics (verified metrics)

Model on Kick's verified glossary (they emphasize platform-verified, not
self-reported): Average/Peak CCV, Unique Viewers, Hours Watched/Streamed, Chat
Rate, Unique Chatters, Follower/Subscriber counts + growth, Category Breakdown —
with period-over-period trend indicators. Split into **Overview** + per-**Stream
Summary** drill-down (after each broadcast: peak/avg viewers, new followers,
chat activity, top clips + watchparty-native **revenue this stream** = tips +
coin volume). Desktop-first is fine (Kick does the same).

## S6 — IA polish & the rest

- **Stream URL & Key** as its own nav item (Kick promotes ingest out of the
  manager — cleaner than S1's inline block; add a **Reset key** action).
- **Edit Stream Info parity** — add **Tags**, **Language**, a **category
  picker** (typeahead, not free text), and an **18+/mature** flag to
  `stream.updateInfo`. Decide the title cap (Twitch 140 vs our 100).
- **Revenue page** — surface subscription revenue, tips/gifts, claimable
  balance + next payout (creators **claim** their balance). Market it Kick-style:
  **"keep 95%, the 5% is processing"** — structurally identical to our existing
  `PLATFORM_FEE_BPS`. Actions still link to `/premium` (don't rebuild payouts).
- **Saved layouts + pop-out widgets** (Kick/Twitch), **customizable panel grid**
  (add/remove/reorder + reset) — a signature Kick touch that fits the
  design-quality goal.
- **Go live** as a persistent top-bar button in the shell.

## Deliberate divergences from the references

- **Monetization stays a link-out to `/premium`** — don't duplicate payouts/subs
  in the studio ([[premium-hub-settings-ia]]).
- **Skip Twitch's Ads Manager** — our money model is subscriptions + on-chain,
  not video ad breaks (the `/api/ad/*` platform is a separate advertiser
  product).
- **Don't conflate chat Polls with our on-chain Predictions** product — a
  lightweight chat poll is fine; the Predictions market is its own thing.
- **Lean Kick's single-tier subs** over Twitch's tiers + Bits complexity — maps
  cleanly onto the existing USDC subscription program.

## Recommended order

**S2 (stream cockpit) first** — it's the studio's identity, the backend is
ready (chat/preview/modes exist; only Session-Health + Time-Live are new), and
it's what "managing streams" means. Then **S3 content**, **S4 community**,
**S5 analytics**, **S6 polish**. S2 and S3 both serve the original directive;
either can lead, but the cockpit is the higher-identity, lower-new-code win.

## Status

- S1: **shipped** (`042c69da`, `3eebb93d`).
- S2–S6: specced above. Subdomain cutover (DNS + worker route for
  studio.watchparty.xyz → main app) is an ops step, like the console.
