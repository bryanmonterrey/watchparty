import type { DataTableColumnMeta } from "./features";

export function alignFlex(align: DataTableColumnMeta["align"]) {
    if (align === "right") return "justify-end";
    if (align === "center") return "justify-center";
    return "justify-start";
}

export function alignText(align: DataTableColumnMeta["align"]) {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
}
