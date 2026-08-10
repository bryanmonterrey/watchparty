# Discord Developer Portal — page-by-page reference (screenshot catalog)

Companion to `docs/console-x-reference.md` (X's console — the account-level
shell our console already mirrors) and `docs/console-plan.md`. Discord's
portal is the SECOND reference, transcribed 2026-08-10 from screenshots
supplied ad hoc (they live on the owner's Desktop, not in the repo — this doc
is the durable record).

**How the two references compose** (decided 2026-08-10): X's console is
account-level (dashboard, usage, billing, flat key list) and stays our
top-level sidebar. Discord's portal is app-level — everything below is scoped
to ONE selected application — and is the blueprint for the app-detail
drill-down (`/apps` → app page) when the app registry lands. It does not add
top-level sidebar tabs.

## Shell (every page)

- **Top bar**: Discord logo + "DEVELOPER PORTAL" wordmark; right: **+ Create**
  (primary), Docs ↗, Teams, avatar.
- **Two-level IA**: a top-level Applications list, then per-app settings. The
  sidebar starts with "← Applications" (back to the list) and an app-selector
  dropdown (icon + name, e.g. "partyclaw ▾") — switch apps without leaving
  the current page type.
- **Sidebar groups** (all app-scoped):
  - **Overview**: General Information, Installation `NEW`, OAuth2, Bot,
    Emojis `NEW`, Webhooks `NEW`, Rich Presence (collapsible), App Testers,
    App Verification (⚠ warning badge when action needed)
  - **Games** `NEW`: Claim Game, Game Identity (🔒 locked), Social SDK
  - **Activities**: Settings, URL Mappings, Custom Links, Art Assets
  - **Premium Apps**: Getting Started (+ more below the fold)
- Badge language: `NEW` pills on recently shipped nav items; a warning
  triangle on App Verification when the app hasn't been verified; a padlock on
  gated items (Game Identity). Nav communicates state, not just location.
