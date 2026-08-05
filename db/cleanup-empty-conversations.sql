-- Delete conversations that never held a message. Run 2026-08-05.
--
-- `conversation.create` used to insert a fresh row on every press of Message,
-- so a pair could accumulate several dead threads; `conversation.list` painted
-- one row each and the same person appeared two or three times in /messages.
-- create reuses the existing DM now and list ignores empty threads, so these
-- rows are already invisible — this just takes them out of the table.
--
-- 7 conversations + 14 participant rows (cascade) at time of writing. The exact
-- rows are backed up in db/cleanup-empty-conversations.restore.sql — run that to
-- put them back.
--
-- Apply with:  node scripts/db/apply-sql.mjs db/cleanup-empty-conversations.sql
--
-- The age guard keeps a chat someone started minutes ago, and is about to send
-- the first message in, out of the delete. Keep it on any re-run.

DELETE FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
  AND c.created_at < now() - interval '1 hour';
