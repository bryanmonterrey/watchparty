"use client";

import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { BlackSquareStarIcon, WatchpartyWordmark } from "@/components/icons";
import { Reveal, Parallax } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

// Dark section kit for the developer portal — the marketing kit's anatomy
// (hero split, bento, steps, FAQ, closing block) rebuilt for a SELF-COLOURED
// dark shell, per the X-developer-console reference. House rules hold: flat
// fills + uniform white hairlines for depth (never gradients, never gray drop
// shadows), pills stay rounded-full, and LANTERN is this surface's one accent.
// Everything is fixed-colour on purpose — the portal paints its own background,
// so theme tokens are banned here (the black-on-black lesson in CLAUDE.md).

const BEAT = "flex min-h-[92svh] flex-col justify-center";

export function DevHeader() {
    return (
        <header className="absolute inset-x-0 top-0 z-50">
            <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
                <Link href="/developer" className="flex items-center gap-3">
                    <BlackSquareStarIcon inverted className="size-9" />
                    <WatchpartyWordmark className="h-4 w-auto text-white" />
                    <span className="rounded-full bg-lantern/15 px-2.5 py-1 font-mono text-[11px] font-bold text-lantern">
                        dev
                    </span>
                </Link>
                <nav className="flex items-center gap-2 sm:gap-3">
                    <Link
                        href="/developer/docs"
                        className="rounded-full px-4 py-2 text-sm font-bold text-white/70 transition-colors hover:text-white"
                    >
                        Docs
                    </Link>
                    <Link
                        href="/developer/console"
                        className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                    >
                        Console
                    </Link>
                </nav>
            </div>
        </header>
    );
}

export function DevFooter() {
    return (
        <footer className="border-t border-white/[0.08] px-6 py-10">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <WatchpartyWordmark className="h-4 w-auto text-white/50" />
                    <span className="font-mono text-[11px] font-bold text-white/30">developers</span>
                </div>
                <nav className="flex items-center gap-5 text-sm font-bold text-white/50">
                    <Link href="/developer/docs" className="transition-colors hover:text-white">Docs</Link>
                    <Link href="/developer/console" className="transition-colors hover:text-white">Console</Link>
                    <a href="https://watchparty.xyz" className="transition-colors hover:text-white">watchparty.xyz</a>
                </nav>
            </div>
        </footer>
    );
}

export function DevHero({
    eyebrow,
    title,
    sub,
    ctaLabel,
    ctaHref,
    secondaryLabel,
    secondaryHref,
    visual,
}: {
    eyebrow: string;
    title: React.ReactNode;
    sub: string;
    ctaLabel: string;
    ctaHref: string;
    secondaryLabel?: string;
    secondaryHref?: string;
    visual: React.ReactNode;
}) {
    return (
        <section className="flex min-h-[92svh] flex-col justify-center px-6 py-10">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
                <div>
                    <Reveal y={14}>
                        <p className="mb-4 font-mono text-sm font-bold tracking-[0.18em] text-lantern">{eyebrow}</p>
                    </Reveal>
                    <Reveal y={18} delay={0.06}>
                        <h1 className="text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
                            {title}
                        </h1>
                    </Reveal>
                    <Reveal y={18} delay={0.12}>
                        <p className="mt-6 max-w-md text-lg font-semibold leading-snug text-white/60 sm:text-xl">{sub}</p>
                    </Reveal>
                    <Reveal y={14} delay={0.18} className="mt-10 flex flex-wrap items-center gap-3">
                        <Link
                            href={ctaHref}
                            className="rounded-full bg-white px-8 py-4 text-base font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                        >
                            {ctaLabel}
                        </Link>
                        {secondaryLabel && secondaryHref && (
                            <Link
                                href={secondaryHref}
                                className="rounded-full px-8 py-4 text-base font-bold text-white ring-1 ring-white/15 transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                            >
                                {secondaryLabel}
                            </Link>
                        )}
                    </Reveal>
                </div>
                <Reveal delay={0.22}>
                    <Parallax amount={28}>{visual}</Parallax>
                </Reveal>
            </div>
        </section>
    );
}

