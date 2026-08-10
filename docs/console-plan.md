# console.watchparty.xyz — the real developer console (build plan)

Owner direction 2026-08-09: an X-Developer-Console-style dashboard as **its own
app with the main project as a harness**. This doc is the complete blueprint,
distilled from the screenshots of X's console (all tabs) — future sessions
should build from THIS, not re-request images. The full per-page transcription
of those screenshots lives in `docs/console-x-reference.md`.

## Architecture (decided)

- **`console/` sibling app in this repo** (the `mobile/` + `cron/` pattern):
  own Next app, own CF worker, own design identity. Main repo provides:
  type-only tRPC imports (`AppRouter`), the deploy pipeline, secrets flow.
- **Shell**: square-ui `templates-baseui` (github zerostaticthemes/square-ui) —
  vetted: Next 16 + React 19 + Tailwind 4 + **HugeIcons** (house lib) + Base UI
  unstyled + zustand, mock-data-driven. License: custom, commercial end
  products explicitly allowed; repo is private so the no-redistribution clause
  is moot.
- **Zero-CORS API**: route `console.watchparty.xyz/api/*` to the MAIN worker at
  the zone level; the console calls `/api` same-origin and the cross-subdomain
  session cookie (2026-08-06) just works. No second auth system.
- **Hosts** (cut over 2026-08-10): `console.watchparty.xyz` = the console app's
  own worker `console-app` (`scripts/cf/attach-console-domain.mjs` is the
  cutover/rollback lever; `/api` currently rides the console's rewrite-proxy
  fallback — the direct zone route needs the Zone→Workers Routes token perm,
  arriving with the 8/20 rotation). `docs.watchparty.xyz` = docs.
  `developer.watchparty.xyz` 308s to console. The interim portal still exists
  at watchparty.xyz/developer.

## X console anatomy (the reference, fully cataloged)

**Shell**: left sidebar — logo + product wordmark; groups: (top) Dashboard,
Notifications, Agent · Access: Projects, Apps, Usage · Toolbox: Event
subscriptions, Webhooks, Connections, Streaming rules · Billing: Credits,
Payments, Billing information; footer: avatar + name + sign-out. Top bar:
account handle (left); Documentation ↗, Forum ↗, search, share, theme toggle,
language picker (right). Content footer: © + social links. Active nav item =
left accent bar + filled icon. Dark theme, hairline-bordered cards, generous
empty states (icon + one-liner + hint), chips for status/plan.

**Pages** (→ = watchparty mapping):

1. **Dashboard** — dismissible recommendation banner (enable auto-recharge);
   "Hello, <name>" + primary Buy Credits; 3 stat cards (Total Balance /
   Credits / Free Credits); Usage-cost-last-30d chart panel; right rail: Apps
   card (rows: icon, name, id, env chip → Manage apps) + one promo card.
   → balances from `api_keys`, chart from `api_key_usage_days`, Keys card.
2. **Notifications** — announcement list (title, body, date, chevron,
   dismiss). → platform announcements table (new, tiny).
