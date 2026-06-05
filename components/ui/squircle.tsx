"use client";

import { SmoothCorners } from "@lisse/react";
import type { ComponentProps } from "react";

// Squircle (smooth corners) via Lisse — clip-path based, so it works in Safari
// (unlike the CSS `corner-shape` property). Use `asChild` to apply to an existing
// element (button/input/div); do NOT also add `rounded-*` (redundant under clip-path).
export function Squircle({
  radius,
  smoothing = 0.6,
  ...props
}: Omit<ComponentProps<typeof SmoothCorners>, "corners"> & {
  radius: number;
  smoothing?: number;
}) {
  return <SmoothCorners corners={{ radius, smoothing }} {...props} />;
}
