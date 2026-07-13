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
- **Button heights (the standard — don't restate per button)**: every button
  is **h-11** unless it spans wide; **wide buttons (w-full / flex-1 CTAs) are
  h-12**. The primitives already encode this — `components/ui/button.tsx`
  (`size="default"` = h-11, `size="lg"`/`size="wide"` = h-12) and the settings
  kit's `PillButton` (h-11 default; pass `h-12` with `w-full`/`flex-1`). Never
  hand-set other heights on buttons; compact list-row *chips* (py-1.5 text-12
  actions inside rows) are chips, not buttons, and stay small.

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
- **Depth without gray/black drop shadows** (both references agree). Three ways,
  in order of preference: (1) **inset highlight** for a soft, inflated/glassy
  feel (`shadow-[inset_0_1px_0_rgba(255,255,255,.5)]` on light, `.06` on dark) —
  Rainbow's signature; (2) **brand-tinted ambient glow** — a blurred accent blob
  behind the card or a tinted `shadow-[…]` (Phantom's tinted elevation; already
  used in `components/premium/upgrade-overlay` + `premium-settings`); (3) inner
  hairline in dark mode (`ring-1 ring-white/10`). Never a neutral drop shadow.
- **Color-as-identity feature cards**: a feature card's *fill* can be the signal
  (a pastel or accent surface with the content floating on top), rather than a
  white card with a colored icon. Vary fills across a set; keep one radius.

### Section rhythm (marketing / full-bleed pages)
- Alternate full-bleed **pastel bands** down the page (the reference's
  light→dark→light cadence, in our pastels). Center content at a max width
  (`max-w-5xl`/`max-w-7xl`), generous vertical gaps (`py-28 sm:py-36`; reference
  section gap ≈64px+). One theme per page — bands are tints within it, not a
  light/dark flip mid-scroll.

### Gradient atmosphere (Rainbow takeaway)
- Section backdrops can be **full-bleed soft gradients** (radial anchored
  bottom-center, or a gentle linear sweep) that **dissolve into the pastel
  canvas at one edge** — never a hard color block, never cropped in a small box.
  Build from our pastels/accents (e.g. `soft-blue → soft-pink → background`),
  not Rainbow's literal hues. Keep them quiet; the type and cards lead.

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
