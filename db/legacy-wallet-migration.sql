-- Migrate legacy custodial wallets → Swig (FROST).
--
-- Context: 6 accounts were created before Swig/FROST and have a server-held
-- custodial keypair only (encrypted_wallets rows with frost_public_key IS NULL,
-- and user.wallet_address = that custodial address). The current signing/session
-- path (use-swig-session, use-wallet-signing) and E2E messaging assume Swig+FROST,
-- so these legacy accounts are orphaned from it.
--
-- All 6 were verified EMPTY on-chain (0 SOL / 0 USDC / 0 tokens) on 2026-06-21,
-- so NO sweep to TREASURY_COLD_PUBKEY (5N2GNUGbNVMD4u297wwTpRWctzWfecjaS5XE7ALnsxwj)
-- was required. Backup of the deleted rows: .treasury-keys/legacy-wallet-migration-backup.json
--
-- Effect: clears the legacy provisioning so each account re-provisions a real Swig
-- wallet via /api/create-wallet on next wallet open. The public address changes
-- (custodial keypair → Swig PDA); acceptable since the wallets are empty.
--
-- After running, the cached session profiles expire within ~5 min (Redis TTL), or
-- bust manually: DEL user:profile:<userId> for each affected user.

BEGIN;

-- Null wallet_address for users whose wallet is legacy-custodial (no FROST).
UPDATE "user"
SET wallet_address = NULL, "updatedAt" = now()
WHERE id IN (SELECT user_id FROM encrypted_wallets WHERE frost_public_key IS NULL);

-- Remove the legacy custodial provisioning so create-wallet provisions Swig fresh.
DELETE FROM encrypted_wallets WHERE frost_public_key IS NULL;

COMMIT;
