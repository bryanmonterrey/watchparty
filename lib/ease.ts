export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** CSS string form of EASE_OUT for inline style transitions. */
export const EASE_OUT_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * Durations, in SECONDS — the unit motion/framer-motion `transition` takes.
 * Four steps, ordered by how much of the screen the change owns: direct
 * feedback → a control changing state → a surface arriving → a new object
 * settling into a list. Reach for the smallest one that reads.
 *
 * The CSS mirror of these lives in `app/globals.css` as
 * `--motion-duration-*` (in ms). Change both or neither.
 */
export const DURATION = {
    /** Press, hover, active — the user's own finger. */
    instant: 0.12,
    /** Toggles, icon swaps, tooltips. */
    fast: 0.18,
    /** Panels, popovers, tabs — a surface changing state. */
    standard: 0.24,
    /** A new object settling into a list. The only one that reads as motion. */
    arrival: 0.5,
} as const;

/**
 * Travel distances, in PIXELS. Deliberately short: motion here supports
 * hierarchy, it isn't the point. Anything further than `arrival` should be a
 * layout animation, not a translate.
 */
export const DISTANCE = {
    /** Hover lift, micro-shift, a control acknowledging the pointer. */
    nudge: 4,
    /** New content rising into place. */
    arrival: 12,
} as const;

/** Press feedback on buttons and other tappable surfaces. */
export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;

/** Content swaps — label/icon slots trading places inside a control. */
export const SPRING_SWAP = {
  type: "spring",
  stiffness: 460,
  damping: 30,
  mass: 0.55,
} as const;

/** Overlay panel entrances — modals and sheets summoned by pointer. */
export const SPRING_PANEL = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 0.5,
} as const;

/** Shared-layout glides — pills, indicators and panels morphing between positions. */
export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

/** Cursor-follow physics for decorative mouse tracking (magnetic, tilt, dock). */
export const SPRING_MOUSE = {
  stiffness: 200,
  damping: 15,
  mass: 0.3,
} as const;

/** Dragged handles and fills (sliders) — critically damped `useSpring` config,
 * so the value follows the pointer butterily and never rebounds off an end. */
export const SPRING_GLIDE = {
  stiffness: 700,
  damping: 50,
  mass: 0.5,
} as const;
