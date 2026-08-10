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

## Pages not yet captured

OAuth2, Bot, Emojis, Webhooks, Rich Presence, App Testers, App Verification,
the Games/Activities/Premium Apps groups, and the top-level Applications
list. Transcribe them here as screenshots arrive.