- Page anatomy: big H1 + a conversational 1–2 sentence explainer ("What
  should we call your creation? … Tell us here!"). Sections are full-width
  bordered cards, each with its own title + explainer. Destructive action
  (Delete App, red) sits at the bottom of the relevant page, never in the nav.

## 1. General Information

- H1 + "What should we call your creation? What amazing things does it do?
  What icon should represent it across Discord? Tell us here!"
- **App Icon** uploader with explicit specs listed beside the preview:
  Dimensions 1024×1024, Aspect Ratio 1:1, File Types PNG/GIF/JPG/WEBP,
  Max Size 10MB.
- **Name** input.
- **Description** textarea — "maximum 400 characters", with the *consequence*
  taught inline: "Your description will appear in the About Me section of
  your bot's profile."
- **Tags** — "Add up to 5 tags to describe the content and functionality of
  your application."
- **Application ID** and **Public Key** — read-only monospace values, each
  with its own primary **Copy** button (no masking; both are public).
- **Install Count** — "approximated number of servers and users that have
  installed your application… updated daily": rows "🖥 1 Server" /
  "👤 0 Individual Users".
- **Authorization Count** — same treatment for OAuth2 authorizations.
- Four optional URL fields, each with placeholder examples:
  - **Interactions Endpoint URL** — "receive interactions via HTTP POSTs
    rather than over Gateway with a bot user."
  - **Linked Roles Verification URL** — "enable your application as a
    requirement in a server role's Links settings."
  - **Terms of Service URL**, **Privacy Policy URL**.
- **Delete App** — red, bottom-right of the page.

→ watchparty mapping: the identity half of the future app-detail page
(`/apps/[id]`): icon/name/description/tags, IDs with copy buttons,
install/adoption counts (honestly "updated daily"), webhook/interactions
endpoint config, ToS/privacy for a future app directory, danger zone.

## 2. Installation

- H1 + "Choose how users will install your app. Create an installation link,
  choose which installation context to support, and define the scopes and
  permissions you want to request."
- **Installation Contexts** card: "Apps can be installed to both users and
  guilds." Checkbox list under "Select Methods": ☑ User Install ·
  ☑ Guild Install.
- **Install Link** card: dropdown **Discord Provided Link** (vs. registering
  a custom URL — "users who add your app will be redirected to your URL
  instead of the Add App flow"), and below it the generated link in a
  read-only field with a copy button:
  `https://discord.com/oauth2/authorize?client_id=<id>`.
- **Default Install Settings** card: "Choose the default set of scopes and
  permissions your app will request." One sub-card per enabled context —
  **User Install** ("add your app to their account and use it everywhere") and
  **Guild Install** ("giving it permissions to take actions in that guild") —
  each with a **Scopes** multi-select showing chips (`applications.commands`).
  The sub-cards appear/disappear with the context checkboxes above.

→ watchparty mapping: the pattern for app distribution + permissioning.
Contexts ≈ where a watchparty app can be installed (a user account vs. a
community/channel). The provided-vs-custom install link is the shape for a
"Connect <app>" OAuth URL. Scopes-per-context is the model to adopt WHEN keys
grow scopes — today API keys are unscoped, so this page has no v1 surface.

## 3. OAuth2

- H1 + "Use Discord as an authorization system or use our API on behalf of
  your users. Add a redirect URI, pick your scopes, roll a D20 for good luck,
  and go!" + blue "Learn more about OAuth2" doc link under the explainer.
- **Client information** card, two columns:
  - **Client ID** — plaintext read-only field + copy button (public value).
  - **Client Secret** — field literally reads "Hidden for security" + copy
    button, with a **Reset Secret** button below. The secret is never
    re-displayed; reset is the only recovery. (Same plaintext-once discipline
    as our key creation flow.)
- **Public Client** toggle, taught inline: "Public clients cannot maintain
  the confidentiality of their client credentials (i.e. desktop/mobile
  applications that do not use a server to make requests)."
- **Redirects** card: "You must specify at least one URI for authentication
  to work. If you pass a URI in an OAuth request, it must exactly match one
  of the URIs you enter here." Empty state is just the **Add Redirect**
  button — no table until a URI exists.
- **OAuth2 URL Generator** card: "Generate an invite link for your
  application by picking the scopes and permissions it needs to function.
  Then, share the URL to others!"
  - **Scopes**: a 3-column checkbox grid of every OAuth scope (identify,
    email, connections, guilds, guilds.join, guilds.members.read, gdm.join,
    bot, rpc, rpc.notifications.read, rpc.voice.read, rpc.voice.write,
    rpc.video.read, rpc.video.write, rpc.screenshare.read,
    rpc.screenshare.write, rpc.activities.write, webhook.incoming,
    messages.read, applications.builds.read, applications.commands,
    applications.store.update, applications.entitlements,
    role_connections.write, openid,
    applications.commands.permissions.update).
  - **Generated URL**: read-only field + copy; placeholder "Please select at
    least one OAuth2 scope" until something is checked, then the authorize
    URL assembles live as scopes toggle.

→ watchparty mapping: the anatomy for a future "Sign in with watchparty" /
third-party-apps tier (client id public, secret hidden-with-reset,
public-client/PKCE toggle, exact-match redirect URIs). The live-assembling
URL generator is a DX pattern worth stealing for any "build your request"
surface — and Reset Secret ≈ our key regenerate. No v1 surface today: apps
don't act on behalf of users yet.

## 4. Bot

- H1 + "Bring your app to life on Discord with a Bot user. Be a part of chat
  in your users' servers and interact with them directly." + "Learn more
  about bot users" link.
- **Icon** uploader — same spec block as the app icon (1024×1024, 1:1,
  PNG/GIF/JPG/WEBP, 10MB). **Banner** uploader below it (680×240, 17:6, same
  types/size). The bot has its own visual identity, separate from the app's.
- **Username** input with the discriminator ("#9696") rendered as a
  read-only suffix segment inside the same input.
- **Token** — the strictest credential UX in either reference: NO value
  shown, ever, not even masked. Just the sentence "For security purposes,
  tokens can only be viewed once, when created. If you forgot or lost access
  to your token, please regenerate a new one." and a **Reset Token** button.
  View-once at creation, reset is the only recovery.
- **Authorization Flow** — "These settings control how OAuth2 authorizations
  are restricted for your bot (who can add your bot and how it is added)":
  - **Public Bot** toggle (on): "Public apps can be installed by anyone.
    When unchecked, only you can install this app."
  - **Requires OAuth2 Code Grant** toggle (off): "If your application
    requires multiple scopes then you may need the full OAuth2 flow to
    ensure a bot doesn't join before your application is granted a token."
- **Privileged Gateway Intents** — "Some Gateway Intents require review if
  your bot has reached 10,000 users. If your bot has not reached 10,000
  users, you can toggle those intents on below as needed." Three toggles,
  each: what it unlocks (linked term), then a bold NOTE "Once your bot
  reaches 10,000 or more users, this will require review. Read more here":
  - **Presence Intent** (Presence Update events)
  - **Server Members Intent** (GUILD_MEMBERS events)
  - **Message Content Intent** (message content in most messages)
  Self-serve below the threshold, review-gated above it — permissioning tied
  to blast radius, not a blanket approval queue.
- **Bot Permissions** card — "Need some help with bit math? Use the tool
  below to calculate the permissions integer for your bot based on the
  features it needs." Three checkbox columns:
  - *General*: Administrator, View Audit Log, Manage Server, Manage Roles,
    Manage Channels, Kick Members, Ban Members, Create Instant Invite,
    Change Nickname, Manage Nicknames, Manage Expressions, Create
    Expressions, Manage Webhooks, View Channels, Manage Events, Create
    Events, Moderate Members, View Server Insights, View Server Subscription
    Insights.
  - *Text*: Send Messages, Create Public Threads, Create Private Threads,
    Send Messages in Threads, Send TTS Messages, Manage Messages, Pin
    Messages, Manage Threads, Embed Links, Attach Files, Read Message
    History, Mention Everyone, Use External Emojis, Use External Stickers,
    Add Reactions, Use Slash Commands, Use Embedded Activities, Use External
    Apps, Create Polls, Bypass Slowmode, Send Voice Messages.
  - *Voice*: Connect, Speak, Video, Mute Members, Deafen Members, Move
    Members, Use Voice Activity, Priority Speaker, Request To Speak, Use
    Embedded Activities, Use Soundboard, Use External Sounds, Set Voice
    Channel Status.
  - **Permissions Integer**: read-only field + copy, recomputed live as
    boxes toggle (same live-assembly DX as the OAuth2 URL generator).

→ watchparty mapping: a bot ≈ an agent/service identity attached to an app.
Three patterns to keep: (1) token view-once + reset-only — one step stricter
than X's masked-with-eye, and the right model for our key secrets; (2) the
live permissions-integer calculator — the shape for any scope/bitmask config
we ever expose; (3) intents that are self-serve below a usage threshold and
review-gated above it — the model for gating expensive event subscriptions
(e.g. firehose-style feeds) without a blanket approval queue.

## 5. Emojis

- H1 only — no explainer sentence under it (the empty state carries the copy).
- Centered empty state: bold "**0 Emojis Uploaded**" + "Get the party started
  by uploading an emoji. Up to 2,000 custom emojis can be uploaded by an app".
- **Upload Requirements** bullet list, all constraints upfront: File Type
  JPEG/PNG/GIF/WEBP/AVIF · Max file size 256 KB · Recommended dimensions
  128×128 · Naming: ≥2 characters, alphanumeric + underscores only.
- Primary **Upload Emoji** button centered below.

→ watchparty mapping: app-owned custom emoji for chat/stream surfaces —
registry-tier, and the count-up header ("0 Emojis Uploaded") + requirements-
before-upload anatomy is the reusable part.

## 6. Webhooks (app-scoped)

- H1 + "Configure webhooks for your app to receive via HTTP".
- **Endpoint** card: "Set a public endpoint URL to receive webhooks. Learn
  more" → single **Endpoint URL** input ("Add your endpoint"). ONE endpoint
  per app — not a table of webhooks like X's account-level page.
- **Events** card with a master on/off toggle in its header ("Send specific
  events to your application"), then a checkbox catalog grouped by domain:
  - *Applications*: Application Authorized, Application Deauthorized
  - *Entitlements*: Entitlement Create, Entitlement Update, Entitlement Delete
  - *Messages*: Activity Invite Create
  - *Users*: Relationship Add, Relationship Update, Relationship Remove,
    User Activity Action
  - *Quests*: Quest User Enrollment
  - *Games*: Game Direct Message Create/Update/Delete, Lobby Message
    Create/Update/Delete, Game Relationship Add, Game Relationship Remove

→ watchparty mapping: THE shape for our developer webhooks page — one
endpoint + a grouped event-type catalog with per-event checkboxes and a
master toggle. Groups for us: Coins (launch, trade, price), Streams
(live/offline), Users (follow), Predictions, Perps. Contrast deliberately
with X's model (webhook rows in a table, per-app); Discord's
single-endpoint-plus-event-menu is simpler and matches how our
community-webhooks prior art already works.

## 7. Rich Presence (group: Art Assets · Visualizer)

The sidebar item expands into two sub-pages — the only nav item with
children; the active child gets the left accent bar.

### Art Assets

- H1 + "Integrate your game deeply with Discord and let players jump
  directly into your client and share your game." + "Learn more about Rich
  Presence Best Practices" link.
- **Rich Presence Invite Image**: "This is the default image for chat
  invites, so make sure it's pretty! Put your best face forward :)" —
  **Cover Image** drag/click uploader (1024×576, 16:9, PNG/JPG/WEBP, 10MB)
  next to a live **"IRL Invite Image Example"** preview: a real rendered
  invite card (app icon, "partyclaw · Playing for 2h", member avatars
  "3 of 6", Join button) that shows the upload in context.
- **Rich Presence Assets**: "add multiple assets that are paired with keys
  to dynamically update rich presence data… images of maps, modes, or
  whatever works best for your game."
  - Orange warning banner: "Due to caching, asset keys are not editable once
    they are saved. Delete and re-upload assets if you need to change a key
    name." (Immutability taught at the moment it matters.)
  - **Add Image(s)** button + inline constraints ".png, .jpg, or .jpeg —
    1024×1024 recommended, 512×512 minimum" · counter "Assets (0 of 300)".

### Visualizer

- H1 + "Rich Presence lets your game surface exciting game data on your
  players' profiles, and lets them play together with chat invites, and Ask
  to Join. See exactly how your text and art will look on a user's profile."
- Blue info banner: "This is only a visualizer… Rich presence configuration
  needs to be programmed in your application. Learn more about working with
  Rich Presence."
- Left: the full presence payload as a two-column form, every field with a
  ⓘ tooltip, **pre-filled with an Overwatch-flavored example** so the
  preview reads as a real profile before you touch anything:
  - **state** "Playing Solo" · **details** "Competitive"
  - **start Timestamp / end Timestamp** — raw unix seconds (1507665886)
  - **large Image Key** (Select dropdown fed by Art Assets) · **large Image
    Text** "Numbani" · **small Image Key** (None) · **small Image Text**
    "Rogue - Level 100"
  - **party Id** (uuid) · **party Size** 1 · **party Max** 5 · **join
    Secret** (opaque base64 token). Form continues below the fold —
    spectate/match secrets not captured.
- Right: preview panel with tabs **Full Profile / User Popout / Show Code**.
  Full Profile renders the presence inside the *complete* profile chrome —
  blurple card, viewer avatar + username, "PLAYING A GAME" block (app icon,
  app name, details line, state + party composed as "Playing Solo (1 of
  5)", end Timestamp rendered as a countdown "0:0 left", **Ask to Join**
  button), then the profile's own User Info / Mutual Servers / Mutual
  Friends tabs and note field. The derived strings teach field semantics
  with zero docs: party Size/Max fill "(1 of 5)", end Timestamp becomes
  time "left".
- Nav detail: **App Verification** carries an orange ⚠ triangle in the
  sidebar — a needs-attention state surfaced at the nav level, before you
  ever open the page.

→ watchparty mapping: presence on watchparty profiles ("watching X",
"streaming Y") is a future social feature; the durable lesson is the
**live-preview playground** — form on the left, pixel-accurate render +
Show Code on the right. That's the shape for a webhook-payload tester or
embed-preview surface in our console.

## 8. App Testers

The sparsest page in the portal — one input, one button, one counter.

- H1 "Application Testers" + "You can invite up to 50 Discord users to
  test your application. They must have a registered email and a positive
  attitude :^)" (personality in the microcopy, even on a utility page).
- **Invite**: single text input (placeholder `discord.username`) + blurple
  **Invite** button right-aligned on the same row.
- **Invited Testers (0 of 50)** — quota surfaced as a counter in the list
  heading, same pattern as Emojis "(0 of 2000)" and Art Assets "(0 of 300)".
- Nothing else. No empty-state illustration, no explainer card — the page
  trusts the one-line description.

→ watchparty mapping: when the console grows an app registry, this is the
pre-verification distribution path — a capped allowlist of named users who
can use an unpublished app. The durable pattern is the **"(n of cap)"
counter in the section heading**, which the portal uses everywhere a quota
exists; our console should adopt it for keys, webhooks, and test users.

## 9. App Verification

The page the sidebar's orange ⚠ has been pointing at. Two screenshots,
full page.

- H1 "Verify your App" + "In order to scale your application past 100
  servers, we require your team owner to complete identity and application
  verification. Learn more." — **verification is the scale gate**, not a
  vanity badge.
- **Verification Qualifications** card. Status line in orange:
  "Your app is missing 3 criteria and cannot be verified" — the count is
  computed from the rows below. Six criteria, each a row with a live ⚠/✓
  icon and a chevron (rows are drill-downs, not static text):
  - ⚠ Your app must belong to a Team
  - ✓ Your app must not contain any harmful or bad language in its name,
    description, commands, or role connection metadata
  - ⚠ Your app must have a link to Terms of Service
  - ⚠ Your app must have a link to your Privacy Policy
  - ✓ Your app must have an install link
  - ✓ All members of your developer team must have a verified email and
    2FA set up
  A compliance requirement rendered as an **auto-evaluated checklist** —
  the app's actual state is checked against each criterion, so the page is
  a to-do list, not a form you fill in and hope.
- **App Identity** card. "Caution: After verification, you cannot modify
  the app's name or transfer ownership without the assistance of Discord's
  support team." — irreversibility stated before the commit point, same
  move as Art Assets' immutable keys banner. Shows **APP NAME** (partyclaw,
  Edit Name button) and **OWNERSHIP** (owner avatar + username, Change
  Owner button) — i.e. your last chance to change both, presented inline.
