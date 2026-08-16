"use client";

import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useReducedMotion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    useTable,
    type ColumnDef,
    type ColumnSizingState,
    type ColumnVisibilityState,
    type OnChangeFn,
    type RowData,
    type RowSelectionState,
    type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { dataTableFeatures, type DataTableColumnMeta, type DataTableFeatures } from "./features";
import { DataTableHeader, type HeaderCellRefs } from "./data-table-header";
import { DataTableSkeletonRows } from "./data-table-skeleton";
import { alignText } from "./utils";

export interface DataTableProps<TData extends RowData> {
    data: TData[];
    columns: ColumnDef<DataTableFeatures, TData, any>[];
    /** Stable row identity — required for selection to survive a re-sort. */
    getRowId?: (row: TData, index: number) => string;

    /** Controlled sorting. Leave both off to let the table own it. */
    sorting?: SortingState;
    onSortingChange?: OnChangeFn<SortingState>;
    /** The rows arrive pre-sorted (server/parent); headers still drive state. */
    manualSorting?: boolean;

    rowSelection?: RowSelectionState;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;

    /**
     * Controlled column visibility, keyed by column id. Prefer this over a
     * responsive utility class on the cell: a `display:none` cell still leaves
     * its `<col>` claiming width under `table-layout: fixed`.
     */
    columnVisibility?: ColumnVisibilityState;
    onColumnVisibilityChange?: OnChangeFn<ColumnVisibilityState>;

    /** Drag a header's right edge to set that column's width. */
    resizable?: boolean;
    minColumnWidth?: number;
    /** Drag a header's grip to move the column. */
    reorderable?: boolean;

    /** Fixed row height in px — load-bearing when virtualized. */
    rowHeight?: number;
    /**
     * Scroll viewport height in px. Set it to virtualize inside an own
     * scroller; omit it and the table renders every row in page flow, which
     * is what a page-scrolling board wants.
     */
    height?: number;
    overscan?: number;

    /** Fires once per near-bottom dwell — only in the `height` (scroller) mode. */
    onEndReached?: () => void;
    loading?: boolean;
    skeletonRows?: number;
    emptyState?: ReactNode;

    onRowClick?: (row: TData) => void;
    /**
     * Corner radius of the row hover wash, in px. Setting it switches the row
     * from "hairline divider + flat tint" to the trending-table treatment: a
     * squircle-clipped wash and no divider at all. Leave unset for a plain
     * bordered table.
     */
    rowHoverRadius?: number;
    /**
     * Colour of that wash, per row — pass `stableHoverColor(row.id)` to get the
     * coin feed's varied-but-stable palette. Defaults to a neutral white tint.
     * Only read when `rowHoverRadius` is set.
     */
    rowHoverColor?: (row: TData) => string;
    /** Pin the header while the page scrolls; pair with `stickyTop`. */
    stickyHeader?: boolean;
    stickyTop?: string;

    className?: string;
    headerClassName?: string;
    rowClassName?: string;
    cellClassName?: string;
}

/**
 * The app's data table: TanStack Table v9 for state (sorting, selection,
 * ordering, sizing, visibility) under the beui.dev table's chrome and motion —
 * sticky sortable headers with a rotating caret, pointer-drag reorder and
 * resize, `@tanstack/react-virtual` rows.
 *
 * Vendored by hand rather than installed: the registry item ships its own
 * `lib/utils.ts` and `lib/ease.ts`, and `shadcn add` would have overwritten
 * ours with a two-export stub (see CLAUDE.md). lucide is swapped for HugeIcons
 * per the house rule.
 *
 * Cell renderers may hang reveal-on-hover affordances off `group-hover/row:` —
 * `group/row` is part of this component's contract, not an internal, and is
 * what a copy icon or an external-link chevron should key on rather than
 * wrapping its own group around a single cell.
 */