3. **Agent** — console chat agent ("set up apps, configure webhooks — just
   describe what you want to build"): empty state, composer, conversations
   rail. → "ask watchparty" assistant infra EXISTS (threads/messages/tools) —
   console-scoped tools later (create key, fund, read usage).
4. **Projects** — project rows (name, plan chip, "Plan: X · N connected
   apps", View apps), "Start a new project" product rows (Create project),
   "Available by request" rows (Contact sales / Request access).
   → maps to the future app-registry tier; skip in v1 (keys are flat).
5. **Apps** — list rows (icon, name, description, project chip, plan chip,
   `● active` chip, delete icon), All-projects filter, Create App.
   → v1: the KEYS list (a key ≈ an app); registry later.
6. **App detail** — breadcrumb, icon + editable name, `● active` + numeric
   id, Exhibit ↗, Settings; "Project Access" bar (chip + Manage); tabs:
   **Keys & Tokens** / Subscriptions / Webhooks / Streaming rules /
   Connections. Keys & Tokens: sections App-Only Auth (Bearer Token: generated
   date, Revoke red + Regenerate), OAuth 1.0 (Consumer Key masked + eye +
   Regenerate; Access Token "For @user · Read" + Generate), OAuth 2.0 (Client
   ID plaintext mono, Client Secret masked + Regenerate, Access Token +
   Generate). → v1: key detail (prefix, created, last used, balance, spend,
   revoke/rotate); masked-with-reveal row pattern for the plaintext-once flow.
7. **Usage analytics** — "Showing data from <30d window> UTC"; panel: count +
   Total Cost + bar chart; "All Events" table (Date ↓ / Kind / Requests) +
   "Breakdown of all requests by type". → `api_key_usage_days` + per-surface
   breakdown (Kind = price-sheet bucket from lib/api-pricing.ts).
8. **Event subscriptions** — per-app selector, refresh, Create subscription;
   table Event Type / Filter / Created At / Actions; per-page select.
   → future (coin alerts / user events push).
9. **Webhooks** — "specific to your Client App ID" + Docs chip; table ID /
   URL / Valid / Created At / Actions; Create webhook.
   → developer outgoing webhooks (registry slice); community webhooks exist
   as prior art.
10. **Connections** — All/Active/Inactive tabs; table Connection ID /
    Endpoint / Status / Connected At / Disconnected At / Client IP.
    → future (live streaming consumers).
11. **Streaming rules** — per-app selector, Add Rules; table ☑ / ID / Rule /
    Tag / Actions; empty CTA button. → future.
12. **Credits** — info banner ("Grok credits are bought elsewhere" — ours:
    "app credits vs API credits" if ever needed); "Remaining balance" big
    number + free credits line; Purchase credits (primary); cards: **Auto
    Recharge** (Off chip, Enable button), **Billing Cycle Cap** (current
    spend, cycle dates, days remaining, Manage Spend Cap), **Free Credits
    Voucher** (Redeem). → balance = key balances (or account-level once
    pooled); Purchase = the USDC deposit flow (exists); voucher ≈ admin grant;
    spend cap = per-key cap (new, small); auto-recharge = n/a (or x402 pitch).
13. **Payments** — date-range picker, All statuses / All types filters,
    tx-id search, "Reset to last 3 months"; table Transaction ID (truncated
    mono) / Status chip (Succeeded green) / Payment Method / Amount / Date /
    Invoice ↓. → `api_credit_deposits`: signature, Succeeded, USDC (Solana),
    amount, date, Solscan link instead of invoice.
14. **Billing information** — Add Payment Method; saved methods list (card
    icon, brand + last4, Default chip, expiry, Remove red); Billing details
    (Manage). → wallet/treasury info: deposit address, network, mint; no
    cards.

## Build order

1. Scaffold `console/` from square-ui templates-baseui (vendored, not a git
   clone — copy `files/` in; keep their design system, it's the console's own
   identity).
2. Shell: sidebar/topbar per anatomy above (watchparty star mark + "Console"),
   auth via shared session (`/api/auth/get-session` same-origin), sign-out.
3. **Dashboard + Usage + Credits + Payments** first — backends live today
   (apiKeys.list, api_key_usage_days, redeemDeposit, api_credit_deposits).
   Needs small new tRPC reads: usage series per key/day, deposits list.
4. Keys pages (Apps v1): list + detail + create (plaintext-once) + fund +
   revoke — port the flows from `components/developer/console-view.tsx`.
5. Registry tier (Projects/Apps proper, webhooks, event subscriptions) — the
   [[developer-platform]] bot-accounts/app-registry arc.
6. Agent tab — console-scoped assistant tools on the existing assistant infra.
7. Cut `console.watchparty.xyz` over from the interim portal to this worker
   (attach-domains pattern; zone-route `/api/*` to the main worker first).

## Deploy shape

Own OpenNext worker (`console-app`) + `deploy-console` job in deploy.yml
mirroring `deploy` (build in `console/`, wrangler deploy). NOT gated on the
main worker's bundle budget. Until it ships, nothing routes to it.
