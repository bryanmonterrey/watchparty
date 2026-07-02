"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

// Phantom-style card carousel: three cards start STACKED in the center, then a
// pinned scroll SPREADS them out into a 3-up row (scroll-scrubbed). Below lg (and
// under reduced motion) it degrades to a plain stacked row — no pin, no overflow.

// Distance a side card travels from the center stack to its row slot: card width
// (300) + gap (32).
const SPREAD = 332;

type CarouselCard = { tone: string; node: React.ReactNode };

function CardFrame({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                "flex aspect-[3/4] w-[300px] shrink-0 flex-col overflow-hidden rounded-[32px] p-7 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
                tone,
            )}
        >
            {children}
        </div>
    );
}

function AnimatedCard({ p, pos, card }: { p: MotionValue<number>; pos: -1 | 0 | 1; card: CarouselCard }) {
    // At progress 0 the side cards sit ON the center (stacked, smaller, tilted,
    // nudged down); at progress 1 they land in their row slots.
    const x = useTransform(p, [0, 1], [-pos * SPREAD, 0]);
    const y = useTransform(p, [0, 1], [pos === 0 ? 0 : 30, 0]);
    const scale = useTransform(p, [0, 1], [pos === 0 ? 1 : 0.86, 1]);
    const rotate = useTransform(p, [0, 1], [pos * 7, 0]);
    return (
        <motion.div style={{ x, y, scale, rotate, zIndex: pos === 0 ? 30 : 10 }} className="relative">
            <CardFrame tone={card.tone}>{card.node}</CardFrame>
        </motion.div>
    );
}

function Header({ eyebrow, title, sub, dark }: { eyebrow?: string; title: string; sub?: string; dark?: boolean }) {
    return (
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            {eyebrow && (
                <p className={cn("mb-4 font-pixel text-sm uppercase tracking-[0.2em]", dark ? "text-white/45" : "text-black/45")}>{eyebrow}</p>
            )}
            <h2 className={cn("font-extrabold text-3xl leading-[1.05] tracking-tight sm:text-5xl", dark ? "text-white" : "text-black")}>{title}</h2>
            {sub && <p className={cn("mx-auto mt-4 max-w-lg text-lg font-semibold leading-snug", dark ? "text-white/60" : "text-black/60")}>{sub}</p>}
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
    const ref = useRef<HTMLDivElement>(null);
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
    // Finish the spread by ~60% of the pin, then hold.
    const p = useTransform(scrollYProgress, [0, 0.6, 1], [0, 1, 1]);

    // Plain stacked row (mobile + reduced motion): no pin, cards just sit in a row
    // (wrapping on small screens).
    const staticRow = (
        <section className={cn("px-6 py-20 sm:py-28", reduce ? "" : "lg:hidden")}>
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
            {/* Pinned spread — desktop only. */}
            <section ref={ref} className="relative hidden lg:block lg:h-[240vh]">
                <div className="sticky top-0 flex h-svh flex-col items-center justify-center overflow-hidden px-6">
                    <Header eyebrow={eyebrow} title={title} sub={sub} dark={dark} />
                    <div className="relative flex items-center justify-center gap-8">
                        {cards.map((c, i) => (
                            <AnimatedCard key={i} p={p} pos={(i - 1) as -1 | 0 | 1} card={c} />
                        ))}
                    </div>
                </div>
            </section>
            {staticRow}
        </>
    );
}
