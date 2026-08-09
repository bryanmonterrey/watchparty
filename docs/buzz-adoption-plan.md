# Buzz adoption plan

Porting the good parts of [`block/buzz`](https://github.com/block/buzz)
(Apache-2.0) into watchparty: the message/community **inputs**, the **design
techniques**, and the **app-wide engineering patterns** — plus a full
**prefers-reduced-motion** pass, which buzz does everywhere and we do almost
nowhere.

**Explicitly out of scope** (decided 2026-08-08):
- ❌ **Their colors.** Buzz is Catppuccin Latte/Macchiato. We keep watchparty's
  palette, tokens, and `--color-*` names. Nothing in this plan touches color.
- ❌ **lucide-react.** Buzz uses it throughout; we use HugeIcons
  (`HugeiconsIcon` + `@hugeicons/core-free-icons`) or `components/icons.tsx`.
  Every lifted component gets its icons swapped on the way in.
- ❌ Nostr/relay/agent architecture, Tauri-native bits (haptics, webview zoom,
  `-webkit-scrollbar` WKWebView workarounds).

## How to use this document

Nine phases. **Each phase is independently shippable** — finish it, verify it,
commit it, push it, then start the next. Do not batch phases into one commit;
if something regresses in production we need to know which phase did it.

Phases 0 → 4 change no dependencies and carry near-zero risk. Phase 5 adds
TipTap. Phases 6 → 8 are performance work that should be driven by the harness
built in Phase 8 (build the harness early if you want numbers before you start).

### Reference checkout

The buzz source is not vendored here. Clone it when you need to read along:

```bash
git clone --depth 1 https://github.com/block/buzz.git /tmp/buzz
```

Everything referenced below lives under `/tmp/buzz/desktop/src/`. Paths in this
document are written relative to that root, e.g.
`features/messages/ui/MessageComposer.tsx`.

### Verify step (every phase)

```bash
rm -rf .next/dev/types && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
bun test ./tests
```

A real pass is **empty tsc output**. Both parts of that command are
load-bearing — see CLAUDE.md. Treat crash frames as failure regardless of exit
code. The user reviews on production, not `next dev`, so after pushing check
`gh run list` before debugging "the change isn't showing".

### House rules that apply to every phase

- HugeIcons only, never lucide.
- No gradients. Depth comes from inset highlights, glow blobs, and hairlines.
- Neutral borders come from the centralized slate hairline in `globals.css` —
  don't hand-set border colors.
- Button heights are `h-11` (`h-12` when full-width) and come from the
  `Button`/`PillButton` primitives — never hand-set.
- Squircle via `<Squircle asChild radius={N}>`; **no `rounded-*` on a squircled
  element**; pills stay plain `rounded-full` with no `<Squircle>`.
- Skeletons are a **still flat fill**. The shimmer sweep was removed on
  2026-07-28 — do not re-add it. (The stale comment at the top of
  `components/ui/skeleton.tsx` still describes a sweep; Phase 7 fixes it.)
- Never render a wallet address in UI. Phase 4 makes this mechanical.
- Never write `{/* … */}` immediately after `return (` — it parses as an object
  literal and breaks the Turbopack build. Use `//` above the return.

---

# Phase 0 — Motion foundation

**Goal:** one place that defines how watchparty moves, and one primitive that
answers "is motion allowed right now?". Everything after this depends on it.

**Why:** we already have `lib/ease.ts` (springs + cubic-beziers, added with the
beui range-slider). What we don't have is *duration* and *distance* tokens, a
CSS-side equivalent, or a single reduced-motion primitive. 160 files import
`motion`/`framer-motion` and only 32 files anywhere mention reduced motion.

**Buzz reference:** `shared/styles/globals/motion.css` — four durations, two
easings, one distance, one blur, then *semantically named* classes
(`.motion-enter-conversation`) rather than effect-named ones.

### Steps

1. **Extend `lib/ease.ts`** with durations and distances. Keep the existing
   `EASE_*` and `SPRING_*` exports exactly as they are — 100+ files import them.

   ```ts
   /** Durations: feedback → state change → composed arrival. */
   export const DURATION = {
     instant: 0.12,   // press/hover feedback
     fast:    0.18,   // toggles, icon swaps
     standard:0.24,   // panels, popovers, tabs
     arrival: 0.5,    // a new object settling into a list
   } as const;

   /** Restrained travel — motion supports hierarchy, it isn't spectacle. */
   export const DISTANCE = {
     nudge:   4,      // px — hover lift, micro-shift
     arrival: 12,     // px — new content rising into place
   } as const;
   ```

2. **Mirror them in `app/globals.css`** as custom properties, in the `:root`
   block next to the existing theme tokens, so CSS-only animations use the same
   numbers:

   ```css
   --motion-duration-instant: 120ms;
   --motion-duration-fast: 180ms;
   --motion-duration-standard: 240ms;
   --motion-duration-arrival: 500ms;
   --motion-ease-standard: cubic-bezier(0.16, 1, 0.3, 1);   /* == EASE_OUT */
   --motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);   /* == EASE_IN_OUT */
   --motion-distance-arrival: 0.75rem;
   ```

3. **Create `hooks/use-reduced-motion.ts`** — one primitive, three shapes:

   ```ts
   /** Live `prefers-reduced-motion: reduce`. Re-renders on OS setting change. */
   export function useReducedMotion(): boolean

   /** Returns `motionProps` or a no-motion equivalent. Use in motion components. */
   export function useMotionSafe<T>(motionProps: T, reduced: T): T

   /** Non-React read, for imperative code (canvas bursts, rAF loops). */
   export function prefersReducedMotion(): boolean
   ```

   Implementation notes: subscribe with `useSyncExternalStore` over
   `matchMedia("(prefers-reduced-motion: reduce)")` so it stays correct if the
   user flips the OS setting mid-session, and guard `typeof window` for SSR
   (server snapshot returns `false`).

   ⚠️ `components/ui/bloom/hooks/useReducedMotion.ts` already exists. Leave the
   bloom copy alone — it's vendored third-party — but **new code imports the new
   hook**, and Phase 1 migrates our own files onto it.

4. **Add the global CSS safety net** to `app/globals.css`. This is the floor,
   not the solution — it catches CSS animations nobody remembered to handle:

   ```css
   @media (prefers-reduced-motion: reduce) {
     *,
     *::before,
     *::after {
       animation-duration: 1ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 1ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```

   Use `1ms`, not `0s` — a zero-duration animation never fires `animationend`,
   and any code awaiting that event hangs forever. This is a real class of bug;
   buzz uses `1ms` throughout for the same reason.

   ⚠️ This net does **not** reach JS-driven motion (`motion`/`framer-motion`
   interpolate inline styles, and a 1ms transition on an inline style rewritten
   every frame changes nothing). That's what Phase 1 is for.

**Done when:** tokens exist in both TS and CSS, the hook exists and is exported,
the global media query is in `globals.css`, tsc is clean.

**Commit:** `feat(motion): duration/distance tokens + reduced-motion primitive`

---

# Phase 1 — Reduced motion everywhere

**Goal:** every animated surface in the app respects the OS setting.

**Why:** it's an accessibility floor (vestibular disorders — animation causes
real nausea), and it's also the single cheapest way to make the app feel
deliberate. Buzz has a `prefers-reduced-motion` branch on *every* animation;
we have 32 files out of ~500 animated ones.

### ⚠️ Scope: this phase is ADDITIVE (user constraint, 2026-08-08)

**Do not rewrite, retune, or replace existing animations.** Phase 1 adds a
reduced-motion branch to what's already there — it does not touch how anything
moves for a normal user. Concretely:

