# Developer platform — execution plan

The phased build from the interim console (Keys/Usage/Credits/Payments +
outbound webhooks, all shipped) to a full developer platform. Grounded in two
research passes against the live docs (2026-08-10):

- **Discord** — apps + bot-users, Ed25519 signed deliveries with a PING
  handshake and auto-disable, gateway intents vs webhooks, OAuth scopes,
  per-route rate buckets, an invalid-request firewall, verification gating
  growth. (Notes: `docs/console-discord-reference.md`.)
- **X** — Apps carry many credential types; rules are persistent server-side
  state edited over REST and decoupled from the connection; CRC = continuous
  cryptographic liveness re-attestation of webhook endpoints; rate limits
  split into app-pool vs user-pool; pay-per-use credits with per-resource
  pricing and a 24h dedup window. (Notes: `docs/console-x-reference.md`.)

Two decisions taken up front, from the research:

1. **No Projects layer.** X deleted it; we never add it. Keep its one
   invariant, which we already have: **credentials attach to apps, money and
   entitlements attach to the account.** The console's "Projects" tab becomes
   an alias/redirect to Apps rather than a second hierarchy level.
2. **Each webhook gets its own signing secret** (Stripe's model, already how
   `developer_webhooks` works). X's biggest wart is the consumer secret doing
   triple duty so rotating it breaks webhooks — we decouple, deliberately.

Current console tabs and their real state: **live** — Dashboard, Keys, Usage,
Credits, Payments, Billing, Webhooks. **Soon** — Agent, Projects, Apps, Event
subscriptions, Connections, Streaming rules. **live-but-empty** —
Notifications. Each phase below turns Soon → live and removes the pill.

---

## Phase 1 — App registry (the foundation everything hangs off)

The Discord §1 app-detail page. Nothing else (per-app keys, per-app webhooks,
scopes, bots) can be per-app until apps exist.

- **Data model** `developer_apps`: `id` (public `wpapp_` id), `ownerId` FK
  user, `name`, `description`, `iconUrl`, `tags[]`, `publicKey` (Ed25519, hex),
  `privateKeyEnc` (sealed via `lib/developer/secret-box.ts`), `tosUrl`,
  `privacyUrl`, `flags` bitfield, timestamps + `deletedAt` (soft). Ed25519
  keypair minted at creation with `@noble/curves` (already a dep; deterministic
  and workerd-safe). Own-row RLS, additive SQL in `db/`.
- **Router** `developerApps`: `list` / `get` / `create` / `update` (identity
  fields) / `rotateKey` (new Ed25519 pair, public shown, private resealed) /
  `remove` (soft). Reuse the mutation throttle from webhooks.
- **Console** `/apps`: list (square cards, §14 Applications grid) → `/apps/[id]`
  detail (identity form with icon/name/description/tags, **Application ID** +
  **Public Key** read-only with copy, install/adoption counts honestly
  "updated daily" once data exists, ToS/privacy fields, red danger zone). Drop
  the Soon pill on Apps; point Projects → `/apps`.
- **Security**: developer holds only the *public* key (safe to leak); we sign
  with the private half. This is the trust model for every future signed
  delivery. `create` gated on `API_GATE_SECRET` (same as keys/webhooks).

## Phase 2 — Per-app scoping of keys & webhooks

Make the phase-1 app the owner of credentials, migrating the account-level v1.

- API keys gain a nullable `appId` (additive); the Keys page can filter by app;
  unassigned keys stay account-level (no breaking change).
