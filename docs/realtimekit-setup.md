# Spaces WebRTC audio — Cloudflare RealtimeKit setup

Spaces use **Cloudflare RealtimeKit** (WebRTC SFU) for live voice. PartyServer
Durable Objects already handle the room state (roster, roles, presence — see
`server/routers/spaces.ts` + the `space:` rooms); RealtimeKit only carries the
audio media. The two pair: the DO decides *who* is a speaker, RealtimeKit moves
their audio.

Until the env below is set, `getMediaToken` returns `{ enabled: false }` and the
Space UI shows "voice isn't configured" — roster, roles, and chat still work.

## What it does

- HOST / SPEAKER join with a publish-capable preset (mic toggle works).
- LISTENER joins receive-only.
- A RealtimeKit *meeting* is created lazily on the first join and cached on
  `community_spaces.media_meeting_id`.

## Provisioning checklist

1. **Apply the DB column** (additive, nullable — safe on the shared dev/prod DB):
   ```sql
   -- db/spaces-media-meeting-column.sql
   ALTER TABLE community_spaces ADD COLUMN IF NOT EXISTS media_meeting_id text;
   ```

2. **Create a RealtimeKit app** in the Cloudflare dashboard
   (Realtime → RealtimeKit). Note its **App ID**.

3. **Create an API token** with **Realtime** (or Realtime Admin) permissions.

4. **Confirm presets** exist in the RealtimeKit dashboard. The defaults assumed
   in code are `group_call_host` (can publish) and `group_call_participant`
   (receive-only). If you use different/custom presets, set
   `REALTIMEKIT_PRESET_HOST` / `REALTIMEKIT_PRESET_LISTENER`.

5. **Set env** (in `.env.production` for prod → `DOTENV_PRODUCTION`; in `.env`
   for local dev):
   ```
   CLOUDFLARE_REALTIME_APP_ID=...
   CLOUDFLARE_REALTIME_API_TOKEN=...
   ```
   `CLOUDFLARE_ACCOUNT_ID` is already present. These are server-only secrets —
   the browser receives only short-lived per-join auth tokens.

6. **Deploy.** No client env needed (the SDK loads lazily; tokens come from tRPC).

## How it's wired (code map)

- Server: `lib/realtime/media/realtimekit.ts` (REST: create meeting, add
  participant → auth token), `server/routers/spaces.ts` → `getMediaToken`.
- Client: `components/community/space-media.tsx` (`SpaceMediaProvider`,
  dynamically imported in `space-room.tsx` so the SFU SDK only loads inside a
  Space), light context in `space-media-context.ts`.

## Known v1 limitations

- **No per-speaker "speaking" indicators yet** — needs RealtimeKit reactive
  participant selectors; deferred until verified against a live app.
- **Role change mid-session**: when a host promotes a listener to speaker, the
  promoted user must reconnect to pick up publish rights (the preset is set at
  join). A live "request to speak / move to stage" flow is a follow-up.
- Not yet smoke-tested end-to-end (requires a provisioned RealtimeKit app + two
  browsers with mics).
