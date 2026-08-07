# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

`watchparty` is a ground-up rewrite of an older, feature-complete app that lives at `../sidebar` (a Solana-based live-streaming / social / wallet app: ~30 tRPC routers, ~500 components, Drizzle + Supabase, AWS IVS streaming, Deepgram captions, Typesense search). The logic there is mostly built; **this rewrite's goals are design quality and speed**, while porting the essential logic forward and **adding EVM support** alongside Solana.

Treat `../sidebar` as the reference implementation when porting a feature — but never copy its loading strategy (see the speed rule below).

## Premium & creator subscriptions (USDC, auto-recurring)

Both the site's **platform premium** tiers and **creator subscriptions** run on the
Solana **Subscriptions & Allowances** program (`De1eg…`), billed in **USDC**, with a
scheduled collector that auto-pulls each period. Built, tsc/build-clean, and
**devnet-validated**. Not yet live on mainnet.

- **Code map:** `lib/premium/tiers.ts` (platform pricing), `lib/chains/solana/subscriptions/`
  (kit client, `compat` wallet-adapter bridge, `checkout`, `collector` = server signer +
  pulls/sweep), `server/routers/premium.ts` + `server/routers/subscription.ts` (creator),
  `app/api/cron/premium-collect` + `app/api/cron/treasury-sweep`, UI in `components/premium/`.
- **Money model:** subscribers → hot **collector**; creators **claim** their balance minus a
  **5% fee** (`PLATFORM_FEE_BPS`) automatically; profit **auto-sweeps to a cold wallet**
  (`TREASURY_COLD_PUBKEY`). The ONLY manual recurring task is withdrawing profit from cold
  (+ occasional SOL top-up for gas). Treasury key safety: `docs/treasury-security.md`.
- **HOW DO I LAUNCH? → `docs/cloudflare-launch.md`** (copy-paste runbook: secrets, env,
  provision, crons, verify). Ops detail: `docs/premium-ops.md`. Do the mainnet push on
  Cloudflare, not Vercel (provisioning is permanent + host-independent; secrets/crons belong
  on the real host).
- Treasury keypairs are generated into the gitignored `.treasury-keys/` (back up + delete).

## Commands

Package manager is **bun** (`bun.lock`). Runtime is Next.js 16 (App Router, Turbopack) + React 19.

- **Type-check (the only verify step; there is no typecheck script):**
  ```bash
  rm -rf .next/dev/types && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
  ```
  Both parts are load-bearing — a plain `npx tsc --noEmit` **reports success on
  broken code**:
  - **Stale `.next/dev/types`** (left by a previous `next dev`) contains *syntax*
    errors, and while they're present tsc reports ONLY them and skips semantic
    checking of the real source. This shipped three red deploys on 2026-07-22
    (two bad tRPC router keys, one drizzle `alias()` type); each was invisible
    locally and caught by CI. Deleting the directory reproduced all of them
    instantly.
  - **Default heap OOMs mid-run** and can exit 0 with a stack trace on stdout —
    which also looks like a pass (shipped a broken deploy 2026-07-17).

  A real pass is **empty output**. Treat crash frames (`node::Start`, `dyld`) as
  a failure regardless of exit code.

### TypeScript stays on 6.x — do NOT bump to 7 (evaluated 2026-07-28)

TS 7 (the native rewrite) is genuinely ~40x faster here (~10min → ~60s cold) and
type-checks this repo clean. It was still rejected, on purpose:

- **Zero production upside.** `tsconfig` is `noEmit` and Next transpiles with
  SWC, so tsc never emits a byte — TS 6 and TS 7 ship an **identical bundle**.
  The entire gain is local iteration speed.
- **It breaks `next build`.** The build type-checks via TypeScript's *JavaScript
  compiler API*, which the native rewrite doesn't expose: the build dies after a
  full compile with "TypeScript 7.0.2 does not provide the compiler API required
  by Next.js". The only fix is `experimental.useTypeScriptCli`, i.e. putting an
  **experimental flag in the deploy path** ("behavior may change" per Next docs).
- **It kills lint entirely** (below), so a second safety net goes down too.
- tsc is the **only** automated gate here (no tests), and TS 7 is a from-scratch
  reimplementation — a false negative wouldn't announce itself.

Revisit when typescript-eslint supports TS 7 and `useTypeScriptCli` is stable.

- **`bun run lint` works — keep eslint on 9.x, do NOT bump to 10.** eslint 10
  crashes on `eslint-plugin-react`, which hasn't adopted its rule API
  (`TypeError: contextOrFilename.getFilename is not a function`). Verified
  2026-07-28. Lint currently reports ~650 errors / ~17k warnings (pre-existing,
  mostly `no-explicit-any`), and runs in neither CI nor `next build` — Next 16
  removed `next lint`.

