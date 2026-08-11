# watchparty platform roadmap — phases

The end-to-end phase list for the **developer platform** (console.watchparty.xyz)
and the **creator studio** (studio.watchparty.xyz), from foundations to the
work still ahead. Consolidates `docs/console-execution-plan.md`,
`docs/studio-execution-plan.md`, and the reference catalogs
(`console-x-reference.md`, `console-discord-reference.md`,
`studio-kick-reference.md`, `studio-twitch-reference.md`).

Each phase lists **Goal · What happens · Backend · Surfaces · Status**.
Surfaces split by audience (see the `surface-taxonomy` memory): consumers →
watchparty.xyz, developers → console.watchparty.xyz (separate app), creators →
studio.watchparty.xyz (route group in the main app, host-rewritten).

---

# Part A — Shipped

## Phase 0 · Platform foundations
- **Goal:** make the app's own API billable to external callers without an SDK.
- **What happens:** the 402 gate meters session-less `/api/*` traffic; two ways
  to pay — a funded API key (`x-api-key`) or x402 per-request USDC. Per-surface
  pricing (`lib/api-pricing.ts`), credits held as USDC.
- **Backend:** `lib/api-gate.ts` (edge, WebCrypto), `api_keys` +
  `api_credit_deposits` tables, Redis balance ledger, flush cron.
- **Surfaces:** none yet (gate is invisible until keys exist).
- **Status:** shipped, enforce-live.

## Phase 1 · Console shell + account surfaces
- **Goal:** an X-developer-console-style home for keys, spend, and billing.
- **What happens:** the `console/` app (separate worker `console-app`), grouped
  nav, auth via the shared cross-subdomain cookie, `/api` same-origin to the
  main worker. Dashboard (stats, 30-day chart, keys rail, cross-sell grid,
  get-started checklist), Keys (create-once/fund/revoke), Usage (chart + price
  sheet), Credits (paste-a-signature USDC redeem), Payments, Billing.
- **Backend:** `apiKeys` router (list/create/revoke/fund/usageSeries/deposits).
- **Surfaces:** console Dashboard/Keys/Usage/Credits/Payments/Billing.
- **Status:** shipped.

## Phase 2 · Outbound webhooks (+ hardening)
- **Goal:** developers hear about their own-account events in real time.
- **What happens:** one signed endpoint per account, a grouped event catalog
  (stream.online/offline, user.followed, coin.launched, prediction.resolved),
  a payload tester, a 30-day delivery log, and docs. Then a security-reviewed
  hardening pass.
- **Backend:** `developer_webhooks` + `developer_webhook_deliveries`,
  `developerWebhooks` router, Stripe-style `t=,v1=` HMAC dispatch
  (`lib/developer/webhooks.ts`), wired at 7 chokepoints. Hardening: secrets
  AES-GCM at rest, internal-host blocklist, `redirect:"manual"`, egress caps,
  fail-open throttles.
- **Surfaces:** console Webhooks, docs `#webhooks`.
- **Status:** shipped, e2e-verified against a real endpoint.

## Phase 3 · App registry + per-app keys + enforced scopes
- **Goal:** apps own credentials; keys can be least-privilege.
- **What happens:** an app registry with an Ed25519 signing identity per app;
  keys can be filed under an app; keys can be **restricted to surface families**
  (coins/content/social/charts/rpc/preview/rest), enforced at the edge gate
  (403-before-charge, backward-compatible, fail-open).
- **Backend:** `developer_apps` (+ sealed private key), `developerApps` router;
  `api_keys.app_id` + `api_keys.scopes`; gate `scopeKey` Redis mirror +
  `isPathInScope`.
- **Surfaces:** console Apps grid + `/apps/[id]` detail; Keys scope picker.
- **Status:** shipped, live-gate smoke-verified.

