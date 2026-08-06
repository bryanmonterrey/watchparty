-- Creator coin drafts track the creator's avatar (2026-08-06).
--
-- createCreatorCoin used to snapshot `user.avatar_url` into the token row at
-- creation, so a draft kept whatever picture you had that day and drifted the
-- moment you changed it. Drafts now store NO image and getCreatorCoin resolves
-- the creator's current avatar on read; the launch freezes it (launchCreatorCoin
-- / activateToken), because the mint bakes the art into on-chain metadata and
-- the row must not disagree with it afterwards.
--
-- Existing drafts still carry the old snapshot, which wins over the resolver and
-- keeps them stale. Clear it so they start tracking. Nothing is lost — the value
-- was only ever a copy of `user.avatar_url`.
--
-- DRAFTS ONLY. A live creator coin's imageUrl is what actually minted, so
-- clearing that one would make the app disagree with the chain permanently.
update tokens
set "imageUrl" = null
where is_creator_coin = true
  and status = 'draft';