Tests: `bun test ./tests` (bun's built-in runner — quests/xp logic, money-path
base-unit conversion, memescope filters, chain maps). CI runs it as the `test`
job in deploy.yml and it GATES `deploy` + `deploy-container`. Pure logic only —
no DB, no network; keep it that way so the gate stays fast and unflaky.

## Architecture

### The speed rule (the whole point of the rewrite)
The old app was slow because its **root layout wrapped `SolanaProvider` (the full wallet-adapter stack) around every route**, so even the login page eagerly downloaded the wallet SDK. Do not reproduce this. Concretely:

- **Root `app/layout.tsx` stays lightweight** — fonts, theme, analytics only. No data/wallet/query providers.
- **Route groups isolate bundles:** `app/(marketing)/` (landing), `app/(auth)/` (login), `app/(app)/` (the authenticated app). Heavy providers (TanStack Query, chain/wallet providers) live in **`(app)/layout.tsx`**, never the root — so login and landing never pay for them.
- **Heavy SDKs load behind interaction** via `await import()` / `dynamic()`: chain SDKs (Solana + EVM), IVS, Deepgram, emoji/gif pickers. Paid per-click, not per-pageload.

When adding anything heavy, ask "which route group needs this, and can it be lazy?" before importing it.

### Target structure (layout-first)
File organization mirrors `../sidebar` (deliberately — keep the shape the author knows): top-level `components/<feature>/`, `hooks/`, `lib/`, `server/routers/`, `db/schema/`. This is **not** a feature-first/colocated layout. The data layer stays **tRPC** (port the ~30 routers as-is; no server-actions rewrite).

The one intentional structural change is **`lib/chains/`**: a `ChainAdapter` interface (`types.ts`, `registry.ts`) with `solana/` and `evm/` implementations, so wallet UI is chain-agnostic and adding EVM (viem/wagmi + SIWE, paralleling the old Solana `better-auth-siws`) is "add a folder," not threading `if (evm)` through every wallet component.

The full sidebar frontend (components/hooks/lib/server/db) was bulk-migrated in-tree, and all of sidebar's `(browse)` routes now exist under `app/(app)/`.

### Migrating/adding a page from sidebar
Use the `port-sidebar-page` skill — it has the full copy/auth-guard/lazy-load/verify workflow and the login-gating caveat.

### Responsive: mobile-first, all breakpoints
Unlike the old app (desktop-focused), every component here must work mobile + tablet + desktop. Build **mobile-first**: unprefixed classes are the mobile layout; `sm:`+ holds the desktop values from the Figma frame. Example from `components/auth/login-card.tsx`: `h-14 sm:h-[61px]`, `max-w-[442px]` column collapsing to full-width below it.

## Design language

**Read `docs/design-principles.md` before building or restyling any UI.** It's
the canonical, distilled design reference: borrow *patterns* from the references
in `docs/references/*.md` (Phantom = cards + scroll; Rainbow = gradients +
rounding) but express them in watchparty's own identity (pastels, `font-pixel`
display, Lisse squircle). Load-bearing rules: aggressive rounding, and **never
gray/black drop shadows** (use inset highlights, brand-tinted glow, or inner
hairlines). Model in-app UI on the upgrade-overlay aesthetic, not settings.

## Conventions

- **Font:** Geist project-wide (via `next/font/google` in `app/layout.tsx`), replacing the old app's SF Pro Rounded. Note `globals.css` must not re-declare `font-family` to anything else or it overrides Geist.
- **Per AGENTS.md**, this is Next.js 16 with breaking changes from training data — read `node_modules/next/dist/docs/` before using an API you're unsure about.

### Verifying responsive layouts
Headless Chrome's `--screenshot` with `--window-size` **does not honor the layout viewport** — it renders wide and crops, so "mobile" CLI screenshots are misleading. To truly test a breakpoint, drive the installed Chrome with `puppeteer-core` and `page.setViewport({ ..., isMobile: true })`, and assert `document.documentElement.scrollWidth === clientWidth` to catch horizontal overflow.

### Brand/Figma SVG icons
Provider marks in `components/auth/provider-icons.tsx` were extracted verbatim from the Figma export. Paths keep their original canvas coordinates and each `viewBox` is positioned over the icon's location (e.g. `viewBox="522 287 28 28"`) — this avoids re-normalizing path data. Reuse this trick when lifting vector art out of a full-frame Figma SVG.

## Mobile app (`mobile/`)

iOS app (Expo SDK 56) — invariants live in `mobile/CLAUDE.md`, which loads when working under `mobile/`. Headline rule: type-only tRPC imports across the boundary, never value imports.

## Deploy target & dev setup

