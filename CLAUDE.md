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

Most of this structure does not exist yet — it is the migration target. What exists today is the root layout, the `(auth)/login` route, and `components/auth/`.

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
