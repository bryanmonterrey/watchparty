-- Safe schema sync: apply only non-destructive changes from drizzle-kit push
-- (skipping DROP POLICY statements — policies are managed separately in rls-indexes.sql)

ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user';

ALTER TABLE "encrypted_wallets" ALTER COLUMN "pinned_nfts" SET DEFAULT '{}';
ALTER TABLE "encrypted_wallets" ALTER COLUMN "pinned_collections" SET DEFAULT '{}';

ALTER TABLE "user_nft_pins" ALTER COLUMN "pinned_nfts" SET DEFAULT '{}';
ALTER TABLE "user_nft_pins" ALTER COLUMN "pinned_collections" SET DEFAULT '{}';
ALTER TABLE "user_nft_pins" ALTER COLUMN "hidden_collections" SET DEFAULT '{}';
ALTER TABLE "user_nft_pins" ALTER COLUMN "spam_nfts" SET DEFAULT '{}';
ALTER TABLE "user_nft_pins" ALTER COLUMN "hidden_tokens" SET DEFAULT '{}';
ALTER TABLE "user_nft_pins" ALTER COLUMN "spam_transactions" SET DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "idx_playlists_userid" ON "playlists" USING btree ("user_id");
