"use client";

import type { Header, RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import type { DataTableColumnMeta, DataTableFeatures } from "./features";
import { alignText } from "./utils";

/**
 * Placeholder rows that wear the real table's column geometry — the skeleton
 * blanks the content slots and nothing else, per the house rule, and it is a
 * still flat fill (no shimmer sweep).
 */
export function DataTableSkeletonRows<TData extends RowData>({
    count,
    headers,
    rowHeight,
}: {
    count: number;
    headers: Header<DataTableFeatures, TData, unknown>[];
    rowHeight: number;
}) {
    return (
        <>
            {Array.from({ length: count }, (_, r) => (
                <tr key={`skeleton-${r}`} style={{ height: rowHeight }} className="border-b border-border/60">
                    {headers.map((header) => {
                        const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                        return (
                            <td key={header.id} className={cn("px-4", alignText(meta?.align), meta?.hideClassName)}>
                                <div
                                    className={cn(
                                        "h-3 rounded-full bg-soft-gray/15",
                                        meta?.align === "right" ? "ml-auto w-10" : "w-2/3",
                                    )}
                                />
                            </td>
                        );
                    })}
                    <td aria-hidden />
                </tr>
            ))}
        </>
    );
}
