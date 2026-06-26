# Feed render conditions (browse feed)

How the discover/home feed decides what each item looks like, modeled on X/Twitter's
timeline. Use this as the source of truth when changing `components/browse/browse-feed.tsx`
or `components/browse/post-card/`.

## How X behaves (reference)

- The vertical **connector line only appears for self-threads** — an author replying to
  their **own** post, bundled as a 2–3 post unit connected avatar-to-avatar.
- A reply to **someone else's** post is a **standalone card** with a small
  "Replying to @user" label — **no connector, no lifted parent**.
- Thread members do **not** show a "reposted"/"Pinned" banner; those mark standalone items.
- 4+ post threads truncate with a "Show this thread" affordance (not yet implemented here).

Sources: [X help — create/view a thread](https://help.x.com/en/using-x/create-a-thread),
[X devs — how Twitter decides to display threads](https://devcommunity.x.com/t/how-twitter-decides-how-to-display-threads/169367),
[X devs — why a thread doesn't appear](https://devcommunity.x.com/t/why-doesnt-a-thread-appear-on-the-timeline/183975).

## Condition table

| # | Situation | Detection | Expected render | Code |
|---|-----------|-----------|-----------------|------|
| 1 | Top-level post | no `replyToId`, no `repostOfId` | Standalone card, no connector, no banner | `post-card/index.tsx` |
| 2 | **Self-thread** (author replies to own post) | `replyToId && parentUserId === userId` | Parent lifted directly above the reply; continuous connector line avatar→avatar; reply hides "Replying to" (parent is visible) and hides any banner | lift in `browse-feed.tsx` `feedItems`; connectors in `post-card/index.tsx` + `post-card-avatar.tsx` |
| 3 | Reply to **another** user | `replyToId && parentUserId !== userId` | Standalone card with "Replying to @parentUsername"; **no** lifted parent; **no** connector | `feedItems` lift gate (skips); label in `post-card/index.tsx` |
| 4 | Repost (no added text) | `repostOfId` set, no content/media | Original card with "<name> reposted" banner | `feed.ts` mapping → `repostedBy`; `status-banners.tsx` |
| 5 | Quote repost | `repostOfId` set, has content/media | Quoter's card embedding the quoted post | `feed.ts` `quotedPost`; `quoted-post-view.tsx` |
| 6 | Repost of a reply | repost row whose original has `replyToId` | "<name> reposted" + the reply (with its own "Replying to") as standalone — never threaded into the feed | `feed.ts` + standalone path |
| 7 | Pinned (profile) | `isPinned` and not reposted | "Pinned post" banner | `status-banners.tsx` |
| 8 | Muted / blocked author | server filter | Item excluded from feed | `feed.ts` `mutedIds`/`blockedIds` |
| 9 | Thread member at a **window edge** | rendered first/last item in the sliding window | Drop the connector that points off-screen (no orphan/dangling line) | `browse-feed.tsx` `renderItem` (`isFirst`/`isLast` strip) |
| 10 | New posts while reading | newer than the window top | Surfaced by the "new posts" pill, **not** auto-injected unless the user is at the top (composer visible) | merge effect + `composerVisibleRef` gate |

## Connector geometry (invariants)

- Connector lines live in the **avatar gutter**. The **bottom** line runs from just below the
  avatar (`top-[52px]`) to the card bottom; with `connectBottom` the card uses `border-none pb-0`
  so the line reaches the exact card edge. The **top** line is rendered at **card level**
  (`absolute top-0 left-[38px] h-7`) so it spans the reply's top padding (`pt-3`) and meets the
  parent's bottom line at the zero-gap card boundary.
- Both lines sit at **x = 38px** from the card's left edge (card `px-4` + avatar center 22px) and
  use `w-0.5 bg-zinc-700/50 z-20`; the avatar is `z-30` so the line tucks behind it.
- Continuity depends on **nothing offsetting the join**: thread members must not render a
  "reposted"/"Pinned" banner (gated by `connectTop` in `index.tsx`) and the reply must not render
  the "Replying to" label (also gated by `connectTop`).

## Windowing (invariants)

- The list (`broad-infinite-list`) keeps `VIEW_COUNT` items mounted and loads more via
  `onLoadMore(direction, refItem)`. Keep `VIEW_COUNT` above a normal session's loaded count so the
  window **does not trim** newer items off the top — trimming + the large prefetch threshold would
  re-load those at the top on upward momentum, reading as "new posts loaded at the top."
- Never mutate the controlled `items` (i.e. `setListItems`) from out-of-band effects **while the
  user is scrolled down**. Newer posts stay in the full dataset (reachable by scrolling up / the
  pill); only fold them into the visible list when the composer is visible (user at top).
