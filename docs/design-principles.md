# watchparty — design principles

The canonical design reference. **Borrow patterns, keep the brand.** We study
references for *structure, interaction, and rhythm*, then express them in
watchparty's own identity. Never paste a reference's literal identity (Phantom's
violet/ghost/whisper-light font; Rainbow's tangerine/hot-pink/SF-Pro) onto
watchparty — that's what the brand section locks.

References (in `docs/references/`, named by what they exemplify):
- `design-cards-phantom.md` — card-forward layouts, scroll animation, brand-tinted
  elevation, alternating light/dark section rhythm.
- `design-gradients-rainbow.md` — full-bleed pastel gradient atmospheres,
  aggressive rounding, depth from inset highlights (not drop shadows),
  color-as-identity feature cards.

> Status: synthesized from the Phantom + Rainbow references + the existing brand
> tokens. Extensible — as more `docs/references/*.md` are added, fold their
> *patterns* (not their palettes) into the sections below.
>
> Two signals appear in BOTH references, so treat them as load-bearing:
> **aggressive rounding** and **never gray/black drop shadows**.

---

## 1. The brand (do not drift from this)

- **Palette is watchparty's own** — pastel canvases + a small set of brand accents.
  Reference palettes inform *contrast/rhythm*, never the actual hex.
  - Canvas pastels (marketing/full-bleed bands): `bg-soft-pink`, `bg-soft-blue`,
    `bg-pastel-yellow`, `bg-soft-gray`.
  - App surfaces (theme-aware): `bg-background`, `bg-card`, `bg-muted`,
    `text-foreground`, `text-muted-foreground`, `border`, `ring` — these flip
    for light/dark via next-themes. Use these in-app, not raw hex.
  - Accents (one per surface, used sparingly): `pastelred` (#FF746C), `lantern`
    (#00ED89), `paramount`/`twitter` (blue), `sunset` (#FFCC00), `red2`.
- **Type is watchparty's own**: `font-pixel` (Geist Pixel) for display/marketing
  moments; `font-sans` (Geist) for everything else. We are NOT whisper-light —
  pixel display is the signature. Borrow the reference's *tight tracking and
  large, calm display sizing* (`tracking-tighter`, big sizes), not its weight.
- **Shape**: pills stay `rounded-full` (Connect Wallet, Complete, Create — no
  Squircle). Cards/panels use **Lisse squircle** via `components/ui/squircle.tsx`
  (`<Squircle asChild radius={20}>…`) — do NOT also add `rounded-*` to a
  squircled element. Pick one radius scale per surface and hold it.
- **Button heights (the standard — don't restate per button)**: the longer a
  button runs, the taller it gets. **h-11** default → **h-12** wide (w-full /
  flex-1 CTAs in forms and panels) → **h-18 hero** (the full-width CTA in a
  big ceremonial dialog: onboarding, upgrade, crop). The primitives encode
  this — `components/ui/button.tsx` (`size="default"` = h-11, `size="lg"`/
  `size="wide"` = h-12, `size="hero"` = h-18 w-full 16px bold) and the
  settings kit's `PillButton` (h-11 default; pass `h-12` with `w-full`/
  `flex-1`). Never hand-set other heights on buttons; compact list-row
  *chips* (py-1.5 text-12 actions inside rows) are chips, not buttons, and
  stay small.

## 1.2 Controls (dropdowns, search bars) — encoded, don't restyle per surface

Owner call 2026-07-22 ("the dropdowns all over my app all have different
styles"): control styling is ENCODED in the primitives — never hand-roll a
variant on a new surface.

- **Dropdowns**: always `GooDropdown`. Build every row with **`gooMenuItem()`**
  (exported from `components/ui/goo-dropdown.tsx`) — 44px (h-11) rounded-full
  rows, `text-base font-bold`, zinc-200→white, danger = red-500/red-500/10,
  optional `icon` node + `right` slot (checkmark/count). Panel: component
  defaults (radius 24, itemHeight 44) + `fill={GOO_PANEL_FILL}`. Pill triggers
  use **`GOO_TRIGGER_PILL`** (h-11). Sort-style triggers use the
  **`MenuTwoLineIcon`** glyph (owner call — never `Sorting01Icon`).
- **Search bars**: every search input is **`h-[52px]`** (the global search
  bar's height, `components/app-ui/global-search.tsx`) — rounded-full,
  icon left-4, `text-[16px] font-medium`, placeholder zinc-400.
- **Buttons**: §1 heights (h-11 default / h-12 wide / h-18 hero) apply to
  filter-rail rows, pill options, and menu rows too — not just `<Button>`.

## 1.5 Learnings from real reference sites (screenshotted 2026-06-28)

Captured Cash App (cash.app) + Phantom (phantom.com) live and studied them:

- **Cash App**: huge LEFT-aligned headlines (the headline is the biggest thing
  on screen); asymmetric splits (text one side, big product visual the other);
  image-first heroes (phone mockups, glossy 3D renders); full-bleed SOLID color
  blocks (black hero, white, solid sky-blue) — no gradients; pill buttons, one
  accent (green); rounded image panels (~28-32px).
- **Phantom**: floating PILL nav (rounded capsule, not a full-width bar); big
  rounded-friendly headlines, often CENTERED, with the mascot dropped INLINE in
  the headline; a giant rounded hero panel with art inside; full-bleed SOLID
  color sections (e.g. whole-page violet) — no gradients; aggressive rounding +
  pills everywhere.

**Applied to watchparty marketing** (`components/marketing/sections.tsx`): big
left-aligned `font-pixel` headlines, asymmetric `ShowcaseRow` splits with rounded
`ShowcasePanel` placeholders (sized for real app mockups), solid bands, solid-
black closing block, pill CTAs. Heroes are light (the shared SiteHeader's black
buttons need a light bg); the black moment is the closing CTA.

**Worth borrowing next**: inline brand mark in a headline (Phantom), real
product imagery in the panels (both) — drop real app screenshots into
`ShowcasePanel`, "Explore more" cross-link card row + stats closing band
(Cash App).

**Explicitly NOT borrowing**: Phantom's **floating pill nav** — user vetoed it.
Keep watchparty's existing SiteHeader (logo + Log in + menu), do not convert the
nav into a rounded capsule.

## 2. Patterns we borrow (the Phantom takeaways)

### Card-forward layouts
- Content lives in **cards/panels**, not dense rows, when elevation communicates
  hierarchy. Squircle corners, generous interior padding (≈`p-6`/`p-8`,
  reference card padding is 32px), one clear focal element per card.
- **Depth without gray/black drop shadows** (both references agree) — and, per
  user rule (2026-07-13), **without inset top highlights or blurred glow blobs
  in-app either**: on dark app surfaces the 1px inset highlight reads as a stray
  border-t and a blurred accent blob reads as a gradient. In-app depth = flat
  fill + **uniform inner hairline** (`ring-1 ring-white/10`) only. Never a
  neutral drop shadow. (Marketing pages may still use tinted elevation.)
- **Color-as-identity feature cards**: a feature card's *fill* can be the signal
  (a pastel or accent surface with the content floating on top), rather than a
  white card with a colored icon. Vary fills across a set; keep one radius.

### Section rhythm (marketing / full-bleed pages)
- Alternate full-bleed **pastel bands** down the page (the reference's
  light→dark→light cadence, in our pastels). Center content at a max width
  (`max-w-5xl`/`max-w-7xl`), generous vertical gaps (`py-28 sm:py-36`; reference
  section gap ≈64px+). One theme per page — bands are tints within it, not a
  light/dark flip mid-scroll.

### Gradient atmosphere (Rainbow takeaway) — RETIRED
- **No gradients, ever** (user rule, 2026-07-13 — supersedes the Rainbow
  takeaway below). Surfaces are flat fills; in-app depth is a uniform inner
  hairline only (see §2 Card-forward) — never `bg-gradient-*`, and blurred
  accent blobs count as gradients too.
- ~~Section backdrops can be full-bleed soft gradients that dissolve into the
  pastel canvas at one edge — build from our pastels/accents, keep them
  quiet.~~ Use solid pastel bands instead (the Cash App / Phantom pattern in
  §1.5 — both references actually use SOLID blocks, no gradients).

### Motion: scroll animation is a first-class pattern
- **Entrance reveals on scroll**: `motion/react` `whileInView` (once, `amount:
  0.3`) or the existing `TextAnimate` / `BlurInImage` marketing primitives.
- **Pinned/scroll-driven hero moments**: the goggles-zoom (`components/marketing/
  goggles-zoom.tsx`) is the reference-grade example — GSAP pin + scrub + snap.
  Reuse this class of effect for flagship moments, not every section.
- **Card interaction**: subtle hover lift/scale (`hover:scale-[1.02]`,
  `group-hover` image `scale-105`) and tactile `:active` (`active:scale-95`).
- **Always** gate motion on `prefers-reduced-motion` (`useReducedMotion()` /
  the reduced-motion CSS branch). Animate only `transform`/`opacity`.

### Spacing & calm
- Comfortable density. Big calm display type + whitespace do the work; avoid
  cramming. Reference base unit 4px → our spacing already aligns to Tailwind's.

## 3. In-app vs marketing

- **Marketing (`app/page.tsx`)**: full expression — pastel bands, `font-pixel`
  display, scroll choreography, big imagery.
- **Authenticated app (`(app)/`)**: same *principles* (cards, squircle,
  brand-tinted elevation, restrained motion, one accent per surface) but through
  the theme tokens (`card`/`muted`/`border`) so light+dark both hold. Model new
  UI on the polished upgrade-overlay aesthetic, **not** the settings page.

## 4. Do / Don't

**Do**
- Map reference *patterns* onto watchparty tokens; keep pastels + `font-pixel`.
- Squircle cards; `rounded-full` pills; one radius scale per surface.
- Tint elevation to the brand/surface; prefer ambient glow or inner hairline.
- Reveal content on scroll; add hover/active feedback to interactive cards.
- One accent color per surface; lock it across the whole view.

**Don't**
- Don't import a reference's identity (no violet/ghost/Phantom-font on watchparty).
- Don't use gray/black drop shadows.
- Don't add `rounded-*` to a squircled element, or Squircle a pill.
- Don't flip light↔dark mid-page; bands are tints within one theme.
- Don't animate `width`/`height`/`top`/`left`, or ship motion without a
  reduced-motion fallback.
