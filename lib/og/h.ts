// The element tree satori actually consumes — plain objects shaped like React
// elements, no React. workers-og's HTML-string path is avoided on purpose: its
// parser drops `display: flex` on multi-child containers (see index.ts history).

export type Style = Record<string, string | number | undefined>;
export interface El {
    type: string;
    props: Record<string, unknown>;
}

function clean(style: Style): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
    return out;
}

export function h(type: string, style: Style = {}, children?: unknown, attrs: Record<string, unknown> = {}): El {
    const props: Record<string, unknown> = { ...attrs, style: clean(style) };
    if (children !== undefined && children !== null && children !== false) props.children = children;
    return { type, props };
}

// satori requires explicit `display: flex` on any element with more than one
// child, so every container goes through one of these two.
export const row = (style: Style, children?: unknown, attrs?: Record<string, unknown>) =>
    h("div", { display: "flex", flexDirection: "row", ...style }, children, attrs);
export const col = (style: Style, children?: unknown, attrs?: Record<string, unknown>) =>
    h("div", { display: "flex", flexDirection: "column", ...style }, children, attrs);
export const text = (style: Style, s: string) => h("span", style, s);
export const img = (src: string, style: Style) => h("img", style, undefined, { src });

/** Inline SVG. Attributes, not styles — satori serialises these as markup. */
export const svg = (attrs: Record<string, unknown>, children: El[], style: Style = {}) =>
    ({ type: "svg", props: { ...attrs, style: clean(style), children } }) as El;
export const path = (attrs: Record<string, unknown>) => ({ type: "path", props: attrs }) as El;
export const circle = (attrs: Record<string, unknown>) => ({ type: "circle", props: attrs }) as El;
