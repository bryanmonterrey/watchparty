"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Makes every `motion.*` component in the tree respect "Reduce motion".
 *
 * ## Why this replaces a 160-file sweep
 *
 * Phase 1 of docs/buzz-adoption-plan.md budgeted for touching ~160
 * motion/framer-motion importers by hand, adding a `reduced ?` branch to each.
 * The library already implements exactly the policy that plan describes.
 *
 * `reducedMotion="user"` reads `prefers-reduced-motion` and disables **transform
 * and layout** animations — x, y, scale, rotate — while letting **opacity and
 * colour** through. The plan's own rule of thumb is "opacity may stay, movement
 * goes", because a cross-fade is not what makes people sick; translation, scale,
 * parallax and rotation are. Same rule, one provider, no per-file diff to keep
 * correct.
 *
 * It also covers what the CSS floor in `globals.css` structurally cannot.
 * `animation-duration: 1ms !important` reaches CSS animations and transitions;
 * framer-motion interpolates INLINE STYLES on every frame, so a 1ms transition
 * on a value being rewritten 60 times a second changes nothing. This is the half
 * of Phase 1 that actually needed doing.
 *
 * ## One instance, on purpose
 *
 * MotionConfig only reaches components from the same package instance. This app
 * imports from BOTH `framer-motion` (57 files) and `motion` (99) — but `motion`
 * depends on `framer-motion@^12.43.0`, both resolve to 12.43.0, and there is no
 * nested copy under `node_modules/motion`, so they are one hoisted instance and
 * one provider covers all 156. ⚠️ If those versions ever diverge enough to
 * nest, this silently stops covering the `motion` importers — nothing will warn.
 *
 * Mounted per route group rather than in the root layout, which stays light by
 * design (fonts, theme, analytics only — see CLAUDE.md's speed rule).
 */
export function MotionConfigProvider({ children }: { children: ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
