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
    Secret** (opaque base64 token) — the last row; confirmed by a
    scrolled-to-bottom capture, there are no spectate/match secret fields.
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

## 10. Games › Claim Game

First page outside Overview. The **Games** sidebar group (NEW badge)
expands into **Claim Game** (active), **Game Identity** — with a 🔒 lock
icon — and **Social SDK**: post-claim pages are shown in the nav but
locked, a teaser rather than hidden.

- H1 "Game Claim" + "Claim your game to control the visuals and
  information we share with users on Discord. Learn how the claiming
  process works." (link)
- **Verification Requirements** card — the *same* auto-evaluated checklist
  component as App Verification (§9), scoped to this feature with its own
  subset and its own computed summary, "Your app is missing 1 criterion
  and cannot be claimed.":
  - ⚠ Your app must belong to a Team
  - ✓ All members of your developer team must have a verified email and
    2FA set up
  The rows deep-link to how-to-fix docs (the 2FA row links to the
  support-site 2FA article, per the status bar) — each criterion carries
  its own remedy, not just a state.
- Blurple **Claim Game** button sits below the checklist even while
  criteria are missing.
- **"What you'll get"** — a marketing section *inside* the console: two
  benefit cards.
  - Left: pixel-art gamepad icon, "Own your game's presence on Discord" —
    ✓ "Customize how your game looks and feels across Discord",
    ✓ "Manage your studio, developer information, and social channels",
    console/hardware artwork below.
  - Right: a 🔒 **Analytics** pill badge with a purple glow, "Coming soon:
    Identify your most engaged players and what drives their activity" —
    ✓ player demographics/engagement/patterns, ✓ "See which topics and
    channels are trending across your community", chart artwork.
    A locked *future* feature is sold on the claim page itself.

→ watchparty mapping: this is the claim-flow shape for creator coins and
any "claim your page" surface — gate with the shared checklist component
(each criterion linking to its fix), keep post-claim pages visible-but-
locked in the nav, and sell the benefits (including coming-soon ones)
right on the claim page instead of in external marketing.

## 11. Games › Social SDK (full page, three screenshots)

Unlike every other page, this one configures nothing — it's a **lead-
capture / access-request form** living inside the console.

- Eyebrow "Discord Social SDK" over H1 "Getting Started".
- Hero banner: "Discord SOCIAL SDK" wordmark, an in-game chat overlay mock
  ("To Rose: wanna game" / "Rose: yee down" / "[DM] Rose:"), a phone
  rendering the same conversation as Discord DMs, and a 3D rubber duck —
  the artwork *is* the pitch: same conversation, in-game and in-app.
- Copy: "With the Discord Social SDK, players can connect with friends,
  share gameplay, and jump into your game with ease. Seamless
  Discord-powered integration means effortless cross-platform
  communications, voice chat, and other powerful social tools…" + "The
  Social SDK can also enable your app or Activity to know a user's Discord
  relationships. Learn more here."
- Form card **"Tell us a bit about your game"** — "To get instant access
  to the SDK downloads and more information, please enter the following
  details". Required fields marked with a red asterisk:
  - **Company Name*** (text) · **Team Location*** (select) ·
    **Full Name*** (text) · **Work Email*** (text) · **Role*** (select)
  - **Game website URL** (text, optional — the only unstarred input)
  - **"If already launched, what is your estimated DAU range?"** (select)
  - **"Do you have a publisher for your game?"** — radios: Yes · "No, the
    game is self-published" · "Looking for publisher"
  - **"What platforms are you building for?"** — checkboxes: PC Windows ·
    iOS / Android · PlayStation 4/5 · Xbox Series X|S · Nintendo Switch ·
    Steam Deck/Linux
  Pure sales-qualification questions (DAU, publisher, platforms) — the
  "instant access" is priced in information, not money.
