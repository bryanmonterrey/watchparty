# Verification & follow-ups

**Not the product roadmap.** That is `docs/platform-roadmap.md` — console,
webhooks, app registry, studio, streaming, phases 0-12. This is the engineering
queue left behind by the defect work of 2026-08-11: what shipped unverified,
what is blocked on what, and the two decisions that are the owner's. The two
documents are orthogonal; neither reorders the other.

Written 2026-08-11, after a session that fixed fourteen defects found by
measurement rather than by reading code. Ordered so each phase unblocks the
next; the dependencies are real, not stylistic.

**The one constraint that shapes everything below:** browser verification of
*authenticated* surfaces is currently impossible on this machine. A cold Next
dev route compile is ~5 minutes (measured: `/feed/bookmarks` 334s, `/e2etest2`
226s), and four verification attempts died on a 10-minute ceiling. Production
answers in milliseconds but needs a session for anything gated. Phase 0 exists
to remove that constraint, and almost everything else waits on it.

---

## Phase 0 — Unblock verification

**Goal:** be able to check authenticated surfaces again, in seconds rather than
minutes.

1. **Fix the studio type error.** `components/studio/content-view.tsx:175,184`
   treats `videos.data` as an array; the procedure returns `{ videos: [...] }`,
   so it needs `videos.data.videos`. Uncommitted as of writing, so CI is safe —
   but `next build` type-checks, and this breaks the deploy the moment it lands.

2. **Provision the e2e fixture's wallet** (task #2). ⚠️ **NOT two HTTP calls —
   that was tried on 2026-08-11 and is blocked.** `/api/create-wallet` sits
   behind Turnstile (`route.ts:194`), so no script can obtain a token, and
   solving a CAPTCHA is off-limits. The workable route is to click the wallet
   setup once by hand in a headed browser against dev, then reuse that browser
   profile with puppeteer's `userDataDir` — the IndexedDB share persists. See
   task #2 for the alternatives and their trade-offs.

   The attempt was still worth it: it found a permanent lockout (fixed,
   `12672ccc`) and dev-database schema drift (`user.is_bot` missing, so every
   full-row user select threw locally — applied from `db/developer-bots.sql`).

3. **Decide the production fixture.** `mint-test-session.mjs --yes-production`
   creates one throwaway identity, restricted by the script to
   `e2e-test@watchparty.local`, with no wallet, no funds and no premium. It is a
   deletable row. Saying yes unblocks phases 1, 3 and 4 against production,
   where nothing compiles. Saying no means those phases run against dev and cost
   ~10 minutes per attempt.

**Done when:** a puppeteer script can load `/messages` signed in, in under a
minute.

---

## Phase 1 — Close the open verifications

Three things shipped this session that are correct by reasoning and unproven in
a browser. Each is a short check once Phase 0 lands.