- ✅ Append `motion-reduce:transition-none` / `motion-reduce:animate-none`.
- ✅ Add a `prefers-reduced-motion` branch to an existing `@keyframes`.
- ✅ Add a `reduced ?` ternary to a `motion.*` `transition` / `initial`.
- ❌ Change an existing duration, easing, distance, or spring.
- ❌ Swap a hand-tuned animation for a token'd one "for consistency".
- ❌ Delete an animation because a token equivalent exists.

The `DURATION` / `DISTANCE` tokens from Phase 0 are for **new** code and for
surfaces we deliberately consolidate later. They are not a mandate to migrate
the ~442 existing `transition-*` users. If a token genuinely fits an existing
animation, leave it alone anyway — the diff isn't worth the risk of retuning
something that was tuned by eye.

**Scope, measured 2026-08-08:**

| Surface | Count | Handling |
|---|---|---|
| `motion` / `framer-motion` importers | ~160 files | `useReducedMotion` / `useMotionSafe` |
| `transition-*` Tailwind classes | ~442 files | `motion-reduce:transition-none` |
| `animate-*` Tailwind classes | ~93 files | `motion-reduce:animate-none` |
| `@keyframes` in `globals.css` | ~14 | explicit `@media` branch |
| Imperative rAF / canvas | a handful | `prefersReducedMotion()` early-return |

### Steps

Work surface by surface, not file by file — it's easier to review and easier to
stop halfway.

1. **`globals.css` keyframes first.** For each of the ~14 `@keyframes` blocks
   (`stagger-pulse`, `star-loader-*`, `ytp-spinner-*`, `page-fade-*`,
   `scrubber-shimmer`, `scrubber-rainbow`, the transitions.dev like-button and
   number pop-in), add or extend a `prefers-reduced-motion` branch.

   **Judgment call, and it matters:** a *decorative* animation should stop
   (`animation: none`). A *loading indicator* should keep moving — a frozen
   spinner reads as "the app hung". Buzz keeps its loader alive under reduced
   motion by swapping the spin for a gentle opacity fade (`star-loader-fade`),
   which our `star-loader` rule already does. Follow that precedent for
   `ytp-spinner-*`: replace rotation with a fade, don't kill it.

2. **Tailwind classes.** `motion-reduce:` is a stock Tailwind variant, so this
   is a mechanical pass:

   ```
   transition-transform duration-200  →  … motion-reduce:transition-none
   animate-pulse                      →  … motion-reduce:animate-none
   ```

   Do it per feature directory so the diffs stay readable:
   `components/messages/` → `components/community/` → `components/streaming/` →
   `components/browse/` → `components/rails/` → `components/premium/` →
   `components/ui/` → the rest.

3. **`motion` / `framer-motion` components.** Three patterns cover nearly all
   of them:

   ```tsx
   // (a) Whole-component opt-out — decorative entrance
   const reduced = useReducedMotion();
   <motion.div
     initial={reduced ? false : { opacity: 0, y: DISTANCE.arrival }}
     animate={{ opacity: 1, y: 0 }}
     transition={reduced ? { duration: 0 } : { duration: DURATION.arrival, ease: EASE_OUT }}
   />

   // (b) Keep the state change, drop the travel — meaningful transitions
   transition={reduced ? { duration: 0 } : SPRING_PANEL}

   // (c) Spring → instant, for layout animations
   <motion.div layout={!reduced} />
   ```

   Rule of thumb: **opacity may stay, movement goes.** A cross-fade is not what
   makes people sick; translation, scale, parallax, and rotation are.

4. **Imperative motion.** Anything driving `requestAnimationFrame`, canvas
   particles, marquee scroll, or auto-advancing carousels calls
   `prefersReducedMotion()` and either doesn't start or renders its end state
   immediately. `components/ui/marquee.tsx` already checks — use it as the
   model.

5. **Autoplay & carousels.** Auto-advancing anything is motion the user didn't
   ask for. Under reduced motion, carousels stop auto-advancing and keep manual
   controls.

**Done when:** with **System Settings → Accessibility → Display → Reduce
motion** on, a walk through login → feed → a stream → messages → a community →
premium shows no travel, no auto-advance, no spin (loaders fade instead), and
nothing is stuck or invisible. tsc clean.

**Commit:** one per surface, e.g. `a11y(motion): reduced-motion for
components/messages`

---

# Phase 2 — Shared style constants

**Goal:** stop re-typing the same surface treatment, and make it impossible for
two popovers to drift apart.

**Why:** this is the highest value-per-hour thing in the whole buzz repo. They
don't wrap recurring treatments in components — they **export plain strings**
and compose them with `cn()`. A wrapper component fights `asChild`, adds a DOM
node, and gets forked when someone needs a variant. A string doesn't.

**Buzz reference:** `shared/ui/popoverSurface.ts`, `shared/ui/modalMotion.ts`,
`shared/ui/modalSearchStyles.ts`, `features/channels/ui/channelFormStyles.ts`.

### Steps

1. **Create `lib/surfaces.ts`.** Audit what actually recurs before writing it —
   grep our popovers/dialogs/sheets for their class strings and find the common
   denominator. Expected exports:

   ```ts
   /** Floating surfaces: GooDropdown, popovers, autocompletes, context menus. */
   export const POPOVER_SURFACE_CLASS = "…"
   /** Radix data-state enter/exit for popovers. Includes motion-reduce. */
   export const POPOVER_MOTION_CLASS = "…"
   /** Side-aware slide-in, keyed off data-side. */
   export const POPOVER_SIDE_MOTION_CLASS = "…"
   /** Dialog overlay + content motion. Includes motion-reduce. */
   export const MODAL_OVERLAY_MOTION_CLASS = "…"
   export const MODAL_CONTENT_MOTION_CLASS = "…"
   /** The search field shell used in modals and quick-switchers. */
   export const SEARCH_SHELL_CLASS = "…"
   export const SEARCH_INPUT_CLASS = "…"
   ```

   Two constraints specific to us:
   - **No gray/black drop shadows.** Buzz's `POPOVER_SHADOW` is exactly that —
     don't port it. Our floating surfaces get depth from the hairline border
     plus an inset highlight.
   - **Every motion constant carries its own `motion-reduce:` variant.** That's
     the whole point of centralizing them: Phase 1 becomes permanent instead of
     something that decays.

2. **Adopt them.** Highest-traffic first: `components/ui/goo-dropdown` and every
   dropdown built on it → dialogs/sheets → the quick-switcher and search modals
   → autocompletes. Replace the literal class strings with the constant; keep
   any genuinely per-instance classes appended after it via `cn()`.

3. **Create `lib/chrome-layout.ts`** for measured chrome (buzz:
   `shared/layout/chromeLayout.ts`). Their pattern: measure a header's height
   into a CSS custom property once, then export **Tailwind class fragments** that
   every consumer imports instead of hardcoding an offset.

   ```ts
   export const chromeCssVars = {
     headerHeight: "--wp-header-height",
     contentTopPadding: "--wp-content-top-padding",
   } as const;

   export const appChrome = {
     contentPadding: "pt-(--wp-content-top-padding,4rem)",
     top:            "top-(--wp-content-top-padding,4rem)",
     headerHeight:   "h-(--wp-header-height,3.5rem)",
   } as const;
   ```

   This kills the class of bug where a sticky element is 4px off because
   somebody hardcoded `top-16` against a header that's now `h-[3.75rem]`.

**Done when:** no popover/dialog/search surface carries a hand-written copy of
the shared treatment; opening several different dropdowns shows an identical
surface; tsc clean.

**Commit:** `refactor(ui): shared surface + motion class constants`

---

# Phase 3 — Composer UX rules (no new dependencies)

**Goal:** make our four existing composers behave correctly, before rewriting
any of them.

