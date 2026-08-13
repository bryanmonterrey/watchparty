# Tags — what's done, and what's next

Handoff written 2026-08-12. Tags are live end to end for posts, comments and
videos. Streams and spaces are blocked on one decision that is now made but not
built.

## What a Tag is

A post that references a coin. The author picks the ticker from a dropdown
(`components/browse/cashtag-autocomplete`); the pick is stored as a REFERENCE in
`post_tags`, not parsed back out of the text.

That design is load-bearing, not a preference. The first implementation matched
`$TICKER` against post text at read time and shipped a pattern that matched
NOTHING — `\y\$BONK\y`, where Postgres's `\y` asserts a word boundary and `$` is
not a word character. A broken matcher and a coin nobody tagged return the same
empty list, so it would have read as "no tags yet" on every coin forever. A
stored reference cannot fail that way, and it settles WHICH coin — the live board
carries eleven distinct mints called `BOT`.

## Done

| surface | picker | sends tags |
|---|---|---|
| post composer | ✅ | ✅ (incl. drafts) |
| comment composer | ✅ | ✅ |
| video title + description | ✅ | ✅ |
| stream title | ✅ | ❌ — no post to attach to |
| spaces | ❌ | ❌ — surface does not exist |

- `db/post-tags.sql` — applied to BOTH projects (dev `hghxcuro…`, prod
  `ugpzuypo…`), table + 3 indexes verified present in each.
- `server/lib/write-post-tags.ts` — the writer and its zod shape, together so
  validation and insert cannot drift.
- `server/routers/tags.ts` — `forCoin` (chart markers), `latestByAuthor` (the
  coin table's last column).
- `components/browse/use-cashtag-field.ts` — drives the menu for any field that
  isn't the post composer. Adoption is three lines.
- `components/tokens/chart-trade-markers.tsx` — the avatar bubbles.

## NEXT: going live must create a post

**Decided:** a stream and its playback are ONE post, the way a video already is.
`createVideo` inserts a post carrying `videoUrl`; a stream should insert the
same kind of row in the stream category, and the VOD, feed entry, comments and
tags then all hang off it.

**The blocker this removes:** `post_tags.post_id` is a foreign key. The picker is
already mounted on the stream title (f079d1ba) and has nowhere to store its
reference, because `insert(posts)` appears in exactly TWO places in this codebase
— `server/routers/content.ts` and `server/routers/comment.ts` — and no stream
path reaches either. The IVS webhook (`app/api/webhooks/ivs/route.ts`) flips
`streams.isLive` and writes nothing else.

**Where to build it:** `server/routers/stream.ts:269` `startBroadcast`. It
already loads the stream row; it needs to insert a post (title from
`streams.title`, the creator as author, stream category) and then
`writePostTags(postId, input.tags)` exactly as `createVideo` does at
content.ts:146.

**Visibility:** the "visible or not during creation" option is that post's
`visibility` column, which already exists (`public | private | unlisted`). No new
concept needed. Streams should reach the feed by default.

**Watch for:** the post has to be findable again when the VOD lands, or the
recording becomes a second post. Key it on the stream id.

## NEXT: the spaces creation step

Does not exist. `components/app-ui/create-dialog/` has coin, stream, video and
playlist steps and no space step. Build it from the community page's create-space
surface, then:

- mount the picker on its title with `useCashtagField` (three lines — see
  `stream-setup.tsx:362` for a mounted example, including the `onKeyDown` trap
  below)
- a space creates a post too, so the same `startBroadcast` shape applies

## Traps already paid for

- **Enter belongs to the menu while it's open.** `stream-setup`'s field blurs on
  Enter; blurring closes the panel and collapses the caret the replacement needs,
  so the selection lands nowhere. Offer the key to the menu first.
- **The menu commits on `mousedown`, not `click`.** The field blurs on mousedown
  and a blur-to-close handler unmounts the menu before a click lands.
- **Step-local state dies before submit.** The video picker first lived in
  `details-step`, which unmounts as the wizard advances, so every pick was gone
  by submit. Tagging belongs beside the state it tags.
- **`$5m` is money, `$4CHAN` is a ticker.** The rule is "contains a letter, and
  is not digits followed by a lone k/m/b/t". 15 tests in
  `tests/tags-extract.test.ts`.
- **`server/routers/content.ts` is 1580 lines** and its size allowlist was bumped
  deliberately rather than gamed. It needs splitting; that is its own task.

## Not started

- `components/studio/upload-dialog` has no picker — decided it doesn't need one,
  tagging belongs on the video title/description.
- Backfilling tags for posts written before the picker existed.
  `lib/tags/extract.ts` is the right shape for it and is already tested.
