import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { MARKETING_FEATURES } from "./nav-data";

// Marketing section kit — Cash App-shaped: big LEFT-aligned Geist headlines
// (font-pixel is the small accent on eyebrows + the logo, not the headlines, for
// legibility at scale); asymmetric splits (text one side, image panel the
// other); full-bleed SOLID bands (no gradients); pill CTAs. Image panels are
// placeholders sized for real app mockups dropped in later. See
// docs/design-principles.md.

// Rounded placeholder panel where a real product mockup (phone screen / render)
// will go. Solid-fill, aggressive radius, with a phone-shaped inner frame.
export function ShowcasePanel({
    tone = "bg-soft-blue",
    label = "App preview",
    icon,
    className,
}: {
    tone?: string;
    label?: string;
    icon?: IconSvgElement;
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
            <div className="flex aspect-[9/19] h-[82%] flex-col items-center justify-center gap-3 rounded-[2rem] bg-black/[0.04] ring-1 ring-black/10">
                {icon && <HugeiconsIcon icon={icon} size={48} strokeWidth={1.6} className="text-black/25" />}
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
    panelIcon,
    visual,
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
    panelIcon?: IconSvgElement;
    visual?: React.ReactNode;
}) {
    return (
        <section className="px-6 pt-6 pb-16 sm:pb-24">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
                <div>
                    {eyebrow && (
                        <p className="mb-4 font-pixel text-sm uppercase tracking-[0.2em] text-black/50">{eyebrow}</p>
                    )}
                    <h1 className="font-extrabold text-4xl leading-[1.05] tracking-tight text-black sm:text-6xl lg:text-7xl">
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
                {visual ?? <ShowcasePanel tone={panelTone} label={panelLabel} icon={panelIcon} />}
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
    panelIcon,
    reverse = false,
    className,
}: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
    panelTone?: string;
    panelLabel?: string;
    panelIcon?: IconSvgElement;
    reverse?: boolean;
    className?: string;
}) {
    return (
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
                <div className={cn(reverse && "lg:order-2")}>
                    <h2 className="font-extrabold text-3xl leading-[1.08] tracking-tight text-black sm:text-5xl">
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
                <ShowcasePanel tone={panelTone} label={panelLabel} icon={panelIcon} className={cn(reverse && "lg:order-1")} />
            </div>
        </section>
    );
}

// Bold full-bleed block (Cash App's "green section" energy): a strong solid
// color band with a headline/CTA on one side and a content visual on the other.
// Dark or accent; breaks up the page rhythm.
export function BoldBlock({
    title,
    body,
    ctaLabel,
    ctaHref,
    visual,
    tone = "bg-black",
    dark = true,
    reverse = false,
}: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
    visual: React.ReactNode;
    tone?: string;
    dark?: boolean;
    reverse?: boolean;
}) {
    return (
        <section className={cn("px-6 py-16 sm:py-24", tone)}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
                <div className={cn(reverse && "lg:order-2")}>
                    <h2 className={cn("font-extrabold text-3xl leading-[1.08] tracking-tight sm:text-5xl", dark ? "text-white" : "text-black")}>
                        {title}
                    </h2>
                    <p className={cn("mt-4 max-w-md text-lg font-semibold leading-snug", dark ? "text-white/70" : "text-black/70")}>{body}</p>
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className={cn(
                                "mt-7 inline-block rounded-full px-7 py-3.5 text-base font-bold transition-transform duration-200 hover:scale-[1.03] active:scale-95",
                                dark ? "bg-white text-black" : "bg-black text-white",
                            )}
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </div>
                <div className={cn("flex justify-center", reverse && "lg:order-1")}>{visual}</div>
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
                    <h2 className="font-extrabold text-3xl tracking-tight text-black sm:text-5xl">{title}</h2>
                )}
                {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-black/65">{sub}</p>}
                {children && <div className={cn(title || sub ? "mt-10" : "")}>{children}</div>}
            </div>
        </section>
    );
}

// "Explore more" cross-link row (Cash App pattern) — cards linking to the other
// feature pages, pulled from the central MARKETING_FEATURES (current page
// excluded). Keeps the marketing site interlinked.
export function ExploreMore({ currentHref, className }: { currentHref: string; className?: string }) {
    const links = MARKETING_FEATURES.filter((f) => f.href !== currentHref).slice(0, 3);
    return (
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto w-full max-w-6xl">
                <h2 className="font-extrabold text-3xl tracking-tight text-black sm:text-5xl">Explore more</h2>
                <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {links.map((f) => (
                        <Link
                            key={f.href}
                            href={f.href}
                            className="group flex flex-col rounded-2xl bg-white p-6 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-transform duration-200 ease-out hover:-translate-y-1"
                        >
                            <span className={cn("mb-4 grid size-10 place-items-center rounded-xl bg-current/10", f.tone)}>
                                <HugeiconsIcon icon={f.icon} size={22} strokeWidth={1.8} className={f.tone} />
                            </span>
                            <p className="text-lg font-bold tracking-tight text-black">{f.title}</p>
                            <p className="mt-1 flex-1 text-sm font-semibold leading-snug text-black/65">{f.blurb}</p>
                            <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-black">
                                Learn more
                                <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2.2} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function Faq({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
    return (
        <section className={cn("px-6 py-16 sm:py-24", className)}>
            <div className="mx-auto w-full max-w-3xl">
                <h2 className="font-extrabold text-3xl tracking-tight text-black sm:text-5xl">
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
// Confident solid-black closing block (Cash App style). Optional honest value
// tiles (NOT fake metrics) sit beside a prominent accent CTA card.
export function ClosingCta({
    title,
    sub,
    ctaLabel = "Get started",
    ctaHref = "/login",
    tiles,
}: {
    title: string;
    sub?: string;
    ctaLabel?: string;
    ctaHref?: string;
    tiles?: { title: string; body: string }[];
}) {
    return (
        <section className="bg-black px-6 py-20 sm:py-28">
            <div className="mx-auto w-full max-w-6xl">
                <h2 className="max-w-2xl font-extrabold text-4xl leading-[1.05] tracking-tight text-white sm:text-6xl">{title}</h2>
                {sub && <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-white/70">{sub}</p>}

                {tiles && tiles.length > 0 ? (
                    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {tiles.map((t) => (
                            <div key={t.title} className="rounded-2xl p-6 ring-1 ring-white/10">
                                <p className="font-extrabold text-xl tracking-tight text-white">{t.title}</p>
                                <p className="mt-2 text-sm font-semibold leading-snug text-white/55">{t.body}</p>
                            </div>
                        ))}
                        <Link
                            href={ctaHref}
                            className="group flex flex-col justify-between rounded-2xl bg-lantern p-6 text-black transition-transform duration-200 hover:-translate-y-1"
                        >
                            <p className="font-extrabold text-xl tracking-tight">{ctaLabel}</p>
                            <span className="mt-8 inline-flex size-10 items-center justify-center rounded-full bg-black/10">
                                <HugeiconsIcon icon={ArrowRight01Icon} size={20} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                            </span>
                        </Link>
                    </div>
                ) : (
                    <Link
                        href={ctaHref}
                        className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-black transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                        {ctaLabel}
                    </Link>
                )}
            </div>
        </section>
    );
}
