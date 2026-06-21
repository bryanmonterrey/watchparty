# watchparty-realtime

A standalone Cloudflare Worker that runs the app's realtime layer on
**Durable Objects** via [`partyserver`](https://github.com/cloudflare/partykit).
The browser connects to it directly with `partysocket`; the Next app (deployed
separately via `@opennextjs/cloudflare`) is never in the WebSocket path.

This replaces Supabase Realtime (`postgres_changes`/presence/broadcast) — see
`lib/realtime/` in the repo root for the client + protocol + server publisher.

## Why a separate worker

The Next app deploys as a single generated worker (`.open-next/worker.js`).
Durable Objects need a worker that exports the DO class and declares DO
bindings, so realtime lives in its own worker with its own `wrangler.jsonc`.
Both workers share `lib/realtime/protocol.ts` (pure isomorphic types) and a
`REALTIME_SECRET`.

## Architecture

- **One `Chat` DO class**, namespaced by room name (`community-channel:<id>`,
  `dm:<id>`, `stream-chat:<id>`, `space:<id>` — see `rooms` in the protocol).
- **Auth:** the Next route `/api/realtime/token` mints a 120s HS256 JWT; the DO
  verifies it (`src/auth.ts`) on connect.
- **Delivery model:** clients receive over WebSocket. Ephemeral signals
  (typing, presence) are relayed peer-to-peer by the DO. Persisted messages are
  written by tRPC first, then fanned out via `POST /parties/chat/:room`
  (`lib/realtime/publish.ts`) — Postgres stays the source of truth.

## Setup

Deps (`partyserver`, `partysocket`, `jose`) resolve from the repo-root
`node_modules` — no separate install needed.

Secrets / env:

| Where | Var | Value |
|---|---|---|
| this worker | `REALTIME_SECRET` | `wrangler secret put REALTIME_SECRET` (run in `realtime/`) |
| Next app | `REALTIME_SECRET` | same value |
| Next app | `NEXT_PUBLIC_REALTIME_HOST` | this worker's host, e.g. `watchparty-realtime.<acct>.workers.dev` |
| Next app | `REALTIME_HOST` | (optional) overrides the public host for server→DO publish |

## Commands

```bash
cd realtime
bun run typecheck   # tsc --noEmit
bun run dev         # wrangler dev (local DO)
bun run deploy      # wrangler deploy
```

## CI

Wired as the `deploy-realtime` job in `.github/workflows/deploy.yml` — runs in
parallel with the OpenNext worker on every push to `main`. It installs deps,
deploys via `wrangler deploy --config realtime/wrangler.jsonc`, then pushes
`REALTIME_SECRET` (extracted from `DOTENV_PRODUCTION` by
`scripts/cf/gen-realtime-secrets.mjs`) with `wrangler secret bulk`. Reuses the
existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.

**Before the first deploy**, add to the `DOTENV_PRODUCTION` GitHub secret:

```
REALTIME_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_REALTIME_HOST=watchparty-realtime.<your-account-subdomain>.workers.dev
```

`NEXT_PUBLIC_REALTIME_HOST` is baked into the Next build, so it must be set
*before* deploying the app — but the host is predictable (same account
subdomain as the main `watchparty` worker, with the `watchparty-realtime`
name), so you can set it up front. Both values must be present or the migrated
realtime surfaces stay dark.
