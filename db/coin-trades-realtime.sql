-- Publish coin_trades over Supabase Realtime so an open transactions table
-- receives swaps as the webhook writes them, instead of polling.
--
-- Same treatment coin_candles got (db/coin-candles-realtime.sql), and for the
-- same reason: the client only ever reads the NEW record on INSERT, so replica
-- identity stays default. REPLICA IDENTITY FULL governs the OLD record on
-- UPDATE/DELETE and would multiply WAL volume for data nothing consumes — on a
-- table taking every swap on every watched pool, that is the difference between
-- cheap and reckless.

ALTER PUBLICATION supabase_realtime ADD TABLE coin_trades;

-- Verify:
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'coin_trades';
