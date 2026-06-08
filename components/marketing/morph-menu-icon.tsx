"use client";

import { useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(MorphSVGPlugin);

// Hamburger bars (the resting state)…
const TOP = "M4 5L20 5";
const MID = "M4 12L20 12";
const BOT = "M4 19L20 19";
// …morph targets: top bar -> ╲ diagonal, bottom bar -> ╱ diagonal (middle fades).
const TOP_TO_X = "M6 6L18 18";
const BOT_TO_X = "M6 18L18 6";

type MorphMenuIconProps = {
  open: boolean;
  className?: string;
};

/**
 * Hamburger ⇄ X, morphed with GSAP MorphSVGPlugin. The top and bottom bars
 * path-morph into the X's diagonals while the middle bar collapses.
 */
export function MorphMenuIcon({ open, className }: MorphMenuIconProps) {
  const root = useRef<SVGSVGElement>(null);
  const top = useRef<SVGPathElement>(null);
  const mid = useRef<SVGPathElement>(null);
  const bot = useRef<SVGPathElement>(null);

  useGSAP(
    () => {
      const t = top.current;
      const m = mid.current;
      const b = bot.current;
      if (!t || !m || !b) return;

      const duration = 0.4;
      const ease = "power3.inOut";
      gsap.to(t, { morphSVG: open ? TOP_TO_X : TOP, duration, ease, overwrite: true });
      gsap.to(b, { morphSVG: open ? BOT_TO_X : BOT, duration, ease, overwrite: true });
      gsap.to(m, {
        opacity: open ? 0 : 1,
        scaleX: open ? 0 : 1,
        transformOrigin: "50% 50%",
        duration: open ? duration * 0.5 : duration,
        ease,
        overwrite: true,
      });
    },
    { dependencies: [open], scope: root },
  );

  return (
    <svg
      ref={root}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path ref={top} d={TOP} />
      <path ref={mid} d={MID} />
      <path ref={bot} d={BOT} />
    </svg>
  );
}
