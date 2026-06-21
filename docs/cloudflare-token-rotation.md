# Rotate the Cloudflare API token (deferred security task)

**Why this exists:** during the Cloudflare deploy setup on **2026-06-20**, the
`CLOUDFLARE_API_TOKEN` was pasted into a Claude Code chat in plaintext to get the
GitHub Actions deploy working. It is functional but should be **rotated** so no
live credential lingers in a chat transcript.

**Two `cfat_…` tokens were pasted into chat on 2026-06-20/21 — revoke both:**
1. The original "Edit Cloudflare Workers" token ending `…e29e12f6` — later edited
   down to DNS-only; now unused. Just **revoke** it.
2. The token ending `…1f1abf86` (Account · Workers Scripts · Edit) — currently the
   **live** GitHub Actions secret `CLOUDFLARE_API_TOKEN` on
   `bryanmonterrey/watchparty` and what CI deploys with. **Replace then revoke.**

Note: neither token has both Workers + DNS. CI only needs Workers (token #2 is
fine for deploys). DNS edits during setup used token #1.

## When
Any time after launch is verified stable. Not urgent (the token is an encrypted
GitHub Actions secret), but do it before the repo or transcript is shared.

## Steps

1. **Create a replacement token** — Cloudflare dashboard → **My Profile → API
   Tokens → Create Token → "Edit Cloudflare Workers"** template → Create. Copy it.
   - If a deploy ever fails on a Hyperdrive permission, add **Account →
     Hyperdrive → Edit** to the token.
2. **Update the GitHub secret** (do this in a terminal so the new token isn't
   pasted into chat):
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --body "cfat_NEW_TOKEN" --repo bryanmonterrey/watchparty
   ```
3. **Verify** by re-running the deploy workflow:
   ```bash
   gh workflow run deploy.yml --repo bryanmonterrey/watchparty
   gh run watch "$(gh run list --workflow=deploy.yml -L1 --json databaseId --jq '.[0].databaseId')" --exit-status
   ```
4. **Revoke the old token** — Cloudflare dashboard → API Tokens → the old `cfat_…`
   token → **Roll** or **Delete**. Only do this *after* step 3 is green.

## Related credentials to consider
- The DB password appears inside `DATABASE_URL`/`DIRECT_URL` (in the gitignored
  `.env`, the `DOTENV_PRODUCTION` GitHub secret, and the Hyperdrive config). Not
  exposed in chat, so no rotation required — but if ever leaked, rotate it in
  Supabase, then re-run `gh secret set DOTENV_PRODUCTION` and recreate the
  Hyperdrive config (`wrangler hyperdrive update`).

See also: `docs/treasury-security.md` for treasury key handling.
