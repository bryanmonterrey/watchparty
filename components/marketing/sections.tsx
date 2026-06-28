import Link from "next/link";
import { cn } from "@/lib/utils";

// Shared marketing section primitives (server components, pure CSS) so every
// marketing page is rich + consistent. Brand: pastel canvas, font-pixel display,
// aggressive rounding. NO gradients — flat solid bands only (Cash App / Phantom
// style): alternate pastel solids + white, with a confident solid-black closing
// block. No gray/black drop shadows (see docs/design-principles.md).

export function MarketingHero({
    eyebrow,
    title,
    sub,
    ctaLabel = "Get started",
    ctaHref = "/login",
    secondaryLabel,
    secondaryHref,
}: {
    eyebrow?: string;
    title: React.ReactNode;
    sub: string;
    ctaLabel?: string;
    ctaHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
}) {
    return (
        <section className="px-6 pt-10 pb-20 sm:pt-16 sm:pb-28">
            <div className="mx-auto w-full max-w-3xl text-center">
                {eyebrow && (
                    <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-black/50">{eyebrow}</p>
                )}
                <h1 className="font-pixel text-4xl leading-[1.05] tracking-tighter text-black sm:text-6xl">
                    {title}
                </h1>
                <p className="mx-auto mt-5 max-w-xl text-lg font-semibold leading-snug text-black/70 sm:text-2xl">
                    {sub}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href={ctaHref}
                        className="rounded-full bg-black px-8 py-4 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                        {ctaLabel}
                    </Link>
                    {secondaryLabel && secondaryHref && (
                        <Link
                            href={secondaryHref}
                            className="rounded-full bg-white px-8 py-4 text-base font-bold text-black ring-1 ring-black/[0.06] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                        >
                            {secondaryLabel}
                        </Link>
                    )}
                </div>
            </div>
        </section>
    );
}

// Solid-band section. Pass a flat surface via `className` (e.g. "bg-white",
// "bg-soft-blue", "bg-pastel-yellow"); default is transparent (inherits the
// page's pastel canvas). Never a gradient.
export function BandSection({
    children,
    className,
    title,
    sub,
}: {
    children?: React.ReactNode;
    className?: string;
    title?: string;
    sub?: string;
}) {
    return (
        <section className={cn("px-6 py-20 sm:py-28", className)}>
            <div className="mx-auto w-full max-w-5xl">
                {title && (
                    <h2 className="font-pixel text-3xl tracking-tighter text-black sm:text-4xl">{title}</h2>
                )}
                {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-black/65">{sub}</p>}
                {children && <div className={cn(title || sub ? "mt-10" : "")}>{children}</div>}
            </div>
        </section>
    );
}

// Numbered "how it works" steps — flat, pixel numerals, no cards/gradients.
export function StepRow({ steps }: { steps: { title: string; body: string }[] }) {
    return (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
                <div key={s.title}>
                    <p className="font-pixel text-3xl tracking-tighter text-black/30">
                        {String(i + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-3 font-pixel text-xl tracking-tighter text-black">{s.title}</p>
                    <p className="mt-2 text-base font-semibold leading-snug text-black/65">{s.body}</p>
                </div>
            ))}
        </div>
    );
}

export function Faq({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
    return (
        <section className={cn("px-6 py-20 sm:py-28", className)}>
            <div className="mx-auto w-full max-w-3xl">
                <h2 className="font-pixel text-3xl tracking-tighter text-black sm:text-4xl">
                    Questions, answered
                </h2>
                <div className="mt-8 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                    {items.map((item) => (
                        <details key={item.q} className="group py-5">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-bold text-black">
                                {item.q}
                                <span className="shrink-0 text-2xl font-light text-black/40 transition-transform duration-200 group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="mt-3 text-base font-semibold leading-snug text-black/65">{item.a}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Confident solid-black closing block (Cash App style) — white pixel headline,
// white pill button. Flat, no gradient.
export function ClosingCta({
    title,
    sub,
    ctaLabel = "Get started",
    ctaHref = "/login",
}: {
    title: string;
    sub?: string;
    ctaLabel?: string;
    ctaHref?: string;
}) {
    return (
        <section className="bg-black px-6 py-24 sm:py-32">
            <div className="mx-auto w-full max-w-2xl text-center">
                <h2 className="font-pixel text-3xl tracking-tighter text-white sm:text-5xl">{title}</h2>
                {sub && <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug text-white/70">{sub}</p>}
                <Link
                    href={ctaHref}
                    className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-black transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                >
                    {ctaLabel}
                </Link>
            </div>
        </section>
    );
}
