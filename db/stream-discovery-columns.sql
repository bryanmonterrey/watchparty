-- Stream discovery metadata: tags, language, and the 18+ flag (studio S6,
-- "Edit Stream Info parity").
--
-- Additive only — three new columns on `streams`, no changes to existing ones.
-- Apply to BOTH Supabase projects (dev + prod). Per CLAUDE.md this ships as
-- reviewable SQL rather than drizzle-kit push, which can clobber auth tables.

-- Discovery tags, NOT the coin tags already in "tags" (jsonb). Those hold token
-- addresses for the title's $TICKER picker; these are free words a browse
-- surface filters on. Separate columns because merging them would put a
-- contract address in a tag pill.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS stream_tags text[];

-- Nullable on purpose: "not stated" is not the same claim as English, and a
-- default would silently make every existing stream claim a language.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS language text;

-- NOT NULL DEFAULT false, where the other two are nullable: a null here would
-- read as "maybe mature" and force every consumer to invent a policy. Adding a
-- column with a default does not rewrite the table on Postgres 11+, so this is
-- safe on a live table.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS is_mature boolean NOT NULL DEFAULT false;
