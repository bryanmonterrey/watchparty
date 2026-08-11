-- Filtered-stream delivery queue (2026-08-11, phase 9): matched own-account
-- events queued for cursor-pull via GET /api/stream/events. Additive; mirrors
-- db/schema/content/developer-stream-delivery.ts. Apply to BOTH Supabase
-- projects. Server-side-only (no RLS policy — reached solely via the gated
-- Route Handler on the service connection).

create table if not exists developer_stream_deliveries (
  seq bigserial primary key,
  user_id text not null references "user"(id) on delete cascade,
  app_id text not null,
  event_type text not null,
  tag text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dev_stream_deliveries_app_seq
  on developer_stream_deliveries (app_id, seq);
create index if not exists idx_dev_stream_deliveries_user_seq
  on developer_stream_deliveries (user_id, seq);
create index if not exists idx_dev_stream_deliveries_created
  on developer_stream_deliveries (created_at);

alter table developer_stream_deliveries enable row level security;
