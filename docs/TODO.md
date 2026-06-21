# watchparty — running TODO (handoff)

Consolidated state across sessions so work can resume in a fresh chat. Last updated 2026-06-21.

## ✅ Done (live in prod)
- **Vercel → Cloudflare** migration: `watchparty.xyz` + `www` live; CI auto-deploy via GitHub Actions (3 workers: app, realtime, cron); Hyperdrive→Supabase; Cloudflare Web Analytics. (deploy is CI-only — local `wrangler deploy` EPIPEs; see `docs/`/memory.)
- **Premium + creator subscriptions** live on mainnet: 8 platform plans, creator tiers/claim/payout, cron collect+sweep, Helius treasury watch → Discord alerts.
- **Premium overlay** Subscribe button fixed (default tier preselected).
- **Messages wallet bug** fixed (rehydrates Swig FROST share instead of false "generate wallet").
- **Legacy custodial wallets** migrated to Swig-only model (6 empty accounts reset; `db/legacy-wallet-migration.sql`, backup in `.treasury-keys/`).
- **RealtimeKit (Cloudflare Realtime) for Spaces audio** provisioned (app `f6c3e642-3c5b-40b3-9afc-664cea0f4b1b`, both presets); server token flow proven against live API; DB col `community_spaces.media_meeting_id` applied; env in place.

## ▶️ DO NEXT — deploy Spaces audio (1 command)
`DOTENV_PRODUCTION` GitHub secret was just refreshed (2026-06-21) from the FULL merge
(.env + .env.local + .env.production.local) and verified to contain CLOUDFLARE_REALTIME_*,
ALERT_WEBHOOK_URL, TREASURY_*, and prod URLs. So **do NOT** run `gh secret set DOTENV_PRODUCTION < .env.production`
(that file is missing ALERT_WEBHOOK_URL and would drop treasury alerts). Just deploy:
```
gh workflow run "Deploy to Cloudflare Workers"
```
Then verify `getMediaToken` returns a token (not `{enabled:false}`) and `isMediaEnabled()` is true in prod.
Then: **two-browser/mic test** of a Space (join SFU + speaking rings) — the only thing that can't be automated.

## 🔜 Loose ends (small)
- **Test a real USDC subscribe** end-to-end on mainnet once funds available (only unproven money path).
- **Rotate chat-exposed Cloudflare tokens** — `docs/cloudflare-token-rotation.md` (two `cfat_…` tokens + realtime token).
- **Wallet-connect state in premium overlay** — if no wallet connected, Subscribe just toasts with no connect entry point; add a "Connect Wallet" state.

## 🔭 Bigger workstreams (own focus / own chat)
- **Realtime/PartyKit migration** — `realtime/` worker + `deploy-realtime` job exist; remaining surfaces: DMs, presence/typing, feeds, live stream chat, Spaces coordination; then delete `lib/supabase/realtime-client.ts`. (See `realtime-video-architecture-direction` memory.)
- **IVS + Cloudflare video hybrid** with admin toggle — StreamProvider abstraction (ivs + cloudflare-stream), per-stream + global toggle, mirroring `lib/chains/` ChainAdapter pattern.

## ⚠️ Env-file note (avoid confusion)
Two prod env files coexist: `.env.production` (RealtimeKit work) and `.env.production.local` (Cloudflare migration work). The single source of truth for the deploy is the **`DOTENV_PRODUCTION` GitHub secret**, which must be built from the merge of `.env` + `.env.local` + `.env.production.local`. Consider consolidating the two files later.
