# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

`watchparty` is a ground-up rewrite of an older, feature-complete app that lives at `../sidebar` (a Solana-based live-streaming / social / wallet app: ~30 tRPC routers, ~500 components, Drizzle + Supabase, AWS IVS streaming, Deepgram captions, Typesense search). The logic there is mostly built; **this rewrite's goals are design quality and speed**, while porting the essential logic forward and **adding EVM support** alongside Solana.

Treat `../sidebar` as the reference implementation when porting a feature — but never copy its loading strategy (see the speed rule below).

## Premium & creator subscriptions (USDC, auto-recurring)

Both the site's **platform premium** tiers and **creator subscriptions** run on the
Solana **Subscriptions & Allowances** program (`De1eg…`), billed in **USDC**, with a
scheduled collector that auto-pulls each period. **LIVE ON MAINNET** (verified
2026-08-12): the 8 platform plans are provisioned on-chain with the real USDC
mint (since 2026-06-21), collector = `C9kxy…`, cold = `TREASURY_COLD_PUBKEY`,
and both crons run from the `watchparty-cron` worker —
`/api/cron/premium-collect` and `/api/cron/treasury-sweep` both answer clean on
prod. No real subscriber yet (the one "active" row is the `dev-grant-narc`
fixture). Still open from `docs/cloudflare-launch.md`: step 7 outflow alerts
(needs a Discord/Slack `ALERT_WEBHOOK_URL` from the user) and a first real
subscribe test.

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
- **Gating a feature on premium: use `server/lib/premium-entitlement.ts`.** It owns
  the one predicate — `(status === "active" || status === "past_due") &&
  currentPeriodEnd > now`. `isEntitled(row)` when you already hold the row,
  `getPremiumEntitlement(userId)` when you don't. It exists because that rule had
  already been hand-copied into `premium.getStatus` and community's
  `boostAllowance`; both now read from it, and a third copy is how the rule
  starts to drift. Two things it encodes that are easy to get backwards:
  `past_due` **counts as entitled** (grace window while the collector retries),
  and `currentPeriodEnd` is the real gate, because a failed first charge writes
  `periodEnd = now`.
  **Never gate on `user.verifiedTier`.** It looks like the tier field but it's a
  *badge* (`verified | business | government`), deliberately kept out of lockstep
  with billing by `server/lib/premium-verified.ts` (skipped when an admin-approved
  verification request exists, never re-applied on renewal), and it's cached in the
  session payload so it goes stale. Gating on it both leaks access to lapsed
  subscribers and locks out badge-only accounts.
  There is no `premiumProcedure` middleware — server-side gates throw
  `TRPCError({ code: "FORBIDDEN" })` (or a 402 from a Route Handler); client-side,
  read `usePremium()` and call `openOverlay()` from `lib/premium/overlay-store.ts`.
  `components/premium/premium-gate.tsx` is still imported nowhere, but its
  `tier` prop **now genuinely filters** (fixed 2026-08-09; it previously only
  set the overlay label, so `<PremiumGate tier="biz_pro">` admitted every paying
  user including the cheapest plan). The comparison is `meetsTier()` in
  `lib/premium/tiers.ts` — kept there rather than in the component so
  `tests/premium-tier.test.ts` can import it without dragging React, tRPC and
  the whole AppRouter into the test path. Tiers are **two ladders**, not one:
  business clears an individual requirement, individual never clears a business
  one, and an unrecognised key fails closed.
  It remains **UX only** — the browser decides what renders, never what's
  allowed. Anything worth gating needs the server-side gate above as well.

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
- ⚠️ **The dev DB split covers `DATABASE_URL` ONLY — supabase-js still writes to
  PRODUCTION.** Verified 2026-08-11: `.env.local` points `DATABASE_URL` at the
  dev project (`hghxcuro…`) while `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` still point at prod (`ugpzuypo…`). Drizzle reads
  one database; every `supabase.from(...)` call writes the other.

  So running the app locally can mutate production. Known write paths:
  `app/api/create-wallet` and `lib/wallet/ensure-embedded.ts` (insert
  `encrypted_wallets`), `server/routers/wallet.ts:156` (update it),
  `app/api/update-profile`, and all Storage uploads.

  It surfaced as a foreign-key error — `encrypted_wallets_user_id_user_id_fk`
  — when a locally-created wallet for a DEV user was written to PROD, where
  that user does not exist. That FK is the only reason it failed loudly;
  a path whose row does not reference `user` would have succeeded silently.

  **Override `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` too**, or treat any
  supabase-js path as production even on localhost.

  ⚠️ **Overriding the var is not the same as fixing it.** Checked again
  2026-08-12: all four keys were PRESENT in `.env.local` and
  `NEXT_PUBLIC_SUPABASE_URL` still held the **production** value
  (`ugpzuypo…`) while `DATABASE_URL` pointed at dev (`hghxcuro…`). A var
  can be overridden and still be wrong, and that failure looks exactly
  like a fix — grepping for the key name reports success.

  Compare the resolved project refs instead:

  ```bash
  bun scripts/db/check-env-target.ts   # exits 1 on a mismatch
  ```

  `lib/supabase/assert-same-project.ts` warns about this at startup and is
  wired into `lib/supabase/client.ts`, but it only fires when the app
  actually runs — which is never, locally (see the dev-server note). The
  script is the check that works without a dev server.

