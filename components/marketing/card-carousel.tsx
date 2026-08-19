"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

// Phantom-style card deck (measured live from phantom.com): cards rest in a
// normal in-flow row — no pinning, the section costs zero extra scroll. The
// INITIAL state pulls every card onto the center as a fanned deck (pure
// translateX, ~25px stagger, leftmost card on top), and a spring with a slight
// overshoot fires ONCE when the row is mostly in view, spreading the deck into
// the row. Phantom's cards: 3:4 portrait, 24px radius, ~32px gap, solid token
// surfaces, all springing together (no stagger delay).

type CarouselCard = { tone: string; node: React.ReactNode };

// ~2% overshoot, settles in well under a second (matches the measured motion).
const SPRING = { type: "spring", stiffness: 90, damping: 15, mass: 1 } as const;

// One slot of travel in card-widths: 100% card + gap, minus the deck stagger,
// ≈ 102% of the card's own width. Percentages keep it correct across the
// responsive card sizes without measuring.
const SLOT_PCT = 102;

function CardFrame({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                "flex aspect-[3/4] w-[300px] shrink-0 flex-col overflow-hidden rounded-[24px] p-7 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] xl:w-[340px]",
                tone,
            )}
        >
            {children}
        </div>
    );
}

function Header({ eyebrow, title, sub, dark }: { eyebrow?: string; title: string; sub?: string; dark?: boolean }) {
    return (
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            {eyebrow && (
                <p className={cn("mb-4 font-pixel text-sm uppercase tracking-[0.2em]", "text-white/45")}>{eyebrow}</p>
            )}
            <h2 className={cn("font-extrabold text-3xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl", "text-white")}>{title}</h2>
            {sub && <p className={cn("mx-auto mt-4 max-w-lg text-lg font-semibold leading-snug", "text-white/60")}>{sub}</p>}
        </Reveal>
    );
}

export function CardCarousel({
    eyebrow,
    title,
    sub,
    cards,
    dark = false,
}: {
    eyebrow?: string;
    title: string;
    sub?: string;
    cards: CarouselCard[];
    dark?: boolean;
}) {
    const reduce = useReducedMotion();
    const center = (cards.length - 1) / 2;

    // Plain row (mobile + reduced motion): cards wrap, revealed with the shared
    // fade-up, no deck.
    const staticRow = (
        <section className={cn("flex min-h-[92svh] flex-col justify-center px-6 py-16", reduce ? "" : "lg:hidden")}>
            <Header eyebrow={eyebrow} title={title} sub={sub} dark={dark} />
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-6">
                {cards.map((c, i) => (
                    <Reveal key={i} delay={i * 0.08}>
                        <CardFrame tone={c.tone}>{c.node}</CardFrame>
                    </Reveal>
                ))}
            </div>
        </section>
    );

    if (reduce) return staticRow;

    return (
        <>
            {/* Deck → row spring, desktop only. */}
            <section className="hidden min-h-[92svh] flex-col justify-center px-6 py-16 lg:flex">
                <Header eyebrow={eyebrow} title={title} sub={sub} dark={dark} />
                <div className="flex items-center justify-center gap-8">
                    {cards.map((c, i) => (
                        <motion.div
                            key={i}
                            initial={{ x: `${(center - i) * SLOT_PCT}%` }}
                            whileInView={{ x: "0%" }}
                            viewport={{ once: true, amount: 0.6 }}
                            transition={SPRING}
                            style={{ zIndex: cards.length - i }}
                            className="relative"
                        >
                            <CardFrame tone={c.tone}>{c.node}</CardFrame>
                        </motion.div>
                    ))}
                </div>
            </section>
            {staticRow}
        </>
    );
}
