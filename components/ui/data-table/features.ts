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
    /** CSS length used until the user resizes the column. Omit to share space. */
    width?: string;
    /** Hide below this breakpoint — a raw class, e.g. "max-lg:hidden". */
    hideClassName?: string;
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
