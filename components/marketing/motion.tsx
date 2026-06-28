"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

// Marketing motion primitives. Per web-animation-design: entrances use ease-out,
// animate transform/opacity only, fire once on scroll, and fully collapse under
// prefers-reduced-motion. Marketing is allowed slightly longer durations.

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

// Fade + rise as the element scrolls into view (once). `delay` staggers grids.
export function Reveal({
    children,
    delay = 0,
    y = 24,
    className,
}: {
    children: React.ReactNode;
    delay?: number;
    y?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            className={className}
            initial={reduce ? false : { opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay, ease: EASE_OUT_QUINT }}
        >
            {children}
        </motion.div>
    );
}

// Subtle parallax drift tied to scroll progress (hero visuals). `amount` = px of
// travel across the viewport. Disabled under reduced motion.
export function Parallax({
    children,
    amount = 40,
    className,
}: {
    children: React.ReactNode;
    amount?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    });
    const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
    return (
        <div ref={ref} className={className}>
            <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
        </div>
    );
}
