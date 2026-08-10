# Twitch Stream Manager — reference (screenshot + research)

Companion to `docs/studio-kick-reference.md` for the watchparty creator
**studio**. Transcribed 2026-08-10 from an owner-supplied screenshot of
Twitch's **Stream Manager**, enriched with a docs-research pass (sources at
bottom). Twitch is the maximal model (a dense editable cockpit); Kick is the
flatter one we lean toward for overall IA. Both fold into
`docs/studio-execution-plan.md`.

## Shell

- **Top bar** = live vitals + identity. Left: hamburger, **"Stream Manager"**
  title with a **`Layout: Layout 1 ▾`** switcher (up to 5 saved layouts).
  Then a row of **stat tiles**: **Session** (`0:00:00`) · **Viewers** (0) ·
  **Followers** (0) · **Bitrate** (—) · **Offline / Horizontal ⓘ** (status +
  orientation) · **Set Up / Vertical ⓘ** (vertical-stream setup). Right:
  dashboard search, help, an AI sparkle, gifts/bits (badge "2"), chat, avatar.
  (Note: Twitch puts the vitals in the HEADER; Kick puts them in a "Session
  Info" widget. Same data, different placement.)
- **Left icon rail** (collapsed, icon-only, expandable): exit · Home ·
  **Stream Manager** (active) · Ads · Analytics › · Community › · Content › ·
  Revenue › · Moderation › · Settings › · Emotes › · Roles · Video ·
  Extensions · Creator-education · Safety. Each › expands a group.

## The widget grid

Five columns of independent, renamable (▾), reconfigurable (⋮) widgets:

### Stream Preview (large, left)
The outgoing broadcast thumbnail. OFFLINE state shown; a settings gear sits
in the corner and a small self-preview tile bottom-left.

### Activity Feed (col 2)
Follows / subs / cheers / raids, with a **Filter** and a mute toggle. Empty
state has personality: "It's quiet. Too quiet… We'll show your new follows,
subs, cheers, and raids activity here."

### My Chat (col 3)
The channel's live chat ("Welcome to <name>'s chat room!") with a composer
carrying a shield (mod), gear, and the purple **Chat** send button — the
streamer mods from the same chat viewers use.

### Quick Actions (col 4)
A vertical stack of chunky, color-coded one-click buttons — the curated
in-stream action strip:
- **Edit Stream Info** (primary/purple, pencil)
- **Clip That** (film; disabled while offline)
- **Raid Channel** (magenta, parachute)
- **Manage Goals** (magenta, star)
- **Stream Together ↗** (magenta, person+; multi-guest)
- **`+`** tile to add/curate more actions
Full catalog (from research): Clip · Run Ad · Add Stream Marker · Raid · Stop
Raids 1hr · Manage Goal · Charity toggle · Squad/Stream Together · Emote-/Sub-/
Follower-only chat · Clear Chat · Start Prediction · Manage Poll.

### AutoMod (col 5)
Its own panel with an off/on state + explainer: "AutoMod is Off — AutoMod
automatically holds risky messages for moderators to review. You can turn it
on here."

## Other Stream-Manager widgets (from research, not all in the shot)
Stream Health (bitrate/fps/dropped-frames/ingest — flashes only on trouble),
Recent Followers, Stream Markers (`⌘/Ctrl+B` or `/marker`), Mod Actions
(audit + one-click undo), Polls & Predictions (Affiliate+), Goals, Channel
Charity. Layout mechanics: drag/resize/pop-out every widget; **Edit Layout**
mode; up to **5 saved layouts**; a separate **Mod View** board.

## Creator Dashboard IA (beyond Stream Manager)
- **Insights** — Channel Analytics (Overview, Stream Summary, Discovery,
  Engagement, Earnings) + per-broadcast Stream Summary.
- **Content** — Video Producer (VODs + Highlights), Clips, Collections
  (playlists), Featured Content.
- **Community** — Roles (Editors/Mods/VIPs), Followers, Chat settings + AutoMod.
- **Viewer Rewards** — Channel Points, Bits, Hype Train, Charity.
- **Monetization** — subs, payouts, Ads Manager.
- **Settings → Stream** — the **Primary Stream Key** (Show/Copy) + ingest.
- **Edit Stream Info** fields: Title (140), Category, Tags (≤10), Language,
  Branded-content flag, Goals, go-live notification text. All editable live.

## → watchparty studio mapping (synthesis with Kick)

The research agent verified against our code: **the backend is well ahead of
the studio UI.** The roadmap is mostly *surfacing* existing procedures into a
cockpit, not new infra.

- **Convert the Streams page from a form into a widget cockpit** (studio S3).
  Panels, priority-ordered, with existing backing:
  1. **Stream Preview** — embed the IVS `playbackUrl` (already from `getMine`)
     / reuse `components/streaming` player.
  2. **Live Chat** — `stream.getChatToken` + `pinChatMessage` + `setChatMode`;
     the single biggest gap (no chat in the studio today).
  3. **Activity Feed** — follows/subs/tips AND watchparty-native **on-chain
     events** (coin buys, first-buyer launches, USDC tips) — a crypto Activity
     Feed is our differentiator. Backed by `notification` + `topGifters` +
     coin-feed emitters.
  4. **Stream Health** — bitrate/fps/dropped/ingest; needs one small new
     procedure reading IVS/CloudWatch metrics. Highest-value diagnostic.
  5. **Quick Actions** strip — start with what exists: chat-mode toggles, pin,
     copy share link, Go-live/End; add Clip/Raid/Goals as they land.
- **Vitals placement**: adopt Kick's "Session Info" widget OR Twitch's header
  row — Session/Viewers/Followers/Subs/**Time-Live** (needs a broadcast-start
  timestamp) and (when live) **Bitrate**.
- **Expand Stream Info** to parity: add **Tags** + **Language** + a
  **category picker** (typeahead, not free text) to `stream.updateInfo`;
  decide the title cap (Twitch 140 vs our 100).
- **Add a Community section** (nav): Roles (mods/VIPs via `creator.ts`),
  Followers, Chat settings (`getWelcomeMessage`), Banned/Muted
  (`moderation.getBannedUsers`) — homeless backend, near-free win.
- **AutoMod analog** — surface an on/off moderation-hold state (we have
  moderation primitives; an AI-mod toggle mirrors Kick's "AI Chat Moderation").
- **Saved layouts / pop-out widgets** — polish, defer past S3. A fixed
  responsive two-column ships first.

### Deliberate divergences from Twitch
- **Monetization stays a link-out to `/premium`** — don't rebuild payouts/subs
  in the studio (matches the shell + premium-hub IA memory).
- **Skip Ads Manager** — our money model is subscriptions + on-chain, not video
  ad breaks. (The `/api/ad/*` platform is a separate advertiser product.)
- **Don't conflate chat Polls with our on-chain Predictions product** — a
  lightweight live chat poll is fine; the Predictions market is its own thing.
- **Goals** (follower/sub) map cleanly to creator subscriptions — cheap, good
  Activity-Feed companion.

## Sources
Screenshot (owner) + StreamRise, IFTTT, The Emergence, Blerp, StreamScheme,
Metricool write-ups and Twitch help/ingest/dev URLs (full list in the research
transcript). Twitch help is a JS SPA that WebFetch can't read directly, so
prose facts are triangulated from those secondaries.