- **Dev DB split (2026-08-07):** local dev should point at the SEPARATE free
  Supabase dev project via `.env.local` (bootstrap a fresh one with
  `node scripts/db/setup-dev-db.mjs "<dev direct url>"` — it drizzle-pushes the
  schema and replays `db/*.sql`; hard-refuses the prod ref). Schema changes
  still ship as SQL under `db/` — apply to BOTH projects. If `.env.local` has
  no dev override the fallback is still prod, so the next point still applies:
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

## Rotating the Helius key: FIVE variables, not one

`HELIUS_API_KEY` is not the only place the key lives — **four env vars embed it
inside a URL**, and `heliusApiKey()` falls back to parsing it out of
`HELIUS_RPC_URL` when the standalone var is missing. Change only
`HELIUS_API_KEY` and RPC keeps pointing at the dead key, so `/api/rpc` 502s and
every browser on-chain read stays broken while the webhooks look fine.

The full set (verified 2026-08-10 by grepping `process.env.*HELIUS*`):

```
HELIUS_API_KEY                        standalone
HELIUS_RPC_URL                        ?api-key=<key>
NEXT_PUBLIC_HELIUS_RPC_URL            ?api-key=<key>   ← worker secret, not in .env.production
NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL    ?api-key=<key>   ← worker secret
NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL     ?api-key=<key>   ← worker secret
HELIUS_PROJECT_ID                     belongs to the ACCOUNT, so it changes too
```

The `NEXT_PUBLIC_*` three are live Worker secrets that are **not** in the local
`.env.production`, so a rotation done by editing that file silently misses them.
`scripts/dev/helius-usage.mjs` also reports the wrong account until
`HELIUS_PROJECT_ID` is updated.

**A new key means every webhook must be re-registered** — a webhook belongs to
the account that created it. `/api/cron/sync-assets-webhook` does that
automatically (assets + trades + user-trades) once production has the key.

⚠️ **The OLD account's webhook does not stop existing.** It only went quiet
because that plan hit its cap; when the cycle resets it resumes POSTing at the
rate it was configured for. Delete it from the old account's dashboard — the API
can't do it while the key is over quota. For the 2026-08-09 rotation that means
**deleting the old trades webhook before 2026-09-08**, or ~2,500 req/min returns
to the origin on that date with no credits involved and no obvious cause.

### What a free plan can actually afford

1M credits/month ÷ 30 ÷ 1440 = **23 webhook deliveries/min**. Measured against
`trending_coins.txns_24h` × the 5.3 `ANY` multiplier:

```
HOOD  (rank 1) alone     850/min   = 37x the entire monthly budget
+ TOAD (rank 1)        1,242/min   = 54x
top 15                ~2,500/min   = 109x
```

So `HELIUS_TRADES_DISPLAY_POOLS` stays **0** on a free plan — not as caution but
as arithmetic, because ordering by rank always picks the busiest pools on the
chain. Our own launched pools are a trickle and are unaffected.

### Deliveries cost 1 credit. **Edits cost 100.**

