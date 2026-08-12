# Realtime & video architecture — current state and migration plan

Written 2026-08-12, from verified state (not aspiration). The old framing of
this workstream ("stand up PartyKit/DO first; evaluate RealtimeKit") is done —
both layers exist in production. What remains is MIGRATION (polling → push)
and two video decisions.

## Current state (all verified in prod)

| Layer | State |
|---|---|
| **Durable Object realtime** (`realtime/` — partyserver `Chat` class, hibernating, SQLite) | LIVE: community channels, DMs (nudge via `inbox:`), stream chat (DO-native history/pins), spaces coordination, developer event stream push (`dev-stream:` + connection accounting). Custom domain `realtime.watchparty.xyz` attached. Smoke: `scripts/realtime/smoke.mjs` (16/16). |
| **RealtimeKit (WebRTC SFU)** | Integrated for Spaces audio (`lib/realtime/media/realtimekit.ts`, env-gated via `isMediaEnabled()`, provisioning script `scripts/cf/provision-realtimekit.mjs`, `docs/realtimekit-setup.md`). |
| **IVS** | Broadcast + chat + captions webhooks, validated E2E; stays the broadcast backbone. |
| **Container (`watchparty-app`)** | Serves HTTP only. 4096-conn/instance proxy ceiling; the 2026-08-08 outage was polling + long streams saturating it. Long-lived connections belong on the DO worker, never here. |

## The remaining realtime work: kill the polls

~50 `refetchInterval` sites (15–60s) still hammer the container — this is the
load class that caused the 2026-08-08 outage. The DO layer already carries the
right rooms; most polls can become **nudge-driven refetches** (keep tRPC as
the data path — the socket only says "go ask", exactly like `inbox:` and
`dev-stream:`). Ranked by container-load relief × simplicity:

1. **Sidebar unread badge** (`components/app-ui/app-sidebar.tsx`, 30s poll,
   mounted on EVERY app page = the widest poll in the app). The `inbox:` room
   already fires `conversation` events; community unreads already publish
   `message-change` per channel. Slice: subscribe once in the sidebar,
   `invalidate` the unread query on event, drop the interval (keep a slow
   5-min safety poll).
2. **Wallet drawer balances** (5 sites in `use-wallet-data.ts` × two drawers,
   15–30s). The Helius assets webhook already lands per-tx cache busts +
   realtime nudges (`sync-assets-webhook` cron keeps addresses fresh) — the
   drawer can go event-driven with a slow fallback poll.
3. **Studio** (`stream-manager.tsx`, `studio-home.tsx`, 15–30s): stream state
   changes flow through the IVS webhook → `dispatchDeveloperEvent` already;
   publish a `stream-state:<channelId>` nudge from the same webhook and
   subscribe in studio.
4. **Trade feeds / callouts / rails** (15s polls): these are GLOBAL feeds —
   per-user rooms don't fit. Either a single `firehose:trades` room fed by the
   existing `Tape` DO (already ingesting Mobula trades) or keep polling but
   lengthen intervals + ETag. Decide when the Tape work stabilizes; do NOT
   build a second ingestion path.

Rules for every slice: nudge-not-payload; auth via the existing 120s minted
tokens; presence-free rooms where fan-out is high; a slow fallback poll stays
(sockets are best-effort).

## Video decisions (open, in order)

1. **VOD/clips pipeline** — IVS recordings land in S3
   (`AWS_IVS_RECORDINGS_BUCKET`). Decision: serve VODs from Cloudflare Stream
   (upload-after-broadcast, per-minute pricing, built-in player/thumbnails) vs
   direct S3+CDN. Stream wins on player/packaging effort; cost scales with
   watch time — needs a real usage estimate before committing.
2. **Low-latency interactive video** (guest-on-stream, video Spaces) —
   RealtimeKit is already in for audio; extending presets to video is config +
   UI, not new infra. Gate: product priority, not architecture.
3. **IVS stays** for one-to-many broadcast until either (a) cost pressure at
   scale or (b) Stream's live offering reaches feature parity for captions +
   webhooks we use. Re-evaluate quarterly, not before.

## Non-goals

- No Supabase Realtime revival (removed deliberately).
- No second WebSocket stack — one `Chat` DO class, namespaced rooms.
- No payload-over-socket for persisted data — tRPC stays the source of truth.
