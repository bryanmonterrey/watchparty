"use client";

import { SmoothCorners } from "@lisse/react";
import type { ComponentProps } from "react";

/** Per-corner radii. Any corner left out is square. */
export type SquircleCorners = {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
};

// Squircle (smooth corners) via Lisse — clip-path based, so it works in Safari
// (unlike the CSS `corner-shape` property). Use `asChild` to apply to an existing
// element (button/input/div); do NOT also add `rounded-*` (redundant under clip-path).
//
// `radius` takes a number for all four corners, or an object for a subset —
// `{ topLeft: 16, topRight: 16 }` rounds the top and squares the bottom, which is
// what stacking two of these into one continuous panel needs.
export function Squircle({
  radius,
  smoothing = 0.6,
  ...props
}: Omit<ComponentProps<typeof SmoothCorners>, "corners"> & {
  radius: number | SquircleCorners;
  smoothing?: number;
}) {
  // Per-corner: every corner is named explicitly, defaulting to 0. Lisse treats
  // an omitted corner as square anyway, but spelling it out means a typo'd key
  // reads as square rather than silently inheriting something else.
  const corners =
    typeof radius === "number"
      ? { radius, smoothing }
      : {
          topLeft: { radius: radius.topLeft ?? 0, smoothing },
          topRight: { radius: radius.topRight ?? 0, smoothing },
          bottomRight: { radius: radius.bottomRight ?? 0, smoothing },
          bottomLeft: { radius: radius.bottomLeft ?? 0, smoothing },
        };

  return <SmoothCorners corners={corners} {...props} />;
}
