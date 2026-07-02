"use client";

import { Children, isValidElement, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";

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
            transition={{ duration: 0.55, delay, ease: EASE_OUT_QUINT }}
        >
            {children}
        </motion.div>
    );
}

// ── Scroll-scrubbed word reveal (Phantom/Linear manifesto pattern) ──────────
// Words brighten one after another as the block moves through the viewport.
// Supports plain strings plus single-level styled <span>s (the dimmed-phrase
// trick), whose classNames are preserved on each word.

type WordToken = { word: string; className?: string };

function tokenize(node: React.ReactNode, className?: string, out: WordToken[] = []): WordToken[] {
    Children.forEach(node, (child) => {
        if (typeof child === "string" || typeof child === "number") {
            for (const word of String(child).split(/\s+/)) {
                if (word) out.push({ word, className });
            }
        } else if (isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
            tokenize(child.props.children, child.props.className ?? className, out);
        }
    });
    return out;
}

function RevealWord({ token, progress, range }: { token: WordToken; progress: MotionValue<number>; range: [number, number] }) {
    const opacity = useTransform(progress, range, [0.16, 1]);
    return (
        <motion.span style={{ opacity }} className={token.className}>
            {token.word}{" "}
        </motion.span>
    );
}

export function WordReveal({ children, className }: { children: React.ReactNode; className?: string }) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLParagraphElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        // Start brightening as the block enters the lower third, finish just
        // above center — the reader's eye and the reveal stay in sync.
        offset: ["start 0.9", "start 0.4"],
    });
    const tokens = tokenize(children);

    if (reduce) {
        return <p className={className}>{children}</p>;
    }
    return (
        <p ref={ref} className={className}>
            {tokens.map((t, i) => (
                <RevealWord
                    key={i}
                    token={t}
                    progress={scrollYProgress}
                    range={[i / tokens.length, Math.min(1, (i + 2) / tokens.length)]}
                />
            ))}
        </p>
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