The three syncs (`trades`, `assets`, `user-trades`) run hourly and used to `PUT`
unconditionally: 25 runs × 3 webhooks × 100 = **7,500 credits/day = 23% of the
free plan**, spent re-sending byte-identical payloads on an app with no users.
Reads are free, so `lib/helius/webhook-edit.ts` compares first. Two things it
encodes that are easy to get wrong:

- the address compare is **order-insensitive** — selection sorts cheapest-first,
  so a pool whose `txns24h` ticked up reorders the list without changing what is
  watched, and a positional compare bills 100 credits for that;
- **`active: false` is never "current"**. Helius auto-disables an endpoint that
  fails ≥95% over 24h, and a disabled webhook still reports the addresses it was
  configured with. Skipping the write there leaves it dead *permanently*, since
  every later run reaches the same verdict. The unconditional PUT used to revive
  it by accident; the guard has to do it on purpose.

### Watch the MINT, not the pool (SWAP mode only)

`trendingCoins.tokenAddress`, not `poolAddress`. Measured 2026-08-11 over 100
transactions per address on the two pools then registered:

```
C3Rfug…pump   100 SWAP mint-side, 100 pool-side   1 venue → 6
DdSPvf…pump    62 SWAP mint-side,  62 pool-side   2 venues → 5
```

Identical SWAP counts, so **identical cost** — the extra venues route through
the same pool. What the mint buys is what doesn't: a second real pool, and the
pool address *changing at graduation*, which silently zeroes a pool-keyed tape
until the next hourly sync.

The old objection — "watching the mint also fires on plain transfers" — is true
only under **ANY**. Under SWAP, Helius filters by parsed type regardless of which
address matched (measured: 6 TRANSFERs per 100 mint txs, all filtered). So
`watch` is `"token"` under SWAP and stays `"pool"` under ANY. The receiver
matches **either** address, which is what makes the switch deployable — the
webhook isn't re-registered until the cron runs.

Two things measured and deliberately NOT done: `txnStatus: "success"` (0 failed
transactions in 200 sampled — three 100-credit edits for no saving), and raw
webhooks (no type filter at all, so strictly more deliveries).

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

### `@beui` AI components: SIX collisions, not one (checked 2026-08-07)

Every component under beui's "AI Agents" set (`streaming-response`,
`agent-activity`, `message`, `message-bubble`, `tool-result`, `approval-card`,
`citations`) ships its **own** `lib/utils.ts` (166 chars, just `cn`) and
`lib/ease.ts`. Installing any one of them via the CLI would overwrite:

    lib/utils.ts   lib/ease.ts   components/motion/action-swap.tsx (333 lines)
    components/motion/magnetic.tsx   lib/hooks/use-hover-capable.ts

That's the 2026-08-03 incident, eight times over. They also all import lucide,
against the house rule. **Vendor them by hand** like `components/prompt-kit/`:
fetch `https://beui.dev/r/<name>.json`, write only the files you want, skip
their `lib/*`, swap lucide for HugeIcons.

### Corollary: `registryDependencies` can clobber our primitives too

The `lib/utils.ts` trap is the famous one, but a registry item's
`registryDependencies` array is the same hazard aimed at `components/ui/`.
prompt-kit's `message` lists `avatar` + `tooltip`, `prompt-input` lists
`textarea` + `tooltip`, `scroll-button` and `loader` list `button` — and
resolving those pulls **shadcn's** versions over ours. That would have silently
reverted the h-11 button size scale (`button-height-standard`) and the
`AvatarFallback` that always renders `/public/avatar.png` instead of letter
initials — two rules the design system depends on, neither of which tsc would
flag.

**So `components/prompt-kit/` is vendored by hand, not installed.** Fetch
`https://prompt-kit.com/c/<name>.json`, write `files[].content` straight into
`components/prompt-kit/`, and re-point anything it imports. Every prompt-kit
file is self-contained, so this costs nothing. Only edit vs. source so far:
lucide swapped for HugeIcons in `scroll-button.tsx`.

Two things about them that will otherwise waste an hour:
- **`prose` does nothing here.** prompt-kit's `MessageContent` ships a `prose`
  class and assumes `@tailwindcss/typography`, which this project does **not**
  install — so `prose` and every `prose-*` variant are inert. Style markdown
  with explicit child selectors (`[&_ul]:list-disc`, `[&_a]:text-bleu`, …), as
  `components/ai/ask-surface.tsx` does.
