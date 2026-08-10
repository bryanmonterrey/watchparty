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

## Pages not yet captured

Emojis, Webhooks, Rich Presence, App Testers, App Verification, the
Games/Activities/Premium Apps groups, and the top-level Applications list.
Transcribe them here as screenshots arrive.