export function DataTable<TData extends RowData>({
    data,
    columns,
    getRowId,
    sorting,
    onSortingChange,
    manualSorting = false,
    rowSelection,
    onRowSelectionChange,
    columnVisibility,
    onColumnVisibilityChange,
    resizable = false,
    minColumnWidth = 64,
    reorderable = false,
    rowHeight = 48,
    height,
    overscan = 10,
    onEndReached,
    loading = false,
    skeletonRows = 3,
    emptyState = "No data",
    onRowClick,
    rowHoverRadius: hoverRadius,
    rowHoverColor,
    stickyHeader = false,
    stickyTop = "0px",
    className,
    headerClassName,
    rowClassName,
    cellClassName,
}: DataTableProps<TData>) {
    const reduce = useReducedMotion();
    const scrollRef = useRef<HTMLDivElement>(null);
    const thRefs: HeaderCellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

    const table = useTable({
        features: dataTableFeatures,
        data,
        columns,
        getRowId,
        manualSorting,
        enableSorting: true,
        enableSortingRemoval: false,
        // Only the slices the caller controls are handed over; an explicit
        // `undefined` in `state` reads as "controlled, and empty" to TanStack,
        // which would freeze the table's own copy of that slice.
        state: {
            ...(sorting !== undefined ? { sorting } : {}),
            ...(rowSelection !== undefined ? { rowSelection } : {}),
            ...(columnVisibility !== undefined ? { columnVisibility } : {}),
        },
        ...(onSortingChange ? { onSortingChange } : {}),
        ...(onRowSelectionChange ? { onRowSelectionChange } : {}),
        ...(onColumnVisibilityChange ? { onColumnVisibilityChange } : {}),
    });

    const leafColumns = table.getVisibleLeafColumns();
    const columnSizing = table.state.columnSizing ?? {};
    const rows = table.getRowModel().rows;
    const colSpan = leafColumns.length + 1;

    // ---- reorder ---------------------------------------------------------
    // The gesture lives here; the resulting order is written straight into the
    // table's `columnOrder` state, so TanStack stays the only owner.
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const dropIndexFor = useCallback(
        (clientX: number) => {
            for (let i = 0; i < leafColumns.length; i++) {
                const rect = thRefs.current[leafColumns[i].id]?.getBoundingClientRect();
                if (rect && clientX < rect.left + rect.width / 2) return i;
            }
            return leafColumns.length;
        },
        [leafColumns],
    );

    const startReorder = useCallback((columnId: string, e: ReactPointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragId(columnId);
        e.currentTarget.setPointerCapture(e.pointerId);
    }, []);

    const moveReorder = useCallback(
        (e: ReactPointerEvent) => {
            if (!dragId) return;
            setDropIndex(dropIndexFor(e.clientX));
        },
        [dragId, dropIndexFor],
    );

    const endReorder = useCallback(
        (e: ReactPointerEvent) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            if (dragId && dropIndex !== null) {
                const keys = leafColumns.map((c) => c.id);
                const from = keys.indexOf(dragId);
                if (from !== -1) {
                    const without = keys.filter((_, i) => i !== from);
                    let to = dropIndex;
                    if (from < to) to--;
                    without.splice(to, 0, dragId);
                    table.setColumnOrder(without);
                }
            }
            setDragId(null);
            setDropIndex(null);
        },
        [dragId, dropIndex, leafColumns, table],
    );

    // ---- resize ----------------------------------------------------------
    // On the first drag every column is frozen to its MEASURED width before the
    // dragged one moves. Without that snapshot the flexible columns re-solve
    // around the change and the whole row jumps; with it, only the trailing
    // filler gives way.
    const resizeRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

    const startResize = useCallback(
        (columnId: string, e: ReactPointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const snapshot: ColumnSizingState = { ...columnSizing };
            for (const column of leafColumns) {
                if (snapshot[column.id] == null) {
                    const measured = thRefs.current[column.id]?.getBoundingClientRect().width;
                    snapshot[column.id] = measured ? Math.round(measured) : minColumnWidth;
                }
            }
            resizeRef.current = { columnId, startX: e.clientX, startWidth: snapshot[columnId] };
            table.setColumnSizing(snapshot);
            e.currentTarget.setPointerCapture(e.pointerId);
        },
        [columnSizing, leafColumns, minColumnWidth, table],
    );

    const moveResize = useCallback(
        (e: ReactPointerEvent) => {
            const state = resizeRef.current;
            if (!state) return;
            const width = Math.max(minColumnWidth, state.startWidth + (e.clientX - state.startX));
            table.setColumnSizing((prev) => ({ ...prev, [state.columnId]: width }));
        },
        [minColumnWidth, table],
    );

    const endResize = useCallback((e: ReactPointerEvent) => {
        resizeRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    }, []);

    // ---- virtualization --------------------------------------------------
    const virtualized = height != null;
    const virtualizer = useVirtualizer({
        count: virtualized ? rows.length : 0,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        overscan,
    });
    const virtualItems = virtualized ? virtualizer.getVirtualItems() : [];
    const totalSize = virtualizer.getTotalSize();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom =
        virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;
    const visibleRows = virtualized ? virtualItems.map((v) => rows[v.index]) : rows;

    // Infinite scroll: one fire per near-bottom dwell, paused while loading;
    // the guard clears when the load completes.
    const endReachedRef = useRef(false);
    useEffect(() => {
        if (!loading) endReachedRef.current = false;
    }, [loading]);
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el || !onEndReached || loading || endReachedRef.current) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < rowHeight * 4) {
            endReachedRef.current = true;
            onEndReached();
        }
    }, [onEndReached, loading, rowHeight]);

    // Shrink-wrap only once EVERY column carries an explicit width; before that
    // a flexible column would size to its content instead of the viewport.
    const sized = leafColumns.length > 0 && leafColumns.every((c) => columnSizing[c.id] != null);

    // A table with NO horizontal escape must not be able to exceed its box.
    // This is the same branch the wrapper below uses — the one that ships no
    // `overflow-x-auto`, because a sticky header pins to the nearest scrollport
    // and an x-scroller would become that scrollport (8627b110).
    //
    // `min-w-full` is a floor, not a ceiling: under `table-layout: fixed` the
    // declared column widths still add up, and if their sum exceeds the
    // container the table simply grows past it. With a scroller that reads as
    // "scroll sideways"; without one it reads as CUT OFF, because home's
    // category panel clips (`overflow-clip`) and the tail column is the star.
    // Measured on prod 2026-08-16: a 754px table in a 628px column, 132px of it
    // unreachable, and the amount changed with the sort indicator's width.
    //
    // `w-full` makes the same declared widths proportional instead: fixed layout
    // distributes the container across them, so columns compress and every one
    // of them stays on screen.
    const noHorizontalEscape = stickyHeader && !resizable && !virtualized;

    const body = (
        <table
            className={cn(
                "border-collapse",
                sized ? "w-max min-w-full" : noHorizontalEscape ? "w-full" : "min-w-full",
            )}
            style={{ tableLayout: "fixed" }}
        >
            <colgroup>
                {leafColumns.map((column) => {
                    const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
                    const override = columnSizing[column.id];
                    const width = override ? `${override}px` : meta?.width;
                    return <col key={column.id} style={width ? { width } : undefined} />;
                })}
                {/* The filler only exists to absorb leftover width once every
                    column is pixel-fixed. Before that it must be zero: under
                    `table-layout: fixed` a width-less column splits the
                    remainder equally with the real flexible column, which would
                    hand half the table to empty space. */}
                <col style={sized ? undefined : { width: 0 }} />
            </colgroup>

            <DataTableHeader
                table={table}
                rowHeight={rowHeight}
                reduce={!!reduce}
                thRefs={thRefs}
                sticky={stickyHeader}
                stickyTop={stickyTop}
                className={headerClassName}
                resizable={resizable}
                onResizeStart={startResize}
                onResizeMove={moveResize}
                onResizeEnd={endResize}
                reorderable={reorderable}
                dragId={dragId}
                dropIndex={dropIndex}
                onReorderStart={startReorder}
                onReorderMove={moveReorder}
                onReorderEnd={endReorder}
            />

            <tbody>
                {rows.length === 0 ? (
                    loading ? (
                        <DataTableSkeletonRows
                            count={Math.max(1, Math.ceil((height ?? rowHeight * 10) / rowHeight))}
                            headers={table.getHeaderGroups().at(-1)?.headers ?? []}
                            rowHeight={rowHeight}
                            cellClassName={cellClassName}
                            borderRows={hoverRadius == null}
                        />
                    ) : (
                        <tr>
                            <td colSpan={colSpan} className="px-4 py-20 text-center">
                                {emptyState}
                            </td>
                        </tr>
                    )
                ) : (
                    <>
                        {paddingTop > 0 ? (
                            <tr aria-hidden style={{ height: paddingTop }}>
                                <td colSpan={colSpan} />
                            </tr>
                        ) : null}

                        {visibleRows.map((row) => (
                            <tr
                                key={row.id}
                                data-selected={row.getIsSelected()}
                                style={{ height: rowHeight }}
                                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                                className={cn(
                                    "transition-colors",
                                    // The two row treatments are alternatives, not layers:
                                    // the squircled wash is the trending-table look, whose
                                    // rows sit straight on the canvas with no divider and
                                    // no fill, so a hairline under each one would contradict
                                    // it. `relative` is what the wash's inset-0 resolves
                                    // against — verified in the browser that a positioned
                                    // <tr> really does become the containing block for an
                                    // absolute child of its cells.
                                    hoverRadius != null
                                        ? "group/row relative z-0"
                                        : "border-b border-border/60",
                                    onRowClick && "cursor-pointer",
                                    onRowClick &&
                                        hoverRadius == null &&
                                        "hover:bg-white/[0.04] active:bg-white/[0.06]",
                                    rowClassName,
                                )}
                            >
                                {row.getVisibleCells().map((cell, cellIndex) => {
                                    const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                                    return (
                                        <td
                                            key={cell.id}
                                            className={cn(
                                                "px-4 align-middle",
                                                alignText(meta?.align),
                                                meta?.hideClassName,
                                                cellClassName,
                                            )}
                                        >
                                            {/* Rendered once, from the FIRST cell, because a
                                                <span> is not valid content for a <tr> — it
                                                spans the whole row anyway via the row's
                                                containing block. It paints OVER the cells
                                                rather than behind them, which is the shipped
                                                trending/alert-rail look, not an accident. */}
                                            {hoverRadius != null && cellIndex === 0 ? (
                                                <Squircle asChild radius={hoverRadius} autoEffects={false}>
                                                    <span
                                                        aria-hidden
                                                        style={{ backgroundColor: rowHoverColor?.(row.original) }}
                                                        className={cn(
                                                            "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/row:opacity-10",
                                                            !rowHoverColor && "bg-white group-hover/row:opacity-[0.06]",
                                                        )}
                                                    />
                                                </Squircle>
                                            ) : null}
                                            <table.FlexRender cell={cell} />
                                        </td>
                                    );
                                })}
                                <td aria-hidden />
                            </tr>
                        ))}

                        {paddingBottom > 0 ? (
                            <tr aria-hidden style={{ height: paddingBottom }}>
                                <td colSpan={colSpan} />
                            </tr>
                        ) : null}

                        {loading ? (
                            <DataTableSkeletonRows
                                count={skeletonRows}
                                headers={table.getHeaderGroups().at(-1)?.headers ?? []}
                                rowHeight={rowHeight}
                                cellClassName={cellClassName}
                                borderRows={hoverRadius == null}
                            />
                        ) : null}
                    </>
                )}
            </tbody>
        </table>
    );

    // `overflow-x-auto` even in page-flow mode: once every column is resized the
    // table switches to `w-max`, and without its own horizontal scroller that
    // would push the whole page sideways.
    //
    // ⚠️ EXCEPT when the header is sticky, because the two cannot coexist.
    // `position: sticky` pins to the nearest SCROLLING ancestor, and
    // `overflow-x: auto` makes this wrapper exactly that (CSS computes the
    // other axis to `auto` too). So `stickyTop` stops meaning "below the app
    // header" and starts meaning "below this div's own top edge" — which
    // parked the trending board's labels ~116px down, floating over the first
    // rows, once that table moved to DataTable.
    //
    // Skipping the wrapper is safe precisely where it is needed: the
    // x-scroller only earns its place once columns have been RESIZED and the
    // table switches to `w-max`. A sticky-header table that isn't `resizable`
    // stays `min-w-full` and can never overflow horizontally, so it loses
    // nothing here.
    // No overscroll classes here on purpose — globals.css now contains only the
    // X axis for `.overflow-x-auto`, which is the correct default for a
    // horizontal scroller and applies to this wrapper automatically.
    //
    // It briefly carried `overscroll-chain overscroll-x-contain` (cb96f435),
    // because the rule used to apply the `overscroll-behavior: contain`
    // SHORTHAND: a vertical wheel over a sideways-only scroller had nowhere to
    // go, and containment stopped that leftover delta reaching the page, so
    // scrolling died wherever the cursor sat over the table. 0cc7d0a3 fixed it
    // at the source for every horizontal scroller in the app, so the local
    // patch is redundant and its explanation was about to become a lie.
    //
    // Worth keeping from that episode: the trap only engages once the element
    // is GENUINELY scrollable in the contained axis. /trade and the coin page
    // broke because `resizable` lets their tables go `w-max`; the home board is
    // `min-w-full`, never overflows, and tested clean — which read as
    // "mechanism disproved" when it was "wrong surface".
    if (!virtualized) {
        return stickyHeader && !resizable
            ? <div className={cn("w-full", className)}>{body}</div>
            : <div className={cn("w-full overflow-x-auto", className)}>{body}</div>;
    }

    return (
        <div className={cn("w-full overflow-hidden", className)}>
            <div ref={scrollRef} onScroll={handleScroll} className="overflow-auto" style={{ height }}>
                {body}
            </div>
        </div>
    );
}