**Why:** most of what makes buzz's composer feel good is *keyboard and state
correctness*, not rich text. All of it applies to a plain `<textarea>`. Doing
this first means Phase 5 is a rendering upgrade rather than a behavior rewrite —
and if Phase 5 ever stalls, we've already banked the wins.

**Our four composers today:**

| File | Lines | Today |
|---|---|---|
| `components/messages/message-input.tsx` | 315 | textarea, emoji picker, audio recorder, attachment, reply |
| `components/community/community-chat-input.tsx` | 215 | textarea, naive `@` prefix filter, reply, stickers |
| `components/streaming/chat-composer.tsx` | 274 | single-line `<input>`, live chat |
| `components/browse/comment-composer.tsx` | 534 | post/comment composer |

### Steps

1. **Create `hooks/use-composer-keys.ts`** — one keydown handler, shared by all
   four. Behaviors, each lifted from buzz:

   | Key | Behavior | Buzz source |
   |---|---|---|
   | `Enter` | Submit — **but pass through when an autocomplete is open** | `useRichTextEditor.ts` `submitOnEnter` |
   | `Shift+Enter` | Newline | same |
   | `↑` on empty composer | Edit your last message; return `false` to fall through to caret movement if there's no target | `onEditLastOwnMessage` |
   | `Escape` | Cancel reply → cancel edit → blur, in that order | `ComposerReplyEditBanner` |
   | `⌘K` / `Ctrl+K` | Link editor **only** when text is selected or the caret is in a link; otherwise fall through to global search | `onLinkShortcut` |

   The autocomplete pass-through is the one to get right: read it from a **ref**
   (`isAutocompleteOpenRef`), not state, so the handler doesn't need to be
   re-created on every open/close.

2. **Create `hooks/use-composer-drafts.ts`.** Per-conversation drafts that
   survive navigation, keyed by `channelId` / `conversationId`.

   Buzz's `lib/useDrafts.ts` pattern: localStorage plus a module-level
   subscriber set and version counter, exposed via `useSyncExternalStore`, so
   every consumer re-renders on write without a context provider. Also port
   `lib/localStorageQuota.ts` — writing drafts is exactly where you hit
   `QuotaExceededError`, and it needs to degrade instead of throwing.

   Persist on unmount and on key change; restore on mount. Clear on successful
   send.

3. **Paste handling.** From `useRichTextEditor.ts`:
   - Pasting a URL at the very end appends a plain space so the next word isn't
     swallowed into the link.
   - Strip mention markup from pasted HTML rather than inheriting foreign spans
     (`lib/normalizeMentionClipboard.ts`).

4. **Fix the mention autocomplete in `community-chat-input.tsx`.** Today it's
   `startsWith` on username/name. Port the ranking from
   `lib/mentionRanking.ts`:

   - Group rank first (channel members before non-members before bots),
   - then match quality: exact → prefix → word-exact → word-prefix,
   - then original order as a stable tiebreak.

   And port the **name-collision disambiguator**: when two candidates share a
   display name, show something distinguishing on each row. Buzz shows a
   truncated npub because vanity-ground keys are an impersonation vector. Our
   analogue is duplicate display names → show `@username`. ⚠️ **Do not show a
   wallet address** — that's the rule Phase 4 enforces.

5. **Shared reply/edit banner.** Buzz's `ComposerReplyEditBanner` is one
   presentational component where **edit takes precedence over reply**, with the
   banner tucked *behind* the composer (`-mb-4`, `rounded-t-2xl`, `border-b-0`)
   so it reads as one attached surface. Build `components/messages/composer-reply-banner.tsx`
   and use it in all four composers. HugeIcons for the pencil/reply/close
   glyphs.

6. **Stable composer height.** Buzz's `composer.css` trades a quiet-state spacer
   against the typing-indicator rail so the dock's total height never changes
   when someone starts typing — the timeline's scroll padding stays put. Do the
   same wherever we show a typing indicator: reserve the rail, fade the content
   in and out, never grow the container.

**Done when:** in all four composers — Enter sends, Shift+Enter newlines, Enter
picks the highlighted autocomplete item instead of sending, ↑ edits your last
message, Escape unwinds reply→edit→blur, drafts survive navigating away and
back, a typing indicator appearing doesn't shift the message list. tsc clean.

**Commit:** one per hook + one per composer adoption.

---

# Phase 4 — CI guards

**Goal:** turn three rules we currently hold in memory into scripts that fail
the build.

**Why:** the `test` job in `.github/workflows/deploy.yml` already gates `deploy`
and `deploy-container`. It runs `bun test ./tests` and takes seconds. Adding
mechanical checks there is nearly free, and each of these is a rule we've
already broken at least once.

**Buzz reference:** `scripts/check-*-core.mjs` (shared logic) with a thin
per-app wrapper that supplies roots and an allowlist. Copy that shape — the
allowlist is what makes a guard survivable.

### Steps

1. **`scripts/check-wallet-address-display.mjs`** — the important one.

   Rule: *never render a wallet address in UI.* Buzz has the identical rule for
   pubkeys (`check-pubkey-truncation.mjs`) because a truncated prefix is
   forgeable by vanity grinding; ours is a product rule, but it decays the same
   way — it's currently enforced only by remembering it.

   Flag `address.slice(…)` / `.substring(…)` / `shortenWalletAddress(…)` inside
   JSX text positions, outside an allowlist. Allow: the canonical helper in
   `lib/utils.ts`, functional (non-display) uses, and explicit `path:line`
   exceptions with a comment explaining each.

2. **`scripts/check-text-scale.mjs`** — ban arbitrary text-size literals
   (`text-[15px]`, `text-[0.9rem]`, CSS `font-size: 15px`) so type stays on one
   named scale. Buzz's rationale is zoom (px freezes against Cmd +/-); ours is
   consistency, and it's the same fix either way: add a named token to the
   Tailwind theme rather than an arbitrary value. Allowlist genuinely decorative
   glyphs by `path:literal`.

   ⚠️ Run it in report-only mode first. We will have a lot of existing hits;
   seed the allowlist from the current state, then ratchet down.

3. **`scripts/check-file-sizes.mjs`** — cap source files (buzz uses 1000 lines).
   This is why their composer is 40 small modules instead of one 4,000-line
   file, and it's the guard that makes Phase 5 tractable. Seed the allowlist
   with today's over-limit files so it only blocks *new* growth.

4. **Wire into CI.** In `deploy.yml`, in the existing `test` job, after
   `bun test ./tests`:

   ```yaml
   - name: Repo guards
     run: |
       node scripts/check-wallet-address-display.mjs
       node scripts/check-text-scale.mjs
       node scripts/check-file-sizes.mjs
   ```

   Each script prints `path:line: <matched text>` for every violation plus a
   one-paragraph explanation of the fix and how to add an exception. A guard
   nobody can act on gets deleted.

**Done when:** all three run clean locally and in CI; deliberately introducing a
violation of each fails the job with a readable message.

**Commit:** `ci: repo guards for wallet-address display, text scale, file size`

---

# Phase 5 — Rich composer (TipTap)

**Goal:** replace the `<textarea>` in messages and community chat with a real
rich-text composer.

**Why:** this is the actual gap. Everything in Phase 3 makes our textareas
behave well; this is what makes them competitive — inline mentions as atoms,
`:emoji:` autocomplete, formatting, spoilers, attachment queue.

**Do Phase 3 first.** Its hooks are reused verbatim here.

### ⚠️ Two constraints that shape the whole phase

1. **Bundle ceiling.** The worker has a **10 MiB gzip hard cap**, and
   `await import()` does **not** unbundle for the worker — only `ssr: false`
   does. So the composer must be loaded with
   `dynamic(() => import(…), { ssr: false })`, and it must live under
   `app/(app)/`, never in the root layout. Measure with
   `wrangler --dry-run` before and after.
