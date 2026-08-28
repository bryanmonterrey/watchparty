-- Backfill conversation_participants.last_read_at from each user's own read
-- receipts. Applied to PROD 2026-08-28 (3 of 6 participant rows; all 6 were
-- NULL because nothing in the app ever wrote the column — see
-- server/routers/message.ts markAsRead and messages-provider.tsx).
--
-- Derived, not invented: a row only moves to the latest read_at of a receipt
-- the same user left in that conversation, so a thread they never opened
-- stays unread. Safe to re-run; it only touches rows still at NULL.
with derived as (
  select cp.id, max(r.read_at) as read_upto
  from conversation_participants cp
  join messages m on m.conversation_id = cp.conversation_id
  join message_read_receipts r on r.message_id = m.id and r.user_id = cp.user_id
  where cp.last_read_at is null
  group by cp.id
)
update conversation_participants cp
set last_read_at = d.read_upto
from derived d
where d.id = cp.id;
