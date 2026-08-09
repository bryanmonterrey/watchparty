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

3. **Virtualize** with `virtua` (buzz's choice; `VList` handles reverse/chat
   ordering, which is the hard part) or `@tanstack/react-virtual` if we'd rather
   keep one virtualization dependency with `browse-feed.tsx`. Decide once,
   write it down here.

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

# Order of work

```
Phase 0  Motion foundation            ░ small    no deps      ← start here
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

- **2026-08-08** — Plan written. Buzz surveyed at `desktop/src` (1,321 files,
  ~270k LOC). Confirmed our composers are plain textareas; confirmed
  reduced-motion coverage is 32 files against ~160 motion importers, ~442
  `transition-*` users and ~93 `animate-*` users.
