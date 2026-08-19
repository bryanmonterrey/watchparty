import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { MARKETING_FEATURES } from "./nav-data";
import { Marquee } from "@/components/ui/marquee";
import { Reveal, Parallax, WordReveal } from "./motion";

// Marketing section kit — Cash App-shaped: big LEFT-aligned Geist headlines
// (font-pixel is the small accent on eyebrows + the logo, not the headlines, for
// legibility at scale); asymmetric splits (text one side, image panel the
// other); full-bleed SOLID bands (no gradients); pill CTAs. Image panels are
// placeholders sized for real app mockups dropped in later. See
// docs/design-principles.md.

// One beat per screen (measured from cash.app: every homepage section is
// literally min-height 100vh, interior heroes ~94vh). Major sections fill
// ~92svh with their content vertically centered; utility sections (FAQ,
// explore-more) get a lighter ~75svh.
const BEAT = "flex min-h-[92svh] flex-col justify-center";
const BEAT_LIGHT = "flex min-h-[75svh] flex-col justify-center";

// Rounded placeholder panel where a real product mockup (phone screen / render)
// will go. Solid-fill, aggressive radius, with a phone-shaped inner frame.
export function ShowcasePanel({
    tone = "bg-[#111]",
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
            <div className="flex aspect-[9/19] h-[82%] flex-col items-center justify-center gap-3 rounded-[2rem] bg-white/[0.04] ring-1 ring-white/10">
                {icon && <HugeiconsIcon icon={icon} size={48} strokeWidth={1.6} className="text-white/30" />}
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</span>
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
    panelTone = "bg-[#111]",
    panelLabel,
    panelIcon,
    visual,
    variant = "split",
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
    /** split = text left / visual right (default). reverse = visual left.
        centered = big centered headline with the visual below (manifesto). */
    variant?: "split" | "reverse" | "centered";
}) {
    const centered = variant === "centered";
    // Staggered entrance: eyebrow → headline → sub → CTAs cascade in (60ms
    // steps), instead of the whole block arriving as one slab.
    const copy = (
        <div className={cn(centered && "mx-auto max-w-3xl text-center")}>
            {eyebrow && (
                <Reveal y={14}>
                    <p className="mb-4 font-pixel text-sm uppercase tracking-[0.2em] text-white/50">{eyebrow}</p>
                </Reveal>
            )}
            <Reveal y={18} delay={0.06}>
                <h1
                    className={cn(
                        "font-extrabold leading-[1.02] tracking-tight text-white",
                        centered ? "text-5xl sm:text-7xl lg:text-8xl" : "text-4xl sm:text-6xl lg:text-7xl",
                    )}
                >
                    {title}
                </h1>
            </Reveal>
            <Reveal y={18} delay={0.12}>
                <p
                    className={cn(
                        "mt-6 text-lg font-semibold leading-snug text-white/70 sm:text-xl",
                        centered ? "mx-auto max-w-xl" : "max-w-md",
                    )}
                >
                    {sub}
                </p>
            </Reveal>
            <Reveal y={14} delay={0.18} className={cn("mt-10 flex flex-wrap items-center gap-3", centered && "justify-center")}>
                <Link
                    href={ctaHref}
                    className="rounded-full bg-white px-8 py-4 text-base font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                >
                    {ctaLabel}
                </Link>
                {secondaryLabel && secondaryHref && (
                    <Link
                        href={secondaryHref}
                        className="rounded-full bg-white/10 px-8 py-4 text-base font-bold text-white ring-1 ring-white/15 transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                    >
                        {secondaryLabel}
                    </Link>
                )}
            </Reveal>
        </div>
    );
    const art = (
        <Reveal delay={0.22} className={cn(centered && "flex justify-center")}>
            <Parallax amount={28}>
                {visual ?? <ShowcasePanel tone={panelTone} label={panelLabel} icon={panelIcon} />}
            </Parallax>
        </Reveal>
    );

    // Hero fills the first screen minus the header clearance the page adds.
    if (centered) {
        return (
            <section className="flex min-h-[86svh] flex-col justify-center px-6 py-10">
                <div className="mx-auto w-full max-w-6xl">
                    {copy}
                    <div className="mt-16 sm:mt-20">{art}</div>
                </div>
            </section>
        );
    }

    return (
        <section className="flex min-h-[86svh] flex-col justify-center px-6 py-10">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
                {variant === "reverse" ? (
                    <>
                        <div className="lg:order-2">{copy}</div>
                        <div className="lg:order-1">{art}</div>
                    </>
                ) : (
                    <>
                        {copy}
                        {art}
                    </>
                )}
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
    panelTone = "bg-[#111]",
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
        <section className={cn(BEAT, "px-6 py-12", className)}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
                <div className={cn(reverse && "lg:order-2")}>
                    <h2 className="font-extrabold text-3xl leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                        {title}
                    </h2>
                    <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-white/65">{body}</p>
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className="mt-7 inline-block rounded-full bg-white px-7 py-3.5 text-base font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
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
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
                <Reveal className={cn(reverse && "lg:order-2")}>
                    <h2 className={cn("font-extrabold text-3xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl", "text-white")}>
                        {title}
                    </h2>
                    <p className={cn("mt-4 max-w-md text-lg font-semibold leading-snug", "text-white/70")}>{body}</p>
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className={cn(
                                "mt-7 inline-block rounded-full px-7 py-3.5 text-base font-bold transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]",
                                "bg-white text-black",
                            )}
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </Reveal>
                <Reveal delay={0.1} className={cn("flex justify-center", reverse && "lg:order-1")}>{visual}</Reveal>
            </div>
        </section>
    );
}

