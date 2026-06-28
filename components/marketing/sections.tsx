import Link from "next/link";
import { cn } from "@/lib/utils";

// Marketing section kit — Cash App-shaped: big LEFT-aligned pixel headlines,
// asymmetric splits (text one side, image panel the other), full-bleed SOLID
// bands (no gradients), pill CTAs. Image panels are tasteful placeholders sized
// for real app mockups dropped in later. See docs/design-principles.md.

// Rounded placeholder panel where a real product mockup (phone screen / render)
// will go. Solid-fill, aggressive radius, with a phone-shaped inner frame.
export function ShowcasePanel({
    tone = "bg-soft-blue",
    label = "App preview",
    className,
}: {
    tone?: string;
    label?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[32px]",
                tone,
                className,
            )}
        >
            {/* phone silhouette — swap this block for a real <img> mockup */}
            <div className="grid aspect-[9/19] h-[82%] place-items-center rounded-[2rem] bg-black/[0.04] ring-1 ring-black/10">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/30">{label}</span>
            </div>
        </div>
    );
}

export function MarketingHero({
    eyebrow,
    title,
    sub,
    ctaLabel = "Get started",
    ctaHref = "/login",
    secondaryLabel,
    secondaryHref,
    panelTone = "bg-soft-blue",
    panelLabel,
}: {
    eyebrow?: string;
    title: React.ReactNode;
    sub: string;
    ctaLabel?: string;
    ctaHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
    panelTone?: string;
    panelLabel?: string;
}) {
    return (
        <section className="px-6 pt-6 pb-16 sm:pb-24">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
                <div>
                    {eyebrow && (
                        <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-black/50">{eyebrow}</p>
                    )}
                    <h1 className="font-pixel text-4xl leading-[1.05] tracking-tighter text-black sm:text-6xl lg:text-7xl">
                        {title}
                    </h1>
                    <p className="mt-5 max-w-md text-lg font-semibold leading-snug text-black/70 sm:text-xl">
                        {sub}
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link
                            href={ctaHref}
                            className="rounded-full bg-black px-8 py-4 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                        >
                            {ctaLabel}
                        </Link>
                        {secondaryLabel && secondaryHref && (
                            <Link
                                href={secondaryHref}
                                className="rounded-full bg-white px-8 py-4 text-base font-bold text-black ring-1 ring-black/[0.08] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                            >
                                {secondaryLabel}
                            </Link>
                        )}
                    </div>
                </div>
                <ShowcasePanel tone={panelTone} label={panelLabel} />
            </div>
        </section>
    );
}

// Asymmetric text + panel split. Alternate `reverse` down the page for rhythm.
export function ShowcaseRow({
    title,
    body,
    ctaLabel,
    ctaHref,
    panelTone = "bg-soft-pink",
    panelLabel,
    reverse = false,
    className,
}: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
    panelTone?: string;
    panelLabel?: string;
    reverse?: boolean;
    className?: string;
}) {
    return (
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
                <div className={cn(reverse && "lg:order-2")}>
                    <h2 className="font-pixel text-3xl leading-[1.08] tracking-tighter text-black sm:text-5xl">
                        {title}
                    </h2>
                    <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-black/65">{body}</p>
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className="mt-7 inline-block rounded-full bg-black px-7 py-3.5 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </div>
                <ShowcasePanel tone={panelTone} label={panelLabel} className={cn(reverse && "lg:order-1")} />
            </div>
        </section>
    );
}

// Solid-band section (flat surface via className), for a feature grid etc.
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
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto w-full max-w-6xl">
                {title && (
                    <h2 className="font-pixel text-3xl tracking-tighter text-black sm:text-5xl">{title}</h2>
                )}
                {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-black/65">{sub}</p>}
                {children && <div className={cn(title || sub ? "mt-10" : "")}>{children}</div>}
            </div>
        </section>
    );
}

export function Faq({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
    return (
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto w-full max-w-3xl">
                <h2 className="font-pixel text-3xl tracking-tighter text-black sm:text-5xl">
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

// Confident solid-black closing block (Cash App style), left-aligned big.
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
        <section className="bg-black px-6 py-20 sm:py-28">
            <div className="mx-auto w-full max-w-6xl">
                <h2 className="font-pixel text-4xl leading-[1.05] tracking-tighter text-white sm:text-6xl">{title}</h2>
                {sub && <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-white/70">{sub}</p>}
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
