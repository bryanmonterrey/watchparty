# Undeployed work — what is stacked, and how to land it safely

Written 2026-08-23. GitHub Actions has been unable to start a run since
2026-08-21 (a failed card authorization — see `billing-restart-runbook.md`), so
work has been accumulating on `main` without ever reaching production.

**The work is not at risk.** `main` on GitHub is the source of truth and every
commit below is pushed; nothing lives only on the laptop. What IS at risk is
harder to see:

1. **Big-bang landing.** Eight code commits deploy in one run. If production
   breaks, "which commit" is a search, not a glance.
2. **A silent gate.** The `test` job gates every deploy job. It already ate
   four commits once — `check-file-sizes.mjs` failed and `deploy` was reported
   as *skipped*, not failed. tsc was clean the whole time and proved nothing.
3. **Context.** The knowledge of what each commit does and how to check it
   lives in one conversation. This file is that knowledge, outside it.

---

## Run the gate before every push, not just before the deploy

```bash
bun run gate        # mirrors the CI `test` job exactly, in the same order
```

Added 2026-08-23 because CI cannot currently tell us we broke it. It caught a
real failure the moment it existed: seven `text-[11px]` literals in the new
studio components, which the text-scale guard rejects. That would have been the
SECOND time a guard silently blocked the queue.

`bun run gate` is not a substitute for the type-check, which is separate and
slow:

```bash
rm -rf .next/dev/types && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

---

## The stack, oldest first

Everything below is verified locally: tsc clean, 449 tests pass, all five
guards clean.

| commit | what it changes | how to check it in production |
|---|---|---|
| `149d7b08` | Popover `z-30` while open/in-flight | Open the repost menu over a feed video — it must sit ABOVE the video controls. Same for the post-card dots menu, and the blur must visibly blur what is behind it |
| `74b17072` | 8s deadline on every asset-layer fetch | Open the wallet. The balance must resolve or error — never sit in the skeleton |
| `4c44fa48` | Sidebar hover + More-menu lock | Navigate profile → home: the rail must collapse on its own. Open the More menu and move the pointer away: the rail must STAY open until you click outside |
| `2acf65f9` | Collision-aware popover placement | Open a rail row's dots menu near the bottom of the rail — it must flip up instead of being clipped by the scroller |
| `1827f078` | `LiquidPanelBody` split out (unblocks the file-size guard) | Nothing visual. This is the commit that lets the rest deploy at all |
| `20d14278` | Studio: activity feed, category typeahead, persistent Go live | `/studio/streams` — activity panel in the right rail; category field suggests from the catalog; Go live appears in the sidebar on every studio page |
| `c44fca51` | Studio backlog: mod log, per-stream CCV, key reset, discovery fields, pop-out layouts | See "after this lands" below |
| `af6a4974` | Billing runbook (docs only) | — |

## Database state: already applied, deliberately ahead of the code

The three studio migrations were applied to **both** Supabase projects on
2026-08-23 (dev `hghxcuro…` via `DIRECT_URL`, prod `ugpzuypo…` via the pooler;
the Supabase MCP is read-only and cannot do DDL):

- `db/studio-mod-actions.sql` — `moderation_actions`, RLS enabled
- `db/stream-discovery-columns.sql` — `streams.stream_tags`, `.language`, `.is_mature`
- `db/stream-session-ccv.sql` — `stream_sessions.peak_viewers`, `.sample_count`, `.viewer_sum`

Schema ahead of code is the SAFE direction here: nothing deployed reads these
columns yet. The reverse would 500 the studio. **Keep it that way** — if
another schema change lands before this queue deploys, apply the SQL first.

---

## Landing sequence, when the card clears

```bash
# 1. Prove the local gate is green BEFORE spending a run on it
bun run gate

# 2. Start a run (a push works too, once billing is fixed)
gh workflow run deploy.yml --ref main

# 3. Watch the `test` job specifically — it gates everything else
gh run list --workflow=deploy.yml --limit 1
gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'
```

A `deploy` job reported as **skipped** means `test` failed — read its log, do
not re-run hoping.

Then walk the "how to check" column above, in order. The popover z-index fix is
first for a reason: it is the one with three separate user-visible symptoms,
and it is the easiest to confirm or refute in ten seconds.

## If the batch breaks production

The domains point at the `watchparty-app` container worker. Rollback is
`node scripts/cf/attach-domains.mjs` with no arguments, which re-points
them at the plain `watchparty` worker (see the `worker-exceeds-memory` memory).
That is faster than reverting eight commits and waiting for a build.

For a code-level revert, `149d7b08..HEAD` is the range, but note `1827f078`
must stay or the file-size guard blocks the next deploy again.