export function DevSectionHead({ title, sub }: { title: string; sub?: string }) {
    return (
        <Reveal className="max-w-3xl">
            <h2 className="text-3xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {title}
            </h2>
            {sub && <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-white/55">{sub}</p>}
        </Reveal>
    );
}

export function DevBento({
    title,
    sub,
    items,
}: {
    title: string;
    sub?: string;
    items: { icon: IconSvgElement; title: string; body: string; accent?: boolean; span?: "wide" | "big" }[];
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12")}>
            <div className="mx-auto w-full max-w-6xl">
                <DevSectionHead title={title} sub={sub} />
                <div className="mt-14 grid auto-rows-[176px] grid-cols-2 gap-4 sm:grid-cols-4">
                    {items.map((it, i) => (
                        <Reveal
                            key={it.title}
                            delay={i * 0.05}
                            className={cn(it.span === "big" && "col-span-2 row-span-2", it.span === "wide" && "col-span-2")}
                        >
                            <div
                                className={cn(
                                    "flex h-full flex-col overflow-hidden rounded-[24px] p-6",
                                    it.accent ? "bg-lantern" : "bg-white/[0.04] ring-1 ring-white/10",
                                )}
                            >
                                <span className={cn("grid size-11 place-items-center rounded-2xl", it.accent ? "bg-black/10" : "bg-white/[0.08]")}>
                                    <HugeiconsIcon icon={it.icon} size={24} strokeWidth={1.8} className={it.accent ? "text-black" : "text-lantern"} />
                                </span>
                                <p className={cn("mt-auto pt-5 text-lg font-extrabold tracking-tight", it.accent ? "text-black" : "text-white")}>{it.title}</p>
                                <p className={cn("mt-1 text-[15px] font-semibold leading-snug", it.accent ? "text-black/60" : "text-white/55")}>{it.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function DevTwoUp({
    items,
}: {
    items: { title: string; body: string; visual?: React.ReactNode; accent?: boolean }[];
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12")}>
            <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
                {items.map((it, i) => (
                    <Reveal key={it.title} delay={i * 0.08}>
                        <div
                            className={cn(
                                "flex h-full flex-col justify-between overflow-hidden rounded-[32px] p-8 sm:p-10",
                                it.accent ? "bg-lantern" : "bg-white/[0.04] ring-1 ring-white/10",
                            )}
                        >
                            <div>
                                <p className={cn("text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl", it.accent ? "text-black" : "text-white")}>
                                    {it.title}
                                </p>
                                <p className={cn("mt-3 max-w-sm text-[15px] font-semibold leading-snug", it.accent ? "text-black/60" : "text-white/55")}>
                                    {it.body}
                                </p>
                            </div>
                            {it.visual && <div className="mt-8">{it.visual}</div>}
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

export function DevSteps({ title, steps }: { title: string; steps: { title: string; body: string }[] }) {
    return (
        <section className={cn(BEAT, "px-6 py-12")}>
            <div className="mx-auto w-full max-w-6xl">
                <DevSectionHead title={title} />
                <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-3">
                    {steps.map((s, i) => (
                        <Reveal key={s.title} delay={i * 0.08}>
                            <div className="border-t-2 border-white/10 pt-5">
                                <span className="font-mono text-5xl font-bold leading-none tracking-tighter text-lantern/30 sm:text-6xl">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <p className="mt-4 text-xl font-extrabold tracking-tight text-white">{s.title}</p>
                                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white/55">{s.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function DevFaq({ items }: { items: { q: string; a: string }[] }) {
    return (
        <section className="flex min-h-[75svh] flex-col justify-center px-6 py-12">
            <div className="mx-auto w-full max-w-3xl">
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">Questions, answered</h2>
                <div className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                    {items.map((item) => (
                        <details key={item.q} className="group py-5">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-bold text-white">
                                {item.q}
                                <span className="shrink-0 text-2xl font-light text-white/40 transition-transform duration-200 group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="mt-3 text-base font-semibold leading-snug text-white/60">{item.a}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function DevClosing({
    title,
    sub,
    ctaLabel,
    ctaHref,
    tiles,
}: {
    title: string;
    sub?: string;
    ctaLabel: string;
    ctaHref: string;
    tiles: { title: string; body: string }[];
}) {
    // The lantern moment — the portal's single full-accent block, closing the
    // page the way the marketing pages close on solid black.
    return (
        <section className="flex min-h-[85svh] flex-col justify-center px-4 py-12 sm:px-6">
            <Reveal className="mx-auto w-full max-w-6xl">
                <div className="flex min-h-[70svh] flex-col justify-center overflow-hidden rounded-[40px] bg-lantern px-6 py-16 sm:px-12 sm:py-20">
                    <h2 className="max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight text-black sm:text-6xl">{title}</h2>
                    {sub && <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-black/60">{sub}</p>}
                    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {tiles.map((t, i) => (
                            <Reveal key={t.title} delay={i * 0.06}>
                                <div className="h-full rounded-2xl bg-black/[0.06] p-6">
                                    <p className="text-xl font-extrabold tracking-tight text-black">{t.title}</p>
                                    <p className="mt-2 text-sm font-semibold leading-snug text-black/55">{t.body}</p>
                                </div>
                            </Reveal>
                        ))}
                        <Reveal delay={tiles.length * 0.06}>
                            <Link
                                href={ctaHref}
                                className="group flex h-full flex-col justify-between rounded-2xl bg-black p-6 text-white transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.98]"
                            >
                                <p className="text-xl font-extrabold tracking-tight">{ctaLabel}</p>
                                <span className="mt-8 inline-flex size-10 items-center justify-center rounded-full bg-white/10">
                                    <HugeiconsIcon icon={ArrowRight01Icon} size={20} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </Reveal>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
