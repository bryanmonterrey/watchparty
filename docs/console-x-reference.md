# console.x.com — page-by-page reference (screenshot catalog)

Companion to `docs/console-plan.md` (the build plan / architecture decisions —
read that first). THIS doc is the detailed per-page anatomy of X's Developer
Console, transcribed 2026-08-10 from the 17 screenshots in
`docs/developer dashboard x/` (15 unique views; the Dashboard and Projects
shots each appear twice), so future sessions never need to re-open the images.
Each section ends with the watchparty mapping: the console-app route it
corresponds to and whether the backend is live today.

Reminder when borrowing: patterns port, X's visual language does not
([[references-not-blueprints]] — no gray borders beyond the standard hairline,
watchparty identity, HugeIcons).

## Shell (every page)

- **Sidebar**: X logo + "Developer Console" wordmark. Groups: (ungrouped)
  Dashboard, Notifications, Agent · **Access**: Projects, Apps, Usage ·
  **Toolbox**: Event subscriptions, Webhooks, Connections, Streaming rules ·
  **Billing**: Credits, Payments, Billing information. Footer: avatar + name +
  sign-out icon. Active item = left accent bar + filled icon.
- **Top bar**: account handle top-left ("tofuwif"); right: Documentation ↗,
  Forum ↗, search, share, theme toggle, language picker ("English ▾").
- **Content footer**: "© 2026 X Corp. All rights reserved." · "Follow
  @X Developers" · "Subscribe to Developer News".
