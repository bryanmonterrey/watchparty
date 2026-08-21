"use client";

import { type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp01Icon, GripVerticalIcon } from "@hugeicons/core-free-icons";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import type { DataTableColumnMeta, DataTableFeatures } from "./features";
import { alignFlex, alignText } from "./utils";

export type HeaderCellRefs = { current: Record<string, HTMLTableCellElement | null> };

export interface DataTableHeaderProps<TData extends RowData> {
    table: ReactTable<DataTableFeatures, TData>;
    rowHeight: number;
    /** Honour prefers-reduced-motion — drops the drag scale, keeps the opacity cue. */
    reduce: boolean;
    thRefs: HeaderCellRefs;
    sticky: boolean;
    /** CSS length for `top` when sticky — the app header/toolbar offset. */
    stickyTop: string;
    /** The header row's own surface. Sticky headers must not be transparent. */
    className?: string;
    resizable: boolean;
    onResizeStart: (columnId: string, e: ReactPointerEvent) => void;
    onResizeMove: (e: ReactPointerEvent) => void;
    onResizeEnd: (e: ReactPointerEvent) => void;
    reorderable: boolean;
    dragId: string | null;
    dropIndex: number | null;
    onReorderStart: (columnId: string, e: ReactPointerEvent) => void;
    onReorderMove: (e: ReactPointerEvent) => void;
    onReorderEnd: (e: ReactPointerEvent) => void;
}

/**
 * The header row. Sorting, ordering and sizing all read from the TanStack v9
 * table instance — `header.column.getIsSorted()`, `getToggleSortingHandler()`
 * — so this file owns appearance and pointer gestures only, never state.
 */
export function DataTableHeader<TData extends RowData>({
    table,
    rowHeight,
    reduce,
    thRefs,
    sticky,
    stickyTop,
    className,
    resizable,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    reorderable,
    dragId,
    dropIndex,
    onReorderStart,
    onReorderMove,
    onReorderEnd,
}: DataTableHeaderProps<TData>) {
    const groups = table.getHeaderGroups();
    const lastGroup = groups[groups.length - 1];
    const columnCount = lastGroup ? lastGroup.headers.length : 0;

    return (
        <thead>
            {groups.map((group) => (
                <tr key={group.id} style={{ height: rowHeight }}>
                    {group.headers.map((header, index) => {
                        const column = header.column;
                        const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
                        const sorted = column.getIsSorted();
                        const canSort = column.getCanSort();
                        const isDragging = dragId === column.id;
                        const toggleSort = column.getToggleSortingHandler();

                        return (
                            <th
                                key={header.id}
                                colSpan={header.colSpan}
                                ref={(el) => {
                                    thRefs.current[column.id] = el;
                                }}
                                aria-sort={
                                    sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
                                }
                                data-drop={dragId ? dropIndex === index : undefined}
                                data-dropend={
                                    dragId ? dropIndex === columnCount && index === columnCount - 1 : undefined
                                }
                                style={sticky ? { top: stickyTop } : undefined}
                                className={cn(
                                    // Either position works as the containing block the
                                    // resize handle and drop indicators need — but they
                                    // must not BOTH be emitted: `relative` and `sticky`
                                    // are the same property, so which one wins would come
                                    // down to stylesheet order, not class order.
                                    sticky ? "sticky" : "relative",
                                    // No rule under the labels — they read as a
                                    // caption for the rows, not as a boxed header.
                                    "z-10 p-0 text-base font-semibold text-zinc-400",
                                    meta?.hideClassName,
                                    // Drop indicators for the reorder drag — a hairline on the
                                    // edge the column would land against. twitter2,
                                    // like the resize handle below: this is the app's
                                    // accent, and `lantern` (which these used to be) is
                                    // the PRICE-UP green, so table chrome wearing it read
                                    // as a value judgement about the column.
                                    "data-[drop=true]:before:absolute data-[drop=true]:before:inset-y-0 data-[drop=true]:before:left-0 data-[drop=true]:before:w-0.5 data-[drop=true]:before:bg-twitter2",
                                    "data-[dropend=true]:after:absolute data-[dropend=true]:after:inset-y-0 data-[dropend=true]:after:right-0 data-[dropend=true]:after:w-0.5 data-[dropend=true]:after:bg-twitter2",
                                    className,
                                )}
                            >
                                <motion.div
                                    className={cn("flex h-full items-center", alignFlex(meta?.align))}
                                    style={{ height: rowHeight }}
                                    animate={
                                        reduce
                                            ? { opacity: isDragging ? 0.5 : 1 }
                                            : { scale: isDragging ? 1.04 : 1, opacity: isDragging ? 0.5 : 1 }
                                    }
                                    transition={SPRING_PRESS}
                                >
                                    {reorderable && !header.isPlaceholder && !meta?.noReorder ? (
                                        <button
                                            type="button"
                                            aria-label={`Reorder the ${column.id} column`}
                                            onPointerDown={(e) => onReorderStart(column.id, e)}
                                            onPointerMove={onReorderMove}
                                            onPointerUp={onReorderEnd}
                                            className="flex h-full w-5 shrink-0 cursor-grab touch-none items-center justify-center text-zinc-600 transition-colors hover:text-white active:cursor-grabbing"
                                        >
                                            <HugeiconsIcon icon={GripVerticalIcon} className="size-3.5" strokeWidth={2} />
                                        </button>
                                    ) : null}

                                    {header.isPlaceholder ? null : canSort ? (
                                        <button
                                            type="button"
                                            onClick={toggleSort}
                                            className={cn(
                                                "flex h-full min-w-0 flex-1 cursor-pointer select-none items-center gap-1 px-4 transition-colors hover:text-white",
                                                alignFlex(meta?.align),
                                                sorted && "text-flexwhite",
                                            )}
                                        >
                                            <span className="truncate">
                                                <table.FlexRender header={header} />
                                            </span>
                                            <motion.span
                                                aria-hidden
                                                className="inline-flex shrink-0"
                                                animate={{
                                                    rotate: sorted === "desc" ? 180 : 0,
                                                    opacity: sorted ? 1 : 0.35,
                                                }}
                                                transition={
                                                    reduce ? { duration: 0 } : { duration: DURATION.fast, ease: EASE_OUT }
                                                }
                                            >
                                                <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" strokeWidth={2.5} />
                                            </motion.span>
                                        </button>
                                    ) : (
                                        <span className={cn("min-w-0 flex-1 truncate px-4", alignText(meta?.align))}>
                                            <table.FlexRender header={header} />
                                        </span>
                                    )}
                                </motion.div>

                                {resizable && !header.isPlaceholder ? (
                                    <button
                                        type="button"
                                        aria-label={`Resize the ${column.id} column`}
                                        tabIndex={-1}
                                        onPointerDown={(e) => onResizeStart(column.id, e)}
                                        onPointerMove={onResizeMove}
                                        onPointerUp={onResizeEnd}
                                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-twitter2/40"
                                    />
                                ) : null}
                            </th>
                        );
                    })}
                    {/* Trailing filler owns the leftover width so a resized
                        column steals from empty space, not from its neighbour. */}
                    <th
                        aria-hidden
                        style={sticky ? { top: stickyTop } : undefined}
                        className={cn(sticky && "sticky z-10", className)}
                    />
                </tr>
            ))}
        </thead>
    );
}