- **`ScrollButton` must stay inside `ChatContainerRoot`** (it reads
  `useStickToBottomContext`), but the `relative` it anchors to must be
  **outside** it. Root is the scroll container, and an absolutely-positioned
  child whose containing block is the scroller scrolls away with the content
  instead of staying pinned.

## The AI assistant is Vercel AI SDK v7 — most examples you'll recall are wrong

`app/api/assistant/route.ts` ("ask watchparty") is the app's only LLM-streaming
surface, ported from `vercel/ai-chatbot`. Three API facts, all of which look
right from memory and all of which fail on `ai@7`:

- **`toDataStreamResponse()` no longer exists.** It's the v3/v4 name.
- **Every `result.*` convenience method is deprecated** — both
  `toUIMessageStreamResponse()` and `toUIMessageStream()` say "will be removed
  in the next major release". Use the **standalone** helpers with
  `result.stream`: `createUIMessageStream({ execute })` →
  `writer.merge(toUIMessageStream({ stream: result.stream }))` →
  `createUIMessageStreamResponse()`. Check the `@deprecated` tags in
  `node_modules/ai/dist/index.d.ts` before copying any example — the method
  forms still compile, so nothing warns you.
- **`convertToModelMessages()` returns a Promise** (it resolves file/image
  parts), so `execute` has to be `async` and await it. Skipping the await is a
  type error, not a runtime one — tsc catches this one.

The model is Cloudflare Workers AI over its **OpenAI-compatible** endpoint via
`@ai-sdk/openai-compatible`, i.e. the same account API as
`lib/predictions/factory.ts` and `server/routers/discover.ts` — there is no
standalone GLM URL to point a provider at. `workers-ai-provider` was passed over
because it wants a native `Ai` binding, which is **not declared** in
`wrangler.jsonc` — NOT because OpenNext can't expose one. This note used to say
the latter and it was wrong, which steered us away from a working option:
OpenNext exports `getCloudflareContext`, and `db/index.ts:132` already uses it
to read `HYPERDRIVE`. Adding `"ai": { "binding": "AI" }` makes `env.AI` work
the same way — and that's the only route to the things the HTTP account API
can't do: **WebSocket STT** (`@cf/deepgram/flux`, `@cf/deepgram/nova-3`) and
`returnRawResponse` streaming TTS. Declare it if voice ships; the account API
stays correct for plain chat completions.

### GLM-5.2 is a REASONING model — budget for thinking, not just the answer

It streams its chain of thought as `reasoning_content` and the answer as
`content`, **sharing one token budget**. Measured against the live endpoint:
"say hello in 3 words" costs 861 chars of reasoning and 278 completion tokens;
a one-sentence product question streams **709 reasoning deltas before the first
of 44 content deltas**.

`maxOutputTokens: 900` therefore produced **completely empty replies** — the
stream died mid-thought and emitted zero content deltas. It is 6000 now. If you
lower it, or swap the model, run `bun scripts/ai/smoke-assistant.mjs` first.
`@ai-sdk/openai-compatible` maps the thinking to `type: "reasoning"` parts,
which is what drives the "thinking…" state.

## Verification: tsc and CI cannot see the bugs this app actually ships

Every real defect found on 2026-08-07 passed tsc, `bun test` and a green deploy.
Three scripts exist because of that, and they are the gate that matters:

```bash
bun scripts/ai/smoke-assistant.mjs        # real model: visible text? tools fire?
bun scripts/ai/browser-smoke-chat.mjs     # real browser: text in the DOM, readable?
bun scripts/swig/verify-session-authority.mjs   # real devnet transactions
bun scripts/dev/mint-test-session.mjs     # a signed session, so the above can log in
```

What each caught that nothing else could:

- **smoke-assistant** — empty replies (the reasoning-budget bug above).
- **verify-session-authority** — a *fix* that compiled clean and was wrong:
  `findRolesByEd25519SignerPk` matches `authority.signer`, and a SESSION
  authority's signer is its sessionKey (zeros until a session exists), so the
  session role never appears there. Use `findRolesByAuthorityAddress`.
