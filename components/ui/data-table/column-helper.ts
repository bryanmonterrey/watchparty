import { createColumnHelper, type RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "./features";

/**
 * `createColumnHelper` bound to the app's feature set, so callers write
 * `createDataTableColumnHelper<TradeToken>()` instead of repeating the
 * features type param at every table.
 */
export function createDataTableColumnHelper<TData extends RowData>() {
    return createColumnHelper<DataTableFeatures, TData>();
}