- Two affirmation checkboxes before the CTA: "I affirm that my application
  abides by the Discord Developer Terms of Service and Developer Policy"
  (both linked) and "I am the owner of this app. I recognize that after
  verification, I cannot modify the app's name or transfer ownership…" —
  the irreversibility warning repeated as an *active acknowledgment*, not
  just a banner.
- Blurple **Verify App** submit button at the bottom.

→ watchparty mapping: this is the shape for any "go live" gate in the
console (publish an app, raise a rate tier, enter the app directory):
auto-evaluated criteria rows with ✓/⚠ + drill-down, an orange computed
"missing n criteria" summary, the nav badge driven by the same state, and
irreversible identity fields surfaced with an explicit checkbox
acknowledgment at the point of no return.

## Pages not yet captured

The Games/Activities/Premium Apps groups, the top-level Applications list,
and the sliver of the Visualizer form below join Secret (spectate/match
secrets). Transcribe them here as screenshots arrive.

## Rejected source: github.com/mooncord/devportal (evaluated 2026-08-10)

A fan recreation of the portal — looked promising for the uncaptured pages,
but it's a January-2022 snapshot with stub pages (bot.tsx = 54 lines of
hardcoded sample data, `TODO: Load applications from the API`) and a README
that says it deliberately RESTYLES rather than clones. Its nav predates
Installation, Emojis, app-level Webhooks, App Verification, and the
Games/Activities/Premium Apps groups. Do not use it as a reference; the
screenshots transcribed above are the source of truth.
