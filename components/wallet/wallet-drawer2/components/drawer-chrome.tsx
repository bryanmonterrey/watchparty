"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every screen inside the wallet drawer.
 *
 * It exists because the drawer had TWO design languages living next to each
 * other: the main view (canvas surface, panel2 rows on a 24px radius, HugeIcons)
 * and everything reached from it — token detail, settings, activity — which was
 * still on the first-pass look: `bg-black` screens, `bg-gray1` cards banded with
 * `border-b border-white/5` dividers, lucide glyphs and 17px Title Case labels.
 * Opening a token from the list changed design system mid-drawer.
 *
 * So the vocabulary is fixed here once, taken from the main view (which is the
 * current one) and from the /trade quality bar:
 *
 *   surface   bg-canvas, the same fill the drawer shell paints — screens never
 *             paint their own black, which is what made the sub-screens read as
 *             a separate sheet stacked on the drawer.
 *   card      rounded-3xl + bg-panel2 + a single baseborder hairline. One radius
 *             for the whole drawer.
 *   rows      SEPARATE cards with `space-y-1` between them, never one card
 *             subdivided by hairlines — house rule is no divider borders.
 *   type      15px bold tracking-tight primary / 13px medium zinc-500 secondary.
 *   icons     HugeIcons only.
 */

/** Card fill + hairline. One string, so no surface can drift from it. */
export const DRAWER_CARD = "rounded-3xl bg-panel2 border border-baseborder/20";

/** Interactive version of the same card. */
export const DRAWER_CARD_INTERACTIVE = cn(
    DRAWER_CARD,
    "transition-colors hover:bg-white/[0.05] cursor-pointer",
);

export function DrawerBackButton({
    onBack,
    label = "Back",
}: {
    onBack: () => void;
    label?: string;
}) {
    return (
        <button
            onClick={onBack}
            aria-label={label}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-95"
        >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2.5} />
        </button>
    );
}

/**
 * The standard sub-screen: back arrow, centred title, optional right slot, and
 * a scrolling body. Every screen that used to hand-roll
 * `min-h-[56px] … absolute left-3 … text-[17px] font-bold` gets it from here.
 *
 * The header does not scroll away and does not carry a border — it sits on the
 * same canvas as the body, so the seam is spacing, not a hairline.
 */
export function DrawerScreen({
    title,
    onBack,
    right,
    children,
    className,
    bodyClassName,
    scroll = true,
}: {
    title: React.ReactNode;
    onBack?: () => void;
    right?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    /** Off when the screen manages its own scroller (token detail, activity). */
    scroll?: boolean;
}) {
    return (
        <div className={cn("flex h-full flex-col bg-canvas text-white", className)}>
            <DrawerHeader title={title} onBack={onBack} right={right} />
            <div
                className={cn(
                    "flex-1",
                    scroll && "overflow-y-auto hidden-scrollbar",
                    bodyClassName,
                )}
            >
                {children}
            </div>
        </div>
    );
}

/** The header on its own, for screens that own their scroll container. */
export function DrawerHeader({
    title,
    onBack,
    right,
    className,
}: {
    title: React.ReactNode;
    onBack?: () => void;
    right?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex h-14 shrink-0 items-center gap-2 px-3", className)}>
            <div className="flex w-9 shrink-0 items-center">
                {onBack ? <DrawerBackButton onBack={onBack} /> : null}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                {typeof title === "string" ? (
                    <h2 className="truncate text-16 font-bold tracking-tight text-white">
                        {title}
                    </h2>
                ) : (
                    title
                )}
            </div>
            <div className="flex min-w-9 shrink-0 items-center justify-end">{right}</div>
        </div>
    );
}

/**
 * A labelled group of rows. The label is 13px zinc-500 sentence case and sits
 * OUTSIDE the cards — grouping by heading rather than by shared card body is
 * what lets the rows stay separate objects.
 */
export function DrawerSection({
    label,
    children,
    className,
}: {
    label?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("space-y-1", className)}>
            {label ? (
                <p className="px-1.5 pb-0.5 text-13 font-semibold text-zinc-500">{label}</p>
            ) : null}
            {children}
        </section>
    );
}

/** A plain (non-interactive) card. */
export function DrawerCard({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn(DRAWER_CARD, className)}>{children}</div>;
}

/**
 * A settings row: title, optional description or trailing value, and either a
 * chevron (navigates), a control (switch/toggle group), or a tick (selected).
 */
export function DrawerRow({
    title,
    description,
    value,
    icon,
    control,
    selected,
    onClick,
    danger,
    className,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Trailing secondary text — the row's current setting. */
    value?: React.ReactNode;
    icon?: React.ReactNode;
    /** A switch or toggle group. Present => the row is not a link. */
    control?: React.ReactNode;
    /** Renders the tick used by the currency/language pickers. */
    selected?: boolean;
    onClick?: () => void;
    danger?: boolean;
    className?: string;
}) {
    const body = (
        <>
            {icon ? <span className="mt-0.5 shrink-0 text-zinc-500">{icon}</span> : null}
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                <span
                    className={cn(
                        "text-15 font-bold tracking-tight",
                        danger ? "text-pastelred" : "text-white",
                    )}
                >
                    {title}
                </span>
                {description ? (
                    <span className="text-13 font-medium leading-snug text-zinc-500">
                        {description}
                    </span>
                ) : null}
            </span>
            {value ? (
                <span className="shrink-0 text-13 font-semibold text-zinc-400">{value}</span>
            ) : null}
            {control}
            {selected ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-black">
                    <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden="true">
                        <path
                            d="M5 13l4 4L19 7"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
            ) : null}
            {onClick && !control && !selected ? (
                <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-white"
                    strokeWidth={2.5}
                />
            ) : null}
        </>
    );

    const shell = cn(
        "group flex w-full items-center gap-3 px-4 py-3.5",
        onClick ? DRAWER_CARD_INTERACTIVE : DRAWER_CARD,
        className,
    );

    if (!onClick) return <div className={shell}>{body}</div>;
    return (
        <button onClick={onClick} className={shell}>
            {body}
        </button>
    );
}

/**
 * A key/value line inside a card (token Info, transaction details). Rows are
 * padded and separated by nothing — the label/value contrast carries them, and
 * a hairline between every pair is exactly the banded look this replaces.
 */
export function DrawerDataRow({
    label,
    children,
    className,
}: {
    label: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex items-center justify-between gap-4 px-4 py-3", className)}>
            <span className="shrink-0 text-13 font-medium text-zinc-500">{label}</span>
            <span className="min-w-0 truncate text-14 font-semibold text-white">
                {children}
            </span>
        </div>
    );
}

/**
 * Empty state — one implementation, in `./empty-state`. Re-exported here so a
 * screen building on this chrome imports one module, and so there is never a
 * second copy of the two-line pattern to drift from.
 */
export { EmptyState as DrawerEmptyState } from "./empty-state";