- Every page = H1 + one-sentence explainer, often with an inline blue
  "Docs ↗" chip. The explainers teach ("A project decides which parts of the
  X API your apps can call", "An app is a set of keys").
- Two scoping models: Apps has a *filter* ("All projects ▾"); Toolbox pages
  are *hard-scoped* to one app via an app-selector dropdown ("watchpartyxyz
  (33196350) ▾") + refresh icon next to the primary action button.
- Table anatomy everywhere: muted header row, right-aligned Actions column,
  page-size select ("25 per page ▾"), empty state = icon + one-liner
  (+ sometimes an inline CTA button).
- Contextual banners (dismissible, single line, one action link): Dashboard's
  auto-recharge upsell; Credits' "Grok API credits are bought elsewhere →
  Go to xAI Console" disambiguation.

## 1. Dashboard

- Banner: "Recommended: Never run out of credits — enable auto-recharge…"
  → "Enable now ›" + dismiss ✕.
- "Hello, bry" greeting; primary **Buy Credits** button top-right.
- Three stat cards: **Total Balance** $5.00 · **Credits** $5.00 · **Free
  Credits** $0.00.
- **Usage** panel: "Cost (last 30 days)", big count, bar chart area, empty
  state "No usage data is available for this account yet."
- Right rail **Apps** card: "Manage apps" link; rows = icon, name, numeric id,
  env chip ("Production ›"). Below: promo card ("Link your xAI team — get free
  xAI credits when you purchase X credits").

→ **Live** at `/` (`dashboard-view.tsx`): balances + chart from
`apiKeys.list` / `apiKeys.usageSeries`, Keys card.

## 2. Notifications

- H1 + "Important updates about the X Developer Platform."
- Announcement rows: title ("X Activity API Official Release"), one-line body,
  timestamp ("Mar 27, 2026, 4:09 PM"), expand chevron ›, minimize/dismiss.

→ `/notifications` — platform announcements table (tiny, admin-authored).

## 3. Agent

- Empty state: logo, "Console Agent", tagline "Set up apps, configure
  webhooks, manage subscriptions, and more — just describe what you want to
  build."
- Composer pinned bottom: "Ask me to set up apps, webhooks, subscriptions…"
  + send arrow.
- Right rail: **+ New conversation** (conversation history lives here).

→ `/agent` — the assistant infra exists (`assistant` router:
quota/threads/thread/deleteThread + streaming `/api/assistant`);
console-scoped tools (create key, fund, read usage) come later.

## 4. Projects

- "A project decides which parts of the X API your apps can call."
- **Your projects**: rows = name ("Default project-1804…" / "watchparty"),
  plan chip ("Standard Basic" / "Pay Per Use"), "Plan: X · N connected apps",
  **View apps** button (+ "Learn more ↗" on paid).
- **Start a new project**: self-serve product rows ("Ads — Ads API access") →
  **Create project**. "Creating a project starts it on that product's default
  plan."
- **Available by request**: sales-managed rows (Enterprise → **Contact
  sales**; Community Notes AI Note Writer API → **Request access**), each
  with a "Sales managed" chip.

→ **Skipped in v1** (keys are flat); maps to the future app-registry tier
([[developer-platform]]).

## 5. Apps (list)

- "An app is a set of keys. Connect it to projects to choose what those keys
  can call."
- Header: "All projects ▾" filter + **Create App**.
- Rows: icon, name, description ("This app was created to use the X API."),
  right side: project name, plan chip, `● active` green pill, trash icon.
- URL shape: `console.x.com/accounts/{accountId}/apps/{appId}`.

→ **Live** at `/keys` (a key ≈ an app); registry later.

## 6. App detail (Keys & Tokens)

- Breadcrumb `Apps / watchpartyxyz`; icon + name + inline edit pencil;
  description; `● active` pill + numeric id. Top-right: **Exhibit ↗** +
  **Settings**.
- **Project Access** bar: green chip "watchparty (Pay Per Use)" + **Manage**.
- Tabs: **Keys & Tokens** · Subscriptions · Webhooks · Streaming rules ·
  Connections.
- Keys & Tokens table, grouped by scheme, every label has an ⓘ tooltip:
  - *App-Only Authentication*: **Bearer Token** — "Generated July 14, 2026",
    red **Revoke** link + **Regenerate** button. The value itself is never
    shown post-creation.
  - *OAuth 1.0 Keys*: **Consumer Key** — masked dots + eye reveal +
    Regenerate. **Access Token** — "For @bryanmonterreyx · Read" + Generate.
  - *OAuth 2.0 Keys*: **Client ID** — plaintext monospace (public). **Client
    Secret** — masked + eye + Regenerate. **Access Token** — "Generate an
    access token and refresh token for your own account to make authenticated
    API requests, including DM access." + Generate.

→ `/keys/[id]` — key detail on live data: prefix, created/last-used,
balance/spend, per-key usage + deposits, fund/revoke; masked-with-reveal row
pattern reserved for the plaintext-once creation flow.

## 7. Usage analytics

- "Showing data from July 11th to August 10th UTC" (rolling 30d, UTC-labeled).
- **Usage** panel: "Count (last 30 days)", big number + "Total Cost $0.00",
  bar chart, empty state.
- **All Events** table: columns Date ▾ / Kind / Requests, caption "Breakdown
  of all requests by type", empty state "No events available — make some
  requests first!"

→ **Live** at `/usage`; Kind = price-sheet bucket (`lib/api-pricing.ts` via
the console's vendored `lib/price-sheet.ts`).

## 8. Event subscriptions

- "Manage event subscriptions using the X Activity API for real-time
  delivery" + Docs chip.
- App selector ("watchpartyxyz (33196350) ▾") + refresh + **Create
  subscription**; "25 per page ▾".
- Table: Event Type / Filter / Created At ▾ / Actions; empty "No
  subscriptions found for this app."

→ Future (coin alerts / user-events push, registry arc).

## 9. Webhooks

- "Webhooks are specific to your Client App ID" + Docs chip; refresh +
  **Create webhook**.
- Table: ID / URL / Valid / Created At / Actions; empty state two-liner
  "No webhooks found for this app. Webhooks will appear here once configured
  for your apps."

→ Future (developer outgoing webhooks; community webhooks are prior art).

## 10. Connections

- "View streaming connections for your Client App IDs"; refresh.
- Tabs **All / Active / Inactive** above the table.
- Table: Connection ID / Endpoint / Status / Connected At / Disconnected At /
  Client IP; empty "No connections found for this app."

→ Future (live streaming consumers).

## 11. Streaming rules

- "Manage filtered stream rules for your apps" + Docs chip; app selector +
  refresh + **Add Rules**.
- Table: ☑ / ID / Rule / Tag / Actions; empty state has its own centered
  **+ Add Rules** CTA under "Add rules to start filtering the real-time
  stream."

→ Future.

## 12. Credits

- Banner: "Grok API credits are bought elsewhere. The credits on this page pay
  for X API calls." → "Go to xAI Console ›" + dismiss.
- "Manage your free and prepaid credits"; primary **Purchase credits**.
- "Remaining balance ⓘ" big number ($5.00); "Free credits ⓘ $0.00" line.
- One bordered card, three stacked rows:
  - **Auto Recharge is `● Off`** ⓘ — "When your credit balance reaches $0,
    your API requests will stop working…" → **Enable Auto Recharge**.
  - **Billing Cycle Cap — Unlimited** — "Set a maximum amount you can spend in
    a billing cycle. When reached, API requests will be blocked until the next
    cycle." Sub-stats: Current Spend $0.00 · Current Billing Cycle Jul 21 –
    Aug 21, 2026 · Days Remaining 12 → **Manage Spend Cap**.
  - **Free Credits Voucher** — "X may give out free credits to developers to
    build with the API…" → **Redeem Voucher**.

→ **Live** at `/credits` (balance, USDC purchase-by-signature, per-key
balances, x402 pitch). Spend cap = future per-key cap (would touch the live
402 gate — deliberate, not v1); auto-recharge n/a; voucher ≈ `apiKeys.grant`
(admin).

## 13. Payments

- "View all billing transactions and payment history for your account."
- Filter row: date-range picker ("May 9, 2026 – Aug 9, 2026"), "All statuses
  ▾", "All types ▾", "Search by transaction ID", "Reset to last 3 months".
- Table: Transaction ID (truncated mono "2…4860") / Status (green
  `● Succeeded` pill) / Payment Method ("VISA ··· 3721") / Amount (mono,
  right-aligned) / Date ("Jul 14, 2026, 11:55 AM UTC") / Invoice ↓.

→ **Live** at `/payments` (`apiKeys.deposits`): signature, Succeeded,
USDC-on-Solana, amount, date, Solscan link instead of invoice.

## 14. Billing information

- "Manage your payment methods and billing information"; **Add Payment
  Method** top-right.
- **Saved payment methods** ("Your saved payment methods for quick
  checkout"): row = card icon, "Visa •••• 3721" + "Default" chip, "Expires
  06/2029", red **Remove**.
- **Billing details**: "Update your name, address, and tax ID for invoices."
  → **Manage billing details**.

→ `/billing` — no cards here: deposit address / network / mint from
`apiKeys.depositInfo` with copy buttons, plus how-funding-works explainer.

## Build status key

Live today: Dashboard, Usage, Keys(+detail), Credits, Payments, Billing
info, Notifications, Agent — see `docs/console-plan.md` build order for the
registry-tier remainder (Projects, Apps-proper, Webhooks, Event
subscriptions, Connections, Streaming rules).
