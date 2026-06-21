# Ads integration (OpenAdServer)

watchparty serves ads from **OpenAdServer** (`../openadserver`), a self-hosted ad
platform: a Python/FastAPI ML ranking backend on Render + a Next.js advertiser
dashboard / delivery API at `ads.watchparty.xyz`. This repo only *consumes* ads.

## How it talks to the ad server

The browser **never** calls the ad origin directly. Everything goes through
first-party routes under `app/api/ad/`, so requests stay same-origin (no CORS),
geo is injected from Cloudflare headers server-side, and the backend URL stays
private.

```
client → /api/ad/request  → ads.watchparty.xyz/api/ad/request  (display creative JSON)
client → /api/ad/track    → ads.watchparty.xyz/api/ad/track     (impression/click pixel)
IMA    → /api/ad/vast     → ads.watchparty.xyz/api/ad/request   (wrapped as VMAP/VAST)
```

| Route | Purpose |
|---|---|
| `POST /api/ad/request` | Display ad for a slot. Adds CF geo, rewrites tracking URLs to first-party. |
| `GET /api/ad/track?u=` | Fires an impression/click pixel server-side (allowlisted to the ad origin). Returns a 1×1 GIF. |
| `GET /api/ad/vast?uid=` | Requests preroll + midroll video ads and returns a VMAP the IMA player loads via `adTagUrl`. |

Shared code lives in `lib/ads/` (`config.ts`, `types.ts`, `server.ts`, `vast.ts`),
the client hook is `hooks/use-ad.ts`, and UI is in `components/ads/`.

## Placements wired up

| Placement | Slot ID | Where |
|---|---|---|
| In-feed sponsored card | `feed_card` | `components/ads/sponsored-card.tsx`, injected every `FEED_AD_INTERVAL` (8) posts in `browse-feed.tsx` |
| Video pre/mid-roll | `video_preroll`, `video_midroll` | `/api/ad/vast` → existing IMA player (`adTagUrl` on the watch-page `VideoPlayer`) |
| Live stream overlay | `stream_overlay` | `components/ads/stream-overlay-ad.tsx`, mounted in `stream-player.tsx` when live |

Every component renders **nothing** when no campaign fills the slot, so the UI
closes up cleanly — the integration is safe to ship before the backend is live.

### Why VMAP for video

OpenAdServer returns a plain `video_url`, not a VAST tag, so it can't feed Google
IMA directly. `/api/ad/vast` wraps the creative + tracking pixels into a VMAP/VAST
document (`lib/ads/vast.ts`). This reuses the player's existing, fully-built IMA
path (countdown, cue points, skip, mid-roll discard) instead of a parallel player.

## Environment variables

| Var | Scope | Default | Notes |
|---|---|---|---|
| `ADS_API_URL` | server | `https://ads.watchparty.xyz` | Origin of the OpenAdServer delivery API. |
| `NEXT_PUBLIC_ADS_ENABLED` | client | _(on)_ | Set to `"false"` to disable all ad requests/placements. |

Ads are **on by default**; set `NEXT_PUBLIC_ADS_ENABLED="false"` to turn the whole
integration off without removing code.

## Notes

- Deploy target is Cloudflare; geo comes from the `cf-ipcountry` header
  (`lib/ads/server.ts#geoFromHeaders`). In local dev that header is absent, so
  requests just go out without geo.
- Adding a new placement = pick/define a slot id in `lib/ads/config.ts`, then drop
  `useAd(slot)` into a component (display) or point `adTagUrl` at `/api/ad/vast` (video).
