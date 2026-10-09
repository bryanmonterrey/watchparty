"use client";

import { motion, type SVGMotionProps } from "motion/react";

// STUB. The real file vendors badge SVG paths from a purchased pack
// (RhosGFX "Vector Badges Pro") whose licence forbids redistribution, so it
// lives in the private watchparty-assets repo and is laid over this tree at
// build time (scripts/ci/overlay-private-assets.sh). This stub keeps the same
// exports so a checkout WITHOUT the overlay still type-checks and renders —
// the badge is simply an empty 24×24 box.
export function RibbonWhiteBadge(props: SVGMotionProps<SVGSVGElement>) {
    return <motion.svg viewBox="0 0 24 24" aria-hidden {...props} />;
}
