# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

`watchparty` is a ground-up rewrite of an older, feature-complete app that lives at `../sidebar` (a Solana-based live-streaming / social / wallet app: ~30 tRPC routers, ~500 components, Drizzle + Supabase, AWS IVS streaming, Deepgram captions, Typesense search). The logic there is mostly built; **this rewrite's goals are design quality and speed**, while porting the essential logic forward and **adding EVM support** alongside Solana.

Treat `../sidebar` as the reference implementation when porting a feature — but never copy its loading strategy (see the speed rule below).

## Commands

Package manager is **bun** (`bun.lock`). Runtime is Next.js 16 (App Router, Turbopack) + React 19.

- `bun install` — install deps
- `bun dev` — dev server (Turbopack), defaults to port 3000
- `bun run build` — production build
- `bun run lint` — ESLint (`eslint-config-next`)
- `npx tsc --noEmit` — type-check (run this to verify; there is no separate typecheck script)

No test framework is configured yet — do not assume one exists.

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

The full sidebar frontend (components/hooks/lib/server/db) was bulk-migrated in-tree, and all of sidebar's `(browse)` routes now exist under `app/(app)/` — home (`/home`), `[slug]`, `[slug]/[videoId]`, discover, communities, messages, search, settings, shorts, trade.

### Migrating/adding a page from sidebar
Porting a page = creating the route under `app/(app)/` and wiring it to the already-migrated components:

1. Copy sidebar's `app/(browse)/<path>` page/layout near-verbatim into `app/(app)/<path>` (same URLs — both are route groups). Staying close to the source keeps diffing against sidebar easy.
2. **Drop client-side auth guards** (`redirect`/`router.push` on missing session) — `(app)/layout.tsx` already guards server-side. Keep `useAuthSession` only where the user id is actually used.
3. **Lazy-load panel-style UIs**: tab/section-switched content (see `app/(app)/settings/page.tsx`) goes behind `next/dynamic` + `ssr: false` so the route ships only the visible panel. Caveat: `dynamic()` options must be **inline object literals** — Turbopack statically analyzes them and the build fails on a shared `const options` reference.
4. Verify with `npx tsc --noEmit` + `bun run build`. If tsc errors inside `.next/` generated types right after adding routes, they're stale — re-run `bun run build` to regenerate.

Note: everything under `(app)` is login-gated, including `/[slug]` profiles and `/discover/post/[id]`, which were public share links in sidebar. Public share pages would need a separate non-guarded route group.

### Responsive: mobile-first, all breakpoints
Unlike the old app (desktop-focused), every component here must work mobile + tablet + desktop. Build **mobile-first**: unprefixed classes are the mobile layout; `sm:`+ holds the desktop values from the Figma frame. Example from `components/auth/login-card.tsx`: `h-14 sm:h-[61px]`, `max-w-[442px]` column collapsing to full-width below it.

## Conventions

- **Path alias:** `@/*` maps to repo root (e.g. `@/components/auth/login-card`).
- **Font:** Geist project-wide (via `next/font/google` in `app/layout.tsx`), replacing the old app's SF Pro Rounded. Note `globals.css` must not re-declare `font-family` to anything else or it overrides Geist.
- **Per AGENTS.md**, this is Next.js 16 with breaking changes from training data — read `node_modules/next/dist/docs/` before using an API you're unsure about.

### Verifying responsive layouts
Headless Chrome's `--screenshot` with `--window-size` **does not honor the layout viewport** — it renders wide and crops, so "mobile" CLI screenshots are misleading. To truly test a breakpoint, drive the installed Chrome with `puppeteer-core` and `page.setViewport({ ..., isMobile: true })`, and assert `document.documentElement.scrollWidth === clientWidth` to catch horizontal overflow.

### Brand/Figma SVG icons
Provider marks in `components/auth/provider-icons.tsx` were extracted verbatim from the Figma export. Paths keep their original canvas coordinates and each `viewBox` is positioned over the icon's location (e.g. `viewBox="522 287 28 28"`) — this avoids re-normalizing path data. Reuse this trick when lifting vector art out of a full-frame Figma SVG.

## Deploy target & dev setup

- **Deploy: Cloudflare** via `@opennextjs/cloudflare` (chosen for speed/cost). Keep code Workers-compatible: HTTP-based services (Upstash Redis, Resend) are fine; the DB uses **postgres.js** which runs on Cloudflare **Hyperdrive** (front Supabase with it — edge compute + single-region Postgres is slow without it). Full CF/wrangler/Hyperdrive setup is a later milestone.
- **Dev runs on port 3001** (`bun dev` → `next dev -p 3001`) to match the reused OAuth callback URLs and `NEXT_PUBLIC_AUTH_URL` in `.env` (copied from `../sidebar`; same Supabase DB).
- **Reused production DB:** do **not** run `drizzle-kit push`/migrations — the auth tables already exist. The schema in `db/schema/auth` is ported verbatim to match.
- **Squircle corners: use Lisse (`@lisse/react`), opt-in per element.** The old `tailwindcss-corner-shape` was removed — it used the CSS `corner-shape` property which is **Chrome-only** (broken in Safari) and forced squircle onto *every* `rounded-*` (so even pills got squircled). Lisse uses SVG `clip-path` (works in Safari/Firefox/Chrome). Apply via the `components/ui/squircle.tsx` helper: `<Squircle asChild radius={20}><button className="…">…</button></Squircle>` — and do NOT add `rounded-*` to a squircled element (redundant under clip-path). **Pills (Connect Wallet, Complete, Create) stay plain `rounded-full` with NO `<Squircle>`.**

## Auth / better-auth dependency gotchas

The auth stack is sensitive to transitive versions. Two non-obvious pins/fixes were required to get it compiling and running:

- **`kysely` pinned to `0.28.17`.** better-auth statically imports `@better-auth/kysely-adapter` even when using the Drizzle adapter. kysely `0.29.x` ships a single bundled `dist/index.js` that doesn't re-export `DEFAULT_MIGRATION_LOCK_TABLE`, so the route 500s with "export … doesn't exist". 0.28.17 has the proper dual ESM/CJS build. Keep it pinned.
- **Do not install `better-call` directly.** better-auth uses `better-call@1.3.5` internally; a top-level `better-call@2.x` makes the `Endpoint` types incompatible and every auth client/server plugin fails to type-check. Import `APIError` from `better-auth/api`, not `better-call`.
- Email OTP has a **dev console fallback**: with no `RESEND_API_KEY`, the code is `console.log`ed instead of emailed. To test the flow locally without an inbox, run dev with `RESEND_API_KEY=` cleared and read the code from stdout.