- **Deploy: Cloudflare** via `@opennextjs/cloudflare` (chosen for speed/cost). Keep code Workers-compatible: HTTP-based services (Upstash Redis, Resend) are fine; the DB uses **postgres.js** which runs on Cloudflare **Hyperdrive** (front Supabase with it — edge compute + single-region Postgres is slow without it). Full CF/wrangler/Hyperdrive setup is a later milestone.
- **Dev runs on port 3001** (`bun dev` → `next dev -p 3001`) to match the reused OAuth callback URLs and `NEXT_PUBLIC_AUTH_URL` in `.env` (copied from `../sidebar`; same Supabase DB).
- **Reused production DB (dev == prod):** dev runs against the **same** Supabase DB as production, so any schema change hits live data immediately. **Additive, nullable changes are OK** (e.g. `ADD COLUMN ... text` — safe and reversible); apply them deliberately and prefer manual SQL committed under `db/` (see `db/affiliate-column.sql`, `db/feed-indexes.sql`) so the change is reviewable. **Avoid destructive migrations and `drizzle-kit push`**, which can clobber the auth tables ported verbatim from the old app. Keep `db/schema/auth` in sync with the DB by hand.
- **Squircle corners: use Lisse (`@lisse/react`), opt-in per element.** The old `tailwindcss-corner-shape` was removed — it used the CSS `corner-shape` property which is **Chrome-only** (broken in Safari) and forced squircle onto *every* `rounded-*` (so even pills got squircled). Lisse uses SVG `clip-path` (works in Safari/Firefox/Chrome). Apply via the `components/ui/squircle.tsx` helper: `<Squircle asChild radius={20}><button className="…">…</button></Squircle>` — and do NOT add `rounded-*` to a squircled element (redundant under clip-path). **Pills (Connect Wallet, Complete, Create) stay plain `rounded-full` with NO `<Squircle>`.**

### Cloudflare bot protection: leave Bot Fight Mode OFF (decided 2026-08-06)

Cloudflare's domain security scan recommends enabling **Bot Fight Mode**. Don't.
It challenges anything it scores as automated, exempts only Cloudflare's
verified-bot list, and on the free plan **cannot be scoped or excepted** — WAF
skip rules do not apply to it. This domain serves four kinds of legitimate
non-browser traffic that would start failing silently:

- `/api/trpc/*` — the Expo app (`mobile/`), which can't solve a JS challenge
- `/api/captions/webhook` (AWS IVS) and `/api/webhooks/community/[webhookId]`
- the `watchparty-cron` worker's 14 public fetches, plus `/api/ad/*`, `/api/rpc`

The Security Center row says "Bot Fight Mode not enabled" *because* it's off, so
being off never satisfies it — **dismiss the row**, don't flip the setting. It's
typed "Configuration suggestion," not a vulnerability.

**If bot protection is ever actually wanted, the real path is Pro + Super Bot
Fight Mode**, which *does* support skip rules — exempt `/api/*` and let it work
on the HTML routes.

Related zone state (all verified 2026-08-06): `crawler_protection: enabled`
(AI Labyrinth — traps crawlers that ignore robots.txt, no SEO impact) and
`ai_bots_protection: "block"`, which was pre-existing and blocks AI crawlers
outright — that's the setting that governs whether ChatGPT/Perplexity can cite
the site, and it's a product call, not a security one. Email/DNS posture (SPF,
DMARC, security.txt) is documented in the memory `email-dns-hardening`.

## Query gotcha: never interpolate a JS `Date` into a `sql` template

```ts
sql`${table.someAt} < ${aDate}`          // ✗ 500s in production, fine locally
lt(table.someAt, aDate)                  // ✓
sql`... raw_alias.some_at > ${aDate.toISOString()}::timestamptz`  // ✓ when there's no column to type against
```

A value interpolated into `` sql`` `` carries **no column**, so drizzle has no
encoder to apply and passes the `Date` straight to postgres.js. On Workers that
throws `TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type
string or an instance of Buffer or ArrayBuffer. Received an instance of Date`.
`lt()`/`gt()`/`eq()` take the column, so drizzle maps the Date through the
timestamptz encoder and sends a string.

**It works under `next dev` and fails only on the deployed worker** (Node's
Buffer accepts it, workerd's polyfill doesn't), so nothing local catches it —
and drizzle reports only `Failed query: <sql>`, hiding the real message on
`.cause`. When a query fails in production for no visible reason, log
`err.cause`, not the error.

This cost a day of "/feed is broken and the app is 10x slower" (2026-08-03):
`coinFeed.list`'s cursor made **every page past the first** 500, page 1 has no
cursor so the rail always painted, and the guard meant to stop paginating
against a failing query checked `isError` — which stays false on an infinite
query while any page is good. The list re-requested the same cursor forever, on
every route in the `(rails)` group. Reply pagination (`comment.ts`) had the
identical bug, silently.

## MUST KNOW: `shadcn add` can silently overwrite `lib/utils.ts`