- Webhooks move from one-per-account to **one-per-app** (Discord's model). The
  existing `developer_webhooks.userId` PK becomes `appId`; a data migration
  is unnecessary (tables are effectively empty). The console webhooks page
  moves under `/apps/[id]/webhooks`; the top-level tab lists across apps.
- **Scopes**: keys/webhooks gain a `scopes[]` (`resource.verb` catalog:
  `coins.read`, `content.read`, `social.read`, `streams.read`,
  `predictions.read`, `webhook.incoming`, …). The 402 gate reads scope before
  billing. Console: a scope multi-select (Discord's live-assembling picker).

## Phase 3 — Bot accounts (bring-your-own-bot to communities)

The headline "can people bring their own bots" answer. Bots are **real `user`
rows** — the deep Discord lesson (bots being users is why the platform
composes: chat, communities, profiles, permissions all work for free).

- `user.isBot` (additive bool) + `botAppId` FK (unique — one bot per app).
- Bot token: `wpb_<base64url(botUserId)>.<32 random bytes>`; store a hash only;
  `Authorization: Bot <token>` resolves a tRPC context with `userId = bot`,
  `appId`. Self-healing: too many auth failures/day → auto-rotate + email.
- **Community install** via a consent screen with a **permissions integer**
  (small bitfield: `SEND_MESSAGES`, `MANAGE_COIN_ALERTS`, `CREATE_PREDICTIONS`,
  `MODERATE`, `READ_MEMBERS`), scoped per community — permission-limited per
  community, not scope-limited, exactly like Discord guilds. Ties into the
  existing community webhooks (`/api/webhooks/community/[id]/[token]`), which
  already give a bot a way to *post*; this adds identity + permissions.
- Console: an app's **Bot** tab (token reset-only view-once, public/private
  install toggle, permission checkboxes with a live permissions-integer field).

## Phase 4 — Event subscriptions + Streaming rules + Connections

X's filtered-stream model: **rules are persistent server-side state, edited
over REST, decoupled from the connection; every delivered event echoes
`matching_rules: [{id, tag}]` with a developer-supplied tag.**

- **Streaming rules**: `developer_stream_rules` (appId, value, tag). Router
  add/delete (`{add:[{value,tag}], delete:{ids}}`, `dryRun`) / list. A tiny
  rule language: standalone operators (`coin:`, `creator:`, `event:trade`,
  keyword) vs conjunction-required modifiers (`min_usd:`, `chain:`, `is:launch`)
  with the "must include ≥1 standalone" rule — that constraint is the cost
  control (stops whole-firehose matches). Quotas live in the price sheet.
- **Event subscriptions** = the delivery side. On Cloudflare (Workers can't
  hold long-lived streams) the **primary mode is webhook delivery of matched
  events** (X's newest product), routed through the phase-1/2 per-app webhook.
  A held SSE/WS stream is a later add via the planned PartyKit/DO layer.
- **Connections** tab: 1 concurrent stream per app (409 on a second), 20s
  heartbeat, and a health view — connected-since, last-event-at, rule count,
  disconnect-reason history. Backfill 1–5 min on reconnect + a replay job
  (time-window re-delivery) instead of promised retries; document "duplicates
  possible, dedupe on event id."

## Phase 5 — Endpoint validation (CRC), delivery hardening, verification

Adopt X's **CRC** over Discord's one-shot PING — continuous cryptographic
liveness attestation beats validate-once:

- On URL save, `GET ?crc_token=…` → endpoint returns
  `{"response_token":"sha256="+base64(HMAC_SHA256(secret, crc_token))}`;
  re-probe on a cron; **auto-invalidate after ~28h without a pass** →
  `status = disabled_by_platform` + Resend email (stops paying to deliver to
  zombie endpoints — matters once deliveries are credit-billed). Console shows
  a valid badge + last-CRC-at + a greppable failure enum
  (`CrcValidationFailed` / `UrlValidationFailed` / `DuplicateUrlFailed`).
- Delivery already signs `t=,v1=` HMAC (timestamp kills replay — X lacks it).
  Add exponential backoff via QStash (Workers-safe) with a hard stop, not
  infinite retry.
- **Verification** (Discord §9): a console checklist gating app growth
  (>N communities / higher rate tier / directory listing): complete profile,
  ToS + privacy URLs, owner email verified, **owner 2FA** (better-auth's
  `two-factor` plugin is already in the stack), human review for privileged
  scopes. Auto-evaluated rows with ✓/⚠ + an orange "missing n criteria"
  summary, nav badge driven by the same state (already built as UI patterns in
  the dashboard checklist).

## Phase 6 — Rate limits, Notifications, Agent

- **Rate limits** as a first-class API contract, three layers (X's model):
  per-second burst caps on expensive endpoints, per-window (15m) limits **split
  app-pool vs user-pool**, credits as the monthly metering layer. Always return
  `x-ratelimit-limit/-remaining/-reset` + a stable 429 code, plus
  `x-credits-remaining` (for a prepaid API the balance *is* the real limit).
  An **invalid-request tripwire** (N 401/403/429 per 10 min → temp edge block
  via a CF WAF rule) keeps a misbehaving SDK from becoming an accidental DDoS.
- **Notifications**: a real announcements backend feeding the live-but-empty
  tab (platform changes that affect integrations — deprecations, incidents,
  new events). Small `developer_announcements` table + admin authoring.
- **Agent**: the console agent (already an Ask-watchparty surface exists via
  `app/api/assistant`) scoped to console actions — "set up a key, subscribe to
  coin.launched, show my failing deliveries." Last, because it's a convenience
  over everything above.

---

## Cross-cutting security posture (applies every phase)

- **Signing**: Ed25519 per app for platform→app deliveries (dev holds only the
  public key); per-webhook HMAC secret for the current outbound system, sealed
  at rest (`secret-box.ts`).
- **Egress safety**: URL blocklist (own apex incl. trailing-dot, localhost,
  `.local`/`.internal`, IP literals) + `redirect:"manual"` so a saved endpoint
  can't bounce a signed POST onto a blocked host. Per-account egress cap.
- **Auth**: every console mutation is `protectedProcedure` + own-row scoped;
  secrets/tokens are view-once, reset-only, hash-or-seal at rest, never
  returned by read procedures.
- **Throttling**: fail-open Upstash limiters on mutations + test sends, so
  Redis being down never takes the feature down.
- **DB changes**: additive + nullable only, SQL committed under `db/`, applied
  to BOTH Supabase projects; never `drizzle-kit push` (auth-table clobber risk).
- **Verification gate** before any app can act at scale or list in a directory.

## Status

- Phase 0 (interim console + outbound webhooks + hardening): **shipped**
  (`50962a08`, `9fbbaa25`, `20b995a1`, `ed62e021`).
- Phase 1 (app registry): **shipped** (`5e942a94`; DDL applied to both DBs).
- Phase 2a (per-app API key association): **shipped** — `api_keys.app_id`
  nullable, `apiKeys.create` takes an optional owned `appId`, app-detail page
  has a Keys section. **Not** a security boundary (organization only), so no
  fake-gate risk. Scope *enforcement* (2b) is deliberately separate: it
  touches the edge-gate hot path + Redis and needs the live-gate smoke
  scripts, so it doesn't ride a tsc-only pass.
- Phase 2b+ (scopes with enforcement, per-app webhooks) and 3–6: specced
  above; build in order.