2. **Markdown is the wire format.** `getMarkdown()` is the source of truth, as
   in buzz. The stored/transmitted message stays a plain string — nothing about
   the DB, tRPC routers, or the mobile app changes. That is what makes this
   phase reversible.

### Dependencies

```
@tiptap/core @tiptap/react @tiptap/pm @tiptap/starter-kit
@tiptap/extension-placeholder @tiptap/extension-link tiptap-markdown
```

### Steps

1. **`hooks/use-rich-text-editor.ts`** — port `lib/useRichTextEditor.ts`. The
   StarterKit config is where the hard-won knowledge lives; copy the decisions
   *and their comments*:

   | Setting | Why |
   |---|---|
   | `heading: false` | `# ` must stay literal — people type `#channel` |
   | `trailingNode: false` | otherwise a phantom empty line after any block node |
   | `link: false` | configured separately with `openOnClick: false` |
   | `hardBreak: { keepMarks: true }` | Shift+Enter preserves bold/italic |
   | `code` / `codeBlock` `spellcheck: "false"` | no red squiggles under identifiers |

   Enter-to-submit **must** be a TipTap extension, not a wrapper handler — as an
   extension it runs inside the ProseMirror keymap and fires *before*
   `splitBlock`. A wrapper handler leaves a phantom `\n\n` in the sent message.

   `↑`-to-edit **must** be in `editorProps.handleKeyDown` (raw DOM), not the
   keymap — right after a send the WebView consumes vertical arrows before the
   keymap plugin sees them.

