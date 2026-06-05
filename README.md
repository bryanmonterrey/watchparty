# watchparty

Live-streaming, social, and wallet app — a ground-up rewrite focused on design quality and speed, with Solana **and** EVM support.

Built with Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, and [Geist](https://vercel.com/font). Package manager is [Bun](https://bun.sh).

## Development

```bash
bun install
bun dev          # dev server (Turbopack) → http://localhost:3000
```

Other commands:

```bash
bun run build    # production build
bun run lint     # ESLint (eslint-config-next)
npx tsc --noEmit # type-check
```

## Architecture

The app is split into route groups so each section only loads what it needs:

- `app/(marketing)/` — public landing page
- `app/(auth)/` — login / auth flows (no data or wallet providers — stays lightweight)
- `app/(app)/` — the authenticated app, where heavy providers (data layer, wallet/chain SDKs) are scoped

Heavy dependencies (Solana/EVM wallet SDKs, streaming, captions, media pickers) are lazy-loaded behind the interaction that needs them, so pages like login and landing stay fast.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture and conventions.