## Phase 4 · Console feature pages
- **Goal:** turn the remaining "Soon" stubs into real surfaces (X-console IA).
- **What happens:** **Streaming rules** (per-app rule CRUD + Add Rules modal —
  rules stored/managed; matching engine is Phase 9), **Connections** (X's table
  + tabs, honestly empty until Phase 9), **Event subscriptions** (surfaces the
  real webhook subscription state), **Notifications** (announcements feed +
  seed), **Projects** (→ /apps redirect), **Agent** (real LLM at
  `/api/console-agent`, reads state via `getMyConsoleState`, guides to pages —
  no write tools, so it can't take side-effectful actions itself).
- **Backend:** `developer_stream_rules`, `developer_announcements` tables +
  routers; `console-agent-tools` + Workers-AI/GLM route (plain text stream).
- **Surfaces:** all 6 console pages → console is **14/14 real**.
- **Status:** shipped; Agent verified with a live-model smoke test.

## Phase 5 · Creator studio foundation + Stream Manager cockpit
- **Goal:** a Kick/Twitch-style creator studio at its own subdomain.
- **What happens:** host-rewrite `studio.watchparty.xyz → /studio`, an
  authenticated lean shell (no wallet SDKs), and the Streams **cockpit**:
  live preview (IVS player via CDN), Session Health + Time-Live (from IVS
  `GetStream`), stat tiles, Channel Actions (chat modes), a live chat rail,
  ingest + stream-info. Home with real-time status.
- **Backend:** `stream.liveInfo`/`dashboardStats`; existing stream/chat
  procedures surfaced.
- **Surfaces:** studio Home + Streams cockpit.
- **Status:** shipped; subdomain cut over (attach-studio-domain.mjs). Chat
  WebSocket flow needs a live broadcast to fully confirm.

## Phase 6 · Studio content / community / analytics / revenue
- **Goal:** the rest of the creator control centre, surfacing existing backend.
- **What happens:** Content pipeline (drafts/scheduled with publish/delete/
  cancel), Community (mods/VIPs/banned rosters + welcome message), Analytics
  (real metrics + top posts), Revenue (claimable USDC, keep-95% framing; claim
  stays on /premium).
- **Backend:** `creator`/`moderation`/`content`/`subscription`/`user` routers
  (all pre-existing) surfaced.
- **Surfaces:** studio Content/Community/Analytics/Revenue.
- **Status:** shipped.

## Phase 7 · Media Studio (Library + Producer/Broadcasts)
- **Goal:** X Media Studio (studio.x.com) inside the studio.
- **What happens:** **Library** (default Content tab — a media grid of the
  creator's videos), **Producer/Broadcasts** (a broadcast-history list with
  durations).
- **Backend:** `content.getVideosByUser` surfaced; new `stream_sessions` table
  recording each go-live→offline (IVS webhook + toggle, via
  `lib/stream/sessions.ts`) + `stream.broadcasts`.
- **Surfaces:** studio Content → Library/Broadcasts tabs.
- **Status:** shipped.

---

# Part B — Next

## Phase 8 · Bot accounts (bring-your-own-bot)
- **Goal:** developers run bots that act in communities.
- **What happens:** a bot is a real `user` row (`is_bot`), one per app; a
  `wpb_` token authenticates a tRPC/REST context; community install via a
  **permissions bitfield** (send-messages / manage-coin-alerts / moderate /
  read-members), scoped per community. Fail-closed safety: `protectedProcedure`
  rejects bot contexts by default (protects all ~30 routers), a `botProcedure`
  opts specific endpoints in.
- **Backend:** `user.is_bot` + `developer_bots` (app→bot, token hash); bot-token
  resolution in `server/trpc.ts createContext` (only when no cookie + a `Bot`
  header — no cost to app traffic); a permissions model.
- **Surfaces:** console app-detail **Bot** tab (token view-once, install toggle,
  permission checkboxes with a live integer).
- **Status:** **shipped.** Identity + `wpb_` HMAC-keyed token (same proven
  scheme as the API keys, `lib/developer/bot-auth.ts`), fail-closed context
  resolution (`server/trpc.ts` — bots never get a session; `botProcedure` is the
  only door), and the console Bot tab (view-once token, reset, remove). Second
  half shipped too: `developer_bot_installs` + a per-community permissions
  bitfield (`lib/developer/bot-permissions.ts`), owner-facing install/
  setPermissions/uninstall (gated on app-ownership AND community owner-or-ADMIN),
  bot-facing `installs` + `listMembers` (gated on `READ_MEMBERS`), and the
  console permission toggles. Bits vendored to the console with a drift test.
- **Hardening (two adversarial re-review passes):** pass 1 (auth) — app-delete
  revokes the bot (auth-layer join + user-row delete, no ghost account), `is_bot`
  users refused a session at `session.create.before` (not left to DNS), create()
  transactional; couldn't break token verify, hot-path gating, or IDOR. Pass 2
  (install/permissions) — install-time gates held (no cross-tenant install, IDOR,
  permission forgery, overflow, confused-deputy); fixed the two findings: added a
  community-owner revocation surface (`communityBots`/`communityUninstall`/
  `communitySetPermissions`, serverId-scoped + `assertCommunityAdmin`, so the
  server owner can evict any bot regardless of who installed it), and a
  fail-closed `perm <= 0` guard in `requireInstallPermission`.
- **Deferred within the phase:** (1) the community-side **Bots management UI** —
  the revocation endpoints exist but need a section in Server Settings →
  Integrations (alongside webhooks) to be human-usable; deferred because
  `components/community/` is the parallel chat session's active surface. (2) only
  `READ_MEMBERS` has an enforcing bot endpoint; `SEND_MESSAGES`/
  `MANAGE_COIN_ALERTS`/`MODERATE` are defined bits awaiting their botProcedure
  capabilities (each added one at a time, so a bot can do nothing not explicitly
  opted in). (3) A live per-bot smoke is the last verification step.
- **Risk/notes:** token auth touches the context hot path; the fail-closed guard
  is the load-bearing safety property.

## Phase 9 · Real-time streaming engine
- **Goal:** make Streaming rules, Connections, and Event subscriptions *live*.
- **What happens:** a real-time event stream + a rule-matching engine so a
  developer's stored rules filter a firehose and deliver matches; held
  connections (SSE/WS) tracked in the Connections table; event subscriptions
  deliver over that stream. This is the backend the three Phase-4 console pages
  front (they're honest empty/stored today).
- **Backend:** a streaming layer — the planned PartyKit/Durable-Objects
  direction — plus rule evaluation and connection accounting. Deliberately
  **not** a naive per-account webhook firehose (the Helius-arithmetic cost
  lesson): own-account events stay bounded; a firehose is its own metered
  product with per-rule cost controls (X's "must include ≥1 standalone
  operator" rule).
- **Surfaces:** already built (Phase 4) — they populate once this ships.
- **Status (transport decided + shipped, pull-first):** the metering decision was
  made — **cursor-pull, not a socket firehose** — because it's the production-
  correct transport on Workers/OpenNext and webhooks already cover server-to-
  server push. Shipped:
  - **Rule engine** (`lib/developer/stream-rules.ts`, 18 tests): X's grammar over
    watchparty's structured own-account events (AND-of-terms, negation, exact
    `field:value` operators, bare-keyword substring, OR across an account's
    rules). The ≥1-positive-term rule is enforced at write time AND match time —
    it's the metering safeguard (an all-negation rule = the whole firehose).
    `developerStreamRules.add` now validates through it.
  - **Delivery queue + pull** (`developer_stream_deliveries`, bigserial cursor):
    the event bus (`dispatchDeveloperEvent`) feeds both channels — webhook push
    and the rule-filtered queue — from one payload build. `GET /api/stream/events?
    since=<seq>` is x-api-key'd (same header the 402 gate meters), at-least-once,
    replayable 3 days. Console Connections shows the live endpoint + throughput;
    Event subscriptions shows a live match tail.
- **Deferred:** the **WebSocket/SSE push** transport — built once on the shared
  chat/video realtime layer (PartyKit/Durable Objects), riding this same queue,
  scoped deliberately per the realtime-architecture note. Worth checking whether
  the container runtime can hold long-lived connections before reaching for a DO.
  Per-rule cost controls beyond the account-bounded default price are a later
  metering knob.

## Phase 10 · Studio Media upload/compose + Insights
- **Goal:** finish the Media Studio parity items.
- **What happens:** in-studio media **upload** (resumable TUS to Supabase
  storage, per the storage memory) and **compose** (create a post from a Library
  item) instead of linking out; an **Insights** view (per-video + per-broadcast
  performance) beyond the current Analytics page.
- **Backend:** existing upload (`upload` router / TUS) + content create;
  per-broadcast metrics from `stream_sessions` + views.
- **Surfaces:** studio Library upload button, per-item compose, an Insights tab.
- **Status:** not built (today: upload/compose link to the main app; the studio
  has an Analytics page but no per-item Insights).

## Phase 11 · App verification + directory
- **Goal:** a trust gate before an app scales or lists publicly.
- **What happens:** an auto-evaluated verification checklist (Discord §9 model —
  ✓/⚠ criteria rows, computed "missing n" summary, nav badge from the same
  state): complete profile, ToS + privacy URLs, owner email + 2FA, human review
  for privileged scopes. Then a public app directory / "Connect with watchparty"
  OAuth surface.
- **Backend:** `developer_apps.flags` (reserved), verification state, a review
  queue; OAuth2 authorize/token for third-party "sign in with watchparty."
- **Surfaces:** console app-detail Verification page; a directory.
- **Status:** not built; `flags` column exists as the hook.

## Phase 12 · Rate limits as a first-class API contract
- **Goal:** protect infra beyond credits, X-style.
- **What happens:** three layers — per-second burst caps on expensive endpoints,
  per-window (15m) limits split app-pool vs user-pool, credits as the monthly
  meter; every response carries `x-ratelimit-*` + `x-credits-remaining`; an
  invalid-request tripwire (N 4xx/10min → temp edge block via a CF WAF rule).
- **Backend:** Upstash limiters keyed by `(routeGroup, appId, majorParam)`; edge
  headers; a WAF rule.
- **Surfaces:** documented in the API docs; visible in response headers.
- **Status:** not built (per-mutation throttles exist; the full contract does not).

---

## Cross-cutting (every phase)
- **Verify:** main tsc + console tsc (capture output — a bare exit code can be a
  false pass under OOM), repo guards, `bun test`, and a **live-model smoke** for
  any LLM surface (tsc can't see empty-reply/reasoning-budget bugs).
- **DB:** additive/nullable SQL under `db/`, applied to BOTH Supabase projects;
  never `drizzle-kit push`.
- **Shared tree:** a parallel session edits this repo — commit explicit file
  lists, never `git add -A`, never touch another session's files.
- **Deploy:** CI-only; concurrency cancels older runs, so verify the run matches
  the newest SHA.

## Status summary
Phases 0–7 **shipped and live** (console 14/14 pages; studio 7 surfaces + Media
Studio; both subdomains serving). Phases 8–12 are the remaining product —
8 (bots) is designed; 9 (streaming engine) is the biggest real-backend build and
unblocks three already-built console pages; 10–12 are studio/trust/limits polish.
