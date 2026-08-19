-- The community server a user represents on their posts.
--
-- Additive and nullable, so it is safe to apply to a live database: existing
-- rows get NULL, which is exactly "represents no server" and is what every
-- account should start as. Representing a server is opt-in.
--
-- ON DELETE SET NULL rather than CASCADE — deleting a community must clear the
-- badge on its members' posts, not delete the members.
--
-- Apply to BOTH the prod and dev Supabase projects (see CLAUDE.md).

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "server_tag_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_server_tag_id_fk'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT "user_server_tag_id_fk"
      FOREIGN KEY ("server_tag_id")
      REFERENCES "community_servers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- The post query joins community_servers by this column on every author row.
CREATE INDEX IF NOT EXISTS "user_server_tag_id_idx" ON "user" ("server_tag_id");
