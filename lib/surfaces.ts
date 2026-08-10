/**
 * Shared class strings for floating surfaces.
 *
 * Buzz's trick, and it is a good one: recurring treatments are exported as
 * plain strings and composed with `cn()`, not wrapped in a component. A wrapper
 * fights `asChild`, adds a DOM node, and gets forked the first time somebody
 * needs a variant. A string does none of that.
 *
 * ## What the audit actually found (2026-08-09)
 *
 * The **motion** is duplicated and byte-identical; the **surfaces** are not.
 *
 * `dialog.tsx`, `alert-dialog.tsx` and `sheet.tsx` carry character-for-character
 * the same overlay animation, and `dialog` + `alert-dialog` + `popover` the same
 * content animation. Between them ~66 components import these primitives, so
 * the strings below are the single place that behaviour lives.
 *
 * Their *backgrounds* are deliberately different — `#0C0C0C` for dialog,
 * `#6A6A6A/35` for alert-dialog, `bg-background` for sheet. Those are design
 * decisions somebody made per surface, so there is no honest common denominator
 * to extract and this module does not invent one. Consolidating them would be a
 * restyle wearing a refactor's clothes. If they ever converge, add
 * `*_SURFACE_CLASS` here then.
 *
 * ## Why every motion constant carries its own `motion-reduce:`
 *
 * That is the entire point of centralising them. `app/globals.css` has a global
 * reduced-motion floor, but a floor is a safety net, not an intention — and the
 * moment somebody scopes it, every one of these animations silently starts
 * ignoring the OS setting again. Declaring it next to the animation makes the
 * Phase 1 work permanent instead of something that decays.
 *
 * `animate-none` (rather than a short duration) is safe with Radix: `Presence`
 * reads `getComputedStyle(node).animationName` and unmounts immediately when it
 * is `none`, so an exit animation that never runs cannot strand a node the way
 * a never-firing `animationend` would.
 *
 * ⚠️ Tailwind v4 scans source files for **literal** class strings. Each fragment
 * below is a complete class name inside a string literal, which is what makes
 * composing them with template literals safe. Do not build a class name from
 * pieces (`` `zoom-${n}` ``) — it will not be generated.
 */

/** Radix `data-state` fade, shared by every overlay and content surface. */
const STATE_FADE =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0";

/** The 95% scale that reads as "this arrived" rather than "this appeared". */
const STATE_ZOOM = "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95";

/**
 * Side-aware entry for anchored surfaces: a popover slides *from* its trigger,
 * so the direction is keyed off Radix's `data-side` rather than hardcoded.
 */
const SIDE_SLIDE =
    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

/** Opacity may stay under reduced motion; travel, scale and rotation may not. */
const NO_MOTION = "motion-reduce:animate-none";

/** Full-screen scrim behind a dialog, alert dialog or sheet. */
export const OVERLAY_MOTION_CLASS = `${STATE_FADE} ${NO_MOTION}`;

/** Centred modal content — fade plus the 95% zoom. */
export const MODAL_CONTENT_MOTION_CLASS = `${STATE_FADE} ${STATE_ZOOM} ${NO_MOTION}`;

/** Anchored floating content: popovers, autocompletes, context menus. */
export const POPOVER_MOTION_CLASS = `${STATE_FADE} ${STATE_ZOOM} ${SIDE_SLIDE} ${NO_MOTION}`;
