"use client";

/* Layer 3 of the liquid popover: the rows — GooDropdown's menu semantics,
   unchanged (item / label / separator / custom, squircled rows, href or
   onClick), with two liquid additions: each row's CONTENT rides an inner
   wrapper (the entry stagger animates that, never the row, so the panel
   scales as one mass), and the hover FILL belongs to the travelling pill in
   the panel, not to the row. */

import React, { memo, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import type { LiquidRefs } from "./liquid-refs";
import { ROW_RADIUS, SEPARATOR_ROW_H } from "./liquid-theme";

export type LiquidPopoverItem = {
    key?: string | number;
    /** 'custom' renders the label node bare (no button wrapper) — for rows that are interactive components themselves. */
    type?: "item" | "label" | "separator" | "custom";
    label?: React.ReactNode;
    onClick?: () => void;
    href?: string;
    className?: string;
    height?: number;
    /** Set false to keep the menu open after clicking (view switches, async flows). */
    closeOnSelect?: boolean;
};

function LiquidRowsImpl({
    items,
    itemHeight,
    refs,
    onSelect,
    onRowPointerDown,
    onHoverRow,
}: {
    items: LiquidPopoverItem[];
    itemHeight: number;
    refs: LiquidRefs;
    onSelect: (item: LiquidPopoverItem) => void;
    onRowPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onHoverRow: (el: HTMLElement) => void;
}) {
    refs.items.length = items.length;
    refs.itemInners.length = items.length;

    const rowHeight = (item: LiquidPopoverItem) =>
        item.height ?? (item.type === "separator" ? SEPARATOR_ROW_H : itemHeight);

    return (
        <>
            {items.map((item, i) => {
                const h = rowHeight(item);
                const k = item.key ?? i;
                const setRow = (el: HTMLElement | null) => {
                    refs.items[i] = el;
                };
                const setInner = (el: HTMLElement | null) => {
                    refs.itemInners[i] = el;
                };

                if (item.type === "separator") {
                    return (
                        <div key={k} ref={setRow} className="flex shrink-0 items-center px-2" style={{ height: h }}>
                            <div ref={setInner} className={cn("h-px w-full bg-border/10", item.className)} />
                        </div>
                    );
                }

                if (item.type === "custom") {
                    return (
                        <Squircle key={k} asChild radius={ROW_RADIUS}>
                            <div ref={setRow} className={cn("shrink-0 overflow-hidden", item.className)} style={{ height: h }}>
                                <div ref={setInner} className="h-full">
                                    {item.label}
                                </div>
                            </div>
                        </Squircle>
                    );
                }

                if (item.type === "label") {
                    return (
                        <div
                            key={k}
                            ref={setRow}
                            className={cn(
                                "flex shrink-0 items-center px-3 text-xs font-semibold text-muted-foreground",
                                item.className,
                            )}
                            style={{ height: h }}
                        >
                            <span ref={setInner} className="flex items-center">
                                {item.label}
                            </span>
                        </div>
                    );
                }

                /* The BASE row IS the app standard: SQUIRCLED rows, px-4,
                   text-base font-bold, zinc-200 → white on hover. The hover
                   FILL is the travelling pill's, not the row's. */
                const rowClass = cn(
                    "flex w-full shrink-0 items-center px-4 py-2 text-left text-base font-bold text-zinc-200 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:bg-white/5 focus-visible:text-white",
                    item.className,
                );
                const rowProps = {
                    role: "menuitem" as const,
                    /* Constant on purpose — the panel's `inert` blocks focus
                       while closed, and flipping tabIndex per open re-rendered
                       every row at the first frame of the pour. */
                    tabIndex: 0,
                    className: rowClass,
                    style: { height: h },
                    onClick: () => onSelect(item),
                    onPointerDown: onRowPointerDown,
                    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => onHoverRow(event.currentTarget),
                    /* Enter alone is not enough — a pointer already over a row
                       when the panel opens fires none; move sets it too (the
                       host bails on an unchanged value). */
                    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => onHoverRow(event.currentTarget),
                };
                const content = (
                    /* gap: inherit — the row's own gap (gooMenuItem passes
                       gap-3) reaches the real flex container in here. */
                    <span ref={setInner} className="flex w-full min-w-0 items-center" style={{ gap: "inherit" }}>
                        {item.label}
                    </span>
                );

                return (
                    <Squircle key={k} asChild radius={ROW_RADIUS}>
                        {item.href ? (
                            <Link ref={setRow as React.Ref<HTMLAnchorElement>} href={item.href} {...rowProps}>
                                {content}
                            </Link>
                        ) : (
                            <button ref={setRow as React.Ref<HTMLButtonElement>} type="button" {...rowProps}>
                                {content}
                            </button>
                        )}
                    </Squircle>
                );
            })}
        </>
    );
}

/* Memoized: the parent re-renders on every hover-target change and once per
   open/close, and rows are the other expensive subtree (a Lisse squircle
   per row). All props are referentially stable across those renders, so the
   rows render exactly once per items change. */
export const LiquidRows = memo(LiquidRowsImpl);
