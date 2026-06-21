# watchparty — running TODO (handoff)

Consolidated state across sessions so work can resume in a fresh chat. Last updated 2026-06-21.

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

## 🔜 Loose ends (small)
- **Test a real USDC subscribe** end-to-end on mainnet once funds available (only unproven money path).
- **Rotate chat-exposed Cloudflare tokens** — `docs/cloudflare-token-rotation.md` (two `cfat_…` tokens + realtime token).
- **Wallet-connect state in premium overlay** — if no wallet connected, Subscribe just toasts with no connect entry point; add a "Connect Wallet" state.

## 🔭 Bigger workstreams (own focus / own chat)
- **Realtime/PartyKit migration** — `realtime/` worker + `deploy-realtime` job exist; remaining surfaces: DMs, presence/typing, feeds, live stream chat, Spaces coordination; then delete `lib/supabase/realtime-client.ts`. (See `realtime-video-architecture-direction` memory.)
- **IVS + Cloudflare video hybrid** with admin toggle — StreamProvider abstraction (ivs + cloudflare-stream), per-stream + global toggle, mirroring `lib/chains/` ChainAdapter pattern.

## ⚠️ Env-file note (avoid confusion)
Two prod env files coexist: `.env.production` (RealtimeKit work) and `.env.production.local` (Cloudflare migration work). The single source of truth for the deploy is the **`DOTENV_PRODUCTION` GitHub secret**, which must be built from the merge of `.env` + `.env.local` + `.env.production.local`. Consider consolidating the two files later.
