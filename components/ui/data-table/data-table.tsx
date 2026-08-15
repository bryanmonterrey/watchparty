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

    const body = (
        <table
            className={cn("border-collapse", sized ? "w-max min-w-full" : "min-w-full")}
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
                                    "border-b border-border/60 transition-colors",
                                    onRowClick && "cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06]",
                                    rowClassName,
                                )}
                            >
                                {row.getVisibleCells().map((cell) => {
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
    if (!virtualized) return <div className={cn("w-full overflow-x-auto", className)}>{body}</div>;

    return (
        <div className={cn("w-full overflow-hidden", className)}>
            <div ref={scrollRef} onScroll={handleScroll} className="overflow-auto" style={{ height }}>
                {body}
            </div>
        </div>
    );
}