1. **Private-keyed snapshot paint** (task #3). Bookmarks and notifications.
   ⚠️ **DELAY the response, do not abort it.** query-core applies
   `placeholderData` only while `status === "pending"`
   (`queryObserver.js:265`), so an aborted request settles the query to `error`
   and the placeholder stops applying — the test then reports a failure it
   caused itself. That mistake produced a wrong diagnosis this session.

2. **DM rendering.** The data path is already covered — `walk-pagination` walks
   `message.list` 121/121, no duplicates. What is unverified is the rendered
   surface: scroll anchoring, the top sentinel, the load-older indicator. The
   dev conversation `244627f0-4ee8-495b-ab3c-feadcffe5f8c` holds 121 messages a
   minute apart, so ordering is checkable by string compare.

3. **Community chat pagination in the UI.** The fix (threshold + anchoring) was
   verified by DOM-node growth, not by watching it. Confirm the view does not
   jump when older messages prepend.

**Done when:** all three are observed, not inferred.

---

## Phase 2 — Wallet provisioning at signup

**This is the only outstanding item that is a USER problem rather than an
engineering one.** Per the `messages-connect-wallet-gate` note, roughly a third
of accounts hit a setup wall at `/messages` and cannot use DMs.

The mechanics are the same two calls as Phase 0 step 2 — the work is small. The
decision is not:

> Per the `wallet-model` memory the server can sign embedded wallets alone
> (both FROST shares are server-decryptable). Provisioning one for every account
> at signup therefore gives every account a server-signable wallet, including
> accounts that never asked for one.

That is a product and security call for the owner, not an implementation
detail. Options worth weighing: provision eagerly at signup; provision lazily
on first `/messages` visit; or keep it manual and make the gate's copy honest
about what it is asking for.

**Note:** `12672ccc` fixed a *permanent lockout* in this area — `create-wallet`
guarded on a cached session field, so a cache/row disagreement left the user
unable to create a wallet AND unable to rehydrate one. That may account for
part of the "1/3" number. Re-measure how many accounts actually lack a wallet
before sizing this phase.

---

## Phase 3 — Decide windowing (task #4)

**Do not build it on current evidence.** There is no performance measurement at
the depth that would justify it — only node counts:

```
 50 messages   ~2,400 nodes
400 messages   16,453 nodes   (measured)
832 messages   ~33,000 nodes  (extrapolated)
```

Both long-task readings (77ms, 411ms) were taken at ~100 rows / 4,453 nodes,
because the community-chat pagination bug capped the DOM at two pages until it
was fixed the same day. The 5x spread between them at identical node count is
environment noise, not signal — any future reading needs repeats and a median.

**What to measure** (production, real channel, scrolled deep): long tasks during
a sustained scroll burst, JS heap after ~800 messages, INP while scrolling.

**Build it if** long tasks regularly exceed ~50ms or heap climbs past ~100MB.
**Otherwise leave it:** it is a tail problem (a normal visit is ~4k nodes), the
memo comparators from Phase 6 step 1 already took the cheaper half, and it
would replace scroll machinery fixed on 2026-08-11 in a file where a broken
scroll trigger went unnoticed for months.

---

## Phase 4 — Finish traderConcentration (task #1 step 3)

Steps 1 and 2 are done. The metric is computed and tested; it is attached to no
surface.

Before wiring it, **check how many tokens actually clear the floor.** It needs
≥40 trades in the window to return a verdict, only 8 tokens cleared that in 24h
at the old Helius budget, and the budget was cut 12 → 6 on 2026-08-11, which
roughly halves the trade sample. A filter that answers "no verdict" for
everything is worse than no filter.

Candidates unchanged: the memescope filter dialog, and the coin page. There are
now two things worth rendering — the count-based `washy` verdict, and
`top5VolumeSharePct` as a reported number.

⚠️ Do **not** promote volume share to a verdict. Measured across 42 tokens, it
runs a median +35 points above count share and sits at 60-100% for healthy
tokens too; the 60% threshold would flag almost everything. Counts discriminate,
dollars do not.

---

## Standing work — keep these running

Two harnesses exist now and both run against production in seconds, needing no
session:

```bash
bun scripts/dev/walk-pagination.mjs --prod    # cursors: nothing lost or repeated
bun scripts/dev/probe-public-api.ts --gated   # every query, signed out, for 5xx
```

Between them they found two live 500s that nothing else could see. Run them
after any change to a router, a cursor, or an auth path.

**The lesson worth carrying:** four times this session a red result was the
TEST's fault, not the code's — including one that reported the entire site
down. When a sweep says everything is broken, check the sweep first. Both
scripts now print what they measured rather than a bare pass/fail, for exactly
that reason.

**And the theme underneath most of it:** four separate defects came from
something trusting a cached or derived value where it needed ground truth — a
snapshot keyed on an unresolved session, a cursor that could not survive ties,
a harness keying on `id` where the feed's identity was `feedKey`, and a wallet
guard reading a cached profile instead of the row. When something is
mysteriously stuck, ask what the code is reading and whether that is the same
thing as the truth.

**Related, checked and NOT a problem:** admin gating (`ctx.user.role`) reads
that same cached profile, but the TTL is 300s and profile updates invalidate it
explicitly, so a revoked role propagates within five minutes. Bounded, unlike
the wallet case, which was permanent.