- **browser-smoke-chat** — and this one is the lesson: it went green **four
  times** on `textContent` while the panel was blank for a real user. Text was
  in the DOM and unreadable. It now asserts **WCAG contrast** (resolving colours
  through a canvas pixel, because `getComputedStyle` returns `lab()`/`oklch()`
  and hand-parsing those gives nonsense).

**A surface that paints its own background must not use theme-flipping tokens.**
`--flexwhite` is `#e7e9ea` in dark but **`#0f1419` (near-black) in light**;
`--flexborder` inverts the same way. On the assistant's hardcoded-dark panel
that rendered the title, the user's own messages and the composer as
black-on-black. Use fixed values (`text-white`, `border-white/10`) on any
self-coloured surface.

**Minting a session: the cookie name differs by target.** `useSecureCookies` is
on in production, so better-auth uses the **`__Secure-`** prefix; the dev name
is silently ignored there and looks exactly like a rejected login. The
signature is **padded standard base64** — better-call rejects anything else
outright (`signature.length !== 44 || !signature.endsWith("=")`), which is *not*
the `base64urlnopad` better-auth uses for the session-data cache cookie.

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
- **better-call is pinned via `overrides` to `1.4.0` (2026-08-12)** — the version better-auth 1.6.27 itself ships. The override exists because `@better-auth/infra` (dash()) still hard-depends on `1.3.7` and TWO better-call type identities in one tree is what produced the 31-error saga below; ONE forced 1.4.0 typechecks clean, dash() included (verified in a worktree before applying). Keep the override aligned with whatever better-call better-auth pins when bumping. `@better-auth/oauth-provider` (the oidc-provider replacement) remains NOT adopted: its client model is `oauthClient`, a different schema from the deployed `oauthApplication` — migrating is live-data + full re-threat-model work, its own effort. The in-tree oidc-provider is byte-identical 1.6.26→1.6.27.
- **Don't add `better-call` as a direct dependency** — it's better-auth's *internal* RPC/endpoint framework (same authors), not a package we consume. Every published better-auth still pins better-call `1.3.x` (latest `1.6.22` → `1.3.7`; even `1.7.0-rc.0`, beta, and canary are on `1.3.x`); none has adopted `2.x`. Forcing `better-call@2.0.5` in produced **31 type errors in `lib/auth/server.ts`** (verified 2026-06-27, mobile tsc): every plugin (`expo`, `siwe`, `custom-session`, `multi-session`, `two-factor`, `dash`) becomes *not assignable to `BetterAuthPlugin`*, because the plugins' `endpoints` carry better-call 1.3.7's `Endpoint` type while `BetterAuthPlugin` resolves `Endpoint` from 2.0.5 — two type identities colliding at the registration site. **Not fixable in our code** (only `as any` per plugin, which throws away auth type-safety) and **not a stale-install issue** (deterministic reinstall reproduces it). We get better-call 2.x *with types intact* automatically once better-auth adopts it upstream; until then stay on latest better-auth and let it pick its own better-call. Import `APIError` from `better-auth/api`, not `better-call`. **Watch for the upstream flip** with `npm view better-auth@beta dependencies.better-call` (also `@latest`/`@rc`) — when it returns `2.x`, better-auth has adopted it and a plain `bun update better-auth` brings it in cleanly. No GitHub issue tracks this migration (as of 2026-06-27); the npm dependency is the signal.
- Email OTP has a **dev console fallback**: with no `RESEND_API_KEY`, the code is `console.log`ed instead of emailed. To test the flow locally without an inbox, run dev with `RESEND_API_KEY=` cleared and read the code from stdout.
- **`@meteora-ag/dynamic-bonding-curve-sdk`: migrated to 1.5.10** (no pin). The 1.5.8+ breaking changes were renames/moves, applied in `hooks/use-token-launch.ts`: `TokenUpdateAuthorityOption`→`TokenAuthorityOption`, `TokenType.SPL`→`TokenType.SPLToken`, and `createConfigAndPoolWithFirstBuy` moved from `client.pool` to `client.partner` (same signature/return). Token-launch flow needs an on-chain smoke test before relying on it in prod.
- `@reown/appkit` was unpinned from the `-wc-circular-dependencies-fix` fork build to 1.8.20 (it's not imported by source — only present for the WalletConnect solana-adapter's tree; build verified). If WalletConnect QR login regresses, re-pin it first.
