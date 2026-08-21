import type { ReactNode } from "react";
import {
    columnOrderingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    createSortedRowModel,
    rowSelectionFeature,
    rowSortingFeature,
    sortFn_alphanumeric,
    sortFn_basic,
    sortFn_datetime,
    sortFn_text,
    tableFeatures,
} from "@tanstack/react-table";

/**
 * Per-column presentation, declared through TanStack's `columnMeta` slot
 * rather than global declaration merging — v9 threads the type through
 * `tableFeatures`, so `column.columnDef.meta` is typed at every call site
 * without a `declare module` block that would leak into every other table.
 */
export type DataTableColumnMeta = {
    /** Cell + header text alignment. */
    align?: "left" | "center" | "right";
    /**
     * Keep this column's header out of the reorder affordance.
     *
     * The grip renders for every column on a `reorderable` table, label or
     * not — so a deliberately unlabelled column (the /trade board's trend
     * line) shows a bare pair of dots with nothing beside them, which reads
     * as a rendering fault rather than a handle. This hides the grip; the
     * column simply is not draggable.
     */
    noReorder?: boolean;
    /** CSS length used until the user resizes the column. Omit to share space. */
    width?: string;
    /** Hide below this breakpoint — a raw class, e.g. "max-lg:hidden". */
    hideClassName?: string;
    /**
     * What this column's blank slot looks like while loading. Skeletons wear
     * the real component's chrome and blank only the content, so a column whose
     * cell is an avatar plus two lines of text must say so — the default single
     * bar would flatten it. Receives the row's index and the row count so a
     * caller can stagger the pulse.
     */
    skeleton?: (index: number, count: number) => ReactNode;
};

/**
 * The app's one table feature set. v9 tree-shakes anything not registered
 * here, which is the whole reason the list is explicit and static (the docs
 * are emphatic that this must live outside a component so the object identity
 * never changes between renders).
 *
 * Deliberately absent: `columnResizingFeature`. Its pointer handler captures
 * `header.getSize()` synchronously on pointerdown, and every un-resized column
 * reports the 150px default there — so the first drag on a flex-width table
 * snaps every column to 150 before it moves. `DataTable` measures the real
 * header widths itself and writes them into this feature's `columnSizing`
 * slice, which keeps TanStack the single owner of the state without the snap.
 */
export const dataTableFeatures = tableFeatures({
    columnOrderingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: {
        alphanumeric: sortFn_alphanumeric,
        basic: sortFn_basic,
        datetime: sortFn_datetime,
        text: sortFn_text,
    },
    columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