**Always `--dry-run` first.** Community registries (`@beui` especially) bundle
shared lib files alongside the component, and the CLI overwrites them:

```bash
bunx --bun shadcn@latest add @beui/<thing> --dry-run   # read the overwrite list
cp lib/utils.ts lib/ease.ts /tmp/                      # back up anything named there
bunx --bun shadcn@latest add @beui/<thing> --overwrite
# restore/merge, then diff to prove nothing was lost
```

Hit for real on 2026-08-03 adding `@beui/range-slider`. That item ships its own
`lib/utils.ts` containing **only `cn`**, and the CLI replaced ours with it —
dropping `compactCount`, `ellipsify`, `shortenWalletAddress`, `formatNumber`,
`formatUsd` and `formatNumberGrouped`, every one of them used across the app.
Caught only because the file had been backed up first; restored byte-identical.
`lib/ease.ts` was the other overwrite that time and was benign — it diffed clean
and gained `SPRING_GLIDE`, which the slider needs.

The CLI *does* print `⚠ 2 files will be overwritten`, but only on `--dry-run` or
in the summary after the fact — by which point the file is already gone. Nothing
in tsc catches it either: the app still compiles until something imports one of
the missing helpers.

## `@beui/table` has no scrollbar (checked 2026-08-03)

Don't install it hoping to lift one. Its scroll container is plain
`className="overflow-auto"` — no `::-webkit-scrollbar` rule, no `scrollbar-*`
utility, no `css`/`cssVars` on the registry item, across all 14 files. The
scrollbar on beui.dev is the **native browser one**, which never appears here
because `globals.css` hides scrollbars app-wide (`* { scrollbar-width: none }`).
The rails use `components/rails/rail-scrollbar.tsx` instead.

## Auth / better-auth dependency gotchas

The auth stack is sensitive to transitive versions. Two non-obvious pins/fixes were required to get it compiling and running:

- **`kysely`: pin retired.** Historically pinned to 0.28.17 (better-auth statically imports `@better-auth/kysely-adapter` even on the Drizzle adapter, and kysely 0.29.0's bundled build broke that import with "export … doesn't exist"). As of better-auth ≥1.6.16 the adapter supports `^0.29.0` and the auth route boots on 0.29.2 (verified via `next start` + `/api/auth/ok`). kysely is still never used at runtime — it's import-time-only baggage.
- **Don't add `better-call` as a direct dependency** — it's better-auth's *internal* RPC/endpoint framework (same authors), not a package we consume. Every published better-auth still pins better-call `1.3.x` (latest `1.6.22` → `1.3.7`; even `1.7.0-rc.0`, beta, and canary are on `1.3.x`); none has adopted `2.x`. Forcing `better-call@2.0.5` in produced **31 type errors in `lib/auth/server.ts`** (verified 2026-06-27, mobile tsc): every plugin (`expo`, `siwe`, `custom-session`, `multi-session`, `two-factor`, `dash`) becomes *not assignable to `BetterAuthPlugin`*, because the plugins' `endpoints` carry better-call 1.3.7's `Endpoint` type while `BetterAuthPlugin` resolves `Endpoint` from 2.0.5 — two type identities colliding at the registration site. **Not fixable in our code** (only `as any` per plugin, which throws away auth type-safety) and **not a stale-install issue** (deterministic reinstall reproduces it). We get better-call 2.x *with types intact* automatically once better-auth adopts it upstream; until then stay on latest better-auth and let it pick its own better-call. Import `APIError` from `better-auth/api`, not `better-call`. **Watch for the upstream flip** with `npm view better-auth@beta dependencies.better-call` (also `@latest`/`@rc`) — when it returns `2.x`, better-auth has adopted it and a plain `bun update better-auth` brings it in cleanly. No GitHub issue tracks this migration (as of 2026-06-27); the npm dependency is the signal.
- Email OTP has a **dev console fallback**: with no `RESEND_API_KEY`, the code is `console.log`ed instead of emailed. To test the flow locally without an inbox, run dev with `RESEND_API_KEY=` cleared and read the code from stdout.
- **`@meteora-ag/dynamic-bonding-curve-sdk`: migrated to 1.5.10** (no pin). The 1.5.8+ breaking changes were renames/moves, applied in `hooks/use-token-launch.ts`: `TokenUpdateAuthorityOption`→`TokenAuthorityOption`, `TokenType.SPL`→`TokenType.SPLToken`, and `createConfigAndPoolWithFirstBuy` moved from `client.pool` to `client.partner` (same signature/return). Token-launch flow needs an on-chain smoke test before relying on it in prod.
- `@reown/appkit` was unpinned from the `-wc-circular-dependencies-fix` fork build to 1.8.20 (it's not imported by source — only present for the WalletConnect solana-adapter's tree; build verified). If WalletConnect QR login regresses, re-pin it first.
