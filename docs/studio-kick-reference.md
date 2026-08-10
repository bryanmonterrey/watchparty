# Kick creator dashboard — reference (screenshot transcription)

Reference for the watchparty creator **studio** (studio.watchparty.xyz), the
Kick/Twitch-shaped counterpart to the developer console's Discord/X references.
Transcribed 2026-08-10 from two screenshots of Kick's **Stream** tab (its live
Stream Manager), supplied by the owner. Kick is the closer structural model for
watchparty than Twitch (our channel/profile model already mirrors Kick's, and
Kick's dashboard is flatter and less cluttered than Twitch's widget maze).

Companion research (Twitch vs Kick creator-dashboard IA) folds into
`docs/studio-execution-plan.md`.

## Shell

- **Top bar**: hamburger (collapse nav), KICK wordmark (`BETA`); right — a
  prominent green **Go live** button (K glyph + "Go live"), avatar.
- **Left sidebar** (the whole creator dashboard IA), top to bottom:
  - **Stream** (active — the Stream Manager, transcribed below)
  - **Stream URL & Key** — ingest gets its OWN nav item, not buried in the
    manager (contrast: our S1 folds it into the stream page).
  - **Revenue**
  - **Achievements**
  - **Studio** (expandable ▾)
  - **Analytics** (expandable ▾)
  - **Moderation**
  - **Community** (expandable ▾)
  - **Drops & rewards**
- Dark theme, Kick green as the single accent. (We express in watchparty
  identity — pastels, our own accent — never copy the green.)

## Stream Manager — the widget grid

The page is a **grid of independent widgets**, each with a pop-out (↗) control
so a streamer can tear it into its own window (multi-monitor streaming). Three
columns: main (left-center), Chat (center), controls (right), plus a far-right
vertical icon rail.

### Session Info (top-left)

A row of live **stat tiles**: **Session** (status badge — `OFFLINE`) ·
**Viewers** · **Followers** (2) · **Sub Counts** · **Time Live**. Dashes when
offline; these are the at-a-glance broadcast vitals.

### Stream Preview (left, below Session Info)

The channel's live/offline video preview. Offline state shows the channel's
offline art with an `OFFLINE` badge and "<name> is offline".

### Activity Feed (bottom-left)

Real-time events (follows, subs, gifts, raids). Filter + pop-out icons. Empty
when offline.

### Mod Actions (bottom-left, beside Activity Feed)

A running log of moderation events (timeouts, bans, deletions). Filter +
pop-out. Empty here.

### Chat (center column, full height)

The live chat, with the channel's custom emotes shown above a **Send a
message** composer that carries a shield (moderation) icon, an emoji picker, a
gear (chat settings), and a green **Chat** send button. The broadcaster mods
from the same chat viewers use.

### Stream info (right column, top)

The editable go-live metadata widget: **title** ("pump incoming!"),
**category** (Stocks, with a thumbnail chip), **language** (English). Pencil
(edit) + pop-out. This is what viewers see; edited live without dropping the
stream.

### Channel Actions (right column, below Stream info)

The live control stack — everything a streamer flips **while live**, grouped:

- **Chat access**: **Account age** (Off ›) · **Followers only** (Off ›) ·
  **Subscribers only** (toggle). Gate who may talk by account age / follow /
  sub.
- **Chat options**: **Emotes only** (toggle) · **Slow mode** (Off ›) ·
  **Banned words** (›) · **AI Chat Moderation** (↗, opens its own surface).
- **Channel options**: **Show view count** (toggle, on) · **Raid Channel**
  (start a raid; greyed while offline) · **Set goals** (›, follower/sub goals).

### Far-right vertical icon rail

A thin column of quick-tool icons (info, edit, stream-preview, activity/flash,
mod/notes, chat, broadcast/raid, layout, settings/wrench, share/nodes) —
shortcuts that toggle or focus the corresponding widget.

## → watchparty studio mapping

What this tells us to build, mapped to what already exists (our S1: go-live
toggle, ingest/key, title/category, live+viewer badge):

- **The stream page becomes a widget grid, not a form** (studio S3). The core
  widgets, in priority order, and their existing backing:
  - **Session Info** stat tiles — Session/Viewers/Followers/Subs/Time-Live.
    Viewers from `stream.getMine.viewerCount`; followers/subs are countable;
    Time-Live needs a broadcast-start timestamp (new).
  - **Stream Preview** — reuse the viewer-side `components/streaming` player.
  - **Chat** — the existing live chat, broadcaster-side.
  - **Stream info** (title/category/language) — we have title/category via
    `stream.updateInfo`; **language** is the one new field to add.
  - **Activity Feed** — follows/subs/launches; the coin-feed/notification
    emitters already produce these events.
  - **Mod Actions** — moderation log (creator router has the actions).
- **Channel Actions** is the highest-value borrow and mostly already wired:
  - Chat access (account-age / followers-only / subscribers-only) and chat
    options (emotes-only / slow-mode / banned-words) map onto the existing
    `stream.setChatMode` (`everyone|followers|subscribers`) +
    `chatFollowerMinutes`; extend with emotes-only/slow-mode/banned-words.
  - **Set goals** and **Raid** are new but well-scoped.
- **"Stream URL & Key" as its own nav item** — promote ingest out of the stream
  page into a dedicated Studio page (matches Kick; cleaner than S1's inline
  block).
- **Left-nav IA** to adopt (flatter than Twitch): Stream · Stream URL & Key ·
  Content(=Studio) · Analytics · Moderation · Community · Revenue/Monetization
  (links to /premium) · Achievements/Drops (later). Our S1 nav (Home/Streams/
  Content/Analytics) is the right seed; add Moderation + Community + a dedicated
  Stream-Key page.
- **Pop-out widgets** — a nice-to-have for multi-monitor; defer past S3.
- **Go live** as a persistent top-bar button (not just on the stream page) —
  adopt in the studio shell.

Load-bearing lesson: Kick keeps the creator dashboard **flat and
widget-based**, not a deep settings tree. The studio should feel like a live
cockpit (Kick/Twitch Stream Manager), modeled on watchparty's upgrade-overlay
aesthetic, not the settings page.
