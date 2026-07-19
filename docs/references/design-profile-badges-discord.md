# Reference: Discord profile popouts — badges, roles, identity stacking

Source: owner screenshots 2026-07-19 (Pudgy Penguins server profiles). Borrow the
*patterns*, express them in watchparty's identity (pastels, `font-pixel` display,
Lisse squircle, lantern accent, NO gray/black drop shadows). Never copy Discord's
blurple/dark-gray palette.

## The anatomy that works (left card, top to bottom)

1. **Banner bleeding under an overlapping avatar** — avatar ring sits half over the
   banner, half over the card body. Status dot pinned to the avatar's corner.
2. **Identity stack, tight**: display name (big) → username + **inline badge strip**
   on ONE line → CTA row (primary pill + icon pills). The badge strip is the key
   move: 5–7 small icons (~20px) directly after the username, each one *earned*
   (early supporter, booster, quests, HypeSquad). Hover = tooltip naming it.
3. **Server tag chip** (e.g. ⬟PENG) — a small bordered chip RIGHT of the username:
   affiliation compressed to a glyph + 4 chars. watchparty equivalent: community
   tag or token-holder tag.
4. **Bio** (2 lines, emoji allowed) → **Member Since** with per-context dates
   (Discord date • server date, each with its favicon-sized icon) — the dual-date
   pattern maps perfectly to "joined watchparty • joined community".
5. **Roles as wrapped chip rows** — each chip = color dot + label (+ optional emoji).
   Users clearly hoard these; density IS the appeal. Note the community hack:
   fake "———Badges———" divider roles to section the wall — we should build real
   section headers instead (Badges / Level / Notifications groups).
6. **Connections with receipts** — linked X/Reddit shown with follower/post counts
   and member-since. Proof, not just links. Maps to our wallet + X socials.

## Right pane: tabbed content rail

Tabs: Activity / Mutual Friends / Mutual Servers (+ "Board" with games). Cards like
"Games in rotation", "Favorite game" — image-led rows inside rounded cards, with a
"Show more". Empty states are written with personality ("drop them a friendly
hello"), never blank.

## Mapping to watchparty (we already have the data)

The gamification arc gives us REAL earned badges — no fake divider roles needed:
- **Badge strip candidates**: level milestones (LV10/25/50 glyphs), verified tier,
  premium tier, top-caller finish (weekly board), callout 10× hit, top-trader
  finish, quest streaks, token launcher, early member, server/community booster.
- **Server-tag equivalent**: community tag chip or $TICKER holder chip.
- **Roles wall** → community roles already exist in communities; profile could show
  per-community roles when viewed from that community's context.
- **Right rail** → our profile already has tabs; a "Board" tab could host: pinned
  token (like "Favorite game"), PnL card, best callout, active quests.
- **Dual dates**: watchparty join date • community join date.
- **Connections with receipts**: X followers via socials, wallet age/first tx.

## Rules when implementing

- Chips/pills stay `rounded-full`; cards Lisse squircle; interior padding ≈ p-5/p-6.
- Badge icons get brand-tinted glow on hover, not drop shadows.
- The badge strip is EARNED-only — nothing purchasable in the strip except premium
  tier; paid stuff reads as status only if scarce.
- Popout model: Discord renders this as an overlay anchored to the avatar anywhere
  in the app — worth adopting for watchparty (hover/click avatar in feeds, chat,
  leaderboards → mini profile card) instead of forcing the full /[slug] navigation.
