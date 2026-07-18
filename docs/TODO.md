# watchparty — running TODO (handoff)

Consolidated state across sessions so work can resume in a fresh chat. Last updated 2026-07-12.

## ✅ Done (live in prod)
- **Vercel → Cloudflare** migration: `watchparty.xyz` + `www` live; CI auto-deploy via GitHub Actions (3 workers: app, realtime, cron); Hyperdrive→Supabase; Cloudflare Web Analytics. (deploy is CI-only — local `wrangler deploy` EPIPEs; see `docs/`/memory.)
- **Premium + creator subscriptions** live on mainnet: 8 platform plans, creator tiers/claim/payout, cron collect+sweep, Helius treasury watch → Discord alerts.
- **Premium overlay** Subscribe button fixed (default tier preselected).
- **Messages wallet bug** fixed (rehydrates Swig FROST share instead of false "generate wallet").
- **Legacy custodial wallets** migrated to Swig-only model (6 empty accounts reset; `db/legacy-wallet-migration.sql`, backup in `.treasury-keys/`).
- **RealtimeKit (Cloudflare Realtime) for Spaces audio** provisioned (app `f6c3e642-3c5b-40b3-9afc-664cea0f4b1b`, both presets); server token flow proven against live API; DB col `community_spaces.media_meeting_id` applied; env in place.

## ▶️ Spaces audio — DEPLOYED 2026-06-21 ✅ (server side); needs live mic test
Deployed (run 27908554134, all 3 workers green). Verified on the live `watchparty`
worker: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_REALTIME_APP_ID + CLOUDFLARE_REALTIME_API_TOKEN
all present → `isMediaEnabled()` returns true in prod → `getMediaToken` mints real tokens.
**Remaining (manual, can't automate): two-browser/mic test** — open a LIVE Space in two
browsers, join audio, confirm SFU connect + mic publish + speaking rings. Ping to debug.

(Note for future deploys: `DOTENV_PRODUCTION` secret is the source of truth, built from
the merge of .env + .env.local + .env.production.local. Do NOT `gh secret set
DOTENV_PRODUCTION < .env.production` — that file lacks ALERT_WEBHOOK_URL.)

## 🐞 Spaces — known issues (investigate)
- **`__name is not defined` on the spaces route (prod only).** Console throws
  `Uncaught ReferenceError: __name is not defined at spaces:10`. NOT in the local
  Turbopack build (`.next` has zero `__name`) → injected by the OpenNext/esbuild
  worker bundle into a server-rendered inline script. Appears non-fatal (page
  hydrates, audio SDK runs), but should be root-caused. Likely an esbuild
  keep-names helper getting separated from its usage in the OpenNext build.
- **Realtime roster-change WS not reaching browsers.** Server publish verified
  working (POST → 200, wrong secret → 403, host baked into client, token route
  exists), but the live event didn't refresh either client. Worked around with a
  5s poll + actor-side refetch (commit 58a4540). Still verify the client WS
  actually connects (check `/api/realtime/token` + DO onConnect token verify in a
  browser) so cross-user updates are instant, not 5s-polled. Affects all realtime
  surfaces (channels/DMs), not just spaces.

## 🔜 Loose ends (small)
- **Test a real USDC subscribe** end-to-end on mainnet once funds available (only unproven money path).
- **Rotate chat-exposed Cloudflare tokens** — `docs/cloudflare-token-rotation.md` (two `cfat_…` tokens + realtime token).
- **Wallet-connect state in premium overlay** — if no wallet connected, Subscribe just toasts with no connect entry point; add a "Connect Wallet" state.

## 🔭 Bigger workstreams (own focus / own chat)
- **XP / quests / callouts (gamification)** — full design in `docs/exp-callouts.md`. Phases 1–3 SHIPPED (XP ledger/levels/profile badge 07-12; callouts + `/trade/callouts` + performance cron 07-12; quests + `/quests` sidebar page 07-13). Phase 4a-1 trade recording SHIPPED 07-13; Phase 4b realized-PnL snapshots + Phase 4c social layer (shareTrades opt-in, trade notifications + push, profile PnL card, Top Traders tab) SHIPPED 07-17, plus callout web push, level-up notifications, predictions XP/quests. 07-18: unrealized PnL (mint_prices cache), 4a-2 external-trade webhook, perps XP (ER-verified fills), copy-trade tiers 1–2 all SHIPPED. REMAINING: 4d tier-3 auto-copy — designed in doc, gated on owner sign-off (server-side money movement). fomo.family PnL/copy-trade layer deferred until per-user trades are tracked (design in doc §4).
- **Realtime/PartyKit migration** — `realtime/` worker + `deploy-realtime` job exist; remaining surfaces: DMs, presence/typing, feeds, live stream chat, Spaces coordination; then delete `lib/supabase/realtime-client.ts`. (See `realtime-video-architecture-direction` memory.)
- **IVS + Cloudflare video hybrid** with admin toggle — StreamProvider abstraction (ivs + cloudflare-stream), per-stream + global toggle, mirroring `lib/chains/` ChainAdapter pattern.

## ⚠️ Env-file note (avoid confusion)
Two prod env files coexist: `.env.production` (RealtimeKit work) and `.env.production.local` (Cloudflare migration work). The single source of truth for the deploy is the **`DOTENV_PRODUCTION` GitHub secret**, which must be built from the merge of `.env` + `.env.local` + `.env.production.local`. Consider consolidating the two files later.