2. **Context-aware `Shift+Enter`** (buzz's `smartShiftEnter`): splits list
   items, exits an *empty last* list item into a paragraph, lifts out of an
   empty blockquote, inserts a real newline inside a code block. Falls through
   to a hard break otherwise.

3. **Autocompletes.** Three, sharing one plain-text projection of the doc
   (`lib/plainTextProjection.ts`) so offsets are computed once:
   - `@mention` — reuse the Phase 3 ranking.
   - `:emoji:` — we already ship `@emoji-mart/data`. Port
     `lib/useEmojiAutocomplete.ts`: 120ms debounce, minimum 2 characters,
     shortcode matches ranked ahead of fuzzy name matches.
   - `#channel` (community chat only).

   The dropdown uses `POPOVER_SURFACE_CLASS` + `POPOVER_MOTION_CLASS` from
   Phase 2. It flips above/below based on space — near the bottom edge it opens
   upward, same as the GooDropdown `side="top"` rule.

4. **Toolbar.** Port `MessageComposerToolbar.tsx`'s structure, not its icons.
   The technique worth copying: mode switching via
   `AnimatePresence mode="popLayout"` with the shared toggle button
   **duplicated in both branches** so the crossfade is automatic — no
   `layoutId`, no ordering hacks, no overflow clipping. Add
   `useReducedMotion` so it becomes an instant swap under reduced motion.

5. **Selection formatting tray** — port `ui/SelectionFormattingTray.tsx`. A
   portalled floating toolbar over the current selection, rAF-throttled,
   `ResizeObserver` on itself for width, viewport-clamped with a 12px gutter,
   flips below when there's under 44px above. `onMouseDown` calls
   `preventDefault()` so clicking it doesn't drop the selection — that one line
   is the whole trick.

6. **Attachment queue** — port the shape of `lib/useMediaUpload.ts` +
   `backgroundMediaUploadStore.ts`, adapted to our Supabase TUS upload path.
   The key idea: **uploads are deferred until send** and queued attachments are
   part of the draft, so switching channels mid-compose doesn't orphan an
   upload. Ours must respect the project-wide 5GB storage limit and use the
   minted authenticated JWT for resumable uploads.

7. **Per-domain link icons** — `composer.css`'s
   `a[href*="…"]::before { mask: var(--icon) }` with inline data-URI SVGs. Zero
   JS, zero network, and it works identically in the composer and in rendered
   messages. Our set: watchparty coin/token links, stream links, X, GitHub.
   Colors come from our tokens, not theirs.

8. **Swap the composers over**, one at a time, behind the dynamic import:
   messages first (smaller blast radius), then community chat. Leave
   `streaming/chat-composer.tsx` on its single-line `<input>` — live chat wants
   minimum latency and a one-line field; give it the Phase 3 keyboard rules
   only.

**Done when:** mentions insert as atoms and survive copy/paste; `:smile:`
autocompletes; bold/italic/code/lists/quote/code-block all round-trip through
markdown unchanged; Enter sends with no trailing newlines; drafts persist with
attachments; the selection tray appears on selection and doesn't steal focus;
worker bundle still under the cap. tsc clean.

**Commit:** one per module, then one per composer swap.

---

# Phase 6 — Timeline & list performance

**Goal:** message lists that stay smooth with thousands of messages and live
inserts.

**Why:** `components/messages/message-list.tsx` (305 lines) and
`components/community/community-chat-messages.tsx` (208) render every row.
`browse-feed.tsx` is currently the *only* virtualized surface in the app.

### Steps

1. **Memo comparators first — before virtualizing.** Buzz's
   `lib/messageRowEquality.ts` exists because message objects get fresh
   identities on every refetch even when nothing changed, so identity-based
   `React.memo` never bailed and every row re-rendered several times per second
   in a busy channel.

   Write value-equality comparators for the props that get rebuilt (reactions,
   tags/metadata, author lookup) and pass them to `React.memo`. Also port
   `shared/hooks/useStableReference.ts` — `useStableMap` / `useStableSet` /
   `useStableArrayShallow` return the *previous* reference when contents are
   equal, which is what lets a memo boundary bail at all.

   ⚠️ `React.memo` is all-or-nothing: one unstable prop defeats it. The two
   repeat offenders are inline arrow props and React Query result objects
   (`useMutation`/`useQuery` return a **new object every render** — depend on
   `mutation.mutateAsync`, not `mutation`).

2. **Message grouping** — port `lib/messageGrouping.ts`. Same author within a
   **10-minute** window renders as a continuation (timestamp only, no avatar,
   no header); beyond it the message reads as a new thought and gets full
   chrome. Apply the same rule in DMs, community chat, and stream chat so they
   don't drift.

3. **Windowing: use `broad-infinite-list`, which is already installed.**

   ⚠️ Correcting an earlier note in this doc: `browse-feed.tsx` is **not**
   virtualized, and **no virtualization library is installed**. It uses
   `broad-infinite-list/react`'s `BidirectionalList` — a sliding window that
   keeps a fixed count of rows in the DOM (`VIEW_COUNT = 120`) with dynamic
   heights and no per-row measurement config. 2 KB gzipped, bidirectional,
   explicitly built for chat. `components/coin-feed/alerts-rail.tsx` uses it too.

   **Decision: extend the library already in use.** Adding `virtua` or
   `@tanstack/react-virtual` would make three windowing approaches in one app
   and spend bundle against the 10 MiB worker ceiling for capability we have.
   Revisit only if we hit something `broad-infinite-list` genuinely can't do
   (pinned day dividers inside the window is the likeliest candidate).

### ⚠️ Policy: virtualize unbounded lists, NOT every list

"Everything is a list, so virtualize everything" is the wrong rule — windowing
is a trade, not a free win. What it costs:

- **Browser find (⌘F) stops working** past the window. Off-screen rows aren't
  in the DOM, so ⌘F, "select all → copy", and in-page search miss them.
- **Screen readers lose the list.** `aria-setsize`/`aria-posinset` have to be
  set by hand or the list announces the wrong length.
- **Scroll restoration and deep links get harder** — jumping to a row that
  isn't mounted needs an index lookup and a programmatic scroll.
- **Short lists get *slower*.** Observers, measurement, and window bookkeeping
  cost more than just rendering 20 rows.
- **It fights page flow.** A window needs a bounded-height scroll container;
  lists that currently grow with the page have to be restructured.

So the rule:

| Virtualize | Don't |
|---|---|
| Unbounded — grows via pagination with no ceiling | Bounded by a fixed cap |
| Routinely 200+ rows in one session | Under ~100 rows realistically |
| Rows are expensive (media, markdown, embeds) | Rows are a line of text |
| Its own scroll container already | Grows with page scroll |

**And do the memo pass (step 1) BEFORE windowing.** Buzz's note is explicit:
their re-render storm came from unstable props, not row count. Windowing a list
whose every row re-renders on every event just re-renders fewer rows more often
— it hides the bug instead of fixing it, and costs you ⌘F to do it.

### Inventory (measured 2026-08-08)

18 surfaces use `useInfiniteQuery`, i.e. are unbounded by construction:

**Tier 1 — windowing clearly pays (long-lived, expensive rows, own scroller):**
- `components/community/community-chat-messages.tsx` — `limit: 50`/page, chat,
  grows all session. **Best first candidate.**
- `components/messages/message-list.tsx` — DMs. Not infinite *yet*: it's a
  plain query capped at 50 with no "load older" UI at all. Pagination now works
  server-side (9a), so this needs the client half before windowing means
  anything.
- `components/home/video-feed/index.tsx`, `components/shorts/shorts-feed.tsx` —
  media rows, the most expensive in the app.
- `components/browse/bookmarks-feed.tsx`, `components/profile/profile-tab-content.tsx`,
  `components/browse/search-results-view.tsx`, `app/(app)/search/page.tsx`,
  `components/categories/category-detail.tsx` — same post rows as browse-feed,
  which already windows. Reuse that setup directly.

**Tier 2 — measure first:**
- `components/trending/trending-table.tsx` — a table; windowing rows inside a
  `<table>` needs care with column alignment.
- `components/notifications/notifications-panel.tsx` — `limit: 30`, cheap rows,
  a panel people rarely scroll far in. Memo pass may be all it needs.
- `components/profile/followers-following-dialog.tsx`, `components/coin-feed/alerts-rail.tsx`
  (already windowed), `components/search/search-landing.tsx`,
  `components/home/*` variants.

**Tier 3 — do NOT virtualize:** community channel/member sidebars, settings
rails, tab bars, emoji/GIF picker grids, dropdown menus, rail rows. All bounded,
all cheap, and several are exactly where ⌘F matters.

4. **Row height estimation** — port `lib/rowHeightEstimate.ts`. It estimates a
   row's height **without touching the DOM or parsing markdown**: row chrome +
   a character-count line estimate + known media dimensions. This is what stops
   a never-painted media row from snapping from a flat placeholder to its true
   height when you scroll back up. Be deliberately conservative: over-reserving
   causes a small settle, under-reserving causes the jump.

5. **Anchored scroll** — the hard part. Port the *policy* from
   `ui/anchoredScrollPolicy.ts` and the state machine from `useAnchoredScroll.ts`:
   three anchor kinds (`at-bottom`, `message`, `pinned-center`), a **32px**
   threshold for the "am I at the bottom" UI affordance but a **1px** threshold
   for programmatic bottom pins. New messages arriving must not move the
   viewport when the reader is scrolled up.

6. **Image preloading** — `lib/timelineImagePreload.ts`. Warm avatars, video
   posters, and reaction emoji before their rows mount, but deliberately **not**
   inline image attachments — those need their lazy thumbnail to load before the
   full-resolution request.

### Step 1 status: ✅ community chat memoized (2026-08-08, `aaf1097a`)

`CommunityChatItem` is now `memo`'d with `chatItemPropsEqual`. Three separate
things had to be true before the memo could ever bail — worth knowing because
the same three recur on every other list:

1. The row wasn't memoized at all.
2. `emojiMap` was built inline in the channel page's render body
   (`Object.fromEntries` over `expressions`) — a new object on **every**
   keystroke, typing indicator and presence tick, handed to every row.
   `useMemo`'d, and hoisted above the early returns because hooks can't run
   conditionally.
3. `reactions` and `replyTo` get fresh identities by construction (per-page
   aggregation; an inline object literal). Value-compared now.

Also: `useQuery(...) = []` allocates a new array each render while data is
undefined. Module-level constant.

The comparator is key-driven rather than an explicit prop list, so a prop added
later is compared by default. An explicit list silently stops comparing new
props — a memo bug that presents as a rendering bug.

### Step 3 design: windowing community chat (NOT yet done)

⚠️ **Needs manual verification in a real channel.** There is no chat E2E test,
and this touches scroll position, live message arrival, and pagination at once
— the three things a unit test can't see. Do it as its own pass, not tacked
onto other work.

The house pattern (from `browse-feed.tsx`) is: keep the **full** ordered dataset
in a ref, hand `BidirectionalList` a window over it, and only hit the network
when `onLoadMore` runs off the end of what's loaded. Chat is the easy case —
it only pages upward.

- `renderItem` receives **`(item)` only, no index** — so the day-divider
  decision (which depends on the previous message) must be **precomputed onto
  each item** when flattening pages, not derived at render. Same for the
  grouping/continuation flag from step 2.
- Flatten to chronological order (oldest → newest) and drop the current
  `flex-col-reverse` + reversed-pages arrangement.
- `hasPrevious` = `hasNextPage` (scrolling **up** loads **older** — the naming
  inverts here and is easy to get backwards). `hasNext` = `false`: new messages
  arrive at the bottom via the subscription's invalidate, not via paging.
- `onLoadMore("up", refItem)` slices older items out of the full ref, and calls
  `fetchNextPage()` only when the ref is exhausted.
- Keep `viewCount` comfortably above a session's normal scrollback so the
  window doesn't trim messages a user just read and re-fetch them as they
  scroll back down — that reads as "new messages appeared above". `browse-feed`
  uses 120 for the same reason.
- The welcome block, "Load previous messages" button and `useCommunityScroll`
  all need re-homing: the library owns the scroller, so anything currently
  positioned by `mt-auto`/`flex-1` inside it has to move out.

**Done when:** a 5,000-message community channel scrolls at 60fps; scrolling up
through media doesn't jump; a new message arriving while scrolled up doesn't
move the viewport; React DevTools shows only the changed row re-rendering when
a reaction lands.

**Commit:** one per numbered step.

---

# Phase 7 — Skeletons & loading

**Goal:** loading states that don't shift layout when they resolve.

**Buzz reference:** `shared/styles/globals/skeleton.css` + `shared/ui/skeleton.tsx`.

### Steps

1. **Port `SkeletonReveal`.** The technique: the skeleton and the real content
   occupy the **same CSS grid cell** and cross-fade, with the outgoing skeleton
   picking up a 2px blur. Zero layout shift on reveal, because the content was
   always occupying its final space.

   Keep our flat fill — **no shimmer sweep** (removed 2026-07-28, don't re-add).
   Buzz's opacity pulse is optional; if we use one, it's a still fill pulsing
   between 1 and 0.5 opacity, never a moving highlight band.

   Reduced motion: cross-fade and pulse both off, straight swap.

2. **Fix the stale comment** at the top of `components/ui/skeleton.tsx` — it
   still describes "a soft highlight band sweeps across a flat fill", which
   hasn't been true since July.

3. **Adopt `SkeletonReveal`** on the surfaces where we already mirror component
   chrome in the skeleton (rails, tiles, alerts). Those are the ones already
   shaped right for it. `?debug-loading` should keep working to pin the loading
   state.

4. **Scroll-boundary lock** — buzz's `shared/hooks/useScrollBoundaryLock.ts`
   stops a scroll gesture inside a panel from chaining to the page behind it.
   We hide scrollbars app-wide, which makes accidental scroll-chaining more
   confusing, not less. Apply to modals, sheets, dropdowns, and the messages
   pane.

**Done when:** loading→loaded transitions cause no layout shift; scrolling to
the end of a dropdown doesn't scroll the page behind it; reduced motion gives a
clean swap.

**Commit:** `feat(ui): skeleton cross-fade reveal + scroll boundary lock`

---

# Phase 8 — Performance harness

**Goal:** measure the things Phases 5–6 claim to improve, before and after.

**Why:** we have no automated frontend perf signal at all. Buzz's perf specs are
the reason they could say "typing is slow in busy channels" and then prove it
fixed. Consider building this *before* Phase 6 so its work is driven by numbers.

**Buzz reference:** `desktop/tests/e2e/typing-latency.perf.ts` +
`playwright.perf.config.ts`.

### Steps

1. **Add Playwright** as a dev dependency with a **separate config**
   (`playwright.perf.config.ts`, `testMatch: **/*.perf.ts`, `workers: 1`,
   `retries: 0`) so perf specs never run in the normal test path.

2. **Port `typing-latency.perf.ts`.** The methodology is the valuable part:
   - Metric is the **Event Timing API** (`PerformanceObserver`, `type: "event"`,
     `durationThreshold: 16`) — each entry's `duration` is input timestamp →
     next paint, which is the engine's own definition of keystroke
     responsiveness. Not a hand-rolled `performance.now()` diff.
   - **4× CPU throttle**, so a fast dev machine doesn't hide the problem.
   - Report median / p95 / max / count-over-50ms, plus long-task totals as a
     second axis.
   - Two scenarios — **quiet** vs. **busy** (simulated typing indicators from N
     users plus a live message landing every 2s). Absolute milliseconds are
     machine-specific; **the quiet-vs-busy delta on one machine is the signal.**

   Run it against messages, community chat, and stream chat.

3. **Add `scroll-smoothness.perf.ts`** for the Phase 6 timeline work — long-task
   totals and dropped frames while scrolling a long channel.

4. **Record a baseline** in `docs/perf-baseline.md`: date, machine, and the
   numbers. Re-run after Phase 5 and Phase 6 and append. Without a recorded
   baseline the harness is just a slow test.

⚠️ Measure with **DevTools closed and no `console.log` probes** — an open
inspector and per-keystroke logging both inflate the numbers enough to send you
chasing the wrong thing. Isolate by removing one suspect at a time.

**Done when:** `bun run perf` produces a report for all three chat surfaces and
a baseline is committed.

**Commit:** `test(perf): typing-latency and scroll-smoothness harness`

---

---

# Phase 9 — Data layer: pagination correctness & round trips

**Goal:** the non-UI half. Nothing here is design; it's correctness and
round-trip count.

**Why:** buzz's channel-window spec (`docs/bridge-channel-window.md`, and
`docs/nips/NIP-CW.md`) is unusually strict about pagination, and reading it
against our routers surfaced a live bug. Their two governing rules:

> The next-page cursor is the `(created_at, id)` of the **last retained row**.
> `has_more` is a **server fact** … Clients must not infer exhaustion from row
> count.

> `top_level` with `until` but no `before_id` is rejected (`400`): the window
> path has **no timestamp-only fallback, ever.**

## 9a. ✅ DONE (2026-08-08) — cursor off-by-one, one row lost per page boundary

Fixed in `f16a6e67`. `server/lib/paginate.ts` (`takePage`) is now the one place
the rule lives; `tests/pagination.test.ts` walks every page the way production
does — including the SQL `LIMIT limit + 1` — and fails on the old shape.

Measured before/after over 95 rows at `limit: 10`: **87 of 95 delivered**,
losing r10, r21, r32, r43, r54, r65, r76, r87 — one per page boundary. After:
95 of 95.

Two things worth keeping:

- **Model the SQL `LIMIT` in the test.** My first simulation passed the whole
  table to the handler, so `pop()` removed the oldest row *in the table* rather
  than the probe row — it "failed" spectacularly (10 of 95) for entirely the
  wrong reason and would have sent someone chasing a fantasy. The probe slice
  is what makes the test reproduce the real defect.
- **`message.list` was worse than the off-by-one** and is fixed in the same
  commit: it accepted a `cursor` and never applied it — the `WHERE` was
  `conversationId` alone. Every page returned the newest 50 messages while
  still handing back a `nextCursor`, so **DM history past the first page was
  unreachable**. It now resolves the id cursor to its `(createdAt, id)` sort
  position and pages with a composite keyset (9b, done for this route),
  with `id ASC` added as the tiebreak a keyset cursor requires.

### ⚠️ Follow-on found while fixing this: DM optimistic sends never render

`message.list` has exactly one consumer — `components/messages/messages-provider.tsx:91`
— and it's a plain `useQuery({ conversationId, limit: 50 })`. But
`hooks/use-messages.ts` writes its optimistic update through
`utils.message.list.setInfiniteData({ conversationId })` and snapshots via
`getInfiniteData`.

Those address a **different cache entry** on two counts: infinite queries carry
a distinct key from regular ones, and the input `{ conversationId }` doesn't
match the query's `{ conversationId, limit: 50 }`. So:

- the optimistic message is written somewhere no component subscribes to — it
  **never appears**, and the sent message only shows up after the server round
  trip and the invalidate-driven refetch;
- `previousMessages` is always `undefined`, so the error rollback restores
  nothing.

Fix is `setData`/`getData` with the exact input the query uses, and reshaping
the updater from `{ pages, pageParams }` to the flat `{ success, messages }`
this procedure returns. Worth pairing with hoisting `limit: 50` into a shared
constant so the key can't drift again.

### The original defect, for reference

Seven paginated procedures probe with `limit + 1`, `pop()` the extra row, and
then use **the popped row's** timestamp as `nextCursor`. The next page filters
`lt(createdAt, cursor)` — strictly older — so **the popped row is never
delivered to the client.**

```ts
// ✗ current — rows[limit] is popped, becomes the cursor, then excluded by `lt`
if (rows.length > input.limit) {
  const next = rows.pop();
  nextCursor = next?.createdAt.toISOString();
}

// ✓ post.ts already does it right — cursor is the last RETURNED row
const hasMore  = rows.length > input.limit;
const rawItems = hasMore ? rows.slice(0, input.limit) : rows;
nextCursor = hasMore ? rawItems[rawItems.length - 1].createdAt.toISOString() : undefined;
```

| File | Line | Status |
|---|---|---|
| `server/routers/comment.ts` | ~90 | ✗ drops a reply per page |
| `server/routers/content.ts` | ~1277 | ✗ |
| `server/routers/content.ts` | ~1440 | ✗ |
| `server/routers/community.ts` | ~2460 | ✗ drops a chat message per page |
| `server/routers/notification.ts` | ~42 | ✗ drops a notification per page |
| `server/routers/feed.ts` | ~161 | ✗ |
| `server/routers/feed.ts` | ~187 | ✗ |
| `server/routers/post.ts` | 287–288, 358–360 | ✓ correct — copy this shape |
| `server/routers/post.ts` (bookmarks) | 419–420, 452 | ✓ correct |
| `server/routers/message.ts` | ~100 | ⚠️ id cursor — audit separately |

At `limit: 30` that's one item silently missing every 30 on every infinite
scroll in the app. It reads as "the feed skipped something", which is
unfalsifiable from the UI and would never show up in tsc, tests, or a deploy.

**Fix:** normalize all of them onto `post.ts`'s shape. Add a `tests/` unit test
over a `paginate()` helper — this is pure logic, so it fits the existing
`bun test ./tests` gate perfectly.

## 9b. Composite keyset cursors

Every cursor in the app is **timestamp-only** (`lt(createdAt, cursor)`), which
buzz forbids outright. On a timestamp tie at a page boundary, rows are skipped.

Our `createdAt` columns are `.defaultNow()` → Postgres `now()`, which is
**transaction-scoped**: every row written in one transaction gets the *identical*
timestamp. So ties are guaranteed for any multi-row insert (`assistantMessages`
writes two rows in one statement; `callout.ts` and `trade-fanout.ts` insert
notifications in 500-row chunks) and merely unlikely elsewhere.

⚠️ Honest severity: I could not confirm a *currently firing* instance — the
fan-outs write one row per recipient, so a single user rarely holds two rows
from one transaction. Treat 9b as hardening, not an outage. 9a is the live one.

**Fix:** cursor becomes `(createdAt, id)`, ordering becomes
`ORDER BY created_at DESC, id ASC`, predicate becomes:

```ts
or(lt(t.createdAt, ts), and(eq(t.createdAt, ts), gt(t.id, id)))
```

Encode the cursor as `${iso}|${id}`. ⚠️ Remember the project's `sql` template
rule: pass Dates through `lt()`/`gt()`/`eq()`, **never** interpolate a JS `Date`
into a `` sql`` `` template — it 500s on Workers and works fine locally.

## 9c. One round trip per view (the "channel window")

Buzz serves a channel page as **one** request returning rows + every reaction,
edit and deletion targeting those rows + thread summaries + a bounds event
carrying `next_cursor` and `has_more`. No client-side `#e` fan-out.

`community.getMessages` is already close — it batches reactions and role colors
rather than N+1'ing them — but it's three sequential DB round trips (messages →
reactions → role colors) on a Hyperdrive connection. Fold the reactions and role
colors into the messages query as lateral joins / aggregated subqueries so a
channel open is one trip.

Audit the other timeline-shaped procedures for the same pattern.

## 9d. Materialized counters

Buzz materializes `reply_count` and `descendant_count` onto the thread root at
ingest, so the top-level view never counts at read time; their AGENTS.md makes
it a rule that any code inserting a reply must update them.

Where we count replies/reactions per row at read time, do the same: a counter
column updated in the same transaction as the insert. Cheap write, removes an
aggregate from every read.

## 9e. Bounded caches

Buzz caps every module-level cache (`shared/lib/trimMapToSize.ts`) and recovers
from `QuotaExceededError` on localStorage writes by evicting pure-cache keys and
retrying once (`shared/lib/localStorageQuota.ts`) — because draft and read-state
writes happen inside click handlers, where a throw becomes a broken UI.

Ours that grow without bound: `lib/perps/flash.ts` `referralExists`,
`lib/chains/solana/subscriptions/collector.ts` `signerCache`,
`components/wallet/use-header-wallet.ts` `assetsChannels` (holds Realtime
channels **and** listener sets — the leak-prone one), `lib/feed-autoplay.ts`
`entries` (a `Map` keyed by object; a `WeakMap` would collect).

Port `trimMapToSize`, cap each, and add the quota-recovery wrapper before
Phase 3 starts writing drafts to localStorage.

## 9f. Idle-time mounting

`shared/hooks/useDeferredStartup.ts` — `useDeferredLoad()` gates work behind
`requestIdleCallback` with a 2s timeout fallback, with `immediate: true` when
the content is already in view. Good fit for below-the-fold rails and panels
that currently mount eagerly.

**Done when:** 9a is fixed everywhere with a unit test; cursors are composite;
a channel open is one DB round trip; module caches are bounded.

**Commit:** 9a on its own, immediately — it's a user-visible bug fix and should
not wait behind the rest.

---

---

# Phase 10 — Browser verification (two real accounts)

Unblocked 2026-08-09. `scripts/dev/browser-smoke-community-chat.mjs` drives
**two** signed-in users in one channel via puppeteer-core, on the dev DB.

```bash
bun dev                                          # terminal 1
bun scripts/dev/browser-smoke-community-chat.mjs # terminal 2  (--headed to watch)
```

Fixtures: `bun scripts/dev/mint-test-session.mjs --email e2e-test-2@watchparty.local`
then `bun scripts/dev/seed-test-community.mjs`. Both refuse the production DB.

**It found a dead realtime layer on its first run** (`9fb55b13`): `publishToRoom`
percent-encoded the room name, so the server published to
`community-channel%3A<id>` while every client sat in `community-channel:<id>`.
Different Durable Objects — the worker created the encoded one, accepted the
event, returned 200, and delivered it to nobody. **Every** server→client
realtime publish in the app had been going nowhere.

Three lessons worth keeping:

- **Assert on WebSocket frames, not just the DOM.** "B didn't see it" can't
  distinguish "the server never published" from "the frame arrived and the
  client ignored it" — opposite fixes. The test reads frames over CDP.
- **Count the specific event.** Presence and typing share the connection, so a
  raw frame count says "something arrived" and proves nothing. Filter for
  `message-change`.
- **Take the baseline before the action.** I first captured the frame count
  *after* the send, so the very frame under test landed inside the baseline and
  read as "0 delivered" — which pointed the blame squarely at the server, where
  the bug wasn't. Two measurement bugs of my own before a real one.

### ⚠️ Open: live-update flake

The `message-change` frame arrives on **every** run, but B's UI updates only
about half the time locally within a 20s budget. When it works, the refetch does
fire (one `getMessages` request) and the row renders. So this is downstream of
the routing fix, in the invalidate→refetch→render path.

Suspects, in order: `invalidate({ channelId })` refetches **every** page of the
infinite query by default, which on this machine is slow enough to blow the
budget; a race between the invalidate and the message being visible to the next
read; or dev-server load (two Chrome contexts + Next dev on an 8 GB machine that
swaps). Rerun on a quiet machine before assuming it's app code — but don't
assume it isn't, either.

---

---

# Phase 11 — Container saturation (outage 2026-08-09 ~05:00 UTC)

Site 500'd with *"more than 4096 concurrent connections inbound to the
container"*. Domains rolled back to the plain `watchparty` worker
(`node scripts/cf/attach-domains.mjs`), verified healthy **including a
DB-touching tRPC call** first, per the 2026-08-06 rule. Service restored.

## What the data actually shows

Measured from `workersInvocationsAdaptive` (account-level; the API token
**cannot read zone analytics**, so per-path and per-user-agent breakdowns were
unavailable — see the gap below).

| Window | `watchparty-app` (container) | `watchparty` (plain) |
|---|---|---|
| 03:00 UTC | ~2.0k req/hr (~33/min) | — (no domains) |
| 04:00 UTC | ~47k req/hr, 21k clientDisconnected | — |
| 05:00–05:37 | ~800–1,000/min, heavy clientDisconnected | — |
| 05:39+ (after flip) | 0 | **1,400–5,700/min, all 200** |

The decisive number is the last row. After the flip the plain worker carries
**more** traffic than the container ever did and serves it cleanly. So:

- This was **not** a traffic spike or an attack. The load is real, sustained,
  and still running.
- The container's ~800/min was not its load — it was its **throughput ceiling**.
  It was shedding the rest by failing.

## Mechanism

Concurrency = **arrival rate × latency**. The container's ceiling is 4,096
concurrent connections *per instance* (`INSTANCES = 3` in
`container/src/index.ts`), enforced in Cloudflare's proxy — *before* the request
reaches Next, which is why the whole site 500s at once rather than degrading.

At ~80 req/s with sub-second responses, concurrency sits in the hundreds and
everything is fine. Let latency rise — a slow query, a cold start (measured 4.0s
in `container/src/index.ts`), a DB hiccup — and concurrency rises linearly with
it. `trending.list` measured **3.8s** on a healthy worker today. At 80 req/s a
30s stall is ~2,400 concurrent, and two of those saturate an instance. Then
500s make clients retry, which raises the arrival rate, which raises
concurrency: congestion collapse.

Retry amplification — the documented 2026-08-08 trigger — is **already
mitigated** (`components/react-query-provider.tsx` never retries 4xx and caps
attempts). That is not this.

## ⚠️ Correction: it is NOT the app's polling

An earlier version of this section claimed **~80 requests/min per open tab**,
reasoned by summing the 40 `refetchInterval` values. **That was wrong, and
measurement killed it.**

Measured in a real signed-in browser, steady state, 120s each:

| Page | procedure calls/min |
|---|---|
| `/home` | **4** |
| `/trade` | **8** |

The 40 pollers are spread across components that are mostly **not mounted at
the same time**, so summing their intervals produces a number that has nothing
to do with reality. To reach the observed 1,400–5,700 req/min you would need
roughly 700–1,400 concurrent tabs.

Keep the lesson, not the number: **an estimate assembled from config is not a
measurement.** It was plausible, it pointed at a satisfying culprit, and it was
off by an order of magnitude.

Two real inefficiencies did surface and are still worth fixing, just not as the
outage's cause:

- `components/ui/online-indicator.tsx` calls `user.getOnlineStatus` **per
  user**, so a list of avatars mounts one polling query per row. tRPC's batch
  link merges the simultaneous ones, which is why it doesn't show up in the
  measurements above — but it is still N queries where 1 would do.
- `components/profile/profile-avatar.tsx` (and its `components/video/` twin)
  poll `stream.getByUserId` every 30s **per user**, for a live badge.
- `components/community/space-room.tsx` polls every 5s as an explicit "safety
  net" for missed realtime events. Now that realtime actually delivers
  (Phase 10), that net can be widened a lot.

## Actions

1. **Stay on `watchparty`.** It handles the load cleanly. Do not move domains
   back to the container until the traffic source is understood — the container
   will just saturate again.
2. **Grant the API token `Analytics:Read` on the zone — do this first.** With
   per-path and per-user-agent data, the question below is a five-minute query.
   Without it, it is unanswerable. This is now the top item, not a nice-to-have.
   Fold it into the scheduled token rotation.
3. **Fix the latency multiplier.** `trending.list` measured 3.8s. Since
   concurrency = rate × latency, every slow endpoint is a saturation multiplier
   regardless of where the traffic comes from. Phase 9c applies directly.
4. **Fix the per-row polling** listed above (`online-indicator`,
   `profile-avatar`, `space-room`). Not the outage's cause, but real waste, and
   the realtime fix makes it cheap to do.
5. **Raise `INSTANCES` only as a stopgap.** 3 turned a hard ceiling into a soft
   one on 2026-08-08 and did not prevent this.

## ⚠️ Unresolved — the actual open question

**Where does 1,400–5,700 req/min come from?** Per-tab steady state measures 4–8
calls/min, so the app's own polling does not explain it by three orders of
magnitude. Candidates, none confirmed: genuinely high concurrent usage; crawler
or bot traffic (Bot Fight Mode is deliberately **off** — see CLAUDE.md — and
`ai_bots_protection` only covers AI crawlers); or something retrying off-app.

It also coincides with a deploy of mine at ~03:59, when traffic went from
~33/min to thousands. I traced the pagination change through every branch and
termination is preserved; the memo change strictly reduces work. **No mechanism
found — which is not the same as cleared.** Action 2 is what settles it.

---

---

# Phase 12 — Shared message toolbar (community + DMs)

`components/messages/message-actions.tsx` is now used by **both** community rows
and DM bubbles. Optional actions: pass `onEdit`/`onDelete`/`onTogglePin` and the
control appears; omit it and it doesn't. DMs pass none of the three.

Quick reactions are scoped by `reactionScope` — a community id keeps per-server
frecency separate, `null` is the app-wide bucket DMs share.

What the DM cluster it replaced got wrong, beyond the community list:
- **`opacity-0` with no `pointer-events` guard** — invisible buttons that still
  intercepted clicks.
- Six hardcoded emoji rather than the four you actually use.
- No keyboard path, no touch path.

## ⚠️ The DM path is NOT browser-verified

`/messages?c=<id>` renders the **encryption gate** ("your wallet is the key")
for any account without a provisioned wallet — which every test fixture is. So
the DM bubble and DM composer never mount, and neither the shared toolbar nor
the draft hook could be exercised there.

What IS verified for DMs: tsc clean, and the page mounts with no page errors
after the refactor. What is not: that the toolbar renders correctly on a bubble,
that quick reactions fire, that drafts persist. The code is the same component
and the same hooks already verified on community chat, but that is an argument,
not a measurement — treat it as unverified.

Two ways to close this, in increasing cost: provision a wallet + messaging key
for the fixture in `seed-test-community.mjs`, or add a dev-only bypass to
`EncryptionGate`. Neither is done.

**This also confirms `messages-connect-wallet-gate`:** a perfectly normal
signed-in account cannot reach DMs at all. Two routes exist to a surface that is
unreachable without a wallet nobody is prompted to create at signup.

---

# Order of work

```
Phase 9a Cursor off-by-one            ░ small    no deps      ✅ done 2026-08-08
Phase 0  Motion foundation            ░ small    no deps      ✅ done 2026-08-08
Phase 1  Reduced motion everywhere    ███ large  no deps      needs 0
Phase 2  Shared style constants       ██ medium  no deps      needs 0
Phase 3  Composer UX rules            ██ medium  no deps
Phase 4  CI guards                    ░ small    no deps
Phase 8  Perf harness                 ░ small    +playwright  ← build early for baselines
Phase 5  Rich composer (TipTap)       ████ xl    +tiptap      needs 2, 3
Phase 6  Timeline performance         ███ large  +virtua?     needs 8 for proof
Phase 7  Skeletons & loading          ░ small    no deps      needs 0, 2
```

Phases 0–4 and 8 are safe to do in any order after 0, and none of them can break
production in a way that isn't obvious on the next page load. Phase 5 is the one
that deserves a careful review; Phase 6 is the one that deserves numbers.

# Running notes

Append decisions here as you go — especially anything that surprised you. That's
what makes this document worth more than the plan it started as.

- **2026-08-08** — **Phase 0 done.** `DURATION`/`DISTANCE` in `lib/ease.ts`,
  `--motion-*` mirror in `globals.css`, `hooks/use-reduced-motion.ts`, and the
  reduced-motion floor at the end of `globals.css`.
  - The floor uses `*:not(:where(.motion-keep, .motion-keep *))`. `:where()`
    contributes **zero** specificity, so the selector stays 0,0,0 and any
    class-level `!important` still outranks it — the escape hatch works two
    ways (add `motion-keep`, or write a class rule).
  - First attempt used `revert-layer` to restore authored timing on
    `.motion-keep`. That's wrong: from an unlayered rule it reverts to the **UA**
    value, not the author's. Exclusion via `:not(:where(…))` is the correct
    construction.
  - `.star-loader > svg` keeps its fade under reduced motion, now with
    `!important` so the floor can't freeze it. **A frozen loader reads as a hung
    app** — that judgment call recurs for every spinner.
- **2026-08-08** — User constraint: **Phase 1 is additive.** No retuning or
  replacing existing animations; see the scope block in that phase.
- **2026-08-08** — Plan written. Buzz surveyed at `desktop/src` (1,321 files,
  ~270k LOC). Confirmed our composers are plain textareas; confirmed
  reduced-motion coverage is 32 files against ~160 motion importers, ~442
  `transition-*` users and ~93 `animate-*` users.