- Consent block, deliberately split in two: a marketing opt-in checkbox
  ("Get email updates…") separate from the contact-consent checkbox ("By
  selecting 'I consent,' I understand that Discord will use this
  information in accordance with its Privacy Policy…"), plus a passive
  terms line — "By clicking Submit, you agree to the Discord Social SDK
  Terms." Blurple **Submit** button.

→ watchparty mapping: the pattern for gating a heavyweight developer
surface (SDK download, agent API, high rate tiers) — sell it with a hero +
benefit copy *on the page*, qualify the requester with a short form, and
keep marketing opt-in as its own checkbox, never bundled into the consent
that unlocks the thing.

## 12. Activities (group: Settings · URL Mappings · Custom Links · Art Assets)

Activities are third-party iframe apps embedded in Discord; the group has
four children.

### Settings

- H1 "Activity Settings" + "A place for you to configure your activity
  settings".
- **Enable Activities** toggle — rendered *dimmed/disabled*, with an
  orange inline notice directly under it: "**Missing Requirement: URL
  Mapping**" where "URL Mapping" links to the page that unblocks it. The
  master switch is never just dead; it names its prerequisite and links
  the fix (the checklist philosophy applied to a single control).
- **Age Gate** toggle: "Applications with content unsuitable for children
  under the age of 18 should be marked as Age Gated."
- **Maximum Participants** — "The maximum participants allowed in your
  activity" (number input, placeholder 5).
- **Phone / Tablet Default Orientation Lock State** — two selects, both
  "Unlocked", each scoping itself honestly: "only consumed in the Discord
  mobile apps on phones. Desktop / Web Browsers are always sized based on
  the app window's size."
- **Supported Platforms** checkboxes: Web ✓ · iOS ☐ · Android ☐.

### URL Mappings

- H1 "Activity URL Mappings".
- **Root Mapping** — "This points to the main entry point of your iframe
  application. This is where your application starts when loaded." Two
  inputs on one row: **Prefix** (pre-filled `/`) and **Target**
  (placeholder `your-app-website.com`).
- **Proxy Path Mappings** — "Requests are relative to your root domain by
  default. You can create custom proxy path mappings to override this
  behavior." + docs link. Blurple **Add Another URL Mapping** button.
- This is the CSP story for embedding third-party apps: the activity is
  served *through Discord's proxy*, and the mapping table is the tunnel
  config.

### Custom Links

- Pure dependency empty state, centered: "**Application is not an
  Activity**" / "You will first need to enable Activities in Settings
  before you can create custom links." No illustration, no CTA — but it
  names the prerequisite *and* where to satisfy it.

### Art Assets

- H1 "Activity Assets" + "Preview and update your assets here! Please
  note that updates may be delayed due to caching, so be patient."
  (caching expectation set in the page description).
- Three uploaders, each a left spec block (**Dimensions / Aspect Ratio /
  File Types / Max Size**) beside a dashed "Drag or click to upload"
  dropzone:
  - **Background** — "background overlay in Grid view. Artwork should be
    clustered around the edges… leaving space in the center so the UI
    does not clash with it." 1024×576, 16:9, PNG/JPG/WEBP, 10MB. Art
    direction, not just dimensions.
  - **Cover Art** — "main image on the Activity Shelf… suggested that
    this image contain the title and some art in the background." Same
    specs. Below the dropzone sits a **live shelf-card preview** —
    "partyclaw" + an "Unlimited participants" pill — the upload shown in
    its real context, same move as Installation's install-flow preview
    and Art Assets' invite example.
  - **Video Preview** — "Shown when hovering on an activity in the menu.
    Also shown on the upsell… Can be a screen recording of the activity
    being played." 640×360, 16:9.

→ watchparty mapping: the blocked-toggle-with-named-requirement is the
pattern for any feature switch with prerequisites (e.g. "Enable payouts —
Missing Requirement: wallet"), and the spec-block + dropzone + in-context
preview trio is the template for every art upload surface (channel
banners, coin art, ad creatives).

## 13. Premium Apps › Getting Started

One child page; the group is an onboarding funnel, not a config surface.

- Centered hero: 3D Discord-branded coins, H1 "**Monetize Your App**",
  "Earn money with integrated premium apps offerings. Learn more".
- One card, a numbered three-step path:
  1. **Fulfill eligibility requirements** — "Run through our quick
     checklist, and make sure you're ready to start monetizing your app."
  2. **Set up and integrate** — "Create your offering, customize it to
     your liking, and integrate our API to get ready for launch."
  3. **Start earning** — "Go live and get paid! To learn more about our
     payouts process visit our help center."
- Single centered blurple **Get Started** CTA. Nothing else on the page.

→ watchparty mapping: the console's monetization onboarding (API 402 /
x402 credits, creator payouts) should open exactly like this — one hero,
the whole journey compressed to three numbered steps (eligibility →
integrate → get paid), one CTA. The eligibility step feeding into the
shared checklist component closes the loop with §9/§10.

## 14. Portal level (outside an app): Home · Applications · Embed Debugger

Above the app-scoped shell sits a second, three-item shell — sidebar
**Home / Applications / Embed Debugger**, no back-link, no app switcher.
A dismissible **SURVEY** toast ("Are you able to find what you need in
the Developer Portal?" No/Yes) floats bottom-left and persists across
these pages.

### Home ("Welcome, swim")

The dashboard is a hub of links out — almost no data of its own:

- H1 personalized "Welcome, swim".
- **Jump back in** + "Apps →": recent-app rows (icon, name, "Personal
  Team", blurple **Go to app**).
- **"More ways to make Discord work for your game"** — a 2×2 cross-sell
  grid, each card product-render art + pitch + CTA:
  - *Increase player engagement* — Social SDK ("longer sessions, improved
    retention, and more frequent play"), Get Started; art is an in-game
    invite widget.
  - *Take control of your game's identity* — game claiming, Get Started;
    art is an Elden Ring cover with an edit-pencil.
  - *Unlock new revenue* — **COMING SOON** pill; "Launch your Game Shop
    to let players buy and gift in-game items on Discord", Learn More ↗;
    art is a $16.99 in-game item card.
  - *Find and acquire new players* — "Advertise on Discord via rewarded
    formats that drive discovery and gameplay", Learn More ↗; art is a
    "Claim reward · 65% complete" quest card.
  - Below the grid, two full-width arrow rows with pixel-art icons:
    "Build a bot to enhance your server" and "Launch an Activity inside
    Discord" — the two classic entry paths, demoted to compact rows.
- **Documentation** + "Docs →": three link-list cards — *Starter
  Tutorials* (first app / Social SDK / first Activity), *Popular Guides*
  (Social SDK account linking, provisional accounts, Bots: Overview of
  Interactions), *Developer Resources* (Developer Policy, Setting up your
  developer team, API Reference). All external-arrow links.
- **Latest News and Tutorials** + Blog ↗ / YouTube ↗ / Changelog ↗: one
  large featured card (BLOG "Discord Patch Notes: August 4, 2026", 3D
  robot art) beside a column of small cards, each tagged by type — BLOG
  (Social SDK 1.10 mobile GA), CHANGELOG (file_types filter, with a
  two-line excerpt), VIDEO (GDC account-linking booth talk).
- **Find Support**: three cards — "Join the Developer Discord server",
  "Report Issues on GitHub", "Get support with Help Center". Footer:
  Changelog · Privacy Policy · Developer Policy · Developer Terms of
  Service.

### Applications

- H1 "Applications" + right-aligned blurple **New Application**.
  Subtitle "Develop apps to customize and extend Discord for millions of
  users."
- **Sort By:** select (Date Created) on the left; **Small / Large**
  grid-density toggle on the right.
- **My Applications**: square app cards — icon (or the app's name text on
  a dark tile when no icon is set) with the name below.

### Embed Debugger

- One-tool page: H1 "Embed Debugger" + "Test and debug link embeds for
  your website" + "Discord supports oEmbed, Open Graph, and Twitter Card
  metadata formats for rendering link embeds" (all three linked).
- **Website URL*** input (placeholder `https://discord.com`) + blurple
  **Generate Embed**. Nothing else — a utility gets a whole page rather
  than a modal buried somewhere.

→ watchparty mapping: this is the blueprint for the console's Dashboard —
recents row with "go to app", a cross-sell grid for the platform surfaces
(Notifications, Agent, Predictions, Perps — coming-soon pill included),
docs link-cards into docs.watchparty.xyz, a typed news/changelog column,
and a support row. The Embed Debugger also legitimizes shipping our own
single-purpose tool pages (OG/embed tester, webhook payload tester from
§7) as first-class nav items.

## Pages not yet captured

Only Games › Game Identity remains, and it's locked until a game claim
completes — likely uncapturable for now. Everything else in the portal is
transcribed above.

## Rejected source: github.com/mooncord/devportal (evaluated 2026-08-10)

A fan recreation of the portal — looked promising for the uncaptured pages,
but it's a January-2022 snapshot with stub pages (bot.tsx = 54 lines of
hardcoded sample data, `TODO: Load applications from the API`) and a README
that says it deliberately RESTYLES rather than clones. Its nav predates
Installation, Emojis, app-level Webhooks, App Verification, and the
Games/Activities/Premium Apps groups. Do not use it as a reference; the
screenshots transcribed above are the source of truth.