// Floating inset block (Phantom "Your privacy matters") — a big rounded panel
// that FLOATS on the page background instead of cutting a full-bleed band, so
// dark moments don't create a visible section seam. Split: copy one side,
// visual the other. Use this for the money/earn/highlight beat on a
// ColorScrollPage.
export function InsetBlock({
    eyebrow,
    title,
    body,
    ctaLabel,
    ctaHref,
    visual,
    tone = "bg-black",
    dark = true,
    reverse = false,
}: {
    eyebrow?: string;
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
        <section className={cn(BEAT, "px-6 py-12")}>
            <Reveal>
                <div
                    className={cn(
                        "mx-auto grid w-full max-w-6xl items-center gap-10 overflow-hidden rounded-[40px] p-8 sm:p-12 lg:grid-cols-2 lg:gap-20 lg:p-20",
                        tone,
                        "ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                    )}
                >
                    <div className={cn(reverse && "lg:order-2")}>
                        {eyebrow && (
                            <p className={cn("mb-4 font-pixel text-sm uppercase tracking-[0.2em]", "text-white/45")}>{eyebrow}</p>
                        )}
                        <h2 className={cn("font-extrabold text-3xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl", "text-white")}>
                            {title}
                        </h2>
                        <p className={cn("mt-4 max-w-md text-lg font-semibold leading-snug", "text-white/65")}>{body}</p>
                        {ctaLabel && ctaHref && (
                            <Link
                                href={ctaHref}
                                className={cn(
                                    "mt-8 inline-block rounded-full px-8 py-4 text-base font-bold transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]",
                                    "bg-white text-black",
                                )}
                            >
                                {ctaLabel}
                            </Link>
                        )}
                    </div>
                    <div className={cn("flex justify-center", reverse && "lg:order-1")}>{visual}</div>
                </div>
            </Reveal>
        </section>
    );
}

// Phantom-style centered feature: a big centered headline + one large centered
// visual on a full-bleed colored band, with generous vertical breathing room.
// Use this to break the split-row monotony — a single hero card stands alone.
export function CenterFeature({
    eyebrow,
    title,
    sub,
    ctaLabel,
    ctaHref,
    visual,
    tone = "bg-transparent",
    dark = false,
}: {
    eyebrow?: string;
    title: React.ReactNode;
    sub?: string;
    ctaLabel?: string;
    ctaHref?: string;
    visual?: React.ReactNode;
    tone?: string;
    dark?: boolean;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto w-full max-w-3xl text-center">
                <Reveal>
                    {eyebrow && (
                        <p className={cn("mb-4 font-pixel text-sm uppercase tracking-[0.2em]", "text-white/50")}>{eyebrow}</p>
                    )}
                    <h2 className={cn("font-extrabold text-4xl leading-[1.05] tracking-tight sm:text-6xl", "text-white")}>
                        {title}
                    </h2>
                    {sub && (
                        <p className={cn("mx-auto mt-5 max-w-md text-lg font-semibold leading-snug sm:text-xl", "text-white/65")}>{sub}</p>
                    )}
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className={cn(
                                "mt-8 inline-block rounded-full px-8 py-4 text-base font-bold transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]",
                                "bg-white text-black",
                            )}
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </Reveal>
                {visual && (
                    <Reveal delay={0.1} className="mt-16 flex justify-center sm:mt-20">
                        <Parallax amount={24}>{visual}</Parallax>
                    </Reveal>
                )}
            </div>
        </section>
    );
}

// Numbered process flow (Cash App pattern) — big ghost numerals over short
// steps. A distinct "how it works" spine, not another card grid.
export function StepFlow({
    eyebrow,
    title,
    sub,
    steps,
    tone = "bg-transparent",
}: {
    eyebrow?: string;
    title: string;
    sub?: string;
    steps: { title: string; body: string }[];
    tone?: string;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto w-full max-w-6xl">
                <Reveal>
                    {eyebrow && (
                        <p className="mb-3 font-pixel text-sm uppercase tracking-[0.2em] text-white/45">{eyebrow}</p>
                    )}
                    <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>
                    {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-white/65">{sub}</p>}
                </Reveal>
                <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-3">
                    {steps.map((s, i) => (
                        <Reveal key={s.title} delay={i * 0.08}>
                            <div className="border-t-2 border-white/10 pt-5">
                                <span className="font-pixel text-5xl leading-none tracking-tighter text-white/20 sm:text-6xl">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <p className="mt-4 text-xl font-extrabold tracking-tight text-white">{s.title}</p>
                                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white/60">{s.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Asymmetric bento grid (Phantom/Apple pattern) — mixed-size pastel cards. A
// distinct, visual-forward spine vs. the uniform FeatureGrid.
export function BentoGrid({
    eyebrow,
    title,
    sub,
    items,
    tone = "bg-transparent",
}: {
    eyebrow?: string;
    title?: string;
    sub?: string;
    items: { icon: IconSvgElement; title: string; body: string; bg: string; accent: string; span?: "wide" | "tall" | "big" }[];
    tone?: string;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto w-full max-w-6xl">
                {(eyebrow || title || sub) && (
                    <Reveal>
                        {eyebrow && (
                            <p className="mb-3 font-pixel text-sm uppercase tracking-[0.2em] text-white/45">{eyebrow}</p>
                        )}
                        {title && <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>}
                        {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-white/65">{sub}</p>}
                    </Reveal>
                )}
                <div className="mt-14 grid auto-rows-[176px] grid-cols-2 gap-4 sm:grid-cols-4">
                    {items.map((it, i) => (
                        <Reveal
                            key={it.title}
                            delay={i * 0.05}
                            className={cn(
                                it.span === "big" && "col-span-2 row-span-2",
                                it.span === "wide" && "col-span-2",
                                it.span === "tall" && "row-span-2",
                            )}
                        >
                            <div className={cn("flex h-full flex-col overflow-hidden rounded-[24px] p-6 ring-1 ring-white/[0.08]", it.bg)}>
                                <span className="grid size-11 place-items-center rounded-2xl bg-white/10">
                                    <HugeiconsIcon icon={it.icon} size={24} strokeWidth={1.8} className={it.accent} />
                                </span>
                                <p className="mt-auto pt-5 text-lg font-extrabold tracking-tight text-white">{it.title}</p>
                                <p className="mt-1 text-[15px] font-semibold leading-snug text-white/60">{it.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Caption cards (Cash App "built for security" band) — a titled band with a row
// of REAL mini-UI visuals, each with a caption title + body underneath. This is
// the premium replacement for the uniform white FeatureGrid: the visual does the
// talking (looks like real product), the caption just labels it. Each card
// carries its own surface tone so the row varies like the references.
export function CaptionCards({
    eyebrow,
    title,
    sub,
    cards,
    tone = "bg-transparent",
    columns = 3,
}: {
    eyebrow?: string;
    title?: string;
    sub?: string;
    cards: { visual: React.ReactNode; title: string; body: string; bg?: string }[];
    tone?: string;
    columns?: 2 | 3;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto w-full max-w-6xl">
                {(eyebrow || title || sub) && (
                    <Reveal className="max-w-3xl">
                        {eyebrow && (
                            <p className="mb-4 font-pixel text-sm uppercase tracking-[0.2em] text-white/45">{eyebrow}</p>
                        )}
                        {title && <h2 className="font-extrabold text-3xl leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>}
                        {sub && <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-white/60">{sub}</p>}
                    </Reveal>
                )}
                <div className={cn("mt-16 grid gap-8 sm:mt-20", columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                    {cards.map((c, i) => (
                        <Reveal key={c.title} delay={i * 0.08}>
                            <div className="flex h-full flex-col">
                                <div
                                    className={cn(
                                        "grid min-h-[220px] place-items-center overflow-hidden rounded-[28px] p-6 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                                        c.bg ?? "bg-[#111]",
                                    )}
                                >
                                    {c.visual}
                                </div>
                                <p className="mt-6 text-xl font-extrabold tracking-tight text-white">{c.title}</p>
                                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white/60">{c.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Two-up bold cards (Cash App "full reserve / access to bitcoin") — two large
// side-by-side panels, each its own accent surface with a headline, body, and an
// optional mini visual. A punchier alternative to a split row.
export function TwoUpBold({
    items,
    tone = "bg-transparent",
}: {
    items: { title: string; body: string; visual?: React.ReactNode; bg: string; dark?: boolean }[];
    tone?: string;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", tone)}>
            <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
                {items.map((it, i) => (
                    <Reveal key={it.title} delay={i * 0.08}>
                        <div className={cn("flex h-full flex-col justify-between overflow-hidden rounded-[32px] p-8 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-10", it.bg)}>
                            <div>
                                <p className={cn("text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl", it.dark ? "text-white" : "text-black")}>{it.title}</p>
                                <p className={cn("mt-3 max-w-sm text-[15px] font-semibold leading-snug", it.dark ? "text-white/65" : "text-black/60")}>{it.body}</p>
                            </div>
                            {it.visual && <div className="mt-8">{it.visual}</div>}
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

// Big editorial statement (Phantom/Stripe pattern) — one oversized line of copy,
// generous space. A manifesto beat, not a card. Words brighten one by one as
// the block scrolls through the viewport (scroll-scrubbed, see WordReveal).
export function BigStatement({
    children,
    tone,
    className,
}: {
    children: React.ReactNode;
    tone?: string;
    className?: string;
}) {
    return (
        <section className={cn("flex min-h-[80svh] flex-col justify-center px-6 py-12", tone, className)}>
            <div className="mx-auto max-w-5xl">
                <WordReveal className="font-extrabold text-3xl leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    {children}
                </WordReveal>
            </div>
        </section>
    );
}

// Editorial ledger — full-width index rows with a single hairline above each,
// huge titles left and the body in a right-hand column (asymmetric, no cards).
// A distinct layout family from the grids and splits: scale does the talking.
export function FeatureLedger({
    title,
    sub,
    rows,
    className,
}: {
    title?: string;
    sub?: string;
    rows: { title: string; body: string; visual?: React.ReactNode }[];
    className?: string;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12", className)}>
            <div className="mx-auto w-full max-w-7xl">
                {(title || sub) && (
                    <Reveal>
                        {title && <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>}
                        {sub && <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-white/60">{sub}</p>}
                    </Reveal>
                )}
                <div className={cn(title || sub ? "mt-16" : "")}>
                    {rows.map((r, i) => (
                        <Reveal key={r.title} delay={i * 0.05}>
                            <div className="grid items-center gap-4 border-t border-white/10 py-10 sm:py-14 lg:grid-cols-12 lg:gap-8">
                                <h3 className="font-extrabold text-3xl leading-[1.02] tracking-tight text-white sm:text-5xl lg:col-span-6 lg:text-6xl">
                                    {r.title}
                                </h3>
                                <p className={cn("max-w-md text-lg font-semibold leading-snug text-white/60", r.visual ? "lg:col-span-4" : "lg:col-span-5 lg:col-start-8")}>
                                    {r.body}
                                </p>
                                {r.visual && <div className="lg:col-span-2 lg:justify-self-end">{r.visual}</div>}
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Poster beat — an oversized statement pinned top-left of a giant floating
// panel, body + CTA bottom-left, visual bottom-right. The asymmetric
// counterpoint to the centered beats; the panel floats so dark stays seamless.
export function PosterPanel({
    title,
    body,
    ctaLabel,
    ctaHref,
    visual,
    tone = "bg-black",
    dark = true,
}: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
    visual?: React.ReactNode;
    tone?: string;
    dark?: boolean;
}) {
    return (
        <section className={cn(BEAT, "px-4 py-12 sm:px-6")}>
            <Reveal className="mx-auto w-full max-w-8xl">
                <div
                    className={cn(
                        "flex min-h-[78svh] flex-col justify-between gap-12 overflow-hidden rounded-[40px] p-8 sm:p-14 lg:p-20",
                        tone,
                        "ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                    )}
                >
                    <h2
                        className={cn(
                            "max-w-[13ch] font-extrabold text-5xl leading-[0.98] tracking-tight sm:text-7xl lg:text-8xl",
                            "text-white",
                        )}
                    >
                        {title}
                    </h2>
                    <div className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
                        <div className="max-w-sm">
                            <p className={cn("text-lg font-semibold leading-snug", "text-white/65")}>{body}</p>
                            {ctaLabel && ctaHref && (
                                <Link
                                    href={ctaHref}
                                    className={cn(
                                        "mt-8 inline-block rounded-full px-8 py-4 text-base font-bold transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]",
                                        "bg-white text-black",
                                    )}
                                >
                                    {ctaLabel}
                                </Link>
                            )}
                        </div>
                        {visual && <div className="shrink-0 lg:pr-4">{visual}</div>}
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

// Asymmetric 7/5 split — a tall color panel carries the visual, the copy column
// sits beside it. A different family from the 50/50 splits and the contained
// InsetBlock: the visual gets the bigger share of the row.
export function SplitShowcase({
    title,
    body,
    ctaLabel,
    ctaHref,
    visual,
    tone = "bg-[#111]",
    reverse = false,
}: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
    visual: React.ReactNode;
    tone?: string;
    reverse?: boolean;
}) {
    return (
        <section className={cn(BEAT, "px-6 py-12")}>
            <div className="mx-auto grid w-full max-w-7xl items-stretch gap-8 lg:grid-cols-12">
                <Reveal className={cn("lg:col-span-7", reverse && "lg:order-2")}>
                    <div className={cn("grid h-full min-h-[56svh] place-items-center overflow-hidden rounded-[40px] p-8 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]", tone)}>
                        {visual}
                    </div>
                </Reveal>
                <Reveal delay={0.08} className={cn("flex flex-col justify-center py-6 lg:col-span-5 lg:px-8", reverse && "lg:order-1")}>
                    <h2 className="font-extrabold text-3xl leading-[1.08] tracking-tight text-white sm:text-5xl">{title}</h2>
                    <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-white/65">{body}</p>
                    {ctaLabel && ctaHref && (
                        <Link
                            href={ctaHref}
                            className="mt-8 inline-block self-start rounded-full bg-white px-8 py-4 text-base font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </Reveal>
            </div>
        </section>
    );
}

// Kinetic type band — a thin divider of oversized pixel type drifting sideways
// between two full-screen beats. Max ONE per page.
export function MarqueeBand({
    items,
    className,
    dark = false,
}: {
    items: string[];
    className?: string;
    dark?: boolean;
}) {
    return (
        <section className={cn("overflow-hidden py-8 sm:py-12", className)}>
            <Marquee className="[--duration:36s] [--gap:2.5rem] p-0">
                {items.map((w) => (
                    <span
                        key={w}
                        className={cn(
                            "flex items-center gap-10 whitespace-nowrap font-pixel text-5xl tracking-tight sm:text-7xl",
                            "text-white",
                        )}
                    >
                        {w}
                        <span aria-hidden className={cn("text-2xl sm:text-3xl", "text-white/40")}>✦</span>
                    </span>
                ))}
            </Marquee>
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
        <section className={cn(BEAT, "px-6 py-12", className)}>
            <div className="mx-auto w-full max-w-6xl">
                {(title || sub) && (
                    <Reveal>
                        {title && (
                            <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl lg:text-6xl">{title}</h2>
                        )}
                        {sub && <p className="mt-3 max-w-xl text-lg font-semibold leading-snug text-white/65">{sub}</p>}
                    </Reveal>
                )}
                {children && <Reveal delay={0.05} className={cn(title || sub ? "mt-10" : "")}>{children}</Reveal>}
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
        <section className={cn(BEAT_LIGHT, "px-6 py-12", className)}>
            <div className="mx-auto w-full max-w-6xl">
                <Reveal>
                    <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl">Explore more</h2>
                </Reveal>
                <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {links.map((f, i) => (
                        <Reveal key={f.href} delay={i * 0.06}>
                            <Link
                                href={f.href}
                                className="group flex h-full flex-col rounded-2xl bg-[#111] p-6 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.98]"
                            >
                                <span className={cn("mb-4 grid size-10 place-items-center rounded-xl bg-current/10", f.tone)}>
                                    <HugeiconsIcon icon={f.icon} size={22} strokeWidth={1.8} className={f.tone} />
                                </span>
                                <p className="text-lg font-bold tracking-tight text-white">{f.title}</p>
                                <p className="mt-1 flex-1 text-sm font-semibold leading-snug text-white/65">{f.blurb}</p>
                                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-white">
                                    Learn more
                                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2.2} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function Faq({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
    return (
        <section className={cn(BEAT_LIGHT, "px-6 py-12", className)}>
            <div className="mx-auto w-full max-w-3xl">
                <h2 className="font-extrabold text-3xl tracking-tight text-white sm:text-5xl">
                    Questions, answered
                </h2>
                <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
                    {items.map((item) => (
                        <details key={item.q} className="group py-5">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-bold text-white">
                                {item.q}
                                <span className="shrink-0 text-2xl font-light text-white/40 transition-transform duration-200 group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="mt-3 text-base font-semibold leading-snug text-white/65">{item.a}</p>
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
        <section className="flex min-h-[85svh] flex-col justify-center px-4 py-12 sm:px-6">
            <div className="mx-auto flex min-h-[70svh] w-full max-w-8xl flex-col justify-center overflow-hidden rounded-[40px] bg-black px-6 py-16 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-12 sm:py-20">
                <Reveal>
                    <h2 className="max-w-2xl font-extrabold text-4xl leading-[1.05] tracking-tight text-white sm:text-6xl">{title}</h2>
                    {sub && <p className="mt-4 max-w-md text-lg font-semibold leading-snug text-white/70">{sub}</p>}
                </Reveal>

                {tiles && tiles.length > 0 ? (
                    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {tiles.map((t, i) => (
                            <Reveal key={t.title} delay={i * 0.06}>
                                <div className="h-full rounded-2xl p-6 ring-1 ring-white/10">
                                    <p className="font-extrabold text-xl tracking-tight text-white">{t.title}</p>
                                    <p className="mt-2 text-sm font-semibold leading-snug text-white/55">{t.body}</p>
                                </div>
                            </Reveal>
                        ))}
                        <Reveal delay={tiles.length * 0.06}>
                            <Link
                                href={ctaHref}
                                className="group flex h-full flex-col justify-between rounded-2xl bg-lantern p-6 text-black transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.98]"
                            >
                                <p className="font-extrabold text-xl tracking-tight">{ctaLabel}</p>
                                <span className="mt-8 inline-flex size-10 items-center justify-center rounded-full bg-black/10">
                                    <HugeiconsIcon icon={ArrowRight01Icon} size={20} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </Reveal>
                    </div>
                ) : (
                    <Link
                        href={ctaHref}
                        className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                    >
                        {ctaLabel}
                    </Link>
                )}
            </div>
        </section>
    );
}
